use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionArchiveManyParams;
use app_server_protocol::AgentSessionArchiveManyResponse;
use app_server_protocol::AgentSessionListParams;
use app_server_protocol::AgentSessionOverview;
use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentSessionUpdateParams;
use app_server_protocol::AgentSessionUpdateResponse;
use app_server_protocol::AgentTurn;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::BusinessObjectRef;
use rusqlite::params;
use rusqlite::Connection;
use rusqlite::OptionalExtension;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

use super::session_list_scope::SessionListScope;
use super::session_title;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectionStore {
    path: PathBuf,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ProjectionReadSession {
    pub session: AgentSession,
    pub turns: Vec<AgentTurn>,
    pub item_count: usize,
    pub last_event_sequence: u64,
}

#[cfg(test)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectionSession {
    pub session_id: String,
    pub thread_id: String,
    pub status: String,
    pub last_event_sequence: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProjectionWatermark {
    pub last_sequence: u64,
}

impl ProjectionStore {
    pub fn initialize(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!("无法创建 Projection DB 目录 {}: {error}", parent.display())
            })?;
        }
        let conn = Connection::open(&path)
            .map_err(|error| format!("无法打开 Projection DB {}: {error}", path.display()))?;
        create_schema(&conn)?;
        Ok(Self { path })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn apply_event(&self, event: &AgentEvent) -> Result<(), String> {
        let mut conn = Connection::open(&self.path)
            .map_err(|error| format!("无法打开 Projection DB {}: {error}", self.path.display()))?;
        let tx = conn
            .transaction()
            .map_err(|error| format!("无法开始 Projection DB 事务: {error}"))?;
        apply_event_in_tx(&tx, event)?;
        tx.commit()
            .map_err(|error| format!("无法提交 Projection DB 事务: {error}"))?;
        Ok(())
    }

    pub fn clear_session(&self, session_id: &str) -> Result<(), String> {
        let mut conn = Connection::open(&self.path)
            .map_err(|error| format!("无法打开 Projection DB {}: {error}", self.path.display()))?;
        let tx = conn
            .transaction()
            .map_err(|error| format!("无法开始 Projection DB 事务: {error}"))?;
        clear_session_in_tx(&tx, session_id)?;
        tx.commit()
            .map_err(|error| format!("无法提交 Projection DB 事务: {error}"))?;
        Ok(())
    }

    pub fn repair_session(&self, session_id: &str, events: &[AgentEvent]) -> Result<usize, String> {
        if let Some(invalid_session_id) = events
            .iter()
            .map(|event| event.session_id.as_str())
            .find(|event_session_id| *event_session_id != session_id)
        {
            return Err(format!(
                "Projection repair session mismatch: expected {session_id}, got {invalid_session_id}"
            ));
        }

        let mut conn = Connection::open(&self.path)
            .map_err(|error| format!("无法打开 Projection DB {}: {error}", self.path.display()))?;
        let tx = conn
            .transaction()
            .map_err(|error| format!("无法开始 Projection DB 事务: {error}"))?;
        clear_session_in_tx(&tx, session_id)?;
        for event in events {
            apply_event_in_tx(&tx, event)?;
        }
        tx.commit()
            .map_err(|error| format!("无法提交 Projection DB 事务: {error}"))?;
        Ok(events.len())
    }

    pub fn read_session_projection(
        &self,
        session_id: &str,
    ) -> Result<Option<ProjectionReadSession>, String> {
        let conn = Connection::open(&self.path)
            .map_err(|error| format!("无法打开 Projection DB {}: {error}", self.path.display()))?;
        let Some(session_row) = query_projected_session(&conn, session_id)? else {
            return Ok(None);
        };
        let turns = query_projected_turns(&conn, session_id)?;
        let item_count = query_projected_item_count(&conn, session_id)?;
        let first_user_message = query_projected_first_user_message(&conn, session_id)?;
        Ok(Some(ProjectionReadSession {
            session: projected_session_to_protocol(&session_row, first_user_message),
            turns: turns.into_iter().map(projected_turn_to_protocol).collect(),
            item_count,
            last_event_sequence: session_row.last_event_sequence,
        }))
    }

    pub fn read_watermark(&self, session_id: &str) -> Result<Option<ProjectionWatermark>, String> {
        let conn = Connection::open(&self.path)
            .map_err(|error| format!("无法打开 Projection DB {}: {error}", self.path.display()))?;
        conn.query_row(
            "SELECT last_sequence FROM projection_watermarks WHERE session_id = ?1",
            params![session_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map(|value| {
            value.map(|last_sequence| ProjectionWatermark {
                last_sequence: last_sequence.max(0) as u64,
            })
        })
        .map_err(|error| format!("无法读取 Projection DB watermark: {error}"))
    }

    #[cfg(test)]
    pub fn read_session(&self, session_id: &str) -> Result<Option<ProjectionSession>, String> {
        let conn = Connection::open(&self.path)
            .map_err(|error| format!("无法打开 Projection DB {}: {error}", self.path.display()))?;
        let mut stmt = conn
            .prepare(
                "SELECT session_id, thread_id, status, last_event_sequence
                 FROM projected_sessions
                 WHERE session_id = ?1",
            )
            .map_err(|error| format!("无法准备 Projection DB 查询: {error}"))?;
        let mut rows = stmt
            .query(params![session_id])
            .map_err(|error| format!("无法查询 Projection DB: {error}"))?;
        let Some(row) = rows
            .next()
            .map_err(|error| format!("无法读取 Projection DB 行: {error}"))?
        else {
            return Ok(None);
        };
        Ok(Some(ProjectionSession {
            session_id: row.get(0).map_err(|error| error.to_string())?,
            thread_id: row.get(1).map_err(|error| error.to_string())?,
            status: row.get(2).map_err(|error| error.to_string())?,
            last_event_sequence: row
                .get::<_, i64>(3)
                .map(|value| value as u64)
                .map_err(|error| error.to_string())?,
        }))
    }

    #[cfg(test)]
    fn read_item_summary_for_test(&self, event_id: &str) -> Result<Option<String>, String> {
        let conn = Connection::open(&self.path)
            .map_err(|error| format!("无法打开 Projection DB {}: {error}", self.path.display()))?;
        conn.query_row(
            "SELECT payload_summary_json FROM projected_items WHERE event_id = ?1",
            params![event_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("无法读取 projected_items 摘要: {error}"))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProjectedSessionRow {
    session_id: String,
    thread_id: String,
    status: String,
    created_at: Option<String>,
    updated_at: String,
    archived_at: Option<String>,
    title: Option<String>,
    model: Option<String>,
    workspace_id: Option<String>,
    working_dir: Option<String>,
    execution_strategy: Option<String>,
    metadata_json: Option<String>,
    last_event_sequence: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProjectedTurnRow {
    turn_id: String,
    session_id: String,
    thread_id: String,
    status: String,
    started_at: Option<String>,
    completed_at: Option<String>,
}

fn create_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        PRAGMA user_version = 1;

        CREATE TABLE IF NOT EXISTS projected_sessions (
            session_id TEXT PRIMARY KEY,
            thread_id TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TEXT,
            updated_at TEXT NOT NULL,
            archived_at TEXT,
            title TEXT,
            model TEXT,
            workspace_id TEXT,
            working_dir TEXT,
            execution_strategy TEXT,
            metadata_json TEXT,
            last_event_sequence INTEGER NOT NULL DEFAULT 0,
            last_event_id TEXT
        );

        CREATE TABLE IF NOT EXISTS projected_turns (
            turn_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT,
            last_event_sequence INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES projected_sessions(session_id)
        );

        CREATE TABLE IF NOT EXISTS projected_items (
            event_id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            thread_id TEXT NOT NULL,
            turn_id TEXT,
            sequence INTEGER NOT NULL,
            item_type TEXT NOT NULL,
            payload_summary_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            FOREIGN KEY(session_id) REFERENCES projected_sessions(session_id)
        );

        CREATE TABLE IF NOT EXISTS projection_watermarks (
            session_id TEXT PRIMARY KEY,
            last_sequence INTEGER NOT NULL,
            last_event_id TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_projected_sessions_updated
            ON projected_sessions(updated_at DESC);

        CREATE INDEX IF NOT EXISTS idx_projected_turns_session_sequence
            ON projected_turns(session_id, last_event_sequence);

        CREATE INDEX IF NOT EXISTS idx_projected_items_session_sequence
            ON projected_items(session_id, sequence);
        "#,
    )
    .map_err(|error| format!("无法初始化 Projection DB schema: {error}"))?;
    add_projected_session_column_if_missing(conn, "archived_at", "TEXT")?;
    add_projected_session_column_if_missing(conn, "title", "TEXT")?;
    add_projected_session_column_if_missing(conn, "model", "TEXT")?;
    add_projected_session_column_if_missing(conn, "workspace_id", "TEXT")?;
    add_projected_session_column_if_missing(conn, "working_dir", "TEXT")?;
    add_projected_session_column_if_missing(conn, "execution_strategy", "TEXT")?;
    add_projected_session_column_if_missing(conn, "metadata_json", "TEXT")?;
    Ok(())
}

fn add_projected_session_column_if_missing(
    conn: &Connection,
    column: &str,
    column_type: &str,
) -> Result<(), String> {
    let mut stmt = conn
        .prepare("PRAGMA table_info(projected_sessions)")
        .map_err(|error| format!("无法检查 projected_sessions schema: {error}"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| format!("无法读取 projected_sessions schema: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法解析 projected_sessions schema: {error}"))?;
    if columns.iter().any(|existing| existing == column) {
        return Ok(());
    }
    conn.execute(
        &format!("ALTER TABLE projected_sessions ADD COLUMN {column} {column_type}"),
        [],
    )
    .map_err(|error| format!("无法迁移 projected_sessions.{column}: {error}"))?;
    Ok(())
}

fn query_projected_session(
    conn: &Connection,
    session_id: &str,
) -> Result<Option<ProjectedSessionRow>, String> {
    conn.query_row(
        "SELECT session_id, thread_id, status, created_at, updated_at,
                archived_at, title, model, workspace_id, working_dir,
                execution_strategy, metadata_json, last_event_sequence
         FROM projected_sessions
         WHERE session_id = ?1",
        params![session_id],
        projected_session_row,
    )
    .optional()
    .map_err(|error| format!("无法读取 projected_sessions: {error}"))
}

fn projected_session_row(row: &rusqlite::Row<'_>) -> Result<ProjectedSessionRow, rusqlite::Error> {
    Ok(ProjectedSessionRow {
        session_id: row.get(0)?,
        thread_id: row.get(1)?,
        status: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        archived_at: row.get(5)?,
        title: row.get(6)?,
        model: row.get(7)?,
        workspace_id: row.get(8)?,
        working_dir: row.get(9)?,
        execution_strategy: row.get(10)?,
        metadata_json: row.get(11)?,
        last_event_sequence: row.get::<_, i64>(12)?.max(0) as u64,
    })
}

fn query_projected_session_overviews(
    conn: &Connection,
    include_archived: bool,
    archived_only: bool,
    scope: &SessionListScope,
    limit: Option<usize>,
) -> Result<Vec<AgentSessionOverview>, String> {
    let limit = limit.unwrap_or(1_000);
    let cwd_filters = scope.cwd_filters();
    let workspace_id_filters = scope.workspace_id_filters();
    let cwd_filter_sql = if cwd_filters.is_empty() {
        String::new()
    } else {
        let placeholders = (0..cwd_filters.len())
            .map(|index| format!("?{}", index + 4))
            .collect::<Vec<_>>()
            .join(", ");
        format!(" AND working_dir IN ({placeholders})")
    };
    let workspace_id_filter_sql = if workspace_id_filters.is_empty() {
        String::new()
    } else {
        let offset = 4 + cwd_filters.len();
        let placeholders = (0..workspace_id_filters.len())
            .map(|index| format!("?{}", offset + index))
            .collect::<Vec<_>>()
            .join(", ");
        format!(" AND workspace_id IN ({placeholders})")
    };
    let sql = format!(
        "SELECT session_id, thread_id, status, created_at, updated_at,
                archived_at, title, model, workspace_id, working_dir,
                execution_strategy, metadata_json, last_event_sequence
         FROM projected_sessions
         WHERE (
                (?1 = 1 AND archived_at IS NOT NULL)
                OR (?1 = 0 AND (?2 = 1 OR archived_at IS NULL))
            )
           {cwd_filter_sql}
           {workspace_id_filter_sql}
         ORDER BY updated_at DESC, session_id DESC
         LIMIT ?3"
    );
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|error| format!("无法准备 projected_sessions list 查询: {error}"))?;
    let limit_i64 = limit as i64;
    let mut query_params: Vec<&dyn rusqlite::ToSql> =
        vec![&archived_only, &include_archived, &limit_i64];
    for cwd in cwd_filters {
        query_params.push(cwd);
    }
    for workspace_id in workspace_id_filters {
        query_params.push(workspace_id);
    }
    let rows = stmt
        .query_map(
            rusqlite::params_from_iter(query_params),
            projected_session_row,
        )
        .map_err(|error| format!("无法查询 projected_sessions list: {error}"))?;
    rows.map(|row| row.map(|row| projected_session_overview(conn, row)))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取 projected_sessions list: {error}"))
}

fn projected_session_overview(conn: &Connection, row: ProjectedSessionRow) -> AgentSessionOverview {
    let first_user_message =
        query_projected_first_user_message(conn, row.session_id.as_str()).unwrap_or_default();
    let messages_count = conn
        .query_row(
            "SELECT COUNT(1)
             FROM projected_items
             WHERE session_id = ?1
               AND item_type IN ('message.created', 'message.delta')",
            params![row.session_id.as_str()],
            |row| row.get::<_, i64>(0),
        )
        .map(|value| value.max(0) as usize)
        .unwrap_or_default();
    AgentSessionOverview {
        session_id: row.session_id.clone(),
        thread_id: Some(row.thread_id),
        title: session_title::resolve_session_title(row.title, first_user_message),
        model: row.model.unwrap_or_default(),
        created_at: row.created_at.unwrap_or_else(|| row.updated_at.clone()),
        updated_at: row.updated_at,
        archived_at: row.archived_at,
        workspace_id: row.workspace_id,
        working_dir: row.working_dir,
        execution_strategy: row.execution_strategy,
        messages_count,
    }
}

impl ProjectionStore {
    pub fn list_session_overviews(
        &self,
        params: &AgentSessionListParams,
    ) -> Result<Vec<AgentSessionOverview>, String> {
        let conn = Connection::open(&self.path)
            .map_err(|error| format!("无法打开 Projection DB {}: {error}", self.path.display()))?;
        let scope = SessionListScope::from_params(params);
        query_projected_session_overviews(
            &conn,
            params.include_archived.unwrap_or(false),
            params.archived_only.unwrap_or(false),
            &scope,
            params.limit.map(|value| value as usize),
        )
    }

    pub fn update_session_overview(
        &self,
        params: AgentSessionUpdateParams,
        updated_at: &str,
    ) -> Result<Option<AgentSessionUpdateResponse>, String> {
        let session_id = params.session_id.trim();
        if session_id.is_empty() {
            return Err("sessionId is required for agentSession/update".to_string());
        }
        let mut conn = Connection::open(&self.path)
            .map_err(|error| format!("无法打开 Projection DB {}: {error}", self.path.display()))?;
        let tx = conn
            .transaction()
            .map_err(|error| format!("无法开始 Projection DB 事务: {error}"))?;
        let Some(existing) = query_projected_session(&tx, session_id)? else {
            return Ok(None);
        };
        let title = normalized_text(params.title.as_deref());
        let model = normalized_text(params.model_name.as_deref());
        let execution_strategy = normalized_text(params.execution_strategy.as_deref());
        let archived_at = params
            .archived
            .map(|archived| archived.then_some(updated_at.to_string()));
        let metadata_json = merge_projected_session_metadata_json(
            existing.metadata_json.as_deref(),
            &params,
            title.as_deref(),
            model.as_deref(),
            execution_strategy.as_deref(),
        )?;
        tx.execute(
            r#"
            UPDATE projected_sessions
            SET
                title = COALESCE(?1, title),
                model = COALESCE(?2, model),
                execution_strategy = COALESCE(?3, execution_strategy),
                archived_at = CASE WHEN ?4 IS NULL THEN archived_at ELSE ?5 END,
                metadata_json = COALESCE(?6, metadata_json),
                updated_at = ?7
            WHERE session_id = ?8
            "#,
            params![
                title,
                model,
                execution_strategy,
                params.archived,
                archived_at.flatten(),
                metadata_json,
                updated_at,
                session_id,
            ],
        )
        .map_err(|error| format!("无法更新 projected_sessions: {error}"))?;
        let session = query_projected_session(&tx, session_id)?
            .map(|row| projected_session_overview(&tx, row));
        tx.commit()
            .map_err(|error| format!("无法提交 Projection DB 事务: {error}"))?;
        Ok(session.map(|session| AgentSessionUpdateResponse { session }))
    }

    pub fn archive_many_sessions(
        &self,
        params: AgentSessionArchiveManyParams,
        archived_at: &str,
    ) -> Result<(AgentSessionArchiveManyResponse, Vec<String>), String> {
        let mut sessions = Vec::new();
        let mut missing_session_ids = Vec::new();
        for session_id in params.session_ids {
            let normalized = session_id.trim();
            if normalized.is_empty() {
                continue;
            }
            match self.update_session_overview(
                AgentSessionUpdateParams {
                    session_id: normalized.to_string(),
                    archived: Some(true),
                    ..AgentSessionUpdateParams::default()
                },
                archived_at,
            )? {
                Some(response) => sessions.push(response.session),
                None => missing_session_ids.push(normalized.to_string()),
            }
        }
        Ok((
            AgentSessionArchiveManyResponse { sessions },
            missing_session_ids,
        ))
    }
}

fn query_projected_turns(
    conn: &Connection,
    session_id: &str,
) -> Result<Vec<ProjectedTurnRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT turn_id, session_id, thread_id, status, started_at, completed_at
             FROM projected_turns
             WHERE session_id = ?1
             ORDER BY last_event_sequence ASC, turn_id ASC",
        )
        .map_err(|error| format!("无法准备 projected_turns 查询: {error}"))?;
    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(ProjectedTurnRow {
                turn_id: row.get(0)?,
                session_id: row.get(1)?,
                thread_id: row.get(2)?,
                status: row.get(3)?,
                started_at: row.get(4)?,
                completed_at: row.get(5)?,
            })
        })
        .map_err(|error| format!("无法查询 projected_turns: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("无法读取 projected_turns: {error}"))
}

fn query_projected_item_count(conn: &Connection, session_id: &str) -> Result<usize, String> {
    conn.query_row(
        "SELECT COUNT(1) FROM projected_items WHERE session_id = ?1",
        params![session_id],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value.max(0) as usize)
    .map_err(|error| format!("无法统计 projected_items: {error}"))
}

fn query_projected_first_user_message(
    conn: &Connection,
    session_id: &str,
) -> Result<Option<String>, String> {
    let payload_summary = conn
        .query_row(
            "SELECT payload_summary_json
             FROM projected_items
             WHERE session_id = ?1 AND item_type = 'message.created'
             ORDER BY sequence ASC, event_id ASC
             LIMIT 1",
            params![session_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("无法读取 projected_items 首条用户消息: {error}"))?;

    Ok(payload_summary
        .and_then(|summary| serde_json::from_str::<Value>(&summary).ok())
        .and_then(|payload| session_title::first_user_message_from_runtime_payload(&payload)))
}

fn projected_session_to_protocol(
    row: &ProjectedSessionRow,
    first_user_message: Option<String>,
) -> AgentSession {
    let title = session_title::resolve_session_title(row.title.clone(), first_user_message);
    let mut metadata = row
        .metadata_json
        .as_deref()
        .and_then(|value| serde_json::from_str::<serde_json::Map<String, Value>>(value).ok())
        .unwrap_or_default();
    metadata.insert(
        "projectionSource".to_string(),
        Value::String("runtime.projection_1".to_string()),
    );
    metadata.insert(
        "lastEventSequence".to_string(),
        Value::Number(serde_json::Number::from(row.last_event_sequence)),
    );
    metadata.insert("title".to_string(), title.clone().into());
    metadata.insert("model".to_string(), row.model.clone().into());
    metadata.insert("workingDir".to_string(), row.working_dir.clone().into());
    metadata.insert(
        "executionStrategy".to_string(),
        row.execution_strategy.clone().into(),
    );
    let metadata = Value::Object(metadata);
    AgentSession {
        session_id: row.session_id.clone(),
        thread_id: row.thread_id.clone(),
        app_id: "agent-runtime".to_string(),
        workspace_id: row.workspace_id.clone(),
        business_object_ref: Some(BusinessObjectRef {
            kind: "agent_session_projection".to_string(),
            id: row.session_id.clone(),
            title,
            uri: None,
            metadata: Some(metadata),
        }),
        status: agent_session_status_from_projection(row.status.as_str()),
        created_at: row
            .created_at
            .clone()
            .unwrap_or_else(|| row.updated_at.clone()),
        updated_at: row.updated_at.clone(),
    }
}

fn projected_turn_to_protocol(row: ProjectedTurnRow) -> AgentTurn {
    AgentTurn {
        turn_id: row.turn_id,
        session_id: row.session_id,
        thread_id: row.thread_id,
        status: agent_turn_status_from_projection(row.status.as_str()),
        started_at: row.started_at,
        completed_at: row.completed_at,
    }
}

fn apply_event_in_tx(conn: &Connection, event: &AgentEvent) -> Result<(), String> {
    upsert_projected_session(conn, event)?;
    upsert_projected_turn(conn, event)?;
    insert_projected_item(conn, event)?;
    upsert_watermark(conn, event)?;
    Ok(())
}

fn clear_session_in_tx(conn: &Connection, session_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM projected_items WHERE session_id = ?1",
        params![session_id],
    )
    .map_err(|error| format!("无法清理 projected_items: {error}"))?;
    conn.execute(
        "DELETE FROM projected_turns WHERE session_id = ?1",
        params![session_id],
    )
    .map_err(|error| format!("无法清理 projected_turns: {error}"))?;
    conn.execute(
        "DELETE FROM projection_watermarks WHERE session_id = ?1",
        params![session_id],
    )
    .map_err(|error| format!("无法清理 projection_watermarks: {error}"))?;
    conn.execute(
        "DELETE FROM projected_sessions WHERE session_id = ?1",
        params![session_id],
    )
    .map_err(|error| format!("无法清理 projected_sessions: {error}"))?;
    Ok(())
}

fn upsert_projected_session(conn: &Connection, event: &AgentEvent) -> Result<(), String> {
    let thread_id = event
        .thread_id
        .as_deref()
        .unwrap_or(event.session_id.as_str())
        .to_string();
    let fields = projected_session_fields_from_event(event);
    conn.execute(
        r#"
        INSERT INTO projected_sessions (
            session_id, thread_id, status, created_at, updated_at,
            archived_at, title, model, workspace_id, working_dir,
            execution_strategy, metadata_json, last_event_sequence, last_event_id
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(session_id) DO UPDATE SET
            thread_id = excluded.thread_id,
            status = excluded.status,
            created_at = COALESCE(projected_sessions.created_at, excluded.created_at),
            updated_at = excluded.updated_at,
            archived_at = COALESCE(excluded.archived_at, projected_sessions.archived_at),
            title = COALESCE(excluded.title, projected_sessions.title),
            model = COALESCE(excluded.model, projected_sessions.model),
            workspace_id = COALESCE(excluded.workspace_id, projected_sessions.workspace_id),
            working_dir = COALESCE(excluded.working_dir, projected_sessions.working_dir),
            execution_strategy = COALESCE(
                excluded.execution_strategy,
                projected_sessions.execution_strategy
            ),
            metadata_json = COALESCE(excluded.metadata_json, projected_sessions.metadata_json),
            last_event_sequence = excluded.last_event_sequence,
            last_event_id = excluded.last_event_id
        "#,
        params![
            event.session_id,
            thread_id,
            session_status_from_event(event.event_type.as_str()),
            fields
                .created_at
                .as_deref()
                .unwrap_or(event.timestamp.as_str()),
            event.timestamp,
            fields.archived_at,
            fields.title,
            fields.model,
            fields.workspace_id,
            fields.working_dir,
            fields.execution_strategy,
            fields.metadata_json,
            event.sequence as i64,
            event.event_id,
        ],
    )
    .map_err(|error| format!("无法写入 projected_sessions: {error}"))?;
    Ok(())
}

#[derive(Debug, Default)]
struct ProjectedSessionFields {
    created_at: Option<String>,
    archived_at: Option<String>,
    title: Option<String>,
    model: Option<String>,
    workspace_id: Option<String>,
    working_dir: Option<String>,
    execution_strategy: Option<String>,
    metadata_json: Option<String>,
}

fn projected_session_fields_from_event(event: &AgentEvent) -> ProjectedSessionFields {
    let session = event.payload.get("session");
    ProjectedSessionFields {
        created_at: value_string(session, &["createdAt", "created_at"]),
        archived_at: value_string(session, &["archivedAt", "archived_at"]),
        title: value_string(session, &["title"]),
        model: value_string(session, &["model", "modelName", "model_name"]),
        workspace_id: value_string(session, &["workspaceId", "workspace_id"]),
        working_dir: value_string(session, &["workingDir", "working_dir"]),
        execution_strategy: value_string(session, &["executionStrategy", "execution_strategy"]),
        metadata_json: session
            .and_then(|session| {
                session
                    .get("metadata")
                    .or_else(|| session.get("metadataJson"))
            })
            .map(normalize_metadata_value)
            .transpose()
            .unwrap_or_default(),
    }
}

fn merge_projected_session_metadata_json(
    existing: Option<&str>,
    params: &AgentSessionUpdateParams,
    title: Option<&str>,
    model: Option<&str>,
    execution_strategy: Option<&str>,
) -> Result<Option<String>, String> {
    let mut metadata = match existing {
        Some(existing) => serde_json::from_str::<Value>(existing)
            .ok()
            .and_then(|value| value.as_object().cloned())
            .unwrap_or_default(),
        None => serde_json::Map::new(),
    };
    let before = metadata.clone();
    insert_metadata_string(&mut metadata, "title", title);
    insert_metadata_string(&mut metadata, "model", model);
    insert_metadata_string(&mut metadata, "modelName", model);
    insert_metadata_string(&mut metadata, "executionStrategy", execution_strategy);
    insert_metadata_string(
        &mut metadata,
        "providerSelector",
        params.provider_selector.as_deref(),
    );
    insert_metadata_string(
        &mut metadata,
        "providerName",
        params.provider_name.as_deref(),
    );
    insert_metadata_string(
        &mut metadata,
        "recentAccessMode",
        params.recent_access_mode.as_deref(),
    );
    if let Some(value) = params.recent_preferences.as_ref() {
        metadata.insert("recentPreferences".to_string(), value.clone());
    }
    if let Some(value) = params.recent_team_selection.as_ref() {
        metadata.insert("recentTeamSelection".to_string(), value.clone());
    }
    if metadata == before {
        return Ok(None);
    }
    serde_json::to_string(&Value::Object(metadata))
        .map(Some)
        .map_err(|error| format!("无法序列化 projected session metadata: {error}"))
}

fn normalize_metadata_value(value: &Value) -> Result<String, String> {
    let metadata = match value {
        Value::String(raw) => {
            serde_json::from_str::<Value>(raw).unwrap_or_else(|_| Value::String(raw.clone()))
        }
        value => value.clone(),
    };
    serde_json::to_string(&metadata)
        .map_err(|error| format!("无法序列化 projected session metadata: {error}"))
}

fn insert_metadata_string(
    metadata: &mut serde_json::Map<String, Value>,
    key: &str,
    value: Option<&str>,
) {
    let Some(value) = normalized_text(value) else {
        return;
    };
    metadata.insert(key.to_string(), Value::String(value));
}

fn normalized_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn value_string(value: Option<&Value>, keys: &[&str]) -> Option<String> {
    let value = value?;
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn upsert_projected_turn(conn: &Connection, event: &AgentEvent) -> Result<(), String> {
    let Some(turn_id) = event.turn_id.as_deref() else {
        return Ok(());
    };
    conn.execute(
        r#"
        INSERT INTO projected_turns (
            turn_id, session_id, thread_id, status, started_at, completed_at,
            last_event_sequence
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(turn_id) DO UPDATE SET
            status = excluded.status,
            completed_at = COALESCE(excluded.completed_at, projected_turns.completed_at),
            last_event_sequence = excluded.last_event_sequence
        "#,
        params![
            turn_id,
            event.session_id,
            event
                .thread_id
                .as_deref()
                .unwrap_or(event.session_id.as_str()),
            turn_status_from_event(event.event_type.as_str()),
            event.timestamp,
            turn_completed_at(event),
            event.sequence as i64,
        ],
    )
    .map_err(|error| format!("无法写入 projected_turns: {error}"))?;
    Ok(())
}

fn insert_projected_item(conn: &Connection, event: &AgentEvent) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT OR IGNORE INTO projected_items (
            event_id, session_id, thread_id, turn_id, sequence,
            item_type, payload_summary_json, created_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        "#,
        params![
            event.event_id,
            event.session_id,
            event
                .thread_id
                .as_deref()
                .unwrap_or(event.session_id.as_str()),
            event.turn_id,
            event.sequence as i64,
            event.event_type,
            bounded_payload_summary(&event.payload),
            event.timestamp,
        ],
    )
    .map_err(|error| format!("无法写入 projected_items: {error}"))?;
    Ok(())
}

fn upsert_watermark(conn: &Connection, event: &AgentEvent) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT INTO projection_watermarks (
            session_id, last_sequence, last_event_id, updated_at
        )
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(session_id) DO UPDATE SET
            last_sequence = excluded.last_sequence,
            last_event_id = excluded.last_event_id,
            updated_at = excluded.updated_at
        "#,
        params![
            event.session_id,
            event.sequence as i64,
            event.event_id,
            event.timestamp,
        ],
    )
    .map_err(|error| format!("无法写入 projection_watermarks: {error}"))?;
    Ok(())
}

fn session_status_from_event(event_type: &str) -> &'static str {
    match event_type {
        "turn.completed" => "completed",
        "turn.failed" => "failed",
        "turn.canceled" => "canceled",
        "turn.accepted" | "turn.started" | "message.created" | "message.delta" => "running",
        _ => "active",
    }
}

fn agent_session_status_from_projection(status: &str) -> AgentSessionStatus {
    match status {
        "running" | "active" => AgentSessionStatus::Running,
        "failed" => AgentSessionStatus::Failed,
        "canceled" => AgentSessionStatus::Canceled,
        "completed" => AgentSessionStatus::Completed,
        _ => AgentSessionStatus::Idle,
    }
}

fn turn_status_from_event(event_type: &str) -> &'static str {
    match event_type {
        "turn.completed" => "completed",
        "turn.failed" => "failed",
        "turn.canceled" => "canceled",
        "turn.accepted" => "accepted",
        "turn.started" | "message.created" | "message.delta" => "running",
        _ => "active",
    }
}

fn agent_turn_status_from_projection(status: &str) -> AgentTurnStatus {
    match status {
        "accepted" => AgentTurnStatus::Accepted,
        "running" | "active" => AgentTurnStatus::Running,
        "waitingAction" | "waiting_action" => AgentTurnStatus::WaitingAction,
        "completed" => AgentTurnStatus::Completed,
        "failed" => AgentTurnStatus::Failed,
        "canceled" | "aborted" => AgentTurnStatus::Canceled,
        _ => AgentTurnStatus::Running,
    }
}

fn turn_completed_at(event: &AgentEvent) -> Option<&str> {
    matches!(
        event.event_type.as_str(),
        "turn.completed" | "turn.failed" | "turn.canceled"
    )
    .then_some(event.timestamp.as_str())
}

const PAYLOAD_TEXT_SUMMARY_MAX_BYTES: usize = 512;

fn bounded_payload_summary(payload: &serde_json::Value) -> String {
    let mut value = payload.clone();
    let truncated_text = value
        .get("text")
        .and_then(serde_json::Value::as_str)
        .and_then(|text| truncate_text_summary(text, PAYLOAD_TEXT_SUMMARY_MAX_BYTES));
    if let Some(truncated_text) = truncated_text {
        value["text"] = serde_json::Value::String(truncated_text);
    }
    serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_string())
}

fn truncate_text_summary(text: &str, max_bytes: usize) -> Option<String> {
    if text.len() <= max_bytes {
        return None;
    }

    let mut end = max_bytes.min(text.len());
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    Some(format!("{}...", &text[..end]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::AgentEvent;
    use serde_json::json;

    fn event(
        sequence: u64,
        event_type: &str,
        session_id: &str,
        thread_id: &str,
        turn_id: Option<&str>,
    ) -> AgentEvent {
        AgentEvent {
            event_id: format!("evt-{sequence}"),
            sequence,
            session_id: session_id.to_string(),
            thread_id: Some(thread_id.to_string()),
            turn_id: turn_id.map(str::to_string),
            event_type: event_type.to_string(),
            timestamp: "2026-06-14T00:00:00.000Z".to_string(),
            payload: json!({ "text": format!("hello-{sequence}") }),
        }
    }

    #[test]
    fn apply_event_updates_session_turn_item_and_watermark() {
        let temp = tempfile::tempdir().expect("tempdir");
        let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
            .expect("projection store");
        let event = event(1, "turn.accepted", "sess_1", "thread_1", Some("turn_1"));

        projection.apply_event(&event).expect("apply event");

        let session = projection
            .read_session("sess_1")
            .expect("read projection")
            .expect("session");
        assert_eq!(session.session_id, "sess_1");
        assert_eq!(session.thread_id, "thread_1");
        assert_eq!(session.status, "running");
        assert_eq!(session.last_event_sequence, 1);
    }

    #[test]
    fn clear_session_removes_projected_rows() {
        let temp = tempfile::tempdir().expect("tempdir");
        let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
            .expect("projection store");
        let event = event(1, "turn.accepted", "sess_1", "thread_1", Some("turn_1"));

        projection.apply_event(&event).expect("apply event");
        assert!(projection
            .read_session("sess_1")
            .expect("read session")
            .is_some());

        projection.clear_session("sess_1").expect("clear session");
        assert!(projection
            .read_session("sess_1")
            .expect("read session")
            .is_none());
    }

    #[test]
    fn repair_session_replays_events_after_clear() {
        let temp = tempfile::tempdir().expect("tempdir");
        let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
            .expect("projection store");
        let accepted = event(1, "turn.accepted", "sess_1", "thread_1", Some("turn_1"));
        let completed = event(2, "turn.completed", "sess_1", "thread_1", Some("turn_1"));

        projection.apply_event(&accepted).expect("apply accepted");
        projection.clear_session("sess_1").expect("clear session");
        projection
            .repair_session("sess_1", &[accepted, completed])
            .expect("repair session");

        let session = projection
            .read_session("sess_1")
            .expect("read session")
            .expect("session");
        assert_eq!(session.status, "completed");
        assert_eq!(session.last_event_sequence, 2);
    }

    #[test]
    fn repair_session_with_empty_event_log_clears_stale_projection() {
        let temp = tempfile::tempdir().expect("tempdir");
        let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
            .expect("projection store");
        let event = event(1, "turn.accepted", "sess_1", "thread_1", Some("turn_1"));

        projection.apply_event(&event).expect("apply event");
        let count = projection
            .repair_session("sess_1", &[])
            .expect("repair empty session");

        assert_eq!(count, 0);
        assert!(projection
            .read_session("sess_1")
            .expect("read session")
            .is_none());
    }

    #[test]
    fn bounded_payload_summary_truncates_multibyte_text_on_char_boundary() {
        let text = format!("{}服务流程", "a".repeat(PAYLOAD_TEXT_SUMMARY_MAX_BYTES - 1));
        let summary = bounded_payload_summary(&json!({ "text": text }));
        let value: serde_json::Value =
            serde_json::from_str(&summary).expect("summary should stay valid JSON");
        let truncated = value["text"].as_str().expect("truncated text");

        assert!(truncated.ends_with("..."));
        assert!(truncated.len() <= PAYLOAD_TEXT_SUMMARY_MAX_BYTES + 3);
        assert!(!truncated.contains("服"));
    }

    #[test]
    fn apply_event_stores_multibyte_long_text_summary_without_panic() {
        let temp = tempfile::tempdir().expect("tempdir");
        let projection = ProjectionStore::initialize(temp.path().join("projection_1.sqlite"))
            .expect("projection store");
        let mut event = event(1, "message.delta", "sess_1", "thread_1", Some("turn_1"));
        event.payload = json!({
            "text": format!("{}服务流程", "a".repeat(PAYLOAD_TEXT_SUMMARY_MAX_BYTES - 1)),
        });

        projection.apply_event(&event).expect("apply event");

        let summary = projection
            .read_item_summary_for_test("evt-1")
            .expect("read item summary")
            .expect("item summary");
        let value: serde_json::Value =
            serde_json::from_str(&summary).expect("summary should stay valid JSON");
        assert!(value["text"].as_str().expect("text").ends_with("..."));
    }
}
