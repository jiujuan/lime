use serde::{Deserialize, Serialize};

mod agent;
pub(crate) mod chatrecall_extension;
pub(crate) mod code_execution_extension;
pub(crate) mod collab_runtime;
pub(crate) mod execute_commands;
pub(crate) mod extension;
pub(crate) mod extension_malware_check;
pub(crate) mod extension_manager;
pub(crate) mod extension_manager_extension;
pub(crate) mod final_output_tool;
pub(crate) mod identity;
pub(crate) mod large_response_handler;
pub(crate) mod mcp_client;
pub(crate) mod moim;
pub(crate) mod prompt_input_modalities;
pub(crate) mod prompt_manager;
pub(crate) mod provider_trace;
pub(crate) mod reply_parts;
pub(crate) mod retry;
pub(crate) mod team_runtime;
pub(crate) mod tool_argument_coercion;
pub(crate) mod tool_execution;
pub(crate) mod types;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextTraceStep {
    pub stage: String,
    pub detail: String,
}

pub use agent::{Agent, AgentEvent, NativeToolExecutionHook, NativeToolExecutionRequest};
pub use extension::ExtensionConfig;
pub use identity::AgentIdentity;
pub use provider_trace::ProviderTraceEvent;
pub use tool_execution::ToolCallResult;
pub use types::{
    FrontendTool, PermissionRequestHookContext, PermissionRequestHookDecision,
    PermissionRequestHookHandler, SessionConfig, SuccessCheck,
};
