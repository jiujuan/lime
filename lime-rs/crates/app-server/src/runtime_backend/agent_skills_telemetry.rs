use crate::{ExecutionRequest, RuntimeEvent};
use lime_skills::{read_agent_skill_body, AgentSkillSelection};
use serde_json::{json, Value};

pub(super) fn runtime_status_events_for_agent_skills(
    request: &ExecutionRequest,
) -> Vec<RuntimeEvent> {
    let host_request = super::request_context::aster_chat_request_from_request(request);
    let workspace_scope =
        super::request_context::request_workspace_scope(request, host_request.as_ref());
    let metadata_values = super::skill_runtime_enable::request_metadata_values(request);
    let snapshot = super::agent_skills_context::build_agent_skill_snapshot_for_turn(
        workspace_scope.working_dir.as_deref(),
        workspace_scope.project_root.as_deref(),
        &metadata_values,
    );
    let selections = super::agent_skills_context::selected_agent_skill_selections(
        &request.input.text,
        &metadata_values,
        &snapshot,
    );
    let body_selections =
        super::agent_skills_context::selected_agent_skill_body_selections_for_prompt(
            &request.input.text,
            &metadata_values,
            &snapshot,
        );
    let runtime_enable_sources =
        super::skill_runtime_enable::workspace_skill_runtime_enable_sources(request);
    let plugin_runtime_contexts =
        super::plugin_runtime_context::plugin_runtime_contexts(&metadata_values);

    let mut events = Vec::new();
    if !body_selections.is_empty() {
        events.extend(skill_body_read_events(&body_selections));
    }
    if !runtime_enable_sources.is_empty() || !selections.is_empty() {
        events.push(skill_gate_decision_event(
            runtime_enable_sources
                .iter()
                .map(|source| source.skill_name.clone())
                .collect(),
            selections
                .iter()
                .map(|selection| selection.locator.name.clone())
                .collect(),
            !runtime_enable_sources.is_empty(),
        ));
    }
    events.extend(
        plugin_runtime_contexts
            .into_iter()
            .map(plugin_runtime_event),
    );
    events
}

fn skill_body_read_events(selections: &[AgentSkillSelection]) -> Vec<RuntimeEvent> {
    selections
        .iter()
        .map(
            |selection| match read_agent_skill_body(&selection.locator) {
                Ok(body) => runtime_status_event(
                    "context",
                    "Skill instructions loaded",
                    format!("Loaded SKILL.md for `{}`.", selection.locator.name),
                    json!({
                        "skillRuntime": {
                            "event": "skill_body_read",
                            "skillName": selection.locator.name,
                            "trigger": selection.trigger,
                            "reason": selection.reason,
                            "skillFilePath": selection.locator.skill_file_path,
                            "status": "loaded",
                        "bodyChars": body.markdown_content.chars().count(),
                        }
                    }),
                ),
                Err(error) => runtime_status_event(
                    "failed",
                    "Skill instructions failed",
                    format!("Failed to load SKILL.md for `{}`.", selection.locator.name),
                    json!({
                        "skillRuntime": {
                            "event": "skill_body_read",
                            "skillName": selection.locator.name,
                            "trigger": selection.trigger,
                            "reason": selection.reason,
                            "skillFilePath": selection.locator.skill_file_path,
                            "status": "failed",
                            "error": error.to_string(),
                        }
                    }),
                ),
            },
        )
        .collect()
}

fn skill_gate_decision_event(
    source_allowlist: Vec<String>,
    selected_skills: Vec<String>,
    workspace_runtime_enable: bool,
) -> RuntimeEvent {
    let mode = if workspace_runtime_enable {
        "workspace_runtime_enable"
    } else {
        "selected_skills"
    };
    runtime_status_event(
        "permission_review",
        "Skill gate decision",
        if workspace_runtime_enable {
            "Workspace skill runtime enable applied.".to_string()
        } else {
            "Selected skills were allowed for this turn.".to_string()
        },
        json!({
            "skillRuntime": {
                "event": "skill_gate_decision",
                "mode": mode,
                "workspaceRuntimeEnable": workspace_runtime_enable,
                "sourceAllowlist": source_allowlist,
                "selectedSkills": selected_skills,
            }
        }),
    )
}

fn plugin_runtime_event(
    context: super::plugin_runtime_context::PluginRuntimeContext,
) -> RuntimeEvent {
    runtime_status_event(
        "context",
        "Plugin runtime capabilities",
        format!(
            "Loaded runtime capabilities for plugin `{}`.",
            context.plugin_id
        ),
        json!({
            "skillRuntime": {
                "event": "plugin_runtime_capabilities",
                "pluginId": context.plugin_id,
                "version": context.version,
                "activeWorkflowKey": context.active_workflow_key,
                "activeTaskKind": context.active_task_kind,
                "promptSkills": context
                    .prompt_injection_skills()
                    .into_iter()
                    .map(|skill| json!({
                        "id": skill.id,
                        "title": skill.title,
                        "policy": skill.prompt_injection_mode,
                        "source": skill.prompt_injection_source,
                        "required": skill.required,
                    }))
                    .collect::<Vec<_>>(),
                "mcpBindings": context
                    .mcp_bindings
                    .into_iter()
                    .map(|binding| json!({
                        "serverId": binding.server_id,
                        "toolKey": binding.tool_key,
                        "provider": binding.provider,
                        "required": binding.required,
                    }))
                    .collect::<Vec<_>>(),
            }
        }),
    )
}

fn runtime_status_event(
    phase: &str,
    title: impl Into<String>,
    detail: impl Into<String>,
    metadata: Value,
) -> RuntimeEvent {
    RuntimeEvent::new(
        "runtime.status",
        json!({
            "status": {
                "phase": phase,
                "title": title.into(),
                "detail": detail.into(),
                "metadata": metadata,
            }
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    #[test]
    fn emits_body_read_and_gate_decision_for_explicit_skill_selection() {
        let workspace = TempDir::new().expect("workspace");
        write_agent_skill(&workspace, "writer");
        let request = super::super::tests::request_for_test(
            "请用 $writer 改写这段话",
            None,
            Some(json!({
                "workspaceRoot": workspace.path().to_string_lossy().to_string(),
            })),
        );

        let events = runtime_status_events_for_agent_skills(&request);

        assert_eq!(events.len(), 2);
        assert!(events
            .iter()
            .all(|event| event.event_type == "runtime.status"));
        assert_eq!(
            events[0].payload["status"]["metadata"]["skillRuntime"]["event"],
            json!("skill_body_read")
        );
        assert_eq!(
            events[0].payload["status"]["metadata"]["skillRuntime"]["skillName"],
            json!("writer")
        );
        assert_eq!(
            events[1].payload["status"]["metadata"]["skillRuntime"]["event"],
            json!("skill_gate_decision")
        );
        assert_eq!(
            events[1].payload["status"]["metadata"]["skillRuntime"]["mode"],
            json!("selected_skills")
        );
    }

    #[test]
    fn emits_catalog_bound_skill_telemetry_from_service_scene_metadata() {
        let workspace = TempDir::new().expect("workspace");
        write_agent_skill(&workspace, "writer");
        let request = super::super::tests::request_for_test(
            "帮我处理这段话",
            None,
            Some(json!({
                "workspaceRoot": workspace.path().to_string_lossy().to_string(),
                "harness": {
                    "service_scene_launch": {
                        "service_scene_run": {
                            "skill_key": "local:writer"
                        }
                    }
                }
            })),
        );

        let events = runtime_status_events_for_agent_skills(&request);

        assert_eq!(events.len(), 2);
        assert_eq!(
            events[0].payload["status"]["metadata"]["skillRuntime"]["event"],
            json!("skill_body_read")
        );
        assert_eq!(
            events[0].payload["status"]["metadata"]["skillRuntime"]["trigger"],
            json!("catalog_binding")
        );
        assert_eq!(
            events[1].payload["status"]["metadata"]["skillRuntime"]["selectedSkills"],
            json!(["writer"])
        );
    }

    #[test]
    fn emits_expert_bound_skill_telemetry_from_expert_metadata() {
        let workspace = TempDir::new().expect("workspace");
        write_agent_skill(&workspace, "writer");
        let request = super::super::tests::request_for_test(
            "帮我处理这段话",
            None,
            Some(json!({
                "workspaceRoot": workspace.path().to_string_lossy().to_string(),
                "harness": {
                    "expert": {
                        "skill_refs": ["skill:writer"]
                    }
                }
            })),
        );

        let events = runtime_status_events_for_agent_skills(&request);

        assert_eq!(events.len(), 1);
        assert_eq!(
            events[0].payload["status"]["metadata"]["skillRuntime"]["event"],
            json!("skill_gate_decision")
        );
        assert_eq!(
            events[0].payload["status"]["metadata"]["skillRuntime"]["selectedSkills"],
            json!(["writer"])
        );
    }

    #[test]
    fn emits_plugin_runtime_capability_telemetry() {
        let request = super::super::tests::request_for_test(
            "写一篇文章",
            None,
            Some(json!({
                "harness": {
                    "plugin_activation": {
                        "plugin_id": "content-factory-app",
                        "workflow_key": "content-article",
                        "runtime_capabilities": {
                            "pluginId": "content-factory-app",
                            "skills": [
                                {
                                    "id": "article-writing",
                                    "promptInjectionPolicy": {
                                        "mode": "workflow_scoped",
                                        "source": "runtimeCapabilities.skills"
                                    }
                                }
                            ],
                            "mcpBindings": [
                                {
                                    "serverId": "browser",
                                    "toolKey": "browser/search",
                                    "provider": "mcp",
                                    "required": true
                                }
                            ],
                            "workflowBindings": [
                                {
                                    "workflowKey": "content-article",
                                    "skillIds": ["article-writing"]
                                }
                            ]
                        }
                    }
                }
            })),
        );

        let events = runtime_status_events_for_agent_skills(&request);
        let event = events
            .iter()
            .find(|event| {
                event.payload["status"]["metadata"]["skillRuntime"]["event"]
                    == json!("plugin_runtime_capabilities")
            })
            .expect("plugin runtime event");

        assert_eq!(
            event.payload["status"]["metadata"]["skillRuntime"]["pluginId"],
            json!("content-factory-app")
        );
        assert_eq!(
            event.payload["status"]["metadata"]["skillRuntime"]["promptSkills"][0]["id"],
            json!("article-writing")
        );
        assert_eq!(
            event.payload["status"]["metadata"]["skillRuntime"]["mcpBindings"][0]["serverId"],
            json!("browser")
        );
    }

    #[test]
    fn unknown_service_scene_metadata_emits_no_skill_telemetry() {
        let workspace = TempDir::new().expect("workspace");
        write_agent_skill(&workspace, "writer");
        let request = super::super::tests::request_for_test(
            "帮我处理这段话",
            None,
            Some(json!({
                "workspaceRoot": workspace.path().to_string_lossy().to_string(),
                "harness": {
                    "service_scene_launch": {
                        "service_scene_run": {
                            "skill_key": "missing"
                        }
                    }
                }
            })),
        );

        let events = runtime_status_events_for_agent_skills(&request);

        assert!(events.is_empty());
    }

    fn write_agent_skill(workspace: &TempDir, name: &str) {
        let skill_dir = workspace.path().join(".agents").join("skills").join(name);
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(
            skill_dir.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: Test skill.\n---\n\n# {name}\n"),
        )
        .expect("skill");
    }
}
