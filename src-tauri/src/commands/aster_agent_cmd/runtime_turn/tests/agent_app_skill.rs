use super::*;

#[test]
fn agent_app_skill_contract_should_resolve_required_skill_allowlist() {
    let metadata = json!({
        "harness": {
            "theme": "general",
            "session_mode": "default",
            "allow_model_skills": true,
            "content_factory_skill_contract": {
                "policy": "must_use_required_skills_before_final_patch",
                "required_skills": [
                    { "id": "article-writer", "skill": "article-writer", "required": true },
                    { "id": "content-reviewer", "skill": "content-reviewer", "required": true },
                    { "id": "draft-only", "skill": "draft-only", "required": false }
                ]
            }
        }
    });

    assert_eq!(
        resolve_agent_app_required_skill_tool_allowlist(Some(&metadata)),
        Some(vec![
            "article-writer".to_string(),
            "content-reviewer".to_string()
        ])
    );
    assert!(should_enable_model_skill_tool(Some(&metadata)));
}

#[test]
fn agent_app_required_skill_params_should_preserve_contract_for_fast_path() {
    let metadata = json!({
        "harness": {
            "agent_app_runtime": {
                "app_id": "content-factory-app",
                "task_id": "task-1",
                "task_kind": "content_factory.copy.generate"
            },
            "agent_app_runtime_output_contract": {
                "artifact_kind": "content_batch"
            },
            "content_factory_skill_contract": {
                "policy": "must_use_required_skills_before_final_patch",
                "required_skills": [
                    { "skill": "article-writer", "required": true },
                    { "skill": "content-reviewer", "required": true }
                ]
            }
        }
    });
    let (contract, names) = resolve_agent_app_required_skill_contract(Some(&metadata))
        .expect("required skill contract");
    let params = build_agent_app_required_skill_tool_params(
        Some(&metadata),
        &contract,
        &names[0],
        0,
        "session-1",
        "thread-1",
        "turn-1",
    );

    assert_eq!(params.get("skill"), Some(&json!("article-writer")));
    assert_eq!(
        params.pointer("/args/agentTaskContract/runtimeSurface"),
        Some(&json!("agent_app"))
    );
    assert_eq!(
        params.pointer("/args/agentTaskContract/requiredSkills/1/skill"),
        Some(&json!("content-reviewer"))
    );
    assert_eq!(
        params.pointer("/args/agentAppRuntime/app_id"),
        Some(&json!("content-factory-app"))
    );
    assert_eq!(
        params.pointer("/args/outputContract/artifact_kind"),
        Some(&json!("content_batch"))
    );
    assert_eq!(
        params.pointer("/args/runtime/sessionId"),
        Some(&json!("session-1"))
    );
}

#[tokio::test]
async fn agent_app_required_skill_params_should_execute_lime_skill_fast_path() {
    let session_id = format!("agent-app-required-skill-{}", Uuid::new_v4());
    let metadata = json!({
        "harness": {
            "content_factory_skill_contract": {
                "policy": "must_use_required_skills_before_final_patch",
                "required_skills": [
                    { "skill": "article-writer", "required": true }
                ]
            }
        }
    });
    let (contract, names) = resolve_agent_app_required_skill_contract(Some(&metadata))
        .expect("required skill contract");
    let params = build_agent_app_required_skill_tool_params(
        Some(&metadata),
        &contract,
        &names[0],
        0,
        session_id.as_str(),
        "thread-1",
        "turn-1",
    );
    lime_agent::tools::set_skill_tool_session_allowed_skills(
        session_id.as_str(),
        ["article-writer"],
    );
    let context = build_image_skill_launch_tool_context(
        ".",
        session_id.as_str(),
        "thread-1",
        "turn-1",
        None,
        None,
    );
    let tool = lime_agent::tools::LimeSkillTool::new();
    let result = aster::tools::Tool::execute(&tool, params, &context)
        .await
        .expect("required Skill should execute through LimeSkillTool fast path");
    lime_agent::tools::clear_skill_tool_session_access(session_id.as_str());

    assert_eq!(
        result.metadata.get("agent_app_skill_fast_path"),
        Some(&json!(true))
    );
    assert_eq!(
        result.metadata.get("skill_name"),
        Some(&json!("article-writer"))
    );
    assert!(result
        .metadata
        .get("content_factory_skill_evidence")
        .is_some());
}

#[test]
fn agent_app_required_skill_context_should_inherit_runtime_provider() {
    let provider: Arc<dyn Provider> = Arc::new(AutoCompactThresholdTestProvider::new(None));
    let context = build_image_skill_launch_tool_context(
        ".",
        "session-with-direct-provider",
        "thread-1",
        "turn-1",
        None,
        None,
    );
    let context = attach_provider_to_tool_context(context, Some(provider));

    assert!(context.provider.is_some());
    assert_eq!(
        context
            .provider
            .as_ref()
            .map(|provider| provider.get_name()),
        Some("auto-compact-threshold-test")
    );
}

#[test]
fn agent_app_required_skill_tool_end_should_project_invocation_metadata() {
    let tool_result = aster::tools::ToolResult::success("{}").with_metadata(
        "content_factory_skill_evidence",
        json!({ "status": "recorded" }),
    );
    let result = agent_app_required_skill_agent_tool_result(
        "content-reviewer",
        "test_required_skill",
        tool_result,
    );
    let event = RuntimeAgentEvent::ToolEnd {
        tool_id: "tool-1".to_string(),
        result,
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
    let task_event_value = Value::Object(task_event.clone());

    assert_eq!(task_event.get("eventType"), Some(&json!("task:toolCall")));
    assert_eq!(task_event.get("status"), Some(&json!("completed")));
    assert_eq!(
        task_event.get("toolName"),
        Some(&json!("Skill(content-reviewer)"))
    );
    assert_eq!(
        task_event_value.pointer("/payload/result/metadata/skill_name"),
        Some(&json!("content-reviewer"))
    );
    assert_eq!(
        task_event_value.pointer("/payload/result/metadata/agent_app_required_skill_contract"),
        Some(&json!(true))
    );
}
