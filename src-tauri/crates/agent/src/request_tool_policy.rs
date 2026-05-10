//! 请求级工具策略与统一回复执行链
//!
//! 该模块沉淀“请求级工具策略（例如联网搜索）”与统一流式执行逻辑，
//! 供 aster_agent_cmd、scheduler、gateway 等入口复用同一条执行主链。

use crate::protocol::{
    AgentEvent as RuntimeAgentEvent, AgentRuntimeStatus, AgentToolResult, TextDeltaBatchBoundary,
};
use crate::protocol_projection::project_runtime_event;
use crate::write_artifact_events::WriteArtifactEventEmitter;
use aster::agents::{Agent, AgentEvent as AsterAgentEvent};
use aster::conversation::message::{Message, MessageContent, SystemNotificationType};
use aster::session::SessionManager;
use aster::tools::ToolContext;
use futures::{stream, StreamExt};
use lime_core::env_compat;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::Map;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::Instant;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

pub const REQUEST_TOOL_POLICY_MARKER: &str = "【请求级工具策略】";
pub const WEB_SEARCH_PREFETCH_CONTEXT_MARKER: &str = "【联网预检索上下文】";
pub const WEB_SEARCH_SYNTHESIS_MARKER: &str = "【预检索后输出要求】";

const EMPTY_REPLY_DIRECT_ANSWER_RETRY_PROMPT: &str = "请继续。你上一条回复没有输出任何内容。不要重复调用工具，直接基于当前上下文给出最终答复；如果当前确实无法继续，请明确说明原因。";
const INCOMPLETE_TOOL_BATCH_CONTINUE_PROMPT: &str = "请继续。你上一条回复还是中间过程结论，不是最终答复。若仍缺关键证据，请立刻继续下一批必要工具调用；证据足够后直接给出完整结论。不要停在“还需要继续查看/读取/确认”的中间态，也不要重复上一批已经完成的工具。";
const DEFAULT_REQUIRED_TOOLS: &[&str] = &["WebSearch"];
const DEFAULT_ALLOWED_TOOLS: &[&str] = &["WebSearch", "WebFetch"];
const WEB_SEARCH_REQUIRED_TOOLS_ENV_KEYS: &[&str] = &[
    "LIME_WEB_SEARCH_REQUIRED_TOOLS",
    "PROXYCAST_WEB_SEARCH_REQUIRED_TOOLS",
];
const WEB_SEARCH_ALLOWED_TOOLS_ENV_KEYS: &[&str] = &[
    "LIME_WEB_SEARCH_ALLOWED_TOOLS",
    "PROXYCAST_WEB_SEARCH_ALLOWED_TOOLS",
];
const WEB_SEARCH_DISALLOWED_TOOLS_ENV_KEYS: &[&str] = &[
    "LIME_WEB_SEARCH_DISALLOWED_TOOLS",
    "PROXYCAST_WEB_SEARCH_DISALLOWED_TOOLS",
];
const WEB_SEARCH_PREFLIGHT_ENABLED_ENV_KEYS: &[&str] = &[
    "LIME_WEB_SEARCH_PREFLIGHT_ENABLED",
    "PROXYCAST_WEB_SEARCH_PREFLIGHT_ENABLED",
];
const STREAM_EVENT_DIAG_WARN_TEXT_DELTA_CHARS: usize = 2_000;
const STREAM_EVENT_DIAG_WARN_TOOL_OUTPUT_CHARS: usize = 8_000;
const STREAM_EVENT_DIAG_WARN_CONTEXT_STEPS: usize = 24;
const TEXT_DELTA_BATCH_BACKLOG_CHARS: usize = 120;
const NEWS_PREFLIGHT_QUERY_PARALLELISM: usize = 4;
const NEWS_PREFLIGHT_QUERY_OUTPUT_CHAR_LIMIT: usize = 1_600;
const NEWS_PREFLIGHT_CONTEXT_CHAR_LIMIT: usize = 6_000;
const NEWS_PREFLIGHT_RESULT_LINES: usize = 18;
const WEB_SEARCH_EMPTY_REPLY_RETRY_PROMPT: &str = "请继续。你已经完成本回合所需的 WebSearch 预检索，现在必须直接给出最终答复，不要再次调用 WebSearch 或 WebFetch。请至少输出：1. 结论摘要；2. 主题归纳；3. 关键信息；4. 如有分歧，说明来源差异。";
const ASTER_AUTO_COMPACTION_START_PREFIX: &str = "Exceeded auto-compact threshold of ";
const ASTER_AUTO_COMPACTION_COMPLETE_TEXT: &str = "Compaction complete";
const ASTER_AUTO_COMPACTION_THINKING_TEXT: &str = "aster is compacting the conversation...";
const ASTER_AUTO_COMPACTION_ERROR_PREFIX: &str = "Ran into this error trying to compact:";
const ASTER_AUTO_COMPACTION_DISABLED_TEXT: &str = "Automatic compaction is disabled for this turn. The conversation reached the context limit. Compact the session manually or start a new session before retrying.";
const CANCELLED_TURN_CONTEXT_MARKER: &str =
    "上一回合已被用户停止，不要继续回答被停止的请求；等待并仅处理后续用户消息。";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RequestToolPolicyMode {
    #[default]
    Disabled,
    Allowed,
    Required,
}

impl RequestToolPolicyMode {
    pub fn enables_web_search(self) -> bool {
        !matches!(self, Self::Disabled)
    }

    pub fn requires_web_search(self) -> bool {
        matches!(self, Self::Required)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::Allowed => "allowed",
            Self::Required => "required",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestToolPolicy {
    /// 本次请求的联网搜索语义
    pub search_mode: RequestToolPolicyMode,
    /// 本次请求是否开启联网搜索策略
    pub effective_web_search: bool,
    /// 必须至少成功一次的工具（默认 WebSearch）
    pub required_tools: Vec<String>,
    /// 允许的联网工具集合（默认 WebSearch/WebFetch）
    pub allowed_tools: Vec<String>,
    /// 禁止工具集合（可配置）
    pub disallowed_tools: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ToolAttemptRecord {
    pub tool_id: String,
    pub tool_name: String,
    pub success: Option<bool>,
    pub error: Option<String>,
}

#[derive(Debug, Default)]
pub struct WebSearchExecutionTracker {
    ordered_tool_ids: Vec<String>,
    attempts_by_id: HashMap<String, ToolAttemptRecord>,
}

impl WebSearchExecutionTracker {
    pub fn record_tool_start(
        &mut self,
        policy: &RequestToolPolicy,
        tool_id: &str,
        tool_name: &str,
    ) {
        if !policy.effective_web_search || tool_id.trim().is_empty() || tool_name.trim().is_empty()
        {
            return;
        }

        if !self.attempts_by_id.contains_key(tool_id) {
            self.ordered_tool_ids.push(tool_id.to_string());
            self.attempts_by_id.insert(
                tool_id.to_string(),
                ToolAttemptRecord {
                    tool_id: tool_id.to_string(),
                    tool_name: tool_name.to_string(),
                    success: None,
                    error: None,
                },
            );
        }
    }

    pub fn record_tool_end(
        &mut self,
        policy: &RequestToolPolicy,
        tool_id: &str,
        success: bool,
        error: Option<&str>,
    ) {
        if !policy.effective_web_search || tool_id.trim().is_empty() {
            return;
        }
        if let Some(record) = self.attempts_by_id.get_mut(tool_id) {
            record.success = Some(success);
            record.error = error
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string());
        }
    }

    pub fn validate_web_search_requirement(
        &self,
        policy: &RequestToolPolicy,
    ) -> Result<(), String> {
        if !policy.requires_web_search() {
            return Ok(());
        }

        let disallowed_attempts: Vec<&ToolAttemptRecord> = self
            .ordered_tool_ids
            .iter()
            .filter_map(|tool_id| self.attempts_by_id.get(tool_id))
            .filter(|record| matches_tool_list(&record.tool_name, &policy.disallowed_tools))
            .collect();
        if !disallowed_attempts.is_empty() {
            let disallowed_names = disallowed_attempts
                .iter()
                .map(|record| record.tool_name.clone())
                .collect::<Vec<_>>()
                .join(", ");
            return Err(format!(
                "联网搜索策略阻止了禁止工具调用: {}。\n尝试记录: {}",
                disallowed_names,
                self.format_attempts()
            ));
        }

        let required_attempts: Vec<&ToolAttemptRecord> = self
            .ordered_tool_ids
            .iter()
            .filter_map(|tool_id| self.attempts_by_id.get(tool_id))
            .filter(|record| policy.matches_any_required_tool(&record.tool_name))
            .collect();

        if required_attempts.is_empty() {
            return Err(format!(
                "联网搜索已开启，但未检测到必需工具调用。必须先调用 {} 至少一次后再给出最终答复。\n尝试记录: {}",
                policy.required_tools.join(", "),
                self.format_attempts()
            ));
        }

        if required_attempts
            .iter()
            .any(|record| record.success.unwrap_or(false))
        {
            return Ok(());
        }

        Err(format!(
            "联网搜索已开启，但必需工具调用全部失败，无法给出符合约束的最终答复。\n失败原因与尝试记录: {}",
            self.format_attempts()
        ))
    }

    pub fn format_attempts(&self) -> String {
        if self.ordered_tool_ids.is_empty() {
            return "无工具调用".to_string();
        }

        self.ordered_tool_ids
            .iter()
            .filter_map(|tool_id| self.attempts_by_id.get(tool_id))
            .map(|record| {
                let status = match record.success {
                    Some(true) => "success".to_string(),
                    Some(false) => {
                        format!("failed({})", record.error.as_deref().unwrap_or("unknown"))
                    }
                    None => "pending".to_string(),
                };
                format!("{}#{}:{}", record.tool_name, record.tool_id, status)
            })
            .collect::<Vec<_>>()
            .join("; ")
    }
}

#[derive(Debug, Clone)]
pub struct PreflightToolExecution {
    pub events: Vec<RuntimeAgentEvent>,
    pub planned_queries: Vec<String>,
    pub system_prompt_appendix: Option<String>,
    pub coverage_summary: Option<String>,
}

pub struct WebSearchPreflightRequest<'a> {
    pub agent: &'a Agent,
    pub session_id: &'a str,
    pub message_text: &'a str,
    pub working_directory: Option<&'a Path>,
    pub cancel_token: Option<CancellationToken>,
    pub turn_context: Option<aster::session::TurnContextOverride>,
    pub policy: &'a RequestToolPolicy,
}

impl PreflightToolExecution {
    fn none() -> Self {
        Self {
            events: Vec::new(),
            planned_queries: Vec::new(),
            system_prompt_appendix: None,
            coverage_summary: None,
        }
    }
}

#[derive(Debug, Clone)]
struct PlannedWebSearchQuery {
    index: usize,
    query: String,
    tool_id: String,
    arguments: Option<String>,
}

#[derive(Debug, Clone)]
struct PreflightSearchOutcome {
    index: usize,
    query: String,
    tool_id: String,
    success: bool,
    output: String,
    error: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ReplyAttemptError {
    pub message: String,
    pub emitted_any: bool,
}

#[derive(Debug, Default)]
struct StreamEventDiagnostics {
    text_delta_count: usize,
    tool_start_count: usize,
    tool_end_count: usize,
    error_count: usize,
    context_trace_events: usize,
    artifact_snapshot_count: usize,
    persisted_artifact_count: usize,
    saved_site_content_count: usize,
    max_text_delta_chars: usize,
    max_tool_output_chars: usize,
    max_context_trace_steps: usize,
    last_persisted_artifact_path: Option<String>,
    last_saved_markdown_path: Option<String>,
}

fn update_stream_event_diagnostics(
    diagnostics: &mut StreamEventDiagnostics,
    event: &RuntimeAgentEvent,
) {
    match event {
        RuntimeAgentEvent::TextDelta { text } => {
            diagnostics.text_delta_count += 1;
            let char_count = text.chars().count();
            diagnostics.max_text_delta_chars = diagnostics.max_text_delta_chars.max(char_count);
            if char_count >= STREAM_EVENT_DIAG_WARN_TEXT_DELTA_CHARS {
                tracing::warn!(
                    "[AsterAgent][Diag] large text_delta observed: chars={}",
                    char_count
                );
            }
        }
        RuntimeAgentEvent::ToolStart { .. } => {
            diagnostics.tool_start_count += 1;
        }
        RuntimeAgentEvent::ToolEnd { tool_id, result } => {
            diagnostics.tool_end_count += 1;
            let output_chars = result.output.chars().count();
            diagnostics.max_tool_output_chars = diagnostics.max_tool_output_chars.max(output_chars);
            if tool_result_contains_saved_site_content(result) {
                diagnostics.saved_site_content_count += 1;
                if diagnostics.last_saved_markdown_path.is_none() {
                    diagnostics.last_saved_markdown_path =
                        extract_saved_markdown_path_from_tool_result(result);
                }
            }
            if output_chars >= STREAM_EVENT_DIAG_WARN_TOOL_OUTPUT_CHARS {
                tracing::warn!(
                    "[AsterAgent][Diag] large tool_end output observed: tool_id={}, output_chars={}, success={}",
                    tool_id,
                    output_chars,
                    result.success
                );
            }
        }
        RuntimeAgentEvent::ContextTrace { steps } => {
            diagnostics.context_trace_events += 1;
            diagnostics.max_context_trace_steps =
                diagnostics.max_context_trace_steps.max(steps.len());
            if steps.len() >= STREAM_EVENT_DIAG_WARN_CONTEXT_STEPS {
                tracing::warn!(
                    "[AsterAgent][Diag] large context_trace observed: steps={}",
                    steps.len()
                );
            }
        }
        RuntimeAgentEvent::ArtifactSnapshot { artifact } => {
            diagnostics.artifact_snapshot_count += 1;
            if artifact_snapshot_is_persisted(artifact) {
                diagnostics.persisted_artifact_count += 1;
                if diagnostics.last_persisted_artifact_path.is_none() {
                    diagnostics.last_persisted_artifact_path = Some(artifact.file_path.clone());
                }
            }
        }
        RuntimeAgentEvent::Error { .. } => {
            diagnostics.error_count += 1;
        }
        _ => {}
    }
}

#[derive(Debug, Default)]
struct TextDeltaBatcher {
    chunks: Vec<String>,
    text: String,
}

impl TextDeltaBatcher {
    fn is_empty(&self) -> bool {
        self.text.is_empty()
    }

    fn push(&mut self, text: String) -> Option<RuntimeAgentEvent> {
        if text.is_empty() {
            return None;
        }

        let boundary = if text.contains('\n') {
            Some(TextDeltaBatchBoundary::Newline)
        } else {
            None
        };
        self.text.push_str(&text);
        self.chunks.push(text);

        let boundary = boundary.or_else(|| {
            (self.text.chars().count() >= TEXT_DELTA_BATCH_BACKLOG_CHARS)
                .then_some(TextDeltaBatchBoundary::Backlog)
        });
        boundary.and_then(|boundary| self.flush(boundary))
    }

    fn flush(&mut self, boundary: TextDeltaBatchBoundary) -> Option<RuntimeAgentEvent> {
        if self.is_empty() {
            return None;
        }

        let text = std::mem::take(&mut self.text);
        let chunks = std::mem::take(&mut self.chunks);
        Some(RuntimeAgentEvent::TextDeltaBatch {
            text,
            chunks,
            boundary,
        })
    }
}

fn emit_text_delta_batch<F>(
    batcher: &mut TextDeltaBatcher,
    boundary: TextDeltaBatchBoundary,
    emitted_any: &mut bool,
    on_event: &mut F,
) where
    F: FnMut(&RuntimeAgentEvent),
{
    if let Some(event) = batcher.flush(boundary) {
        *emitted_any = true;
        on_event(&event);
    }
}

#[derive(Debug, Clone, Default)]
pub struct StreamReplyExecution {
    pub text_output: String,
    pub event_errors: Vec<String>,
    pub emitted_any: bool,
    pub attempts_summary: String,
    pub cancelled: bool,
}

fn is_reply_cancelled(cancel_token: &Option<CancellationToken>) -> bool {
    cancel_token
        .as_ref()
        .is_some_and(CancellationToken::is_cancelled)
}

fn build_stream_reply_execution(
    text_output: String,
    event_errors: Vec<String>,
    emitted_any: bool,
    attempts_summary: String,
    cancelled: bool,
) -> StreamReplyExecution {
    StreamReplyExecution {
        text_output,
        event_errors,
        emitted_any,
        attempts_summary,
        cancelled,
    }
}

fn cancelled_turn_context_marker_message() -> Message {
    Message::assistant()
        .with_text(CANCELLED_TURN_CONTEXT_MARKER)
        .agent_only()
}

async fn persist_cancelled_turn_context_marker(agent: &Agent, session_id: &str) {
    let message = cancelled_turn_context_marker_message();
    let result = if let Some(store) = agent.session_store() {
        store.add_message(session_id, &message).await
    } else {
        SessionManager::add_message(session_id, &message).await
    };

    if let Err(error) = result {
        tracing::warn!(
            "[AsterAgent][ReplyPolicy] 写入取消上下文标记失败，已降级继续: session_id={}, error={}",
            session_id,
            error
        );
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReplyRetryMode {
    None,
    WebSearchSynthesis,
    DirectAnswer,
    IntermediateConclusion,
}

fn build_empty_final_reply_fallback(
    diagnostics: &StreamEventDiagnostics,
    emitted_any: bool,
) -> Option<String> {
    if !emitted_any {
        return None;
    }

    build_output_preserved_reply_fallback(diagnostics)
}

fn read_lookup_string<'a, F>(keys: &[&str], mut lookup: F) -> Option<String>
where
    F: FnMut(&str) -> Option<&'a Value>,
{
    keys.iter().find_map(|key| {
        lookup(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
    })
}

fn read_metadata_string(metadata: &HashMap<String, Value>, keys: &[&str]) -> Option<String> {
    read_lookup_string(keys, |key| metadata.get(key))
}

fn read_json_map_string(metadata: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    read_lookup_string(keys, |key| metadata.get(key))
}

fn tool_result_contains_saved_site_content(result: &AgentToolResult) -> bool {
    let Some(metadata) = result.metadata.as_ref() else {
        return false;
    };
    metadata
        .get("saved_content")
        .and_then(Value::as_object)
        .is_some()
}

fn extract_saved_markdown_path_from_tool_result(result: &AgentToolResult) -> Option<String> {
    let metadata = result.metadata.as_ref()?;
    let saved_content = metadata.get("saved_content")?.as_object()?;
    read_json_map_string(
        saved_content,
        &["markdown_relative_path", "markdownRelativePath"],
    )
}

fn artifact_snapshot_is_persisted(artifact: &crate::protocol::AgentArtifactSignal) -> bool {
    let Some(metadata) = artifact.metadata.as_ref() else {
        return false;
    };

    let phase = read_metadata_string(metadata, &["writePhase", "write_phase"])
        .unwrap_or_default()
        .to_ascii_lowercase();
    if phase == "persisted" {
        return true;
    }

    metadata
        .get("complete")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn should_downgrade_provider_tail_failure(
    error_message: &str,
    diagnostics: &StreamEventDiagnostics,
    emitted_any: bool,
) -> bool {
    emitted_any
        && error_message
            .trim()
            .to_ascii_lowercase()
            .starts_with("agent provider execution failed:")
        && build_output_preserved_reply_fallback(diagnostics).is_some()
}

fn build_output_preserved_reply_fallback(diagnostics: &StreamEventDiagnostics) -> Option<String> {
    if diagnostics.saved_site_content_count > 0 {
        let markdown_hint = diagnostics
            .last_saved_markdown_path
            .as_deref()
            .map(|path| format!("（Markdown：{path}）"))
            .unwrap_or_default();
        return Some(format!(
            "本轮站点内容已成功保存到项目文件中{markdown_hint}。由于模型通道暂时不可用，未能补充最终总结；详细过程与产物已保留在当前对话中。"
        ));
    }

    if diagnostics.persisted_artifact_count > 0 {
        let artifact_hint = diagnostics
            .last_persisted_artifact_path
            .as_deref()
            .map(|path| format!("（文件：{path}）"))
            .unwrap_or_default();
        return Some(format!(
            "本轮输出文件已成功生成{artifact_hint}。由于模型通道暂时不可用，未能补充最终总结；详细过程与产物已保留在当前对话中。"
        ));
    }

    None
}

#[derive(Debug, Default)]
struct AutoCompactionProjectionState;

impl AutoCompactionProjectionState {
    fn project_event(&mut self, agent_event: &AsterAgentEvent) -> Option<Vec<RuntimeAgentEvent>> {
        match agent_event {
            AsterAgentEvent::Message(message) => self.project_message(message),
            _ => None,
        }
    }

    fn project_message(&mut self, message: &Message) -> Option<Vec<RuntimeAgentEvent>> {
        let Some((notification_type, notification_text)) =
            extract_single_system_notification(message)
        else {
            let error_message = extract_auto_compaction_failure(message)?;
            return Some(vec![RuntimeAgentEvent::Error {
                message: error_message,
            }]);
        };

        match notification_type {
            SystemNotificationType::InlineMessage
                if notification_text.starts_with(ASTER_AUTO_COMPACTION_START_PREFIX) =>
            {
                Some(vec![])
            }
            SystemNotificationType::ThinkingMessage
                if notification_text == ASTER_AUTO_COMPACTION_THINKING_TEXT =>
            {
                Some(vec![])
            }
            SystemNotificationType::InlineMessage
                if notification_text == ASTER_AUTO_COMPACTION_COMPLETE_TEXT =>
            {
                Some(vec![])
            }
            SystemNotificationType::InlineMessage
                if notification_text == ASTER_AUTO_COMPACTION_DISABLED_TEXT =>
            {
                Some(vec![RuntimeAgentEvent::Error {
                    message:
                        "当前会话已达到上下文上限，但当前工作区已关闭自动压缩。请先手动压缩上下文或新建会话后重试。"
                            .to_string(),
                }])
            }
            _ => None,
        }
    }
}

fn extract_single_system_notification(message: &Message) -> Option<(SystemNotificationType, &str)> {
    if message.content.len() != 1 {
        return None;
    }

    match message.content.first()? {
        MessageContent::SystemNotification(notification) => Some((
            notification.notification_type.clone(),
            notification.msg.trim(),
        )),
        _ => None,
    }
}

fn extract_auto_compaction_failure(message: &Message) -> Option<String> {
    let text = message.as_concat_text();
    let trimmed = text.trim();
    if !trimmed.starts_with(ASTER_AUTO_COMPACTION_ERROR_PREFIX) {
        return None;
    }

    let detail = trimmed
        .trim_start_matches(ASTER_AUTO_COMPACTION_ERROR_PREFIX)
        .trim()
        .split_once("\n\nPlease try again or create a new session")
        .map(|(left, _)| left.trim())
        .unwrap_or_else(|| {
            trimmed
                .trim_start_matches(ASTER_AUTO_COMPACTION_ERROR_PREFIX)
                .trim()
        })
        .trim_end_matches('.');

    let message = if detail.is_empty() {
        "自动压缩上下文失败，请重试或新建会话。".to_string()
    } else {
        format!("自动压缩上下文失败，请重试或新建会话：{detail}")
    };

    Some(message)
}

impl RequestToolPolicy {
    pub fn allows_web_search(&self) -> bool {
        self.search_mode.enables_web_search()
    }

    pub fn requires_web_search(&self) -> bool {
        self.search_mode.requires_web_search()
    }

    pub fn matches_any_required_tool(&self, tool_name: &str) -> bool {
        matches_tool_list(tool_name, &self.required_tools)
    }

    pub fn matches_any_allowed_tool(&self, tool_name: &str) -> bool {
        matches_tool_list(tool_name, &self.allowed_tools)
    }
}

/// 解析请求级工具策略
///
/// 规则：
/// - `effective_web_search = request_web_search.unwrap_or(mode_default)`
/// - 白/黑名单支持环境变量覆盖：
///   - `LIME_WEB_SEARCH_REQUIRED_TOOLS`（兼容 `PROXYCAST_WEB_SEARCH_REQUIRED_TOOLS`）
///   - `LIME_WEB_SEARCH_ALLOWED_TOOLS`（兼容 `PROXYCAST_WEB_SEARCH_ALLOWED_TOOLS`）
///   - `LIME_WEB_SEARCH_DISALLOWED_TOOLS`（兼容 `PROXYCAST_WEB_SEARCH_DISALLOWED_TOOLS`）
pub fn resolve_request_tool_policy(
    request_web_search: Option<bool>,
    mode_default: bool,
) -> RequestToolPolicy {
    resolve_request_tool_policy_with_mode(request_web_search, None, mode_default)
}

pub fn resolve_request_tool_policy_with_mode(
    request_web_search: Option<bool>,
    request_search_mode: Option<RequestToolPolicyMode>,
    mode_default: bool,
) -> RequestToolPolicy {
    let search_mode = match (request_web_search, request_search_mode) {
        (Some(false), _) => RequestToolPolicyMode::Disabled,
        (_, Some(mode)) => mode,
        (Some(true), None) => RequestToolPolicyMode::Allowed,
        (None, None) if mode_default => RequestToolPolicyMode::Allowed,
        _ => RequestToolPolicyMode::Disabled,
    };
    let effective_web_search = search_mode.enables_web_search();
    let disallowed_tools = parse_tool_list_env(WEB_SEARCH_DISALLOWED_TOOLS_ENV_KEYS, &[]);
    let (required_tools, allowed_tools) = if effective_web_search {
        let required_tools =
            parse_tool_list_env(WEB_SEARCH_REQUIRED_TOOLS_ENV_KEYS, DEFAULT_REQUIRED_TOOLS);
        let mut allowed_tools =
            parse_tool_list_env(WEB_SEARCH_ALLOWED_TOOLS_ENV_KEYS, DEFAULT_ALLOWED_TOOLS);

        for required in &required_tools {
            if !allowed_tools
                .iter()
                .any(|candidate| is_same_tool(candidate, required))
            {
                allowed_tools.push(required.clone());
            }
        }

        (required_tools, allowed_tools)
    } else {
        (Vec::new(), Vec::new())
    };

    RequestToolPolicy {
        search_mode,
        effective_web_search,
        required_tools,
        allowed_tools,
        disallowed_tools,
    }
}

/// 合并请求级工具策略到系统提示词
///
/// - `effective_web_search=false`：保持原始 system prompt 不变
/// - 已包含 marker 时：不重复追加
pub fn merge_system_prompt_with_request_tool_policy(
    base_prompt: Option<String>,
    policy: &RequestToolPolicy,
) -> Option<String> {
    if !policy.allows_web_search() {
        return base_prompt;
    }

    let disallowed_line = if policy.disallowed_tools.is_empty() {
        "无".to_string()
    } else {
        policy.disallowed_tools.join(", ")
    };

    let policy_prompt = match policy.search_mode {
        RequestToolPolicyMode::Disabled => return base_prompt,
        RequestToolPolicyMode::Allowed => format!(
            "{REQUEST_TOOL_POLICY_MARKER}\n\
- 用户在本次请求中允许你使用联网搜索，但这不代表本回合必须联网。\n\
- 你必须先理解用户意图，优先判断应该直接回答、深度思考、规划、后台任务、多代理，还是联网核实。\n\
- 只有在用户明确要求搜索，或问题涉及最新、实时、价格、政策、规则、版本、新闻、日期敏感信息，或高风险信息需要核实时，才调用 {}（必要时再调用 WebFetch）。\n\
- 若无需联网即可可靠完成，就直接回答，不要为了展示工具能力而搜索。\n\
- 允许工具: {}\n\
- 禁止工具: {}",
            policy.required_tools.join(", "),
            policy.allowed_tools.join(", "),
            disallowed_line
        ),
        RequestToolPolicyMode::Required => format!(
            "{REQUEST_TOOL_POLICY_MARKER}\n\
- 用户在本次请求中已明确要求联网搜索。\n\
- 必须先调用 {} 至少一次（必要时再调用 WebFetch），再输出最终答复。\n\
- 若工具调用失败，必须返回失败原因与尝试记录；不要在未完成必需工具调用前直接给最终结论。\n\
- 允许工具: {}\n\
- 禁止工具: {}",
            policy.required_tools.join(", "),
            policy.allowed_tools.join(", "),
            disallowed_line
        ),
    };

    match base_prompt {
        Some(base) => {
            if base.contains(REQUEST_TOOL_POLICY_MARKER) {
                Some(base)
            } else if base.trim().is_empty() {
                Some(policy_prompt)
            } else {
                Some(format!("{base}\n\n{policy_prompt}"))
            }
        }
        None => Some(policy_prompt),
    }
}

fn parse_tool_list_env(keys: &[&str], default_values: &[&str]) -> Vec<String> {
    let from_env = env_compat::var(keys)
        .map(|raw| parse_tool_list(&raw))
        .filter(|tools| !tools.is_empty());

    let values =
        from_env.unwrap_or_else(|| default_values.iter().map(|item| item.to_string()).collect());
    dedup_tools(values)
}

fn parse_tool_list(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(|item| item.to_string())
        .collect()
}

fn dedup_tools(values: Vec<String>) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    for value in values {
        if !result.iter().any(|existing| is_same_tool(existing, &value)) {
            result.push(value);
        }
    }
    result
}

fn matches_tool_list(tool_name: &str, list: &[String]) -> bool {
    list.iter()
        .any(|candidate| is_same_tool(tool_name, candidate))
}

fn is_same_tool(a: &str, b: &str) -> bool {
    let normalized_a = normalize_tool_name(a);
    let normalized_b = normalize_tool_name(b);
    if normalized_a.is_empty() || normalized_b.is_empty() {
        return false;
    }
    normalized_a == normalized_b
        || normalized_a.contains(&normalized_b)
        || normalized_b.contains(&normalized_a)
}

fn normalize_tool_name(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect::<String>()
}

pub fn merge_system_prompt_with_web_search_preflight_context(
    base_prompt: Option<String>,
    appendix: Option<String>,
) -> Option<String> {
    match (base_prompt, appendix) {
        (Some(base), Some(extra)) => {
            if base.contains(WEB_SEARCH_PREFETCH_CONTEXT_MARKER) {
                Some(base)
            } else if base.trim().is_empty() {
                Some(extra)
            } else {
                Some(format!("{base}\n\n{extra}"))
            }
        }
        (Some(base), None) => Some(base),
        (None, Some(extra)) => Some(extra),
        (None, None) => None,
    }
}

fn should_run_web_search_preflight(policy: &RequestToolPolicy, _message_text: &str) -> bool {
    if !is_web_search_preflight_enabled() {
        return false;
    }

    policy.requires_web_search()
}

fn build_preflight_queries(message_text: &str, _policy: &RequestToolPolicy) -> Vec<String> {
    vec![derive_preflight_query(message_text)]
}

fn normalize_url_candidate(raw_url: &str) -> String {
    raw_url
        .trim()
        .trim_end_matches([',', '.', ';', ')', ']', '>'])
        .to_string()
}

fn extract_urls_from_output(output: &str) -> Vec<String> {
    let mut urls = Vec::new();
    let mut seen = HashSet::new();
    if let Ok(re) = Regex::new(r#"https?://[^\s<>"')\]]+"#) {
        for capture in re.find_iter(output) {
            let url = normalize_url_candidate(capture.as_str());
            if !url.is_empty() && seen.insert(url.clone()) {
                urls.push(url);
            }
        }
    }
    urls
}

fn extract_domain(url: &str) -> String {
    let without_protocol = url
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    without_protocol
        .split(['/', '?', '#'])
        .next()
        .unwrap_or(without_protocol)
        .trim_start_matches("www.")
        .to_string()
}

fn truncate_output_for_context(output: &str, max_chars: usize) -> String {
    let normalized = output
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.trim().is_empty())
        .take(NEWS_PREFLIGHT_RESULT_LINES)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();
    if normalized.chars().count() <= max_chars {
        normalized
    } else {
        normalized.chars().take(max_chars).collect::<String>() + "…"
    }
}

fn build_coverage_summary(
    planned_queries: &[String],
    outcomes: &[PreflightSearchOutcome],
) -> Option<String> {
    if planned_queries.is_empty() {
        return None;
    }

    let successful = outcomes.iter().filter(|item| item.success).count();
    let mut unique_urls = HashSet::new();
    let mut unique_domains = HashSet::new();
    for outcome in outcomes {
        for url in extract_urls_from_output(&outcome.output) {
            unique_domains.insert(extract_domain(&url));
            unique_urls.insert(url);
        }
    }

    Some(format!(
        "已并发预检索 {} 组查询，成功 {} 组，提取 {} 条去重链接，覆盖 {} 个站点。",
        planned_queries.len(),
        successful,
        unique_urls.len(),
        unique_domains.len()
    ))
}

fn build_preflight_prompt_appendix(
    planned_queries: &[String],
    outcomes: &[PreflightSearchOutcome],
) -> Option<String> {
    let successful = outcomes
        .iter()
        .filter(|item| item.success && !item.output.trim().is_empty())
        .collect::<Vec<_>>();
    if successful.is_empty() {
        return None;
    }

    let mut sections = vec![
        WEB_SEARCH_PREFETCH_CONTEXT_MARKER.to_string(),
        "本回合已先使用统一的 WebSearch 工具完成预检索。请优先基于以下结果做主题聚类、交叉验证和来源整合，不要退回到一次浅层搜索。".to_string(),
        "除非这些结果明显不足以回答用户问题，否则不要再次调用 WebSearch 或 WebFetch，也不要重复同一组查询；下一步应直接输出最终总结，而不是停留在工具轨迹。".to_string(),
    ];
    if let Some(summary) = build_coverage_summary(planned_queries, outcomes) {
        sections.push(summary);
    }
    sections.push("整理要求：先归纳主题，再写结论；优先采用多来源一致信息；若只来自单一来源，要在回答里显式说明。".to_string());

    let mut remaining_chars = NEWS_PREFLIGHT_CONTEXT_CHAR_LIMIT;
    for outcome in successful {
        if remaining_chars == 0 {
            break;
        }
        let excerpt_limit = remaining_chars.min(NEWS_PREFLIGHT_QUERY_OUTPUT_CHAR_LIMIT);
        let excerpt = truncate_output_for_context(&outcome.output, excerpt_limit);
        if excerpt.trim().is_empty() {
            continue;
        }
        remaining_chars = remaining_chars.saturating_sub(excerpt.chars().count());
        sections.push(format!(
            "### Query {}: {}\n{}",
            outcome.index + 1,
            outcome.query,
            excerpt
        ));
    }

    Some(sections.join("\n\n"))
}

fn merge_system_prompt_with_web_search_synthesis_instruction(
    base_prompt: Option<String>,
) -> Option<String> {
    let synthesis_prompt = format!(
        "{WEB_SEARCH_SYNTHESIS_MARKER}\n\
- 你已经完成本回合所需的 WebSearch 预检索。\n\
- 现在必须直接输出最终答复，不要再次调用 WebSearch 或 WebFetch。\n\
- 至少给出：结论摘要、主题归纳、关键信息、来源分歧说明。\n\
- 绝不能只停留在搜索轨迹或工具状态。"
    );

    match base_prompt {
        Some(base) => {
            if base.contains(WEB_SEARCH_SYNTHESIS_MARKER) {
                Some(base)
            } else if base.trim().is_empty() {
                Some(synthesis_prompt)
            } else {
                Some(format!("{base}\n\n{synthesis_prompt}"))
            }
        }
        None => Some(synthesis_prompt),
    }
}

fn build_empty_reply_retry_runtime_status() -> AgentRuntimeStatus {
    AgentRuntimeStatus {
        phase: "retrying".to_string(),
        title: "正在重试生成答复".to_string(),
        detail: "模型上一轮没有输出任何内容，正在基于当前上下文补发最终答复，不重复执行工具。"
            .to_string(),
        checkpoints: vec![
            "首轮流式回复未产出正文".to_string(),
            "当前轮次未检测到真实工具产物".to_string(),
            "正在直接补发最终答复".to_string(),
        ],
        metadata: None,
    }
}

fn build_incomplete_tool_batch_continue_runtime_status() -> AgentRuntimeStatus {
    AgentRuntimeStatus {
        phase: "continuing".to_string(),
        title: "正在补齐剩余证据".to_string(),
        detail: "检测到上一轮只给出了中间过程结论，正在继续推进下一批必要工具或整理最终结论。"
            .to_string(),
        checkpoints: vec![
            "已完成上一批工具调用".to_string(),
            "当前答复仍停留在中间过程结论".to_string(),
            "继续推进直到形成完整答复".to_string(),
        ],
        metadata: None,
    }
}

fn build_web_search_synthesis_runtime_status(coverage_summary: Option<&str>) -> AgentRuntimeStatus {
    let mut checkpoints = vec![
        "已完成 WebSearch 预检索".to_string(),
        "正在把检索结果整理为最终答复".to_string(),
        "本阶段不再重复执行搜索".to_string(),
    ];
    if let Some(summary) = coverage_summary
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        checkpoints.push(summary.to_string());
    }

    AgentRuntimeStatus {
        phase: "synthesizing".to_string(),
        title: "正在整理联网结果".to_string(),
        detail: "已完成前置扩搜，正在基于已有 WebSearch 结果输出最终总结，不再重复检索。"
            .to_string(),
        checkpoints,
        metadata: None,
    }
}

fn duplicate_session_config(config: &aster::agents::SessionConfig) -> aster::agents::SessionConfig {
    aster::agents::SessionConfig {
        id: config.id.clone(),
        thread_id: config.thread_id.clone(),
        turn_id: config.turn_id.clone(),
        schedule_id: config.schedule_id.clone(),
        max_turns: config.max_turns,
        retry_config: config.retry_config.clone(),
        system_prompt: config.system_prompt.clone(),
        system_prompt_override: config.system_prompt_override,
        include_context_trace: config.include_context_trace,
        turn_context: config.turn_context.clone(),
    }
}

async fn emit_runtime_status_with_projection<F>(
    agent: &Agent,
    session_config: &aster::agents::SessionConfig,
    status: AgentRuntimeStatus,
    on_event: &mut F,
) where
    F: FnMut(&RuntimeAgentEvent),
{
    match agent
        .upsert_runtime_status_item(
            session_config,
            status.phase.clone(),
            status.title.clone(),
            status.detail.clone(),
            status.checkpoints.clone(),
        )
        .await
    {
        Ok(agent_event) => {
            for event in project_runtime_event(agent_event) {
                on_event(&event);
            }
        }
        Err(error) => {
            tracing::warn!(
                "[AsterAgent][RuntimeStatus] 写入 runtime item 失败，降级仅发 transient 事件: {}",
                error
            );
        }
    }

    let event = RuntimeAgentEvent::RuntimeStatus { status };
    on_event(&event);
}

fn looks_like_incomplete_tool_batch_summary(text: &str) -> bool {
    let normalized = text.trim();
    if normalized.is_empty() {
        return false;
    }

    let normalized = normalized.replace("\r\n", "\n");
    let paragraphs = normalized
        .split("\n\n")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    let detection_window = if paragraphs.is_empty() {
        normalized
    } else {
        let start = paragraphs.len().saturating_sub(2);
        paragraphs[start..].join("\n\n")
    };
    let detection_window = {
        let char_count = detection_window.chars().count();
        if char_count <= 320 {
            detection_window
        } else {
            detection_window
                .chars()
                .skip(char_count - 320)
                .collect::<String>()
        }
    };
    let normalized = detection_window.trim();
    if normalized.is_empty() {
        return false;
    }

    let strong_markers = [
        "还需要",
        "现在需要",
        "下一步需要",
        "接下来需要",
        "仍需",
        "还缺",
        "仍缺",
        "继续读取",
        "继续查看",
        "继续检查",
        "继续对比",
        "继续确认",
    ];
    if strong_markers
        .iter()
        .any(|marker| normalized.contains(marker))
    {
        return true;
    }

    normalized.contains("才能")
        && [
            "读取",
            "查看",
            "检查",
            "对比",
            "确认",
            "补齐",
            "补一个证据点",
        ]
        .iter()
        .any(|marker| normalized.contains(marker))
}

fn resolve_reply_retry_mode(
    preflight_execution: &PreflightToolExecution,
    current_text_output: &str,
    tracker: &WebSearchExecutionTracker,
    diagnostics: &StreamEventDiagnostics,
    event_errors: &[String],
) -> ReplyRetryMode {
    if !event_errors.is_empty() {
        return ReplyRetryMode::None;
    }

    let trimmed_text_output = current_text_output.trim();
    if !trimmed_text_output.is_empty()
        && diagnostics.tool_start_count > 0
        && diagnostics.tool_end_count > 0
        && looks_like_incomplete_tool_batch_summary(trimmed_text_output)
    {
        return ReplyRetryMode::IntermediateConclusion;
    }

    if !trimmed_text_output.is_empty() {
        return ReplyRetryMode::None;
    }

    if preflight_execution.system_prompt_appendix.is_some() || !tracker.ordered_tool_ids.is_empty()
    {
        return ReplyRetryMode::WebSearchSynthesis;
    }

    if diagnostics.tool_start_count == 0
        && diagnostics.tool_end_count == 0
        && diagnostics.saved_site_content_count == 0
        && diagnostics.persisted_artifact_count == 0
    {
        return ReplyRetryMode::DirectAnswer;
    }

    ReplyRetryMode::None
}

fn build_empty_final_reply_attempts_summary(
    diagnostics: &StreamEventDiagnostics,
    tracker: &WebSearchExecutionTracker,
) -> String {
    if !tracker.ordered_tool_ids.is_empty() {
        return tracker.format_attempts();
    }

    if diagnostics.tool_start_count > 0 || diagnostics.tool_end_count > 0 {
        return format!(
            "已执行非联网工具（tool_start={}, tool_end={}）",
            diagnostics.tool_start_count, diagnostics.tool_end_count
        );
    }

    "无工具调用".to_string()
}

fn build_empty_final_reply_error_message(
    diagnostics: &StreamEventDiagnostics,
    tracker: &WebSearchExecutionTracker,
) -> String {
    let attempts_summary = build_empty_final_reply_attempts_summary(diagnostics, tracker);

    if diagnostics.tool_start_count == 0 && diagnostics.tool_end_count == 0 {
        format!("模型未输出最终答复，且未执行任何工具。\n尝试记录: {attempts_summary}")
    } else {
        format!("已完成当前回合的工具执行，但模型未输出最终答复。\n尝试记录: {attempts_summary}")
    }
}

#[allow(clippy::too_many_arguments)]
async fn stream_agent_reply_once<F>(
    agent: &Agent,
    user_message: Message,
    session_config: aster::agents::SessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    web_search_tracker: &mut WebSearchExecutionTracker,
    write_artifact_emitter: &mut WriteArtifactEventEmitter,
    emitted_any: &mut bool,
    text_chunks: &mut Vec<String>,
    event_errors: &mut Vec<String>,
    diagnostics: &mut StreamEventDiagnostics,
    on_event: &mut F,
) -> Result<(), ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent),
{
    let started_at = Instant::now();
    let mut auto_compaction_projection = AutoCompactionProjectionState;
    let mut inline_provider_error = None;
    let mut text_delta_batcher = TextDeltaBatcher::default();
    let session_id = session_config.id.clone();
    tracing::info!(
        "[AsterAgent][TTFT] agent.reply start: session_id={}, message_chars={}",
        session_id,
        user_message.as_concat_text().chars().count()
    );
    let cancel_probe = cancel_token.clone();
    let mut stream = agent
        .reply(user_message, session_config, cancel_token)
        .await
        .map_err(|e| ReplyAttemptError {
            message: format!("Agent error: {e}"),
            emitted_any: *emitted_any,
        })?;
    tracing::info!(
        "[AsterAgent][TTFT] agent.reply stream created: elapsed_ms={}",
        started_at.elapsed().as_millis()
    );

    loop {
        let event_result = match cancel_probe.as_ref() {
            Some(token) => {
                tokio::select! {
                    _ = token.cancelled() => break,
                    next = stream.next() => next,
                }
            }
            None => stream.next().await,
        };
        let Some(event_result) = event_result else {
            break;
        };
        match event_result {
            Ok(agent_event) => {
                let provider_error_for_event = match &agent_event {
                    AsterAgentEvent::Message(message) => {
                        extract_inline_agent_provider_error(message)
                    }
                    _ => None,
                };
                if let Some(provider_error) = provider_error_for_event {
                    if inline_provider_error.is_none() {
                        inline_provider_error = Some(provider_error);
                    }
                    tracing::warn!(
                        "[AsterAgent][ReplyPolicy] suppressed inline provider error text from runtime stream: session_id={}",
                        session_id
                    );
                    continue;
                }

                let runtime_events = auto_compaction_projection
                    .project_event(&agent_event)
                    .unwrap_or_else(|| project_runtime_event(agent_event));
                for mut runtime_event in runtime_events {
                    let extra_events = write_artifact_emitter.process_event(&mut runtime_event);
                    for extra_event in &extra_events {
                        emit_text_delta_batch(
                            &mut text_delta_batcher,
                            TextDeltaBatchBoundary::Provider,
                            emitted_any,
                            on_event,
                        );
                        update_stream_event_diagnostics(diagnostics, extra_event);
                        *emitted_any = true;
                        on_event(extra_event);
                    }

                    match &runtime_event {
                        RuntimeAgentEvent::TextDelta { text } => {
                            if !text.is_empty() {
                                if diagnostics.text_delta_count == 0 {
                                    tracing::info!(
                                        "[AsterAgent][TTFT] first runtime text delta observed in policy stream: elapsed_ms={}, chars={}",
                                        started_at.elapsed().as_millis(),
                                        text.chars().count()
                                    );
                                }
                                text_chunks.push(text.clone());
                            }
                        }
                        RuntimeAgentEvent::Error { message } => {
                            if !message.trim().is_empty() {
                                event_errors.push(message.clone());
                            }
                        }
                        RuntimeAgentEvent::ToolStart {
                            tool_name, tool_id, ..
                        } => web_search_tracker.record_tool_start(
                            request_tool_policy,
                            tool_id,
                            tool_name,
                        ),
                        RuntimeAgentEvent::ToolEnd { tool_id, result } => {
                            web_search_tracker.record_tool_end(
                                request_tool_policy,
                                tool_id,
                                result.success,
                                result.error.as_deref(),
                            );
                        }
                        _ => {}
                    }
                    update_stream_event_diagnostics(diagnostics, &runtime_event);
                    match runtime_event {
                        RuntimeAgentEvent::TextDelta { text } => {
                            if let Some(batch_event) = text_delta_batcher.push(text) {
                                *emitted_any = true;
                                on_event(&batch_event);
                            }
                        }
                        other_event => {
                            emit_text_delta_batch(
                                &mut text_delta_batcher,
                                TextDeltaBatchBoundary::Provider,
                                emitted_any,
                                on_event,
                            );
                            *emitted_any = true;
                            on_event(&other_event);
                        }
                    }
                }
            }
            Err(e) => {
                emit_text_delta_batch(
                    &mut text_delta_batcher,
                    TextDeltaBatchBoundary::Provider,
                    emitted_any,
                    on_event,
                );
                return Err(ReplyAttemptError {
                    message: inline_provider_error.unwrap_or_else(|| format!("Stream error: {e}")),
                    emitted_any: *emitted_any,
                });
            }
        }
    }

    emit_text_delta_batch(
        &mut text_delta_batcher,
        TextDeltaBatchBoundary::Final,
        emitted_any,
        on_event,
    );

    if let Some(message) = inline_provider_error {
        return Err(ReplyAttemptError {
            message,
            emitted_any: *emitted_any,
        });
    }

    Ok(())
}

fn extract_inline_agent_provider_error(message: &Message) -> Option<String> {
    let text = message.as_concat_text();
    let text = text.trim();
    if text.is_empty() {
        return None;
    }
    if !text.contains("Ran into this error:") {
        return None;
    }
    if !text.contains("Please retry if you think this is a transient or recoverable error.") {
        return None;
    }

    let after_prefix = text.split_once("Ran into this error:")?.1.trim();
    let detail = after_prefix
        .split_once("\n\nPlease retry if you think this is a transient or recoverable error.")
        .map(|(left, _)| left.trim())
        .unwrap_or(after_prefix)
        .trim_end_matches('.');

    if detail.is_empty() {
        return Some("Agent provider execution failed".to_string());
    }

    Some(format!("Agent provider execution failed: {detail}"))
}

/// 当开启联网搜索时，在正式回复前执行 WebSearch 预检索。
///
/// 目标：
/// - 仅在显式 `required` 搜索模式下先完成一次必需 WebSearch。
/// - 统一生成 tool_start/tool_end 事件，供前端 harness 展示。
/// - 将预检索结果压缩注入 system prompt，帮助模型做更深的事实整合。
/// - 若本回合被明确要求必须先搜索，且预检索全部失败，则由上层中断本次回答。
pub async fn execute_web_search_preflight_if_needed(
    request: WebSearchPreflightRequest<'_>,
    tracker: &mut WebSearchExecutionTracker,
) -> Result<PreflightToolExecution, String> {
    let WebSearchPreflightRequest {
        agent,
        session_id,
        message_text,
        working_directory,
        cancel_token,
        turn_context,
        policy,
    } = request;

    if !should_run_web_search_preflight(policy, message_text) {
        return Ok(PreflightToolExecution::none());
    }

    let registry_arc = agent.tool_registry().clone();
    let registry = registry_arc.read().await;
    let available_tools = registry.get_definitions();
    let preflight_tool = available_tools
        .iter()
        .find(|definition| {
            policy.matches_any_required_tool(&definition.name)
                && normalize_tool_name(&definition.name).contains("websearch")
        })
        .ok_or_else(|| {
            format!(
                "联网搜索已开启，但未找到可执行的必需工具定义。required_tools={}, available_tools={}",
                policy.required_tools.join(", "),
                available_tools
                    .iter()
                    .map(|definition| definition.name.clone())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })?;
    let preflight_tool_name = preflight_tool.name.clone();
    drop(registry);

    let planned_queries = build_preflight_queries(message_text, policy)
        .into_iter()
        .enumerate()
        .map(|(index, query)| {
            let params = serde_json::json!({ "query": query });
            PlannedWebSearchQuery {
                index,
                query,
                tool_id: format!("preflight-websearch-{}-{}", index + 1, Uuid::new_v4()),
                arguments: serde_json::to_string(&params).ok(),
            }
        })
        .collect::<Vec<_>>();
    let working_directory = working_directory
        .map(Path::to_path_buf)
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_default();
    let mut events = Vec::new();
    for planned in &planned_queries {
        tracker.record_tool_start(policy, &planned.tool_id, &preflight_tool_name);
        events.push(RuntimeAgentEvent::ToolStart {
            tool_name: preflight_tool_name.clone(),
            tool_id: planned.tool_id.clone(),
            arguments: planned.arguments.clone(),
        });
    }

    #[allow(clippy::redundant_iter_cloned)]
    let mut outcomes = stream::iter(planned_queries.iter().cloned().map(|planned| {
        let registry_arc = registry_arc.clone();
        let preflight_tool_name = preflight_tool_name.clone();
        let session_id = session_id.to_string();
        let working_directory = working_directory.clone();
        let cancel_token = cancel_token.clone();
        let turn_context = turn_context.clone();
        async move {
            let query = planned.query.clone();
            let params = serde_json::json!({ "query": query });
            let mut context = ToolContext::new(working_directory).with_session_id(session_id);
            if let Some(token) = cancel_token {
                context = context.with_cancellation_token(token);
            }
            let result = aster::session_context::with_turn_context(turn_context, async {
                let registry = registry_arc.read().await;
                registry
                    .execute(&preflight_tool_name, params, &context, None)
                    .await
            })
            .await;
            match result {
                Ok(tool_result) => PreflightSearchOutcome {
                    index: planned.index,
                    query: planned.query,
                    tool_id: planned.tool_id,
                    success: tool_result.success,
                    output: tool_result.output.unwrap_or_default(),
                    error: tool_result.error,
                },
                Err(error) => PreflightSearchOutcome {
                    index: planned.index,
                    query: planned.query,
                    tool_id: planned.tool_id,
                    success: false,
                    output: String::new(),
                    error: Some(format!("执行 WebSearch 预调用失败: {}", error)),
                },
            }
        }
    }))
    .buffer_unordered(NEWS_PREFLIGHT_QUERY_PARALLELISM)
    .collect::<Vec<_>>()
    .await;
    outcomes.sort_by_key(|item| item.index);

    for outcome in &outcomes {
        tracker.record_tool_end(
            policy,
            &outcome.tool_id,
            outcome.success,
            outcome.error.as_deref(),
        );
        events.push(RuntimeAgentEvent::ToolEnd {
            tool_id: outcome.tool_id.clone(),
            result: AgentToolResult {
                success: outcome.success,
                output: outcome.output.clone(),
                error: outcome.error.clone(),
                images: None,
                metadata: None,
            },
        });
    }

    let planned_query_texts = planned_queries
        .iter()
        .map(|item| item.query.clone())
        .collect::<Vec<_>>();
    let successful_required = outcomes.iter().any(|item| item.success);
    let coverage_summary = build_coverage_summary(&planned_query_texts, &outcomes);
    let system_prompt_appendix = build_preflight_prompt_appendix(&planned_query_texts, &outcomes);

    if policy.requires_web_search() && !successful_required {
        let failure_details = outcomes
            .iter()
            .map(|item| {
                format!(
                    "{} => {}",
                    item.query,
                    item.error.clone().unwrap_or_else(|| "unknown".to_string())
                )
            })
            .collect::<Vec<_>>()
            .join(" | ");
        Err(format!("联网搜索预调用失败: {failure_details}"))
    } else {
        Ok(PreflightToolExecution {
            events,
            planned_queries: planned_query_texts,
            system_prompt_appendix,
            coverage_summary,
        })
    }
}

/// 统一流式执行器：执行 preflight + reply 流，并复用统一的策略校验。
pub async fn stream_reply_with_policy<F>(
    agent: &Agent,
    message_text: &str,
    working_directory: Option<&Path>,
    session_config: aster::agents::SessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent),
{
    stream_message_reply_with_policy(
        agent,
        Message::user().with_text(message_text),
        working_directory,
        session_config,
        cancel_token,
        request_tool_policy,
        on_event,
    )
    .await
}

pub async fn stream_message_reply_with_policy<F>(
    agent: &Agent,
    user_message: Message,
    working_directory: Option<&Path>,
    mut session_config: aster::agents::SessionConfig,
    cancel_token: Option<CancellationToken>,
    request_tool_policy: &RequestToolPolicy,
    mut on_event: F,
) -> Result<StreamReplyExecution, ReplyAttemptError>
where
    F: FnMut(&RuntimeAgentEvent),
{
    let started_at = Instant::now();
    let message_text = user_message.as_concat_text();
    let cancel_probe = cancel_token.clone();
    let mut web_search_tracker = WebSearchExecutionTracker::default();
    tracing::info!(
        "[AsterAgent][TTFT] stream policy start: session_id={}, message_chars={}, search_mode={}",
        session_config.id,
        message_text.chars().count(),
        request_tool_policy.search_mode.as_str()
    );

    // 只在显式 Required 模式做预检索；Allowed 只是暴露工具候选能力，由模型按需决定。
    let preflight = if request_tool_policy.requires_web_search() {
        execute_web_search_preflight_if_needed(
            WebSearchPreflightRequest {
                agent,
                session_id: &session_config.id,
                message_text: &message_text,
                working_directory,
                cancel_token: cancel_token.clone(),
                turn_context: session_config.turn_context.clone(),
                policy: request_tool_policy,
            },
            &mut web_search_tracker,
        )
        .await
    } else {
        Ok(PreflightToolExecution::none())
    };
    let preflight_execution = match preflight {
        Ok(preflight_execution) => {
            session_config.system_prompt = merge_system_prompt_with_web_search_preflight_context(
                session_config.system_prompt.take(),
                preflight_execution.system_prompt_appendix.clone(),
            );
            for event in &preflight_execution.events {
                on_event(event);
            }
            tracing::info!(
                "[AsterAgent][TTFT] stream policy preflight complete: session_id={}, events={}, elapsed_ms={}",
                session_config.id,
                preflight_execution.events.len(),
                started_at.elapsed().as_millis()
            );
            preflight_execution
        }
        Err(error) => {
            return Err(ReplyAttemptError {
                message: format!(
                    "{error}\n尝试记录: {}",
                    web_search_tracker.format_attempts()
                ),
                emitted_any: false,
            });
        }
    };

    let mut write_artifact_emitter = WriteArtifactEventEmitter::new(session_config.id.clone());
    let mut emitted_any = false;
    let mut text_chunks: Vec<String> = Vec::new();
    let mut event_errors: Vec<String> = Vec::new();
    let mut diagnostics = StreamEventDiagnostics::default();
    let first_attempt = stream_agent_reply_once(
        agent,
        user_message,
        duplicate_session_config(&session_config),
        cancel_token.clone(),
        request_tool_policy,
        &mut web_search_tracker,
        &mut write_artifact_emitter,
        &mut emitted_any,
        &mut text_chunks,
        &mut event_errors,
        &mut diagnostics,
        &mut on_event,
    )
    .await;
    tracing::info!(
        "[AsterAgent][TTFT] stream policy first attempt complete: session_id={}, elapsed_ms={}, emitted_any={}, text_deltas={}",
        session_config.id,
        started_at.elapsed().as_millis(),
        emitted_any,
        diagnostics.text_delta_count
    );
    if let Err(error) = first_attempt {
        if should_downgrade_provider_tail_failure(&error.message, &diagnostics, emitted_any) {
            tracing::warn!(
                "[AsterAgent][ReplyPolicy] provider tail failure downgraded after persisted output: tools={}, artifacts={}, saved_site={}",
                diagnostics.tool_end_count,
                diagnostics.persisted_artifact_count,
                diagnostics.saved_site_content_count
            );
            let fallback_text = text_chunks.join("").trim().to_string();
            return Ok(build_stream_reply_execution(
                if fallback_text.is_empty() {
                    match build_output_preserved_reply_fallback(&diagnostics) {
                        Some(output) => output,
                        None => return Err(error),
                    }
                } else {
                    fallback_text
                },
                event_errors,
                emitted_any,
                web_search_tracker.format_attempts(),
                is_reply_cancelled(&cancel_probe),
            ));
        }
        return Err(error);
    }

    if is_reply_cancelled(&cancel_probe) {
        persist_cancelled_turn_context_marker(agent, &session_config.id).await;
        return Ok(build_stream_reply_execution(
            text_chunks.join(""),
            event_errors,
            emitted_any,
            web_search_tracker.format_attempts(),
            true,
        ));
    }

    let current_text_output = text_chunks.join("");
    match resolve_reply_retry_mode(
        &preflight_execution,
        &current_text_output,
        &web_search_tracker,
        &diagnostics,
        &event_errors,
    ) {
        ReplyRetryMode::WebSearchSynthesis => {
            tracing::warn!(
                "[AsterAgent][WebSearchPrefetch] empty final text after preflight, retrying synthesis: session={}, attempts={}",
                session_config.id,
                web_search_tracker.format_attempts()
            );
            emit_runtime_status_with_projection(
                agent,
                &session_config,
                build_web_search_synthesis_runtime_status(
                    preflight_execution.coverage_summary.as_deref(),
                ),
                &mut on_event,
            )
            .await;
            session_config.system_prompt =
                merge_system_prompt_with_web_search_synthesis_instruction(
                    session_config.system_prompt.take(),
                );
            let retry_attempt = stream_agent_reply_once(
                agent,
                Message::user()
                    .with_text(WEB_SEARCH_EMPTY_REPLY_RETRY_PROMPT)
                    .agent_only(),
                duplicate_session_config(&session_config),
                cancel_token,
                request_tool_policy,
                &mut web_search_tracker,
                &mut write_artifact_emitter,
                &mut emitted_any,
                &mut text_chunks,
                &mut event_errors,
                &mut diagnostics,
                &mut on_event,
            )
            .await;
            if let Err(error) = retry_attempt {
                if should_downgrade_provider_tail_failure(&error.message, &diagnostics, emitted_any)
                {
                    tracing::warn!(
                        "[AsterAgent][ReplyPolicy] provider tail failure downgraded after retry with persisted output: tools={}, artifacts={}, saved_site={}",
                        diagnostics.tool_end_count,
                        diagnostics.persisted_artifact_count,
                        diagnostics.saved_site_content_count
                    );
                    let Some(fallback_text) = build_output_preserved_reply_fallback(&diagnostics)
                    else {
                        return Err(error);
                    };
                    return Ok(build_stream_reply_execution(
                        fallback_text,
                        event_errors,
                        emitted_any,
                        web_search_tracker.format_attempts(),
                        is_reply_cancelled(&cancel_probe),
                    ));
                }
                return Err(error);
            }
        }
        ReplyRetryMode::DirectAnswer => {
            tracing::warn!(
                "[AsterAgent][ReplyPolicy] empty final text without tool activity, retrying direct answer: session={}",
                session_config.id
            );
            emit_runtime_status_with_projection(
                agent,
                &session_config,
                build_empty_reply_retry_runtime_status(),
                &mut on_event,
            )
            .await;
            let retry_attempt = stream_agent_reply_once(
                agent,
                Message::user()
                    .with_text(EMPTY_REPLY_DIRECT_ANSWER_RETRY_PROMPT)
                    .agent_only(),
                duplicate_session_config(&session_config),
                cancel_token,
                request_tool_policy,
                &mut web_search_tracker,
                &mut write_artifact_emitter,
                &mut emitted_any,
                &mut text_chunks,
                &mut event_errors,
                &mut diagnostics,
                &mut on_event,
            )
            .await;
            if let Err(error) = retry_attempt {
                if should_downgrade_provider_tail_failure(&error.message, &diagnostics, emitted_any)
                {
                    tracing::warn!(
                        "[AsterAgent][ReplyPolicy] provider tail failure downgraded after empty-reply retry with persisted output: tools={}, artifacts={}, saved_site={}",
                        diagnostics.tool_end_count,
                        diagnostics.persisted_artifact_count,
                        diagnostics.saved_site_content_count
                    );
                    let Some(fallback_text) = build_output_preserved_reply_fallback(&diagnostics)
                    else {
                        return Err(error);
                    };
                    return Ok(build_stream_reply_execution(
                        fallback_text,
                        event_errors,
                        emitted_any,
                        web_search_tracker.format_attempts(),
                        is_reply_cancelled(&cancel_probe),
                    ));
                }
                return Err(error);
            }
        }
        ReplyRetryMode::IntermediateConclusion => {
            tracing::warn!(
                "[AsterAgent][ReplyPolicy] tool batch ended with intermediate conclusion, retrying continuation: session={}, tools={}",
                session_config.id,
                diagnostics.tool_end_count
            );
            emit_runtime_status_with_projection(
                agent,
                &session_config,
                build_incomplete_tool_batch_continue_runtime_status(),
                &mut on_event,
            )
            .await;
            let retry_attempt = stream_agent_reply_once(
                agent,
                Message::user()
                    .with_text(INCOMPLETE_TOOL_BATCH_CONTINUE_PROMPT)
                    .agent_only(),
                duplicate_session_config(&session_config),
                cancel_token,
                request_tool_policy,
                &mut web_search_tracker,
                &mut write_artifact_emitter,
                &mut emitted_any,
                &mut text_chunks,
                &mut event_errors,
                &mut diagnostics,
                &mut on_event,
            )
            .await;
            if let Err(error) = retry_attempt {
                if should_downgrade_provider_tail_failure(&error.message, &diagnostics, emitted_any)
                {
                    tracing::warn!(
                        "[AsterAgent][ReplyPolicy] provider tail failure downgraded after intermediate-conclusion retry with persisted output: tools={}, artifacts={}, saved_site={}",
                        diagnostics.tool_end_count,
                        diagnostics.persisted_artifact_count,
                        diagnostics.saved_site_content_count
                    );
                    let Some(fallback_text) = build_output_preserved_reply_fallback(&diagnostics)
                    else {
                        return Err(error);
                    };
                    return Ok(build_stream_reply_execution(
                        fallback_text,
                        event_errors,
                        emitted_any,
                        web_search_tracker.format_attempts(),
                        is_reply_cancelled(&cancel_probe),
                    ));
                }
                return Err(error);
            }
        }
        ReplyRetryMode::None => {}
    }

    if is_reply_cancelled(&cancel_probe) {
        persist_cancelled_turn_context_marker(agent, &session_config.id).await;
        return Ok(build_stream_reply_execution(
            text_chunks.join(""),
            event_errors,
            emitted_any,
            web_search_tracker.format_attempts(),
            true,
        ));
    }

    if let Err(validation_error) =
        web_search_tracker.validate_web_search_requirement(request_tool_policy)
    {
        return Err(ReplyAttemptError {
            message: validation_error,
            emitted_any,
        });
    }

    tracing::info!(
        "[AsterAgent][Diag] stream summary: elapsed_ms={}, text_deltas={}, tool_starts={}, tool_ends={}, context_traces={}, errors={}, max_text_delta_chars={}, max_tool_output_chars={}, max_context_trace_steps={}",
        started_at.elapsed().as_millis(),
        diagnostics.text_delta_count,
        diagnostics.tool_start_count,
        diagnostics.tool_end_count,
        diagnostics.context_trace_events,
        diagnostics.error_count,
        diagnostics.max_text_delta_chars,
        diagnostics.max_tool_output_chars,
        diagnostics.max_context_trace_steps
    );

    let final_text_output = text_chunks.join("");
    if final_text_output.trim().is_empty() {
        if let Some(last_error) = event_errors.last() {
            return Err(ReplyAttemptError {
                message: last_error.clone(),
                emitted_any,
            });
        }
        if let Some(fallback_text) = build_empty_final_reply_fallback(&diagnostics, emitted_any) {
            tracing::warn!(
                "[AsterAgent][ReplyPolicy] empty final text downgraded to synthesized fallback: emitted_any={}, tool_starts={}, tool_ends={}, attempts={}",
                emitted_any,
                diagnostics.tool_start_count,
                diagnostics.tool_end_count,
                web_search_tracker.format_attempts()
            );
            return Ok(build_stream_reply_execution(
                fallback_text,
                event_errors,
                emitted_any,
                web_search_tracker.format_attempts(),
                is_reply_cancelled(&cancel_probe),
            ));
        }
        return Err(ReplyAttemptError {
            message: build_empty_final_reply_error_message(&diagnostics, &web_search_tracker),
            emitted_any,
        });
    }

    Ok(build_stream_reply_execution(
        final_text_output,
        event_errors,
        emitted_any,
        web_search_tracker.format_attempts(),
        false,
    ))
}

fn is_web_search_preflight_enabled() -> bool {
    match env_compat::var(WEB_SEARCH_PREFLIGHT_ENABLED_ENV_KEYS) {
        Some(raw) => match raw.trim().to_ascii_lowercase().as_str() {
            "0" | "false" | "no" | "off" => false,
            _ => true,
        },
        None => true,
    }
}

fn derive_preflight_query(message_text: &str) -> String {
    let trimmed = message_text.trim();
    if trimmed.chars().count() >= 2 {
        return trimmed.to_string();
    }
    if trimmed.is_empty() {
        return "最新信息".to_string();
    }

    // 兜底补齐最短长度，避免触发 WebSearch.query minLength 校验失败
    let mut fallback = trimmed.to_string();
    while fallback.chars().count() < 2 {
        fallback.push_str(" 信息");
    }
    fallback
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::conversation::Conversation;
    use aster::providers::base::{Provider, ProviderMetadata, ProviderUsage, Usage};
    use aster::providers::errors::ProviderError;
    use aster::session::{
        ChatHistoryMatch, CommitOptions, CommitReport, MemoryCategory, MemoryHealth, MemoryRecord,
        MemorySearchResult, Session, SessionInsights, SessionStore, SessionType, TokenStatsUpdate,
        TurnContextOverride, TurnStatus,
    };
    use aster::tools::{PermissionCheckResult, Tool, ToolError, ToolResult};
    use async_trait::async_trait;
    use std::collections::HashMap;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    struct TestSessionStore {
        session: Mutex<Session>,
    }

    impl TestSessionStore {
        fn new(session: Session) -> Self {
            Self {
                session: Mutex::new(session),
            }
        }

        fn current_session(&self, include_messages: bool) -> Session {
            let mut session = self.session.lock().expect("锁测试 session").clone();
            if !include_messages {
                session.conversation = None;
            }
            session
        }
    }

    fn create_test_session_store(name: &str) -> (Arc<TestSessionStore>, Session) {
        let now = chrono::Utc::now();
        let session = Session {
            id: format!("test-{}-{}", name, Uuid::new_v4()),
            working_dir: PathBuf::default(),
            name: name.to_string(),
            user_set_name: false,
            session_type: SessionType::Hidden,
            created_at: now,
            updated_at: now,
            extension_data: Default::default(),
            total_tokens: None,
            input_tokens: None,
            output_tokens: None,
            cached_input_tokens: None,
            cache_creation_input_tokens: None,
            accumulated_total_tokens: None,
            accumulated_input_tokens: None,
            accumulated_output_tokens: None,
            schedule_id: None,
            recipe: None,
            user_recipe_values: None,
            conversation: Some(Conversation::default()),
            message_count: 0,
            provider_name: None,
            model_config: None,
        };
        (Arc::new(TestSessionStore::new(session.clone())), session)
    }

    #[async_trait]
    impl SessionStore for TestSessionStore {
        async fn create_session(
            &self,
            _working_dir: PathBuf,
            _name: String,
            _session_type: SessionType,
        ) -> anyhow::Result<Session> {
            Ok(self.current_session(true))
        }

        async fn get_session(&self, _id: &str, include_messages: bool) -> anyhow::Result<Session> {
            Ok(self.current_session(include_messages))
        }

        async fn add_message(&self, _session_id: &str, message: &Message) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            let conversation = session
                .conversation
                .get_or_insert_with(Conversation::default);
            conversation.push(message.clone());
            session.message_count = conversation.len();
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn replace_conversation(
            &self,
            _session_id: &str,
            conversation: &Conversation,
        ) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            session.conversation = Some(conversation.clone());
            session.message_count = conversation.len();
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn list_sessions(&self) -> anyhow::Result<Vec<Session>> {
            Ok(vec![self.current_session(false)])
        }

        async fn list_sessions_by_types(
            &self,
            _types: &[SessionType],
        ) -> anyhow::Result<Vec<Session>> {
            Ok(vec![self.current_session(false)])
        }

        async fn delete_session(&self, _id: &str) -> anyhow::Result<()> {
            Ok(())
        }

        async fn get_insights(&self) -> anyhow::Result<SessionInsights> {
            Ok(SessionInsights {
                total_sessions: 1,
                total_tokens: 0,
            })
        }

        async fn export_session(&self, _id: &str) -> anyhow::Result<String> {
            Ok("{}".to_string())
        }

        async fn import_session(&self, _json: &str) -> anyhow::Result<Session> {
            Ok(self.current_session(true))
        }

        async fn copy_session(
            &self,
            _session_id: &str,
            _new_name: String,
        ) -> anyhow::Result<Session> {
            Ok(self.current_session(true))
        }

        async fn truncate_conversation(
            &self,
            _session_id: &str,
            _timestamp: i64,
        ) -> anyhow::Result<()> {
            Ok(())
        }

        async fn update_session_name(
            &self,
            _session_id: &str,
            name: String,
            user_set: bool,
        ) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            session.name = name;
            session.user_set_name = user_set;
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn update_working_dir(
            &self,
            _session_id: &str,
            working_dir: PathBuf,
        ) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            session.working_dir = working_dir;
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn update_session_type(
            &self,
            _session_id: &str,
            session_type: SessionType,
        ) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            session.session_type = session_type;
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn update_extension_data(
            &self,
            _session_id: &str,
            extension_data: aster::session::extension_data::ExtensionData,
        ) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            session.extension_data = extension_data;
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn update_token_stats(
            &self,
            _session_id: &str,
            _stats: TokenStatsUpdate,
        ) -> anyhow::Result<()> {
            Ok(())
        }

        async fn update_provider_config(
            &self,
            _session_id: &str,
            provider_name: Option<String>,
            model_config: Option<aster::model::ModelConfig>,
        ) -> anyhow::Result<()> {
            let mut session = self.session.lock().expect("锁测试 session");
            if let Some(provider_name) = provider_name {
                session.provider_name = Some(provider_name);
            }
            if let Some(model_config) = model_config {
                session.model_config = Some(model_config);
            }
            session.updated_at = chrono::Utc::now();
            Ok(())
        }

        async fn update_recipe(
            &self,
            _session_id: &str,
            _recipe: Option<aster::recipe::Recipe>,
            _user_recipe_values: Option<HashMap<String, String>>,
        ) -> anyhow::Result<()> {
            Ok(())
        }

        async fn search_chat_history(
            &self,
            _query: &str,
            _limit: Option<usize>,
            _after_date: Option<chrono::DateTime<chrono::Utc>>,
            _before_date: Option<chrono::DateTime<chrono::Utc>>,
            _exclude_session_id: Option<String>,
        ) -> anyhow::Result<Vec<ChatHistoryMatch>> {
            Ok(Vec::new())
        }

        async fn commit_session(
            &self,
            _id: &str,
            _options: CommitOptions,
        ) -> anyhow::Result<CommitReport> {
            Ok(CommitReport {
                session_id: "test-session-store".to_string(),
                messages_scanned: 0,
                memories_created: 0,
                memories_merged: 0,
                source_start_ts: None,
                source_end_ts: None,
                warnings: Vec::new(),
            })
        }

        async fn search_memories(
            &self,
            _query: &str,
            _limit: Option<usize>,
            _session_scope: Option<&str>,
            _categories: Option<Vec<MemoryCategory>>,
        ) -> anyhow::Result<Vec<MemorySearchResult>> {
            Ok(Vec::new())
        }

        async fn retrieve_context_memories(
            &self,
            _session_id: &str,
            _query: &str,
            _limit: usize,
        ) -> anyhow::Result<Vec<MemoryRecord>> {
            Ok(Vec::new())
        }

        async fn memory_stats(&self) -> anyhow::Result<aster::session::MemoryStats> {
            Ok(aster::session::MemoryStats::default())
        }

        async fn memory_health(&self) -> anyhow::Result<MemoryHealth> {
            Ok(MemoryHealth {
                healthy: true,
                message: "test session store".to_string(),
            })
        }
    }

    struct TurnContextGatedWebSearchTool;

    #[async_trait]
    impl Tool for TurnContextGatedWebSearchTool {
        fn name(&self) -> &str {
            "WebSearch"
        }

        fn description(&self) -> &str {
            "测试用 WebSearch 工具"
        }

        fn input_schema(&self) -> serde_json::Value {
            serde_json::json!({
                "type": "object",
                "properties": {
                    "query": { "type": "string" }
                },
                "required": ["query"]
            })
        }

        async fn check_permissions(
            &self,
            _params: &serde_json::Value,
            _context: &ToolContext,
        ) -> PermissionCheckResult {
            let allowed = aster::session_context::current_turn_context()
                .as_ref()
                .is_some_and(|turn_context| {
                    ["web_search_enabled", "webSearchEnabled"]
                        .iter()
                        .any(|key| {
                            turn_context
                                .metadata
                                .get(*key)
                                .and_then(serde_json::Value::as_bool)
                                .unwrap_or(false)
                        })
                });

            if allowed {
                PermissionCheckResult::allow()
            } else {
                PermissionCheckResult::ask("WebSearch 需要联网确认。")
            }
        }

        async fn execute(
            &self,
            params: serde_json::Value,
            _context: &ToolContext,
        ) -> Result<ToolResult, ToolError> {
            let query = params
                .get("query")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default();
            Ok(ToolResult::success(format!(
                "预检索测试结果：https://example.com/search?q={query}"
            )))
        }
    }

    struct ContextLengthExceededProvider;

    #[async_trait]
    impl Provider for ContextLengthExceededProvider {
        fn metadata() -> ProviderMetadata
        where
            Self: Sized,
        {
            ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "context-length-exceeded-provider"
        }

        async fn complete_with_model(
            &self,
            _model_config: &aster::model::ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[rmcp::model::Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            Err(ProviderError::ContextLengthExceeded(
                "mock context overflow".to_string(),
            ))
        }

        fn get_model_config(&self) -> aster::model::ModelConfig {
            aster::model::ModelConfig::new("gpt-5.3-codex").expect("test model config")
        }
    }

    struct EmptyReplyThenTextProvider {
        attempts: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl Provider for EmptyReplyThenTextProvider {
        fn metadata() -> ProviderMetadata
        where
            Self: Sized,
        {
            ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "empty-reply-then-text-provider"
        }

        async fn complete_with_model(
            &self,
            _model_config: &aster::model::ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[rmcp::model::Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            let attempt = self.attempts.fetch_add(1, Ordering::SeqCst);
            let message = if attempt == 0 {
                Message::assistant()
            } else {
                Message::assistant().with_text("这是补发的最终答复。")
            };

            Ok((
                message,
                ProviderUsage::new("gpt-5.3-codex".to_string(), Usage::default()),
            ))
        }

        fn get_model_config(&self) -> aster::model::ModelConfig {
            aster::model::ModelConfig::new("gpt-5.3-codex").expect("test model config")
        }
    }

    struct SlowStreamingProvider;

    #[async_trait]
    impl Provider for SlowStreamingProvider {
        fn metadata() -> ProviderMetadata
        where
            Self: Sized,
        {
            ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "slow-streaming-provider"
        }

        async fn complete_with_model(
            &self,
            _model_config: &aster::model::ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[rmcp::model::Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            Ok((
                Message::assistant().with_text("非流式兜底不应被调用"),
                ProviderUsage::new("gpt-5.3-codex".to_string(), Usage::default()),
            ))
        }

        async fn stream(
            &self,
            _system: &str,
            _messages: &[Message],
            _tools: &[rmcp::model::Tool],
        ) -> Result<aster::providers::base::MessageStream, ProviderError> {
            Ok(Box::pin(async_stream::try_stream! {
                yield (
                    Some(Message::assistant().with_text("第一段")),
                    None,
                );
                tokio::time::sleep(Duration::from_secs(30)).await;
                yield (
                    Some(Message::assistant().with_text("第二段")),
                    Some(ProviderUsage::new("gpt-5.3-codex".to_string(), Usage::default())),
                );
            }))
        }

        fn supports_streaming(&self) -> bool {
            true
        }

        fn get_model_config(&self) -> aster::model::ModelConfig {
            aster::model::ModelConfig::new("gpt-5.3-codex").expect("test model config")
        }
    }

    struct AuthenticationErrorProvider;

    #[async_trait]
    impl Provider for AuthenticationErrorProvider {
        fn metadata() -> ProviderMetadata
        where
            Self: Sized,
        {
            ProviderMetadata::empty()
        }

        fn get_name(&self) -> &str {
            "authentication-error-provider"
        }

        async fn complete_with_model(
            &self,
            _model_config: &aster::model::ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[rmcp::model::Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            Err(ProviderError::Authentication(
                "Authentication failed. Status: 403 Forbidden. Response: Illegal access"
                    .to_string(),
            ))
        }

        fn get_model_config(&self) -> aster::model::ModelConfig {
            aster::model::ModelConfig::new("mimo-v2.5-pro").expect("test model config")
        }
    }

    fn build_auto_compaction_disabled_turn_context() -> TurnContextOverride {
        let mut metadata = HashMap::new();
        metadata.insert(
            "lime_runtime".to_string(),
            serde_json::json!({
                "auto_compact": false,
            }),
        );
        TurnContextOverride {
            metadata,
            ..TurnContextOverride::default()
        }
    }

    #[test]
    fn resolves_effective_web_search_with_request_override() {
        let policy = resolve_request_tool_policy(Some(false), true);
        assert!(!policy.effective_web_search);
        assert_eq!(policy.search_mode, RequestToolPolicyMode::Disabled);
        assert!(policy.required_tools.is_empty());
        assert!(policy.allowed_tools.is_empty());

        let policy = resolve_request_tool_policy(Some(true), false);
        assert!(policy.effective_web_search);
        assert_eq!(policy.search_mode, RequestToolPolicyMode::Allowed);
    }

    #[test]
    fn detects_incomplete_tool_batch_summary_text() {
        assert!(looks_like_incomplete_tool_batch_summary(
            "已确认 claudecode/src/tasks 下有 7 种 Task 类型。现在需要读取核心类型定义、调度框架和几个关键子 Task 的入口，才能和 Lime 的 task 系统做准确对比。"
        ));
        assert!(looks_like_incomplete_tool_batch_summary(
            "当前已经定位主入口，但还需要继续查看 task 调度和状态映射。"
        ));
        assert!(looks_like_incomplete_tool_batch_summary(
            "已确认主入口，但还需要继续查看 task 调度和状态映射。\n\n如果你希望我继续，我可以马上深入这两个模块。"
        ));
        assert!(!looks_like_incomplete_tool_batch_summary(
            "我已经完成对比。Claude Code 的任务面板更轻量，Lime 当前主要差异集中在任务展示位置、批次工具摘要和继续策略。"
        ));
        assert!(!looks_like_incomplete_tool_batch_summary(
            "已获得完整文件树，这是一个很大的 Claude Code CLI 项目。接下来需要看核心入口文件和关键模块来理解架构，才能对比 Lime 的优化点。\n\n## 一、Claude Code 项目概览\n这是 Claude Code CLI 的源码，主循环、工具注册、Task 系统与 compact 都已经识别清楚。\n\n## 二、Lime 当前还能继续对标优化的点\n优先补自动 compact、任务 runtime 和权限边界，然后再做长链路体验优化。"
        ));
    }

    #[test]
    fn resolves_retry_mode_for_incomplete_tool_batch_summary() {
        let diagnostics = StreamEventDiagnostics {
            tool_start_count: 2,
            tool_end_count: 2,
            ..StreamEventDiagnostics::default()
        };

        let mode = resolve_reply_retry_mode(
            &PreflightToolExecution::none(),
            "已确认 claudecode/src/tasks 下有 7 种 Task 类型。现在需要读取核心类型定义，才能和 Lime 的 task 系统做准确对比。",
            &WebSearchExecutionTracker::default(),
            &diagnostics,
            &[],
        );

        assert_eq!(mode, ReplyRetryMode::IntermediateConclusion);
    }

    #[test]
    fn does_not_retry_when_final_answer_follows_intermediate_process_summary() {
        let diagnostics = StreamEventDiagnostics {
            tool_start_count: 4,
            tool_end_count: 4,
            ..StreamEventDiagnostics::default()
        };

        let mode = resolve_reply_retry_mode(
            &PreflightToolExecution::none(),
            "已获得完整文件树，这是一个非常大的 Claude Code CLI 项目。接下来需要看核心入口文件和关键模块来理解架构，才能对比 Lime 的优化点。\n\n## 一、Claude Code 项目概览\n这是 Anthropic 官方的 Claude Code CLI 源码，主循环、工具体系、Task 系统和 compact 模块都已经识别清楚。\n\n## 二、Lime 当前还能继续对标优化的点\n优先补自动 compact、权限规则引擎和统一任务 runtime，再继续补子代理隔离与长链路体验。",
            &WebSearchExecutionTracker::default(),
            &diagnostics,
            &[],
        );

        assert_eq!(mode, ReplyRetryMode::None);
    }

    #[test]
    fn resolves_effective_web_search_with_mode_default() {
        let policy = resolve_request_tool_policy(None, true);
        assert!(policy.effective_web_search);
        assert_eq!(policy.search_mode, RequestToolPolicyMode::Allowed);

        let policy = resolve_request_tool_policy(None, false);
        assert!(!policy.effective_web_search);
        assert_eq!(policy.search_mode, RequestToolPolicyMode::Disabled);
    }

    #[test]
    fn resolves_required_mode_when_explicitly_requested() {
        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Required),
            false,
        );
        assert!(policy.effective_web_search);
        assert!(policy.requires_web_search());
        assert!(policy.matches_any_required_tool("WebSearch"));
        assert!(policy.matches_any_allowed_tool("WebFetch"));
    }

    #[test]
    fn disabled_mode_should_not_expose_web_search_tool_surface() {
        let policy = resolve_request_tool_policy_with_mode(
            None,
            Some(RequestToolPolicyMode::Disabled),
            true,
        );

        assert_eq!(policy.search_mode, RequestToolPolicyMode::Disabled);
        assert!(!policy.effective_web_search);
        assert!(policy.required_tools.is_empty());
        assert!(policy.allowed_tools.is_empty());
        assert!(!policy.matches_any_required_tool("WebSearch"));
        assert!(!policy.matches_any_allowed_tool("WebFetch"));
    }

    #[test]
    fn keeps_original_prompt_when_disabled() {
        let base = Some("base".to_string());
        let policy = resolve_request_tool_policy(Some(false), false);
        assert_eq!(
            merge_system_prompt_with_request_tool_policy(base.clone(), &policy),
            base
        );
    }

    #[test]
    fn appends_policy_prompt_when_enabled() {
        let policy = resolve_request_tool_policy(Some(true), false);
        let merged =
            merge_system_prompt_with_request_tool_policy(Some("base".to_string()), &policy)
                .expect("merged prompt should exist");
        assert!(merged.contains(REQUEST_TOOL_POLICY_MARKER));
        assert!(merged.contains("不代表本回合必须联网"));
        assert!(merged.contains("先理解用户意图"));
        assert!(merged.contains("WebSearch"));
    }

    #[test]
    fn appends_required_policy_prompt_when_required() {
        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Required),
            false,
        );
        let merged =
            merge_system_prompt_with_request_tool_policy(Some("base".to_string()), &policy)
                .expect("merged prompt should exist");
        assert!(merged.contains("必须先调用"));
    }

    #[test]
    fn no_duplicate_when_marker_exists() {
        let base = Some(format!("{REQUEST_TOOL_POLICY_MARKER}\nexists"));
        let policy = resolve_request_tool_policy(Some(true), false);
        assert_eq!(
            merge_system_prompt_with_request_tool_policy(base.clone(), &policy),
            base
        );
    }

    #[test]
    fn tracker_does_not_require_websearch_when_only_allowed() {
        let policy = resolve_request_tool_policy(Some(true), false);
        let mut tracker = WebSearchExecutionTracker::default();
        tracker.record_tool_start(&policy, "tool-1", "WebFetch");
        tracker.record_tool_end(&policy, "tool-1", true, None);
        assert!(tracker.validate_web_search_requirement(&policy).is_ok());
    }

    #[test]
    fn tracker_accepts_successful_required_websearch() {
        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Required),
            false,
        );
        let mut tracker = WebSearchExecutionTracker::default();
        tracker.record_tool_start(&policy, "tool-1", "WebSearch");
        tracker.record_tool_end(&policy, "tool-1", true, None);
        assert!(tracker.validate_web_search_requirement(&policy).is_ok());
    }

    #[test]
    fn tracker_reports_failure_record() {
        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Required),
            false,
        );
        let mut tracker = WebSearchExecutionTracker::default();
        tracker.record_tool_start(&policy, "tool-1", "WebSearch");
        tracker.record_tool_end(&policy, "tool-1", false, Some("network timeout"));
        let err = tracker
            .validate_web_search_requirement(&policy)
            .expect_err("failed required tool should fail");
        assert!(err.contains("network timeout"));
        assert!(err.contains("尝试记录"));
    }

    #[test]
    fn allowed_web_search_should_not_run_preflight_from_message_keywords() {
        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Allowed),
            false,
        );

        assert!(!should_run_web_search_preflight(
            &policy,
            "请搜索今天最新 AI 新闻"
        ));
        assert_eq!(
            build_preflight_queries("请搜索今天最新 AI 新闻", &policy),
            vec!["请搜索今天最新 AI 新闻".to_string()]
        );
    }

    #[test]
    fn required_web_search_should_run_preflight_without_keyword_detection() {
        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Required),
            false,
        );

        assert!(should_run_web_search_preflight(&policy, "继续"));
        assert_eq!(
            build_preflight_queries("继续", &policy),
            vec!["继续".to_string()]
        );
    }

    #[tokio::test]
    async fn web_search_preflight_uses_turn_context_for_permission_check() {
        let agent = Agent::new();
        {
            let registry_arc = agent.tool_registry().clone();
            let mut registry = registry_arc.write().await;
            registry.register(Box::new(TurnContextGatedWebSearchTool));
        }

        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Required),
            false,
        );
        let mut metadata = HashMap::new();
        metadata.insert("webSearchEnabled".to_string(), serde_json::json!(true));
        let turn_context = TurnContextOverride {
            metadata,
            ..TurnContextOverride::default()
        };
        let mut tracker = WebSearchExecutionTracker::default();

        let execution = execute_web_search_preflight_if_needed(
            WebSearchPreflightRequest {
                agent: &agent,
                session_id: "session-web-preflight-permission",
                message_text: "继续",
                working_directory: None,
                cancel_token: None,
                turn_context: Some(turn_context),
                policy: &policy,
            },
            &mut tracker,
        )
        .await
        .expect("预调用应继承 turn context 并免确认执行");

        assert!(execution
            .system_prompt_appendix
            .as_deref()
            .unwrap_or_default()
            .contains("预检索测试结果"));
        assert!(execution.events.iter().any(|event| matches!(
            event,
            RuntimeAgentEvent::ToolEnd { result, .. } if result.success
        )));
        assert!(tracker.validate_web_search_requirement(&policy).is_ok());
    }

    #[test]
    fn discarded_optional_preflight_attempt_should_not_force_synthesis_retry() {
        let diagnostics = StreamEventDiagnostics::default();

        let mode = resolve_reply_retry_mode(
            &PreflightToolExecution::none(),
            "",
            &WebSearchExecutionTracker::default(),
            &diagnostics,
            &[],
        );

        assert_eq!(mode, ReplyRetryMode::DirectAnswer);
    }

    #[test]
    fn empty_final_reply_with_only_tool_events_should_not_fallback() {
        let diagnostics = StreamEventDiagnostics {
            tool_start_count: 1,
            tool_end_count: 1,
            ..Default::default()
        };

        assert_eq!(build_empty_final_reply_fallback(&diagnostics, true), None);
    }

    #[test]
    fn empty_final_reply_without_any_emission_should_still_error() {
        let diagnostics = StreamEventDiagnostics::default();

        assert_eq!(build_empty_final_reply_fallback(&diagnostics, false), None);
    }

    #[test]
    fn empty_final_reply_with_saved_site_output_should_use_preserved_output_fallback() {
        let diagnostics = StreamEventDiagnostics {
            saved_site_content_count: 1,
            last_saved_markdown_path: Some("exports/x-article-export/article/index.md".to_string()),
            ..Default::default()
        };

        assert_eq!(
            build_empty_final_reply_fallback(&diagnostics, true).as_deref(),
            Some(
                "本轮站点内容已成功保存到项目文件中（Markdown：exports/x-article-export/article/index.md）。由于模型通道暂时不可用，未能补充最终总结；详细过程与产物已保留在当前对话中。"
            )
        );
    }

    #[test]
    fn empty_final_reply_without_tool_activity_should_report_precise_error() {
        let diagnostics = StreamEventDiagnostics::default();
        let tracker = WebSearchExecutionTracker::default();

        assert_eq!(
            build_empty_final_reply_error_message(&diagnostics, &tracker),
            "模型未输出最终答复，且未执行任何工具。\n尝试记录: 无工具调用"
        );
    }

    #[test]
    fn empty_final_reply_with_non_web_tools_should_not_claim_no_tool_calls() {
        let diagnostics = StreamEventDiagnostics {
            tool_start_count: 1,
            tool_end_count: 1,
            ..Default::default()
        };
        let tracker = WebSearchExecutionTracker::default();

        assert_eq!(
            build_empty_final_reply_error_message(&diagnostics, &tracker),
            "已完成当前回合的工具执行，但模型未输出最终答复。\n尝试记录: 已执行非联网工具（tool_start=1, tool_end=1）"
        );
    }

    #[test]
    fn provider_tail_failure_with_saved_site_content_should_downgrade() {
        let diagnostics = StreamEventDiagnostics {
            saved_site_content_count: 1,
            last_saved_markdown_path: Some("exports/x-article-export/article/index.md".to_string()),
            ..Default::default()
        };

        assert!(should_downgrade_provider_tail_failure(
            "Agent provider execution failed: Request failed: network timeout",
            &diagnostics,
            true,
        ));
        assert_eq!(
            build_output_preserved_reply_fallback(&diagnostics).as_deref(),
            Some(
                "本轮站点内容已成功保存到项目文件中（Markdown：exports/x-article-export/article/index.md）。由于模型通道暂时不可用，未能补充最终总结；详细过程与产物已保留在当前对话中。"
            )
        );
    }

    #[test]
    fn provider_tail_failure_with_persisted_artifact_should_downgrade() {
        let diagnostics = StreamEventDiagnostics {
            persisted_artifact_count: 1,
            last_persisted_artifact_path: Some("outputs/report.md".to_string()),
            ..Default::default()
        };

        assert!(should_downgrade_provider_tail_failure(
            "Agent provider execution failed: Request failed: channel unavailable",
            &diagnostics,
            true,
        ));
        assert_eq!(
            build_output_preserved_reply_fallback(&diagnostics).as_deref(),
            Some(
                "本轮输出文件已成功生成（文件：outputs/report.md）。由于模型通道暂时不可用，未能补充最终总结；详细过程与产物已保留在当前对话中。"
            )
        );
    }

    #[test]
    fn provider_tail_failure_without_persisted_output_should_not_downgrade() {
        let diagnostics = StreamEventDiagnostics {
            tool_end_count: 2,
            ..Default::default()
        };

        assert!(!should_downgrade_provider_tail_failure(
            "Agent provider execution failed: Request failed: network timeout",
            &diagnostics,
            true,
        ));
        assert_eq!(build_output_preserved_reply_fallback(&diagnostics), None);
    }

    #[test]
    fn text_delta_batcher_should_flush_on_newline_backlog_and_final() {
        let mut newline_batcher = TextDeltaBatcher::default();
        assert!(newline_batcher.push("第一段".to_string()).is_none());
        let newline_event = newline_batcher
            .push("\n".to_string())
            .expect("newline should flush batch");
        assert!(matches!(
            newline_event,
            RuntimeAgentEvent::TextDeltaBatch {
                ref text,
                ref chunks,
                boundary: TextDeltaBatchBoundary::Newline,
            } if text == "第一段\n" && chunks.len() == 2
        ));

        let mut backlog_batcher = TextDeltaBatcher::default();
        let backlog_event = backlog_batcher
            .push("a".repeat(TEXT_DELTA_BATCH_BACKLOG_CHARS))
            .expect("backlog should flush batch");
        assert!(matches!(
            backlog_event,
            RuntimeAgentEvent::TextDeltaBatch {
                ref text,
                boundary: TextDeltaBatchBoundary::Backlog,
                ..
            } if text.chars().count() == TEXT_DELTA_BATCH_BACKLOG_CHARS
        ));

        let mut final_batcher = TextDeltaBatcher::default();
        assert!(final_batcher.push("尾巴".to_string()).is_none());
        let final_event = final_batcher
            .flush(TextDeltaBatchBoundary::Final)
            .expect("final should flush pending text");
        assert!(matches!(
            final_event,
            RuntimeAgentEvent::TextDeltaBatch {
                ref text,
                boundary: TextDeltaBatchBoundary::Final,
                ..
            } if text == "尾巴"
        ));
    }

    #[test]
    fn merges_web_search_preflight_context_without_duplication() {
        let merged = merge_system_prompt_with_web_search_preflight_context(
            Some("base".to_string()),
            Some(format!("{WEB_SEARCH_PREFETCH_CONTEXT_MARKER}\ncontext")),
        )
        .expect("merged prompt should exist");
        assert!(merged.contains(WEB_SEARCH_PREFETCH_CONTEXT_MARKER));

        let preserved = merge_system_prompt_with_web_search_preflight_context(
            Some(merged.clone()),
            Some(format!("{WEB_SEARCH_PREFETCH_CONTEXT_MARKER}\nother")),
        )
        .expect("prompt should be preserved");
        assert_eq!(preserved, merged);
    }

    #[test]
    fn appends_synthesis_instruction_without_duplication() {
        let merged =
            merge_system_prompt_with_web_search_synthesis_instruction(Some("base".to_string()))
                .expect("merged prompt should exist");
        assert!(merged.contains(WEB_SEARCH_SYNTHESIS_MARKER));
        assert!(merged.contains("不要再次调用 WebSearch"));

        let preserved =
            merge_system_prompt_with_web_search_synthesis_instruction(Some(merged.clone()))
                .expect("prompt should be preserved");
        assert_eq!(preserved, merged);
    }

    #[test]
    fn auto_compaction_projection_swallows_aster_compaction_system_notifications() {
        let mut state = AutoCompactionProjectionState::default();

        let start_events = state.project_event(&AsterAgentEvent::Message(
            Message::assistant().with_system_notification(
                SystemNotificationType::InlineMessage,
                "Exceeded auto-compact threshold of 80%. Performing auto-compaction...",
            ),
        ));
        assert!(matches!(start_events, Some(events) if events.is_empty()));

        let thinking_events = state
            .project_event(&AsterAgentEvent::Message(
                Message::assistant().with_system_notification(
                    SystemNotificationType::ThinkingMessage,
                    ASTER_AUTO_COMPACTION_THINKING_TEXT,
                ),
            ))
            .expect("应识别自动压缩 thinking 通知");
        assert!(thinking_events.is_empty());

        let complete_events = state
            .project_event(&AsterAgentEvent::Message(
                Message::assistant().with_system_notification(
                    SystemNotificationType::InlineMessage,
                    ASTER_AUTO_COMPACTION_COMPLETE_TEXT,
                ),
            ))
            .expect("应识别自动压缩完成通知");
        assert!(complete_events.is_empty());
    }

    #[test]
    fn auto_compaction_projection_surfaces_compaction_failure_as_error() {
        let mut state = AutoCompactionProjectionState::default();
        let _ = state.project_event(&AsterAgentEvent::Message(
            Message::assistant().with_system_notification(
                SystemNotificationType::InlineMessage,
                "Exceeded auto-compact threshold of 80%. Performing auto-compaction...",
            ),
        ));

        let failure_events = state
            .project_event(&AsterAgentEvent::Message(Message::assistant().with_text(
                "Ran into this error trying to compact: context window exceeded.\n\nPlease try again or create a new session",
            )))
            .expect("应识别自动压缩失败事件");

        assert_eq!(failure_events.len(), 1);
        match &failure_events[0] {
            RuntimeAgentEvent::Error { message } => {
                assert_eq!(
                    message,
                    "自动压缩上下文失败，请重试或新建会话：context window exceeded"
                );
            }
            other => panic!("Expected compaction error event, got {other:?}"),
        }
    }

    #[test]
    fn auto_compaction_projection_surfaces_disabled_auto_compaction_limit_as_error() {
        let mut state = AutoCompactionProjectionState::default();

        let events = state
            .project_event(&AsterAgentEvent::Message(
                Message::assistant().with_system_notification(
                    SystemNotificationType::InlineMessage,
                    ASTER_AUTO_COMPACTION_DISABLED_TEXT,
                ),
            ))
            .expect("应识别自动压缩禁用后的上下文上限提示");

        assert_eq!(events.len(), 1);
        match &events[0] {
            RuntimeAgentEvent::Error { message } => {
                assert_eq!(
                    message,
                    "当前会话已达到上下文上限，但当前工作区已关闭自动压缩。请先手动压缩上下文或新建会话后重试。"
                );
            }
            other => panic!("Expected compaction disabled error event, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn stream_message_reply_with_policy_should_surface_disabled_auto_compaction_limit_from_aster(
    ) {
        let (store, session) = create_test_session_store("lime-auto-compact-disabled");
        let agent = Agent::new().with_session_store(store.clone());
        agent
            .update_provider(Arc::new(ContextLengthExceededProvider), &session.id)
            .await
            .expect("应配置测试 provider");

        let session_config = aster::agents::SessionConfig {
            id: session.id.clone(),
            thread_id: None,
            turn_id: Some("turn-auto-compact-disabled".to_string()),
            schedule_id: None,
            max_turns: None,
            retry_config: None,
            system_prompt: None,
            system_prompt_override: None,
            include_context_trace: None,
            turn_context: Some(build_auto_compaction_disabled_turn_context()),
        };
        let policy = resolve_request_tool_policy(Some(false), false);
        let mut runtime_events = Vec::new();

        let error = stream_message_reply_with_policy(
            &agent,
            Message::user().with_text("继续处理"),
            None,
            session_config,
            None,
            &policy,
            |event| runtime_events.push(event.clone()),
        )
        .await
        .expect_err("禁用自动压缩时应透出上下文上限错误");

        assert_eq!(
            error.message,
            "当前会话已达到上下文上限，但当前工作区已关闭自动压缩。请先手动压缩上下文或新建会话后重试。"
        );
        assert!(
            runtime_events.iter().any(|event| matches!(
                event,
                RuntimeAgentEvent::Error { message }
                    if message
                        == "当前会话已达到上下文上限，但当前工作区已关闭自动压缩。请先手动压缩上下文或新建会话后重试。"
            )),
            "应向前端投影显式错误"
        );
        assert!(
            !runtime_events
                .iter()
                .any(|event| matches!(event, RuntimeAgentEvent::ContextCompactionStarted { .. })),
            "禁用自动压缩后，不应再投影 compaction started"
        );
        assert!(
            !runtime_events
                .iter()
                .any(|event| matches!(event, RuntimeAgentEvent::ContextCompactionCompleted { .. })),
            "禁用自动压缩后，不应再投影 compaction completed"
        );
    }

    #[tokio::test]
    async fn stream_message_reply_with_policy_should_retry_empty_reply_without_tool_activity() {
        let (store, session) = create_test_session_store("lime-empty-reply-retry");
        let agent = Agent::new().with_session_store(store.clone());
        let attempts = Arc::new(AtomicUsize::new(0));
        agent
            .update_provider(
                Arc::new(EmptyReplyThenTextProvider {
                    attempts: attempts.clone(),
                }),
                &session.id,
            )
            .await
            .expect("应配置测试 provider");

        let session_config = aster::agents::SessionConfig {
            id: session.id.clone(),
            thread_id: None,
            turn_id: Some("turn-empty-reply-retry".to_string()),
            schedule_id: None,
            max_turns: None,
            retry_config: None,
            system_prompt: None,
            system_prompt_override: None,
            include_context_trace: None,
            turn_context: None,
        };
        let policy = resolve_request_tool_policy(Some(false), false);
        let mut runtime_events = Vec::new();

        let reply = stream_message_reply_with_policy(
            &agent,
            Message::user().with_text("帮我总结一下这个项目"),
            None,
            session_config,
            None,
            &policy,
            |event| runtime_events.push(event.clone()),
        )
        .await
        .expect("空答复后应自动重试并成功");

        assert_eq!(reply.text_output, "这是补发的最终答复。");
        assert_eq!(attempts.load(Ordering::SeqCst), 2);
        assert!(
            runtime_events.iter().any(|event| matches!(
                event,
                RuntimeAgentEvent::RuntimeStatus { status }
                    if status.title == "正在重试生成答复"
            )),
            "应向前端投影空答复重试状态"
        );
    }

    #[tokio::test]
    async fn stream_message_reply_with_policy_should_return_cancelled_without_waiting_next_chunk() {
        let (store, session) = create_test_session_store("lime-stream-cancel");
        let agent = Agent::new().with_session_store(store.clone());
        agent
            .update_provider(Arc::new(SlowStreamingProvider), &session.id)
            .await
            .expect("应配置测试 provider");

        let session_config = aster::agents::SessionConfig {
            id: session.id.clone(),
            thread_id: None,
            turn_id: Some("turn-stream-cancel".to_string()),
            schedule_id: None,
            max_turns: None,
            retry_config: None,
            system_prompt: None,
            system_prompt_override: None,
            include_context_trace: None,
            turn_context: None,
        };
        let policy = resolve_request_tool_policy(Some(false), false);
        let cancel_token = CancellationToken::new();
        let cancel_for_task = cancel_token.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            cancel_for_task.cancel();
        });

        let reply = tokio::time::timeout(
            Duration::from_secs(2),
            stream_message_reply_with_policy(
                &agent,
                Message::user().with_text("请流式输出"),
                None,
                session_config,
                Some(cancel_token),
                &policy,
                |_| {},
            ),
        )
        .await
        .expect("取消后不应继续等待 provider 下一段")
        .expect("取消应作为可识别执行结果返回");

        assert!(reply.cancelled);
        assert!(
            !reply.text_output.contains("第二段"),
            "取消后不应等待或拼接 provider 的后续分片"
        );

        let stored_session = store
            .get_session(&session.id, true)
            .await
            .expect("应读取取消后的 session");
        let stored_conversation = stored_session.conversation.expect("应有会话上下文");
        let stored_messages = stored_conversation.iter().collect::<Vec<_>>();
        assert_eq!(
            stored_messages
                .iter()
                .filter(|message| message.is_user_visible())
                .count(),
            1,
            "取消上下文标记不应作为普通用户消息展示"
        );
        assert!(
            stored_messages.iter().any(|message| {
                !message.is_user_visible()
                    && message.is_agent_visible()
                    && message.as_concat_text().contains("上一回合已被用户停止")
            }),
            "取消后应写入仅 Agent 可见的上下文标记，避免下一轮继续回答已停止请求"
        );
    }

    #[tokio::test]
    async fn stream_message_reply_with_policy_should_drain_inline_provider_error_and_mark_turn_failed(
    ) {
        let (store, session) = create_test_session_store("lime-inline-provider-error");
        let agent = Agent::new().with_session_store(store.clone());
        agent
            .update_provider(Arc::new(AuthenticationErrorProvider), &session.id)
            .await
            .expect("应配置测试 provider");

        let session_config = aster::agents::SessionConfig {
            id: session.id.clone(),
            thread_id: None,
            turn_id: Some("turn-inline-provider-error".to_string()),
            schedule_id: None,
            max_turns: None,
            retry_config: None,
            system_prompt: None,
            system_prompt_override: None,
            include_context_trace: None,
            turn_context: None,
        };
        let policy = resolve_request_tool_policy(Some(false), false);
        let mut runtime_events = Vec::new();

        let error = stream_message_reply_with_policy(
            &agent,
            Message::user().with_text("你好，回复1"),
            None,
            session_config,
            None,
            &policy,
            |event| runtime_events.push(event.clone()),
        )
        .await
        .expect_err("鉴权失败时应返回 provider 执行错误");

        assert!(error.message.contains("Agent provider execution failed"));
        assert!(error.message.contains("Authentication failed"));
        assert!(
            !runtime_events.iter().any(|event| matches!(
                event,
                RuntimeAgentEvent::TextDelta { text }
                    if text.contains("Ran into this error:")
                        && text.contains("Authentication failed")
            )),
            "不应把底层 provider inline 错误文本透传给前端"
        );

        let snapshot = agent
            .runtime_snapshot(&session.id)
            .await
            .expect("应读取 runtime snapshot");
        let latest_turn = snapshot
            .threads
            .iter()
            .flat_map(|thread| thread.turns.iter())
            .max_by_key(|turn| turn.updated_at.timestamp_millis())
            .expect("应存在 runtime turn");

        assert_ne!(latest_turn.status, TurnStatus::Running);
        assert!(
            matches!(
                latest_turn.status,
                TurnStatus::Completed | TurnStatus::Failed
            ),
            "turn 至少应进入终态，不能继续停留在 running"
        );
    }
}
