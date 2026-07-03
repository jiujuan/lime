use crate::agent_tools::catalog::{build_mcp_extension_surface, mcp_extension_runtime_name};
use crate::agent_tools::inventory::ExtensionToolInventorySeed;
use crate::mcp::McpToolDefinition;
use crate::AsterAgentState;
use aster::agents::extension::ExtensionConfig;
use aster::tools::ToolDefinition;
use std::collections::{BTreeMap, HashSet};

#[derive(Debug, Clone)]
pub struct AgentToolInventoryRuntimeSnapshot {
    pub agent_initialized: bool,
    pub warnings: Vec<String>,
    pub registry_definitions: Vec<ToolDefinition>,
    pub current_surface_tool_names: Vec<String>,
    pub extension_configs: Vec<ExtensionConfig>,
    pub visible_extension_tools: Vec<ExtensionToolInventorySeed>,
    pub searchable_extension_tools: Vec<ExtensionToolInventorySeed>,
}

pub async fn read_agent_tool_inventory_runtime_snapshot(
    agent_state: &AsterAgentState,
    mcp_tools: &[McpToolDefinition],
) -> AgentToolInventoryRuntimeSnapshot {
    let agent_arc = agent_state.get_agent_arc();
    let guard = agent_arc.read().await;
    let Some(agent) = guard.as_ref() else {
        let mut extension_configs = Vec::new();
        let mut visible_extension_tools = Vec::new();
        let mut searchable_extension_tools = Vec::new();
        merge_mcp_extension_projection(
            &mut extension_configs,
            &mut visible_extension_tools,
            &mut searchable_extension_tools,
            mcp_tools,
        );
        return AgentToolInventoryRuntimeSnapshot {
            agent_initialized: false,
            warnings: vec!["Aster agent is not initialized".to_string()],
            registry_definitions: Vec::new(),
            current_surface_tool_names: Vec::new(),
            extension_configs,
            visible_extension_tools,
            searchable_extension_tools,
        };
    };

    let registry_definitions = {
        let registry = agent.tool_registry().read().await;
        registry.get_definitions()
    };
    let current_surface_tool_names = registry_definitions
        .iter()
        .map(|definition| definition.name.clone())
        .collect::<Vec<_>>();
    let mut extension_configs = agent.get_extension_configs().await;
    let mut visible_extension_tools = agent
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
    let mut searchable_extension_tools = visible_extension_tools.clone();
    merge_mcp_extension_projection(
        &mut extension_configs,
        &mut visible_extension_tools,
        &mut searchable_extension_tools,
        mcp_tools,
    );

    AgentToolInventoryRuntimeSnapshot {
        agent_initialized: true,
        warnings: Vec::new(),
        registry_definitions,
        current_surface_tool_names,
        extension_configs,
        visible_extension_tools,
        searchable_extension_tools,
    }
}

fn merge_mcp_extension_projection(
    extension_configs: &mut Vec<ExtensionConfig>,
    visible_extension_tools: &mut Vec<ExtensionToolInventorySeed>,
    searchable_extension_tools: &mut Vec<ExtensionToolInventorySeed>,
    mcp_tools: &[McpToolDefinition],
) {
    if mcp_tools.is_empty() {
        return;
    }

    let mut existing_extensions = extension_configs
        .iter()
        .map(|config| config.name())
        .collect::<HashSet<_>>();
    let mut tools_by_extension: BTreeMap<String, Vec<McpToolDefinition>> = BTreeMap::new();
    for tool in mcp_tools {
        let extension_name = mcp_extension_runtime_name(&tool.server_name);
        tools_by_extension
            .entry(extension_name)
            .or_default()
            .push(tool.clone());
        searchable_extension_tools.push(ExtensionToolInventorySeed {
            name: tool.name.clone(),
            description: tool.description.clone(),
        });
        if mcp_tool_visible_by_default(tool) {
            visible_extension_tools.push(ExtensionToolInventorySeed {
                name: tool.name.clone(),
                description: tool.description.clone(),
            });
        }
    }

    for (extension_name, tools) in tools_by_extension {
        if existing_extensions.contains(&extension_name) {
            continue;
        }
        let server_name = tools
            .first()
            .map(|tool| tool.server_name.as_str())
            .unwrap_or(extension_name.as_str());
        let surface = build_mcp_extension_surface(
            &extension_name,
            format!("MCP server {server_name} tools"),
            &tools,
        );
        if !surface.has_tools() {
            continue;
        }
        let bridge_name = surface.extension_name.clone();
        extension_configs.push(ExtensionConfig::Builtin {
            name: bridge_name.clone(),
            display_name: Some(server_name.to_string()),
            description: surface.description,
            timeout: None,
            bundled: Some(false),
            available_tools: surface.available_tools,
            deferred_loading: surface.deferred_loading,
            always_expose_tools: surface.always_expose_tools,
            allowed_caller: surface.allowed_caller,
        });
        existing_extensions.insert(bridge_name);
    }

    dedupe_extension_tool_seeds(visible_extension_tools);
    dedupe_extension_tool_seeds(searchable_extension_tools);
}

fn mcp_tool_visible_by_default(tool: &McpToolDefinition) -> bool {
    tool.always_visible.unwrap_or(false) || !tool.deferred_loading.unwrap_or(false)
}

fn dedupe_extension_tool_seeds(seeds: &mut Vec<ExtensionToolInventorySeed>) {
    let mut seen = HashSet::new();
    seeds.retain(|seed| seen.insert(seed.name.clone()));
    seeds.sort_by(|left, right| left.name.cmp(&right.name));
}
