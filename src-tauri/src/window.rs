//! The main window: the library, Settings and the account. Closing it hides it, since the palette
//! keeps working from the tray. Windows draws no frame (the title bar is the app's own); a Mac
//! keeps its traffic lights inside that bar; Linux keeps the native frame.

use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::window::Color;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub const LABEL: &str = "main";

/// Only the app's own pages: the bundled ones, or the dev server in development.
pub fn is_app_url(url: &Url, dev_url: Option<&Url>) -> bool {
    match dev_url {
        Some(dev) if tauri::is_dev() => url.origin() == dev.origin(),
        _ => {
            (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                || (url.scheme() == "http" && url.host_str() == Some("tauri.localhost"))
        }
    }
}

/// Created hidden and shown once painted, unless Beynt started in the tray (`--hidden`).
pub fn create(app: &AppHandle, show: bool) -> tauri::Result<()> {
    let dev_url = app.config().build.dev_url.clone();
    let builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::default())
        .title("Beynt")
        .inner_size(1100.0, 720.0)
        .min_inner_size(760.0, 480.0)
        .visible(false)
        .background_color(Color(20, 19, 18, 255))
        .on_navigation(move |url| is_app_url(url, dev_url.as_ref()))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_page_load(move |window, payload| {
            if show && payload.event() == PageLoadEvent::Finished {
                _ = window.show();
            }
        });
    #[cfg(windows)]
    let builder = builder.decorations(false);
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(12.0, 11.0));
    let window = builder.build()?;
    let handle = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            _ = handle.hide();
        }
    });
    Ok(())
}

pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        _ = window.unminimize();
        _ = window.show();
        _ = window.set_focus();
    }
}

/// A menu action (library, settings, find) runs in the main window, shown first.
pub fn run(app: &AppHandle, action: &str) {
    show(app);
    _ = app.emit_to(LABEL, "app-menu", action);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_bundled_pages_are_the_app() {
        let url = |text: &str| Url::parse(text).unwrap();
        assert!(is_app_url(&url("tauri://localhost/index.html#palette"), None));
        assert!(is_app_url(&url("http://tauri.localhost/"), None));
        for other in
            ["https://beynt.com/", "http://tauri.localhost.evil.example/", "tauri://evil/", "file:///C:/x.html"]
        {
            assert!(!is_app_url(&url(other), None), "{other}");
        }
    }
}
