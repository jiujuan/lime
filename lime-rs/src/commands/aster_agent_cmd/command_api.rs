use super::*;
use crate::commands::aster_agent_cmd::tool_runtime::ensure_runtime_support_tools_registered;

#[path = "command_api/json_value_fields.rs"]
pub(crate) mod json_value_fields;
#[path = "command_api/objective_continuation.rs"]
pub(crate) mod objective_continuation;
#[path = "command_api/objective_support.rs"]
pub(crate) mod objective_support;
#[path = "command_api/runtime_api.rs"]
pub(crate) mod runtime_api;
#[path = "command_api/thread_read_projection.rs"]
pub(crate) mod thread_read_projection;

fn build_runtime_command_context(
    app: AppHandle,
    state: State<'_, AsterAgentState>,
    db: State<'_, DbConnection>,
    api_key_provider_service: State<'_, ApiKeyProviderServiceState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    mcp_manager: State<'_, McpManagerState>,
    automation_state: State<'_, AutomationServiceState>,
) -> RuntimeCommandContext {
    RuntimeCommandContext::new(
        app,
        state.inner(),
        db.inner(),
        api_key_provider_service.inner(),
        logs.inner(),
        config_manager.inner(),
        mcp_manager.inner(),
        automation_state.inner(),
    )
}
