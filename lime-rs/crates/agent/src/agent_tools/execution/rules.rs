use super::policy::{
    ToolExecutionPolicy, ToolExecutionRestrictionProfile, ToolExecutionSandboxProfile,
    ToolExecutionWarningPolicy,
};
use crate::agent_tools::catalog::{tool_catalog_entry, APPLY_PATCH_TOOL_NAME};
use regex::Regex;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ToolPolicyRule {
    pub tool_names: &'static [&'static str],
    pub policy: ToolExecutionPolicy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellCommandRiskLevel {
    Low,
    Medium,
    High,
}

impl ShellCommandRiskLevel {
    pub fn label(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellCommandRuleSource {
    Default,
    Persisted,
    Organization,
    User,
    Runtime,
    Request,
}

impl ShellCommandRuleSource {
    pub fn label(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Persisted => "persisted",
            Self::Organization => "organization",
            Self::User => "user",
            Self::Runtime => "runtime",
            Self::Request => "request",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellCommandRuleMatchType {
    Regex,
    Prefix,
    Exact,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellCommandRule {
    pub rule_id: String,
    pub match_type: ShellCommandRuleMatchType,
    pub pattern: String,
    pub risk_level: ShellCommandRiskLevel,
    pub reason_code: String,
    pub reason: String,
    pub source: ShellCommandRuleSource,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellCommandRuleMatch {
    pub rule_id: String,
    pub risk_level: ShellCommandRiskLevel,
    pub reason_code: String,
    pub reason: String,
    pub source: ShellCommandRuleSource,
}

const DEFAULT_POLICY: ToolExecutionPolicy = ToolExecutionPolicy {
    warning_policy: ToolExecutionWarningPolicy::None,
    restriction_profile: ToolExecutionRestrictionProfile::None,
    sandbox_profile: ToolExecutionSandboxProfile::None,
};

const WORKSPACE_PATH_POLICY: ToolExecutionPolicy = ToolExecutionPolicy {
    restriction_profile: ToolExecutionRestrictionProfile::WorkspacePathRequired,
    ..DEFAULT_POLICY
};

const WORKSPACE_PATH_OPTIONAL_POLICY: ToolExecutionPolicy = ToolExecutionPolicy {
    restriction_profile: ToolExecutionRestrictionProfile::WorkspacePathOptional,
    ..DEFAULT_POLICY
};

const WORKSPACE_ABSOLUTE_PATH_POLICY: ToolExecutionPolicy = ToolExecutionPolicy {
    restriction_profile: ToolExecutionRestrictionProfile::WorkspaceAbsolutePathRequired,
    ..DEFAULT_POLICY
};

const WORKSPACE_SHELL_POLICY: ToolExecutionPolicy = ToolExecutionPolicy {
    warning_policy: ToolExecutionWarningPolicy::ShellCommandRisk,
    restriction_profile: ToolExecutionRestrictionProfile::WorkspaceShellCommand,
    sandbox_profile: ToolExecutionSandboxProfile::WorkspaceCommand,
};

const SAFE_HTTPS_URL_POLICY: ToolExecutionPolicy = ToolExecutionPolicy {
    restriction_profile: ToolExecutionRestrictionProfile::SafeHttpsUrlRequired,
    ..DEFAULT_POLICY
};

const WORKSPACE_PATH_TOOLS: &[&str] = &["Read", "Write", "Edit", "LSP", "view_image"];
const DEFAULT_POLICY_TOOLS: &[&str] = &[APPLY_PATCH_TOOL_NAME];
const WORKSPACE_PATH_OPTIONAL_TOOLS: &[&str] = &["Glob", "Grep"];
const WORKSPACE_ABSOLUTE_PATH_TOOLS: &[&str] = &["NotebookEdit"];
const WORKSPACE_SHELL_TOOLS: &[&str] = &["Bash", "PowerShell"];
const SAFE_HTTPS_URL_TOOLS: &[&str] = &["WebFetch"];

const TOOL_POLICY_RULES: &[ToolPolicyRule] = &[
    ToolPolicyRule {
        tool_names: WORKSPACE_PATH_TOOLS,
        policy: WORKSPACE_PATH_POLICY,
    },
    ToolPolicyRule {
        tool_names: DEFAULT_POLICY_TOOLS,
        policy: DEFAULT_POLICY,
    },
    ToolPolicyRule {
        tool_names: WORKSPACE_PATH_OPTIONAL_TOOLS,
        policy: WORKSPACE_PATH_OPTIONAL_POLICY,
    },
    ToolPolicyRule {
        tool_names: WORKSPACE_ABSOLUTE_PATH_TOOLS,
        policy: WORKSPACE_ABSOLUTE_PATH_POLICY,
    },
    ToolPolicyRule {
        tool_names: WORKSPACE_SHELL_TOOLS,
        policy: WORKSPACE_SHELL_POLICY,
    },
    ToolPolicyRule {
        tool_names: SAFE_HTTPS_URL_TOOLS,
        policy: SAFE_HTTPS_URL_POLICY,
    },
];

pub(crate) fn default_tool_execution_policy(tool_name: &str) -> ToolExecutionPolicy {
    let Some(catalog_entry) = tool_catalog_entry(tool_name.trim()) else {
        return DEFAULT_POLICY;
    };

    TOOL_POLICY_RULES
        .iter()
        .find(|rule| rule.tool_names.contains(&catalog_entry.name))
        .map(|rule| rule.policy)
        .unwrap_or(DEFAULT_POLICY)
}

#[cfg(test)]
pub(crate) fn classify_shell_command(command: &str) -> Option<ShellCommandRuleMatch> {
    classify_shell_command_with_rules(command, &[])
}

pub fn classify_shell_command_with_rules(
    command: &str,
    configured_rules: &[ShellCommandRule],
) -> Option<ShellCommandRuleMatch> {
    split_shell_segments(command)
        .into_iter()
        .filter_map(classify_shell_segment)
        .chain(
            configured_rules
                .iter()
                .filter_map(|rule| classify_configured_shell_rule(command, rule)),
        )
        .max_by_key(|rule_match| {
            (
                shell_command_risk_rank(rule_match.risk_level),
                shell_command_source_rank(rule_match.source),
            )
        })
}

fn split_shell_segments(command: &str) -> Vec<&str> {
    command
        .split(['\n', ';', '|'])
        .flat_map(|segment| segment.split("&&"))
        .flat_map(|segment| segment.split("||"))
        .collect()
}

fn classify_shell_segment(segment: &str) -> Option<ShellCommandRuleMatch> {
    let normalized = segment.trim();
    if normalized.is_empty() {
        return None;
    }

    let mut parts = normalized.split_whitespace();
    let command = parts
        .next()?
        .trim_matches(|value| value == '\'' || value == '"');
    let args = parts.collect::<Vec<_>>();

    match command {
        "sudo" | "su" => Some(shell_rule(
            "privileged_shell",
            ShellCommandRiskLevel::High,
            "privileged_shell_command",
            "命令会尝试提升权限",
        )),
        "rm" if args
            .iter()
            .any(|arg| rm_arg_requests_force_or_recursive(arg)) =>
        {
            Some(shell_rule(
                "destructive_remove",
                ShellCommandRiskLevel::High,
                "destructive_remove_command",
                "命令可能递归或强制删除文件",
            ))
        }
        "git" => classify_git_command(&args),
        "curl" | "wget" => Some(shell_rule(
            "network_download",
            ShellCommandRiskLevel::Medium,
            "network_download_command",
            "命令会访问网络或下载内容",
        )),
        "chmod" | "chown" => Some(shell_rule(
            "permission_mutation",
            ShellCommandRiskLevel::Medium,
            "permission_mutation_command",
            "命令会修改文件权限或所有者",
        )),
        "npm" | "pnpm" | "yarn"
            if args.first().is_some_and(|arg| {
                matches!(*arg, "install" | "add" | "remove" | "uninstall" | "publish")
            }) =>
        {
            Some(shell_rule(
                "package_manager_mutation",
                ShellCommandRiskLevel::Medium,
                "package_manager_mutation_command",
                "命令会修改依赖或发布包",
            ))
        }
        "cargo"
            if args
                .first()
                .is_some_and(|arg| matches!(*arg, "publish" | "install")) =>
        {
            Some(shell_rule(
                "package_manager_mutation",
                ShellCommandRiskLevel::Medium,
                "package_manager_mutation_command",
                "命令会修改工具链状态或发布包",
            ))
        }
        _ => None,
    }
}

fn rm_arg_requests_force_or_recursive(arg: &str) -> bool {
    match arg {
        "-r" | "-R" | "--recursive" | "-f" | "--force" => true,
        value if value.starts_with("--") => false,
        value if value.starts_with('-') => value
            .trim_start_matches('-')
            .chars()
            .any(|flag| matches!(flag, 'r' | 'R' | 'f')),
        _ => false,
    }
}

fn classify_git_command(args: &[&str]) -> Option<ShellCommandRuleMatch> {
    let subcommand = args.first()?;
    match *subcommand {
        "push" | "reset" | "clean" | "checkout" | "switch" | "branch" | "merge" | "rebase"
        | "commit" => Some(shell_rule(
            "git_state_mutation",
            ShellCommandRiskLevel::Medium,
            "git_state_mutation_command",
            "命令会修改 git 工作树、分支或远端状态",
        )),
        _ => None,
    }
}

fn classify_configured_shell_rule(
    command: &str,
    rule: &ShellCommandRule,
) -> Option<ShellCommandRuleMatch> {
    if rule.rule_id.trim().is_empty() || rule.pattern.trim().is_empty() {
        return None;
    }
    if !configured_rule_matches(command, rule) {
        return None;
    }

    Some(ShellCommandRuleMatch {
        rule_id: rule.rule_id.trim().to_string(),
        risk_level: rule.risk_level,
        reason_code: if rule.reason_code.trim().is_empty() {
            rule.rule_id.trim().to_string()
        } else {
            rule.reason_code.trim().to_string()
        },
        reason: if rule.reason.trim().is_empty() {
            "命令匹配自定义策略规则".to_string()
        } else {
            rule.reason.trim().to_string()
        },
        source: rule.source,
    })
}

fn configured_rule_matches(command: &str, rule: &ShellCommandRule) -> bool {
    let pattern = rule.pattern.trim();
    match rule.match_type {
        ShellCommandRuleMatchType::Regex => {
            Regex::new(pattern).is_ok_and(|regex| regex.is_match(command))
        }
        ShellCommandRuleMatchType::Prefix => command.trim_start().starts_with(pattern),
        ShellCommandRuleMatchType::Exact => command.trim() == pattern,
    }
}

fn shell_rule(
    rule_id: &'static str,
    risk_level: ShellCommandRiskLevel,
    reason_code: &'static str,
    reason: &'static str,
) -> ShellCommandRuleMatch {
    ShellCommandRuleMatch {
        rule_id: rule_id.to_string(),
        risk_level,
        reason_code: reason_code.to_string(),
        reason: reason.to_string(),
        source: ShellCommandRuleSource::Default,
    }
}

fn shell_command_risk_rank(risk_level: ShellCommandRiskLevel) -> u8 {
    match risk_level {
        ShellCommandRiskLevel::Low => 0,
        ShellCommandRiskLevel::Medium => 1,
        ShellCommandRiskLevel::High => 2,
    }
}

fn shell_command_source_rank(source: ShellCommandRuleSource) -> u8 {
    match source {
        ShellCommandRuleSource::Default => 0,
        ShellCommandRuleSource::Persisted => 1,
        ShellCommandRuleSource::Organization => 2,
        ShellCommandRuleSource::User => 3,
        ShellCommandRuleSource::Runtime => 4,
        ShellCommandRuleSource::Request => 5,
    }
}

#[cfg(test)]
pub(crate) fn tool_policy_rules() -> &'static [ToolPolicyRule] {
    TOOL_POLICY_RULES
}
