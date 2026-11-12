//! Screenshot of the canvas for the AI chat's `screenshot_canvas` tool.
//!
//! The canvas window is a transparent overlay, so the screenshot shows the
//! webview's own rendering (no desktop behind it). Linux uses WebKitGTK's
//! snapshot API with cairo, Windows WebView2's CapturePreview, macOS
//! WKWebView's takeSnapshot.

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

/// Crops (CSS-pixel rect mapped by the viewport width) and downscales a PNG.
#[cfg(not(target_os = "linux"))]
fn crop_png(png: &[u8], crop: Option<CropRect>, max_side: u32) -> Result<Vec<u8>, String> {
    let image = image::load_from_memory_with_format(png, image::ImageFormat::Png)
        .map_err(|e| format!("snapshot decode failed: {e}"))?;
    let (full_w, full_h) = (image.width() as f64, image.height() as f64);
    let image = match crop {
        Some(rect) => {
            let ratio = if rect.viewport_width > 0.0 { full_w / rect.viewport_width } else { 1.0 };
            let x = (rect.x * ratio).clamp(0.0, full_w);
            let y = (rect.y * ratio).clamp(0.0, full_h);
            let w = (rect.width * ratio).min(full_w - x).max(1.0);
            let h = (rect.height * ratio).min(full_h - y).max(1.0);
            image.crop_imm(x as u32, y as u32, w as u32, h as u32)
        }
        None => image,
    };
    let image = if image.width().max(image.height()) > max_side {
        image.resize(max_side, max_side, image::imageops::FilterType::Triangle)
    } else {
        image
    };
    let mut out = std::io::Cursor::new(Vec::new());
    image
        .write_to(&mut out, image::ImageFormat::Png)
        .map_err(|e| format!("snapshot encode failed: {e}"))?;
    Ok(out.into_inner())
}

#[cfg(not(target_os = "linux"))]
async fn snapshot(window: tauri::WebviewWindow, crop: Option<CropRect>, max_side: u32) -> Result<String, String> {
    use base64::Engine;

    let (tx, rx) = tokio::sync::oneshot::channel::<Result<Vec<u8>, String>>();
    let tx = std::sync::Mutex::new(Some(tx));
    let done: Box<dyn FnOnce(Result<Vec<u8>, String>) + Send> = Box::new(move |result| {
        if let Some(tx) = tx.lock().ok().and_then(|mut t| t.take()) {
            let _ = tx.send(result);
        }
    });
    window
        .with_webview(move |webview| platform::capture(webview, done))
        .map_err(|e| format!("snapshot failed: {e}"))?;
    let png = tokio::time::timeout(std::time::Duration::from_secs(10), rx)
        .await
        .map_err(|_| "snapshot timed out".to_string())?
        .map_err(|_| "snapshot was cancelled".to_string())??;
    let png = crop_png(&png, crop, max_side)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(png))
}

#[cfg(target_os = "windows")]
mod platform {
    use webview2_com::CapturePreviewCompletedHandler;
    use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG;
    use windows_61::Win32::System::Com::{IStream, STATFLAG_NONAME, STREAM_SEEK_SET};
    use windows_61::Win32::UI::Shell::SHCreateMemStream;

    type Done = Box<dyn FnOnce(Result<Vec<u8>, String>) + Send>;

    pub fn capture(webview: tauri::webview::PlatformWebview, done: Done) {
        let done = std::sync::Arc::new(std::sync::Mutex::new(Some(done)));
        let finish = {
            let done = done.clone();
            move |result: Result<Vec<u8>, String>| {
                if let Some(done) = done.lock().ok().and_then(|mut d| d.take()) {
                    done(result);
                }
            }
        };
        let fail = finish.clone();
        let started = (|| -> Result<(), String> {
            let core = unsafe { webview.controller().CoreWebView2() }.map_err(|e| e.to_string())?;
            let stream: IStream =
                unsafe { SHCreateMemStream(None) }.ok_or("cannot create a memory stream")?;
            let handler_stream = stream.clone();
            let handler = CapturePreviewCompletedHandler::create(Box::new(move |status| {
                finish(
                    status
                        .map_err(|e| format!("snapshot failed: {e}"))
                        .and_then(|_| read_stream(&handler_stream)),
                );
                Ok(())
            }));
            unsafe {
                core.CapturePreview(COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG, &stream, &handler)
            }
            .map_err(|e| format!("snapshot failed: {e}"))
        })();
        if let Err(error) = started {
            fail(Err(error));
        }
    }

    fn read_stream(stream: &IStream) -> Result<Vec<u8>, String> {
        unsafe {
            let mut stat = Default::default();
            stream.Stat(&mut stat, STATFLAG_NONAME).map_err(|e| e.to_string())?;
            stream.Seek(0, STREAM_SEEK_SET, None).map_err(|e| e.to_string())?;
            let mut bytes = vec![0u8; stat.cbSize as usize];
            let mut read = 0u32;
            stream
                .Read(bytes.as_mut_ptr().cast(), bytes.len() as u32, Some(&mut read))
                .ok()
                .map_err(|e| e.to_string())?;
            bytes.truncate(read as usize);
            Ok(bytes)
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use block2::RcBlock;
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
    use objc2_foundation::{NSDictionary, NSError};
    use objc2_web_kit::WKWebView;

    type Done = Box<dyn FnOnce(Result<Vec<u8>, String>) + Send>;

    pub fn capture(webview: tauri::webview::PlatformWebview, done: Done) {
        let done = std::cell::RefCell::new(Some(done));
        unsafe {
            let view: &WKWebView = &*(webview.inner() as *const WKWebView);
            let block = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
                let Some(done) = done.borrow_mut().take() else { return };
                if image.is_null() {
                    done(Err(if error.is_null() {
                        "snapshot failed".to_string()
                    } else {
                        format!("snapshot failed: {}", (*error).localizedDescription())
                    }));
                    return;
                }
                done(png_of(&*image));
            });
            view.takeSnapshotWithConfiguration_completionHandler(None, &block);
        }
    }

    unsafe fn png_of(image: &NSImage) -> Result<Vec<u8>, String> {
        let tiff = image.TIFFRepresentation().ok_or("snapshot has no bitmap data")?;
        let rep = NSBitmapImageRep::imageRepWithData(&tiff).ok_or("snapshot has no bitmap data")?;
        let png = rep
            .representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
            .ok_or("cannot encode snapshot")?;
        Ok(png.to_vec())
    }
}

#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
mod platform {
    pub fn capture(
        _webview: tauri::webview::PlatformWebview,
        done: Box<dyn FnOnce(Result<Vec<u8>, String>) + Send>,
    ) {
        done(Err("Canvas screenshots are not supported on this system".to_string()));
    }
}
