use super::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::{
    ConversationImportSourceClient, ConversationImportSourceScanParams,
    ConversationImportSourceScanResponse, ConversationImportSourceStatus,
    ConversationImportSourceSummary, ConversationImportThreadStatus, ImportedThreadSummary,
};
use chrono::{DateTime, SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension};
use serde::Deserialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

const DEFAULT_LIMIT: usize = 50;
const MAX_LIMIT: usize = 200;

impl RuntimeCore {
    pub async fn scan_conversation_import_source(
        &self,
        params: ConversationImportSourceScanParams,
    ) -> Result<ConversationImportSourceScanResponse, RuntimeCoreError> {
        scan_conversation_import_source(params)
    }
}

fn scan_conversation_import_source(
    params: ConversationImportSourceScanParams,
) -> Result<ConversationImportSourceScanResponse, RuntimeCoreError> {
    match params
        .source_client
        .unwrap_or(ConversationImportSourceClient::Codex)
    {
        ConversationImportSourceClient::Codex => scan_codex_source(params),
        ConversationImportSourceClient::ClaudeCode => Ok(unsupported_source(
            ConversationImportSourceClient::ClaudeCode,
            params.source_root,
            "Claude Code conversation import is not implemented in this milestone.",
        )),
    }
}

fn scan_codex_source(
    params: ConversationImportSourceScanParams,
) -> Result<ConversationImportSourceScanResponse, RuntimeCoreError> {
    let source_root = resolve_codex_home(params.source_root.as_deref()).ok_or_else(|| {
        RuntimeCoreError::Backend("unable to resolve Codex home directory".to_string())
    })?;
    let limit = params.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let cursor = parse_cursor(params.cursor.as_deref())?;
    let include_archived = params.include_archived.unwrap_or(false);
    let project_path = normalize_filter(params.project_path.as_deref());
    let query = normalize_filter(params.query.as_deref()).map(|value| value.to_lowercase());

    if !source_root.is_dir() {
        return Ok(ConversationImportSourceScanResponse {
            source: source_summary(
                ConversationImportSourceClient::Codex,
                ConversationImportSourceStatus::Missing,
                Some(&source_root),
                false,
                0,
                None,
                Some("Codex home directory does not exist".to_string()),
            ),
            threads: Vec::new(),
            next_cursor: None,
        });
    }

    let state_path = newest_state_db(&source_root);
    let mut threads = match state_path.as_deref() {
        Some(path) => scan_codex_state_db(path).unwrap_or_else(|_| Vec::new()),
        None => Vec::new(),
    };

    if threads.is_empty() {
        threads = scan_session_index(&source_root);
    }

    let filtered = threads
        .into_iter()
        .filter(|thread| include_archived || !thread.archived)
        .filter(|thread| match project_path.as_deref() {
            Some(project_path) => thread.cwd.as_deref() == Some(project_path),
            None => true,
        })
        .filter(|thread| match query.as_deref() {
            Some(query) => {
                thread
                    .title
                    .as_deref()
                    .unwrap_or_default()
                    .to_lowercase()
                    .contains(query)
                    || thread
                        .source_thread_id
                        .to_lowercase()
                        .contains(query)
                    || thread
                        .cwd
                        .as_deref()
                        .unwrap_or_default()
                        .to_lowercase()
                        .contains(query)
            }
            None => true,
        })
        .collect::<Vec<_>>();

    let total = filtered.len();
    let page = filtered
        .into_iter()
        .skip(cursor)
        .take(limit)
        .collect::<Vec<_>>();
    let next_cursor = (cursor + page.len() < total).then(|| (cursor + page.len()).to_string());

    Ok(ConversationImportSourceScanResponse {
        source: source_summary(
            ConversationImportSourceClient::Codex,
            ConversationImportSourceStatus::Ready,
            Some(&source_root),
            true,
            total,
            state_path.as_deref(),
            None,
        ),
        threads: page,
        next_cursor,
    })
}

fn unsupported_source(
    source_client: ConversationImportSourceClient,
    source_root: Option<String>,
    message: &str,
) -> ConversationImportSourceScanResponse {
    ConversationImportSourceScanResponse {
        source: ConversationImportSourceSummary {
            source_client,
            status: ConversationImportSourceStatus::Unsupported,
            source_root,
            readable: false,
            thread_count: 0,
            indexed_at: Some(now_timestamp()),
            state_path: None,
            message: Some(message.to_string()),
        },
        threads: Vec::new(),
        next_cursor: None,
    }
}

fn source_summary(
    source_client: ConversationImportSourceClient,
    status: ConversationImportSourceStatus,
    source_root: Option<&Path>,
    readable: bool,
    thread_count: usize,
    state_path: Option<&Path>,
    message: Option<String>,
) -> ConversationImportSourceSummary {
    ConversationImportSourceSummary {
        source_client,
        status,
        source_root: source_root.map(path_to_string),
        readable,
        thread_count,
        indexed_at: Some(now_timestamp()),
        state_path: state_path.map(path_to_string),
        message,
    }
}

fn resolve_codex_home(explicit_root: Option<&str>) -> Option<PathBuf> {
    if let Some(root) = normalize_filter(explicit_root) {
        return Some(PathBuf::from(root));
    }
    if let Some(root) = std::env::var_os("CODEX_HOME") {
        return Some(PathBuf::from(root));
    }
    dirs::home_dir().map(|home| home.join(".codex"))
}

fn newest_state_db(source_root: &Path) -> Option<PathBuf> {
    let mut candidates = fs::read_dir(source_root)
        .ok()?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let file_name = path.file_name()?.to_string_lossy();
            (file_name.starts_with("state_") && file_name.ends_with(".sqlite")).then_some(path)
        })
        .collect::<Vec<_>>();
    candidates.sort_by_key(|path| {
        fs::metadata(path)
            .and_then(|metadata| metadata.modified())
            .ok()
    });
    candidates.pop()
}

fn scan_codex_state_db(path: &Path) -> rusqlite::Result<Vec<ImportedThreadSummary>> {
    let conn = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let has_threads = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'threads' LIMIT 1",
            [],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if !has_threads {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        r#"
SELECT id, title, created_at, updated_at, source, model_provider, cwd, archived, rollout_path
FROM threads
ORDER BY updated_at DESC
        "#,
    )?;
    let rows = stmt.query_map([], |row| {
        let source_path: Option<String> = row.get(8)?;
        Ok(ImportedThreadSummary {
            source_client: ConversationImportSourceClient::Codex,
            source_thread_id: row.get(0)?,
            title: row.get(1)?,
            created_at: timestamp_from_sqlite(row.get(2)?),
            updated_at: timestamp_from_sqlite(row.get(3)?),
            source: row.get(4)?,
            model_provider: row.get(5)?,
            cwd: row.get(6)?,
            archived: sqlite_bool(row.get(7)?),
            source_path,
            import_status: ConversationImportThreadStatus::NotImported,
        })
    })?;

    Ok(rows.filter_map(Result::ok).collect())
}

#[derive(Debug, Deserialize)]
struct SessionIndexLine {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    thread_name: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    path: Option<String>,
}

fn scan_session_index(source_root: &Path) -> Vec<ImportedThreadSummary> {
    let path = source_root.join("session_index.jsonl");
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(_) => return Vec::new(),
    };
    BufReader::new(file)
        .lines()
        .map_while(Result::ok)
        .filter_map(|line| serde_json::from_str::<SessionIndexLine>(&line).ok())
        .filter_map(|line| {
            let id = normalize_filter(line.id.as_deref())?;
            Some(ImportedThreadSummary {
                source_client: ConversationImportSourceClient::Codex,
                source_thread_id: id,
                title: normalize_filter(line.title.as_deref())
                    .or_else(|| normalize_filter(line.thread_name.as_deref())),
                created_at: line.created_at,
                updated_at: line.updated_at,
                cwd: normalize_filter(line.cwd.as_deref()),
                source: Some("session_index".to_string()),
                model_provider: None,
                archived: false,
                source_path: normalize_filter(line.path.as_deref()),
                import_status: ConversationImportThreadStatus::NotImported,
            })
        })
        .collect()
}

fn parse_cursor(cursor: Option<&str>) -> Result<usize, RuntimeCoreError> {
    match normalize_filter(cursor) {
        Some(cursor) => cursor.parse::<usize>().map_err(|_| {
            RuntimeCoreError::Backend("conversation import cursor must be a number".to_string())
        }),
        None => Ok(0),
    }
}

fn normalize_filter(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn sqlite_bool(value: i64) -> bool {
    value != 0
}

fn timestamp_from_sqlite(value: Option<i64>) -> Option<String> {
    let value = value?;
    if value <= 0 {
        return None;
    }
    let seconds = if value > 10_000_000_000 {
        value / 1000
    } else {
        value
    };
    DateTime::<Utc>::from_timestamp(seconds, 0)
        .map(|timestamp| timestamp.to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn now_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn scans_codex_state_db_with_filters_and_cursor() {
        let temp = tempfile::tempdir().expect("tempdir");
        let db_path = temp.path().join("state_test.sqlite");
        let conn = Connection::open(&db_path).expect("db");
        conn.execute_batch(
            r#"
CREATE TABLE threads (
    id TEXT PRIMARY KEY,
    rollout_path TEXT,
    created_at INTEGER,
    updated_at INTEGER,
    source TEXT,
    model_provider TEXT,
    cwd TEXT,
    title TEXT,
    sandbox_policy TEXT,
    approval_mode TEXT,
    archived INTEGER,
    archived_at INTEGER
);
            "#,
        )
        .expect("schema");
        insert_thread(
            &conn,
            "thread-a",
            "Alpha work",
            "/workspace/a",
            "/rollouts/a.jsonl",
            1,
            2,
            false,
        );
        insert_thread(
            &conn,
            "thread-b",
            "Beta archived",
            "/workspace/a",
            "/rollouts/b.jsonl",
            1,
            3,
            true,
        );
        insert_thread(
            &conn,
            "thread-c",
            "Alpha later",
            "/workspace/a",
            "/rollouts/c.jsonl",
            1,
            4,
            false,
        );

        let response = scan_codex_source(ConversationImportSourceScanParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            project_path: Some("/workspace/a".to_string()),
            query: Some("alpha".to_string()),
            limit: Some(1),
            ..Default::default()
        })
        .expect("scan");

        assert_eq!(response.source.status, ConversationImportSourceStatus::Ready);
        assert_eq!(response.source.thread_count, 2);
        assert_eq!(response.threads.len(), 1);
        assert_eq!(response.threads[0].source_thread_id, "thread-c");
        assert_eq!(response.next_cursor.as_deref(), Some("1"));

        let second_page = scan_codex_source(ConversationImportSourceScanParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            project_path: Some("/workspace/a".to_string()),
            query: Some("alpha".to_string()),
            limit: Some(1),
            cursor: response.next_cursor,
            ..Default::default()
        })
        .expect("scan page 2");
        assert_eq!(second_page.threads[0].source_thread_id, "thread-a");
        assert!(second_page.next_cursor.is_none());
    }

    fn insert_thread(
        conn: &Connection,
        id: &str,
        title: &str,
        cwd: &str,
        rollout_path: &str,
        created_at: i64,
        updated_at: i64,
        archived: bool,
    ) {
        conn.execute(
            r#"
INSERT INTO threads (
    id, rollout_path, created_at, updated_at, source, model_provider, cwd, title,
    sandbox_policy, approval_mode, archived, archived_at
) VALUES (?1, ?2, ?3, ?4, 'cli', 'openai', ?5, ?6, 'workspace-write', 'on-request', ?7, NULL)
            "#,
            params![
                id,
                rollout_path,
                created_at,
                updated_at,
                cwd,
                title,
                if archived { 1_i64 } else { 0_i64 }
            ],
        )
        .expect("insert thread");
    }
}
