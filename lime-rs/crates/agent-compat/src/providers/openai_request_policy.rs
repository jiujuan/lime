use super::formats::openai_responses::ResponsesRequestPolicy;
use serde_json::{Map, Value};

const PROVIDER_REQUEST_WIRE_SHAPE_KEY: &str = "provider_request_wire_shape";
const PROVIDER_REQUEST_WIRE_SHAPE_CAMEL_KEY: &str = "providerRequestWireShape";

pub(super) fn resolve_responses_request_policy_from_turn_context() -> ResponsesRequestPolicy {
    let Some(turn_context) = crate::session_context::current_turn_context() else {
        return ResponsesRequestPolicy::default();
    };
    let metadata = Value::Object(Map::from_iter(turn_context.metadata));

    provider_request_wire_shape_value(&metadata)
        .and_then(responses_request_policy_from_provider_wire_shape)
        .or_else(|| {
            model_request_policy_value(&metadata)
                .and_then(responses_request_policy_from_model_policy)
        })
        .unwrap_or_default()
}

fn responses_request_policy_from_provider_wire_shape(
    value: &Value,
) -> Option<ResponsesRequestPolicy> {
    if !has_any_key(
        value,
        &[
            "use_responses_lite",
            "useResponsesLite",
            "reasoning_context",
            "reasoningContext",
            "reasoning_summary",
            "reasoningSummary",
            "text_verbosity",
            "textVerbosity",
            "parallel_tool_calls",
            "parallelToolCalls",
            "requires_responses_lite_header",
            "requiresResponsesLiteHeader",
            "headers",
        ],
    ) {
        return None;
    }

    let use_responses_lite =
        bool_field(value, &["use_responses_lite", "useResponsesLite"]).unwrap_or(false);
    let reasoning_context = enum_string_field(
        value,
        &["reasoning_context", "reasoningContext"],
        &["default", "all_turns"],
    )
    .or_else(|| use_responses_lite.then(|| "all_turns".to_string()));
    let reasoning_summary = reasoning_summary_field(
        value,
        &[
            "reasoning_summary",
            "reasoningSummary",
            "default_reasoning_summary",
            "defaultReasoningSummary",
        ],
    );
    let text_verbosity = enum_string_field(
        value,
        &[
            "text_verbosity",
            "textVerbosity",
            "default_verbosity",
            "defaultVerbosity",
        ],
        &["low", "medium", "high"],
    );
    let parallel_tool_calls = bool_field(value, &["parallel_tool_calls", "parallelToolCalls"]);
    let has_responses_lite_header = headers_include_responses_lite(value);
    let requires_responses_lite_header = bool_field(
        value,
        &[
            "requires_responses_lite_header",
            "requiresResponsesLiteHeader",
        ],
    )
    .unwrap_or(has_responses_lite_header || use_responses_lite)
        || has_responses_lite_header;

    Some(ResponsesRequestPolicy {
        use_responses_lite,
        reasoning_context,
        reasoning_summary,
        text_verbosity,
        parallel_tool_calls,
        requires_responses_lite_header,
    })
}

fn responses_request_policy_from_model_policy(policy: &Value) -> Option<ResponsesRequestPolicy> {
    let responses_policy = object_field(policy, &["responses_policy", "responsesPolicy"]);
    let tool_call_policy = object_field(policy, &["tool_call_policy", "toolCallPolicy"]);
    let reasoning_output_policy = object_field(
        policy,
        &["reasoning_output_policy", "reasoningOutputPolicy"],
    );

    if responses_policy.is_none() && tool_call_policy.is_none() && reasoning_output_policy.is_none()
    {
        return None;
    }

    let use_responses_lite = bool_field(
        responses_policy.unwrap_or(policy),
        &["use_responses_lite", "useResponsesLite"],
    )
    .unwrap_or(false);
    let reasoning_context = enum_string_field(
        responses_policy.unwrap_or(policy),
        &["reasoning_context", "reasoningContext"],
        &["default", "all_turns"],
    )
    .or_else(|| use_responses_lite.then(|| "all_turns".to_string()));
    let parallel_tool_calls_allowed = bool_field(
        responses_policy.unwrap_or(policy),
        &["parallel_tool_calls_allowed", "parallelToolCallsAllowed"],
    )
    .unwrap_or(!use_responses_lite);
    let requires_responses_lite_header = bool_field(
        responses_policy.unwrap_or(policy),
        &[
            "requires_responses_lite_header",
            "requiresResponsesLiteHeader",
        ],
    )
    .unwrap_or(use_responses_lite);
    let responses_allows_parallel = parallel_tool_calls_allowed && !use_responses_lite;
    let parallel_tool_calls = tool_call_policy.map(|tool_call_policy| {
        let supports_parallel_tool_calls = bool_field(
            tool_call_policy,
            &["supports_parallel_tool_calls", "supportsParallelToolCalls"],
        )
        .unwrap_or(false);
        bool_field(
            tool_call_policy,
            &["parallel_tool_calls", "parallelToolCalls"],
        )
        .unwrap_or(supports_parallel_tool_calls)
            && responses_allows_parallel
    });
    let reasoning_summary = reasoning_output_policy.and_then(|policy| {
        reasoning_summary_field(
            policy,
            &["default_reasoning_summary", "defaultReasoningSummary"],
        )
    });
    let text_verbosity =
        reasoning_output_policy.and_then(text_verbosity_from_reasoning_output_policy);

    Some(ResponsesRequestPolicy {
        use_responses_lite,
        reasoning_context,
        reasoning_summary,
        text_verbosity,
        parallel_tool_calls,
        requires_responses_lite_header,
    })
}

fn provider_request_wire_shape_value(value: &Value) -> Option<&Value> {
    value
        .get(PROVIDER_REQUEST_WIRE_SHAPE_KEY)
        .or_else(|| value.get(PROVIDER_REQUEST_WIRE_SHAPE_CAMEL_KEY))
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
            "reasoning_output_policy",
            "reasoningOutputPolicy",
        ]
        .iter()
        .any(|key| object.contains_key(*key))
    })
}

fn has_any_key(value: &Value, keys: &[&str]) -> bool {
    value
        .as_object()
        .is_some_and(|object| keys.iter().any(|key| object.contains_key(*key)))
}

fn object_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter()
        .find_map(|key| value.get(*key).filter(|candidate| candidate.is_object()))
}

fn bool_field(value: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter().find_map(|key| value.get(*key)?.as_bool())
}

fn enum_string_field(value: &Value, keys: &[&str], allowed: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key)?.as_str())
        .map(str::trim)
        .find(|value| allowed.iter().any(|allowed| *value == *allowed))
        .map(str::to_string)
}

fn reasoning_summary_field(value: &Value, keys: &[&str]) -> Option<String> {
    enum_string_field(value, keys, &["auto", "concise", "detailed", "none"])
        .filter(|summary| summary != "none")
}

fn text_verbosity_from_reasoning_output_policy(value: &Value) -> Option<String> {
    let supports_verbosity =
        bool_field(value, &["support_verbosity", "supportVerbosity"]).unwrap_or(false);
    let can_set_verbosity =
        bool_field(value, &["can_set_verbosity", "canSetVerbosity"]).unwrap_or(supports_verbosity);
    if !(supports_verbosity && can_set_verbosity) {
        return None;
    }

    enum_string_field(
        value,
        &["default_verbosity", "defaultVerbosity"],
        &["low", "medium", "high"],
    )
}

fn headers_include_responses_lite(value: &Value) -> bool {
    value
        .get("headers")
        .and_then(Value::as_array)
        .is_some_and(|headers| headers.iter().any(is_responses_lite_header))
}

fn is_responses_lite_header(header: &Value) -> bool {
    let Some(object) = header.as_object() else {
        return false;
    };
    let name_matches = object
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .is_some_and(|name| {
            name.eq_ignore_ascii_case(ResponsesRequestPolicy::RESPONSES_LITE_HEADER_NAME)
        });
    let value_matches = object
        .get("value")
        .and_then(Value::as_str)
        .map(str::trim)
        .is_some_and(|value| {
            value.eq_ignore_ascii_case(ResponsesRequestPolicy::RESPONSES_LITE_HEADER_VALUE)
        });

    name_matches && value_matches
}
