use super::policy::ToolExecutionSandboxProfile;
use serde_json::Value as JsonValue;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestedSandboxPolicy {
    ReadOnly,
    WorkspaceWrite,
    DangerFullAccess,
}

impl RequestedSandboxPolicy {
    pub fn label(self) -> &'static str {
        match self {
            Self::ReadOnly => "read-only",
            Self::WorkspaceWrite => "workspace-write",
            Self::DangerFullAccess => "danger-full-access",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct SandboxEvaluationInput<'a> {
    pub sandbox_profile: ToolExecutionSandboxProfile,
    pub requested_policy: Option<&'a str>,
    pub params: &'a JsonValue,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SandboxEvaluation {
    Allow,
    Block(SandboxBlock),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SandboxBlock {
    pub policy: RequestedSandboxPolicy,
    pub reason_code: &'static str,
    pub reason: &'static str,
    pub diagnostic: &'static str,
}

pub fn evaluate_sandbox(input: SandboxEvaluationInput<'_>) -> SandboxEvaluation {
    if input.sandbox_profile != ToolExecutionSandboxProfile::WorkspaceCommand {
        return SandboxEvaluation::Allow;
    }
    if parse_requested_sandbox_policy(input.requested_policy)
        != Some(RequestedSandboxPolicy::ReadOnly)
    {
        return SandboxEvaluation::Allow;
    }
    if command_text(input.params)
        .as_deref()
        .is_some_and(shell_command_is_read_only)
    {
        return SandboxEvaluation::Allow;
    }

    SandboxEvaluation::Block(SandboxBlock {
        policy: RequestedSandboxPolicy::ReadOnly,
        reason_code: "read_only_sandbox_blocks_shell_command",
        reason: "read-only 沙箱禁止执行会修改工作区或状态的 shell 命令",
        diagnostic: "read-only sandbox blocks non-read-only shell command",
    })
}

pub fn parse_requested_sandbox_policy(value: Option<&str>) -> Option<RequestedSandboxPolicy> {
    let normalized = value?.trim().replace(['_', ' '], "-").to_ascii_lowercase();
    match normalized.as_str() {
        "read-only" | "readonly" => Some(RequestedSandboxPolicy::ReadOnly),
        "workspace-write" | "workspacewrite" => Some(RequestedSandboxPolicy::WorkspaceWrite),
        "danger-full-access" | "dangerfullaccess" => Some(RequestedSandboxPolicy::DangerFullAccess),
        _ => None,
    }
}

pub fn command_text(params: &JsonValue) -> Option<String> {
    params.as_object().and_then(|object| {
        ["command", "cmd", "script"]
            .iter()
            .filter_map(|key| object.get(*key))
            .find_map(JsonValue::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    })
}

pub fn shell_command_is_read_only(command: &str) -> bool {
    split_shell_segments(command)
        .into_iter()
        .filter(|segment| !segment.trim().is_empty())
        .all(shell_segment_is_read_only)
}

fn split_shell_segments(command: &str) -> Vec<&str> {
    command
        .split(['\n', ';', '|'])
        .flat_map(|segment| segment.split("&&"))
        .flat_map(|segment| segment.split("||"))
        .collect()
}

fn shell_segment_is_read_only(segment: &str) -> bool {
    let normalized = segment.trim();
    if normalized.is_empty() {
        return true;
    }
    if normalized.contains('>')
        || normalized.contains('<')
        || normalized.contains('`')
        || normalized.contains("$(")
    {
        return false;
    }

    let mut parts = normalized.split_whitespace();
    let Some(command) = parts.next() else {
        return true;
    };
    let command = command.trim_matches(|value| value == '\'' || value == '"');
    if command.contains('=') {
        return false;
    }
    let args = parts.collect::<Vec<_>>();

    match command {
        "cd" | "pwd" | "ls" | "rg" | "grep" | "cat" | "head" | "tail" | "wc" | "uniq" | "cut"
        | "tr" | "test" | "stat" | "file" | "du" | "df" | "uname" | "whoami" | "echo"
        | "printf" | "true" | ":" => true,
        "find" => !args
            .iter()
            .any(|arg| matches!(*arg, "-delete" | "-exec" | "-execdir" | "-ok" | "-okdir")),
        "sort" => !args.iter().any(|arg| *arg == "-o" || arg.starts_with("-o")),
        "git" => args.first().is_some_and(|subcommand| {
            matches!(
                *subcommand,
                "status"
                    | "diff"
                    | "show"
                    | "log"
                    | "grep"
                    | "ls-files"
                    | "rev-parse"
                    | "describe"
                    | "blame"
            )
        }),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_requested_sandbox_policy_accepts_common_aliases() {
        assert_eq!(
            parse_requested_sandbox_policy(Some("read_only")),
            Some(RequestedSandboxPolicy::ReadOnly)
        );
        assert_eq!(
            parse_requested_sandbox_policy(Some("workspace write")),
            Some(RequestedSandboxPolicy::WorkspaceWrite)
        );
        assert_eq!(
            parse_requested_sandbox_policy(Some("danger-full-access")),
            Some(RequestedSandboxPolicy::DangerFullAccess)
        );
    }

    #[test]
    fn evaluate_sandbox_blocks_non_read_only_workspace_commands() {
        let params = json!({ "command": "cargo test" });
        let result = evaluate_sandbox(SandboxEvaluationInput {
            sandbox_profile: ToolExecutionSandboxProfile::WorkspaceCommand,
            requested_policy: Some("read-only"),
            params: &params,
        });

        assert!(matches!(result, SandboxEvaluation::Block(_)));
    }

    #[test]
    fn evaluate_sandbox_allows_read_only_shell_segments() {
        let params = json!({ "command": "pwd && git status | head -20" });
        let result = evaluate_sandbox(SandboxEvaluationInput {
            sandbox_profile: ToolExecutionSandboxProfile::WorkspaceCommand,
            requested_policy: Some("read-only"),
            params: &params,
        });

        assert_eq!(result, SandboxEvaluation::Allow);
    }
}
