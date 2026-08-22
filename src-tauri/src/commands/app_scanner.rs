use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
#[cfg(any(target_os = "linux", target_os = "windows"))]
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemApp {
    pub id: String,
    pub name: String,
    pub exec: String,
    pub args: Option<String>,
    pub icon: Option<String>,
    pub icon_path: Option<String>,
    pub desktop_file: String,
    pub categories: Vec<String>,
    pub comment: Option<String>,
}

// ============================================================================
// Platform-specific implementations
// ============================================================================

#[cfg(target_os = "linux")]
mod platform {
    use super::*;

    /// Get all directories that may contain .desktop files on Linux
    pub fn get_application_dirs() -> Vec<PathBuf> {
        let mut dirs = vec![];

        // System-wide applications
        dirs.push(PathBuf::from("/usr/share/applications"));
        dirs.push(PathBuf::from("/usr/local/share/applications"));

        // Flatpak applications
        dirs.push(PathBuf::from("/var/lib/flatpak/exports/share/applications"));

        // Snap applications
        dirs.push(PathBuf::from("/var/lib/snapd/desktop/applications"));

        // User-specific applications
        if let Some(home) = dirs::home_dir() {
            dirs.push(home.join(".local/share/applications"));
            // Flatpak user applications
            dirs.push(home.join(".local/share/flatpak/exports/share/applications"));
        }

        dirs
    }

    /// Parse a single .desktop file and extract app information
    pub fn parse_app(path: &Path) -> Option<SystemApp> {
        let content = std::fs::read_to_string(path).ok()?;

        // Check if it has a [Desktop Entry] section
        if !content.contains("[Desktop Entry]") {
            return None;
        }

        // Parse key-value pairs — only extract from [Desktop Entry] section
        let mut name = None;
        let mut exec_raw = None;
        let mut icon = None;
        let mut categories = vec![];
        let mut comment = None;
        let mut no_display = false;
        let mut hidden = false;
        let mut type_ = String::from("Application");
        let mut in_desktop_entry = false;

        for line in content.lines() {
            let line = line.trim();

            // Skip comments and empty lines
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            // Track which section we're in
            if line.starts_with('[') && line.ends_with(']') {
                in_desktop_entry = line == "[Desktop Entry]";
                continue;
            }

            // Only parse from [Desktop Entry] section
            if !in_desktop_entry {
                continue;
            }

            // Parse key=value pairs
            if let Some(equal_pos) = line.find('=') {
                let key = &line[..equal_pos];
                let value = &line[equal_pos + 1..];

                match key {
                    "Name" => name = Some(value.to_string()),
                    "Exec" => exec_raw = Some(clean_exec_command(value)),
                    "Icon" => icon = Some(value.to_string()),
                    "Categories" => {
                        categories = value
                            .split(';')
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_string())
                            .collect();
                    }
                    "Comment" => comment = Some(value.to_string()),
                    "NoDisplay" => no_display = value == "true",
                    "Hidden" => hidden = value == "true",
                    "Type" => type_ = value.to_string(),
                    _ => {}
                }
            }
        }

        // Skip invalid entries
        if no_display || hidden || type_ != "Application" {
            return None;
        }

        let name = name?;
        let exec_raw = exec_raw?;

        // Split the cleaned exec command into program and arguments
        let parts = shlex::split(&exec_raw)?;
        let program = parts.first()?.clone();
        let exec_args = if parts.len() > 1 {
            Some(parts[1..].join(" "))
        } else {
            None
        };

        // Generate ID from filename
        let id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        // Try to resolve the icon path
        let icon_path = icon
            .as_ref()
            .and_then(|icon_name| resolve_linux_icon(icon_name));

        Some(SystemApp {
            id,
            name,
            exec: program,
            args: exec_args,
            icon,
            icon_path,
            desktop_file: path.to_string_lossy().to_string(),
            categories,
            comment,
        })
    }

    /// Clean up the Exec command by removing field codes (%f, %F, %u, %U, etc.)
    fn clean_exec_command(exec: &str) -> String {
        let field_codes = ["%f", "%F", "%u", "%U", "%i", "%c", "%k"];
        let mut result = exec.to_string();

        for code in &field_codes {
            result = result.replace(code, "");
        }

        let cleaned: Vec<&str> = result.split_whitespace().collect();
        cleaned.join(" ")
    }

    /// Try to resolve an icon name to an actual file path on Linux
    fn resolve_linux_icon(icon_name: &str) -> Option<String> {
        // If it's already a full path, check if it exists
        if icon_name.starts_with('/') || icon_name.starts_with("~/") {
            let path = if icon_name.starts_with("~/") {
                dirs::home_dir()?.join(&icon_name[2..])
            } else {
                PathBuf::from(icon_name)
            };

            if path.exists() {
                return Some(path.to_string_lossy().to_string());
            }
            return None;
        }

        // Try to find the icon in the icon theme
        if let Some(icon_path) = freedesktop_icons::lookup(icon_name)
            .with_theme("hicolor")
            .with_size(48)
            .find()
        {
            return Some(icon_path.to_string_lossy().to_string());
        }

        // Try common icon sizes
        if let Some(icon_path) = freedesktop_icons::lookup(icon_name)
            .with_theme("hicolor")
            .with_size(32)
            .find()
        {
            return Some(icon_path.to_string_lossy().to_string());
        }

        // Try without specifying size
        if let Some(icon_path) = freedesktop_icons::lookup(icon_name)
            .with_theme("hicolor")
            .find()
        {
            return Some(icon_path.to_string_lossy().to_string());
        }

        None
    }

    /// Scan all installed applications on Linux
    pub fn scan_apps() -> Vec<SystemApp> {
        let mut apps = vec![];
        let mut seen_ids = HashSet::new();

        for dir in get_application_dirs() {
            if !dir.exists() {
                continue;
            }

            log::debug!("Scanning directory: {:?}", dir);

            for entry in WalkDir::new(&dir)
                .max_depth(1)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let path = entry.path();

                // Only process .desktop files
                if let Some(ext) = path.extension() {
                    if ext != "desktop" {
                        continue;
                    }
                } else {
                    continue;
                }

                if let Some(app) = parse_app(path) {
                    // Skip duplicates (prefer user apps over system apps)
                    if !seen_ids.contains(&app.id) {
                        seen_ids.insert(app.id.clone());
                        apps.push(app);
                    }
                }
            }
        }

        apps
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn fixture_dir() -> PathBuf {
            std::env::temp_dir().join(format!("odeko-app-scanner-{}", std::process::id()))
        }

        fn write_fixture(name: &str, content: &str) -> PathBuf {
            let dir = fixture_dir();
            std::fs::create_dir_all(&dir).expect("should create fixture dir");
            let path = dir.join(name);
            std::fs::write(&path, content).expect("should write fixture file");
            path
        }

        #[test]
        fn clean_exec_command_strips_field_codes() {
            assert_eq!(clean_exec_command("firefox %u"), "firefox");
            assert_eq!(clean_exec_command("code --reuse-window %F"), "code --reuse-window");
            assert_eq!(clean_exec_command("gedit %f %u"), "gedit");
        }

        #[test]
        fn clean_exec_command_collapses_whitespace() {
            assert_eq!(clean_exec_command("  vim   %F  "), "vim");
        }

        #[test]
        fn parse_app_reads_valid_desktop_file() {
            let path = write_fixture(
                "good.desktop",
                "[Desktop Entry]\n\
                 Type=Application\n\
                 Name=My Editor\n\
                 Exec=myeditor --new-window %F\n\
                 Icon=myeditor\n\
                 Categories=Utility;TextEditor;\n\
                 Comment=Edits files\n",
            );

            let app = parse_app(&path).expect("should parse a valid desktop file");
            let _ = std::fs::remove_file(&path);

            assert_eq!(app.id, "good");
            assert_eq!(app.name, "My Editor");
            assert_eq!(app.exec, "myeditor");
            assert_eq!(app.args, Some("--new-window".to_string()));
            assert_eq!(app.categories, vec!["Utility", "TextEditor"]);
            assert_eq!(app.comment.as_deref(), Some("Edits files"));
        }

        #[test]
        fn parse_app_skips_missing_desktop_entry_section() {
            let path = write_fixture("nosection.desktop", "Name=No Section\nType=Application\n");

            let app = parse_app(&path);
            let _ = std::fs::remove_file(&path);

            assert!(app.is_none());
        }

        #[test]
        fn parse_app_skips_nodisplay_and_hidden_apps() {
            for flag in ["NoDisplay=true", "Hidden=true"] {
                let path = write_fixture("hidden.desktop", &format!("[Desktop Entry]\nType=Application\nName=X\nExec=x\n{flag}\n"));
                let app = parse_app(&path);
                let _ = std::fs::remove_file(&path);
                assert!(app.is_none(), "{flag} should be skipped");
            }
        }

        #[test]
        fn parse_app_skips_non_application_types() {
            let path = write_fixture(
                "link.desktop",
                "[Desktop Entry]\nType=Link\nName=X\nExec=x\n",
            );

            let app = parse_app(&path);
            let _ = std::fs::remove_file(&path);

            assert!(app.is_none());
        }

        #[test]
        fn parse_app_requires_name_and_exec() {
            let no_name = write_fixture(
                "noname.desktop",
                "[Desktop Entry]\nType=Application\nExec=x\n",
            );
            let no_exec = write_fixture(
                "noexec.desktop",
                "[Desktop Entry]\nType=Application\nName=X\n",
            );

            assert!(parse_app(&no_name).is_none());
            assert!(parse_app(&no_exec).is_none());

            let _ = std::fs::remove_file(&no_name);
            let _ = std::fs::remove_file(&no_exec);
        }

        #[test]
        fn parse_app_ignores_keys_outside_desktop_entry() {
            let path = write_fixture(
                "actions.desktop",
                "[Desktop Entry]\n\
                 Type=Application\n\
                 Name=Main\n\
                 Exec=main\n\
                 \n\
                 [Desktop Action New]\n\
                 Name=New Window\n\
                 Exec=main --new\n",
            );

            let app = parse_app(&path).expect("should parse the main entry");

            let _ = std::fs::remove_file(&path);

            assert_eq!(app.name, "Main");
            assert_eq!(app.exec, "main");
            assert_eq!(app.args, None);
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    use std::process::Command;
    use std::time::UNIX_EPOCH;

    /// Get all directories that may contain .app bundles on macOS
    pub fn get_application_dirs() -> Vec<PathBuf> {
        let mut dirs = vec![];

        // System-wide applications
        dirs.push(PathBuf::from("/Applications"));
        dirs.push(PathBuf::from("/System/Applications"));

        // User-specific applications
        if let Some(home) = dirs::home_dir() {
            dirs.push(home.join("Applications"));
        }

        dirs
    }

    /// Parse an .app bundle and extract app information
    pub fn parse_app(path: &Path) -> Option<SystemApp> {
        // Check if it's an .app bundle
        if !path.extension().map_or(false, |ext| ext == "app") {
            return None;
        }

        let plist_path = path.join("Contents/Info.plist");
        if !plist_path.exists() {
            return None;
        }

        // Try to read Info.plist
        let plist_content = std::fs::read_to_string(&plist_path).ok()?;

        // Parse basic plist info (simplified parsing)
        let name = extract_plist_value(&plist_content, "CFBundleName")
            .or_else(|| extract_plist_value(&plist_content, "CFBundleDisplayName"))
            .unwrap_or_else(|| {
                path.file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string()
            });

        // Launch macOS apps through their bundle, not the executable inside Contents/MacOS.
        // Starting the inner binary directly can make system apps fail code-signing checks.
        let exec = path.to_string_lossy().to_string();

        // Try to find icon
        let icon = extract_plist_value(&plist_content, "CFBundleIconFile");
        let icon_path = icon.and_then(|icon_name| {
            let icon_name = if icon_name.ends_with(".icns") {
                icon_name
            } else {
                format!("{}.icns", icon_name)
            };
            let icon_path = path.join("Contents/Resources/").join(&icon_name);
            if icon_path.exists() {
                Some(icon_path.to_string_lossy().to_string())
            } else {
                None
            }
        });

        // Get bundle identifier for ID
        let id = extract_plist_value(&plist_content, "CFBundleIdentifier").unwrap_or_else(|| {
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string()
        });

        Some(SystemApp {
            id,
            name,
            exec,
            args: None,
            icon: None,
            icon_path,
            desktop_file: path.to_string_lossy().to_string(),
            categories: vec!["Application".to_string()],
            comment: None,
        })
    }

    /// Extract a value from plist XML content (simplified)
    fn extract_plist_value(plist: &str, key: &str) -> Option<String> {
        // Look for <key>KEY</key> followed by <string>VALUE</string>
        let key_pattern = format!("<key>{}</key>", key);
        if let Some(key_pos) = plist.find(&key_pattern) {
            let after_key = &plist[key_pos + key_pattern.len()..];
            // Skip whitespace and find the next tag
            let trimmed = after_key.trim_start();
            if let Some(string_start) = trimmed.find("<string>") {
                let after_string_tag = &trimmed[string_start + 8..];
                if let Some(string_end) = after_string_tag.find("</string>") {
                    return Some(after_string_tag[..string_end].to_string());
                }
            }
        }
        None
    }

    /// Scan all installed applications on macOS
    pub fn scan_apps() -> Vec<SystemApp> {
        let mut apps = vec![];
        let mut seen_ids = HashSet::new();

        for dir in get_application_dirs() {
            if !dir.exists() {
                continue;
            }

            log::debug!("Scanning directory: {:?}", dir);

            // Read directory entries
            if let Ok(entries) = std::fs::read_dir(&dir) {
                for entry in entries.flatten() {
                    let path = entry.path();

                    // Check if it's an .app bundle
                    if path.extension().map_or(false, |ext| ext == "app") {
                        if let Some(app) = parse_app(&path) {
                            // Skip duplicates
                            if !seen_ids.contains(&app.id) {
                                seen_ids.insert(app.id.clone());
                                apps.push(app);
                            }
                        }
                    }
                }
            }
        }

        apps
    }

    pub fn convert_icns_to_png(icon_path: &Path) -> Option<String> {
        if !icon_path.exists() || !is_icns(icon_path) {
            return None;
        }

        let output_path = cached_png_path(icon_path)?;
        if output_path.exists() {
            return Some(output_path.to_string_lossy().to_string());
        }

        let output = Command::new("sips")
            .arg("-s")
            .arg("format")
            .arg("png")
            .arg(icon_path)
            .arg("--out")
            .arg(&output_path)
            .output()
            .ok()?;

        if output.status.success() && output_path.exists() {
            Some(output_path.to_string_lossy().to_string())
        } else {
            log::warn!(
                "Failed to convert macOS icon {:?}: {}",
                icon_path,
                String::from_utf8_lossy(&output.stderr)
            );
            None
        }
    }

    fn is_icns(path: &Path) -> bool {
        path.extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("icns"))
    }

    fn cached_png_path(icon_path: &Path) -> Option<PathBuf> {
        let cache_dir = dirs::cache_dir()?
            .join("odeko")
            .join("app-icons");
        std::fs::create_dir_all(&cache_dir).ok()?;

        let mut hasher = DefaultHasher::new();
        icon_path.to_string_lossy().hash(&mut hasher);

        if let Ok(modified) = std::fs::metadata(icon_path).and_then(|metadata| metadata.modified())
        {
            if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
                duration.as_secs().hash(&mut hasher);
            }
        }

        Some(cache_dir.join(format!("{:x}.png", hasher.finish())))
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::*;

    pub fn get_application_dirs() -> Vec<PathBuf> {
        let mut dirs = vec![];

        if let Some(app_data) = dirs::data_dir() {
            dirs.push(app_data.join("Microsoft").join("Windows").join("Start Menu").join("Programs"));
        }

        let program_data =
            std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string());
        dirs.push(PathBuf::from(program_data).join("Microsoft").join("Windows").join("Start Menu").join("Programs"));

        dirs
    }

    // ── Icon extraction ──────────────────────────────────────────────

    fn hash_path(path: &Path) -> u64 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        path.hash(&mut hasher);
        hasher.finish()
    }

    /// Parse the icon location from a .lnk file's binary data.
    /// Returns (icon_path, icon_index) — e.g., ("C:\\Windows\\System32\\shell32.dll", 13).
    /// This reads the .lnk directly without any shell API, so it's fast and
    /// avoids MSI validation on advertised shortcuts.
    fn read_lnk_icon_location(lnk_path: &Path) -> Option<(PathBuf, i32)> {
        let data = std::fs::read(lnk_path).ok()?;
        if data.len() < 76 {
            return None;
        }
        if data[0] != 0x4C {
            return None;
        }

        let link_flags =
            u32::from_le_bytes([data[20], data[21], data[22], data[23]]);

        if link_flags & (1 << 6) == 0 {
            return None;
        }

        let mut offset = 76;

        // Skip LinkTargetIDList (bit 0)
        if link_flags & 1 != 0 {
            if offset + 2 > data.len() {
                return None;
            }
            let idlist_size =
                u16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
            offset += 2 + idlist_size;
        }

        // Skip LinkInfo (bit 1)
        if link_flags & (1 << 1) != 0 {
            if offset + 4 > data.len() {
                return None;
            }
            let linkinfo_size = u32::from_le_bytes([
                data[offset],
                data[offset + 1],
                data[offset + 2],
                data[offset + 3],
            ]) as usize;
            offset += linkinfo_size;
        }

        // String data sections appear in flag order: NAME, RELATIVE_PATH,
        // WORKING_DIR, ARGUMENTS, ICON_LOCATION (bits 2-6).
        let string_flag_order: [(u32, &str); 5] = [
            (1 << 2, "NAME"),
            (1 << 3, "RELATIVE_PATH"),
            (1 << 4, "WORKING_DIR"),
            (1 << 5, "ARGUMENTS"),
            (1 << 6, "ICON_LOCATION"),
        ];

        for &(flag, _name) in &string_flag_order {
            if link_flags & flag == 0 {
                continue;
            }

            if offset + 2 > data.len() {
                return None;
            }
            let char_count =
                u16::from_le_bytes([data[offset], data[offset + 1]]) as usize;
            offset += 2;
            let byte_len = char_count * 2;

            if offset + byte_len > data.len() {
                return None;
            }

            if flag == (1 << 6) {
                let raw = &data[offset..offset + byte_len];
                let chars: Vec<u16> = raw
                    .chunks_exact(2)
                    .map(|c| u16::from_le_bytes([c[0], c[1]]))
                    .collect();
                let icon_loc = String::from_utf16_lossy(&chars);
                return parse_icon_location(&icon_loc);
            }

            offset += byte_len;
        }

        None
    }

    /// Parse "C:\\path\\to\\file.dll,3" or just "C:\\path\\file.exe".
    fn parse_icon_location(raw: &str) -> Option<(PathBuf, i32)> {
        if let Some((path_part, idx_part)) = raw.rsplit_once(',') {
            let path = PathBuf::from(path_part.trim());
            let idx: i32 = idx_part.trim().parse().unwrap_or(0);
            Some((path, idx))
        } else if !raw.is_empty() {
            Some((PathBuf::from(raw.trim()), 0))
        } else {
            None
        }
    }

    fn extract_icon_to_png(lnk_path: &Path) -> Option<String> {
        let cache_dir = dirs::cache_dir()?.join("floating-launcher").join("app-icons");
        let id = format!("{:016x}", hash_path(lnk_path));
        let png_path = cache_dir.join(format!("{id}.png"));

        if png_path.exists() {
            return Some(png_path.to_string_lossy().to_string());
        }

        // Step 1: Read the icon location from the .lnk binary (fast, no MSI).
        let (icon_file, icon_index) = read_lnk_icon_location(lnk_path).or_else(|| {
            // Fallback: if the .lnk has no icon info, use the .lnk itself
            Some((lnk_path.to_path_buf(), 0))
        })?;

        // Step 2: Extract the icon from the actual file using ExtractIconExW.
        let hicon = extract_icon_from_file(&icon_file, icon_index)?;

        // Step 3: Render to RGBA pixels and save as PNG.
        let Some((w, h, pixels)) = hicon_to_rgba(hicon) else {
            unsafe {
                use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;
                let _ = DestroyIcon(hicon);
            }
            log::debug!("hicon_to_rgba failed for {:?}", lnk_path);
            return None;
        };

        unsafe {
            use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;
            let _ = DestroyIcon(hicon);
        }

        let img = image::RgbaImage::from_raw(w, h, pixels)?;
        let mut png_bytes = Vec::new();
        {
            let mut cursor = std::io::Cursor::new(&mut png_bytes);
            img.write_to(&mut cursor, image::ImageFormat::Png).ok()?;
        }

        std::fs::create_dir_all(&cache_dir).ok()?;
        std::fs::write(&png_path, &png_bytes).ok()?;

        Some(png_path.to_string_lossy().to_string())
    }

    fn extract_icon_from_file(
        file_path: &Path,
        index: i32,
    ) -> Option<windows::Win32::UI::WindowsAndMessaging::HICON> {
        use windows::Win32::UI::Shell::ExtractIconExW;
        use windows::Win32::UI::WindowsAndMessaging::HICON;

        let path_str = file_path.to_string_lossy();
        let wide: Vec<u16> = path_str.encode_utf16().chain(std::iter::once(0)).collect();

        let mut hicon_large: HICON = HICON(0);
        let result = unsafe {
            ExtractIconExW(
                windows::core::PCWSTR::from_raw(wide.as_ptr()),
                index,
                Some(&mut hicon_large),
                None,
                1,
            )
        };

        if result == u32::MAX || result == 0 || hicon_large.0 == 0 {
            log::debug!(
                "ExtractIconExW failed for {:?} index {}: result={}",
                file_path,
                index,
                result
            );
            None
        } else {
            Some(hicon_large)
        }
    }

    fn hicon_to_rgba(
        hicon: windows::Win32::UI::WindowsAndMessaging::HICON,
    ) -> Option<(u32, u32, Vec<u8>)> {
        unsafe {
            use windows::Win32::UI::WindowsAndMessaging::{
                DrawIconEx, GetIconInfo, DI_NORMAL, ICONINFO,
            };
            use windows::Win32::Graphics::Gdi::{
                CreateCompatibleDC, CreateDIBSection, SelectObject,
                DeleteDC, DeleteObject, GetDC, ReleaseDC, GetObjectW,
                BITMAP, BITMAPINFO, BITMAPINFOHEADER,
                HGDIOBJ, DIB_RGB_COLORS,
            };

            let mut ii: ICONINFO = std::mem::zeroed();
            GetIconInfo(hicon, &mut ii).ok()?;

            let mut bmp: BITMAP = std::mem::zeroed();
            if GetObjectW(
                HGDIOBJ(ii.hbmColor.0),
                std::mem::size_of::<BITMAP>() as i32,
                Some(&raw mut bmp as *mut BITMAP as *mut std::ffi::c_void),
            ) == 0
            {
                let _ = DeleteObject(HGDIOBJ(ii.hbmColor.0));
                let _ = DeleteObject(HGDIOBJ(ii.hbmMask.0));
                return None;
            }

            let w = bmp.bmWidth as u32;
            let h = bmp.bmHeight as u32;

            let hdc_screen = GetDC(None);
            let hdc = CreateCompatibleDC(hdc_screen);

            let bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: w as i32,
                    biHeight: -(h as i32),
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: 0u32,
                    ..std::mem::zeroed()
                },
                ..std::mem::zeroed()
            };

            let mut pixels: *mut u32 = std::ptr::null_mut();
            let hbmp = CreateDIBSection(
                hdc,
                &raw const bmi,
                DIB_RGB_COLORS,
                &mut pixels as *mut *mut u32 as *mut *mut std::ffi::c_void,
                None,
                0,
            )
            .ok()?;

            if hbmp.0 == 0 || pixels.is_null() {
                let _ = DeleteObject(HGDIOBJ(hbmp.0));
                let _ = DeleteDC(hdc);
                let _ = ReleaseDC(None, hdc_screen);
                let _ = DeleteObject(HGDIOBJ(ii.hbmColor.0));
                let _ = DeleteObject(HGDIOBJ(ii.hbmMask.0));
                return None;
            }

            let old_bmp = SelectObject(hdc, HGDIOBJ(hbmp.0));

            let _ = DrawIconEx(hdc, 0, 0, hicon, w as i32, h as i32, 0, None, DI_NORMAL);

            let pixel_count = (w * h) as usize;
            let mut rgba = vec![0u8; pixel_count * 4];

            for i in 0..pixel_count {
                let pixel = *pixels.add(i);
                rgba[i * 4] = ((pixel >> 16) & 0xFF) as u8;
                rgba[i * 4 + 1] = ((pixel >> 8) & 0xFF) as u8;
                rgba[i * 4 + 2] = (pixel & 0xFF) as u8;
                rgba[i * 4 + 3] = ((pixel >> 24) & 0xFF) as u8;
            }

            let _ = SelectObject(hdc, old_bmp);
            let _ = DeleteObject(HGDIOBJ(hbmp.0));
            let _ = DeleteDC(hdc);
            let _ = ReleaseDC(None, hdc_screen);
            let _ = DeleteObject(HGDIOBJ(ii.hbmColor.0));
            let _ = DeleteObject(HGDIOBJ(ii.hbmMask.0));

            Some((w, h, rgba))
        }
    }

    /// Scan all installed applications on Windows by walking Start Menu .lnk files.
    /// Windows `start` command can launch .lnk files directly — no target resolution needed.
    pub fn scan_apps() -> Vec<SystemApp> {
        let start = std::time::Instant::now();
        let mut apps = vec![];
        let mut seen_ids = HashSet::new();
        let mut skipped_uninstall = 0usize;

        for dir in get_application_dirs() {
            if !dir.exists() {
                continue;
            }

            log::debug!("Scanning directory: {:?}", dir);

            for entry in WalkDir::new(&dir)
                .max_depth(3)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let path = entry.path();

                if path.extension().map_or(true, |ext| ext != "lnk") {
                    continue;
                }

                let name_lower = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if name_lower.contains("uninstall")
                    || name_lower.contains("update")
                    || name_lower.contains("setup")
                {
                    skipped_uninstall += 1;
                    continue;
                }

                let name = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string();

                let id = name_lower.replace(' ', "-");

                if seen_ids.contains(&id) {
                    continue;
                }
                seen_ids.insert(id.clone());

                apps.push(SystemApp {
                    id,
                    name,
                    exec: path.to_string_lossy().to_string(),
                    args: None,
                    icon: None,
                    icon_path: extract_icon_to_png(path),
                    desktop_file: path.to_string_lossy().to_string(),
                    categories: vec!["Application".to_string()],
                    comment: None,
                });
            }
        }

        let total = start.elapsed();
        log::info!(
            "Scan complete in {:?}: {} apps ({} skipped uninstall/update/setup)",
            total,
            apps.len(),
            skipped_uninstall
        );

        apps
    }

    /// Parse a single .lnk file (used by get_system_app for one-off resolution).
    pub fn parse_app(path: &Path) -> Option<SystemApp> {
        if !path.extension().map_or(false, |ext| ext == "lnk") {
            return None;
        }

        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();

        let id = name.to_lowercase().replace(" ", "-");

        Some(SystemApp {
            id,
            name,
            exec: path.to_string_lossy().to_string(),
            args: None,
            icon: None,
            icon_path: None,
            desktop_file: path.to_string_lossy().to_string(),
            categories: vec!["Application".to_string()],
            comment: None,
        })
    }
}

// ============================================================================
// Cross-platform interface
// ============================================================================

/// Scan all installed applications (cross-platform)
#[tauri::command]
pub fn scan_installed_apps() -> Result<Vec<SystemApp>, String> {
    log::info!("Scanning installed applications...");

    let mut apps = platform::scan_apps();

    // Sort by name
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    log::info!("Found {} applications", apps.len());
    Ok(apps)
}

/// Get a specific system app by path (cross-platform)
#[tauri::command]
pub fn get_system_app(app_path: String) -> Result<Option<SystemApp>, String> {
    let path = PathBuf::from(app_path);
    Ok(platform::parse_app(&path))
}

/// Convert a macOS .icns file to a PNG the WebView can display.
#[tauri::command]
pub fn convert_icns_to_png(icon_path: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(platform::convert_icns_to_png(Path::new(&icon_path)))
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = icon_path;
        Ok(None)
    }
}
