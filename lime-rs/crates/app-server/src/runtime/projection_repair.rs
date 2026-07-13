use super::event_log::{EventLogIssue, EventLogWriter};
use super::projection_store::ProjectionReadSession;
use super::projection_store::ProjectionReadWindow;
use super::projection_store::ProjectionStore;

#[derive(Debug, Clone)]
pub struct ProjectionRepair {
    event_log_writer: EventLogWriter,
    projection_store: ProjectionStore,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ProjectionRepairStatus {
    Empty,
    Rebuilt,
    RebuiltAfterTailTruncation,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProjectionRepairAudit {
    pub(crate) session_id: String,
    pub(crate) status: ProjectionRepairStatus,
    pub(crate) records_scanned: usize,
    pub(crate) events_applied: usize,
    pub(crate) last_valid_offset: u64,
    pub(crate) file_len: u64,
    pub(crate) fingerprint: String,
    pub(crate) issue: Option<EventLogIssue>,
}

impl ProjectionRepair {
    pub fn new(event_log_writer: EventLogWriter, projection_store: ProjectionStore) -> Self {
        Self {
            event_log_writer,
            projection_store,
        }
    }

    pub fn repair_session(&self, session_id: &str) -> Result<usize, String> {
        Ok(self.repair_session_with_audit(session_id)?.events_applied)
    }

    pub(crate) fn repair_session_with_audit(
        &self,
        session_id: &str,
    ) -> Result<ProjectionRepairAudit, String> {
        let initial_scan = self.event_log_writer.scan_session_events(session_id)?;
        let original_file_len = initial_scan.file_len;
        let repaired_issue = initial_scan.issue.clone();
        let had_repairable_tail = initial_scan
            .issue
            .as_ref()
            .is_some_and(EventLogIssue::is_repairable_tail);
        let scan = if had_repairable_tail {
            self.event_log_writer.repair_session_event_log(session_id)?
        } else {
            if let Some(issue) = initial_scan.issue.clone() {
                return Err(format!(
                    "Projection repair refused event log {}: {issue:?}",
                    initial_scan.path.display()
                ));
            }
            initial_scan
        };
        let events = scan
            .records
            .iter()
            .map(|record| record.event.clone())
            .collect::<Vec<_>>();
        let events_applied = self.projection_store.repair_session(session_id, &events)?;
        Ok(ProjectionRepairAudit {
            session_id: session_id.to_string(),
            status: if had_repairable_tail {
                ProjectionRepairStatus::RebuiltAfterTailTruncation
            } else if events.is_empty() {
                ProjectionRepairStatus::Empty
            } else {
                ProjectionRepairStatus::Rebuilt
            },
            records_scanned: events.len(),
            events_applied,
            last_valid_offset: scan.last_valid_offset,
            file_len: original_file_len,
            fingerprint: scan.fingerprint,
            issue: repaired_issue,
        })
    }

    pub fn read_repaired_session(
        &self,
        session_id: &str,
        existing_projection_window: Option<ProjectionReadWindow>,
    ) -> Result<Option<(ProjectionReadSession, Vec<app_server_protocol::AgentEvent>)>, String> {
        let scan = self.event_log_writer.scan_session_events(session_id)?;
        let scan = if scan
            .issue
            .as_ref()
            .is_some_and(EventLogIssue::is_repairable_tail)
        {
            self.event_log_writer.repair_session_event_log(session_id)?
        } else {
            if let Some(issue) = scan.issue.clone() {
                return Err(format!(
                    "无法读取 event log 进行 projection repair: {issue:?}"
                ));
            }
            scan
        };
        let events = scan
            .records
            .into_iter()
            .map(|record| record.event)
            .collect::<Vec<_>>();
        let latest_sequence = events.last().map(|event| event.sequence).unwrap_or(0);
        let watermark = self.projection_store.read_watermark(session_id)?;
        if let Some(watermark) = watermark {
            if watermark.last_sequence > latest_sequence {
                return Err(format!(
                    "Projection repair refused shorter event log: session_id={session_id} projection_sequence={} event_log_sequence={latest_sequence}",
                    watermark.last_sequence
                ));
            }
            if watermark.last_sequence == latest_sequence {
                if let Some(window) = existing_projection_window {
                    if let Some(session) = self
                        .projection_store
                        .read_session_projection(session_id, window)?
                    {
                        return Ok(Some((session, Vec::new())));
                    }
                }
            }
        }
        if events.is_empty() {
            self.projection_store.repair_session(session_id, &[])?;
            return Ok(None);
        }
        let needs_repair = match watermark {
            Some(watermark) => watermark.last_sequence < latest_sequence,
            None => true,
        };
        if needs_repair {
            self.projection_store.repair_session(session_id, &events)?;
        }
        let Some(session) = self
            .projection_store
            .read_session_projection(session_id, existing_projection_window.unwrap_or_default())?
        else {
            return Ok(None);
        };
        Ok(Some((session, events)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::StorageRoots;
    use app_server_protocol::AgentEvent;
    use serde_json::json;

    #[test]
    fn repair_session_rebuilds_projection_from_jsonl_event_log() {
        let temp = tempfile::tempdir().expect("tempdir");
        let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
        let event_log_writer = EventLogWriter::new(&roots.event_log_root).expect("writer");
        let projection_store =
            ProjectionStore::initialize(&roots.projection_db_path).expect("projection");
        let accepted = event(1, "turn.accepted");
        let completed = event(2, "turn.completed");

        event_log_writer.append(&accepted).expect("append accepted");
        event_log_writer
            .append(&completed)
            .expect("append completed");
        projection_store
            .apply_event(&accepted)
            .expect("apply stale accepted");
        projection_store
            .clear_session("sess_repair")
            .expect("clear projection");

        let repair = ProjectionRepair::new(event_log_writer, projection_store.clone());
        let repaired = repair
            .repair_session("sess_repair")
            .expect("repair projection");

        assert_eq!(repaired, 2);
        let session = projection_store
            .read_session("sess_repair")
            .expect("read projection")
            .expect("session");
        assert_eq!(session.status, "completed");
        assert_eq!(session.last_event_sequence, 2);
    }

    #[test]
    fn read_repaired_session_repairs_missing_projection_before_read() {
        let temp = tempfile::tempdir().expect("tempdir");
        let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
        let event_log_writer = EventLogWriter::new(&roots.event_log_root).expect("writer");
        let projection_store =
            ProjectionStore::initialize(&roots.projection_db_path).expect("projection");
        let accepted = event(1, "turn.accepted");
        let completed = event(2, "turn.completed");

        event_log_writer.append(&accepted).expect("append accepted");
        event_log_writer
            .append(&completed)
            .expect("append completed");

        let repair = ProjectionRepair::new(event_log_writer, projection_store);
        let (session, events) = repair
            .read_repaired_session("sess_repair", None)
            .expect("read repaired")
            .expect("session");

        assert_eq!(events.len(), 2);
        assert_eq!(session.session.session_id, "sess_repair");
        assert_eq!(
            session.session.status,
            app_server_protocol::AgentSessionStatus::Completed
        );
        assert_eq!(session.turns.len(), 1);
        assert_eq!(session.last_event_sequence, 2);
    }

    fn event(sequence: u64, event_type: &str) -> AgentEvent {
        AgentEvent {
            event_id: format!("evt-{sequence}"),
            sequence,
            session_id: "sess_repair".to_string(),
            thread_id: Some("thread_repair".to_string()),
            turn_id: Some("turn_repair".to_string()),
            event_type: event_type.to_string(),
            timestamp: "2026-06-14T00:00:00.000Z".to_string(),
            payload: json!({ "sequence": sequence }),
        }
    }
}
