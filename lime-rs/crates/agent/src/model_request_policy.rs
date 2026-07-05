use crate::turn_context_configuration::AgentTurnContext;
use model_provider::provider_stream::{
    RuntimeReplyModelRequestPolicy, RuntimeReplyResponsesPolicy, RuntimeReplyToolCallPolicy,
};
use serde_json::Value;

const DEFAULT_TOOL_OUTPUT_TRUNCATION_BYTES: u64 = 10_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelRequestPolicySnapshot {
    pub source: Option<String>,
    pub provider_id: Option<String>,
    pub model_id: Option<String>,
    pub responses_policy: Option<ModelResponsesPolicySnapshot>,
    pub tool_call_policy: Option<ModelToolCallPolicySnapshot>,
    pub truncation_policy: Option<ModelTruncationPolicySnapshot>,
    pub native_tool_policy: Option<ModelNativeToolPolicySnapshot>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelResponsesPolicySnapshot {
    pub use_responses_lite: bool,
    pub request_mode: String,
    pub instructions_location: String,
    pub tools_location: String,
    pub reasoning_context: String,
    pub parallel_tool_calls_allowed: bool,
    pub requires_responses_lite_header: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelToolCallPolicySnapshot {
    pub supports_parallel_tool_calls: bool,
    pub parallel_tool_calls: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelTruncationPolicySnapshot {
    pub mode: String,
    pub limit: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelNativeToolPolicySnapshot {
    pub shell_type: Option<String>,
    pub shell_tool_enabled: bool,
    pub preferred_shell_surface: Option<String>,
    pub apply_patch_tool_type: Option<String>,
    pub apply_patch_tool_enabled: bool,
    pub experimental_supported_tools: Vec<String>,
}

pub fn model_request_policy_from_turn_context(
    context: Option<&AgentTurnContext>,
) -> Option<ModelRequestPolicySnapshot> {
    let metadata = &context?.metadata;
    [
        "runtime_options",
        "runtimeOptions",
        "aster_chat_request",
        "asterChatRequest",
        "config",
    ]
    .into_iter()
    .filter_map(|key| metadata.get(key))
    .find_map(model_request_policy_from_metadata)
    .or_else(|| {
        let value = Value::Object(serde_json::Map::from_iter(metadata.clone()));
        model_request_policy_from_metadata(&value)
    })
}

pub fn model_request_policy_from_metadata(metadata: &Value) -> Option<ModelRequestPolicySnapshot> {
    let policy = model_request_policy_value(metadata)?;
    let snapshot = ModelRequestPolicySnapshot {
        source: string_field(policy, &["source"]),
        provider_id: string_field(policy, &["provider_id", "providerId"]),
        model_id: string_field(policy, &["model_id", "modelId"]),
        responses_policy: object_field(policy, &["responses_policy", "responsesPolicy"])
            .map(responses_policy_from_value),
        tool_call_policy: object_field(policy, &["tool_call_policy", "toolCallPolicy"])
            .map(tool_call_policy_from_value),
        truncation_policy: object_field(policy, &["truncation_policy", "truncationPolicy"])
            .map(truncation_policy_from_value),
        native_tool_policy: object_field(policy, &["native_tool_policy", "nativeToolPolicy"])
            .map(native_tool_policy_from_value),
    };
    snapshot.has_policy_payload().then_some(snapshot)
}

pub fn runtime_reply_model_request_policy_from_turn_context(
    context: Option<&AgentTurnContext>,
) -> Option<RuntimeReplyModelRequestPolicy> {
    model_request_policy_from_turn_context(context)
        .and_then(|policy| runtime_reply_model_request_policy_from_snapshot(&policy))
}

pub fn runtime_reply_model_request_policy_from_metadata(
    metadata: &Value,
) -> Option<RuntimeReplyModelRequestPolicy> {
    model_request_policy_from_metadata(metadata)
        .and_then(|policy| runtime_reply_model_request_policy_from_snapshot(&policy))
}

impl ModelRequestPolicySnapshot {
    fn has_policy_payload(&self) -> bool {
        self.responses_policy.is_some()
            || self.tool_call_policy.is_some()
            || self.truncation_policy.is_some()
            || self.native_tool_policy.is_some()
    }
}

pub fn runtime_reply_model_request_policy_from_snapshot(
    snapshot: &ModelRequestPolicySnapshot,
) -> Option<RuntimeReplyModelRequestPolicy> {
    let responses = snapshot
        .responses_policy
        .as_ref()
        .map(runtime_reply_responses_policy);
    let tool_call = snapshot
        .tool_call_policy
        .as_ref()
        .map(|policy| runtime_reply_tool_call_policy(policy, responses.as_ref()));

    RuntimeReplyModelRequestPolicy::new(responses, tool_call)
}

fn runtime_reply_responses_policy(
    policy: &ModelResponsesPolicySnapshot,
) -> RuntimeReplyResponsesPolicy {
    RuntimeReplyResponsesPolicy {
        use_responses_lite: policy.use_responses_lite,
        request_mode: policy.request_mode.clone(),
        instructions_location: policy.instructions_location.clone(),
        tools_location: policy.tools_location.clone(),
        reasoning_context: policy.reasoning_context.clone(),
        parallel_tool_calls_allowed: policy.parallel_tool_calls_allowed,
        requires_responses_lite_header: policy.requires_responses_lite_header,
    }
}

fn runtime_reply_tool_call_policy(
    policy: &ModelToolCallPolicySnapshot,
    responses: Option<&RuntimeReplyResponsesPolicy>,
) -> RuntimeReplyToolCallPolicy {
    let responses_allows_parallel = responses
        .map(|policy| policy.parallel_tool_calls_allowed && !policy.use_responses_lite)
        .unwrap_or(true);

    RuntimeReplyToolCallPolicy {
        supports_parallel_tool_calls: policy.supports_parallel_tool_calls,
        parallel_tool_calls: policy.parallel_tool_calls && responses_allows_parallel,
    }
}

fn model_request_policy_value(value: &Value) -> Option<&Value> {
    direct_model_request_policy_value(value)
        .or_else(|| nested_metadata_value(value).and_then(model_request_policy_value))
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
            .find_map(model_request_policy_value)
        })
        .or_else(|| looks_like_policy_value(value).then_some(value))
}

fn direct_model_request_policy_value(value: &Value) -> Option<&Value> {
    value
        .pointer("/harness/model_request_policy")
        .or_else(|| value.pointer("/harness/modelRequestPolicy"))
        .or_else(|| value.get("model_request_policy"))
        .or_else(|| value.get("modelRequestPolicy"))
}

fn nested_metadata_value(value: &Value) -> Option<&Value> {
    value
        .get("metadata")
        .or_else(|| value.get("request_metadata"))
        .or_else(|| value.get("requestMetadata"))
}

fn looks_like_policy_value(value: &Value) -> bool {
    value.as_object().is_some_and(|object| {
        [
            "responses_policy",
            "responsesPolicy",
            "tool_call_policy",
            "toolCallPolicy",
            "truncation_policy",
            "truncationPolicy",
            "native_tool_policy",
            "nativeToolPolicy",
        ]
        .iter()
        .any(|key| object.contains_key(*key))
    })
}

fn responses_policy_from_value(value: &Value) -> ModelResponsesPolicySnapshot {
    let use_responses_lite =
        bool_field(value, &["use_responses_lite", "useResponsesLite"]).unwrap_or(false);
    ModelResponsesPolicySnapshot {
        use_responses_lite,
        request_mode: enum_field(
            value,
            &["request_mode", "requestMode"],
            &["responses", "responses_lite"],
        )
        .unwrap_or_else(|| {
            if use_responses_lite {
                "responses_lite".to_string()
            } else {
                "responses".to_string()
            }
        }),
        instructions_location: enum_field(
            value,
            &["instructions_location", "instructionsLocation"],
            &["request_field", "input_prefix"],
        )
        .unwrap_or_else(|| {
            if use_responses_lite {
                "input_prefix".to_string()
            } else {
                "request_field".to_string()
            }
        }),
        tools_location: enum_field(
            value,
            &["tools_location", "toolsLocation"],
            &["request_field", "input_prefix"],
        )
        .unwrap_or_else(|| {
            if use_responses_lite {
                "input_prefix".to_string()
            } else {
                "request_field".to_string()
            }
        }),
        reasoning_context: enum_field(
            value,
            &["reasoning_context", "reasoningContext"],
            &["default", "all_turns"],
        )
        .unwrap_or_else(|| {
            if use_responses_lite {
                "all_turns".to_string()
            } else {
                "default".to_string()
            }
        }),
        parallel_tool_calls_allowed: bool_field(
            value,
            &["parallel_tool_calls_allowed", "parallelToolCallsAllowed"],
        )
        .unwrap_or(!use_responses_lite),
        requires_responses_lite_header: bool_field(
            value,
            &[
                "requires_responses_lite_header",
                "requiresResponsesLiteHeader",
            ],
        )
        .unwrap_or(use_responses_lite),
    }
}

fn tool_call_policy_from_value(value: &Value) -> ModelToolCallPolicySnapshot {
    let supports_parallel_tool_calls = bool_field(
        value,
        &["supports_parallel_tool_calls", "supportsParallelToolCalls"],
    )
    .unwrap_or(false);
    ModelToolCallPolicySnapshot {
        supports_parallel_tool_calls,
        parallel_tool_calls: bool_field(value, &["parallel_tool_calls", "parallelToolCalls"])
            .unwrap_or(supports_parallel_tool_calls),
    }
}

fn truncation_policy_from_value(value: &Value) -> ModelTruncationPolicySnapshot {
    let inner = object_field(value, &["truncation_policy", "truncationPolicy"]).unwrap_or(value);
    ModelTruncationPolicySnapshot {
        mode: enum_field(inner, &["mode"], &["bytes", "tokens"]).unwrap_or_else(|| "bytes".into()),
        limit: positive_u64_field(inner, &["limit"])
            .unwrap_or(DEFAULT_TOOL_OUTPUT_TRUNCATION_BYTES),
    }
}

fn native_tool_policy_from_value(value: &Value) -> ModelNativeToolPolicySnapshot {
    let shell_type = enum_field(
        value,
        &["shell_type", "shellType"],
        &[
            "default",
            "local",
            "unified_exec",
            "disabled",
            "shell_command",
        ],
    );
    let preferred_shell_surface = enum_field(
        value,
        &["preferred_shell_surface", "preferredShellSurface"],
        &["shell_command", "unified_exec"],
    )
    .or_else(|| preferred_shell_surface(shell_type.as_deref()).map(str::to_string));
    let apply_patch_tool_type = enum_field(
        value,
        &["apply_patch_tool_type", "applyPatchToolType"],
        &["freeform"],
    );
    ModelNativeToolPolicySnapshot {
        shell_type,
        shell_tool_enabled: bool_field(value, &["shell_tool_enabled", "shellToolEnabled"])
            .unwrap_or(preferred_shell_surface.is_some()),
        preferred_shell_surface,
        apply_patch_tool_enabled: bool_field(
            value,
            &["apply_patch_tool_enabled", "applyPatchToolEnabled"],
        )
        .unwrap_or(apply_patch_tool_type.is_some()),
        apply_patch_tool_type,
        experimental_supported_tools: string_array_field(
            value,
            &["experimental_supported_tools", "experimentalSupportedTools"],
        ),
    }
}

fn preferred_shell_surface(shell_type: Option<&str>) -> Option<&'static str> {
    match shell_type {
        Some("default" | "local" | "shell_command") => Some("shell_command"),
        Some("unified_exec") => Some("unified_exec"),
        _ => None,
    }
}

fn object_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find(|candidate| candidate.is_object())
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .filter_map(Value::as_str)
        .map(str::trim)
        .find(|text| !text.is_empty())
        .map(ToOwned::to_owned)
}

fn bool_field(value: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_bool)
}

fn positive_u64_field(value: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .filter_map(Value::as_u64)
        .find(|limit| *limit > 0)
}

fn enum_field(value: &Value, keys: &[&str], allowed: &[&str]) -> Option<String> {
    string_field(value, keys).and_then(|text| {
        let normalized = normalize_token(&text);
        allowed.contains(&normalized.as_str()).then_some(normalized)
    })
}

fn string_array_field(value: &Value, keys: &[&str]) -> Vec<String> {
    let Some(values) = keys
        .iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_array)
    else {
        return Vec::new();
    };
    let mut tokens = values
        .iter()
        .filter_map(Value::as_str)
        .map(normalize_token)
        .filter(|token| !token.is_empty())
        .collect::<Vec<_>>();
    tokens.sort();
    tokens.dedup();
    tokens
}

fn normalize_token(value: &str) -> String {
    value.trim().replace('-', "_").to_lowercase()
}

#[cfg(test)]
mod tests;
