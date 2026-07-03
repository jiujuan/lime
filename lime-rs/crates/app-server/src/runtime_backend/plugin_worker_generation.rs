use super::{
    aster_provider_protocol_from_route, backend_error, direct_provider_config_from_request,
    initialize_runtime_database, model_route_resolver, provider_config_from_pool,
    provider_config_with_route_protocol, request_context, selection_with_effective_reasoning,
    RuntimeBackend,
};
use crate::{ExecutionRequest, RuntimeCoreError};
use lime_agent::{
    resolve_request_tool_policy_with_mode, stream_reply_with_policy,
    AgentEvent as RuntimeAgentEvent, RequestToolPolicyMode, SessionConfigBuilder,
};
use serde_json::{json, Map, Value};

const HOST_MANAGED_GENERATION_SCHEMA: &str = "lime.plugin.host_managed_generation.v1";
const HOST_MANAGED_GENERATION_SOURCE: &str = "app_server_runtime_backend";
const MAX_GENERATION_REQUESTS: usize = 3;
const MAX_GENERATED_CHARS: usize = 24_000;

#[derive(Debug, Clone)]
struct GenerationPlan {
    requests: Vec<GenerationRequest>,
    system_prompt: Option<String>,
}

#[derive(Debug, Clone)]
struct GenerationRequest {
    id: String,
    kind: Option<String>,
    target_object_kind: Option<String>,
    output_field: Option<String>,
    instructions: Option<String>,
}

pub(super) async fn prepare_plugin_worker_request(
    runtime_backend: &RuntimeBackend,
    request: &ExecutionRequest,
    worker_request: &mut Value,
) -> Result<(), RuntimeCoreError> {
    let Some(plan) = GenerationPlan::from_worker_request(worker_request) else {
        return Ok(());
    };
    if plan.requests.is_empty() {
        write_generation_status(worker_request, json!({ "status": "skipped" }));
        return Ok(());
    }

    match generate_outputs(runtime_backend, request, worker_request, &plan).await {
        Ok(generated) => {
            write_generation_status(
                worker_request,
                json!({
                    "status": "completed",
                    "provider": generated.provider,
                    "model": generated.model,
                    "outputs": generated.outputs,
                }),
            );
        }
        Err(error) => {
            write_generation_status(
                worker_request,
                json!({
                    "status": "unavailable",
                    "reasonCode": "host_generation_unavailable",
                    "message": error.to_string(),
                }),
            );
        }
    }

    Ok(())
}

struct GeneratedOutputs {
    provider: String,
    model: String,
    outputs: Vec<Value>,
}

async fn generate_outputs(
    runtime_backend: &RuntimeBackend,
    request: &ExecutionRequest,
    worker_request: &Value,
    plan: &GenerationPlan,
) -> Result<GeneratedOutputs, RuntimeCoreError> {
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
            "host managed generation route unavailable: {}",
            route_failure.reason_code
        )));
    }

    let generation_session_id = generation_session_id(worker_request);
    let provider_config = if let Some(provider_config) = direct_provider_config {
        let provider_config = provider_config_with_route_protocol(
            provider_config,
            aster_provider_protocol_from_route(&route_resolution.resolved_route.protocol),
        );
        runtime_backend
            .agent_state
            .configure_provider(provider_config.clone(), &generation_session_id, &db)
            .await
            .map_err(backend_error)?;
        provider_config
    } else {
        provider_config_from_pool(
            &runtime_backend.agent_state,
            &db,
            &selection.provider,
            &selection.model,
            &generation_session_id,
            selection.reasoning_effort.clone(),
            aster_provider_protocol_from_route(&route_resolution.resolved_route.protocol),
        )
        .await
        .map_err(backend_error)?
    };

    let agent_arc = runtime_backend.agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard.as_ref().ok_or_else(|| {
        RuntimeCoreError::Backend(
            "App Server host managed generation failed to initialize Aster agent".to_string(),
        )
    })?;
    let request_tool_policy =
        resolve_request_tool_policy_with_mode(Some(false), Some(RequestToolPolicyMode::Disabled));
    let provider = provider_config
        .provider_selector
        .clone()
        .unwrap_or_else(|| selection.provider.clone());
    let model = provider_config.model_name.clone();
    let mut outputs = Vec::new();

    for generation_request in plan.requests.iter().take(MAX_GENERATION_REQUESTS) {
        let session_config = SessionConfigBuilder::new(format!(
            "{}:{}",
            generation_session_id, generation_request.id
        ))
        .thread_id(format!(
            "{}:host-managed-generation",
            string_field(worker_request, &["sessionId", "session_id"])
                .unwrap_or_else(|| "plugin-worker".to_string())
        ))
        .turn_id(format!(
            "{}:host-managed-generation:{}",
            string_field(worker_request, &["turnId", "turn_id"])
                .unwrap_or_else(|| "turn".to_string()),
            generation_request.id
        ))
        .system_prompt(generation_system_prompt(plan, generation_request))
        .include_context_trace(false)
        .build();
        let mut generated_text = String::new();
        let execution = stream_reply_with_policy(
            agent,
            &generation_user_prompt(worker_request, generation_request),
            None,
            session_config,
            None,
            &request_tool_policy,
            |event| collect_model_text(event, &mut generated_text),
        )
        .await;
        execution.map_err(|error| RuntimeCoreError::Backend(error.message))?;
        let content = truncate_chars(generated_text.trim(), MAX_GENERATED_CHARS);
        if content.is_empty() {
            continue;
        }
        outputs.push(json!({
            "id": generation_request.id,
            "kind": generation_request.kind,
            "targetObjectKind": generation_request.target_object_kind,
            "outputField": generation_request.output_field,
            "contentType": "text/markdown",
            "content": content,
        }));
    }

    Ok(GeneratedOutputs {
        provider,
        model,
        outputs,
    })
}

impl GenerationPlan {
    fn from_worker_request(worker_request: &Value) -> Option<Self> {
        let declaration = worker_request
            .pointer("/runtime/hostManagedGeneration")
            .filter(|value| value.is_object())?;
        if declaration
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            != true
        {
            return None;
        }
        let requests = declaration
            .get("requests")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(GenerationRequest::from_value)
            .collect::<Vec<_>>();
        Some(Self {
            requests,
            system_prompt: string_field(declaration, &["systemPrompt", "system_prompt"]),
        })
    }
}

impl GenerationRequest {
    fn from_value(value: &Value) -> Option<Self> {
        Some(Self {
            id: string_field(value, &["id", "key"])?,
            kind: string_field(value, &["kind"]),
            target_object_kind: string_field(value, &["targetObjectKind", "target_object_kind"]),
            output_field: string_field(value, &["outputField", "output_field"]),
            instructions: string_field(value, &["instructions", "prompt", "promptTemplate"]),
        })
    }
}

fn write_generation_status(worker_request: &mut Value, payload: Value) {
    let mut envelope = Map::new();
    envelope.insert(
        "schemaVersion".to_string(),
        json!(HOST_MANAGED_GENERATION_SCHEMA),
    );
    envelope.insert("source".to_string(), json!(HOST_MANAGED_GENERATION_SOURCE));
    if let Some(object) = payload.as_object() {
        for (key, value) in object {
            envelope.insert(key.clone(), value.clone());
        }
    }
    let request_object = ensure_object(worker_request);
    request_object.insert(
        "hostManagedGeneration".to_string(),
        Value::Object(envelope.clone()),
    );
    let runtime = request_object
        .entry("runtime".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let runtime_object = ensure_object(runtime);
    runtime_object.insert(
        "hostManagedGenerationResult".to_string(),
        Value::Object(envelope),
    );
}

fn generation_system_prompt(plan: &GenerationPlan, request: &GenerationRequest) -> String {
    let mut prompt = String::from(
        "你是 Lime App Server 托管的 Plugin 文本生成器。你只为插件 worker 生成受控文本内容，不解释流程，不输出审计说明，不调用工具。",
    );
    if let Some(system_prompt) = plan.system_prompt.as_deref() {
        prompt.push_str("\n\n插件声明的生成边界：\n");
        prompt.push_str(system_prompt);
    }
    if let Some(instructions) = request.instructions.as_deref() {
        prompt.push_str("\n\n本次生成指令：\n");
        prompt.push_str(instructions);
    }
    prompt.push_str("\n\n输出必须是 Markdown 正文。不要输出 JSON、代码围栏或额外说明。");
    prompt
}

fn generation_user_prompt(worker_request: &Value, request: &GenerationRequest) -> String {
    let mut prompt = String::new();
    prompt.push_str("用户原始请求：\n");
    prompt.push_str(
        string_field(worker_request, &["prompt"])
            .as_deref()
            .unwrap_or(""),
    );
    prompt.push_str("\n\n生成目标：\n");
    prompt.push_str(&format!(
        "- id: {}\n- kind: {}\n- targetObjectKind: {}\n- outputField: {}\n",
        request.id,
        request.kind.as_deref().unwrap_or("text"),
        request.target_object_kind.as_deref().unwrap_or(""),
        request.output_field.as_deref().unwrap_or("")
    ));
    if let Some(source_object_ref) = worker_request.get("sourceObjectRef") {
        prompt.push_str("\n来源对象引用：\n");
        prompt.push_str(&source_object_ref.to_string());
    }
    prompt
}

fn collect_model_text(event: &RuntimeAgentEvent, output: &mut String) {
    match event {
        RuntimeAgentEvent::TextDelta { text } => output.push_str(text),
        RuntimeAgentEvent::TextDeltaBatch { text, .. } => output.push_str(text),
        _ => {}
    }
}

fn generation_session_id(worker_request: &Value) -> String {
    format!(
        "{}:plugin-worker-generation:{}",
        string_field(worker_request, &["sessionId", "session_id"])
            .unwrap_or_else(|| "session".to_string()),
        string_field(worker_request, &["taskId", "task_id"]).unwrap_or_else(|| "task".to_string())
    )
}

fn ensure_object(value: &mut Value) -> &mut Map<String, Value> {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    value.as_object_mut().expect("value is object")
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut result = String::new();
    for (index, ch) in value.chars().enumerate() {
        if index >= max_chars {
            result.push_str("...");
            break;
        }
        result.push(ch);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::{
        AgentInput, AgentSession, AgentSessionStatus, AgentTurn, AgentTurnStatus, RuntimeOptions,
    };
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    #[test]
    fn generation_plan_reads_host_managed_generation_requests() {
        let worker_request = json!({
            "runtime": {
                "hostManagedGeneration": {
                    "enabled": true,
                    "systemPrompt": "生成中文 Markdown",
                    "requests": [
                        {
                            "id": "article-draft-document",
                            "kind": "markdown_document",
                            "targetObjectKind": "articleDraft",
                            "outputField": "documentText",
                            "instructions": "写一篇文章"
                        }
                    ]
                }
            }
        });

        let plan = GenerationPlan::from_worker_request(&worker_request).expect("plan");
        assert_eq!(plan.system_prompt.as_deref(), Some("生成中文 Markdown"));
        assert_eq!(plan.requests.len(), 1);
        assert_eq!(plan.requests[0].id, "article-draft-document");
        assert_eq!(plan.requests[0].kind.as_deref(), Some("markdown_document"));
        assert_eq!(
            plan.requests[0].target_object_kind.as_deref(),
            Some("articleDraft")
        );
        assert_eq!(
            plan.requests[0].output_field.as_deref(),
            Some("documentText")
        );
    }

    #[test]
    fn write_generation_status_mirrors_payload_into_runtime_result() {
        let mut worker_request = json!({
            "runtime": {
                "hostManagedGeneration": {
                    "enabled": true
                }
            }
        });

        write_generation_status(
            &mut worker_request,
            json!({
                "status": "unavailable",
                "reasonCode": "host_generation_unavailable",
                "message": "no configured provider"
            }),
        );

        assert_eq!(
            worker_request["hostManagedGeneration"]["schemaVersion"],
            HOST_MANAGED_GENERATION_SCHEMA
        );
        assert_eq!(
            worker_request["hostManagedGeneration"]["source"],
            HOST_MANAGED_GENERATION_SOURCE
        );
        assert_eq!(
            worker_request["hostManagedGeneration"]["status"],
            "unavailable"
        );
        assert_eq!(
            worker_request["runtime"]["hostManagedGenerationResult"],
            worker_request["hostManagedGeneration"]
        );
    }

    #[tokio::test]
    async fn prepare_worker_request_injects_host_managed_generation_from_fixture_provider() {
        let generated_markdown = "# 宿主离线生成标题\n\n这里是 localhost fixture 生成的正文。";
        let base_url = start_openai_compatible_fixture(generated_markdown).await;
        let backend = RuntimeBackend::new();
        let request = generation_request_for_test(&base_url);
        let mut worker_request = json!({
            "schemaVersion": "content-factory.worker-request.v1",
            "appId": "content-factory-app",
            "sessionId": "session-host-generation",
            "turnId": "turn-host-generation",
            "taskId": "task-host-generation",
            "taskKind": "content.article.generate",
            "prompt": "写一篇关于内容工厂插件化写作的文章",
            "runtime": {
                "hostManagedGeneration": {
                    "enabled": true,
                    "systemPrompt": "生成可直接进入文章编辑器的 Markdown 正文。",
                    "requests": [
                        {
                            "id": "article-draft-document",
                            "kind": "markdown_document",
                            "targetObjectKind": "articleDraft",
                            "outputField": "documentText",
                            "instructions": "只输出文章正文。"
                        }
                    ]
                }
            }
        });

        prepare_plugin_worker_request(&backend, &request, &mut worker_request)
            .await
            .expect("prepare worker request");

        assert_eq!(
            worker_request["hostManagedGeneration"]["status"],
            "completed"
        );
        assert_eq!(
            worker_request["hostManagedGeneration"]["provider"],
            "fixture-openai"
        );
        assert_eq!(
            worker_request["hostManagedGeneration"]["model"],
            "lime-fixture-chat"
        );
        assert_eq!(
            worker_request["hostManagedGeneration"]["outputs"][0]["id"],
            "article-draft-document"
        );
        assert_eq!(
            worker_request["hostManagedGeneration"]["outputs"][0]["targetObjectKind"],
            "articleDraft"
        );
        assert_eq!(
            worker_request["hostManagedGeneration"]["outputs"][0]["outputField"],
            "documentText"
        );
        assert_eq!(
            worker_request["hostManagedGeneration"]["outputs"][0]["content"],
            generated_markdown
        );
        assert_eq!(
            worker_request["runtime"]["hostManagedGenerationResult"],
            worker_request["hostManagedGeneration"]
        );
    }

    async fn start_openai_compatible_fixture(content: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind fixture provider");
        let addr = listener.local_addr().expect("fixture address");
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("accept fixture request");
            let mut buffer = vec![0_u8; 16 * 1024];
            let _ = socket
                .read(&mut buffer)
                .await
                .expect("read fixture request");
            let body = fixture_sse_body(content);
            let response = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream; charset=utf-8\r\ncache-control: no-cache\r\nconnection: close\r\ncontent-length: {}\r\n\r\n{}",
                body.as_bytes().len(),
                body
            );
            socket
                .write_all(response.as_bytes())
                .await
                .expect("write fixture response");
            let _ = socket.shutdown().await;
        });
        format!("http://{}", addr)
    }

    fn fixture_sse_body(content: &str) -> String {
        let first_chunk = json!({
            "id": "chatcmpl-host-managed-generation-fixture",
            "object": "chat.completion.chunk",
            "created": 1_770_000_000,
            "model": "lime-fixture-chat",
            "choices": [
                {
                    "index": 0,
                    "delta": {
                        "role": "assistant",
                        "content": content
                    },
                    "finish_reason": null
                }
            ]
        });
        let final_chunk = json!({
            "id": "chatcmpl-host-managed-generation-fixture",
            "object": "chat.completion.chunk",
            "created": 1_770_000_000,
            "model": "lime-fixture-chat",
            "choices": [
                {
                    "index": 0,
                    "delta": {},
                    "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": 1,
                "completion_tokens": 1,
                "total_tokens": 2
            }
        });
        format!("data: {first_chunk}\n\ndata: {final_chunk}\n\ndata: [DONE]\n\n")
    }

    fn generation_request_for_test(base_url: &str) -> ExecutionRequest {
        ExecutionRequest {
            host: crate::RuntimeHostContext::default(),
            session: AgentSession {
                session_id: "session-host-generation".to_string(),
                thread_id: "thread-host-generation".to_string(),
                app_id: "content-factory-app".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                status: AgentSessionStatus::Running,
                created_at: "2026-07-03T00:00:00.000Z".to_string(),
                updated_at: "2026-07-03T00:00:00.000Z".to_string(),
            },
            turn: AgentTurn {
                turn_id: "turn-host-generation".to_string(),
                session_id: "session-host-generation".to_string(),
                thread_id: "thread-host-generation".to_string(),
                status: AgentTurnStatus::Accepted,
                started_at: None,
                completed_at: None,
            },
            input: AgentInput {
                text: "写一篇关于内容工厂插件化写作的文章".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                stream: true,
                host_options: Some(json!({
                    "asterChatRequest": {
                        "provider_config": {
                            "provider_id": "fixture-openai",
                            "provider_name": "openai",
                            "model_name": "lime-fixture-chat",
                            "api_key": "fixture-key",
                            "base_url": base_url,
                            "tool_call_strategy": "native"
                        },
                        "provider_preference": "fixture-openai",
                        "model_preference": "lime-fixture-chat"
                    }
                })),
                ..RuntimeOptions::default()
            }),
            expected_output: None,
            structured_output: None,
            output_schema: None,
            event_name: None,
            provider_preference: None,
            model_preference: None,
            metadata: None,
            queued_turn_id: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        }
    }
}
