use anyhow::Result;
use aster::session::{
    CommitReport, MemoryCategory, MemoryHealth, MemoryRecord, MemorySearchResult, MemoryStats,
};
use thread_store::memory_stub::{
    commit_session_memory_report, retrieve_context_memory_records, search_session_memory_records,
    session_memory_health_record, session_memory_stats_record, SessionMemoryCategoryRecord,
    SessionMemoryCommitReportRecord, SessionMemoryHealthRecord, SessionMemoryRecord,
    SessionMemorySearchResultRecord, SessionMemoryStatsRecord,
};

pub(super) fn commit_session_report(session_id: &str) -> CommitReport {
    commit_report_from_record(commit_session_memory_report(session_id))
}

pub(super) fn empty_memory_search_results(
    _query: &str,
    _limit: Option<usize>,
    _session_scope: Option<&str>,
    _categories: Option<Vec<MemoryCategory>>,
) -> Vec<MemorySearchResult> {
    search_session_memory_records(_query, _limit, _session_scope)
        .into_iter()
        .map(memory_search_result_from_record)
        .collect()
}

pub(super) fn empty_context_memories(
    _session_id: &str,
    _query: &str,
    _limit: usize,
) -> Vec<MemoryRecord> {
    retrieve_context_memory_records(_session_id, _query, _limit)
        .into_iter()
        .map(memory_record_from_record)
        .collect()
}

pub(super) fn memory_stats() -> MemoryStats {
    memory_stats_from_record(session_memory_stats_record())
}

pub(super) fn memory_health() -> Result<MemoryHealth> {
    Ok(memory_health_from_record(session_memory_health_record()))
}

fn commit_report_from_record(record: SessionMemoryCommitReportRecord) -> CommitReport {
    CommitReport {
        session_id: record.session_id,
        messages_scanned: record.messages_scanned,
        memories_created: record.memories_created,
        memories_merged: record.memories_merged,
        source_start_ts: record.source_start_ts,
        source_end_ts: record.source_end_ts,
        warnings: record.warnings,
    }
}

fn memory_search_result_from_record(record: SessionMemorySearchResultRecord) -> MemorySearchResult {
    MemorySearchResult {
        record: memory_record_from_record(record.record),
        relevance_score: record.relevance_score,
    }
}

fn memory_record_from_record(record: SessionMemoryRecord) -> MemoryRecord {
    MemoryRecord {
        id: record.id,
        session_id: record.session_id,
        category: memory_category_from_record(record.category),
        abstract_text: record.abstract_text,
        overview: record.overview,
        content: record.content,
        content_hash: record.content_hash,
        source_start_ts: record.source_start_ts,
        source_end_ts: record.source_end_ts,
        created_at: record.created_at,
        updated_at: record.updated_at,
    }
}

fn memory_category_from_record(category: SessionMemoryCategoryRecord) -> MemoryCategory {
    match category {
        SessionMemoryCategoryRecord::Profile => MemoryCategory::Profile,
        SessionMemoryCategoryRecord::Preferences => MemoryCategory::Preferences,
        SessionMemoryCategoryRecord::Entities => MemoryCategory::Entities,
        SessionMemoryCategoryRecord::Events => MemoryCategory::Events,
        SessionMemoryCategoryRecord::Cases => MemoryCategory::Cases,
        SessionMemoryCategoryRecord::Patterns => MemoryCategory::Patterns,
    }
}

fn memory_stats_from_record(record: SessionMemoryStatsRecord) -> MemoryStats {
    MemoryStats {
        total_memories: record.total_memories,
        total_sessions: record.total_sessions,
        total_events: record.total_events,
        total_links: record.total_links,
    }
}

fn memory_health_from_record(record: SessionMemoryHealthRecord) -> MemoryHealth {
    MemoryHealth {
        healthy: record.healthy,
        message: record.message,
    }
}
