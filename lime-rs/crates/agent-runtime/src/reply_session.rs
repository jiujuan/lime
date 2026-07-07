//! Reply start 前的 current session metadata 准备规则。
//!
//! 这里不持有 provider/backend 具体实现；Aster 只能在 compat adapter 内消费这些
//! current metadata。

use crate::session_config::AgentSessionConfig;
use model_provider::provider_stream::{
    RuntimeReplyProviderRequestWireShape, RuntimeReplyStreamRequest,
};

pub const TOOL_SCOPE_METADATA_KEY: &str = "tool_scope";
pub const DISALLOWED_TOOLS_METADATA_KEY: &str = "disallowed_tools";

pub fn attach_reply_disallowed_tools<I, S>(
    session_config: &mut AgentSessionConfig,
    disallowed_tools: I,
) where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut disallowed_tools = disallowed_tools.into_iter().peekable();
    if disallowed_tools.peek().is_none() {
        return;
    }

    let turn_context = session_config
        .turn_context
        .get_or_insert_with(Default::default);
    let tool_scope = turn_context
        .metadata
        .entry(TOOL_SCOPE_METADATA_KEY.to_string())
        .or_insert_with(|| serde_json::json!({}));
    if !tool_scope.is_object() {
        *tool_scope = serde_json::json!({});
    }
    let Some(scope_object) = tool_scope.as_object_mut() else {
        return;
    };
    let disallowed_value = scope_object
        .entry(DISALLOWED_TOOLS_METADATA_KEY.to_string())
        .or_insert_with(|| serde_json::json!([]));
    if !disallowed_value.is_array() {
        *disallowed_value = serde_json::json!([]);
    }
    let Some(disallowed_array) = disallowed_value.as_array_mut() else {
        return;
    };
    for tool_name in disallowed_tools {
        let tool_name = tool_name.as_ref();
        if disallowed_array.iter().any(|item| {
            item.as_str()
                .is_some_and(|existing| existing.eq_ignore_ascii_case(tool_name))
        }) {
            continue;
        }
        disallowed_array.push(serde_json::Value::String(tool_name.to_string()));
    }
}

pub fn attach_reply_provider_wire_shape(
    session_config: &mut AgentSessionConfig,
    stream_request: &RuntimeReplyStreamRequest,
) -> bool {
    if stream_request.model_request_policy.is_none() {
        return false;
    }
    let wire_shape = stream_request.provider_request_wire_shape();
    let Ok(value) = serde_json::to_value(wire_shape) else {
        return false;
    };
    session_config
        .turn_context
        .get_or_insert_with(Default::default)
        .metadata
        .insert(
            RuntimeReplyProviderRequestWireShape::TURN_CONTEXT_METADATA_KEY.to_string(),
            value,
        );
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session_config::SessionConfigBuilder;
    use model_provider::provider_stream::{
        RuntimeReplyInputKind, RuntimeReplyModelRequestPolicy, RuntimeReplyResponsesPolicy,
        RuntimeReplyStreamRequest,
    };

    #[test]
    fn reply_disallowed_tools_merges_without_case_duplicates() {
        let mut session_config = SessionConfigBuilder::new("session-1").build();

        attach_reply_disallowed_tools(&mut session_config, ["Bash", "PowerShell"]);
        attach_reply_disallowed_tools(&mut session_config, ["bash", "apply_patch"]);

        let metadata = session_config
            .turn_context
            .as_ref()
            .expect("turn context")
            .metadata
            .get(TOOL_SCOPE_METADATA_KEY)
            .expect("tool scope");

        assert_eq!(
            metadata
                .get(DISALLOWED_TOOLS_METADATA_KEY)
                .expect("disallowed tools"),
            &serde_json::json!(["Bash", "PowerShell", "apply_patch"])
        );
    }

    #[test]
    fn reply_provider_wire_shape_attaches_model_request_policy_metadata() {
        let mut session_config = SessionConfigBuilder::new("session-1").build();
        let policy = RuntimeReplyModelRequestPolicy::new(
            Some(RuntimeReplyResponsesPolicy {
                use_responses_lite: true,
                request_mode: "responses".to_string(),
                instructions_location: "request".to_string(),
                tools_location: "request".to_string(),
                reasoning_context: "keep".to_string(),
                parallel_tool_calls_allowed: true,
                requires_responses_lite_header: true,
            }),
            None,
            None,
        );
        let stream_request = RuntimeReplyStreamRequest::new(
            "session-1",
            RuntimeReplyInputKind::UserMessage,
            4,
            None,
        )
        .with_model_request_policy(policy);

        assert!(attach_reply_provider_wire_shape(
            &mut session_config,
            &stream_request
        ));

        let metadata = &session_config
            .turn_context
            .as_ref()
            .expect("turn context")
            .metadata;
        assert!(
            metadata.contains_key(RuntimeReplyProviderRequestWireShape::TURN_CONTEXT_METADATA_KEY)
        );
    }

    #[test]
    fn reply_provider_wire_shape_skips_empty_policy() {
        let mut session_config = SessionConfigBuilder::new("session-1").build();
        let stream_request = RuntimeReplyStreamRequest::new(
            "session-1",
            RuntimeReplyInputKind::UserMessage,
            4,
            None,
        );

        assert!(!attach_reply_provider_wire_shape(
            &mut session_config,
            &stream_request
        ));
        assert!(session_config.turn_context.is_none());
    }
}
