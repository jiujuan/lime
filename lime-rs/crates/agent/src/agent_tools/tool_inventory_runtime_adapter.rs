use super::inventory::ExtensionToolInventorySeed;
use crate::AgentRuntimeState;
use tool_runtime::tool_definition::RuntimeToolDefinition;
use tool_runtime::tool_extension::RuntimeExtensionConfig;

pub(super) struct AgentToolInventoryRuntimeSeed {
    pub(super) current_tool_definitions: Vec<RuntimeToolDefinition>,
    pub(super) extension_configs: Vec<RuntimeExtensionConfig>,
    pub(super) visible_extension_tools: Vec<ExtensionToolInventorySeed>,
    pub(super) searchable_extension_tools: Vec<ExtensionToolInventorySeed>,
}

pub(super) async fn read_agent_tool_inventory_runtime_seed(
    agent_state: &AgentRuntimeState,
) -> Option<AgentToolInventoryRuntimeSeed> {
    if !agent_state.is_initialized().await {
        return None;
    }
    let current_tool_definitions = agent_state.native_tool_definitions_snapshot().await;
    let extension_configs = agent_state.mcp_connections().configs().await;
    let visible_extension_tools = agent_state
        .mcp_connections()
        .list_tools(None)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|tool| ExtensionToolInventorySeed {
            name: tool.name.to_string(),
            description: tool
                .description
                .as_ref()
                .map(|description| description.to_string())
                .unwrap_or_default(),
        })
        .collect::<Vec<_>>();
    let searchable_extension_tools = visible_extension_tools.clone();

    Some(AgentToolInventoryRuntimeSeed {
        current_tool_definitions,
        extension_configs,
        visible_extension_tools,
        searchable_extension_tools,
    })
}
