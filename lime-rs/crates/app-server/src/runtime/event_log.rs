use app_server_protocol::AgentEvent;
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
        let path = self.session_path(&event.session_id);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!("无法创建 event log 父目录 {}: {error}", parent.display())
            })?;
        }
        let json = serde_json::to_vec(event)
            .map_err(|error| format!("无法序列化 event {}: {error}", event.event_id))?;
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|error| format!("无法打开 event log {}: {error}", path.display()))?;
        file.write_all(&json)
            .and_then(|_| file.write_all(b"\n"))
            .map_err(|error| format!("无法写入 event log {}: {error}", path.display()))?;
        Ok(path)
    }

    pub fn read_session_events(&self, session_id: &str) -> Result<Vec<EventLogRecord>, String> {
        let path = self.session_path(session_id);
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
                path: path.clone(),
                event,
            });
        }
        Ok(records)
    }

    fn session_path(&self, session_id: &str) -> PathBuf {
        self.root
            .join("sessions")
            .join(format!("session_{}.jsonl", safe_file_stem(session_id)))
    }
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
}
