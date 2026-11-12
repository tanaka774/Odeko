//! HTTP for the AI chat (LLM providers and web search).
//!
//! The webview never holds API keys. It names the key to use (`auth`), and
//! the key is added here, only when the request goes to that key's own
//! origin. Responses stream back through `ai_request_read`; error bodies are
//! buffered and scrubbed of every stored key first.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;

use reqwest::{Client, Method, Url};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex as AsyncMutex;

use super::ai_settings::{redact, secret};
use super::canvas::get_config_dir;

const ERROR_BODY_LIMIT: usize = 64 * 1024;
const AUTH_HEADERS: [&str; 4] = ["authorization", "x-api-key", "x-goog-api-key", "x-subscription-token"];

#[derive(Deserialize)]
pub struct AiHttpRequest {
    url: String,
    method: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
    /// Profile id, or `search:<service>` for a search key.
    auth: Option<String>,
}

#[derive(Serialize)]
pub struct AiHttpHead {
    rid: u32,
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
}

enum Body {
    Stream(reqwest::Response),
    Buffered(Option<Vec<u8>>),
}

type Entry = Arc<AsyncMutex<Body>>;

static NEXT_RID: AtomicU32 = AtomicU32::new(1);
static RESPONSES: parking_lot::Mutex<Option<HashMap<u32, Entry>>> = parking_lot::const_mutex(None);

fn store(body: Body) -> u32 {
    let rid = NEXT_RID.fetch_add(1, Ordering::Relaxed);
    RESPONSES
        .lock()
        .get_or_insert_with(HashMap::new)
        .insert(rid, Arc::new(AsyncMutex::new(body)));
    rid
}

fn entry(rid: u32) -> Option<Entry> {
    RESPONSES.lock().as_ref().and_then(|m| m.get(&rid).cloned())
}

fn remove(rid: u32) {
    if let Some(map) = RESPONSES.lock().as_mut() {
        map.remove(&rid);
    }
}

#[derive(Debug, PartialEq)]
struct AuthTarget {
    origin: String,
    header: &'static str,
    bearer: bool,
}

fn origin_of(url: &str) -> Option<String> {
    Url::parse(url).ok().map(|u| u.origin().ascii_serialization())
}

fn profile_target(kind: &str, base_url: &str) -> Option<AuthTarget> {
    let default = match kind {
        "openai" | "chatgpt" => "https://api.openai.com",
        "anthropic" => "https://api.anthropic.com",
        "google" => "https://generativelanguage.googleapis.com",
        _ => "",
    };
    let base = if kind == "chatgpt" || base_url.trim().is_empty() { default } else { base_url.trim() };
    let origin = origin_of(base)?;
    let (header, bearer) = match kind {
        "anthropic" => ("x-api-key", false),
        "google" => ("x-goog-api-key", false),
        _ => ("authorization", true),
    };
    Some(AuthTarget { origin, header, bearer })
}

fn search_target(service: &str) -> Option<AuthTarget> {
    let (origin, header, bearer) = match service {
        "tavily" => ("https://api.tavily.com", "authorization", true),
        "brave" => ("https://api.search.brave.com", "x-subscription-token", false),
        "exa" => ("https://api.exa.ai", "x-api-key", false),
        _ => return None,
    };
    Some(AuthTarget { origin: origin.to_string(), header, bearer })
}

fn find_profile(id: &str) -> Option<serde_json::Value> {
    let settings = std::fs::read_to_string(get_config_dir().join("ai.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())?;
    settings
        .get("profiles")?
        .as_array()?
        .iter()
        .find(|p| p.get("id").and_then(|v| v.as_str()) == Some(id))
        .cloned()
}

fn profile_kind(id: &str) -> Option<String> {
    find_profile(id)?.get("kind")?.as_str().map(str::to_string)
}

fn auth_target(auth: &str) -> Result<AuthTarget, String> {
    if let Some(service) = auth.strip_prefix("search:") {
        return search_target(service).ok_or_else(|| format!("unknown search service {service}"));
    }
    let profile = find_profile(auth).ok_or("AI provider profile not found; save the settings first")?;
    let kind = profile.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    let base = profile.get("baseUrl").and_then(|v| v.as_str()).unwrap_or("");
    profile_target(kind, base).ok_or_else(|| "the profile's base URL is invalid".to_string())
}

/// Keyed requests never follow redirects: reqwest only strips
/// `Authorization` on a cross-host redirect, not `x-api-key` and the like.
fn client(keyed: bool) -> Result<Client, String> {
    let redirect = if keyed {
        reqwest::redirect::Policy::none()
    } else {
        reqwest::redirect::Policy::limited(5)
    };
    Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .read_timeout(Duration::from_secs(180))
        .redirect(redirect)
        .user_agent("odeko")
        .build()
        .map_err(|e| e.to_string())
}

async fn send(request: AiHttpRequest) -> Result<AiHttpHead, String> {
    let url = Url::parse(&request.url).map_err(|e| format!("invalid URL: {e}"))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("only http(s) URLs are allowed".to_string());
    }
    let method = Method::from_bytes(request.method.to_uppercase().as_bytes())
        .map_err(|_| "invalid method".to_string())?;

    let mut builder = client(request.auth.is_some())?.request(method, url.clone());
    for (name, value) in &request.headers {
        let lower = name.to_ascii_lowercase();
        if AUTH_HEADERS.contains(&lower.as_str()) || lower == "host" || lower == "content-length" {
            continue;
        }
        builder = builder.header(name, value);
    }

    if let Some(auth) = request.auth.as_deref() {
        let target = auth_target(auth)?;
        if url.origin().ascii_serialization() != target.origin {
            return Err(format!(
                "refused to send the API key to {} (the key belongs to {})",
                url.origin().ascii_serialization(),
                target.origin
            ));
        }
        let key = if profile_kind(auth).as_deref() == Some("chatgpt") {
            Some(super::chatgpt_auth::access_token(auth).await?)
        } else {
            secret(auth)
        };
        if let Some(key) = key {
            let value = if target.bearer { format!("Bearer {key}") } else { key };
            builder = builder.header(target.header, value);
        }
    }

    if let Some(body) = request.body {
        builder = builder.body(body);
    }

    let response = builder.send().await.map_err(|e| redact(&format!("request failed: {e}")))?;
    let status = response.status();
    let headers = response
        .headers()
        .iter()
        .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_string())))
        .collect();

    let body = if status.is_success() {
        Body::Stream(response)
    } else {
        let bytes = response.bytes().await.unwrap_or_default();
        let text = String::from_utf8_lossy(&bytes[..bytes.len().min(ERROR_BODY_LIMIT)]).into_owned();
        Body::Buffered(Some(redact(&text).into_bytes()))
    };

    Ok(AiHttpHead {
        rid: store(body),
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers,
    })
}

#[tauri::command]
pub async fn ai_request_send(request: AiHttpRequest) -> Result<AiHttpHead, String> {
    send(request).await.map_err(|e| redact(&e))
}

/// Next body chunk; the last byte is 1 when the body is finished, else 0.
#[tauri::command]
pub async fn ai_request_read(rid: u32) -> Result<tauri::ipc::Response, String> {
    let Some(entry) = entry(rid) else {
        return Ok(tauri::ipc::Response::new(vec![1]));
    };
    let mut body = entry.lock().await;
    let (mut chunk, done) = match &mut *body {
        Body::Stream(response) => match response.chunk().await {
            Ok(Some(bytes)) => (bytes.to_vec(), false),
            Ok(None) => (Vec::new(), true),
            Err(e) => {
                drop(body);
                remove(rid);
                return Err(redact(&format!("reading the response failed: {e}")));
            }
        },
        Body::Buffered(data) => (data.take().unwrap_or_default(), true),
    };
    drop(body);
    if done {
        remove(rid);
    }
    chunk.push(u8::from(done));
    Ok(tauri::ipc::Response::new(chunk))
}

#[tauri::command]
pub fn ai_request_cancel(rid: u32) {
    remove(rid);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_keys_stay_on_their_origin() {
        let openai = profile_target("openai", "").unwrap();
        assert_eq!(openai.origin, "https://api.openai.com");
        assert!(openai.bearer);
        let local = profile_target("openai-compatible", "http://localhost:11434/v1").unwrap();
        assert_eq!(local.origin, "http://localhost:11434");
        let deepseek = profile_target("openai-compatible", "https://api.deepseek.com/v1").unwrap();
        assert_eq!(deepseek.origin, "https://api.deepseek.com");
        assert_eq!(profile_target("anthropic", "").unwrap().header, "x-api-key");
        assert_eq!(profile_target("google", "").unwrap().header, "x-goog-api-key");
        assert!(profile_target("openai-compatible", "").is_none());
    }

    #[test]
    fn refuses_to_send_a_key_to_another_origin() {
        let request = AiHttpRequest {
            url: "https://evil.example/steal".to_string(),
            method: "GET".to_string(),
            headers: vec![],
            body: None,
            auth: Some("search:tavily".to_string()),
        };
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let error = runtime.block_on(send(request)).err().unwrap();
        assert!(error.contains("refused to send the API key"), "{error}");
    }

    #[test]
    fn search_services_have_fixed_origins() {
        assert_eq!(search_target("brave").unwrap().header, "x-subscription-token");
        assert_eq!(search_target("exa").unwrap().origin, "https://api.exa.ai");
        assert!(search_target("evil").is_none());
    }
}
