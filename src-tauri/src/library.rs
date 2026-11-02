//! The local copy of the person's commands, queries, configs and prompts (with their text) and
//! notes (title and place only: they open on the web). Shown at once and offline, refreshed
//! from Beynt; only new or changed versions are downloaded. A note's text is searched on Beynt,
//! never kept here.

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use futures_util::{StreamExt, TryStreamExt, stream};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::account::Accounts;
use crate::api::{self, Artifact, Client};
use crate::i18n::text;

const IN_FLIGHT: usize = 4;
/// While the app runs, so the palette opens on a recent copy.
const REFRESH_EVERY: Duration = Duration::from_secs(10 * 60);

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Cli,
    Query,
    Config,
    Prompt,
    Note,
}

impl Kind {
    fn parse(kind: &str) -> Option<Self> {
        Some(match kind {
            "cli" => Self::Cli,
            "query" => Self::Query,
            "config" => Self::Config,
            "prompt" => Self::Prompt,
            "note" => Self::Note,
            _ => return None,
        })
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: u64,
    pub stack_id: u64,
    pub stack_name: String,
    #[serde(rename = "type")]
    pub kind: Kind,
    pub title: String,
    pub path: Option<String>,
    /// The text to copy, with its {{placeholders}}; notes have none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    pub version: u64,
    pub tags: Vec<String>,
    pub verified: bool,
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub items: Vec<Item>,
    pub synced_at: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Cache {
    #[serde(flatten)]
    library: Library,
    /// Artifacts of other types fetched because the index had no type (id → version).
    #[serde(default)]
    skipped: HashMap<u64, u64>,
}

#[derive(Clone)]
struct Stack {
    id: u64,
    name: String,
}

fn item(artifact: Artifact, kind: Kind, stack: &Stack) -> Item {
    let text = artifact.content.unwrap_or_default();
    let text = match kind {
        Kind::Cli => Some(text.command),
        Kind::Query | Kind::Config => Some(text.code),
        Kind::Prompt => Some(text.prompt),
        Kind::Note => None,
    };
    Item {
        id: artifact.id,
        stack_id: stack.id,
        stack_name: stack.name.clone(),
        kind,
        title: artifact.title.filter(|title| !title.is_empty()).unwrap_or_else(|| format!("#{}", artifact.id)),
        path: artifact.path.filter(|path| !path.is_empty()),
        text: text.map(Option::unwrap_or_default),
        version: artifact.version.unwrap_or_default(),
        tags: artifact.tags,
        verified: artifact.verified == Some(true)
            || artifact.verification.and_then(|v| v.status).is_some_and(|status| status == "verified"),
        updated_at: artifact.updated_at,
    }
}

/// Rebuilds the library from every stack the key reaches. Notes come from the index; commands
/// are downloaded only when new or at a new version. An index without types costs one download
/// per artifact, remembered by version.
pub async fn sync(client: &Client, previous: &Cache, now: u64) -> Result<Cache, api::Error> {
    let known: HashMap<u64, &Item> = previous.library.items.iter().map(|item| (item.id, item)).collect();
    let mut items = Vec::new();
    let mut skipped = HashMap::new();
    let mut to_fetch = Vec::new();

    let stacks = client.stacks().await?;
    for stack in stacks {
        let stack = Stack { id: stack.id, name: stack.name.unwrap_or_else(|| format!("Stack {}", stack.id)) };
        for entry in client.index(stack.id).await? {
            let kind = entry.kind.as_deref().map(Kind::parse);
            if kind == Some(None) {
                continue; // a type the library does not show
            }
            if kind == Some(Some(Kind::Note)) {
                items.push(item(entry, Kind::Note, &stack));
                continue;
            }
            let cached = known.get(&entry.id).filter(|cached| {
                entry.version == Some(cached.version) && kind.flatten().is_none_or(|kind| kind == cached.kind)
            });
            if let Some(cached) = cached {
                items.push(Item {
                    stack_id: stack.id,
                    stack_name: stack.name.clone(),
                    title: entry.title.filter(|title| !title.is_empty()).unwrap_or_else(|| cached.title.clone()),
                    path: entry.path.or_else(|| cached.path.clone()),
                    ..(*cached).clone()
                });
            } else if kind.is_none()
                && entry.version.is_some()
                && previous.skipped.get(&entry.id) == entry.version.as_ref()
            {
                skipped.insert(entry.id, entry.version.unwrap_or_default());
            } else {
                to_fetch.push((entry.id, stack.clone()));
            }
        }
    }

    let fetched: Vec<Option<(Artifact, Stack)>> = stream::iter(to_fetch)
        .map(|(id, stack)| async move {
            match client.artifact(id).await {
                Ok(artifact) => Ok(Some((artifact, stack))),
                // Deleted after its index was read: the next index leaves it out too.
                Err(api::Error::Status(404, _)) => Ok(None),
                Err(error) => Err(error),
            }
        })
        .buffer_unordered(IN_FLIGHT)
        .try_collect()
        .await?;
    for (artifact, stack) in fetched.into_iter().flatten() {
        match artifact.kind.as_deref().and_then(Kind::parse) {
            Some(kind) => items.push(item(artifact, kind, &stack)),
            None => {
                skipped.insert(artifact.id, artifact.version.unwrap_or_default());
            }
        }
    }

    items.sort_by(|a, b| a.stack_name.cmp(&b.stack_name).then_with(|| a.title.cmp(&b.title)));
    Ok(Cache { library: Library { items, synced_at: Some(now) }, skipped })
}

pub fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_millis() as u64)
}

pub struct Libraries {
    cache: Mutex<Cache>,
    file: PathBuf,
    /// One refresh at a time; a caller that waited reuses a refresh that ended meanwhile.
    refreshing: tokio::sync::Mutex<()>,
}

impl Libraries {
    pub fn load(file: PathBuf) -> Self {
        let cache = fs::read(&file).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default();
        Self { cache: Mutex::new(cache), file, refreshing: tokio::sync::Mutex::new(()) }
    }

    pub fn library(&self) -> Library {
        self.cache.lock().unwrap().library.clone()
    }

    /// Saves and announces a copy unless `applies` says otherwise, all under the lock: a sync and the
    /// emptying for another account land, and reach the windows, in the order they happened.
    fn store(&self, app: &AppHandle, cache: Cache, applies: impl FnOnce() -> bool) -> bool {
        let mut current = self.cache.lock().unwrap();
        if !applies() {
            return false;
        }
        // A cache: if it cannot be written, the next start syncs again.
        _ = fs::write(&self.file, serde_json::to_vec(&cache).unwrap_or_default());
        _ = app.emit("library-changed", &cache.library);
        *current = cache;
        true
    }

    /// A different account must not keep showing the previous account's library.
    pub fn clear(&self, app: &AppHandle) {
        self.store(app, Cache::default(), || true);
    }

    pub async fn refresh(&self, app: &AppHandle) -> Result<Library, String> {
        let accounts = app.state::<Accounts>();
        let asked = now();
        let token = accounts.current().map(|account| account.token);
        let _turn = self.refreshing.lock().await;
        let current = accounts.current();
        let library = self.library();
        if current.as_ref().map(|account| &account.token) == token.as_ref() && library.synced_at >= Some(asked) {
            return Ok(library);
        }
        let Some(account) = current else {
            return Err(text("Beynt is not connected.", "Beynt non è connesso.").into());
        };
        let client = Client::new(&account.base_url, &account.token).map_err(|error| error.to_string())?;
        let previous = self.cache.lock().unwrap().clone();
        let synced = sync(&client, &previous, now()).await.map_err(|error| error.to_string())?;
        let library = synced.library.clone();
        // The key changed while syncing: this copy belongs to the old one.
        if !self.store(app, synced, || accounts.current().is_some_and(|now| now.token == account.token)) {
            return Err(text(
                "The account changed during the update.",
                "L’account è cambiato durante l’aggiornamento.",
            )
            .into());
        }
        Ok(library)
    }
}

/// Refreshes at start and then every few minutes. Not connected, or offline: the saved copy stays.
pub fn keep_fresh(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            _ = app.state::<Libraries>().refresh(&app).await;
            tokio::time::sleep(REFRESH_EVERY).await;
        }
    });
}

/// A note Beynt found by its text: the item, and the line where the words are.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    #[serde(flatten)]
    item: Item,
    snippet: String,
}

pub async fn search(client: &Client, query: &str, stack_id: Option<u64>) -> Result<Vec<Hit>, api::Error> {
    let found = client.search_notes(query, stack_id).await?;
    Ok(found
        .into_iter()
        .map(|found| {
            let stack = Stack {
                id: found.stack_id,
                name: found.stack_name.unwrap_or_else(|| format!("Stack {}", found.stack_id)),
            };
            Hit { item: item(found.artifact, Kind::Note, &stack), snippet: found.snippet }
        })
        .collect())
}

/// What the page gets back: the saved copy stays usable when Beynt cannot be reached.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Refresh {
    library: Library,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Beynt's search for the words typed; nothing for fewer than 2 characters or without an account.
#[tauri::command]
pub async fn library_search(app: AppHandle, query: String, stack_id: Option<u64>) -> Result<Vec<Hit>, String> {
    let query: String = query.trim().chars().take(200).collect();
    let account = app.state::<Accounts>().current();
    let Some(account) = account.filter(|_| query.chars().count() >= 2) else {
        return Ok(Vec::new());
    };
    let client = Client::new(&account.base_url, &account.token).map_err(|error| error.to_string())?;
    search(&client, &query, stack_id).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub fn library_get(libraries: State<Libraries>) -> Library {
    libraries.library()
}

#[tauri::command]
pub async fn library_refresh(app: AppHandle, libraries: State<'_, Libraries>) -> Result<Refresh, ()> {
    Ok(match libraries.refresh(&app).await {
        Ok(library) => Refresh { library, error: None },
        Err(error) => Refresh { library: libraries.library(), error: Some(error) },
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::fake_beynt::{Remote, serve};

    fn summary(cache: &Cache) -> Vec<(u64, &str, Kind, Option<&str>)> {
        cache
            .library
            .items
            .iter()
            .map(|item| (item.id, item.stack_name.as_str(), item.kind, item.text.as_deref()))
            .collect()
    }

    #[tokio::test]
    async fn downloads_commands_and_lists_notes_from_the_index() {
        let beynt = serve(Remote::default()).await;
        let client = Client::new(&beynt.url, "key").unwrap();
        let cache = sync(&client, &Cache::default(), 1000).await.unwrap();
        let mut fetched: Vec<String> =
            beynt.requests().into_iter().filter(|path| path.starts_with("/api/v1/artifacts/")).collect();
        fetched.sort();
        assert_eq!(fetched, ["/api/v1/artifacts/1", "/api/v1/artifacts/3"]);
        assert_eq!(cache.library.synced_at, Some(1000));
        assert_eq!(
            summary(&cache),
            [
                (3, "Clienti", Kind::Query, Some("SELECT * FROM orders WHERE status = {{stato}}")),
                (2, "My toolbox", Kind::Note, None),
                (1, "My toolbox", Kind::Cli, Some("sudo systemctl restart php8.4-fpm")),
            ]
        );
        let items = &cache.library.items;
        assert_eq!((items[0].verified, items[2].verified, &items[2].tags), (false, true, &vec!["php".to_string()]));
        assert_eq!(
            (items[1].path.as_deref(), items[1].updated_at.as_deref()),
            (Some("guide/best.md"), Some("2026-10-27 10:00:00"))
        );
    }

    #[tokio::test]
    async fn downloads_only_new_versions_and_drops_what_is_gone() {
        let beynt = serve(Remote::default()).await;
        let client = Client::new(&beynt.url, "key").unwrap();
        let first = sync(&client, &Cache::default(), 1).await.unwrap();
        {
            let mut remote = beynt.remote.lock().unwrap();
            remote.artifacts[0]["version"] = json!(3);
            remote.artifacts[0]["content"] = json!({ "command": "sudo systemctl reload php8.4-fpm" });
            remote.artifacts.retain(|artifact| artifact["id"] != 3);
        }
        beynt.requests();
        let second = sync(&client, &first, 2).await.unwrap();
        assert_eq!(beynt.requests().iter().filter(|path| path.starts_with("/api/v1/artifacts/")).count(), 1);
        assert_eq!(
            summary(&second),
            [
                (2, "My toolbox", Kind::Note, None),
                (1, "My toolbox", Kind::Cli, Some("sudo systemctl reload php8.4-fpm"))
            ]
        );
    }

    #[tokio::test]
    async fn leaves_out_what_was_deleted_after_its_index_was_read() {
        let beynt = serve(Remote { deleted: vec![3], ..Remote::default() }).await;
        let client = Client::new(&beynt.url, "key").unwrap();
        let cache = sync(&client, &Cache::default(), 1).await.unwrap();
        let ids: Vec<u64> = cache.library.items.iter().map(|item| item.id).collect();
        assert_eq!(ids, [2, 1]);
        assert!(cache.skipped.is_empty());
    }

    #[tokio::test]
    async fn an_index_without_types_costs_one_download_per_version() {
        let beynt = serve(Remote { typed: false, page: 1, ..Remote::default() }).await;
        let client = Client::new(&beynt.url, "key").unwrap();
        let first = sync(&client, &Cache::default(), 1).await.unwrap();
        assert_eq!(summary(&first).len(), 3);
        assert_eq!(first.skipped, HashMap::from([(4, 1)]));
        assert_eq!(beynt.requests().iter().filter(|path| path.starts_with("/api/v1/artifacts/")).count(), 4);
        let second = sync(&client, &first, 2).await.unwrap();
        assert_eq!(beynt.requests().iter().filter(|path| path.starts_with("/api/v1/artifacts/")).count(), 0);
        assert_eq!(second.library.items, first.library.items);
    }

    #[tokio::test]
    async fn waits_when_beynt_asks_to_slow_down() {
        let beynt = serve(Remote { throttle: 1, ..Remote::default() }).await;
        let client = Client::new(&beynt.url, "key").unwrap();
        assert_eq!(client.stacks().await.unwrap().len(), 2);
        assert_eq!(beynt.requests(), ["/api/v1/stacks", "/api/v1/stacks"]);
    }

    #[tokio::test]
    async fn finds_notes_by_their_text_on_beynt() {
        let beynt = serve(Remote::default()).await;
        let client = Client::new(&beynt.url, "key").unwrap();
        let hits = search(&client, "rotate keys", None).await.unwrap();
        let found: Vec<_> =
            hits.iter().map(|hit| (hit.item.id, hit.item.stack_name.as_str(), hit.snippet.as_str())).collect();
        assert_eq!(found, [(2, "My toolbox", "Rotate the keys every month.")]);
        assert_eq!((hits[0].item.kind, hits[0].item.path.as_deref()), (Kind::Note, Some("guide/best.md")));
        assert_eq!(beynt.requests(), ["/api/v1/artifacts/search?q=rotate+keys&type=note&limit=20"]);
        assert!(search(&client, "rotate", Some(2)).await.unwrap().is_empty());
        // Only some of the words: not what was asked.
        assert!(search(&client, "rotate nginx", None).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_search_does_not_wait_when_beynt_asks_to_slow_down() {
        let beynt = serve(Remote { throttle: 1, ..Remote::default() }).await;
        let client = Client::new(&beynt.url, "key").unwrap();
        assert!(search(&client, "rotate", None).await.is_err());
        assert_eq!(beynt.requests().len(), 1);
    }

    #[test]
    fn the_cache_keeps_the_skipped_versions() {
        let cache = Cache { library: Library::default(), skipped: HashMap::from([(4, 2)]) };
        let read: Cache = serde_json::from_slice(&serde_json::to_vec(&cache).unwrap()).unwrap();
        assert_eq!(read.skipped, cache.skipped);
    }
}
