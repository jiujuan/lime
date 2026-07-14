use super::{McpConnection, McpStepSnapshot};
use crate::tool_extension::{RuntimeExtensionConfig, RuntimeToolCaller};
use rmcp::model::{CallToolResult, ErrorData, ServerNotification, Tool};
use rmcp::service::ServiceError;
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, Mutex};

pub type McpConnectionHandle = Arc<Mutex<Box<dyn McpConnection>>>;

pub struct McpConnectionCall {
    pub response: Pin<Box<dyn Future<Output = Result<CallToolResult, ErrorData>> + Send + 'static>>,
    pub notifications: mpsc::Receiver<ServerNotification>,
}

struct McpConnectionEntry {
    config: RuntimeExtensionConfig,
    connection: McpConnectionHandle,
}

impl McpConnectionEntry {
    fn new(config: RuntimeExtensionConfig, connection: McpConnectionHandle) -> Self {
        Self { config, connection }
    }
}

const DEFAULT_TOOL_DISCOVERY_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Default)]
pub struct McpConnectionRegistry {
    connections: Mutex<HashMap<String, McpConnectionEntry>>,
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
    ) {
        self.connections
            .lock()
            .await
            .insert(name, McpConnectionEntry::new(config, connection));
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

    pub async fn list_tools(
        &self,
        connection_name: Option<&str>,
    ) -> Result<Vec<Tool>, ServiceError> {
        Ok(self
            .step_snapshot(
                connection_name,
                RuntimeToolCaller::assistant(),
                HashSet::new(),
                DEFAULT_TOOL_DISCOVERY_TIMEOUT,
            )
            .await
            .tools()
            .to_vec())
    }

    pub async fn step_snapshot(
        &self,
        connection_name: Option<&str>,
        caller: RuntimeToolCaller,
        selected_deferred_tools: HashSet<String>,
        discovery_timeout: Duration,
    ) -> McpStepSnapshot {
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
        McpStepSnapshot::capture(
            connections,
            selected_deferred_tools,
            caller,
            discovery_timeout,
        )
        .await
    }
}
