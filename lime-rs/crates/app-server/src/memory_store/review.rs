use super::consolidation::{
    accepted_note_line, append_memory_register, move_note, rewrite_summary, PROCESSED_NOTES_DIR,
    REVIEW_NOTES_DIR,
};
use super::*;

const DEFAULT_REVIEW_LIMIT: usize = 20;
const MAX_REVIEW_LIMIT: usize = 100;
const REJECTED_NOTES_DIR: &str = "extensions/ad_hoc/rejected";

#[derive(Debug, Clone)]
struct ReviewNoteFile {
    relative_path: String,
    content: String,
    size: u64,
    modified_at: i64,
}

pub(super) async fn list_review_notes(
    backend: &LocalMemoryBackend,
    params: MemoryStoreReviewListParams,
) -> Result<MemoryStoreReviewListResponse, RuntimeCoreError> {
    let root = backend.resolve_root(&params.root)?;
    backend.ensure_layout(&root)?;
    let notes = collect_review_notes(backend, &root)?;
    let offset = parse_cursor(params.cursor.as_deref())?;
    let limit = bounded_limit(params.max_results, DEFAULT_REVIEW_LIMIT, MAX_REVIEW_LIMIT);
    let total = notes.len();
    let notes = notes
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(review_note_response)
        .collect::<Vec<_>>();
    let next_offset = offset.saturating_add(notes.len());
    let truncated = next_offset < total;

    Ok(MemoryStoreReviewListResponse {
        root_scope: params.root.scope,
        root_path: path_to_display_string(&root)?,
        notes,
        truncated,
        next_cursor: truncated.then(|| next_offset.to_string()),
    })
}

pub(super) async fn resolve_review_note(
    backend: &LocalMemoryBackend,
    params: MemoryStoreReviewResolveParams,
) -> Result<MemoryStoreReviewResolveResponse, RuntimeCoreError> {
    let root = backend.resolve_root(&params.root)?;
    backend.ensure_layout(&root)?;
    let source = backend.resolve_existing_path(&root, Some(&params.path))?;
    let source_relative = backend.relative_path(&root, &source)?;
    if !source_relative.starts_with(&format!("{REVIEW_NOTES_DIR}/")) {
        return Err(backend_error(
            "memoryStore/review/resolve path must be under review notes",
        ));
    }
    if !source.is_file() {
        return Err(backend_error(
            "memoryStore/review/resolve path must be a review note file",
        ));
    }
    if !source
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        return Err(backend_error(
            "memoryStore/review/resolve only supports Markdown review notes",
        ));
    }

    let target_dir = match params.action {
        MemoryStoreReviewResolveAction::Accept => root.join(PROCESSED_NOTES_DIR),
        MemoryStoreReviewResolveAction::Reject => root.join(REJECTED_NOTES_DIR),
    };
    fs::create_dir_all(&target_dir).map_err(io_error)?;
    reject_symlink_chain(&root, &target_dir)?;

    let content = fs::read_to_string(&source).map_err(|error| {
        if error.kind() == io::ErrorKind::InvalidData {
            backend_error("memoryStore/review/resolve only supports UTF-8 files")
        } else {
            io_error(error)
        }
    })?;
    let archived_path = move_note(&root, &source, &target_dir)?;
    let archived_relative = backend.relative_path(&root, &archived_path)?;
    let updated = params.action == MemoryStoreReviewResolveAction::Accept;
    if updated {
        let accepted = vec![accepted_note_line(&content, &archived_relative)];
        append_memory_register(&root, &accepted)?;
        rewrite_summary(&root, &accepted)?;
    }
    let action = match params.action {
        MemoryStoreReviewResolveAction::Accept => "accept",
        MemoryStoreReviewResolveAction::Reject => "reject",
    };
    audit::append_audit_event(
        &root,
        &audit::MemoryAuditEvent::review_resolve(
            params.root.scope,
            &source_relative,
            &archived_relative,
            action,
            updated,
        ),
    )?;

    Ok(MemoryStoreReviewResolveResponse {
        root_scope: params.root.scope,
        root_path: path_to_display_string(&root)?,
        source_path: source_relative,
        archived_path: archived_relative,
        action: params.action,
        memory_path: MEMORY_FILE.to_string(),
        summary_path: SUMMARY_FILE.to_string(),
        updated,
    })
}

fn collect_review_notes(
    backend: &LocalMemoryBackend,
    root: &Path,
) -> Result<Vec<ReviewNoteFile>, RuntimeCoreError> {
    let review_dir = root.join(REVIEW_NOTES_DIR);
    fs::create_dir_all(&review_dir).map_err(io_error)?;
    reject_symlink_chain(root, &review_dir)?;
    let mut paths = Vec::new();
    for entry in fs::read_dir(&review_dir).map_err(io_error)? {
        let entry = entry.map_err(io_error)?;
        if should_skip_segment(&entry.file_name()) {
            continue;
        }
        let path = entry.path();
        if is_symlink(&path)? {
            continue;
        }
        let metadata = fs::metadata(&path).map_err(io_error)?;
        if metadata.is_file()
            && path
                .extension()
                .and_then(OsStr::to_str)
                .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
        {
            paths.push(path);
        }
    }
    paths.sort();

    let mut notes = Vec::new();
    for path in paths {
        let metadata = fs::metadata(&path).map_err(io_error)?;
        let content = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(error) if error.kind() == io::ErrorKind::InvalidData => continue,
            Err(error) => return Err(io_error(error)),
        };
        notes.push(ReviewNoteFile {
            relative_path: backend.relative_path(root, &path)?,
            content,
            size: metadata.len(),
            modified_at: modified_at_seconds(&metadata),
        });
    }
    Ok(notes)
}

fn review_note_response(note: ReviewNoteFile) -> MemoryStoreReviewNote {
    let preview = note
        .content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with("---"))
        .unwrap_or("Review note");
    let (preview, _) = truncate_chars(preview, 180);
    let end_line_number = note.content.lines().count().max(1);

    MemoryStoreReviewNote {
        path: note.relative_path.clone(),
        size: note.size,
        modified_at: note.modified_at,
        preview,
        citation: MemoryStoreCitation {
            path: note.relative_path,
            start_line_number: 1,
            end_line_number,
        },
    }
}
