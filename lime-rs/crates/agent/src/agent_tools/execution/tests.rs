use super::policy::*;
use super::{
    decide_tool_execution, ToolExecutionDecisionInput, ToolExecutionDecisionKind,
    ToolExecutionPolicyService,
};
use crate::agent_tools::catalog::{tool_catalog_entry, WorkspaceToolSurface};
use aster::permission::{PermissionScope, ToolPermission};
use lime_core::config::{
    ToolExecutionCommandRiskLevelConfig as ConfigToolExecutionCommandRiskLevelConfig,
    ToolExecutionCommandRuleConfig as ConfigToolExecutionCommandRuleConfig,
    ToolExecutionCommandRuleMatchTypeConfig as ConfigToolExecutionCommandRuleMatchTypeConfig,
    ToolExecutionOverrideConfig as ConfigToolExecutionOverrideConfig,
    ToolExecutionPolicyConfig as ConfigToolExecutionPolicyConfig,
    ToolExecutionRestrictionProfileConfig as ConfigToolExecutionRestrictionProfileConfig,
    ToolExecutionSandboxProfileConfig as ConfigToolExecutionSandboxProfileConfig,
    ToolExecutionWarningPolicyConfig as ConfigToolExecutionWarningPolicyConfig,
};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

fn assert_bash_allows_restricted_command(permissions: Vec<ToolPermission>) {
    let mut manager = aster::permission::ToolPermissionManager::new(None);
    for permission in permissions {
        manager.add_permission(permission, PermissionScope::Session);
    }
    let params = HashMap::from([(
        "command".to_string(),
        json!("test -f .baoyu-skills/baoyu-xhs-images/EXTEND.md"),
    )]);
    let context = aster::permission::PermissionContext {
        working_directory: std::path::PathBuf::from("/tmp/workspace"),
        session_id: "session-full-access".to_string(),
        timestamp: chrono::Utc::now().timestamp(),
        user: None,
        environment: HashMap::new(),
        metadata: HashMap::new(),
    };
    assert!(manager.is_allowed("Bash", &params, &context).allowed);
}

fn permission_manager_for(
    permissions: Vec<ToolPermission>,
) -> aster::permission::ToolPermissionManager {
    let mut manager = aster::permission::ToolPermissionManager::new(None);
    for permission in permissions {
        manager.add_permission(permission, PermissionScope::Session);
    }
    manager
}

fn permission_context(workspace_root: &Path) -> aster::permission::PermissionContext {
    aster::permission::PermissionContext {
        working_directory: workspace_root.to_path_buf(),
        session_id: "session-explicit-local-path".to_string(),
        timestamp: chrono::Utc::now().timestamp(),
        user: None,
        environment: HashMap::new(),
        metadata: HashMap::new(),
    }
}

#[test]
fn test_tool_execution_policy_marks_bash_as_sandboxed_shell_risk() {
    let policy = tool_execution_policy("Bash");
    assert_eq!(
        policy.warning_policy,
        ToolExecutionWarningPolicy::ShellCommandRisk
    );
    assert_eq!(
        policy.restriction_profile,
        ToolExecutionRestrictionProfile::WorkspaceShellCommand
    );
    assert_eq!(
        policy.sandbox_profile,
        ToolExecutionSandboxProfile::WorkspaceCommand
    );
}

#[test]
fn test_tool_policy_rule_catalog_uses_registered_canonical_tool_names() {
    let mut seen_tool_names = HashSet::new();

    for rule in super::rules::tool_policy_rules() {
        assert!(
            !rule.tool_names.is_empty(),
            "policy rule should target at least one tool"
        );
        for tool_name in rule.tool_names {
            let catalog_entry = tool_catalog_entry(tool_name)
                .unwrap_or_else(|| panic!("policy rule tool should exist: {tool_name}"));
            assert_eq!(catalog_entry.name, *tool_name);
            assert!(
                seen_tool_names.insert(*tool_name),
                "tool should have one default policy rule: {tool_name}"
            );
        }
    }
}

#[test]
fn test_shell_command_classifier_reports_highest_risk_segment() {
    let rule_match = tool_runtime::execution_rules::classify_shell_command_with_rules(
        "git status && rm -rf target/tmp",
        &[],
    )
    .expect("shell command should match a policy rule");

    assert_eq!(rule_match.rule_id, "destructive_remove");
    assert_eq!(rule_match.risk_level.label(), "high");
    assert_eq!(rule_match.reason_code, "destructive_remove_command");
}

#[test]
fn test_shell_command_classifier_does_not_treat_file_paths_as_rm_flags() {
    assert!(
        tool_runtime::execution_rules::classify_shell_command_with_rules("rm feature.txt", &[])
            .is_none()
    );

    let rule_match =
        tool_runtime::execution_rules::classify_shell_command_with_rules("rm -Rf target/tmp", &[])
            .expect("recursive force remove should match policy rule");
    assert_eq!(rule_match.rule_id, "destructive_remove");
}

#[test]
fn test_tool_execution_policy_marks_view_image_as_workspace_path_tool() {
    let policy = tool_execution_policy("view_image");
    assert_eq!(
        policy.restriction_profile,
        ToolExecutionRestrictionProfile::WorkspacePathRequired
    );
    assert_eq!(policy.warning_policy, ToolExecutionWarningPolicy::None);
    assert_eq!(policy.sandbox_profile, ToolExecutionSandboxProfile::None);
}

#[test]
fn test_decide_tool_execution_requires_approval_for_shell_on_request_policy() {
    let params = json!({ "command": "cargo test" });
    let decision = decide_tool_execution(ToolExecutionDecisionInput {
        tool_name: "Bash",
        params: &params,
        working_directory: Path::new("/tmp/workspace"),
        surface: "runtime_tool",
        auto_mode: false,
        bypass_restrictions: false,
        approval_policy: Some("on_request"),
        requested_sandbox_policy: Some("workspace-write"),
        resolver_input: ToolExecutionResolverInput::default(),
    });

    assert_eq!(decision.kind, ToolExecutionDecisionKind::RequiresApproval);
    assert!(decision.requires_approval());
    assert_eq!(decision.reason_code, "shell_command_requires_approval");
    assert_eq!(
        decision.metadata.get("decisionOwner"),
        Some(&json!("workspace_tool_execution"))
    );
    assert_eq!(
        decision.metadata.get("approvalPolicy"),
        Some(&json!("on_request"))
    );
    assert_eq!(decision.metadata.get("command"), Some(&json!("cargo test")));
    assert!(decision.requires_sandboxed_execution());
    assert!(!decision.workspace_sandbox_backend_enforced());
}

#[test]
fn test_decide_tool_execution_adds_shell_command_rule_metadata() {
    let params = json!({ "command": "git push origin main" });
    let decision = decide_tool_execution(ToolExecutionDecisionInput {
        tool_name: "Bash",
        params: &params,
        working_directory: Path::new("/tmp/workspace"),
        surface: "runtime_tool",
        auto_mode: false,
        bypass_restrictions: false,
        approval_policy: Some("on_request"),
        requested_sandbox_policy: Some("workspace-write"),
        resolver_input: ToolExecutionResolverInput::default(),
    });

    assert_eq!(decision.kind, ToolExecutionDecisionKind::RequiresApproval);
    assert_eq!(
        decision.metadata.get("commandRuleId"),
        Some(&json!("git_state_mutation"))
    );
    assert_eq!(
        decision.metadata.get("commandRiskLevel"),
        Some(&json!("medium"))
    );
    assert_eq!(
        decision.metadata.get("commandRiskReasonCode"),
        Some(&json!("git_state_mutation_command"))
    );
    assert_eq!(
        decision.metadata.get("commandRuleSource"),
        Some(&json!("default"))
    );
}

#[test]
fn test_decide_tool_execution_uses_runtime_shell_command_rule_metadata() {
    let request_metadata = json!({
        "harness": {
            "executionPolicy": {
                "shellCommandRules": [
                    {
                        "ruleId": "runtime_git_push",
                        "pattern": "\\bgit\\s+push\\b",
                        "riskLevel": "high",
                        "reasonCode": "runtime_blocks_git_push",
                        "reason": "请求级策略要求人工确认 git push"
                    }
                ]
            }
        }
    });
    let params = json!({ "command": "git push origin main" });
    let decision = decide_tool_execution(ToolExecutionDecisionInput {
        tool_name: "Bash",
        params: &params,
        working_directory: Path::new("/tmp/workspace"),
        surface: "runtime_tool",
        auto_mode: false,
        bypass_restrictions: false,
        approval_policy: Some("on_request"),
        requested_sandbox_policy: Some("workspace-write"),
        resolver_input: ToolExecutionResolverInput {
            persisted_policy: None,
            request_metadata: Some(&request_metadata),
        },
    });

    assert_eq!(decision.kind, ToolExecutionDecisionKind::RequiresApproval);
    assert_eq!(
        decision.metadata.get("commandRuleId"),
        Some(&json!("runtime_git_push"))
    );
    assert_eq!(
        decision.metadata.get("commandRuleSource"),
        Some(&json!("runtime"))
    );
    assert_eq!(
        decision.metadata.get("commandRiskLevel"),
        Some(&json!("high"))
    );
    assert_eq!(
        decision.metadata.get("commandRiskReasonCode"),
        Some(&json!("runtime_blocks_git_push"))
    );
}

#[test]
fn test_decide_tool_execution_allows_shell_when_approval_policy_never() {
    let params = json!({ "command": "cargo test" });
    let decision = decide_tool_execution(ToolExecutionDecisionInput {
        tool_name: "Bash",
        params: &params,
        working_directory: Path::new("/tmp/workspace"),
        surface: "runtime_tool",
        auto_mode: false,
        bypass_restrictions: false,
        approval_policy: Some("never"),
        requested_sandbox_policy: Some("workspace-write"),
        resolver_input: ToolExecutionResolverInput::default(),
    });

    assert_eq!(decision.kind, ToolExecutionDecisionKind::Allow);
    assert!(decision.allowed());
    assert_eq!(decision.reason_code, "allowed");
    assert_eq!(
        decision.metadata.get("approvalPolicy"),
        Some(&json!("never"))
    );
    assert_eq!(
        decision.metadata.get("requestedSandboxPolicy"),
        Some(&json!("workspace-write"))
    );
}

#[test]
fn test_decide_tool_execution_blocks_write_shell_in_read_only_sandbox() {
    let params = json!({ "command": "cargo test" });
    let decision = decide_tool_execution(ToolExecutionDecisionInput {
        tool_name: "Bash",
        params: &params,
        working_directory: Path::new("/tmp/workspace"),
        surface: "runtime_tool",
        auto_mode: false,
        bypass_restrictions: false,
        approval_policy: Some("never"),
        requested_sandbox_policy: Some("read-only"),
        resolver_input: ToolExecutionResolverInput::default(),
    });

    assert_eq!(decision.kind, ToolExecutionDecisionKind::SandboxBlocked);
    assert_eq!(
        decision.reason_code,
        "read_only_sandbox_blocks_shell_command"
    );
    assert_eq!(
        decision.metadata.get("sandboxPolicy"),
        Some(&json!("read-only"))
    );
    assert_eq!(decision.metadata.get("command"), Some(&json!("cargo test")));
}

#[test]
fn test_decide_tool_execution_allows_read_only_shell_in_read_only_sandbox() {
    let params = json!({ "command": "pwd && rg coding internal/roadmap/coding" });
    let decision = decide_tool_execution(ToolExecutionDecisionInput {
        tool_name: "Bash",
        params: &params,
        working_directory: Path::new("/tmp/workspace"),
        surface: "runtime_tool",
        auto_mode: false,
        bypass_restrictions: false,
        approval_policy: Some("never"),
        requested_sandbox_policy: Some("read_only"),
        resolver_input: ToolExecutionResolverInput::default(),
    });

    assert_eq!(decision.kind, ToolExecutionDecisionKind::Allow);
    assert_eq!(decision.reason_code, "allowed");
}

#[test]
fn test_decide_tool_execution_blocks_ambiguous_shell_in_read_only_sandbox() {
    for command in ["git branch new-branch", "find . -name '*.tmp' -delete"] {
        let params = json!({ "command": command });
        let decision = decide_tool_execution(ToolExecutionDecisionInput {
            tool_name: "Bash",
            params: &params,
            working_directory: Path::new("/tmp/workspace"),
            surface: "runtime_tool",
            auto_mode: false,
            bypass_restrictions: false,
            approval_policy: Some("never"),
            requested_sandbox_policy: Some("read-only"),
            resolver_input: ToolExecutionResolverInput::default(),
        });

        assert_eq!(
            decision.kind,
            ToolExecutionDecisionKind::SandboxBlocked,
            "{command} should be blocked"
        );
    }
}

#[test]
fn test_build_workspace_execution_permissions_strict_mode_restricts_parameter_tools() {
    let permissions = build_workspace_execution_permissions(WorkspaceExecutionPermissionInput {
        surface: WorkspaceToolSurface::core(),
        workspace_root: "/tmp/workspace",
        explicit_read_only_paths: &[],
        auto_mode: false,
        bypass_restrictions: false,
        execution_policy_input: ToolExecutionResolverInput::default(),
    });

    let read = permissions
        .iter()
        .find(|permission| permission.tool == "Read")
        .expect("Read permission should exist");
    assert_eq!(read.parameter_restrictions.len(), 1);
    assert_eq!(read.parameter_restrictions[0].parameter, "path");
    assert!(read.parameter_restrictions[0]
        .pattern
        .as_deref()
        .unwrap_or_default()
        .contains("/tmp/workspace"));

    let bash = permissions
        .iter()
        .find(|permission| permission.tool == "Bash")
        .expect("Bash permission should exist");
    assert_eq!(bash.parameter_restrictions.len(), 2);
    assert_eq!(
        bash.metadata.get("policyName"),
        Some(&json!("workspace_tool_execution"))
    );
    assert_eq!(
        bash.metadata.get("policyProfile"),
        Some(&json!("workspace"))
    );
    assert_eq!(bash.metadata.get("toolSurface"), Some(&json!("core")));
    assert_eq!(
        bash.metadata.get("restrictionProfile"),
        Some(&json!("workspace_shell_command"))
    );
    assert_eq!(
        bash.metadata.get("sandboxPolicy"),
        Some(&json!("workspace_command"))
    );
    assert_eq!(
        bash.metadata.get("restrictionProfileSource"),
        Some(&json!("default"))
    );
    let view_image = permissions
        .iter()
        .find(|permission| permission.tool == "view_image")
        .expect("view_image permission should exist");
    assert_eq!(view_image.parameter_restrictions.len(), 1);
    assert_eq!(view_image.parameter_restrictions[0].parameter, "path");
    assert!(view_image.parameter_restrictions[0]
        .pattern
        .as_deref()
        .unwrap_or_default()
        .contains("/tmp/workspace"));
    assert!(permissions
        .iter()
        .any(|permission| permission.tool == "*" && !permission.allowed));
    assert!(!permissions
        .iter()
        .any(|permission| permission.tool == "*" && permission.allowed));
}

#[test]
fn test_build_workspace_execution_permissions_allows_explicit_read_only_local_paths() {
    let tmp = tempfile::TempDir::new().expect("create temp dir");
    let workspace = tmp.path().join("workspace");
    let external_dir = tmp.path().join("external");
    let external_file = tmp.path().join("single.json");
    let sibling_file = tmp.path().join("sibling.json");
    std::fs::create_dir_all(&workspace).expect("create workspace");
    std::fs::create_dir_all(&external_dir).expect("create external dir");
    std::fs::write(external_dir.join("README.md"), "external").expect("write external file");
    std::fs::write(&external_file, "{}").expect("write explicit file");
    std::fs::write(&sibling_file, "{}").expect("write sibling file");

    let explicit_paths = vec![
        external_dir.clone(),
        external_file.clone(),
        PathBuf::from("relative-ignored"),
        tmp.path().join("missing"),
    ];
    let workspace_root = workspace.to_string_lossy().to_string();
    let permissions = build_workspace_execution_permissions(WorkspaceExecutionPermissionInput {
        surface: WorkspaceToolSurface::core(),
        workspace_root: &workspace_root,
        explicit_read_only_paths: &explicit_paths,
        auto_mode: false,
        bypass_restrictions: false,
        execution_policy_input: ToolExecutionResolverInput::default(),
    });
    let manager = permission_manager_for(permissions);
    let context = permission_context(&workspace);

    let external_child_params = HashMap::from([(
        "path".to_string(),
        json!(external_dir.join("README.md").to_string_lossy().to_string()),
    )]);
    assert!(
        manager
            .is_allowed("Read", &external_child_params, &context)
            .allowed
    );
    assert!(
        manager
            .is_allowed("Glob", &external_child_params, &context)
            .allowed
    );

    let explicit_file_params = HashMap::from([(
        "path".to_string(),
        json!(external_file.to_string_lossy().to_string()),
    )]);
    assert!(
        manager
            .is_allowed("Read", &explicit_file_params, &context)
            .allowed
    );

    let sibling_file_params = HashMap::from([(
        "path".to_string(),
        json!(sibling_file.to_string_lossy().to_string()),
    )]);
    assert!(
        !manager
            .is_allowed("Read", &sibling_file_params, &context)
            .allowed,
        "只显式放行单个文件时，不应顺带放开同级其它文件"
    );

    let bash_allowed_params = HashMap::from([(
        "command".to_string(),
        json!(format!("cat {}", external_file.to_string_lossy())),
    )]);
    assert!(
        manager
            .is_allowed("Bash", &bash_allowed_params, &context)
            .allowed
    );

    let bash_denied_params = HashMap::from([(
        "command".to_string(),
        json!(format!("cat {}", sibling_file.to_string_lossy())),
    )]);
    assert!(
        !manager
            .is_allowed("Bash", &bash_denied_params, &context)
            .allowed
    );
}

#[test]
fn test_build_workspace_execution_permissions_auto_mode_adds_wildcard_allow() {
    let permissions = build_workspace_execution_permissions(WorkspaceExecutionPermissionInput {
        surface: WorkspaceToolSurface::core(),
        workspace_root: "/tmp/workspace",
        explicit_read_only_paths: &[],
        auto_mode: true,
        bypass_restrictions: false,
        execution_policy_input: ToolExecutionResolverInput::default(),
    });

    let bash = permissions
        .iter()
        .find(|permission| permission.tool == "Bash")
        .expect("Bash permission should exist");
    assert!(bash.parameter_restrictions.is_empty());
    assert!(permissions
        .iter()
        .any(|permission| permission.tool == "*" && permission.allowed));

    assert_bash_allows_restricted_command(permissions);
}

#[test]
fn test_build_workspace_execution_permissions_full_access_bypasses_shell_restrictions() {
    let permissions = build_workspace_execution_permissions(WorkspaceExecutionPermissionInput {
        surface: WorkspaceToolSurface::core(),
        workspace_root: "/tmp/workspace",
        explicit_read_only_paths: &[],
        auto_mode: false,
        bypass_restrictions: true,
        execution_policy_input: ToolExecutionResolverInput::default(),
    });

    let bash = permissions
        .iter()
        .find(|permission| permission.tool == "Bash")
        .expect("Bash permission should exist");
    assert!(bash.parameter_restrictions.is_empty());
    assert!(permissions
        .iter()
        .any(|permission| permission.tool == "*" && permission.allowed));

    assert_bash_allows_restricted_command(permissions);
}

#[test]
fn test_should_auto_approve_tool_warnings_only_for_shell_risk_tools() {
    let input = ToolExecutionResolverInput::default();

    assert!(should_auto_approve_tool_warnings("Bash", true, input));
    assert!(!should_auto_approve_tool_warnings("Read", true, input));
    assert!(!should_auto_approve_tool_warnings("Bash", false, input));
}

#[test]
fn test_build_workspace_shell_allow_pattern_auto_mode_allows_multiline() {
    let escaped_root = regex::escape("/tmp/workspace");
    let pattern = build_workspace_shell_allow_pattern(&escaped_root, true);
    let regex = regex::Regex::new(&pattern).expect("pattern should compile");

    assert!(regex.is_match("python3 <<'EOF'\nprint('hello')\nEOF"));
}

#[test]
fn test_resolve_tool_execution_policy_allows_persisted_override_to_replace_default() {
    let persisted_policy = ConfigToolExecutionPolicyConfig {
        tool_overrides: HashMap::from([(
            "bash".to_string(),
            ConfigToolExecutionOverrideConfig {
                warning_policy: Some(ConfigToolExecutionWarningPolicyConfig::None),
                restriction_profile: Some(
                    ConfigToolExecutionRestrictionProfileConfig::WorkspacePathRequired,
                ),
                sandbox_profile: Some(ConfigToolExecutionSandboxProfileConfig::None),
            },
        )]),
        ..Default::default()
    };

    let policy = resolve_tool_execution_policy(
        "Bash",
        ToolExecutionResolverInput {
            persisted_policy: Some(&persisted_policy),
            request_metadata: None,
        },
    );

    assert_eq!(policy.warning_policy, ToolExecutionWarningPolicy::None);
    assert_eq!(
        policy.restriction_profile,
        ToolExecutionRestrictionProfile::WorkspacePathRequired
    );
    assert_eq!(policy.sandbox_profile, ToolExecutionSandboxProfile::None);
}

#[test]
fn test_resolve_tool_execution_policy_runtime_override_beats_persisted_policy() {
    let persisted_policy = ConfigToolExecutionPolicyConfig {
        tool_overrides: HashMap::from([(
            "bash".to_string(),
            ConfigToolExecutionOverrideConfig {
                warning_policy: Some(ConfigToolExecutionWarningPolicyConfig::None),
                restriction_profile: Some(
                    ConfigToolExecutionRestrictionProfileConfig::WorkspacePathRequired,
                ),
                sandbox_profile: Some(ConfigToolExecutionSandboxProfileConfig::None),
            },
        )]),
        ..Default::default()
    };
    let request_metadata = json!({
        "harness": {
            "executionPolicy": {
                "toolOverrides": {
                    "BASH": {
                        "warningPolicy": "shell_command_risk",
                        "restrictionProfile": "workspace_shell_command",
                        "sandboxProfile": "workspace_command"
                    }
                }
            }
        }
    });

    let policy = resolve_tool_execution_policy(
        "Bash",
        ToolExecutionResolverInput {
            persisted_policy: Some(&persisted_policy),
            request_metadata: Some(&request_metadata),
        },
    );

    assert_eq!(
        policy.warning_policy,
        ToolExecutionWarningPolicy::ShellCommandRisk
    );
    assert_eq!(
        policy.restriction_profile,
        ToolExecutionRestrictionProfile::WorkspaceShellCommand
    );
    assert_eq!(
        policy.sandbox_profile,
        ToolExecutionSandboxProfile::WorkspaceCommand
    );
}

#[test]
fn test_tool_execution_policy_service_resolves_metadata_sources() {
    let persisted_policy = ConfigToolExecutionPolicyConfig {
        tool_overrides: HashMap::from([(
            "bash".to_string(),
            ConfigToolExecutionOverrideConfig {
                warning_policy: Some(ConfigToolExecutionWarningPolicyConfig::None),
                restriction_profile: None,
                sandbox_profile: None,
            },
        )]),
        ..Default::default()
    };
    let request_metadata = json!({
        "harness": {
            "executionPolicy": {
                "toolOverrides": {
                    "Bash": {
                        "sandboxProfile": "none"
                    }
                }
            }
        }
    });
    let service = ToolExecutionPolicyService::new(ToolExecutionResolverInput {
        persisted_policy: Some(&persisted_policy),
        request_metadata: Some(&request_metadata),
    });

    let metadata = service.metadata("Bash", "core");

    assert_eq!(
        metadata.get("policyName"),
        Some(&json!("workspace_tool_execution"))
    );
    assert_eq!(metadata.get("warningPolicy"), Some(&json!("none")));
    assert_eq!(
        metadata.get("warningPolicySource"),
        Some(&json!("persisted"))
    );
    assert_eq!(metadata.get("sandboxPolicy"), Some(&json!("none")));
    assert_eq!(metadata.get("sandboxPolicySource"), Some(&json!("runtime")));
}

#[test]
fn test_tool_execution_policy_service_merges_shell_command_rules() {
    let persisted_policy = ConfigToolExecutionPolicyConfig {
        shell_command_rules: vec![ConfigToolExecutionCommandRuleConfig {
            rule_id: "persisted_publish".to_string(),
            match_type: ConfigToolExecutionCommandRuleMatchTypeConfig::Regex,
            pattern: r"\bcargo\s+publish\b".to_string(),
            risk_level: ConfigToolExecutionCommandRiskLevelConfig::Medium,
            reason_code: "persisted_publish_command".to_string(),
            reason: "持久化策略标记发布命令".to_string(),
        }],
        ..Default::default()
    };
    let request_metadata = json!({
        "runtimeOptions": {
            "harness": {
                "executionPolicy": {
                    "shellCommandRules": [
                        {
                            "ruleId": "runtime_publish",
                            "pattern": "\\bcargo\\s+publish\\b",
                            "riskLevel": "high",
                            "reasonCode": "runtime_publish_command",
                            "reason": "请求级策略标记发布命令"
                        }
                    ]
                }
            }
        }
    });
    let service = ToolExecutionPolicyService::new(ToolExecutionResolverInput {
        persisted_policy: Some(&persisted_policy),
        request_metadata: Some(&request_metadata),
    });

    let rule_match = service
        .classify_shell_command("cargo publish --dry-run")
        .expect("shell command should match merged rules");

    assert_eq!(rule_match.rule_id, "runtime_publish");
    assert_eq!(rule_match.source.label(), "runtime");
    assert_eq!(rule_match.risk_level.label(), "high");
    assert_eq!(rule_match.reason_code, "runtime_publish_command");
}

#[test]
fn test_tool_execution_policy_service_applies_organization_user_request_layers() {
    let request_metadata = json!({
        "harness": {
            "organizationExecutionPolicy": {
                "toolOverrides": {
                    "bash": {
                        "warningPolicy": "none",
                        "sandboxProfile": "none"
                    }
                }
            },
            "userExecutionPolicy": {
                "toolOverrides": {
                    "bash": {
                        "warningPolicy": "shell_command_risk"
                    }
                }
            },
            "executionPolicy": {
                "toolOverrides": {
                    "bash": {
                        "restrictionProfile": "workspace_path_required"
                    }
                }
            },
            "requestExecutionPolicy": {
                "toolOverrides": {
                    "bash": {
                        "sandboxProfile": "workspace_command"
                    }
                }
            }
        }
    });
    let resolution = resolve_tool_execution_policy_resolution(
        "Bash",
        ToolExecutionResolverInput {
            persisted_policy: None,
            request_metadata: Some(&request_metadata),
        },
    );

    assert_eq!(
        resolution.policy.warning_policy,
        ToolExecutionWarningPolicy::ShellCommandRisk
    );
    assert_eq!(
        resolution.warning_policy_source,
        ToolExecutionPolicySource::User
    );
    assert_eq!(
        resolution.policy.restriction_profile,
        ToolExecutionRestrictionProfile::WorkspacePathRequired
    );
    assert_eq!(
        resolution.restriction_profile_source,
        ToolExecutionPolicySource::Runtime
    );
    assert_eq!(
        resolution.policy.sandbox_profile,
        ToolExecutionSandboxProfile::WorkspaceCommand
    );
    assert_eq!(
        resolution.sandbox_profile_source,
        ToolExecutionPolicySource::Request
    );
}

#[test]
fn test_tool_execution_policy_service_request_shell_rule_overrides_runtime_rule() {
    let request_metadata = json!({
        "harness": {
            "executionPolicy": {
                "shellCommandRules": [
                    {
                        "ruleId": "runtime_git_push",
                        "pattern": "\\bgit\\s+push\\b",
                        "riskLevel": "high",
                        "reasonCode": "runtime_git_push_command",
                        "reason": "运行时策略标记 git push"
                    }
                ]
            },
            "requestExecutionPolicy": {
                "shellCommandRules": [
                    {
                        "ruleId": "request_git_push",
                        "pattern": "\\bgit\\s+push\\b",
                        "riskLevel": "high",
                        "reasonCode": "request_git_push_command",
                        "reason": "请求策略标记 git push"
                    }
                ]
            }
        }
    });
    let service = ToolExecutionPolicyService::new(ToolExecutionResolverInput {
        persisted_policy: None,
        request_metadata: Some(&request_metadata),
    });

    let rule_match = service
        .classify_shell_command("git push origin main")
        .expect("shell command should match request rule");

    assert_eq!(rule_match.rule_id, "request_git_push");
    assert_eq!(rule_match.source.label(), "request");
    assert_eq!(rule_match.reason_code, "request_git_push_command");
}

#[test]
fn test_tool_execution_policy_service_supports_prefix_and_exact_shell_rules() {
    let persisted_policy = ConfigToolExecutionPolicyConfig {
        shell_command_rules: vec![
            ConfigToolExecutionCommandRuleConfig {
                rule_id: "prefix_npm_publish".to_string(),
                match_type: ConfigToolExecutionCommandRuleMatchTypeConfig::Prefix,
                pattern: "npm publish".to_string(),
                risk_level: ConfigToolExecutionCommandRiskLevelConfig::High,
                reason_code: "prefix_npm_publish_command".to_string(),
                reason: "前缀策略标记 npm publish".to_string(),
            },
            ConfigToolExecutionCommandRuleConfig {
                rule_id: "exact_cargo_test".to_string(),
                match_type: ConfigToolExecutionCommandRuleMatchTypeConfig::Exact,
                pattern: "cargo test".to_string(),
                risk_level: ConfigToolExecutionCommandRiskLevelConfig::Low,
                reason_code: "exact_cargo_test_command".to_string(),
                reason: "精确策略标记 cargo test".to_string(),
            },
        ],
        ..Default::default()
    };
    let service = ToolExecutionPolicyService::new(ToolExecutionResolverInput {
        persisted_policy: Some(&persisted_policy),
        request_metadata: None,
    });

    let prefix_match = service
        .classify_shell_command(" npm publish --dry-run")
        .expect("prefix rule should match");
    assert_eq!(prefix_match.rule_id, "prefix_npm_publish");
    assert_eq!(prefix_match.risk_level.label(), "high");

    let exact_match = service
        .classify_shell_command(" cargo test ")
        .expect("exact rule should match");
    assert_eq!(exact_match.rule_id, "exact_cargo_test");
    assert!(service
        .classify_shell_command("cargo test --workspace")
        .is_none());
}

#[test]
fn test_resolve_tool_execution_policy_reads_runtime_override_from_nested_runtime_options() {
    let request_metadata = json!({
        "runtime_options": {
            "harness": {
                "executionPolicy": {
                    "toolOverrides": {
                        "bash": {
                            "warningPolicy": "none",
                            "sandboxProfile": "none"
                        }
                    }
                }
            }
        }
    });

    let resolution = resolve_tool_execution_policy_resolution(
        "Bash",
        ToolExecutionResolverInput {
            persisted_policy: None,
            request_metadata: Some(&request_metadata),
        },
    );

    assert_eq!(
        resolution.policy.warning_policy,
        ToolExecutionWarningPolicy::None
    );
    assert_eq!(
        resolution.policy.sandbox_profile,
        ToolExecutionSandboxProfile::None
    );
    assert_eq!(
        resolution.warning_policy_source,
        ToolExecutionPolicySource::Runtime
    );
    assert_eq!(
        resolution.sandbox_profile_source,
        ToolExecutionPolicySource::Runtime
    );
}

#[test]
fn test_persisted_tool_execution_policy_from_metadata_reads_agent_config_shape() {
    let request_metadata = json!({
        "config": {
            "agent": {
                "toolExecution": {
                    "toolOverrides": {
                        "bash": {
                            "warningPolicy": "none",
                            "sandboxProfile": "none"
                        }
                    }
                }
            }
        }
    });

    let persisted_policy = persisted_tool_execution_policy_from_metadata(Some(&request_metadata))
        .expect("persisted tool execution policy");
    let resolution = resolve_tool_execution_policy_resolution(
        "Bash",
        ToolExecutionResolverInput {
            persisted_policy: Some(&persisted_policy),
            request_metadata: None,
        },
    );

    assert_eq!(
        resolution.policy.warning_policy,
        ToolExecutionWarningPolicy::None
    );
    assert_eq!(
        resolution.policy.sandbox_profile,
        ToolExecutionSandboxProfile::None
    );
    assert_eq!(
        resolution.warning_policy_source,
        ToolExecutionPolicySource::Persisted
    );
    assert_eq!(
        resolution.sandbox_profile_source,
        ToolExecutionPolicySource::Persisted
    );
}

#[test]
fn test_resolve_tool_execution_policy_resolution_tracks_mixed_sources_per_field() {
    let persisted_policy = ConfigToolExecutionPolicyConfig {
        tool_overrides: HashMap::from([(
            "bash".to_string(),
            ConfigToolExecutionOverrideConfig {
                warning_policy: Some(ConfigToolExecutionWarningPolicyConfig::None),
                restriction_profile: None,
                sandbox_profile: None,
            },
        )]),
        ..Default::default()
    };
    let request_metadata = json!({
        "harness": {
            "executionPolicy": {
                "toolOverrides": {
                    "bash": {
                        "sandboxProfile": "none"
                    }
                }
            }
        }
    });

    let resolution = resolve_tool_execution_policy_resolution(
        "Bash",
        ToolExecutionResolverInput {
            persisted_policy: Some(&persisted_policy),
            request_metadata: Some(&request_metadata),
        },
    );

    assert_eq!(
        resolution.policy.warning_policy,
        ToolExecutionWarningPolicy::None
    );
    assert_eq!(
        resolution.policy.restriction_profile,
        ToolExecutionRestrictionProfile::WorkspaceShellCommand
    );
    assert_eq!(
        resolution.policy.sandbox_profile,
        ToolExecutionSandboxProfile::None
    );
    assert_eq!(
        resolution.warning_policy_source,
        ToolExecutionPolicySource::Persisted
    );
    assert_eq!(
        resolution.restriction_profile_source,
        ToolExecutionPolicySource::Default
    );
    assert_eq!(
        resolution.sandbox_profile_source,
        ToolExecutionPolicySource::Runtime
    );
}

#[test]
fn test_build_workspace_execution_permissions_respects_runtime_override() {
    let request_metadata = json!({
        "harness": {
            "execution_policy": {
                "tool_overrides": {
                    "bash": {
                        "restriction_profile": "none"
                    }
                }
            }
        }
    });

    let permissions = build_workspace_execution_permissions(WorkspaceExecutionPermissionInput {
        surface: WorkspaceToolSurface::core(),
        workspace_root: "/tmp/workspace",
        explicit_read_only_paths: &[],
        auto_mode: false,
        bypass_restrictions: false,
        execution_policy_input: ToolExecutionResolverInput {
            persisted_policy: None,
            request_metadata: Some(&request_metadata),
        },
    });

    let bash = permissions
        .iter()
        .find(|permission| permission.tool == "Bash")
        .expect("Bash permission should exist");
    assert!(bash.parameter_restrictions.is_empty());
}
