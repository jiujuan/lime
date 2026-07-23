use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::Path;

use super::{
    active_storage_path, history_content_digest, is_sha256_hex, metadata_content_digest,
    parse_record, LatestRolloutHistory, RolloutRecord, ROLLOUT_SCHEMA_VERSION,
    ROLLOUT_TAIL_READ_CHUNK_BYTES,
};

pub(super) fn latest_history_for_append(
    path: &Path,
    relative_path: &Path,
    session_id: &str,
    thread_id: &str,
) -> Result<Option<LatestRolloutHistory>, String> {
    validate_rollout_header_for_append(path, relative_path, session_id, thread_id)?;

    let mut file = File::open(path)
        .map_err(|error| format!("failed to read rollout file {}: {error}", path.display()))?;
    let file_len = file
        .metadata()
        .map_err(|error| format!("failed to inspect rollout file {}: {error}", path.display()))?
        .len();
    let mut cursor = file_len;
    let mut suffix = Vec::new();

    while cursor > 0 {
        let chunk_start = cursor.saturating_sub(ROLLOUT_TAIL_READ_CHUNK_BYTES as u64);
        let chunk_len = usize::try_from(cursor - chunk_start)
            .map_err(|_| format!("rollout read range is too large: {}", path.display()))?;
        let mut chunk = vec![0_u8; chunk_len];
        file.seek(SeekFrom::Start(chunk_start))
            .and_then(|_| file.read_exact(&mut chunk))
            .map_err(|error| format!("failed to read rollout file {}: {error}", path.display()))?;

        let mut segment_end = chunk.len();
        for newline_index in (0..chunk.len())
            .rev()
            .filter(|index| chunk[*index] == b'\n')
        {
            let line_start = chunk_start + newline_index as u64 + 1;
            let mut line = Vec::with_capacity(segment_end - newline_index - 1 + suffix.len());
            line.extend_from_slice(&chunk[newline_index + 1..segment_end]);
            line.extend_from_slice(&suffix);
            suffix.clear();
            segment_end = newline_index;

            if line_start == file_len && line.is_empty() {
                continue;
            }
            trim_carriage_return(&mut line);
            if let Some(history) =
                validate_rollout_tail_record(&line, line_start, path, session_id, thread_id)?
            {
                return Ok(Some(history));
            }
        }

        if segment_end > 0 {
            let mut next_suffix = Vec::with_capacity(segment_end + suffix.len());
            next_suffix.extend_from_slice(&chunk[..segment_end]);
            next_suffix.extend_from_slice(&suffix);
            suffix = next_suffix;
        }
        cursor = chunk_start;
    }

    trim_carriage_return(&mut suffix);
    if !suffix.is_empty() {
        if let Some(history) =
            validate_rollout_tail_record(&suffix, 0, path, session_id, thread_id)?
        {
            return Ok(Some(history));
        }
    }
    Ok(None)
}

fn validate_rollout_header_for_append(
    path: &Path,
    relative_path: &Path,
    session_id: &str,
    thread_id: &str,
) -> Result<(), String> {
    let file = File::open(path)
        .map_err(|error| format!("failed to read rollout file {}: {error}", path.display()))?;
    let mut reader = BufReader::new(file);
    let mut first = String::new();
    if reader
        .read_line(&mut first)
        .map_err(|error| format!("failed to read rollout file {}: {error}", path.display()))?
        == 0
    {
        return Err(format!("rollout file is empty: {}", path.display()));
    }
    let RolloutRecord::SessionMeta {
        schema_version,
        session_id: record_session_id,
        thread_id: record_thread_id,
        rollout_path,
        ..
    } = parse_record(first.trim_end_matches(['\r', '\n']), path)?
    else {
        return Err(format!(
            "rollout first line must be session metadata: {}",
            path.display()
        ));
    };
    if schema_version != ROLLOUT_SCHEMA_VERSION {
        return Err(format!(
            "unsupported rollout schema version {schema_version}: {}",
            path.display()
        ));
    }
    let expected_path = active_storage_path(relative_path)?;
    if record_session_id != session_id
        || record_thread_id != thread_id
        || rollout_path != expected_path
    {
        return Err(format!("rollout identity mismatch for {}", path.display()));
    }
    Ok(())
}

fn validate_rollout_tail_record(
    line: &[u8],
    line_start: u64,
    path: &Path,
    session_id: &str,
    thread_id: &str,
) -> Result<Option<LatestRolloutHistory>, String> {
    let record: RolloutRecord = serde_json::from_slice(line).map_err(|error| {
        format!(
            "invalid rollout JSONL record in {}: {error}",
            path.display()
        )
    })?;
    match record {
        RolloutRecord::ThreadHistory {
            schema_version,
            session_id: record_session_id,
            thread_id: record_thread_id,
            sequence,
            fingerprint,
            content_digest,
            changes,
        } => {
            if schema_version != ROLLOUT_SCHEMA_VERSION
                || record_session_id != session_id
                || record_thread_id != thread_id
                || changes.sequence != sequence
                || !is_sha256_hex(&fingerprint)
                || history_content_digest(session_id, thread_id, &changes)? != content_digest
            {
                return Err(format!(
                    "invalid rollout history record: {}",
                    path.display()
                ));
            }
            Ok(Some(LatestRolloutHistory {
                sequence,
                fingerprint,
            }))
        }
        RolloutRecord::ThreadMetadata {
            schema_version,
            session_id: record_session_id,
            thread_id: record_thread_id,
            updated_at_ms,
            previous_content_digest,
            content_digest,
            metadata,
        } => {
            if schema_version != ROLLOUT_SCHEMA_VERSION
                || record_session_id != session_id
                || record_thread_id != thread_id
                || !is_sha256_hex(&previous_content_digest)
                || metadata_content_digest(session_id, thread_id, updated_at_ms, &metadata)?
                    != content_digest
            {
                return Err(format!(
                    "invalid rollout metadata record: {}",
                    path.display()
                ));
            }
            Ok(None)
        }
        RolloutRecord::SessionMeta { .. } if line_start == 0 => Ok(None),
        RolloutRecord::SessionMeta { .. } => Err(format!(
            "rollout session metadata may only appear on the first line: {}",
            path.display()
        )),
    }
}

fn trim_carriage_return(line: &mut Vec<u8>) {
    if line.last() == Some(&b'\r') {
        line.pop();
    }
}
