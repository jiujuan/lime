use crate::runtime::ToolInventoryReadRequest;
use crate::RuntimeCoreError;
use lime_agent::agent_tools::catalog::WorkspaceToolSurface;
use lime_agent::agent_tools::execution::persisted_tool_execution_policy_from_metadata;
use lime_agent::agent_tools::inventory::{
    build_tool_inventory, AgentToolInventoryBuildInput, ExtensionToolInventorySeed,
};
use lime_agent::AsterAgentState;
use serde_json::{Map, Value};

pub(crate) async fn read_tool_inventory(
    agent_state: &AsterAgentState,
    request: ToolInventoryReadRequest,
    config_metadata: Option<Value>,
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

    let agent_arc = agent_state.get_agent_arc();
    let guard = agent_arc.read().await;
    let Some(agent) = guard.as_ref() else {
        return serde_json::to_value(build_tool_inventory(AgentToolInventoryBuildInput {
            surface: WorkspaceToolSurface {
                workbench: request.workbench,
                browser_assist: request.browser_assist,
            },
            caller,
            agent_initialized: false,
            warnings: vec!["Aster agent is not initialized".to_string()],
            persisted_execution_policy: persisted_execution_policy.clone(),
            request_metadata,
            mcp_server_names: Vec::new(),
            mcp_tools: Vec::new(),
            registry_definitions: Vec::new(),
            resource_helpers_supported: false,
            current_surface_tool_names: Vec::new(),
            extension_configs: Vec::new(),
            visible_extension_tools: Vec::new(),
            searchable_extension_tools: Vec::new(),
        }))
        .map_err(|error| RuntimeCoreError::Backend(error.to_string()));
    };

    let registry_definitions = {
        let registry = agent.tool_registry().read().await;
        registry.get_definitions()
    };
    let extension_configs = agent.get_extension_configs().await;
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
        warnings: Vec::new(),
        persisted_execution_policy,
        request_metadata,
        mcp_server_names: Vec::new(),
        mcp_tools: Vec::new(),
        registry_definitions,
        resource_helpers_supported: false,
        current_surface_tool_names,
        extension_configs,
        visible_extension_tools,
        searchable_extension_tools,
    }))
    .map_err(|error| RuntimeCoreError::Backend(error.to_string()))
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
