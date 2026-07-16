mod approval;
mod messages;
mod model_routing;
mod queued_turns;
mod runtime_items;
mod session_metadata;
#[cfg(test)]
mod tests;
mod workflow;

use super::article_workspace_action_projection;
use super::article_workspace_projection;
use super::artifact_projection;
use super::coding_activity_projection;
use super::event_request_id;
use super::file_checkpoint_projection;
use super::output_refs;
use super::permission_state_projection;
use super::read_model_turn_usage;
use super::status::agent_session_status_label;
use super::status::resolve_agent_session_runtime_state;
use super::string_field;
use super::thread_item_projection;
use super::tool_item_projection;
use super::workflow::read_model::{workflow_read_model_from_events, WorkflowReadModel};
use super::ProjectionStore;
use super::StoredSession;
use agent_protocol::{ItemStatus, SortDirection, ThreadItem, ThreadItemPayload};
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSessionActionScope;
use app_server_protocol::AgentSessionActionType;
use app_server_protocol::AgentSessionApprovalDecision;
use app_server_protocol::AgentSessionReadParams;
use app_server_protocol::AgentSessionReplayedActionRequired;
use model_routing::{
    latest_model_routing_from_events, latest_provider_safety_buffering_from_events,
};
use queued_turns::queued_turn_snapshots;
use runtime_items::{
    latest_turn_error_message, runtime_error_items_from_events, runtime_warning_items_from_events,
};
use serde_json::json;
use session_metadata::{
    session_archived_at, session_execution_runtime, session_execution_strategy, session_working_dir,
};
use std::borrow::Cow;
use thread_store::{ListItemsParams, PageRequest, ThreadStore, ThreadStoreResult};

pub(super) use messages::runtime_session_messages;

#[derive(Debug, Clone, Copy, Default)]
pub(super) struct ReadDetailOptions {
    history_limit: Option<usize>,
    history_offset: usize,
    history_before_message_id: Option<i64>,
}

impl ReadDetailOptions {
    pub(super) fn from_params(params: &AgentSessionReadParams) -> Self {
        Self {
            history_limit: params.history_limit.map(|value| value as usize),
            history_offset: params.history_offset.unwrap_or_default() as usize,
            history_before_message_id: params.history_before_message_id.filter(|value| *value > 0),
        }
    }
}

pub(super) fn runtime_session_read_detail_with_options(
    stored: &StoredSession,
    options: ReadDetailOptions,
    workflow_audit_events: &[AgentEvent],
) -> serde_json::Value {
    runtime_session_read_detail_with_item_source(stored, options, workflow_audit_events, None)
}

/// Builds the session detail from the canonical ThreadStore item projection when it exists.
///
/// The event projection remains an explicit recovery path for in-memory sessions and for
/// sessions that predate canonical materialization. This keeps tests and import hydration
/// useful while making the durable ProjectionStore the production read-model owner.
pub(super) async fn runtime_session_read_detail_from_thread_store(
    stored: &StoredSession,
    options: ReadDetailOptions,
    workflow_audit_events: &[AgentEvent],
    projection_store: &ProjectionStore,
) -> ThreadStoreResult<serde_json::Value> {
    let canonical_items = canonical_items_from_thread_store(projection_store, stored).await?;
    Ok(runtime_session_read_detail_with_item_source(
        stored,
        options,
        workflow_audit_events,
        Some(canonical_items.as_slice()),
    ))
}

fn runtime_session_read_detail_with_item_source(
    stored: &StoredSession,
    options: ReadDetailOptions,
    workflow_audit_events: &[AgentEvent],
    canonical_items: Option<&[serde_json::Value]>,
) -> serde_json::Value {
    let usage_projection_events = runtime_events_with_workflow_audit(stored, workflow_audit_events);
    let article_workspace = article_workspace_projection::article_workspace_from_events(
        &stored.session,
        &stored.events,
    );
    let article_workspace_actions =
        article_workspace_action_projection::article_workspace_actions_from_turn_runtime_options(
            stored,
        );
    let article_workspace =
        article_workspace_projection::apply_session_selection(article_workspace, &stored.session);
    let article_workspace = article_workspace_projection::apply_session_edited_draft(
        article_workspace,
        &stored.session,
    );
    let article_workspace =
        article_workspace_action_projection::apply_action_history_to_article_workspace(
            article_workspace,
            &article_workspace_actions,
        );
    let mut thread_read = runtime_thread_read_from_stored_session_with_usage_events(
        stored,
        article_workspace.clone(),
        article_workspace_actions.clone(),
        &usage_projection_events,
    );
    let queued_turns = queued_turn_snapshots(stored);
    let all_messages = messages::runtime_session_messages(stored);
    let messages_count = all_messages.len();
    let (messages, cursor_start_index) = apply_history_window(all_messages, options);
    let items = canonical_items.map_or_else(
        || {
            let mut items = thread_item_projection::thread_items_from_events(stored);
            items.extend(tool_item_projection::tool_items_from_events(stored));
            items.extend(file_checkpoint_projection::file_artifact_items_from_events(
                &stored.events,
            ));
            items.extend(runtime_warning_items_from_events(stored));
            items.extend(runtime_error_items_from_events(stored));
            sort_read_detail_items(&mut items);
            items
        },
        |items| items.to_vec(),
    );
    if canonical_items.is_some() {
        apply_canonical_item_views(&mut thread_read, &items);
    }
    let thread_items = items.clone();
    let loaded_count = messages.len();
    let oldest_message_id = messages.first().and_then(messages::message_numeric_id);
    let history_limit = options.history_limit.unwrap_or(messages_count);
    let history_truncated = loaded_count < messages_count;
    let turns = read_model_turn_usage::turns_with_usage(&stored.turns, &usage_projection_events);
    let mut detail = json!({
        "id": stored.session.session_id,
        "session_id": stored.session.session_id,
        "thread_id": stored.session.thread_id,
        "workspace_id": stored.session.workspace_id,
        "status": agent_session_status_label(stored.session.status),
        "working_dir": session_working_dir(&stored.session),
        "archived_at": session_archived_at(&stored.session),
        "execution_strategy": session_execution_strategy(&stored.session),
        "execution_runtime": session_execution_runtime(&stored.session),
        "messages_count": messages_count,
        "history_limit": history_limit,
        "history_offset": options.history_offset,
        "history_cursor": {
            "oldest_message_id": oldest_message_id,
            "start_index": cursor_start_index,
            "loaded_count": loaded_count,
        },
        "history_truncated": history_truncated,
        "messages": messages,
        "turns": turns,
        "items": items,
        "queued_turns": queued_turns,
        "artifacts": artifact_projection::stored_user_visible_artifact_summaries_for_turn(stored, None),
        "outputs": output_refs::read_model_outputs(stored.output_blobs.values(), None),
        "thread_read": thread_read,
    });
    if let Some(thread_read_object) = detail
        .get_mut("thread_read")
        .and_then(serde_json::Value::as_object_mut)
    {
        thread_read_object.insert(
            "thread_items".to_string(),
            serde_json::Value::Array(thread_items),
        );
    }
    if let Some(article_workspace) = article_workspace {
        if let Some(detail_object) = detail.as_object_mut() {
            detail_object.insert("article_workspace".to_string(), article_workspace.clone());
            detail_object.insert("articleWorkspace".to_string(), article_workspace);
        }
    }
    detail
}

pub(super) async fn canonical_items_from_thread_store(
    projection_store: &ProjectionStore,
    stored: &StoredSession,
) -> ThreadStoreResult<Vec<serde_json::Value>> {
    let thread_id = agent_protocol::ThreadId::new(stored.session.thread_id.clone());
    let mut cursor = None;
    let mut items = Vec::new();
    loop {
        let page = projection_store
            .list_items(ListItemsParams {
                thread_id: thread_id.clone(),
                turn_id: None,
                include_archived: true,
                page: PageRequest {
                    cursor,
                    limit: 500,
                    sort_direction: SortDirection::Asc,
                },
            })
            .await?;
        items.extend(page.data.iter().map(canonical_item_to_agent_detail));
        cursor = page.next_cursor;
        if cursor.is_none() {
            break;
        }
    }
    Ok(items)
}

fn canonical_item_to_agent_detail(item: &ThreadItem) -> serde_json::Value {
    let (item_type, payload) = canonical_payload_to_agent_detail(&item.payload);
    let metadata = canonical_item_agent_metadata(item);
    let mut detail = serde_json::Map::from_iter([
        ("id".to_string(), json!(item.item_id.as_str())),
        ("item_id".to_string(), json!(item.item_id.as_str())),
        ("session_id".to_string(), json!(item.session_id.as_str())),
        ("thread_id".to_string(), json!(item.thread_id.as_str())),
        ("turn_id".to_string(), json!(item.turn_id.as_str())),
        ("sequence".to_string(), json!(item.sequence)),
        ("ordinal".to_string(), json!(item.ordinal)),
        ("type".to_string(), json!(item_type)),
        ("status".to_string(), json!(agent_item_status(item.status))),
        (
            "started_at".to_string(),
            json!(timestamp_from_millis(item.created_at_ms)),
        ),
        (
            "updated_at".to_string(),
            json!(timestamp_from_millis(item.updated_at_ms)),
        ),
        ("metadata".to_string(), metadata),
    ]);
    if let Some(completed_at_ms) = item.completed_at_ms {
        detail.insert(
            "completed_at".to_string(),
            json!(timestamp_from_millis(completed_at_ms)),
        );
    }
    detail.extend(payload);
    if matches!(item.payload, ThreadItemPayload::Command { .. }) {
        if let Some(command_id) = item
            .metadata
            .get("source_call_id")
            .and_then(serde_json::Value::as_str)
        {
            detail.insert("command_id".to_string(), json!(command_id));
        }
    }
    serde_json::Value::Object(detail)
}

fn canonical_item_agent_metadata(item: &ThreadItem) -> serde_json::Value {
    let ThreadItemPayload::Plan {
        revision_id,
        source,
        plan,
        explanation,
        tool_call_id,
        source_item_id,
        ..
    } = &item.payload
    else {
        return item.metadata.clone();
    };
    let mut metadata = item.metadata.as_object().cloned().unwrap_or_default();
    metadata.insert("revisionId".to_string(), json!(revision_id));
    metadata.insert("plan".to_string(), json!(plan));
    if let Some(source) = source {
        metadata.insert("source".to_string(), json!(source));
    }
    if let Some(explanation) = explanation {
        metadata.insert("explanation".to_string(), json!(explanation));
    }
    if let Some(tool_call_id) = tool_call_id {
        metadata.insert("tool_call_id".to_string(), json!(tool_call_id));
    }
    if let Some(source_item_id) = source_item_id {
        metadata.insert("source_item_id".to_string(), json!(source_item_id));
    }
    serde_json::Value::Object(metadata)
}

fn canonical_payload_to_agent_detail(
    payload: &ThreadItemPayload,
) -> (&'static str, serde_json::Map<String, serde_json::Value>) {
    let mut detail = serde_json::Map::new();
    let item_type = match payload {
        ThreadItemPayload::UserMessage { content, client_id } => {
            detail.insert("content".to_string(), json!(content));
            if let Some(client_id) = client_id {
                detail.insert("client_id".to_string(), json!(client_id));
            }
            "user_message"
        }
        ThreadItemPayload::AgentMessage {
            text,
            phase,
            content_parts,
        } => {
            detail.insert("text".to_string(), json!(text));
            if let Some(phase) = phase {
                detail.insert("phase".to_string(), json!(phase));
            }
            if !content_parts.is_empty() {
                detail.insert("contentParts".to_string(), json!(content_parts));
            }
            "agent_message"
        }
        ThreadItemPayload::Plan { text, .. } => {
            detail.insert("text".to_string(), json!(text));
            "plan"
        }
        ThreadItemPayload::Reasoning { summary, content } => {
            detail.insert("text".to_string(), json!(content.join("\n")));
            detail.insert("summary".to_string(), json!(summary));
            "reasoning"
        }
        ThreadItemPayload::Tool {
            call_id,
            name,
            arguments,
            output,
        } => {
            detail.insert("call_id".to_string(), json!(call_id));
            detail.insert("tool_name".to_string(), json!(name));
            detail.insert("arguments".to_string(), json!(arguments));
            let is_web_search = is_canonical_web_search_tool(name);
            if is_web_search {
                let query = canonical_tool_argument(arguments, "query")
                    .map(str::to_string)
                    .or_else(|| canonical_web_search_action_field(arguments, "query"))
                    .unwrap_or_default();
                let action = canonical_web_search_action_field(arguments, "type")
                    .or_else(|| canonical_tool_argument(arguments, "action").map(str::to_string))
                    .filter(|value| !value.trim_start().starts_with('{'))
                    .unwrap_or_else(|| "search_query".to_string());
                detail.insert("query".to_string(), json!(query));
                detail.insert("action".to_string(), json!(action));
            }
            if let Some(output) = output {
                insert_tool_output(&mut detail, output);
            }
            if is_web_search {
                "web_search"
            } else {
                "tool_call"
            }
        }
        ThreadItemPayload::McpToolCall {
            call_id,
            server_name,
            tool_name,
            arguments,
            output,
        } => {
            detail.insert("call_id".to_string(), json!(call_id));
            detail.insert("mcp_server".to_string(), json!(server_name));
            detail.insert("tool_name".to_string(), json!(tool_name));
            detail.insert("arguments".to_string(), json!(arguments));
            if let Some(output) = output {
                insert_tool_output(&mut detail, output);
            }
            "tool_call"
        }
        ThreadItemPayload::CollabAgentToolCall {
            call_id,
            operation,
            target_thread_id,
            message,
            output,
        } => {
            detail.insert("call_id".to_string(), json!(call_id));
            if let Some(output) = output {
                insert_tool_output(&mut detail, output);
            }
            if matches!(operation, agent_protocol::CollabAgentOperation::Wait) {
                detail.insert("tool_name".to_string(), json!("wait_agent"));
                detail.insert("arguments".to_string(), json!([]));
                "tool_call"
            } else {
                detail.insert("status_label".to_string(), json!(operation));
                if let Some(target_thread_id) = target_thread_id {
                    detail.insert("session_id".to_string(), json!(target_thread_id.as_str()));
                }
                if let Some(message) = message {
                    detail.insert("summary".to_string(), json!(message));
                }
                "subagent_activity"
            }
        }
        ThreadItemPayload::Approval {
            request_id,
            action,
            scope,
            available_decisions,
            decision,
            requested_at_ms,
            resolved_at_ms,
            reason_code,
            expires_at_ms,
        } => {
            detail.insert("request_id".to_string(), json!(request_id));
            detail.insert("action_type".to_string(), json!(action.kind));
            detail.insert("prompt".to_string(), json!(action.description));
            detail.insert("scope".to_string(), json!(scope));
            detail.insert(
                "available_decisions".to_string(),
                json!(available_decisions),
            );
            if let Some(response) =
                approval::read_response(*decision, *scope, reason_code.as_deref())
            {
                detail.insert("response".to_string(), response);
            }
            if let Some(requested_at_ms) = requested_at_ms {
                detail.insert("requested_at_ms".to_string(), json!(requested_at_ms));
            }
            if let Some(resolved_at_ms) = resolved_at_ms {
                detail.insert("resolved_at_ms".to_string(), json!(resolved_at_ms));
            }
            if let Some(expires_at_ms) = expires_at_ms {
                detail.insert("expires_at_ms".to_string(), json!(expires_at_ms));
            }
            "approval_request"
        }
        ThreadItemPayload::Command {
            command,
            cwd,
            output,
            exit_code,
        } => {
            detail.insert("command".to_string(), json!(command));
            detail.insert("cwd".to_string(), json!(cwd.as_deref().unwrap_or_default()));
            if let Some(output) = output {
                detail.insert("aggregated_output".to_string(), json!(output));
            }
            if let Some(exit_code) = exit_code {
                detail.insert("exit_code".to_string(), json!(exit_code));
            }
            "command_execution"
        }
        ThreadItemPayload::File { path, diff, status } => {
            detail.insert("path".to_string(), json!(path));
            detail.insert("source".to_string(), json!("canonical_thread_store"));
            detail.insert("file_status".to_string(), json!(status));
            if let Some(diff) = diff {
                detail.insert("content".to_string(), json!(diff));
            }
            "file_artifact"
        }
        ThreadItemPayload::Media {
            uri,
            mime_type,
            preview,
        } => {
            detail.insert("uri".to_string(), json!(uri));
            detail.insert("mime_type".to_string(), json!(mime_type));
            if let Some(preview) = preview {
                detail.insert("preview".to_string(), json!(preview));
            }
            "media"
        }
        ThreadItemPayload::SubAgent {
            child_thread_id,
            activity,
            detail: activity_detail,
        } => {
            detail.insert("session_id".to_string(), json!(child_thread_id.as_str()));
            detail.insert("status_label".to_string(), json!(activity));
            if let Some(activity_detail) = activity_detail {
                detail.insert("summary".to_string(), json!(activity_detail));
            }
            "subagent_activity"
        }
        ThreadItemPayload::ContextCompaction { summary, window_id } => {
            detail.insert("stage".to_string(), json!("completed"));
            if let Some(summary) = summary {
                detail.insert("detail".to_string(), json!(summary));
            }
            if let Some(window_id) = window_id {
                detail.insert("window_id".to_string(), json!(window_id));
            }
            "context_compaction"
        }
        ThreadItemPayload::Extension { name, data } => {
            detail.insert("extension_name".to_string(), json!(name));
            detail.insert("extension_data".to_string(), data.clone());
            "extension"
        }
    };
    (item_type, detail)
}

fn insert_tool_output(
    detail: &mut serde_json::Map<String, serde_json::Value>,
    output: &agent_protocol::ToolOutput,
) {
    if let Some(text) = output.text.as_ref() {
        detail.insert("output".to_string(), json!(text));
    }
    if let Some(structured_content) = output.structured_content.as_ref() {
        detail.insert("structured_content".to_string(), structured_content.clone());
        detail.insert("structuredContent".to_string(), structured_content.clone());
    }
    if let Some(error) = output.error.as_ref() {
        detail.insert("error".to_string(), json!(error));
    }
    if let Some(duration_ms) = output.duration_ms {
        detail.insert("duration_ms".to_string(), json!(duration_ms));
    }
    detail.insert("truncated".to_string(), json!(output.truncated));
    if let Some(output_ref) = output.output_ref.as_ref() {
        detail.insert("output_ref".to_string(), json!(output_ref));
    }
}

fn is_canonical_web_search_tool(name: &str) -> bool {
    matches!(
        name.trim(),
        "web_search" | "webSearch" | "search_query" | "WebSearch" | "WebSearchTool"
    )
}

fn canonical_tool_argument<'a>(
    arguments: &'a [agent_protocol::ToolArgument],
    name: &str,
) -> Option<&'a str> {
    arguments
        .iter()
        .find(|argument| argument.name == name)
        .map(|argument| argument.value.as_str())
}

fn canonical_web_search_action_field(
    arguments: &[agent_protocol::ToolArgument],
    field: &str,
) -> Option<String> {
    let action = canonical_tool_argument(arguments, "action")?;
    let action = serde_json::from_str::<serde_json::Value>(action).ok()?;
    action
        .get(field)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn apply_canonical_item_views(thread_read: &mut serde_json::Value, items: &[serde_json::Value]) {
    let Some(thread_read) = thread_read.as_object_mut() else {
        return;
    };
    let canonical_commands = items
        .iter()
        .filter(|item| {
            item.get("type").and_then(serde_json::Value::as_str) == Some("command_execution")
        })
        .map(canonical_command_view)
        .collect::<Vec<_>>();
    let canonical_tool_calls = items
        .iter()
        .filter(|item| item.get("type").and_then(serde_json::Value::as_str) == Some("tool_call"))
        .map(canonical_tool_call_view)
        .collect::<Vec<_>>();
    let commands = merge_projection_views(
        canonical_commands,
        thread_read.get("commands"),
        same_command_projection,
    );
    let tool_calls = merge_projection_views(
        canonical_tool_calls,
        thread_read.get("tool_calls"),
        same_tool_call_projection,
    );
    let active_command_id = commands
        .iter()
        .rev()
        .find(|command| {
            command.get("status").and_then(serde_json::Value::as_str) == Some("running")
        })
        .and_then(|command| command.get("command_id"))
        .cloned()
        .unwrap_or(serde_json::Value::Null);

    thread_read.insert("active_command_id".to_string(), active_command_id);
    thread_read.insert(
        "commands".to_string(),
        serde_json::Value::Array(commands.clone()),
    );
    thread_read.insert(
        "tool_calls".to_string(),
        serde_json::Value::Array(tool_calls),
    );
    if let Some(diagnostics) = thread_read
        .get_mut("diagnostics")
        .and_then(serde_json::Value::as_object_mut)
    {
        diagnostics.insert("command_count".to_string(), json!(commands.len()));
    }
}

fn merge_projection_views(
    canonical: Vec<serde_json::Value>,
    current: Option<&serde_json::Value>,
    same_identity: fn(&serde_json::Value, &serde_json::Value) -> bool,
) -> Vec<serde_json::Value> {
    let mut current = current
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut merged = Vec::with_capacity(canonical.len().max(current.len()));

    for mut canonical_view in canonical {
        let Some(index) = current
            .iter()
            .position(|current_view| same_identity(&canonical_view, current_view))
        else {
            merged.push(canonical_view);
            continue;
        };
        let current_view = current.remove(index);
        if let (Some(canonical), Some(current)) =
            (canonical_view.as_object_mut(), current_view.as_object())
        {
            canonical.extend(current.clone());
        }
        merged.push(canonical_view);
    }
    merged.extend(current);
    merged
}

fn same_command_projection(left: &serde_json::Value, right: &serde_json::Value) -> bool {
    same_non_empty_string(left, right, &["command_id"])
        || (same_non_empty_string(left, right, &["turn_id"])
            && same_non_empty_string(
                left,
                right,
                &["command", "canonical_command", "command_summary"],
            ))
}

fn same_tool_call_projection(left: &serde_json::Value, right: &serde_json::Value) -> bool {
    same_non_empty_string(left, right, &["tool_call_id", "id"])
}

fn same_non_empty_string(
    left: &serde_json::Value,
    right: &serde_json::Value,
    keys: &[&str],
) -> bool {
    let left = keys.iter().find_map(|key| {
        left.get(*key)
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
    });
    let right = keys.iter().find_map(|key| {
        right
            .get(*key)
            .and_then(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
    });
    left.is_some() && left == right
}

fn canonical_command_view(item: &serde_json::Value) -> serde_json::Value {
    let command_id = item
        .pointer("/metadata/source_call_id")
        .and_then(serde_json::Value::as_str)
        .or_else(|| item.get("id").and_then(serde_json::Value::as_str))
        .unwrap_or_default();
    let command = item
        .get("command")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    json!({
        "command_id": command_id,
        "turn_id": item.get("turn_id").cloned().unwrap_or(serde_json::Value::Null),
        "status": canonical_view_status(item),
        "command": command,
        "canonical_command": command,
        "command_summary": command,
        "cwd": item.get("cwd").cloned().unwrap_or(serde_json::Value::Null),
        "aggregated_output": item.get("aggregated_output").cloned().unwrap_or(serde_json::Value::Null),
        "exit_code": item.get("exit_code").cloned().unwrap_or(serde_json::Value::Null),
        "sequence": item.get("sequence").cloned().unwrap_or(serde_json::Value::Null),
        "updated_at": item.get("updated_at").cloned().unwrap_or(serde_json::Value::Null),
        "metadata": item.get("metadata").cloned().unwrap_or(serde_json::Value::Null),
    })
}

fn canonical_tool_call_view(item: &serde_json::Value) -> serde_json::Value {
    let call_id = item
        .get("call_id")
        .and_then(serde_json::Value::as_str)
        .or_else(|| item.get("id").and_then(serde_json::Value::as_str))
        .unwrap_or_default();
    let mut view = serde_json::Map::from_iter([
        ("id".to_string(), json!(call_id)),
        ("tool_call_id".to_string(), json!(call_id)),
        ("status".to_string(), json!(canonical_view_status(item))),
        (
            "turn_id".to_string(),
            item.get("turn_id")
                .cloned()
                .unwrap_or(serde_json::Value::Null),
        ),
        (
            "timestamp".to_string(),
            item.get("updated_at")
                .cloned()
                .unwrap_or(serde_json::Value::Null),
        ),
    ]);
    for key in [
        "tool_name",
        "arguments",
        "structured_content",
        "output",
        "output_ref",
        "duration_ms",
        "error",
        "metadata",
    ] {
        if let Some(value) = item.get(key).cloned() {
            view.insert(key.to_string(), value);
        }
    }
    serde_json::Value::Object(view)
}

fn canonical_view_status(item: &serde_json::Value) -> &str {
    match item.get("status").and_then(serde_json::Value::as_str) {
        Some("in_progress") => "running",
        Some(status) => status,
        None => "unknown",
    }
}

fn agent_item_status(status: ItemStatus) -> &'static str {
    match status {
        ItemStatus::Pending | ItemStatus::InProgress => "in_progress",
        ItemStatus::Completed => "completed",
        ItemStatus::Failed | ItemStatus::Interrupted | ItemStatus::Cancelled => "failed",
    }
}

fn timestamp_from_millis(timestamp_ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(timestamp_ms)
        .unwrap_or(chrono::DateTime::UNIX_EPOCH)
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn apply_history_window(
    messages: Vec<serde_json::Value>,
    options: ReadDetailOptions,
) -> (Vec<serde_json::Value>, usize) {
    let mut messages = if let Some(before_message_id) = options.history_before_message_id {
        messages
            .into_iter()
            .filter(|message| {
                messages::message_numeric_id(message)
                    .map(|id| id < before_message_id)
                    .unwrap_or(true)
            })
            .collect::<Vec<_>>()
    } else {
        messages
    };
    let available = messages.len();
    let Some(limit) = options.history_limit else {
        return (messages, 0);
    };
    let end = available.saturating_sub(options.history_offset.min(available));
    let start = end.saturating_sub(limit);
    (messages.drain(start..end).collect(), start)
}

fn sort_read_detail_items(items: &mut [serde_json::Value]) {
    items.sort_by(|left, right| {
        let left_sequence = item_sequence(left);
        let right_sequence = item_sequence(right);
        left_sequence
            .cmp(&right_sequence)
            .then_with(|| item_timestamp(left).cmp(&item_timestamp(right)))
            .then_with(|| item_id(left).cmp(&item_id(right)))
    });
}

fn item_sequence(item: &serde_json::Value) -> u64 {
    item.get("sequence")
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(u64::MAX)
}

fn item_timestamp(item: &serde_json::Value) -> String {
    string_field(
        item,
        &["started_at", "updated_at", "completed_at", "created_at"],
    )
    .unwrap_or_default()
}

fn item_id(item: &serde_json::Value) -> String {
    string_field(item, &["id"]).unwrap_or_default()
}

fn runtime_thread_read_from_stored_session_with_usage_events(
    stored: &StoredSession,
    article_workspace: Option<serde_json::Value>,
    article_workspace_actions: Vec<serde_json::Value>,
    usage_projection_events: &[AgentEvent],
) -> serde_json::Value {
    let coding_activity = coding_activity_projection::coding_activity_from_events(stored);
    let permission_state = permission_state_projection::permission_state_from_events(stored);
    let model_routing = latest_model_routing_from_events(&stored.events);
    let service_model_slot = model_routing
        .as_ref()
        .and_then(|routing| string_field(routing, &["serviceModelSlot", "service_model_slot"]));
    let latest_turn_id = stored.turns.last().map(|turn| turn.turn_id.as_str());
    let latest_turn_error_message = latest_turn_error_message(stored, latest_turn_id);
    let provider_safety_buffering_count = stored
        .events
        .iter()
        .filter(|event| event.event_type == "provider_safety_buffering")
        .count();
    let latest_provider_safety_buffering =
        latest_provider_safety_buffering_from_events(&stored.events);
    let queued_turns = queued_turn_snapshots(stored);
    let pending_request_count = coding_activity.pending_requests.len();
    let runtime_state = resolve_agent_session_runtime_state(
        stored.session.status,
        pending_request_count,
        &stored.turns,
        &stored.events,
        chrono::Utc::now(),
    );
    let latest_turn_status = runtime_state.latest_turn_status.as_deref();
    let active_turn_id = runtime_state.active_turn_id.clone();
    let thread_status = runtime_state.thread_status.as_str();
    let command_count = coding_activity.commands.len();
    let test_count = coding_activity.tests.len();
    let changed_file_count = coding_activity
        .change_summary
        .as_ref()
        .and_then(|summary| summary.get("changed_file_count"))
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    let patch_count = coding_activity
        .change_summary
        .as_ref()
        .and_then(|summary| summary.get("patch_count"))
        .and_then(serde_json::Value::as_u64)
        .unwrap_or(0);
    let turns = read_model_turn_usage::turns_with_usage(&stored.turns, usage_projection_events);
    let latest_turn_usage =
        read_model_turn_usage::latest_usage_for_turn(usage_projection_events, latest_turn_id);
    let mut thread_read = json!({
        "session_id": stored.session.session_id,
        "thread_id": stored.session.thread_id,
        "status": thread_status,
        "execution_strategy": session_execution_strategy(&stored.session),
        "turns": turns,
        "pending_requests": coding_activity.pending_requests,
        "permission_state": permission_state,
        "queued_turns": queued_turns,
        "active_turn_id": active_turn_id,
        "active_command_id": coding_activity.active_command_id,
        "active_test_run_id": coding_activity.active_test_run_id,
        "active_action_id": coding_activity.active_action_id,
        "tool_calls": tool_item_projection::tool_calls_from_events(&stored.events),
        "commands": coding_activity.commands,
        "tests": coding_activity.tests,
        "change_summary": coding_activity.change_summary,
        "model_routing": model_routing.clone(),
        "service_model_slot": service_model_slot.clone(),
        "artifacts": artifact_projection::stored_artifact_summaries_for_turn(stored, None),
        "outputs": output_refs::read_model_outputs(stored.output_blobs.values(), None),
        "diagnostics": {
            "latest_turn_status": latest_turn_status,
            "latest_turn_error_message": latest_turn_error_message,
            "latest_turn_usage": latest_turn_usage.clone(),
            "provider_safety_buffering_count": provider_safety_buffering_count,
            "latest_provider_safety_buffering": latest_provider_safety_buffering.clone(),
            "pending_request_count": pending_request_count,
            "command_count": command_count,
            "test_count": test_count,
            "changed_file_count": changed_file_count,
            "patch_count": patch_count,
        },
        "runtime_summary": {
            "latestTurnStatus": latest_turn_status,
            "latestTurnErrorMessage": latest_turn_error_message,
            "latestTurnUsage": latest_turn_usage,
            "latestProviderSafetyBuffering": latest_provider_safety_buffering,
            "decisionSource": model_routing
                .as_ref()
                .and_then(|routing| string_field(routing, &["decisionSource", "decision_source"])),
            "serviceModelSlot": service_model_slot,
        },
    });
    if let Some(article_workspace) = article_workspace {
        if let Some(thread_read_object) = thread_read.as_object_mut() {
            thread_read_object.insert("article_workspace".to_string(), article_workspace.clone());
            thread_read_object.insert("articleWorkspace".to_string(), article_workspace);
        }
    }
    if !article_workspace_actions.is_empty() {
        if let Some(thread_read_object) = thread_read.as_object_mut() {
            thread_read_object.insert(
                "article_workspace_actions".to_string(),
                serde_json::Value::Array(article_workspace_actions.clone()),
            );
            thread_read_object.insert(
                "articleWorkspaceActions".to_string(),
                serde_json::Value::Array(article_workspace_actions),
            );
        }
    }
    thread_read
}

fn runtime_events_with_workflow_audit<'a>(
    stored: &'a StoredSession,
    workflow_audit_events: &'a [AgentEvent],
) -> Cow<'a, [AgentEvent]> {
    if workflow_audit_events.is_empty() {
        return Cow::Borrowed(&stored.events);
    }
    let mut events = Vec::with_capacity(stored.events.len() + workflow_audit_events.len());
    events.extend(stored.events.iter().cloned());
    events.extend(workflow_audit_events.iter().cloned());
    Cow::Owned(events)
}

pub(in crate::runtime) fn workflow_read_model_from_stored_session(
    stored: &StoredSession,
    workflow_audit_events: &[AgentEvent],
) -> WorkflowReadModel {
    let mut read_model = if workflow_audit_events.is_empty() {
        workflow_read_model_from_events(&stored.events)
    } else {
        let mut events = Vec::with_capacity(stored.events.len() + workflow_audit_events.len());
        events.extend(stored.events.iter().cloned());
        events.extend(workflow_audit_events.iter().cloned());
        workflow_read_model_from_events(&events)
    };
    workflow::retain_canonical_respond_actions(stored, &mut read_model);
    read_model
}

pub(super) fn replayed_action_required_from_stored_session(
    stored: &StoredSession,
    request_id: &str,
) -> Option<AgentSessionReplayedActionRequired> {
    let request_id = request_id.trim();
    if request_id.is_empty() {
        return None;
    }

    let mut resolved = false;
    for event in stored.events.iter().rev() {
        if event_request_id(&event.payload).as_deref() != Some(request_id) {
            continue;
        }
        match event.event_type.as_str() {
            "action.resolved" | "action.canceled" | "action.cancelled" | "action.expired" => {
                resolved = true;
            }
            "action.required" if !resolved => {
                return replayed_action_required_from_event(stored, event, request_id);
            }
            _ => {}
        }
    }
    None
}

fn replayed_action_required_from_event(
    stored: &StoredSession,
    event: &AgentEvent,
    request_id: &str,
) -> Option<AgentSessionReplayedActionRequired> {
    let action_type = event_action_type(&event.payload)?;
    let data = event.payload.get("data").unwrap_or(&event.payload);
    let prompt = string_field(data, &["prompt", "message"])
        .or_else(|| string_field(&event.payload, &["prompt", "message"]));
    Some(AgentSessionReplayedActionRequired {
        event_type: "action_required".to_string(),
        request_id: request_id.to_string(),
        action_type,
        tool_name: string_field(data, &["toolName", "tool_name"])
            .or_else(|| string_field(&event.payload, &["toolName", "tool_name"])),
        arguments: data
            .get("arguments")
            .cloned()
            .or_else(|| event.payload.get("arguments").cloned()),
        prompt,
        questions: data
            .get("questions")
            .cloned()
            .or_else(|| event.payload.get("questions").cloned()),
        requested_schema: data
            .get("requestedSchema")
            .cloned()
            .or_else(|| data.get("requested_schema").cloned())
            .or_else(|| event.payload.get("requestedSchema").cloned())
            .or_else(|| event.payload.get("requested_schema").cloned()),
        available_decisions: replayed_action_available_decisions(data, &event.payload),
        scope: replayed_action_scope(stored, event),
    })
}

fn replayed_action_available_decisions(
    data: &serde_json::Value,
    payload: &serde_json::Value,
) -> Option<Vec<AgentSessionApprovalDecision>> {
    let values = data
        .get("availableDecisions")
        .or_else(|| data.get("available_decisions"))
        .or_else(|| payload.get("availableDecisions"))
        .or_else(|| payload.get("available_decisions"))?;
    let decisions = values
        .as_array()?
        .iter()
        .filter_map(|value| value.as_str())
        .filter_map(|value| match value {
            "allow_once" => Some(AgentSessionApprovalDecision::AllowOnce),
            "allow_for_session" => Some(AgentSessionApprovalDecision::AllowForSession),
            "decline" => Some(AgentSessionApprovalDecision::Decline),
            "cancel" => Some(AgentSessionApprovalDecision::Cancel),
            _ => None,
        })
        .collect::<Vec<_>>();
    (!decisions.is_empty()).then_some(decisions)
}

fn replayed_action_scope(
    stored: &StoredSession,
    event: &AgentEvent,
) -> Option<AgentSessionActionScope> {
    let scope = event.payload.get("scope");
    let session_id = scope
        .and_then(|value| string_field(value, &["sessionId", "session_id"]))
        .or_else(|| Some(stored.session.session_id.clone()));
    let thread_id = scope
        .and_then(|value| string_field(value, &["threadId", "thread_id"]))
        .or_else(|| event.thread_id.clone())
        .or_else(|| Some(stored.session.thread_id.clone()));
    let turn_id = scope
        .and_then(|value| string_field(value, &["turnId", "turn_id"]))
        .or_else(|| event.turn_id.clone());
    if session_id.is_none() && thread_id.is_none() && turn_id.is_none() {
        return None;
    }
    Some(AgentSessionActionScope {
        session_id,
        thread_id,
        turn_id,
    })
}

fn event_action_type(payload: &serde_json::Value) -> Option<AgentSessionActionType> {
    match string_field(payload, &["actionType", "action_type"])?.as_str() {
        "tool_confirmation" => Some(AgentSessionActionType::ToolConfirmation),
        "ask_user" => Some(AgentSessionActionType::AskUser),
        "elicitation" => Some(AgentSessionActionType::Elicitation),
        _ => None,
    }
}
