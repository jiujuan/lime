use app_server_protocol::{
    ConversationImportSourceClient, ConversationImportThreadStatus, ImportedThreadSummary,
};
use chrono::{DateTime, SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

const STATE_DB_FILENAME: &str = "state_5.sqlite";

pub(super) fn newest_state_db(source_root: &Path) -> Option<PathBuf> {
    let canonical = source_root.join(STATE_DB_FILENAME);
    if canonical.is_file() {
        return Some(canonical);
    }
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

pub(super) fn scan_state_db(path: &Path) -> rusqlite::Result<Vec<ImportedThreadSummary>> {
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

    let columns = table_columns(&conn, "threads")?;
    let created_at_expr = coalesced_column_expr(&columns, &["created_at_ms", "created_at"]);
    let updated_at_expr = coalesced_column_expr(&columns, &["updated_at_ms", "updated_at"]);
    let source_expr = optional_column_expr(&columns, "source");
    let mut stmt = conn.prepare(&format!(
        r#"
SELECT id, title, {created_at_expr}, {updated_at_expr}, {source_expr}, model_provider, cwd, archived, rollout_path,
       {model}, {reasoning_effort}, {git_sha}, {git_branch}, {git_origin_url}, {cli_version},
       {first_user_message}, {preview}, {agent_nickname}, {agent_role}, {memory_mode}, {agent_path}, {thread_source},
       {approval_policy}, {approvals_reviewer}, {sandbox_policy}, {service_tier}, {collaboration_mode}, {personality}
FROM threads
ORDER BY {updated_at_expr} DESC
        "#,
        model = optional_column_expr(&columns, "model"),
        reasoning_effort = optional_column_expr(&columns, "reasoning_effort"),
        git_sha = optional_column_expr(&columns, "git_sha"),
        git_branch = optional_column_expr(&columns, "git_branch"),
        git_origin_url = optional_column_expr(&columns, "git_origin_url"),
        cli_version = optional_column_expr(&columns, "cli_version"),
        first_user_message = optional_column_expr(&columns, "first_user_message"),
        preview = optional_column_expr(&columns, "preview"),
        agent_nickname = optional_column_expr(&columns, "agent_nickname"),
        agent_role = optional_column_expr(&columns, "agent_role"),
        memory_mode = optional_column_expr(&columns, "memory_mode"),
        agent_path = optional_column_expr(&columns, "agent_path"),
        thread_source = optional_column_expr(&columns, "thread_source"),
        approval_policy = coalesced_column_expr(&columns, &["approval_policy", "approval_mode"]),
        approvals_reviewer = optional_column_expr(&columns, "approvals_reviewer"),
        sandbox_policy = optional_column_expr(&columns, "sandbox_policy"),
        service_tier = optional_column_expr(&columns, "service_tier"),
        collaboration_mode = optional_column_expr(&columns, "collaboration_mode"),
        personality = optional_column_expr(&columns, "personality"),
    ))?;
    let rows = stmt.query_map([], |row| {
        let source_path: Option<String> = row.get(8)?;
        let metadata = codex_thread_metadata_from_state_row(CodexStateThreadMetadata {
            model: row.get(9)?,
            reasoning_effort: row.get(10)?,
            git_sha: row.get(11)?,
            git_branch: row.get(12)?,
            git_origin_url: row.get(13)?,
            cli_version: row.get(14)?,
            first_user_message: row.get(15)?,
            preview: row.get(16)?,
            agent_nickname: row.get(17)?,
            agent_role: row.get(18)?,
            memory_mode: row.get(19)?,
            agent_path: row.get(20)?,
            thread_source: row.get(21)?,
            approval_policy: row.get(22)?,
            approvals_reviewer: row.get(23)?,
            sandbox_policy: row.get(24)?,
            service_tier: row.get(25)?,
            collaboration_mode: row.get(26)?,
            personality: row.get(27)?,
        });
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
            import_job_id: None,
            import_status: ConversationImportThreadStatus::NotImported,
            metadata,
        })
    })?;

    Ok(rows.filter_map(Result::ok).collect())
}

pub(super) fn codex_thread_metadata_from_session_meta(
    meta: &Value,
) -> serde_json::Map<String, Value> {
    let mut object = serde_json::Map::new();
    insert_optional_str(
        &mut object,
        "model",
        meta.get("model").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "reasoningEffort",
        meta.get("reasoning_effort").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "gitSha",
        meta.get("git_sha").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "gitBranch",
        meta.get("git_branch").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "gitOriginUrl",
        meta.get("git_origin_url").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "cliVersion",
        meta.get("cli_version").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "agentNickname",
        meta.get("agent_nickname").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "agentRole",
        meta.get("agent_role").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "memoryMode",
        meta.get("memory_mode").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "agentPath",
        meta.get("agent_path").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "approvalPolicy",
        meta.get("approval_policy").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "approvalsReviewer",
        meta.get("approvals_reviewer").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "sandboxPolicy",
        meta.get("sandbox_policy").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "serviceTier",
        meta.get("service_tier").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "collaborationMode",
        meta.get("collaboration_mode").and_then(Value::as_str),
    );
    insert_optional_str(
        &mut object,
        "personality",
        meta.get("personality").and_then(Value::as_str),
    );
    object
}

pub(super) fn merge_thread_metadata(
    thread: &mut ImportedThreadSummary,
    metadata: serde_json::Map<String, Value>,
) {
    let mut current = thread
        .metadata
        .take()
        .and_then(|metadata| metadata.as_object().cloned())
        .unwrap_or_default();
    for (key, value) in metadata {
        current.entry(key).or_insert(value);
    }
    if !current.is_empty() {
        thread.metadata = Some(Value::Object(current));
    }
}

fn table_columns(conn: &Connection, table: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    Ok(rows.filter_map(Result::ok).collect())
}

fn has_column(columns: &[String], column: &str) -> bool {
    columns.iter().any(|value| value == column)
}

fn optional_column_expr(columns: &[String], column: &str) -> String {
    if has_column(columns, column) {
        column.to_string()
    } else {
        "NULL".to_string()
    }
}

fn coalesced_column_expr(columns: &[String], candidates: &[&'static str]) -> String {
    let present = candidates
        .iter()
        .copied()
        .filter(|column| has_column(columns, column))
        .collect::<Vec<_>>();
    match present.as_slice() {
        [] => "NULL".to_string(),
        [column] => (*column).to_string(),
        columns => format!("COALESCE({})", columns.join(", ")),
    }
}

fn sqlite_bool(value: i64) -> bool {
    value != 0
}

fn timestamp_from_sqlite(value: Option<i64>) -> Option<String> {
    let value = value?;
    if value <= 0 {
        return None;
    }
    let timestamp = if value > 10_000_000_000 {
        DateTime::<Utc>::from_timestamp_millis(value)
    } else {
        DateTime::<Utc>::from_timestamp(value, 0)
    };
    timestamp.map(|timestamp| timestamp.to_rfc3339_opts(SecondsFormat::Millis, true))
}

#[derive(Default)]
struct CodexStateThreadMetadata {
    model: Option<String>,
    reasoning_effort: Option<String>,
    git_sha: Option<String>,
    git_branch: Option<String>,
    git_origin_url: Option<String>,
    cli_version: Option<String>,
    first_user_message: Option<String>,
    preview: Option<String>,
    agent_nickname: Option<String>,
    agent_role: Option<String>,
    memory_mode: Option<String>,
    agent_path: Option<String>,
    thread_source: Option<String>,
    approval_policy: Option<String>,
    approvals_reviewer: Option<String>,
    sandbox_policy: Option<String>,
    service_tier: Option<String>,
    collaboration_mode: Option<String>,
    personality: Option<String>,
}

fn codex_thread_metadata_from_state_row(metadata: CodexStateThreadMetadata) -> Option<Value> {
    let mut object = serde_json::Map::new();
    insert_optional_string(&mut object, "model", metadata.model);
    insert_optional_string(&mut object, "reasoningEffort", metadata.reasoning_effort);
    insert_optional_string(&mut object, "gitSha", metadata.git_sha);
    insert_optional_string(&mut object, "gitBranch", metadata.git_branch);
    insert_optional_string(&mut object, "gitOriginUrl", metadata.git_origin_url);
    insert_optional_string(&mut object, "cliVersion", metadata.cli_version);
    insert_optional_string(&mut object, "firstUserMessage", metadata.first_user_message);
    insert_optional_string(&mut object, "preview", metadata.preview);
    insert_optional_string(&mut object, "agentNickname", metadata.agent_nickname);
    insert_optional_string(&mut object, "agentRole", metadata.agent_role);
    insert_optional_string(&mut object, "memoryMode", metadata.memory_mode);
    insert_optional_string(&mut object, "agentPath", metadata.agent_path);
    insert_optional_string(&mut object, "threadSource", metadata.thread_source);
    insert_optional_string(&mut object, "approvalPolicy", metadata.approval_policy);
    insert_optional_string(
        &mut object,
        "approvalsReviewer",
        metadata.approvals_reviewer,
    );
    insert_optional_string(&mut object, "sandboxPolicy", metadata.sandbox_policy);
    insert_optional_string(&mut object, "serviceTier", metadata.service_tier);
    insert_optional_string(
        &mut object,
        "collaborationMode",
        metadata.collaboration_mode,
    );
    insert_optional_string(&mut object, "personality", metadata.personality);
    (!object.is_empty()).then(|| Value::Object(object))
}

fn insert_optional_string(
    object: &mut serde_json::Map<String, Value>,
    key: &str,
    value: Option<String>,
) {
    if let Some(value) = super::normalize_filter(value.as_deref()) {
        object.insert(key.to_string(), json!(value));
    }
}

fn insert_optional_str(
    object: &mut serde_json::Map<String, Value>,
    key: &str,
    value: Option<&str>,
) {
    if let Some(value) = super::normalize_filter(value) {
        object.insert(key.to_string(), json!(value));
    }
}
