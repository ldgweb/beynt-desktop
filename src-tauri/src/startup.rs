//! Start at login, in the tray (`--hidden`): without it the shortcut does nothing until Beynt is
//! opened by hand. Turned on once by default, and only in installed builds: a development build
//! would register its own executable.

use std::fs;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_autostart::ManagerExt;

pub const HIDDEN_FLAG: &str = "--hidden";
const AVAILABLE: bool = !cfg!(debug_assertions);

pub fn apply_default(app: &AppHandle) {
    let Ok(marker) = app.path().app_data_dir().map(|dir| dir.join("startup-default-applied")) else { return };
    if AVAILABLE && !marker.exists() && app.autolaunch().enable().is_ok() {
        _ = fs::write(marker, "");
    }
}

#[derive(Serialize)]
pub struct Startup {
    available: bool,
    enabled: bool,
}

fn status(app: &AppHandle) -> Startup {
    Startup { available: AVAILABLE, enabled: AVAILABLE && app.autolaunch().is_enabled().unwrap_or(false) }
}

#[tauri::command]
pub fn startup_get(app: AppHandle) -> Startup {
    status(&app)
}

/// The status after the change shows what really happened.
#[tauri::command]
pub fn startup_set(app: AppHandle, enabled: bool) -> Startup {
    if AVAILABLE {
        _ = if enabled { app.autolaunch().enable() } else { app.autolaunch().disable() };
    }
    status(&app)
}
