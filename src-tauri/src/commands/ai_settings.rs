//! AI chat settings, secrets and chat logs, kept out of presets.
//!
//! - `ai.json`: provider profiles and search settings, no keys.
//! - `ai-secrets.json` (0600): API keys, keyed by profile id or search service.
//!   Never returned to the webview; `ai_request` injects them into requests.
//! - `ai-chats/<widget id>.json`: conversations of each AI chat widget.

use std::collections::HashMap;
use std::path::PathBuf;

use parking_lot::Mutex;

use super::canvas::get_config_dir;

fn ai_settings_path() -> PathBuf {
    get_config_dir().join("ai.json")
}

fn secrets_path() -> PathBuf {
    get_config_dir().join("ai-secrets.json")
}

fn chats_dir() -> PathBuf {
    get_config_dir().join("ai-chats")
}

fn write_private(path: &PathBuf, text: &str) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create config dir: {e}"))?;
    }
    std::fs::write(path, text).map_err(|e| format!("Cannot write {}: {e}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn read_json(path: &PathBuf) -> Result<serde_json::Value, String> {
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let text = std::fs::read_to_string(path).map_err(|e| format!("Cannot read {}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("Invalid {}: {e}", path.display()))
}

static SECRETS: Mutex<Option<HashMap<String, String>>> = parking_lot::const_mutex(None);

fn with_secrets<T>(f: impl FnOnce(&mut HashMap<String, String>) -> T) -> T {
    let mut guard = SECRETS.lock();
    let secrets = guard.get_or_insert_with(|| {
        read_json(&secrets_path())
            .ok()
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default()
    });
    f(secrets)
}

pub(crate) fn secret(id: &str) -> Option<String> {
    with_secrets(|s| s.get(id).cloned()).filter(|k| !k.is_empty())
}

pub(crate) fn set_secret(id: &str, value: &str) -> Result<(), String> {
    with_secrets(|s| s.insert(id.to_string(), value.to_string()));
    persist_secrets()
}

/// Every stored key, so error text can be scrubbed of them.
pub(crate) fn all_secrets() -> Vec<String> {
    with_secrets(|s| {
        let mut out = Vec::new();
        for value in s.values() {
            match serde_json::from_str::<serde_json::Value>(value) {
                Ok(serde_json::Value::Object(fields)) => {
                    for key in ["access_token", "refresh_token", "id_token"] {
                        if let Some(token) = fields.get(key).and_then(|v| v.as_str()) {
                            out.push(token.to_string());
                        }
                    }
                }
                _ => out.push(value.clone()),
            }
        }
        out.retain(|k| k.len() >= 6);
        out
    })
}

/// Moves keys that older versions kept inside ai.json into the secrets file.
fn migrate_inline_keys(settings: &mut serde_json::Value) -> bool {
    let mut moved = false;
    if let Some(profiles) = settings.get_mut("profiles").and_then(|p| p.as_array_mut()) {
        for profile in profiles {
            let Some(obj) = profile.as_object_mut() else { continue };
            let id = obj.get("id").and_then(|v| v.as_str()).map(str::to_string);
            if let (Some(id), Some(serde_json::Value::String(key))) = (id, obj.remove("apiKey")) {
                if !key.is_empty() {
                    with_secrets(|s| s.insert(id, key));
                }
                moved = true;
            }
        }
    }
    if let Some(obj) = settings.as_object_mut() {
        if let Some(serde_json::Value::String(key)) = obj.remove("tavilyApiKey") {
            if !key.is_empty() {
                with_secrets(|s| s.insert("search:tavily".to_string(), key));
            }
            moved = true;
        }
    }
    moved
}

fn persist_secrets() -> Result<(), String> {
    let text = with_secrets(|s| serde_json::to_string_pretty(s)).map_err(|e| e.to_string())?;
    write_private(&secrets_path(), &text)
}

/// Settings plus `keys`: which secret ids have a stored key (never the keys).
#[tauri::command]
pub fn load_ai_settings() -> Result<serde_json::Value, String> {
    let path = ai_settings_path();
    let mut settings = read_json(&path)?;
    if migrate_inline_keys(&mut settings) {
        persist_secrets()?;
        write_private(&path, &serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?)?;
    }
    let keys: Vec<String> = with_secrets(|s| {
        s.iter().filter(|(_, v)| !v.is_empty()).map(|(k, _)| k.clone()).collect()
    });
    if let Some(obj) = settings.as_object_mut() {
        obj.insert("keys".to_string(), serde_json::json!(keys));
    }
    Ok(settings)
}

#[tauri::command]
pub fn save_ai_settings(mut settings: serde_json::Value) -> Result<(), String> {
    migrate_inline_keys(&mut settings);
    if let Some(obj) = settings.as_object_mut() {
        obj.remove("keys");
    }
    persist_secrets()?;
    let text = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    write_private(&ai_settings_path(), &text)
}

/// Stores (or with an empty key, deletes) the secret for `id`.
#[tauri::command]
pub fn set_ai_secret(id: String, key: String) -> Result<(), String> {
    let key = key.trim().to_string();
    with_secrets(|s| {
        if key.is_empty() {
            s.remove(&id);
        } else {
            s.insert(id, key);
        }
    });
    persist_secrets()
}

/// Drops secrets whose ids are not in `keep` (removed profiles).
#[tauri::command]
pub fn prune_ai_secrets(keep: Vec<String>) -> Result<(), String> {
    with_secrets(|s| {
        s.retain(|id, _| {
            let profile = id.strip_prefix("chatgpt:").unwrap_or(id);
            keep.iter().any(|k| k == id || k == profile)
        })
    });
    persist_secrets()
}

fn chat_path(widget_id: &str) -> Result<PathBuf, String> {
    if widget_id.is_empty()
        || !widget_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("invalid widget id".to_string());
    }
    Ok(chats_dir().join(format!("{widget_id}.json")))
}

#[tauri::command]
pub fn load_ai_chat(widget_id: String) -> Result<Option<serde_json::Value>, String> {
    let path = chat_path(&widget_id)?;
    if !path.exists() {
        return Ok(None);
    }
    read_json(&path).map(Some)
}

#[tauri::command]
pub fn save_ai_chat(widget_id: String, chat: serde_json::Value) -> Result<(), String> {
    let path = chat_path(&widget_id)?;
    let text = serde_json::to_string(&chat).map_err(|e| e.to_string())?;
    write_private(&path, &redact(&text))
}

#[tauri::command]
pub fn delete_ai_chat(widget_id: String) -> Result<(), String> {
    let path = chat_path(&widget_id)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Replaces every stored key found in `text` with a placeholder.
pub(crate) fn redact(text: &str) -> String {
    let mut out = text.to_string();
    for key in all_secrets() {
        if out.contains(&key) {
            out = out.replace(&key, "[redacted]");
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_path_like_widget_ids() {
        assert!(chat_path("widget-123").is_ok());
        assert!(chat_path("../ai-secrets").is_err());
        assert!(chat_path("a/b").is_err());
        assert!(chat_path("").is_err());
    }

    #[test]
    fn migrates_inline_keys_out_of_settings() {
        let mut settings = serde_json::json!({
            "profiles": [{ "id": "p-migrate", "apiKey": "sk-inline-123456", "model": "m" }],
            "tavilyApiKey": "tvly-inline-123456"
        });
        assert!(migrate_inline_keys(&mut settings));
        assert!(settings["profiles"][0].get("apiKey").is_none());
        assert!(settings.get("tavilyApiKey").is_none());
        assert_eq!(secret("p-migrate").as_deref(), Some("sk-inline-123456"));
        assert_eq!(secret("search:tavily").as_deref(), Some("tvly-inline-123456"));
        assert_eq!(redact("bearer sk-inline-123456 x"), "bearer [redacted] x");
    }
}
