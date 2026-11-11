//! Screenshot of the canvas for the AI chat's `screenshot_canvas` tool.
//!
//! The canvas window is a transparent overlay, so the screenshot shows the
//! webview's own rendering (no desktop behind it). Linux only for now: it
//! uses WebKitGTK's snapshot API and encodes the result with cairo.

use serde::Deserialize;

#[derive(Deserialize, Clone, Copy)]
pub struct CropRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// Viewport width in CSS pixels, to map the crop onto device pixels.
    pub viewport_width: f64,
}

#[tauri::command]
pub async fn ai_canvas_snapshot(
    window: tauri::WebviewWindow,
    crop: Option<CropRect>,
    max_side: u32,
) -> Result<String, String> {
    snapshot(window, crop, max_side.clamp(256, 2048)).await
}

#[cfg(target_os = "linux")]
async fn snapshot(window: tauri::WebviewWindow, crop: Option<CropRect>, max_side: u32) -> Result<String, String> {
    use base64::Engine;

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<Vec<u8>, String>>();
    window
        .with_webview(move |webview| {
            use webkit2gtk::{SnapshotOptions, SnapshotRegion, WebViewExt};
            let view = webview.inner();
            view.snapshot(
                SnapshotRegion::Visible,
                SnapshotOptions::NONE,
                None::<&webkit2gtk::gio::Cancellable>,
                move |result| {
                    let _ = tx.send(
                        result
                            .map_err(|e| format!("snapshot failed: {e}"))
                            .and_then(|surface| encode(&surface, crop, max_side)),
                    );
                },
            );
        })
        .map_err(|e| format!("snapshot failed: {e}"))?;
    let png = tokio::time::timeout(std::time::Duration::from_secs(10), rx)
        .await
        .map_err(|_| "snapshot timed out".to_string())?
        .map_err(|_| "snapshot was cancelled".to_string())??;
    Ok(base64::engine::general_purpose::STANDARD.encode(png))
}

#[cfg(target_os = "linux")]
fn encode(surface: &cairo::Surface, crop: Option<CropRect>, max_side: u32) -> Result<Vec<u8>, String> {
    let image = cairo::ImageSurface::try_from(surface.clone())
        .map_err(|_| "unexpected snapshot surface".to_string())?;
    let (full_w, full_h) = (image.width() as f64, image.height() as f64);
    let (x, y, w, h) = match crop {
        Some(rect) => {
            let ratio = if rect.viewport_width > 0.0 { full_w / rect.viewport_width } else { 1.0 };
            let x = (rect.x * ratio).clamp(0.0, full_w);
            let y = (rect.y * ratio).clamp(0.0, full_h);
            let w = (rect.width * ratio).min(full_w - x).max(1.0);
            let h = (rect.height * ratio).min(full_h - y).max(1.0);
            (x, y, w, h)
        }
        None => (0.0, 0.0, full_w, full_h),
    };
    let scale = (max_side as f64 / w.max(h)).min(1.0);
    let out_w = ((w * scale).round() as i32).max(1);
    let out_h = ((h * scale).round() as i32).max(1);

    let out = cairo::ImageSurface::create(cairo::Format::ARgb32, out_w, out_h)
        .map_err(|e| format!("snapshot encode failed: {e}"))?;
    {
        let cr = cairo::Context::new(&out).map_err(|e| format!("snapshot encode failed: {e}"))?;
        cr.set_source_rgb(0.08, 0.08, 0.1);
        cr.paint().map_err(|e| e.to_string())?;
        cr.scale(scale, scale);
        cr.set_source_surface(&image, -x, -y).map_err(|e| e.to_string())?;
        cr.paint().map_err(|e| e.to_string())?;
    }
    let mut png = Vec::new();
    out.write_to_png(&mut png)
        .map_err(|e| format!("snapshot encode failed: {e}"))?;
    Ok(png)
}

#[cfg(not(target_os = "linux"))]
async fn snapshot(_window: tauri::WebviewWindow, _crop: Option<CropRect>, _max_side: u32) -> Result<String, String> {
    Err("Canvas screenshots are only available on Linux for now".to_string())
}
