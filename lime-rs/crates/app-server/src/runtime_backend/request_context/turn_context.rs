use crate::trace_context::w3c_trace_context;
use crate::ExecutionRequest;
use lime_agent::{
    build_agent_turn_context, AgentTurnContext, AgentTurnContextConfigurationRequest,
};
use serde_json::{json, Value};
use std::collections::HashMap;

use super::{
    host_approval_policy, host_metadata_value, host_sandbox_policy, host_thinking_enabled,
    host_turn_config, json_pointer_string, non_empty, request_tool_policy_from_request,
    request_workspace_scope, AsterChatRequestSnapshot, RuntimeModelSelection, RuntimeSessionScope,
};

const LIME_RUNTIME_METADATA_KEY: &str = "lime_runtime";
const LIME_RUNTIME_AUTO_COMPACT_KEY: &str = "auto_compact";
const LIME_RUNTIME_TOOL_SURFACE_KEY: &str = "tool_surface";
const LIME_RUNTIME_CONTEXT_POLICY_KEY: &str = "context_policy";
const DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT: i64 = 95;
const AUTO_COMPACT_CONTEXT_WINDOW_RATIO_NUMERATOR: i64 = 9;
const AUTO_COMPACT_CONTEXT_WINDOW_RATIO_DENOMINATOR: i64 = 10;
const TRACE_METADATA_KEYS: &[&str] = &["agentUiPerformanceTrace", "agent_ui_performance_trace"];

pub(in crate::runtime_backend) fn turn_context_from_request(
    request: &ExecutionRequest,
    host_request: Option<&AsterChatRequestSnapshot>,
    scope: &RuntimeSessionScope,
    selection: &RuntimeModelSelection,
    config_metadata: Option<Value>,
) -> Option<AgentTurnContext> {
    let workspace_scope = request_workspace_scope(request, host_request);
    let mut metadata = HashMap::new();
    metadata.insert(
        "app_server_runtime_backend".to_string(),
        json!({
            "sessionId": scope.session_id,
            "threadId": scope.thread_id,
            "turnId": scope.turn_id,
            "workspaceId": scope.workspace_id,
            "workingDir": workspace_scope
                .working_dir
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            "projectRoot": workspace_scope
                .project_root
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
            "thinkingEnabled": host_request.and_then(host_thinking_enabled),
        }),
    );
    if let Some(host_metadata) = host_request.and_then(host_metadata_value) {
        metadata.insert("aster_chat_request".to_string(), host_metadata);
    }
    if request_tool_policy_from_request(host_request).allows_web_search() {
        metadata.insert("web_search_enabled".to_string(), json!(true));
        metadata.insert("webSearchEnabled".to_string(), json!(true));
    }
    if let Some(runtime_metadata) = request
        .runtime_options
        .as_ref()
        .and_then(|options| options.metadata.clone())
        .or_else(|| request.metadata.clone())
    {
        metadata.insert("runtime_options".to_string(), runtime_metadata);
    }
    if let Some(w3c_trace_context) = w3c_trace_context_metadata_from_request(request) {
        metadata.insert("w3c_trace_context".to_string(), w3c_trace_context);
    }
    if let Some(context_policy) = lime_runtime_context_policy_from_request(request) {
        merge_lime_runtime_metadata(&mut metadata, context_policy);
    }
    let request_tool_policy = request_tool_policy_from_request(host_request);
    let fast_response_tool_surface =
        super::fast_response_tool_surface_for_request(request, &request_tool_policy);
    if let Some(tool_surface) = fast_response_tool_surface.metadata_tool_surface() {
        merge_lime_runtime_metadata(
            &mut metadata,
            json!({
                LIME_RUNTIME_AUTO_COMPACT_KEY: false,
                LIME_RUNTIME_TOOL_SURFACE_KEY: tool_surface,
                "source": "fast_response_routing",
            }),
        );
    }
    if let Some(config_metadata) = config_metadata {
        metadata.insert("config".to_string(), config_metadata);
    }
    build_agent_turn_context(AgentTurnContextConfigurationRequest {
        cwd: workspace_scope.working_dir.clone(),
        model: Some(selection.model.clone()),
        effort: selection.reasoning_effort.clone(),
        approval_policy: host_request.and_then(host_approval_policy),
        sandbox_policy: host_request.and_then(host_sandbox_policy),
        collaboration_mode: collaboration_mode_from_request(request, host_request),
        user_visible_input_text: non_empty(Some(&request.input.text)),
        output_schema: output_schema_from_request(request, host_request),
        metadata,
    })
}

fn w3c_trace_context_metadata_from_request(request: &ExecutionRequest) -> Option<Value> {
    [
        request
            .runtime_options
            .as_ref()
            .and_then(|options| options.metadata.as_ref()),
        request.metadata.as_ref(),
    ]
    .into_iter()
    .flatten()
    .filter_map(Value::as_object)
    .filter_map(w3c_trace_context_metadata)
    .next()
}

fn w3c_trace_context_metadata(metadata: &serde_json::Map<String, Value>) -> Option<Value> {
    let trace = TRACE_METADATA_KEYS
        .iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(Value::as_object)?;
    let w3c = w3c_trace_context(trace)?;
    let mut payload = serde_json::Map::new();
    payload.insert("traceparent".to_string(), Value::String(w3c.traceparent));
    if let Some(tracestate) = w3c.tracestate {
        payload.insert("tracestate".to_string(), Value::String(tracestate));
    }
    Some(Value::Object(payload))
}

fn merge_lime_runtime_metadata(metadata: &mut HashMap<String, Value>, patch: Value) {
    let Some(patch_object) = patch.as_object() else {
        return;
    };
    if patch_object.is_empty() {
        return;
    }

    let runtime = metadata
        .entry(LIME_RUNTIME_METADATA_KEY.to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));
    if !runtime.is_object() {
        *runtime = Value::Object(serde_json::Map::new());
    }
    let runtime_object = runtime.as_object_mut().expect("lime_runtime object");
    for (key, value) in patch_object {
        runtime_object.insert(key.clone(), value.clone());
    }
}

fn lime_runtime_context_policy_from_request(request: &ExecutionRequest) -> Option<Value> {
    [
        request
            .runtime_options
            .as_ref()
            .and_then(|options| options.metadata.as_ref()),
        request.metadata.as_ref(),
    ]
    .into_iter()
    .flatten()
    .find_map(lime_runtime_context_policy_from_metadata)
}

fn lime_runtime_context_policy_from_metadata(metadata: &Value) -> Option<Value> {
    let policy = [
        "/harness/model_request_policy/context_policy",
        "/harness/modelRequestPolicy/contextPolicy",
        "/model_request_policy/context_policy",
        "/modelRequestPolicy/contextPolicy",
    ]
    .into_iter()
    .find_map(|pointer| metadata.pointer(pointer))?;

    let context_window = positive_i64_field(policy, &["context_window", "contextWindow"]);
    let max_context_window =
        positive_i64_field(policy, &["max_context_window", "maxContextWindow"]);
    let resolved_context_window = positive_i64_field(
        policy,
        &["resolved_context_window", "resolvedContextWindow"],
    )
    .or(context_window)
    .or(max_context_window);
    let effective_context_window_percent = positive_i64_field(
        policy,
        &[
            "effective_context_window_percent",
            "effectiveContextWindowPercent",
        ],
    )
    .filter(|percent| *percent <= 100)
    .unwrap_or(DEFAULT_EFFECTIVE_CONTEXT_WINDOW_PERCENT);
    let model_context_window =
        positive_i64_field(policy, &["model_context_window", "modelContextWindow"]).or_else(|| {
            resolved_context_window
                .map(|window| window.saturating_mul(effective_context_window_percent) / 100)
        });
    let auto_compact_token_limit = positive_i64_field(
        policy,
        &["auto_compact_token_limit", "autoCompactTokenLimit"],
    )
    .map(|limit| {
        resolved_context_window.map_or(limit, |window| {
            let max_limit = window.saturating_mul(AUTO_COMPACT_CONTEXT_WINDOW_RATIO_NUMERATOR)
                / AUTO_COMPACT_CONTEXT_WINDOW_RATIO_DENOMINATOR;
            limit.min(max_limit)
        })
    })
    .or_else(|| {
        resolved_context_window.map(|window| {
            window.saturating_mul(AUTO_COMPACT_CONTEXT_WINDOW_RATIO_NUMERATOR)
                / AUTO_COMPACT_CONTEXT_WINDOW_RATIO_DENOMINATOR
        })
    });

    if resolved_context_window.is_none()
        && model_context_window.is_none()
        && auto_compact_token_limit.is_none()
    {
        return None;
    }

    let mut context_policy = serde_json::Map::new();
    context_policy.insert("source".to_string(), json!("model_request_policy"));
    if let Some(value) = context_window {
        context_policy.insert("context_window".to_string(), json!(value));
    }
    if let Some(value) = max_context_window {
        context_policy.insert("max_context_window".to_string(), json!(value));
    }
    if let Some(value) = resolved_context_window {
        context_policy.insert("resolved_context_window".to_string(), json!(value));
    }
    context_policy.insert(
        "effective_context_window_percent".to_string(),
        json!(effective_context_window_percent),
    );
    if let Some(value) = model_context_window {
        context_policy.insert("model_context_window".to_string(), json!(value));
    }
    if let Some(value) = auto_compact_token_limit {
        context_policy.insert("auto_compact_token_limit".to_string(), json!(value));
    }

    let mut runtime = serde_json::Map::new();
    runtime.insert(
        LIME_RUNTIME_CONTEXT_POLICY_KEY.to_string(),
        Value::Object(context_policy),
    );
    if let Some(value) = model_context_window {
        runtime.insert("model_context_window".to_string(), json!(value));
    }
    if let Some(value) = auto_compact_token_limit {
        runtime.insert("auto_compact_token_limit".to_string(), json!(value));
    }

    Some(Value::Object(runtime))
}

fn output_schema_from_request(
    request: &ExecutionRequest,
    host_request: Option<&AsterChatRequestSnapshot>,
) -> Option<Value> {
    request
        .output_schema
        .clone()
        .or_else(|| {
            request
                .structured_output
                .as_ref()
                .and_then(|value| value.schema.clone())
        })
        .or_else(|| output_schema_from_expected_output(request.expected_output.as_ref()))
        .or_else(|| {
            request
                .runtime_options
                .as_ref()
                .and_then(|options| options.output_schema.clone())
        })
        .or_else(|| {
            request
                .runtime_options
                .as_ref()
                .and_then(|options| options.structured_output.as_ref())
                .and_then(|value| value.schema.clone())
        })
        .or_else(|| {
            request.runtime_options.as_ref().and_then(|options| {
                output_schema_from_expected_output(options.expected_output.as_ref())
            })
        })
        .or_else(|| host_request.and_then(host_output_schema).cloned())
}

fn collaboration_mode_from_request(
    request: &ExecutionRequest,
    host_request: Option<&AsterChatRequestSnapshot>,
) -> Option<String> {
    host_request
        .and_then(host_turn_config)
        .and_then(|turn_config| collaboration_mode_from_metadata(turn_config.metadata.as_ref()))
        .or_else(|| {
            host_request.and_then(|host| collaboration_mode_from_metadata(host.metadata.as_ref()))
        })
        .or_else(|| {
            request
                .runtime_options
                .as_ref()
                .and_then(|options| collaboration_mode_from_metadata(options.metadata.as_ref()))
        })
        .or_else(|| collaboration_mode_from_metadata(request.metadata.as_ref()))
}

fn collaboration_mode_from_metadata(metadata: Option<&Value>) -> Option<String> {
    let metadata = metadata?;
    json_pointer_string(
        metadata,
        &[
            "/collaboration_mode",
            "/collaborationMode",
            "/harness/collaboration_mode/mode",
            "/harness/collaborationMode/mode",
            "/harness/collaboration_mode",
            "/harness/collaborationMode",
            "/turn_config/collaboration_mode",
            "/turnConfig/collaborationMode",
        ],
    )
    .map(|value| match value.as_str() {
        "planning" => "plan".to_string(),
        _ => value,
    })
}

fn positive_i64_field(value: &Value, keys: &[&str]) -> Option<i64> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(|field| {
            field
                .as_i64()
                .or_else(|| field.as_u64().and_then(|value| i64::try_from(value).ok()))
                .filter(|value| *value > 0)
        })
}

fn host_output_schema(host: &AsterChatRequestSnapshot) -> Option<&Value> {
    host_turn_config(host)
        .and_then(|turn_config| turn_config.output_schema.as_ref())
        .or_else(|| {
            host_turn_config(host)
                .and_then(|turn_config| turn_config.structured_output.as_ref())
                .and_then(output_schema_from_structured_output_value)
        })
        .or_else(|| {
            host_turn_config(host)
                .and_then(|turn_config| turn_config.expected_output.as_ref())
                .and_then(output_schema_from_expected_output_value)
        })
        .or(host.output_schema.as_ref())
        .or_else(|| {
            host.structured_output
                .as_ref()
                .and_then(output_schema_from_structured_output_value)
        })
        .or_else(|| {
            host.expected_output
                .as_ref()
                .and_then(output_schema_from_expected_output_value)
        })
}

fn output_schema_from_structured_output_value(value: &Value) -> Option<&Value> {
    value
        .get("schema")
        .or_else(|| value.get("outputSchema"))
        .or_else(|| value.get("output_schema"))
}

fn output_schema_from_expected_output(value: Option<&Value>) -> Option<Value> {
    output_schema_from_expected_output_value(value?).cloned()
}

fn output_schema_from_expected_output_value(value: &Value) -> Option<&Value> {
    if let Some(schema) = value
        .get("outputFormat")
        .or_else(|| value.get("output_format"))
        .and_then(output_schema_from_output_format)
    {
        return Some(schema);
    }
    output_schema_from_output_format(value)
}

fn output_schema_from_output_format(value: &Value) -> Option<&Value> {
    value
        .get("schema")
        .or_else(|| value.get("outputSchema"))
        .or_else(|| value.get("output_schema"))
}
