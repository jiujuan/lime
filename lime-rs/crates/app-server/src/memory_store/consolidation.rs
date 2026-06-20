use super::*;

const DEFAULT_CONSOLIDATE_LIMIT: usize = 20;
const MAX_CONSOLIDATE_LIMIT: usize = 100;
pub(super) const PROCESSED_NOTES_DIR: &str = "extensions/ad_hoc/processed";
pub(super) const PROCESSED_ROLLOUT_SUMMARIES_DIR: &str = "rollout_summaries/processed";
pub(super) const REVIEW_NOTES_DIR: &str = "extensions/ad_hoc/review";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NoteDecision {
    Accept,
    Review(&'static str),
}

#[derive(Debug, Clone)]
struct PendingNote {
    path: PathBuf,
    relative_path: String,
    content: String,
    processed_dir: &'static str,
}

pub(super) async fn consolidate_memory_store(
    backend: &LocalMemoryBackend,
    params: MemoryStoreConsolidateParams,
) -> Result<MemoryStoreConsolidateResponse, RuntimeCoreError> {
    let root = backend.resolve_root(&params.root)?;
    backend.ensure_layout(&root)?;
    let limit = bounded_limit(
        params.max_notes,
        DEFAULT_CONSOLIDATE_LIMIT,
        MAX_CONSOLIDATE_LIMIT,
    );
    let notes = collect_pending_candidates(backend, &root, limit)?;
    let processed_dir = root.join(PROCESSED_NOTES_DIR);
    let processed_rollout_dir = root.join(PROCESSED_ROLLOUT_SUMMARIES_DIR);
    let review_dir = root.join(REVIEW_NOTES_DIR);
    fs::create_dir_all(&processed_dir).map_err(io_error)?;
    fs::create_dir_all(&processed_rollout_dir).map_err(io_error)?;
    fs::create_dir_all(&review_dir).map_err(io_error)?;
    reject_symlink_chain(&root, &processed_dir)?;
    reject_symlink_chain(&root, &processed_rollout_dir)?;
    reject_symlink_chain(&root, &review_dir)?;

    let mut accepted = Vec::new();
    let mut warnings = Vec::new();
    let mut skipped_notes = 0_usize;
    let mut archived_notes = 0_usize;

    for note in notes {
        match classify_note(&note.content) {
            NoteDecision::Accept => {
                let archived_path = move_note(&root, &note.path, &root.join(note.processed_dir))?;
                let archived_relative = backend.relative_path(&root, &archived_path)?;
                archived_notes += 1;
                accepted.push(accepted_note_line(&note.content, &archived_relative));
            }
            NoteDecision::Review(reason) => {
                let archived_path = move_note(&root, &note.path, &review_dir)?;
                let archived_relative = backend.relative_path(&root, &archived_path)?;
                archived_notes += 1;
                skipped_notes += 1;
                warnings.push(format!(
                    "{path}: {reason}",
                    path = if archived_relative.is_empty() {
                        note.relative_path
                    } else {
                        archived_relative
                    }
                ));
            }
        }
    }

    if !accepted.is_empty() {
        append_memory_register(&root, &accepted)?;
        rewrite_summary(&root, &accepted)?;
    }
    audit::append_audit_event(
        &root,
        &audit::MemoryAuditEvent::consolidate(
            params.root.scope,
            accepted.len(),
            skipped_notes,
            archived_notes,
            &warnings,
            !accepted.is_empty(),
        ),
    )?;

    Ok(MemoryStoreConsolidateResponse {
        root_scope: params.root.scope,
        root_path: path_to_display_string(&root)?,
        processed_notes: accepted.len(),
        skipped_notes,
        archived_notes,
        memory_path: MEMORY_FILE.to_string(),
        summary_path: SUMMARY_FILE.to_string(),
        warnings,
        updated: !accepted.is_empty(),
    })
}

fn collect_pending_candidates(
    backend: &LocalMemoryBackend,
    root: &Path,
    limit: usize,
) -> Result<Vec<PendingNote>, RuntimeCoreError> {
    let mut candidates =
        collect_markdown_candidates(backend, root, NOTES_DIR, PROCESSED_NOTES_DIR, limit)?;
    let remaining = limit.saturating_sub(candidates.len());
    if remaining > 0 {
        candidates.extend(collect_markdown_candidates(
            backend,
            root,
            ROLLOUT_SUMMARIES_DIR,
            PROCESSED_ROLLOUT_SUMMARIES_DIR,
            remaining,
        )?);
    }
    Ok(candidates)
}

fn collect_markdown_candidates(
    backend: &LocalMemoryBackend,
    root: &Path,
    relative_dir: &'static str,
    processed_dir: &'static str,
    limit: usize,
) -> Result<Vec<PendingNote>, RuntimeCoreError> {
    if limit == 0 {
        return Ok(Vec::new());
    }
    let notes_dir = root.join(relative_dir);
    reject_symlink_chain(root, &notes_dir)?;
    let mut paths = Vec::new();
    for entry in fs::read_dir(&notes_dir).map_err(io_error)? {
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
    paths.truncate(limit);

    let mut notes = Vec::new();
    for path in paths {
        let content = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(error) if error.kind() == io::ErrorKind::InvalidData => {
                continue;
            }
            Err(error) => return Err(io_error(error)),
        };
        notes.push(PendingNote {
            relative_path: backend.relative_path(root, &path)?,
            path,
            content,
            processed_dir,
        });
    }
    Ok(notes)
}

fn classify_note(content: &str) -> NoteDecision {
    let comparable = content.to_lowercase();
    let secret_markers = [
        "api_key",
        "apikey",
        "authorization:",
        "bearer ",
        "password",
        "secret",
        "token",
        "sk-",
        "ghp_",
        "xoxb-",
    ];
    if secret_markers
        .iter()
        .any(|marker| comparable.contains(marker))
    {
        return NoteDecision::Review("secret-like content requires review");
    }
    let conflict_markers = [
        "conflict:",
        "[conflict]",
        "forget this",
        "do not remember",
        "don't remember",
        "不要记",
        "不用记",
        "别记",
        "删除记忆",
        "忘掉",
    ];
    if conflict_markers
        .iter()
        .any(|marker| comparable.contains(marker))
    {
        return NoteDecision::Review("conflicting memory intent requires review");
    }
    let has_meaningful_line = content
        .lines()
        .map(str::trim)
        .any(|line| !line.is_empty() && !line.starts_with('#'));
    if has_meaningful_line {
        NoteDecision::Accept
    } else {
        NoteDecision::Review("empty note body requires review")
    }
}

pub(super) fn accepted_note_line(content: &str, relative_path: &str) -> String {
    let mut lines = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#') && !line.starts_with("---"));
    let summary = lines.next().unwrap_or("Memory note");
    let (summary, _) = truncate_chars(summary, 180);
    format!("- {summary} (source: {relative_path})")
}

pub(super) fn append_memory_register(
    root: &Path,
    accepted: &[String],
) -> Result<(), RuntimeCoreError> {
    let memory_path = root.join(MEMORY_FILE);
    reject_symlink_chain(root, &memory_path)?;
    let mut existing = fs::read_to_string(&memory_path).unwrap_or_default();
    if !existing.trim().is_empty() && !existing.ends_with('\n') {
        existing.push('\n');
    }
    if !existing.contains("## Consolidated notes") {
        if !existing.trim().is_empty() {
            existing.push('\n');
        }
        existing.push_str("## Consolidated notes\n\n");
    }
    for line in accepted {
        existing.push_str(line);
        existing.push('\n');
    }
    fs::write(memory_path, existing).map_err(io_error)
}

pub(super) fn rewrite_summary(root: &Path, accepted: &[String]) -> Result<(), RuntimeCoreError> {
    let summary_path = root.join(SUMMARY_FILE);
    reject_symlink_chain(root, &summary_path)?;
    let mut existing = fs::read_to_string(&summary_path).unwrap_or_default();
    if !existing.trim().is_empty() && !existing.ends_with('\n') {
        existing.push('\n');
    }
    if !existing.contains("## Consolidated memory") {
        if !existing.trim().is_empty() {
            existing.push('\n');
        }
        existing.push_str("## Consolidated memory\n\n");
    }
    for line in accepted {
        existing.push_str(line);
        existing.push('\n');
    }
    fs::write(summary_path, existing).map_err(io_error)
}

pub(super) fn move_note(
    root: &Path,
    source: &Path,
    target_dir: &Path,
) -> Result<PathBuf, RuntimeCoreError> {
    reject_symlink_chain(root, source)?;
    reject_symlink_chain(root, target_dir)?;
    let file_name = source
        .file_name()
        .ok_or_else(|| backend_error("memory note path has no file name"))?;
    let mut target = target_dir.join(file_name);
    if target.exists() {
        let stem = source
            .file_stem()
            .and_then(OsStr::to_str)
            .unwrap_or("note")
            .to_string();
        let extension = source.extension().and_then(OsStr::to_str).unwrap_or("md");
        let mut resolved = None;
        for index in 2..1000 {
            let candidate = target_dir.join(format!("{stem}-{index}.{extension}"));
            if !candidate.exists() {
                resolved = Some(candidate);
                break;
            }
        }
        target =
            resolved.ok_or_else(|| backend_error("memory note archive target already exists"))?;
    }
    reject_outside_root(root, &target)?;
    fs::rename(source, &target).map_err(io_error)?;
    Ok(target)
}
