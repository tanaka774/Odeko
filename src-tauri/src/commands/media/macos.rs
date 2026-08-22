use std::os::raw::{c_char, c_void};
use std::process::Command;
use std::ptr;
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose, Engine as _};
use block2::{Block, RcBlock};
use core_foundation::array::{CFArray, CFArrayRef};
use core_foundation::base::{Boolean, CFRelease, CFRetain, CFType, CFTypeRef, TCFType};
use core_foundation::bundle::CFBundle;
use core_foundation::data::CFData;
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
use core_foundation::number::CFNumber;
use core_foundation::string::{CFString, CFStringRef};
use core_foundation::url::{kCFURLPOSIXPathStyle, CFURL};

use super::super::errors::Error;
use super::{
    extract_twitch_username, extract_youtube_video_id, get_twitch_thumbnail_url,
    get_youtube_thumbnail_url, MediaInfo, PlayerInfo,
};

const MACOS_NOW_PLAYING_IDENTITY: &str = "macos-now-playing";
const DEFAULT_PLAYER_NAME: &str = "Mac Now Playing";
const MEDIA_REMOTE_TIMEOUT: Duration = Duration::from_millis(800);
const PLAYER_CACHE_TTL: Duration = Duration::from_millis(700);
const SCRIPT_FIELD_SEPARATOR: char = '\u{1f}';
const SPOTIFY_IDENTITY: &str = "spotify";
const MUSIC_IDENTITY: &str = "apple-music";

type DispatchQueue = *mut c_void;
type MediaRemoteObjectRef = CFTypeRef;
type NowPlayingInfoRef = *const c_void;
type NowPlayingArtworkRef = *const c_void;
type PlayerPathArrayRef = *const c_void;
type GetNowPlayingInfoBlock = Block<dyn Fn(NowPlayingInfoRef)>;
type GetNowPlayingInfoFn = unsafe extern "C" fn(DispatchQueue, &GetNowPlayingInfoBlock);
type GetNowPlayingInfoForPlayerBlock = Block<dyn Fn(NowPlayingInfoRef, NowPlayingArtworkRef)>;
type GetPlayerPathsBlock = Block<dyn Fn(PlayerPathArrayRef)>;
type GetLocalOriginFn = unsafe extern "C" fn() -> MediaRemoteObjectRef;
type GetActivePlayerPathsForOriginFn =
    unsafe extern "C" fn(MediaRemoteObjectRef, DispatchQueue, &GetPlayerPathsBlock);
type GetNowPlayingInfoForPlayerFn = unsafe extern "C" fn(
    MediaRemoteObjectRef,
    Boolean,
    DispatchQueue,
    &GetNowPlayingInfoForPlayerBlock,
);
type MediaRemoteObjectGetterFn = unsafe extern "C" fn(MediaRemoteObjectRef) -> MediaRemoteObjectRef;
type MediaRemoteStringGetterFn = unsafe extern "C" fn(MediaRemoteObjectRef) -> CFStringRef;
type SendCommandFn = unsafe extern "C" fn(i32, *const c_void) -> Boolean;

#[derive(Clone, Copy)]
struct MediaRemote {
    get_now_playing_info: GetNowPlayingInfoFn,
    get_local_origin: Option<GetLocalOriginFn>,
    get_active_player_paths_for_origin: Option<GetActivePlayerPathsForOriginFn>,
    get_now_playing_info_for_player: Option<GetNowPlayingInfoForPlayerFn>,
    player_path_get_client: Option<MediaRemoteObjectGetterFn>,
    player_path_get_player: Option<MediaRemoteObjectGetterFn>,
    client_get_bundle_identifier: Option<MediaRemoteStringGetterFn>,
    client_get_display_name: Option<MediaRemoteStringGetterFn>,
    player_get_display_name: Option<MediaRemoteStringGetterFn>,
    player_get_identifier: Option<MediaRemoteStringGetterFn>,
    send_command: SendCommandFn,
}

#[derive(Debug, Clone)]
struct MacPlayer {
    name: String,
    identity: String,
    is_playing: bool,
    title: String,
    artist: String,
    album: String,
    duration: f64,
    position: f64,
    art_url: Option<String>,
    track_url: Option<String>,
}

#[derive(Debug, Clone)]
struct MediaRemotePlayerSource {
    name: String,
    identity: String,
    bundle_id: Option<String>,
}

#[link(name = "System", kind = "dylib")]
extern "C" {
    fn dispatch_queue_create(label: *const c_char, attr: *const c_void) -> DispatchQueue;
}

fn media_remote() -> Result<&'static MediaRemote, Error> {
    static MEDIA_REMOTE: OnceLock<Result<MediaRemote, String>> = OnceLock::new();

    MEDIA_REMOTE
        .get_or_init(load_media_remote)
        .as_ref()
        .map_err(|message| io_error(message.clone()))
}

fn load_media_remote() -> Result<MediaRemote, String> {
    let bundle = media_remote_bundle()?;

    unsafe {
        let remote = MediaRemote {
            get_now_playing_info: load_required_symbol(&bundle, "MRMediaRemoteGetNowPlayingInfo")?,
            get_local_origin: load_optional_symbol(&bundle, "MRMediaRemoteGetLocalOrigin"),
            get_active_player_paths_for_origin: load_optional_symbol(
                &bundle,
                "MRMediaRemoteGetActivePlayerPathsForOrigin",
            ),
            get_now_playing_info_for_player: load_optional_symbol(
                &bundle,
                "MRMediaRemoteGetNowPlayingInfoForPlayer",
            ),
            player_path_get_client: load_optional_symbol(
                &bundle,
                "MRNowPlayingPlayerPathGetClient",
            ),
            player_path_get_player: load_optional_symbol(
                &bundle,
                "MRNowPlayingPlayerPathGetPlayer",
            ),
            client_get_bundle_identifier: load_optional_symbol(
                &bundle,
                "MRNowPlayingClientGetBundleIdentifier",
            ),
            client_get_display_name: load_optional_symbol(
                &bundle,
                "MRNowPlayingClientGetDisplayName",
            ),
            player_get_display_name: load_optional_symbol(
                &bundle,
                "MRNowPlayingPlayerGetDisplayName",
            ),
            player_get_identifier: load_optional_symbol(&bundle, "MRNowPlayingPlayerGetIdentifier"),
            send_command: load_required_symbol(&bundle, "MRMediaRemoteSendCommand")?,
        };

        // Keep the bundle loaded for the lifetime of the cached function pointers.
        std::mem::forget(bundle);
        Ok(remote)
    }
}

fn media_remote_bundle() -> Result<CFBundle, String> {
    let url = CFURL::from_file_system_path(
        CFString::from_static_string("/System/Library/PrivateFrameworks/MediaRemote.framework"),
        kCFURLPOSIXPathStyle,
        true,
    );

    CFBundle::new(url).ok_or_else(|| "Failed to load MediaRemote.framework bundle".to_string())
}

unsafe fn load_required_symbol<T>(bundle: &CFBundle, name: &'static str) -> Result<T, String> {
    let symbol = bundle.function_pointer_for_name(CFString::from_static_string(name));

    if symbol.is_null() {
        return Err(format!("Failed to load MediaRemote symbol '{}'", name));
    }

    Ok(std::mem::transmute_copy(&symbol))
}

unsafe fn load_optional_symbol<T>(bundle: &CFBundle, name: &'static str) -> Option<T> {
    let symbol = bundle.function_pointer_for_name(CFString::from_static_string(name));

    if symbol.is_null() {
        return None;
    }

    Some(std::mem::transmute_copy(&symbol))
}

fn media_remote_queue() -> DispatchQueue {
    static MEDIA_REMOTE_QUEUE: OnceLock<usize> = OnceLock::new();

    *MEDIA_REMOTE_QUEUE.get_or_init(|| unsafe {
        dispatch_queue_create(
            b"com.odeko.mediaremote\0".as_ptr().cast(),
            ptr::null(),
        ) as usize
    }) as DispatchQueue
}

async fn get_mac_players() -> Result<Vec<MacPlayer>, Error> {
    // MediaRemote calls are asynchronous, so keep the blocking wait off Tauri's command runtime.
    tauri::async_runtime::spawn_blocking(cached_mac_players_blocking)
        .await
        .map_err(|error| io_error(format!("MediaRemote task failed: {}", error)))?
}

fn cached_mac_players_blocking() -> Result<Vec<MacPlayer>, Error> {
    static PLAYER_CACHE: OnceLock<Mutex<Option<(Instant, Vec<MacPlayer>)>>> = OnceLock::new();

    let cache = PLAYER_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some((cached_at, players)) = &*guard {
            if cached_at.elapsed() < PLAYER_CACHE_TTL {
                return Ok(players.clone());
            }
        }
    }

    let players = get_mac_players_blocking()?;

    if let Ok(mut guard) = cache.lock() {
        *guard = Some((Instant::now(), players.clone()));
    }

    Ok(players)
}

fn get_mac_players_blocking() -> Result<Vec<MacPlayer>, Error> {
    let mut players = Vec::new();

    match media_remote() {
        Ok(remote) => {
            for player in get_media_remote_players(remote) {
                upsert_player(&mut players, player);
            }
        }
        Err(error) => {
            log::info!("macOS MediaRemote load failed: {}", error);
        }
    }

    for player in get_scripted_players() {
        upsert_player(&mut players, player);
    }

    Ok(players)
}

fn get_media_remote_players(remote: &MediaRemote) -> Vec<MacPlayer> {
    let mut players = Vec::new();

    let player_paths = get_active_player_paths(remote);
    let mut fallback_source = None;

    for player_path in player_paths {
        let source = player_source_from_path(remote, player_path);
        fallback_source.get_or_insert_with(|| source.clone());

        if let Some(player) =
            get_player_path_now_playing_player(remote, player_path, source.clone())
        {
            upsert_player(&mut players, player);
        }

        unsafe {
            CFRelease(player_path);
        }
    }

    if players.is_empty() {
        if let Some(source) = fallback_source.as_ref() {
            if let Some(player) = get_browser_player_from_source(source) {
                upsert_player(&mut players, player);
            }
        }
    }

    if players.is_empty() {
        // Some players expose their app identity through the active path, but only return metadata
        // through the global now-playing query.
        if let Some(source) = fallback_source {
            if let Some(player) = get_now_playing_player_for_source(remote, source) {
                upsert_player(&mut players, player);
            }
        }
    }

    if players.is_empty() {
        if let Some(player) = get_now_playing_player_for_source(remote, default_player_source()) {
            upsert_player(&mut players, player);
        }
    }

    players
}

fn get_active_player_paths(remote: &MediaRemote) -> Vec<MediaRemoteObjectRef> {
    let Some(get_active_player_paths_for_origin) = remote.get_active_player_paths_for_origin else {
        return Vec::new();
    };

    let origin = remote
        .get_local_origin
        .map(|get_local_origin| unsafe { get_local_origin() })
        .unwrap_or(ptr::null());
    let (sender, receiver) = mpsc::channel();

    let block: RcBlock<dyn Fn(PlayerPathArrayRef)> =
        RcBlock::new(move |paths: PlayerPathArrayRef| {
            let _ = sender.send(retain_array_values(paths as CFArrayRef));
        });

    unsafe {
        get_active_player_paths_for_origin(origin, media_remote_queue(), &block);
    }

    receiver
        .recv_timeout(MEDIA_REMOTE_TIMEOUT)
        .unwrap_or_default()
}

fn retain_array_values(array: CFArrayRef) -> Vec<MediaRemoteObjectRef> {
    if array.is_null() {
        return Vec::new();
    }

    let array: CFArray<MediaRemoteObjectRef> = unsafe { CFArray::wrap_under_get_rule(array) };

    array
        .get_all_values()
        .into_iter()
        .filter(|value| !value.is_null())
        .map(|value| unsafe { CFRetain(value as CFTypeRef) })
        .collect()
}

fn default_player_source() -> MediaRemotePlayerSource {
    MediaRemotePlayerSource {
        name: DEFAULT_PLAYER_NAME.to_string(),
        identity: MACOS_NOW_PLAYING_IDENTITY.to_string(),
        bundle_id: None,
    }
}

fn get_now_playing_player_for_source(
    remote: &MediaRemote,
    source: MediaRemotePlayerSource,
) -> Option<MacPlayer> {
    let (sender, receiver) = mpsc::channel();

    let block: RcBlock<dyn Fn(NowPlayingInfoRef)> = RcBlock::new(move |info: NowPlayingInfoRef| {
        let _ = sender.send(parse_now_playing_info(
            info as CFDictionaryRef,
            source.name.clone(),
            source.identity.clone(),
        ));
    });

    unsafe {
        (remote.get_now_playing_info)(media_remote_queue(), &block);
    }

    receiver.recv_timeout(MEDIA_REMOTE_TIMEOUT).ok().flatten()
}

fn get_player_path_now_playing_player(
    remote: &MediaRemote,
    player_path: MediaRemoteObjectRef,
    source: MediaRemotePlayerSource,
) -> Option<MacPlayer> {
    let get_now_playing_info_for_player = remote.get_now_playing_info_for_player?;
    let (sender, receiver) = mpsc::channel();

    let block: RcBlock<dyn Fn(NowPlayingInfoRef, NowPlayingArtworkRef)> = RcBlock::new(
        move |info: NowPlayingInfoRef, _artwork: NowPlayingArtworkRef| {
            let _ = sender.send(parse_now_playing_info(
                info as CFDictionaryRef,
                source.name.clone(),
                source.identity.clone(),
            ));
        },
    );

    unsafe {
        get_now_playing_info_for_player(player_path, 1, media_remote_queue(), &block);
    }

    receiver.recv_timeout(MEDIA_REMOTE_TIMEOUT).ok().flatten()
}

fn player_source_from_path(
    remote: &MediaRemote,
    player_path: MediaRemoteObjectRef,
) -> MediaRemotePlayerSource {
    let client = object_from_getter(remote.player_path_get_client, player_path);
    let player = object_from_getter(remote.player_path_get_player, player_path);
    let bundle_id = string_from_getter(remote.client_get_bundle_identifier, client);
    let client_name = string_from_getter(remote.client_get_display_name, client);
    let player_name = string_from_getter(remote.player_get_display_name, player)
        .filter(|name| !is_default_player_name(name));
    let player_id = string_from_getter(remote.player_get_identifier, player);

    let name = client_name
        .or(player_name)
        .or_else(|| bundle_id.as_deref().and_then(display_name_from_bundle_id))
        .unwrap_or_else(|| DEFAULT_PLAYER_NAME.to_string());
    let identity = media_remote_identity(bundle_id.as_deref(), player_id.as_deref(), &name);

    MediaRemotePlayerSource {
        name,
        identity,
        bundle_id,
    }
}

fn get_browser_player_from_source(source: &MediaRemotePlayerSource) -> Option<MacPlayer> {
    let bundle_id = source.bundle_id.as_deref()?;
    let script = browser_tab_script(bundle_id)?;
    let output = non_empty_osascript_output(&script)?;
    let mut fields = output.split(SCRIPT_FIELD_SEPARATOR);
    let raw_title = fields.next().unwrap_or_default();
    let url = fields.next().unwrap_or_default().trim().to_string();
    let title = clean_browser_media_title(raw_title, &url);

    if title.is_empty() && url.is_empty() {
        return None;
    }

    Some(MacPlayer {
        name: source.name.clone(),
        identity: source.identity.clone(),
        is_playing: true,
        title,
        artist: browser_media_artist(&url).to_string(),
        album: String::new(),
        duration: 0.0,
        position: 0.0,
        art_url: None,
        track_url: (!url.is_empty()).then_some(url),
    })
}

fn browser_tab_script(bundle_id: &str) -> Option<String> {
    let app_name = match bundle_id {
        "com.google.Chrome" => "Google Chrome",
        "com.google.Chrome.canary" => "Google Chrome Canary",
        "com.microsoft.edgemac" => "Microsoft Edge",
        "com.brave.Browser" => "Brave Browser",
        "com.vivaldi.Vivaldi" => "Vivaldi",
        "com.operasoftware.Opera" => "Opera",
        "company.thebrowser.Browser" => "Arc",
        "com.apple.Safari" => return Some(safari_tab_script()),
        _ => return None,
    };

    Some(chromium_tab_script(app_name))
}

fn chromium_tab_script(app_name: &str) -> String {
    format!(
        r#"
if application "{app_name}" is running then
    set d to ASCII character 31
    tell application "{app_name}"
        if (count of windows) is 0 then return ""
        set activeTab to active tab of front window
        set activeUrl to URL of activeTab as text
        set activeTitle to title of activeTab as text
        if my isMediaUrl(activeUrl) then return activeTitle & d & activeUrl
        repeat with browserWindow in windows
            repeat with browserTab in tabs of browserWindow
                set tabUrl to URL of browserTab as text
                if my isMediaUrl(tabUrl) then
                    set tabTitle to title of browserTab as text
                    return tabTitle & d & tabUrl
                end if
            end repeat
        end repeat
        return activeTitle & d & activeUrl
    end tell
end if
return ""

on isMediaUrl(tabUrl)
    return tabUrl contains "youtube.com/watch" or tabUrl contains "youtu.be/" or tabUrl contains "music.youtube.com/" or tabUrl contains "twitch.tv/"
end isMediaUrl
"#
    )
}

fn safari_tab_script() -> String {
    r#"
if application "Safari" is running then
    set d to ASCII character 31
    tell application "Safari"
        if (count of windows) is 0 then return ""
        set activeTab to current tab of front window
        set activeUrl to URL of activeTab as text
        set activeTitle to name of activeTab as text
        if my isMediaUrl(activeUrl) then return activeTitle & d & activeUrl
        repeat with browserWindow in windows
            repeat with browserTab in tabs of browserWindow
                set tabUrl to URL of browserTab as text
                if my isMediaUrl(tabUrl) then
                    set tabTitle to name of browserTab as text
                    return tabTitle & d & tabUrl
                end if
            end repeat
        end repeat
        return activeTitle & d & activeUrl
    end tell
end if
return ""

on isMediaUrl(tabUrl)
    return tabUrl contains "youtube.com/watch" or tabUrl contains "youtu.be/" or tabUrl contains "music.youtube.com/" or tabUrl contains "twitch.tv/"
end isMediaUrl
"#
    .to_string()
}

fn clean_browser_media_title(title: &str, url: &str) -> String {
    let mut title = title.trim().to_string();

    for suffix in [" - YouTube Music", " - YouTube", " | Twitch"] {
        if let Some(stripped) = title.strip_suffix(suffix) {
            title = stripped.trim().to_string();
            break;
        }
    }

    if title.is_empty() {
        browser_media_artist(url).to_string()
    } else {
        title
    }
}

fn browser_media_artist(url: &str) -> &'static str {
    if url.contains("music.youtube.com") {
        "YouTube Music"
    } else if url.contains("youtube.com") || url.contains("youtu.be") {
        "YouTube"
    } else if url.contains("twitch.tv") {
        "Twitch"
    } else {
        ""
    }
}

fn object_from_getter(
    getter: Option<MediaRemoteObjectGetterFn>,
    object: MediaRemoteObjectRef,
) -> MediaRemoteObjectRef {
    if object.is_null() {
        return ptr::null();
    }

    getter
        .map(|getter| unsafe { getter(object) })
        .unwrap_or(ptr::null())
}

fn string_from_getter(
    getter: Option<MediaRemoteStringGetterFn>,
    object: MediaRemoteObjectRef,
) -> Option<String> {
    if object.is_null() {
        return None;
    }

    let value = unsafe { getter?(object) };
    string_from_cf_string_ref(value)
}

fn string_from_cf_string_ref(value: CFStringRef) -> Option<String> {
    if value.is_null() {
        return None;
    }

    let value = unsafe { CFString::wrap_under_get_rule(value) }.to_string();

    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn is_default_player_name(name: &str) -> bool {
    let name = name.trim();
    name.eq_ignore_ascii_case("default player") || name.eq_ignore_ascii_case("default")
}

fn display_name_from_bundle_id(bundle_id: &str) -> Option<String> {
    let known_name = match bundle_id {
        "com.google.Chrome" => Some("Chrome"),
        "com.apple.Safari" => Some("Safari"),
        "org.mozilla.firefox" => Some("Firefox"),
        "com.microsoft.edgemac" => Some("Microsoft Edge"),
        "com.brave.Browser" => Some("Brave"),
        "com.vivaldi.Vivaldi" => Some("Vivaldi"),
        "com.operasoftware.Opera" => Some("Opera"),
        "company.thebrowser.Browser" => Some("Arc"),
        "com.spotify.client" => Some("Spotify"),
        "com.apple.Music" | "com.apple.iTunes" => Some("Music"),
        "org.videolan.vlc" => Some("VLC"),
        _ => None,
    };

    if let Some(name) = known_name {
        return Some(name.to_string());
    }

    let name = bundle_id.rsplit('.').next()?.trim();
    if name.is_empty() {
        return None;
    }

    Some(
        name.split(['-', '_'])
            .filter(|part| !part.is_empty())
            .map(capitalize_ascii_word)
            .collect::<Vec<_>>()
            .join(" "),
    )
}

fn capitalize_ascii_word(word: &str) -> String {
    let mut characters = word.chars();
    let Some(first) = characters.next() else {
        return String::new();
    };

    format!(
        "{}{}",
        first.to_ascii_uppercase(),
        characters.as_str().to_ascii_lowercase()
    )
}

fn media_remote_identity(
    bundle_id: Option<&str>,
    player_id: Option<&str>,
    fallback_name: &str,
) -> String {
    match bundle_id {
        Some("com.spotify.client") => SPOTIFY_IDENTITY.to_string(),
        Some("com.apple.Music" | "com.apple.iTunes") => MUSIC_IDENTITY.to_string(),
        Some(bundle_id) => format!(
            "mediaremote:{}:{}",
            bundle_id,
            sanitize_identity_part(player_id.unwrap_or(fallback_name))
        ),
        None => format!(
            "mediaremote:{}",
            sanitize_identity_part(player_id.unwrap_or(fallback_name))
        ),
    }
}

fn sanitize_identity_part(value: &str) -> String {
    let identity = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if identity.is_empty() {
        "unknown".to_string()
    } else {
        identity
    }
}

fn upsert_player(players: &mut Vec<MacPlayer>, player: MacPlayer) {
    if let Some(existing) = players
        .iter_mut()
        .find(|existing| existing.identity == player.identity)
    {
        *existing = player;
    } else {
        players.push(player);
    }
}

fn parse_now_playing_info(
    info: CFDictionaryRef,
    name: String,
    identity: String,
) -> Option<MacPlayer> {
    if info.is_null() {
        return None;
    }

    let info: CFDictionary<CFString, CFType> = unsafe { CFDictionary::wrap_under_get_rule(info) };

    let title = cf_string_value(&info, "kMRMediaRemoteNowPlayingInfoTitle").unwrap_or_default();
    let artist = cf_string_value(&info, "kMRMediaRemoteNowPlayingInfoArtist").unwrap_or_default();
    let album = cf_string_value(&info, "kMRMediaRemoteNowPlayingInfoAlbum").unwrap_or_default();

    if title.is_empty() && artist.is_empty() && album.is_empty() {
        return None;
    }

    let playback_rate =
        cf_number_value(&info, "kMRMediaRemoteNowPlayingInfoPlaybackRate").unwrap_or_default();
    let duration = finite_media_number(
        cf_number_value(&info, "kMRMediaRemoteNowPlayingInfoDuration").unwrap_or_default(),
    );
    let position = finite_media_number(
        cf_number_value(&info, "kMRMediaRemoteNowPlayingInfoElapsedTime")
            .or_else(|| cf_number_value(&info, "kMRMediaRemoteNowPlayingInfoCalculatedElapsedTime"))
            .unwrap_or_default(),
    );
    let track_url = cf_url_or_string_value(&info, "kMRMediaRemoteNowPlayingInfoAssetURL");
    let art_url = cf_url_or_string_value(&info, "kMRMediaRemoteNowPlayingInfoArtworkURL")
        .or_else(|| artwork_data_url(&info));

    Some(MacPlayer {
        name,
        identity,
        is_playing: playback_rate.is_finite() && playback_rate > 0.0,
        title,
        artist,
        album,
        duration,
        position,
        art_url,
        track_url,
    })
}

fn finite_media_number(value: f64) -> f64 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        0.0
    }
}

fn cf_string_value(dict: &CFDictionary<CFString, CFType>, key: &'static str) -> Option<String> {
    let key = CFString::from_static_string(key);
    let value = dict.find(&key)?;
    let value = value.downcast::<CFString>()?;
    let value = value.to_string();

    if value.trim().is_empty() {
        None
    } else {
        Some(value)
    }
}

fn cf_number_value(dict: &CFDictionary<CFString, CFType>, key: &'static str) -> Option<f64> {
    let key = CFString::from_static_string(key);
    dict.find(&key)?.downcast::<CFNumber>()?.to_f64()
}

fn cf_url_or_string_value(
    dict: &CFDictionary<CFString, CFType>,
    key: &'static str,
) -> Option<String> {
    let key = CFString::from_static_string(key);
    let value = dict.find(&key)?;

    if let Some(value) = value.downcast::<CFString>() {
        let value = value.to_string();
        return (!value.trim().is_empty()).then_some(value);
    }

    if let Some(value) = value.downcast::<CFURL>() {
        let value = value.get_string().to_string();
        return (!value.trim().is_empty()).then_some(value);
    }

    None
}

fn artwork_data_url(dict: &CFDictionary<CFString, CFType>) -> Option<String> {
    let key = CFString::from_static_string("kMRMediaRemoteNowPlayingInfoArtworkData");
    let data = dict.find(&key)?.downcast::<CFData>()?;

    if data.is_empty() {
        return None;
    }

    let mime_type = cf_string_value(dict, "kMRMediaRemoteNowPlayingInfoArtworkMIMEType")
        .unwrap_or_else(|| "image/jpeg".to_string());
    let encoded = general_purpose::STANDARD.encode(&*data);

    Some(format!("data:{};base64,{}", mime_type, encoded))
}

fn get_scripted_players() -> Vec<MacPlayer> {
    let mut players = Vec::new();

    if let Some(player) = get_spotify_player() {
        players.push(player);
    }

    if let Some(player) = get_music_player() {
        players.push(player);
    }

    players
}

fn get_spotify_player() -> Option<MacPlayer> {
    let output = non_empty_osascript_output(
        r#"
if application "Spotify" is running then
    tell application "Spotify"
        if player state is stopped then return ""
        set d to ASCII character 31
        return (player state as text) & d & name of current track & d & artist of current track & d & album of current track & d & (duration of current track as text) & d & (player position as text) & d & artwork url of current track
    end tell
end if
return ""
"#,
    )?;

    scripted_player_from_output(output, "Spotify", SPOTIFY_IDENTITY, 1000.0)
}

fn get_music_player() -> Option<MacPlayer> {
    let output = non_empty_osascript_output(
        r#"
if application "Music" is running then
    tell application "Music"
        if player state is stopped then return ""
        set d to ASCII character 31
        return (player state as text) & d & name of current track & d & artist of current track & d & album of current track & d & (duration of current track as text) & d & (player position as text) & d & ""
    end tell
end if
return ""
"#,
    )?;

    scripted_player_from_output(output, "Music", MUSIC_IDENTITY, 1.0)
}

fn scripted_player_from_output(
    output: String,
    name: &'static str,
    identity: &'static str,
    duration_scale: f64,
) -> Option<MacPlayer> {
    let fields: Vec<&str> = output.split(SCRIPT_FIELD_SEPARATOR).collect();
    if fields.len() < 6 {
        return None;
    }

    let state = fields[0].trim();
    let title = fields[1].trim().to_string();
    let artist = fields[2].trim().to_string();
    let album = fields[3].trim().to_string();

    if title.is_empty() && artist.is_empty() && album.is_empty() {
        return None;
    }

    let duration = parse_script_number(fields[4]) / duration_scale;
    let position = parse_script_number(fields[5]);
    let art_url = fields
        .get(6)
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    Some(MacPlayer {
        name: name.to_string(),
        identity: identity.to_string(),
        is_playing: state.eq_ignore_ascii_case("playing"),
        title,
        artist,
        album,
        duration,
        position,
        art_url,
        track_url: None,
    })
}

fn parse_script_number(value: &str) -> f64 {
    value.trim().parse().unwrap_or_default()
}

fn non_empty_osascript_output(script: &str) -> Option<String> {
    let output = run_osascript(script).ok()?;
    let output = output
        .trim_end_matches(|character| character == '\n' || character == '\r')
        .to_string();

    (!output.trim().is_empty()).then_some(output)
}

fn run_osascript(script: &str) -> Result<String, Error> {
    let output = Command::new("osascript").args(["-e", script]).output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(io_error(format!("osascript failed: {}", stderr.trim())));
    }

    String::from_utf8(output.stdout).map_err(Error::from)
}

fn extract_art_url(player: &MacPlayer) -> Option<String> {
    if let Some(url) = &player.art_url {
        if !url.is_empty() {
            return Some(url.clone());
        }
    }

    if let Some(url) = &player.track_url {
        if url.contains("youtube.com") || url.contains("youtu.be") {
            if let Some(video_id) = extract_youtube_video_id(url) {
                return Some(get_youtube_thumbnail_url(&video_id));
            }
        }
    }

    if let Some(url) = &player.track_url {
        if url.contains("twitch.tv") {
            if let Some(username) = extract_twitch_username(url) {
                return Some(get_twitch_thumbnail_url(&username));
            }
        }
    }

    None
}

async fn get_all_players() -> Result<Vec<(MacPlayer, u64)>, Error> {
    let players = get_mac_players().await?;
    let current_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let player_info: Vec<(MacPlayer, u64)> = players
        .into_iter()
        .map(|player| {
            let activity_time = if player.is_playing {
                current_time
            } else {
                current_time.saturating_sub(10)
            };
            (player, activity_time)
        })
        .collect();

    Ok(player_info)
}

async fn get_most_recent_player() -> Result<MacPlayer, Error> {
    let mut players = get_all_players().await?;

    if players.is_empty() {
        return Err(Error::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "No media player found",
        )));
    }

    players.sort_by(|a, b| {
        let a_priority = if a.0.is_playing { 1 } else { 0 };
        let b_priority = if b.0.is_playing { 1 } else { 0 };
        let priority_cmp = b_priority.cmp(&a_priority);
        if priority_cmp != std::cmp::Ordering::Equal {
            return priority_cmp;
        }
        b.1.cmp(&a.1)
    });

    Ok(players.into_iter().next().unwrap().0)
}

async fn get_player_by_identity(target_identity: &str) -> Result<MacPlayer, Error> {
    let players = get_all_players().await?;

    for (player, _) in players {
        if player.identity == target_identity || player.name == target_identity {
            return Ok(player);
        }
    }

    Err(Error::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("Player '{}' not found", target_identity),
    )))
}

#[tauri::command]
pub async fn get_media_info(preferred_player: Option<String>) -> Result<MediaInfo, Error> {
    let result = if let Some(pref) = preferred_player {
        get_player_by_identity(&pref).await
    } else {
        get_most_recent_player().await
    };

    let player = match result {
        Ok(p) => p,
        Err(_) => {
            return Ok(MediaInfo::default());
        }
    };

    let art_url = extract_art_url(&player);

    Ok(MediaInfo {
        title: player.title,
        artist: player.artist,
        album: player.album,
        duration: player.duration,
        position: player.position,
        is_playing: player.is_playing,
        art_url,
        has_player: true,
        player_name: player.name,
        player_identity: player.identity,
    })
}

#[tauri::command]
pub async fn get_active_players() -> Result<Vec<PlayerInfo>, Error> {
    let players = get_all_players().await?;

    let player_info: Vec<PlayerInfo> = players
        .into_iter()
        .map(|(player, last_activity)| PlayerInfo {
            name: player.name,
            identity: player.identity,
            is_playing: player.is_playing,
            last_activity,
        })
        .collect();

    Ok(player_info)
}

#[tauri::command]
pub fn media_play_pause(player_identity: Option<String>) -> Result<(), Error> {
    if send_scripted_media_command(player_identity.as_deref(), ScriptedMediaCommand::PlayPause)? {
        return Ok(());
    }

    send_media_command(2, "toggle play/pause")
}

#[tauri::command]
pub fn media_next(player_identity: Option<String>) -> Result<(), Error> {
    if send_scripted_media_command(player_identity.as_deref(), ScriptedMediaCommand::Next)? {
        return Ok(());
    }

    send_media_command(4, "next track")
}

#[tauri::command]
pub fn media_previous(player_identity: Option<String>) -> Result<(), Error> {
    if send_scripted_media_command(player_identity.as_deref(), ScriptedMediaCommand::Previous)? {
        return Ok(());
    }

    send_media_command(5, "previous track")
}

#[tauri::command]
pub fn media_set_position(
    _position_secs: f64,
    _player_identity: Option<String>,
) -> Result<(), Error> {
    Ok(())
}

#[tauri::command]
pub async fn list_media_players() -> Result<Vec<String>, Error> {
    let players = get_active_players().await?;
    let player_names: Vec<String> = players.into_iter().map(|p| p.name).collect();
    Ok(player_names)
}

fn send_media_command(command: i32, label: &str) -> Result<(), Error> {
    let remote = media_remote()?;
    let accepted = unsafe { (remote.send_command)(command, ptr::null()) };

    if accepted == 0 {
        return Err(io_error(format!("macOS rejected media command: {}", label)));
    }

    Ok(())
}

enum ScriptedMediaCommand {
    PlayPause,
    Next,
    Previous,
}

fn send_scripted_media_command(
    player_identity: Option<&str>,
    command: ScriptedMediaCommand,
) -> Result<bool, Error> {
    match player_identity {
        Some(SPOTIFY_IDENTITY) => {
            run_osascript(spotify_command_script(command))?;
            Ok(true)
        }
        Some(MUSIC_IDENTITY) => {
            run_osascript(music_command_script(command))?;
            Ok(true)
        }
        _ => Ok(false),
    }
}

fn spotify_command_script(command: ScriptedMediaCommand) -> &'static str {
    match command {
        ScriptedMediaCommand::PlayPause => {
            r#"if application "Spotify" is running then tell application "Spotify" to playpause"#
        }
        ScriptedMediaCommand::Next => {
            r#"if application "Spotify" is running then tell application "Spotify" to next track"#
        }
        ScriptedMediaCommand::Previous => {
            r#"if application "Spotify" is running then tell application "Spotify" to previous track"#
        }
    }
}

fn music_command_script(command: ScriptedMediaCommand) -> &'static str {
    match command {
        ScriptedMediaCommand::PlayPause => {
            r#"if application "Music" is running then tell application "Music" to playpause"#
        }
        ScriptedMediaCommand::Next => {
            r#"if application "Music" is running then tell application "Music" to next track"#
        }
        ScriptedMediaCommand::Previous => {
            r#"if application "Music" is running then tell application "Music" to previous track"#
        }
    }
}

fn io_error(message: impl Into<String>) -> Error {
    Error::Io(std::io::Error::new(
        std::io::ErrorKind::Other,
        message.into(),
    ))
}
