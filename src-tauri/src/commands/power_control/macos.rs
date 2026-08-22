//! macOS power control implementation using AppleScript
//! Uses 'osascript' to control system events

use super::PowerResult;
use std::process::Command;

/// Execute AppleScript and return result
fn run_apple_script(script: &str) -> Result<(), String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|e| format!("Failed to execute osascript: {}", e))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("AppleScript error: {}", stderr))
    }
}

#[tauri::command]
pub fn execute_sleep() -> Result<PowerResult, String> {
    // macOS doesn't have a direct "sleep" AppleScript command
    // We use pmset or a workaround with System Events

    // Method 1: Use pmset
    let output = Command::new("pmset").arg("sleepnow").output();

    match output {
        Ok(result) if result.status.success() => {
            Ok(PowerResult::success("System is going to sleep"))
        }
        _ => {
            // Method 2: Alternative using AppleScript to press power button
            // This is less reliable but works on some systems
            let script = r#"
                tell application "System Events"
                    sleep
                end tell
            "#;

            match run_apple_script(script) {
                Ok(()) => Ok(PowerResult::success("System is going to sleep")),
                Err(e) => Ok(PowerResult::error(format!(
                    "Failed to initiate sleep. You may need to enable accessibility permissions. Error: {}",
                    e
                ))),
            }
        }
    }
}

#[tauri::command]
pub fn execute_restart() -> Result<PowerResult, String> {
    let script = r#"
        tell application "System Events"
            restart
        end tell
    "#;

    match run_apple_script(script) {
        Ok(()) => Ok(PowerResult::success("System is restarting")),
        Err(e) => Ok(PowerResult::error(format!(
            "Failed to initiate restart. You may need to enable accessibility permissions. Error: {}",
            e
        ))),
    }
}

#[tauri::command]
pub fn execute_shutdown() -> Result<PowerResult, String> {
    let script = r#"
        tell application "System Events"
            shut down
        end tell
    "#;

    match run_apple_script(script) {
        Ok(()) => Ok(PowerResult::success("System is shutting down")),
        Err(e) => Ok(PowerResult::error(format!(
            "Failed to initiate shutdown. You may need to enable accessibility permissions. Error: {}",
            e
        ))),
    }
}
