//! The access key: pasted by the person, checked against Beynt, kept in the system's credential
//! store (Windows Credential Manager, macOS Keychain, Secret Service on Linux) and only ever sent
//! to the Beynt address it was saved with. It never reaches the windows.

use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};

use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::api::{self, Client};
use crate::i18n::{italian, text};
use crate::library::Libraries;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub token: String,
    pub base_url: String,
}

pub struct Accounts {
    service: String,
    /// What the store holds once read (`Some(None)`: no key). Left empty when the store could not
    /// be read, as a Linux keyring still locked at login, so the next call reads it again.
    cached: Mutex<Option<Option<Account>>>,
    /// A key checked while another change happened is not saved over it.
    revision: AtomicU64,
}

impl Accounts {
    /// `service` is the app's identifier: the development build keeps its own key.
    pub fn new(service: &str) -> Self {
        Self { service: service.to_string(), cached: Mutex::new(None), revision: AtomicU64::new(0) }
    }

    fn entry(&self) -> keyring::Result<Entry> {
        Entry::new(&self.service, "account")
    }

    pub fn current(&self) -> Option<Account> {
        let mut cached = self.cached.lock().unwrap();
        if let Some(account) = cached.as_ref() {
            return account.clone();
        }
        let account = match self.entry().and_then(|entry| entry.get_password()) {
            Ok(json) => serde_json::from_str(&json).ok(),
            Err(keyring::Error::NoEntry) => None,
            Err(_) => return None,
        };
        *cached = Some(account.clone());
        account
    }

    pub fn base_url(&self) -> String {
        self.current().map_or_else(|| api::DEFAULT_URL.to_string(), |account| account.base_url)
    }

    /// The address the person typed, or the saved one when the field was left empty.
    fn typed_or_saved(&self, typed: &str) -> String {
        match api::normalize(typed) {
            url if url.is_empty() => self.base_url(),
            url => url,
        }
    }

    fn save(&self, account: Account) -> Result<(), String> {
        let json = serde_json::to_string(&account).map_err(|error| error.to_string())?;
        self.entry().and_then(|entry| entry.set_password(&json)).map_err(|error| {
            if italian() {
                format!(
                    "Questo sistema non ha un portachiavi che custodisca la chiave, quindi non viene salvata ({error})."
                )
            } else {
                format!("This system has no keychain to keep the key safe, so it is not saved ({error}).")
            }
        })?;
        *self.cached.lock().unwrap() = Some(Some(account));
        Ok(())
    }

    fn delete(&self) -> Result<(), String> {
        match self.entry().and_then(|entry| entry.delete_credential()) {
            Ok(()) | Err(keyring::Error::NoEntry) => {
                *self.cached.lock().unwrap() = Some(None);
                Ok(())
            }
            Err(error) => Err(format!(
                "{} ({error})",
                text("The key could not be removed.", "Non è stato possibile togliere la chiave.")
            )),
        }
    }
}

fn insecure_address() -> String {
    text(
        "The Beynt address must use HTTPS (HTTP only on this computer).",
        "L’indirizzo di Beynt deve usare HTTPS (HTTP solo su questo computer).",
    )
    .into()
}

/// Checks a key on the routes the library reads, without saving it.
async fn validate(base_url: &str, token: &str) -> Result<(), String> {
    if !api::is_secure_url(base_url) {
        return Err(insecure_address());
    }
    let client = Client::new(base_url, token).map_err(|error| error.to_string())?;
    let stacks = client.stacks().await.map_err(|error| match error {
        api::Error::Status(401 | 403, _) => text(
            "Invalid key, or without the stacks:read permission.",
            "Chiave non valida o senza il permesso stacks:read.",
        )
        .into(),
        api::Error::Status(code, _) if italian() => format!("Beynt risponde {code} su /stacks."),
        api::Error::Status(code, _) => format!("Beynt answered {code} on /stacks."),
        error => error.to_string(),
    })?;
    let Some(first) = stacks.first() else { return Ok(()) };
    client.probe_index(first.id).await.map_err(|error| match error {
        api::Error::Status(401 | 403, _) => text(
            "Valid key, but without the artifacts:read permission.",
            "Chiave valida ma senza il permesso artifacts:read.",
        )
        .into(),
        api::Error::Status(code, _) if italian() => format!("Beynt risponde {code} sull’indice dello stack."),
        api::Error::Status(code, _) => format!("Beynt answered {code} on the stack index."),
        error => error.to_string(),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    connected: bool,
    base_url: String,
}

#[tauri::command]
pub async fn account_status(accounts: State<'_, Accounts>) -> Result<Status, ()> {
    Ok(Status { connected: accounts.current().is_some(), base_url: accounts.base_url() })
}

#[tauri::command]
pub async fn account_connect(
    app: AppHandle,
    accounts: State<'_, Accounts>,
    token: String,
    base_url: String,
) -> Result<(), String> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err(text("Paste an access key.", "Incolla una chiave di accesso.").into());
    }
    let base_url = accounts.typed_or_saved(&base_url);
    let revision = accounts.revision.fetch_add(1, Ordering::SeqCst) + 1;
    validate(&base_url, &token).await?;
    if accounts.revision.load(Ordering::SeqCst) != revision {
        return Err(text(
            "Cancelled by a newer change to the account.",
            "Annullato da una modifica più recente all’account.",
        )
        .into());
    }
    accounts.save(Account { token, base_url })?;
    app.state::<Libraries>().clear(&app);
    tauri::async_runtime::spawn(async move {
        // Its result reaches the windows as `library-changed`; an error shows at the next refresh.
        _ = app.state::<Libraries>().refresh(&app).await;
    });
    Ok(())
}

/// Opens the page where the key is created, on the Beynt address being connected (empty: the saved one).
#[tauri::command]
pub fn account_open_keys(app: AppHandle, accounts: State<'_, Accounts>, base_url: String) -> Result<(), String> {
    let base_url = accounts.typed_or_saved(&base_url);
    if !api::is_secure_url(&base_url) {
        return Err(insecure_address());
    }
    app.opener().open_url(api::access_keys_url(&base_url), None::<&str>).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn account_disconnect(app: AppHandle, accounts: State<'_, Accounts>) -> Result<(), String> {
    accounts.revision.fetch_add(1, Ordering::SeqCst);
    accounts.delete()?;
    app.state::<Libraries>().clear(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake_beynt::{Remote, serve};

    #[tokio::test]
    async fn accepts_a_key_that_reads_stacks_and_their_index() {
        let beynt = serve(Remote::default()).await;
        assert_eq!(validate(&beynt.url, "key").await, Ok(()));
        // Never GET /api/v1/artifacts: that route does not exist (404).
        assert_eq!(beynt.requests(), ["/api/v1/stacks", "/api/v1/stacks/1/artifacts?limit=1"]);
    }

    #[tokio::test]
    async fn refuses_a_key_beynt_does_not_accept() {
        let beynt = serve(Remote::default()).await;
        assert_eq!(
            validate(&beynt.url, "wrong").await,
            Err("Invalid key, or without the stacks:read permission.".into())
        );
    }

    #[tokio::test]
    async fn names_the_missing_artifacts_permission() {
        let beynt = serve(Remote { index_status: 403, ..Remote::default() }).await;
        assert_eq!(
            validate(&beynt.url, "key").await,
            Err("Valid key, but without the artifacts:read permission.".into())
        );
    }

    #[tokio::test]
    async fn refuses_plain_http_to_another_computer() {
        assert!(validate("http://beynt.example", "key").await.unwrap_err().contains("HTTPS"));
    }
}
