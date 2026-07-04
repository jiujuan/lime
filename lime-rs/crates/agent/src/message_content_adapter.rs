//! Aster message content adapter.
//!
//! Aster `MessageContent` stays behind this compat boundary; callers receive
//! Lime runtime protocol DTOs and events.

use agent_protocol::action_required::{
    elicitation_action, elicitation_response_event_action, elicitation_response_message_action,
    tool_confirmation_action, ActionRequiredProjection,
};
use aster::conversation::message::{
    ActionRequiredData, ActionRequiredScope as AsterActionRequiredScope, Message, MessageContent,
};
use std::collections::HashMap;
use tool_runtime::tool_result::{
    extract_tool_result_data, extract_tool_result_metadata, extract_tool_result_structured_content,
    ToolResultDiagnostics, ToolResultImageProjection,
};

use crate::protocol::{
    AgentActionRequiredScope as RuntimeActionRequiredScope, AgentEvent as RuntimeAgentEvent,
    AgentMessage as RuntimeAgentMessage, AgentMessageContent as RuntimeMessageContent,
    AgentToolImage as RuntimeToolImage, AgentToolResult as RuntimeToolResult,
};
use crate::tool_io_offload::{maybe_offload_tool_arguments, maybe_offload_tool_result_payload};

const TOOL_RESULT_DIAG_WARN_JSON_BYTES: usize = 64 * 1024;
const TOOL_RESULT_DIAG_WARN_OUTPUT_CHARS: usize = 4_000;
const TOOL_RESULT_DIAG_WARN_IMAGE_COUNT: usize = 4;

fn dynamic_filtering_enabled() -> bool {
    lime_core::tool_calling::tool_calling_dynamic_filtering_enabled()
}

fn enhance_execution_error_text(raw: &str) -> String {
    if !raw.contains("Execution error: No such file or directory (os error 2)") {
        return raw.to_string();
    }

    if raw.contains("排查建议：") {
        return raw.to_string();
    }

    format!(
        "{raw}\n\n排查建议：\n1) 检查工作区目录是否仍然存在（目录被移动/删除会触发该错误）。\n2) 若使用本地 CLI Provider，请确认对应命令已安装且在 PATH 中。\n3) 重启应用后重试；若仍失败，请复制该错误并附上系统信息。"
    )
}

fn log_tool_result_diagnostics(tool_id: &str, diagnostics: &ToolResultDiagnostics) {
    let raw_json_bytes = diagnostics.raw_json_bytes.unwrap_or(0);
    let should_warn = diagnostics.text_truncated
        || diagnostics.images_truncated
        || raw_json_bytes >= TOOL_RESULT_DIAG_WARN_JSON_BYTES
        || diagnostics.output_chars >= TOOL_RESULT_DIAG_WARN_OUTPUT_CHARS
        || diagnostics.image_count >= TOOL_RESULT_DIAG_WARN_IMAGE_COUNT;

    if should_warn {
        tracing::warn!(
            "[AsterAgent][Diag] tool_end payload summary: tool_id={}, raw_json_bytes={}, output_chars={}, image_count={}, text_truncated={}, images_truncated={}",
            tool_id,
            raw_json_bytes,
            diagnostics.output_chars,
            diagnostics.image_count,
            diagnostics.text_truncated,
            diagnostics.images_truncated
        );
    } else {
        tracing::debug!(
            "[AsterAgent][Diag] tool_end payload summary: tool_id={}, raw_json_bytes={}, output_chars={}, image_count={}",
            tool_id,
            raw_json_bytes,
            diagnostics.output_chars,
            diagnostics.image_count
        );
    }
}

fn convert_tool_result_image(image: ToolResultImageProjection) -> RuntimeToolImage {
    RuntimeToolImage {
        src: image.src,
        mime_type: image.mime_type,
        origin: image.origin,
    }
}

fn convert_tool_result_images(
    images: Vec<ToolResultImageProjection>,
) -> Option<Vec<RuntimeToolImage>> {
    if images.is_empty() {
        None
    } else {
        Some(images.into_iter().map(convert_tool_result_image).collect())
    }
}

fn legacy_message_tool_response_metadata(
    metadata: Option<HashMap<String, serde_json::Value>>,
) -> HashMap<String, serde_json::Value> {
    let mut metadata = metadata.unwrap_or_default();
    metadata.insert(
        "source".to_string(),
        serde_json::json!("legacy_message_tool_response"),
    );
    metadata.insert("sourceType".to_string(), serde_json::json!("tool_end"));
    metadata.insert("compat".to_string(), serde_json::json!(true));
    metadata.insert("canonical".to_string(), serde_json::json!(false));
    metadata
}

fn project_aster_action_required_scope(
    scope: Option<&AsterActionRequiredScope>,
) -> Option<RuntimeActionRequiredScope> {
    let scope = scope?;
    RuntimeActionRequiredScope::from_parts(
        scope.session_id.clone(),
        scope.thread_id.clone(),
        scope.turn_id.clone(),
    )
}

fn project_aster_action_required_event(
    data: &ActionRequiredData,
    scope: Option<&AsterActionRequiredScope>,
) -> ActionRequiredProjection {
    let scope = project_aster_action_required_scope(scope);
    match data {
        ActionRequiredData::ToolConfirmation {
            id,
            tool_name,
            arguments,
            prompt,
        } => tool_confirmation_action(
            id.clone(),
            tool_name.clone(),
            serde_json::Value::Object(arguments.clone()),
            prompt.clone(),
            scope,
        ),
        ActionRequiredData::Elicitation {
            id,
            message,
            requested_schema,
        } => elicitation_action(id.clone(), message.clone(), requested_schema.clone(), scope),
        ActionRequiredData::ElicitationResponse { id, user_data } => {
            elicitation_response_event_action(id.clone(), user_data.clone(), scope)
        }
    }
}

fn project_aster_action_required_message(
    data: &ActionRequiredData,
    scope: Option<&AsterActionRequiredScope>,
) -> ActionRequiredProjection {
    let scope = project_aster_action_required_scope(scope);
    match data {
        ActionRequiredData::ToolConfirmation {
            id,
            tool_name,
            arguments,
            prompt,
        } => tool_confirmation_action(
            id.clone(),
            tool_name.clone(),
            serde_json::Value::Object(arguments.clone()),
            prompt.clone(),
            scope,
        ),
        ActionRequiredData::Elicitation {
            id,
            message,
            requested_schema,
        } => elicitation_action(id.clone(), message.clone(), requested_schema.clone(), scope),
        ActionRequiredData::ElicitationResponse { id, user_data } => {
            elicitation_response_message_action(id.clone(), user_data.clone(), scope)
        }
    }
}

pub(crate) fn convert_aster_message_to_events(message: Message) -> Vec<RuntimeAgentEvent> {
    let mut events = vec![RuntimeAgentEvent::Message {
        message: convert_aster_message_to_runtime_message(&message),
    }];

    for content in &message.content {
        match content {
            MessageContent::Text(text_content) => {
                events.push(RuntimeAgentEvent::TextDelta {
                    text: enhance_execution_error_text(&text_content.text),
                });
            }
            MessageContent::Thinking(thinking) => {
                events.push(RuntimeAgentEvent::ThinkingDelta {
                    text: thinking.thinking.clone(),
                });
            }
            MessageContent::ToolRequest(tool_request) => match &tool_request.tool_call {
                Ok(call) => {
                    let arguments_value = serde_json::to_value(&call.arguments).unwrap_or_default();
                    events.push(RuntimeAgentEvent::ToolStart {
                        tool_name: call.name.to_string(),
                        tool_id: tool_request.id.clone(),
                        arguments: serde_json::to_string(&maybe_offload_tool_arguments(
                            &tool_request.id,
                            &arguments_value,
                        ))
                        .ok(),
                    });
                }
                Err(e) => {
                    events.push(RuntimeAgentEvent::Error {
                        message: format!("Invalid tool call: {e}"),
                    });
                }
            },
            MessageContent::ToolResponse(tool_response) => {
                let (success, output, error, structured_content, images, metadata) =
                    match &tool_response.tool_result {
                        Ok(result) => {
                            let extracted =
                                extract_tool_result_data(result, dynamic_filtering_enabled());
                            let structured_content = extract_tool_result_structured_content(result);
                            log_tool_result_diagnostics(&tool_response.id, &extracted.diagnostics);
                            let offloaded = maybe_offload_tool_result_payload(
                                &tool_response.id,
                                &extracted.output,
                                result,
                                Some(legacy_message_tool_response_metadata(
                                    extract_tool_result_metadata(result),
                                )),
                            );
                            (
                                true,
                                offloaded.output,
                                None,
                                structured_content,
                                convert_tool_result_images(extracted.images),
                                if offloaded.metadata.is_empty() {
                                    None
                                } else {
                                    Some(offloaded.metadata)
                                },
                            )
                        }
                        Err(e) => (
                            false,
                            String::new(),
                            Some(e.to_string()),
                            None,
                            None,
                            Some(legacy_message_tool_response_metadata(None)),
                        ),
                    };

                events.push(RuntimeAgentEvent::ToolEnd {
                    tool_id: tool_response.id.clone(),
                    result: RuntimeToolResult {
                        success,
                        output,
                        error,
                        structured_content,
                        images,
                        metadata,
                    },
                });
            }
            MessageContent::ActionRequired(action_required) => {
                let projection = project_aster_action_required_event(
                    &action_required.data,
                    action_required.scope.as_ref(),
                );

                events.push(RuntimeAgentEvent::ActionRequired {
                    request_id: projection.id,
                    action_type: projection.action_type,
                    data: projection.data,
                    scope: projection.scope,
                });
            }
            MessageContent::SystemNotification(notification) => {
                events.push(RuntimeAgentEvent::TextDelta {
                    text: notification.msg.clone(),
                });
            }
            MessageContent::Image(image) => {
                tracing::debug!("Image content: {}", image.mime_type);
            }
            MessageContent::ToolConfirmationRequest(req) => {
                let projection = tool_confirmation_action(
                    req.id.clone(),
                    req.tool_name.clone(),
                    serde_json::Value::Object(req.arguments.clone()),
                    req.prompt.clone(),
                    None,
                );
                events.push(RuntimeAgentEvent::ActionRequired {
                    request_id: projection.id,
                    action_type: projection.action_type,
                    data: projection.data,
                    scope: None,
                });
            }
            MessageContent::FrontendToolRequest(req) => match &req.tool_call {
                Ok(call) => {
                    events.push(RuntimeAgentEvent::ToolStart {
                        tool_name: call.name.to_string(),
                        tool_id: req.id.clone(),
                        arguments: serde_json::to_string(&call.arguments).ok(),
                    });
                }
                Err(e) => {
                    events.push(RuntimeAgentEvent::Error {
                        message: format!("Invalid frontend tool call: {e}"),
                    });
                }
            },
            MessageContent::ToolInputDelta(delta) => {
                events.push(RuntimeAgentEvent::ToolInputDelta {
                    tool_id: delta.id.clone(),
                    tool_name: delta.tool_name.clone(),
                    delta: delta.delta.clone(),
                    accumulated_arguments: delta.accumulated_arguments.clone(),
                    provider: delta.provider.clone(),
                });
            }
            MessageContent::RedactedThinking(_) => {}
        }
    }

    events
}

pub(crate) fn convert_aster_message_to_runtime_message(message: &Message) -> RuntimeAgentMessage {
    let content = message
        .content
        .iter()
        .filter_map(convert_aster_message_content_to_runtime_content)
        .collect();

    RuntimeAgentMessage {
        id: message.id.clone(),
        role: format!("{:?}", message.role).to_lowercase(),
        content,
        timestamp: message.created,
        usage: None,
    }
}

fn convert_aster_message_content_to_runtime_content(
    content: &MessageContent,
) -> Option<RuntimeMessageContent> {
    match content {
        MessageContent::Text(text) => Some(RuntimeMessageContent::Text {
            text: text.text.clone(),
        }),
        MessageContent::Thinking(thinking) => Some(RuntimeMessageContent::Thinking {
            text: thinking.thinking.clone(),
        }),
        MessageContent::ToolRequest(req) => req.tool_call.as_ref().ok().map(|call| {
            let arguments_value = serde_json::to_value(&call.arguments).unwrap_or_default();
            RuntimeMessageContent::ToolRequest {
                id: req.id.clone(),
                tool_name: call.name.to_string(),
                arguments: maybe_offload_tool_arguments(&req.id, &arguments_value),
            }
        }),
        MessageContent::ToolResponse(resp) => {
            let (success, output, error, structured_content, images, metadata) = match &resp
                .tool_result
            {
                Ok(result) => {
                    let extracted = extract_tool_result_data(result, dynamic_filtering_enabled());
                    let structured_content = extract_tool_result_structured_content(result);
                    let offloaded = maybe_offload_tool_result_payload(
                        &resp.id,
                        &extracted.output,
                        result,
                        extract_tool_result_metadata(result),
                    );
                    (
                        true,
                        offloaded.output,
                        None,
                        structured_content,
                        convert_tool_result_images(extracted.images),
                        if offloaded.metadata.is_empty() {
                            None
                        } else {
                            Some(offloaded.metadata)
                        },
                    )
                }
                Err(e) => (false, String::new(), Some(e.to_string()), None, None, None),
            };
            Some(RuntimeMessageContent::ToolResponse {
                id: resp.id.clone(),
                success,
                output,
                error,
                structured_content,
                images,
                metadata,
            })
        }
        MessageContent::ActionRequired(action) => {
            let projection =
                project_aster_action_required_message(&action.data, action.scope.as_ref());
            Some(RuntimeMessageContent::ActionRequired {
                id: projection.id,
                action_type: projection.action_type,
                data: projection.data,
                scope: projection.scope,
            })
        }
        MessageContent::Image(image) => Some(RuntimeMessageContent::Image {
            mime_type: image.mime_type.clone(),
            data: image.data.clone(),
        }),
        _ => None,
    }
}
