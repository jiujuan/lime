use super::McpConnection;
use crate::tool_extension::RuntimeExtensionConfig;
use rmcp::model::{
    CallToolRequestParam, CallToolResult, ErrorCode, ErrorData, GetPromptResult, InitializeResult,
    Prompt, ServerInfo, ServerNotification, Tool,
};
use rmcp::service::ServiceError;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use tokio_util::sync::CancellationToken;

pub type McpConnectionHandle = Arc<Mutex<Box<dyn McpConnection>>>;

pub struct McpConnectionCall {
    pub response: Pin<Box<dyn Future<Output = Result<CallToolResult, ErrorData>> + Send + 'static>>,
    pub notifications: mpsc::Receiver<ServerNotification>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct McpConnectionSummary {
    pub name: String,
    pub instructions: String,
    pub supports_resources: bool,
}

struct McpConnectionEntry {
    config: RuntimeExtensionConfig,
    connection: McpConnectionHandle,
    server_info: Option<ServerInfo>,
}

impl McpConnectionEntry {
    fn new(
        config: RuntimeExtensionConfig,
        connection: McpConnectionHandle,
        server_info: Option<ServerInfo>,
    ) -> Self {
        Self {
            config,
            connection,
            server_info,
        }
    }

    fn supports_resources(&self) -> bool {
        self.server_info
            .as_ref()
            .and_then(|info| info.capabilities.resources.as_ref())
            .is_some()
    }
}

#[derive(Default)]
pub struct McpConnectionRegistry {
    connections: Mutex<HashMap<String, McpConnectionEntry>>,
    loaded_deferred_tools: Mutex<HashSet<String>>,
}

impl McpConnectionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn register(
        &self,
        name: String,
        config: RuntimeExtensionConfig,
        connection: McpConnectionHandle,
        server_info: Option<InitializeResult>,
    ) {
        self.connections.lock().await.insert(
            name,
            McpConnectionEntry::new(config, connection, server_info),
        );
    }

    pub async fn remove(&self, name: &str) -> bool {
        self.connections.lock().await.remove(name).is_some()
    }

    pub async fn inherit_from(&self, other: &Self) {
        let inherited = {
            let connections = other.connections.lock().await;
            connections
                .iter()
                .map(|(name, entry)| {
                    (
                        name.clone(),
                        McpConnectionEntry::new(
                            entry.config.clone(),
                            Arc::clone(&entry.connection),
                            entry.server_info.clone(),
                        ),
                    )
                })
                .collect::<Vec<_>>()
        };
        self.connections.lock().await.extend(inherited);
    }

    pub async fn names(&self) -> Vec<String> {
        let mut names = self
            .connections
            .lock()
            .await
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        names.sort();
        names
    }

    pub async fn configs(&self) -> Vec<RuntimeExtensionConfig> {
        self.connections
            .lock()
            .await
            .values()
            .map(|entry| entry.config.clone())
            .collect()
    }

    pub async fn supports_resources(&self) -> bool {
        self.connections
            .lock()
            .await
            .values()
            .any(McpConnectionEntry::supports_resources)
    }

    pub async fn summaries(&self) -> Vec<McpConnectionSummary> {
        self.connections
            .lock()
            .await
            .iter()
            .map(|(name, entry)| McpConnectionSummary {
                name: name.clone(),
                instructions: entry
                    .server_info
                    .as_ref()
                    .and_then(|info| info.instructions.clone())
                    .unwrap_or_default(),
                supports_resources: entry.supports_resources(),
            })
            .collect()
    }

    pub async fn list_tools(
        &self,
        connection_name: Option<&str>,
    ) -> Result<Vec<Tool>, ServiceError> {
        let loaded_deferred_tools = self.loaded_deferred_tools.lock().await.clone();
        let connections = {
            let entries = self.connections.lock().await;
            entries
                .iter()
                .filter(|(name, _)| connection_name.is_none_or(|filter| name.as_str() == filter))
                .map(|(name, entry)| {
                    (
                        name.clone(),
                        entry.config.clone(),
                        Arc::clone(&entry.connection),
                    )
                })
                .collect::<Vec<_>>()
        };

        let mut tools = Vec::new();
        for (name, config, connection) in connections {
            let connection = connection.lock().await;
            let mut page = connection
                .list_tools(None, CancellationToken::default())
                .await?;
            loop {
                for tool in page.tools {
                    let prefixed_name = format!("{name}__{}", tool.name);
                    let visible = config.is_tool_exposed_by_default(&tool.name)
                        || loaded_deferred_tools.contains(&prefixed_name);
                    if config.is_tool_available(&tool.name) && visible {
                        tools.push(Tool {
                            name: prefixed_name.into(),
                            description: tool.description,
                            input_schema: tool.input_schema,
                            annotations: tool.annotations,
                            output_schema: tool.output_schema,
                            icons: tool.icons,
                            title: tool.title,
                            meta: tool.meta,
                        });
                    }
                }
                let Some(cursor) = page.next_cursor else {
                    break;
                };
                page = connection
                    .list_tools(Some(cursor), CancellationToken::default())
                    .await?;
            }
        }
        Ok(tools)
    }

    pub async fn dispatch(
        &self,
        tool_call: CallToolRequestParam,
        cancellation_token: CancellationToken,
    ) -> Result<McpConnectionCall, ErrorData> {
        let Some((connection_name, tool_name, config, connection)) =
            self.connection_for_tool(&tool_call.name).await
        else {
            return Err(ErrorData::new(
                ErrorCode::RESOURCE_NOT_FOUND,
                tool_call.name.clone(),
                None,
            ));
        };

        if !config.is_tool_available(&tool_name) {
            return Err(ErrorData::new(
                ErrorCode::RESOURCE_NOT_FOUND,
                format!(
                    "Tool '{tool_name}' is not available for MCP connection '{connection_name}'"
                ),
                None,
            ));
        }
        if config.deferred_loading()
            && !config.is_tool_exposed_by_default(&tool_name)
            && !self
                .loaded_deferred_tools
                .lock()
                .await
                .contains(tool_call.name.as_ref())
        {
            return Err(ErrorData::new(
                ErrorCode::RESOURCE_NOT_FOUND,
                format!(
                    "Tool '{}' is deferred. Use tool_search to select it first.",
                    tool_call.name
                ),
                None,
            ));
        }

        let notifications = connection.lock().await.subscribe().await;
        let arguments = tool_call.arguments;
        let response = Box::pin(async move {
            connection
                .lock()
                .await
                .call_tool(&tool_name, arguments, cancellation_token)
                .await
                .map_err(service_error_data)
        });
        Ok(McpConnectionCall {
            response,
            notifications,
        })
    }

    pub async fn list_prompts(
        &self,
        cancellation_token: CancellationToken,
    ) -> HashMap<String, Vec<Prompt>> {
        let connections = self.connection_handles().await;
        let mut prompts = HashMap::new();
        for (name, connection) in connections {
            if let Ok(result) = connection
                .lock()
                .await
                .list_prompts(None, cancellation_token.clone())
                .await
            {
                prompts.insert(name, result.prompts);
            }
        }
        prompts
    }

    pub async fn get_prompt(
        &self,
        connection_name: &str,
        name: &str,
        arguments: Value,
        cancellation_token: CancellationToken,
    ) -> Result<GetPromptResult, ErrorData> {
        let connection = self
            .connection(connection_name)
            .await
            .ok_or_else(|| missing_connection_error(connection_name))?;
        let result = connection
            .lock()
            .await
            .get_prompt(name, arguments, cancellation_token)
            .await
            .map_err(service_error_data);
        result
    }

    async fn connection_for_tool(
        &self,
        prefixed_name: &str,
    ) -> Option<(String, String, RuntimeExtensionConfig, McpConnectionHandle)> {
        self.connections
            .lock()
            .await
            .iter()
            .filter_map(|(name, entry)| {
                prefixed_name
                    .strip_prefix(name.as_str())
                    .and_then(|rest| rest.strip_prefix("__"))
                    .map(|tool_name| {
                        (
                            name.clone(),
                            tool_name.to_string(),
                            entry.config.clone(),
                            Arc::clone(&entry.connection),
                        )
                    })
            })
            .max_by_key(|(name, _, _, _)| name.len())
    }

    async fn connection(&self, name: &str) -> Option<McpConnectionHandle> {
        self.connections
            .lock()
            .await
            .get(name)
            .map(|entry| Arc::clone(&entry.connection))
    }

    async fn connection_handles(&self) -> Vec<(String, McpConnectionHandle)> {
        self.connections
            .lock()
            .await
            .iter()
            .map(|(name, entry)| (name.clone(), Arc::clone(&entry.connection)))
            .collect()
    }
}

fn missing_connection_error(name: &str) -> ErrorData {
    ErrorData::new(
        ErrorCode::INVALID_PARAMS,
        format!("MCP connection '{name}' not found"),
        None,
    )
}

fn service_error_data(error: ServiceError) -> ErrorData {
    match error {
        ServiceError::McpError(error) => error,
        error => ErrorData::new(ErrorCode::INTERNAL_ERROR, error.to_string(), None),
    }
}
