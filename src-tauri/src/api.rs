//! Beynt's REST API (v1). Every field but the ids is optional here, and a stack's index may lack
//! the types.

use std::fmt;
use std::time::Duration;

use reqwest::{StatusCode, Url, header};
use serde::de::{DeserializeOwned, IgnoredAny};
use serde::{Deserialize, Deserializer};

use crate::i18n::{italian, text};

pub const DEFAULT_URL: &str = "https://beynt.com";
const PAGE_SIZE: u64 = 200;
const ATTEMPTS: u32 = 4;

/// A Beynt address: HTTPS, or HTTP only for a Beynt on this computer; never with credentials.
pub fn is_secure_url(url: &str) -> bool {
    let Ok(url) = Url::parse(url.trim()) else { return false };
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    (url.scheme() == "https" || (url.scheme() == "http" && local))
        && url.username().is_empty()
        && url.password().is_none()
}

pub fn normalize(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

/// The artifact in the web reader, as beynt.com's own *Copy link* writes it.
pub fn artifact_url(base: &str, stack_id: u64, id: u64) -> String {
    format!("{base}/workspace/stack/{stack_id}?openArtifact={id}")
}

/// The account page where a person creates the access key the app asks for.
pub fn access_keys_url(base: &str) -> String {
    format!("{base}/account/api-tokens#advanced-access")
}

/// A local Beynt (ddev) uses mkcert certificates. Only development builds accept them unverified:
/// `*.ddev.site` and `*.localhost` resolve through public DNS.
fn is_local_dev_host(host: &str) -> bool {
    host == "localhost" || host == "127.0.0.1" || host.ends_with(".ddev.site") || host.ends_with(".localhost")
}

#[derive(Debug)]
pub enum Error {
    Network(String),
    Status(u16, String),
    Unexpected(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let it = italian();
        match self {
            Error::Network(cause) if it => write!(f, "Beynt non è raggiungibile: {cause}"),
            Error::Network(cause) => write!(f, "Beynt cannot be reached: {cause}"),
            Error::Status(401, _) => f.write_str(text(
                "The access key is invalid or expired.",
                "La chiave di accesso non è valida o è scaduta.",
            )),
            Error::Status(403, _) => f.write_str(text(
                "The access key lacks a permission (stacks:read, artifacts:read) or this stack.",
                "Alla chiave di accesso manca un permesso (stacks:read, artifacts:read) o questo stack.",
            )),
            Error::Status(429, _) => f.write_str(text(
                "Beynt is receiving too many requests: try again in a minute.",
                "Beynt riceve troppe richieste: riprova fra un minuto.",
            )),
            Error::Status(code, message) if message.is_empty() => {
                write!(f, "{} {code}.", text("Beynt answered", "Beynt risponde"))
            }
            Error::Status(code, message) => write!(f, "{} {code}: {message}", text("Beynt answered", "Beynt risponde")),
            Error::Unexpected(path) if it => write!(f, "Risposta inattesa su {path}: l’indirizzo è un Beynt?"),
            Error::Unexpected(path) => write!(f, "Unexpected answer on {path}: is the address a Beynt?"),
        }
    }
}

/// The deepest cause, such as "dns error" or "connection refused", without the URL.
fn cause(error: &reqwest::Error) -> String {
    let mut current: &dyn std::error::Error = error;
    while let Some(source) = current.source() {
        current = source;
    }
    current.to_string()
}

#[derive(Deserialize)]
pub struct Stack {
    pub id: u64,
    pub name: Option<String>,
}

/// A whole artifact, or an entry of a stack's index (no content).
#[derive(Deserialize, Default)]
pub struct Artifact {
    pub id: u64,
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub title: Option<String>,
    pub path: Option<String>,
    pub version: Option<u64>,
    #[serde(default, deserialize_with = "strings")]
    pub tags: Vec<String>,
    pub verified: Option<bool>,
    pub verification: Option<Verification>,
    pub updated_at: Option<String>,
    pub content: Option<Content>,
}

#[derive(Deserialize)]
pub struct Verification {
    pub status: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct Content {
    pub command: Option<String>,
    pub code: Option<String>,
    pub prompt: Option<String>,
}

/// Tags that are strings; anything else is left out instead of failing the whole page.
fn strings<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<String>, D::Error> {
    let values = Option::<Vec<serde_json::Value>>::deserialize(deserializer)?.unwrap_or_default();
    Ok(values.into_iter().filter_map(|value| value.as_str().map(str::to_string)).collect())
}

/// A search result: the artifact, its stack and the line where the words are.
#[derive(Deserialize)]
pub struct Found {
    #[serde(flatten)]
    pub artifact: Artifact,
    pub stack_id: u64,
    pub stack_name: Option<String>,
    #[serde(default)]
    pub snippet: String,
}

#[derive(Deserialize)]
struct Search {
    #[serde(default)]
    artifacts: Vec<Found>,
    #[serde(rename = "match")]
    matched: Option<String>,
}

#[derive(Deserialize)]
struct Stacks {
    #[serde(default)]
    stacks: Vec<Stack>,
}

#[derive(Deserialize)]
struct Page {
    #[serde(default)]
    artifacts: Vec<Artifact>,
    next_offset: Option<u64>,
}

#[derive(Deserialize)]
struct One {
    artifact: Artifact,
}

#[derive(Deserialize, Default)]
struct Problem {
    error: Option<String>,
    retry_after: Option<u64>,
}

pub struct Client {
    http: reqwest::Client,
    base: String,
    token: String,
}

impl Client {
    pub fn new(base: &str, token: &str) -> Result<Self, Error> {
        let base = normalize(base);
        let host = Url::parse(&base).ok().and_then(|url| url.host_str().map(str::to_string)).unwrap_or_default();
        let http = reqwest::Client::builder()
            .user_agent(concat!("beynt-desktop/", env!("CARGO_PKG_VERSION")))
            // The key goes only to the configured address.
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .danger_accept_invalid_certs(cfg!(debug_assertions) && is_local_dev_host(&host))
            .build()
            .map_err(|error| Error::Network(cause(&error)))?;
        Ok(Self { http, base, token: token.to_string() })
    }

    /// A GET that waits and retries when Beynt answers 429, as the CLI does.
    async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, Error> {
        self.fetch(path, ATTEMPTS).await
    }

    async fn fetch<T: DeserializeOwned>(&self, path: &str, attempts: u32) -> Result<T, Error> {
        let mut attempt = 1;
        loop {
            let response = self
                .http
                .get(format!("{}{path}", self.base))
                .bearer_auth(&self.token)
                .header(header::ACCEPT, "application/json")
                .send()
                .await
                .map_err(|error| Error::Network(cause(&error)))?;
            let status = response.status();
            let retry_after =
                response.headers().get(header::RETRY_AFTER).and_then(|value| value.to_str().ok()?.parse().ok());
            let body = response.text().await.map_err(|error| Error::Network(cause(&error)))?;
            if status.is_success() {
                return serde_json::from_str(&body).map_err(|_| Error::Unexpected(path.to_string()));
            }
            let problem: Problem = serde_json::from_str(&body).unwrap_or_default();
            if status == StatusCode::TOO_MANY_REQUESTS && attempt < attempts {
                let wait = retry_after.or(problem.retry_after).filter(|&seconds| seconds > 0).unwrap_or(2).min(60);
                tokio::time::sleep(Duration::from_secs(wait)).await;
                attempt += 1;
                continue;
            }
            return Err(Error::Status(status.as_u16(), problem.error.unwrap_or_default()));
        }
    }

    pub async fn stacks(&self) -> Result<Vec<Stack>, Error> {
        Ok(self.get::<Stacks>("/api/v1/stacks").await?.stacks)
    }

    /// The whole index of a stack, page after page.
    pub async fn index(&self, stack_id: u64) -> Result<Vec<Artifact>, Error> {
        let mut entries = Vec::new();
        let mut offset = 0;
        loop {
            let page: Page =
                self.get(&format!("/api/v1/stacks/{stack_id}/artifacts?offset={offset}&limit={PAGE_SIZE}")).await?;
            entries.extend(page.artifacts);
            match page.next_offset {
                Some(next) if next > offset => offset = next,
                _ => return Ok(entries),
            }
        }
    }

    /// The first entry of a stack's index: proves artifacts:read (there is no GET /api/v1/artifacts).
    pub async fn probe_index(&self, stack_id: u64) -> Result<(), Error> {
        self.get::<IgnoredAny>(&format!("/api/v1/stacks/{stack_id}/artifacts?limit=1")).await.map(drop)
    }

    pub async fn artifact(&self, id: u64) -> Result<Artifact, Error> {
        Ok(self.get::<One>(&format!("/api/v1/artifacts/{id}")).await?.artifact)
    }

    /// Notes with every word in their title or text, by Beynt's search. One attempt: the palette
    /// does not wait out a 429. Results with only some of the words are left out.
    pub async fn search_notes(&self, query: &str, stack_id: Option<u64>) -> Result<Vec<Found>, Error> {
        let stack = stack_id.map(|id| id.to_string());
        let mut pairs = vec![("q", query), ("type", "note"), ("limit", "20")];
        if let Some(stack) = &stack {
            pairs.push(("stack_id", stack));
        }
        let query = Url::parse_with_params("http://query.invalid/", &pairs)
            .ok()
            .and_then(|url| url.query().map(str::to_string))
            .unwrap_or_default();
        let search: Search = self.fetch(&format!("/api/v1/artifacts/search?{query}"), 1).await?;
        Ok(if search.matched.as_deref() == Some("some_words") { Vec::new() } else { search.artifacts })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secure_urls() {
        for url in [
            "https://beynt.com",
            " https://beynt.ddev.site/ ",
            "http://localhost:8080",
            "http://127.0.0.1:8080",
            "http://[::1]:8080",
        ] {
            assert!(is_secure_url(url), "{url}");
        }
        for url in [
            "http://evil.example/api",
            "http://localhost.evil.example",
            "https://me:secret@beynt.com",
            "file:///C:/x",
            "x",
            "",
        ] {
            assert!(!is_secure_url(url), "{url}");
        }
    }

    #[test]
    fn links_use_the_configured_address() {
        assert_eq!(
            artifact_url(&normalize("https://beynt.com/ "), 6, 97),
            "https://beynt.com/workspace/stack/6?openArtifact=97"
        );
        assert_eq!(
            access_keys_url(&normalize("https://beynt.com/")),
            "https://beynt.com/account/api-tokens#advanced-access"
        );
    }

    #[test]
    fn lax_tls_only_for_local_hosts() {
        assert!(is_local_dev_host("beynt.ddev.site"));
        assert!(is_local_dev_host("app.localhost"));
        assert!(!is_local_dev_host("beynt.com"));
        assert!(!is_local_dev_host("ddev.site.evil.example"));
    }
}
