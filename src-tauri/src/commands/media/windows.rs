use std::time::{SystemTime, UNIX_EPOCH};

use super::super::errors::Error;
use super::{
    extract_twitch_username, extract_youtube_video_id, get_twitch_thumbnail_url,
    get_youtube_thumbnail_url, MediaInfo, PlayerInfo,
};

// Windows implementation using Windows Media Transport Controls
// This is a placeholder implementation that returns default/empty values
// Full implementation would require Windows Media APIs

#[derive(Debug, Clone)]
struct WindowsPlayer {
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

fn get_windows_players() -> Result<Vec<WindowsPlayer>, Error> {
    // Placeholder: In a full implementation, this would:
    // 1. Use Windows.Media.Control APIs to enumerate media players
    // 2. Query each player for current track info
    // 3. Return list of active players

    // For now, return empty list - user will need to implement Windows-specific logic
    Ok(Vec::new())
}

fn extract_art_url(player: &WindowsPlayer) -> Option<String> {
    // Try provided art URL first
    if let Some(url) = &player.art_url {
        if !url.is_empty() {
            return Some(url.clone());
        }
    }

    // Try to extract YouTube thumbnail from track URL
    if let Some(url) = &player.track_url {
        if url.contains("youtube.com") || url.contains("youtu.be") {
            if let Some(video_id) = extract_youtube_video_id(url) {
                return Some(get_youtube_thumbnail_url(&video_id));
            }
        }
    }

    // Try to extract Twitch stream thumbnail from track URL
    if let Some(url) = &player.track_url {
        if url.contains("twitch.tv") {
            if let Some(username) = extract_twitch_username(url) {
                return Some(get_twitch_thumbnail_url(&username));
            }
        }
    }

    None
}

fn get_all_players() -> Result<Vec<(WindowsPlayer, u64)>, Error> {
    let players = get_windows_players()?;
    let current_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let player_info: Vec<(WindowsPlayer, u64)> = players
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

fn get_most_recent_player() -> Result<WindowsPlayer, Error> {
    let mut players = get_all_players()?;

    if players.is_empty() {
        return Err(Error::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "No media player found",
        )));
    }

    // Sort by activity time (most recent first)
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

fn get_player_by_identity(target_identity: &str) -> Result<WindowsPlayer, Error> {
    let players = get_all_players()?;

    for (player, _) in players {
        if player.identity == target_identity {
            return Ok(player);
        }
    }

    Err(Error::Io(std::io::Error::new(
        std::io::ErrorKind::NotFound,
        format!("Player '{}' not found", target_identity),
    )))
}

#[tauri::command]
pub fn get_media_info(preferred_player: Option<String>) -> Result<MediaInfo, Error> {
    let result = if let Some(pref) = preferred_player {
        get_player_by_identity(&pref)
    } else {
        get_most_recent_player()
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
pub fn get_active_players() -> Result<Vec<PlayerInfo>, Error> {
    let players = get_all_players()?;

    let player_info: Vec<PlayerInfo> = players
        .into_iter()
        .map(|(player, last_activity)| PlayerInfo {
            name: player.name.clone(),
            identity: player.identity,
            is_playing: player.is_playing,
            last_activity,
        })
        .collect();

    Ok(player_info)
}

#[tauri::command]
pub fn media_play_pause(_player_identity: Option<String>) -> Result<(), Error> {
    // Placeholder: Would use Windows Media Control APIs to send play/pause
    // For now, just return Ok
    Ok(())
}

#[tauri::command]
pub fn media_next(_player_identity: Option<String>) -> Result<(), Error> {
    // Placeholder: Would use Windows Media Control APIs to send next
    Ok(())
}

#[tauri::command]
pub fn media_previous(_player_identity: Option<String>) -> Result<(), Error> {
    // Placeholder: Would use Windows Media Control APIs to send previous
    Ok(())
}

#[tauri::command]
pub fn media_set_position(
    _position_secs: f64,
    _player_identity: Option<String>,
) -> Result<(), Error> {
    // Placeholder: Windows Media Control doesn't support position setting directly
    // Would need player-specific implementations
    Ok(())
}

#[tauri::command]
pub fn list_media_players() -> Result<Vec<String>, Error> {
    let players = get_active_players()?;
    let player_names: Vec<String> = players.into_iter().map(|p| p.name).collect();
    Ok(player_names)
}
