//! "Sign in with ChatGPT" plan usage for the AI chat (OpenAI's flow for
//! open-source desktop clients). Tokens never reach the webview: they are
//! stored in ai-secrets.json under `chatgpt:<profile id>` and added to
//! requests by ai_http.rs, which refreshes them when they are about to expire.
//!
//! Flow: loopback listener on 127.0.0.1 → system browser at the authorize
//! endpoint (PKCE S256, state, nonce) → code exchange → ID token validated
//! against OpenAI's JWKS → credentials saved.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::ai_settings::{secret, set_secret};
use super::canvas::get_config_dir;

pub const ISSUER: &str = "https://auth.openai.com";
const AUTHORIZE: &str = "https://auth.openai.com/api/accounts/authorize";
const TOKEN: &str = "https://auth.openai.com/api/accounts/oauth/token";
const REVOKE: &str = "https://auth.openai.com/api/accounts/oauth/revoke";
const JWKS: &str = "https://auth.openai.com/.well-known/jwks.json";
const RESOURCE: &str = "https://api.openai.com/v1";
const SCOPES: &str = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
const PLAN_SCOPE: &str = "chatgpt.tokens.use.direct";
const CALLBACK_PATH: &str = "/auth/callback";
const AGENT_NAME: &str = "Odeko";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);
/// Refresh this long before the access token expires.
const REFRESH_MARGIN_SECS: u64 = 120;

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Credentials {
    pub email: Option<String>,
    pub subject: String,
    pub client_id: String,
    pub id_token: String,
    pub access_token: String,
    pub refresh_token: String,
    pub scopes: Vec<String>,
    /// Unix seconds.
    pub expires_at: u64,
}

/// What the webview may know about a signed-in account.
#[derive(Serialize)]
pub struct AccountInfo {
    pub email: Option<String>,
    pub plan_enabled: bool,
}

fn secret_id(profile_id: &str) -> String {
    format!("chatgpt:{profile_id}")
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub fn load(profile_id: &str) -> Option<Credentials> {
    secret(&secret_id(profile_id)).and_then(|text| serde_json::from_str(&text).ok())
}

fn save(profile_id: &str, credentials: &Credentials) -> Result<(), String> {
    let text = serde_json::to_string(credentials).map_err(|e| e.to_string())?;
    set_secret(&secret_id(profile_id), &text)
}

/// Stable per-installation host id, required by the flow.
fn host_id() -> Result<String, String> {
    let path = get_config_dir().join("chatgpt-host-id");
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let existing = existing.trim();
        if existing.starts_with("urn:uuid:") {
            return Ok(existing.to_string());
        }
    }
    let id = format!("urn:uuid:{}", uuid::Uuid::new_v4());
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, &id).map_err(|e| format!("Cannot save host id: {e}"))?;
    Ok(id)
}

fn random_token() -> String {
    let mut bytes = [0u8; 32];
    bytes[..16].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    bytes[16..].copy_from_slice(uuid::Uuid::new_v4().as_bytes());
    URL_SAFE_NO_PAD.encode(bytes)
}

pub(crate) fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

#[derive(Debug, PartialEq)]
pub(crate) struct Callback {
    pub code: Option<String>,
    pub state: Option<String>,
    pub client_id: Option<String>,
    pub error: Option<String>,
}

pub(crate) fn parse_callback(request_line: &str) -> Option<Callback> {
    let target = request_line.split_whitespace().nth(1)?;
    let url = url::Url::parse(&format!("http://127.0.0.1{target}")).ok()?;
    if url.path() != CALLBACK_PATH {
        return None;
    }
    let get = |key: &str| url.query_pairs().find(|(k, _)| k == key).map(|(_, v)| v.into_owned());
    Some(Callback {
        code: get("code"),
        state: get("state"),
        client_id: get("client_id"),
        error: get("error"),
    })
}

const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Odeko</title><body style=\"font:16px system-ui;padding:40px\">You can close this tab and return to Odeko.</body>";

fn wait_for_callback(listener: TcpListener) -> Result<Callback, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = std::time::Instant::now() + SIGN_IN_TIMEOUT;
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_nonblocking(false).ok();
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
                let mut buffer = [0u8; 8192];
                let n = stream.read(&mut buffer).unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..n]);
                let first = request.lines().next().unwrap_or("");
                let Some(callback) = parse_callback(first) else {
                    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
                    continue;
                };
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    DONE_PAGE.len(),
                    DONE_PAGE
                );
                let _ = stream.write_all(response.as_bytes());
                return Ok(callback);
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if std::time::Instant::now() > deadline {
                    return Err("Sign-in timed out".to_string());
                }
                std::thread::sleep(Duration::from_millis(150));
            }
            Err(e) => return Err(format!("Sign-in listener failed: {e}")),
        }
    }
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    id_token: Option<String>,
    expires_in: Option<u64>,
    scope: Option<String>,
}

#[derive(Deserialize)]
struct OAuthError {
    error: Option<String>,
    error_description: Option<String>,
}

async fn token_request(form: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let response = reqwest::Client::new()
        .post(TOKEN)
        .form(form)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Token request failed: {e}"))?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        let parsed: Option<OAuthError> = serde_json::from_str(&body).ok();
        let code = parsed.as_ref().and_then(|e| e.error.clone()).unwrap_or_default();
        let description = parsed.and_then(|e| e.error_description).unwrap_or_default();
        return Err(format!("token_error:{code}: HTTP {} {description}", status.as_u16()));
    }
    serde_json::from_str(&body).map_err(|e| format!("Unexpected token response: {e}"))
}

#[derive(Deserialize)]
struct Jwk {
    kid: Option<String>,
    n: String,
    e: String,
}

#[derive(Deserialize)]
struct Jwks {
    keys: Vec<Jwk>,
}

#[derive(Deserialize)]
pub(crate) struct IdClaims {
    pub iss: String,
    pub aud: serde_json::Value,
    pub exp: u64,
    pub sub: String,
    pub nonce: Option<String>,
    pub email: Option<String>,
}

pub(crate) fn check_claims(claims: &IdClaims, client_id: &str, nonce: &str, now: u64) -> Result<(), String> {
    if claims.iss != ISSUER {
        return Err("ID token has the wrong issuer".to_string());
    }
    let audience_ok = match &claims.aud {
        serde_json::Value::String(aud) => aud == client_id,
        serde_json::Value::Array(list) => list.iter().any(|a| a.as_str() == Some(client_id)),
        _ => false,
    };
    if !audience_ok {
        return Err("ID token was issued for another client".to_string());
    }
    if claims.exp + 60 < now {
        return Err("ID token has expired".to_string());
    }
    if claims.nonce.as_deref() != Some(nonce) {
        return Err("ID token nonce does not match this sign-in".to_string());
    }
    Ok(())
}

/// Verifies the RS256 signature against OpenAI's JWKS, then the claims.
async fn validate_id_token(id_token: &str, client_id: &str, nonce: &str) -> Result<IdClaims, String> {
    let mut parts = id_token.split('.');
    let (Some(header), Some(payload), Some(signature)) = (parts.next(), parts.next(), parts.next()) else {
        return Err("Malformed ID token".to_string());
    };
    let header: serde_json::Value = serde_json::from_slice(
        &URL_SAFE_NO_PAD.decode(header).map_err(|_| "Malformed ID token header")?,
    )
    .map_err(|_| "Malformed ID token header")?;
    if header.get("alg").and_then(|a| a.as_str()) != Some("RS256") {
        return Err("Unsupported ID token algorithm".to_string());
    }
    let kid = header.get("kid").and_then(|k| k.as_str());

    let body = reqwest::get(JWKS)
        .await
        .map_err(|e| format!("Cannot fetch OpenAI keys: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Cannot fetch OpenAI keys: {e}"))?;
    let jwks: Jwks = serde_json::from_str(&body).map_err(|e| format!("Invalid OpenAI keys: {e}"))?;
    let key = jwks
        .keys
        .iter()
        .find(|k| kid.is_none() || k.kid.as_deref() == kid)
        .ok_or("No matching OpenAI signing key")?;
    let n = URL_SAFE_NO_PAD.decode(&key.n).map_err(|_| "Bad signing key")?;
    let e = URL_SAFE_NO_PAD.decode(&key.e).map_err(|_| "Bad signing key")?;
    let signature = URL_SAFE_NO_PAD.decode(signature).map_err(|_| "Malformed ID token signature")?;
    ring::signature::RsaPublicKeyComponents { n: &n, e: &e }
        .verify(
            &ring::signature::RSA_PKCS1_2048_8192_SHA256,
            format!("{}.{}", id_token.split('.').next().unwrap_or(""), payload).as_bytes(),
            &signature,
        )
        .map_err(|_| "ID token signature is invalid".to_string())?;

    let claims: IdClaims = serde_json::from_slice(
        &URL_SAFE_NO_PAD.decode(payload).map_err(|_| "Malformed ID token")?,
    )
    .map_err(|e| format!("Malformed ID token: {e}"))?;
    check_claims(&claims, client_id, nonce, now())?;
    Ok(claims)
}

fn scopes_of(scope: Option<&str>) -> Vec<String> {
    scope.unwrap_or("").split_whitespace().map(str::to_string).collect()
}

/// Runs the browser sign-in and stores the credentials for `profile_id`.
#[tauri::command]
pub async fn chatgpt_sign_in(profile_id: String) -> Result<AccountInfo, String> {
    let previous = load(&profile_id);
    let host = host_id()?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Cannot start sign-in listener: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}{CALLBACK_PATH}");
    let state = random_token();
    let nonce = random_token();
    let verifier = random_token();

    let saved_client = previous.as_ref().map(|c| c.client_id.clone()).filter(|c| !c.is_empty());
    let mut url = url::Url::parse(AUTHORIZE).map_err(|e| e.to_string())?;
    {
        let mut query = url.query_pairs_mut();
        query
            .append_pair("client_id", saved_client.as_deref().unwrap_or("dynamic_agent_client"))
            .append_pair("ext_agent_host_id", &host)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", &redirect_uri)
            .append_pair("scope", SCOPES)
            .append_pair("resource", RESOURCE)
            .append_pair("state", &state)
            .append_pair("nonce", &nonce)
            .append_pair("code_challenge", &pkce_challenge(&verifier))
            .append_pair("code_challenge_method", "S256");
        match (&saved_client, &previous) {
            (Some(_), Some(prev)) => {
                if !prev.id_token.is_empty() {
                    query.append_pair("id_token_hint", &prev.id_token);
                }
                if let Some(email) = &prev.email {
                    query.append_pair("login_hint", email);
                }
            }
            _ => {
                query.append_pair("agent_name_hint", AGENT_NAME);
            }
        }
    }
    super::canvas::open_url(url.to_string())?;

    let callback = tokio::task::spawn_blocking(move || wait_for_callback(listener))
        .await
        .map_err(|e| e.to_string())??;
    if callback.state.as_deref() != Some(state.as_str()) {
        return Err("Sign-in was not completed (state mismatch)".to_string());
    }
    if let Some(error) = callback.error {
        return Err(if error == "access_denied" {
            "Sign-in was cancelled or permission was declined".to_string()
        } else {
            format!("Sign-in failed: {error}")
        });
    }
    let code = callback.code.ok_or("Sign-in returned no code")?;
    let client_id = match (&saved_client, callback.client_id) {
        (Some(saved), Some(returned)) if *saved != returned => {
            return Err("Sign-in returned a different app registration".to_string())
        }
        (Some(saved), _) => saved.clone(),
        (None, Some(issued)) if issued != "dynamic_agent_client" => issued,
        (None, _) => return Err("Registration did not complete (no client id)".to_string()),
    };

    let tokens = token_request(&[
        ("grant_type", "authorization_code"),
        ("client_id", &client_id),
        ("code", &code),
        ("code_verifier", &verifier),
        ("redirect_uri", &redirect_uri),
        ("resource", RESOURCE),
    ])
    .await?;
    let id_token = tokens.id_token.clone().ok_or("Sign-in returned no ID token")?;
    let claims = validate_id_token(&id_token, &client_id, &nonce).await?;
    if let Some(prev) = &previous {
        if !prev.subject.is_empty() && prev.subject != claims.sub && saved_client.is_some() {
            return Err("Signed in with a different ChatGPT account than this provider uses".to_string());
        }
    }
    let scopes = scopes_of(tokens.scope.as_deref());
    let credentials = Credentials {
        email: claims.email,
        subject: claims.sub,
        client_id,
        id_token,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token.ok_or("Sign-in returned no refresh token")?,
        expires_at: now() + tokens.expires_in.unwrap_or(3600),
        scopes,
    };
    save(&profile_id, &credentials)?;
    Ok(AccountInfo {
        email: credentials.email.clone(),
        plan_enabled: credentials.scopes.iter().any(|s| s == PLAN_SCOPE),
    })
}

#[tauri::command]
pub fn chatgpt_account(profile_id: String) -> Option<AccountInfo> {
    load(&profile_id)
        .filter(|c| !c.refresh_token.is_empty())
        .map(|c| AccountInfo {
            plan_enabled: c.scopes.iter().any(|s| s == PLAN_SCOPE),
            email: c.email,
        })
}

/// Revokes the renewable session, then clears the tokens but keeps the
/// client registration and account hints for a later sign-in.
#[tauri::command]
pub async fn chatgpt_sign_out(profile_id: String) -> Result<bool, String> {
    let Some(mut credentials) = load(&profile_id) else {
        return Ok(true);
    };
    let mut confirmed = false;
    if !credentials.refresh_token.is_empty() {
        for attempt in 0..3 {
            let result = reqwest::Client::new()
                .post(REVOKE)
                .form(&[
                    ("token", credentials.refresh_token.as_str()),
                    ("token_type_hint", "refresh_token"),
                    ("client_id", credentials.client_id.as_str()),
                ])
                .timeout(Duration::from_secs(15))
                .send()
                .await;
            match result {
                Ok(response) if response.status().is_success() => {
                    confirmed = true;
                    break;
                }
                Ok(response) if response.status().is_client_error() => break,
                _ => tokio::time::sleep(Duration::from_millis(500 * (attempt + 1))).await,
            }
        }
    }
    credentials.access_token.clear();
    credentials.refresh_token.clear();
    credentials.id_token.clear();
    credentials.expires_at = 0;
    save(&profile_id, &credentials)?;
    Ok(confirmed)
}

static REFRESH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

const TERMINAL_REFRESH_ERRORS: [&str; 6] = [
    "invalid_grant",
    "invalid_refresh_token",
    "token_expired",
    "refresh_token_expired",
    "refresh_token_invalidated",
    "refresh_token_reused",
];

/// A valid access token for the profile, refreshing it when needed.
/// Refreshes are serialized because refresh tokens rotate.
pub async fn access_token(profile_id: &str) -> Result<String, String> {
    let _guard = REFRESH_LOCK.lock().await;
    let mut credentials = load(profile_id).filter(|c| !c.refresh_token.is_empty()).ok_or(
        "Not signed in to ChatGPT. Open the AI Chat settings and use Continue with ChatGPT.",
    )?;
    if !credentials.scopes.iter().any(|s| s == PLAN_SCOPE) {
        return Err("ChatGPT plan usage was not permitted at sign-in. Sign in again and allow it.".to_string());
    }
    if credentials.expires_at > now() + REFRESH_MARGIN_SECS {
        return Ok(credentials.access_token);
    }
    let refreshed = token_request(&[
        ("grant_type", "refresh_token"),
        ("client_id", &credentials.client_id),
        ("refresh_token", &credentials.refresh_token),
        ("resource", RESOURCE),
    ])
    .await;
    match refreshed {
        Ok(tokens) => {
            credentials.access_token = tokens.access_token;
            if let Some(refresh) = tokens.refresh_token {
                credentials.refresh_token = refresh;
            }
            if let Some(id_token) = tokens.id_token {
                credentials.id_token = id_token;
            }
            if tokens.scope.is_some() {
                credentials.scopes = scopes_of(tokens.scope.as_deref());
            }
            credentials.expires_at = now() + tokens.expires_in.unwrap_or(3600);
            save(profile_id, &credentials)?;
            Ok(credentials.access_token)
        }
        Err(error) => {
            if TERMINAL_REFRESH_ERRORS.iter().any(|code| error.contains(&format!("token_error:{code}:"))) {
                credentials.access_token.clear();
                credentials.refresh_token.clear();
                save(profile_id, &credentials)?;
                return Err("Your ChatGPT sign-in has ended. Open the AI Chat settings and sign in again.".to_string());
            }
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_matches_rfc7636_example() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn parses_the_callback_and_ignores_other_paths() {
        let cb = parse_callback("GET /auth/callback?code=abc&state=s1&client_id=oaiapp_1&scope=x+y HTTP/1.1").unwrap();
        assert_eq!(cb.code.as_deref(), Some("abc"));
        assert_eq!(cb.state.as_deref(), Some("s1"));
        assert_eq!(cb.client_id.as_deref(), Some("oaiapp_1"));
        assert!(parse_callback("GET /favicon.ico HTTP/1.1").is_none());
        assert!(parse_callback("GET /callback?code=a HTTP/1.1").is_none());
        let denied = parse_callback("GET /auth/callback?error=access_denied&state=s HTTP/1.1").unwrap();
        assert_eq!(denied.error.as_deref(), Some("access_denied"));
    }

    fn claims(aud: serde_json::Value, nonce: &str) -> IdClaims {
        IdClaims {
            iss: ISSUER.to_string(),
            aud,
            exp: 2_000,
            sub: "user".to_string(),
            nonce: Some(nonce.to_string()),
            email: None,
        }
    }

    #[test]
    fn checks_id_token_claims() {
        let ok = claims(serde_json::json!("oaiapp_1"), "n1");
        assert!(check_claims(&ok, "oaiapp_1", "n1", 1_000).is_ok());
        assert!(check_claims(&ok, "oaiapp_2", "n1", 1_000).is_err());
        assert!(check_claims(&ok, "oaiapp_1", "other", 1_000).is_err());
        assert!(check_claims(&ok, "oaiapp_1", "n1", 9_000).is_err());
        let list = claims(serde_json::json!(["x", "oaiapp_1"]), "n1");
        assert!(check_claims(&list, "oaiapp_1", "n1", 1_000).is_ok());
        let mut wrong_issuer = claims(serde_json::json!("oaiapp_1"), "n1");
        wrong_issuer.iss = "https://evil.example".to_string();
        assert!(check_claims(&wrong_issuer, "oaiapp_1", "n1", 1_000).is_err());
    }
}
