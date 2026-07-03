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
        Ok(path)
    }

    pub fn read_session_workflow_audit_events(
        &self,
        session_id: &str,
    ) -> Result<Vec<EventLogRecord>, String> {
        let path = self.workflow_audit_path(session_id);
        read_events_from_path(&path)
    }

    pub fn workflow_audit_path(&self, session_id: &str) -> PathBuf {
        self.root
            .join("sessions")
            .join(format!("session_{}", safe_file_stem(session_id)))
            .join("workflow-events.jsonl")
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
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建 event log 父目录 {}: {error}", parent.display()))?;
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format!("无法打开 event log {}: {error}", path.display()))?;
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
        remove_event_log_path(&session_event_path)?;
        remove_event_log_path(&workflow_audit_path)
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
mod tests {
    use super::*;
    use app_server_protocol::AgentEvent;
    use serde_json::json;

    fn event(sequence: u64) -> AgentEvent {
        AgentEvent {
            event_id: format!("evt-{sequence}"),
            sequence,
            session_id: "session-a".to_string(),
            thread_id: Some("thread-a".to_string()),
            turn_id: Some("turn-a".to_string()),
            event_type: "message.delta".to_string(),
            timestamp: "2026-06-14T00:00:00.000Z".to_string(),
            payload: json!({ "text": format!("hello-{sequence}") }),
        }
    }

    #[test]
    fn append_and_read_session_events() {
        let temp = tempfile::tempdir().expect("tempdir");
        let writer = EventLogWriter::new(temp.path()).expect("writer");
        let first = event(1);
        let second = event(2);

        let first_path = writer.append(&first).expect("first append");
        let second_path = writer.append(&second).expect("second append");

        assert!(first_path.ends_with("sessions/session_session-a.jsonl"));
        assert_eq!(first_path, second_path);

        let records = writer.read_session_events("session-a").expect("records");
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].event.sequence, 1);
        assert_eq!(records[1].event.sequence, 2);
    }

    #[test]
    fn append_events_groups_by_session_and_writes_all_events() {
        let temp = tempfile::tempdir().expect("tempdir");
        let writer = EventLogWriter::new(temp.path()).expect("writer");
        let first = event(1);
        let mut second = event(2);
        second.session_id = "session-b".to_string();
        second.event_id = "evt-2".to_string();

        let paths = writer
            .append_events(&[first.clone(), second.clone()])
            .expect("append events");

        assert_eq!(paths.len(), 2);
        let first_records = writer.read_session_events("session-a").expect("session a");
        let second_records = writer.read_session_events("session-b").expect("session b");
        assert_eq!(first_records.len(), 1);
        assert_eq!(second_records.len(), 1);
        assert_eq!(first_records[0].event.sequence, first.sequence);
        assert_eq!(second_records[0].event.sequence, second.sequence);
    }

    #[test]
    fn append_and_read_workflow_audit_events() {
        let temp = tempfile::tempdir().expect("tempdir");
        let writer = EventLogWriter::new(temp.path()).expect("writer");
        let mut first = event(1);
        first.event_type = "workflow.run.started".to_string();
        let mut second = event(2);
        second.event_type = "workflow.step.completed".to_string();

        let path = writer
            .append_workflow_audit_events("session-a", &[first.clone(), second.clone()])
            .expect("append workflow audit events");

        assert!(path.ends_with("sessions/session_session-a/workflow-events.jsonl"));
        assert_eq!(
            writer
                .read_session_events("session-a")
                .expect("regular events")
                .len(),
            0
        );
        let records = writer
            .read_session_workflow_audit_events("session-a")
            .expect("workflow audit events");
        assert_eq!(records.len(), 2);
        assert_eq!(records[0].event.event_type, "workflow.run.started");
        assert_eq!(records[1].event.event_type, "workflow.step.completed");
    }

    #[test]
    fn workflow_audit_events_are_metadata_only_redacted() {
        let temp = tempfile::tempdir().expect("tempdir");
        let writer = EventLogWriter::new(temp.path()).expect("writer");
        let mut audit = event(1);
        audit.event_type = "workflow.connector.completed".to_string();
        audit.payload = json!({
            "workflowRunId": "task-1:workflow",
            "workflowKey": "content_article_workflow",
            "stepId": "research",
            "connectorRef": "web-research",
            "toolName": "WebSearch",
            "status": "completed",
            "prompt": "写一篇包含敏感素材的文章",
            "query": "secret launch plan",
            "result": {
                "summary": "raw search result",
                "url": "https://example.test/private"
            },
            "providerConfig": {
                "apiKey": "sk-live-secret"
            },
            "metadata": {
                "pluginWorkflow": {
                    "eventSource": "worker_progress",
                    "safeLabel": "research"
                },
                "note": "Bearer should-redact"
            }
        });

        writer
            .append_workflow_audit_events("session-a", &[audit])
            .expect("append workflow audit");

        let records = writer
            .read_session_workflow_audit_events("session-a")
            .expect("workflow audit events");
        assert_eq!(records.len(), 1);
        let payload = &records[0].event.payload;
        assert_eq!(payload["workflowRunId"], "task-1:workflow");
        assert_eq!(payload["workflowKey"], "content_article_workflow");
        assert_eq!(payload["stepId"], "research");
        assert_eq!(payload["connectorRef"], "web-research");
        assert_eq!(payload["toolName"], "WebSearch");
        assert_eq!(payload["status"], "completed");
        assert_eq!(
            payload["metadata"]["pluginWorkflow"]["eventSource"],
            "worker_progress"
        );
        assert_eq!(
            payload["metadata"]["pluginWorkflow"]["safeLabel"],
            "research"
        );
        assert_eq!(payload["prompt"]["redacted"], true);
        assert_eq!(payload["query"]["redacted"], true);
        assert_eq!(payload["result"]["redacted"], true);
        assert_eq!(payload["providerConfig"]["redacted"], true);
        assert_eq!(
            payload["metadata"]["note"],
            "[redacted:workflow_audit_metadata_only]"
        );
        assert_eq!(
            payload["redaction"]["policy"],
            "workflow_audit_metadata_only"
        );
        assert_eq!(payload["redaction"]["promptText"], false);
        assert_eq!(payload["redaction"]["providerPayload"], false);
        assert_eq!(payload["redaction"]["rawContent"], false);
    }

    #[test]
    fn clear_session_removes_session_event_log() {
        let temp = tempfile::tempdir().expect("tempdir");
        let writer = EventLogWriter::new(temp.path()).expect("writer");
        writer.append(&event(1)).expect("append");
        writer
            .append_workflow_audit_events("session-a", &[event(2)])
            .expect("append workflow audit");

        writer.clear_session("session-a").expect("clear");

        let records = writer.read_session_events("session-a").expect("records");
        assert!(records.is_empty());
        let audit_records = writer
            .read_session_workflow_audit_events("session-a")
            .expect("audit records");
        assert!(audit_records.is_empty());
        writer.clear_session("session-a").expect("clear missing");
    }
}
