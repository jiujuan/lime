use super::inventory::ExtensionToolInventorySeed;
use crate::AgentRuntimeState;
use aster::agents::extension::ExtensionConfig as AsterExtensionConfig;
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
    let agent_arc = agent_state.get_agent_arc();
    let guard = agent_arc.read().await;
    let agent = guard.as_ref()?;
    let current_tool_definitions = agent_state.native_tool_definitions_snapshot().await;
    let extension_configs = agent
        .get_extension_configs()
        .await
        .into_iter()
        .map(project_aster_extension_config)
        .collect::<Vec<_>>();
    let visible_extension_tools = agent
        .list_tools(None)
        .await
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

fn project_aster_extension_config(config: AsterExtensionConfig) -> RuntimeExtensionConfig {
    match config {
        AsterExtensionConfig::Sse {
            name, description, ..
        } => RuntimeExtensionConfig::new(name, description, Vec::new(), false, Vec::new(), None),
        AsterExtensionConfig::StreamableHttp {
            name,
            description,
            available_tools,
            deferred_loading,
            always_expose_tools,
            allowed_caller,
            ..
        }
        | AsterExtensionConfig::Stdio {
            name,
            description,
            available_tools,
            deferred_loading,
            always_expose_tools,
            allowed_caller,
            ..
        }
        | AsterExtensionConfig::Builtin {
            name,
            description,
            available_tools,
            deferred_loading,
            always_expose_tools,
            allowed_caller,
            ..
        }
        | AsterExtensionConfig::Platform {
            name,
            description,
            available_tools,
            deferred_loading,
            always_expose_tools,
            allowed_caller,
            ..
        }
        | AsterExtensionConfig::InlinePython {
            name,
            description,
            available_tools,
            deferred_loading,
            always_expose_tools,
            allowed_caller,
            ..
        }
        | AsterExtensionConfig::Frontend {
            name,
            description,
            available_tools,
            deferred_loading,
            always_expose_tools,
            allowed_caller,
            ..
        } => RuntimeExtensionConfig::new(
            name,
            description,
            available_tools,
            deferred_loading,
            always_expose_tools,
            allowed_caller,
        ),
    }
}
