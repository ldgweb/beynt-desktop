//! Beynt desktop: the person's Beynt commands, queries, configs and prompts from any app through
//! a global palette, and their notes, opened in beynt.com's reader. This process owns everything
//! privileged (the key, the network, the clipboard, the shortcut); the windows are UI only.

// No console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod account;
mod api;
#[cfg(test)]
mod fake_beynt;
mod i18n;
mod library;
mod menu;
mod palette;
mod startup;
mod update;
mod window;

use std::fs;

use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

use account::Accounts;
use i18n::text;
use library::Libraries;
use palette::Palette;
use update::Updates;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Artifact {
    stack_id: u64,
    id: u64,
}

/// beynt.com, or an artifact in its reader: always on the address the key was saved with.
fn web_url(app: &AppHandle, artifact: Option<Artifact>) -> Result<String, String> {
    let base = app.state::<Accounts>().base_url();
    if !api::is_secure_url(&base) {
        return Err(text("The Beynt address is not valid.", "L’indirizzo di Beynt non è valido.").into());
    }
    Ok(match artifact {
        Some(artifact) => api::artifact_url(&base, artifact.stack_id, artifact.id),
        None => base,
    })
}

fn open_web(app: &AppHandle, artifact: Option<Artifact>) -> Result<(), String> {
    let url = web_url(app, artifact)?;
    app.opener().open_url(url, None::<&str>).map_err(|error| error.to_string())
}

#[tauri::command]
async fn open_beynt(app: AppHandle, artifact: Option<Artifact>) -> Result<(), String> {
    open_web(&app, artifact)
}

#[tauri::command]
fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|error| error.to_string())
}

/// The link beynt.com's *Copy link* gives, for a person or an agent with Beynt's MCP.
#[tauri::command]
fn copy_link(app: AppHandle, artifact: Artifact) -> Result<(), String> {
    let url = web_url(&app, Some(artifact))?;
    app.clipboard().write_text(url).map_err(|error| error.to_string())
}

/// The windows report the language they show, so the menus and this process's messages match it.
#[tauri::command]
fn set_language(app: AppHandle, language: String) {
    if i18n::set_language(&language) {
        menu::update(&app);
    }
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let open_palette = args.iter().any(|arg| arg == palette::FLAG);
    // Started at login, or to open the palette: no window until the person asks for it.
    let hidden = open_palette || args.iter().any(|arg| arg == startup::HIDDEN_FLAG);

    tauri::Builder::default()
        // First: a second launch hands its arguments to this one and exits.
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if args.iter().any(|arg| arg == palette::FLAG) { palette::show(app) } else { window::show(app) }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state == ShortcutState::Pressed {
                        palette::show(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().args([startup::HIDDEN_FLAG]).build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
                .with_denylist(&[palette::LABEL])
                .build(),
        )
        .setup(move |app| {
            let data = app.path().app_data_dir()?;
            fs::create_dir_all(&data)?;
            app.manage(Accounts::new(&app.config().identifier));
            app.manage(Libraries::load(data.join("library.json")));
            app.manage(Palette::load(data.join("palette.json")));
            app.manage(Updates::default());
            let app = app.handle();
            startup::apply_default(app);
            palette::register(app);
            menu::create(app)?;
            window::create(app, !hidden)?;
            if open_palette {
                palette::show(app)
            } else {
                palette::prewarm(app)
            }
            library::keep_fresh(app.clone());
            update::keep_checking(app.clone());
            Ok(())
        })
        .on_menu_event(menu::handle)
        .invoke_handler(tauri::generate_handler![
            account::account_status,
            account::account_connect,
            account::account_disconnect,
            account::account_open_keys,
            library::library_get,
            library::library_refresh,
            library::library_search,
            palette::palette_status,
            palette::palette_set_shortcut,
            palette::palette_hide,
            startup::startup_get,
            startup::startup_set,
            update::update_status,
            update::update_install,
            open_beynt,
            copy_text,
            copy_link,
            set_language,
            quit,
        ])
        .build(tauri::generate_context!())
        .expect("Beynt could not start")
        .run(|_app, _event| {
            // macOS: the Dock icon brings the window back (closing it only hid it).
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = _event {
                window::show(_app);
            }
        });
}
