use std::borrow::Cow;
use std::collections::HashMap;

use crate::conversation::message::{Message, MessageContent, ToolResponse};
use crate::session::TurnContextOverride;
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

    input_modality_policy_from_metadata(&turn_context.metadata)
        .map(input_modality_policy_allows_image_input)
        .unwrap_or(true)
}

fn input_modality_policy_from_metadata(metadata: &HashMap<String, Value>) -> Option<&Value> {
    [
        "runtime_options",
        "runtimeOptions",
        "aster_chat_request",
        "asterChatRequest",
        "config",
    ]
    .into_iter()
    .filter_map(|key| metadata.get(key))
    .find_map(input_modality_policy_from_value)
    .or_else(|| {
        metadata
            .get("harness")
            .and_then(model_request_policy_from_harness)
    })
    .or_else(|| {
        metadata
            .get("model_request_policy")
            .or_else(|| metadata.get("modelRequestPolicy"))
            .and_then(input_modality_policy_from_policy_value)
    })
    .or_else(|| {
        metadata
            .get("input_modality_policy")
            .or_else(|| metadata.get("inputModalityPolicy"))
            .filter(|value| value.is_object())
    })
}

fn input_modality_policy_from_value(value: &Value) -> Option<&Value> {
    direct_model_request_policy_value(value)
        .and_then(input_modality_policy_from_policy_value)
        .or_else(|| nested_metadata_value(value).and_then(input_modality_policy_from_value))
        .or_else(|| {
            [
                "runtime_options",
                "runtimeOptions",
                "aster_chat_request",
                "asterChatRequest",
                "config",
            ]
            .into_iter()
            .filter_map(|key| value.get(key))
            .find_map(input_modality_policy_from_value)
        })
        .or_else(|| input_modality_policy_from_policy_value(value))
        .or_else(|| looks_like_input_modality_policy_value(value).then_some(value))
}

fn direct_model_request_policy_value(value: &Value) -> Option<&Value> {
    value
        .pointer("/harness/model_request_policy")
        .or_else(|| value.pointer("/harness/modelRequestPolicy"))
        .or_else(|| value.get("model_request_policy"))
        .or_else(|| value.get("modelRequestPolicy"))
}

fn model_request_policy_from_harness(value: &Value) -> Option<&Value> {
    value
        .get("model_request_policy")
        .or_else(|| value.get("modelRequestPolicy"))
        .and_then(input_modality_policy_from_policy_value)
}

fn nested_metadata_value(value: &Value) -> Option<&Value> {
    value
        .get("metadata")
        .or_else(|| value.get("request_metadata"))
        .or_else(|| value.get("requestMetadata"))
}

fn input_modality_policy_from_policy_value(value: &Value) -> Option<&Value> {
    value
        .get("input_modality_policy")
        .or_else(|| value.get("inputModalityPolicy"))
        .filter(|value| value.is_object())
}

fn looks_like_input_modality_policy_value(value: &Value) -> bool {
    value.as_object().is_some_and(|object| {
        [
            "input_modalities",
            "inputModalities",
            "supports_image_input",
            "supportsImageInput",
        ]
        .iter()
        .any(|key| object.contains_key(*key))
    })
}

fn input_modality_policy_allows_image_input(value: &Value) -> bool {
    bool_field(value, &["supports_image_input", "supportsImageInput"]).unwrap_or_else(|| {
        string_array_field(value, &["input_modalities", "inputModalities"])
            .iter()
            .any(|modality| modality.eq_ignore_ascii_case("image"))
    })
}

fn bool_field(value: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter().find_map(|key| value.get(*key)?.as_bool())
}

fn string_array_field(value: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .find_map(|key| value.get(*key)?.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::model::{CallToolResult, Content};
    use serde_json::json;
    use std::collections::HashMap;

    fn turn_context_with_input_modalities(input_modalities: &[&str]) -> TurnContextOverride {
        let mut metadata = HashMap::new();
        metadata.insert(
            "harness".to_string(),
            json!({
                "model_request_policy": {
                    "input_modality_policy": {
                        "input_modalities": input_modalities,
                    }
                }
            }),
        );

        TurnContextOverride {
            metadata,
            ..TurnContextOverride::default()
        }
    }

    #[test]
    fn text_only_policy_replaces_message_and_tool_result_images() {
        let turn_context = turn_context_with_input_modalities(&["text"]);
        let messages = vec![
            Message::user()
                .with_text("look at this")
                .with_image("aGVsbG8=", "image/png")
                .with_text("caption"),
            Message::user().with_tool_response(
                "call_view_image",
                Ok(CallToolResult {
                    content: vec![
                        Content::text("Viewed image: sample.png"),
                        Content::image("aGVsbG8=", "image/png"),
                    ],
                    structured_content: None,
                    is_error: Some(false),
                    meta: None,
                }),
            ),
        ];

        let filtered = provider_prompt_messages_for_turn_context(&messages, Some(&turn_context));
        let filtered = filtered.as_ref();

        assert_eq!(filtered.len(), 2);
        assert!(matches!(
            &filtered[0].content[1],
            MessageContent::Text(text) if text.text == IMAGE_CONTENT_OMITTED_PLACEHOLDER
        ));
        assert!(!filtered[0]
            .content
            .iter()
            .any(|content| matches!(content, MessageContent::Image(_))));

        let MessageContent::ToolResponse(response) = &filtered[1].content[0] else {
            panic!("expected tool response");
        };
        let result = response.tool_result.as_ref().expect("tool result");
        assert!(matches!(
            &result.content[1].raw,
            RawContent::Text(text) if text.text == IMAGE_CONTENT_OMITTED_PLACEHOLDER
        ));
    }

    #[test]
    fn image_capable_policy_preserves_images() {
        let turn_context = turn_context_with_input_modalities(&["text", "image"]);
        let messages = vec![Message::user()
            .with_text("look at this")
            .with_image("aGVsbG8=", "image/png")];

        let filtered = provider_prompt_messages_for_turn_context(&messages, Some(&turn_context));

        assert!(matches!(filtered, Cow::Borrowed(_)));
        assert!(matches!(
            &filtered.as_ref()[0].content[1],
            MessageContent::Image(_)
        ));
    }

    #[test]
    fn missing_policy_keeps_compat_default_images_enabled() {
        let messages = vec![Message::user().with_image("aGVsbG8=", "image/png")];
        let turn_context = TurnContextOverride::default();

        let filtered = provider_prompt_messages_for_turn_context(&messages, Some(&turn_context));

        assert!(matches!(filtered, Cow::Borrowed(_)));
    }
}
