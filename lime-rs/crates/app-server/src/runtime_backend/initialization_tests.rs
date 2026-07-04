use super::*;
use crate::execution_process::ExecutionProcessServer;
use crate::runtime::RuntimeHostContext;
use app_server_protocol::{AgentSession, AgentSessionActionType, AgentSessionStatus};
use lime_core::database::schema::create_tables;
use rusqlite::Connection;
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct TestRuntimeEventSink {
    events: Vec<RuntimeEvent>,
}

impl RuntimeEventSink for TestRuntimeEventSink {
    fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError> {
        self.events.push(event);
        Ok(())
    }
}

fn test_db() -> DbConnection {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    create_tables(&conn).expect("create schema");
    Arc::new(Mutex::new(conn))
}

#[tokio::test]
async fn main_turn_initializes_agent_before_live_execution_hook() {
    let db = test_db();
    let db = provider_config::initialize_runtime_database(Some(&db)).expect("runtime database");
    let backend = RuntimeBackend::with_db_and_execution_process_server(
        db.clone(),
        ExecutionProcessServer::default(),
    );

    assert!(!backend.agent_state.is_initialized().await);

    backend
        .ensure_agent_initialized(&db)
        .await
        .expect("main turn should initialize agent before hook installation");
    backend
        .install_live_execution_process_hook_if_available()
        .await
        .expect("live execution hook should install after agent initialization");

    assert!(backend.agent_state.is_initialized().await);
}

#[tokio::test]
async fn respond_action_initializes_agent_before_runtime_resume() {
    let db = test_db();
    let db = provider_config::initialize_runtime_database(Some(&db)).expect("runtime database");
    let backend = RuntimeBackend::with_db(db.clone());
    let mut sink = TestRuntimeEventSink::default();

    assert!(!backend.agent_state.is_initialized().await);

    ExecutionBackend::respond_action(
        &backend,
        ActionRespondRequest {
            host: RuntimeHostContext::default(),
            session: AgentSession {
                session_id: "session-respond-init".to_string(),
                thread_id: "thread-respond-init".to_string(),
                app_id: "agent".to_string(),
                workspace_id: None,
                business_object_ref: None,
                status: AgentSessionStatus::Running,
                created_at: chrono::Utc::now().to_rfc3339(),
                updated_at: chrono::Utc::now().to_rfc3339(),
            },
            turn: None,
            request_id: "ask-respond-init".to_string(),
            action_type: AgentSessionActionType::AskUser,
            confirmed: false,
            response: None,
            user_data: None,
            metadata: None,
            event_name: None,
            action_scope: None,
        },
        &mut sink,
    )
    .await
    .expect("respond_action should initialize agent and emit resolved fact");

    assert!(backend.agent_state.is_initialized().await);
}
