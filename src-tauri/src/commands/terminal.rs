use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use std::{
    io::{Read, Write},
    sync::{Arc, Mutex},
    thread,
};
use tauri::{Emitter, State, AppHandle};

pub struct TerminalState {
    pub pty_pair: Arc<Mutex<PtyPair>>,
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub is_shell_running: Arc<Mutex<bool>>,
}

impl TerminalState {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let pty_system = native_pty_system();
        let pty_pair = pty_system.openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let writer = pty_pair.master.take_writer()?;

        Ok(Self {
            pty_pair: Arc::new(Mutex::new(pty_pair)),
            writer: Arc::new(Mutex::new(writer)),
            is_shell_running: Arc::new(Mutex::new(false)),
        })
    }
}

fn get_default_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        if std::env::var("PSModulePath").is_ok() {
            "powershell.exe".to_string()
        } else {
            "cmd.exe".to_string()
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| {
            if std::path::Path::new("/bin/bash").exists() {
                "/bin/bash".to_string()
            } else if std::path::Path::new("/bin/zsh").exists() {
                "/bin/zsh".to_string()
            } else if std::path::Path::new("/bin/sh").exists() {
                "/bin/sh".to_string()
            } else {
                "sh".to_string()
            }
        })
    }
}

fn get_term_env() -> String {
    #[cfg(target_os = "windows")]
    {
        "cygwin".to_string()
    }

    #[cfg(not(target_os = "windows"))]
    {
        "xterm-256color".to_string()
    }
}

#[tauri::command]
pub fn terminal_create_shell(state: State<'_, TerminalState>) -> Result<(), String> {
    if *state.is_shell_running.lock().map_err(|e| e.to_string())? {
        log::info!("Shell is already running, skipping creation");
        return Ok(());
    }

    let shell = get_default_shell();
    let mut cmd = CommandBuilder::new(&shell);

    cmd.env("TERM", get_term_env());

    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(path) = std::env::var("PATH") {
            cmd.env("PATH", path);
        }
        if let Ok(home) = std::env::var("HOME") {
            cmd.env("HOME", home);
        }
    }

    let mut child = state
        .pty_pair
        .lock()
        .map_err(|e| e.to_string())?
        .slave
        .spawn_command(cmd)
        .map_err(|err| err.to_string())?;

    *state.is_shell_running.lock().map_err(|e| e.to_string())? = true;

    let is_running = Arc::clone(&state.is_shell_running);
    thread::spawn(move || {
        let _ = child.wait();
        *is_running.lock().unwrap() = false;
    });

    Ok(())
}

#[tauri::command]
pub fn terminal_write(data: String, state: State<'_, TerminalState>) -> Result<(), String> {
    let mut writer = state.writer.lock().map_err(|e| e.to_string())?;
    writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn terminal_resize(rows: u16, cols: u16, state: State<'_, TerminalState>) -> Result<(), String> {
    state
        .pty_pair
        .lock()
        .map_err(|e| e.to_string())?
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_start_reader(app: AppHandle, state: State<'_, TerminalState>) -> Result<(), String> {
    let reader = state
        .pty_pair
        .lock()
        .map_err(|e| e.to_string())?
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;

    thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];

        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]);
                    let _ = app.emit("terminal-output", data.to_string());
                }
                Err(e) => {
                    log::error!("Terminal reader error: {}", e);
                    break;
                }
            }
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_shell_is_non_empty() {
        assert!(!get_default_shell().is_empty());
    }

    #[test]
    fn default_shell_prefers_bash_when_shell_env_is_unset() {
        #[cfg(not(target_os = "windows"))]
        {
            std::env::remove_var("SHELL");
            if std::path::Path::new("/bin/bash").exists() {
                assert_eq!(get_default_shell(), "/bin/bash");
            }
        }
    }

    #[test]
    fn terminal_env_is_set() {
        assert!(!get_term_env().is_empty());
    }
}
