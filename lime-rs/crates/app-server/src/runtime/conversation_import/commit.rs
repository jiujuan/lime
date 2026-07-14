use super::codex::{self, events::ImportedRuntimeEvent, ImportedTimelineItem};
use super::commit_events::{
    enrich_imported_runtime_event_payload, lower_imported_runtime_events_for_commit,
    materialize_imported_runtime_events_for_default_projection, ImportedRuntimeEventNormalizer,
    ImportedRuntimeEventProjectionSelector, ImportedRuntimeEventProjectionSummary,
};
use super::import_status;
use super::provenance::{self, ImportProvenance};
use crate::runtime::{new_id, timestamp};
use crate::{RuntimeCore, RuntimeCoreError, RuntimeEvent, SidecarWriteRequest};
use app_server_protocol::{
    AgentAttachment, AgentInput, AgentSessionStartParams, AgentSessionStatus, AgentTurn,
    AgentTurnStatus, BusinessObjectRef, ConversationImportSourceClient,
    ConversationImportSourceProvenance, ConversationImportThreadCommitParams,
    ConversationImportThreadCommitResponse, ConversationImportThreadStatus,
};
use serde_json::json;

const DEFAULT_IMPORT_APP_ID: &str = "content-studio";

pub(super) fn commit_conversation_import_thread(
    core: &RuntimeCore,
    params: ConversationImportThreadCommitParams,
) -> Result<ConversationImportThreadCommitResponse, RuntimeCoreError> {
    if !params.confirmed {
        return Err(RuntimeCoreError::Backend(
            "conversation import commit requires explicit user confirmation".to_string(),
        ));
    }

    match params
        .source_client
        .unwrap_or(ConversationImportSourceClient::Codex)
    {
        ConversationImportSourceClient::Codex => commit_codex_thread(core, params),
        ConversationImportSourceClient::ClaudeCode => Err(RuntimeCoreError::Backend(
            "Claude Code conversation import commit is not implemented in this milestone."
                .to_string(),
        )),
    }
}

fn commit_codex_thread(
    core: &RuntimeCore,
    params: ConversationImportThreadCommitParams,
) -> Result<ConversationImportThreadCommitResponse, RuntimeCoreError> {
    let source_root = codex::resolve_home(params.source_root.as_deref()).ok_or_else(|| {
        RuntimeCoreError::Backend("unable to resolve source home directory".to_string())
    })?;
    if !source_root.is_dir() {
        return Err(RuntimeCoreError::Backend(
            "source home directory does not exist".to_string(),
        ));
    }

    let (source_path, indexed_thread) = resolve_source_path(&source_root, &params)?;
    let mut preview = codex::parse_rollout_for_import(&source_path)?;
    if let Some(indexed_thread) = indexed_thread {
        codex::merge_indexed_thread_metadata(&mut preview.thread, indexed_thread);
    }
    preview.thread.source_path = Some(codex::path_to_string(&source_path));
    preview.thread.import_status = ConversationImportThreadStatus::Imported;

    let turns = imported_turns(&preview.timeline);
    if turns.is_empty() {
        return Err(RuntimeCoreError::Backend(
            "source rollout does not contain importable user messages".to_string(),
        ));
    }
    if let Some(session) = import_status::imported_session_for_thread(
        core,
        ConversationImportSourceClient::Codex,
        &preview.thread.source_thread_id,
    ) {
        if params.replace_existing.unwrap_or(false) {
            clear_existing_imported_session(core, &session.session_id)?;
        } else {
            preview.thread.import_status = ConversationImportThreadStatus::Imported;
            preview.summary.dry_run.will_create_session = false;
            preview.summary.dry_run.will_append_to_existing_session = true;
            let warnings = preview.summary.warnings.clone();
            return Ok(ConversationImportThreadCommitResponse {
                session,
                thread: preview.thread,
                imported_messages: preview.summary.dry_run.will_import_messages,
                imported_turns: preview.summary.dry_run.will_import_turns,
                summary: preview.summary,
                can_continue: true,
                warnings,
            });
        }
    }
    preview.summary.fidelity.budget_dropped = 0;

    let provenance = ImportProvenance::for_thread(
        &preview.thread,
        &source_root,
        &source_path,
        &preview.summary.fidelity,
    );

    let session = core
        .start_session(AgentSessionStartParams {
            session_id: None,
            thread_id: None,
            app_id: params
                .app_id
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| DEFAULT_IMPORT_APP_ID.to_string()),
            workspace_id: params.workspace_id.filter(|value| !value.trim().is_empty()),
            business_object_ref: Some(import_business_object_ref(
                preview.thread.source_thread_id.as_str(),
                preview.thread.title.as_deref(),
                &source_root,
                &source_path,
                &preview.thread,
                &preview.summary.fidelity,
            )),
            locale: None,
        })?
        .session;

    let mut projection_selector = ImportedRuntimeEventProjectionSelector::default();
    let prepared_turns = prepare_imported_turns(turns, &mut projection_selector)?;
    let projection_summary = summarize_prepared_turns(&prepared_turns);
    let sidecar_ref =
        persist_imported_runtime_event_sidecar(core, &session.session_id, &prepared_turns)?;
    attach_import_projection_metadata(
        core,
        &session.session_id,
        &projection_summary,
        sidecar_ref.as_ref(),
    )?;

    let imported_turns =
        append_imported_turns(core, &session.session_id, prepared_turns, &provenance)?;
    let imported_messages = preview.summary.dry_run.will_import_messages;
    let warnings = provenance::commit_warnings(
        &preview.summary.warnings,
        preview.summary.unsupported_count,
        preview.summary.rollout_event_items,
    );

    let (mut session, _) = core.session_snapshot(&session.session_id)?;
    session.status = AgentSessionStatus::Completed;

    Ok(ConversationImportThreadCommitResponse {
        session,
        thread: preview.thread,
        summary: preview.summary,
        imported_messages,
        imported_turns,
        can_continue: true,
        warnings,
    })
}

fn clear_existing_imported_session(
    core: &RuntimeCore,
    session_id: &str,
) -> Result<(), RuntimeCoreError> {
    let mut state = core
        .state
        .lock()
        .expect("runtime core state mutex poisoned");
    if let Some(projection_store) = core.projection_store.as_ref() {
        projection_store
            .delete_session_data(session_id)
            .map_err(RuntimeCoreError::Backend)?;
    }
    super::super::approval_cache::remove_session(&mut state.session_approval_cache, session_id);
    state.sessions.remove(session_id);
    drop(state);
    if let Some(event_log_writer) = core.event_log_writer.as_ref() {
        event_log_writer
            .clear_session(session_id)
            .map_err(RuntimeCoreError::Backend)?;
    }
    if let Some(sidecar_store) = core.sidecar_store.as_ref() {
        sidecar_store
            .clear_session(session_id)
            .map_err(RuntimeCoreError::Backend)?;
    }
    Ok(())
}

fn resolve_source_path(
    source_root: &std::path::Path,
    params: &ConversationImportThreadCommitParams,
) -> Result<
    (
        std::path::PathBuf,
        Option<app_server_protocol::ImportedThreadSummary>,
    ),
    RuntimeCoreError,
> {
    let (source_path, indexed_thread) = match codex::normalize_filter(params.source_path.as_deref())
    {
        Some(path) => (
            codex::resolve_user_supplied_rollout_path(source_root, &path).ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "source path must be a Codex rollout JSONL file inside source root".to_string(),
                )
            })?,
            None,
        ),
        None => {
            let thread_id = codex::normalize_filter(params.source_thread_id.as_deref())
                .ok_or_else(|| {
                    RuntimeCoreError::Backend(
                        "conversation import commit requires sourceThreadId or sourcePath"
                            .to_string(),
                    )
                })?;
            let thread = codex::find_thread(source_root, &thread_id).ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "unable to resolve source rollout path for thread".to_string(),
                )
            })?;
            let path = thread
                .source_path
                .as_deref()
                .and_then(|value| codex::resolve_existing_source_path(source_root, Some(value)))
                .ok_or_else(|| {
                    RuntimeCoreError::Backend(
                        "unable to resolve source rollout path for thread".to_string(),
                    )
                })?;
            (path, Some(thread))
        }
    };
    Ok((source_path, indexed_thread))
}

struct ImportedTurn {
    user_text: String,
    user_attachments: Vec<AgentAttachment>,
    user_timestamp: Option<String>,
    user_provenance: Option<app_server_protocol::ConversationImportSourceProvenance>,
    events: Vec<ImportedTurnEvent>,
}

struct PreparedImportedTurn {
    user_text: String,
    user_attachments: Vec<AgentAttachment>,
    user_timestamp: Option<String>,
    user_provenance: Option<app_server_protocol::ConversationImportSourceProvenance>,
    user_message: ImportedRuntimeEvent,
    source_events: Vec<ImportedRuntimeEvent>,
    materialized_events: Vec<ImportedRuntimeEvent>,
    projection_summary: ImportedRuntimeEventProjectionSummary,
}

enum ImportedTurnEvent {
    AssistantMessage(ImportedAssistantMessage),
    Runtime(ImportedRuntimeEvent),
}

struct ImportedAssistantMessage {
    text: String,
    provenance: Option<app_server_protocol::ConversationImportSourceProvenance>,
}

fn imported_turns(timeline: &[ImportedTimelineItem]) -> Vec<ImportedTurn> {
    let mut turns = Vec::new();
    let mut pending_user: Option<(
        String,
        Vec<AgentAttachment>,
        Option<String>,
        Option<String>,
        Option<app_server_protocol::ConversationImportSourceProvenance>,
    )> = None;
    let mut pending_events = Vec::new();
    let mut leading_runtime_events = Vec::new();

    for item in timeline {
        match item {
            ImportedTimelineItem::Message(message) => match message.role.as_str() {
                "user" => {
                    if pending_user.as_mut().is_some_and(
                        |(text, attachments, source_type, timestamp, provenance)| {
                            if text.trim() != message.text.trim()
                                || !is_duplicate_source_user_message(
                                    source_type.as_deref(),
                                    message.source_type.as_deref(),
                                )
                            {
                                return false;
                            }
                            for attachment in &message.attachments {
                                let already_present = attachments.iter().any(|existing| {
                                    existing.kind == attachment.kind
                                        && existing.uri == attachment.uri
                                });
                                if !already_present {
                                    attachments.push(attachment.clone());
                                }
                            }
                            if timestamp.is_none() {
                                *timestamp = message.timestamp.clone();
                            }
                            if provenance.is_none() {
                                *provenance = message.provenance.clone();
                            }
                            true
                        },
                    ) {
                        continue;
                    }
                    flush_imported_turn(&mut turns, &mut pending_user, &mut pending_events);
                    pending_user = Some((
                        message.text.clone(),
                        message.attachments.clone(),
                        message.source_type.clone(),
                        message.timestamp.clone(),
                        message.provenance.clone(),
                    ));
                    pending_events.extend(
                        leading_runtime_events
                            .drain(..)
                            .map(ImportedTurnEvent::Runtime),
                    );
                }
                "assistant" => {
                    if pending_user.is_some() {
                        let text = message.text.trim();
                        if !text.is_empty() {
                            pending_events.push(ImportedTurnEvent::AssistantMessage(
                                ImportedAssistantMessage {
                                    text: text.to_string(),
                                    provenance: message.provenance.clone(),
                                },
                            ));
                        }
                    }
                }
                _ => {}
            },
            ImportedTimelineItem::RuntimeEvent(event) => {
                if pending_user.is_some() {
                    pending_events.push(ImportedTurnEvent::Runtime(event.clone()));
                } else {
                    leading_runtime_events.push(event.clone());
                }
            }
        }
    }
    flush_imported_turn(&mut turns, &mut pending_user, &mut pending_events);
    turns
}

fn flush_imported_turn(
    turns: &mut Vec<ImportedTurn>,
    pending_user: &mut Option<(
        String,
        Vec<AgentAttachment>,
        Option<String>,
        Option<String>,
        Option<app_server_protocol::ConversationImportSourceProvenance>,
    )>,
    pending_events: &mut Vec<ImportedTurnEvent>,
) {
    let Some((user_text, user_attachments, _source_type, user_timestamp, user_provenance)) =
        pending_user.take()
    else {
        pending_events.clear();
        return;
    };
    turns.push(ImportedTurn {
        user_text,
        user_attachments,
        user_timestamp,
        user_provenance,
        events: std::mem::take(pending_events),
    });
}

fn is_duplicate_source_user_message(existing: Option<&str>, candidate: Option<&str>) -> bool {
    matches!(
        (existing, candidate),
        (Some("event_msg"), Some("response_item")) | (Some("response_item"), Some("event_msg"))
    )
}

fn append_imported_turns(
    core: &RuntimeCore,
    session_id: &str,
    turns: Vec<PreparedImportedTurn>,
    provenance: &ImportProvenance,
) -> Result<usize, RuntimeCoreError> {
    let (session, _) = core.session_snapshot(session_id)?;
    let thread_id = session.thread_id.clone();
    let mut imported = 0;

    for imported_turn in turns {
        let turn_id = new_id("turn");
        let started_at = imported_turn
            .user_timestamp
            .clone()
            .unwrap_or_else(timestamp);
        {
            let mut state = core
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get_mut(session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
            let turn = AgentTurn {
                turn_id: turn_id.clone(),
                session_id: session_id.to_string(),
                thread_id: thread_id.clone(),
                status: AgentTurnStatus::Running,
                started_at: Some(started_at.clone()),
                completed_at: None,
            };
            stored.session.status = AgentSessionStatus::Running;
            stored.session.updated_at = started_at;
            stored.turn_inputs.insert(
                turn_id.clone(),
                AgentInput {
                    text: imported_turn.user_text,
                    attachments: imported_turn.user_attachments,
                },
            );
            stored.turn_runtime_options.insert(
                turn_id.clone(),
                provenance.turn_runtime_options(imported_turn.user_provenance.as_ref()),
            );
            stored.turns.push(turn);
        }

        let mut materialized_source_events =
            Vec::with_capacity(imported_turn.materialized_events.len() + 1);
        materialized_source_events.push(imported_turn.user_message);
        materialized_source_events.extend(imported_turn.materialized_events);
        let materialized_events = lower_imported_runtime_events_for_commit(
            &materialized_source_events,
            session_id,
            &thread_id,
            &turn_id,
        );
        let events: Vec<RuntimeEvent> = materialized_events
            .into_iter()
            .map(|event| {
                let (event_type, payload) = event
                    .into_runtime()
                    .expect("commit lowering must remove source-local imported tool drafts");
                RuntimeEvent::new(event_type, enrich_imported_runtime_event_payload(payload))
            })
            .collect();
        core.append_runtime_events(session_id, &thread_id, Some(&turn_id), events)?;
        imported += 1;
    }

    Ok(imported)
}

fn prepare_imported_turns(
    turns: Vec<ImportedTurn>,
    projection_selector: &mut ImportedRuntimeEventProjectionSelector,
) -> Result<Vec<PreparedImportedTurn>, RuntimeCoreError> {
    turns
        .into_iter()
        .map(|turn| {
            let user_message = imported_message_draft(
                "user",
                &turn.user_text,
                &turn.user_attachments,
                turn.user_provenance.as_ref(),
            )?;
            let (mut source_events, has_terminal_event) =
                normalize_imported_turn_events(turn.events)?;
            if !has_terminal_event {
                source_events.push(ImportedRuntimeEvent::new(
                    "turn.completed",
                    json!({
                        "imported": true,
                        "sourceClient": "codex",
                    }),
                ));
            }
            let (materialized_events, projection_summary) =
                materialize_imported_runtime_events_for_default_projection(
                    &source_events,
                    projection_selector,
                );
            Ok(PreparedImportedTurn {
                user_text: turn.user_text,
                user_attachments: turn.user_attachments,
                user_timestamp: turn.user_timestamp,
                user_provenance: turn.user_provenance,
                user_message,
                source_events,
                materialized_events,
                projection_summary,
            })
        })
        .collect()
}

fn summarize_prepared_turns(
    turns: &[PreparedImportedTurn],
) -> ImportedRuntimeEventProjectionSummary {
    let mut summary = ImportedRuntimeEventProjectionSummary::default();
    for turn in turns {
        summary.merge(&turn.projection_summary);
    }
    summary
}

fn persist_imported_runtime_event_sidecar(
    core: &RuntimeCore,
    session_id: &str,
    turns: &[PreparedImportedTurn],
) -> Result<Option<crate::runtime::SidecarRef>, RuntimeCoreError> {
    let Some(sidecar_store) = core.sidecar_store.as_ref() else {
        return Ok(None);
    };
    let mut lines = Vec::new();
    for (turn_index, turn) in turns.iter().enumerate() {
        for (event_index, event) in turn.source_events.iter().enumerate() {
            lines.push(
                serde_json::to_string(&json!({
                    "turnIndex": turn_index,
                    "eventIndex": event_index,
                    "eventType": event.event_type(),
                    "payload": event.sidecar_payload(),
                }))
                .map_err(|error| {
                    RuntimeCoreError::Backend(format!(
                        "unable to serialize imported runtime event sidecar: {error}"
                    ))
                })?,
            );
        }
    }
    let reference = sidecar_store
        .write_text(&SidecarWriteRequest {
            session_id: session_id.to_string(),
            kind: "conversation_import_runtime_events".to_string(),
            logical_id: "normalized-runtime-events".to_string(),
            relative_path: crate::runtime::sidecar_store::session_scoped_relative_path(
                session_id,
                "conversation-import/runtime-events.jsonl",
            ),
            content: lines.join("\n"),
        })
        .map_err(RuntimeCoreError::Backend)?;
    Ok(Some(reference))
}

fn attach_import_projection_metadata(
    core: &RuntimeCore,
    session_id: &str,
    projection_summary: &ImportedRuntimeEventProjectionSummary,
    sidecar_ref: Option<&crate::runtime::SidecarRef>,
) -> Result<(), RuntimeCoreError> {
    let mut state = core
        .state
        .lock()
        .expect("runtime core state mutex poisoned");
    let stored = state
        .sessions
        .get_mut(session_id)
        .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
    let reference = stored
        .session
        .business_object_ref
        .get_or_insert_with(|| BusinessObjectRef {
            kind: import_status::IMPORTED_CONVERSATION_KIND.to_string(),
            id: session_id.to_string(),
            title: None,
            uri: None,
            metadata: None,
        });
    let metadata = reference.metadata.get_or_insert_with(|| json!({}));
    if !metadata.is_object() {
        *metadata = json!({});
    }
    let Some(object) = metadata.as_object_mut() else {
        return Ok(());
    };
    object.insert(
        "importedRuntimeProjection".to_string(),
        provenance::compact_json(json!({
            "mode": "default_window",
            "sourceRuntimeEvents": projection_summary.source_runtime_events,
            "materializedRuntimeEvents": projection_summary.materialized_runtime_events,
            "sidecarRuntimeEvents": projection_summary.sidecar_runtime_events,
            "materializedCommandToolCalls": projection_summary.materialized_command_tool_calls,
            "materializedOtherToolCalls": projection_summary.materialized_other_tool_calls,
            "skippedCommandToolCalls": projection_summary.skipped_command_tool_calls,
            "skippedOtherToolCalls": projection_summary.skipped_other_tool_calls,
            "commandToolCallLimit": projection_summary.command_tool_call_limit,
            "otherToolCallLimit": projection_summary.other_tool_call_limit,
            "defaultReadModel": "materialized_window",
            "fullFidelity": "source_rollout_or_sidecar",
            "sidecar": sidecar_ref,
        })),
    );
    Ok(())
}

fn normalize_imported_turn_events(
    events: Vec<ImportedTurnEvent>,
) -> Result<(Vec<ImportedRuntimeEvent>, bool), RuntimeCoreError> {
    let mut normalized = Vec::new();
    let mut normalizer = ImportedRuntimeEventNormalizer::new();

    for event in events {
        match event {
            ImportedTurnEvent::AssistantMessage(message) => {
                normalized.push(imported_message_draft(
                    "assistant",
                    &message.text,
                    &[],
                    message.provenance.as_ref(),
                )?);
            }
            ImportedTurnEvent::Runtime(runtime_event) => {
                normalized.extend(normalizer.push(runtime_event));
            }
        }
    }

    normalized.extend(normalizer.finish());

    Ok((normalized, normalizer.has_terminal_event()))
}

fn imported_message_draft(
    role: &'static str,
    text: &str,
    attachments: &[AgentAttachment],
    provenance: Option<&ConversationImportSourceProvenance>,
) -> Result<ImportedRuntimeEvent, RuntimeCoreError> {
    let provenance = provenance.ok_or_else(|| {
        RuntimeCoreError::Backend(format!(
            "Codex import {role} message is missing source provenance"
        ))
    })?;
    let source_event_seq = provenance.source_event_seq.ok_or_else(|| {
        RuntimeCoreError::Backend(format!(
            "Codex import {role} message is missing source event sequence"
        ))
    })?;
    let ordinal = u64::try_from(source_event_seq).map_err(|_| {
        RuntimeCoreError::Backend(format!(
            "Codex import {role} message source event sequence is out of range: {source_event_seq}"
        ))
    })?;
    let item_role = if role == "user" { "user" } else { "agent" };
    let item_id = provenance
        .source_call_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("imported-{item_role}_{source_event_seq}"));
    let source_provenance = serde_json::to_value(provenance).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "unable to serialize Codex import {role} message provenance: {error}"
        ))
    })?;
    let attachments = serde_json::to_value(attachments).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "unable to serialize Codex import {role} message attachments: {error}"
        ))
    })?;

    Ok(ImportedRuntimeEvent::new(
        if role == "user" {
            "import.message"
        } else {
            "message.delta"
        },
        json!({
            "itemId": item_id,
            "ordinal": ordinal,
            "role": role,
            "text": text,
            "attachments": attachments,
            "imported": true,
            "sourceClient": "codex",
            "sourceEventSeq": source_event_seq,
            "sourceProvenance": source_provenance,
        }),
    ))
}

fn import_business_object_ref(
    source_thread_id: &str,
    title: Option<&str>,
    source_root: &std::path::Path,
    source_path: &std::path::Path,
    thread: &app_server_protocol::ImportedThreadSummary,
    fidelity: &app_server_protocol::ConversationImportFidelitySummary,
) -> BusinessObjectRef {
    let metadata = provenance::import_session_metadata(
        source_thread_id,
        source_root,
        source_path,
        thread,
        fidelity,
    );
    BusinessObjectRef {
        kind: import_status::IMPORTED_CONVERSATION_KIND.to_string(),
        id: source_thread_id.to_string(),
        title: title.map(str::to_string),
        uri: Some(codex::path_to_string(source_path)),
        metadata: Some(metadata),
    }
}
