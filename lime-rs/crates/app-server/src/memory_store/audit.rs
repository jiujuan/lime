use super::*;

pub(super) const AUDIT_DIR: &str = "audit";
pub(super) const AUDIT_EVENTS_FILE: &str = "memory_events.jsonl";
const AUDIT_SCHEMA_VERSION: &str = "memory-audit-event/v1";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct MemoryAuditEvent<'a> {
    schema_version: &'a str,
    recorded_at: String,
    operation: &'a str,
    root_scope: MemoryStoreScope,
    source_path: Option<&'a str>,
    archived_path: Option<&'a str>,
    action: Option<&'a str>,
    updated: bool,
    memory_path: &'a str,
    summary_path: &'a str,
    processed_notes: Option<usize>,
    skipped_notes: Option<usize>,
    archived_notes: Option<usize>,
    warnings: &'a [String],
}

impl<'a> MemoryAuditEvent<'a> {
    pub(super) fn consolidate(
        root_scope: MemoryStoreScope,
        processed_notes: usize,
        skipped_notes: usize,
        archived_notes: usize,
        warnings: &'a [String],
        updated: bool,
    ) -> Self {
        Self {
            schema_version: AUDIT_SCHEMA_VERSION,
            recorded_at: Utc::now().to_rfc3339(),
            operation: "consolidate",
            root_scope,
            source_path: None,
            archived_path: None,
            action: None,
            updated,
            memory_path: MEMORY_FILE,
            summary_path: SUMMARY_FILE,
            processed_notes: Some(processed_notes),
            skipped_notes: Some(skipped_notes),
            archived_notes: Some(archived_notes),
            warnings,
        }
    }

    pub(super) fn review_resolve(
        root_scope: MemoryStoreScope,
        source_path: &'a str,
        archived_path: &'a str,
        action: &'a str,
        updated: bool,
    ) -> Self {
        Self {
            schema_version: AUDIT_SCHEMA_VERSION,
            recorded_at: Utc::now().to_rfc3339(),
            operation: "reviewResolve",
            root_scope,
            source_path: Some(source_path),
            archived_path: Some(archived_path),
            action: Some(action),
            updated,
            memory_path: MEMORY_FILE,
            summary_path: SUMMARY_FILE,
            processed_notes: None,
            skipped_notes: None,
            archived_notes: None,
            warnings: &[],
        }
    }
}

pub(super) fn append_audit_event(
    root: &Path,
    event: &MemoryAuditEvent<'_>,
) -> Result<String, RuntimeCoreError> {
    let audit_dir = root.join(AUDIT_DIR);
    fs::create_dir_all(&audit_dir).map_err(io_error)?;
    reject_symlink_chain(root, &audit_dir)?;
    let audit_path = audit_dir.join(AUDIT_EVENTS_FILE);
    reject_symlink_chain(root, &audit_path)?;
    let mut line = serde_json::to_string(event)
        .map_err(|error| backend_error(format!("memory audit serialize failed: {error}")))?;
    line.push('\n');
    use std::io::Write;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&audit_path)
        .map_err(io_error)?;
    file.write_all(line.as_bytes()).map_err(io_error)?;
    path_to_relative_string(Path::new(AUDIT_DIR).join(AUDIT_EVENTS_FILE).as_path())
}
