use super::tool_orchestrator::{
    execute_planned_tool_batch, PlannedToolExecution, ToolExecutionBatch, ToolExecutionBatchInput,
};
use crate::{AgentRuntimeState, AgentTurnContext};
use std::path::PathBuf;
use tool_runtime::web_search::runtime_web_search_executor_handle;

pub(super) struct WorkspacePatchRuntimeToolBatchInput {
    pub(super) session_id: String,
    pub(super) working_directory: PathBuf,
    pub(super) turn_context: Option<AgentTurnContext>,
    pub(super) parallelism: usize,
}

pub(super) async fn execute_workspace_patch_runtime_tool_batch(
    _agent_state: &AgentRuntimeState,
    input: WorkspacePatchRuntimeToolBatchInput,
    planned_tools: Vec<PlannedToolExecution>,
) -> Result<ToolExecutionBatch, String> {
    Ok(execute_planned_tool_batch(
        ToolExecutionBatchInput {
            executor: runtime_web_search_executor_handle(),
            session_id: input.session_id,
            working_directory: input.working_directory,
            cancel_token: None,
            turn_context: input.turn_context,
            persisted_execution_policy: None,
            parallelism: input.parallelism,
            auto_mode: true,
            bypass_restrictions: false,
            live_process_registry: None,
        },
        planned_tools,
    )
    .await)
}
