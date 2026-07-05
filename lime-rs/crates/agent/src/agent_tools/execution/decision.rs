use super::rules::default_tool_execution_policy;
use crate::agent_tools::catalog::tool_catalog_names_match;
use tool_runtime::execution_decision::{
    decide_tool_execution as decide_tool_execution_with_options, ToolExecutionPolicyDecisionOptions,
};
pub use tool_runtime::execution_decision::{
    ToolExecutionDecision, ToolExecutionDecisionInput, ToolExecutionDecisionKind,
};

pub fn decide_tool_execution(input: ToolExecutionDecisionInput<'_>) -> ToolExecutionDecision {
    decide_tool_execution_with_options(input, agent_tool_execution_policy_options())
}

pub fn agent_tool_execution_policy_options() -> ToolExecutionPolicyDecisionOptions {
    ToolExecutionPolicyDecisionOptions {
        default_policy_for_tool: default_tool_execution_policy,
        tool_names_match: tool_catalog_names_match,
    }
}
