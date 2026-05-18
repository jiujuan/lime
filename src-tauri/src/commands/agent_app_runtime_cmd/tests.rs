use super::common::{
    new_agent_app_runtime_session_id, AGENT_APP_RUNTIME_SESSION_ID_PREFIX,
    CONTENT_FACTORY_WORKSPACE_PATCH_KIND, LIME_RUNTIME_METADATA_KEY, LIME_RUNTIME_TOOL_SURFACE_KEY,
};
use super::events::{
    build_agent_app_runtime_task_events, build_agent_app_runtime_task_snapshot_event_payload,
    extract_content_factory_workspace_patch_from_artifact_document,
};
use super::metadata::{build_agent_app_runtime_metadata, build_agent_app_runtime_task_message};
use super::model_preference::model_preference_from_run_metadata;
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
    request.input = Some(json!({
        "projectId": "active-project-1",
        "platform": "xiaohongshu"
    }));
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
    assert_eq!(
        output_contract.get("project_id"),
        Some(&json!("active-project-1"))
    );
    assert_eq!(
        metadata.pointer("/contentFactory/projectId"),
        Some(&json!("active-project-1"))
    );
    assert_eq!(
        metadata.pointer("/agent_app_runtime/project_id"),
        Some(&json!("active-project-1"))
    );
    assert!(output_contract
        .get("patch_metadata_keys")
        .and_then(Value::as_array)
        .is_some_and(|items| items.contains(&json!("contentFactoryWorkspacePatch"))));
    assert!(output_contract
        .get("accepted_patch_fields")
        .and_then(Value::as_array)
        .is_some_and(|items| items.contains(&json!("strategyReport"))
            && items.contains(&json!("pptOutline"))
            && items.contains(&json!("reviewReport"))
            && items.contains(&json!("riskCheck"))));

    let message = build_agent_app_runtime_task_message(&request);
    assert!(message.contains("Content Factory Output Contract"));
    assert!(message.contains("Content Factory Skill Contract"));
    assert!(message.contains("skill=\"article-writer\""));
    assert!(message.contains("tool=Skill"));
    assert!(message.contains("contentFactoryWorkspacePatch"));
    assert!(message.contains("artifactKind=content_batch"));
    assert!(message.contains("active-project-1"));
    assert!(message.contains("strategyReport"));
    assert!(message.contains("reviewReport"));
    assert!(message.contains("不要通过 Bash"));
    assert!(message.contains("requiredSkills"));
}

#[test]
fn test_agent_app_runtime_scene_table_contract_requires_workspace_patch() {
    let mut request = runtime_request(Vec::new(), Vec::new());
    request.task_kind = "content_factory.scenario.generate".to_string();
    request.expected_output = Some(json!({
        "artifactKind": "scene_table",
        "minimumScenarioCount": 120,
        "includes": ["scene_table", "image_brief"],
        "requiredSkills": [
            {
                "id": "knowledge-builder",
                "skill": "knowledge-builder",
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

    let message = build_agent_app_runtime_task_message(&request);

    assert!(message.contains("artifactKind=scene_table"));
    assert!(message.contains("contentFactoryWorkspacePatch.sceneTable"));
    assert!(message.contains("sceneTable.actualCount"));
    assert!(message.contains("imagePrompts"));
    assert!(message.contains("只返回 analysis artifact"));
    assert!(message.contains("workspace patch"));
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
fn test_agent_app_runtime_tool_execution_metadata_forces_toolruntime_owner_binding() {
    let mut request = runtime_request(vec!["lime.browser"], vec!["mcp__lime-browser__navigate"]);
    request.task_kind = "agent_app.tool_execution".to_string();
    request.input = Some(json!({
        "executionRequest": {
            "capability": "lime.browser",
            "method": "navigate",
            "toolName": "mcp__lime-browser__navigate",
            "input": {
                "sessionId": "browser-session-1",
                "url": "https://example.com"
            }
        }
    }));
    request.metadata = Some(json!({
        "agent_app_tool_execution": {
            "version": "p18.7-e2",
            "source": "host_bridge_execution_gate",
            "request": {
                "capability": "lime.browser",
                "method": "navigate",
                "toolName": "mcp__lime-browser__navigate",
                "action": "navigate",
                "input": {
                    "sessionId": "browser-session-1",
                    "url": "https://example.com"
                },
                "policy": {
                    "owner": "lime_agent_runtime",
                    "approvalRequired": true,
                    "mutationExposed": false,
                    "tokenExposed": false
                }
            }
        }
    }));

    let metadata = build_agent_app_runtime_metadata(&request, "task-tool-1", "trace-tool-1");
    let harness = metadata
        .get("harness")
        .and_then(Value::as_object)
        .expect("harness metadata");
    let lime_runtime = metadata
        .get(LIME_RUNTIME_METADATA_KEY)
        .and_then(Value::as_object)
        .expect("lime runtime metadata");
    let message = build_agent_app_runtime_task_message(&request);

    assert_eq!(harness.get("task_mode_enabled"), Some(&json!(true)));
    assert_eq!(
        harness
            .get("agent_app_tool_execution")
            .and_then(|value| value.pointer("/request/toolName")),
        Some(&json!("mcp__lime-browser__navigate"))
    );
    assert_eq!(
        harness
            .get("browser_assist")
            .and_then(|value| value.get("enabled")),
        Some(&json!(true))
    );
    assert_eq!(
        harness.get("browser_requirement"),
        Some(&json!("required_with_user_step"))
    );
    assert_eq!(
        lime_runtime.get(LIME_RUNTIME_TOOL_SURFACE_KEY),
        Some(&json!("agent_app_tool_execution"))
    );
    assert_eq!(
        metadata
            .get("tool_scope")
            .and_then(|value| value.get("mode")),
        Some(&json!("tool_runtime_owner_binding"))
    );
    assert!(message.contains("Agent App Tool Execution Owner Contract"));
    assert!(message.contains("Requested Tool: mcp__lime-browser__navigate"));
    assert!(message.contains("Tool Input JSON"));
}

#[test]
fn test_agent_app_runtime_connector_authorization_metadata_stays_host_managed() {
    let mut request = runtime_request(vec!["lime.connectors"], vec!["connector:notion"]);
    request.task_kind = "agent_app.connector_authorization".to_string();
    request.metadata = Some(json!({
        "agent_app_connector_authorization": {
            "version": "p18.7-e4",
            "source": "host_bridge_authorization_gate",
            "request": {
                "capability": "lime.connectors",
                "method": "requestAuth",
                "appId": "content-factory-app",
                "connectorId": "notion",
                "input": {
                    "connectorId": "notion",
                    "rawOauthToken": "notion-refresh-token",
                    "authorization": {
                        "header": "Bearer notion-nested-token"
                    }
                },
                "policy": {
                    "owner": "lime_connector_policy",
                    "secretBinding": "host_managed",
                    "tokenExposed": false,
                    "sessionScoped": true
                }
            }
        }
    }));

    let metadata = build_agent_app_runtime_metadata(&request, "task-auth-1", "trace-auth-1");
    let runtime_summary = metadata
        .pointer("/lime_runtime/runtime_summary")
        .expect("runtime summary");

    assert_eq!(
        runtime_summary.pointer("/agent_app_connector_authorization/request/connectorId"),
        Some(&json!("notion"))
    );
    assert_eq!(
        runtime_summary.pointer("/agent_app_connector_authorization/request/input/rawOauthToken"),
        Some(&json!("[redacted:host_managed_secret]"))
    );
    assert_eq!(
        runtime_summary.pointer("/agent_app_connector_authorization/request/input/authorization"),
        Some(&json!("[redacted:host_managed_secret]"))
    );
    assert_eq!(
        runtime_summary.pointer("/agent_app_connector_authorization/request/policy/secretBinding"),
        Some(&json!("host_managed"))
    );
    let serialized = serde_json::to_string(&metadata).expect("metadata json");
    assert!(!serialized.contains("notion-refresh-token"));
    assert!(!serialized.contains("notion-nested-token"));
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
fn test_agent_app_runtime_extracts_workspace_patch_from_markdown_with_unescaped_quotes() {
    let metadata = json!({
        "artifactDocument": {
            "blocks": [
                {
                    "type": "rich_text",
                    "content": "内容工厂最终产物：\n```json\n{\"contentFactoryWorkspacePatch\":{\"kind\":\"content_factory.workspace_patch\",\"artifactKind\":\"scene_table\",\"sceneTable\":{\"actualCount\":120,\"rows\":[{\"index\":1,\"imageBrief\":\"灶台实拍，突出\"一擦即净\"的视觉感。\"}]},\"imagePrompts\":{\"items\":[{\"title\":\"厨房台面\"}]}}}\n```"
                }
            ]
        }
    });

    let patch = extract_content_factory_workspace_patch_from_artifact_document(Some(&metadata))
        .expect("workspace patch");

    assert_eq!(
        patch.pointer("/sceneTable/rows/0/imageBrief"),
        Some(&json!("灶台实拍，突出\"一擦即净\"的视觉感。"))
    );
    assert_eq!(patch.pointer("/sceneTable/actualCount"), Some(&json!(120)));
    assert!(patch.get("imagePrompts").is_some());
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
        started_at: Some("2026-05-16T00:00:01.000Z".to_string()),
        finished_at: Some("2026-05-16T00:00:01.400Z".to_string()),
        updated_at: Some("2026-05-16T00:00:01.400Z".to_string()),
        arguments: Some(json!({ "skill": "research", "query": "竞品" })),
        output: Some("研究资料已整理".to_string()),
        output_preview: Some("研究资料已整理".to_string()),
        success: Some(true),
        error: None,
        evidence_refs: vec!["evidence://tool/research-1".to_string()],
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
    let tool_event = events
        .iter()
        .find(|event| event.event_type == "task:toolCall")
        .expect("tool call event");
    assert_eq!(
        tool_event.evidence_ref.as_deref(),
        Some("evidence://tool/research-1")
    );
    assert_eq!(
        tool_event.occurred_at.as_deref(),
        Some("2026-05-16T00:00:01.400Z")
    );
    assert_eq!(
        tool_event
            .payload
            .as_ref()
            .and_then(|payload| payload.get("arguments"))
            .and_then(|arguments| arguments.get("skill")),
        Some(&json!("research"))
    );
    assert_eq!(
        tool_event
            .payload
            .as_ref()
            .and_then(|payload| payload.get("outputPreview")),
        Some(&json!("研究资料已整理"))
    );
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
fn test_agent_app_runtime_task_events_project_connector_outbox_evidence() {
    let outbox_ref = "outbox://connector/notion/createPage/notion-create-page-1";
    let delivery_ref = "delivery://connector/notion/createPage/notion-create-page-1";
    let mut thread_read = base_thread_read();
    thread_read.profile_status = "completed".to_string();
    thread_read.tool_calls = vec![AgentRuntimeThreadToolCallView {
        tool_call_id: "tool-connector-1".to_string(),
        turn_id: "turn-1".to_string(),
        tool_name: "connector__notion__createPage".to_string(),
        status: "completed".to_string(),
        started_at: Some("2026-05-17T14:10:01.000Z".to_string()),
        finished_at: Some("2026-05-17T14:10:02.000Z".to_string()),
        updated_at: Some("2026-05-17T14:10:02.000Z".to_string()),
        arguments: Some(json!({
            "connectorId": "notion",
            "action": "createPage",
            "idempotencyKey": "notion-create-page-1",
        })),
        output: Some("queued_for_cloud_overlay".to_string()),
        output_preview: Some("queued_for_cloud_overlay".to_string()),
        success: Some(true),
        error: None,
        evidence_refs: vec![outbox_ref.to_string(), delivery_ref.to_string()],
    }];
    thread_read.evidence_summary = AgentRuntimeThreadEvidenceSummary {
        evidence_refs: vec![outbox_ref.to_string(), delivery_ref.to_string()],
        verification_outcomes: Vec::new(),
    };

    let events = build_agent_app_runtime_task_events(&thread_read);
    let tool_event = events
        .iter()
        .find(|event| event.id == "task:toolCall:tool-connector-1")
        .expect("connector tool event");

    assert_eq!(tool_event.status, "completed");
    assert_eq!(tool_event.evidence_ref.as_deref(), Some(outbox_ref));
    assert_eq!(
        tool_event
            .payload
            .as_ref()
            .and_then(|payload| payload.get("evidenceRef")),
        Some(&json!(outbox_ref))
    );
    assert_eq!(
        tool_event
            .payload
            .as_ref()
            .and_then(|payload| payload.get("outputPreview")),
        Some(&json!("queued_for_cloud_overlay"))
    );
    assert!(events.iter().any(|event| {
        event.event_type == "evidence:recorded" && event.evidence_ref.as_deref() == Some(outbox_ref)
    }));
    assert!(events.iter().any(|event| {
        event.event_type == "evidence:recorded"
            && event.evidence_ref.as_deref() == Some(delivery_ref)
    }));
}

#[test]
fn test_agent_app_runtime_task_events_project_report_workspace_patch_fields() {
    let mut thread_read = base_thread_read();
    thread_read.artifacts = vec![AgentRuntimeThreadArtifactView {
        item_id: "artifact-item-report".to_string(),
        turn_id: "turn-1".to_string(),
        path: ".lime/artifacts/agent-app/task-1/strategy_report.workspace-patch.json".to_string(),
        source: "agent_runtime".to_string(),
        status: "created".to_string(),
        artifact_type: Some("strategy_report".to_string()),
        title: Some("交付报告".to_string()),
        created_at: Some("2026-05-16T00:00:01.500Z".to_string()),
        completed_at: Some("2026-05-16T00:00:01.800Z".to_string()),
        updated_at: Some("2026-05-16T00:00:01.800Z".to_string()),
        metadata: Some(json!({
            "artifactKind": "strategy_report",
            "projectId": "project-1",
            "strategyReport": {
                "executiveSummary": {
                    "decision": "建议小范围试投"
                },
                "riskCheck": {
                    "status": "requires_review"
                }
            },
            "pptOutline": {
                "sections": [{ "title": "结论" }]
            }
        })),
    }];

    let events = build_agent_app_runtime_task_events(&thread_read);
    let artifact_event = events
        .iter()
        .find(|event| event.event_type == "artifact:created")
        .expect("artifact event");
    assert_eq!(
        artifact_event
            .payload
            .as_ref()
            .and_then(|payload| payload.get("contentFactoryWorkspacePatch"))
            .and_then(|patch| patch.pointer("/strategyReport/executiveSummary/decision")),
        Some(&json!("建议小范围试投"))
    );
    assert_eq!(
        artifact_event
            .payload
            .as_ref()
            .and_then(|payload| payload.get("contentFactoryWorkspacePatch"))
            .and_then(|patch| patch.pointer("/strategyReport/riskCheck/status")),
        Some(&json!("requires_review"))
    );
    assert!(events.iter().any(|event| {
        event.event_type == "evidence:recorded"
            && event
                .payload
                .as_ref()
                .and_then(|payload| payload.get("workspacePatch"))
                .and_then(|patch| patch.get("pptOutline"))
                .is_some()
    }));
}

#[test]
fn test_agent_app_runtime_task_events_materialize_stalled_content_factory_scenario() {
    let mut thread_read = base_thread_read();
    thread_read.runtime_summary = Some(json!({
        "surface": "agent_app",
        "appId": "content-factory-app",
        "taskId": "agent-app-task-1",
        "taskKind": "content_factory.scenario.generate"
    }));
    thread_read.incidents = vec![AgentRuntimeIncidentView {
        id: "incident-stuck-1".to_string(),
        thread_id: "thread-1".to_string(),
        turn_id: Some("turn-1".to_string()),
        item_id: None,
        incident_type: "turn_stuck".to_string(),
        severity: "high".to_string(),
        status: "active".to_string(),
        title: "当前回合长时间无进展".to_string(),
        details: None,
        detected_at: Some("2026-05-16T00:10:00.000Z".to_string()),
        cleared_at: None,
    }];
    thread_read.tool_calls = vec![
        AgentRuntimeThreadToolCallView {
            tool_call_id: "tool-knowledge".to_string(),
            turn_id: "turn-1".to_string(),
            tool_name: "Skill".to_string(),
            status: "completed".to_string(),
            started_at: Some("2026-05-16T00:00:01.000Z".to_string()),
            finished_at: Some("2026-05-16T00:00:02.000Z".to_string()),
            updated_at: Some("2026-05-16T00:00:02.000Z".to_string()),
            arguments: Some(json!({
                "skill": "knowledge-builder",
                "args": "项目：春季新品内容项目（sample_content_factory_spring）"
            })),
            output: Some("{\"status\":\"completed\"}".to_string()),
            output_preview: Some("knowledge-builder completed".to_string()),
            success: Some(true),
            error: None,
            evidence_refs: Vec::new(),
        },
        AgentRuntimeThreadToolCallView {
            tool_call_id: "tool-reviewer".to_string(),
            turn_id: "turn-1".to_string(),
            tool_name: "Skill".to_string(),
            status: "completed".to_string(),
            started_at: Some("2026-05-16T00:00:03.000Z".to_string()),
            finished_at: Some("2026-05-16T00:00:04.000Z".to_string()),
            updated_at: Some("2026-05-16T00:00:04.000Z".to_string()),
            arguments: Some(json!({ "skill": "content-reviewer" })),
            output: Some("{\"status\":\"completed\"}".to_string()),
            output_preview: Some("content-reviewer completed".to_string()),
            success: Some(true),
            error: None,
            evidence_refs: Vec::new(),
        },
    ];

    let events = build_agent_app_runtime_task_events(&thread_read);

    let artifact_event = events
        .iter()
        .find(|event| event.id == "artifact:created:stalled-content-factory:agent-app-task-1")
        .expect("stalled materialized artifact event");
    assert_eq!(artifact_event.status, "created");
    assert_eq!(
        artifact_event
            .payload
            .as_ref()
            .and_then(|payload| payload.get("contentFactoryWorkspacePatch"))
            .and_then(|patch| patch.get("projectId")),
        Some(&json!("sample_content_factory_spring"))
    );
    assert_eq!(
        artifact_event
            .payload
            .as_ref()
            .and_then(|payload| payload.get("contentFactoryWorkspacePatch"))
            .and_then(|patch| patch.pointer("/sceneTable/actualCount")),
        Some(&json!(120))
    );
    assert!(events.iter().any(|event| {
        event.event_type == "task:completed"
            && event
                .payload
                .as_ref()
                .and_then(|payload| payload.get("source"))
                == Some(&json!("agent_app_runtime_stalled_skill_materialization"))
    }));
    assert!(events.iter().any(|event| {
        event.event_type == "evidence:recorded"
            && event
                .payload
                .as_ref()
                .and_then(|payload| payload.get("contentFactoryWorkspacePatch"))
                .and_then(|patch| patch.get("skillEvidence"))
                .and_then(Value::as_array)
                .is_some_and(|items| items.len() == 2)
    }));
}

#[test]
fn test_agent_app_runtime_task_events_project_connector_authorization_gate() {
    let mut thread_read = base_thread_read();
    thread_read.profile_status = "blocked".to_string();
    thread_read.runtime_summary = Some(json!({
        "surface": "agent_app",
        "appId": "content-factory-app",
        "taskId": "task-auth-1",
        "agent_app_connector_authorization": {
            "version": "p18.7-e4",
            "source": "host_bridge_authorization_gate",
            "request": {
                "capability": "lime.connectors",
                "method": "requestAuth",
                "appId": "content-factory-app",
                "connectorId": "notion",
                "input": {
                    "connectorId": "notion",
                    "rawOauthToken": "[redacted:host_managed_secret]"
                },
                "reason": "connector_auth_requires_lime_policy_and_secret_binding",
                "policy": {
                    "owner": "lime_connector_policy",
                    "secretBinding": "host_managed",
                    "tokenExposed": false,
                    "sessionScoped": true
                }
            }
        }
    }));

    let events = build_agent_app_runtime_task_events(&thread_read);
    let auth_event = events
        .iter()
        .find(|event| event.id == "task:blocked:connector_authorization:notion")
        .expect("connector authorization event");

    assert_eq!(auth_event.event_type, "task:blocked");
    assert_eq!(auth_event.status, "requires_host_authorization");
    assert_eq!(
        auth_event.request_id.as_deref(),
        Some("connector_authorization:notion")
    );
    assert_eq!(
        auth_event
            .payload
            .as_ref()
            .and_then(|payload| payload.pointer("/authorizationGate/secretBinding")),
        Some(&json!("host_managed"))
    );
    assert_eq!(
        auth_event
            .payload
            .as_ref()
            .and_then(|payload| payload.pointer("/authorizationGate/tokenExposed")),
        Some(&json!(false))
    );
    let serialized = serde_json::to_string(&auth_event.payload).expect("payload json");
    assert!(!serialized.contains("notion-refresh-token"));
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
