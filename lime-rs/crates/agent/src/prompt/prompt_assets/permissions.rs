use super::template::render_template;

const APPROVAL_POLICY_NEVER_TEMPLATE: &str =
    include_str!("../templates_upstream/permissions/approval_policy/never.md");
const APPROVAL_POLICY_UNLESS_TRUSTED_TEMPLATE: &str =
    include_str!("../templates_upstream/permissions/approval_policy/unless_trusted.md");
const APPROVAL_POLICY_ON_FAILURE_TEMPLATE: &str =
    include_str!("../templates_upstream/permissions/approval_policy/on_failure.md");
const APPROVAL_POLICY_ON_REQUEST_TEMPLATE: &str =
    include_str!("../templates_upstream/permissions/approval_policy/on_request.md");
const APPROVAL_POLICY_ON_REQUEST_PERMISSION_TEMPLATE: &str = include_str!(
    "../templates_upstream/permissions/approval_policy/on_request_rule_request_permission.md"
);

const SANDBOX_MODE_DANGER_FULL_ACCESS_TEMPLATE: &str =
    include_str!("../templates_upstream/permissions/sandbox_mode/danger_full_access.md");
const SANDBOX_MODE_WORKSPACE_WRITE_TEMPLATE: &str =
    include_str!("../templates_upstream/permissions/sandbox_mode/workspace_write.md");
const SANDBOX_MODE_READ_ONLY_TEMPLATE: &str =
    include_str!("../templates_upstream/permissions/sandbox_mode/read_only.md");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptApprovalPolicy {
    Never,
    UnlessTrusted,
    OnFailure,
    OnRequest,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptSandboxMode {
    DangerFullAccess,
    WorkspaceWrite,
    ReadOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptNetworkAccess {
    Enabled,
    Restricted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PermissionsPromptInput {
    pub approval_policy: PromptApprovalPolicy,
    pub sandbox_mode: PromptSandboxMode,
    pub network_access: PromptNetworkAccess,
    pub request_permissions_tool_enabled: bool,
}

pub fn permissions_instructions(input: &PermissionsPromptInput) -> String {
    let sandbox = sandbox_text(input.sandbox_mode, input.network_access);
    let approval = approval_text(
        input.approval_policy,
        input.request_permissions_tool_enabled,
    );
    let mut text = String::new();
    append_section(&mut text, &sandbox);
    append_section(&mut text, &approval);
    if !text.ends_with('\n') {
        text.push('\n');
    }
    text
}

fn approval_text(
    approval_policy: PromptApprovalPolicy,
    request_permissions_tool_enabled: bool,
) -> String {
    match approval_policy {
        PromptApprovalPolicy::Never => APPROVAL_POLICY_NEVER_TEMPLATE.to_string(),
        PromptApprovalPolicy::UnlessTrusted => with_request_permissions_tool(
            APPROVAL_POLICY_UNLESS_TRUSTED_TEMPLATE,
            request_permissions_tool_enabled,
        ),
        PromptApprovalPolicy::OnFailure => with_request_permissions_tool(
            APPROVAL_POLICY_ON_FAILURE_TEMPLATE,
            request_permissions_tool_enabled,
        ),
        PromptApprovalPolicy::OnRequest if request_permissions_tool_enabled => {
            APPROVAL_POLICY_ON_REQUEST_PERMISSION_TEMPLATE.to_string()
        }
        PromptApprovalPolicy::OnRequest => APPROVAL_POLICY_ON_REQUEST_TEMPLATE.to_string(),
    }
}

fn with_request_permissions_tool(text: &str, enabled: bool) -> String {
    if enabled {
        format!(
            "{text}\n\n{}",
            APPROVAL_POLICY_ON_REQUEST_PERMISSION_TEMPLATE.trim()
        )
    } else {
        text.to_string()
    }
}

fn sandbox_text(mode: PromptSandboxMode, network_access: PromptNetworkAccess) -> String {
    let template = match mode {
        PromptSandboxMode::DangerFullAccess => SANDBOX_MODE_DANGER_FULL_ACCESS_TEMPLATE,
        PromptSandboxMode::WorkspaceWrite => SANDBOX_MODE_WORKSPACE_WRITE_TEMPLATE,
        PromptSandboxMode::ReadOnly => SANDBOX_MODE_READ_ONLY_TEMPLATE,
    };
    let network_access = match network_access {
        PromptNetworkAccess::Enabled => "enabled",
        PromptNetworkAccess::Restricted => "restricted",
    };
    render_template(template, &[("network_access", network_access)])
}

fn append_section(text: &mut String, section: &str) {
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    text.push_str(section.trim_end());
    text.push('\n');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_permissions_prompt_from_local_types() {
        let prompt = permissions_instructions(&PermissionsPromptInput {
            approval_policy: PromptApprovalPolicy::Never,
            sandbox_mode: PromptSandboxMode::WorkspaceWrite,
            network_access: PromptNetworkAccess::Restricted,
            request_permissions_tool_enabled: false,
        });

        assert!(prompt.contains("sandbox_mode"));
        assert!(prompt.contains("workspace-write"));
        assert!(prompt.contains("Approval policy"));
        assert!(prompt.contains("never"));
    }
}
