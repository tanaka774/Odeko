//! Network fetch proxy for Custom HTML widgets.
//!
//! Sandboxed iframes inside a Custom HTML widget cannot call Tauri IPC
//! directly (their origin is opaque) and the canvas's CSP blocks arbitrary
//! `fetch()` from the webview. Widgets reach the network by `postMessage`-ing
//! the parent window, which calls this command.
//!
//! This is the only place network access exists, so it enforces the safety
//! floor the CSP used to provide:
//! - http/https only
//! - DNS-rebinding-safe: the host is resolved here, private/LAN addresses are
//!   rejected (unless `allow_local` is on), and the request is pinned to the
//!   validated address
//! - redirects followed manually (max 5), re-validated on every hop
//! - 30s timeout, no cookie store

use std::net::IpAddr;
use std::time::Duration;

use std::collections::BTreeMap;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE, LOCATION};
use reqwest::{Client, Method, StatusCode, Url};
use serde::{Deserialize, Serialize};

const MAX_REDIRECTS: usize = 5;
const TIMEOUT_SECS: u64 = 30;
const USER_AGENT: &str = "odeko";
const MAX_REQUEST_BODY: usize = 1024 * 1024;

/// Headers the transport owns; a page setting them could smuggle requests or
/// pretend to be someone else's browser session.
const FORBIDDEN_HEADERS: [&str; 10] = [
    "host",
    "content-length",
    "transfer-encoding",
    "connection",
    "upgrade",
    "te",
    "trailer",
    "keep-alive",
    "proxy-authorization",
    "cookie",
];

#[derive(Deserialize, Debug)]
pub struct WidgetRequest {
    pub url: String,
    #[serde(default = "default_method")]
    pub method: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
}

fn default_method() -> String {
    "GET".to_string()
}

fn parse_method(method: &str) -> Result<Method, String> {
    match method.to_ascii_uppercase().as_str() {
        "GET" => Ok(Method::GET),
        "HEAD" => Ok(Method::HEAD),
        "POST" => Ok(Method::POST),
        "PUT" => Ok(Method::PUT),
        "PATCH" => Ok(Method::PATCH),
        "DELETE" => Ok(Method::DELETE),
        other => Err(format!("method {other} is not allowed")),
    }
}

fn build_headers(headers: &BTreeMap<String, String>) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    for (name, value) in headers {
        let lower = name.trim().to_ascii_lowercase();
        if FORBIDDEN_HEADERS.contains(&lower.as_str()) || lower.starts_with("proxy-") {
            return Err(format!("header \"{name}\" cannot be set"));
        }
        let header_name = HeaderName::from_bytes(lower.as_bytes())
            .map_err(|_| format!("invalid header name \"{name}\""))?;
        let header_value = HeaderValue::from_str(value)
            .map_err(|_| format!("invalid value for header \"{name}\""))?;
        map.insert(header_name, header_value);
    }
    Ok(map)
}

/// Where a redirect sends the request next: 303 (and 301/302 after a POST,
/// as browsers do) turns into a body-less GET; 307/308 keep everything.
fn redirected(status: StatusCode, method: &Method) -> bool {
    status == StatusCode::SEE_OTHER
        || (matches!(status, StatusCode::MOVED_PERMANENTLY | StatusCode::FOUND)
            && *method == Method::POST)
}

#[derive(Serialize)]
pub struct FetchResult {
    pub status: u16,
    pub body: String,
    pub content_type: Option<String>,
}

#[tauri::command]
pub async fn widget_fetch(
    request: WidgetRequest,
    allow_local: bool,
) -> Result<FetchResult, String> {
    let mut current = Url::parse(&request.url).map_err(|e| format!("invalid URL: {e}"))?;
    ensure_http_scheme(current.scheme())?;
    let mut method = parse_method(&request.method)?;
    let headers = build_headers(&request.headers)?;
    let mut body = request.body;
    if body.as_ref().is_some_and(|b| b.len() > MAX_REQUEST_BODY) {
        return Err("request body is larger than 1 MB".to_string());
    }

    for _ in 0..=MAX_REDIRECTS {
        let client = client_for_url(&current, allow_local).await?;
        let mut builder = client
            .request(method.clone(), current.clone())
            .headers(headers.clone());
        if let Some(text) = &body {
            builder = builder.body(text.clone());
        }
        let response = builder
            .send()
            .await
            .map_err(|e| format!("request failed: {}", error_chain(&e)))?;

        let status = response.status();
        if status.is_redirection() {
            let location = response
                .headers()
                .get(LOCATION)
                .ok_or("redirect response had no Location header")?
                .to_str()
                .map_err(|_| "redirect Location was not valid text")?;
            current = current
                .join(location)
                .map_err(|e| format!("invalid redirect target: {e}"))?;
            ensure_http_scheme(current.scheme())?;
            if redirected(status, &method) {
                method = Method::GET;
                body = None;
            }
            continue;
        }
        let (text, content_type) = read_body(response).await?;
        return Ok(FetchResult {
            status: status.as_u16(),
            body: text,
            content_type,
        });
    }

    Err(format!("too many redirects (more than {MAX_REDIRECTS})"))
}

/// Downloads a public https resource as bytes (used by the library cache),
/// with the same address validation and manual redirects as `widget_fetch`.
pub(crate) async fn fetch_public_bytes(
    url: &str,
    max_bytes: usize,
) -> Result<(Vec<u8>, Option<String>), String> {
    let mut current = Url::parse(url).map_err(|e| format!("invalid URL: {e}"))?;
    for _ in 0..=MAX_REDIRECTS {
        if current.scheme() != "https" {
            return Err("only https URLs can be cached".to_string());
        }
        let client = client_for_url(&current, false).await?;
        let response = client
            .get(current.clone())
            .send()
            .await
            .map_err(|e| format!("request failed: {}", error_chain(&e)))?;
        let status = response.status();
        if status.is_redirection() {
            let location = response
                .headers()
                .get(LOCATION)
                .ok_or("redirect response had no Location header")?
                .to_str()
                .map_err(|_| "redirect Location was not valid text")?;
            current = current
                .join(location)
                .map_err(|e| format!("invalid redirect target: {e}"))?;
            continue;
        }
        if !status.is_success() {
            return Err(format!("upstream returned {}", status.as_u16()));
        }
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("failed to read response body: {e}"))?;
        if bytes.len() > max_bytes {
            return Err(format!(
                "file is larger than {} MB",
                max_bytes / (1024 * 1024)
            ));
        }
        return Ok((bytes.to_vec(), content_type));
    }
    Err(format!("too many redirects (more than {MAX_REDIRECTS})"))
}

const PAGE_MAX_BYTES: usize = 4 * 1024 * 1024;

/// Fetches a public web page for the AI chat's `fetch_page` tool. Same
/// address validation as `widget_fetch`, private/LAN hosts always refused.
#[tauri::command]
pub async fn ai_fetch_page(url: String) -> Result<FetchResult, String> {
    let mut current = Url::parse(&url).map_err(|e| format!("invalid URL: {e}"))?;
    ensure_http_scheme(current.scheme())?;
    for _ in 0..=MAX_REDIRECTS {
        let client = client_for_url(&current, false).await?;
        let response = client
            .get(current.clone())
            .header(
                "Accept",
                "text/html,text/plain,application/json;q=0.9,*/*;q=0.5",
            )
            .send()
            .await
            .map_err(|e| format!("request failed: {}", error_chain(&e)))?;
        let status = response.status();
        if status.is_redirection() {
            let location = response
                .headers()
                .get(LOCATION)
                .ok_or("redirect response had no Location header")?
                .to_str()
                .map_err(|_| "redirect Location was not valid text")?;
            current = current
                .join(location)
                .map_err(|e| format!("invalid redirect target: {e}"))?;
            ensure_http_scheme(current.scheme())?;
            continue;
        }
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_string);
        let bytes = response
            .bytes()
            .await
            .map_err(|e| format!("failed to read response body: {e}"))?;
        let slice = &bytes[..bytes.len().min(PAGE_MAX_BYTES)];
        return Ok(FetchResult {
            status: status.as_u16(),
            body: String::from_utf8_lossy(slice).into_owned(),
            content_type,
        });
    }
    Err(format!("too many redirects (more than {MAX_REDIRECTS})"))
}

/// reqwest's message alone hides the cause ("error sending request");
/// append the sources (connect refused, timed out, TLS…).
fn error_chain(error: &dyn std::error::Error) -> String {
    let mut text = error.to_string();
    let mut source = error.source();
    while let Some(cause) = source {
        let cause_text = cause.to_string();
        if !text.contains(&cause_text) {
            text.push_str(": ");
            text.push_str(&cause_text);
        }
        source = cause.source();
    }
    text
}

fn ensure_http_scheme(scheme: &str) -> Result<(), String> {
    match scheme {
        "http" | "https" => Ok(()),
        other => Err(format!(
            "scheme \"{other}\" is not allowed (http/https only)"
        )),
    }
}

/// Builds a client pinned to the first resolved address of `url`'s host, after
/// validating every resolved address against the private/LAN blocklist.
async fn client_for_url(url: &Url, allow_local: bool) -> Result<Client, String> {
    let host = url.host_str().ok_or("URL has no host")?.to_string();
    let port = url.port_or_known_default().ok_or("URL has no port")?;

    let addrs: Vec<_> = tokio::time::timeout(
        Duration::from_secs(TIMEOUT_SECS),
        tokio::net::lookup_host((host.as_str(), port)),
    )
    .await
    .map_err(|_| format!("DNS resolution timed out for {host}"))?
    .map_err(|e| format!("DNS resolution failed for {host}: {e}"))?
    .collect();

    if addrs.is_empty() {
        return Err(format!("{host} did not resolve to any address"));
    }

    if !allow_local {
        if let Some(blocked) = addrs.iter().find(|a| is_private_ip(a.ip())) {
            return Err(format!(
                "{host} resolves to a private/local address ({}). Enable \"Allow local network\" to permit it.",
                blocked.ip()
            ));
        }
    }

    let mut builder = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .user_agent(USER_AGENT);

    // Pin to the validated addresses so a second DNS lookup (a rebinding
    // attack) cannot redirect the connection to a different, private IP.
    // All of them, so an unreachable one (e.g. IPv6 without a route) falls
    // back to the next.
    builder = builder.resolve_to_addrs(&host, &addrs);

    builder
        .build()
        .map_err(|e| format!("failed to build HTTP client: {e}"))
}

fn is_private_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            o[0] == 0
                || o[0] == 10
                || o[0] == 127
                || (o[0] == 169 && o[1] == 254)
                || (o[0] == 172 && (16..=31).contains(&o[1]))
                || (o[0] == 192 && o[1] == 168)
                || (o[0] == 100 && (64..=127).contains(&o[1]))
                || o[0] >= 224
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
                || v6.is_unspecified()
        }
    }
}

async fn read_body(response: reqwest::Response) -> Result<(String, Option<String>), String> {
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("failed to read response body: {e}"))?;

    let body = String::from_utf8(bytes.to_vec())
        .map_err(|_| "response is not valid UTF-8 text".to_string())?;
    Ok((body, content_type))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{Ipv4Addr, Ipv6Addr};

    #[test]
    fn rejects_private_and_local_ipv4() {
        let private = [
            "10.0.0.1",
            "172.16.0.1",
            "172.31.255.255",
            "192.168.1.1",
            "127.0.0.1",
            "169.254.169.254",
            "100.64.0.1",
            "0.0.0.0",
            "224.0.0.1",
            "255.255.255.255",
        ];
        for ip in private {
            let addr: Ipv4Addr = ip.parse().unwrap();
            assert!(is_private_ip(IpAddr::V4(addr)), "{ip} should be private");
        }

        let public = ["8.8.8.8", "1.1.1.1", "93.184.216.34"];
        for ip in public {
            let addr: Ipv4Addr = ip.parse().unwrap();
            assert!(!is_private_ip(IpAddr::V4(addr)), "{ip} should be public");
        }
    }

    #[test]
    fn rejects_private_and_local_ipv6() {
        assert!(is_private_ip(IpAddr::V6(Ipv6Addr::LOCALHOST)));
        assert!(is_private_ip(IpAddr::V6(Ipv6Addr::UNSPECIFIED)));
        assert!(is_private_ip(IpAddr::V6("fc00::1".parse().unwrap())));
        assert!(is_private_ip(IpAddr::V6("fe80::1".parse().unwrap())));
        assert!(!is_private_ip(IpAddr::V6(
            "2606:4700:4700::1111".parse().unwrap()
        )));
    }

    #[test]
    fn accepts_common_methods_only() {
        assert_eq!(parse_method("post").unwrap(), Method::POST);
        assert_eq!(parse_method("GET").unwrap(), Method::GET);
        assert!(parse_method("CONNECT").is_err());
        assert!(parse_method("TRACE").is_err());
    }

    #[test]
    fn refuses_transport_and_cookie_headers() {
        let ok = BTreeMap::from([
            ("Authorization".to_string(), "Bearer x".to_string()),
            ("Content-Type".to_string(), "application/json".to_string()),
        ]);
        let headers = build_headers(&ok).unwrap();
        assert_eq!(headers["authorization"], "Bearer x");
        for name in ["Host", "Cookie", "Content-Length", "Proxy-Foo"] {
            let bad = BTreeMap::from([(name.to_string(), "x".to_string())]);
            assert!(build_headers(&bad).is_err(), "{name} should be refused");
        }
        let newline = BTreeMap::from([("X-A".to_string(), "a\r\nb".to_string())]);
        assert!(build_headers(&newline).is_err());
    }

    #[test]
    fn redirects_turn_post_into_get_like_browsers() {
        assert!(redirected(StatusCode::SEE_OTHER, &Method::PUT));
        assert!(redirected(StatusCode::FOUND, &Method::POST));
        assert!(!redirected(StatusCode::TEMPORARY_REDIRECT, &Method::POST));
        assert!(!redirected(StatusCode::FOUND, &Method::GET));
    }

    #[test]
    fn only_http_and_https_schemes_allowed() {
        assert!(ensure_http_scheme("http").is_ok());
        assert!(ensure_http_scheme("https").is_ok());
        assert!(ensure_http_scheme("file").is_err());
        assert!(ensure_http_scheme("javascript").is_err());
        assert!(ensure_http_scheme("ftp").is_err());
    }

    /// Exercises the real HTTP path (DNS + private-range check + fetch) against
    /// a live host. Ignored by default; run explicitly to verify the proxy
    /// end-to-end without a GUI.
    #[test]
    #[ignore]
    fn fetches_coingecko_through_proxy() {
        let runtime = tokio::runtime::Runtime::new().unwrap();
        runtime.block_on(async {
            let url = Url::parse(
                "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true",
            )
            .unwrap();
            let client = client_for_url(&url, false).await.unwrap();
            let response = client.get(url).send().await.unwrap();
            let status = response.status();
            let (body, _content_type) = read_body(response).await.unwrap();
            assert_eq!(status.as_u16(), 200, "unexpected status, body: {body}");
            let json: serde_json::Value = serde_json::from_str(&body).unwrap();
            assert!(json.get("bitcoin").is_some(), "missing bitcoin key: {body}");
        });
    }
}
