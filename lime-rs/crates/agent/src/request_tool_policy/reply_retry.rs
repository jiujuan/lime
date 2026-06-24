use super::stream_diagnostics::StreamEventDiagnostics;
use super::{PreflightToolExecution, RequestToolPolicy, WebSearchExecutionTracker};

pub(crate) const WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS: usize = 3;
pub(crate) const WEB_SEARCH_SYNTHESIS_MIN_COMPLETED_ATTEMPTS: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ReplyRetryMode {
    None,
    WebSearchSynthesis,
    DirectAnswer,
    IntermediateConclusion,
}

pub(crate) fn looks_like_incomplete_tool_batch_summary(text: &str) -> bool {
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

pub(crate) fn resolve_reply_retry_mode(
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
        && diagnostics.effective_tool_start_count() > 0
        && diagnostics.effective_tool_end_count() > 0
        && looks_like_incomplete_tool_batch_summary(trimmed_text_output)
    {
        if diagnostics.terminal_tool_search_no_retry {
            return ReplyRetryMode::None;
        }
        return ReplyRetryMode::IntermediateConclusion;
    }

    if !trimmed_text_output.is_empty() {
        return ReplyRetryMode::None;
    }

    if preflight_execution.system_prompt_appendix.is_some() || tracker.has_attempts() {
        return ReplyRetryMode::WebSearchSynthesis;
    }

    if diagnostics.effective_tool_start_count() == 0
        && diagnostics.effective_tool_end_count() == 0
        && diagnostics.saved_site_content_count == 0
        && diagnostics.persisted_artifact_count == 0
    {
        return ReplyRetryMode::DirectAnswer;
    }

    ReplyRetryMode::None
}

pub(crate) fn should_synthesize_web_search_after_enough_evidence(
    policy: &RequestToolPolicy,
    tracker: &WebSearchExecutionTracker,
    diagnostics: &StreamEventDiagnostics,
) -> bool {
    if !policy.effective_web_search
        || diagnostics.text_delta_count > 0
        || diagnostics.error_count > 0
        || diagnostics.effective_tool_start_count() != diagnostics.effective_tool_end_count()
    {
        return false;
    }

    if policy.requires_web_search() && !tracker.has_successful_required_attempt(policy) {
        return false;
    }

    let successful = tracker.successful_attempt_count_for_policy(policy);
    if successful >= WEB_SEARCH_SYNTHESIS_MIN_SUCCESSFUL_ATTEMPTS {
        return true;
    }

    successful > 0
        && tracker.completed_attempt_count_for_policy(policy)
            >= WEB_SEARCH_SYNTHESIS_MIN_COMPLETED_ATTEMPTS
}

pub(crate) fn build_empty_final_reply_error_message(
    diagnostics: &StreamEventDiagnostics,
    tracker: &WebSearchExecutionTracker,
) -> String {
    let attempts_summary = build_empty_final_reply_attempts_summary(diagnostics, tracker);

    if diagnostics.effective_tool_start_count() == 0 && diagnostics.effective_tool_end_count() == 0
    {
        format!("模型未输出最终答复，且未执行任何工具。\n尝试记录: {attempts_summary}")
    } else {
        format!("已完成当前回合的工具执行，但模型未输出最终答复。\n尝试记录: {attempts_summary}")
    }
}

fn build_empty_final_reply_attempts_summary(
    diagnostics: &StreamEventDiagnostics,
    tracker: &WebSearchExecutionTracker,
) -> String {
    if tracker.has_attempts() {
        return tracker.format_attempts();
    }

    if diagnostics.effective_tool_start_count() > 0 || diagnostics.effective_tool_end_count() > 0 {
        return format!(
            "已执行非联网工具（tool_start={}, tool_end={}）",
            diagnostics.effective_tool_start_count(),
            diagnostics.effective_tool_end_count()
        );
    }

    "无工具调用".to_string()
}
