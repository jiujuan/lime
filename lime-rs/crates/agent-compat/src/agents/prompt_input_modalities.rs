use std::borrow::Cow;

use crate::conversation::message::{Message, MessageContent, ToolResponse};
use crate::session::TurnContextOverride;
use model_provider::provider_stream::provider_stream_metadata_allows_image_input;
use rmcp::model::{CallToolResult, Content, RawContent};
use serde_json::Value;

const IMAGE_CONTENT_OMITTED_PLACEHOLDER: &str =
    "image content omitted because you do not support image input";

pub(super) fn provider_prompt_messages_for_turn_context<'a>(
    messages: &'a [Message],
    turn_context: Option<&TurnContextOverride>,
) -> Cow<'a, [Message]> {
    if turn_context_allows_image_input(turn_context) {
        return Cow::Borrowed(messages);
    }

    let mut changed = false;
    let normalized = messages
        .iter()
        .map(|message| normalize_message_images(message, &mut changed))
        .collect::<Vec<_>>();

    if changed {
        Cow::Owned(normalized)
    } else {
        Cow::Borrowed(messages)
    }
}

fn normalize_message_images(message: &Message, changed: &mut bool) -> Message {
    let mut normalized = message.clone();
    normalized.content = message
        .content
        .iter()
        .map(|content| normalize_message_content_images(content, changed))
        .collect();
    normalized
}

fn normalize_message_content_images(
    content: &MessageContent,
    changed: &mut bool,
) -> MessageContent {
    match content {
        MessageContent::Image(_) => {
            *changed = true;
            MessageContent::text(IMAGE_CONTENT_OMITTED_PLACEHOLDER)
        }
        MessageContent::ToolResponse(response) => {
            MessageContent::ToolResponse(normalize_tool_response_images(response, changed))
        }
        _ => content.clone(),
    }
}

fn normalize_tool_response_images(response: &ToolResponse, changed: &mut bool) -> ToolResponse {
    let mut normalized = response.clone();
    let Ok(result) = &response.tool_result else {
        return normalized;
    };

    let mut result_changed = false;
    let mut normalized_result: CallToolResult = result.clone();
    normalized_result.content = result
        .content
        .iter()
        .map(|content| normalize_tool_result_content_images(content, &mut result_changed))
        .collect();

    if result_changed {
        *changed = true;
        normalized.tool_result = Ok(normalized_result);
    }

    normalized
}

fn normalize_tool_result_content_images(content: &Content, changed: &mut bool) -> Content {
    match &content.raw {
        RawContent::Image(_) => {
            *changed = true;
            Content::text(IMAGE_CONTENT_OMITTED_PLACEHOLDER.to_string())
        }
        _ => content.clone(),
    }
}

fn turn_context_allows_image_input(turn_context: Option<&TurnContextOverride>) -> bool {
    let Some(turn_context) = turn_context else {
        return true;
    };

    let metadata = Value::Object(
        turn_context
            .metadata
            .iter()
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect(),
    );
    provider_stream_metadata_allows_image_input(Some(&metadata))
}
