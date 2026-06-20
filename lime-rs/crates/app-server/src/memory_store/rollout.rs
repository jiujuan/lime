use super::*;

#[derive(Debug, Clone)]
pub struct RolloutSummaryWriteParams {
    pub root: MemoryStoreRootParams,
    pub title: String,
    pub source: String,
    pub exported_at: String,
    pub content: String,
}

pub(super) async fn write_rollout_summary(
    backend: &LocalMemoryBackend,
    params: RolloutSummaryWriteParams,
) -> Result<MemoryStoreAddNoteResponse, RuntimeCoreError> {
    let root = backend.resolve_root(&params.root)?;
    backend.ensure_layout(&root)?;

    let content = params.content.trim();
    if content.is_empty() {
        return Err(backend_error(
            "memory rollout summary requires non-empty content",
        ));
    }

    let summaries_dir = root.join(ROLLOUT_SUMMARIES_DIR);
    reject_symlink_chain(&root, &summaries_dir)?;
    let slug = sanitize_slug(if params.title.trim().is_empty() {
        params.source.as_str()
    } else {
        params.title.as_str()
    });
    let timestamp = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();
    let path = next_note_path(&summaries_dir, &timestamp, &slug);

    let summary_content = rollout_summary_markdown(&params, content);
    fs::write(&path, &summary_content).map_err(io_error)?;
    reject_symlink_chain(&root, &path)?;

    let relative = backend.relative_path(&root, &path)?;
    let end_line_number = summary_content.lines().count().max(1);
    Ok(MemoryStoreAddNoteResponse {
        path: relative.clone(),
        citation: MemoryStoreCitation {
            path: relative,
            start_line_number: 1,
            end_line_number,
        },
    })
}

fn rollout_summary_markdown(params: &RolloutSummaryWriteParams, content: &str) -> String {
    let title = params.title.trim();
    let source = params.source.trim();
    let exported_at = params.exported_at.trim();
    let mut markdown = String::new();
    markdown.push_str("# ");
    markdown.push_str(if title.is_empty() {
        "Rollout summary candidate"
    } else {
        title
    });
    markdown.push_str("\n\n");
    markdown.push_str(content);
    markdown.push_str("\n\n");
    markdown.push_str("## Candidate Metadata\n\n");
    markdown.push_str("- source: `");
    markdown.push_str(if source.is_empty() {
        "runtime-export"
    } else {
        source
    });
    markdown.push_str("`\n");
    if !exported_at.is_empty() {
        markdown.push_str("- exportedAt: `");
        markdown.push_str(exported_at);
        markdown.push_str("`\n");
    }
    markdown.push_str("- status: `candidate`\n\n");
    markdown
}
