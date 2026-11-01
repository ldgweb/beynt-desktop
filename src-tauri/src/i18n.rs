//! The text this process shows (tray, menus, errors) in the language the windows report
//! (Settings → Appearance). Until a window reports it, English.

use std::sync::atomic::{AtomicBool, Ordering};

static ITALIAN: AtomicBool = AtomicBool::new(false);

/// True when the language changed, so the menus are rebuilt.
pub fn set_language(language: &str) -> bool {
    let italian = match language {
        "it" => true,
        "en" => false,
        _ => return false,
    };
    ITALIAN.swap(italian, Ordering::Relaxed) != italian
}

pub fn italian() -> bool {
    ITALIAN.load(Ordering::Relaxed)
}

pub fn text<'a>(english: &'a str, italian_text: &'a str) -> &'a str {
    if italian() { italian_text } else { english }
}
