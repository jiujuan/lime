use crate::runtime::ToolInventoryReadRequest;
use crate::AppDataSource;
use crate::RuntimeCoreError;
use app_server_protocol::McpServerStatusListResponse;
use app_server_protocol::McpToolListResponse;
use aster::agents::extension::ExtensionConfig;
use lime_agent::agent_tools::catalog::{
    build_mcp_extension_surface, mcp_extension_runtime_name, WorkspaceToolSurface,
};
use lime_agent::agent_tools::execution::persisted_tool_execution_policy_from_metadata;
use lime_agent::agent_tools::inventory::{
    build_tool_inventory, AgentToolInventoryBuildInput, ExtensionToolInventorySeed,
};
use lime_agent::AsterAgentState;
use lime_core::tool_calling::extract_tool_surface_metadata;
use lime_mcp::McpToolDefinition;
use serde_json::{Map, Value};
use std::collections::{BTreeMap, HashSet};
use std::sync::Arc;

pub(crate) async fn read_tool_inventory(
    agent_state: &AsterAgentState,
    request: ToolInventoryReadRequest,
    config_metadata: Option<Value>,
    app_data_source: Option<Arc<dyn AppDataSource>>,
) -> Result<serde_json::Value, RuntimeCoreError> {
    let caller = request
        .caller
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("assistant")
        .to_string();
    let request_metadata = merged_inventory_metadata(request.metadata, config_metadata);
    let persisted_execution_policy =
        persisted_tool_execution_policy_from_metadata(request_metadata.as_ref());

    let mcp_snapshot = read_mcp_inventory_snapshot(app_data_source).await;
    let mut warnings = mcp_snapshot.warnings;

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
            &mcp_snapshot.tools,
        );
        warnings.push("Aster agent is not initialized".to_string());
        return serde_json::to_value(build_tool_inventory(AgentToolInventoryBuildInput {
            surface: WorkspaceToolSurface {
                workbench: request.workbench,
                browser_assist: request.browser_assist,
            },
            caller,
            agent_initialized: false,
            warnings,
            persisted_execution_policy: persisted_execution_policy.clone(),
            request_metadata,
            mcp_server_names: mcp_snapshot.server_names,
            mcp_tools: mcp_snapshot.tools,
            registry_definitions: Vec::new(),
            resource_helpers_supported: mcp_snapshot.resource_helpers_supported,
            current_surface_tool_names: Vec::new(),
            extension_configs,
            visible_extension_tools,
            searchable_extension_tools,
        }))
        .map_err(|error| RuntimeCoreError::Backend(error.to_string()));
    };

    let registry_definitions = {
        let registry = agent.tool_registry().read().await;
        registry.get_definitions()
    };
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
        &mcp_snapshot.tools,
    );
    let current_surface_tool_names = registry_definitions
        .iter()
        .map(|definition| definition.name.clone())
        .collect::<Vec<_>>();

    serde_json::to_value(build_tool_inventory(AgentToolInventoryBuildInput {
        surface: WorkspaceToolSurface {
            workbench: request.workbench,
            browser_assist: request.browser_assist,
        },
        caller,
        agent_initialized: true,
        warnings,
        persisted_execution_policy,
        request_metadata,
        mcp_server_names: mcp_snapshot.server_names,
        mcp_tools: mcp_snapshot.tools,
        registry_definitions,
        resource_helpers_supported: mcp_snapshot.resource_helpers_supported,
        current_surface_tool_names,
        extension_configs,
        visible_extension_tools,
        searchable_extension_tools,
    }))
    .map_err(|error| RuntimeCoreError::Backend(error.to_string()))
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

#[derive(Debug, Default)]
struct McpInventorySnapshot {
    server_names: Vec<String>,
    tools: Vec<McpToolDefinition>,
    resource_helpers_supported: bool,
    warnings: Vec<String>,
}

async fn read_mcp_inventory_snapshot(
    app_data_source: Option<Arc<dyn AppDataSource>>,
) -> McpInventorySnapshot {
    let Some(app_data_source) = app_data_source else {
        return McpInventorySnapshot::default();
    };

    let mut snapshot = McpInventorySnapshot::default();
    match app_data_source.list_mcp_servers_with_status().await {
        Ok(response) => apply_mcp_server_status_snapshot(&mut snapshot, response),
        Err(error) => snapshot
            .warnings
            .push(format!("MCP server status snapshot unavailable: {error}")),
    }
    match app_data_source.list_mcp_tools().await {
        Ok(response) => apply_mcp_tool_snapshot(&mut snapshot, response),
        Err(error) => snapshot
            .warnings
            .push(format!("MCP tool snapshot unavailable: {error}")),
    }

    snapshot.server_names.sort();
    snapshot.server_names.dedup();
    snapshot
}

fn apply_mcp_server_status_snapshot(
    snapshot: &mut McpInventorySnapshot,
    response: McpServerStatusListResponse,
) {
    for server in response.servers {
        if let Some(name) = string_field(&server, &["name"]) {
            snapshot.server_names.push(name);
        }

        let is_running = bool_field(&server, &["isRunning", "is_running"]).unwrap_or(false);
        let supports_resources = bool_field(
            &server,
            &[
                "runtimeStatus.supportsResources",
                "runtime_status.supports_resources",
                "serverInfo.supportsResources",
                "server_info.supports_resources",
            ],
        )
        .unwrap_or(false);
        snapshot.resource_helpers_supported |= is_running && supports_resources;
    }
}

fn apply_mcp_tool_snapshot(snapshot: &mut McpInventorySnapshot, response: McpToolListResponse) {
    for tool in response.tools {
        match serde_json::from_value::<McpToolDefinition>(tool) {
            Ok(mut tool) => {
                hydrate_mcp_tool_metadata(&mut tool);
                snapshot.server_names.push(tool.server_name.clone());
                snapshot.tools.push(tool);
            }
            Err(error) => snapshot
                .warnings
                .push(format!("MCP tool snapshot entry skipped: {error}")),
        }
    }
}

fn hydrate_mcp_tool_metadata(tool: &mut McpToolDefinition) {
    if tool.deferred_loading.is_some()
        && tool.always_visible.is_some()
        && tool.allowed_callers.is_some()
        && tool.tags.is_some()
        && tool.input_examples.is_some()
    {
        return;
    }
    let metadata = extract_tool_surface_metadata(&tool.name, &tool.input_schema);
    if tool.deferred_loading.is_none() {
        tool.deferred_loading = metadata.deferred_loading;
    }
    if tool.always_visible.is_none() {
        tool.always_visible = metadata.always_visible;
    }
    if tool.allowed_callers.is_none() {
        tool.allowed_callers = metadata.allowed_callers;
    }
    if tool.tags.is_none() {
        tool.tags = metadata.tags;
    }
    if tool.input_examples.is_none() && !metadata.input_examples.is_empty() {
        tool.input_examples = Some(metadata.input_examples);
    }
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| nested_value(value, key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn bool_field(value: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter()
        .filter_map(|key| nested_value(value, key))
        .find_map(Value::as_bool)
}

fn nested_value<'a>(value: &'a Value, path: &str) -> Option<&'a Value> {
    path.split('.')
        .try_fold(value, |current, key| current.get(key))
}

fn merged_inventory_metadata(
    request_metadata: Option<Value>,
    config_metadata: Option<Value>,
) -> Option<Value> {
    match (request_metadata, config_metadata) {
        (Some(Value::Object(mut request_object)), Some(config_metadata)) => {
            request_object
                .entry("config".to_string())
                .or_insert(config_metadata);
            Some(Value::Object(request_object))
        }
        (Some(request_metadata), _) => Some(request_metadata),
        (None, Some(config_metadata)) => {
            let mut object = Map::new();
            object.insert("config".to_string(), config_metadata);
            Some(Value::Object(object))
        }
        (None, None) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn inventory_request(metadata: Option<Value>) -> ToolInventoryReadRequest {
        ToolInventoryReadRequest {
            caller: Some("assistant".to_string()),
            workbench: true,
            browser_assist: false,
            metadata,
        }
    }

    async fn read_snapshot(
        request_metadata: Option<Value>,
        config_metadata: Option<Value>,
    ) -> Value {
        read_tool_inventory(
            &AsterAgentState::new(),
            inventory_request(request_metadata),
            config_metadata,
            None,
        )
        .await
        .expect("tool inventory should be readable")
    }

    fn catalog_tool<'a>(inventory: &'a Value, name: &str) -> &'a Value {
        inventory
            .get("catalog_tools")
            .and_then(Value::as_array)
            .and_then(|entries| {
                entries
                    .iter()
                    .find(|entry| entry.get("name").and_then(Value::as_str) == Some(name))
            })
            .expect("catalog entry should exist")
    }

    #[tokio::test]
    async fn read_tool_inventory_uses_persisted_config_metadata_without_request_metadata() {
        let inventory = read_snapshot(
            None,
            Some(json!({
                "agent": {
                    "toolExecution": {
                        "toolOverrides": {
                            "bash": {
                                "warningPolicy": "none",
                                "sandboxProfile": "none"
                            }
                        }
                    }
                }
            })),
        )
        .await;

        assert_eq!(
            catalog_tool(&inventory, "Bash")
                .get("execution_warning_policy")
                .and_then(Value::as_str),
            Some("none")
        );
        assert_eq!(
            catalog_tool(&inventory, "Bash")
                .get("execution_warning_policy_source")
                .and_then(Value::as_str),
            Some("persisted")
        );
        assert_eq!(
            catalog_tool(&inventory, "Bash")
                .get("execution_sandbox_profile")
                .and_then(Value::as_str),
            Some("none")
        );
        assert_eq!(
            catalog_tool(&inventory, "Bash")
                .get("execution_sandbox_profile_source")
                .and_then(Value::as_str),
            Some("persisted")
        );
    }

    #[tokio::test]
    async fn read_tool_inventory_runtime_metadata_overrides_persisted_config_metadata() {
        let inventory = read_snapshot(
            Some(json!({
                "harness": {
                    "executionPolicy": {
                        "toolOverrides": {
                            "bash": {
                                "warningPolicy": "shell_command_risk",
                                "sandboxProfile": "workspace_command"
                            }
                        }
                    }
                }
            })),
            Some(json!({
                "agent": {
                    "toolExecution": {
                        "toolOverrides": {
                            "bash": {
                                "warningPolicy": "none",
                                "sandboxProfile": "none"
                            }
                        }
                    }
                }
            })),
        )
        .await;

        assert_eq!(
            catalog_tool(&inventory, "Bash")
                .get("execution_warning_policy")
                .and_then(Value::as_str),
            Some("shell_command_risk")
        );
        assert_eq!(
            catalog_tool(&inventory, "Bash")
                .get("execution_warning_policy_source")
                .and_then(Value::as_str),
            Some("runtime")
        );
        assert_eq!(
            catalog_tool(&inventory, "Bash")
                .get("execution_sandbox_profile")
                .and_then(Value::as_str),
            Some("workspace_command")
        );
        assert_eq!(
            catalog_tool(&inventory, "Bash")
                .get("execution_sandbox_profile_source")
                .and_then(Value::as_str),
            Some("runtime")
        );
    }
}
