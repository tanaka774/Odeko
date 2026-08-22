use mpris::{Metadata, PlaybackStatus, Player, PlayerFinder};
use std::time::{SystemTime, UNIX_EPOCH};

use super::super::errors::Error;
use super::{
    extract_twitch_username, extract_youtube_video_id, get_twitch_thumbnail_url,
    get_youtube_thumbnail_url, MediaInfo, PlayerInfo,
};

fn extract_art_url(metadata: &Metadata) -> Option<String> {
    // Try to get art URL from metadata
    if let Some(url) = metadata.art_url() {
        return Some(url.to_string());
    }

    // Fallback: try to construct from other metadata
    if let Some(url) = metadata
        .get("mpris:artUrl")
        .and_then(|v| v.as_str().map(|s: &str| s.to_string()))
    {
        return Some(url);
    }

    // Try to extract YouTube thumbnail from track URL
    if let Some(url) = metadata.get("xesam:url").and_then(|v| v.as_str()) {
        if url.contains("youtube.com") || url.contains("youtu.be") {
            if let Some(video_id) = extract_youtube_video_id(url) {
                return Some(get_youtube_thumbnail_url(&video_id));
            }
        }
    }

    // Try to extract Twitch stream thumbnail from track URL
    if let Some(url) = metadata.get("xesam:url").and_then(|v| v.as_str()) {
        if url.contains("twitch.tv") {
            if let Some(username) = extract_twitch_username(url) {
                return Some(get_twitch_thumbnail_url(&username));
            }
        }
    }

    None
}

fn get_all_players() -> Result<Vec<(Player, String, PlaybackStatus, u64)>, Error> {
    let finder = PlayerFinder::new().map_err(|e| {
        Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to create player finder: {}", e),
        ))
    })?;

    let players: Vec<Player> = finder.find_all().map_err(|e| {
        Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to find players: {}", e),
        ))
    })?;

    let mut player_info = Vec::new();
    let current_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    for player in players {
        let identity = player.identity().to_string();

        if let Ok(status) = player.get_playback_status() {
            let activity_time = if status == PlaybackStatus::Playing {
                current_time
            } else {
                current_time.saturating_sub(10)
            };

            player_info.push((player, identity, status, activity_time));
        }
    }

    Ok(player_info)
}

fn get_most_recent_player() -> Result<(Player, String, PlaybackStatus), Error> {
    let mut players = get_all_players()?;

    if players.is_empty() {
        return Err(Error::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "No media player found",
        )));
    }

    players.sort_by(|a, b| {
        let a_priority = if a.2 == PlaybackStatus::Playing { 1 } else { 0 };
        let b_priority = if b.2 == PlaybackStatus::Playing { 1 } else { 0 };
        let priority_cmp = b_priority.cmp(&a_priority);
        if priority_cmp != std::cmp::Ordering::Equal {
            return priority_cmp;
        }
        b.3.cmp(&a.3)
    });

    let (player, identity, status, _) = players.into_iter().next().unwrap();
    Ok((player, identity, status))
}

fn get_player_by_identity(
    target_identity: &str,
) -> Result<(Player, String, PlaybackStatus), Error> {
    let players = get_all_players()?;

    for (player, identity, status, _) in players {
        if identity == target_identity {
            return Ok((player, identity, status));
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

    let (player, player_name, playback_status) = match result {
        Ok(p) => p,
        Err(_) => {
            return Ok(MediaInfo::default());
        }
    };

    let metadata: Metadata = player.get_metadata().map_err(|e| {
        Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to get metadata: {}", e),
        ))
    })?;

    let position: f64 = player
        .get_position()
        .map(|p: std::time::Duration| p.as_secs_f64())
        .unwrap_or(0.0);

    let duration: f64 = metadata
        .length()
        .map(|d: std::time::Duration| d.as_secs_f64())
        .unwrap_or(0.0);

    let artist = metadata
        .artists()
        .and_then(|artists: Vec<&str>| artists.first().map(|a: &&str| a.to_string()))
        .unwrap_or_default();

    Ok(MediaInfo {
        title: metadata
            .title()
            .map(|t: &str| t.to_string())
            .unwrap_or_default(),
        artist,
        album: metadata
            .album_name()
            .map(|a: &str| a.to_string())
            .unwrap_or_default(),
        duration,
        position,
        is_playing: playback_status == PlaybackStatus::Playing,
        art_url: extract_art_url(&metadata),
        has_player: true,
        player_name: player_name.clone(),
        player_identity: player_name,
    })
}

#[tauri::command]
pub fn get_active_players() -> Result<Vec<PlayerInfo>, Error> {
    let players = get_all_players()?;

    let player_info: Vec<PlayerInfo> = players
        .into_iter()
        .map(|(_, identity, status, last_activity)| PlayerInfo {
            name: identity.clone(),
            identity: identity,
            is_playing: status == PlaybackStatus::Playing,
            last_activity,
        })
        .collect();

    Ok(player_info)
}

#[tauri::command]
pub fn media_play_pause(player_identity: Option<String>) -> Result<(), Error> {
    let (player, _, _) = if let Some(identity) = player_identity {
        get_player_by_identity(&identity)?
    } else {
        get_most_recent_player()?
    };

    player.play_pause().map_err(|e| {
        Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to play/pause: {}", e),
        ))
    })?;
    Ok(())
}

#[tauri::command]
pub fn media_next(player_identity: Option<String>) -> Result<(), Error> {
    let (player, _, _) = if let Some(identity) = player_identity {
        get_player_by_identity(&identity)?
    } else {
        get_most_recent_player()?
    };

    player.next().map_err(|e| {
        Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to go to next track: {}", e),
        ))
    })?;
    Ok(())
}

#[tauri::command]
pub fn media_previous(player_identity: Option<String>) -> Result<(), Error> {
    let (player, _, _) = if let Some(identity) = player_identity {
        get_player_by_identity(&identity)?
    } else {
        get_most_recent_player()?
    };

    player.previous().map_err(|e| {
        Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to go to previous track: {}", e),
        ))
    })?;
    Ok(())
}

#[tauri::command]
pub fn media_set_position(
    position_secs: f64,
    player_identity: Option<String>,
) -> Result<(), Error> {
    let (player, _, _) = if let Some(identity) = player_identity {
        get_player_by_identity(&identity)?
    } else {
        get_most_recent_player()?
    };

    let metadata: Metadata = player.get_metadata().map_err(|e| {
        Error::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("Failed to get metadata: {}", e),
        ))
    })?;

    if let Some(track_id) = metadata.track_id() {
        let position = std::time::Duration::from_secs_f64(position_secs);
        player.set_position(track_id, &position).map_err(|e| {
            Error::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("Failed to set position: {}", e),
            ))
        })?;
    }

    Ok(())
}

#[tauri::command]
pub fn list_media_players() -> Result<Vec<String>, Error> {
    let players = get_active_players()?;

    let player_names: Vec<String> = players.into_iter().map(|p| p.name).collect();

    Ok(player_names)
}
