use super::*;
use crate::agent::QueuedTurnSnapshot;
use crate::commands::aster_agent_cmd::AgentRuntimeThreadReadModel;
use crate::commands::aster_agent_cmd::{
    AgentRuntimeIncidentView, AgentRuntimeOutcomeView, AgentRuntimeRequestView,
    AgentRuntimeThreadArtifactView, AgentRuntimeThreadEvidenceSummary,
    AgentRuntimeThreadTelemetrySummary, AgentRuntimeThreadToolCallView,
};
use serde_json::{json, Value};

fn runtime_request(
    required_capabilities: Vec<&str>,
    capability_hints: Vec<&str>,
) -> AgentAppRuntimeStartTaskRequest {
    AgentAppRuntimeStartTaskRequest {
        app_id: "content-factory-app".to_string(),
        entry_key: Some("content_factory".to_string()),
        workspace_id: Some("workspace-1".to_string()),
        session_id: None,
        task_id: None,
        task_kind: "content_factory.copy.generate".to_string(),
        idempotency_key: None,
        title: Some("生成小红书种草文案".to_string()),
        prompt: Some("围绕春季护肤新品生成文案，并补齐资料来源".to_string()),
        input: Some(json!({
            "platform": "xiaohongshu",
            "audience": "敏感肌用户"
        })),
        expected_output: Some(json!({
            "artifacts": ["copy", "assetBrief"]
        })),
        required_capabilities: required_capabilities
            .into_iter()
            .map(str::to_string)
            .collect(),
        capability_hints: capability_hints.into_iter().map(str::to_string).collect(),
        knowledge_bindings: Vec::new(),
        human_review: Some(true),
        event_name: None,
        turn_id: None,
        provider_preference: None,
        model_preference: None,
        queue_if_busy: None,
        skip_pre_submit_resume: None,
        run_start_hooks: None,
        metadata: None,
    }
}

fn base_thread_read() -> AgentRuntimeThreadReadModel {
    AgentRuntimeThreadReadModel {
        thread_id: "thread-1".to_string(),
        status: "running".to_string(),
        profile_status: "running".to_string(),
        active_turn_id: Some("turn-1".to_string()),
        turns: Vec::new(),
        pending_requests: Vec::new(),
        last_outcome: None,
        incidents: Vec::new(),
        queued_turns: Vec::new(),
        tool_calls: Vec::new(),
        artifacts: Vec::new(),
        model_routing: None,
        evidence_summary: AgentRuntimeThreadEvidenceSummary::default(),
        telemetry_summary: AgentRuntimeThreadTelemetrySummary::default(),
        context_summary: None,
        interrupt_state: None,
        updated_at: Some("2026-05-16T00:00:00.000Z".to_string()),
        latest_compaction_boundary: None,
        file_checkpoint_summary: None,
        diagnostics: None,
        task_kind: None,
        service_model_slot: None,
        routing_mode: None,
        decision_source: None,
        decision_reason: None,
        candidate_count: None,
        fallback_chain: None,
        capability_gap: None,
        estimated_cost_class: None,
        single_candidate_only: None,
        oem_policy: None,
        runtime_summary: None,
        auxiliary_task_runtime: None,
        limit_state: None,
        cost_state: None,
        permission_state: None,
        limit_event: None,
    }
}

#[test]
fn test_agent_app_runtime_session_id_uses_hidden_prefix() {
    assert!(new_agent_app_runtime_session_id().starts_with(AGENT_APP_RUNTIME_SESSION_ID_PREFIX));
}

#[test]
fn test_agent_app_runtime_model_preference_reads_recent_successful_routing_metadata() {
    let metadata = json!({
        "request_metadata": {
            "lime_runtime": {
                "routing_decision": {
                    "selected_provider": "deepseek",
                    "selected_model": "deepseek-v4-flash"
                }
            }
        }
    });

    let preference = model_preference_from_run_metadata(&metadata).expect("recent run preference");

    assert_eq!(preference.provider_preference, "deepseek");
    assert_eq!(preference.model_preference, "deepseek-v4-flash");
    assert_eq!(preference.source, "recent_successful_agent_run");
}

#[test]
fn test_agent_app_runtime_metadata_maps_research_capability_to_claw_launch() {
    let request = runtime_request(
        vec!["text_generation", "lime.capability.research.search"],
        Vec::new(),
    );
    let metadata = build_agent_app_runtime_metadata(&request, "task-1", "trace-1");
    let harness = metadata
        .get("harness")
        .and_then(Value::as_object)
        .expect("harness metadata");
    let launch = harness
        .get("research_skill_launch")
        .and_then(Value::as_object)
        .expect("research launch");
    let research_request = launch
        .get("research_request")
        .and_then(Value::as_object)
        .expect("research request");
    let runtime_summary = metadata
        .get("lime_runtime")
        .and_then(|value| value.get("runtime_summary"))
        .and_then(Value::as_object)
        .expect("agent app runtime summary");

    assert_eq!(harness.get("allow_model_skills"), Some(&json!(true)));
    assert!(harness.get("agent_app_runtime").is_some());
    assert_eq!(runtime_summary.get("surface"), Some(&json!("agent_app")));
    assert_eq!(
        runtime_summary.get("app_id"),
        Some(&json!("content-factory-app"))
    );
    assert_eq!(runtime_summary.get("task_id"), Some(&json!("task-1")));
    assert_eq!(runtime_summary.get("trace_id"), Some(&json!("trace-1")));
    assert_eq!(launch.get("skill_name"), Some(&json!("research")));
    assert_eq!(launch.get("kind"), Some(&json!("research_request")));
    assert_eq!(
        research_request.get("source"),
        Some(&json!("agent_app_runtime"))
    );
    assert_eq!(
        research_request.get("app_id"),
        Some(&json!("content-factory-app"))
    );
    assert_eq!(
        research_request.get("capability_id"),
        Some(&json!("lime.capability.research.search"))
    );
    assert!(research_request.get("query").is_some());
}

#[test]
fn test_agent_app_runtime_metadata_maps_image_alias_to_claw_launch() {
    let request = runtime_request(Vec::new(), vec!["image_generation"]);
    let metadata = build_agent_app_runtime_metadata(&request, "task-1", "trace-1");
    let launch = metadata
        .get("harness")
        .and_then(Value::as_object)
        .and_then(|harness| harness.get("image_skill_launch"))
        .and_then(Value::as_object)
        .expect("image launch");
    let image_task = launch
        .get("image_task")
        .and_then(Value::as_object)
        .expect("image task");

    assert_eq!(launch.get("skill_name"), Some(&json!("image_generate")));
    assert_eq!(launch.get("kind"), Some(&json!("image_task")));
    assert_eq!(image_task.get("mode"), Some(&json!("generate")));
    assert_eq!(
        image_task.get("entry_source"),
        Some(&json!("agent_app_runtime"))
    );
}

#[test]
fn test_agent_app_runtime_metadata_ignores_unknown_capability_without_fake_launch() {
    let request = runtime_request(vec!["text_generation"], Vec::new());
    let metadata = build_agent_app_runtime_metadata(&request, "task-1", "trace-1");
    let harness = metadata
        .get("harness")
        .and_then(Value::as_object)
        .expect("harness metadata");

    assert!(harness.get("agent_app_runtime").is_some());
    assert!(harness.get("allow_model_skills").is_none());
    assert!(harness.get("image_skill_launch").is_none());
    assert!(harness.get("research_skill_launch").is_none());
}

#[test]
fn test_agent_app_runtime_content_factory_output_contract_is_machine_readable() {
    let mut request = runtime_request(Vec::new(), Vec::new());
    request.expected_output = Some(json!({
        "artifactKind": "content_batch",
        "includes": ["copy", "script", "image_brief"],
        "requiredSkills": [{
            "id": "article-writer",
            "skill": "article-writer",
            "standard": "agentskills",
            "required": true
        }]
    }));

    let metadata = build_agent_app_runtime_metadata(&request, "task-1", "trace-1");
    let harness = metadata
        .get("harness")
        .and_then(Value::as_object)
        .expect("harness metadata");
    let output_contract = harness
        .get("agent_app_runtime_output_contract")
        .and_then(Value::as_object)
        .expect("output contract");
    assert_eq!(
        output_contract.get("artifact_kind"),
        Some(&json!("content_batch"))
    );
    assert_eq!(
        output_contract.get("artifact_metadata_kind"),
        Some(&json!(CONTENT_FACTORY_WORKSPACE_PATCH_KIND))
    );
    assert!(output_contract
        .get("patch_metadata_keys")
        .and_then(Value::as_array)
        .is_some_and(|items| items.contains(&json!("contentFactoryWorkspacePatch"))));

    let message = build_agent_app_runtime_task_message(&request);
    assert!(message.contains("Content Factory Output Contract"));
    assert!(message.contains("Content Factory Skill Contract"));
    assert!(message.contains("skill=\"article-writer\""));
    assert!(message.contains("tool=Skill"));
    assert!(message.contains("contentFactoryWorkspacePatch"));
    assert!(message.contains("artifactKind=content_batch"));
    assert!(message.contains("不要通过 Bash"));
    assert!(message.contains("requiredSkills"));
}

#[test]
fn test_agent_app_runtime_content_factory_output_contract_uses_business_skills_without_single_capability_launch(
) {
    let mut request = runtime_request(Vec::new(), vec!["research.search", "image_generation"]);
    request.expected_output = Some(json!({
        "artifactKind": "content_batch",
        "includes": ["copy", "script", "image_brief"],
        "requiredSkills": [
            {
                "id": "article-writer",
                "skill": "article-writer",
                "standard": "agentskills",
                "required": true
            },
            {
                "id": "content-reviewer",
                "skill": "content-reviewer",
                "standard": "agentskills",
                "required": true
            }
        ]
    }));

    let metadata = build_agent_app_runtime_metadata(&request, "task-1", "trace-1");
    let harness = metadata
        .get("harness")
        .and_then(Value::as_object)
        .expect("harness metadata");

    assert!(harness.get("agent_app_runtime_output_contract").is_some());
    assert_eq!(harness.get("chat_mode"), Some(&json!("general")));
    assert_eq!(
        harness.get("session_mode"),
        Some(&json!("general_workbench"))
    );
    let workflow = harness
        .get("agent_app_runtime_capability_workflow")
        .and_then(Value::as_object)
        .expect("capability workflow");
    assert_eq!(
        workflow.get("mode"),
        Some(&json!("composite_output_contract"))
    );
    assert_eq!(workflow.get("launch_policy"), Some(&json!("metadata_only")));
    let descriptors = workflow
        .get("descriptors")
        .and_then(Value::as_array)
        .expect("workflow descriptors");
    assert_eq!(descriptors.len(), 2);
    assert!(descriptors
        .iter()
        .any(|descriptor| descriptor.get("capability_id")
            == Some(&json!("lime.capability.research.search"))));
    assert!(descriptors
        .iter()
        .any(|descriptor| descriptor.get("capability_id")
            == Some(&json!("lime.capability.image.generate"))));
    assert_eq!(harness.get("allow_model_skills"), Some(&json!(true)));
    let skill_contract = harness
        .get("agent_app_runtime_skill_contract")
        .and_then(Value::as_object)
        .expect("skill contract");
    assert_eq!(
        skill_contract.get("policy"),
        Some(&json!("must_use_required_skills_before_final_patch"))
    );
    let required_skills = skill_contract
        .get("required_skills")
        .and_then(Value::as_array)
        .expect("required skills");
    assert_eq!(required_skills.len(), 2);
    assert!(required_skills
        .iter()
        .any(|skill| skill.get("skill") == Some(&json!("article-writer"))));
    assert!(required_skills
        .iter()
        .any(|skill| skill.get("skill") == Some(&json!("content-reviewer"))));
    let tool_scope = metadata
        .get("tool_scope")
        .and_then(Value::as_object)
        .expect("required skill task should narrow tool scope");
    assert_eq!(tool_scope.get("allowed_tools"), Some(&json!(["Skill"])));
    assert_eq!(
        metadata
            .get(LIME_RUNTIME_METADATA_KEY)
            .and_then(|value| value.get(LIME_RUNTIME_TOOL_SURFACE_KEY)),
        Some(&json!("agent_app_required_skills"))
    );
    assert!(harness.get("research_skill_launch").is_none());
    assert!(harness.get("image_skill_launch").is_none());
}

#[test]
fn test_agent_app_runtime_extracts_workspace_patch_from_artifact_document_blocks() {
    let metadata = json!({
        "artifactDocument": {
            "blocks": [
                {
                    "type": "rich_text",
                    "content": "```json\n{\"contentFactoryWorkspacePatch\":{\"kind\":\"content_batch\",\"projectId\":\"project-1\",\"contentBatch\":{\"items\":[{\"title\":\"示例文案\"}]}}}\n```"
                }
            ]
        }
    });

    let patch = extract_content_factory_workspace_patch_from_artifact_document(Some(&metadata))
        .expect("workspace patch");

    assert_eq!(patch.get("kind"), Some(&json!("content_batch")));
    assert_eq!(patch.get("projectId"), Some(&json!("project-1")));
    assert!(patch.get("contentBatch").is_some());
}

#[test]
fn test_agent_app_runtime_task_events_project_thread_read_facts() {
    let mut thread_read = base_thread_read();
    thread_read.queued_turns = vec![QueuedTurnSnapshot {
        queued_turn_id: "queued-1".to_string(),
        message_preview: "排队任务".to_string(),
        message_text: "排队任务完整文本".to_string(),
        created_at: 1_789_000_000,
        image_count: 0,
        position: 0,
    }];
    thread_read.pending_requests = vec![AgentRuntimeRequestView {
        id: "request-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: Some("turn-1".to_string()),
        item_id: None,
        request_type: "ask_user".to_string(),
        status: "pending".to_string(),
        title: Some("需要确认素材方向".to_string()),
        payload: Some(json!({ "question": "是否继续？" })),
        decision: None,
        scope: None,
        created_at: Some("2026-05-16T00:00:01.000Z".to_string()),
        resolved_at: None,
    }];
    thread_read.context_summary = Some(json!({
        "missing_context": [{ "field": "target_audience" }]
    }));
    thread_read.tool_calls = vec![AgentRuntimeThreadToolCallView {
        tool_call_id: "tool-1".to_string(),
        turn_id: "turn-1".to_string(),
        tool_name: "Skill(research)".to_string(),
        status: "completed".to_string(),
        success: Some(true),
        error: None,
    }];
    thread_read.artifacts = vec![AgentRuntimeThreadArtifactView {
        item_id: "artifact-item-1".to_string(),
        turn_id: "turn-1".to_string(),
        path: ".lime/artifacts/content-batch.json".to_string(),
        source: "agent_runtime".to_string(),
        status: "created".to_string(),
        artifact_type: Some("content_batch".to_string()),
        title: Some("内容批次".to_string()),
        created_at: Some("2026-05-16T00:00:01.500Z".to_string()),
        completed_at: Some("2026-05-16T00:00:01.800Z".to_string()),
        updated_at: Some("2026-05-16T00:00:01.800Z".to_string()),
        metadata: Some(json!({
            "artifactType": "content_batch",
            "workspacePatch": {
                "kind": "content_batch",
                "projectId": "project-1",
                "contentBatch": { "count": 20 }
            }
        })),
    }];
    thread_read.evidence_summary = AgentRuntimeThreadEvidenceSummary {
        evidence_refs: vec!["evidence-1".to_string()],
        verification_outcomes: vec![json!({ "status": "passed" })],
    };
    thread_read.last_outcome = Some(AgentRuntimeOutcomeView {
        thread_id: "thread-1".to_string(),
        turn_id: Some("turn-1".to_string()),
        outcome_type: "completed".to_string(),
        summary: Some("任务完成".to_string()),
        primary_cause: None,
        retryable: false,
        ended_at: Some("2026-05-16T00:00:02.000Z".to_string()),
    });
    thread_read.incidents = vec![AgentRuntimeIncidentView {
        id: "incident-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: Some("turn-1".to_string()),
        item_id: None,
        incident_type: "provider_warning".to_string(),
        severity: "medium".to_string(),
        status: "open".to_string(),
        title: "Provider warning".to_string(),
        details: None,
        detected_at: Some("2026-05-16T00:00:03.000Z".to_string()),
        cleared_at: None,
    }];

    let events = build_agent_app_runtime_task_events(&thread_read);
    let event_types = events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();

    assert!(event_types.contains(&"task:queued"));
    assert!(event_types.contains(&"task:progress"));
    assert!(event_types.contains(&"task:missingContextRequested"));
    assert!(event_types.contains(&"task:toolCall"));
    assert!(event_types.contains(&"artifact:created"));
    assert!(event_types.contains(&"evidence:recorded"));
    assert!(event_types.contains(&"evidence:verified"));
    assert!(event_types.contains(&"task:completed"));
    assert!(event_types.contains(&"task:incident"));
    assert!(events
        .iter()
        .any(|event| event.request_id.as_deref() == Some("request-1")));
    assert!(events
        .iter()
        .any(|event| event.evidence_ref.as_deref() == Some("evidence-1")));
    assert!(events.iter().any(|event| {
        event.event_type == "evidence:recorded"
            && event.evidence_ref.as_deref() == Some("evidence:.lime/artifacts/content-batch.json")
            && event
                .payload
                .as_ref()
                .and_then(|payload| payload.get("contentFactoryWorkspacePatch"))
                .and_then(|patch| patch.get("contentBatch"))
                .and_then(|content_batch| content_batch.get("count"))
                == Some(&json!(20))
    }));
    assert!(events
        .iter()
        .any(|event| event.artifact_ref.as_deref() == Some(".lime/artifacts/content-batch.json")));
    let artifact_event = events
        .iter()
        .find(|event| event.event_type == "artifact:created")
        .expect("artifact event");
    assert_eq!(
        artifact_event
            .payload
            .as_ref()
            .and_then(|payload| payload.get("contentFactoryWorkspacePatch"))
            .and_then(|patch| patch.get("contentBatch"))
            .and_then(|content_batch| content_batch.get("count")),
        Some(&json!(20))
    );
}

#[test]
fn test_agent_app_runtime_task_snapshot_event_payload_is_canonical() {
    let mut thread_read = base_thread_read();
    thread_read.profile_status = "running".to_string();
    let task_events = build_agent_app_runtime_task_events(&thread_read);
    let snapshot = AgentAppRuntimeTaskSnapshot {
        app_id: "content-factory-app".to_string(),
        task_id: "task-1".to_string(),
        session_id: "session-1".to_string(),
        status: "thread_read_available".to_string(),
        task_status: thread_read.profile_status.clone(),
        task_events,
        thread_read: serde_json::to_value(&thread_read).expect("thread read value"),
    };

    let payload = build_agent_app_runtime_task_snapshot_event_payload(&snapshot);

    assert_eq!(
        payload.get("type"),
        Some(&json!("agent_app_runtime:taskSnapshot"))
    );
    assert_eq!(payload.get("eventType"), Some(&json!("task:update")));
    assert_eq!(payload.get("taskId"), Some(&json!("task-1")));
    assert_eq!(
        payload
            .get("taskEvents")
            .and_then(Value::as_array)
            .map(Vec::len),
        Some(snapshot.task_events.len())
    );
    assert!(payload.get("threadRead").is_some());
    assert!(payload.get("task").is_some());
}

#[test]
fn test_agent_app_runtime_idle_status_uses_business_progress_copy() {
    let mut thread_read = base_thread_read();
    thread_read.status = "idle".to_string();
    thread_read.profile_status = "idle".to_string();
    thread_read.active_turn_id = None;

    let events = build_agent_app_runtime_task_events(&thread_read);
    let progress = events
        .iter()
        .find(|event| event.event_type == "task:progress")
        .expect("progress event");

    assert_eq!(
        progress.message,
        "任务已接收，等待 AgentRuntime 调度或回写进度"
    );
    assert_ne!(progress.message, "任务状态：idle");
}
