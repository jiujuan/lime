use super::*;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct CapturedProjectionEvents {
    profile_events: Arc<Mutex<Vec<(String, AgentRuntimeProfileEvent)>>>,
    projection_payloads: Arc<Mutex<Vec<(String, Value)>>>,
}

impl CapturedProjectionEvents {
    fn profile_events(&self) -> Vec<(String, AgentRuntimeProfileEvent)> {
        self.profile_events.lock().expect("profile events").clone()
    }

    fn projection_payloads(&self) -> Vec<(String, Value)> {
        self.projection_payloads
            .lock()
            .expect("projection payloads")
            .clone()
    }
}

impl RuntimeProjectionEventPort for CapturedProjectionEvents {
    fn emit_profile_event(
        &self,
        event_name: &str,
        event: &AgentRuntimeProfileEvent,
    ) -> Result<(), String> {
        self.profile_events
            .lock()
            .expect("profile events")
            .push((event_name.to_string(), event.clone()));
        Ok(())
    }

    fn emit_projection_payload(&self, event_name: &str, payload: Value) -> Result<(), String> {
        self.projection_payloads
            .lock()
            .expect("projection payloads")
            .push((event_name.to_string(), payload));
        Ok(())
    }
}

#[test]
fn agent_app_runtime_profile_projection_extracts_scope_from_event_name() {
    let scope =
        parse_agent_app_runtime_projection_scope("agent_app_runtime:content-factory-app:task-1")
            .expect("agent app runtime scope");

    assert_eq!(scope.app_id, "content-factory-app");
    assert_eq!(scope.task_id, "task-1");
    assert_eq!(
        agent_app_runtime_projection_event_name(&scope),
        "agent_app_runtime:content-factory-app:task-1"
    );
    assert!(parse_agent_app_runtime_projection_scope("aster_stream:session-1").is_none());
}

#[test]
fn agent_app_runtime_profile_projection_builds_canonical_task_event_payload() {
    let profile_stream =
        AgentRuntimeProfileStream::new("session-1", "thread-1", "turn-1").expect("profile stream");
    let event = profile_stream.tool_started("tool-1", "Skill(research)");

    let payload = build_agent_app_runtime_profile_projection_payload(
        "agent_app_runtime:content-factory-app:task-1",
        &event,
    )
    .expect("projection payload");
    let task_event = payload
        .get("taskEvents")
        .and_then(Value::as_array)
        .and_then(|events| events.first())
        .and_then(Value::as_object)
        .expect("task event");

    assert_eq!(
        payload.get("type"),
        Some(&json!("agent_app_runtime:profileProjection"))
    );
    assert_eq!(payload.get("eventType"), Some(&json!("task:runtimeEvent")));
    assert_eq!(payload.get("appId"), Some(&json!("content-factory-app")));
    assert_eq!(payload.get("taskId"), Some(&json!("task-1")));
    assert_eq!(payload.get("sessionId"), Some(&json!("session-1")));
    assert_eq!(
        payload.get("runtimeEventName"),
        Some(&json!("agent_app_runtime:content-factory-app:task-1"))
    );
    assert_eq!(task_event.get("eventType"), Some(&json!("task:toolCall")));
    assert_eq!(task_event.get("status"), Some(&json!("running")));
    assert_eq!(task_event.get("toolName"), Some(&json!("Skill(research)")));
    assert_eq!(task_event.get("turnId"), Some(&json!("turn-1")));
    assert!(payload.get("profileEvent").is_some());
}

#[test]
fn agent_runtime_profile_event_uses_projection_event_port() {
    let profile_stream =
        AgentRuntimeProfileStream::new("session-1", "thread-1", "turn-1").expect("profile stream");
    let event = profile_stream.turn_started();
    let port = CapturedProjectionEvents::default();

    emit_agent_runtime_profile_event_with_port(
        &port,
        "agent_app_runtime:content-factory-app:task-1",
        event.clone(),
    );

    let profile_events = port.profile_events();
    assert_eq!(profile_events.len(), 1);
    assert_eq!(
        profile_events[0].0,
        "agent_app_runtime:content-factory-app:task-1"
    );
    assert_eq!(profile_events[0].1, event);

    let projection_payloads = port.projection_payloads();
    assert_eq!(projection_payloads.len(), 1);
    assert_eq!(
        projection_payloads[0].0,
        "agent_app_runtime:content-factory-app:task-1"
    );
    assert_eq!(
        projection_payloads[0].1.get("type").and_then(Value::as_str),
        Some("agent_app_runtime:profileProjection")
    );
}

#[test]
fn agent_app_runtime_runtime_event_projection_builds_artifact_task_event_payload() {
    let event = RuntimeAgentEvent::ArtifactSnapshot {
        artifact: lime_agent::AgentArtifactSignal {
            artifact_id: "artifact-1".to_string(),
            file_path: ".lime/artifacts/content-batch.json".to_string(),
            content: None,
            metadata: Some(HashMap::from([(
                "workspacePatch".to_string(),
                json!({
                    "kind": "content_batch",
                    "projectId": "project-1",
                    "contentBatch": { "count": 20 }
                }),
            )])),
        },
    };

    let payload = build_agent_app_runtime_event_projection_payload(
        "agent_app_runtime:content-factory-app:task-1",
        &event,
    )
    .expect("runtime event projection payload");
    let task_event = payload
        .get("taskEvents")
        .and_then(Value::as_array)
        .and_then(|events| events.first())
        .and_then(Value::as_object)
        .expect("task event");

    assert_eq!(
        payload.get("type"),
        Some(&json!("agent_app_runtime:runtimeEventProjection"))
    );
    assert_eq!(
        task_event.get("eventType"),
        Some(&json!("artifact:created"))
    );
    assert_eq!(
        task_event.get("artifactRef"),
        Some(&json!(".lime/artifacts/content-batch.json"))
    );
    assert_eq!(
        task_event
            .get("payload")
            .and_then(|payload| payload.get("contentFactoryWorkspacePatch"))
            .and_then(|patch| patch.get("contentBatch"))
            .and_then(|content_batch| content_batch.get("count")),
        Some(&json!(20))
    );
}

#[test]
fn agent_app_runtime_event_projection_uses_projection_event_port() {
    let event = RuntimeAgentEvent::TextDelta {
        text: "第一段真实输出".to_string(),
    };
    let port = CapturedProjectionEvents::default();

    emit_agent_app_runtime_event_projection_with_port(
        &port,
        "agent_app_runtime:content-factory-app:task-1",
        &event,
    );

    let projection_payloads = port.projection_payloads();
    assert_eq!(projection_payloads.len(), 1);
    assert_eq!(
        projection_payloads[0].0,
        "agent_app_runtime:content-factory-app:task-1"
    );
    assert_eq!(
        projection_payloads[0].1.get("type").and_then(Value::as_str),
        Some("agent_app_runtime:runtimeEventProjection")
    );
    assert_eq!(port.profile_events().len(), 0);
}

#[test]
fn agent_app_runtime_runtime_event_projection_builds_evidence_task_events_from_metadata() {
    let event = RuntimeAgentEvent::ToolEnd {
        tool_id: "tool-1".to_string(),
        result: lime_agent::AgentToolResult {
            success: true,
            output: "ok".to_string(),
            error: None,
            images: None,
            metadata: Some(HashMap::from([
                (
                    "evidenceRefs".to_string(),
                    json!(["evidence://session-1/runtime"]),
                ),
                (
                    "verificationOutcomes".to_string(),
                    json!([{ "status": "passed" }]),
                ),
            ])),
        },
    };

    let payload = build_agent_app_runtime_event_projection_payload(
        "agent_app_runtime:content-factory-app:task-1",
        &event,
    )
    .expect("runtime event projection payload");
    let task_events = payload
        .get("taskEvents")
        .and_then(Value::as_array)
        .expect("task events");

    assert_eq!(task_events.len(), 3);
    assert!(task_events
        .iter()
        .any(|event| event.get("eventType") == Some(&json!("task:toolCall"))));
    assert!(task_events.iter().any(|event| {
        event.get("eventType") == Some(&json!("evidence:recorded"))
            && event.get("evidenceRef") == Some(&json!("evidence://session-1/runtime"))
    }));
    assert!(task_events.iter().any(|event| {
        event.get("eventType") == Some(&json!("evidence:verified"))
            && event.get("status") == Some(&json!("passed"))
    }));
}

#[test]
fn agent_app_runtime_runtime_event_projection_builds_stream_text_task_event() {
    let event = RuntimeAgentEvent::TextDelta {
        text: "第一段真实输出".to_string(),
    };

    let payload = build_agent_app_runtime_event_projection_payload(
        "agent_app_runtime:content-factory-app:task-1",
        &event,
    )
    .expect("runtime stream projection payload");
    let task_event = payload
        .get("taskEvents")
        .and_then(Value::as_array)
        .and_then(|events| events.first())
        .and_then(Value::as_object)
        .expect("stream task event");

    assert_eq!(
        task_event.get("eventType"),
        Some(&json!("task:partialArtifact"))
    );
    assert_eq!(task_event.get("status"), Some(&json!("streaming")));
    assert_eq!(task_event.get("message"), Some(&json!("第一段真实输出")));
    assert_eq!(
        task_event.get("streamKind"),
        Some(&json!("assistant_text_delta"))
    );
    assert_eq!(
        task_event
            .get("payload")
            .and_then(|payload| payload.get("delta")),
        Some(&json!("第一段真实输出"))
    );
}

#[test]
fn model_unavailable_detection_should_include_tenant_whitelist_and_invalid_model_errors() {
    assert!(is_runtime_model_unavailable_error(
        "Agent provider execution failed: Request failed: Bad request (400): 当前模型未在租户白名单中开放"
    ));
    assert!(is_runtime_model_unavailable_error(
        "Authentication failed (403): illegal access"
    ));
    assert!(is_runtime_model_unavailable_error(
        "Agent provider execution failed: Request failed: Bad request (400): Param Incorrect"
    ));
    assert!(is_runtime_model_unavailable_error(
        "Request failed: Bad request (400): Not supported model stale-chat"
    ));
    assert!(is_runtime_model_unavailable_error(
        "[AsterAgent][TTFT] provider stream request failed before body: provider=openai, model=gpt-5.5, elapsed_ms=8517, error=Server error: Server error (503 Service Unavailable): Service temporarily unavailable"
    ));
    assert!(!is_runtime_model_unavailable_error(
        "Request failed: Bad request (400): invalid schema"
    ));
}

#[test]
fn model_recovery_failure_message_should_name_both_models() {
    let message = build_runtime_model_recovery_failure_message(
        "gpt-4o",
        "gpt-4o-mini",
        "Agent provider execution failed: Request failed: Bad request (400): Param Incorrect",
    );

    assert!(message.contains("gpt-4o"));
    assert!(message.contains("gpt-4o-mini"));
    assert!(message.contains("同类模型可用性策略拒绝"));
}
