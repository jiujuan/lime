use super::codex::{self, events::ImportedRuntimeEvent, ImportedTimelineItem};
use super::commit_events::{
    apply_runtime_event_budget, enrich_imported_runtime_event_payload,
    normalize_imported_runtime_events, ImportedRuntimeEventTurn,
};
use super::import_status;
use crate::runtime::{new_id, timestamp};
use crate::{RuntimeCore, RuntimeCoreError, RuntimeEvent};
use app_server_protocol::{
    AgentAttachment, AgentInput, AgentSessionStartParams, AgentSessionStatus, AgentTurn,
    AgentTurnStatus, BusinessObjectRef, ConversationImportSourceClient,
    ConversationImportSourceStatus, ConversationImportThreadCommitParams,
    ConversationImportThreadCommitResponse, ConversationImportThreadStatus, RuntimeOptions,
};
use serde_json::json;
use serde_json::Value;
use std::path::PathBuf;

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
        RuntimeCoreError::Backend("unable to resolve Codex home directory".to_string())
    })?;
    if !source_root.is_dir() {
        return Err(RuntimeCoreError::Backend(
            "Codex home directory does not exist".to_string(),
        ));
    }

    let (source_path, indexed_thread) = resolve_source_path(&source_root, &params)?;
    let mut preview = codex::parse_rollout_for_import(&source_path)?;
    if let Some(indexed_thread) = indexed_thread {
        codex::merge_indexed_thread_metadata(&mut preview.thread, indexed_thread);
    }
    preview.thread.source_path = Some(codex::path_to_string(&source_path));
    preview.thread.import_status = ConversationImportThreadStatus::Imported;

    let mut turns = imported_turns(&preview.timeline);
    if turns.is_empty() {
        return Err(RuntimeCoreError::Backend(
            "Codex rollout does not contain importable user messages".to_string(),
        ));
    }
    if let Some(session) = import_status::imported_session_for_thread(
        core,
        ConversationImportSourceClient::Codex,
        &preview.thread.source_thread_id,
    ) {
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
    let runtime_event_budget = apply_runtime_event_budget(&mut turns);
    preview.summary.fidelity.budget_dropped = runtime_event_budget.dropped_events;

    let provenance = ImportProvenance {
        source_thread_id: preview.thread.source_thread_id.clone(),
        source_root: codex::path_to_string(&source_root),
        source_path: codex::path_to_string(&source_path),
        source: preview.thread.source.clone(),
        cwd: preview.thread.cwd.clone(),
        model_provider: preview.thread.model_provider.clone(),
        model: metadata_string(preview.thread.metadata.as_ref(), "model"),
        reasoning_effort: metadata_string(preview.thread.metadata.as_ref(), "reasoningEffort"),
        metadata: preview.thread.metadata.clone(),
        fidelity: preview.summary.fidelity.clone(),
    };

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

    let imported_turns = append_imported_turns(core, &session.session_id, turns, &provenance)?;
    let imported_messages = preview.summary.dry_run.will_import_messages;
    let mut warnings = preview.summary.warnings.clone();
    if preview.summary.unsupported_count > 0 || preview.summary.rollout_event_items > 0 {
        warnings.push(
            "Imported Codex messages and supported tool/patch timeline events; unsupported rollout items remain as provenance only."
                .to_string(),
        );
    }
    if runtime_event_budget.dropped_events > 0 {
        warnings.push(format!(
            "Skipped {} high-volume Codex runtime events after preserving {} command tool calls, {} other tool calls, and all patch/action events.",
            runtime_event_budget.dropped_events,
            runtime_event_budget.retained_command_tool_calls,
            runtime_event_budget.retained_other_tool_calls,
        ));
    }

    let mut session = session;
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

fn resolve_source_path(
    source_root: &std::path::Path,
    params: &ConversationImportThreadCommitParams,
) -> Result<(PathBuf, Option<app_server_protocol::ImportedThreadSummary>), RuntimeCoreError> {
    let (mut source_path, indexed_thread) =
        match codex::normalize_filter(params.source_path.as_deref()) {
            Some(path) => (PathBuf::from(path), None),
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
                        "unable to resolve Codex rollout path for thread".to_string(),
                    )
                })?;
                let path = thread
                    .source_path
                    .as_deref()
                    .map(PathBuf::from)
                    .ok_or_else(|| {
                        RuntimeCoreError::Backend(
                            "unable to resolve Codex rollout path for thread".to_string(),
                        )
                    })?;
                (path, Some(thread))
            }
        };
    if !source_path.is_absolute() {
        source_path = source_root.join(source_path);
    }
    if !source_path.is_file() {
        return Err(RuntimeCoreError::Backend(format!(
            "Codex rollout file does not exist: {}",
            source_path.display()
        )));
    }
    Ok((source_path, indexed_thread))
}

struct ImportedTurn {
    user_text: String,
    user_attachments: Vec<AgentAttachment>,
    user_provenance: Option<app_server_protocol::ConversationImportSourceProvenance>,
    assistant_text: Option<String>,
    assistant_provenance: Option<app_server_protocol::ConversationImportSourceProvenance>,
    runtime_events: Vec<ImportedRuntimeEvent>,
}

impl ImportedRuntimeEventTurn for ImportedTurn {
    fn runtime_events(&self) -> &[ImportedRuntimeEvent] {
        &self.runtime_events
    }

    fn runtime_events_mut(&mut self) -> &mut Vec<ImportedRuntimeEvent> {
        &mut self.runtime_events
    }
}

fn imported_turns(timeline: &[ImportedTimelineItem]) -> Vec<ImportedTurn> {
    let mut turns = Vec::new();
    let mut pending_user: Option<(
        String,
        Vec<AgentAttachment>,
        Option<String>,
        Option<app_server_protocol::ConversationImportSourceProvenance>,
    )> = None;
    let mut pending_assistant = String::new();
    let mut pending_assistant_provenance = None;
    let mut pending_runtime_events = Vec::new();
    let mut leading_runtime_events = Vec::new();

    for item in timeline {
        match item {
            ImportedTimelineItem::Message(message) => match message.role.as_str() {
                "user" => {
                    if pending_user.as_mut().is_some_and(
                        |(text, attachments, source_type, provenance)| {
                            if text.trim() != message.text.trim()
                                || message.source_type.as_deref() != Some("response_item")
                                || source_type.as_deref() != Some("event_msg")
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
                            if provenance.is_none() {
                                *provenance = message.provenance.clone();
                            }
                            true
                        },
                    ) {
                        continue;
                    }
                    flush_imported_turn(
                        &mut turns,
                        &mut pending_user,
                        &mut pending_assistant,
                        &mut pending_assistant_provenance,
                        &mut pending_runtime_events,
                    );
                    pending_user = Some((
                        message.text.clone(),
                        message.attachments.clone(),
                        message.source_type.clone(),
                        message.provenance.clone(),
                    ));
                    pending_runtime_events.append(&mut leading_runtime_events);
                }
                "assistant" => {
                    if pending_user.is_some() {
                        if !pending_assistant.is_empty() {
                            pending_assistant.push_str("\n\n");
                        }
                        pending_assistant.push_str(&message.text);
                        if pending_assistant_provenance.is_none() {
                            pending_assistant_provenance = message.provenance.clone();
                        }
                    }
                }
                _ => {}
            },
            ImportedTimelineItem::RuntimeEvent(event) => {
                if pending_user.is_some() {
                    pending_runtime_events.push(event.clone());
                } else {
                    leading_runtime_events.push(event.clone());
                }
            }
        }
    }
    flush_imported_turn(
        &mut turns,
        &mut pending_user,
        &mut pending_assistant,
        &mut pending_assistant_provenance,
        &mut pending_runtime_events,
    );
    turns
}

fn flush_imported_turn(
    turns: &mut Vec<ImportedTurn>,
    pending_user: &mut Option<(
        String,
        Vec<AgentAttachment>,
        Option<String>,
        Option<app_server_protocol::ConversationImportSourceProvenance>,
    )>,
    pending_assistant: &mut String,
    pending_assistant_provenance: &mut Option<
        app_server_protocol::ConversationImportSourceProvenance,
    >,
    pending_runtime_events: &mut Vec<ImportedRuntimeEvent>,
) {
    let Some((user_text, user_attachments, _source_type, user_provenance)) = pending_user.take()
    else {
        pending_assistant.clear();
        *pending_assistant_provenance = None;
        pending_runtime_events.clear();
        return;
    };
    let assistant_text =
        (!pending_assistant.trim().is_empty()).then(|| pending_assistant.trim().to_string());
    pending_assistant.clear();
    turns.push(ImportedTurn {
        user_text,
        user_attachments,
        user_provenance,
        assistant_text,
        assistant_provenance: pending_assistant_provenance.take(),
        runtime_events: std::mem::take(pending_runtime_events),
    });
}

fn append_imported_turns(
    core: &RuntimeCore,
    session_id: &str,
    turns: Vec<ImportedTurn>,
    provenance: &ImportProvenance,
) -> Result<usize, RuntimeCoreError> {
    let (session, _) = core.session_snapshot(session_id)?;
    let thread_id = session.thread_id.clone();
    let mut imported = 0;

    for imported_turn in turns {
        let turn_id = new_id("turn");
        let started_at = timestamp();
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
                started_at: Some(started_at),
                completed_at: None,
            };
            stored.session.status = AgentSessionStatus::Running;
            stored.session.updated_at = timestamp();
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

        let mut events = Vec::new();
        if let Some(assistant_text) = imported_turn.assistant_text {
            events.push(RuntimeEvent::new(
                "message.delta",
                json!({
                    "text": assistant_text,
                    "imported": true,
                    "sourceClient": "codex",
                    "sourceProvenance": imported_turn.assistant_provenance,
                }),
            ));
        }
        let (runtime_events, has_terminal_event) =
            normalize_imported_runtime_events(imported_turn.runtime_events);
        events.extend(runtime_events.into_iter().map(|event| {
            RuntimeEvent::new(
                event.event_type,
                enrich_imported_runtime_event_payload(event.payload),
            )
        }));
        if !has_terminal_event {
            events.push(RuntimeEvent::new(
                "turn.completed",
                json!({
                    "imported": true,
                    "sourceClient": "codex",
                }),
            ));
        }
        core.append_runtime_events(session_id, &thread_id, Some(&turn_id), events)?;
        imported += 1;
    }

    Ok(imported)
}

fn import_business_object_ref(
    source_thread_id: &str,
    title: Option<&str>,
    source_root: &std::path::Path,
    source_path: &std::path::Path,
    thread: &app_server_protocol::ImportedThreadSummary,
    fidelity: &app_server_protocol::ConversationImportFidelitySummary,
) -> BusinessObjectRef {
    let metadata =
        import_session_metadata(source_thread_id, source_root, source_path, thread, fidelity);
    BusinessObjectRef {
        kind: import_status::IMPORTED_CONVERSATION_KIND.to_string(),
        id: source_thread_id.to_string(),
        title: title.map(str::to_string),
        uri: Some(codex::path_to_string(source_path)),
        metadata: Some(metadata),
    }
}

struct ImportProvenance {
    source_thread_id: String,
    source_root: String,
    source_path: String,
    source: Option<String>,
    cwd: Option<String>,
    model_provider: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
    metadata: Option<Value>,
    fidelity: app_server_protocol::ConversationImportFidelitySummary,
}

impl ImportProvenance {
    fn turn_runtime_options(
        &self,
        user_provenance: Option<&app_server_protocol::ConversationImportSourceProvenance>,
    ) -> RuntimeOptions {
        let metadata = self.turn_metadata(user_provenance);
        let cwd = self.cwd.clone();
        let model_provider = self.model_provider.clone();
        let model = self.model.clone();
        let reasoning_effort = self.reasoning_effort.clone();
        let approval_policy = metadata_string(self.metadata.as_ref(), "approvalPolicy");
        let approvals_reviewer = metadata_string(self.metadata.as_ref(), "approvalsReviewer");
        let sandbox_policy = metadata_value(self.metadata.as_ref(), "sandboxPolicy");
        let service_tier = metadata_string(self.metadata.as_ref(), "serviceTier");
        let collaboration_mode = metadata_string(self.metadata.as_ref(), "collaborationMode");
        let personality = metadata_value(self.metadata.as_ref(), "personality");
        RuntimeOptions {
            provider_preference: self.model_provider.clone(),
            model_preference: self.model.clone(),
            metadata: Some(metadata.clone()),
            host_options: Some(compact_json(json!({
                "asterChatRequest": {
                    "project_root": cwd.clone(),
                    "cwd": cwd.clone(),
                    "provider_preference": model_provider.clone(),
                    "model_preference": model.clone(),
                    "reasoning_effort": reasoning_effort.clone(),
                    "approval_policy": approval_policy.clone(),
                    "approvals_reviewer": approvals_reviewer.clone(),
                    "sandbox_policy": sandbox_policy.clone(),
                    "service_tier": service_tier.clone(),
                    "collaboration_mode": collaboration_mode.clone(),
                    "personality": personality.clone(),
                    "metadata": metadata.clone(),
                    "turn_config": {
                        "project_root": cwd.clone(),
                        "cwd": cwd,
                        "provider_preference": model_provider.clone(),
                        "model_preference": model,
                        "reasoning_effort": reasoning_effort,
                        "approval_policy": approval_policy,
                        "approvals_reviewer": approvals_reviewer,
                        "sandbox_policy": sandbox_policy,
                        "service_tier": service_tier,
                        "collaboration_mode": collaboration_mode,
                        "personality": personality,
                        "metadata": metadata,
                    }
                }
            }))),
            ..RuntimeOptions::default()
        }
    }

    fn turn_metadata(
        &self,
        user_provenance: Option<&app_server_protocol::ConversationImportSourceProvenance>,
    ) -> Value {
        json!({
            "imported": true,
            "sourceClient": "codex",
            "sourceThreadId": self.source_thread_id,
            "sourceRoot": self.source_root,
            "sourcePath": self.source_path,
            "source": self.source,
            "cwd": self.cwd,
            "workingDir": self.cwd,
            "modelProvider": self.model_provider,
            "modelName": self.model,
            "reasoningEffort": self.reasoning_effort,
            "approvalPolicy": metadata_string(self.metadata.as_ref(), "approvalPolicy"),
            "approvalsReviewer": metadata_string(self.metadata.as_ref(), "approvalsReviewer"),
            "sandboxPolicy": metadata_value(self.metadata.as_ref(), "sandboxPolicy"),
            "serviceTier": metadata_string(self.metadata.as_ref(), "serviceTier"),
            "threadSource": metadata_string(self.metadata.as_ref(), "threadSource"),
            "memoryMode": metadata_string(self.metadata.as_ref(), "memoryMode"),
            "agentPath": metadata_string(self.metadata.as_ref(), "agentPath"),
            "importedThreadSettings": imported_thread_settings(
                self.cwd.clone(),
                self.model_provider.clone(),
                self.model.clone(),
                self.reasoning_effort.clone(),
                self.metadata.as_ref(),
            ),
            "importedContinuation": imported_continuation(
                self.cwd.clone(),
                self.model_provider.clone(),
                self.model.clone(),
                self.reasoning_effort.clone(),
                self.metadata.as_ref(),
            ),
            "codexMetadata": self.metadata,
            "codexImportFidelity": self.fidelity,
            "userSourceProvenance": user_provenance,
        })
    }
}

fn import_session_metadata(
    source_thread_id: &str,
    source_root: &std::path::Path,
    source_path: &std::path::Path,
    thread: &app_server_protocol::ImportedThreadSummary,
    fidelity: &app_server_protocol::ConversationImportFidelitySummary,
) -> Value {
    let model = metadata_string(thread.metadata.as_ref(), "model");
    let reasoning_effort = metadata_string(thread.metadata.as_ref(), "reasoningEffort");
    let imported_thread_settings = imported_thread_settings(
        thread.cwd.clone(),
        thread.model_provider.clone(),
        model.clone(),
        reasoning_effort.clone(),
        thread.metadata.as_ref(),
    );
    let imported_continuation = imported_continuation(
        thread.cwd.clone(),
        thread.model_provider.clone(),
        model.clone(),
        reasoning_effort.clone(),
        thread.metadata.as_ref(),
    );
    json!({
        "sourceClient": "codex",
        "sourceThreadId": source_thread_id,
        "sourceRoot": codex::path_to_string(source_root),
        "sourcePath": codex::path_to_string(source_path),
        "sourceStatus": ConversationImportSourceStatus::Ready,
        "statePath": codex::newest_state_db(source_root).map(|path| codex::path_to_string(&path)),
        "cwd": thread.cwd,
        "workingDir": thread.cwd,
        "source": thread.source,
        "providerName": thread.model_provider,
        "modelProvider": thread.model_provider,
        "modelName": model,
        "model": model,
        "reasoningEffort": reasoning_effort,
        "approvalPolicy": metadata_string(thread.metadata.as_ref(), "approvalPolicy"),
        "approvalsReviewer": metadata_string(thread.metadata.as_ref(), "approvalsReviewer"),
        "sandboxPolicy": metadata_value(thread.metadata.as_ref(), "sandboxPolicy"),
        "serviceTier": metadata_string(thread.metadata.as_ref(), "serviceTier"),
        "threadSource": metadata_string(thread.metadata.as_ref(), "threadSource"),
        "memoryMode": metadata_string(thread.metadata.as_ref(), "memoryMode"),
        "agentPath": metadata_string(thread.metadata.as_ref(), "agentPath"),
        "cliVersion": metadata_string(thread.metadata.as_ref(), "cliVersion"),
        "gitSha": metadata_string(thread.metadata.as_ref(), "gitSha"),
        "gitBranch": metadata_string(thread.metadata.as_ref(), "gitBranch"),
        "gitOriginUrl": metadata_string(thread.metadata.as_ref(), "gitOriginUrl"),
        "importedThreadSettings": imported_thread_settings,
        "importedContinuation": imported_continuation,
        "importedMemory": imported_memory(thread.metadata.as_ref()),
        "archived": thread.archived,
        "codexMetadata": thread.metadata,
        "codexImportFidelity": fidelity,
        "importedAt": timestamp(),
    })
}

fn imported_thread_settings(
    cwd: Option<String>,
    model_provider: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
    metadata: Option<&Value>,
) -> Value {
    compact_json(json!({
        "cwd": cwd,
        "modelProvider": model_provider,
        "model": model,
        "effort": reasoning_effort,
        "summary": metadata_value(metadata, "reasoningSummary"),
        "approvalPolicy": metadata_string(metadata, "approvalPolicy"),
        "approvalsReviewer": metadata_string(metadata, "approvalsReviewer"),
        "sandboxPolicy": metadata_value(metadata, "sandboxPolicy"),
        "activePermissionProfile": metadata_value(metadata, "activePermissionProfile"),
        "serviceTier": metadata_string(metadata, "serviceTier"),
        "collaborationMode": metadata_string(metadata, "collaborationMode"),
        "personality": metadata_value(metadata, "personality"),
    }))
}

fn imported_continuation(
    cwd: Option<String>,
    model_provider: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
    metadata: Option<&Value>,
) -> Value {
    compact_json(json!({
        "cwd": cwd,
        "workingDir": cwd,
        "modelProvider": model_provider,
        "providerName": model_provider,
        "model": model,
        "modelName": model,
        "reasoningEffort": reasoning_effort,
        "approvalPolicy": metadata_string(metadata, "approvalPolicy"),
        "approvalsReviewer": metadata_string(metadata, "approvalsReviewer"),
        "sandboxPolicy": metadata_value(metadata, "sandboxPolicy"),
        "serviceTier": metadata_string(metadata, "serviceTier"),
        "threadSource": metadata_string(metadata, "threadSource"),
        "memoryMode": metadata_string(metadata, "memoryMode"),
        "agentPath": metadata_string(metadata, "agentPath"),
    }))
}

fn imported_memory(metadata: Option<&Value>) -> Value {
    compact_json(json!({
        "mode": metadata_string(metadata, "memoryMode"),
        "agentPath": metadata_string(metadata, "agentPath"),
        "agentNickname": metadata_string(metadata, "agentNickname"),
        "agentRole": metadata_string(metadata, "agentRole"),
    }))
}

fn metadata_string(metadata: Option<&Value>, key: &str) -> Option<String> {
    metadata?
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
}

fn metadata_value(metadata: Option<&Value>, key: &str) -> Option<Value> {
    metadata?.get(key).filter(|value| !value.is_null()).cloned()
}

fn compact_json(value: Value) -> Value {
    match value {
        Value::Object(object) => {
            let compacted = object
                .into_iter()
                .filter_map(|(key, value)| {
                    let value = compact_json(value);
                    (!value.is_null()).then_some((key, value))
                })
                .collect();
            Value::Object(compacted)
        }
        Value::Array(values) => Value::Array(values.into_iter().map(compact_json).collect()),
        value => value,
    }
}
