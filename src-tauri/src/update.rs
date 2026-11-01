//! New versions from the project's GitHub releases (tauri-plugin-updater). The app looks at start and
//! every few hours and tells the windows; nothing is installed until the person chooses *Install*,
//! and only an update signed with the project's key (`plugins.updater.pubkey`) is.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::UpdaterExt;

use crate::i18n::text;

const FIRST_CHECK: Duration = Duration::from_secs(30);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 60 * 60);

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Available {
    version: String,
    notes: Option<String>,
}

/// The newer version found by the last check, if any.
#[derive(Default)]
pub struct Updates(Mutex<Option<Available>>);

async fn check(app: &AppHandle) -> Result<Option<tauri_plugin_updater::Update>, tauri_plugin_updater::Error> {
    app.updater()?.check().await
}

/// Installed builds only: a development build is not what the releases replace.
pub fn keep_checking(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_CHECK).await;
        loop {
            // Offline, or no published release yet: the next round tries again.
            if let Ok(found) = check(&app).await {
                let found = found.map(|update| Available { version: update.version, notes: update.body });
                *app.state::<Updates>().0.lock().unwrap() = found.clone();
                if found.is_some() {
                    _ = app.emit("update-available", &found);
                }
            }
            tokio::time::sleep(CHECK_EVERY).await;
        }
    });
}

#[tauri::command]
pub fn update_status(updates: State<Updates>) -> Option<Available> {
    updates.0.lock().unwrap().clone()
}

/// Downloads the newest version, refuses it unless its signature matches the project's key, installs
/// it and starts it. On Windows the installer takes over and this process exits.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    let failed = |error: tauri_plugin_updater::Error| {
        format!("{} {error}", text("The update did not install:", "L’aggiornamento non si è installato:"))
    };
    let Some(update) = check(&app).await.map_err(failed)? else {
        return Err(text("Beynt is already up to date.", "Beynt è già aggiornato.").into());
    };
    update.download_and_install(|_, _| {}, || {}).await.map_err(failed)?;
    app.restart()
}
