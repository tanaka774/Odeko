//! Download-on-first-use cache for libraries that HTML background layers
//! load from the web (Three.js, p5.js, ...).
//!
//! The layer's `https://host/path` script URLs are rewritten to
//! `http://127.0.0.1:<port>/lib/<token>/host/path` on the media server. A
//! miss downloads the file once (public addresses only, see
//! `widget_fetch::fetch_public_bytes`) and later loads are served from disk,
//! so layers keep working offline. Relative imports inside a cached module
//! resolve against the same prefix and are cached the same way.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use super::canvas::get_config_dir;
use super::widget_fetch::fetch_public_bytes;

const MAX_LIBRARY_BYTES: usize = 32 * 1024 * 1024;

fn cache_dir() -> PathBuf {
    get_config_dir().join("library-cache")
}

/// Maps `host/path?query` (the part after the token) back to its https URL.
fn upstream_url(rest: &str) -> Result<String, String> {
    let host = rest.split('/').next().unwrap_or_default();
    let valid_host = !host.is_empty()
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == ':');
    if !valid_host || rest.contains("..") {
        return Err(format!("invalid library path: {rest}"));
    }
    Ok(format!("https://{rest}"))
}

fn cache_key(url: &str) -> String {
    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn content_type_for(url: &str, upstream: Option<String>) -> String {
    let path = url.split(['?', '#']).next().unwrap_or_default();
    let ext = path.rsplit('.').next().unwrap_or_default().to_lowercase();
    match ext.as_str() {
        "js" | "mjs" | "cjs" => "text/javascript".to_string(),
        "json" => "application/json".to_string(),
        "wasm" => "application/wasm".to_string(),
        "css" => "text/css".to_string(),
        _ => upstream.unwrap_or_else(|| "application/octet-stream".to_string()),
    }
}

/// Returns the file's bytes and content type, downloading it on a miss.
pub fn load(rest: &str) -> Result<(Vec<u8>, String), String> {
    let url = upstream_url(rest)?;
    let key = cache_key(&url);
    let dir = cache_dir();
    let data_path = dir.join(&key);
    let type_path = dir.join(format!("{key}.type"));
    if let (Ok(bytes), Ok(content_type)) =
        (std::fs::read(&data_path), std::fs::read_to_string(&type_path))
    {
        return Ok((bytes, content_type));
    }

    log::info!("Library cache miss, downloading {url}");
    let (bytes, upstream_type) =
        tauri::async_runtime::block_on(fetch_public_bytes(&url, MAX_LIBRARY_BYTES))?;
    let content_type = content_type_for(&url, upstream_type);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(&data_path, &bytes).map_err(|e| e.to_string())?;
    std::fs::write(&type_path, &content_type).map_err(|e| e.to_string())?;
    Ok((bytes, content_type))
}

/// Total size of the cached files in bytes.
#[tauri::command]
pub fn library_cache_size() -> u64 {
    std::fs::read_dir(cache_dir())
        .map(|entries| {
            entries
                .filter_map(|e| e.ok()?.metadata().ok())
                .map(|m| m.len())
                .sum()
        })
        .unwrap_or(0)
}

#[tauri::command]
pub fn clear_library_cache() -> Result<(), String> {
    match std::fs::remove_dir_all(cache_dir()) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_paths_back_to_https() {
        assert_eq!(
            upstream_url("cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js").unwrap(),
            "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"
        );
    }

    #[test]
    fn rejects_traversal_and_bad_hosts() {
        assert!(upstream_url("cdn.example.com/../secret").is_err());
        assert!(upstream_url("user@host/x").is_err());
        assert!(upstream_url("").is_err());
    }

    #[test]
    fn infers_script_content_types() {
        assert_eq!(content_type_for("https://a/b.mjs?x=1", None), "text/javascript");
        assert_eq!(
            content_type_for("https://a/font.woff2", Some("font/woff2".into())),
            "font/woff2"
        );
    }
}
