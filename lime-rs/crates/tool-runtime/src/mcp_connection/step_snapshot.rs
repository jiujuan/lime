use super::{McpCallScope, McpConnectionCall, McpConnectionHandle};
use crate::tool_extension::{RuntimeExtensionConfig, RuntimeToolCaller};
use lime_core::tool_calling::extract_tool_surface_metadata;
use rmcp::model::{CallToolRequestParam, ErrorCode, ErrorData, Tool};
use rmcp::service::ServiceError;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
struct McpStepRoute {
    tool_name: String,
    allowed_callers: Option<Vec<String>>,
    connection: McpConnectionHandle,
}

#[derive(Clone)]
pub struct McpStepSnapshot {
    caller: RuntimeToolCaller,
    tools: Arc<Vec<Tool>>,
    routes: Arc<HashMap<String, McpStepRoute>>,
}

impl McpStepSnapshot {
    pub fn empty(caller: RuntimeToolCaller) -> Self {
        Self {
            caller,
            tools: Arc::new(Vec::new()),
            routes: Arc::new(HashMap::new()),
        }
    }

    pub fn tools(&self) -> &[Tool] {
        self.tools.as_ref()
    }

    pub async fn dispatch(
        &self,
        tool_call: CallToolRequestParam,
        scope: McpCallScope,
        cancellation_token: CancellationToken,
    ) -> Result<McpConnectionCall, ErrorData> {
        let Some(route) = self.routes.get(tool_call.name.as_ref()).cloned() else {
            return Err(ErrorData::new(
                ErrorCode::RESOURCE_NOT_FOUND,
                tool_call.name,
                None,
            ));
        };
        if !self.caller.is_allowed(route.allowed_callers.as_deref()) {
            return Err(ErrorData::new(
                ErrorCode::RESOURCE_NOT_FOUND,
                tool_call.name,
                None,
            ));
        }

        let notifications = route.connection.lock().await.subscribe().await;
        let arguments = tool_call.arguments;
        let response = Box::pin(async move {
            route
                .connection
                .lock()
                .await
                .call_tool(&route.tool_name, arguments, &scope, cancellation_token)
                .await
                .map_err(service_error_data)
        });
        Ok(McpConnectionCall {
            response,
            notifications,
        })
    }

    pub(super) async fn capture(
        connections: Vec<(String, RuntimeExtensionConfig, McpConnectionHandle)>,
        selected_deferred_tools: HashSet<String>,
        caller: RuntimeToolCaller,
        discovery_timeout: Duration,
    ) -> Self {
        let mut tools = Vec::new();
        let mut routes = HashMap::new();
        let selected_deferred_tools = Arc::new(selected_deferred_tools);
        let mut pending = JoinSet::new();
        for (connection_name, config, connection) in connections {
            let selected_deferred_tools = Arc::clone(&selected_deferred_tools);
            let caller = caller.clone();
            pending.spawn(async move {
                capture_connection(
                    connection_name,
                    config,
                    connection,
                    selected_deferred_tools,
                    caller,
                    discovery_timeout,
                )
                .await
            });
        }
        while let Some(result) = pending.join_next().await {
            let Ok(Some(captured)) = result else {
                continue;
            };
            for (tool, route) in captured.entries {
                let prefixed_name = tool.name.to_string();
                if routes.insert(prefixed_name, route).is_none() {
                    tools.push(tool);
                }
            }
        }
        tools.sort_by(|left, right| left.name.cmp(&right.name));
        Self {
            caller,
            tools: Arc::new(tools),
            routes: Arc::new(routes),
        }
    }
}

struct CapturedConnectionTools {
    entries: Vec<(Tool, McpStepRoute)>,
}

async fn capture_connection(
    connection_name: String,
    config: RuntimeExtensionConfig,
    connection: McpConnectionHandle,
    selected_deferred_tools: Arc<HashSet<String>>,
    caller: RuntimeToolCaller,
    discovery_timeout: Duration,
) -> Option<CapturedConnectionTools> {
    let cancellation_token = CancellationToken::new();
    let discovery = async {
        let connection_guard = connection.lock().await;
        let mut page = connection_guard
            .list_tools(None, cancellation_token.clone())
            .await?;
        let mut entries = Vec::new();
        let mut seen = HashSet::new();
        loop {
            for tool in page.tools {
                let tool_name = tool.name.to_string();
                let prefixed_name = format!("{connection_name}__{tool_name}");
                let visible = config.is_tool_exposed_by_default(&tool.name)
                    || selected_deferred_tools.contains(&prefixed_name);
                let allowed_callers = tool_allowed_callers(&tool, &config);
                if !config.is_tool_available(&tool.name)
                    || !visible
                    || !caller.is_allowed(allowed_callers.as_deref())
                    || !seen.insert(prefixed_name.clone())
                {
                    continue;
                }
                entries.push((
                    Tool {
                        name: prefixed_name.into(),
                        description: tool.description,
                        input_schema: tool.input_schema,
                        annotations: tool.annotations,
                        output_schema: tool.output_schema,
                        icons: tool.icons,
                        title: tool.title,
                        meta: tool.meta,
                    },
                    McpStepRoute {
                        tool_name,
                        allowed_callers,
                        connection: Arc::clone(&connection),
                    },
                ));
            }
            let Some(cursor) = page.next_cursor else {
                break;
            };
            page = connection_guard
                .list_tools(Some(cursor), cancellation_token.clone())
                .await?;
        }
        Ok::<_, ServiceError>(CapturedConnectionTools { entries })
    };

    match tokio::time::timeout(discovery_timeout, discovery).await {
        Ok(Ok(captured)) => Some(captured),
        Ok(Err(_)) => None,
        Err(_) => {
            cancellation_token.cancel();
            None
        }
    }
}

fn tool_allowed_callers(tool: &Tool, config: &RuntimeExtensionConfig) -> Option<Vec<String>> {
    extract_tool_surface_metadata(
        tool.name.as_ref(),
        &Value::Object((*tool.input_schema).clone()),
    )
    .allowed_callers
    .or_else(|| {
        config
            .allowed_caller()
            .map(|caller| vec![caller.to_string()])
    })
}

fn service_error_data(error: ServiceError) -> ErrorData {
    match error {
        ServiceError::McpError(error) => error,
        error => ErrorData::new(ErrorCode::INTERNAL_ERROR, error.to_string(), None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp_connection::{McpConnection, McpConnectionError, McpConnectionRegistry};
    use async_trait::async_trait;
    use rmcp::model::{CallToolResult, Content, JsonObject, ListToolsResult, ServerNotification};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::sync::{mpsc, Mutex};

    #[derive(Clone, Copy)]
    enum DiscoveryMode {
        Ready,
        Error,
        Slow,
    }

    struct TestConnection {
        tools: Vec<Tool>,
        output: String,
        discovery_mode: DiscoveryMode,
        call_count: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl McpConnection for TestConnection {
        async fn list_tools(
            &self,
            _next_cursor: Option<String>,
            _cancel_token: CancellationToken,
        ) -> Result<ListToolsResult, McpConnectionError> {
            match self.discovery_mode {
                DiscoveryMode::Ready => Ok(ListToolsResult::with_all_items(self.tools.clone())),
                DiscoveryMode::Error => Err(ServiceError::UnexpectedResponse),
                DiscoveryMode::Slow => std::future::pending().await,
            }
        }

        async fn call_tool(
            &self,
            name: &str,
            _arguments: Option<JsonObject>,
            _scope: &McpCallScope,
            _cancel_token: CancellationToken,
        ) -> Result<CallToolResult, McpConnectionError> {
            self.call_count.fetch_add(1, Ordering::SeqCst);
            Ok(CallToolResult::success(vec![Content::text(format!(
                "{}:{name}",
                self.output
            ))]))
        }

        async fn subscribe(&self) -> mpsc::Receiver<ServerNotification> {
            let (_sender, receiver) = mpsc::channel(1);
            receiver
        }
    }

    #[tokio::test]
    async fn captured_step_keeps_old_route_after_registry_replace() {
        let registry = McpConnectionRegistry::new();
        register(&registry, vec!["search"], "old").await;
        let captured = snapshot(&registry, HashSet::new(), Duration::from_secs(1)).await;

        registry.remove("docs").await;
        register(&registry, vec!["search", "new_tool"], "new").await;

        let old_result = captured
            .dispatch(call("docs__search"), scope(), CancellationToken::default())
            .await
            .expect("dispatch captured route")
            .response
            .await
            .expect("old result");
        let fresh = snapshot(&registry, HashSet::new(), Duration::from_secs(1)).await;
        let new_result = fresh
            .dispatch(call("docs__search"), scope(), CancellationToken::default())
            .await
            .expect("dispatch fresh route")
            .response
            .await
            .expect("new result");

        assert!(result_text(&old_result).contains("old:search"));
        assert!(result_text(&new_result).contains("new:search"));
    }

    #[tokio::test]
    async fn tools_added_after_capture_are_visible_only_to_next_step() {
        let registry = McpConnectionRegistry::new();
        register(&registry, vec!["search"], "old").await;
        let captured = snapshot(&registry, HashSet::new(), Duration::from_secs(1)).await;

        registry.remove("docs").await;
        register(&registry, vec!["search", "new_tool"], "new").await;
        let fresh = snapshot(&registry, HashSet::new(), Duration::from_secs(1)).await;

        assert!(!captured
            .tools()
            .iter()
            .any(|tool| tool.name == "docs__new_tool"));
        assert!(captured
            .dispatch(
                call("docs__new_tool"),
                scope(),
                CancellationToken::default(),
            )
            .await
            .is_err());
        assert!(fresh
            .tools()
            .iter()
            .any(|tool| tool.name == "docs__new_tool"));
        assert!(fresh
            .dispatch(
                call("docs__new_tool"),
                scope(),
                CancellationToken::default(),
            )
            .await
            .is_ok());
    }

    #[tokio::test]
    async fn deferred_selection_changes_only_the_next_snapshot() {
        let registry = McpConnectionRegistry::new();
        let config = RuntimeExtensionConfig::new(
            "docs",
            "Docs tools",
            vec!["search".to_string(), "query".to_string()],
            true,
            vec!["search".to_string()],
            None,
        );
        register_connection(
            &registry,
            "docs",
            config,
            vec![tool("search", None), tool("query", None)],
            "docs",
            DiscoveryMode::Ready,
            Arc::new(AtomicUsize::new(0)),
        )
        .await;

        let before = snapshot(&registry, HashSet::new(), Duration::from_secs(1)).await;
        let selected = HashSet::from(["docs__query".to_string()]);
        let after = snapshot(&registry, selected, Duration::from_secs(1)).await;

        assert!(before
            .tools()
            .iter()
            .any(|tool| tool.name == "docs__search"));
        assert!(!before.tools().iter().any(|tool| tool.name == "docs__query"));
        assert!(before
            .dispatch(call("docs__query"), scope(), CancellationToken::default())
            .await
            .is_err());
        assert!(after.tools().iter().any(|tool| tool.name == "docs__query"));
        assert!(after
            .dispatch(call("docs__query"), scope(), CancellationToken::default())
            .await
            .is_ok());
    }

    #[tokio::test]
    async fn assistant_snapshot_filters_and_rechecks_per_tool_caller_policy() {
        let registry = McpConnectionRegistry::new();
        let call_count = Arc::new(AtomicUsize::new(0));
        let config = RuntimeExtensionConfig::new(
            "mixed",
            "Mixed caller tools",
            vec![
                "public".to_string(),
                "review".to_string(),
                "execute".to_string(),
            ],
            false,
            Vec::new(),
            None,
        );
        let connection = register_connection(
            &registry,
            "mixed",
            config,
            vec![
                tool("public", None),
                tool("review", Some(&["assistant"])),
                tool("execute", Some(&["code_execution"])),
            ],
            "mixed",
            DiscoveryMode::Ready,
            call_count.clone(),
        )
        .await;

        let captured = snapshot(&registry, HashSet::new(), Duration::from_secs(1)).await;
        let names = captured
            .tools()
            .iter()
            .map(|tool| tool.name.as_ref())
            .collect::<Vec<_>>();
        assert_eq!(names, vec!["mixed__public", "mixed__review"]);
        assert!(captured
            .dispatch(
                call("mixed__execute"),
                scope(),
                CancellationToken::default(),
            )
            .await
            .is_err());
        assert_eq!(call_count.load(Ordering::SeqCst), 0);

        let denied_route = McpStepRoute {
            tool_name: "execute".to_string(),
            allowed_callers: Some(vec!["code_execution".to_string()]),
            connection,
        };
        let forged_snapshot = McpStepSnapshot {
            caller: RuntimeToolCaller::assistant(),
            tools: Arc::new(Vec::new()),
            routes: Arc::new(HashMap::from([(
                "mixed__execute".to_string(),
                denied_route,
            )])),
        };
        assert!(forged_snapshot
            .dispatch(
                call("mixed__execute"),
                scope(),
                CancellationToken::default(),
            )
            .await
            .is_err());
        assert_eq!(call_count.load(Ordering::SeqCst), 0);

        let code_execution = snapshot_for_caller(
            &registry,
            RuntimeToolCaller::parse("code_execution").expect("code execution caller"),
            HashSet::new(),
            Duration::from_secs(1),
        )
        .await;
        let code_names = code_execution
            .tools()
            .iter()
            .map(|tool| tool.name.as_ref())
            .collect::<Vec<_>>();
        assert_eq!(code_names, vec!["mixed__execute", "mixed__public"]);
        let code_result = code_execution
            .dispatch(
                call("mixed__execute"),
                scope(),
                CancellationToken::default(),
            )
            .await
            .expect("code execution route")
            .response
            .await
            .expect("code execution result");
        assert!(result_text(&code_result).contains("mixed:execute"));
        assert_eq!(call_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn per_tool_caller_schema_precedes_extension_fallback() {
        let registry = McpConnectionRegistry::new();
        let config = RuntimeExtensionConfig::new(
            "precedence",
            "Caller precedence",
            vec!["review".to_string()],
            false,
            Vec::new(),
            Some("code_execution".to_string()),
        );
        register_connection(
            &registry,
            "precedence",
            config,
            vec![tool("review", Some(&["assistant"]))],
            "precedence",
            DiscoveryMode::Ready,
            Arc::new(AtomicUsize::new(0)),
        )
        .await;

        let assistant = snapshot(&registry, HashSet::new(), Duration::from_secs(1)).await;
        assert!(assistant
            .tools()
            .iter()
            .any(|tool| tool.name == "precedence__review"));

        let code_execution = snapshot_for_caller(
            &registry,
            RuntimeToolCaller::parse("code_execution").expect("code execution caller"),
            HashSet::new(),
            Duration::from_secs(1),
        )
        .await;
        assert!(code_execution.tools().is_empty());
    }

    #[tokio::test]
    async fn discovery_error_keeps_healthy_server_tools() {
        let registry = McpConnectionRegistry::new();
        register_named(&registry, "fast", DiscoveryMode::Ready).await;
        register_named(&registry, "broken", DiscoveryMode::Error).await;

        let captured = snapshot(&registry, HashSet::new(), Duration::from_millis(50)).await;

        assert!(captured
            .tools()
            .iter()
            .any(|tool| tool.name == "fast__search"));
        assert!(!captured
            .tools()
            .iter()
            .any(|tool| tool.name == "broken__search"));
        assert!(captured
            .dispatch(call("fast__search"), scope(), CancellationToken::default())
            .await
            .is_ok());
    }

    #[tokio::test]
    async fn discovery_timeout_keeps_concurrent_healthy_server_tools() {
        let registry = McpConnectionRegistry::new();
        register_named(&registry, "slow", DiscoveryMode::Slow).await;
        register_named(&registry, "fast", DiscoveryMode::Ready).await;

        let captured = tokio::time::timeout(
            Duration::from_millis(200),
            snapshot(&registry, HashSet::new(), Duration::from_millis(10)),
        )
        .await
        .expect("per-server timeout should keep snapshot capture bounded");

        assert!(captured
            .tools()
            .iter()
            .any(|tool| tool.name == "fast__search"));
        assert!(!captured
            .tools()
            .iter()
            .any(|tool| tool.name == "slow__search"));
        assert_eq!(registry.names().await, vec!["fast", "slow"]);
    }

    async fn register(registry: &McpConnectionRegistry, tools: Vec<&str>, output: &str) {
        let config = RuntimeExtensionConfig::new(
            "docs",
            "Docs tools",
            tools.iter().map(|name| (*name).to_string()).collect(),
            false,
            tools.iter().map(|name| (*name).to_string()).collect(),
            None,
        );
        register_connection(
            registry,
            "docs",
            config,
            tools.into_iter().map(|name| tool(name, None)).collect(),
            output,
            DiscoveryMode::Ready,
            Arc::new(AtomicUsize::new(0)),
        )
        .await;
    }

    async fn register_named(
        registry: &McpConnectionRegistry,
        name: &str,
        discovery_mode: DiscoveryMode,
    ) {
        let config = RuntimeExtensionConfig::new(
            name,
            format!("{name} tools"),
            vec!["search".to_string()],
            false,
            vec!["search".to_string()],
            None,
        );
        register_connection(
            registry,
            name,
            config,
            vec![tool("search", None)],
            name,
            discovery_mode,
            Arc::new(AtomicUsize::new(0)),
        )
        .await;
    }

    async fn register_connection(
        registry: &McpConnectionRegistry,
        name: &str,
        config: RuntimeExtensionConfig,
        tools: Vec<Tool>,
        output: &str,
        discovery_mode: DiscoveryMode,
        call_count: Arc<AtomicUsize>,
    ) -> McpConnectionHandle {
        let connection: McpConnectionHandle = Arc::new(Mutex::new(Box::new(TestConnection {
            tools,
            output: output.to_string(),
            discovery_mode,
            call_count,
        })));
        registry
            .register(name.to_string(), config, Arc::clone(&connection))
            .await;
        connection
    }

    async fn snapshot(
        registry: &McpConnectionRegistry,
        selected_deferred_tools: HashSet<String>,
        discovery_timeout: Duration,
    ) -> McpStepSnapshot {
        snapshot_for_caller(
            registry,
            RuntimeToolCaller::assistant(),
            selected_deferred_tools,
            discovery_timeout,
        )
        .await
    }

    async fn snapshot_for_caller(
        registry: &McpConnectionRegistry,
        caller: RuntimeToolCaller,
        selected_deferred_tools: HashSet<String>,
        discovery_timeout: Duration,
    ) -> McpStepSnapshot {
        registry
            .step_snapshot(None, caller, selected_deferred_tools, discovery_timeout)
            .await
    }

    fn tool(name: &str, allowed_callers: Option<&[&str]>) -> Tool {
        let input_schema = allowed_callers.map_or_else(JsonObject::new, |allowed_callers| {
            serde_json::json!({
                "type": "object",
                "x-lime": { "allowed_callers": allowed_callers }
            })
            .as_object()
            .expect("tool schema object")
            .clone()
        });
        Tool {
            name: name.to_string().into(),
            title: None,
            description: Some(format!("{name} tool").into()),
            input_schema: Arc::new(input_schema),
            output_schema: None,
            annotations: None,
            icons: None,
            meta: None,
        }
    }

    fn call(name: &str) -> CallToolRequestParam {
        CallToolRequestParam {
            name: name.to_string().into(),
            arguments: None,
        }
    }

    fn scope() -> McpCallScope {
        McpCallScope::new(Some("turn-1")).expect("turn correlation")
    }

    fn result_text(result: &CallToolResult) -> String {
        serde_json::to_string(result).expect("serialize result")
    }
}
