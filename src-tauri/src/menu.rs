//! The tray menu and, on a Mac, the menu bar (its Edit menu is what makes ⌘C and ⌘V work).
//! Windows and Linux use the menus in the window's own title bar. Rebuilt when the language or
//! the shortcut changes.

use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

use crate::i18n::text;
use crate::palette::{self, Palette};
use crate::window;

const TRAY: &str = "tray";

fn tray_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let search = text("Search commands and notes", "Cerca comandi e note");
    // Only a hint next to the item; Linux tray menus (GTK) reject accelerators.
    let accelerator = (!cfg!(target_os = "linux")).then(|| app.state::<Palette>().accelerator());
    let search = MenuItem::with_id(app, "search", search, true, accelerator.as_deref())
        .or_else(|_| MenuItem::with_id(app, "search", search, true, None::<&str>))?;
    Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, "open", text("Open Beynt", "Apri Beynt"), true, None::<&str>)?,
            &search,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", text("Quit", "Esci"), true, None::<&str>)?,
        ],
    )
}

#[cfg(target_os = "macos")]
fn app_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    use tauri::menu::{AboutMetadata, Submenu};
    let about = AboutMetadata {
        name: Some("Beynt".into()),
        version: Some(app.package_info().version.to_string()),
        ..Default::default()
    };
    let separator = || PredefinedMenuItem::separator(app);
    let item = |id: &str, label: &str, accelerator: &str| MenuItem::with_id(app, id, label, true, Some(accelerator));
    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                "Beynt",
                true,
                &[
                    &PredefinedMenuItem::about(app, Some(text("About Beynt", "Informazioni su Beynt")), Some(about))?,
                    &separator()?,
                    &item("settings", text("Settings…", "Impostazioni…"), "Cmd+,")?,
                    &separator()?,
                    &PredefinedMenuItem::services(app, None)?,
                    &separator()?,
                    &PredefinedMenuItem::hide(app, Some(text("Hide Beynt", "Nascondi Beynt")))?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &separator()?,
                    &PredefinedMenuItem::quit(app, Some(text("Quit Beynt", "Esci da Beynt")))?,
                ],
            )?,
            &Submenu::with_items(app, "File", true, &[&PredefinedMenuItem::close_window(app, None)?])?,
            &Submenu::with_items(
                app,
                text("Edit", "Modifica"),
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &separator()?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                text("View", "Vista"),
                true,
                &[
                    &item("library", text("Library", "Libreria"), "Cmd+1")?,
                    &separator()?,
                    &item("find", text("Search", "Cerca"), "Cmd+F")?,
                ],
            )?,
            &Submenu::with_items(
                app,
                text("Window", "Finestra"),
                true,
                &[&PredefinedMenuItem::minimize(app, None)?, &PredefinedMenuItem::maximize(app, None)?],
            )?,
            &Submenu::with_items(
                app,
                text("Help", "Aiuto"),
                true,
                &[&MenuItem::with_id(app, "web", "beynt.com", true, None::<&str>)?],
            )?,
        ],
    )
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    app.set_menu(app_menu(app)?)?;
    let mut tray = TrayIconBuilder::with_id(TRAY)
        .tooltip("Beynt")
        .menu(&tray_menu(app)?)
        // A Mac opens a menu bar item's menu on click; Windows opens the window and keeps the menu on the right button.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_tray_icon_event(|tray, event| {
            if !cfg!(target_os = "macos")
                && let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } =
                    event
            {
                window::show(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub fn update(app: &AppHandle) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id(TRAY), tray_menu(app)) {
        _ = tray.set_menu(Some(menu));
    }
    #[cfg(target_os = "macos")]
    if let Ok(menu) = app_menu(app) {
        _ = app.set_menu(menu);
    }
}

pub fn handle(app: &AppHandle, event: MenuEvent) {
    match event.id().as_ref() {
        "open" => window::show(app),
        "search" => palette::show(app),
        "quit" => app.exit(0),
        "web" => _ = crate::open_web(app, None),
        action @ ("library" | "settings" | "find") => window::run(app, action),
        _ => {}
    }
}
