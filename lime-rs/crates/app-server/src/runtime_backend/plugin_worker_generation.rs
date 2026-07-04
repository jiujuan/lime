use super::{
    backend_error, configure_provider_for_route, direct_provider_config_from_request,
    initialize_runtime_database, model_route_resolver, request_context,
    selection_with_effective_reasoning, RuntimeBackend,
};
use crate::{ExecutionRequest, RuntimeCoreError};
use lime_agent::{
    host_managed_generation_session_id, run_host_managed_generation,
    write_host_managed_generation_status, HostManagedGenerationPlan,
    HostManagedGenerationRunRequest,
};
use serde_json::{json, Value};

pub(super) async fn prepare_plugin_worker_request(
    runtime_backend: &RuntimeBackend,
    request: &ExecutionRequest,
    worker_request: &mut Value,
) -> Result<(), RuntimeCoreError> {
    let Some(plan) = HostManagedGenerationPlan::from_worker_request(worker_request) else {
        return Ok(());
    };
    if plan.requests.is_empty() {
        write_host_managed_generation_status(worker_request, json!({ "status": "skipped" }));
        return Ok(());
    }

    match generate_outputs(runtime_backend, request, worker_request, &plan).await {
        Ok(generated) => {
            write_host_managed_generation_status(
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
            write_host_managed_generation_status(
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
    plan: &HostManagedGenerationPlan,
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

    let generation_session_id = host_managed_generation_session_id(worker_request);
    let provider_config = configure_provider_for_route(
        &runtime_backend.agent_state,
        &db,
        &selection.provider,
        &selection.model,
        &generation_session_id,
        selection.reasoning_effort.clone(),
        &route_resolution.resolved_route.protocol,
        direct_provider_config,
    )
    .await
    .map_err(backend_error)?;

    let provider = provider_config
        .provider_selector
        .clone()
        .unwrap_or_else(|| selection.provider.clone());
    let model = provider_config.model_name.clone();
    let generated = run_host_managed_generation(
        &runtime_backend.agent_state,
        HostManagedGenerationRunRequest {
            db: &db,
            generation_session_id,
            worker_request,
            plan,
        },
    )
    .await
    .map_err(RuntimeCoreError::Backend)?;

    Ok(GeneratedOutputs {
        provider,
        model,
        outputs: generated.outputs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::{
        AgentInput, AgentSession, AgentSessionStatus, AgentTurn, AgentTurnStatus, RuntimeOptions,
    };
    use lime_agent::{HOST_MANAGED_GENERATION_SCHEMA, HOST_MANAGED_GENERATION_SOURCE};
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

        let plan = HostManagedGenerationPlan::from_worker_request(&worker_request).expect("plan");
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

        write_host_managed_generation_status(
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
