mod commands;
mod window_effects;
use commands::app_scanner::{convert_icns_to_png, get_system_app, scan_installed_apps};
use commands::launcher::{launch_app, open_url, load_active_layout, save_active_layout, save_active_settings, set_active_preset, save_preset_as, list_presets, save_default_preset, delete_preset, rename_preset, export_preset, import_preset, KeybindConfig, AppIcon, IconType, launch_icon_sync, hide_launcher, get_icon_base64};
use commands::media::{get_media_info, get_active_players, media_play_pause, media_next, media_previous, media_set_position, list_media_players};
use commands::media_server::{register_background_video, MediaServerState};
use commands::power_control::{execute_sleep, execute_restart, execute_shutdown};
use commands::system_stats::get_system_stats;
use commands::terminal::{TerminalState, terminal_create_shell, terminal_write, terminal_resize, terminal_start_reader};
use commands::widget_fetch::widget_fetch;
use tauri::{Emitter, Manager};
use tauri::utils::config::Color;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState, GlobalShortcutExt};
use std::sync::Mutex;
use std::str::FromStr;
use std::collections::HashMap;

struct GlobalShortcutState {
    current: Mutex<Shortcut>,
}

struct IconShortcutState {
    shortcuts: Mutex<HashMap<String, Shortcut>>,
}

/// Runtime state for the native backdrop blur on Linux.
#[cfg(target_os = "linux")]
struct BlurState(parking_lot::Mutex<BlurControl>);

#[cfg(target_os = "linux")]
struct BlurControl {
    /// Whether the user enabled the blur (see `set_backdrop_blur`).
    enabled: bool,
    /// Blur area: "full" blurs the whole screen (minus the panel when it is
    /// a video), "light" blurs only the launcher panel rectangle so the rest
    /// of the desktop stays sharp.
    spec: window_effects::BlurSpec,
    /// Persistent handle so the blur can be rebuilt on every show (the
    /// compositor drops it while the window is hidden).
    blur: Option<window_effects::WindowBlur>,
}

#[allow(clippy::missing_panics_doc)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    // WDIO plugins for the E2E suite (only with the `e2e` feature).
    #[cfg(feature = "e2e")]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .setup(|app| {
            // The WDIO plugin installs its own logger, so skip the log plugin
            // in E2E builds to avoid registering a second logger.
            #[cfg(all(debug_assertions, not(feature = "e2e")))]
            {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        // Verbose logs for our own crate (dev builds only).
                        .level_for("odeko_lib", log::LevelFilter::Debug)
                        .build(),
                )?;
            }

            match TerminalState::new() {
                Ok(terminal_state) => {
                    app.manage(terminal_state);
                    log::info!("Terminal state initialized successfully");
                }
                Err(e) => {
                    log::error!("Failed to initialize terminal state: {}", e);
                }
            }

            let default_shortcut =
                Shortcut::new(Some(Modifiers::SUPER | Modifiers::ALT), Code::KeyZ);

            // Manage the blur state before the window is configured: on some
            // platforms the window is already visible at this point and
            // configure_launcher_window() calls sync_window_blur(), which
            // reads the state. Reading unmanaged state panics.
            #[cfg(target_os = "linux")]
            app.manage(BlurState(parking_lot::Mutex::new(BlurControl {
                enabled: true,
                spec: window_effects::BlurSpec {
                    strength: "full".into(),
                    panel: None,
                    exclude_panel: false,
                    window_size: (0, 0),
                },
                blur: None,
            })));

            configure_launcher_window(app);

            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_shortcuts([default_shortcut.clone()])?
                    .with_handler(move |app, shortcut, event| {
                        if event.state() == ShortcutState::Pressed {
                            let state = app.state::<GlobalShortcutState>();
                            let current = state.current.lock().unwrap();
                            if *current == *shortcut {
                                toggle_launcher_window(app);
                            }
                        }
                    })
                    .build(),
            )?;

            app.manage(GlobalShortcutState {
                current: Mutex::new(default_shortcut),
            });
            app.manage(IconShortcutState {
                shortcuts: Mutex::new(HashMap::new()),
            });
            app.manage(MediaServerState::new());

            log::info!("Odeko initialized successfully!");
            log::info!("Press Win+Alt+Z to toggle the launcher");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            launch_app, open_url,
            load_active_layout, save_active_layout, save_active_settings, set_active_preset, save_preset_as,
            scan_installed_apps, get_system_app, convert_icns_to_png, get_system_stats,
            terminal_create_shell, terminal_write, terminal_resize, terminal_start_reader,
            get_media_info, get_active_players, media_play_pause, media_next, media_previous, media_set_position, list_media_players,
            execute_sleep, execute_restart, execute_shutdown,
            list_presets, save_default_preset, delete_preset, rename_preset, export_preset, import_preset,
            update_global_shortcut, update_icon_shortcuts, get_platform, hide_launcher, get_icon_base64,
            register_background_video, set_backdrop_blur, widget_fetch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn configure_launcher_window(app: &tauri::App) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.set_background_color(Some(Color(0, 0, 0, 0))) {
            log::warn!("Failed to make launcher background transparent: {}", error);
        }

        // Real backdrop blur behind the transparent window (window_effects.rs).
        // Windows/macOS accept the effect at setup time. Linux needs the GTK
        // window realized (shown at least once), and the compositor drops the
        // blur region every time the window is hidden — so there we re-apply
        // it on every focus event instead of applying once at setup.
        #[cfg(not(target_os = "linux"))]
        window_effects::apply(&window);

        #[cfg(target_os = "linux")]
        {
            use tauri::WindowEvent;

            let app_handle = app.handle().clone();
            window.on_window_event(move |event| {
                // The launcher is shown and focused together (toggle), so a
                // focus event means it is on screen again.
                if matches!(event, WindowEvent::Focused(true)) {
                    sync_window_blur(&app_handle);
                }
            });

            // A window created already visible fires its focus event before
            // setup runs, so also apply when it is visible right now (e.g. a
            // config with `"visible": true`).
            if window.is_visible().unwrap_or(false) {
                sync_window_blur(app.handle());
            }
        }

        if let Err(error) = window.set_always_on_top(true) {
            log::warn!("Failed to keep launcher above other windows: {}", error);
        }

        if let Err(error) = window.set_visible_on_all_workspaces(true) {
            log::warn!("Failed to show launcher on all workspaces: {}", error);
        }

        #[cfg(target_os = "macos")]
        if let Err(error) = window.set_simple_fullscreen(true) {
            log::warn!("Failed to enter macOS simple fullscreen: {}", error);
        }

        #[cfg(not(target_os = "macos"))]
        if let Err(error) = window.set_fullscreen(true) {
            log::warn!("Failed to enter fullscreen: {}", error);
        }
    }
}

/// Makes the native backdrop blur match the current state. The compositor
/// drops the blur region every time the window is hidden (and the wl_surface
/// itself may be recreated), so on every show we rebuild the effect from
/// scratch — deterministic, no stale-object edge cases.
#[cfg(target_os = "linux")]
fn sync_window_blur(app: &tauri::AppHandle) {
    let state = app.state::<BlurState>();
    let mut control = state.0.lock();

    // Always drop the previous effect first so a fresh one can be created
    // without colliding on the same surface.
    if let Some(old) = control.blur.take() {
        old.destroy();
    }

    if !control.enabled {
        return;
    }

    if let Some(window) = app.get_webview_window("main") {
        match window_effects::WindowBlur::new(&window, control.spec.clone()) {
            Ok(blur) => {
                control.blur = Some(blur);
                log::info!("Applied native backdrop blur");
            }
            Err(error) => log::warn!("Failed to apply native backdrop blur: {error}"),
        }
    }
}

/// Turns the native backdrop blur on or off (called by the frontend whenever
/// the setting changes or loads).
///
/// `strength` is `"light"` or `"full"`; `region` is the launcher panel's
/// rectangle in logical pixels; `exclude_panel` is set when the panel has a
/// video background, so the blur skips the panel area (it is opaque there —
/// the blur would be invisible but force a costly re-blur on every video
/// frame).
#[tauri::command]
fn set_backdrop_blur(
    app: tauri::AppHandle,
    enabled: bool,
    strength: String,
    region: Option<[f64; 4]>,
    exclude_panel: bool,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let state = app.state::<BlurState>();
        let mut control = state.0.lock();
        control.enabled = enabled;
        control.spec = window_effects::BlurSpec {
            strength: strength.clone(),
            panel: region.map(|[x, y, w, h]| {
                (x.round() as i32, y.round() as i32, w.round() as i32, h.round() as i32)
            }),
            exclude_panel,
            window_size: control.spec.window_size,
        };
        drop(control);

        // Touches GTK/window state, so run on the main thread.
        if let Some(window) = app.get_webview_window("main") {
            let app_handle = app.clone();
            window
                .run_on_main_thread(move || sync_window_blur(&app_handle))
                .map_err(|e| e.to_string())?;
        }
    }

    #[cfg(not(target_os = "linux"))]
    {
        if let Some(window) = app.get_webview_window("main") {
            if enabled {
                window_effects::apply(&window, strength.as_str());
            } else {
                window.set_effects(None).map_err(|e| e.to_string())?;
            }
        }
    }

    log::info!("Backdrop blur set to {enabled} ({strength})");
    Ok(())
}

fn toggle_launcher_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(is_visible) = window.is_visible() {
            if is_visible {
                let _ = window.hide();
                log::info!("Launcher hidden");
            } else {
                let _ = window.show();
                let _ = window.set_focus();
                log::info!("Launcher shown");
            }
        }
    }
}

#[tauri::command]
fn get_platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

#[tauri::command]
fn update_global_shortcut(app: tauri::AppHandle, keybind: KeybindConfig) -> Result<(), String> {
    let state = app.state::<GlobalShortcutState>();
    let gs = app.global_shortcut();

    let code = Code::from_str(&keybind.key)
        .map_err(|e| format!("Unknown key code '{}': {}", keybind.key, e))?;

    let mut modifiers = Modifiers::empty();
    if keybind.ctrl {
        modifiers |= Modifiers::CONTROL;
    }
    if keybind.alt {
        modifiers |= Modifiers::ALT;
    }
    if keybind.shift {
        modifiers |= Modifiers::SHIFT;
    }
    if keybind.meta {
        modifiers |= Modifiers::SUPER;
    }

    let new_shortcut = Shortcut::new(Some(modifiers), code);

    {
        let old = state
            .current
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        if *old != new_shortcut {
            let _ = gs.unregister(old.clone());
            gs.register(new_shortcut.clone())
                .map_err(|e| format!("Failed to register shortcut: {}", e))?;
        }
    }

    let mut current = state
        .current
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    *current = new_shortcut;

    log::info!("Global shortcut updated to: {:?}", keybind.key);
    Ok(())
}

fn keybind_to_shortcut(kb: &KeybindConfig) -> Result<Shortcut, String> {
    let code =
        Code::from_str(&kb.key).map_err(|e| format!("Unknown key code '{}': {}", kb.key, e))?;

    let mut modifiers = Modifiers::empty();
    if kb.ctrl {
        modifiers |= Modifiers::CONTROL;
    }
    if kb.alt {
        modifiers |= Modifiers::ALT;
    }
    if kb.shift {
        modifiers |= Modifiers::SHIFT;
    }
    if kb.meta {
        modifiers |= Modifiers::SUPER;
    }

    Ok(Shortcut::new(Some(modifiers), code))
}

#[tauri::command]
fn update_icon_shortcuts(app: tauri::AppHandle, icons: Vec<AppIcon>) -> Result<(), String> {
    let state = app.state::<IconShortcutState>();
    let gs = app.global_shortcut();

    let mut old_map = state
        .shortcuts
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let mut new_map: HashMap<String, Shortcut> = HashMap::new();

    for icon in &icons {
        if let Some(ref kb) = icon.keybind {
            if icon.keybind_global.unwrap_or(false) {
                match keybind_to_shortcut(kb) {
                    Ok(shortcut) => {
                        new_map.insert(icon.id.clone(), shortcut);
                    }
                    Err(e) => {
                        log::warn!("Skipping shortcut for icon {}: {}", icon.id, e);
                    }
                }
            }
        }
    }

    for (id, old_shortcut) in old_map.iter() {
        if !new_map.contains_key(id) {
            let _ = gs.unregister(old_shortcut.clone());
            log::info!("Unregistered global shortcut for icon: {}", id);
        }
    }

    for (id, new_shortcut) in &new_map {
        if !old_map.contains_key(id) || old_map.get(id) != Some(new_shortcut) {
            let shortcut = new_shortcut.clone();
            let icon = icons
                .iter()
                .find(|i| &i.id == id)
                .cloned()
                .ok_or_else(|| format!("Icon {} not found in provided list", id))?;

            gs.on_shortcut(shortcut.clone(), move |app, _sc, event| {
                if event.state() == ShortcutState::Pressed {
                    if is_power_widget(&icon) {
                        if let Err(error) = app.emit("power-widget-shortcut", icon.id.clone()) {
                            log::warn!("Failed to emit power widget shortcut: {}", error);
                        }
                    } else {
                        launch_icon_sync(&icon);
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            }
                        }
                    }
                }
            })
            .map_err(|e| format!("Failed to register shortcut for {}: {}", id, e))?;

            log::info!("Registered global shortcut for icon: {}", id);
        }
    }

    *old_map = new_map;

    Ok(())
}

fn is_power_widget(icon: &AppIcon) -> bool {
    icon.icon_type == IconType::Widget
        && matches!(
            icon.widget_type.as_deref(),
            Some("sleep") | Some("restart") | Some("shutdown")
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn icon_with_type(icon_type: IconType, widget_type: Option<&str>) -> AppIcon {
        AppIcon {
            id: "test".into(),
            name: "Test".into(),
            path: "/usr/bin/test".into(),
            icon_path: None,
            icon_type,
            widget_type: widget_type.map(String::from),
            widget_config: None,
            url: None,
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
            show_name: None,
            custom_name: None,
            args: None,
            keybind: None,
            keybind_global: None,
            z: None,
            appearance: None,
        }
    }

    #[test]
    fn keybind_to_shortcut_builds_shortcut_from_flags() {
        let kb = KeybindConfig {
            key: "KeyZ".into(),
            ctrl: true,
            alt: false,
            shift: true,
            meta: true,
        };

        let shortcut = keybind_to_shortcut(&kb).unwrap();
        let modifiers = shortcut.mods;

        assert!(modifiers.contains(Modifiers::CONTROL));
        assert!(modifiers.contains(Modifiers::SHIFT));
        assert!(modifiers.contains(Modifiers::SUPER));
        assert!(!modifiers.contains(Modifiers::ALT));
        assert_eq!(shortcut.key, Code::KeyZ);
    }

    #[test]
    fn keybind_to_shortcut_without_modifiers_is_empty() {
        let kb = KeybindConfig {
            key: "KeyA".into(),
            ctrl: false,
            alt: false,
            shift: false,
            meta: false,
        };

        let shortcut = keybind_to_shortcut(&kb).unwrap();
        assert!(shortcut.mods.is_empty());
    }

    #[test]
    fn keybind_to_shortcut_rejects_unknown_keys() {
        let kb = KeybindConfig {
            key: "NotARealKey".into(),
            ctrl: false,
            alt: false,
            shift: false,
            meta: false,
        };

        assert!(keybind_to_shortcut(&kb).is_err());
    }

    #[test]
    fn is_power_widget_detects_power_widget_types() {
        for widget_type in ["sleep", "restart", "shutdown"] {
            let icon = icon_with_type(IconType::Widget, Some(widget_type));
            assert!(is_power_widget(&icon), "{widget_type} should be a power widget");
        }
    }

    #[test]
    fn is_power_widget_rejects_non_power_icons() {
        assert!(!is_power_widget(&icon_with_type(IconType::App, None)));
        assert!(!is_power_widget(&icon_with_type(IconType::Link, Some("sleep"))));
        assert!(!is_power_widget(&icon_with_type(IconType::Widget, Some("clock"))));
        assert!(!is_power_widget(&icon_with_type(IconType::Widget, None)));
    }

    #[test]
    fn get_platform_returns_a_supported_value() {
        let platform = get_platform();
        assert!(matches!(platform, "macos" | "windows" | "linux" | "unknown"));
    }
}
