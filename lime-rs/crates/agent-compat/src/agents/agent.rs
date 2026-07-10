use std::collections::HashMap;
use std::future::Future;
use std::panic::AssertUnwindSafe;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use chrono::{DateTime, Utc};
use futures::stream::BoxStream;
use futures::{future::join_all, stream, FutureExt, Stream, StreamExt, TryStreamExt};
use model_provider::provider_stream::{
    provider_stream_cancel_poll_interval, provider_stream_event_poll,
    provider_stream_failure_message_should_log_as_warning,
    provider_stream_failure_should_log_as_error, provider_stream_model_change,
    provider_stream_response_has_notification_text, provider_stream_response_text_chars,
    provider_stream_response_tool_input_delta_events, provider_stream_timeout_poll,
    ProviderStreamPoll, RuntimeReplyProviderFailure, RuntimeReplyProviderResponseContent,
    RuntimeReplyProviderStreamProgress, RuntimeReplyResponseEvent,
};
use uuid::Uuid;

use super::final_output_tool::FinalOutputTool;
use super::prompt_input_modalities::provider_prompt_messages_for_turn_context;
use super::provider_trace::{
    provider_trace_canceled, provider_trace_failed, provider_trace_first_event_received,
    provider_trace_first_text_delta_received, provider_trace_request_started, ProviderTraceEvent,
};
use super::tool_execution::{ToolCallResult, CHAT_MODE_TOOL_SKIPPED_RESPONSE, DECLINED_RESPONSE};
use crate::action_required_manager::ActionRequiredManager;
use crate::agents::extension::{ExtensionConfig, ExtensionResult, ToolInfo};
use crate::agents::extension_manager::{get_parameter_names, ExtensionManager};
use crate::agents::extension_manager_extension::MANAGE_EXTENSIONS_TOOL_NAME_COMPLETE;
use crate::agents::final_output_tool::{FINAL_OUTPUT_CONTINUATION_MESSAGE, FINAL_OUTPUT_TOOL_NAME};
use crate::agents::prompt_manager::PromptManager;
use crate::agents::retry::{RetryManager, RetryResult};
use crate::agents::subagent_task_config::TaskConfig;
use crate::agents::subagent_tool::{create_subagent_tool, handle_subagent_tool, AGENT_TOOL_NAME};
use crate::agents::types::SessionConfig;
use crate::agents::types::{
    FrontendTool, PermissionRequestHookHandler, SharedProvider, ToolResultReceiver,
};
use crate::agents::ContextTraceStep;
use crate::config::{AsterMode, Config};
use crate::conversation::message::{
    ActionRequired, ActionRequiredData, ActionRequiredScope, Message, MessageContent,
    ProviderMetadata, SystemNotificationType, ThinkingContent, ToolRequest, ToolResponse,
};
use crate::conversation::{debug_conversation_fix, fix_conversation, Conversation};
use crate::model::ModelConfig;
use crate::permission::permission_inspector::PermissionInspector;
use crate::permission::permission_judge::PermissionCheckResult;
use crate::permission::PermissionConfirmation;
use crate::providers::base::{Provider, SessionNameGenerationExecutionStrategy};
use crate::providers::errors::ProviderError;
use crate::recipe::{Response, SubRecipe};
use crate::session::{
    apply_session_update, load_managed_session_runtime_snapshot, query_session,
    replace_session_conversation, require_shared_session_runtime_store, EnabledExtensionsState,
    ExtensionState, InMemoryThreadRuntimeStore, ItemRuntime, ItemRuntimePayload, ItemStatus,
    Session, SessionManager, SessionRuntimeSnapshot, SessionStore, SessionType,
    TeamMembershipState, TeamSessionState, ThreadRuntime, ThreadRuntimeStore, TurnContextOverride,
    TurnOutputSchemaRuntime, TurnOutputSchemaSource, TurnOutputSchemaStrategy, TurnRuntime,
    TurnStatus,
};
use crate::tool_inspection::ToolInspectionManager;
use crate::tool_inspection::ToolInspector;
use crate::tools::{
    execute_agent_control_runtime_tool, execute_request_user_input_runtime_tool,
    execute_team_runtime_tool, register_all_tools, AgentControlToolConfig, AskCallback, AskTool,
    SharedFileReadHistory, ToolContext, ToolError, ToolRegistrationConfig, ToolRegistry,
    DEFAULT_ASK_TIMEOUT_SECS,
};
use rmcp::model::{
    CallToolRequestParam, CallToolResult, Content, ErrorCode, ErrorData, GetPromptResult, Prompt,
    ServerNotification, TextContent, Tool,
};
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::{mpsc, Mutex, RwLock};
use tokio_util::sync::CancellationToken;
use tool_runtime::collab_agent::{
    collab_agent_canonical_tool_name, collab_agent_tool_definition, CollabAgentSurfaceError,
    CollabAgentSurfaceErrorKind, RuntimeCollabToolOutput, SpawnAgentRequest, SpawnAgentResponse,
    AGENT_TOOL_NAME as COLLAB_AGENT_TOOL_NAME, LIST_PEERS_TOOL_NAME, SEND_MESSAGE_TOOL_NAME,
    TEAM_CREATE_TOOL_NAME, TEAM_DELETE_TOOL_NAME,
};
use tool_runtime::file_read_execution::RuntimeFileReadRequest;
use tool_runtime::file_search_execution::RuntimeFileSearchRequest;
use tool_runtime::native_dispatch_execution::RuntimeNativeDispatchToolRequest;
use tool_runtime::request_user_input::REQUEST_USER_INPUT_TOOL_NAME;
use tool_runtime::shell_execution::RuntimeShellToolRequest;
use tool_runtime::tool_batch::{
    partition_tool_execution_requests, runtime_tool_call_concurrency_safe,
};
use tool_runtime::tool_definition::RuntimeToolDefinition;
use tool_runtime::tool_executor::RuntimeToolTurnContext;
use tool_runtime::tool_result_projection::{
    runtime_tool_result_surface_updated, runtime_tool_result_to_call_tool_result,
    RuntimeToolResultParts,
};
use tool_runtime::turn_tool_surface::{
    runtime_registered_tool_exposure_allows_tool_name, runtime_tool_surface_gates,
    runtime_turn_tool_exposure_allows_tool_name, RuntimeToolSurfaceGates,
};
use tracing::{debug, error, info, instrument, warn};

type ToolResult<T> = Result<T, ErrorData>;

struct OverflowHandler {
    max_attempts: usize,
    attempts: usize,
}

impl OverflowHandler {
    fn new(max_attempts: usize) -> Self {
        Self {
            max_attempts,
            attempts: 0,
        }
    }

    fn reset(&mut self) {
        self.attempts = 0;
    }

    fn can_retry(&self) -> bool {
        self.attempts < self.max_attempts
    }

    fn compaction_attempts(&self) -> usize {
        self.attempts
    }

    fn note_compaction_attempt(&mut self) -> Result<()> {
        if self.attempts >= self.max_attempts {
            return Err(anyhow!("maximum context compaction attempts reached"));
        }
        self.attempts += 1;
        Ok(())
    }
}

fn provider_failure(error: &ProviderError) -> RuntimeReplyProviderFailure {
    RuntimeReplyProviderFailure::from_category(
        error.telemetry_type(),
        error.is_retryable(),
        error.is_non_retryable_provider_rejection(),
    )
}

fn should_log_provider_failure_as_error(error: &ProviderError) -> bool {
    provider_stream_failure_should_log_as_error(provider_failure(error))
}

fn should_log_session_description_failure_as_warning(error: &anyhow::Error) -> bool {
    if let Some(provider_error) = error.downcast_ref::<ProviderError>() {
        return should_log_provider_failure_as_error(provider_error);
    }

    provider_stream_failure_message_should_log_as_warning(error.to_string())
}

fn log_session_description_failure(error: &anyhow::Error) {
    if should_log_session_description_failure_as_warning(error) {
        warn!("Failed to generate session description: {}", error);
    } else {
        debug!(
            "Skipped session description because provider rejected the request: {}",
            error
        );
    }
}

const DEFAULT_MAX_TURNS: u32 = 1000;
const MAX_REPLY_TURNS_REACHED_MESSAGE: &str =
    "I've reached the maximum number of actions I can do without user input. Would you like me to continue?";
const COMPACTION_THINKING_TEXT: &str = "aster is compacting the conversation...";
const CONTEXT_COMPACTION_WARNING_TEXT: &str =
    "长对话和多次上下文压缩会降低模型准确性；如果后续结果开始漂移，建议新开会话。";
const CANCELLED_TURN_CONTEXT_MARKER: &str =
    "上一回合已被用户停止，不要继续回答被停止的请求；等待并仅处理后续用户消息。";
const AUTO_COMPACTION_DISABLED_CONTEXT_LIMIT_TEXT: &str =
    "Automatic compaction is disabled for this turn. The conversation reached the context limit. Compact the session manually or start a new session before retrying.";
const PROPOSED_PLAN_OPEN: &str = "<proposed_plan>";
const PROPOSED_PLAN_CLOSE: &str = "</proposed_plan>";
const FILE_ARTIFACT_METADATA_KEYS: [&str; 9] = [
    "path",
    "file_path",
    "filePath",
    "output_file",
    "output_path",
    "outputPath",
    "artifact_path",
    "artifact_paths",
    "absolute_path",
];

fn cancelled_turn_context_marker_message() -> Message {
    Message::assistant()
        .with_text(CANCELLED_TURN_CONTEXT_MARKER)
        .agent_only()
}

#[derive(Debug, Clone)]
struct ResolvedOutputSchema {
    schema: Value,
    source: TurnOutputSchemaSource,
}

#[derive(Debug, Deserialize)]
struct CurrentAgentToolRequest {
    description: String,
    prompt: String,
    #[serde(default)]
    subagent_type: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    run_in_background: bool,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    team_name: Option<String>,
    #[serde(default)]
    mode: Option<String>,
    #[serde(default)]
    isolation: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    allowed_tools: Vec<String>,
    #[serde(default)]
    disallowed_tools: Vec<String>,
}

#[derive(Debug)]
struct CallbackBackedAgentSpawn {
    request: CurrentAgentToolRequest,
    spawn_request: SpawnAgentRequest,
    description: String,
    prompt: String,
}

fn default_ask_callback() -> crate::tools::AskCallback {
    Arc::new(|request| {
        Box::pin(async move {
            let scope = crate::session_context::current_action_scope().unwrap_or_else(|| {
                let session_id = crate::session_context::current_session_id();
                ActionRequiredScope {
                    session_id: session_id.clone(),
                    thread_id: session_id,
                    turn_id: None,
                }
            });

            match ActionRequiredManager::global()
                .request_and_wait_scoped(
                    scope,
                    AskTool::build_elicitation_message(&request),
                    AskTool::build_elicitation_schema(&request),
                    Duration::from_secs(DEFAULT_ASK_TIMEOUT_SECS),
                )
                .await
            {
                Ok(user_data) => Some(user_data),
                Err(error) => {
                    warn!(?error, "request_user_input elicitation failed");
                    None
                }
            }
        })
    })
}

fn extract_proposed_plan_block(text: &str) -> Option<String> {
    let start = text.find(PROPOSED_PLAN_OPEN)?;
    let remainder = text.get(start + PROPOSED_PLAN_OPEN.len()..)?;
    let end = remainder.find(PROPOSED_PLAN_CLOSE)?;
    let content = remainder.get(..end)?.trim();
    if content.is_empty() {
        None
    } else {
        Some(content.to_string())
    }
}

fn tool_request_is_concurrency_safe(request: &ToolRequest) -> bool {
    let Ok(tool_call) = &request.tool_call else {
        return false;
    };
    runtime_tool_call_concurrency_safe(
        tool_call.name.as_ref(),
        tool_call
            .arguments
            .as_ref()
            .and_then(|arguments| arguments.get("command"))
            .and_then(Value::as_str),
    )
}

fn is_assistant_phase_summary_heading_line(line: &str) -> bool {
    let trimmed = line.trim();
    if trimmed == "阶段结论" {
        return true;
    }

    let without_hashes = trimmed.trim_start_matches('#').trim();
    without_hashes == "阶段结论" && without_hashes != trimmed
}

fn strip_assistant_phase_summary_title(text: &str) -> String {
    let mut sanitized_lines = Vec::new();
    let mut lines = text.lines().peekable();

    while let Some(line) = lines.next() {
        let trimmed = line.trim();
        if is_assistant_phase_summary_heading_line(trimmed) {
            while lines.peek().is_some_and(|next| next.trim().is_empty()) {
                lines.next();
            }
            continue;
        }

        if let Some(detail) = trimmed
            .strip_prefix("阶段结论：")
            .or_else(|| trimmed.strip_prefix("阶段结论:"))
        {
            let normalized_detail = detail.trim_start();
            if normalized_detail.is_empty() {
                continue;
            }

            let indent_width = line.len() - line.trim_start().len();
            let indent = &line[..indent_width];
            sanitized_lines.push(format!("{indent}{normalized_detail}"));
            continue;
        }

        sanitized_lines.push(line.to_string());
    }

    sanitized_lines.join("\n").trim().to_string()
}

fn build_reasoning_summary_sections(text: &str) -> Option<Vec<String>> {
    let sections = text
        .split("\n\n")
        .map(str::trim)
        .filter(|section| !section.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    if sections.is_empty() {
        None
    } else {
        Some(sections)
    }
}

fn should_expose_registered_tool_with_gates(
    name: &str,
    resources_supported: bool,
    tool_gates: RuntimeToolSurfaceGates,
) -> bool {
    runtime_registered_tool_exposure_allows_tool_name(name, resources_supported, tool_gates)
}

fn allowed_tool_names_allow_collab_tool(
    allowed_tool_names: Option<&[String]>,
    tool_name: &str,
) -> bool {
    let Some(allowed_tool_names) = allowed_tool_names else {
        return true;
    };

    allowed_tool_names.iter().any(|allowed| {
        allowed.eq_ignore_ascii_case(tool_name)
            || collab_agent_canonical_tool_name(allowed)
                .is_some_and(|canonical| canonical.eq_ignore_ascii_case(tool_name))
    })
}

fn should_expose_tool_for_session_with_gates(
    name: &str,
    session_type: Option<SessionType>,
    resources_supported: bool,
    tool_gates: RuntimeToolSurfaceGates,
    subagent_teammate_tools_enabled: bool,
) -> bool {
    runtime_turn_tool_exposure_allows_tool_name(
        name,
        matches!(session_type, Some(SessionType::SubAgent)),
        resources_supported,
        tool_gates,
        subagent_teammate_tools_enabled,
        AGENT_TOOL_NAME,
        FINAL_OUTPUT_TOOL_NAME,
    )
}

fn session_allows_subagent_teammate_tools(session: &Session) -> bool {
    matches!(session.session_type, SessionType::SubAgent)
        && (TeamMembershipState::from_session(session).is_some()
            || TeamSessionState::from_session(session).is_some())
}

fn cancel_token_cancelled(token: &Option<CancellationToken>) -> bool {
    token.as_ref().is_some_and(CancellationToken::is_cancelled)
}

fn insert_runtime_turn_identity_if_absent(
    metadata: &mut HashMap<String, Value>,
    key: &str,
    value: String,
) {
    let value = value.trim();
    if value.is_empty() {
        return;
    }
    metadata
        .entry(key.to_string())
        .or_insert_with(|| Value::String(value.to_string()));
}

fn runtime_tool_turn_context_from_current_session() -> Option<RuntimeToolTurnContext> {
    let mut turn_context =
        crate::session_context::current_turn_context().map(|context| RuntimeToolTurnContext {
            cwd: context.cwd,
            model: context.model,
            effort: context.effort,
            approval_policy: context.approval_policy,
            sandbox_policy: context.sandbox_policy,
            collaboration_mode: context.collaboration_mode,
            user_visible_input_text: context.user_visible_input_text,
            output_schema: context.output_schema,
            output_schema_source: None,
            metadata: context.metadata,
        });
    let had_turn_context = turn_context.is_some();
    let context = turn_context.get_or_insert_with(RuntimeToolTurnContext::default);

    if let Some(session_id) = crate::session_context::current_session_id() {
        insert_runtime_turn_identity_if_absent(&mut context.metadata, "session_id", session_id);
    }
    if let Some(scope) = crate::session_context::current_action_scope() {
        if let Some(session_id) = scope.session_id {
            insert_runtime_turn_identity_if_absent(&mut context.metadata, "session_id", session_id);
        }
        if let Some(thread_id) = scope.thread_id {
            insert_runtime_turn_identity_if_absent(&mut context.metadata, "thread_id", thread_id);
        }
        if let Some(turn_id) = scope.turn_id {
            insert_runtime_turn_identity_if_absent(&mut context.metadata, "turn_id", turn_id);
        }
    }

    if had_turn_context || !context.metadata.is_empty() {
        turn_context
    } else {
        None
    }
}

async fn execute_runtime_native_dispatch_tool(
    tool_name: &str,
    params: &Value,
    context: &ToolContext,
) -> Option<ToolCallResult> {
    let turn_context = runtime_tool_turn_context_from_current_session();
    tool_runtime::native_dispatch_execution::execute_runtime_native_dispatch_tool(
        RuntimeNativeDispatchToolRequest {
            tool_name,
            params,
            working_directory: context.working_directory.clone(),
            session_id: context.session_id.clone(),
            cancel_token: context.cancellation_token.clone(),
            turn_context: turn_context.as_ref(),
        },
    )
    .await
    .map(ToolCallResult::from)
}

async fn execute_runtime_shell_tool(
    tool_name: &str,
    params: &Value,
    context: &ToolContext,
) -> Option<ToolCallResult> {
    let turn_context = runtime_tool_turn_context_from_current_session();
    tool_runtime::shell_execution::execute_runtime_shell_tool(RuntimeShellToolRequest {
        tool_name,
        params,
        working_directory: context.working_directory.clone(),
        session_id: context.session_id.clone(),
        environment: context.environment.clone(),
        has_workspace_sandbox: context.workspace_sandbox.is_some(),
        cancel_token: context.cancellation_token.clone(),
        turn_context: turn_context.as_ref(),
    })
    .await
    .map(ToolCallResult::from)
}

async fn execute_runtime_file_read_tool(
    tool_name: &str,
    params: &Value,
    context: &ToolContext,
) -> Option<ToolCallResult> {
    tool_runtime::file_read_execution::execute_runtime_file_read_tool(RuntimeFileReadRequest {
        tool_name,
        params,
        working_directory: context.working_directory.clone(),
        cancel_token: context.cancellation_token.clone(),
    })
    .await
    .map(ToolCallResult::from)
}

async fn execute_runtime_file_search_tool(
    tool_name: &str,
    params: &Value,
    context: &ToolContext,
) -> Option<ToolCallResult> {
    tool_runtime::file_search_execution::execute_runtime_file_search_tool(
        RuntimeFileSearchRequest {
            tool_name,
            params,
            working_directory: context.working_directory.clone(),
            cancel_token: context.cancellation_token.clone(),
        },
    )
    .await
    .map(ToolCallResult::from)
}

fn tool_error_to_error_data(error: ToolError) -> ErrorData {
    let code = match error {
        ToolError::InvalidParams(_) => ErrorCode::INVALID_PARAMS,
        _ => ErrorCode::INTERNAL_ERROR,
    };
    ErrorData::new(code, error.to_string(), None)
}

async fn execute_runtime_request_user_input_tool(
    tool_name: &str,
    params: &Value,
    ask_callback: Option<&AskCallback>,
) -> Option<ToolCallResult> {
    if tool_name != REQUEST_USER_INPUT_TOOL_NAME {
        return None;
    }

    let execution = execute_request_user_input_runtime_tool(
        params.clone(),
        ask_callback,
        Duration::from_secs(DEFAULT_ASK_TIMEOUT_SECS),
    )
    .await;

    Some(match execution {
        Ok(projection) => {
            let metadata = projection.metadata.into_iter().collect();
            ToolCallResult::from(Ok(runtime_tool_result_to_call_tool_result(
                RuntimeToolResultParts {
                    success: true,
                    output: Some(projection.output),
                    error: None,
                    metadata,
                },
            )))
        }
        Err(error) => ToolCallResult::from(Err(tool_error_to_error_data(error))),
    })
}

fn collab_error_to_error_data(error: CollabAgentSurfaceError) -> ErrorData {
    let code = match error.kind() {
        CollabAgentSurfaceErrorKind::InvalidParams => ErrorCode::INVALID_PARAMS,
        CollabAgentSurfaceErrorKind::ExecutionFailed => ErrorCode::INTERNAL_ERROR,
    };
    ErrorData::new(code, error.message().to_string(), None)
}

fn collab_output_to_tool_call_result(
    tool_name: &str,
    output: RuntimeCollabToolOutput,
) -> ToolCallResult {
    let mut metadata = HashMap::new();
    if matches!(
        tool_name,
        TEAM_CREATE_TOOL_NAME | TEAM_DELETE_TOOL_NAME | LIST_PEERS_TOOL_NAME
    ) {
        metadata.extend(output.metadata);
    } else {
        metadata.insert(
            output.metadata_key.to_string(),
            Value::Object(output.metadata),
        );
    }

    ToolCallResult::from(Ok(runtime_tool_result_to_call_tool_result(
        RuntimeToolResultParts {
            success: true,
            output: Some(output.output),
            error: None,
            metadata,
        },
    )))
}

async fn execute_runtime_collab_tool(
    tool_name: &str,
    params: &Value,
    session_id: &str,
    agent_control_tools: Option<&AgentControlToolConfig>,
) -> Option<ToolCallResult> {
    let params = params.clone();
    let execution = match tool_name {
        SEND_MESSAGE_TOOL_NAME => {
            execute_agent_control_runtime_tool(tool_name, params, session_id, agent_control_tools)
                .await
        }
        TEAM_CREATE_TOOL_NAME | TEAM_DELETE_TOOL_NAME | LIST_PEERS_TOOL_NAME => {
            execute_team_runtime_tool(tool_name, params, session_id).await
        }
        _ => None,
    }?;

    Some(match execution {
        Ok(output) => collab_output_to_tool_call_result(tool_name, output),
        Err(error) => ToolCallResult::from(Err(collab_error_to_error_data(error))),
    })
}

fn collect_string_values(value: &Value) -> Vec<String> {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                Vec::new()
            } else {
                vec![trimmed.to_string()]
            }
        }
        Value::Array(items) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn push_unique_file_path(target: &mut Vec<String>, raw: &str) {
    let trimmed = raw.trim();
    if trimmed.is_empty() || target.iter().any(|item| item == trimmed) {
        return;
    }
    target.push(trimmed.to_string());
}

fn extract_file_artifacts(metadata: Option<&Value>) -> Vec<(String, Option<String>)> {
    let Some(object) = metadata.and_then(Value::as_object) else {
        return Vec::new();
    };

    let mut paths = Vec::new();
    for key in FILE_ARTIFACT_METADATA_KEYS {
        let Some(value) = object.get(key) else {
            continue;
        };
        for path in collect_string_values(value) {
            push_unique_file_path(&mut paths, path.as_str());
        }
    }

    let artifact_ids = object
        .get("artifact_ids")
        .map(collect_string_values)
        .unwrap_or_default();
    let single_artifact_id = object
        .get("artifact_id")
        .or_else(|| object.get("artifactId"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    paths
        .into_iter()
        .enumerate()
        .map(|(index, path)| {
            (
                path,
                artifact_ids.get(index).cloned().or_else(|| {
                    if index == 0 {
                        single_artifact_id.clone()
                    } else {
                        None
                    }
                }),
            )
        })
        .collect()
}

fn resolve_file_artifact_status(metadata: Option<&Value>) -> ItemStatus {
    let write_phase = metadata
        .and_then(|value| value.get("writePhase"))
        .and_then(Value::as_str);
    if matches!(write_phase, Some("failed")) {
        return ItemStatus::Failed;
    }

    match metadata
        .and_then(|value| value.get("complete"))
        .and_then(Value::as_bool)
    {
        Some(false) => ItemStatus::InProgress,
        _ => ItemStatus::Completed,
    }
}

fn resolve_file_artifact_source(metadata: Option<&Value>) -> String {
    metadata
        .and_then(|value| value.get("lastUpdateSource"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| "tool_result".to_string())
}

fn extract_tool_result_metadata<T: serde::Serialize>(result: &T) -> Option<Value> {
    fn find_metadata(value: &Value, depth: usize) -> Option<Value> {
        const JSON_RECURSION_LIMIT: usize = 16;

        if depth >= JSON_RECURSION_LIMIT {
            return None;
        }

        let object = value.as_object()?;

        for key in [
            "metadata",
            "meta",
            "_meta",
            "structured_content",
            "structuredContent",
        ] {
            let Some(nested) = object.get(key) else {
                continue;
            };

            if let Some(record) = nested.as_object() {
                if !record.is_empty() {
                    return Some(Value::Object(record.clone()));
                }
            }

            if let Some(found) = find_metadata(nested, depth + 1) {
                return Some(found);
            }
        }

        for nested in object.values() {
            if let Some(found) = find_metadata(nested, depth + 1) {
                return Some(found);
            }
        }

        None
    }

    serde_json::to_value(result)
        .ok()
        .and_then(|value| find_metadata(&value, 0))
}

fn string_list_from_metadata(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_string)
            .collect(),
        Some(Value::String(item)) => item
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

fn metadata_string_matches(actual: Option<&Value>, expected: &str) -> bool {
    actual
        .and_then(Value::as_str)
        .map(str::trim)
        .is_some_and(|actual| actual.eq_ignore_ascii_case(expected.trim()))
}

fn tool_result_metadata_matches_stop_rule(metadata: &Value, rule: &Value) -> bool {
    let Some(rule) = rule.as_object() else {
        return false;
    };

    if let Some(expected) = rule
        .get("metadata_equals")
        .or_else(|| rule.get("metadataEquals"))
        .and_then(Value::as_object)
    {
        let all_matched = expected.iter().all(|(key, expected_value)| {
            expected_value
                .as_str()
                .map(|expected_text| metadata_string_matches(metadata.get(key), expected_text))
                .unwrap_or_else(|| metadata.get(key) == Some(expected_value))
        });
        if !all_matched {
            return false;
        }
    }

    let required_keys = string_list_from_metadata(
        rule.get("require_any")
            .or_else(|| rule.get("requireAny"))
            .or_else(|| rule.get("required_any"))
            .or_else(|| rule.get("requiredAny")),
    );
    if !required_keys.is_empty() {
        let has_required = required_keys.iter().any(|key| {
            metadata.get(key).is_some_and(|value| match value {
                Value::Null => false,
                Value::String(text) => !text.trim().is_empty(),
                _ => true,
            })
        });
        if !has_required {
            return false;
        }
    }

    let statuses = string_list_from_metadata(
        rule.get("statuses")
            .or_else(|| rule.get("status_values"))
            .or_else(|| rule.get("statusValues")),
    );
    if !statuses.is_empty() {
        let Some(actual_status) = metadata
            .get("status")
            .and_then(Value::as_str)
            .map(str::trim)
        else {
            return false;
        };
        if !statuses
            .iter()
            .any(|expected| actual_status.eq_ignore_ascii_case(expected))
        {
            return false;
        }
    }

    true
}

fn should_stop_after_tool_result(
    turn_context: Option<&TurnContextOverride>,
    messages_to_add: &Conversation,
) -> bool {
    let Some(stop_rule) = turn_context
        .and_then(|context| context.metadata.get("runtime_control"))
        .or_else(|| turn_context.and_then(|context| context.metadata.get("runtimeControl")))
        .and_then(|control| {
            control
                .get("stop_after_tool_result")
                .or_else(|| control.get("stopAfterToolResult"))
        })
    else {
        return false;
    };

    messages_to_add.messages().iter().any(|message| {
        message.content.iter().any(|content| {
            let MessageContent::ToolResponse(tool_response) = content else {
                return false;
            };
            let Ok(result) = tool_response.tool_result.as_ref() else {
                return false;
            };
            let Some(metadata) = extract_tool_result_metadata(result) else {
                return false;
            };
            tool_result_metadata_matches_stop_rule(&metadata, stop_rule)
        })
    })
}

fn normalize_agent_optional_text(value: Option<String>) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn require_agent_text(value: String, field_name: &str) -> Result<String, ErrorData> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(ErrorData::new(
            ErrorCode::INVALID_PARAMS,
            format!("{field_name} cannot be empty"),
            None,
        ));
    }

    Ok(trimmed.to_string())
}

fn normalize_agent_cwd(value: Option<String>) -> Result<Option<String>, ErrorData> {
    let Some(cwd) = normalize_agent_optional_text(value) else {
        return Ok(None);
    };

    let path = std::path::Path::new(&cwd);
    if !path.is_absolute() {
        return Err(ErrorData::new(
            ErrorCode::INVALID_PARAMS,
            "cwd must be an absolute path".to_string(),
            None,
        ));
    }
    if !path.is_dir() {
        return Err(ErrorData::new(
            ErrorCode::INVALID_PARAMS,
            format!("cwd is not a directory: {cwd}"),
            None,
        ));
    }

    Ok(Some(cwd))
}

fn normalize_agent_tool_list(values: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();
    let mut seen = std::collections::BTreeSet::new();

    for value in values {
        let Some(item) = normalize_agent_optional_text(Some(value.clone())) else {
            continue;
        };
        if seen.insert(item.clone()) {
            normalized.push(item);
        }
    }

    normalized
}

fn parse_current_agent_tool_request(
    arguments: Value,
) -> Result<CurrentAgentToolRequest, ErrorData> {
    serde_json::from_value(arguments).map_err(|error| {
        ErrorData::new(
            ErrorCode::INVALID_PARAMS,
            format!("Invalid parameters: {error}"),
            None,
        )
    })
}

fn prepare_callback_backed_agent_spawn(
    request: CurrentAgentToolRequest,
    session: &Session,
) -> Result<Option<CallbackBackedAgentSpawn>, ErrorData> {
    let mode = normalize_agent_optional_text(request.mode.clone());
    let isolation = normalize_agent_optional_text(request.isolation.clone());
    let name = normalize_agent_optional_text(request.name.clone());
    let team_name = normalize_agent_optional_text(request.team_name.clone());
    let cwd = normalize_agent_cwd(request.cwd.clone())?;
    let allowed_tools = normalize_agent_tool_list(&request.allowed_tools);
    let disallowed_tools = normalize_agent_tool_list(&request.disallowed_tools);
    let team_subagent = session_allows_subagent_teammate_tools(session);
    if team_subagent && request.run_in_background {
        return Err(ErrorData::new(
            ErrorCode::INVALID_PARAMS,
            "Team subagents cannot spawn background agents in the current runtime".to_string(),
            None,
        ));
    }
    if team_subagent && (name.is_some() || team_name.is_some()) {
        return Err(ErrorData::new(
            ErrorCode::INVALID_PARAMS,
            "Team subagents cannot spawn teammates in the current runtime; omit name and team_name"
                .to_string(),
            None,
        ));
    }

    let should_use_callback = !team_subagent;
    if !should_use_callback {
        return Ok(None);
    }
    if team_name.is_some() && name.is_none() {
        return Err(ErrorData::new(
            ErrorCode::INVALID_PARAMS,
            "team_name requires name in the current runtime".to_string(),
            None,
        ));
    }

    let description = require_agent_text(request.description.clone(), "description")?;
    let prompt = require_agent_text(request.prompt.clone(), "prompt")?;
    let spawn_request = SpawnAgentRequest {
        parent_session_id: session.id.clone(),
        message: prompt.clone(),
        name,
        team_name,
        agent_type: normalize_agent_optional_text(request.subagent_type.clone()),
        model: normalize_agent_optional_text(request.model.clone()),
        run_in_background: request.run_in_background,
        reasoning_effort: None,
        fork_context: false,
        blueprint_role_id: None,
        blueprint_role_label: None,
        profile_id: None,
        profile_name: None,
        role_key: None,
        skill_ids: Vec::new(),
        skill_directories: Vec::new(),
        team_preset_id: None,
        theme: None,
        system_overlay: None,
        output_contract: None,
        hooks: None,
        allowed_tools,
        disallowed_tools,
        mode,
        isolation,
        cwd,
    };

    Ok(Some(CallbackBackedAgentSpawn {
        request,
        spawn_request,
        description,
        prompt,
    }))
}

fn build_async_agent_call_result(
    request: &CurrentAgentToolRequest,
    response: &SpawnAgentResponse,
    description: String,
    prompt: String,
) -> CallToolResult {
    let mut structured = serde_json::Map::new();
    structured.insert(
        "status".to_string(),
        Value::String("async_launched".to_string()),
    );
    structured.insert(
        "agentId".to_string(),
        Value::String(response.agent_id.clone()),
    );
    structured.insert("description".to_string(), Value::String(description));
    structured.insert("prompt".to_string(), Value::String(prompt));
    structured.insert(
        "outputFile".to_string(),
        response
            .extra
            .get("outputFile")
            .or_else(|| response.extra.get("output_file"))
            .cloned()
            .unwrap_or_else(|| Value::String(String::new())),
    );
    structured.insert(
        "canReadOutputFile".to_string(),
        response
            .extra
            .get("canReadOutputFile")
            .or_else(|| response.extra.get("can_read_output_file"))
            .cloned()
            .unwrap_or(Value::Bool(false)),
    );
    if let Some(name) = normalize_agent_optional_text(request.name.clone()) {
        structured.insert("name".to_string(), Value::String(name));
    }
    if let Some(team_name) = normalize_agent_optional_text(request.team_name.clone()) {
        structured.insert("teamName".to_string(), Value::String(team_name));
    }
    if let Some(agent_type) = normalize_agent_optional_text(request.subagent_type.clone()) {
        structured.insert("agentType".to_string(), Value::String(agent_type));
    }

    CallToolResult {
        content: vec![Content::text(format!(
            "Agent launched: {}",
            response.agent_id
        ))],
        structured_content: Some(Value::Object(structured)),
        is_error: Some(false),
        meta: None,
    }
}

/// Context needed for the reply function
pub struct ReplyContext {
    pub conversation: Conversation,
    pub tools: Vec<Tool>,
    pub toolshim_tools: Vec<Tool>,
    pub system_prompt: String,
    pub model_config: ModelConfig,
    pub aster_mode: AsterMode,
    pub initial_messages: Vec<Message>,
    pub context_trace: Vec<ContextTraceStep>,
}

pub struct ToolCategorizeResult {
    pub frontend_requests: Vec<ToolRequest>,
    pub remaining_requests: Vec<ToolRequest>,
    pub filtered_response: Message,
    pub normalized_response: Message,
}

/// The main aster Agent
pub struct Agent {
    pub(super) provider: SharedProvider,

    pub extension_manager: Arc<ExtensionManager>,
    pub(super) session_type_hint: RwLock<Option<SessionType>>,
    pub(super) sub_recipes: Mutex<HashMap<String, SubRecipe>>,
    pub(super) session_output_schema: Arc<Mutex<Option<Value>>>,
    pub(super) final_output_tool: Arc<Mutex<Option<FinalOutputTool>>>,
    pub(super) frontend_tools: Mutex<HashMap<String, FrontendTool>>,
    pub(super) frontend_instructions: Mutex<Option<String>>,
    pub(super) prompt_manager: Mutex<PromptManager>,
    pub(super) confirmation_tx: mpsc::Sender<(String, PermissionConfirmation)>,
    pub(super) confirmation_rx: Mutex<mpsc::Receiver<(String, PermissionConfirmation)>>,
    pub(super) tool_result_tx: mpsc::Sender<(String, ToolResult<CallToolResult>)>,
    pub(super) tool_result_rx: ToolResultReceiver,

    pub(super) retry_manager: RetryManager,
    pub(super) tool_inspection_manager: ToolInspectionManager,
    pub(super) permission_request_hook_handler: Option<PermissionRequestHookHandler>,

    /// Tool registry for native tools (Requirements: 11.3, 11.4, 11.5)
    pub(super) tool_registry: Arc<RwLock<ToolRegistry>>,
    /// Shared file read history for file tools
    pub(super) file_read_history: SharedFileReadHistory,

    /// 可选的 session 存储
    ///
    /// 如果设置，Agent 会使用此存储保存消息。
    /// 如果未设置，会回退到全局 SessionManager（向后兼容）。
    pub(super) session_store: Option<Arc<dyn SessionStore>>,
    pub(super) thread_runtime_store: Arc<dyn ThreadRuntimeStore>,
    pub(super) ask_callback: Option<AskCallback>,
    pub(super) agent_control_tools: Option<AgentControlToolConfig>,
    pub(super) allowed_tool_names: Option<Vec<String>>,
    native_tool_execution_hook: Option<Arc<dyn NativeToolExecutionHook>>,
}

#[derive(Clone, Debug)]
pub enum AgentEvent {
    TurnStarted {
        turn: TurnRuntime,
    },
    ItemStarted {
        item: ItemRuntime,
    },
    ItemUpdated {
        item: ItemRuntime,
    },
    ItemCompleted {
        item: ItemRuntime,
    },
    ContextCompactionStarted {
        item_id: String,
        trigger: String,
        detail: Option<String>,
    },
    ContextCompactionCompleted {
        item_id: String,
        trigger: String,
        detail: Option<String>,
    },
    ContextCompactionWarning {
        message: String,
    },
    Message(Message),
    McpNotification((String, ServerNotification)),
    ToolInputDelta {
        tool_id: String,
        tool_name: Option<String>,
        delta: String,
        accumulated_arguments: Option<String>,
        provider: Option<String>,
    },
    ModelChange {
        model: String,
        mode: String,
    },
    ProviderTrace {
        event: ProviderTraceEvent,
    },
    HistoryReplaced(Conversation),
    ContextTrace {
        steps: Vec<ContextTraceStep>,
    },
}

fn provider_response_content(content: &MessageContent) -> RuntimeReplyProviderResponseContent<'_> {
    match content {
        MessageContent::Text(text) => RuntimeReplyProviderResponseContent::text(text.text.as_str()),
        MessageContent::ToolInputDelta(delta) => {
            RuntimeReplyProviderResponseContent::tool_input_delta(
                delta.id.as_str(),
                delta.tool_name.as_deref(),
                delta.delta.as_str(),
                delta.accumulated_arguments.as_deref(),
                delta.provider.as_deref(),
            )
        }
        _ => content
            .as_system_notification()
            .map(|notification| {
                RuntimeReplyProviderResponseContent::system_notification(notification.msg.as_str())
            })
            .unwrap_or(RuntimeReplyProviderResponseContent::Other),
    }
}

fn collect_provider_tool_input_delta_events(message: &Message) -> Option<Vec<AgentEvent>> {
    provider_stream_response_tool_input_delta_events(
        message.content.iter().map(provider_response_content),
    )
    .map(|events| {
        events
            .into_iter()
            .filter_map(agent_event_from_provider_response_event)
            .collect()
    })
}

fn agent_event_from_provider_response_event(
    event: RuntimeReplyResponseEvent,
) -> Option<AgentEvent> {
    match event {
        RuntimeReplyResponseEvent::ToolCallInputDelta {
            call_id,
            tool_name,
            delta,
            accumulated_arguments,
            provider,
        } => Some(AgentEvent::ToolInputDelta {
            tool_id: call_id,
            tool_name,
            delta,
            accumulated_arguments,
            provider,
        }),
        _ => None,
    }
}

fn provider_response_text_chars(message: &Message) -> Option<usize> {
    provider_stream_response_text_chars(message.content.iter().map(provider_response_content))
}

fn provider_response_has_notification(message: &Message) -> bool {
    provider_stream_response_has_notification_text(
        message.content.iter().map(provider_response_content),
    )
}

fn strip_tool_requests_for_direct_answer(mut message: Message) -> Message {
    let original_len = message.content.len();
    message.content.retain(|content| {
        !matches!(
            content,
            MessageContent::ToolRequest(_) | MessageContent::FrontendToolRequest(_)
        )
    });

    if message.content.len() != original_len {
        tracing::info!(
            "[AsterAgent][TTFT] structured tool request stripped from direct_answer response"
        );
    }

    message
}

#[derive(Clone, Copy, Debug)]
enum ContextCompactionTrigger {
    Auto,
    Overflow,
    Manual,
}

impl ContextCompactionTrigger {
    fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::Overflow => "overflow",
            Self::Manual => "manual",
        }
    }

    fn started_detail(self) -> &'static str {
        match self {
            Self::Auto => "Context window is nearing its limit. Compacting earlier messages into a summary.",
            Self::Overflow => "Context limit was reached. Compacting earlier messages into a summary before retrying.",
            Self::Manual => "Compacting the current session on request and replacing earlier history with a summary.",
        }
    }

    fn completed_detail(self) -> &'static str {
        match self {
            Self::Auto => "Auto-compaction finished. The assistant will continue from the compacted summary.",
            Self::Overflow => "Recovery compaction finished. The assistant will retry with the compacted summary.",
            Self::Manual => "Context compaction finished. Earlier history was replaced with a summary for future turns.",
        }
    }
}

#[derive(Debug)]
pub(crate) struct ContextCompactionResult {
    compacted_conversation: Conversation,
}

impl Default for Agent {
    fn default() -> Self {
        Self::new()
    }
}

pub enum ToolStreamItem<T> {
    Message(ServerNotification),
    Result(T),
}

pub type ToolStream =
    Pin<Box<dyn Stream<Item = ToolStreamItem<ToolResult<CallToolResult>>> + Send>>;

#[derive(Clone)]
pub struct NativeToolExecutionRequest {
    pub tool_name: String,
    pub tool_id: String,
    pub params: Value,
    pub context: ToolContext,
}

pub trait NativeToolExecutionHook: Send + Sync {
    fn execute_native_tool(&self, request: NativeToolExecutionRequest) -> Option<ToolCallResult>;
}

fn tool_execution_panic_message(error: Box<dyn std::any::Any + Send>) -> String {
    let detail = if let Some(message) = error.downcast_ref::<&str>() {
        (*message).to_string()
    } else if let Some(message) = error.downcast_ref::<String>() {
        message.clone()
    } else {
        "unknown panic payload".to_string()
    };

    format!("tool execution panic: {detail}")
}

fn tool_execution_panic_error(error: Box<dyn std::any::Any + Send>) -> ErrorData {
    let message = tool_execution_panic_message(error);
    error!("[AsterAgent] {}", message);
    ErrorData::new(ErrorCode::INTERNAL_ERROR, message, None)
}

fn tool_execution_panic_result(error: Box<dyn std::any::Any + Send>) -> ToolResult<CallToolResult> {
    Err(tool_execution_panic_error(error))
}

#[derive(Debug)]
struct TurnItemRuntimeProjector {
    thread_id: String,
    turn_id: String,
    next_sequence: i64,
    items: HashMap<String, ItemRuntime>,
}

impl TurnItemRuntimeProjector {
    fn new(turn: &TurnRuntime) -> Self {
        Self {
            thread_id: turn.thread_id.clone(),
            turn_id: turn.id.clone(),
            next_sequence: 0,
            items: HashMap::new(),
        }
    }

    fn project_user_input(&mut self, turn: &TurnRuntime) -> Option<AgentEvent> {
        let content = turn
            .context_override
            .as_ref()
            .and_then(|context| context.user_visible_input_text.as_deref())
            .or(turn.input_text.as_deref())?
            .trim();
        if content.is_empty() {
            return None;
        }

        Some(self.complete_item(
            format!("user:{}", turn.id),
            ItemRuntimePayload::UserMessage {
                content: content.to_string(),
            },
            ItemStatus::Completed,
            turn.started_at.unwrap_or(turn.created_at),
        ))
    }

    fn project_agent_event(&mut self, event: &AgentEvent) -> Vec<AgentEvent> {
        match event {
            AgentEvent::Message(message) => self.project_message(message),
            _ => Vec::new(),
        }
    }

    fn project_message(&mut self, message: &Message) -> Vec<AgentEvent> {
        if !message.is_user_visible() {
            return Vec::new();
        }

        message
            .content
            .iter()
            .flat_map(|content| self.project_message_content(message, content))
            .collect()
    }

    fn project_message_content(
        &mut self,
        message: &Message,
        content: &MessageContent,
    ) -> Vec<AgentEvent> {
        match content {
            MessageContent::Text(text_content) => self.project_text_content(message, text_content),
            MessageContent::Thinking(thinking_content) => self
                .project_thinking_content(message, thinking_content)
                .into_iter()
                .collect(),
            MessageContent::ToolRequest(tool_request) => self
                .project_tool_request(tool_request)
                .into_iter()
                .collect(),
            MessageContent::ToolResponse(tool_response) => {
                self.project_tool_response(tool_response)
            }
            MessageContent::ActionRequired(action_required) => self
                .project_action_required(action_required)
                .into_iter()
                .collect(),
            _ => Vec::new(),
        }
    }

    fn project_text_content(
        &mut self,
        message: &Message,
        text_content: &TextContent,
    ) -> Vec<AgentEvent> {
        if text_content.text.trim().is_empty() {
            return Vec::new();
        }

        let item_id = self.message_item_id(message, "assistant");
        let raw_next_text = self.append_agent_message_text(&item_id, &text_content.text);
        let next_text = strip_assistant_phase_summary_title(&raw_next_text);
        let mut events = vec![self.upsert_in_progress(
            item_id,
            ItemRuntimePayload::AgentMessage {
                text: next_text.clone(),
            },
        )];

        if let Some(plan_text) = extract_proposed_plan_block(&raw_next_text) {
            events.push(self.upsert_in_progress(
                format!("plan:{}", self.turn_id),
                ItemRuntimePayload::Plan { text: plan_text },
            ));
        }

        events
    }

    fn project_thinking_content(
        &mut self,
        message: &Message,
        thinking_content: &ThinkingContent,
    ) -> Option<AgentEvent> {
        if thinking_content.thinking.trim().is_empty() {
            return None;
        }

        let item_id = self.message_item_id(message, "reasoning");
        let next_text = self.append_reasoning_text(&item_id, &thinking_content.thinking);
        let summary = build_reasoning_summary_sections(&next_text);

        Some(self.upsert_in_progress(
            item_id,
            ItemRuntimePayload::Reasoning {
                text: next_text,
                summary,
                metadata: Self::reasoning_metadata_value(thinking_content),
            },
        ))
    }

    fn project_tool_request(&mut self, tool_request: &ToolRequest) -> Option<AgentEvent> {
        let Ok(tool_call) = &tool_request.tool_call else {
            return None;
        };

        Some(self.upsert_in_progress(
            tool_request.id.clone(),
            ItemRuntimePayload::ToolCall {
                tool_name: tool_call.name.to_string(),
                arguments: Self::serialize_non_null(&tool_call.arguments),
                output: None,
                success: None,
                error: None,
                metadata: Self::metadata_value(tool_request.metadata.as_ref()),
            },
        ))
    }

    fn project_tool_response(&mut self, tool_response: &ToolResponse) -> Vec<AgentEvent> {
        let existing = self.items.get(&tool_response.id).cloned();
        let (tool_name, arguments) = match existing.as_ref().map(|item| &item.payload) {
            Some(ItemRuntimePayload::ToolCall {
                tool_name,
                arguments,
                ..
            }) => (tool_name.clone(), arguments.clone()),
            _ => (tool_response.id.clone(), None),
        };
        let (output, success, error, status) = match &tool_response.tool_result {
            Ok(result) => (
                serde_json::to_value(result).ok(),
                Some(true),
                None,
                ItemStatus::Completed,
            ),
            Err(err) => (None, Some(false), Some(err.to_string()), ItemStatus::Failed),
        };
        let tool_event = self.complete_item(
            tool_response.id.clone(),
            ItemRuntimePayload::ToolCall {
                tool_name,
                arguments,
                output,
                success,
                error,
                metadata: Self::metadata_value(tool_response.metadata.as_ref()),
            },
            status,
            existing
                .as_ref()
                .map(|item| item.started_at)
                .unwrap_or_else(Utc::now),
        );

        let artifact_metadata = tool_response
            .tool_result
            .as_ref()
            .ok()
            .and_then(extract_tool_result_metadata);
        let artifact_status = resolve_file_artifact_status(artifact_metadata.as_ref());
        let artifact_source = resolve_file_artifact_source(artifact_metadata.as_ref());

        let mut events = vec![tool_event];
        for (path, artifact_id) in extract_file_artifacts(artifact_metadata.as_ref()) {
            let item_id =
                artifact_id.unwrap_or_else(|| format!("artifact:{}:{}", tool_response.id, path));
            let payload = ItemRuntimePayload::FileArtifact {
                path,
                source: artifact_source.clone(),
                content: None,
                metadata: artifact_metadata.clone(),
            };

            let event = match artifact_status {
                ItemStatus::InProgress => self.upsert_in_progress(item_id, payload),
                ItemStatus::Completed | ItemStatus::Failed => {
                    let started_at = self
                        .items
                        .get(&item_id)
                        .map(|item| item.started_at)
                        .unwrap_or_else(Utc::now);
                    self.complete_item(item_id, payload, artifact_status, started_at)
                }
            };
            events.push(event);
        }

        events
    }

    fn project_action_required(&mut self, action_required: &ActionRequired) -> Option<AgentEvent> {
        let (item_id, payload) = match &action_required.data {
            ActionRequiredData::ToolConfirmation {
                id,
                tool_name,
                arguments,
                prompt,
            } => (
                id.clone(),
                ItemRuntimePayload::ApprovalRequest {
                    request_id: id.clone(),
                    action_type: "tool_confirmation".to_string(),
                    prompt: prompt.clone(),
                    tool_name: Some(tool_name.clone()),
                    arguments: Self::serialize_non_null(arguments),
                    response: None,
                },
            ),
            ActionRequiredData::Elicitation {
                id,
                message,
                requested_schema,
            } => (
                id.clone(),
                ItemRuntimePayload::RequestUserInput {
                    request_id: id.clone(),
                    action_type: "elicitation".to_string(),
                    prompt: Some(message.clone()),
                    requested_schema: Some(requested_schema.clone()),
                    response: None,
                },
            ),
            ActionRequiredData::ElicitationResponse { .. } => return None,
        };

        Some(self.upsert_in_progress(item_id, payload))
    }

    fn message_item_id(&self, message: &Message, prefix: &str) -> String {
        message
            .id
            .as_ref()
            .map(|id| format!("{prefix}:{id}"))
            .unwrap_or_else(|| format!("{prefix}:{}", self.turn_id))
    }

    fn append_agent_message_text(&self, item_id: &str, text_chunk: &str) -> String {
        self.items
            .get(item_id)
            .and_then(|item| match &item.payload {
                ItemRuntimePayload::AgentMessage { text } => Some(format!("{text}{text_chunk}")),
                _ => None,
            })
            .unwrap_or_else(|| text_chunk.to_string())
    }

    fn append_reasoning_text(&self, item_id: &str, text_chunk: &str) -> String {
        self.items
            .get(item_id)
            .and_then(|item| match &item.payload {
                ItemRuntimePayload::Reasoning { text, .. } => Some(format!("{text}{text_chunk}")),
                _ => None,
            })
            .unwrap_or_else(|| text_chunk.to_string())
    }

    fn serialize_non_null<T: serde::Serialize>(value: &T) -> Option<Value> {
        serde_json::to_value(value)
            .ok()
            .filter(|value| !value.is_null())
    }

    fn metadata_value(metadata: Option<&ProviderMetadata>) -> Option<Value> {
        metadata.map(|metadata| Value::Object(metadata.clone()))
    }

    fn reasoning_metadata_value(thinking_content: &ThinkingContent) -> Option<Value> {
        let signature = thinking_content.signature.trim();
        if signature.is_empty() {
            return None;
        }

        Some(serde_json::json!({
            "provider_metadata": {
                "signature": signature,
            },
        }))
    }

    fn finalize_open_items(&mut self, turn_status: TurnStatus) -> Vec<AgentEvent> {
        let final_status = match turn_status {
            TurnStatus::Completed | TurnStatus::Queued | TurnStatus::Running => {
                ItemStatus::Completed
            }
            TurnStatus::Failed | TurnStatus::Aborted => ItemStatus::Failed,
        };

        let mut pending_ids = self
            .items
            .iter()
            .filter_map(|(id, item)| {
                (item.status == ItemStatus::InProgress).then_some((item.sequence, id.clone()))
            })
            .collect::<Vec<_>>();
        pending_ids.sort_by_key(|(sequence, _)| *sequence);

        pending_ids
            .into_iter()
            .filter_map(|(_, id)| {
                let item = self.items.get_mut(&id)?;
                let now = Utc::now();
                item.status = final_status;
                item.completed_at = Some(now);
                item.updated_at = now;
                Some(AgentEvent::ItemCompleted { item: item.clone() })
            })
            .collect()
    }

    fn upsert_in_progress(&mut self, id: String, payload: ItemRuntimePayload) -> AgentEvent {
        let now = Utc::now();
        if let Some(item) = self.items.get_mut(&id) {
            item.status = ItemStatus::InProgress;
            item.completed_at = None;
            item.updated_at = now;
            item.payload = payload;
            return AgentEvent::ItemUpdated { item: item.clone() };
        }

        let item = ItemRuntime {
            id: id.clone(),
            thread_id: self.thread_id.clone(),
            turn_id: self.turn_id.clone(),
            sequence: self.allocate_sequence(),
            status: ItemStatus::InProgress,
            started_at: now,
            completed_at: None,
            updated_at: now,
            payload,
        };
        self.items.insert(id, item.clone());
        AgentEvent::ItemStarted { item }
    }

    fn complete_item(
        &mut self,
        id: String,
        payload: ItemRuntimePayload,
        status: ItemStatus,
        started_at: DateTime<Utc>,
    ) -> AgentEvent {
        let now = Utc::now();
        if let Some(item) = self.items.get_mut(&id) {
            item.status = status;
            item.completed_at = Some(now);
            item.updated_at = now;
            item.payload = payload;
            return AgentEvent::ItemCompleted { item: item.clone() };
        }

        let item = ItemRuntime {
            id: id.clone(),
            thread_id: self.thread_id.clone(),
            turn_id: self.turn_id.clone(),
            sequence: self.allocate_sequence(),
            status,
            started_at,
            completed_at: Some(now),
            updated_at: now,
            payload,
        };
        self.items.insert(id, item.clone());
        AgentEvent::ItemCompleted { item }
    }

    fn allocate_sequence(&mut self) -> i64 {
        self.next_sequence += 1;
        self.next_sequence
    }
}

// tool_stream combines a stream of ServerNotifications with a future representing the
// final result of the tool call. MCP notifications are not request-scoped, but
// this lets us capture all notifications emitted during the tool call for
// simpler consumption
pub fn tool_stream<S, F>(rx: S, done: F) -> ToolStream
where
    S: Stream<Item = ServerNotification> + Send + Unpin + 'static,
    F: Future<Output = ToolResult<CallToolResult>> + Send + 'static,
{
    Box::pin(async_stream::stream! {
        let done = AssertUnwindSafe(done).catch_unwind();
        tokio::pin!(done);
        let mut rx = rx;

        loop {
            tokio::select! {
                Some(msg) = rx.next() => {
                    yield ToolStreamItem::Message(msg);
                }
                r = &mut done => {
                    yield ToolStreamItem::Result(
                        r.unwrap_or_else(tool_execution_panic_result)
                    );
                    break;
                }
            }
        }
    })
}

impl Agent {
    fn build_user_visible_context_message(
        user_message: &Message,
        session_config: &SessionConfig,
    ) -> Option<Message> {
        if user_message.is_user_visible() {
            return None;
        }

        let visible_text = session_config
            .turn_context
            .as_ref()
            .and_then(|context| context.user_visible_input_text.as_deref())
            .map(str::trim)
            .filter(|text| !text.is_empty())?;

        let mut visible_message = Message::user().with_text(visible_text).user_only();
        for content in &user_message.content {
            if matches!(content, MessageContent::Image(_)) {
                visible_message = visible_message.with_content(content.clone());
            }
        }
        Some(visible_message)
    }

    pub fn new() -> Self {
        // Create channels with buffer size 32 (adjust if needed)
        let (confirm_tx, confirm_rx) = mpsc::channel(32);
        let (tool_tx, tool_rx) = mpsc::channel(32);
        let provider = Arc::new(Mutex::new(None));
        let extension_manager = Arc::new(ExtensionManager::new(provider.clone()));

        // Initialize ToolRegistry with all native tools (Requirements: 11.3, 11.4)
        let mut tool_registry = ToolRegistry::new();
        let ask_callback = default_ask_callback();
        let tool_config = ToolRegistrationConfig::new()
            .with_ask_callback(ask_callback.clone())
            .with_extension_manager(Arc::downgrade(&extension_manager));
        let file_read_history = register_all_tools(&mut tool_registry, tool_config);

        Self {
            provider: provider.clone(),
            extension_manager,
            session_type_hint: RwLock::new(None),
            sub_recipes: Mutex::new(HashMap::new()),
            session_output_schema: Arc::new(Mutex::new(None)),
            final_output_tool: Arc::new(Mutex::new(None)),
            frontend_tools: Mutex::new(HashMap::new()),
            frontend_instructions: Mutex::new(None),
            prompt_manager: Mutex::new(PromptManager::new()),
            confirmation_tx: confirm_tx,
            confirmation_rx: Mutex::new(confirm_rx),
            tool_result_tx: tool_tx,
            tool_result_rx: Arc::new(Mutex::new(tool_rx)),
            retry_manager: RetryManager::new(),
            tool_inspection_manager: Self::create_default_tool_inspection_manager(),
            permission_request_hook_handler: None,
            tool_registry: Arc::new(RwLock::new(tool_registry)),
            file_read_history,
            session_store: None, // 默认使用全局 SessionManager
            thread_runtime_store: Arc::new(InMemoryThreadRuntimeStore::default()),
            ask_callback: Some(ask_callback),
            agent_control_tools: None,
            allowed_tool_names: None,
            native_tool_execution_hook: None,
        }
    }

    pub fn new_with_required_session_runtime_store() -> Result<Self> {
        Ok(Self::new().with_thread_runtime_store(require_shared_session_runtime_store()?))
    }

    /// 设置自定义 session 存储
    ///
    /// 允许应用层注入自己的存储实现，而不是使用默认的 SQLite 存储。
    /// 如果设置为 None，会回退到全局 SessionManager。
    ///
    /// # Example
    /// ```ignore
    /// let store = Arc::new(MyCustomStore::new());
    /// let agent = Agent::new().with_session_store(store);
    /// ```
    pub fn with_session_store(mut self, store: Arc<dyn SessionStore>) -> Self {
        self.session_store = Some(store);
        self
    }

    /// 获取当前的 session 存储引用
    pub fn session_store(&self) -> Option<&Arc<dyn SessionStore>> {
        self.session_store.as_ref()
    }

    pub fn with_thread_runtime_store(mut self, store: Arc<dyn ThreadRuntimeStore>) -> Self {
        self.thread_runtime_store = store;
        self
    }

    pub fn with_shared_native_tool_surface_from(mut self, other: &Agent) -> Self {
        self.tool_registry = other.tool_registry.clone();
        self.file_read_history = other.file_read_history.clone();
        self.ask_callback = other.ask_callback.clone();
        self.native_tool_execution_hook = other.native_tool_execution_hook.clone();
        self
    }

    pub fn set_permission_request_hook_handler(
        &mut self,
        handler: Option<PermissionRequestHookHandler>,
    ) {
        self.permission_request_hook_handler = handler;
    }

    /// 设置 Agent 身份配置（Builder 模式）
    ///
    /// 允许应用层完全控制 Agent 的身份，包括名称、语言、描述等。
    /// 这会替换默认的 "aster by Block" 身份。
    ///
    /// 注意：此方法使用 try_lock，如果锁被占用会静默失败。
    /// 建议在 Agent 创建后立即调用，或使用异步版本 `set_identity()`。
    ///
    /// # Example
    /// ```ignore
    /// use aster::{Agent, AgentIdentity};
    ///
    /// let identity = AgentIdentity::new("ProxyCast 助手")
    ///     .with_language("Chinese")
    ///     .with_description("一个专业的 AI 代理服务助手");
    ///
    /// let agent = Agent::new().with_identity(identity);
    /// ```
    pub fn with_identity(self, identity: super::identity::AgentIdentity) -> Self {
        // 使用 try_lock 避免在异步运行时中阻塞
        if let Ok(mut pm) = self.prompt_manager.try_lock() {
            pm.set_identity(identity);
        } else {
            // 如果锁被占用，记录警告
            tracing::warn!("[Agent] with_identity: 无法获取锁，身份设置被跳过");
        }
        self
    }

    /// 设置 Agent 身份（异步方法）
    ///
    /// 用于在 Agent 创建后动态修改身份配置。
    /// 这是在异步上下文中设置身份的推荐方式。
    pub async fn set_identity(&self, identity: super::identity::AgentIdentity) {
        let mut pm = self.prompt_manager.lock().await;
        pm.set_identity(identity);
    }

    /// Create a new Agent with custom tool registration configuration
    ///
    /// This allows customizing which tools are registered and their configuration.
    ///
    /// # Arguments
    /// * `config` - Configuration for tool registration
    ///
    /// Requirements: 11.3, 11.4
    pub fn with_tool_config(config: ToolRegistrationConfig) -> Self {
        let (confirm_tx, confirm_rx) = mpsc::channel(32);
        let (tool_tx, tool_rx) = mpsc::channel(32);
        let provider = Arc::new(Mutex::new(None));
        let extension_manager = Arc::new(ExtensionManager::new(provider.clone()));
        let mut config = config;
        let agent_control_tools = config.agent_control_tools.clone();
        let allowed_tool_names = config.allowed_tool_names.clone();
        if config.ask_callback.is_none() {
            config.ask_callback = Some(default_ask_callback());
        }
        let ask_callback = config.ask_callback.clone();
        config = config.with_extension_manager(Arc::downgrade(&extension_manager));

        // Initialize ToolRegistry with configured tools
        let mut tool_registry = ToolRegistry::new();
        let file_read_history = crate::tools::register_all_tools(&mut tool_registry, config);

        Self {
            provider: provider.clone(),
            extension_manager,
            session_type_hint: RwLock::new(None),
            sub_recipes: Mutex::new(HashMap::new()),
            session_output_schema: Arc::new(Mutex::new(None)),
            final_output_tool: Arc::new(Mutex::new(None)),
            frontend_tools: Mutex::new(HashMap::new()),
            frontend_instructions: Mutex::new(None),
            prompt_manager: Mutex::new(PromptManager::new()),
            confirmation_tx: confirm_tx,
            confirmation_rx: Mutex::new(confirm_rx),
            tool_result_tx: tool_tx,
            tool_result_rx: Arc::new(Mutex::new(tool_rx)),
            retry_manager: RetryManager::new(),
            tool_inspection_manager: Self::create_default_tool_inspection_manager(),
            permission_request_hook_handler: None,
            tool_registry: Arc::new(RwLock::new(tool_registry)),
            file_read_history,
            session_store: None,
            thread_runtime_store: Arc::new(InMemoryThreadRuntimeStore::default()),
            ask_callback,
            agent_control_tools,
            allowed_tool_names,
            native_tool_execution_hook: None,
        }
    }

    async fn try_dispatch_callback_backed_agent_tool(
        &self,
        arguments: Value,
        session: &Session,
    ) -> Option<Result<ToolCallResult, ErrorData>> {
        let callbacks = self.agent_control_tools.as_ref()?;
        let spawn_callback = callbacks.spawn_agent.clone()?;

        let request = match parse_current_agent_tool_request(arguments) {
            Ok(request) => request,
            Err(error) => return Some(Err(error)),
        };
        let prepared = match prepare_callback_backed_agent_spawn(request, session) {
            Ok(Some(prepared)) => prepared,
            Ok(None) => return None,
            Err(error) => return Some(Err(error)),
        };
        let CallbackBackedAgentSpawn {
            request,
            spawn_request,
            description,
            prompt,
        } = prepared;

        Some(
            spawn_callback(spawn_request)
                .await
                .map(|response| {
                    ToolCallResult::from(Ok(build_async_agent_call_result(
                        &request,
                        &response,
                        description,
                        prompt,
                    )))
                })
                .map_err(|error| ErrorData::new(ErrorCode::INTERNAL_ERROR, error, None)),
        )
    }

    /// Replace the callback-backed agent control surface used by the current runtime.
    ///
    /// Lime can refresh runtime tools per turn after the Agent has already been
    /// initialized, so this must not be limited to `Agent::with_tool_config`.
    pub fn set_agent_control_tools(&mut self, config: Option<AgentControlToolConfig>) {
        self.agent_control_tools = config;
    }

    fn configured_collab_tool_allows(&self, tool_name: &str) -> bool {
        allowed_tool_names_allow_collab_tool(self.allowed_tool_names.as_deref(), tool_name)
    }

    fn canonical_current_collab_tool_name(&self, tool_name: &str) -> Option<String> {
        let canonical = collab_agent_canonical_tool_name(tool_name)?;
        self.configured_collab_tool_allows(canonical)
            .then(|| canonical.to_string())
    }

    fn current_collab_tool_definitions(&self) -> Vec<RuntimeToolDefinition> {
        let Some(callbacks) = self.agent_control_tools.as_ref() else {
            return Vec::new();
        };

        let mut tool_names = Vec::new();
        if callbacks.spawn_agent.is_some() {
            tool_names.push(COLLAB_AGENT_TOOL_NAME);
        }
        if callbacks.send_input.is_some() {
            tool_names.push(SEND_MESSAGE_TOOL_NAME);
        }
        if callbacks.spawn_agent.is_some() && callbacks.send_input.is_some() {
            tool_names.extend([
                TEAM_CREATE_TOOL_NAME,
                TEAM_DELETE_TOOL_NAME,
                LIST_PEERS_TOOL_NAME,
            ]);
        }

        tool_names
            .into_iter()
            .filter(|tool_name| self.configured_collab_tool_allows(tool_name))
            .filter_map(collab_agent_tool_definition)
            .collect()
    }

    /// Replace the current native tool execution hook.
    ///
    /// Embedders use this narrow seam to route selected native tools through
    /// a host-owned process manager while keeping the model-visible registry
    /// unchanged.
    pub fn set_native_tool_execution_hook(
        &mut self,
        hook: Option<Arc<dyn NativeToolExecutionHook>>,
    ) {
        self.native_tool_execution_hook = hook;
    }

    /// Get a reference to the tool registry
    ///
    /// Requirements: 11.3
    pub fn tool_registry(&self) -> &Arc<RwLock<ToolRegistry>> {
        &self.tool_registry
    }

    /// Get a reference to the shared file read history
    ///
    /// This is useful for tools that need to track file reads.
    pub fn file_read_history(&self) -> &SharedFileReadHistory {
        &self.file_read_history
    }

    /// Register an additional tool inspector for runtime-specific policy.
    pub fn add_tool_inspector(&mut self, inspector: Box<dyn ToolInspector>) {
        self.tool_inspection_manager.add_inspector(inspector);
    }

    /// Register an MCP tool with the registry
    ///
    /// This method allows registering MCP tools from extensions into the
    /// native tool registry. Native tools have priority over MCP tools
    /// with the same name.
    ///
    /// # Arguments
    /// * `name` - The tool name
    /// * `description` - Tool description
    /// * `input_schema` - JSON schema for tool input
    /// * `server_name` - Name of the MCP server providing this tool
    ///
    /// Requirements: 11.4, 11.5
    pub async fn register_mcp_tool(
        &self,
        name: String,
        description: String,
        input_schema: serde_json::Value,
        server_name: String,
    ) {
        let wrapper =
            crate::tools::McpToolWrapper::new(name.clone(), description, input_schema, server_name);
        let mut registry = self.tool_registry.write().await;
        registry.register_mcp(name, wrapper);
    }

    /// Create a tool inspection manager with default inspectors
    fn create_default_tool_inspection_manager() -> ToolInspectionManager {
        let mut tool_inspection_manager = ToolInspectionManager::new();

        tool_inspection_manager.add_inspector(Box::new(PermissionInspector::new(
            AsterMode::SmartApprove,
            std::collections::HashSet::new(), // readonly tools - will be populated from extension manager
            std::collections::HashSet::new(), // regular tools - will be populated from extension manager
        )));

        tool_inspection_manager
    }

    // ========== Session 存储辅助方法 ==========
    // 这些方法会优先使用注入的 session_store，如果没有则回退到全局 SessionManager

    /// 添加消息到 session
    pub(crate) async fn store_add_message(
        &self,
        session_id: &str,
        message: &Message,
    ) -> Result<()> {
        if let Some(store) = &self.session_store {
            store.add_message(session_id, message).await
        } else {
            SessionManager::add_message(session_id, message).await
        }
    }

    /// 获取 session
    pub(crate) async fn store_get_session(
        &self,
        session_id: &str,
        include_messages: bool,
    ) -> Result<Session> {
        if let Some(store) = &self.session_store {
            store.get_session(session_id, include_messages).await
        } else {
            query_session(session_id, include_messages).await
        }
    }

    /// 替换整个对话历史
    pub(crate) async fn store_replace_conversation(
        &self,
        session_id: &str,
        conversation: &Conversation,
    ) -> Result<()> {
        if let Some(store) = &self.session_store {
            store.replace_conversation(session_id, conversation).await
        } else {
            replace_session_conversation(session_id, conversation).await
        }
    }

    /// 更新 session 扩展数据
    async fn store_update_extension_data(
        &self,
        session_id: &str,
        extension_data: crate::session::ExtensionData,
    ) -> Result<()> {
        if let Some(store) = &self.session_store {
            store
                .update_extension_data(session_id, extension_data)
                .await
        } else {
            apply_session_update(session_id, |update| update.extension_data(extension_data)).await
        }
    }

    /// 更新 session 的 provider 和 model 配置
    async fn store_update_provider_config(
        &self,
        session_id: &str,
        provider_name: String,
        model_config: crate::model::ModelConfig,
    ) -> Result<()> {
        if let Some(store) = &self.session_store {
            store
                .update_provider_config(session_id, Some(provider_name), Some(model_config))
                .await
        } else {
            apply_session_update(session_id, |update| {
                update
                    .provider_name(provider_name)
                    .model_config(model_config)
            })
            .await
        }
    }

    fn scope_reply_stream<'a>(
        session_config: &SessionConfig,
        stream: BoxStream<'a, Result<AgentEvent>>,
    ) -> BoxStream<'a, Result<AgentEvent>> {
        let scope = session_config.runtime_scope();
        Box::pin(crate::session_context::scope_stream(
            scope,
            session_config.turn_context.clone(),
            stream,
        ))
    }

    async fn ensure_thread_runtime(
        &self,
        session: &Session,
        session_config: &SessionConfig,
    ) -> Result<()> {
        let thread_id = session_config.resolved_thread_id().to_string();

        let existing = self.thread_runtime_store.get_thread(&thread_id).await?;
        let thread = existing.unwrap_or_else(|| {
            ThreadRuntime::new(thread_id, session.id.clone(), session.working_dir.clone())
        });
        self.thread_runtime_store.upsert_thread(thread).await?;
        Ok(())
    }

    async fn create_turn_runtime(
        &self,
        session: &Session,
        session_config: &SessionConfig,
        input_text: Option<String>,
    ) -> Result<TurnRuntime> {
        self.create_turn_runtime_for_session_id(&session.id, session_config, input_text)
            .await
    }

    async fn create_turn_runtime_for_session_id(
        &self,
        session_id: &str,
        session_config: &SessionConfig,
        input_text: Option<String>,
    ) -> Result<TurnRuntime> {
        let turn_id = session_config
            .turn_id
            .as_ref()
            .cloned()
            .ok_or_else(|| anyhow!("Missing turn id after session normalization"))?;
        if let Some(mut existing) = self.thread_runtime_store.get_turn(&turn_id).await? {
            let mut changed = false;

            if existing.input_text.is_none() && input_text.is_some() {
                existing.input_text = input_text;
                changed = true;
            }
            if existing.context_override.is_none() && session_config.turn_context.is_some() {
                existing.context_override = session_config.turn_context.clone();
                changed = true;
            }
            if existing.output_schema_runtime.is_none() {
                let output_schema_runtime = self
                    .resolve_turn_output_schema_runtime(session_config.turn_context.as_ref())
                    .await;
                if output_schema_runtime.is_some() {
                    existing.output_schema_runtime = output_schema_runtime;
                    changed = true;
                }
            }

            if changed {
                existing.updated_at = Utc::now();
                return self.thread_runtime_store.update_turn(existing).await;
            }

            return Ok(existing);
        }

        let thread_id = session_config.resolved_thread_id().to_string();
        let turn = TurnRuntime::new(
            turn_id,
            session_id.to_string(),
            thread_id,
            input_text,
            session_config.turn_context.clone(),
        )
        .with_output_schema_runtime(
            self.resolve_turn_output_schema_runtime(session_config.turn_context.as_ref())
                .await,
        );
        let turn = self.thread_runtime_store.create_turn(turn).await?;
        Ok(turn)
    }

    async fn finalize_turn_runtime(
        &self,
        session_config: &SessionConfig,
        status: TurnStatus,
        error_message: Option<String>,
    ) -> Result<()> {
        let Some(turn_id) = session_config.turn_id.as_ref() else {
            return Ok(());
        };
        let Some(mut turn) = self.thread_runtime_store.get_turn(turn_id).await? else {
            return Ok(());
        };

        turn.status = status;
        turn.error_message = error_message;
        turn.completed_at = Some(chrono::Utc::now());
        self.thread_runtime_store.update_turn(turn).await?;
        Ok(())
    }

    async fn persist_item_runtime(&self, event: &AgentEvent) -> Result<()> {
        let Some(item) = (match event {
            AgentEvent::ItemStarted { item }
            | AgentEvent::ItemUpdated { item }
            | AgentEvent::ItemCompleted { item } => Some(item.clone()),
            _ => None,
        }) else {
            return Ok(());
        };

        let existing = self.thread_runtime_store.get_item(&item.id).await?;
        if existing.is_some() {
            self.thread_runtime_store.update_item(item).await?;
        } else {
            self.thread_runtime_store.create_item(item).await?;
        }
        Ok(())
    }

    async fn complete_runtime_request_item(
        &self,
        request_id: &str,
        response: Option<Value>,
    ) -> Result<()> {
        let Some(mut item) = self.thread_runtime_store.get_item(request_id).await? else {
            return Ok(());
        };

        item.status = ItemStatus::Completed;
        item.completed_at = Some(Utc::now());
        item.payload = match item.payload {
            ItemRuntimePayload::ApprovalRequest {
                request_id,
                action_type,
                prompt,
                tool_name,
                arguments,
                ..
            } => ItemRuntimePayload::ApprovalRequest {
                request_id,
                action_type,
                prompt,
                tool_name,
                arguments,
                response,
            },
            ItemRuntimePayload::RequestUserInput {
                request_id,
                action_type,
                prompt,
                requested_schema,
                ..
            } => ItemRuntimePayload::RequestUserInput {
                request_id,
                action_type,
                prompt,
                requested_schema,
                response,
            },
            payload => payload,
        };
        self.thread_runtime_store.update_item(item).await?;
        Ok(())
    }

    fn runtime_status_item_id(turn_id: &str) -> String {
        format!("turn_summary:{turn_id}")
    }

    fn context_compaction_item_id(turn_id: &str) -> String {
        format!("context_compaction:{turn_id}:{}", Uuid::new_v4())
    }

    pub(crate) async fn perform_context_compaction(
        &self,
        session_config: &SessionConfig,
        conversation: &Conversation,
        manual_compact: bool,
    ) -> Result<ContextCompactionResult> {
        let _ = (session_config, conversation, manual_compact);
        Err(anyhow!(
            "Aster context compaction is retired; use the current App Server context compaction flow"
        ))
    }

    pub async fn compact_session(
        &self,
        session_config: SessionConfig,
    ) -> Result<BoxStream<'_, Result<AgentEvent>>> {
        let session_config = session_config.with_runtime_defaults();
        let session = self.store_get_session(&session_config.id, true).await?;
        self.remember_session_type_hint(session.session_type).await;
        let conversation = session
            .conversation
            .clone()
            .ok_or_else(|| anyhow!("Session {} has no conversation", session_config.id))?;
        let scoped_session_config = session_config.clone();
        let turn_session_config = session_config.clone();
        let turn_session = session.clone();

        Ok(Self::scope_reply_stream(
            &session_config,
            Box::pin(async_stream::try_stream! {
                self.ensure_thread_runtime(&turn_session, &turn_session_config).await?;
                let turn_runtime = self
                    .create_turn_runtime(&turn_session, &turn_session_config, None)
                    .await?;
                let item_id = Self::context_compaction_item_id(&turn_runtime.id);

                yield AgentEvent::TurnStarted {
                    turn: turn_runtime,
                };
                yield AgentEvent::ContextCompactionStarted {
                    item_id: item_id.clone(),
                    trigger: ContextCompactionTrigger::Manual.as_str().to_string(),
                    detail: Some(ContextCompactionTrigger::Manual.started_detail().to_string()),
                };

                match self
                    .perform_context_compaction(&scoped_session_config, &conversation, true)
                    .await
                {
                    Ok(result) => {
                        yield AgentEvent::HistoryReplaced(result.compacted_conversation);
                        yield AgentEvent::ContextCompactionCompleted {
                            item_id,
                            trigger: ContextCompactionTrigger::Manual.as_str().to_string(),
                            detail: Some(
                                ContextCompactionTrigger::Manual
                                    .completed_detail()
                                    .to_string(),
                            ),
                        };
                        yield AgentEvent::ContextCompactionWarning {
                            message: CONTEXT_COMPACTION_WARNING_TEXT.to_string(),
                        };
                        self.finalize_turn_runtime(
                            &scoped_session_config,
                            TurnStatus::Completed,
                            None,
                        )
                        .await?;
                    }
                    Err(error) => {
                        self.finalize_turn_runtime(
                            &scoped_session_config,
                            TurnStatus::Failed,
                            Some(error.to_string()),
                        )
                        .await?;
                        Err(error)?;
                    }
                }
            }),
        ))
    }

    pub async fn ensure_runtime_turn_initialized(
        &self,
        session_config: &SessionConfig,
        input_text: Option<String>,
    ) -> Result<TurnRuntime> {
        let session_config = session_config.clone().with_runtime_defaults();
        let thread_id = session_config.resolved_thread_id().to_string();

        if self
            .thread_runtime_store
            .get_thread(&thread_id)
            .await?
            .is_some()
        {
            return self
                .create_turn_runtime_for_session_id(&session_config.id, &session_config, input_text)
                .await;
        }

        let session = self.store_get_session(&session_config.id, false).await?;
        self.remember_session_type_hint(session.session_type).await;
        self.ensure_thread_runtime(&session, &session_config)
            .await?;
        self.create_turn_runtime(&session, &session_config, input_text)
            .await
    }

    pub async fn upsert_runtime_status_item(
        &self,
        session_config: &SessionConfig,
        phase: impl Into<String>,
        title: impl Into<String>,
        detail: impl Into<String>,
        checkpoints: Vec<String>,
    ) -> Result<AgentEvent> {
        let turn = self
            .ensure_runtime_turn_initialized(session_config, None)
            .await?;
        let item_id = Self::runtime_status_item_id(&turn.id);
        let payload = ItemRuntimePayload::RuntimeStatus {
            phase: phase.into(),
            title: title.into(),
            detail: detail.into(),
            checkpoints,
        };
        let now = Utc::now();

        if let Some(mut existing) = self.thread_runtime_store.get_item(&item_id).await? {
            existing.status = ItemStatus::InProgress;
            existing.completed_at = None;
            existing.updated_at = now;
            existing.payload = payload;
            let item = self.thread_runtime_store.update_item(existing).await?;
            return Ok(AgentEvent::ItemUpdated { item });
        }

        let next_sequence = self
            .thread_runtime_store
            .list_items(&turn.thread_id)
            .await?
            .into_iter()
            .map(|item| item.sequence)
            .max()
            .unwrap_or(0)
            + 1;
        let item = ItemRuntime {
            id: item_id,
            thread_id: turn.thread_id,
            turn_id: turn.id,
            sequence: next_sequence,
            status: ItemStatus::InProgress,
            started_at: now,
            completed_at: None,
            updated_at: now,
            payload,
        };
        let item = self.thread_runtime_store.create_item(item).await?;
        Ok(AgentEvent::ItemStarted { item })
    }

    pub async fn complete_runtime_status_item(
        &self,
        session_config: &SessionConfig,
    ) -> Result<Option<AgentEvent>> {
        let session_config = session_config.clone().with_runtime_defaults();
        let Some(turn_id) = session_config.turn_id.as_ref() else {
            return Ok(None);
        };
        let item_id = Self::runtime_status_item_id(turn_id);
        let Some(mut item) = self.thread_runtime_store.get_item(&item_id).await? else {
            return Ok(None);
        };

        if item.status == ItemStatus::Completed {
            return Ok(None);
        }

        let now = Utc::now();
        item.status = ItemStatus::Completed;
        item.completed_at = Some(now);
        item.updated_at = now;
        let item = self.thread_runtime_store.update_item(item).await?;
        Ok(Some(AgentEvent::ItemCompleted { item }))
    }

    pub async fn runtime_snapshot(&self, session_id: &str) -> Result<SessionRuntimeSnapshot> {
        load_managed_session_runtime_snapshot(self.thread_runtime_store.as_ref(), session_id).await
    }

    // ========== End Session 存储辅助方法 ==========

    /// Reset the retry attempts counter to 0
    pub async fn reset_retry_attempts(&self) {
        self.retry_manager.reset_attempts().await;
    }

    /// Increment the retry attempts counter and return the new value
    pub async fn increment_retry_attempts(&self) -> u32 {
        self.retry_manager.increment_attempts().await
    }

    /// Get the current retry attempts count
    pub async fn get_retry_attempts(&self) -> u32 {
        self.retry_manager.get_attempts().await
    }

    async fn handle_retry_logic(
        &self,
        messages: &mut Conversation,
        session_config: &SessionConfig,
        initial_messages: &[Message],
    ) -> Result<bool> {
        let result = self
            .retry_manager
            .handle_retry_logic(
                messages,
                session_config,
                initial_messages,
                &self.final_output_tool,
            )
            .await?;

        match result {
            RetryResult::Retried => Ok(true),
            RetryResult::Skipped
            | RetryResult::MaxAttemptsReached
            | RetryResult::SuccessChecksPassed => Ok(false),
        }
    }

    /// 排空 elicitation 消息队列并保存到 session
    async fn drain_elicitation_messages(&self, session_config: &SessionConfig) -> Vec<Message> {
        let mut messages = Vec::new();
        let scope = session_config.runtime_scope();
        for elicitation_message in ActionRequiredManager::global()
            .drain_messages_for_scope(&scope)
            .await
        {
            if let Err(e) = self
                .store_add_message(&session_config.id, &elicitation_message)
                .await
            {
                warn!("Failed to save elicitation message to session: {}", e);
            }
            messages.push(elicitation_message);
        }
        messages
    }

    async fn prepare_reply_context(
        &self,
        unfixed_conversation: Conversation,
        working_dir: &std::path::Path,
        session_config: &SessionConfig,
        include_context_trace: bool,
        provider_override: Option<Arc<dyn Provider>>,
    ) -> Result<ReplyContext> {
        let mut context_trace = Vec::new();
        let mut push_trace = |stage: &str, detail: String| {
            if include_context_trace {
                context_trace.push(ContextTraceStep {
                    stage: stage.to_string(),
                    detail,
                });
            }
        };

        push_trace("session", format!("session_id={}", session_config.id));
        push_trace(
            "conversation_input",
            format!("messages={}", unfixed_conversation.len()),
        );

        let unfixed_messages = unfixed_conversation.messages().clone();
        let (conversation, issues) = fix_conversation(unfixed_conversation.clone());
        push_trace(
            "conversation_fixed",
            format!("messages={}, issues={}", conversation.len(), issues.len()),
        );
        if !issues.is_empty() {
            debug!(
                "Conversation issue fixed: {}",
                debug_conversation_fix(
                    unfixed_messages.as_slice(),
                    conversation.messages(),
                    &issues
                )
            );
        }
        let initial_messages = conversation.messages().clone();
        let config = Config::global();

        let session_prompt = session_config.system_prompt.as_deref();
        let session_prompt_override = session_config.system_prompt_override.unwrap_or(false);
        let model_config = self
            .resolve_effective_model_config_for_provider(
                session_config.turn_context.as_ref(),
                provider_override.as_ref(),
            )
            .await
            .ok_or_else(|| anyhow!("Provider not set"))?;
        let (tools, toolshim_tools, system_prompt) =
            crate::session_context::with_turn_context(session_config.turn_context.clone(), async {
                self.prepare_tools_and_prompt(
                    working_dir,
                    session_prompt,
                    session_prompt_override,
                    &model_config,
                )
                .await
            })
            .await?;
        let system_prompt = system_prompt;
        push_trace(
            "tools_ready",
            format!(
                "tools={}, toolshim_tools={}, system_prompt_chars={}",
                tools.len(),
                toolshim_tools.len(),
                system_prompt.chars().count()
            ),
        );

        let direct_answer_surface = super::reply_parts::turn_context_tool_surface_direct_answer(
            session_config.turn_context.as_ref(),
        );
        push_trace("memory_injection", "removed=lime_memory_tools".to_string());

        let aster_mode = config.get_aster_mode().unwrap_or(AsterMode::Auto);
        push_trace("mode", format!("aster_mode={:?}", aster_mode));

        if direct_answer_surface {
            push_trace("permission_inspector", "skipped=direct_answer".to_string());
        } else {
            self.tool_inspection_manager
                .update_permission_inspector_mode(aster_mode)
                .await;
        }

        Ok(ReplyContext {
            conversation,
            tools,
            toolshim_tools,
            system_prompt,
            model_config,
            aster_mode,
            initial_messages,
            context_trace,
        })
    }

    async fn categorize_tools(
        &self,
        response: &Message,
        tools: &[rmcp::model::Tool],
    ) -> ToolCategorizeResult {
        // Categorize tool requests
        let (frontend_requests, remaining_requests, filtered_response, normalized_response) =
            self.categorize_tool_requests(response, tools).await;

        ToolCategorizeResult {
            frontend_requests,
            remaining_requests,
            filtered_response,
            normalized_response,
        }
    }

    async fn handle_approved_and_denied_tools(
        &self,
        permission_check_result: &PermissionCheckResult,
        request_to_response_map: &HashMap<String, Arc<Mutex<Message>>>,
        cancel_token: Option<tokio_util::sync::CancellationToken>,
        session: &Session,
        pinned_provider: Option<Arc<dyn Provider>>,
    ) -> Result<Vec<(String, ToolStream)>> {
        let mut tool_futures: Vec<(String, ToolStream)> = Vec::new();

        for batch in partition_tool_execution_requests(
            &permission_check_result.approved,
            tool_request_is_concurrency_safe,
        ) {
            if batch.is_concurrency_safe {
                let batch_cancel_token = cancel_token.clone();
                let batch_pinned_provider = pinned_provider.clone();
                let batch_results = join_all(batch.requests.into_iter().filter_map(|request| {
                    let cancel_token = batch_cancel_token.clone();
                    let pinned_provider = batch_pinned_provider.clone();
                    request.tool_call.clone().ok().map(|tool_call| async move {
                        self.dispatch_tool_call_with_provider(
                            tool_call,
                            request.id.clone(),
                            cancel_token,
                            session,
                            pinned_provider,
                        )
                        .await
                    })
                }))
                .await;

                for (req_id, tool_result) in batch_results {
                    tool_futures.push((
                        req_id,
                        match tool_result {
                            Ok(result) => tool_stream(
                                result
                                    .notification_stream
                                    .unwrap_or_else(|| Box::new(stream::empty())),
                                result.result,
                            ),
                            Err(e) => tool_stream(
                                Box::new(stream::empty()),
                                futures::future::ready(Err(e)),
                            ),
                        },
                    ));
                }
                continue;
            }

            for request in batch.requests {
                if let Ok(tool_call) = request.tool_call.clone() {
                    let (req_id, tool_result) = self
                        .dispatch_tool_call_with_provider(
                            tool_call,
                            request.id.clone(),
                            cancel_token.clone(),
                            session,
                            pinned_provider.clone(),
                        )
                        .await;

                    tool_futures.push((
                        req_id,
                        match tool_result {
                            Ok(result) => tool_stream(
                                result
                                    .notification_stream
                                    .unwrap_or_else(|| Box::new(stream::empty())),
                                result.result,
                            ),
                            Err(e) => tool_stream(
                                Box::new(stream::empty()),
                                futures::future::ready(Err(e)),
                            ),
                        },
                    ));
                }
            }
        }

        Self::handle_denied_tools(permission_check_result, request_to_response_map).await;
        Ok(tool_futures)
    }

    async fn handle_denied_tools(
        permission_check_result: &PermissionCheckResult,
        request_to_response_map: &HashMap<String, Arc<Mutex<Message>>>,
    ) {
        for request in &permission_check_result.denied {
            if let Some(response_msg) = request_to_response_map.get(&request.id) {
                let mut response = response_msg.lock().await;
                *response = response.clone().with_tool_response_with_metadata(
                    request.id.clone(),
                    Ok(CallToolResult {
                        content: vec![rmcp::model::Content::text(DECLINED_RESPONSE)],
                        structured_content: None,
                        is_error: Some(true),
                        meta: None,
                    }),
                    request.metadata.as_ref(),
                );
            }
        }
    }

    /// Get a reference count clone to the provider
    pub async fn provider(&self) -> Result<Arc<dyn Provider>, anyhow::Error> {
        match &*self.provider.lock().await {
            Some(provider) => Ok(Arc::clone(provider)),
            None => Err(anyhow!("Provider not set")),
        }
    }

    /// Check if a tool is a frontend tool
    pub async fn is_frontend_tool(&self, name: &str) -> bool {
        self.frontend_tools.lock().await.contains_key(name)
    }

    /// Get a reference to a frontend tool
    pub async fn get_frontend_tool(&self, name: &str) -> Option<FrontendTool> {
        self.frontend_tools.lock().await.get(name).cloned()
    }

    pub async fn add_final_output_tool(&self, output_schema: Value) -> Result<()> {
        let mut final_output_tool = self.final_output_tool.lock().await;
        *final_output_tool = Some(
            FinalOutputTool::new(output_schema)
                .map_err(|error| anyhow!("Failed to configure final output tool: {error}"))?,
        );
        Ok(())
    }

    pub async fn clear_final_output_tool(&self) {
        let mut final_output_tool = self.final_output_tool.lock().await;
        *final_output_tool = None;
    }

    pub async fn set_session_output_schema(&self, output_schema: Option<Value>) -> Result<()> {
        if let Some(schema) = output_schema.as_ref() {
            FinalOutputTool::validate_output_schema(schema)
                .map_err(|error| anyhow!("Invalid session output schema: {error}"))?;
        }

        let mut session_output_schema = self.session_output_schema.lock().await;
        *session_output_schema = output_schema;
        Ok(())
    }

    async fn resolve_effective_output_schema(
        &self,
        turn_context: Option<&TurnContextOverride>,
    ) -> Option<ResolvedOutputSchema> {
        if let Some(context) = turn_context {
            if let Some(output_schema) = context.output_schema.clone() {
                return Some(ResolvedOutputSchema {
                    schema: output_schema,
                    source: context
                        .output_schema_source
                        .unwrap_or(TurnOutputSchemaSource::Turn),
                });
            }
        }

        self.session_output_schema
            .lock()
            .await
            .clone()
            .map(|schema| ResolvedOutputSchema {
                schema,
                source: TurnOutputSchemaSource::Session,
            })
    }

    async fn resolve_effective_model_config(
        &self,
        turn_context: Option<&TurnContextOverride>,
    ) -> Option<ModelConfig> {
        self.resolve_effective_model_config_for_provider(turn_context, None)
            .await
    }

    async fn resolve_effective_model_config_for_provider(
        &self,
        turn_context: Option<&TurnContextOverride>,
        provider_override: Option<&Arc<dyn Provider>>,
    ) -> Option<ModelConfig> {
        let provider = match provider_override {
            Some(provider) => provider.clone(),
            None => self.provider.lock().await.as_ref()?.clone(),
        };
        let mut model_config = provider.get_model_config();
        if let Some(model) = turn_context
            .and_then(|context| context.model.as_deref())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            model_config = match model_config.rebuild_with_model_name(model) {
                Ok(rebuilt) => rebuilt,
                Err(error) => {
                    warn!(
                        "Failed to rebuild model config for turn model override '{}': {}",
                        model, error
                    );
                    model_config.with_model_name(model.to_string())
                }
            };
        }
        Some(model_config)
    }

    async fn provider_supports_native_output_schema(&self, model_config: &ModelConfig) -> bool {
        self.provider_supports_native_output_schema_for_provider(model_config, None)
            .await
    }

    async fn provider_supports_native_output_schema_for_provider(
        &self,
        model_config: &ModelConfig,
        provider_override: Option<&Arc<dyn Provider>>,
    ) -> bool {
        match provider_override {
            Some(provider) => provider.supports_native_output_schema_with_model(model_config),
            None => self
                .provider
                .lock()
                .await
                .as_ref()
                .map(|provider| provider.supports_native_output_schema_with_model(model_config))
                .unwrap_or(false),
        }
    }

    fn merge_turn_context_output_schema(
        turn_context: Option<TurnContextOverride>,
        resolved_output_schema: Option<&ResolvedOutputSchema>,
    ) -> Option<TurnContextOverride> {
        match (turn_context, resolved_output_schema) {
            (Some(mut turn_context), Some(resolved_output_schema)) => {
                if turn_context.output_schema.is_none() {
                    turn_context.output_schema = Some(resolved_output_schema.schema.clone());
                }
                turn_context.output_schema_source = Some(resolved_output_schema.source);
                Some(turn_context)
            }
            (Some(turn_context), None) => Some(turn_context),
            (None, Some(resolved_output_schema)) => Some(TurnContextOverride {
                output_schema: Some(resolved_output_schema.schema.clone()),
                output_schema_source: Some(resolved_output_schema.source),
                ..TurnContextOverride::default()
            }),
            (None, None) => None,
        }
    }

    async fn resolve_turn_output_schema_runtime(
        &self,
        turn_context: Option<&TurnContextOverride>,
    ) -> Option<TurnOutputSchemaRuntime> {
        turn_context.and_then(|context| context.output_schema.as_ref())?;

        let model_config = self.resolve_effective_model_config(turn_context).await;
        let uses_final_output_tool = self.final_output_tool.lock().await.is_some();
        let strategy = if uses_final_output_tool {
            TurnOutputSchemaStrategy::FinalOutputTool
        } else if let Some(model_config) = model_config.as_ref() {
            if self
                .provider_supports_native_output_schema(model_config)
                .await
            {
                TurnOutputSchemaStrategy::Native
            } else {
                TurnOutputSchemaStrategy::FinalOutputTool
            }
        } else {
            TurnOutputSchemaStrategy::FinalOutputTool
        };
        let provider_name = self
            .provider
            .lock()
            .await
            .as_ref()
            .map(|provider| provider.get_name().to_string());

        Some(TurnOutputSchemaRuntime {
            source: turn_context
                .and_then(|context| context.output_schema_source)
                .unwrap_or(TurnOutputSchemaSource::Turn),
            strategy,
            provider_name,
            model_name: model_config.map(|config| config.model_name),
        })
    }

    async fn prepare_session_config_for_reply(
        &self,
        session_config: SessionConfig,
    ) -> Result<SessionConfig> {
        self.prepare_session_config_for_reply_with_provider(session_config, None)
            .await
    }

    async fn prepare_session_config_for_reply_with_provider(
        &self,
        session_config: SessionConfig,
        provider_override: Option<Arc<dyn Provider>>,
    ) -> Result<SessionConfig> {
        let mut session_config = session_config.with_runtime_defaults();
        let effective_output_schema = self
            .resolve_effective_output_schema(session_config.turn_context.as_ref())
            .await;

        session_config.turn_context = Self::merge_turn_context_output_schema(
            session_config.turn_context.take(),
            effective_output_schema.as_ref(),
        );

        if let Some(output_schema) = effective_output_schema {
            let use_native_output_schema = if let Some(model_config) = self
                .resolve_effective_model_config_for_provider(
                    session_config.turn_context.as_ref(),
                    provider_override.as_ref(),
                )
                .await
            {
                self.provider_supports_native_output_schema_for_provider(
                    &model_config,
                    provider_override.as_ref(),
                )
                .await
            } else {
                false
            };

            if use_native_output_schema {
                self.clear_final_output_tool().await;
            } else {
                self.add_final_output_tool(output_schema.schema).await?;
            }
        } else {
            self.clear_final_output_tool().await;
        }

        Ok(session_config)
    }

    pub async fn add_sub_recipes(&self, sub_recipes_to_add: Vec<SubRecipe>) {
        let mut sub_recipes = self.sub_recipes.lock().await;
        for sr in sub_recipes_to_add {
            sub_recipes.insert(sr.name.clone(), sr);
        }
    }

    pub async fn apply_recipe_components(
        &self,
        sub_recipes: Option<Vec<SubRecipe>>,
        response: Option<Response>,
        include_final_output: bool,
    ) -> Result<()> {
        if let Some(sub_recipes) = sub_recipes {
            self.add_sub_recipes(sub_recipes).await;
        }

        let output_schema = if include_final_output {
            response.and_then(|response| response.json_schema)
        } else {
            None
        };

        self.set_session_output_schema(output_schema).await?;
        Ok(())
    }

    /// Dispatch a single tool call to the appropriate client
    #[instrument(skip(self, tool_call, request_id), fields(input, output))]
    pub async fn dispatch_tool_call(
        &self,
        tool_call: CallToolRequestParam,
        request_id: String,
        cancellation_token: Option<CancellationToken>,
        session: &Session,
    ) -> (String, Result<ToolCallResult, ErrorData>) {
        self.dispatch_tool_call_with_provider(
            tool_call,
            request_id,
            cancellation_token,
            session,
            None,
        )
        .await
    }

    pub(crate) async fn dispatch_tool_call_with_provider(
        &self,
        tool_call: CallToolRequestParam,
        request_id: String,
        cancellation_token: Option<CancellationToken>,
        session: &Session,
        pinned_provider: Option<Arc<dyn Provider>>,
    ) -> (String, Result<ToolCallResult, ErrorData>) {
        let request_id_for_panic = request_id.clone();
        let dispatch = self.dispatch_tool_call_with_provider_inner(
            tool_call,
            request_id,
            cancellation_token,
            session,
            pinned_provider,
        );

        match AssertUnwindSafe(dispatch).catch_unwind().await {
            Ok(result) => result,
            Err(error) => (request_id_for_panic, Err(tool_execution_panic_error(error))),
        }
    }

    async fn dispatch_tool_call_with_provider_inner(
        &self,
        tool_call: CallToolRequestParam,
        request_id: String,
        cancellation_token: Option<CancellationToken>,
        session: &Session,
        pinned_provider: Option<Arc<dyn Provider>>,
    ) -> (String, Result<ToolCallResult, ErrorData>) {
        if tool_call.name == FINAL_OUTPUT_TOOL_NAME {
            return if let Some(final_output_tool) = self.final_output_tool.lock().await.as_mut() {
                let result = final_output_tool.execute_tool_call(tool_call.clone()).await;
                (request_id, Ok(result))
            } else {
                (
                    request_id,
                    Err(ErrorData::new(
                        ErrorCode::INTERNAL_ERROR,
                        "Structured output tool not defined".to_string(),
                        None,
                    )),
                )
            };
        }

        let needs_current_surface_session = tool_call.name == AGENT_TOOL_NAME
            && (session.session_type == SessionType::SubAgent
                || self.agent_control_tools.is_some());
        let latest_session = if needs_current_surface_session {
            self.store_get_session(&session.id, false).await.ok()
        } else {
            None
        };
        let effective_session = latest_session.as_ref().unwrap_or(session);

        if effective_session.session_type == SessionType::SubAgent
            && tool_call.name == AGENT_TOOL_NAME
        {
            // Only team subagents keep the current surface needed for synchronous nested subagents.
            // Plain delegated workers still must not recursively spawn more agents.
            if session_allows_subagent_teammate_tools(effective_session) {
                debug!(
                    session_id = %effective_session.id,
                    "Allowing Agent tool for team subagent current surface"
                );
            } else {
                return (
                    request_id,
                    Err(ErrorData::new(
                        ErrorCode::INVALID_REQUEST,
                        "Agents cannot create other agents".to_string(),
                        None,
                    )),
                );
            }
        }

        debug!("WAITING_TOOL_START: {}", tool_call.name);
        let result: ToolCallResult = if tool_call.name == AGENT_TOOL_NAME {
            let arguments = tool_call
                .arguments
                .clone()
                .map(Value::Object)
                .unwrap_or(Value::Object(serde_json::Map::new()));
            if let Some(callback_result) = self
                .try_dispatch_callback_backed_agent_tool(arguments.clone(), effective_session)
                .await
            {
                return (request_id, callback_result);
            }

            let provider = match pinned_provider.clone() {
                Some(provider) => provider,
                None => match self.provider().await {
                    Ok(provider) => provider,
                    Err(_) => {
                        return (
                            request_id,
                            Err(ErrorData::new(
                                ErrorCode::INTERNAL_ERROR,
                                "Provider is required".to_string(),
                                None,
                            )),
                        );
                    }
                },
            };

            let extensions = self.get_extension_configs().await;
            let task_config =
                TaskConfig::new(provider, &session.id, &session.working_dir, extensions);
            let sub_recipes = self.sub_recipes.lock().await.clone();

            handle_subagent_tool(
                arguments,
                task_config,
                sub_recipes,
                session.working_dir.clone(),
                cancellation_token,
            )
        } else if self.is_frontend_tool(&tool_call.name).await {
            // For frontend tools, return an error indicating we need frontend execution
            ToolCallResult::from(Err(ErrorData::new(
                ErrorCode::INTERNAL_ERROR,
                "Frontend tool execution required".to_string(),
                None,
            )))
        } else {
            // 优先检查 tool_registry 中的原生工具
            // 原生工具直接在进程内执行，不需要 MCP 子进程
            let native_tool_name = if let Some(tool_name) =
                self.canonical_current_collab_tool_name(tool_call.name.as_ref())
            {
                Some(tool_name)
            } else {
                self.tool_registry
                    .read()
                    .await
                    .canonical_native_name(tool_call.name.as_ref())
            };

            if let Some(tool_name) = native_tool_name {
                // 原生工具：直接通过 tool_registry 执行
                let params = tool_call
                    .arguments
                    .clone()
                    .map(Value::Object)
                    .unwrap_or(Value::Object(serde_json::Map::new()));
                let mut context =
                    crate::tools::context::ToolContext::new(session.working_dir.clone())
                        .with_session_id(session.id.clone());
                let provider = match pinned_provider.clone() {
                    Some(provider) => Some(provider),
                    None => self.provider().await.ok(),
                };
                if let Some(provider) = provider {
                    context = context.with_provider(provider);
                }
                if let Some(token) = cancellation_token.clone() {
                    context = context.with_cancellation_token(token);
                }

                if let Some(hook_result) =
                    self.native_tool_execution_hook.as_ref().and_then(|hook| {
                        hook.execute_native_tool(NativeToolExecutionRequest {
                            tool_name: tool_name.clone(),
                            tool_id: request_id.clone(),
                            params: params.clone(),
                            context: context.clone(),
                        })
                    })
                {
                    hook_result
                } else if let Some(ask_result) = execute_runtime_request_user_input_tool(
                    &tool_name,
                    &params,
                    self.ask_callback.as_ref(),
                )
                .await
                {
                    ask_result
                } else if let Some(collab_result) = execute_runtime_collab_tool(
                    &tool_name,
                    &params,
                    &context.session_id,
                    self.agent_control_tools.as_ref(),
                )
                .await
                {
                    collab_result
                } else if let Some(shell_result) =
                    execute_runtime_shell_tool(&tool_name, &params, &context).await
                {
                    shell_result
                } else if let Some(read_result) =
                    execute_runtime_file_read_tool(&tool_name, &params, &context).await
                {
                    read_result
                } else if let Some(search_result) =
                    execute_runtime_file_search_tool(&tool_name, &params, &context).await
                {
                    search_result
                } else if let Some(dispatch_result) =
                    execute_runtime_native_dispatch_tool(&tool_name, &params, &context).await
                {
                    dispatch_result
                } else {
                    let registry = self.tool_registry.read().await;
                    let execute_result = registry.execute(&tool_name, params, &context, None).await;
                    drop(registry);

                    match execute_result {
                        Ok(result) => ToolCallResult::from(Ok(
                            runtime_tool_result_to_call_tool_result(RuntimeToolResultParts {
                                success: result.success,
                                output: result.output,
                                error: result.error,
                                metadata: result.metadata,
                            }),
                        )),
                        Err(e) => ToolCallResult::from(Err(ErrorData::new(
                            ErrorCode::INTERNAL_ERROR,
                            e.to_string(),
                            None,
                        ))),
                    }
                }
            } else {
                // MCP 工具：通过 extension_manager 分发
                let result = self
                    .extension_manager
                    .dispatch_tool_call(tool_call.clone(), cancellation_token.unwrap_or_default())
                    .await;
                result.unwrap_or_else(|e| {
                    ToolCallResult::from(Err(ErrorData::new(
                        ErrorCode::INTERNAL_ERROR,
                        e.to_string(),
                        None,
                    )))
                })
            }
        };

        debug!("WAITING_TOOL_END: {}", tool_call.name);

        (
            request_id,
            Ok(ToolCallResult {
                notification_stream: result.notification_stream,
                result: Box::new(
                    result
                        .result
                        .map(super::large_response_handler::process_tool_response),
                ),
            }),
        )
    }

    /// Save current extension state to session metadata
    /// Should be called after any extension add/remove operation
    pub async fn save_extension_state(&self, session: &SessionConfig) -> Result<()> {
        let extension_configs = self.extension_manager.get_extension_configs().await;

        let extensions_state = EnabledExtensionsState::new(extension_configs);

        let mut session_data = self.store_get_session(&session.id, false).await?;

        if let Err(e) = extensions_state.to_extension_data(&mut session_data.extension_data) {
            warn!("Failed to serialize extension state: {}", e);
            return Err(anyhow!("Extension state serialization failed: {}", e));
        }

        self.store_update_extension_data(&session.id, session_data.extension_data)
            .await?;

        Ok(())
    }

    pub async fn add_extension(&self, extension: ExtensionConfig) -> ExtensionResult<()> {
        match &extension {
            ExtensionConfig::Frontend {
                tools,
                instructions,
                ..
            } => {
                // For frontend tools, just store them in the frontend_tools map
                let mut frontend_tools = self.frontend_tools.lock().await;
                for tool in tools {
                    let frontend_tool = FrontendTool {
                        name: tool.name.to_string(),
                        tool: tool.clone(),
                    };
                    frontend_tools.insert(tool.name.to_string(), frontend_tool);
                }
                // Store instructions if provided, using "frontend" as the key
                let mut frontend_instructions = self.frontend_instructions.lock().await;
                if let Some(instructions) = instructions {
                    *frontend_instructions = Some(instructions.clone());
                } else {
                    // Default frontend instructions if none provided
                    *frontend_instructions = Some(
                        "The following tools are provided directly by the frontend and will be executed by the frontend when called.".to_string(),
                    );
                }
            }
            _ => {
                self.extension_manager
                    .add_extension(extension.clone())
                    .await?;
            }
        }

        Ok(())
    }

    pub async fn subagents_enabled(&self) -> bool {
        let session_type = self.current_session_type().await;
        self.subagents_enabled_for_session_type(session_type).await
    }

    async fn remember_session_type_hint(&self, session_type: SessionType) {
        let mut session_type_hint = self.session_type_hint.write().await;
        if session_type_hint.as_ref() == Some(&session_type) {
            return;
        }
        *session_type_hint = Some(session_type);
    }

    async fn session_type_hint(&self) -> Option<SessionType> {
        *self.session_type_hint.read().await
    }

    async fn current_session_type(&self) -> Option<SessionType> {
        if let Some(session_type) = self.session_type_hint().await {
            return Some(session_type);
        }

        let session_id = self.extension_manager.get_context().await.session_id?;
        let session_type = self
            .store_get_session(&session_id, false)
            .await
            .ok()
            .map(|session| session.session_type);
        if let Some(session_type) = session_type {
            self.remember_session_type_hint(session_type).await;
        }
        session_type
    }

    async fn subagents_enabled_for_session_type(&self, session_type: Option<SessionType>) -> bool {
        let config = crate::config::Config::global();
        let is_autonomous = config.get_aster_mode().unwrap_or(AsterMode::Auto) == AsterMode::Auto;
        if !is_autonomous {
            return false;
        }
        if self
            .provider()
            .await
            .map(|provider| provider.get_active_model_name().starts_with("gemini"))
            .unwrap_or(false)
        {
            return false;
        }
        if matches!(session_type, Some(SessionType::SubAgent)) {
            return false;
        }
        true
    }

    pub async fn list_tools(&self, extension_name: Option<String>) -> Vec<Tool> {
        let mut prefixed_tools = self
            .extension_manager
            .get_prefixed_tools(extension_name.clone())
            .await
            .unwrap_or_default();

        let hinted_session_type = self.session_type_hint().await;
        let current_session = match (
            self.extension_manager.get_context().await.session_id,
            hinted_session_type,
        ) {
            (Some(session_id), Some(SessionType::SubAgent)) | (Some(session_id), None) => {
                let current_session = self.store_get_session(&session_id, false).await.ok();
                if let Some(session) = current_session.as_ref() {
                    self.remember_session_type_hint(session.session_type).await;
                }
                current_session
            }
            _ => None,
        };
        let current_session_type = current_session
            .as_ref()
            .map(|session| session.session_type)
            .or(hinted_session_type);
        let subagent_teammate_tools_enabled = current_session
            .as_ref()
            .is_some_and(session_allows_subagent_teammate_tools);
        let subagents_enabled = self
            .subagents_enabled_for_session_type(current_session_type)
            .await;
        let resources_supported = self.extension_manager.supports_resources().await;
        let tool_gates = runtime_tool_surface_gates();
        let callback_backed_agent_enabled = self
            .agent_control_tools
            .as_ref()
            .is_some_and(|config| config.spawn_agent.is_some());
        let registry_has_agent_tool = {
            let registry = self.tool_registry.read().await;
            registry.contains_native(AGENT_TOOL_NAME)
        };

        if extension_name.is_none() {
            if let Some(final_output_tool) = self.final_output_tool.lock().await.as_ref() {
                prefixed_tools.push(final_output_tool.tool());
            }

            if (subagents_enabled || subagent_teammate_tools_enabled)
                && !callback_backed_agent_enabled
                && !registry_has_agent_tool
            {
                let sub_recipes = self.sub_recipes.lock().await;
                let sub_recipes_vec: Vec<_> = sub_recipes.values().cloned().collect();
                prefixed_tools.push(create_subagent_tool(&sub_recipes_vec));
            }

            // 添加 tool_registry 中的原生工具；Skill 由 Lime current overlay 注入。
            let mut listed_tool_names: std::collections::HashSet<String> = prefixed_tools
                .iter()
                .map(|tool| tool.name.as_ref().to_string())
                .collect();
            for tool_def in self.current_collab_tool_definitions() {
                if !listed_tool_names.insert(tool_def.name.clone()) {
                    continue;
                }

                let tool = Tool::new(
                    tool_def.name,
                    tool_def.description,
                    tool_def
                        .input_schema
                        .as_object()
                        .cloned()
                        .unwrap_or_default(),
                );
                prefixed_tools.push(tool);
            }
            let registry = self.tool_registry.read().await;
            for tool_def in registry.get_definitions() {
                if !should_expose_registered_tool_with_gates(
                    &tool_def.name,
                    resources_supported,
                    tool_gates,
                ) {
                    continue;
                }
                if !listed_tool_names.insert(tool_def.name.clone()) {
                    continue;
                }

                let tool = Tool::new(
                    tool_def.name,
                    tool_def.description,
                    tool_def
                        .input_schema
                        .as_object()
                        .cloned()
                        .unwrap_or_default(),
                );
                prefixed_tools.push(tool);
            }
        }

        prefixed_tools.retain(|tool| {
            should_expose_tool_for_session_with_gates(
                &tool.name,
                current_session_type,
                resources_supported,
                tool_gates,
                subagent_teammate_tools_enabled,
            )
        });

        prefixed_tools
    }

    pub async fn remove_extension(&self, name: &str) -> Result<()> {
        self.extension_manager.remove_extension(name).await?;
        Ok(())
    }

    pub async fn list_extensions(&self) -> Vec<String> {
        self.extension_manager
            .list_extensions()
            .await
            .expect("Failed to list extensions")
    }

    pub async fn get_extension_configs(&self) -> Vec<ExtensionConfig> {
        self.extension_manager.get_extension_configs().await
    }

    pub async fn inherit_frontend_tool_surface_from(&self, other: &Agent) {
        let frontend_tools = other.frontend_tools.lock().await.clone();
        let frontend_instructions = other.frontend_instructions.lock().await.clone();

        {
            let mut own_frontend_tools = self.frontend_tools.lock().await;
            *own_frontend_tools = frontend_tools;
        }

        *self.frontend_instructions.lock().await = frontend_instructions;
    }

    pub async fn inherit_runtime_tool_surface_from(&self, other: &Agent) -> Result<()> {
        for config in other.get_extension_configs().await {
            self.add_extension(config).await?;
        }

        self.inherit_frontend_tool_surface_from(other).await;
        Ok(())
    }

    /// Handle a confirmation response for a tool request
    pub async fn handle_confirmation(
        &self,
        request_id: String,
        confirmation: PermissionConfirmation,
    ) {
        let response = serde_json::json!({
            "confirmed": !matches!(
                confirmation.permission,
                crate::permission::Permission::Cancel | crate::permission::Permission::DenyOnce
            )
        });
        if let Err(error) = self
            .complete_runtime_request_item(&request_id, Some(response))
            .await
        {
            warn!(
                request_id = %request_id,
                ?error,
                "Failed to complete runtime approval item"
            );
        }
        if let Err(e) = self.confirmation_tx.send((request_id, confirmation)).await {
            error!("Failed to send confirmation: {}", e);
        }
    }

    #[instrument(
        skip(self, user_message, session_config, provider),
        fields(user_message)
    )]
    pub async fn reply_with_provider(
        &self,
        user_message: Message,
        session_config: SessionConfig,
        cancel_token: Option<CancellationToken>,
        provider: Arc<dyn Provider>,
    ) -> Result<BoxStream<'_, Result<AgentEvent>>> {
        let session_config = self
            .prepare_session_config_for_reply_with_provider(session_config, Some(provider.clone()))
            .await?;

        for content in &user_message.content {
            if let MessageContent::ActionRequired(action_required) = content {
                if let ActionRequiredData::ElicitationResponse { id, user_data } =
                    &action_required.data
                {
                    let action_scope = action_required.scope.as_ref();
                    if let Err(e) = ActionRequiredManager::global()
                        .submit_response_scoped(id.clone(), action_scope, user_data.clone())
                        .await
                    {
                        let error_text = format!("Failed to submit elicitation response: {}", e);
                        error!(error_text);
                        return Ok(Self::scope_reply_stream(
                            &session_config,
                            Box::pin(stream::once(async {
                                Ok(AgentEvent::Message(
                                    Message::assistant().with_text(error_text),
                                ))
                            })),
                        ));
                    }
                    if let Err(error) = self
                        .complete_runtime_request_item(id, Some(user_data.clone()))
                        .await
                    {
                        warn!(
                            request_id = %id,
                            ?error,
                            "Failed to complete runtime elicitation item"
                        );
                    }
                    self.store_add_message(&session_config.id, &user_message)
                        .await?;
                    return Ok(Self::scope_reply_stream(
                        &session_config,
                        Box::pin(futures::stream::empty()),
                    ));
                }
            }
        }

        let message_text = user_message.as_concat_text();

        let command_result = self
            .execute_command(&message_text, &session_config.id)
            .await;

        match command_result {
            Err(e) => {
                let error_message = Message::assistant()
                    .with_text(e.to_string())
                    .with_visibility(true, false);
                return Ok(Self::scope_reply_stream(
                    &session_config,
                    Box::pin(stream::once(async move {
                        Ok(AgentEvent::Message(error_message))
                    })),
                ));
            }
            Ok(Some(response)) if response.role == rmcp::model::Role::Assistant => {
                self.store_add_message(
                    &session_config.id,
                    &user_message.clone().with_visibility(true, false),
                )
                .await?;
                self.store_add_message(
                    &session_config.id,
                    &response.clone().with_visibility(true, false),
                )
                .await?;

                // Check if this was a command that modifies conversation history
                let modifies_history = crate::agents::execute_commands::COMPACT_TRIGGERS
                    .contains(&message_text.trim())
                    || message_text.trim() == "/clear";

                // 克隆 session_store 引用供 async_stream 宏内部使用
                let session_store_clone = self.session_store.clone();
                let session_id_clone = session_config.id.clone();

                return Ok(Self::scope_reply_stream(
                    &session_config,
                    Box::pin(async_stream::try_stream! {
                        yield AgentEvent::Message(user_message);
                        yield AgentEvent::Message(response);

                        // After commands that modify history, notify UI that history was replaced
                        if modifies_history {
                            let updated_session = if let Some(store) = &session_store_clone {
                                store.get_session(&session_id_clone, true).await
                            } else {
                                query_session(&session_id_clone, true).await
                            }
                                .map_err(|e| anyhow!("Failed to fetch updated session: {}", e))?;
                            let updated_conversation = updated_session
                                .conversation
                                .ok_or_else(|| anyhow!("Session has no conversation after history modification"))?;
                            yield AgentEvent::HistoryReplaced(updated_conversation);
                        }
                    }),
                ));
            }
            Ok(Some(resolved_message)) => {
                self.store_add_message(
                    &session_config.id,
                    &user_message.clone().with_visibility(true, false),
                )
                .await?;
                self.store_add_message(
                    &session_config.id,
                    &resolved_message.clone().with_visibility(false, true),
                )
                .await?;
            }
            Ok(None) => {
                if let Some(visible_message) =
                    Self::build_user_visible_context_message(&user_message, &session_config)
                {
                    self.store_add_message(&session_config.id, &visible_message)
                        .await?;
                }
                self.store_add_message(&session_config.id, &user_message)
                    .await?;
            }
        }
        let session = self.store_get_session(&session_config.id, true).await?;
        self.remember_session_type_hint(session.session_type).await;
        let conversation = session
            .conversation
            .clone()
            .ok_or_else(|| anyhow::anyhow!("Session {} has no conversation", session_config.id))?;

        let scope_session_config = session_config.clone();
        let scoped_session_config = session_config.clone();
        let input_text_for_turn = scoped_session_config
            .turn_context
            .as_ref()
            .and_then(|context| context.user_visible_input_text.as_deref())
            .and_then(|input_text| {
                let value = input_text.trim();
                (!value.is_empty()).then(|| value.to_string())
            })
            .or_else(|| (!message_text.trim().is_empty()).then_some(message_text.clone()));

        Ok(Self::scope_reply_stream(
            &scope_session_config,
            Box::pin(async_stream::try_stream! {
                let final_conversation = conversation;

                self.ensure_thread_runtime(&session, &scoped_session_config).await?;
                let turn_runtime = self
                    .create_turn_runtime(&session, &scoped_session_config, input_text_for_turn.clone())
                    .await?;
                let mut item_runtime_projector = TurnItemRuntimeProjector::new(&turn_runtime);
                yield AgentEvent::TurnStarted {
                    turn: turn_runtime.clone(),
                };
                if let Some(user_item_event) = item_runtime_projector.project_user_input(&turn_runtime)
                {
                    self.persist_item_runtime(&user_item_event).await?;
                    yield user_item_event;
                }

                let mut turn_status = TurnStatus::Completed;
                let mut turn_error = None;

                let mut reply_stream = match self
                    .reply_internal(
                        final_conversation,
                        scoped_session_config.clone(),
                        session,
                        cancel_token.clone(),
                        provider.clone(),
                    )
                    .await
                {
                    Ok(stream) => stream,
                    Err(err) => {
                        turn_status = TurnStatus::Failed;
                        turn_error = Some(err.to_string());
                        self.finalize_turn_runtime(&scoped_session_config, turn_status, turn_error.clone()).await?;
                        Err(err)?;
                        unreachable!();
                    }
                };

                loop {
                    let next_event = match cancel_token.as_ref() {
                        Some(token) => {
                            tokio::select! {
                                _ = token.cancelled() => None,
                                event = reply_stream.next() => event,
                            }
                        }
                        None => reply_stream.next().await,
                    };
                    let Some(event) = next_event else {
                        break;
                    };
                    match event {
                        Ok(event) => {
                            for runtime_event in item_runtime_projector.project_agent_event(&event) {
                                self.persist_item_runtime(&runtime_event).await?;
                                yield runtime_event;
                            }
                            yield event;
                        }
                        Err(err) => {
                            turn_status = if cancel_token_cancelled(&cancel_token) {
                                self.store_add_message(
                                    &scoped_session_config.id,
                                    &cancelled_turn_context_marker_message(),
                                )
                                .await?;
                                TurnStatus::Aborted
                            } else {
                                TurnStatus::Failed
                            };
                            turn_error = Some(err.to_string());
                            for runtime_event in
                                item_runtime_projector.finalize_open_items(turn_status)
                            {
                                self.persist_item_runtime(&runtime_event).await?;
                                yield runtime_event;
                            }
                            self.finalize_turn_runtime(&scoped_session_config, turn_status, turn_error.clone()).await?;
                            Err(err)?;
                            unreachable!();
                        }
                    }
                }

                if cancel_token_cancelled(&cancel_token) {
                    turn_status = TurnStatus::Aborted;
                }
                for runtime_event in item_runtime_projector.finalize_open_items(turn_status) {
                    self.persist_item_runtime(&runtime_event).await?;
                    yield runtime_event;
                }
                self.finalize_turn_runtime(&scoped_session_config, turn_status, turn_error).await?;
            }),
        ))
    }

    async fn reply_internal(
        &self,
        conversation: Conversation,
        session_config: SessionConfig,
        session: Session,
        cancel_token: Option<CancellationToken>,
        pinned_provider: Arc<dyn Provider>,
    ) -> Result<BoxStream<'_, Result<AgentEvent>>> {
        let emit_context_trace = session_config.include_context_trace.unwrap_or(false);
        let context = self
            .prepare_reply_context(
                conversation,
                &session.working_dir,
                &session_config,
                emit_context_trace,
                Some(pinned_provider.clone()),
            )
            .await?;
        let ReplyContext {
            mut conversation,
            mut tools,
            mut toolshim_tools,
            mut system_prompt,
            model_config,
            aster_mode,
            initial_messages,
            context_trace,
        } = context;
        let reply_span = tracing::Span::current();
        self.reset_retry_attempts().await;

        let direct_answer_surface = super::reply_parts::turn_context_tool_surface_direct_answer(
            session_config.turn_context.as_ref(),
        );
        let session_for_name = session.clone().without_messages();
        let deferred_session_name_generation = if direct_answer_surface {
            tracing::info!(
                "[AsterAgent][TTFT] session name generation deferred for direct_answer turn"
            );
            Some((session_for_name, None, pinned_provider.clone()))
        } else {
            let conversation_for_name = conversation.clone();
            match pinned_provider.session_name_generation_execution_strategy() {
                SessionNameGenerationExecutionStrategy::Background => {
                    let provider = pinned_provider.clone();
                    tokio::spawn(async move {
                        if let Err(e) = SessionManager::maybe_update_name_for_session(
                            &session_for_name,
                            &conversation_for_name,
                            provider,
                        )
                        .await
                        {
                            log_session_description_failure(&e);
                        }
                    });
                    None
                }
                SessionNameGenerationExecutionStrategy::AfterReply => Some((
                    session_for_name,
                    Some(conversation_for_name),
                    pinned_provider.clone(),
                )),
            }
        };
        let working_dir = session.working_dir.clone();

        Ok(Box::pin(async_stream::try_stream! {
            let _ = reply_span.enter();
            let mut turns_taken = 0u32;
            let max_turns = session_config.max_turns.unwrap_or(DEFAULT_MAX_TURNS);
            let mut overflow_handler = OverflowHandler::new(2);

            if emit_context_trace && !context_trace.is_empty() {
                yield AgentEvent::ContextTrace { steps: context_trace };
            }

            loop {
                if cancel_token_cancelled(&cancel_token) {
                    break;
                }

                if let Some(final_output_tool) = self.final_output_tool.lock().await.as_ref() {
                    if final_output_tool.final_output.is_some() {
                        let final_event = AgentEvent::Message(
                            Message::assistant().with_text(final_output_tool.final_output.clone().unwrap())
                        );
                        yield final_event;
                        break;
                    }
                }

                turns_taken += 1;
                if turns_taken > max_turns {
                    yield AgentEvent::Message(
                        Message::assistant().with_text(MAX_REPLY_TURNS_REACHED_MESSAGE)
                    );
                    break;
                }
                let provider_trace_attempt = turns_taken;

                let provider_conversation;
                let provider_messages = if direct_answer_surface {
                    tracing::info!(
                        "[AsterAgent][TTFT] MOIM injection skipped for direct_answer turn"
                    );
                    conversation.messages()
                } else {
                    provider_conversation = super::moim::inject_moim(
                        conversation.clone(),
                        &self.extension_manager,
                    )
                    .await;
                    provider_conversation.messages()
                };
                let provider_messages = provider_prompt_messages_for_turn_context(
                    provider_messages,
                    session_config.turn_context.as_ref(),
                );
                let provider_trace_started_at = Instant::now();
                let provider_trace_provider = pinned_provider.get_name().to_string();
                let provider_trace_model = model_config.model_name.clone();
                let mut provider_stream_progress = RuntimeReplyProviderStreamProgress::new();
                yield AgentEvent::ProviderTrace {
                    event: provider_trace_request_started(
                        &provider_trace_provider,
                        &provider_trace_model,
                        provider_trace_attempt,
                    ),
                };
                let (mut stream, provider_response_context) = crate::session_context::with_turn_context(
                    session_config.turn_context.clone(),
                    async {
                        crate::session_context::clear_current_provider_response_context();
                        let stream = Self::stream_response_from_provider(
                            pinned_provider.clone(),
                            &model_config,
                            &system_prompt,
                            provider_messages.as_ref(),
                            &tools,
                            &toolshim_tools,
                        )
                        .await?;
                        let provider_response_context =
                            crate::session_context::current_provider_response_context();
                        Ok::<_, ProviderError>((stream, provider_response_context))
                    },
                )
                .await?;

                let mut no_tools_called = true;
                let mut messages_to_add = Conversation::default();
                let mut tools_updated = false;
                let mut did_recovery_compact_this_iteration = false;

                loop {
                    let next = if let Some(interval) =
                        provider_stream_cancel_poll_interval(cancel_token.is_some())
                    {
                        match tokio::time::timeout(interval, stream.next()).await {
                            Ok(next) => provider_stream_event_poll(
                                next,
                                cancel_token_cancelled(&cancel_token),
                            ),
                            Err(_) => provider_stream_timeout_poll(
                                cancel_token_cancelled(&cancel_token),
                            ),
                        }
                    } else {
                        provider_stream_event_poll(stream.next().await, false)
                    };
                    let next = match next {
                        ProviderStreamPoll::Item(next) => next,
                        ProviderStreamPoll::End => break,
                        ProviderStreamPoll::Pending => continue,
                        ProviderStreamPoll::Canceled(reason) => {
                            yield AgentEvent::ProviderTrace {
                                event: provider_trace_canceled(
                                    &provider_trace_provider,
                                    &provider_trace_model,
                                    provider_trace_attempt,
                                    &provider_trace_started_at,
                                    reason.as_str(),
                                )
                                .with_response_context(provider_response_context.as_ref()),
                            };
                            break;
                        }
                    };

                    match next {
                        Ok((response, usage)) => {
                            if provider_stream_progress.note_first_event() {
                                yield AgentEvent::ProviderTrace {
                                    event: provider_trace_first_event_received(
                                        &provider_trace_provider,
                                        &provider_trace_model,
                                        provider_trace_attempt,
                                        &provider_trace_started_at,
                                    )
                                    .with_response_context(provider_response_context.as_ref()),
                                };
                            }
                            overflow_handler.reset();

                            // Emit model change event if provider is lead-worker
                            if let Some(lead_worker) = pinned_provider.as_lead_worker() {
                                if let Some(ref usage) = usage {
                                    let (lead_model, worker_model) = lead_worker.get_model_info();
                                    let model_change = provider_stream_model_change(
                                        usage.model.as_str(),
                                        lead_model.as_str(),
                                        worker_model.as_str(),
                                    );

                                    yield AgentEvent::ModelChange {
                                        model: model_change.model,
                                        mode: model_change.mode.as_str().to_string(),
                                    };
                                }
                            }

                            if let Some(ref usage) = usage {
                                Self::update_session_metrics(&session_config, usage, false, self.session_store.as_ref()).await?;
                            }

                            if let Some(response) = response {
                                if let Some(text_chars) = provider_stream_progress
                                    .note_first_text_delta(provider_response_text_chars(&response))
                                {
                                    yield AgentEvent::ProviderTrace {
                                        event: provider_trace_first_text_delta_received(
                                            &provider_trace_provider,
                                            &provider_trace_model,
                                            provider_trace_attempt,
                                            &provider_trace_started_at,
                                            text_chars,
                                        )
                                        .with_response_context(provider_response_context.as_ref()),
                                    };
                                }
                                if let Some(tool_input_events) =
                                    collect_provider_tool_input_delta_events(&response)
                                {
                                    for event in tool_input_events {
                                        yield event;
                                    }
                                    continue;
                                }
                                if provider_response_has_notification(&response) {
                                    yield AgentEvent::Message(response);
                                    continue;
                                }

                                if direct_answer_surface && tools.is_empty() {
                                    let direct_response =
                                        strip_tool_requests_for_direct_answer(response);
                                    yield AgentEvent::Message(direct_response.clone());
                                    tokio::task::yield_now().await;
                                    messages_to_add.push(direct_response);
                                    continue;
                                }

                                let ToolCategorizeResult {
                                    frontend_requests,
                                    remaining_requests,
                                    filtered_response,
                                    normalized_response,
                                } = self.categorize_tools(&response, &tools).await;

                                yield AgentEvent::Message(filtered_response.clone());
                                tokio::task::yield_now().await;

                                let num_tool_requests = frontend_requests.len() + remaining_requests.len();
                                if num_tool_requests == 0 {
                                    messages_to_add.push(normalized_response);
                                    continue;
                                }

                                let tool_response_messages: Vec<Arc<Mutex<Message>>> = (0..num_tool_requests)
                                    .map(|_| Arc::new(Mutex::new(Message::user().with_id(
                                        format!("msg_{}", Uuid::new_v4())
                                    ))))
                                    .collect();

                                let mut request_to_response_map = HashMap::new();
                                let mut request_metadata: HashMap<String, Option<ProviderMetadata>> = HashMap::new();
                                for (idx, request) in frontend_requests.iter().chain(remaining_requests.iter()).enumerate() {
                                    request_to_response_map.insert(request.id.clone(), tool_response_messages[idx].clone());
                                    request_metadata.insert(request.id.clone(), request.metadata.clone());
                                }

                                for (idx, request) in frontend_requests.iter().enumerate() {
                                    let mut frontend_tool_stream = self.handle_frontend_tool_request(
                                        request,
                                        tool_response_messages[idx].clone(),
                                    );

                                    while let Some(msg) = frontend_tool_stream.try_next().await? {
                                        yield AgentEvent::Message(msg);
                                    }
                                }
                                if aster_mode == AsterMode::Chat {
                                    // Skip all remaining tool calls in chat mode
                                    for request in remaining_requests.iter() {
                                        if let Some(response_msg) = request_to_response_map.get(&request.id) {
                                            let mut response = response_msg.lock().await;
                                            *response = response.clone().with_tool_response_with_metadata(
                                                request.id.clone(),
                                                Ok(CallToolResult {
                                                    content: vec![Content::text(CHAT_MODE_TOOL_SKIPPED_RESPONSE)],
                                                    structured_content: None,
                                                    is_error: Some(false),
                                                    meta: None,
                                                }),
                                                request.metadata.as_ref(),
                                            );
                                        }
                                    }
                                } else {
                                    // Run all tool inspectors
                                    let inspection_results = self.tool_inspection_manager
                                        .inspect_tools(
                                            &remaining_requests,
                                            conversation.messages(),
                                        )
                                        .await?;

                                    let permission_check_result = self.tool_inspection_manager
                                        .process_inspection_results_with_permission_inspector(
                                            &remaining_requests,
                                            &inspection_results,
                                        )
                                        .unwrap_or_else(|| {
                                            let mut result = PermissionCheckResult {
                                                approved: vec![],
                                                needs_approval: vec![],
                                                denied: vec![],
                                            };
                                            result.needs_approval.extend(remaining_requests.iter().cloned());
                                            result
                                        });

                                    // Track extension requests
                                    let mut enable_extension_request_ids = vec![];
                                    for request in &remaining_requests {
                                        if let Ok(tool_call) = &request.tool_call {
                                            if tool_call.name == MANAGE_EXTENSIONS_TOOL_NAME_COMPLETE {
                                                enable_extension_request_ids.push(request.id.clone());
                                            }
                                        }
                                    }

                                    let mut tool_futures = self.handle_approved_and_denied_tools(
                                        &permission_check_result,
                                        &request_to_response_map,
                                        cancel_token.clone(),
                                        &session,
                                        Some(pinned_provider.clone()),
                                    ).await?;

                                    let tool_futures_arc = Arc::new(Mutex::new(tool_futures));

                                    let mut tool_approval_stream = self.handle_approval_tool_requests(
                                        &permission_check_result.needs_approval,
                                        tool_futures_arc.clone(),
                                        &request_to_response_map,
                                        cancel_token.clone(),
                                        &session,
                                        &inspection_results,
                                        Some(pinned_provider.clone()),
                                    );

                                    while let Some(msg) = tool_approval_stream.try_next().await? {
                                        yield AgentEvent::Message(msg);
                                    }

                                    tool_futures = {
                                        let mut futures_lock = tool_futures_arc.lock().await;
                                        futures_lock.drain(..).collect::<Vec<_>>()
                                    };

                                    let with_id = tool_futures
                                        .into_iter()
                                        .map(|(request_id, stream)| {
                                            stream.map(move |item| (request_id.clone(), item))
                                        })
                                        .collect::<Vec<_>>();

                                    let mut combined = stream::select_all(with_id);
                                    let mut all_install_successful = true;

                                    while let Some((request_id, item)) = combined.next().await {
                                        if cancel_token_cancelled(&cancel_token) {
                                            break;
                                        }

                                        for msg in self.drain_elicitation_messages(&session_config).await {
                                            yield AgentEvent::Message(msg);
                                        }

                                        match item {
                                            ToolStreamItem::Result(output) => {
                                                if enable_extension_request_ids.contains(&request_id)
                                                    && output.is_err()
                                                {
                                                    all_install_successful = false;
                                                }
                                                if output
                                                    .as_ref()
                                                    .ok()
                                                    .is_some_and(runtime_tool_result_surface_updated)
                                                {
                                                    tools_updated = true;
                                                }
                                                if let Some(response_msg) = request_to_response_map.get(&request_id) {
                                                    let metadata = request_metadata.get(&request_id).and_then(|m| m.as_ref());
                                                    let mut response = response_msg.lock().await;
                                                    *response = response.clone().with_tool_response_with_metadata(request_id, output, metadata);
                                                }
                                            }
                                            ToolStreamItem::Message(msg) => {
                                                yield AgentEvent::McpNotification((request_id, msg));
                                            }
                                        }
                                    }

                                    // check for remaining elicitation messages after all tools complete
                                    for msg in self.drain_elicitation_messages(&session_config).await {
                                        yield AgentEvent::Message(msg);
                                    }

                                    if all_install_successful && !enable_extension_request_ids.is_empty() {
                                        if let Err(e) = self.save_extension_state(&session_config).await {
                                            warn!("Failed to save extension state after runtime changes: {}", e);
                                        }
                                        tools_updated = true;
                                    }
                                }

                                // Preserve the original assistant turn as one atomic provider round:
                                // thinking/text/tool requests must stay together so providers like
                                // DeepSeek can receive reasoning_content on the same assistant
                                // tool-call message during the next turn.
                                messages_to_add.push(normalized_response);

                                for (idx, request) in frontend_requests.iter().chain(remaining_requests.iter()).enumerate() {
                                    if request.tool_call.is_ok() {
                                        let final_response = tool_response_messages[idx]
                                                                .lock().await.clone();
                                        yield AgentEvent::Message(final_response.clone());
                                        messages_to_add.push(final_response);
                                    }
                                }

                                no_tools_called = false;
                            }
                        }
                        Err(ref provider_err @ ProviderError::ContextLengthExceeded(_)) => {
                            yield AgentEvent::ProviderTrace {
                                event: provider_trace_failed(
                                    &provider_trace_provider,
                                    &provider_trace_model,
                                    provider_trace_attempt,
                                    &provider_trace_started_at,
                                    provider_failure(provider_err),
                                )
                                .with_response_context(provider_response_context.as_ref()),
                            };

                            if !overflow_handler.can_retry() {
                                error!("Context limit exceeded after compaction - prompt too large");
                                yield AgentEvent::Message(
                                    Message::assistant().with_system_notification(
                                        SystemNotificationType::InlineMessage,
                                        "Unable to continue: Context limit still exceeded after compaction. Try using a shorter message, a model with a larger context window, or start a new session."
                                    )
                                );
                                break;
                            }

                            let automatic_compaction_enabled = false;
                            if !automatic_compaction_enabled {
                                yield AgentEvent::Message(
                                    Message::assistant().with_system_notification(
                                        SystemNotificationType::InlineMessage,
                                        AUTO_COMPACTION_DISABLED_CONTEXT_LIMIT_TEXT,
                                    )
                                );
                                break;
                            }

                            yield AgentEvent::Message(
                                Message::assistant().with_system_notification(
                                    SystemNotificationType::InlineMessage,
                                    format!(
                                        "Context limit reached. Compacting to continue conversation... (attempt {}/{})",
                                        overflow_handler.compaction_attempts() + 1,
                                        2
                                    ),
                                )
                            );
                            yield AgentEvent::Message(
                                Message::assistant().with_system_notification(
                                    SystemNotificationType::ThinkingMessage,
                                    COMPACTION_THINKING_TEXT,
                                )
                            );

                            if let Err(e) = overflow_handler.note_compaction_attempt() {
                                error!("Compaction failed: {}", e);
                                yield AgentEvent::Message(
                                    Message::assistant().with_system_notification(
                                        SystemNotificationType::InlineMessage,
                                        format!("Compaction failed: {}", e),
                                    )
                                );
                                break;
                            }

                            let compaction_item_id = Self::context_compaction_item_id(
                                session_config.turn_id.as_deref().unwrap_or("unknown-turn"),
                            );
                            yield AgentEvent::ContextCompactionStarted {
                                item_id: compaction_item_id.clone(),
                                trigger: ContextCompactionTrigger::Overflow.as_str().to_string(),
                                detail: Some(
                                    ContextCompactionTrigger::Overflow
                                        .started_detail()
                                        .to_string(),
                                ),
                            };

                            match self
                                .perform_context_compaction(&session_config, &conversation, false)
                                .await
                            {
                                Ok(result) => {
                                    conversation = result.compacted_conversation;
                                    did_recovery_compact_this_iteration = true;
                                    yield AgentEvent::HistoryReplaced(conversation.clone());
                                    yield AgentEvent::ContextCompactionCompleted {
                                        item_id: compaction_item_id,
                                        trigger: ContextCompactionTrigger::Overflow
                                            .as_str()
                                            .to_string(),
                                        detail: Some(
                                            ContextCompactionTrigger::Overflow
                                                .completed_detail()
                                                .to_string(),
                                        ),
                                    };
                                    yield AgentEvent::ContextCompactionWarning {
                                        message: CONTEXT_COMPACTION_WARNING_TEXT.to_string(),
                                    };
                                    break;
                                }
                                Err(e) => {
                                    error!("Compaction failed: {}", e);
                                    yield AgentEvent::Message(
                                        Message::assistant().with_system_notification(
                                            SystemNotificationType::InlineMessage,
                                            format!("Compaction failed: {}", e),
                                        )
                                    );
                                    break;
                                }
                            }
                        }
                        Err(ref provider_err) => {
                            yield AgentEvent::ProviderTrace {
                                event: provider_trace_failed(
                                    &provider_trace_provider,
                                    &provider_trace_model,
                                    provider_trace_attempt,
                                    &provider_trace_started_at,
                                    provider_failure(provider_err),
                                )
                                .with_response_context(provider_response_context.as_ref()),
                            };
                            if should_log_provider_failure_as_error(provider_err) {
                                error!("Error: {}", provider_err);
                            } else {
                                info!("Provider request rejected: {}", provider_err);
                            }
                            yield AgentEvent::Message(
                                Message::assistant().with_text(
                                    format!("Ran into this error: {provider_err}.\n\nPlease retry if you think this is a transient or recoverable error.")
                                )
                            );
                            break;
                        }
                    }
                }
                if tools_updated {
                    let session_prompt = session_config.system_prompt.as_deref();
                    let session_prompt_override =
                        session_config.system_prompt_override.unwrap_or(false);
                    (tools, toolshim_tools, system_prompt) =
                        self.prepare_tools_and_prompt(
                            &working_dir,
                            session_prompt,
                            session_prompt_override,
                            &model_config,
                        ).await?;
                }
                let mut exit_chat = false;
                if cancel_token_cancelled(&cancel_token) {
                    messages_to_add.clear();
                    messages_to_add.push(cancelled_turn_context_marker_message());
                    exit_chat = true;
                } else if no_tools_called {
                    if let Some(final_output_tool) = self.final_output_tool.lock().await.as_ref() {
                        if final_output_tool.final_output.is_none() {
                            warn!("Final output tool has not been called yet. Continuing agent loop.");
                            let message = Message::user()
                                .with_text(FINAL_OUTPUT_CONTINUATION_MESSAGE)
                                .agent_only();
                            messages_to_add.push(message.clone());
                            yield AgentEvent::Message(message);
                        } else {
                            let message = Message::assistant().with_text(final_output_tool.final_output.clone().unwrap());
                            messages_to_add.push(message.clone());
                            yield AgentEvent::Message(message);
                            exit_chat = true;
                        }
                    } else if did_recovery_compact_this_iteration {
                        // Avoid setting exit_chat; continue from last user message in the conversation
                    } else {
                        match self.handle_retry_logic(&mut conversation, &session_config, &initial_messages).await {
                            Ok(should_retry) => {
                                if should_retry {
                                    info!("Retry logic triggered, restarting agent loop");
                                } else {
                                    exit_chat = true;
                                }
                            }
                            Err(e) => {
                                error!("Retry logic failed: {}", e);
                                yield AgentEvent::Message(
                                    Message::assistant().with_text(
                                        format!("Retry logic encountered an error: {}", e)
                                    )
                                );
                                exit_chat = true;
                            }
                        }
                    }
                } else if should_stop_after_tool_result(
                    session_config.turn_context.as_ref(),
                    &messages_to_add,
                ) {
                    exit_chat = true;
                }

                for msg in &messages_to_add {
                    self.store_add_message(&session_config.id, msg).await?;
                }
                conversation.extend(messages_to_add);
                if exit_chat {
                    break;
                }

                tokio::task::yield_now().await;
            }

            if let Some((session_for_name, conversation_for_name, provider)) =
                deferred_session_name_generation
            {
                let conversation_for_name =
                    conversation_for_name.unwrap_or_else(|| conversation.clone());
                tokio::spawn(async move {
                    if let Err(e) = SessionManager::maybe_update_name_for_session(
                        &session_for_name,
                        &conversation_for_name,
                        provider,
                    )
                    .await
                    {
                        log_session_description_failure(&e);
                    }
                });
            }
        }))
    }

    pub async fn extend_system_prompt(&self, instruction: String) {
        let mut prompt_manager = self.prompt_manager.lock().await;
        prompt_manager.add_system_prompt_extra(instruction);
    }

    pub async fn update_provider(
        &self,
        provider: Arc<dyn Provider>,
        session_id: &str,
    ) -> Result<()> {
        let mut current_provider = self.provider.lock().await;
        *current_provider = Some(provider.clone());

        self.store_update_provider_config(
            session_id,
            provider.get_name().to_string(),
            provider.get_model_config(),
        )
        .await
        .context("Failed to persist provider config to session")
    }

    pub async fn set_permission_mode(&self, mode: AsterMode) {
        self.tool_inspection_manager
            .update_permission_inspector_mode(mode)
            .await;
    }

    /// Override the system prompt with a custom template
    pub async fn override_system_prompt(&self, template: String) {
        let mut prompt_manager = self.prompt_manager.lock().await;
        prompt_manager.set_system_prompt_override(template);
    }

    pub async fn list_extension_prompts(&self) -> HashMap<String, Vec<Prompt>> {
        self.extension_manager
            .list_prompts(CancellationToken::default())
            .await
            .expect("Failed to list prompts")
    }

    pub async fn get_prompt(&self, name: &str, arguments: Value) -> Result<GetPromptResult> {
        // First find which extension has this prompt
        let prompts = self
            .extension_manager
            .list_prompts(CancellationToken::default())
            .await
            .map_err(|e| anyhow!("Failed to list prompts: {}", e))?;

        if let Some(extension) = prompts
            .iter()
            .find(|(_, prompt_list)| prompt_list.iter().any(|p| p.name == name))
            .map(|(extension, _)| extension)
        {
            return self
                .extension_manager
                .get_prompt(extension, name, arguments, CancellationToken::default())
                .await
                .map_err(|e| anyhow!("Failed to get prompt: {}", e));
        }

        Err(anyhow!("Prompt '{}' not found", name))
    }

    pub async fn get_plan_prompt(&self) -> Result<String> {
        let tools = self.extension_manager.get_prefixed_tools(None).await?;
        let tools_info = tools
            .into_iter()
            .map(|tool| {
                ToolInfo::new(
                    &tool.name,
                    tool.description
                        .as_ref()
                        .map(|d| d.as_ref())
                        .unwrap_or_default(),
                    get_parameter_names(&tool),
                    None,
                )
            })
            .collect();

        let plan_prompt = self.extension_manager.get_planning_prompt(tools_info).await;

        Ok(plan_prompt)
    }

    pub async fn handle_tool_result(&self, id: String, result: ToolResult<CallToolResult>) {
        if let Err(e) = self.tool_result_tx.send((id, result)).await {
            error!("Failed to send tool result: {}", e);
        }
    }
}
