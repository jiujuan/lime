use super::support::*;
use super::*;

struct RoutingDecisionReadModelBackend;

#[async_trait]
impl ExecutionBackend for RoutingDecisionReadModelBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new(
            "routing.decision.made",
            json!({
                "backend": "runtime",
                "routingDecision": {
                    "routingMode": "profile_slot",
                    "decisionSource": "profile_model_slot",
                    "decisionReason": "profile_slot_selected",
                    "settingsSource": "workspace_profile",
                    "serviceModelSlot": "coding",
                    "selectedProvider": "custom-coding",
                    "selectedModel": "coder-large",
                    "requestedProvider": "custom-coding",
                    "requestedModel": "coder-large",
                    "fallbackChain": []
                },
                "modelSlot": {
                    "serviceModelSlot": "coding",
                    "slots": [
                        {
                            "slot": "coding",
                            "provider": "custom-coding",
                            "model": "coder-large"
                        },
                        {
                            "slot": "review",
                            "provider": "custom-review",
                            "model": "review-small"
                        }
                    ]
                },
                "providerReadiness": {
                    "ready": true,
                    "status": "ready",
                    "source": "provider_store",
                    "enabledKeyCount": 1
                },
                "modelRegistry": {
                    "source": "provider_declared_model",
                    "status": "matched",
                    "reasonCode": "matched_provider_custom_models",
                    "modelCapabilities": {
                        "capabilities": {
                            "tools": true,
                            "streaming": true,
                            "reasoning": true
                        },
                        "taskFamilies": ["chat", "reasoning"],
                        "runtimeFeatures": ["streaming", "tool_calling", "reasoning"]
                    },
                    "modelAlias": {
                        "canonicalModelId": "coder-large",
                        "providerModelId": "coder-large",
                        "aliasSource": "local"
                    },
                    "reasoning": {
                        "supported": true
                    }
                },
                "modelTaskRequest": {
                    "taskKind": "chat",
                    "source": "agent_turn",
                    "modelRef": {
                        "providerId": "custom-coding",
                        "modelId": "coder-large",
                        "routingSlot": "coding",
                        "source": "profile_slot"
                    },
                    "modalityContractKey": "chat",
                    "routingSlot": "coding",
                    "requirements": {
                        "taskFamilies": ["chat"],
                        "inputModalities": ["text"],
                        "outputModalities": ["text"],
                        "runtimeFeatures": ["streaming"],
                        "capabilities": ["tools", "streaming"]
                    },
                    "sessionId": "sess_routing_read",
                    "threadId": "thread_routing_read",
                    "turnId": "turn_routing_read"
                },
                "resolvedRoute": {
                    "modelRef": {
                        "providerId": "custom-coding",
                        "modelId": "coder-large",
                        "routingSlot": "coding",
                        "source": "profile_slot"
                    },
                    "protocol": "openai_chat",
                    "endpoint": {
                        "kind": "openai_compatible",
                        "baseUrl": "https://coding.example.com/v1"
                    },
                    "auth": {
                        "kind": "api_key_ref",
                        "providerId": "custom-coding",
                        "credentialRef": "runtime-api-key-key-1"
                    },
                    "transport": "http",
                    "framing": "sse",
                    "defaults": {},
                    "capabilitySnapshot": {
                        "taskFamilies": ["chat", "reasoning"],
                        "inputModalities": ["text"],
                        "outputModalities": ["text"],
                        "runtimeFeatures": ["streaming", "tool_calling", "reasoning"],
                        "capabilities": {
                            "vision": false,
                            "tools": true,
                            "streaming": true,
                            "jsonMode": false,
                            "functionCalling": false,
                            "reasoning": true
                        },
                        "source": "provider_declared_model",
                        "reasonCode": "matched_provider_custom_models"
                    },
                    "decision": {
                        "routingMode": "profile_slot",
                        "decisionSource": "profile_model_slot",
                        "decisionReason": "profile_slot_selected",
                        "settingsSource": "workspace_profile",
                        "serviceModelSlot": "coding",
                        "fallbackChain": [],
                        "candidateCount": 1
                    }
                }
            }),
        ))?;
        sink.emit(RuntimeEvent::new("turn.completed", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

async fn start_read_model_test_turn(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
) -> (RuntimeCore, AgentTurn) {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some(session_id.to_string()),
        thread_id: Some(thread_id.to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session_id.to_string(),
                turn_id: Some(turn_id.to_string()),
                input: AgentInput {
                    text: "测试工具生命周期".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn")
        .response
        .turn;
    (core, turn)
}

fn tool_item_event_payload(
    item_id: &str,
    thread_id: &str,
    turn_id: &str,
    sequence: i64,
    status: &str,
    tool_name: &str,
    arguments: serde_json::Value,
    output: Option<&str>,
    success: Option<bool>,
) -> serde_json::Value {
    json!({
        "item": {
            "id": item_id,
            "thread_id": thread_id,
            "turn_id": turn_id,
            "sequence": sequence,
            "status": status,
            "started_at": "2026-06-18T00:00:00.000Z",
            "updated_at": "2026-06-18T00:00:01.000Z",
            "completed_at": if status == "completed" { Some("2026-06-18T00:00:01.000Z") } else { None },
            "type": "tool_call",
            "tool_name": tool_name,
            "arguments": arguments,
            "output": output,
            "success": success,
            "metadata": {
                "source": "native_item_runtime"
            }
        }
    })
}

mod article_workspace_artifact_documents;
mod article_workspace_worker_evidence;
mod article_workspace_worker_failure;
mod artifacts;
mod imports_items;
mod messages_diagnostics;
mod role_switch;
mod tool_calls;
mod workflow;
