use super::rules::default_tool_execution_policy;
use super::service::ToolExecutionPolicyService;
use lime_core::config::ToolExecutionPolicyConfig as ConfigToolExecutionPolicyConfig;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
pub use tool_runtime::execution_policy::{
    ToolExecutionPolicy, ToolExecutionPolicyResolution, ToolExecutionPolicySource,
    ToolExecutionRestrictionProfile, ToolExecutionSandboxProfile, ToolExecutionWarningPolicy,
};
pub use tool_runtime::execution_policy_service::ToolExecutionResolverInput;

pub fn tool_execution_policy(tool_name: &str) -> ToolExecutionPolicy {
    default_tool_execution_policy(tool_name)
}

pub fn resolve_tool_execution_policy(
    tool_name: &str,
    input: ToolExecutionResolverInput<'_>,
) -> ToolExecutionPolicy {
    resolve_tool_execution_policy_resolution(tool_name, input).policy
}

pub fn resolve_tool_execution_policy_resolution(
    tool_name: &str,
    input: ToolExecutionResolverInput<'_>,
) -> ToolExecutionPolicyResolution {
    ToolExecutionPolicyService::new(input).resolve(tool_name)
}

pub fn persisted_tool_execution_policy_from_metadata(
    request_metadata: Option<&JsonValue>,
) -> Option<ConfigToolExecutionPolicyConfig> {
    ToolExecutionPolicyService::persisted_policy_from_metadata(request_metadata)
}

pub fn tool_execution_policy_metadata(
    tool_name: &str,
    surface: &str,
    input: ToolExecutionResolverInput<'_>,
) -> HashMap<String, JsonValue> {
    ToolExecutionPolicyService::new(input).metadata(tool_name, surface)
}
