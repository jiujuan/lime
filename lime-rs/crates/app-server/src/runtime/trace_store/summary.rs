use super::{system_time_rfc3339, RawTraceEvent};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TraceEventFileSummary {
    pub(crate) relative_path: String,
    pub(crate) size_bytes: u64,
    pub(crate) event_count: u64,
    pub(crate) parse_error_count: u64,
    pub(crate) session_id: Option<String>,
    pub(crate) trace_id: Option<String>,
    pub(crate) first_wall_time_unix_ms: Option<i64>,
    pub(crate) last_wall_time_unix_ms: Option<i64>,
    pub(crate) modified_at: Option<String>,
}

pub(crate) fn summarize_trace_event_store(
    root: &Path,
    max_files: usize,
) -> Vec<TraceEventFileSummary> {
    let mut trace_files = collect_trace_event_files(root);
    trace_files.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| right.0.cmp(&left.0)));
    trace_files.truncate(max_files);
    trace_files
        .into_iter()
        .filter_map(|(path, _)| summarize_trace_event_file(root, &path))
        .collect()
}

fn collect_trace_event_files(root: &Path) -> Vec<(PathBuf, SystemTime)> {
    let sessions_root = root.join("sessions");
    let Ok(session_dirs) = fs::read_dir(&sessions_root) else {
        return Vec::new();
    };

    let mut files = Vec::new();
    for session_dir in session_dirs.flatten() {
        let session_path = session_dir.path();
        if !session_path.is_dir() {
            continue;
        }
        let Ok(entries) = fs::read_dir(&session_path) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("jsonl") {
                continue;
            }
            let modified = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH);
            files.push((path, modified));
        }
    }
    files
}

fn summarize_trace_event_file(root: &Path, path: &Path) -> Option<TraceEventFileSummary> {
    let metadata = fs::metadata(path).ok()?;
    let mut event_count = 0_u64;
    let mut parse_error_count = 0_u64;
    let mut session_id = None;
    let mut trace_id = None;
    let mut first_wall_time_unix_ms = None;
    let mut last_wall_time_unix_ms = None;

    if let Ok(file) = fs::File::open(path) {
        for line in BufReader::new(file).lines() {
            let Ok(line) = line else {
                parse_error_count = parse_error_count.saturating_add(1);
                continue;
            };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            event_count = event_count.saturating_add(1);
            let Ok(event) = serde_json::from_str::<RawTraceEvent>(trimmed) else {
                parse_error_count = parse_error_count.saturating_add(1);
                continue;
            };
            if session_id.is_none() {
                session_id = Some(event.session_id);
            }
            if trace_id.is_none() {
                trace_id = Some(event.trace_id);
            }
            first_wall_time_unix_ms.get_or_insert(event.wall_time_unix_ms);
            last_wall_time_unix_ms = Some(event.wall_time_unix_ms);
        }
    }

    Some(TraceEventFileSummary {
        relative_path: trace_relative_path(root, path),
        size_bytes: metadata.len(),
        event_count,
        parse_error_count,
        session_id,
        trace_id,
        first_wall_time_unix_ms,
        last_wall_time_unix_ms,
        modified_at: metadata.modified().ok().map(system_time_rfc3339),
    })
}

fn trace_relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .ok()
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|| {
            path.file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("trace.jsonl")
                .to_string()
        })
}
