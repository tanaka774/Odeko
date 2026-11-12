//! Fonts for the font picker: installed system families, plus font files the
//! user added, which are copied into the config dir so every preset can use them.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::canvas::get_config_dir;

const FONT_EXTENSIONS: [&str; 3] = ["ttf", "otf", "ttc"];

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct UserFont {
    pub family: String,
    pub path: String,
    pub weight: u16,
    pub italic: bool,
}

fn fonts_dir() -> PathBuf {
    get_config_dir().join("fonts")
}

fn family_name(face: &fontdb::FaceInfo) -> Option<String> {
    let (name, _) = face
        .families
        .iter()
        .find(|(_, language)| *language == fontdb::Language::English_UnitedStates)
        .or_else(|| face.families.first())?;
    let name: String = name.chars().filter(|c| !"\"\\;{}<>".contains(*c)).collect();
    let name = name.trim();
    if name.is_empty() || name.starts_with('.') {
        None
    } else {
        Some(name.to_string())
    }
}

fn collect_families(db: &fontdb::Database) -> Vec<String> {
    let mut families = BTreeMap::new();
    for face in db.faces() {
        if let Some(name) = family_name(face) {
            families.entry(name.to_lowercase()).or_insert(name);
        }
    }
    families.into_values().collect()
}

fn face_path(face: &fontdb::FaceInfo) -> Option<String> {
    match &face.source {
        fontdb::Source::File(path) => Some(path.to_string_lossy().into_owned()),
        _ => None,
    }
}

fn collect_user_fonts(db: &fontdb::Database) -> Vec<UserFont> {
    let mut fonts: Vec<UserFont> = db
        .faces()
        .filter_map(|face| {
            Some(UserFont {
                family: family_name(face)?,
                path: face_path(face)?,
                weight: face.weight.0,
                italic: face.style != fontdb::Style::Normal,
            })
        })
        .collect();
    fonts.sort_by(|a, b| {
        (a.family.to_lowercase(), a.weight, a.italic).cmp(&(
            b.family.to_lowercase(),
            b.weight,
            b.italic,
        ))
    });
    fonts.dedup_by(|a, b| a.path == b.path && a.weight == b.weight && a.italic == b.italic);
    fonts
}

fn load_dir(dir: &Path) -> Vec<UserFont> {
    let mut db = fontdb::Database::new();
    db.load_fonts_dir(dir);
    collect_user_fonts(&db)
}

fn has_font_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| FONT_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
}

fn unique_target(dir: &Path, file_name: &str) -> PathBuf {
    let target = dir.join(file_name);
    if !target.exists() {
        return target;
    }
    let path = Path::new(file_name);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("font");
    let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("ttf");
    (2..)
        .map(|n| dir.join(format!("{stem}-{n}.{ext}")))
        .find(|candidate| !candidate.exists())
        .expect("an unused file name")
}

fn import_into(dir: &Path, source: &Path) -> Result<Vec<UserFont>, String> {
    if !has_font_extension(source) {
        return Err("Pick a .ttf, .otf or .ttc font file".into());
    }
    let mut db = fontdb::Database::new();
    db.load_font_file(source)
        .map_err(|e| format!("Cannot read {}: {e}", source.display()))?;
    if db.faces().next().is_none() {
        return Err(format!("{} is not a usable font", source.display()));
    }

    std::fs::create_dir_all(dir).map_err(|e| format!("Cannot create the fonts folder: {e}"))?;
    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("The font file has no name")?;
    let target = unique_target(dir, file_name);
    std::fs::copy(source, &target).map_err(|e| format!("Cannot copy the font: {e}"))?;

    let mut db = fontdb::Database::new();
    db.load_font_file(&target)
        .map_err(|e| format!("Cannot read {}: {e}", target.display()))?;
    Ok(collect_user_fonts(&db))
}

fn remove_from(dir: &Path, path: &Path) -> Result<(), String> {
    let dir = dir
        .canonicalize()
        .map_err(|e| format!("No fonts folder: {e}"))?;
    let path = path
        .canonicalize()
        .map_err(|e| format!("Font not found: {e}"))?;
    if path.parent() != Some(dir.as_path()) {
        return Err("Only fonts added in Odeko can be removed".into());
    }
    std::fs::remove_file(&path).map_err(|e| format!("Cannot remove the font: {e}"))
}

#[tauri::command]
pub async fn list_system_fonts() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        collect_families(&db)
    })
    .await
    .map_err(|e| format!("Cannot list fonts: {e}"))
}

#[tauri::command]
pub fn list_user_fonts() -> Vec<UserFont> {
    load_dir(&fonts_dir())
}

#[tauri::command]
pub fn import_font(path: String) -> Result<Vec<UserFont>, String> {
    import_into(&fonts_dir(), Path::new(&path))
}

#[tauri::command]
pub fn remove_font(path: String) -> Result<(), String> {
    remove_from(&fonts_dir(), Path::new(&path))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn system_font_file() -> Option<PathBuf> {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        let found = db
            .faces()
            .filter_map(|face| face_path(face).map(PathBuf::from))
            .find(|path| {
                path.extension()
                    .and_then(|ext| ext.to_str())
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("ttf"))
            });
        found
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("odeko-fonts-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn empty_database_lists_nothing() {
        assert!(collect_families(&fontdb::Database::new()).is_empty());
    }

    #[test]
    fn lists_installed_families_sorted_and_unique() {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();
        let families = collect_families(&db);
        let mut sorted = families.clone();
        sorted.sort_by_key(|name| name.to_lowercase());
        sorted.dedup_by_key(|name| name.to_lowercase());
        assert_eq!(families, sorted);
    }

    #[test]
    fn rejects_non_font_files() {
        let dir = temp_dir("reject");
        let fake = dir.join("notes.txt");
        std::fs::write(&fake, "hello").unwrap();
        assert!(import_into(&dir.join("fonts"), &fake).is_err());

        let bad = dir.join("broken.ttf");
        std::fs::write(&bad, "not a font").unwrap();
        assert!(import_into(&dir.join("fonts"), &bad).is_err());
        assert!(!dir.join("fonts").join("broken.ttf").exists());
    }

    #[test]
    fn imports_lists_and_removes_a_font() {
        let Some(source) = system_font_file() else {
            return;
        };
        let dir = temp_dir("import");
        let fonts = dir.join("fonts");

        let added = import_into(&fonts, &source).unwrap();
        assert!(!added.is_empty());
        assert!(added
            .iter()
            .all(|font| Path::new(&font.path).starts_with(&fonts)));
        assert_eq!(load_dir(&fonts), added);

        let again = import_into(&fonts, &source).unwrap();
        assert_ne!(again[0].path, added[0].path);

        assert!(remove_from(&fonts, &source).is_err());
        remove_from(&fonts, Path::new(&added[0].path)).unwrap();
        assert!(!Path::new(&added[0].path).exists());
    }
}
