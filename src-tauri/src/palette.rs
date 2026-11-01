//! The palette: a small always-on-top window that a global shortcut opens from any app. Type,
//! arrows, Enter: a command lands on the clipboard, a note opens on the web. It hides as soon as
//! it loses the focus.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::utils::config::WindowEffectsConfig;
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::window::{Color, Effect};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

use crate::menu;
use crate::window::is_app_url;

pub const LABEL: &str = "palette";
/// `beynt-desktop --palette` opens it: for desktops that refuse global shortcuts (Wayland).
pub const FLAG: &str = "--palette";

/// Ctrl+Alt+B on Windows and Linux; on a Mac ⌥⇧Space, since ⌥⌘B opens the browsers' bookmarks.
/// Never Ctrl+Alt+Space, which launchers often take. Changeable in Settings.
pub const DEFAULT_SHORTCUT: &str = if cfg!(target_os = "macos") { "Alt+Shift+Space" } else { "CommandOrControl+Alt+B" };

/// ⌘ or Ctrl (CommandOrControl), the Mac's ⌃ (Control) and/or Alt, in this order and optionally
/// Shift (alone it would eat capitals), then a letter, a digit, Space or an F key. No Windows key,
/// no punctuation. The page records the same set (`acceleratorFor`).
pub fn is_shortcut(value: &str) -> bool {
    const MODIFIERS: [&str; 4] = ["CommandOrControl", "Control", "Alt", "Shift"];
    let mut parts: Vec<&str> = value.split('+').collect();
    let Some(key) = parts.pop() else { return false };
    let single = key.len() == 1 && key.bytes().all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit());
    let function = key
        .strip_prefix('F')
        .is_some_and(|n| !n.starts_with('0') && n.parse::<u8>().is_ok_and(|n| (1..=24).contains(&n)));
    let mut next = 0;
    for part in &parts {
        match MODIFIERS[next..].iter().position(|modifier| modifier == part) {
            Some(index) => next += index + 1,
            None => return false,
        }
    }
    (single || function || key == "Space") && parts.iter().any(|part| *part != "Shift")
}

#[derive(Serialize, Deserialize)]
struct Saved {
    shortcut: String,
}

struct Shortcut {
    accelerator: String,
    /// false when another app owns the combination.
    registered: bool,
}

#[derive(Default)]
struct Page {
    /// The window is being created or exists: created once, off the main thread.
    started: bool,
    loaded: bool,
    /// Asked to show before the page had loaded.
    pending: bool,
}

pub struct Palette {
    shortcut: Mutex<Shortcut>,
    page: Mutex<Page>,
    file: PathBuf,
}

impl Palette {
    pub fn load(file: PathBuf) -> Self {
        let accelerator = fs::read(&file)
            .ok()
            .and_then(|bytes| serde_json::from_slice::<Saved>(&bytes).ok())
            .map(|saved| saved.shortcut)
            .filter(|shortcut| is_shortcut(shortcut))
            .unwrap_or_else(|| DEFAULT_SHORTCUT.to_string());
        Self { shortcut: Mutex::new(Shortcut { accelerator, registered: false }), page: Mutex::default(), file }
    }

    pub fn accelerator(&self) -> String {
        self.shortcut.lock().unwrap().accelerator.clone()
    }

    fn status(&self) -> Status {
        let shortcut = self.shortcut.lock().unwrap();
        Status {
            shortcut: shortcut.accelerator.clone(),
            registered: shortcut.registered,
            launch_command: launch_command(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    shortcut: String,
    registered: bool,
    /// Linux only: the command to bind to a system shortcut when the desktop refuses ours.
    #[serde(skip_serializing_if = "Option::is_none")]
    launch_command: Option<String>,
}

#[derive(Serialize)]
pub struct Change {
    #[serde(flatten)]
    status: Status,
    /// The combination belongs to another app: the previous one stayed.
    taken: bool,
}

fn launch_command() -> Option<String> {
    if !cfg!(target_os = "linux") {
        return None;
    }
    // An AppImage runs from a temporary mount: APPIMAGE is the file the person launched.
    let program = std::env::var_os("APPIMAGE").map(PathBuf::from).or_else(|| std::env::current_exe().ok())?;
    Some(format!("\"{}\" {FLAG}", program.display()))
}

/// Registers the saved shortcut; `registered` stays false when another app owns it.
pub fn register(app: &AppHandle) {
    let palette = app.state::<Palette>();
    let mut shortcut = palette.shortcut.lock().unwrap();
    shortcut.registered = app.global_shortcut().register(shortcut.accelerator.as_str()).is_ok();
}

/// Windows 11 22H2 and later (build 22621) draw Acrylic behind the page.
fn material() -> bool {
    #[cfg(windows)]
    return windows_version::OsVersion::current().build >= 22621;
    #[cfg(not(windows))]
    false
}

/// Builds the hidden window. Never on the main thread: WebView2 would deadlock there.
fn create(app: &AppHandle) {
    let material = material();
    let page = if material { "index.html#palette-material" } else { "index.html#palette" };
    let dev_url = app.config().build.dev_url.clone();
    let builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(page.into()))
        .title("Beynt")
        .inner_size(720.0, 480.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .visible(false)
        .on_navigation(move |url| is_app_url(url, dev_url.as_ref()))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                loaded(&window);
            }
        });
    let builder = if material {
        builder.transparent(true).effects(WindowEffectsConfig { effects: vec![Effect::Acrylic], ..Default::default() })
    } else {
        builder.background_color(Color(28, 27, 25, 255))
    };
    match builder.build() {
        Ok(window) => {
            let handle = window.clone();
            window.on_window_event(move |event| match event {
                // A palette is a quick look-up: it goes away as soon as the focus does.
                WindowEvent::Focused(false) if !devtools_open(&handle) => hide(handle.app_handle()),
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    hide(handle.app_handle());
                }
                _ => {}
            });
        }
        Err(_) => app.state::<Palette>().page.lock().unwrap().started = false,
    }
}

#[cfg(debug_assertions)]
fn devtools_open(window: &WebviewWindow) -> bool {
    window.is_devtools_open()
}

#[cfg(not(debug_assertions))]
fn devtools_open(_: &WebviewWindow) -> bool {
    false
}

/// Starts creating the window unless it exists or is on its way.
fn ensure(app: &AppHandle, page: &mut Page) {
    if !page.started {
        page.started = true;
        let app = app.clone();
        std::thread::spawn(move || create(&app));
    }
}

/// Created a few seconds after start-up, so even the first shortcut opens a ready window.
pub fn prewarm(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        ensure(&app, &mut app.state::<Palette>().page.lock().unwrap());
    });
}

// `reveal` runs after the lock is released: it waits for the main thread, which may be waiting for
// the lock itself (on Linux the shortcut and a second launch arrive on other threads).
fn loaded(window: &WebviewWindow) {
    let pending = {
        let palette = window.state::<Palette>();
        let mut page = palette.page.lock().unwrap();
        page.loaded = true;
        std::mem::take(&mut page.pending)
    };
    if pending {
        reveal(window);
    }
}

pub fn show(app: &AppHandle) {
    let ready = {
        let palette = app.state::<Palette>();
        let mut page = palette.page.lock().unwrap();
        let ready = app.get_webview_window(LABEL).filter(|_| page.loaded);
        if ready.is_none() {
            page.pending = true;
            ensure(app, &mut page);
        }
        ready
    };
    if let Some(window) = ready {
        reveal(&window);
    }
}

/// On the screen the person is working on, in its upper fifth, as other launchers do.
fn reveal(window: &WebviewWindow) {
    let app = window.app_handle();
    if let (Ok(cursor), Ok(size), Ok(scale)) = (app.cursor_position(), window.outer_size(), window.scale_factor())
        && let Ok(Some(monitor)) = app.monitor_from_point(cursor.x, cursor.y)
    {
        let area = monitor.work_area();
        // The window takes that screen's scale once there: its width in that screen's pixels.
        let width = (f64::from(size.width) / scale * monitor.scale_factor()).round() as i32;
        let x = area.position.x + (area.size.width as i32 - width) / 2;
        let y = area.position.y + area.size.height as i32 / 5;
        _ = window.set_position(PhysicalPosition::new(x, y));
    }
    // A shortcut pressed in another app: on a Mac Beynt must become the active app to get the keys.
    #[cfg(target_os = "macos")]
    {
        _ = app.show();
    }
    _ = window.show();
    _ = window.set_focus();
    _ = app.emit_to(LABEL, "palette-opened", ());
}

/// Hides the palette; on a Mac the app the person came from gets the focus back, ready to paste.
pub fn hide(app: &AppHandle) {
    let Some(window) = app.get_webview_window(LABEL) else { return };
    if !window.is_visible().unwrap_or(false) {
        return;
    }
    _ = window.hide();
    // macOS keeps Beynt active after its last visible window hides.
    #[cfg(target_os = "macos")]
    if !app.webview_windows().values().any(|other| other.label() != LABEL && other.is_visible().unwrap_or(false)) {
        _ = app.hide();
    }
}

#[tauri::command]
pub fn palette_status(palette: State<Palette>) -> Status {
    palette.status()
}

#[tauri::command]
pub fn palette_hide(app: AppHandle) {
    hide(&app);
}

/// A combination another app owns leaves the working one in place: never none.
#[tauri::command]
pub fn palette_set_shortcut(app: AppHandle, palette: State<Palette>, shortcut: String) -> Result<Change, String> {
    if !is_shortcut(&shortcut) {
        return Err("Invalid shortcut.".into());
    }
    let manager = app.global_shortcut();
    {
        let mut current = palette.shortcut.lock().unwrap();
        if current.accelerator == shortcut && current.registered {
            drop(current);
            return Ok(Change { status: palette.status(), taken: false });
        }
        if current.registered {
            _ = manager.unregister(current.accelerator.as_str());
        }
        if manager.register(shortcut.as_str()).is_err() {
            current.registered = current.registered && manager.register(current.accelerator.as_str()).is_ok();
            drop(current);
            return Ok(Change { status: palette.status(), taken: true });
        }
        *current = Shortcut { accelerator: shortcut.clone(), registered: true };
    }
    // Not saved: it still works until the next start.
    _ = fs::write(&palette.file, serde_json::to_vec_pretty(&Saved { shortcut }).unwrap_or_default());
    menu::update(&app);
    Ok(Change { status: palette.status(), taken: false })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shortcuts_people_can_choose() {
        for shortcut in
            ["CommandOrControl+Alt+B", "Alt+Shift+Space", "Control+Alt+F12", "CommandOrControl+Shift+1", "Alt+K"]
        {
            assert!(is_shortcut(shortcut), "{shortcut}");
        }
        for shortcut in [
            "B",
            "Shift+B",
            "Alt+CommandOrControl+B",
            "Alt+Alt+B",
            "Super+B",
            "Alt+b",
            "Alt+F25",
            "Alt+F0",
            "Alt+.",
            "Alt+",
            "",
        ] {
            assert!(!is_shortcut(shortcut), "{shortcut}");
        }
    }

    #[test]
    fn the_default_is_valid() {
        assert!(is_shortcut(DEFAULT_SHORTCUT));
    }
}
