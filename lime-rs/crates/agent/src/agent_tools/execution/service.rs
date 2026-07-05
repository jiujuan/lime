use super::policy::{ToolExecutionPolicyResolution, ToolExecutionResolverInput};
use super::rules::{
    default_tool_execution_policy, NetworkRule, NetworkRuleMatch, ShellCommandRule,
    ShellCommandRuleMatch,
};
use crate::agent_tools::catalog::tool_catalog_names_match;
use lime_core::config::ToolExecutionPolicyConfig as ConfigToolExecutionPolicyConfig;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use tool_runtime::execution_policy_service::{
    ToolExecutionPolicyService as RuntimeToolExecutionPolicyService,
    ToolExecutionPolicyServiceOptions,
};

#[derive(Clone, Copy)]
pub struct ToolExecutionPolicyService<'a> {
    inner: RuntimeToolExecutionPolicyService<'a>,
}

impl<'a> ToolExecutionPolicyService<'a> {
    pub fn new(input: ToolExecutionResolverInput<'a>) -> Self {
        Self {
            inner: RuntimeToolExecutionPolicyService::new(
                input,
                ToolExecutionPolicyServiceOptions {
                    default_policy_for_tool: default_tool_execution_policy,
                    tool_names_match: tool_catalog_names_match,
                },
            ),
        }
    }

    pub fn resolve(&self, tool_name: &str) -> ToolExecutionPolicyResolution {
        self.inner.resolve(tool_name)
    }

    pub fn metadata(&self, tool_name: &str, surface: &str) -> HashMap<String, JsonValue> {
        self.inner.metadata(tool_name, surface)
    }

    pub fn classify_shell_command(&self, command: &str) -> Option<ShellCommandRuleMatch> {
        self.inner.classify_shell_command(command)
    }

    pub fn classify_network_access(
        &self,
        tool_name: &str,
        params: &JsonValue,
        command: Option<&str>,
    ) -> Option<NetworkRuleMatch> {
        self.inner
            .classify_network_access(tool_name, params, command)
    }

    pub fn shell_command_rules(&self) -> Vec<ShellCommandRule> {
        self.inner.shell_command_rules()
    }

    pub fn network_rules(&self) -> Vec<NetworkRule> {
        self.inner.network_rules()
    }

    pub fn metadata_for_resolution(
        &self,
        tool_name: &str,
        surface: &str,
        resolution: ToolExecutionPolicyResolution,
    ) -> HashMap<String, JsonValue> {
        self.inner
            .metadata_for_resolution(tool_name, surface, resolution)
    }

    pub fn persisted_policy_from_metadata(
        request_metadata: Option<&JsonValue>,
    ) -> Option<ConfigToolExecutionPolicyConfig> {
        RuntimeToolExecutionPolicyService::persisted_policy_from_metadata(request_metadata)
    }
}
