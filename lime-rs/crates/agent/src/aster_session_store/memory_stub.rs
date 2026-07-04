use anyhow::Result;
use aster::session::{
    CommitReport, MemoryCategory, MemoryHealth, MemoryRecord, MemorySearchResult, MemoryStats,
};

const MEMORY_DISABLED_MESSAGE: &str = "LimeSessionStore: memory subsystem disabled";
const MEMORY_COMMIT_SKIPPED_MESSAGE: &str = "LimeSessionStore: memory commit skipped";

pub(super) fn commit_session_report(session_id: &str) -> CommitReport {
    CommitReport {
        session_id: session_id.to_string(),
        messages_scanned: 0,
        memories_created: 0,
        memories_merged: 0,
        source_start_ts: None,
        source_end_ts: None,
        warnings: vec![MEMORY_COMMIT_SKIPPED_MESSAGE.to_string()],
    }
}

pub(super) fn empty_memory_search_results(
    _query: &str,
    _limit: Option<usize>,
    _session_scope: Option<&str>,
    _categories: Option<Vec<MemoryCategory>>,
) -> Vec<MemorySearchResult> {
    Vec::new()
}

pub(super) fn empty_context_memories(
    _session_id: &str,
    _query: &str,
    _limit: usize,
) -> Vec<MemoryRecord> {
    Vec::new()
}

pub(super) fn memory_stats() -> MemoryStats {
    MemoryStats::default()
}

pub(super) fn memory_health() -> Result<MemoryHealth> {
    Ok(MemoryHealth {
        healthy: true,
        message: MEMORY_DISABLED_MESSAGE.to_string(),
    })
}
