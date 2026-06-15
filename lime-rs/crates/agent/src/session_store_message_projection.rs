//! Agent 会话消息到运行时协议的投影。

use crate::protocol::{
    AgentMessage as RuntimeAgentMessage, AgentMessageContent as RuntimeAgentMessageContent,
};
use crate::tool_io_offload::{
    HistoryToolIoEvictionPlan, ToolOutputOffload, build_history_tool_io_eviction_plan_for_model,
    force_offload_plain_tool_output_for_history, force_offload_tool_arguments_for_history,
    maybe_offload_plain_tool_output, maybe_offload_tool_arguments,
};
use lime_core::agent::types::{AgentMessage, ContentPart, MessageContent};

pub(super) fn parse_tool_call_arguments(arguments: &str) -> serde_json::Value {
    let trimmed = arguments.trim();
    if trimmed.is_empty() {
        return serde_json::json!({});
    }

    serde_json::from_str::<serde_json::Value>(trimmed)
        .unwrap_or_else(|_| serde_json::json!({ "raw": arguments }))
}

fn parse_data_url(url: &str) -> Option<(String, String)> {
    let trimmed = url.trim();
    let payload = trimmed.strip_prefix("data:")?;
    let (meta, data) = payload.split_once(',')?;
    if data.trim().is_empty() {
        return None;
    }

    let mut segments = meta.split(';');
    let mime_type = segments.next().unwrap_or_default().trim();
    let has_base64 = segments.any(|segment| segment.eq_ignore_ascii_case("base64"));

    if !has_base64 {
        return None;
    }

    let normalized_mime = if mime_type.is_empty() {
        "application/octet-stream".to_string()
    } else {
        mime_type.to_string()
    };

    Some((normalized_mime, data.trim().to_string()))
}

fn convert_image_part(image_url: &str) -> Option<RuntimeAgentMessageContent> {
    let normalized = image_url.trim();
    if normalized.is_empty() {
        return None;
    }

    if let Some((mime_type, data)) = parse_data_url(normalized) {
        return Some(RuntimeAgentMessageContent::Image { mime_type, data });
    }

    if normalized.starts_with("data:") {
        return Some(RuntimeAgentMessageContent::Text {
            text: "[图片消息]".to_string(),
        });
    }

    Some(RuntimeAgentMessageContent::Text {
        text: format!("![image]({normalized})"),
    })
}

/// 将 AgentMessage 转换为运行时协议消息
#[cfg(test)]
pub(super) fn convert_agent_messages(
    messages: &[AgentMessage],
    model_name: Option<&str>,
) -> Vec<RuntimeAgentMessage> {
    convert_agent_messages_with_history_eviction(messages, model_name, true)
}

pub(super) fn convert_agent_messages_with_history_eviction(
    messages: &[AgentMessage],
    model_name: Option<&str>,
    use_history_eviction_plan: bool,
) -> Vec<RuntimeAgentMessage> {
    let eviction_plan = if use_history_eviction_plan {
        build_history_tool_io_eviction_plan_for_model(messages, model_name)
    } else {
        HistoryToolIoEvictionPlan::default()
    };
    messages
        .iter()
        .map(|message| {
            convert_agent_message_with_options(message, &eviction_plan, use_history_eviction_plan)
        })
        .collect()
}

pub(super) fn convert_user_visible_agent_messages_with_flags(
    messages: &[AgentMessage],
    user_visible_flags: &[bool],
    model_name: Option<&str>,
    use_history_eviction_plan: bool,
) -> Vec<RuntimeAgentMessage> {
    if messages.len() != user_visible_flags.len() {
        tracing::warn!(
            "[SessionStore] user_visible 过滤失败，消息条数不一致: messages={}, flags={}",
            messages.len(),
            user_visible_flags.len()
        );
        return convert_agent_messages_with_history_eviction(
            messages,
            model_name,
            use_history_eviction_plan,
        );
    }

    let filtered = messages
        .iter()
        .zip(user_visible_flags.iter())
        .filter_map(|(message, user_visible)| (*user_visible).then_some(message.clone()))
        .collect::<Vec<_>>();

    convert_agent_messages_with_history_eviction(&filtered, model_name, use_history_eviction_plan)
}

#[cfg(test)]
pub(super) fn convert_user_visible_agent_messages(
    messages: &[AgentMessage],
    persisted_messages: &[aster::conversation::message::Message],
    model_name: Option<&str>,
) -> Vec<RuntimeAgentMessage> {
    if messages.len() != persisted_messages.len() {
        tracing::warn!(
            "[SessionStore] user_visible 过滤失败，消息条数不一致: core={}, aster={}",
            messages.len(),
            persisted_messages.len()
        );
        return convert_agent_messages(messages, model_name);
    }

    let filtered = messages
        .iter()
        .zip(persisted_messages.iter())
        .filter_map(|(message, persisted)| persisted.is_user_visible().then_some(message.clone()))
        .collect::<Vec<_>>();

    convert_agent_messages(&filtered, model_name)
}

#[cfg(test)]
pub(super) fn convert_agent_message(
    message: &AgentMessage,
    eviction_plan: &HistoryToolIoEvictionPlan,
) -> RuntimeAgentMessage {
    convert_agent_message_with_options(message, eviction_plan, true)
}

fn convert_agent_message_with_options(
    message: &AgentMessage,
    eviction_plan: &HistoryToolIoEvictionPlan,
    use_dynamic_tool_io_offload: bool,
) -> RuntimeAgentMessage {
    let mut content = match &message.content {
        MessageContent::Text(text) => {
            if text.trim().is_empty() {
                Vec::new()
            } else {
                vec![RuntimeAgentMessageContent::Text { text: text.clone() }]
            }
        }
        MessageContent::Parts(parts) => parts
            .iter()
            .filter_map(|part| match part {
                ContentPart::Text { text } => {
                    if text.trim().is_empty() {
                        None
                    } else {
                        Some(RuntimeAgentMessageContent::Text { text: text.clone() })
                    }
                }
                ContentPart::ImageUrl { image_url } => convert_image_part(&image_url.url),
            })
            .collect(),
    };

    // 添加 reasoning_content 作为 thinking 类型
    if let Some(reasoning) = &message.reasoning_content {
        content.insert(
            0,
            RuntimeAgentMessageContent::Thinking {
                text: reasoning.clone(),
            },
        );
    }

    if let Some(tool_calls) = &message.tool_calls {
        for call in tool_calls {
            let parsed_arguments = parse_tool_call_arguments(&call.function.arguments);
            let arguments = if eviction_plan.request_ids.contains(&call.id) {
                force_offload_tool_arguments_for_history(&call.id, &parsed_arguments)
            } else if use_dynamic_tool_io_offload {
                maybe_offload_tool_arguments(&call.id, &parsed_arguments)
            } else {
                parsed_arguments
            };
            content.push(RuntimeAgentMessageContent::ToolRequest {
                id: call.id.clone(),
                tool_name: call.function.name.clone(),
                arguments,
            });
        }
    }

    if let Some(tool_call_id) = &message.tool_call_id {
        let tool_output = message.content.as_text();
        let offloaded = if eviction_plan.response_ids.contains(tool_call_id) {
            force_offload_plain_tool_output_for_history(tool_call_id, &tool_output, None)
        } else if use_dynamic_tool_io_offload {
            maybe_offload_plain_tool_output(tool_call_id, &tool_output, None)
        } else {
            ToolOutputOffload {
                output: tool_output,
                metadata: std::collections::HashMap::new(),
            }
        };

        // tool/user 的工具结果协议消息都不应作为普通文本重复渲染。
        if message.role.eq_ignore_ascii_case("tool") || message.role.eq_ignore_ascii_case("user") {
            content.retain(|part| !matches!(part, RuntimeAgentMessageContent::Text { .. }));
        }

        content.push(RuntimeAgentMessageContent::ToolResponse {
            id: tool_call_id.clone(),
            success: true,
            output: offloaded.output,
            error: None,
            images: None,
            metadata: if offloaded.metadata.is_empty() {
                None
            } else {
                Some(offloaded.metadata)
            },
        });
    }

    let timestamp = chrono::DateTime::parse_from_rfc3339(&message.timestamp)
        .map(|dt| dt.timestamp())
        .unwrap_or(0);

    let result = RuntimeAgentMessage {
        id: None,
        role: message.role.clone(),
        content,
        timestamp,
        usage: message
            .usage
            .as_ref()
            .map(|usage| crate::protocol::AgentTokenUsage {
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
                cached_input_tokens: usage.cached_input_tokens,
                cache_creation_input_tokens: usage.cache_creation_input_tokens,
            }),
    };

    // 调试日志
    tracing::debug!(
        "[SessionStore] 转换消息: role={}, content_items={}",
        result.role,
        result.content.len()
    );

    result
}
