//! OS-level background blur for the canvas window.
//!
//! CSS `backdrop-filter` can only blur what is *inside* the webview, never the
//! desktop behind the window. Real blur has to come from the OS compositor,
//! so each platform needs its own native effect:
//!
//! - **Windows**: DWM *Acrylic* via Tauri's built-in `set_effects`
//!   (Windows 10 1809+ / Windows 11).
//! - **macOS**: `NSVisualEffectView` *vibrancy* via `set_effects`
//!   (needs `macos-private-api`, already enabled).
//! - **Linux (Wayland)**: the `ext-background-effect-v1` protocol
//!   (KWin Plasma 6.6+, GNOME Mutter 49+).
//! - **Linux (X11)**: the `_KDE_NET_WM_BLUR_BEHIND_REGION` atom
//!   (KWin X11, picom).
//!
//! On unsupported compositors nothing is applied and the window simply keeps
//! its own translucent background, so the canvas stays readable everywhere.

use tauri::WebviewWindow;

/// Applies the native blur effect for the current platform.
///
/// Windows/macOS: call when the window is created or the setting changes; the
/// effect persists for the window's lifetime. Linux has its own
/// [`WindowBlur`] handle instead. `strength` is `"light"` or `"full"`.
#[cfg(not(target_os = "linux"))]
pub fn apply(window: &WebviewWindow, strength: &str) {
    #[cfg(target_os = "windows")]
    apply_windows(window, strength);

    #[cfg(target_os = "macos")]
    apply_macos(window, strength);
}

/// Windows: DWM Acrylic (full) or plain DWM Blur (light — no tint, so the
/// desktop shows through more clearly).
#[cfg(target_os = "windows")]
fn apply_windows(window: &WebviewWindow, strength: &str) {
    use tauri::window::{Color, Effect, EffectsBuilder};

    let mut builder = EffectsBuilder::new();
    if strength == "light" {
        // Plain blur, no tint: the wallpaper stays recognizable behind it.
        builder = builder.effect(Effect::Blur);
    } else {
        // Acrylic = blur + tint. The tint matches the canvas's dark theme
        // so the panel stays readable over any wallpaper.
        builder = builder.effect(Effect::Acrylic).color(Color(16, 16, 24, 200));
    }
    let effects = builder.build();

    match window.set_effects(effects) {
        Ok(()) => log::info!("Applied Windows {strength} blur"),
        Err(error) => log::warn!("Failed to apply Windows blur: {error}"),
    }
}

/// macOS: NSVisualEffectView vibrancy — dark "HUD" material (full) or the
/// subtler window-background material (light).
#[cfg(target_os = "macos")]
fn apply_macos(window: &WebviewWindow, strength: &str) {
    use tauri::window::{Effect, EffectsBuilder};

    // HudWindow is the dark frosted material Spotlight uses; it reads well
    // behind the canvas's translucent panel. UnderWindowBackground is a
    // gentler material that lets the desktop show through more.
    let effect = if strength == "light" {
        Effect::UnderWindowBackground
    } else {
        Effect::HudWindow
    };
    let effects = EffectsBuilder::new().effect(effect).build();

    match window.set_effects(effects) {
        Ok(()) => log::info!("Applied macOS {strength} vibrancy blur"),
        Err(error) => log::warn!("Failed to apply macOS vibrancy blur: {error}"),
    }
}

/// Linux: asks the compositor to blur behind the window and keeps a handle so
/// the effect can be re-applied, cleared, and toggled at runtime.
///
/// KWin drops the blur region when a window is hidden, so the region must be
/// re-applied every time the window is shown again — hence the persistent
/// handle instead of a fire-and-forget call.
#[cfg(target_os = "linux")]
pub struct WindowBlur {
    inner: BlurInner,
}

#[cfg(target_os = "linux")]
enum BlurInner {
    /// Keeps the connection and the effect object alive so the effect can be
    /// destroyed cleanly. The wl_region has copy semantics and the wl_surface
    /// belongs to GTK, so neither needs to be retained.
    Wayland {
        conn: wayland_client::Connection,
        effect: wayland_protocols::ext::background_effect::v1::client::ext_background_effect_surface_v1::ExtBackgroundEffectSurfaceV1,
    },
    /// X11 stores the blur window property on the X server, which survives
    /// hide/show — nothing needs to be kept alive.
    X11 { xid: std::ffi::c_ulong },
}

/// The panel rectangle in surface-local (logical) pixels, plus whether it
/// must be kept out of the blur region.
///
/// `panel` is `None` when the region should cover the whole window. When
/// `exclude_panel` is set (video background: the panel is opaque and repaints
/// every frame, which would force the compositor to re-blur below it), the
/// panel rectangle is cut out of the region in both modes.
#[cfg(target_os = "linux")]
#[derive(Clone)]
pub struct BlurSpec {
    pub strength: String,
    pub panel: Option<(i32, i32, i32, i32)>,
    pub exclude_panel: bool,
    /// Logical window size, used to build the "everything except the panel"
    /// region without overflowing the compositor's integer math.
    pub window_size: (i32, i32),
}

#[cfg(target_os = "linux")]
impl WindowBlur {
    /// Creates the blur effect for the window and applies it immediately.
    ///
    /// The window must be realized (shown at least once) so its `wl_surface`
    /// exists; callers trigger this from the window's first focus event.
    pub fn new(window: &WebviewWindow, mut spec: BlurSpec) -> Result<Self, String> {
        use raw_window_handle::{HasDisplayHandle, HasWindowHandle, RawDisplayHandle, RawWindowHandle};

        // Logical (CSS-pixel) window size, matching the frontend's coordinates.
        let scale = window.scale_factor().unwrap_or(1.0);
        let size = window.inner_size().map(|s| s.to_logical::<f64>(scale)).unwrap_or_default();
        spec.window_size = (size.width.round() as i32, size.height.round() as i32);

        let handle = window.window_handle().map_err(|e| e.to_string())?;
        let display_handle = window.display_handle().map_err(|e| e.to_string())?;

        match (handle.as_raw(), display_handle.as_raw()) {
            (RawWindowHandle::Wayland(wayland), RawDisplayHandle::Wayland(display)) => {
                let inner = Self::new_wayland(wayland.surface.as_ptr(), display.display.as_ptr(), spec)?;
                Ok(Self { inner })
            }
            (RawWindowHandle::Xlib(xlib), RawDisplayHandle::Xlib(_)) => {
                // The X11 property blurs the whole window; region is ignored.
                set_x11_blur(xlib.window, 1)?;
                Ok(Self { inner: BlurInner::X11 { xid: xlib.window } })
            }
            _ => Err("No supported native blur for this display server".into()),
        }
    }

    /// Destroys the compositor-side effect object.
    ///
    /// The caller rebuilds the blur from scratch on every show, so the old
    /// effect must be fully removed first — the destructor request is flushed
    /// here, otherwise the next `get_background_effect` on the same surface
    /// would raise a `background_effect_exists` protocol error.
    pub fn destroy(self) {
        match self.inner {
            BlurInner::Wayland { conn, effect, .. } => {
                effect.destroy();
                let _ = conn.flush();
            }
            BlurInner::X11 { xid } => {
                let _ = set_x11_blur(xid, 0);
            }
        }
    }

    /// Wayland: `ext-background-effect-v1`.
    ///
    /// The protocol lets a client mark a region of its surface as "blur the
    /// background behind this". We adopt the Wayland connection the window
    /// already lives on (the one GTK uses) and wrap the window's own
    /// `wl_surface`, so the requests reach the right compositor objects.
    #[cfg(target_os = "linux")]
    fn new_wayland(
        surface: *mut std::ffi::c_void,
        display: *mut std::ffi::c_void,
        spec: BlurSpec,
    ) -> Result<BlurInner, String> {
        use wayland_backend::sys::client::ObjectId;
        use wayland_client::delegate_noop;
        use wayland_client::globals::{registry_queue_init, GlobalListContents};
        use wayland_client::protocol::{wl_compositor::WlCompositor, wl_registry, wl_surface::WlSurface};
        use wayland_client::{Connection, Dispatch, Proxy as _};
        use wayland_protocols::ext::background_effect::v1::client::ext_background_effect_manager_v1::ExtBackgroundEffectManagerV1;
        use wayland_protocols::ext::background_effect::v1::client::ext_background_effect_surface_v1::ExtBackgroundEffectSurfaceV1;

        // The globals helper needs a state type to dispatch events into. We
        // only care about the initial global list, so every handler is a no-op.
        struct BlurInit;

        impl Dispatch<wl_registry::WlRegistry, GlobalListContents> for BlurInit {
            fn event(
                _state: &mut Self,
                _proxy: &wl_registry::WlRegistry,
                _event: wl_registry::Event,
                _data: &GlobalListContents,
                _conn: &Connection,
                _qhandle: &wayland_client::QueueHandle<BlurInit>,
            ) {
            }
        }

        delegate_noop!(BlurInit: ExtBackgroundEffectManagerV1);
        delegate_noop!(BlurInit: ExtBackgroundEffectSurfaceV1);
        delegate_noop!(BlurInit: WlCompositor);
        delegate_noop!(BlurInit: wayland_client::protocol::wl_region::WlRegion);

        // Adopt GTK's connection instead of opening a new one: wl_surface
        // objects only exist on the connection that created them.
        let backend = unsafe { wayland_backend::sys::client::Backend::from_foreign_display(display as *mut _) };
        let conn = Connection::from_backend(backend);

        let (globals, queue) = registry_queue_init::<BlurInit>(&conn).map_err(|e| e.to_string())?;
        let qh = queue.handle();

        let manager = globals
            .bind::<ExtBackgroundEffectManagerV1, BlurInit, ()>(&qh, 1..=1, ())
            .map_err(|_| {
                "Compositor does not advertise ext_background_effect_manager_v1".to_string()
            })?;

        // Wrap the window's wl_surface (owned by GTK) so we can send requests on it.
        let surface_id = unsafe { ObjectId::from_ptr(WlSurface::interface(), surface as *mut _) }
            .map_err(|e| e.to_string())?;
        let surface = WlSurface::from_id(&conn, surface_id).map_err(|e| e.to_string())?;

        let compositor = globals
            .bind::<WlCompositor, BlurInit, ()>(&qh, 4..=6, ())
            .map_err(|_| "Failed to bind wl_compositor".to_string())?;

        let effect = manager.get_background_effect(&surface, &qh, ());

        log::debug!("Blur spec: strength={} panel={:?} exclude_panel={}", spec.strength, spec.panel, spec.exclude_panel);

        // Region coordinates are surface-local (logical pixels); the
        // compositor clips them to the surface size. The region covers the
        // whole window unless the panel rectangle limits it, and the panel
        // is cut out entirely when it is opaque (video background).
        let region = compositor.create_region(&qh, ());
        match (spec.strength.as_str(), spec.panel, spec.exclude_panel) {
            // Whole window.
            ("full", None, _) | ("light", None, _) => {
                region.add(0, 0, i32::MAX, i32::MAX);
            }
            // Light: blur only behind the canvas panel.
            ("light", Some((x, y, w, h)), false) => {
                region.add(x, y, w, h);
            }
            // Full with a video background: blur everything except the panel,
            // so the animated video never forces the blur to re-render below it.
            ("full", Some((x, y, w, h)), true) => {
                let (ww, wh) = spec.window_size;
                add_strip(&region, 0, 0, ww, y); // above the panel
                add_strip(&region, 0, y + h, ww, wh - y - h); // below
                add_strip(&region, 0, y, x, h); // left of it
                add_strip(&region, x + w, y, ww - x - w, h); // right of it
            }
            // Light with a video background: the only intended area is the
            // panel, which is opaque — nothing visible to blur, so none.
            ("light", Some(_), true) => {}
            // Fallback: whole window.
            _ => {
                region.add(0, 0, i32::MAX, i32::MAX);
            }
        }
        effect.set_blur_region(Some(&region));

        // The blur region is double-buffered: it only takes effect on the
        // next wl_surface.commit. Commit once; GTK commits again on every frame.
        surface.commit();
        conn.flush().map_err(|e| e.to_string())?;

        log::info!("Applied native Wayland blur (ext-background-effect-v1)");
        Ok(BlurInner::Wayland { conn, effect })
    }
}

/// Adds a rectangle to a `wl_region`, skipping degenerate (zero-size) rects.
#[cfg(target_os = "linux")]
fn add_strip(region: &wayland_client::protocol::wl_region::WlRegion, x: i32, y: i32, w: i32, h: i32) {
    if w > 0 && h > 0 {
        region.add(x, y, w, h);
    }
}

/// Sets the X11 `_KDE_NET_WM_BLUR_BEHIND_REGION` window property.
///
/// Honored by KWin and picom. `1` means "blur the whole window background";
/// `0` disables the blur again.
#[cfg(target_os = "linux")]
fn set_x11_blur(xid: std::ffi::c_ulong, value: u32) -> Result<(), String> {
    use x11rb::connection::Connection as _;
    use x11rb::protocol::xproto::{AtomEnum, PropMode};
    use x11rb::protocol::xproto::ConnectionExt as XProtoConnectionExt;
    use x11rb::wrapper::ConnectionExt as _;

    let (conn, _) = x11rb::connect(None).map_err(|e| e.to_string())?;

    let atom = conn
        .intern_atom(false, b"_KDE_NET_WM_BLUR_BEHIND_REGION")
        .map_err(|e| e.to_string())?
        .reply()
        .map_err(|e| e.to_string())?
        .atom;

    conn.change_property32(PropMode::REPLACE, xid as u32, atom, AtomEnum::CARDINAL, &[value])
        .map_err(|e| e.to_string())?
        .check()
        .map_err(|e| e.to_string())?;
    conn.flush().map_err(|e| e.to_string())?;

    if value != 0 {
        log::info!("Applied X11 blur-behind (_KDE_NET_WM_BLUR_BEHIND_REGION)");
    }
    Ok(())
}
