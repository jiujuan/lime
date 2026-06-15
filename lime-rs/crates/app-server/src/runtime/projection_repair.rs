use super::event_log::EventLogWriter;
use super::projection_store::ProjectionReadSession;
use super::projection_store::ProjectionStore;

#[derive(Debug, Clone)]
pub struct ProjectionRepair {
    event_log_writer: EventLogWriter,
    projection_store: ProjectionStore,
}

impl ProjectionRepair {
    pub fn new(event_log_writer: EventLogWriter, projection_store: ProjectionStore) -> Self {
        Self {
            event_log_writer,
            projection_store,
        }
    }

    pub fn repair_session(&self, session_id: &str) -> Result<usize, String> {
        let records = self.event_log_writer.read_session_events(session_id)?;
        let events = records
            .into_iter()
            .map(|record| record.event)
            .collect::<Vec<_>>();
        self.projection_store.repair_session(session_id, &events)
    }

    pub fn read_repaired_session(
        &self,
        session_id: &str,
    ) -> Result<Option<(ProjectionReadSession, Vec<app_server_protocol::AgentEvent>)>, String> {
        let records = self.event_log_writer.read_session_events(session_id)?;
        if records.is_empty() {
            self.projection_store.repair_session(session_id, &[])?;
            return Ok(None);
        }
        let events = records
            .into_iter()
            .map(|record| record.event)
            .collect::<Vec<_>>();
        let latest_sequence = events.iter().map(|event| event.sequence).max().unwrap_or(0);
        let needs_repair = match self.projection_store.read_watermark(session_id)? {
            Some(watermark) => watermark.last_sequence < latest_sequence,
            None => true,
        };
        if needs_repair {
            self.projection_store.repair_session(session_id, &events)?;
        }
        let Some(session) = self.projection_store.read_session_projection(session_id)? else {
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
            .read_repaired_session("sess_repair")
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
