use serde::{Deserialize, Serialize};
use std::process::Command;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum IconType {
    App,
    Image,
    Link,
    Widget,
}

impl Default for IconType {
    fn default() -> Self {
        IconType::App
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppIcon {
    pub id: String,
    pub name: String,
    pub path: String,
    pub icon_path: Option<String>,
    pub icon_type: IconType,
    pub widget_type: Option<String>,
    pub widget_config: Option<serde_json::Value>,
    pub url: Option<String>,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    #[serde(default)]
    pub show_name: Option<bool>,
    #[serde(default)]
    pub custom_name: Option<String>,
    #[serde(default)]
    pub args: Option<String>,
    #[serde(default)]
    pub keybind: Option<KeybindConfig>,
    #[serde(default)]
    pub keybind_global: Option<bool>,
    #[serde(default)]
    pub z: Option<u32>,
    // Per-icon background override. When both are None the icon follows the
    // launcher-wide icon_background_color / icon_background_opacity settings.
    #[serde(default)]
    pub background_color: Option<String>,
    #[serde(default)]
    pub background_opacity: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub struct KeybindConfig {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub ctrl: bool,
    #[serde(default)]
    pub alt: bool,
    #[serde(default)]
    pub shift: bool,
    #[serde(default)]
    pub meta: bool,
}

impl Default for KeybindConfig {
    fn default() -> Self {
        Self {
            key: String::new(),
            ctrl: false,
            alt: false,
            shift: false,
            meta: false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LauncherSettings {
    #[serde(default)]
    pub width_percent: f32,
    #[serde(default)]
    pub height_percent: f32,
    #[serde(default)]
    pub background_color: String,
    #[serde(default)]
    pub background_opacity: f32,
    #[serde(default)]
    pub background_image: Option<String>,
    #[serde(default)]
    pub background_size: String,
    #[serde(default)]
    pub background_repeat: bool,
    #[serde(default)]
    pub background_position: String,
    // TODO: Replace CSS backdrop-filter with OS-level window blur.
    // CSS backdrop-filter cannot blur content behind the Tauri window.
    #[serde(default)]
    pub border_radius: f32,
    #[serde(default)]
    pub position_x: f32,
    #[serde(default)]
    pub position_y: f32,
    #[serde(default)]
    pub backdrop_darkness: f32,
    /// Native backdrop blur behind the window (default on). Applied by
    /// `window_effects`; toggled from the frontend via `set_backdrop_blur`.
    #[serde(default = "default_true")]
    pub backdrop_blur: bool,
    /// Blur strength: `"full"` blurs the whole screen, `"light"` blurs only
    /// the launcher panel area.
    #[serde(default = "default_full_strength")]
    pub blur_strength: String,
    #[serde(default)]
    pub magnetic_snap: bool,
    #[serde(default)]
    pub grid_size: f32,
    /// Grid line color in "R, G, B" format (edit mode only).
    #[serde(default = "default_grid_line_color")]
    pub grid_line_color: String,
    #[serde(default)]
    pub icon_background_color: String,
    #[serde(default)]
    pub icon_background_opacity: f32,
    #[serde(default)]
    pub keybind_toggle_launcher: KeybindConfig,
    #[serde(default)]
    pub keybind_toggle_edit: KeybindConfig,
    #[serde(default)]
    pub keybind_hide_launcher: KeybindConfig,
    #[serde(default)]
    pub keybind_undo: KeybindConfig,
    /// App-wide allowed hostnames for Custom HTML widgets (see widget_fetch).
    #[serde(default)]
    pub network_grants: Vec<String>,
    /// Allow Custom HTML widgets to fetch from private/LAN addresses.
    #[serde(default)]
    pub allow_local_network: bool,
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            width_percent: 90.0,
            height_percent: 85.0,
            background_color: "20, 20, 30".to_string(),
            background_opacity: 0.75,
            background_image: None,
            background_size: "cover".to_string(),
            background_repeat: false,
            background_position: "center".to_string(),
            border_radius: 24.0,
            position_x: 50.0,
            position_y: 50.0,
            backdrop_darkness: 0.3,
            backdrop_blur: true,
            blur_strength: "full".to_string(),
            magnetic_snap: true,
            grid_size: 40.0,
            grid_line_color: "255, 255, 255".to_string(),
            icon_background_color: "255, 255, 255".to_string(),
            icon_background_opacity: 0.2,
            keybind_toggle_launcher: KeybindConfig {
                key: "KeyZ".to_string(),
                ctrl: false,
                alt: true,
                shift: false,
                meta: true,
            },
            keybind_toggle_edit: KeybindConfig {
                key: "F2".to_string(),
                ctrl: false,
                alt: false,
                shift: false,
                meta: false,
            },
            keybind_hide_launcher: KeybindConfig {
                key: "Escape".to_string(),
                ctrl: false,
                alt: false,
                shift: false,
                meta: false,
            },
            keybind_undo: KeybindConfig {
                key: "KeyZ".to_string(),
                ctrl: true,
                alt: false,
                shift: false,
                meta: false,
            },
            network_grants: Vec::new(),
            allow_local_network: false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LauncherLayout {
    pub icons: Vec<AppIcon>,
    pub settings: LauncherSettings,
    #[serde(default)]
    pub active_preset: Option<String>,
}

impl Default for LauncherLayout {
    fn default() -> Self {
        Self {
            icons: vec![
                AppIcon {
                    id: "terminal".to_string(),
                    name: "Terminal".to_string(),
                    path: get_default_terminal(),
                    icon_path: None,
                    icon_type: IconType::App,
                    widget_type: None,
                    widget_config: None,
                    url: None,
                    x: 100.0,
                    y: 100.0,
                    width: 80.0,
                    height: 80.0,
                    show_name: None,
                    custom_name: None,
                    args: None,
                    keybind: None,
                    keybind_global: None,
                    z: None,
                    background_color: None,
                    background_opacity: None,
                },
                AppIcon {
                    id: "browser".to_string(),
                    name: "Browser".to_string(),
                    path: get_default_browser(),
                    icon_path: None,
                    icon_type: IconType::App,
                    widget_type: None,
                    widget_config: None,
                    url: None,
                    x: 200.0,
                    y: 100.0,
                    width: 80.0,
                    height: 80.0,
                    show_name: None,
                    custom_name: None,
                    args: None,
                    keybind: None,
                    keybind_global: None,
                    z: None,
                    background_color: None,
                    background_opacity: None,
                },
            ],
            settings: LauncherSettings::default(),
            active_preset: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct PresetData {
    icons: Vec<AppIcon>,
    settings: LauncherSettings,
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct AppConfig {
    #[serde(default)]
    active_preset: Option<String>,
}

fn default_true() -> bool {
    true
}

fn default_full_strength() -> String {
    "full".to_string()
}

fn default_grid_line_color() -> String {
    "255, 255, 255".to_string()
}

fn get_default_terminal() -> String {
    if cfg!(target_os = "linux") {
        "alacritty".to_string()
    } else if cfg!(target_os = "macos") {
        "/System/Applications/Utilities/Terminal.app".to_string()
    } else {
        "powershell".to_string()
    }
}

fn get_default_browser() -> String {
    if cfg!(target_os = "linux") {
        "firefox".to_string()
    } else if cfg!(target_os = "macos") {
        "/Applications/Safari.app".to_string()
    } else {
        "https://google.com".to_string()
    }
}

fn expand_tilde(arg: &str) -> String {
    if arg == "~" {
        return dirs::home_dir()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
    }
    if arg.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(&arg[2..]).to_string_lossy().to_string();
        }
    }
    arg.to_string()
}

pub(crate) fn get_config_dir() -> PathBuf {
    // Allow tests (or power users) to redirect where the launcher stores its
    // config. Only used in tests today, but harmless in production.
    if let Ok(override_dir) = std::env::var("ODEKO_CONFIG_DIR") {
        return PathBuf::from(override_dir).join("odeko");
    }

    let config_dir = if cfg!(target_os = "linux") {
        dirs::config_dir().unwrap_or_else(|| PathBuf::from("~/.config"))
    } else if cfg!(target_os = "macos") {
        dirs::config_dir().unwrap_or_else(|| PathBuf::from("~/Library/Application Support"))
    } else {
        dirs::config_dir().unwrap_or_else(|| PathBuf::from("%APPDATA%"))
    };

    config_dir.join("odeko")
}

fn get_presets_dir() -> PathBuf {
    get_config_dir().join("presets")
}

fn get_config_path() -> PathBuf {
    get_config_dir().join("config.json")
}

fn read_config() -> AppConfig {
    let path = get_config_path();
    if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_else(AppConfig::default)
    } else {
        AppConfig::default()
    }
}

fn write_config(config: &AppConfig) -> Result<(), String> {
    let config_dir = get_config_dir();
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    let path = get_config_path();
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

/// Launch an application by path with optional arguments
#[tauri::command]
pub fn launch_app(path: String, args: Option<String>) -> Result<(), String> {
    log::info!("Launching application: {} (args: {:?})", path, args);

    if cfg!(target_os = "macos") {
        return launch_macos_app(&path, args.as_deref());
    }

    let program = expand_tilde(&path);
    let extra_args: Vec<String> = args
        .as_deref()
        .and_then(shlex::split)
        .unwrap_or_default()
        .iter()
        .map(|s| expand_tilde(s))
        .collect();

    let result = if cfg!(target_os = "linux") {
        Command::new(&program).args(&extra_args).spawn()
    } else {
        let mut c = Command::new("cmd");
        c.arg("/C").arg("start").arg("").arg(&program);
        for a in &extra_args {
            c.arg(a);
        }
        c.spawn()
    };

    match result {
        Ok(_) => {
            log::info!("Successfully launched: {} (args: {:?})", program, extra_args);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to launch {}: {}", path, e);
            Err(format!("Failed to launch: {}", e))
        }
    }
}

fn launch_macos_app(path: &str, args: Option<&str>) -> Result<(), String> {
    let expanded_path = expand_tilde(path);

    let extra_args: Vec<String> = args
        .and_then(shlex::split)
        .unwrap_or_default();

    let result = if let Some(bundle_path) = find_macos_app_bundle(&expanded_path) {
        let mut command = Command::new("open");
        command.arg(&bundle_path);

        if !extra_args.is_empty() {
            command.arg("--args").args(&extra_args);
        }

        command.spawn()
    } else {
        Command::new(&expanded_path).args(&extra_args).spawn()
    };

    match result {
        Ok(_) => {
            log::info!("Successfully launched macOS app: {}", path);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to launch {}: {}", path, e);
            Err(format!("Failed to launch: {}", e))
        }
    }
}

fn find_macos_app_bundle(path: &str) -> Option<String> {
    PathBuf::from(path)
        .ancestors()
        .find(|ancestor| {
            ancestor
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("app"))
        })
        .map(|bundle_path| bundle_path.to_string_lossy().to_string())
}

/// Open a URL in the default browser
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    log::info!("Opening URL: {}", url);

    let result = if cfg!(target_os = "macos") {
        Command::new("open").arg(&url).spawn()
    } else if cfg!(target_os = "linux") {
        Command::new("xdg-open").arg(&url).spawn()
    } else {
        Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg("")
            .arg(&url)
            .spawn()
    };

    match result {
        Ok(_) => {
            log::info!("Successfully opened URL: {}", url);
            Ok(())
        }
        Err(e) => {
            log::error!("Failed to open URL {}: {}", url, e);
            Err(format!("Failed to open URL: {}", e))
        }
    }
}

/// Synchronously launch an icon (used by global shortcut handler, runs outside async context).
pub fn launch_icon_sync(icon: &AppIcon) {
    if icon.icon_type == IconType::Link || icon.icon_type == IconType::Image {
        if let Some(ref url) = icon.url {
            let _ = open_url_sync(url);
        }
        return;
    }
    if icon.icon_type != IconType::App {
        return;
    }
    let program = expand_tilde(&icon.path);
    let extra_args: Vec<String> = icon
        .args
        .as_deref()
        .and_then(shlex::split)
        .unwrap_or_default()
        .iter()
        .map(|s| expand_tilde(s))
        .collect();

    if cfg!(target_os = "macos") {
        let result = if let Some(bundle_path) = find_macos_app_bundle(&program) {
            let mut cmd = std::process::Command::new("open");
            cmd.arg(&bundle_path);
            if !extra_args.is_empty() {
                cmd.arg("--args").args(&extra_args);
            }
            cmd.spawn()
        } else {
            std::process::Command::new(&program).args(&extra_args).spawn()
        };
        if let Err(e) = result {
            log::error!("Failed to launch {}: {}", icon.path, e);
        }
    } else if cfg!(target_os = "linux") {
        let _ = std::process::Command::new(&program).args(&extra_args).spawn();
    } else {
        let mut c = std::process::Command::new("cmd");
        c.arg("/C").arg("start").arg("");
        c.arg(&program);
        for a in &extra_args {
            c.arg(a);
        }
        let _ = c.spawn();
    }
}

fn open_url_sync(url: &str) -> Result<(), String> {
    let result = if cfg!(target_os = "macos") {
        std::process::Command::new("open").arg(url).spawn()
    } else if cfg!(target_os = "linux") {
        std::process::Command::new("xdg-open").arg(url).spawn()
    } else {
        std::process::Command::new("cmd")
            .arg("/C")
            .arg("start")
            .arg("")
            .arg(url)
            .spawn()
    };
    match result {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to open URL: {}", e)),
    }
}

/// Load the active layout
/// Reads config.json to find the active preset, then loads that preset file.
/// On first run with no preset, returns defaults.
#[tauri::command]
pub fn load_active_layout() -> Result<LauncherLayout, String> {
    let config = read_config();

    match &config.active_preset {
        Some(name) => {
            let preset_path = get_presets_dir().join(format!("{}.json", name));
            if !preset_path.exists() {
                log::info!("Active preset '{}' not found, using defaults", name);
                return Ok(LauncherLayout::default());
            }
            let content = std::fs::read_to_string(&preset_path)
                .map_err(|e| format!("Failed to read preset '{}': {}", name, e))?;
            let data: PresetData = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse preset '{}': {}", name, e))?;
            log::info!("Loaded active preset: {}", name);
            Ok(LauncherLayout {
                icons: data.icons,
                settings: data.settings,
                active_preset: Some(name.clone()),
            })
        }
        None => {
            log::info!("No active preset set, using defaults");
            Ok(LauncherLayout::default())
        }
    }
}

/// Save the current layout to the active preset file.
/// If no active preset is set, auto-creates "Default".
/// Returns the preset name that was saved to.
#[tauri::command]
pub fn save_active_layout(
    icons: Vec<AppIcon>,
    settings: LauncherSettings,
) -> Result<String, String> {
    let mut config = read_config();
    let preset_name = match &config.active_preset {
        Some(name) if !name.is_empty() => name.clone(),
        _ => {
            let name = "Default".to_string();
            config.active_preset = Some(name.clone());
            write_config(&config)?;
            name
        }
    };

    let presets_dir = get_presets_dir();
    std::fs::create_dir_all(&presets_dir)
        .map_err(|e| format!("Failed to create presets directory: {}", e))?;

    let preset_path = presets_dir.join(format!("{}.json", preset_name));
    let data = PresetData { icons, settings };
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize preset: {}", e))?;
    std::fs::write(&preset_path, json)
        .map_err(|e| format!("Failed to write preset: {}", e))?;

    log::info!("Saved active preset: {}", preset_name);
    Ok(preset_name)
}

/// Save only the settings of the active preset, leaving its icons untouched.
/// Used by the settings modal so that saving global settings mid-edit-session
/// does not persist uncommitted icon changes.
/// Returns the preset name that was saved to.
#[tauri::command]
pub fn save_active_settings(settings: LauncherSettings) -> Result<String, String> {
    let mut config = read_config();
    let preset_name = match &config.active_preset {
        Some(name) if !name.is_empty() => name.clone(),
        _ => {
            let name = "Default".to_string();
            config.active_preset = Some(name.clone());
            write_config(&config)?;
            name
        }
    };

    let presets_dir = get_presets_dir();
    std::fs::create_dir_all(&presets_dir)
        .map_err(|e| format!("Failed to create presets directory: {}", e))?;

    let preset_path = presets_dir.join(format!("{}.json", preset_name));

    // Keep the icons already stored in the preset file.
    let icons = if preset_path.exists() {
        let content = std::fs::read_to_string(&preset_path)
            .map_err(|e| format!("Failed to read preset '{}': {}", preset_name, e))?;
        let data: PresetData = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse preset '{}': {}", preset_name, e))?;
        data.icons
    } else {
        Vec::new()
    };

    let data = PresetData { icons, settings };
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize preset: {}", e))?;
    std::fs::write(&preset_path, json)
        .map_err(|e| format!("Failed to write preset: {}", e))?;

    log::info!("Saved settings for active preset: {}", preset_name);
    Ok(preset_name)
}

/// Set which preset is currently active.
/// Just writes config.json — does not touch preset files.
#[tauri::command]
pub fn set_active_preset(name: String) -> Result<(), String> {
    let preset_path = get_presets_dir().join(format!("{}.json", name));
    if !preset_path.exists() {
        return Err(format!("Preset '{}' not found", name));
    }
    let config = AppConfig {
        active_preset: Some(name.clone()),
    };
    write_config(&config)?;
    log::info!("Set active preset to: {}", name);
    Ok(())
}

/// Save layout data as a named preset (does NOT change the active preset).
#[tauri::command]
pub fn save_preset_as(
    name: String,
    icons: Vec<AppIcon>,
    settings: LauncherSettings,
) -> Result<(), String> {
    let presets_dir = get_presets_dir();
    std::fs::create_dir_all(&presets_dir)
        .map_err(|e| format!("Failed to create presets directory: {}", e))?;

    let preset_path = presets_dir.join(format!("{}.json", name));
    let data = PresetData { icons, settings };
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize preset: {}", e))?;
    std::fs::write(&preset_path, json)
        .map_err(|e| format!("Failed to write preset: {}", e))?;

    log::info!("Saved preset as: {}", name);
    Ok(())
}

/// List all saved presets
#[tauri::command]
pub fn list_presets() -> Result<Vec<String>, String> {
    let presets_dir = get_presets_dir();
    if !presets_dir.exists() {
        return Ok(vec![]);
    }
    let mut presets = vec![];
    if let Ok(entries) = std::fs::read_dir(&presets_dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.ends_with(".json") {
                    presets.push(name.trim_end_matches(".json").to_string());
                }
            }
        }
    }
    presets.sort();
    Ok(presets)
}

/// Delete a preset
#[tauri::command]
pub fn delete_preset(name: String) -> Result<(), String> {
    let preset_path = get_presets_dir().join(format!("{}.json", name));
    if !preset_path.exists() {
        return Err(format!("Preset '{}' not found", name));
    }
    std::fs::remove_file(&preset_path)
        .map_err(|e| format!("Failed to delete preset: {}", e))?;
    let mut config = read_config();
    if config.active_preset.as_deref() == Some(&name) {
        config.active_preset = None;
        write_config(&config)?;
    }
    Ok(())
}

/// Rename a preset
#[tauri::command]
pub fn rename_preset(old_name: String, new_name: String) -> Result<(), String> {
    let presets_dir = get_presets_dir();
    let old_path = presets_dir.join(format!("{}.json", old_name));
    let new_path = presets_dir.join(format!("{}.json", new_name));
    if !old_path.exists() {
        return Err(format!("Preset '{}' not found", old_name));
    }
    if new_path.exists() {
        return Err(format!("Preset '{}' already exists", new_name));
    }
    std::fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Failed to rename preset: {}", e))?;
    let mut config = read_config();
    if config.active_preset.as_deref() == Some(&old_name) {
        config.active_preset = Some(new_name);
        write_config(&config)?;
    }
    Ok(())
}

/// Export a preset to a user-selected path
#[tauri::command]
pub fn export_preset(name: String, path: String) -> Result<(), String> {
    let preset_path = get_presets_dir().join(format!("{}.json", name));
    if !preset_path.exists() {
        return Err(format!("Preset '{}' not found", name));
    }
    let dest = PathBuf::from(path);
    match std::fs::copy(&preset_path, &dest) {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to export preset: {}", e)),
    }
}

/// Save the default layout as a named preset
#[tauri::command]
pub fn save_default_preset(name: String) -> Result<(), String> {
    let presets_dir = get_presets_dir();
    std::fs::create_dir_all(&presets_dir)
        .map_err(|e| format!("Failed to create presets directory: {}", e))?;
    let preset_path = presets_dir.join(format!("{}.json", name));
    let default_layout = LauncherLayout::default();
    let data = PresetData {
        icons: default_layout.icons,
        settings: default_layout.settings,
    };
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("Failed to serialize default preset: {}", e))?;
    std::fs::write(&preset_path, json)
        .map_err(|e| format!("Failed to write default preset: {}", e))?;
    Ok(())
}

/// Import a preset from a user-selected path
#[tauri::command]
pub fn import_preset(path: String) -> Result<String, String> {
    let source = PathBuf::from(path);
    if !source.exists() {
        return Err("Source file does not exist".to_string());
    }
    let name = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported")
        .to_string();
    let presets_dir = get_presets_dir();
    if let Err(e) = std::fs::create_dir_all(&presets_dir) {
        return Err(format!("Failed to create presets directory: {}", e));
    }
    let dest = presets_dir.join(format!("{}.json", name));
    let final_name = if dest.exists() {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let new_name = format!("{}-{}", name, timestamp);
        let new_dest = presets_dir.join(format!("{}.json", new_name));
        if let Err(e) = std::fs::copy(&source, &new_dest) {
            return Err(format!("Failed to import preset: {}", e));
        }
        new_name
    } else {
        if let Err(e) = std::fs::copy(&source, &dest) {
            return Err(format!("Failed to import preset: {}", e));
        }
        name
    };
    Ok(final_name)
}

#[tauri::command]
pub fn hide_launcher(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
pub fn get_icon_base64(icon_path: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(&icon_path);
    let bytes = std::fs::read(&path).map_err(|e| format!("read {}: {}", icon_path, e))?;
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(&bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    #[test]
    fn icon_type_serializes_to_snake_case() {
        let app = serde_json::to_string(&IconType::App).unwrap();
        let image = serde_json::to_string(&IconType::Image).unwrap();
        let link = serde_json::to_string(&IconType::Link).unwrap();
        let widget = serde_json::to_string(&IconType::Widget).unwrap();

        assert_eq!(app, "\"app\"");
        assert_eq!(image, "\"image\"");
        assert_eq!(link, "\"link\"");
        assert_eq!(widget, "\"widget\"");
    }

    #[test]
    fn icon_type_default_is_app() {
        assert_eq!(IconType::default(), IconType::App);
    }

    #[test]
    fn keybind_config_deserializes_with_defaults() {
        let kb: KeybindConfig = serde_json::from_str("{}").unwrap();

        assert_eq!(kb.key, "");
        assert!(!kb.ctrl);
        assert!(!kb.alt);
        assert!(!kb.shift);
        assert!(!kb.meta);
    }

    #[test]
    fn keybind_config_round_trips() {
        let kb = KeybindConfig {
            key: "KeyZ".into(),
            ctrl: true,
            alt: false,
            shift: true,
            meta: true,
        };

        let json = serde_json::to_string(&kb).unwrap();
        let back: KeybindConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(kb, back);
    }

    #[test]
    fn app_icon_deserializes_missing_optional_fields_as_none() {
        let json = r#"{
            "id": "a",
            "name": "N",
            "path": "/p",
            "icon_type": "image",
            "x": 0.0,
            "y": 0.0,
            "width": 0.0,
            "height": 0.0
        }"#;

        let icon: AppIcon = serde_json::from_str(json).unwrap();

        assert_eq!(icon.icon_type, IconType::Image);
        assert_eq!(icon.url, None);
        assert_eq!(icon.args, None);
        assert_eq!(icon.keybind, None);
        assert_eq!(icon.keybind_global, None);
        assert_eq!(icon.show_name, None);
        assert_eq!(icon.custom_name, None);
        assert_eq!(icon.background_color, None);
        assert_eq!(icon.background_opacity, None);
    }

    #[test]
    fn app_icon_round_trips_all_fields() {
        let icon = AppIcon {
            id: "test".into(),
            name: "Test".into(),
            path: "/usr/bin/test".into(),
            icon_path: Some("/icon.png".into()),
            icon_type: IconType::Link,
            widget_type: None,
            widget_config: None,
            url: Some("https://example.com".into()),
            x: 1.0,
            y: 2.0,
            width: 3.0,
            height: 4.0,
            show_name: Some(true),
            custom_name: Some("Custom".into()),
            args: Some("--flag".into()),
            keybind: Some(KeybindConfig {
                key: "KeyA".into(),
                ctrl: true,
                alt: false,
                shift: false,
                meta: true,
            }),
            keybind_global: Some(true),
            z: Some(5),
            background_color: Some("10, 20, 30".into()),
            background_opacity: Some(0.35),
        };

        let json = serde_json::to_string(&icon).unwrap();
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(value["id"], "test");
        assert_eq!(value["icon_type"], "link");
        assert_eq!(value["url"], "https://example.com");
        assert_eq!(value["keybind"]["ctrl"], true);
        assert_eq!(value["keybind_global"], true);
        assert_eq!(value["background_color"], "10, 20, 30");
        assert_eq!(value["background_opacity"], 0.35);

        let back: AppIcon = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, icon.id);
        assert_eq!(back.icon_type, icon.icon_type);
        assert_eq!(back.keybind, icon.keybind);
        assert_eq!(back.keybind_global, icon.keybind_global);
        assert_eq!(back.background_color, icon.background_color);
        assert_eq!(back.background_opacity, icon.background_opacity);
    }

    #[test]
    fn launcher_settings_default_round_trips() {
        let settings = LauncherSettings::default();

        let json = serde_json::to_string(&settings).unwrap();
        let back: LauncherSettings = serde_json::from_str(&json).unwrap();

        assert_eq!(back.width_percent, settings.width_percent);
        assert_eq!(back.height_percent, settings.height_percent);
        assert_eq!(back.background_color, settings.background_color);
        assert_eq!(back.grid_size, settings.grid_size);
        assert_eq!(back.magnetic_snap, settings.magnetic_snap);
        assert_eq!(back.grid_line_color, settings.grid_line_color);
        assert_eq!(back.keybind_toggle_launcher, settings.keybind_toggle_launcher);
        assert_eq!(back.keybind_undo, settings.keybind_undo);
    }

    #[test]
    fn launcher_settings_missing_grid_line_color_defaults_to_white() {
        // Layouts saved before the grid line color setting existed have no
        // field; it must deserialize to the white default rather than "".
        let json = r#"{
            "width_percent": 90.0,
            "grid_size": 40.0,
            "magnetic_snap": true
        }"#;
        let back: LauncherSettings = serde_json::from_str(json).unwrap();
        assert_eq!(back.grid_line_color, "255, 255, 255");
    }

    #[test]
    fn launcher_layout_default_has_default_icons_and_settings() {
        let layout = LauncherLayout::default();

        assert_eq!(layout.icons.len(), 2);
        assert_eq!(layout.active_preset, None);
        assert_eq!(layout.settings.width_percent, 90.0);

        let json = serde_json::to_string(&layout).unwrap();
        let back: LauncherLayout = serde_json::from_str(&json).unwrap();
        assert_eq!(back.icons.len(), 2);
        assert_eq!(back.icons[0].name, "Terminal");
    }

    #[test]
    fn expand_tilde_returns_plain_paths_unchanged() {
        assert_eq!(expand_tilde("/usr/bin/x"), "/usr/bin/x");
        assert_eq!(expand_tilde("firefox"), "firefox");
        assert_eq!(expand_tilde(""), "");
    }

    #[test]
    fn expand_tilde_expands_home() {
        let home = dirs::home_dir().expect("home dir should exist");

        assert_eq!(expand_tilde("~"), home.to_string_lossy());
        assert_eq!(
            expand_tilde("~/foo/bar"),
            home.join("foo/bar").to_string_lossy()
        );
    }

    #[test]
    fn find_macos_app_bundle_finds_ancestor_app_dir() {
        assert_eq!(
            find_macos_app_bundle("/Applications/Safari.app"),
            Some("/Applications/Safari.app".to_string())
        );
        assert_eq!(
            find_macos_app_bundle("/Applications/Safari.app/Contents/MacOS/Safari"),
            Some("/Applications/Safari.app".to_string())
        );
    }

    #[test]
    fn find_macos_app_bundle_returns_none_without_app_dir() {
        assert_eq!(find_macos_app_bundle("/usr/bin/ls"), None);
        assert_eq!(find_macos_app_bundle("firefox"), None);
    }

    #[test]
    fn find_macos_app_bundle_is_case_insensitive() {
        assert_eq!(
            find_macos_app_bundle("/Applications/Some.App/Contents/MacOS/Some"),
            Some("/Applications/Some.App".to_string())
        );
    }

    #[test]
    fn default_terminal_and_browser_are_non_empty() {
        assert!(!get_default_terminal().is_empty());
        assert!(!get_default_browser().is_empty());
    }

    // --- Preset lifecycle tests -------------------------------------------
    // These run against a throwaway config directory so they never touch the
    // real user config. `ODEKO_CONFIG_DIR` redirects get_config_dir().

    static CONFIG_DIR_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    static DIR_COUNTER: AtomicU32 = AtomicU32::new(0);

    fn with_fake_config_dir<T>(f: impl FnOnce() -> T) -> T {
        let _guard = CONFIG_DIR_LOCK.lock().unwrap();
        let dir = std::env::temp_dir().join(format!(
            "odeko-test-config-{}-{}",
            std::process::id(),
            DIR_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        std::env::set_var("ODEKO_CONFIG_DIR", &dir);
        let result = f();
        std::env::remove_var("ODEKO_CONFIG_DIR");
        let _ = std::fs::remove_dir_all(&dir);
        result
    }

    /// A LauncherSettings where every single field differs from the defaults,
    /// so we can verify each one survives a save/load round-trip.
    fn modified_settings() -> LauncherSettings {
        LauncherSettings {
            width_percent: 50.0,
            height_percent: 60.0,
            background_color: "10, 20, 30".into(),
            background_opacity: 0.42,
            background_image: Some("/tmp/bg.png".into()),
            background_size: "contain".into(),
            background_repeat: true,
            background_position: "bottom right".into(),
            border_radius: 12.0,
            position_x: 30.0,
            position_y: 40.0,
            backdrop_darkness: 0.55,
            backdrop_blur: false,
            blur_strength: "light".to_string(),
            magnetic_snap: false,
            grid_size: 64.0,
            grid_line_color: "200, 100, 50".into(),
            icon_background_color: "1, 2, 3".into(),
            icon_background_opacity: 0.33,
            keybind_toggle_launcher: KeybindConfig {
                key: "KeyA".into(),
                ctrl: true,
                alt: false,
                shift: false,
                meta: true,
            },
            keybind_toggle_edit: KeybindConfig {
                key: "KeyB".into(),
                ctrl: false,
                alt: true,
                shift: false,
                meta: false,
            },
            keybind_hide_launcher: KeybindConfig {
                key: "KeyC".into(),
                ctrl: false,
                alt: false,
                shift: true,
                meta: false,
            },
            keybind_undo: KeybindConfig {
                key: "KeyD".into(),
                ctrl: false,
                alt: false,
                shift: false,
                meta: true,
            },
            network_grants: vec!["api.example.com".to_string()],
            allow_local_network: true,
        }
    }

    #[test]
    fn every_settings_field_round_trips_through_disk() {
        with_fake_config_dir(|| {
            let modified = modified_settings();
            save_active_settings(modified.clone()).unwrap();

            let layout = load_active_layout().unwrap();
            let got = layout.settings;

            assert_eq!(got.width_percent, 50.0);
            assert_eq!(got.height_percent, 60.0);
            assert_eq!(got.background_color, "10, 20, 30");
            assert_eq!(got.background_opacity, 0.42);
            assert_eq!(got.background_image.as_deref(), Some("/tmp/bg.png"));
            assert_eq!(got.background_size, "contain");
            assert!(got.background_repeat);
            assert_eq!(got.background_position, "bottom right");
            assert_eq!(got.border_radius, 12.0);
            assert_eq!(got.position_x, 30.0);
            assert_eq!(got.position_y, 40.0);
            assert_eq!(got.backdrop_darkness, 0.55);
            assert!(!got.magnetic_snap);
            assert_eq!(got.grid_size, 64.0);
            assert_eq!(got.grid_line_color, "200, 100, 50");
            assert_eq!(got.icon_background_color, "1, 2, 3");
            assert_eq!(got.icon_background_opacity, 0.33);
            assert_eq!(got.keybind_toggle_launcher, modified.keybind_toggle_launcher);
            assert_eq!(got.keybind_toggle_edit, modified.keybind_toggle_edit);
            assert_eq!(got.keybind_hide_launcher, modified.keybind_hide_launcher);
            assert_eq!(got.keybind_undo, modified.keybind_undo);
        });
    }

    #[test]
    fn save_active_settings_auto_creates_default_preset() {
        with_fake_config_dir(|| {
            let name = save_active_settings(modified_settings()).unwrap();
            assert_eq!(name, "Default");

            let layout = load_active_layout().unwrap();
            assert_eq!(layout.active_preset.as_deref(), Some("Default"));
            assert_eq!(layout.settings.grid_size, 64.0);

            // The Default.json preset file must actually exist on disk.
            assert!(get_presets_dir().join("Default.json").exists());
        });
    }

    #[test]
    fn save_active_layout_round_trips_icon_positions() {
        with_fake_config_dir(|| {
            let mut icon = LauncherLayout::default().icons[0].clone();
            icon.x = 350.0;
            icon.y = 220.0;
            icon.width = 120.0;
            icon.height = 90.0;
            icon.args = Some("--fullscreen".into());

            save_active_layout(vec![icon.clone()], LauncherSettings::default()).unwrap();

            let layout = load_active_layout().unwrap();
            assert_eq!(layout.icons.len(), 1);
            assert_eq!(layout.icons[0].x, 350.0);
            assert_eq!(layout.icons[0].y, 220.0);
            assert_eq!(layout.icons[0].width, 120.0);
            assert_eq!(layout.icons[0].height, 90.0);
            assert_eq!(layout.icons[0].args.as_deref(), Some("--fullscreen"));
        });
    }

    #[test]
    fn load_active_layout_falls_back_to_defaults_when_preset_file_missing() {
        with_fake_config_dir(|| {
            write_config(&AppConfig {
                active_preset: Some("Ghost".into()),
            })
            .unwrap();

            let layout = load_active_layout().unwrap();
            assert_eq!(layout.active_preset, None);
            assert_eq!(layout.icons.len(), 2);
            assert_eq!(layout.settings.grid_size, 40.0);
        });
    }

    #[test]
    fn set_active_preset_requires_existing_preset() {
        with_fake_config_dir(|| {
            assert!(set_active_preset("Missing".into()).is_err());

            save_preset_as("My".into(), vec![], LauncherSettings::default()).unwrap();
            set_active_preset("My".into()).unwrap();

            let layout = load_active_layout().unwrap();
            assert_eq!(layout.active_preset.as_deref(), Some("My"));
        });
    }

    #[test]
    fn preset_save_list_delete_lifecycle() {
        with_fake_config_dir(|| {
            save_preset_as("Alpha".into(), vec![], LauncherSettings::default()).unwrap();
            save_preset_as("Beta".into(), vec![], LauncherSettings::default()).unwrap();

            assert_eq!(list_presets().unwrap(), vec!["Alpha", "Beta"]);

            delete_preset("Alpha".into()).unwrap();
            assert_eq!(list_presets().unwrap(), vec!["Beta"]);

            assert!(delete_preset("Missing".into()).is_err());
        });
    }

    #[test]
    fn delete_preset_clears_the_active_preset() {
        with_fake_config_dir(|| {
            save_preset_as("My".into(), vec![], LauncherSettings::default()).unwrap();
            set_active_preset("My".into()).unwrap();

            delete_preset("My".into()).unwrap();

            let layout = load_active_layout().unwrap();
            assert_eq!(layout.active_preset, None);
        });
    }

    #[test]
    fn rename_preset_validates_and_updates_active() {
        with_fake_config_dir(|| {
            save_preset_as("A".into(), vec![], LauncherSettings::default()).unwrap();
            save_preset_as("B".into(), vec![], LauncherSettings::default()).unwrap();

            // Cannot rename a preset that does not exist.
            assert!(rename_preset("Missing".into(), "X".into()).is_err());
            // Cannot rename onto an existing preset.
            assert!(rename_preset("A".into(), "B".into()).is_err());

            set_active_preset("A".into()).unwrap();
            rename_preset("A".into(), "C".into()).unwrap();

            let layout = load_active_layout().unwrap();
            assert_eq!(layout.active_preset.as_deref(), Some("C"));
        });
    }

    #[test]
    fn import_and_export_presets() {
        with_fake_config_dir(|| {
            // Exporting a missing preset fails.
            assert!(export_preset("Missing".into(), String::new()).is_err());

            save_preset_as("ExportMe".into(), vec![], LauncherSettings::default()).unwrap();
            let dest = std::env::temp_dir().join("odeko-export-test.json");
            export_preset("ExportMe".into(), dest.to_string_lossy().to_string()).unwrap();
            assert!(dest.exists());

            // Importing a nonexistent source fails.
            assert!(import_preset("/nonexistent/file.json".into()).is_err());

            // Importing the exported file works and reuses its stem as the name.
            let name = import_preset(dest.to_string_lossy().to_string()).unwrap();
            assert_eq!(name, "odeko-export-test");
            assert!(list_presets().unwrap().contains(&name));

            let _ = std::fs::remove_file(&dest);
        });
    }
}
