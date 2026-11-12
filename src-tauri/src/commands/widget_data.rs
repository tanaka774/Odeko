//! `odeko.storage` for Custom HTML widgets: one JSON object of string values
//! per widget in `widget-data/<widget id>.json`, kept out of presets so a page
//! saving often never rewrites the layout or floods undo.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use std::collections::BTreeSet;

use super::canvas::{get_config_dir, get_presets_dir};

pub const MAX_BYTES: usize = 1024 * 1024;
const MAX_KEY_LEN: usize = 256;

type Store = BTreeMap<String, String>;

fn data_dir() -> PathBuf {
    get_config_dir().join("widget-data")
}

fn data_path(dir: &Path, widget_id: &str) -> Result<PathBuf, String> {
    if widget_id.is_empty()
        || widget_id.len() > 128
        || !widget_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("invalid widget id".to_string());
    }
    Ok(dir.join(format!("{widget_id}.json")))
}

fn read_store(path: &Path) -> Store {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

fn store_size(store: &Store) -> usize {
    store.iter().map(|(k, v)| k.len() + v.len()).sum()
}

fn write_store(path: &Path, store: &Store) -> Result<(), String> {
    if store.is_empty() {
        if path.exists() {
            std::fs::remove_file(path).map_err(|e| format!("Cannot clear widget data: {e}"))?;
        }
        return Ok(());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create widget data dir: {e}"))?;
    }
    let text = serde_json::to_string(store).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("Cannot save widget data: {e}"))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("Cannot save widget data: {e}"))
}

fn set_in(dir: &Path, widget_id: &str, key: &str, value: Option<&str>) -> Result<(), String> {
    if key.is_empty() || key.len() > MAX_KEY_LEN {
        return Err(format!("Keys must be 1-{MAX_KEY_LEN} characters"));
    }
    let path = data_path(dir, widget_id)?;
    let mut store = read_store(&path);
    match value {
        Some(value) => {
            store.insert(key.to_string(), value.to_string());
            if store_size(&store) > MAX_BYTES {
                return Err(format!(
                    "Widget storage is full ({} KB max)",
                    MAX_BYTES / 1024
                ));
            }
        }
        None => {
            store.remove(key);
        }
    }
    write_store(&path, &store)
}

/// Widget ids used by any preset file.
fn ids_in_presets(presets: &Path) -> BTreeSet<String> {
    let mut ids = BTreeSet::new();
    let Ok(entries) = std::fs::read_dir(presets) else {
        return ids;
    };
    for entry in entries.flatten() {
        let Ok(text) = std::fs::read_to_string(entry.path()) else {
            continue;
        };
        let Ok(preset) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        for icon in preset["icons"].as_array().into_iter().flatten() {
            if let Some(id) = icon["id"].as_str() {
                ids.insert(id.to_string());
            }
        }
    }
    ids
}

/// Deletes data of widgets no preset contains anymore. Skipped when no
/// preset can be read, so a broken config never wipes everything.
fn prune_in(dir: &Path, presets: &Path) -> usize {
    let keep = ids_in_presets(presets);
    if keep.is_empty() {
        return 0;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut removed = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(id) = path
            .file_name()
            .and_then(|name| name.to_str())
            .and_then(|name| name.strip_suffix(".json"))
        else {
            continue;
        };
        if !keep.contains(id) && std::fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    removed
}

#[tauri::command]
pub fn widget_data_prune() -> usize {
    prune_in(&data_dir(), &get_presets_dir())
}

#[tauri::command]
pub fn widget_data_load(widget_id: String) -> Result<Store, String> {
    Ok(read_store(&data_path(&data_dir(), &widget_id)?))
}

#[tauri::command]
pub fn widget_data_set(
    widget_id: String,
    key: String,
    value: Option<String>,
) -> Result<(), String> {
    set_in(&data_dir(), &widget_id, &key, value.as_deref())
}

#[tauri::command]
pub fn widget_data_clear(widget_id: String) -> Result<(), String> {
    write_store(&data_path(&data_dir(), &widget_id)?, &Store::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("odeko-wdata-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn sets_reads_and_removes_values() {
        let dir = temp_dir("roundtrip");
        set_in(&dir, "w1", "count", Some("3")).unwrap();
        set_in(&dir, "w1", "name", Some("x")).unwrap();
        let path = data_path(&dir, "w1").unwrap();
        assert_eq!(
            read_store(&path).get("count").map(String::as_str),
            Some("3")
        );

        set_in(&dir, "w1", "count", None).unwrap();
        set_in(&dir, "w1", "name", None).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn rejects_bad_ids_and_keys() {
        let dir = temp_dir("bad");
        assert!(set_in(&dir, "../x", "k", Some("v")).is_err());
        assert!(set_in(&dir, "", "k", Some("v")).is_err());
        assert!(set_in(&dir, "w1", "", Some("v")).is_err());
    }

    #[test]
    fn prunes_data_of_widgets_no_preset_has() {
        let root = temp_dir("prune");
        let presets = root.join("presets");
        let data = root.join("data");
        std::fs::create_dir_all(&presets).unwrap();
        set_in(&data, "kept", "k", Some("1")).unwrap();
        set_in(&data, "gone", "k", Some("1")).unwrap();

        assert_eq!(prune_in(&data, &presets), 0);

        std::fs::write(
            presets.join("a.json"),
            r#"{ "icons": [{ "id": "kept" }], "settings": {} }"#,
        )
        .unwrap();
        assert_eq!(prune_in(&data, &presets), 1);
        assert!(data.join("kept.json").exists());
        assert!(!data.join("gone.json").exists());
    }

    #[test]
    fn enforces_the_size_limit() {
        let dir = temp_dir("limit");
        let big = "x".repeat(MAX_BYTES);
        assert!(set_in(&dir, "w1", "big", Some(&big)).is_err());
        set_in(&dir, "w1", "small", Some("ok")).unwrap();
        assert!(set_in(&dir, "w1", "big", Some(&big)).is_err());
        let store = read_store(&data_path(&dir, "w1").unwrap());
        assert_eq!(store.len(), 1);
    }
}
