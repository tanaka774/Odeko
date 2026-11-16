//! Memo and task list contents, kept out of presets so exporting a preset or
//! giving the AI config access never exposes them.
//!
//! `notes/<kind>/<id>.json` holds `{ name, shared, data }`. Shared notes can be
//! picked by any widget in any preset; private ones belong to one widget and
//! are pruned once no preset refers to them. Widgets store only `noteId`;
//! without one they show the shared note `main`.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::canvas::{get_config_dir, get_presets_dir, AppIcon};

pub const MAIN: &str = "main";
const KINDS: &[&str] = &["memo", "tasks"];
const MAX_NOTE_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct Note {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub shared: bool,
    #[serde(default)]
    pub data: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NoteSummary {
    pub id: String,
    pub name: String,
}

fn notes_root() -> PathBuf {
    get_config_dir().join("notes")
}

/// The note kind a widget type stores its content in.
pub fn kind_of(widget_type: Option<&str>) -> Option<&'static str> {
    match widget_type {
        Some("memo") => Some("memo"),
        Some("tasklist") => Some("tasks"),
        _ => None,
    }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn note_path(root: &Path, kind: &str, id: &str) -> Result<PathBuf, String> {
    if !KINDS.contains(&kind) {
        return Err(format!("Unknown note kind '{kind}'"));
    }
    if !valid_id(id) {
        return Err("Invalid note id".to_string());
    }
    Ok(root.join(kind).join(format!("{id}.json")))
}

fn read_note(path: &Path) -> Option<Note> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn write_note(path: &Path, note: &Note) -> Result<(), String> {
    let text = serde_json::to_string(note).map_err(|e| e.to_string())?;
    if text.len() > MAX_NOTE_BYTES {
        return Err(format!(
            "Note is too large ({} MB max)",
            MAX_NOTE_BYTES / (1024 * 1024)
        ));
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create notes dir: {e}"))?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| format!("Cannot save note: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&tmp, path).map_err(|e| format!("Cannot save note: {e}"))
}

fn new_id() -> String {
    format!("n-{}", uuid::Uuid::new_v4().simple())
}

fn list_in(root: &Path, kind: &str) -> Vec<NoteSummary> {
    let mut notes: Vec<NoteSummary> = std::fs::read_dir(root.join(kind))
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let id = path
                .file_name()?
                .to_str()?
                .strip_suffix(".json")?
                .to_string();
            let note = read_note(&path)?;
            (note.shared && valid_id(&id)).then_some(NoteSummary {
                id,
                name: note.name,
            })
        })
        .collect();
    if !notes.iter().any(|n| n.id == MAIN) {
        notes.push(NoteSummary {
            id: MAIN.to_string(),
            name: "Main".to_string(),
        });
    }
    notes.sort_by(|a, b| {
        (a.id != MAIN, a.name.to_lowercase()).cmp(&(b.id != MAIN, b.name.to_lowercase()))
    });
    notes
}

#[tauri::command]
pub fn note_list(kind: String) -> Result<Vec<NoteSummary>, String> {
    if !KINDS.contains(&kind.as_str()) {
        return Err(format!("Unknown note kind '{kind}'"));
    }
    ensure_ready();
    Ok(list_in(&notes_root(), &kind))
}

#[tauri::command]
pub fn note_load(kind: String, id: String) -> Result<Option<Note>, String> {
    ensure_ready();
    Ok(read_note(&note_path(&notes_root(), &kind, &id)?))
}

#[tauri::command]
pub fn note_save(kind: String, id: String, note: Note) -> Result<(), String> {
    ensure_ready();
    let mut note = note;
    if id == MAIN {
        note.shared = true;
    }
    write_note(&note_path(&notes_root(), &kind, &id)?, &note)
}

#[tauri::command]
pub fn note_delete(kind: String, id: String) -> Result<(), String> {
    if id == MAIN {
        return Err("The Main note cannot be deleted".to_string());
    }
    let path = note_path(&notes_root(), &kind, &id)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Cannot delete note: {e}"))?;
    }
    Ok(())
}

fn config_object(icon: &mut AppIcon) -> Option<&mut serde_json::Map<String, serde_json::Value>> {
    icon.widget_config.as_mut().and_then(|c| c.as_object_mut())
}

/// Content fields older versions kept inside widget_config.
const CONTENT_FIELDS: &[&str] = &["content", "groups", "tasks"];

/// Drops note content from memo and task list configs, so it can never be
/// written to (or exported in) a preset file.
pub fn strip_content(icons: &mut [AppIcon]) {
    for icon in icons {
        if kind_of(icon.widget_type.as_deref()).is_none() {
            continue;
        }
        if let Some(config) = config_object(icon) {
            for field in CONTENT_FIELDS {
                config.remove(*field);
            }
        }
    }
}

/// Same as `strip_content`, plus the note reference (it points at notes that
/// only exist on this machine), for presets that leave or enter the app.
pub fn strip_for_sharing(icons: &mut [AppIcon]) {
    strip_content(icons);
    for icon in icons {
        if kind_of(icon.widget_type.as_deref()).is_none() {
            continue;
        }
        if let Some(config) = config_object(icon) {
            config.remove("noteId");
        }
    }
}

fn note_id_of(icon: &AppIcon) -> Option<String> {
    icon.widget_config
        .as_ref()?
        .get("noteId")?
        .as_str()
        .filter(|id| valid_id(id))
        .map(str::to_string)
}

fn fork_in(root: &Path, icons: &mut [AppIcon]) {
    for icon in icons {
        let Some(kind) = kind_of(icon.widget_type.as_deref()) else {
            continue;
        };
        let Some(id) = note_id_of(icon) else {
            continue;
        };
        let Ok(path) = note_path(root, kind, &id) else {
            continue;
        };
        let Some(note) = read_note(&path).filter(|n| !n.shared) else {
            continue;
        };
        let copy = new_id();
        let Ok(copy_path) = note_path(root, kind, &copy) else {
            continue;
        };
        if write_note(&copy_path, &note).is_ok() {
            if let Some(config) = config_object(icon) {
                config.insert("noteId".to_string(), serde_json::json!(copy));
            }
        }
    }
}

/// Gives widgets that show a private note their own copy, for icons that are
/// about to land in a second preset (duplicate, save as).
pub fn fork_private(icons: &mut [AppIcon]) {
    fork_in(&notes_root(), icons);
}

fn preset_files(presets: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(presets)
        .into_iter()
        .flatten()
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
        .collect();
    files.sort();
    files
}

fn memo_data(content: &str) -> serde_json::Value {
    serde_json::json!({
        "tabs": [{ "id": "tab-1", "name": "", "color": "#4f9cf7", "content": content }]
    })
}

/// Pulls the content of one old-style widget config, or None when empty.
fn legacy_data(
    kind: &str,
    config: &serde_json::Map<String, serde_json::Value>,
) -> Option<serde_json::Value> {
    match kind {
        "memo" => {
            let content = config.get("content")?.as_str()?;
            (!content.trim().is_empty()).then(|| memo_data(content))
        }
        _ => {
            let groups = match config.get("groups").and_then(|g| g.as_array()) {
                Some(groups) if !groups.is_empty() => groups.clone(),
                _ => {
                    let tasks = config.get("tasks").and_then(|t| t.as_array())?;
                    vec![serde_json::json!({
                        "id": "group-1", "name": "", "color": "#4f9cf7", "tasks": tasks
                    })]
                }
            };
            let has_tasks = groups.iter().any(|g| {
                g.get("tasks")
                    .and_then(|t| t.as_array())
                    .is_some_and(|t| !t.is_empty())
            });
            let named = groups.len() > 1
                || groups.iter().any(|g| {
                    g.get("name")
                        .and_then(|n| n.as_str())
                        .is_some_and(|n| !n.is_empty())
                });
            (has_tasks || named).then(|| serde_json::json!({ "groups": groups }))
        }
    }
}

fn unique_name(root: &Path, kind: &str, base: &str) -> String {
    let taken: BTreeSet<String> = list_in(root, kind).into_iter().map(|n| n.name).collect();
    if !taken.contains(base) {
        return base.to_string();
    }
    (2..)
        .map(|i| format!("{base} {i}"))
        .find(|n| !taken.contains(n))
        .unwrap()
}

fn write_json_atomic(path: &Path, value: &serde_json::Value) -> bool {
    let Ok(json) = serde_json::to_string_pretty(value) else {
        return false;
    };
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).is_ok() && std::fs::rename(&tmp, path).is_ok()
}

/// Moves memo/task content still stored in preset files into notes. The
/// active preset goes first, so its content becomes the Main note; content
/// of other widgets becomes shared notes named after their preset.
fn migrate_in(root: &Path, presets: &Path, active: Option<&str>) -> usize {
    let mut files = preset_files(presets);
    if let Some(active) = active {
        let first = presets.join(format!("{active}.json"));
        if let Some(index) = files.iter().position(|p| *p == first) {
            let path = files.remove(index);
            files.insert(0, path);
        }
    }
    let mut moved = 0;
    for path in files {
        let Ok(text) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(mut preset) = serde_json::from_str::<serde_json::Value>(&text) else {
            continue;
        };
        let preset_name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Note")
            .to_string();
        let Some(icons) = preset.get_mut("icons").and_then(|i| i.as_array_mut()) else {
            continue;
        };
        let mut changed = false;
        for icon in icons {
            let Some(kind) = kind_of(icon.get("widget_type").and_then(|t| t.as_str())) else {
                continue;
            };
            let Some(config) = icon
                .get_mut("widget_config")
                .and_then(|c| c.as_object_mut())
            else {
                continue;
            };
            if !CONTENT_FIELDS.iter().any(|f| config.contains_key(*f)) {
                continue;
            }
            if let Some(data) = legacy_data(kind, config) {
                let main_exists = note_path(root, kind, MAIN)
                    .map(|p| p.exists())
                    .unwrap_or(true);
                let (id, name) = if main_exists {
                    (new_id(), unique_name(root, kind, &preset_name))
                } else {
                    (MAIN.to_string(), "Main".to_string())
                };
                let note = Note {
                    name,
                    shared: true,
                    data,
                    from: None,
                };
                let Ok(note_file) = note_path(root, kind, &id) else {
                    continue;
                };
                if write_note(&note_file, &note).is_err() {
                    continue;
                }
                if id != MAIN {
                    config.insert("noteId".to_string(), serde_json::json!(id));
                }
                moved += 1;
            }
            for field in CONTENT_FIELDS {
                config.remove(*field);
            }
            changed = true;
        }
        if changed && write_json_atomic(&path, &preset) {
            log::info!("Moved memo/task content out of {}", path.display());
        }
    }
    moved
}

fn referenced_ids(presets: &Path) -> Option<BTreeSet<(String, String)>> {
    let mut ids = BTreeSet::new();
    let mut readable = false;
    for path in preset_files(presets) {
        let Some(preset) = std::fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        else {
            continue;
        };
        readable = true;
        for icon in preset["icons"].as_array().into_iter().flatten() {
            let Some(kind) = kind_of(icon["widget_type"].as_str()) else {
                continue;
            };
            if let Some(id) = icon["widget_config"]["noteId"].as_str() {
                ids.insert((kind.to_string(), id.to_string()));
            }
        }
    }
    readable.then_some(ids)
}

/// Deletes private notes no preset refers to. Skipped when no preset can be
/// read, so a broken config never wipes notes.
fn prune_in(root: &Path, presets: &Path) -> usize {
    let Some(keep) = referenced_ids(presets) else {
        return 0;
    };
    let mut removed = 0;
    for kind in KINDS {
        for entry in std::fs::read_dir(root.join(kind))
            .into_iter()
            .flatten()
            .flatten()
        {
            let path = entry.path();
            let Some(id) = path
                .file_name()
                .and_then(|n| n.to_str())
                .and_then(|n| n.strip_suffix(".json"))
            else {
                continue;
            };
            let Some(note) = read_note(&path) else {
                continue;
            };
            if !note.shared
                && !keep.contains(&(kind.to_string(), id.to_string()))
                && std::fs::remove_file(&path).is_ok()
            {
                removed += 1;
            }
        }
    }
    removed
}

static READY: std::sync::Once = std::sync::Once::new();

/// Moves old content out of presets and drops private notes whose widgets
/// are gone, once per run. Called at startup and before anything reads
/// presets or notes, so the webview can never see the state before it.
pub fn ensure_ready() {
    READY.call_once(|| {
        let root = notes_root();
        let presets = get_presets_dir();
        let active = super::canvas::active_preset_name();
        let moved = migrate_in(&root, &presets, active.as_deref());
        let pruned = prune_in(&root, &presets);
        if moved + pruned > 0 {
            log::info!("Notes: moved {moved} out of presets, pruned {pruned}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("odeko-notes-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn icon(id: &str, widget_type: &str, config: serde_json::Value) -> AppIcon {
        serde_json::from_value(serde_json::json!({
            "id": id, "name": "", "path": "", "icon_path": null, "icon_type": "widget",
            "widget_type": widget_type, "widget_config": config, "url": null,
            "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0
        }))
        .unwrap()
    }

    fn save(root: &Path, kind: &str, id: &str, shared: bool, data: serde_json::Value) {
        let note = Note {
            name: id.to_string(),
            shared,
            data,
            from: None,
        };
        write_note(&note_path(root, kind, id).unwrap(), &note).unwrap();
    }

    #[test]
    fn rejects_bad_ids_and_kinds() {
        let root = temp("ids");
        assert!(note_path(&root, "memo", "../x").is_err());
        assert!(note_path(&root, "memo", "").is_err());
        assert!(note_path(&root, "clipboard", "a").is_err());
        assert!(note_path(&root, "tasks", "n-1_a").is_ok());
    }

    #[test]
    fn lists_shared_notes_with_main_first() {
        let root = temp("list");
        save(&root, "memo", "b", true, serde_json::json!({}));
        save(&root, "memo", "p", false, serde_json::json!({}));
        let ids: Vec<String> = list_in(&root, "memo").into_iter().map(|n| n.id).collect();
        assert_eq!(ids, vec!["main", "b"]);
    }

    #[cfg(unix)]
    #[test]
    fn notes_are_private_files() {
        use std::os::unix::fs::PermissionsExt;
        let root = temp("perm");
        save(&root, "memo", "a", true, serde_json::json!({}));
        let mode = std::fs::metadata(note_path(&root, "memo", "a").unwrap())
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600);
    }

    #[test]
    fn strips_content_and_references() {
        let mut icons = vec![
            icon(
                "m",
                "memo",
                serde_json::json!({ "content": "secret", "wordWrap": true, "noteId": "x" }),
            ),
            icon(
                "t",
                "tasklist",
                serde_json::json!({ "groups": [], "tasks": [], "autoDisappearHours": 3 }),
            ),
            icon("b", "textbox", serde_json::json!({ "content": "kept" })),
        ];
        strip_content(&mut icons);
        assert_eq!(
            icons[0].widget_config,
            Some(serde_json::json!({ "wordWrap": true, "noteId": "x" }))
        );
        assert_eq!(
            icons[1].widget_config,
            Some(serde_json::json!({ "autoDisappearHours": 3 }))
        );
        assert_eq!(
            icons[2].widget_config,
            Some(serde_json::json!({ "content": "kept" }))
        );
        strip_for_sharing(&mut icons);
        assert_eq!(
            icons[0].widget_config,
            Some(serde_json::json!({ "wordWrap": true }))
        );
    }

    #[test]
    fn forks_only_private_notes() {
        let root = temp("fork");
        save(
            &root,
            "memo",
            "private1",
            false,
            serde_json::json!({ "tabs": [] }),
        );
        save(&root, "memo", "shared1", true, serde_json::json!({}));
        let mut icons = vec![
            icon("a", "memo", serde_json::json!({ "noteId": "private1" })),
            icon("b", "memo", serde_json::json!({ "noteId": "shared1" })),
        ];
        fork_in(&root, &mut icons);
        let forked = note_id_of(&icons[0]).unwrap();
        assert_ne!(forked, "private1");
        assert!(note_path(&root, "memo", &forked).unwrap().exists());
        assert_eq!(note_id_of(&icons[1]).unwrap(), "shared1");
    }

    #[test]
    fn migrates_content_out_of_presets() {
        let root = temp("migrate");
        let presets = root.join("presets");
        std::fs::create_dir_all(&presets).unwrap();
        std::fs::write(
            presets.join("Work.json"),
            r##"{ "icons": [
                { "id": "m1", "widget_type": "memo", "widget_config": { "content": "work memo", "wordWrap": false } },
                { "id": "t1", "widget_type": "tasklist", "widget_config": { "groups": [{ "id": "g", "name": "daily", "color": "#fff", "tasks": [{ "text": "a" }] }] } }
            ], "settings": {} }"##,
        )
        .unwrap();
        std::fs::write(
            presets.join("Home.json"),
            r#"{ "icons": [
                { "id": "m2", "widget_type": "memo", "widget_config": { "content": "home memo" } },
                { "id": "m3", "widget_type": "memo", "widget_config": { "content": "" } }
            ], "settings": {} }"#,
        )
        .unwrap();

        assert_eq!(migrate_in(&root, &presets, Some("Work")), 3);

        let main = read_note(&note_path(&root, "memo", MAIN).unwrap()).unwrap();
        assert!(main.shared);
        assert_eq!(main.data["tabs"][0]["content"], "work memo");
        let tasks = read_note(&note_path(&root, "tasks", MAIN).unwrap()).unwrap();
        assert_eq!(tasks.data["groups"][0]["name"], "daily");

        let work = std::fs::read_to_string(presets.join("Work.json")).unwrap();
        assert!(!work.contains("work memo") && !work.contains("daily"));
        assert!(work.contains("wordWrap"));

        let home: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(presets.join("Home.json")).unwrap())
                .unwrap();
        let id = home["icons"][0]["widget_config"]["noteId"]
            .as_str()
            .unwrap();
        let note = read_note(&note_path(&root, "memo", id).unwrap()).unwrap();
        assert_eq!(note.name, "Home");
        assert_eq!(note.data["tabs"][0]["content"], "home memo");
        assert_eq!(home["icons"][1]["widget_config"], serde_json::json!({}));

        assert_eq!(migrate_in(&root, &presets, Some("Work")), 0);
    }

    #[test]
    fn prunes_unreferenced_private_notes() {
        let root = temp("prune");
        let presets = root.join("presets");
        std::fs::create_dir_all(&presets).unwrap();
        save(&root, "memo", "used", false, serde_json::json!({}));
        save(&root, "memo", "orphan", false, serde_json::json!({}));
        save(&root, "tasks", "shared", true, serde_json::json!({}));

        assert_eq!(prune_in(&root, &presets), 0);
        assert!(note_path(&root, "memo", "orphan").unwrap().exists());

        std::fs::write(
            presets.join("a.json"),
            r#"{ "icons": [{ "id": "m", "widget_type": "memo", "widget_config": { "noteId": "used" } }], "settings": {} }"#,
        )
        .unwrap();
        assert_eq!(prune_in(&root, &presets), 1);
        assert!(note_path(&root, "memo", "used").unwrap().exists());
        assert!(!note_path(&root, "memo", "orphan").unwrap().exists());
        assert!(note_path(&root, "tasks", "shared").unwrap().exists());
    }
}
