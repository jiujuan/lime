//! Session memory disabled read model.
//!
//! This module owns the current disabled-memory behavior used while session
//! memory is served through other Lime memory tools. Runtime-specific adapters
//! should only translate these records into their DTOs.

use chrono::{DateTime, Utc};

pub const MEMORY_DISABLED_MESSAGE: &str = "LimeSessionStore: memory subsystem disabled";
pub const MEMORY_COMMIT_SKIPPED_MESSAGE: &str = "LimeSessionStore: memory commit skipped";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionMemoryCategoryRecord {
    Profile,
    Preferences,
    Entities,
    Events,
    Cases,
    Patterns,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SessionMemoryRecord {
    pub id: i64,
    pub session_id: String,
    pub category: SessionMemoryCategoryRecord,
    pub abstract_text: String,
    pub overview: String,
    pub content: String,
    pub content_hash: String,
    pub source_start_ts: i64,
    pub source_end_ts: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SessionMemorySearchResultRecord {
    pub record: SessionMemoryRecord,
    pub relevance_score: f32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionMemoryCommitReportRecord {
    pub session_id: String,
    pub messages_scanned: usize,
    pub memories_created: usize,
    pub memories_merged: usize,
    pub source_start_ts: Option<i64>,
    pub source_end_ts: Option<i64>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SessionMemoryStatsRecord {
    pub total_memories: i64,
    pub total_sessions: i64,
    pub total_events: i64,
    pub total_links: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionMemoryHealthRecord {
    pub healthy: bool,
    pub message: String,
}

pub fn commit_session_memory_report(session_id: &str) -> SessionMemoryCommitReportRecord {
    SessionMemoryCommitReportRecord {
        session_id: session_id.to_string(),
        messages_scanned: 0,
        memories_created: 0,
        memories_merged: 0,
        source_start_ts: None,
        source_end_ts: None,
        warnings: vec![MEMORY_COMMIT_SKIPPED_MESSAGE.to_string()],
    }
}

pub fn search_session_memory_records(
    _query: &str,
    _limit: Option<usize>,
    _session_scope: Option<&str>,
) -> Vec<SessionMemorySearchResultRecord> {
    Vec::new()
}

pub fn retrieve_context_memory_records(
    _session_id: &str,
    _query: &str,
    _limit: usize,
) -> Vec<SessionMemoryRecord> {
    Vec::new()
}

pub fn session_memory_stats_record() -> SessionMemoryStatsRecord {
    SessionMemoryStatsRecord::default()
}

pub fn session_memory_health_record() -> SessionMemoryHealthRecord {
    SessionMemoryHealthRecord {
        healthy: true,
        message: MEMORY_DISABLED_MESSAGE.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        commit_session_memory_report, retrieve_context_memory_records,
        search_session_memory_records, session_memory_health_record, session_memory_stats_record,
        MEMORY_COMMIT_SKIPPED_MESSAGE, MEMORY_DISABLED_MESSAGE,
    };

    #[test]
    fn commit_session_memory_report_should_mark_commit_skipped() {
        let report = commit_session_memory_report("session-1");

        assert_eq!(report.session_id, "session-1");
        assert_eq!(report.messages_scanned, 0);
        assert_eq!(report.memories_created, 0);
        assert_eq!(report.memories_merged, 0);
        assert_eq!(report.source_start_ts, None);
        assert_eq!(report.source_end_ts, None);
        assert_eq!(report.warnings, vec![MEMORY_COMMIT_SKIPPED_MESSAGE]);
    }

    #[test]
    fn disabled_memory_queries_should_return_empty_records() {
        assert!(search_session_memory_records("anything", Some(10), Some("session-1")).is_empty());
        assert!(retrieve_context_memory_records("session-1", "anything", 10).is_empty());
    }

    #[test]
    fn session_memory_stats_and_health_should_report_disabled_stub() {
        let stats = session_memory_stats_record();
        let health = session_memory_health_record();

        assert_eq!(stats.total_memories, 0);
        assert_eq!(stats.total_sessions, 0);
        assert_eq!(stats.total_events, 0);
        assert_eq!(stats.total_links, 0);
        assert!(health.healthy);
        assert_eq!(health.message, MEMORY_DISABLED_MESSAGE);
    }
}
