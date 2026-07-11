use super::AgentRuntimeState;
use lime_core::database::DbConnection;
use std::sync::{Arc, Mutex};
use tempfile::TempDir;

const RUNTIME_GATEWAY_REGRESSION_TOOL_NAME: &str = "memory_list";

struct RuntimeGatewayRegressionExecutor;

impl tool_runtime::tool_executor::RuntimeToolExecutor for RuntimeGatewayRegressionExecutor {
    fn execute<'a>(
        &'a self,
        request: tool_runtime::tool_executor::RuntimeToolExecutionRequest<'a>,
    ) -> tool_runtime::tool_executor::RuntimeToolExecutionFuture<'a> {
        Box::pin(async move {
            Ok(
                tool_runtime::tool_executor::RuntimeToolExecutionResult::new(
                    true,
                    request.tool_name.to_string(),
                    None,
                    std::collections::HashMap::new(),
                ),
            )
        })
    }
}

fn runtime_gateway_regression_registration() -> crate::native_tools::NativeRegistration {
    crate::native_tools::NativeRegistration::gateway(
        tool_runtime::gateway_dispatch_execution::RuntimeGatewayToolExecutionRegistration::new(
            tool_runtime::tool_definition::RuntimeToolDefinition::new(
                RUNTIME_GATEWAY_REGRESSION_TOOL_NAME,
                "runtime gateway registration regression tool",
                serde_json::json!({
                    "type": "object",
                    "additionalProperties": false
                }),
            ),
            tool_runtime::tool_executor::RuntimeToolExecutorHandle::new(Arc::new(
                RuntimeGatewayRegressionExecutor,
            )),
            &["MemoryListRegression"],
        ),
    )
}

#[tokio::test]
async fn gateway_registration_is_current_visible_without_aster_registry_entry() {
    let state = AgentRuntimeState::new();
    let runtime_dir = TempDir::new().unwrap();
    crate::runtime_support::ensure_runtime_dirs_with_root(runtime_dir.path().to_path_buf())
        .unwrap();

    let db: DbConnection = Arc::new(Mutex::new(rusqlite::Connection::open_in_memory().unwrap()));
    {
        let conn = db.lock().unwrap();
        lime_core::database::schema::create_tables(&conn).unwrap();
    }

    state.init_agent_with_db(&db).await.unwrap();
    state
        .register_native_tool(runtime_gateway_regression_registration())
        .await
        .unwrap();

    assert!(state
        .native_tool_definitions_snapshot()
        .await
        .iter()
        .any(|definition| {
            definition.name == RUNTIME_GATEWAY_REGRESSION_TOOL_NAME
                && definition.description == "runtime gateway registration regression tool"
        }));

    let agent_guard = state.agent.read().await;
    let agent = agent_guard.as_ref().expect("agent");
    {
        let registry = agent.tool_registry().read().await;
        assert!(!registry.contains(RUNTIME_GATEWAY_REGRESSION_TOOL_NAME));
        assert_eq!(registry.canonical_native_name("MemoryListRegression"), None);
    }

    let listed_tools = agent.list_tools(None).await;
    assert!(listed_tools
        .iter()
        .any(|tool| tool.name.as_ref() == RUNTIME_GATEWAY_REGRESSION_TOOL_NAME));
}

#[tokio::test]
async fn shell_current_surface_is_model_visible_without_aster_registry_entry() {
    let state = AgentRuntimeState::new();
    let runtime_dir = TempDir::new().unwrap();
    crate::runtime_support::ensure_runtime_dirs_with_root(runtime_dir.path().to_path_buf())
        .unwrap();

    let db: DbConnection = Arc::new(Mutex::new(rusqlite::Connection::open_in_memory().unwrap()));
    {
        let conn = db.lock().unwrap();
        lime_core::database::schema::create_tables(&conn).unwrap();
    }

    state.init_agent_with_db(&db).await.unwrap();

    let agent_guard = state.agent.read().await;
    let agent = agent_guard.as_ref().expect("agent");
    {
        let registry = agent.tool_registry().read().await;
        assert!(!registry.contains("Bash"));
        assert_eq!(registry.canonical_native_name("shell_command"), None);
    }

    let listed_tools = agent.list_tools(None).await;
    assert!(
        listed_tools.iter().any(|tool| tool.name.as_ref() == "Bash"),
        "Bash must be provider-visible through the current shell tool surface"
    );
}
