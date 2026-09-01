//! Embedded localhost HTTP server for streaming background videos.
//!
//! Why this exists: on Linux (WebKitGTK) a `<video>` cannot play from the
//! asset:// protocol, and data: URLs only work up to a few dozen MB before
//! the media engine rejects them. A real http:// URL with Range support
//! streams from disk with constant memory, so any file size plays.
//!
//! The server only serves files the user explicitly picked as a background
//! video. Each file gets an unguessable id and the server binds to
//! 127.0.0.1 on a random port, so nothing is reachable from outside.

use std::collections::HashMap;
use std::collections::hash_map::DefaultHasher;
use std::fs::File;
use std::hash::{Hash, Hasher};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use super::canvas::get_config_dir;

const VIDEO_EXTENSIONS: [&str; 6] = ["mp4", "webm", "mov", "m4v", "ogv", "mkv"];

fn mime_for_extension(ext: &str) -> &'static str {
    match ext {
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "ogv" => "video/ogg",
        "mkv" => "video/x-matroska",
        _ => "video/mp4",
    }
}

struct MediaServerInner {
    port: Option<u16>,
    videos: HashMap<String, PathBuf>,
}

/// Shared state managed by Tauri. Holds the lazily-started server port and
/// the id -> file registry.
pub struct MediaServerState {
    inner: Arc<Mutex<MediaServerInner>>,
}

impl MediaServerState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(MediaServerInner {
                port: None,
                videos: HashMap::new(),
            })),
        }
    }
}

static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Walks the top-level ISO-BMFF box structure and returns true when a
/// `moof` (movie fragment) box exists, i.e. the file is a fragmented MP4.
///
/// Fragmented MP4s (typical for stock-video downloads and screen
/// recordings) wedge the WebKitGTK media pipeline: playback stops after a
/// few frames. Remuxing them into a plain MP4 fixes playback.
fn is_fragmented_mp4(path: &Path) -> bool {
    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return false,
    };
    let file_len = file.metadata().map(|m| m.len()).unwrap_or(0);
    let mut pos: u64 = 0;
    let mut header = [0u8; 16];
    while pos + 8 <= file_len {
        if file.read_exact(&mut header[..8]).is_err() {
            return false;
        }
        let size32 = u32::from_be_bytes(header[0..4].try_into().unwrap());
        let box_type: [u8; 4] = header[4..8].try_into().unwrap();
        let mut box_size = size32 as u64;
        if size32 == 1 {
            // 64-bit "largesize" follows the 8-byte header.
            if file.read_exact(&mut header[8..16]).is_err() {
                return false;
            }
            box_size = u64::from_be_bytes(header[8..16].try_into().unwrap());
        } else if size32 == 0 {
            box_size = file_len - pos; // box extends to end of file
        }
        if box_type == *b"moof" {
            return true;
        }
        if box_size < 8 {
            return false; // corrupt structure, stop walking
        }
        pos += box_size;
        if file.seek(SeekFrom::Start(pos)).is_err() {
            return false;
        }
    }
    false
}

/// Returns a cache path for the remuxed copy of the given source file.
/// The name hashes the source path, size and mtime so any change to the
/// source produces a fresh cache entry.
fn remux_cache_path(source: &Path) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    source.hash(&mut hasher);
    if let Ok(meta) = source.metadata() {
        meta.len().hash(&mut hasher);
        if let Ok(mtime) = meta.modified() {
            if let Ok(nanos) = mtime.duration_since(UNIX_EPOCH) {
                nanos.as_nanos().hash(&mut hasher);
            }
        }
    }
    get_config_dir()
        .join("video_cache")
        .join(format!("{:016x}.mp4", hasher.finish()))
}

/// Remuxes a fragmented MP4 into a plain MP4 with ffmpeg (stream copy, so
/// no re-encode and no quality loss) and caches the result. Falls back to
/// the original path when ffmpeg is unavailable or the remux fails.
fn defragment_if_needed(source: PathBuf) -> PathBuf {
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    // Only ISO-BMFF containers can be fragmented (webm/ogv/mkv cannot).
    if !matches!(ext.as_str(), "mp4" | "m4v" | "mov") || !is_fragmented_mp4(&source) {
        return source;
    }

    let cache_path = remux_cache_path(&source);
    if cache_path.is_file() {
        log::info!("Using cached remux for fragmented video: {:?}", source);
        return cache_path;
    }
    let cache_dir = cache_path.parent().unwrap().to_path_buf();
    if let Err(e) = std::fs::create_dir_all(&cache_dir) {
        log::warn!("Cannot create video cache dir: {}", e);
        return source;
    }

    log::info!("Remuxing fragmented MP4 (one-time): {:?} -> {:?}", source, cache_path);
    let tmp_path = cache_path.with_extension("tmp.mp4");
    let result = std::process::Command::new("ffmpeg")
        .args(["-y", "-v", "error", "-i"])
        .arg(&source)
        .args(["-c", "copy"])
        .arg(&tmp_path)
        .output();
    match result {
        Ok(output) if output.status.success() && tmp_path.is_file() => {
            if let Err(e) = std::fs::rename(&tmp_path, &cache_path) {
                log::warn!("Failed to finalize remux: {}", e);
                let _ = std::fs::remove_file(&tmp_path);
                return source;
            }
            cache_path
        }
        Ok(output) => {
            log::warn!(
                "ffmpeg remux failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            let _ = std::fs::remove_file(&tmp_path);
            source
        }
        Err(e) => {
            log::warn!("ffmpeg not available, cannot remux fragmented MP4: {}", e);
            source
        }
    }
}

/// Registers a video file and returns its streaming URL.
#[tauri::command]
pub fn register_background_video(
    state: tauri::State<MediaServerState>,
    path: String,
) -> Result<String, String> {
    let path_buf = defragment_if_needed(PathBuf::from(&path));
    if !path_buf.is_file() {
        return Err(format!("Video file does not exist: {}", path));
    }
    let ext = path_buf
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    if !VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        return Err(format!("Unsupported video extension: {}", ext));
    }

    let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
    if inner.port.is_none() {
        inner.port = Some(start_server(state.inner.clone())?);
    }

    // Unguessable id: hash of path + timestamp + a process-wide counter.
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
        .hash(&mut hasher);
    ID_COUNTER.fetch_add(1, Ordering::Relaxed).hash(&mut hasher);
    let id = format!("{:016x}", hasher.finish());

    inner.videos.insert(id.clone(), path_buf);
    let port = inner.port.unwrap();
    log::info!("Registered background video {} as /{}.{}", path, id, ext);
    Ok(format!("http://127.0.0.1:{}/{}.{}", port, id, ext))
}

fn start_server(inner: Arc<Mutex<MediaServerInner>>) -> Result<u16, String> {
    let server = tiny_http::Server::http("127.0.0.1:0")
        .map_err(|e| format!("Failed to start media server: {}", e))?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or_else(|| "Media server has no IP address".to_string())?
        .port();
    std::thread::spawn(move || {
        for request in server.incoming_requests() {
            // Each request gets its own thread: a streaming GET keeps its
            // connection open for the whole playback, and the media engine
            // must be able to issue further range requests (e.g. seeking to
            // the moov atom) on parallel connections meanwhile.
            let inner = inner.clone();
            std::thread::spawn(move || {
                if let Err(e) = handle_request(request, &inner) {
                    log::debug!("Media server request failed: {}", e);
                }
            });
        }
    });
    log::info!("Media server listening on 127.0.0.1:{}", port);
    Ok(port)
}

/// Parses an HTTP "Range: bytes=start-end" header into (start, end)
/// inclusive positions clamped to the file size.
fn parse_range(header: &str, file_size: u64) -> Option<(u64, u64)> {
    let spec = header.strip_prefix("bytes=")?;
    let (start_s, end_s) = spec.split_once('-')?;
    if start_s.is_empty() {
        // Suffix range "bytes=-N": the last N bytes.
        let n: u64 = end_s.parse().ok()?;
        let start = file_size.saturating_sub(n);
        Some((start, file_size.saturating_sub(1)))
    } else {
        let start: u64 = start_s.parse().ok()?;
        let end: u64 = if end_s.is_empty() {
            file_size.saturating_sub(1)
        } else {
            end_s.parse().ok()?
        };
        if start >= file_size || start > end {
            return None;
        }
        Some((start, end.min(file_size.saturating_sub(1))))
    }
}

fn handle_request(
    request: tiny_http::Request,
    inner: &Arc<Mutex<MediaServerInner>>,
) -> Result<(), String> {
    // URL form: "/<id>.<ext>"
    let url = request.url().trim_start_matches('/').to_string();
    let id = url.split('.').next().unwrap_or("").to_string();

    let range_header = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .map(|h| h.value.to_string());
    log::debug!(
        "Media server: {} {} (range: {:?})",
        request.method(),
        request.url(),
        range_header
    );

    let lookup = {
        let inner = inner.lock().map_err(|e| e.to_string())?;
        inner.videos.get(&id).cloned()
    };
    let Some(path) = lookup else {
        return request
            .respond(tiny_http::Response::empty(404))
            .map_err(|e| e.to_string());
    };

    let mut file = File::open(&path).map_err(|e| format!("Cannot open {:?}: {}", path, e))?;
    let file_size = file.metadata().map_err(|e| e.to_string())?.len();
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default();

    let (status, start, length) = match range_header
        .as_deref()
        .and_then(|h| parse_range(h, file_size))
    {
        Some((start, end)) => {
            file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
            (206, start, end - start + 1)
        }
        None => (200, 0, file_size),
    };

    let mut response = tiny_http::Response::empty(status)
        .with_data(file.take(length), Some(length as usize))
        // tiny_http switches to chunked transfer-encoding for bodies of 32KB
        // or more, which drops Content-Length. The media engine needs the
        // file size to treat the source as seekable, so always send it.
        .with_chunked_threshold(usize::MAX);
    response.add_header(header("Content-Type", mime_for_extension(ext)));
    response.add_header(header("Accept-Ranges", "bytes"));
    // The webview page origin (http://localhost:1420 in dev) differs from
    // this server, so allow cross-origin media loads explicitly.
    response.add_header(header("Access-Control-Allow-Origin", "*"));
    if status == 206 {
        response.add_header(header(
            "Content-Range",
            &format!("bytes {}-{}/{}", start, start + length - 1, file_size),
        ));
    }
    request.respond(response).map_err(|e| e.to_string())
}

fn header(name: &str, value: &str) -> tiny_http::Header {
    tiny_http::Header::from_bytes(name.as_bytes(), value.as_bytes())
        .expect("valid header name/value")
}

#[cfg(test)]
mod tests {
    use super::{is_fragmented_mp4, parse_range};

    #[test]
    fn parses_open_ended_range() {
        assert_eq!(parse_range("bytes=100-", 1000), Some((100, 999)));
    }

    #[test]
    fn parses_closed_range() {
        assert_eq!(parse_range("bytes=0-499", 1000), Some((0, 499)));
    }

    #[test]
    fn parses_suffix_range() {
        assert_eq!(parse_range("bytes=-100", 1000), Some((900, 999)));
    }

    #[test]
    fn clamps_end_to_file_size() {
        assert_eq!(parse_range("bytes=500-9999", 1000), Some((500, 999)));
    }

    #[test]
    fn rejects_garbage() {
        assert_eq!(parse_range("nonsense", 1000), None);
        assert_eq!(parse_range("bytes=abc-def", 1000), None);
        assert_eq!(parse_range("bytes=2000-", 1000), None);
        assert_eq!(parse_range("bytes=500-100", 1000), None);
    }

    /// Builds a fake MP4 top-level structure from (type, payload size) pairs.
    fn fake_mp4(boxes: &[(&[u8; 4], u32)]) -> Vec<u8> {
        let mut data = Vec::new();
        for (name, payload) in boxes {
            data.extend_from_slice(&(payload + 8).to_be_bytes());
            data.extend_from_slice(name.as_slice());
            data.extend(std::iter::repeat(0u8).take(*payload as usize));
        }
        data
    }

    fn with_temp_mp4(name: &str, contents: &[u8], check: impl Fn(&Path)) {
        let path = std::env::temp_dir().join(format!("fal_test_{}_{}.mp4", name, std::process::id()));
        std::fs::write(&path, contents).unwrap();
        check(&path);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn detects_fragmented_mp4() {
        let data = fake_mp4(&[(b"ftyp", 16), (b"moov", 24), (b"moof", 16), (b"mdat", 32)]);
        with_temp_mp4("fragmented", &data, |p| assert!(is_fragmented_mp4(p)));
    }

    #[test]
    fn plain_mp4_is_not_fragmented() {
        let data = fake_mp4(&[(b"ftyp", 16), (b"moov", 24), (b"mdat", 32)]);
        with_temp_mp4("plain", &data, |p| assert!(!is_fragmented_mp4(p)));
    }

    #[test]
    fn moof_after_big_mdat_is_still_detected() {
        let data = fake_mp4(&[(b"ftyp", 16), (b"mdat", 100_000), (b"moof", 16)]);
        with_temp_mp4("moof_late", &data, |p| assert!(is_fragmented_mp4(p)));
    }

    use super::Path;
}
