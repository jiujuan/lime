use super::{workflow_run_id, ImageCommandIntent};
use crate::runtime::memory_prompt::append_soul_context_to_system_prompt;
use crate::runtime_backend::{
    aster_provider_protocol_from_route, backend_error, current_agent_runtime_config_metadata,
    direct_provider_config_from_request, initialize_runtime_database, model_route_resolver,
    provider_config_from_pool, provider_config_with_route_protocol, request_context,
    selection_with_effective_reasoning,
};
use crate::{ExecutionRequest, RuntimeCoreError};
use aster::session::TurnOutputSchemaSource;
use lime_agent::{
    resolve_request_tool_policy_with_mode, stream_reply_with_policy,
    AgentEvent as RuntimeAgentEvent, RequestToolPolicyMode, SessionConfigBuilder,
};
use serde_json::{json, Map, Value};

const PRESENTATION_SCHEMA_VERSION: &str = "image_task_presentation.v1";
const PRESENTATION_SOURCE: &str = "model_generated";
const MAX_INTRO_CHARS: usize = 180;
const MAX_CAPTION_CHARS: usize = 220;

#[derive(Debug, Clone, PartialEq)]
pub(super) struct GeneratedImageTaskPresentation {
    pub(super) assistant_intro: Option<String>,
    pub(super) completion_caption: Option<String>,
    pub(super) payload: Value,
}

pub(super) async fn generate_image_task_presentation(
    runtime_backend: &super::super::RuntimeBackend,
    request: &ExecutionRequest,
    intent: &ImageCommandIntent,
) -> Result<Option<GeneratedImageTaskPresentation>, RuntimeCoreError> {
    let db = initialize_runtime_database(runtime_backend.db.as_ref())?;
    let requested_selection = request_context::resolve_runtime_model_selection(request)?;
    let effective_requested_selection = selection_with_effective_reasoning(&requested_selection);
    let host_request = request_context::aster_chat_request_from_request(request);
    let direct_provider_config = direct_provider_config_from_request(
        host_request.as_ref(),
        &effective_requested_selection,
        effective_requested_selection.reasoning_effort.clone(),
    );
    let route_resolution = model_route_resolver::resolve_chat_model_route(
        &db,
        &runtime_backend.api_key_provider_service,
        request,
        &effective_requested_selection,
        direct_provider_config.as_ref(),
    )
    .await
    .map_err(backend_error)?;
    let selection = selection_with_effective_reasoning(&route_resolution.selection);
    if let Some(route_failure) = route_resolution.resolved_route.failure.as_ref() {
        return Err(RuntimeCoreError::Backend(format!(
            "image task presentation route unavailable: {}",
            route_failure.reason_code
        )));
    }

    let presentation_session_id = presentation_session_id(intent);
    let provider_config = if let Some(provider_config) = direct_provider_config {
        let provider_config = provider_config_with_route_protocol(
            provider_config,
            aster_provider_protocol_from_route(&route_resolution.resolved_route.protocol),
        );
        runtime_backend
            .agent_state
            .configure_provider(provider_config.clone(), &presentation_session_id, &db)
            .await
            .map_err(backend_error)?;
        provider_config
    } else {
        provider_config_from_pool(
            &runtime_backend.agent_state,
            &db,
            &selection.provider,
            &selection.model,
            &presentation_session_id,
            selection.reasoning_effort.clone(),
            aster_provider_protocol_from_route(&route_resolution.resolved_route.protocol),
        )
        .await
        .map_err(backend_error)?
    };

    let config_metadata = current_agent_runtime_config_metadata();
    let mut turn_context = request_context::turn_context_from_request(
        request,
        host_request.as_ref(),
        &intent.scope,
        &selection,
        config_metadata.clone(),
    )
    .unwrap_or_default();
    turn_context.output_schema = Some(presentation_output_schema());
    turn_context.output_schema_source = Some(TurnOutputSchemaSource::Turn);
    turn_context.user_visible_input_text = intent
        .raw_text
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| Some(intent.prompt.clone()));
    turn_context.metadata.insert(
        "lime_runtime".to_string(),
        json!({
            "auto_compact": false,
            "tool_surface": "direct_answer",
            "source": "image_command_presentation",
        }),
    );
    turn_context.metadata.insert(
        "image_command_presentation".to_string(),
        json!({
            "schema": PRESENTATION_SCHEMA_VERSION,
            "workflow_run_id": workflow_run_id(&intent.scope),
            "mode": intent.mode,
            "entry_source": intent.entry_source,
            "provider": provider_config
                .provider_selector
                .as_deref()
                .unwrap_or(&selection.provider),
            "model": provider_config.model_name,
        }),
    );

    let system_prompt = append_soul_context_to_system_prompt(
        Some(presentation_system_prompt()),
        config_metadata.as_ref(),
    )
    .unwrap_or_else(presentation_system_prompt);
    let session_config = SessionConfigBuilder::new(presentation_session_id)
        .thread_id(format!("{}:image-presentation", intent.scope.thread_id))
        .turn_id(format!("{}:image-presentation", intent.scope.turn_id))
        .system_prompt(system_prompt)
        .include_context_trace(false)
        .turn_context(turn_context)
        .build();
    let request_tool_policy =
        resolve_request_tool_policy_with_mode(Some(false), Some(RequestToolPolicyMode::Disabled));
    let agent_arc = runtime_backend.agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard.as_ref().ok_or_else(|| {
        RuntimeCoreError::Backend(
            "App Server image presentation failed to initialize Aster agent".to_string(),
        )
    })?;
    let mut model_text = String::new();
    let execution_result = stream_reply_with_policy(
        agent,
        &presentation_user_prompt(intent),
        None,
        session_config,
        None,
        &request_tool_policy,
        |event| collect_model_text(event, &mut model_text),
    )
    .await;
    execution_result.map_err(|error| RuntimeCoreError::Backend(error.message))?;

    Ok(parse_generated_presentation(
        &model_text,
        &selection.provider,
        &selection.model,
    ))
}

pub(super) fn merge_generated_presentation(
    existing: Option<Value>,
    generated: &GeneratedImageTaskPresentation,
) -> Option<Value> {
    let mut merged = existing
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    if let Some(generated_object) = generated.payload.as_object() {
        for (key, value) in generated_object {
            merged.insert(key.clone(), value.clone());
        }
    }
    Some(Value::Object(merged))
}

fn collect_model_text(event: &RuntimeAgentEvent, output: &mut String) {
    match event {
        RuntimeAgentEvent::TextDelta { text } => output.push_str(text),
        RuntimeAgentEvent::TextDeltaBatch { text, .. } => output.push_str(text),
        _ => {}
    }
}

fn parse_generated_presentation(
    raw_text: &str,
    provider: &str,
    model: &str,
) -> Option<GeneratedImageTaskPresentation> {
    let value = parse_json_object(raw_text)?;
    let assistant_intro = sanitize_user_visible_copy(
        string_field(&value, &["assistant_intro", "assistantIntro", "intro"]).as_deref(),
        MAX_INTRO_CHARS,
    );
    let result_captions = value.get("result_captions").and_then(Value::as_object);
    let completion_caption = sanitize_user_visible_copy(
        string_field(
            &value,
            &["completion_caption", "completionCaption", "complete"],
        )
        .or_else(|| {
            result_captions.and_then(|captions| {
                string_field_from_map(captions, &["complete", "completion_caption"])
            })
        })
        .as_deref(),
        MAX_CAPTION_CHARS,
    );
    if assistant_intro.is_none() && completion_caption.is_none() {
        return None;
    }

    let mut payload = Map::new();
    payload.insert("schema".to_string(), json!(PRESENTATION_SCHEMA_VERSION));
    payload.insert("source".to_string(), json!(PRESENTATION_SOURCE));
    payload.insert("provider".to_string(), json!(provider));
    payload.insert("model".to_string(), json!(model));
    if let Some(assistant_intro) = assistant_intro.as_ref() {
        payload.insert("assistant_intro".to_string(), json!(assistant_intro));
        payload.insert("assistantIntro".to_string(), json!(assistant_intro));
    }
    if let Some(completion_caption) = completion_caption.as_ref() {
        payload.insert("completion_caption".to_string(), json!(completion_caption));
        payload.insert("completionCaption".to_string(), json!(completion_caption));
        payload.insert(
            "result_captions".to_string(),
            json!({
                "complete": completion_caption,
                "partial": completion_caption,
            }),
        );
    }

    Some(GeneratedImageTaskPresentation {
        assistant_intro,
        completion_caption,
        payload: Value::Object(payload),
    })
}

fn parse_json_object(raw_text: &str) -> Option<Value> {
    let trimmed = raw_text.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        if value.is_object() {
            return Some(value);
        }
    }
    let without_fence = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .and_then(|value| value.strip_suffix("```"))
        .map(str::trim)
        .unwrap_or(trimmed);
    if let Ok(value) = serde_json::from_str::<Value>(without_fence) {
        if value.is_object() {
            return Some(value);
        }
    }
    let start = without_fence.find('{')?;
    let end = without_fence.rfind('}')?;
    if end <= start {
        return None;
    }
    serde_json::from_str::<Value>(&without_fence[start..=end])
        .ok()
        .filter(|value| value.is_object())
}

fn sanitize_user_visible_copy(value: Option<&str>, max_chars: usize) -> Option<String> {
    let normalized = value?
        .replace("\r\n", "\n")
        .replace('\r', "\n")
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if normalized.is_empty() || contains_forbidden_visible_copy(&normalized) {
        return None;
    }
    if normalized.chars().count() <= max_chars {
        return Some(normalized);
    }
    Some(
        normalized
            .chars()
            .take(max_chars)
            .collect::<String>()
            .trim()
            .to_string(),
    )
}

fn contains_forbidden_visible_copy(value: &str) -> bool {
    let normalized = value.to_ascii_lowercase();
    [
        concat!("r", "ibbi"),
        "workflow",
        "imagecommandworkflow",
        "task_id",
        "task id",
        ".lime",
        "json",
        "jsonl",
        "tool parameter",
        "tool parameters",
        "工具参数",
        "任务 id",
        "任务ID",
        "任务文件",
        "工作流",
    ]
    .iter()
    .any(|term| normalized.contains(&term.to_ascii_lowercase()))
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn string_field_from_map(map: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| map.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn presentation_session_id(intent: &ImageCommandIntent) -> String {
    format!(
        "{}:image-presentation:{}",
        intent.scope.session_id, intent.scope.turn_id
    )
}

fn presentation_user_prompt(intent: &ImageCommandIntent) -> String {
    json!({
        "task": "Generate user-visible copy for one image generation turn.",
        "user_request": intent.raw_text.as_deref().unwrap_or(&intent.prompt),
        "image_prompt": intent.prompt,
        "mode": intent.mode.as_deref().unwrap_or("generate"),
        "model_label_hint": intent.model,
        "requested_target": intent.requested_target,
        "rules": [
            "Return only valid JSON.",
            "Write in the same language as the user request.",
            "assistant_intro should be warm, brief, and naturally acknowledge the request before generation.",
            "completion_caption should describe the result as if the image has completed, invite lightweight iteration, and avoid sounding templated.",
            "Do not mention workflow, task id, files, JSON, tools, internal paths, or runtime details.",
            "Do not mention branded assistant names."
        ],
        "schema": {
            "assistant_intro": "string",
            "completion_caption": "string"
        }
    })
    .to_string()
}

fn presentation_system_prompt() -> String {
    String::from(
        "You write concise, natural user-visible copy for Lime image generation turns.\n\
Return only JSON that matches the requested schema.\n\
The copy must feel contextual and human, not like a reusable template.\n\
Never reveal internal workflow, task ids, tool names, files, JSON/JSONL, audit details, or runtime implementation.\n\
Never use branded assistant names.\n\
Do not include markdown fences."
    )
}

fn presentation_output_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "assistant_intro": {
                "type": "string",
                "minLength": 1,
                "maxLength": MAX_INTRO_CHARS
            },
            "completion_caption": {
                "type": "string",
                "minLength": 1,
                "maxLength": MAX_CAPTION_CHARS
            }
        },
        "required": ["assistant_intro", "completion_caption"]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_normalizes_model_generated_presentation() {
        let presentation = parse_generated_presentation(
            r#"{"assistant_intro":"好啊，我来处理这张深圳夏天的画面。","completion_caption":"搞定，深圳夏天的阳光和城市感都放进去了。\n还想更清爽或更电影感，可以继续调。"}"#,
            "openai",
            "gpt-4.1",
        )
        .expect("presentation");

        assert_eq!(
            presentation.assistant_intro.as_deref(),
            Some("好啊，我来处理这张深圳夏天的画面。")
        );
        assert_eq!(
            presentation.payload["result_captions"]["complete"].as_str(),
            Some("搞定，深圳夏天的阳光和城市感都放进去了。\n还想更清爽或更电影感，可以继续调。")
        );
    }

    #[test]
    fn rejects_internal_or_branded_visible_copy() {
        let raw = format!(
            r#"{{"assistant_intro":"{} 马上写入 JSONL。","completion_caption":"workflow 已完成"}}"#,
            concat!("R", "ibbi")
        );
        assert!(parse_generated_presentation(&raw, "openai", "gpt-4.1",).is_none());
    }

    #[test]
    fn merges_generated_fields_without_dropping_contract() {
        let generated = parse_generated_presentation(
            r#"{"assistant_intro":"好啊，我来画。","completion_caption":"完成了，可以继续调。"}"#,
            "openai",
            "gpt-4.1",
        )
        .expect("presentation");

        let merged = merge_generated_presentation(
            Some(json!({
                "version": "lime-image-chat-v1",
                "assistant_intro_request": {
                    "source": "model_generated_before_tool"
                }
            })),
            &generated,
        )
        .expect("merged");

        assert_eq!(merged["version"], "lime-image-chat-v1");
        assert_eq!(merged["assistant_intro"], "好啊，我来画。");
    }
}
