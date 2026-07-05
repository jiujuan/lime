use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolExecutionWarningPolicy {
    None,
    ShellCommandRisk,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolExecutionRestrictionProfile {
    None,
    WorkspacePathRequired,
    WorkspacePathOptional,
    WorkspaceAbsolutePathRequired,
    WorkspaceShellCommand,
    AnalyzeImageInput,
    SafeHttpsUrlRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolExecutionSandboxProfile {
    None,
    WorkspaceCommand,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolExecutionPolicySource {
    Default,
    Persisted,
    Organization,
    User,
    Runtime,
    Request,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolExecutionPolicy {
    pub warning_policy: ToolExecutionWarningPolicy,
    pub restriction_profile: ToolExecutionRestrictionProfile,
    pub sandbox_profile: ToolExecutionSandboxProfile,
}

impl Default for ToolExecutionPolicy {
    fn default() -> Self {
        Self {
            warning_policy: ToolExecutionWarningPolicy::None,
            restriction_profile: ToolExecutionRestrictionProfile::None,
            sandbox_profile: ToolExecutionSandboxProfile::None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolExecutionPolicyResolution {
    pub policy: ToolExecutionPolicy,
    pub warning_policy_source: ToolExecutionPolicySource,
    pub restriction_profile_source: ToolExecutionPolicySource,
    pub sandbox_profile_source: ToolExecutionPolicySource,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_tool_execution_policy_should_be_unrestricted() {
        assert_eq!(
            ToolExecutionPolicy::default(),
            ToolExecutionPolicy {
                warning_policy: ToolExecutionWarningPolicy::None,
                restriction_profile: ToolExecutionRestrictionProfile::None,
                sandbox_profile: ToolExecutionSandboxProfile::None,
            }
        );
    }

    #[test]
    fn tool_execution_policy_enums_should_serialize_as_snake_case() {
        assert_eq!(
            serde_json::to_value(ToolExecutionWarningPolicy::ShellCommandRisk).unwrap(),
            serde_json::json!("shell_command_risk")
        );
        assert_eq!(
            serde_json::to_value(ToolExecutionRestrictionProfile::WorkspaceShellCommand).unwrap(),
            serde_json::json!("workspace_shell_command")
        );
        assert_eq!(
            serde_json::to_value(ToolExecutionSandboxProfile::WorkspaceCommand).unwrap(),
            serde_json::json!("workspace_command")
        );
        assert_eq!(
            serde_json::to_value(ToolExecutionPolicySource::Persisted).unwrap(),
            serde_json::json!("persisted")
        );
    }
}
