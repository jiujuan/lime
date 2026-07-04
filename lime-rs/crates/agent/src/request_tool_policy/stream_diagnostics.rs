use crate::protocol::{AgentArtifactSignal, AgentEvent as RuntimeAgentEvent, AgentToolResult};
use lime_core::database::dao::agent_timeline::AgentThreadItemPayload;
use model_provider::runtime_provider::message_is_non_retryable_provider_rejection;
use serde_json::{Map, Value};
use std::collections::HashMap;

const STREAM_EVENT_DIAG_WARN_TEXT_DELTA_CHARS: usize = 2_000;
const STREAM_EVENT_DIAG_WARN_TOOL_OUTPUT_CHARS: usize = 8_000;
const STREAM_EVENT_DIAG_WARN_CONTEXT_STEPS: usize = 24;

#[derive(Debug, Default)]
pub(crate) struct StreamEventDiagnostics {
    pub(crate) text_delta_count: usize,
    pub(crate) tool_start_count: usize,
    pub(crate) tool_end_count: usize,
    pub(crate) tool_item_start_count: usize,
    pub(crate) tool_item_end_count: usize,
    pub(crate) error_count: usize,
    pub(crate) context_trace_events: usize,
    pub(crate) artifact_snapshot_count: usize,
    pub(crate) persisted_artifact_count: usize,
    pub(crate) saved_site_content_count: usize,
    pub(crate) max_text_delta_chars: usize,
    pub(crate) max_tool_output_chars: usize,
    pub(crate) max_context_trace_steps: usize,
    pub(crate) last_persisted_artifact_path: Option<String>,
    pub(crate) last_saved_markdown_path: Option<String>,
    pub(crate) terminal_tool_search_no_retry: bool,
}

impl StreamEventDiagnostics {
    pub(crate) fn effective_tool_start_count(&self) -> usize {
        self.tool_start_count
            .max(self.tool_item_start_count.max(self.tool_item_end_count))
    }

    pub(crate) fn effective_tool_end_count(&self) -> usize {
        self.tool_end_count.max(self.tool_item_end_count)
    }
}

pub(crate) fn update_stream_event_diagnostics(
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
                    "[AgentRuntime][Diag] large text_delta observed: chars={}",
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
            if tool_result_is_terminal_tool_search_no_retry(result) {
                diagnostics.terminal_tool_search_no_retry = true;
            }
            if tool_result_contains_saved_site_content(result) {
                diagnostics.saved_site_content_count += 1;
                if diagnostics.last_saved_markdown_path.is_none() {
                    diagnostics.last_saved_markdown_path =
                        extract_saved_markdown_path_from_tool_result(result);
                }
            }
            if output_chars >= STREAM_EVENT_DIAG_WARN_TOOL_OUTPUT_CHARS {
                tracing::warn!(
                    "[AgentRuntime][Diag] large tool_end output observed: tool_id={}, output_chars={}, success={}",
                    tool_id,
                    output_chars,
                    result.success
                );
            }
        }
        RuntimeAgentEvent::ItemStarted { item } | RuntimeAgentEvent::ItemUpdated { item } => {
            if matches!(item.payload, AgentThreadItemPayload::ToolCall { .. }) {
                diagnostics.tool_item_start_count += 1;
            }
        }
        RuntimeAgentEvent::ItemCompleted { item } => {
            if matches!(item.payload, AgentThreadItemPayload::ToolCall { .. }) {
                diagnostics.tool_item_end_count += 1;
            }
        }
        RuntimeAgentEvent::ContextTrace { steps } => {
            diagnostics.context_trace_events += 1;
            diagnostics.max_context_trace_steps =
                diagnostics.max_context_trace_steps.max(steps.len());
            if steps.len() >= STREAM_EVENT_DIAG_WARN_CONTEXT_STEPS {
                tracing::warn!(
                    "[AgentRuntime][Diag] large context_trace observed: steps={}",
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

pub(crate) fn should_downgrade_provider_tail_failure(
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

pub(crate) fn should_retry_provider_tail_failure(
    error_message: &str,
    _diagnostics: &StreamEventDiagnostics,
    emitted_any: bool,
) -> bool {
    emitted_any && retryable_provider_tail_failure_detail(error_message).is_some()
}

pub(crate) fn retryable_provider_tail_failure_detail(error_message: &str) -> Option<&str> {
    let detail = error_message
        .trim()
        .strip_prefix("Agent provider execution failed:")?
        .trim();
    if detail.is_empty() {
        return None;
    }
    if message_is_non_retryable_provider_rejection(detail) {
        return None;
    }
    Some(detail)
}

pub(crate) fn build_output_preserved_reply_fallback(
    diagnostics: &StreamEventDiagnostics,
) -> Option<String> {
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

fn tool_result_is_terminal_tool_search_no_retry(result: &AgentToolResult) -> bool {
    let Some(metadata) = result.metadata.as_ref() else {
        return false;
    };

    metadata
        .get("tool_search_retry_allowed")
        .and_then(Value::as_bool)
        == Some(false)
        || metadata
            .get("terminal_reason")
            .and_then(Value::as_str)
            .is_some_and(|reason| reason == "no_deferred_tool_match")
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

fn artifact_snapshot_is_persisted(artifact: &AgentArtifactSignal) -> bool {
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
