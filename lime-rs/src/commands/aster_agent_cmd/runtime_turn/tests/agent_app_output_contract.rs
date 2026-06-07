use super::*;

#[test]
fn agent_app_output_contract_should_extract_model_workspace_patch() {
    let metadata = json!({
        "contentFactory": {
            "projectId": "project-1"
        },
        "harness": {
            "agent_app_runtime": {
                "app_id": "content-factory-app",
                "task_id": "task-1",
                "task_kind": "content_factory.delivery.prepare"
            },
            "agent_app_runtime_output_contract": {
                "artifact_kind": "strategy_report",
                "artifact_metadata_kind": "content_factory.workspace_patch"
            }
        }
    });
    let final_text = r#"交付结论如下：
```json
{
  "contentFactoryWorkspacePatch": {
"strategyReport": {
  "executiveSummary": {
    "decision": "建议进入小范围试投",
    "reason": "证据链完整"
  }
},
"pptOutline": {
  "sections": [{ "title": "结论" }]
}
  }
}
```"#;

    let patch = build_agent_app_output_contract_workspace_patch(Some(&metadata), final_text)
        .expect("workspace patch should be extracted");

    assert_eq!(
        patch.get("kind"),
        Some(&json!("content_factory.workspace_patch"))
    );
    assert_eq!(patch.get("artifactKind"), Some(&json!("strategy_report")));
    assert_eq!(patch.get("projectId"), Some(&json!("project-1")));
    assert_eq!(
        patch.pointer("/strategyReport/executiveSummary/decision"),
        Some(&json!("建议进入小范围试投"))
    );
}

#[test]
fn agent_app_output_contract_should_scope_model_patch_to_host_project() {
    let metadata = json!({
        "contentFactory": {
            "projectId": "active-project-1"
        },
        "harness": {
            "agent_app_runtime": {
                "app_id": "content-factory-app",
                "task_id": "task-1",
                "task_kind": "content_factory.scenario.generate"
            },
            "agent_app_runtime_output_contract": {
                "artifact_kind": "scene_table",
                "artifact_metadata_kind": "content_factory.workspace_patch"
            }
        }
    });
    let final_text = r#"```json
{
  "contentFactoryWorkspacePatch": {
"kind": "content_factory.workspace_patch",
"artifactKind": "scene_table",
"projectId": "sample_content_factory_spring",
"sceneTable": {
  "actualCount": 120,
  "rows": [{ "scene": "厨房台面清洁", "dimension": "厨房", "decisionStage": "第一次了解", "imageBrief": "灶台实拍" }]
},
"imagePrompts": [{ "prompt": "厨房台面清洁前后对比" }]
  }
}
```"#;

    let patch = build_agent_app_output_contract_workspace_patch(Some(&metadata), final_text)
        .expect("workspace patch should be extracted");

    assert_eq!(patch.get("projectId"), Some(&json!("active-project-1")));
    assert_eq!(patch.get("artifactKind"), Some(&json!("scene_table")));
    assert_eq!(patch.pointer("/sceneTable/actualCount"), Some(&json!(120)));
}

#[test]
fn agent_app_output_contract_should_repair_unescaped_quotes_in_model_patch() {
    let metadata = json!({
        "contentFactory": {
            "projectId": "active-project-1"
        },
        "harness": {
            "agent_app_runtime": {
                "app_id": "content-factory-app",
                "task_id": "task-1",
                "task_kind": "content_factory.copy.generate"
            },
            "agent_app_runtime_output_contract": {
                "artifact_kind": "content_batch",
                "artifact_metadata_kind": "content_factory.workspace_patch"
            }
        }
    });
    let final_text = r#"```json
{
  "contentFactoryWorkspacePatch": {
"kind": "content_factory.workspace_patch",
"artifactKind": "content_batch",
"projectId": "sample_content_factory_spring",
"contentBatch": {
  "items": [{
    "id": "copy-1",
    "title": "厨房清洁",
    "content": "灶台实拍，突出"一擦即净"这类用户原话时仍需保留引号。"
  }]
}
  }
}
```"#;

    let patch = build_agent_app_output_contract_workspace_patch(Some(&metadata), final_text)
        .expect("workspace patch with unescaped quotes should be repaired");

    assert_eq!(patch.get("projectId"), Some(&json!("active-project-1")));
    assert_eq!(patch.get("artifactKind"), Some(&json!("content_batch")));
    assert_eq!(
        patch.pointer("/contentBatch/items/0/content"),
        Some(&json!(
            "灶台实拍，突出\"一擦即净\"这类用户原话时仍需保留引号。"
        ))
    );
}

#[test]
fn agent_app_output_contract_should_materialize_strategy_report_when_model_omits_patch() {
    let metadata = json!({
        "contentFactory": {
            "projectId": "project-1"
        },
        "harness": {
            "agent_app_runtime": {
                "app_id": "content-factory-app",
                "task_id": "task-1",
                "task_kind": "content_factory.delivery.prepare"
            },
            "agent_app_runtime_output_contract": {
                "artifact_kind": "strategy_report",
                "artifact_metadata_kind": "content_factory.workspace_patch"
            },
            "content_factory_skill_contract": {
                "required_skills": [
                    { "skill": "article-writer", "required": true },
                    { "skill": "content-reviewer", "required": true }
                ]
            }
        }
    });

    let patch = build_agent_app_output_contract_workspace_patch(
        Some(&metadata),
        "建议进入小范围试投，先复用已确认内容资产验证转化。",
    )
    .expect("report patch should be materialized from runtime output");

    assert_eq!(patch.get("artifactKind"), Some(&json!("strategy_report")));
    assert_eq!(
        patch.pointer("/strategyReport/status"),
        Some(&json!("requires_review"))
    );
    assert_eq!(
        patch.pointer("/strategyReport/executiveSummary/decision"),
        Some(&json!("建议进入小范围试投，先复用已确认内容资产验证转化。"))
    );
    assert_eq!(
        patch.pointer("/skillEvidence/0/skill"),
        Some(&json!("article-writer"))
    );
    assert!(patch.get("pptOutline").is_some());
}

#[test]
fn agent_app_output_contract_should_not_fake_content_batch_without_patch() {
    let metadata = json!({
        "harness": {
            "agent_app_runtime": {
                "app_id": "content-factory-app",
                "task_id": "task-1",
                "task_kind": "content_factory.copy.generate"
            },
            "agent_app_runtime_output_contract": {
                "artifact_kind": "content_batch",
                "artifact_metadata_kind": "content_factory.workspace_patch"
            }
        }
    });

    assert!(build_agent_app_output_contract_workspace_patch(
        Some(&metadata),
        "这里只是自然语言总结，没有结构化内容包。",
    )
    .is_none());
}

#[test]
fn agent_app_output_contract_should_materialize_script_batch_review_draft() {
    let metadata = json!({
        "contentFactory": {
            "projectId": "project-1"
        },
        "harness": {
            "agent_app_runtime": {
                "app_id": "content-factory-app",
                "task_id": "task-1",
                "task_kind": "content_factory.script.generate"
            },
            "agent_app_runtime_output_contract": {
                "artifact_kind": "script_batch",
                "artifact_metadata_kind": "content_factory.workspace_patch"
            },
            "content_factory_skill_contract": {
                "required_skills": [
                    { "skill": "article-writer", "required": true },
                    { "skill": "content-reviewer", "required": true }
                ]
            }
        }
    });

    let patch = build_agent_app_output_contract_workspace_patch(
        Some(&metadata),
        "先给出 6 条短视频脚本草稿，等待人工复核后再进入正式交付。",
    )
    .expect("script draft patch should be materialized from runtime output");

    assert_eq!(patch.get("artifactKind"), Some(&json!("script_batch")));
    assert_eq!(patch.get("requiresHumanReview"), Some(&json!(true)));
    assert_eq!(
        patch.pointer("/scripts/0/templateLabel"),
        Some(&json!("AI Agent 脚本草稿（需复核）"))
    );
    assert_eq!(
        patch.pointer("/skillEvidence/1/skill"),
        Some(&json!("content-reviewer"))
    );
}
