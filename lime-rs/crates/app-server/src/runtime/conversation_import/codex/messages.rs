use app_server_protocol::{
    ConversationImportPreviewEvent, ConversationImportPreviewMessage,
    ConversationImportSourceProvenance,
};
use serde_json::Value;

use super::{media, CodexRolloutParseMode, MAX_PREVIEW_TEXT_BYTES, USER_MESSAGE_BEGIN};

const CONTEXTUAL_USER_PREFIXES: &[&str] = &[
    "# AGENTS.md instructions",
    "<environment_context>",
    "<additional_context>",
    "<skill>",
    "<user_shell_command>",
    "<turn_aborted>",
    "<subagent_notification>",
    "<goal_context>",
    "<codex_internal_context",
    "<legacy_unified_exec_process_limit_warning>",
    "<legacy_apply_patch_exec_command_warning>",
    "<legacy_model_mismatch_warning>",
];

const CONTEXTUAL_DEVELOPER_PREFIXES: &[&str] = &[
    "<permissions instructions>",
    "<model_switch>",
    "<collaboration_mode>",
    "<realtime_conversation>",
    "<skills_instructions>",
    "<personality_spec>",
    "<token_budget>",
    "<app-context>",
    "<plugins_instructions>",
];

#[derive(Debug, Clone)]
pub(in crate::runtime::conversation_import) struct CodexTimelineMessage {
    pub(in crate::runtime::conversation_import) preview: ConversationImportPreviewMessage,
    pub(in crate::runtime::conversation_import) phase: Option<String>,
    pub(in crate::runtime::conversation_import) source_item_id: Option<String>,
}

pub(super) fn response_item_preview_message(
    payload: Option<&Value>,
    timestamp: Option<String>,
    mode: &CodexRolloutParseMode,
    provenance: Option<ConversationImportSourceProvenance>,
) -> Option<CodexTimelineMessage> {
    let payload = payload?;
    if payload.get("type").and_then(Value::as_str) != Some("message") {
        return None;
    }
    let role = payload.get("role").and_then(Value::as_str)?.to_string();
    if !matches!(role.as_str(), "user" | "assistant") {
        return None;
    }
    let content = payload.get("content")?;
    if role == "user" && is_contextual_user_message_content(content) {
        return None;
    }
    let attachments = if role == "user" {
        media::response_item_attachments(content)
    } else {
        Vec::new()
    };
    let text = collect_message_text(content)
        .or_else(|| (!attachments.is_empty()).then(|| "[Image]".to_string()))?;
    let truncated = truncate_text_for_mode(&text, mode);
    Some(CodexTimelineMessage {
        preview: ConversationImportPreviewMessage {
            role,
            text: truncated.text,
            attachments,
            truncated: truncated.truncated,
            omitted_bytes: truncated.omitted_bytes,
            timestamp,
            source_type: Some("response_item".to_string()),
            provenance,
        },
        phase: payload
            .get("phase")
            .and_then(Value::as_str)
            .map(str::to_string),
        source_item_id: payload
            .get("id")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string),
    })
}

pub(super) fn event_msg_preview_message(
    payload: Option<&Value>,
    timestamp: Option<String>,
    mode: &CodexRolloutParseMode,
    provenance: Option<ConversationImportSourceProvenance>,
) -> Option<CodexTimelineMessage> {
    let payload = payload?;
    let kind = payload.get("type").and_then(Value::as_str)?;
    let (role, text, attachments) = match kind {
        "user_message" => (
            "user",
            user_message_text(payload)?,
            media::event_user_attachments(payload),
        ),
        "agent_message" => (
            "assistant",
            payload
                .get("message")
                .and_then(Value::as_str)?
                .trim()
                .to_string(),
            Vec::new(),
        ),
        _ => return None,
    };
    if text.trim().is_empty() {
        return None;
    }
    let truncated = truncate_text_for_mode(&text, mode);
    Some(CodexTimelineMessage {
        preview: ConversationImportPreviewMessage {
            role: role.to_string(),
            text: truncated.text,
            attachments,
            truncated: truncated.truncated,
            omitted_bytes: truncated.omitted_bytes,
            timestamp,
            source_type: Some("event_msg".to_string()),
            provenance,
        },
        phase: payload
            .get("phase")
            .and_then(Value::as_str)
            .map(str::to_string),
        source_item_id: None,
    })
}

pub(super) fn event_preview(
    payload: Option<&Value>,
    timestamp: Option<String>,
    provenance: Option<ConversationImportSourceProvenance>,
) -> Option<ConversationImportPreviewEvent> {
    let payload = payload?;
    let kind = payload.get("type").and_then(Value::as_str)?.to_string();
    let label = match kind.as_str() {
        "user_message" => payload
            .get("message")
            .and_then(Value::as_str)
            .map(|value| truncate_preview_text(value, 160).text),
        "agent_message" => payload
            .get("message")
            .and_then(Value::as_str)
            .map(|value| truncate_preview_text(value, 160).text),
        "turn_started" | "turn_complete" | "task_complete" | "token_count" => None,
        _ => None,
    };
    Some(ConversationImportPreviewEvent {
        kind,
        timestamp,
        label,
        provenance,
    })
}

fn collect_message_text(content: &Value) -> Option<String> {
    let parts = content.as_array()?;
    let text = parts
        .iter()
        .filter_map(|part| {
            part.get("text")
                .and_then(Value::as_str)
                .or_else(|| part.get("message").and_then(Value::as_str))
        })
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    (!text.is_empty()).then_some(text)
}

fn is_contextual_user_message_content(content: &Value) -> bool {
    content
        .as_array()
        .is_some_and(|parts| parts.iter().any(is_contextual_message_part))
}

fn is_contextual_message_part(part: &Value) -> bool {
    let Some(text) = part
        .get("text")
        .and_then(Value::as_str)
        .or_else(|| part.get("message").and_then(Value::as_str))
    else {
        return false;
    };
    let trimmed = text.trim_start();
    if trimmed.is_empty() {
        return false;
    }
    CONTEXTUAL_USER_PREFIXES
        .iter()
        .chain(CONTEXTUAL_DEVELOPER_PREFIXES.iter())
        .any(|prefix| starts_with_ignore_ascii_case(trimmed, prefix))
}

fn starts_with_ignore_ascii_case(value: &str, prefix: &str) -> bool {
    value
        .get(..prefix.len())
        .is_some_and(|candidate| candidate.eq_ignore_ascii_case(prefix))
}

fn truncate_text_for_mode(text: &str, mode: &CodexRolloutParseMode) -> TruncatedText {
    match mode {
        CodexRolloutParseMode::Preview { .. } => {
            truncate_preview_text(text, MAX_PREVIEW_TEXT_BYTES)
        }
        CodexRolloutParseMode::Import => TruncatedText {
            text: text.to_string(),
            truncated: false,
            omitted_bytes: 0,
        },
    }
}

fn strip_user_message_prefix(text: &str) -> String {
    match text.find(USER_MESSAGE_BEGIN) {
        Some(index) => text[index + USER_MESSAGE_BEGIN.len()..].trim().to_string(),
        None => text.trim().to_string(),
    }
}

fn user_message_text(payload: &Value) -> Option<String> {
    payload
        .get("message")
        .and_then(Value::as_str)
        .map(strip_user_message_prefix)
        .filter(|message| !message.trim().is_empty())
        .or_else(|| user_message_image_placeholder(payload))
}

fn user_message_image_placeholder(payload: &Value) -> Option<String> {
    let has_remote_images = payload
        .get("images")
        .and_then(Value::as_array)
        .is_some_and(|images| !images.is_empty());
    let has_local_images = payload
        .get("local_images")
        .and_then(Value::as_array)
        .is_some_and(|images| !images.is_empty());
    (has_remote_images || has_local_images).then(|| "[Image]".to_string())
}

pub(super) struct TruncatedText {
    pub(super) text: String,
    truncated: bool,
    omitted_bytes: usize,
}

pub(super) fn truncate_preview_text(text: &str, max_bytes: usize) -> TruncatedText {
    if text.len() <= max_bytes {
        return TruncatedText {
            text: text.to_string(),
            truncated: false,
            omitted_bytes: 0,
        };
    }
    let mut end = max_bytes;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    TruncatedText {
        text: text[..end].to_string(),
        truncated: true,
        omitted_bytes: text.len() - end,
    }
}

pub(super) fn push_timeline_message(
    timeline: &mut Vec<super::CodexTimelineItem>,
    candidate: CodexTimelineMessage,
) {
    if let Some(super::CodexTimelineItem::Message(existing)) = timeline
        .iter_mut()
        .rev()
        .find(|item| matches!(item, super::CodexTimelineItem::Message(_)))
    {
        if same_timeline_message(existing, &candidate) {
            merge_timeline_message(existing, candidate);
            return;
        }
    }
    timeline.push(super::CodexTimelineItem::Message(candidate));
}

pub(super) fn push_preview_message(
    messages: &mut Vec<ConversationImportPreviewMessage>,
    candidate: ConversationImportPreviewMessage,
    limit: usize,
) -> bool {
    if let Some(existing) = messages
        .iter_mut()
        .rev()
        .find(|message| same_preview_message(message, &candidate))
    {
        merge_preview_message(existing, candidate);
        return false;
    }
    if messages.len() < limit {
        messages.push(candidate);
        return false;
    }
    true
}

fn same_preview_message(
    existing: &ConversationImportPreviewMessage,
    candidate: &ConversationImportPreviewMessage,
) -> bool {
    existing.role == candidate.role
        && existing.text.trim() == candidate.text.trim()
        && complementary_message_sources(
            existing.source_type.as_deref(),
            candidate.source_type.as_deref(),
        )
        && adjacent_source_events(existing.provenance.as_ref(), candidate.provenance.as_ref())
}

fn same_timeline_message(
    existing: &CodexTimelineMessage,
    candidate: &CodexTimelineMessage,
) -> bool {
    same_preview_message(&existing.preview, &candidate.preview)
}

fn complementary_message_sources(existing: Option<&str>, candidate: Option<&str>) -> bool {
    matches!(
        (existing, candidate),
        (Some("event_msg"), Some("response_item")) | (Some("response_item"), Some("event_msg"))
    )
}

fn adjacent_source_events(
    existing: Option<&ConversationImportSourceProvenance>,
    candidate: Option<&ConversationImportSourceProvenance>,
) -> bool {
    let Some(existing) = existing.and_then(|value| value.source_event_seq) else {
        return false;
    };
    let Some(candidate) = candidate.and_then(|value| value.source_event_seq) else {
        return false;
    };
    existing.abs_diff(candidate) == 1
}

fn merge_preview_message(
    existing: &mut ConversationImportPreviewMessage,
    candidate: ConversationImportPreviewMessage,
) {
    if candidate.source_type.as_deref() == Some("event_msg") {
        existing.timestamp = candidate.timestamp.or(existing.timestamp.take());
        existing.source_type = candidate.source_type;
        existing.provenance = candidate.provenance.or(existing.provenance.take());
    } else {
        if existing.timestamp.is_none() {
            existing.timestamp = candidate.timestamp;
        }
        if existing.provenance.is_none() {
            existing.provenance = candidate.provenance;
        }
    }
    for attachment in candidate.attachments {
        let already_present = existing
            .attachments
            .iter()
            .any(|existing| existing.kind == attachment.kind && existing.uri == attachment.uri);
        if !already_present {
            existing.attachments.push(attachment);
        }
    }
}

fn merge_timeline_message(existing: &mut CodexTimelineMessage, candidate: CodexTimelineMessage) {
    let candidate_is_event = candidate.preview.source_type.as_deref() == Some("event_msg");
    let candidate_phase = candidate.phase.clone();
    let candidate_item_id = candidate.source_item_id.clone();
    merge_preview_message(&mut existing.preview, candidate.preview);
    if candidate_is_event {
        existing.phase = candidate_phase.or(existing.phase.take());
    } else if existing.phase.is_none() {
        existing.phase = candidate_phase;
    }
    if candidate_item_id.is_some() {
        existing.source_item_id = candidate_item_id;
    }
}
