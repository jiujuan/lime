use super::inventory::ExtensionToolInventorySeed;
use crate::AgentRuntimeState;
use aster::agents::extension::ExtensionConfig as AsterExtensionConfig;
use tool_runtime::tool_definition::RuntimeToolDefinition;
use tool_runtime::tool_extension::RuntimeExtensionConfig;

pub(super) struct AgentToolInventoryRuntimeSeed {
    pub(super) registry_definitions: Vec<RuntimeToolDefinition>,
    pub(super) current_surface_tool_names: Vec<String>,
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

    let registry_definitions = {
        let registry = agent.tool_registry().read().await;
        registry
            .get_definitions()
            .into_iter()
            .map(|definition| {
                RuntimeToolDefinition::new(
                    definition.name,
                    definition.description,
                    definition.input_schema,
                )
            })
            .collect::<Vec<_>>()
    };
    let current_surface_tool_names = registry_definitions
        .iter()
        .map(|definition| definition.name.clone())
        .collect::<Vec<_>>();
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
        registry_definitions,
        current_surface_tool_names,
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
