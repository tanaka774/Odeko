//! Power control commands for sleep, restart, and shutdown
//! Cross-platform implementation using platform-native APIs

use serde::{Deserialize, Serialize};

/// Result of a power control operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PowerResult {
    pub success: bool,
    pub message: String,
}

impl PowerResult {
    pub fn success(msg: impl Into<String>) -> Self {
        Self {
            success: true,
            message: msg.into(),
        }
    }

    pub fn error(msg: impl Into<String>) -> Self {
        Self {
            success: false,
            message: msg.into(),
        }
    }
}

/// Power action types
#[cfg(target_os = "linux")]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum PowerAction {
    Sleep,
    Restart,
    Shutdown,
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
