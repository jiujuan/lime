use app_server_protocol::AgentEvent;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::io::BufRead;
use std::io::BufReader;
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq)]
pub struct EventLogRecord {
    pub path: PathBuf,
    pub event: AgentEvent,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventLogWriter {
    root: PathBuf,
}

pub const WORKFLOW_AUDIT_ACTIVE_COMPACT_AFTER_RECORDS: usize = 1024;
pub const WORKFLOW_AUDIT_ACTIVE_RETAIN_RECENT_RECORDS: usize = 512;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkflowAuditCompactionReport {
    pub session_id: String,
    pub before_count: usize,
    pub archived_count: usize,
    pub retained_count: usize,
    pub archive_path: Option<PathBuf>,
    pub active_path: PathBuf,
}

impl EventLogWriter {
    pub fn new(root: impl AsRef<Path>) -> Result<Self, String> {
        let root = root.as_ref().to_path_buf();
        fs::create_dir_all(&root).map_err(|error| {
            format!(
                "无法创建 App Server event log 目录 {}: {error}",
                root.display()
            )
        })?;
        Ok(Self { root })
    }

    pub fn append(&self, event: &AgentEvent) -> Result<PathBuf, String> {
        self.append_events(std::slice::from_ref(event))?
            .into_iter()
            .next()
            .ok_or_else(|| format!("无法写入 event log: event {} 未产生路径", event.event_id))
    }

    pub fn append_events(&self, events: &[AgentEvent]) -> Result<Vec<PathBuf>, String> {
        if events.is_empty() {
            return Ok(Vec::new());
        }
        let mut events_by_path: BTreeMap<PathBuf, Vec<&AgentEvent>> = BTreeMap::new();
        for event in events {
            events_by_path
                .entry(self.session_path(&event.session_id))
                .or_default()
                .push(event);
        }

        let mut paths = Vec::with_capacity(events_by_path.len());
        for (path, events) in events_by_path {
            append_events_to_path(&path, &events)?;
            paths.push(path);
        }
        Ok(paths)
    }

    pub fn read_session_events(&self, session_id: &str) -> Result<Vec<EventLogRecord>, String> {
        let path = self.session_path(session_id);
        read_events_from_path(&path)
    }

    pub fn append_workflow_audit_events(
        &self,
        session_id: &str,
        events: &[AgentEvent],
    ) -> Result<PathBuf, String> {
        let path = self.workflow_audit_path(session_id);
        let redacted_events = events
            .iter()
            .map(redact_workflow_audit_event)
            .collect::<Vec<_>>();
        let events = redacted_events.iter().collect::<Vec<_>>();
        append_events_to_path(&path, &events)?;
        if let Err(error) = self.compact_session_workflow_audit_events_if_needed(session_id) {
            tracing::warn!(
                "[event-log] failed to compact workflow audit events for session {}: {}",
                session_id,
                error
            );
        }
        Ok(path)
    }

    pub fn read_session_workflow_audit_events(
        &self,
        session_id: &str,
    ) -> Result<Vec<EventLogRecord>, String> {
        let mut records = Vec::new();
        for path in self.workflow_audit_archive_paths(session_id)? {
            records.extend(read_events_from_path(&path)?);
        }
        let path = self.workflow_audit_path(session_id);
        records.extend(read_events_from_path(&path)?);
        Ok(records)
    }

    pub fn compact_session_workflow_audit_events(
        &self,
        session_id: &str,
        retain_recent: usize,
    ) -> Result<WorkflowAuditCompactionReport, String> {
        if retain_recent == 0 {
            return Err(
                "workflow audit compaction retain_recent must be greater than 0".to_string(),
            );
        }
        let active_path = self.workflow_audit_path(session_id);
        let current_records = read_events_from_path(&active_path)?;
        let before_count = current_records.len();
        if before_count <= retain_recent {
            return Ok(WorkflowAuditCompactionReport {
                session_id: session_id.to_string(),
                before_count,
                archived_count: 0,
                retained_count: before_count,
                archive_path: None,
                active_path,
            });
        }

        let archive_count = before_count - retain_recent;
        let archived_records = &current_records[..archive_count];
        let retained_records = &current_records[archive_count..];
        let archive_path = self.workflow_audit_archive_path(session_id, archived_records);
        write_events_to_path(
            &archive_path,
            &archived_records
                .iter()
                .map(|record| &record.event)
                .collect::<Vec<_>>(),
        )?;
        write_events_to_path(
            &active_path,
            &retained_records
                .iter()
                .map(|record| &record.event)
                .collect::<Vec<_>>(),
        )?;
        Ok(WorkflowAuditCompactionReport {
            session_id: session_id.to_string(),
            before_count,
            archived_count: archived_records.len(),
            retained_count: retained_records.len(),
            archive_path: Some(archive_path),
            active_path,
        })
    }

    pub fn compact_session_workflow_audit_events_if_needed(
        &self,
        session_id: &str,
    ) -> Result<Option<WorkflowAuditCompactionReport>, String> {
        let active_path = self.workflow_audit_path(session_id);
        let active_count = read_events_from_path(&active_path)?.len();
        if active_count <= WORKFLOW_AUDIT_ACTIVE_COMPACT_AFTER_RECORDS {
            return Ok(None);
        }
        self.compact_session_workflow_audit_events(
            session_id,
            WORKFLOW_AUDIT_ACTIVE_RETAIN_RECENT_RECORDS,
        )
        .map(Some)
    }

    pub fn workflow_audit_path(&self, session_id: &str) -> PathBuf {
        self.workflow_audit_dir(session_id)
            .join("workflow-events.jsonl")
    }

    fn workflow_audit_dir(&self, session_id: &str) -> PathBuf {
        self.root
            .join("sessions")
            .join(format!("session_{}", safe_file_stem(session_id)))
    }

    fn workflow_audit_archive_paths(&self, session_id: &str) -> Result<Vec<PathBuf>, String> {
        let dir = self.workflow_audit_dir(session_id);
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut paths = Vec::new();
        let entries = fs::read_dir(&dir)
            .map_err(|error| format!("无法读取 workflow audit 目录 {}: {error}", dir.display()))?;
        for entry in entries {
            let entry = entry.map_err(|error| {
                format!("无法读取 workflow audit 目录项 {}: {error}", dir.display())
            })?;
            let path = entry.path();
            let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if file_name.starts_with("workflow-events.archive.") && file_name.ends_with(".jsonl") {
                paths.push(path);
            }
        }
        paths.sort();
        Ok(paths)
    }

    fn workflow_audit_archive_path(&self, session_id: &str, records: &[EventLogRecord]) -> PathBuf {
        let first_sequence = records
            .first()
            .map(|record| record.event.sequence)
            .unwrap_or(0);
        let last_sequence = records
            .last()
            .map(|record| record.event.sequence)
            .unwrap_or(first_sequence);
        self.workflow_audit_dir(session_id).join(format!(
            "workflow-events.archive.{first_sequence:020}-{last_sequence:020}.jsonl"
        ))
    }

    fn session_path(&self, session_id: &str) -> PathBuf {
        self.root
            .join("sessions")
            .join(format!("session_{}.jsonl", safe_file_stem(session_id)))
    }
}

fn read_events_from_path(path: &Path) -> Result<Vec<EventLogRecord>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut records = Vec::new();
    let file = fs::File::open(&path)
        .map_err(|error| format!("无法读取 event log {}: {error}", path.display()))?;
    for line in BufReader::new(file).lines() {
        let line =
            line.map_err(|error| format!("无法读取 event log {}: {error}", path.display()))?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let event = serde_json::from_str::<AgentEvent>(trimmed)
            .map_err(|error| format!("无法解析 event log {}: {error}", path.display()))?;
        records.push(EventLogRecord {
            path: path.to_path_buf(),
            event,
        });
    }
    Ok(records)
}

fn append_events_to_path(path: &Path, events: &[&AgentEvent]) -> Result<(), String> {
    if events.is_empty() {
        return Ok(());
    }
    let mut file = open_event_log_for_append(path)?;
    write_events(&mut file, path, events)
}

fn write_events_to_path(path: &Path, events: &[&AgentEvent]) -> Result<(), String> {
    let temp_path = path.with_extension("jsonl.tmp");
    if let Some(parent) = temp_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "无法创建 event log 临时父目录 {}: {error}",
                parent.display()
            )
        })?;
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&temp_path)
        .map_err(|error| {
            format!(
                "无法打开 event log 临时文件 {}: {error}",
                temp_path.display()
            )
        })?;
    write_events(&mut file, &temp_path, events)?;
    file.flush().map_err(|error| {
        format!(
            "无法刷新 event log 临时文件 {}: {error}",
            temp_path.display()
        )
    })?;
    fs::rename(&temp_path, path).map_err(|error| {
        format!(
            "无法替换 event log {} <- {}: {error}",
            path.display(),
            temp_path.display()
        )
    })
}

fn open_event_log_for_append(path: &Path) -> Result<fs::File, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建 event log 父目录 {}: {error}", parent.display()))?;
    }
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("无法打开 event log {}: {error}", path.display()))
}

fn write_events(file: &mut fs::File, path: &Path, events: &[&AgentEvent]) -> Result<(), String> {
    for event in events {
        let json = serde_json::to_vec(event)
            .map_err(|error| format!("无法序列化 event {}: {error}", event.event_id))?;
        file.write_all(&json)
            .and_then(|_| file.write_all(b"\n"))
            .map_err(|error| format!("无法写入 event log {}: {error}", path.display()))?;
    }
    Ok(())
}

impl EventLogWriter {
    pub fn clear_session(&self, session_id: &str) -> Result<(), String> {
        let session_event_path = self.session_path(session_id);
        let workflow_audit_path = self.workflow_audit_path(session_id);
        let workflow_audit_archive_paths = self.workflow_audit_archive_paths(session_id)?;
        remove_event_log_path(&session_event_path)?;
        remove_event_log_path(&workflow_audit_path)?;
        for archive_path in workflow_audit_archive_paths {
            remove_event_log_path(&archive_path)?;
        }
        Ok(())
    }
}

fn remove_event_log_path(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("无法删除 event log {}: {error}", path.display())),
    }
}

fn redact_workflow_audit_event(event: &AgentEvent) -> AgentEvent {
    let mut event = event.clone();
    redact_workflow_audit_value(&mut event.payload, None);
    ensure_workflow_audit_redaction_policy(&mut event.payload);
    event
}

fn redact_workflow_audit_value(value: &mut Value, key: Option<&str>) {
    if key.is_some_and(workflow_audit_sensitive_key) {
        *value = workflow_audit_redacted_value();
        return;
    }

    match value {
        Value::Object(object) => {
            for (child_key, child_value) in object.iter_mut() {
                redact_workflow_audit_value(child_value, Some(child_key.as_str()));
            }
        }
        Value::Array(items) => {
            for item in items {
                redact_workflow_audit_value(item, None);
            }
        }
        Value::String(text) => {
            if workflow_audit_string_looks_sensitive(text) {
                *text = "[redacted:workflow_audit_metadata_only]".to_string();
            } else {
                truncate_workflow_audit_string(text);
            }
        }
        _ => {}
    }
}

fn ensure_workflow_audit_redaction_policy(payload: &mut Value) {
    let policy = json!({
        "policy": "workflow_audit_metadata_only",
        "mode": "metadata_only",
        "promptText": false,
        "providerPayload": false,
        "rawContent": false,
    });
    if let Some(object) = payload.as_object_mut() {
        object.insert("redaction".to_string(), policy);
    }
}

fn workflow_audit_sensitive_key(key: &str) -> bool {
    let normalized = key
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect::<String>();
    matches!(
        normalized.as_str(),
        "apikey"
            | "authorization"
            | "body"
            | "content"
            | "contents"
            | "credential"
            | "credentials"
            | "documenttext"
            | "finalmarkdown"
            | "headers"
            | "input"
            | "inputsummary"
            | "markdown"
            | "message"
            | "messages"
            | "password"
            | "prompt"
            | "providerconfig"
            | "providerpayload"
            | "query"
            | "request"
            | "response"
            | "result"
            | "searchquery"
            | "secret"
            | "summary"
            | "text"
            | "token"
            | "url"
    )
}

fn workflow_audit_redacted_value() -> Value {
    json!({
        "redacted": true,
        "policy": "workflow_audit_metadata_only",
    })
}

fn workflow_audit_string_looks_sensitive(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains("bearer ")
        || lower.contains("api_key")
        || lower.contains("apikey")
        || lower.contains("authorization:")
        || lower.contains("password=")
        || lower.contains("secret=")
        || lower.contains("token=")
}

fn truncate_workflow_audit_string(value: &mut String) {
    const MAX_WORKFLOW_AUDIT_STRING_CHARS: usize = 512;
    if value.chars().count() <= MAX_WORKFLOW_AUDIT_STRING_CHARS {
        return;
    }
    let truncated = value
        .chars()
        .take(MAX_WORKFLOW_AUDIT_STRING_CHARS)
        .collect::<String>();
    *value = format!("{truncated}...[truncated:workflow_audit_metadata_only]");
}

fn safe_file_stem(value: &str) -> String {
    let stem = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    let stem = stem.trim_matches('_');
    if stem.is_empty() {
        "unknown".to_string()
    } else {
        stem.to_string()
    }
}

#[cfg(test)]
mod tests;
