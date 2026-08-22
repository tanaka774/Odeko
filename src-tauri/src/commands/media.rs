use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
    pub position: f64,
    pub is_playing: bool,
    pub art_url: Option<String>,
    pub has_player: bool,
    pub player_name: String,
    pub player_identity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerInfo {
    pub name: String,
    pub identity: String,
    pub is_playing: bool,
    pub last_activity: u64,
}

impl Default for MediaInfo {
    fn default() -> Self {
        Self {
            title: String::new(),
            artist: String::new(),
            album: String::new(),
            duration: 0.0,
            position: 0.0,
            is_playing: false,
            art_url: None,
            has_player: false,
            player_name: String::new(),
            player_identity: String::new(),
        }
    }
}

// Platform-specific implementations
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::*;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::*;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

// Shared helper functions used across platforms
pub fn extract_youtube_video_id(url: &str) -> Option<String> {
    if url.contains("youtube.com/watch") {
        url.split('?')
            .nth(1)?
            .split('&')
            .find(|param| param.starts_with("v="))
            .map(|v_param| v_param[2..].to_string())
    } else if url.contains("youtu.be/") {
        url.split('/').last().map(|s| s.to_string())
    } else if url.contains("youtube.com/embed/") {
        url.split("/embed/").nth(1).map(|s| s.to_string())
    } else {
        None
    }
}

pub fn get_youtube_thumbnail_url(video_id: &str) -> String {
    format!("https://img.youtube.com/vi/{}/sddefault.jpg", video_id)
}

pub fn extract_twitch_username(url: &str) -> Option<String> {
    // Parse Twitch URLs to extract username
    // Supports: twitch.tv/username, www.twitch.tv/username
    if url.contains("twitch.tv/") {
        // Extract username from path
        let path = url.split("twitch.tv/").nth(1)?;
        // Get the first segment (username), ignoring any query params or additional paths
        let username = path.split('?').next()?.split('/').next()?;
        if !username.is_empty() && username != "videos" && username != "directory" {
            return Some(username.to_string());
        }
    }
    None
}

pub fn get_twitch_thumbnail_url(username: &str) -> String {
    // Use 480x270 resolution (standard quality)
    format!(
        "https://static-cdn.jtvnw.net/previews-ttv/live_user_{}-480x270.jpg",
        username
    )
}
