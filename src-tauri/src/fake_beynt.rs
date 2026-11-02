//! A Beynt on 127.0.0.1 for the tests: only the real v1 routes (anything else is a 404), the key
//! `key`, index pages that follow `next_offset`, and 429s on request.

use std::sync::{Arc, Mutex};

use serde_json::{Value, json};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub struct Remote {
    /// Whole artifacts, each with its `stack_id`.
    pub artifacts: Vec<Value>,
    /// false: the index leaves the types out, as some servers do.
    pub typed: bool,
    pub page: usize,
    pub index_status: u16,
    /// How many requests answer 429 before the server serves again.
    pub throttle: usize,
    /// Artifacts the index still lists but that answer 404: deleted in between.
    pub deleted: Vec<u64>,
}

impl Default for Remote {
    fn default() -> Self {
        Self { artifacts: sample(), typed: true, page: 200, index_status: 200, throttle: 0, deleted: Vec::new() }
    }
}

pub fn sample() -> Vec<Value> {
    vec![
        json!({ "id": 1, "stack_id": 1, "type": "cli", "title": "Riavvia PHP", "version": 2, "tags": ["php", 7], "verified": true,
                "content": { "command": "sudo systemctl restart php8.4-fpm" } }),
        json!({ "id": 2, "stack_id": 1, "type": "note", "title": "Best practice", "path": "guide/best.md", "version": 1,
                "updated_at": "2026-10-27 10:00:00", "content": { "markdown": "# Best practice\nRotate the keys every month." } }),
        json!({ "id": 3, "stack_id": 2, "type": "query", "title": "Ordini bloccati", "version": 1, "verification": { "status": "unverified" },
                "content": { "code": "SELECT * FROM orders WHERE status = {{stato}}" } }),
        json!({ "id": 4, "stack_id": 2, "type": "file", "title": "logo.png", "version": 1 }),
    ]
}

pub struct Fake {
    pub url: String,
    pub remote: Arc<Mutex<Remote>>,
    log: Arc<Mutex<Vec<String>>>,
}

impl Fake {
    /// The paths asked since the last call.
    pub fn requests(&self) -> Vec<String> {
        std::mem::take(&mut self.log.lock().unwrap())
    }
}

pub async fn serve(remote: Remote) -> Fake {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let remote = Arc::new(Mutex::new(remote));
    let log = Arc::new(Mutex::new(Vec::new()));
    let (shared, seen) = (remote.clone(), log.clone());
    tokio::spawn(async move {
        loop {
            let Ok((mut socket, _)) = listener.accept().await else { return };
            let (remote, seen) = (shared.clone(), seen.clone());
            tokio::spawn(async move {
                let mut head = Vec::new();
                let mut buffer = [0; 1024];
                while !head.windows(4).any(|window| window == b"\r\n\r\n") {
                    match socket.read(&mut buffer).await {
                        Ok(0) | Err(_) => return,
                        Ok(read) => head.extend_from_slice(&buffer[..read]),
                    }
                }
                let head = String::from_utf8_lossy(&head);
                let path = head.split_whitespace().nth(1).unwrap_or_default().to_string();
                let authorized = head.lines().any(|line| line.eq_ignore_ascii_case("authorization: bearer key"));
                seen.lock().unwrap().push(path.clone());
                let (status, body) = if authorized {
                    answer(&mut remote.lock().unwrap(), &path)
                } else {
                    (401, json!({ "error": "unauthorized" }))
                };
                let body = body.to_string();
                let retry = if status == 429 { "Retry-After: 1\r\n" } else { "" };
                let reply = format!(
                    "HTTP/1.1 {status} Fake\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n{retry}\r\n{body}",
                    body.len()
                );
                _ = socket.write_all(reply.as_bytes()).await;
            });
        }
    });
    Fake { url, remote, log }
}

fn answer(remote: &mut Remote, path: &str) -> (u16, Value) {
    if remote.throttle > 0 {
        remote.throttle -= 1;
        return (429, json!({ "error": "rate limited" }));
    }
    let (route, query) = path.split_once('?').unwrap_or((path, ""));
    let param = |name: &str| {
        query.split('&').find_map(|pair| pair.strip_prefix(name)?.strip_prefix('=')?.parse::<usize>().ok())
    };
    let segments: Vec<&str> = route.trim_start_matches('/').split('/').collect();
    match segments.as_slice() {
        ["api", "v1", "stacks"] => {
            (200, json!({ "stacks": STACKS.map(|(id, name)| json!({ "id": id, "name": name })) }))
        }
        ["api", "v1", "stacks", _, "artifacts"] if remote.index_status != 200 => {
            (remote.index_status, json!({ "error": "forbidden" }))
        }
        ["api", "v1", "stacks", id, "artifacts"] => {
            let stack: u64 = id.parse().unwrap_or_default();
            let entries: Vec<Value> = remote
                .artifacts
                .iter()
                .filter(|artifact| artifact["stack_id"] == stack)
                .map(|artifact| {
                    let mut entry = artifact.clone();
                    let fields = entry.as_object_mut().unwrap();
                    fields.remove("content");
                    if !remote.typed {
                        fields.remove("type");
                    }
                    entry
                })
                .collect();
            let offset = param("offset").unwrap_or(0);
            let limit = param("limit").unwrap_or(remote.page).min(remote.page);
            let end = (offset + limit).min(entries.len());
            let next = (end < entries.len()).then_some(end);
            (200, json!({ "stack": { "id": stack }, "artifacts": entries[offset.min(end)..end], "next_offset": next }))
        }
        ["api", "v1", "artifacts", "search"] => search(remote, path),
        ["api", "v1", "artifacts", id] => {
            let found = remote.artifacts.iter().find(|artifact| artifact["id"].as_u64() == id.parse().ok());
            match found.filter(|artifact| !remote.deleted.iter().any(|deleted| artifact["id"] == *deleted)) {
                Some(artifact) => (200, json!({ "artifact": artifact })),
                None => (404, json!({ "error": "not found" })),
            }
        }
        _ => (404, json!({ "error": "not found" })),
    }
}

const STACKS: [(u64, &str); 2] = [(1, "My toolbox"), (2, "Clienti")];

/// Beynt's search, simplified: the notes whose title or text has every word (`all_words`), else
/// those with some of them (`some_words`); the text without its headings is the snippet.
fn search(remote: &Remote, path: &str) -> (u16, Value) {
    let url = reqwest::Url::parse(&format!("http://fake{path}")).unwrap();
    let param = |name: &str| url.query_pairs().find(|(key, _)| key == name).map(|(_, value)| value.into_owned());
    let words: Vec<String> =
        param("q").unwrap_or_default().to_lowercase().split_whitespace().map(str::to_string).collect();
    let stack = param("stack_id").and_then(|id| id.parse::<u64>().ok());
    let text = |artifact: &Value| {
        let markdown = artifact["content"]["markdown"].as_str().unwrap_or_default();
        format!("{} {markdown}", artifact["title"].as_str().unwrap_or_default()).to_lowercase()
    };
    let notes: Vec<&Value> = remote
        .artifacts
        .iter()
        .filter(|artifact| artifact["type"] == "note" && stack.is_none_or(|id| artifact["stack_id"] == id))
        .collect();
    let every: Vec<&Value> =
        notes.iter().copied().filter(|artifact| words.iter().all(|word| text(artifact).contains(word))).collect();
    let (matched, found) = if every.is_empty() {
        (
            "some_words",
            notes.into_iter().filter(|artifact| words.iter().any(|word| text(artifact).contains(word))).collect(),
        )
    } else {
        ("all_words", every)
    };
    let artifacts: Vec<Value> = found
        .into_iter()
        .map(|artifact| {
            let stack_name = STACKS.iter().find(|(id, _)| artifact["stack_id"] == *id).map(|(_, name)| *name);
            let markdown = artifact["content"]["markdown"].as_str().unwrap_or_default();
            let snippet: Vec<&str> = markdown.lines().filter(|line| !line.starts_with('#')).collect();
            json!({ "id": artifact["id"], "type": "note", "title": artifact["title"], "stack_id": artifact["stack_id"],
                    "stack_name": stack_name, "path": artifact["path"], "version": artifact["version"],
                    "updated_at": artifact["updated_at"], "snippet": snippet.join(" "), "relevance": 1.0 })
        })
        .collect();
    (200, json!({ "success": true, "match": matched, "total": artifacts.len(), "artifacts": artifacts }))
}
