//! Plain text file access for background layers: loading a shader/HTML
//! source from disk, watching it for changes, and exporting layers.

use std::time::UNIX_EPOCH;

use serde::Serialize;

const MAX_TEXT_BYTES: u64 = 8 * 1024 * 1024;

#[derive(Serialize)]
pub struct TextFile {
    pub content: String,
    /// Last modification time in milliseconds since the Unix epoch.
    pub modified: u64,
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<TextFile, String> {
    let metadata = std::fs::metadata(&path).map_err(|e| format!("Cannot read {path}: {e}"))?;
    if metadata.len() > MAX_TEXT_BYTES {
        return Err(format!("{path} is larger than {} MB", MAX_TEXT_BYTES / (1024 * 1024)));
    }
    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let content = std::fs::read_to_string(&path).map_err(|e| format!("Cannot read {path}: {e}"))?;
    Ok(TextFile { content, modified })
}

/// Last modification time only, so watching a file does not re-read it.
#[tauri::command]
pub fn text_file_modified(path: String) -> Result<u64, String> {
    std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .map_err(|e| format!("Cannot read {path}: {e}"))
        .map(|t| {
            t.duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0)
        })
}

#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Cannot write {path}: {e}"))
}
