use app_server_protocol::{
    ConversationImportFidelitySummary, ConversationImportPreviewEvent,
    ConversationImportPreviewMessage, ConversationImportPreviewSummary,
    ConversationImportSourceClient, ConversationImportSourceProvenance,
    ConversationImportSourceScanParams, ConversationImportSourceScanResponse,
    ConversationImportSourceStatus, ConversationImportSourceSummary,
    ConversationImportThreadPreviewParams, ConversationImportThreadPreviewResponse,
    ConversationImportThreadStatus, ImportedThreadSummary,
};
use chrono::{DateTime, SecondsFormat, Utc};
use lime_core::app_paths;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};

use crate::RuntimeCoreError;

mod dry_run;
pub(super) mod events;
mod media;
mod messages;
mod paths;
mod project_filter;
mod session_index;
mod state;

const DEFAULT_LIMIT: usize = 50;
const MAX_LIMIT: usize = 200;
const DEFAULT_PREVIEW_LIMIT: usize = 20;
pub(super) const MAX_PREVIEW_LIMIT: usize = 100;
pub(super) const MAX_PREVIEW_TEXT_BYTES: usize = 4_000;
pub(super) const USER_MESSAGE_BEGIN: &str = "## My request for Codex:";
const COMPRESSED_ROLLOUT_SUFFIX: &str = ".zst";
const ROLLOUT_SCAN_MAX_LINES: usize = 256;

pub(super) fn scan_source(
    params: ConversationImportSourceScanParams,
) -> Result<ConversationImportSourceScanResponse, RuntimeCoreError> {
    let source_root = resolve_home(params.source_root.as_deref()).ok_or_else(|| {
        RuntimeCoreError::Backend("unable to resolve source home directory".to_string())
    })?;
    let limit = params.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT);
    let cursor = parse_cursor(params.cursor.as_deref())?;
    let include_archived = params.include_archived.unwrap_or(false);
    let project_path = normalize_filter(params.project_path.as_deref());
    let query = normalize_filter(params.query.as_deref()).map(|value| value.to_lowercase());

    if !source_root.is_dir() {
        return Ok(ConversationImportSourceScanResponse {
            source: source_summary(
                ConversationImportSourceClient::Codex,
                ConversationImportSourceStatus::Missing,
                Some(&source_root),
                false,
                0,
                None,
                false,
                false,
                0,
                Some("source home directory does not exist".to_string()),
            ),
            threads: Vec::new(),
            next_cursor: None,
        });
    }

    let state_path = state::newest_state_db(&source_root);
    let mut state_db_readable = false;
    let mut threads = match state_path.as_deref() {
        Some(path) => match state::scan_state_db(path) {
            Ok(threads) => {
                state_db_readable = true;
                threads
            }
            Err(_) => Vec::new(),
        },
        None => Vec::new(),
    };

    threads.extend(session_index::scan(&source_root));
    threads.extend(discover_rollout_threads(&source_root));

    for thread in &mut threads {
        repair_thread_source_path(&source_root, thread);
    }
    let threads = deduplicate_import_threads(threads);
    let missing_source_project_matches = project_path
        .as_deref()
        .map(|project_path| {
            threads
                .iter()
                .filter(|thread| {
                    thread.source_path.is_none()
                        && thread_matches_project_path(thread, project_path)
                })
                .count()
        })
        .unwrap_or(0);

    let filtered = threads
        .into_iter()
        .filter(|thread| thread.source_path.is_some())
        .filter(|thread| include_archived || !thread.archived)
        .filter(|thread| match project_path.as_deref() {
            Some(project_path) => thread_matches_project_path(thread, project_path),
            None => true,
        })
        .filter(|thread| match query.as_deref() {
            Some(query) => {
                thread
                    .title
                    .as_deref()
                    .unwrap_or_default()
                    .to_lowercase()
                    .contains(query)
                    || thread.source_thread_id.to_lowercase().contains(query)
                    || thread
                        .cwd
                        .as_deref()
                        .unwrap_or_default()
                        .to_lowercase()
                        .contains(query)
            }
            None => true,
        })
        .collect::<Vec<_>>();

    let mut filtered = filtered;
    filtered.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| right.created_at.cmp(&left.created_at))
            .then_with(|| left.source_thread_id.cmp(&right.source_thread_id))
    });
    let total = filtered.len();
    let prompt_only_history_matches = if total == 0 {
        project_path
            .as_deref()
            .map(|project_path| count_history_mentions(&source_root, project_path))
            .unwrap_or(0)
    } else {
        0
    };
    let scan_message = empty_scan_message(
        total,
        missing_source_project_matches,
        prompt_only_history_matches,
    );
    let page = filtered
        .into_iter()
        .skip(cursor)
        .take(limit)
        .collect::<Vec<_>>();
    let next_cursor = (cursor + page.len() < total).then(|| (cursor + page.len()).to_string());

    Ok(ConversationImportSourceScanResponse {
        source: source_summary(
            ConversationImportSourceClient::Codex,
            ConversationImportSourceStatus::Ready,
            Some(&source_root),
            true,
            total,
            state_path.as_deref(),
            true,
            state_db_readable,
            paths::count_rollout_files(&source_root),
            scan_message,
        ),
        threads: page,
        next_cursor,
    })
}

fn discover_rollout_threads(source_root: &Path) -> Vec<ImportedThreadSummary> {
    paths::discover_rollout_paths(source_root)
        .into_iter()
        .filter_map(|(path, archived)| read_rollout_thread_summary(&path, archived).ok())
        .collect()
}

fn deduplicate_import_threads(threads: Vec<ImportedThreadSummary>) -> Vec<ImportedThreadSummary> {
    let mut seen = HashSet::new();
    threads
        .into_iter()
        .filter(|thread| {
            let key = if !thread.source_thread_id.trim().is_empty() {
                thread.source_thread_id.clone()
            } else {
                thread.source_path.clone().unwrap_or_default()
            };
            seen.insert(key)
        })
        .collect()
}

fn read_rollout_thread_summary(
    path: &Path,
    archived: bool,
) -> Result<ImportedThreadSummary, RuntimeCoreError> {
    let reader = open_rollout_reader(path)?;
    let mut thread = ImportedThreadSummary {
        source_client: ConversationImportSourceClient::Codex,
        source_thread_id: path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("unknown")
            .to_string(),
        source_path: Some(path_to_string(path)),
        source: Some("rollout".to_string()),
        archived,
        import_status: ConversationImportThreadStatus::NotImported,
        updated_at: file_modified_timestamp(path),
        ..Default::default()
    };
    let mut first_user_message = None;

    for line in BufReader::new(reader)
        .lines()
        .map_while(Result::ok)
        .take(ROLLOUT_SCAN_MAX_LINES)
    {
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if thread.created_at.is_none() {
            thread.created_at = value
                .get("timestamp")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
        }
        if thread.updated_at.is_none() {
            thread.updated_at = thread.created_at.clone();
        }

        match value.get("type").and_then(Value::as_str) {
            Some("session_meta") => apply_session_meta_to_thread(&mut thread, value.get("payload")),
            Some("event_msg") => {
                if first_user_message.is_none() {
                    first_user_message = value
                        .get("payload")
                        .and_then(event_msg_user_message)
                        .and_then(normalize_user_message_text);
                }
            }
            Some("response_item") => {
                if first_user_message.is_none() {
                    first_user_message = value
                        .get("payload")
                        .and_then(response_item_user_message)
                        .and_then(normalize_user_message_text);
                }
            }
            _ => {}
        }

        if thread.cwd.is_some() && first_user_message.is_some() {
            break;
        }
    }

    if let Some(first_user_message) = first_user_message {
        if thread.title.is_none() {
            thread.title = Some(first_user_message.clone());
        }
        let metadata = serde_json::json!({
            "firstUserMessage": first_user_message,
        });
        if let Some(object) = metadata.as_object().cloned() {
            state::merge_thread_metadata(&mut thread, object);
        }
    }

    Ok(thread)
}

fn event_msg_user_message(payload: &Value) -> Option<&str> {
    (payload.get("type").and_then(Value::as_str) == Some("user_message"))
        .then(|| payload.get("message").and_then(Value::as_str))
        .flatten()
}

fn response_item_user_message(payload: &Value) -> Option<String> {
    if payload.get("type").and_then(Value::as_str) != Some("message")
        || payload.get("role").and_then(Value::as_str) != Some("user")
    {
        return None;
    }
    let content = payload.get("content")?.as_array()?;
    let text = content
        .iter()
        .filter_map(|item| item.get("text").or_else(|| item.get("input_text")))
        .filter_map(Value::as_str)
        .collect::<Vec<_>>()
        .join("\n");
    (!text.trim().is_empty()).then_some(text)
}

fn normalize_user_message_text(value: impl AsRef<str>) -> Option<String> {
    let trimmed = value.as_ref().trim();
    let normalized = trimmed
        .strip_prefix(USER_MESSAGE_BEGIN)
        .unwrap_or(trimmed)
        .trim();
    (!normalized.is_empty()).then(|| normalized.to_string())
}

fn file_modified_timestamp(path: &Path) -> Option<String> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(DateTime::<Utc>::from(modified).to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn count_history_mentions(source_root: &Path, project_path: &str) -> usize {
    let Ok(file) = fs::File::open(source_root.join("history.jsonl")) else {
        return 0;
    };
    BufReader::new(file)
        .lines()
        .map_while(Result::ok)
        .filter(|line| project_filter::mentions(line, project_path))
        .count()
}

fn empty_scan_message(
    importable_count: usize,
    missing_source_project_matches: usize,
    prompt_only_history_matches: usize,
) -> Option<String> {
    if importable_count > 0 {
        return None;
    }

    match (
        missing_source_project_matches > 0,
        prompt_only_history_matches > 0,
    ) {
        (true, true) => Some(format!(
            "Found {missing_source_project_matches} matching Codex index records and {prompt_only_history_matches} prompt-only history entries, but no complete rollout files are available to import. Conversation import requires stored rollout files."
        )),
        (true, false) => Some(format!(
            "Found {missing_source_project_matches} matching Codex index records, but their rollout files are missing. Conversation import requires stored rollout files."
        )),
        (false, true) => Some(format!(
            "Found {prompt_only_history_matches} prompt-only history entries, but no complete rollout files are available to import. Conversation import requires stored rollout files."
        )),
        (false, false) => None,
    }
}

pub(super) fn preview_thread(
    params: ConversationImportThreadPreviewParams,
) -> Result<ConversationImportThreadPreviewResponse, RuntimeCoreError> {
    let source_root = resolve_home(params.source_root.as_deref()).ok_or_else(|| {
        RuntimeCoreError::Backend("unable to resolve source home directory".to_string())
    })?;
    if !source_root.is_dir() {
        return Err(RuntimeCoreError::Backend(
            "source home directory does not exist".to_string(),
        ));
    }

    let (source_path, indexed_thread) = match normalize_filter(params.source_path.as_deref()) {
        Some(path) => (
            paths::resolve_user_supplied_rollout_path(&source_root, &path).ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "source path must be a Codex rollout JSONL file inside source root".to_string(),
                )
            })?,
            None,
        ),
        None => {
            let thread_id =
                normalize_filter(params.source_thread_id.as_deref()).ok_or_else(|| {
                    RuntimeCoreError::Backend(
                        "conversation import preview requires sourceThreadId or sourcePath"
                            .to_string(),
                    )
                })?;
            let thread = find_thread(&source_root, &thread_id).ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "unable to resolve source rollout path for thread".to_string(),
                )
            })?;
            let path = thread
                .source_path
                .as_deref()
                .and_then(|value| paths::resolve_existing_source_path(&source_root, Some(value)))
                .ok_or_else(|| {
                    RuntimeCoreError::Backend(
                        "unable to resolve source rollout path for thread".to_string(),
                    )
                })?;
            (path, Some(thread))
        }
    };

    let mut preview = parse_rollout(
        &source_path,
        CodexRolloutParseMode::Preview {
            limit: params.limit.unwrap_or(DEFAULT_PREVIEW_LIMIT),
        },
    )?;
    if let Some(indexed_thread) = indexed_thread {
        merge_indexed_thread_metadata(&mut preview.thread, indexed_thread);
    }
    preview.thread.source_path = Some(path_to_string(&source_path));
    let state_path = state::newest_state_db(&source_root);
    let state_db_readable = state_path
        .as_deref()
        .is_some_and(|path| state::scan_state_db(path).is_ok());
    Ok(ConversationImportThreadPreviewResponse {
        source: source_summary(
            ConversationImportSourceClient::Codex,
            ConversationImportSourceStatus::Ready,
            Some(&source_root),
            true,
            1,
            state_path.as_deref(),
            true,
            state_db_readable,
            paths::count_rollout_files(&source_root),
            Some(
                "Preview is read-only. Import commit still requires user confirmation.".to_string(),
            ),
        ),
        thread: preview.thread,
        summary: preview.summary,
        messages: preview.messages,
        events: preview.events,
    })
}

pub(super) struct CodexRolloutPreview {
    pub(super) thread: ImportedThreadSummary,
    pub(super) summary: ConversationImportPreviewSummary,
    pub(super) messages: Vec<ConversationImportPreviewMessage>,
    pub(super) events: Vec<ConversationImportPreviewEvent>,
    pub(super) timeline: Vec<ImportedTimelineItem>,
}

pub(super) fn parse_rollout_for_import(
    path: &Path,
) -> Result<CodexRolloutPreview, RuntimeCoreError> {
    parse_rollout(path, CodexRolloutParseMode::Import)
}

pub(super) fn resolve_user_supplied_rollout_path(
    source_root: &Path,
    source_path: &str,
) -> Option<PathBuf> {
    paths::resolve_user_supplied_rollout_path(source_root, source_path)
}

pub(super) fn resolve_existing_source_path(
    source_root: &Path,
    source_path: Option<&str>,
) -> Option<PathBuf> {
    paths::resolve_existing_source_path(source_root, source_path)
}

pub(super) enum CodexRolloutParseMode {
    Preview { limit: usize },
    Import,
}

fn parse_rollout(
    path: &Path,
    mode: CodexRolloutParseMode,
) -> Result<CodexRolloutPreview, RuntimeCoreError> {
    let limit = match mode {
        CodexRolloutParseMode::Preview { limit } => limit.clamp(1, MAX_PREVIEW_LIMIT),
        CodexRolloutParseMode::Import => usize::MAX,
    };
    let reader = open_rollout_reader(path)?;

    let mut thread = ImportedThreadSummary {
        source_client: ConversationImportSourceClient::Codex,
        source_thread_id: path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("unknown")
            .to_string(),
        source_path: Some(path_to_string(path)),
        import_status: ConversationImportThreadStatus::NotImported,
        ..Default::default()
    };
    let mut summary = ConversationImportPreviewSummary::default();
    let mut messages = Vec::new();
    let mut events = Vec::new();
    let mut timeline = Vec::new();

    for (line_index, line) in BufReader::new(reader)
        .lines()
        .map_while(Result::ok)
        .enumerate()
    {
        summary.line_count += 1;
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            summary.unsupported_count += 1;
            summary.fidelity.unsupported += 1;
            continue;
        };
        let timestamp = value
            .get("timestamp")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
        let source_event_type = value.get("type").and_then(Value::as_str);
        let source_event_seq = line_index + 1;
        let provenance =
            events::source_provenance(source_event_type, source_event_seq, value.get("payload"));
        match source_event_type {
            Some("session_meta") => apply_session_meta_to_thread(&mut thread, value.get("payload")),
            Some("response_item") => {
                if let Some(message) = messages::response_item_preview_message(
                    value.get("payload"),
                    timestamp,
                    &mode,
                    Some(provenance.clone()),
                ) {
                    let timeline_message = message.clone();
                    if messages::push_preview_message(&mut messages, message, limit) {
                        summary.truncated = true;
                    }
                    messages::push_timeline_message(&mut timeline, timeline_message);
                } else {
                    let runtime_events = events::response_item_runtime_events(
                        value.get("payload"),
                        Some(&provenance),
                    );
                    record_response_item_fidelity(
                        &mut summary.fidelity,
                        value.get("payload"),
                        runtime_events.len(),
                    );
                    if runtime_events.is_empty() {
                        summary.unsupported_count += 1;
                        summary.fidelity.unsupported += 1;
                        summary.fidelity.provenance_only += 1;
                    } else {
                        timeline.extend(
                            runtime_events
                                .into_iter()
                                .map(ImportedTimelineItem::RuntimeEvent),
                        );
                    }
                }
            }
            Some("event_msg") => {
                summary.rollout_event_items += 1;
                if let Some(message) = messages::event_msg_preview_message(
                    value.get("payload"),
                    timestamp.clone(),
                    &mode,
                    Some(provenance.clone()),
                ) {
                    if thread.title.is_none() && message.role == "user" {
                        thread.title =
                            Some(messages::truncate_preview_text(&message.text, 80).text);
                    }
                    let timeline_message = message.clone();
                    if messages::push_preview_message(&mut messages, message, limit) {
                        summary.truncated = true;
                    }
                    messages::push_timeline_message(&mut timeline, timeline_message);
                } else {
                    let runtime_events =
                        events::event_msg_runtime_events(value.get("payload"), Some(&provenance));
                    record_event_msg_fidelity(
                        &mut summary.fidelity,
                        value.get("payload"),
                        runtime_events.len(),
                    );
                    if runtime_events.is_empty()
                        && value
                            .get("payload")
                            .and_then(|payload| payload.get("type"))
                            .and_then(Value::as_str)
                            == Some("item_completed")
                    {
                        summary.unsupported_count += 1;
                        summary.fidelity.unsupported += 1;
                        summary.fidelity.provenance_only += 1;
                    }
                    timeline.extend(
                        runtime_events
                            .into_iter()
                            .map(ImportedTimelineItem::RuntimeEvent),
                    );
                }
                if events.len() >= limit {
                    summary.truncated = true;
                } else if let Some(event) =
                    messages::event_preview(value.get("payload"), timestamp, Some(provenance))
                {
                    events.push(event);
                }
            }
            Some("compacted") | Some("turn_context") | Some("inter_agent_communication") => {
                summary.unsupported_count += 1;
                summary.fidelity.unsupported += 1;
                summary.fidelity.provenance_only += 1;
            }
            _ => {
                summary.unsupported_count += 1;
                summary.fidelity.unsupported += 1;
                summary.fidelity.provenance_only += 1;
            }
        }
    }

    enrich_preview_provenance(
        &mut messages,
        &mut events,
        &mut timeline,
        &thread.source_thread_id,
        Some(path_to_string(path)),
    );
    dry_run::apply_summary(&mut summary, &timeline);
    if summary.unsupported_count > 0 {
        summary
            .warnings
            .push("Some source rollout items are counted but not shown in preview.".to_string());
    }
    Ok(CodexRolloutPreview {
        thread,
        summary,
        messages,
        events,
        timeline,
    })
}

#[derive(Debug, Clone)]
pub(super) enum ImportedTimelineItem {
    Message(ConversationImportPreviewMessage),
    RuntimeEvent(events::ImportedRuntimeEvent),
}

pub(super) fn find_thread(source_root: &Path, thread_id: &str) -> Option<ImportedThreadSummary> {
    let state_threads = state::newest_state_db(source_root)
        .and_then(|state_path| state::scan_state_db(&state_path).ok())
        .unwrap_or_default();
    state_threads
        .into_iter()
        .chain(session_index::scan(source_root))
        .filter(|thread| thread.source_thread_id == thread_id)
        .find_map(|mut thread| {
            repair_thread_source_path(source_root, &mut thread).then_some(thread)
        })
}

fn repair_thread_source_path(source_root: &Path, thread: &mut ImportedThreadSummary) -> bool {
    if let Some(path) =
        paths::resolve_existing_source_path(source_root, thread.source_path.as_deref())
    {
        thread.source_path = Some(path_to_string(&path));
        return true;
    }

    if let Some(path) = paths::find_rollout_path_by_thread_id(
        source_root,
        &thread.source_thread_id,
        thread.archived,
    ) {
        thread.source_path = Some(path_to_string(&path));
        return true;
    }

    thread.source_path = None;
    false
}

fn thread_matches_project_path(thread: &ImportedThreadSummary, project_path: &str) -> bool {
    if thread
        .cwd
        .as_deref()
        .is_some_and(|cwd| project_filter::matches(cwd, project_path))
    {
        return true;
    }

    [
        thread.title.as_deref(),
        thread
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("firstUserMessage"))
            .and_then(Value::as_str),
        thread
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("preview"))
            .and_then(Value::as_str),
    ]
    .into_iter()
    .flatten()
    .any(|value| project_filter::mentions(value, project_path))
}

pub(super) fn merge_indexed_thread_metadata(
    thread: &mut ImportedThreadSummary,
    indexed: ImportedThreadSummary,
) {
    thread.source_thread_id = indexed.source_thread_id;
    thread.title = indexed.title.or_else(|| thread.title.clone());
    thread.created_at = indexed.created_at.or_else(|| thread.created_at.clone());
    thread.updated_at = indexed.updated_at.or_else(|| thread.updated_at.clone());
    thread.cwd = indexed.cwd.or_else(|| thread.cwd.clone());
    thread.source = indexed.source.or_else(|| thread.source.clone());
    thread.model_provider = indexed
        .model_provider
        .or_else(|| thread.model_provider.clone());
    thread.archived = indexed.archived;
    thread.import_status = indexed.import_status;
    if let Some(metadata) = indexed
        .metadata
        .and_then(|metadata| metadata.as_object().cloned())
    {
        state::merge_thread_metadata(thread, metadata);
    }
}

fn open_rollout_reader(path: &Path) -> Result<Box<dyn Read>, RuntimeCoreError> {
    let file = fs::File::open(path).map_err(|err| {
        RuntimeCoreError::Backend(format!(
            "unable to read source rollout file {}: {err}",
            path.display()
        ))
    })?;
    if path_to_string(path).ends_with(COMPRESSED_ROLLOUT_SUFFIX) {
        let decoder = zstd::stream::read::Decoder::new(file).map_err(|err| {
            RuntimeCoreError::Backend(format!(
                "unable to decode compressed source rollout file {}: {err}",
                path.display()
            ))
        })?;
        return Ok(Box::new(decoder));
    }
    Ok(Box::new(file))
}

fn apply_session_meta_to_thread(thread: &mut ImportedThreadSummary, payload: Option<&Value>) {
    let Some(payload) = payload else {
        return;
    };
    let meta = payload.get("meta").unwrap_or(payload);
    if let Some(id) = meta.get("id").and_then(Value::as_str) {
        thread.source_thread_id = id.to_string();
    }
    if thread.created_at.is_none() {
        thread.created_at = meta
            .get("timestamp")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned);
    }
    if thread.updated_at.is_none() {
        thread.updated_at = thread.created_at.clone();
    }
    thread.cwd = meta
        .get("cwd")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| thread.cwd.clone());
    thread.source = meta
        .get("source")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| thread.source.clone());
    thread.model_provider = meta
        .get("model_provider")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| thread.model_provider.clone());
    let metadata = state::codex_thread_metadata_from_session_meta(meta);
    if !metadata.is_empty() {
        state::merge_thread_metadata(thread, metadata);
    }
}

fn enrich_preview_provenance(
    messages: &mut [ConversationImportPreviewMessage],
    events: &mut [ConversationImportPreviewEvent],
    timeline: &mut [ImportedTimelineItem],
    source_thread_id: &str,
    source_path: Option<String>,
) {
    for message in messages {
        if let Some(provenance) = message.provenance.take() {
            message.provenance = Some(events::enrich_source_provenance(
                provenance,
                Some(source_thread_id),
                source_path.as_deref(),
            ));
        }
    }
    for event in events {
        if let Some(provenance) = event.provenance.take() {
            event.provenance = Some(events::enrich_source_provenance(
                provenance,
                Some(source_thread_id),
                source_path.as_deref(),
            ));
        }
    }
    for item in timeline {
        match item {
            ImportedTimelineItem::Message(message) => {
                if let Some(provenance) = message.provenance.take() {
                    message.provenance = Some(events::enrich_source_provenance(
                        provenance,
                        Some(source_thread_id),
                        source_path.as_deref(),
                    ));
                }
            }
            ImportedTimelineItem::RuntimeEvent(event) => {
                enrich_runtime_event_provenance(event, source_thread_id, source_path.as_deref());
            }
        }
    }
}

fn enrich_runtime_event_provenance(
    event: &mut events::ImportedRuntimeEvent,
    source_thread_id: &str,
    source_path: Option<&str>,
) {
    let Some(Value::Object(object)) = event.source_provenance_value().cloned() else {
        return;
    };
    let Ok(provenance) =
        serde_json::from_value::<ConversationImportSourceProvenance>(Value::Object(object))
    else {
        return;
    };
    let provenance =
        events::enrich_source_provenance(provenance, Some(source_thread_id), source_path);
    if let Some(value) = events::source_provenance_value(&provenance) {
        event.set_source_provenance(value);
    }
}

fn record_response_item_fidelity(
    fidelity: &mut ConversationImportFidelitySummary,
    payload: Option<&Value>,
    mapped_runtime_events: usize,
) {
    let Some(payload) = payload else {
        return;
    };
    match payload.get("type").and_then(Value::as_str) {
        Some("reasoning") => fidelity.reasoning += 1,
        Some("function_call")
        | Some("function_call_output")
        | Some("custom_tool_call")
        | Some("custom_tool_call_output")
        | Some("tool_search_call")
        | Some("tool_search_output") => {
            if mapped_runtime_events > 0 {
                fidelity.tools += 1;
            }
            if tool_name_from_payload(payload).as_deref() == Some("exec_command") {
                fidelity.commands += 1;
            }
        }
        Some("web_search_call") => {
            if mapped_runtime_events > 0 {
                fidelity.web_search += 1;
                fidelity.tools += 1;
            }
        }
        _ => {}
    }
}

fn record_event_msg_fidelity(
    fidelity: &mut ConversationImportFidelitySummary,
    payload: Option<&Value>,
    mapped_runtime_events: usize,
) {
    let Some(payload) = payload else {
        return;
    };
    match payload.get("type").and_then(Value::as_str) {
        Some("patch_apply_end") => fidelity.patches += 1,
        Some("mcp_tool_call_begin" | "mcp_tool_call_end") => {
            fidelity.mcp += 1;
            if mapped_runtime_events > 0 {
                fidelity.tools += 1;
            }
        }
        Some("dynamic_tool_call_request" | "dynamic_tool_call_response")
        | Some("view_image_tool_call" | "image_generation_begin" | "image_generation_end")
        | Some(
            "collab_agent_spawn_begin"
            | "collab_agent_spawn_end"
            | "collab_agent_interaction_begin"
            | "collab_agent_interaction_end"
            | "collab_waiting_begin"
            | "collab_waiting_end"
            | "collab_close_begin"
            | "collab_close_end"
            | "collab_resume_begin"
            | "collab_resume_end",
        ) => {
            if mapped_runtime_events > 0 {
                fidelity.tools += 1;
            }
        }
        Some("hook_prompt" | "entered_review_mode") => {
            if mapped_runtime_events > 0 {
                fidelity.reasoning += 1;
            }
        }
        Some("context_compacted" | "sub_agent_activity" | "subagent_activity")
        | Some("exited_review_mode") => {}
        Some("web_search_end") => {
            fidelity.web_search += 1;
            if mapped_runtime_events > 0 {
                fidelity.tools += 1;
            }
        }
        Some("exec_approval_request") | Some("apply_patch_approval_request") => {
            fidelity.approvals += 1;
        }
        Some("item_completed") => {
            let item_type = payload
                .get("item")
                .and_then(|item| item.get("type"))
                .and_then(Value::as_str);
            if mapped_runtime_events > 0 {
                match item_type {
                    Some("CommandExecution") => {
                        fidelity.commands += 1;
                        fidelity.tools += 1;
                    }
                    Some("McpToolCall") => {
                        fidelity.mcp += 1;
                        fidelity.tools += 1;
                    }
                    Some(
                        "DynamicToolCall"
                        | "CollabAgentToolCall"
                        | "ImageView"
                        | "ImageGeneration"
                        | "Sleep",
                    ) => fidelity.tools += 1,
                    Some("WebSearch") => {
                        fidelity.web_search += 1;
                        fidelity.tools += 1;
                    }
                    _ => {}
                }
            }
        }
        _ => {}
    }
}

fn tool_name_from_payload(payload: &Value) -> Option<String> {
    payload
        .get("name")
        .and_then(Value::as_str)
        .or_else(|| payload.get("tool").and_then(Value::as_str))
        .or_else(|| payload.get("tool_name").and_then(Value::as_str))
        .or_else(|| payload.get("toolName").and_then(Value::as_str))
        .map(str::to_string)
}

pub(super) fn source_summary(
    source_client: ConversationImportSourceClient,
    status: ConversationImportSourceStatus,
    source_root: Option<&Path>,
    readable: bool,
    thread_count: usize,
    state_path: Option<&Path>,
    source_home_exists: bool,
    state_db_readable: bool,
    rollout_file_count: usize,
    message: Option<String>,
) -> ConversationImportSourceSummary {
    ConversationImportSourceSummary {
        source_client,
        status,
        source_root: source_root.map(path_to_string),
        readable,
        thread_count,
        source_home_exists,
        state_db_readable,
        rollout_file_count,
        indexed_at: Some(now_timestamp()),
        state_path: state_path.map(path_to_string),
        message,
    }
}

pub(super) fn resolve_home(explicit_root: Option<&str>) -> Option<PathBuf> {
    if let Some(root) = normalize_filter(explicit_root) {
        return Some(PathBuf::from(root));
    }
    app_paths::resolve_codex_home_dir()
}

pub(super) fn newest_state_db(source_root: &Path) -> Option<PathBuf> {
    state::newest_state_db(source_root)
}

fn parse_cursor(cursor: Option<&str>) -> Result<usize, RuntimeCoreError> {
    match normalize_filter(cursor) {
        Some(cursor) => cursor.parse::<usize>().map_err(|_| {
            RuntimeCoreError::Backend("conversation import cursor must be a number".to_string())
        }),
        None => Ok(0),
    }
}

pub(super) fn normalize_filter(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub(super) fn now_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub(super) fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}
