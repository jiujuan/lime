use crate::services::capability_draft_service::CapabilityDraftRegistrationSummary;
use crate::services::runtime_skill_binding_service::resolve_workspace_skill_runtime_enable;
use serde_json::json;
use std::fs;
use tempfile::TempDir;

fn write_registered_skill(
    workspace: &TempDir,
    directory: &str,
    source_verification_report_id: Option<&str>,
) {
    let skill_dir = workspace
        .path()
        .join(".agents")
        .join("skills")
        .join(directory);
    fs::create_dir_all(skill_dir.join(".lime")).expect("create skill metadata dir");
    fs::write(
        skill_dir.join("SKILL.md"),
        [
            "---",
            "name: 只读报告",
            "description: 把本地只读输入整理成 Markdown 报告。",
            "---",
            "",
            "# 只读报告",
            "",
            "## 何时使用",
            "当用户需要把本地只读输入整理成 Markdown 报告时使用。",
            "",
            "## 输入",
            "- topic: 报告主题",
            "",
            "## 执行步骤",
            "1. 读取用户提供的本地输入。",
            "2. 提炼趋势、异常和建议。",
            "",
            "## 输出",
            "- markdown_report: Markdown 摘要",
        ]
        .join("\n"),
    )
    .expect("write skill");

    let registration = CapabilityDraftRegistrationSummary {
        registration_id: format!("capreg-{directory}"),
        registered_at: "2026-05-26T00:00:00.000Z".to_string(),
        skill_directory: directory.to_string(),
        registered_skill_directory: skill_dir.to_string_lossy().to_string(),
        source_draft_id: format!("capdraft-{directory}"),
        source_verification_report_id: source_verification_report_id.map(ToString::to_string),
        generated_file_count: 1,
        permission_summary: vec!["Level 0 只读发现".to_string()],
        verification_gates: Vec::new(),
        approval_requests: Vec::new(),
    };
    fs::write(
        skill_dir.join(".lime").join("registration.json"),
        serde_json::to_string_pretty(&registration).expect("serialize registration"),
    )
    .expect("write registration");
}

#[test]
fn managed_objective_runtime_enable_rejects_unverified_workspace_skill() {
    let workspace = TempDir::new().expect("workspace");
    write_registered_skill(&workspace, "capability-unverified", None);
    let workspace_root = workspace.path().to_string_lossy();
    let metadata = json!({
        "harness": {
            "managed_objective": {
                "objective_id": "objective-1",
                "owner_type": "automation_job",
                "continuation_policy": {
                    "dispatch": "agent_runtime_submit_turn"
                }
            },
            "workspace_skill_runtime_enable": {
                "source": "managed_objective_due_job",
                "approval": "automation_objective_policy",
                "workspace_root": workspace_root,
                "bindings": [{
                    "directory": "capability-unverified"
                }]
            }
        }
    });

    let error = resolve_workspace_skill_runtime_enable(Some(&metadata), &workspace_root)
        .expect_err("unverified workspace skill must be blocked");

    assert!(error.contains("当前不可启用"));
    assert!(error.contains("verification report"));
}

#[test]
fn managed_objective_runtime_enable_projects_verified_workspace_skill_source() {
    let workspace = TempDir::new().expect("workspace");
    write_registered_skill(&workspace, "capability-verified", Some("capver-verified"));
    let workspace_root = workspace.path().to_string_lossy();
    let metadata = json!({
        "harness": {
            "managed_objective": {
                "objective_id": "objective-1",
                "owner_type": "automation_job",
                "continuation_policy": {
                    "dispatch": "agent_runtime_submit_turn"
                }
            },
            "workspace_skill_runtime_enable": {
                "source": "managed_objective_due_job",
                "approval": "automation_objective_policy",
                "workspace_root": workspace_root,
                "bindings": [{
                    "directory": "capability-verified"
                }]
            }
        }
    });

    let projection = resolve_workspace_skill_runtime_enable(Some(&metadata), &workspace_root)
        .expect("runtime enable should resolve")
        .expect("runtime enable projection");

    assert_eq!(projection.source, "managed_objective_due_job");
    assert_eq!(projection.approval, "automation_objective_policy");
    assert_eq!(projection.bindings.len(), 1);
    assert_eq!(
        projection.bindings[0].source_verification_report_id,
        "capver-verified"
    );
    assert!(projection
        .allowed_skill_names
        .contains(&"project:capability-verified".to_string()));
}
