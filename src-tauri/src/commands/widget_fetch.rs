//! Network fetch proxy for Custom HTML widgets.
//!
//! Sandboxed iframes inside a Custom HTML widget cannot call Tauri IPC
//! directly (their origin is opaque) and the launcher's CSP blocks arbitrary
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

use reqwest::header::{CONTENT_TYPE, LOCATION};
use reqwest::{Client, Url};
use serde::Serialize;

const MAX_REDIRECTS: usize = 5;
const TIMEOUT_SECS: u64 = 30;
const USER_AGENT: &str = "odeko";

#[derive(Serialize)]
pub struct FetchResult {
    pub status: u16,
    pub body: String,
    pub content_type: Option<String>,
}

#[tauri::command]
pub async fn widget_fetch(url: String, allow_local: bool) -> Result<FetchResult, String> {
    let mut current = Url::parse(&url).map_err(|e| format!("invalid URL: {e}"))?;
    ensure_http_scheme(current.scheme())?;

    for _ in 0..=MAX_REDIRECTS {
        let client = client_for_url(&current, allow_local).await?;
        let response = client
            .get(current.clone())
            .send()
            .await
            .map_err(|e| format!("request failed: {e}"))?;

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
        let (body, content_type) = read_body(response).await?;
        return Ok(FetchResult {
            status: status.as_u16(),
            body,
            content_type,
        });
    }

    Err(format!("too many redirects (more than {MAX_REDIRECTS})"))
}

fn ensure_http_scheme(scheme: &str) -> Result<(), String> {
    match scheme {
        "http" | "https" => Ok(()),
        other => Err(format!("scheme \"{other}\" is not allowed (http/https only)")),
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

    // Pin to the first validated address so a second DNS lookup (a rebinding
    // attack) cannot redirect the connection to a different, private IP.
    if let Some(addr) = addrs.first() {
        builder = builder.resolve(&host, *addr);
    }

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

    let body =
        String::from_utf8(bytes.to_vec()).map_err(|_| "response is not valid UTF-8 text".to_string())?;
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
