use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, RefreshKind, System};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemStats {
    pub cpu_usage: f32,
    pub memory_used: f32,  // in GB
    pub memory_total: f32, // in GB
    pub memory_usage_percent: f32,
    pub disk_used: f32,  // in GB
    pub disk_total: f32, // in GB
    pub disk_usage_percent: f32,
}

// Cache system instance to avoid recreating it every call
static SYSTEM_CACHE: Mutex<Option<System>> = Mutex::new(None);

/// Get current system statistics
#[tauri::command]
pub fn get_system_stats() -> Result<SystemStats, String> {
    let mut system_guard = SYSTEM_CACHE
        .lock()
        .map_err(|e| format!("Failed to lock system cache: {}", e))?;

    // Initialize system if not already done
    if system_guard.is_none() {
        let mut sys = System::new_with_specifics(
            RefreshKind::new()
                .with_cpu(CpuRefreshKind::everything())
                .with_memory(MemoryRefreshKind::everything()),
        );
        // Initial refresh to populate data
        sys.refresh_all();
        *system_guard = Some(sys);
    }

    let system = system_guard.as_mut().unwrap();

    // Refresh CPU and memory data
    system.refresh_cpu_usage();
    system.refresh_memory();

    // Calculate CPU usage (average across all cores)
    let cpu_usage = system
        .cpus()
        .iter()
        .map(|cpu| cpu.cpu_usage())
        .fold(0.0, |acc, usage| acc + usage)
        / system.cpus().len() as f32;

    // Memory stats (convert bytes to GB)
    let memory_used = system.used_memory() as f32 / (1024.0 * 1024.0 * 1024.0);
    let memory_total = system.total_memory() as f32 / (1024.0 * 1024.0 * 1024.0);
    let memory_usage_percent = percentage(memory_used, memory_total);

    // Disk stats (root partition) - use Disks struct
    let mut disk_used: f32 = 0.0;
    let mut disk_total: f32 = 0.0;

    let disks = Disks::new_with_refreshed_list();

    for disk in &disks {
        // Check if this is the root mount point
        let mount_point = disk.mount_point().to_string_lossy();
        if mount_point == "/" || mount_point == "\\" || mount_point.starts_with("C:") {
            disk_total = (disk.total_space() / (1024 * 1024 * 1024)) as f32; // Convert bytes to GB
            let available = (disk.available_space() / (1024 * 1024 * 1024)) as f32;
            disk_used = disk_total - available;
            break;
        }
    }

    // If no root disk found, use the first available disk
    if disk_total == 0.0 {
        if let Some(disk) = disks.list().first() {
            disk_total = (disk.total_space() / (1024 * 1024 * 1024)) as f32;
            let available = (disk.available_space() / (1024 * 1024 * 1024)) as f32;
            disk_used = disk_total - available;
        }
    }

    let disk_usage_percent = percentage(disk_used, disk_total);

    Ok(SystemStats {
        cpu_usage,
        memory_used,
        memory_total,
        memory_usage_percent,
        disk_used,
        disk_total,
        disk_usage_percent,
    })
}

/// Calculate what fraction `used` is of `total`, as a percentage.
/// Returns 0.0 when `total` is zero to avoid division by zero.
fn percentage(used: f32, total: f32) -> f32 {
    if total > 0.0 {
        (used / total) * 100.0
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percentage_computes_usage_percent() {
        assert_eq!(percentage(25.0, 100.0), 25.0);
        assert_eq!(percentage(50.0, 200.0), 25.0);
        assert_eq!(percentage(1.5, 8.0), 18.75);
    }

    #[test]
    fn percentage_handles_zero_total() {
        assert_eq!(percentage(0.0, 0.0), 0.0);
        assert_eq!(percentage(42.0, 0.0), 0.0);
    }

    #[test]
    fn percentage_handles_zero_used() {
        assert_eq!(percentage(0.0, 100.0), 0.0);
    }
}
