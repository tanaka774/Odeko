//! Windows power control implementation using WinAPI
//! Uses ExitWindowsEx for restart/shutdown, SetSuspendState for sleep
//! Falls back to shell commands when direct API calls fail

use super::PowerResult;
use std::ptr;
use std::process::Command;
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, LUID};
use windows_sys::Win32::Foundation::ERROR_NOT_ALL_ASSIGNED;
use windows_sys::Win32::Foundation::GetLastError;
use windows_sys::Win32::Security::AdjustTokenPrivileges;
use windows_sys::Win32::Security::LookupPrivilegeValueW;
use windows_sys::Win32::Security::TOKEN_PRIVILEGES;
use windows_sys::Win32::Security::SE_PRIVILEGE_ENABLED;
use windows_sys::Win32::Security::SE_SHUTDOWN_NAME;
use windows_sys::Win32::Security::TOKEN_ADJUST_PRIVILEGES;
use windows_sys::Win32::Security::TOKEN_QUERY;
use windows_sys::Win32::System::Power::SetSuspendState;
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
use windows_sys::Win32::System::Shutdown::{
    ExitWindowsEx, EWX_FORCEIFHUNG, EWX_REBOOT, EWX_SHUTDOWN, SHTDN_REASON_MAJOR_OTHER,
    SHTDN_REASON_MINOR_OTHER,
};

fn load_powrprof_fn(name: &str) -> Option<unsafe extern "system" fn() -> i32> {
    let module_name: Vec<u16> = "powrprof.dll\0"
        .encode_utf16()
        .collect();
    let cname = std::ffi::CString::new(name).ok()?;

    unsafe {
        let module = windows_sys::Win32::System::LibraryLoader::LoadLibraryW(module_name.as_ptr());
        if module == 0 {
            return None;
        }

        let proc: Option<unsafe extern "system" fn() -> isize> =
            windows_sys::Win32::System::LibraryLoader::GetProcAddress(
                module,
                cname.as_ptr() as *const u8,
            );

        proc.map(|f| {
            std::mem::transmute::<
                unsafe extern "system" fn() -> isize,
                unsafe extern "system" fn() -> i32,
            >(f)
        })
    }
}

fn enable_shutdown_privilege() -> Result<(), String> {
    unsafe {
        let mut h_token: HANDLE = 0;
        let mut tkp: TOKEN_PRIVILEGES = std::mem::zeroed();

        if OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
            &mut h_token,
        ) == 0
        {
            return Err("Failed to open process token".to_string());
        }

        let mut luid: LUID = std::mem::zeroed();

        if LookupPrivilegeValueW(ptr::null(), SE_SHUTDOWN_NAME, &mut luid) == 0 {
            CloseHandle(h_token);
            return Err("Failed to lookup privilege value".to_string());
        }

        tkp.PrivilegeCount = 1;
        tkp.Privileges[0].Luid = luid;
        tkp.Privileges[0].Attributes = SE_PRIVILEGE_ENABLED;

        let result = AdjustTokenPrivileges(
            h_token,
            0,
            &tkp,
            std::mem::size_of::<TOKEN_PRIVILEGES>() as u32,
            ptr::null_mut(),
            ptr::null_mut(),
        );

        if result == 0 {
            CloseHandle(h_token);
            return Err("Failed to adjust token privileges".to_string());
        }

        CloseHandle(h_token);

        if GetLastError() == ERROR_NOT_ALL_ASSIGNED {
            return Err(
                "The process does not have the required shutdown privilege. \
                 Try running the application as administrator."
                    .to_string(),
            );
        }

        Ok(())
    }
}

fn try_suspend() -> bool {
    unsafe { SetSuspendState(0, 0, 0) != 0 }
}

fn try_hibernate() -> bool {
    unsafe { SetSuspendState(1, 0, 0) != 0 }
}

fn try_shutdown_restart() -> Result<(), String> {
    Command::new("shutdown")
        .args(["/r", "/t", "0", "/f"])
        .spawn()
        .map_err(|e| format!("Failed to run shutdown /r: {}", e))?;
    Ok(())
}

fn try_shutdown_poweroff() -> Result<(), String> {
    Command::new("shutdown")
        .args(["/s", "/t", "0", "/f"])
        .spawn()
        .map_err(|e| format!("Failed to run shutdown /s: {}", e))?;
    Ok(())
}

#[tauri::command]
pub fn execute_sleep() -> Result<PowerResult, String> {
    let _ = enable_shutdown_privilege();

    let suspend_allowed = load_powrprof_fn("IsPwrSuspendAllowed")
        .map(|f| unsafe { f() != 0 })
        .unwrap_or(false);

    let hibernate_allowed = load_powrprof_fn("IsPwrHibernateAllowed")
        .map(|f| unsafe { f() != 0 })
        .unwrap_or(false);

    log::info!(
        "Power capabilities — Suspend allowed: {}, Hibernate allowed: {}",
        suspend_allowed,
        hibernate_allowed
    );

    if suspend_allowed {
        if try_suspend() {
            return Ok(PowerResult::success("System is going to sleep"));
        }
        let error = unsafe { GetLastError() };
        log::warn!("Suspend API call failed despite being allowed. Error: {}", error);
    }

    if hibernate_allowed {
        if try_hibernate() {
            return Ok(PowerResult::success(
                "Sleep not available — falling back to hibernation",
            ));
        }
        let error = unsafe { GetLastError() };
        log::warn!("Hibernate API call failed despite being allowed. Error: {}", error);
    }

    if !suspend_allowed && !hibernate_allowed {
        return Ok(PowerResult::error(
            "This system does not support sleep or hibernation.\n\n\
             This is often caused by:\n\
             \u{2022} Missing or incompatible chipset / ACPI drivers\n\
             \u{2022} Running inside a virtual machine\n\
             \u{2022} Windows Server edition (sleep/hibernate not available)\n\
             \u{2022} Hibernation disabled (run 'powercfg /h on' as admin to enable)\n\n\
             Please check your power settings and drivers."
                .to_string(),
        ));
    }

    if suspend_allowed {
        return Ok(PowerResult::error(
            "Sleep is supported but the sleep request failed.\n\
             This may require running the application as administrator."
                .to_string(),
        ));
    }

    Ok(PowerResult::error(
        "Sleep is not supported on this system. \
         Hibernation is allowed but the request failed.\n\
         Try running 'powercfg /h on' as administrator and restart the app."
            .to_string(),
    ))
}

#[tauri::command]
pub fn execute_restart() -> Result<PowerResult, String> {
    if let Err(e) = enable_shutdown_privilege() {
        log::warn!("Failed to enable shutdown privilege: {}", e);
    }

    unsafe {
        let result = ExitWindowsEx(
            EWX_REBOOT | EWX_FORCEIFHUNG,
            SHTDN_REASON_MAJOR_OTHER | SHTDN_REASON_MINOR_OTHER,
        );

        if result != 0 {
            return Ok(PowerResult::success("System is restarting"));
        }

        let error = GetLastError();
        log::warn!("ExitWindowsEx (restart) failed with error code: {}", error);
    }

    match try_shutdown_restart() {
        Ok(()) => Ok(PowerResult::success("System is restarting (via shutdown command)")),
        Err(e) => Ok(PowerResult::error(format!(
            "Failed to restart the system: {}",
            e
        ))),
    }
}

#[tauri::command]
pub fn execute_shutdown() -> Result<PowerResult, String> {
    if let Err(e) = enable_shutdown_privilege() {
        log::warn!("Failed to enable shutdown privilege: {}", e);
    }

    unsafe {
        let result = ExitWindowsEx(
            EWX_SHUTDOWN | EWX_FORCEIFHUNG,
            SHTDN_REASON_MAJOR_OTHER | SHTDN_REASON_MINOR_OTHER,
        );

        if result != 0 {
            return Ok(PowerResult::success("System is shutting down"));
        }

        let error = GetLastError();
        log::warn!("ExitWindowsEx (shutdown) failed with error code: {}", error);
    }

    match try_shutdown_poweroff() {
        Ok(()) => Ok(PowerResult::success(
            "System is shutting down (via shutdown command)",
        )),
        Err(e) => Ok(PowerResult::error(format!(
            "Failed to shut down the system: {}",
            e
        ))),
    }
}
