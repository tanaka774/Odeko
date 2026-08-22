//! Linux power control implementation using logind D-Bus
//! Uses polkit for authentication - shows native OS dialog if needed

use super::{PowerAction, PowerResult};
use std::process::Command;
use zbus::{Connection, proxy};

/// logind D-Bus proxy
#[proxy(
    interface = "org.freedesktop.login1.Manager",
    default_service = "org.freedesktop.login1",
    default_path = "/org/freedesktop/login1"
)]
trait LogindManager {
    /// Suspend the system
    async fn suspend(&self, interactive: bool) -> zbus::Result<()>;
    
    /// Reboot the system
    async fn reboot(&self, interactive: bool) -> zbus::Result<()>;
    
    /// Power off the system
    async fn power_off(&self, interactive: bool) -> zbus::Result<()>;
}

/// Execute power action using logind D-Bus (polkit)
async fn execute_logind_action(action: PowerAction) -> Result<(), Box<dyn std::error::Error>> {
    let connection = Connection::system().await?;
    let proxy = LogindManagerProxy::new(&connection).await?;
    
    match action {
        PowerAction::Sleep => proxy.suspend(true).await?,
        PowerAction::Restart => proxy.reboot(true).await?,
        PowerAction::Shutdown => proxy.power_off(true).await?,
    }
    
    Ok(())
}

/// Fallback to command-line tools if D-Bus fails
fn execute_command_fallback(action: PowerAction) -> Result<(), Box<dyn std::error::Error>> {
    let result = match action {
        PowerAction::Sleep => {
            // Try systemctl first, then pm-utils
            Command::new("systemctl")
                .arg("suspend")
                .output()
                .or_else(|_| Command::new("pm-suspend").output())
        }
        PowerAction::Restart => {
            Command::new("systemctl")
                .arg("reboot")
                .output()
                .or_else(|_| Command::new("reboot").output())
        }
        PowerAction::Shutdown => {
            Command::new("systemctl")
                .arg("poweroff")
                .output()
                .or_else(|_| Command::new("shutdown").args(["-h", "now"]).output())
        }
    };
    
    match result {
        Ok(output) => {
            if output.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("Command failed: {}", stderr).into())
            }
        }
        Err(e) => Err(format!("Failed to execute command: {}", e).into()),
    }
}

/// Execute power action with D-Bus primary, command fallback
async fn execute_power_action(action: PowerAction) -> PowerResult {
    // Try D-Bus/logind first (polkit integration)
    match execute_logind_action(action).await {
        Ok(()) => return PowerResult::success("Action initiated successfully"),
        Err(e) => {
            log::warn!("D-Bus logind failed, trying command fallback: {}", e);
        }
    }
    
    // Fallback to command-line
    match execute_command_fallback(action) {
        Ok(()) => PowerResult::success("Action initiated successfully"),
        Err(e) => {
            log::error!("Power action failed: {}", e);
            PowerResult::error(format!(
                "Failed to execute power action. Please check your permissions. Error: {}",
                e
            ))
        }
    }
}

#[tauri::command]
pub async fn execute_sleep() -> Result<PowerResult, String> {
    Ok(execute_power_action(PowerAction::Sleep).await)
}

#[tauri::command]
pub async fn execute_restart() -> Result<PowerResult, String> {
    Ok(execute_power_action(PowerAction::Restart).await)
}

#[tauri::command]
pub async fn execute_shutdown() -> Result<PowerResult, String> {
    Ok(execute_power_action(PowerAction::Shutdown).await)
}
