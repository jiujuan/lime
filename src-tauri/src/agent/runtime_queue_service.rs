//! Agent runtime queue 共享服务边界。
//!
//! 命令层只保留 Tauri 状态装配；
//! queue 的纯调度与数据事实源统一委托给 `lime-agent`。

use super::aster_state::AsterAgentState;
use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::config::GlobalConfigManagerState;
use crate::database::DbConnection;
use crate::mcp::McpManagerState;
use crate::services::automation_service::AutomationServiceState;
use crate::LogState;
use aster::session::QueuedTurnRuntime;
use async_trait::async_trait;
use lime_agent::{
    clear_runtime_queue as clear_runtime_queue_impl,
    finish_active_runtime_turn_if_matches as finish_active_runtime_turn_if_matches_impl,
    list_runtime_queue_snapshots as list_runtime_queue_snapshots_impl,
    promote_runtime_queued_turn as promote_runtime_queued_turn_impl,
    remove_runtime_queued_turn as remove_runtime_queued_turn_impl,
    resume_persisted_runtime_queues_on_startup as resume_persisted_runtime_queues_on_startup_impl,
    resume_runtime_queue_if_needed as resume_runtime_queue_if_needed_impl,
    submit_runtime_turn as submit_runtime_turn_impl, AgentEvent as RuntimeAgentEvent,
    QueuedTurnSnapshot, QueuedTurnTask, RuntimeQueueEventEmitter,
    RuntimeQueueExecutor as SharedRuntimeQueueExecutor,
};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub(crate) type RuntimeQueueExecutor = SharedRuntimeQueueExecutor<AgentRuntimeQueueContext>;

pub(crate) trait RuntimeQueueEventPort: Send + Sync {
    fn emit_runtime_queue_event(&self, event_name: &str, event: &RuntimeAgentEvent);
}

#[async_trait]
pub(crate) trait RuntimeQueueExecutionPort: Send + Sync {
    async fn execute_runtime_queue_payload(
        &self,
        context: &AgentRuntimeQueueContext,
        payload: Value,
    ) -> Result<(), String>;
}

#[async_trait]
pub(crate) trait RuntimeQueueProjectionPort: Send + Sync {
    async fn emit_subagent_status_changed(
        &self,
        context: &AgentRuntimeQueueContext,
        session_id: &str,
    );
}

#[async_trait]
pub(crate) trait ManagedObjectiveContinuationPort: Send + Sync {
    async fn maybe_submit_auto_continuation(
        &self,
        context: &AgentRuntimeQueueContext,
        session_id: &str,
    ) -> Result<Option<String>, String>;
}

#[derive(Clone)]
pub(crate) struct RuntimeQueueHostPorts {
    pub(crate) event_port: Arc<dyn RuntimeQueueEventPort>,
    pub(crate) execution_port: Arc<dyn RuntimeQueueExecutionPort>,
    pub(crate) projection_port: Arc<dyn RuntimeQueueProjectionPort>,
    pub(crate) objective_continuation_port: Arc<dyn ManagedObjectiveContinuationPort>,
}

impl RuntimeQueueHostPorts {
    pub(crate) fn new(
        event_port: Arc<dyn RuntimeQueueEventPort>,
        execution_port: Arc<dyn RuntimeQueueExecutionPort>,
        projection_port: Arc<dyn RuntimeQueueProjectionPort>,
        objective_continuation_port: Arc<dyn ManagedObjectiveContinuationPort>,
    ) -> Self {
        Self {
            event_port,
            execution_port,
            projection_port,
            objective_continuation_port,
        }
    }

    pub(crate) fn with_event_port(&self, event_port: Arc<dyn RuntimeQueueEventPort>) -> Self {
        Self {
            event_port,
            execution_port: self.execution_port.clone(),
            projection_port: self.projection_port.clone(),
            objective_continuation_port: self.objective_continuation_port.clone(),
        }
    }
}

#[derive(Clone)]
pub(crate) struct TauriRuntimeQueueEventPort {
    app: AppHandle,
}

impl TauriRuntimeQueueEventPort {
    pub(crate) fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl RuntimeQueueEventPort for TauriRuntimeQueueEventPort {
    fn emit_runtime_queue_event(&self, event_name: &str, event: &RuntimeAgentEvent) {
        if let Err(error) = self.app.emit(event_name, event) {
            tracing::warn!(
                "[AsterAgent][Queue] 发送队列事件失败: event_name={}, error={}",
                event_name,
                error
            );
        }
    }
}

pub(crate) struct AgentRuntimeQueueContext {
    pub(crate) app: AppHandle,
    pub(crate) ports: RuntimeQueueHostPorts,
    pub(crate) state: AsterAgentState,
    pub(crate) db: DbConnection,
    pub(crate) api_key_provider_service: ApiKeyProviderServiceState,
    pub(crate) logs: LogState,
    pub(crate) config_manager: GlobalConfigManagerState,
    pub(crate) mcp_manager: McpManagerState,
    pub(crate) automation_state: AutomationServiceState,
}

impl Clone for AgentRuntimeQueueContext {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
            ports: self.ports.clone(),
            state: self.state.clone(),
            db: self.db.clone(),
            api_key_provider_service: ApiKeyProviderServiceState(
                self.api_key_provider_service.0.clone(),
            ),
            logs: self.logs.clone(),
            config_manager: GlobalConfigManagerState(self.config_manager.0.clone()),
            mcp_manager: self.mcp_manager.clone(),
            automation_state: self.automation_state.clone(),
        }
    }
}

fn build_runtime_queue_context(
    app: AppHandle,
    ports: RuntimeQueueHostPorts,
    state: &AsterAgentState,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    logs: &LogState,
    config_manager: &GlobalConfigManagerState,
    mcp_manager: &McpManagerState,
    automation_state: &AutomationServiceState,
) -> AgentRuntimeQueueContext {
    AgentRuntimeQueueContext {
        app,
        ports,
        state: state.clone(),
        db: db.clone(),
        api_key_provider_service: ApiKeyProviderServiceState(api_key_provider_service.0.clone()),
        logs: logs.clone(),
        config_manager: GlobalConfigManagerState(config_manager.0.clone()),
        mcp_manager: mcp_manager.clone(),
        automation_state: automation_state.clone(),
    }
}

fn build_runtime_queue_event_emitter(
    event_port: Arc<dyn RuntimeQueueEventPort>,
) -> RuntimeQueueEventEmitter {
    std::sync::Arc::new(move |event_name: String, event: RuntimeAgentEvent| {
        event_port.emit_runtime_queue_event(&event_name, &event);
    })
}

pub(crate) async fn resume_runtime_queue_if_needed_with_event_port(
    app: AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    logs: &LogState,
    config_manager: &GlobalConfigManagerState,
    mcp_manager: &McpManagerState,
    automation_state: &AutomationServiceState,
    session_id: String,
    executor: RuntimeQueueExecutor,
    ports: RuntimeQueueHostPorts,
) -> Result<bool, String> {
    let context = build_runtime_queue_context(
        app,
        ports.clone(),
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    resume_runtime_queue_if_needed_impl(
        session_id,
        context.clone(),
        executor,
        build_runtime_queue_event_emitter(ports.event_port),
    )
    .await
}

pub(crate) async fn submit_runtime_turn_with_event_port(
    app: AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    logs: &LogState,
    config_manager: &GlobalConfigManagerState,
    mcp_manager: &McpManagerState,
    automation_state: &AutomationServiceState,
    queued_task: QueuedTurnTask<Value>,
    queue_if_busy: bool,
    skip_pre_submit_resume: bool,
    executor: RuntimeQueueExecutor,
    ports: RuntimeQueueHostPorts,
) -> Result<(), String> {
    let context = build_runtime_queue_context(
        app,
        ports.clone(),
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );
    submit_runtime_turn_impl(
        queued_task,
        queue_if_busy,
        skip_pre_submit_resume,
        context.clone(),
        executor,
        build_runtime_queue_event_emitter(ports.event_port),
    )
    .await
}

pub(crate) async fn clear_runtime_queue(
    app: &AppHandle,
    session_id: &str,
) -> Result<Vec<QueuedTurnRuntime>, String> {
    clear_runtime_queue_with_event_port(
        session_id,
        Arc::new(TauriRuntimeQueueEventPort::new(app.clone())),
    )
    .await
}

pub(crate) async fn clear_runtime_queue_with_event_port(
    session_id: &str,
    event_port: Arc<dyn RuntimeQueueEventPort>,
) -> Result<Vec<QueuedTurnRuntime>, String> {
    clear_runtime_queue_impl(session_id, build_runtime_queue_event_emitter(event_port)).await
}

pub(crate) async fn list_runtime_queue_snapshots(
    session_id: &str,
) -> Result<Vec<QueuedTurnSnapshot>, String> {
    list_runtime_queue_snapshots_impl(session_id).await
}

pub(crate) async fn remove_runtime_queued_turn(
    app: &AppHandle,
    session_id: &str,
    queued_turn_id: &str,
) -> Result<bool, String> {
    remove_runtime_queued_turn_with_event_port(
        session_id,
        queued_turn_id,
        Arc::new(TauriRuntimeQueueEventPort::new(app.clone())),
    )
    .await
}

pub(crate) async fn remove_runtime_queued_turn_with_event_port(
    session_id: &str,
    queued_turn_id: &str,
    event_port: Arc<dyn RuntimeQueueEventPort>,
) -> Result<bool, String> {
    remove_runtime_queued_turn_impl(
        session_id,
        queued_turn_id,
        build_runtime_queue_event_emitter(event_port),
    )
    .await
}

pub(crate) async fn promote_runtime_queued_turn(
    session_id: &str,
    queued_turn_id: &str,
) -> Result<bool, String> {
    promote_runtime_queued_turn_impl(session_id, queued_turn_id).await
}

pub(crate) fn finish_active_runtime_turn_if_matches(
    session_id: &str,
    turn_id: &str,
) -> Result<bool, String> {
    finish_active_runtime_turn_if_matches_impl(session_id, turn_id)
}

pub(crate) async fn resume_persisted_runtime_queues_on_startup_with_event_port(
    app: AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    logs: &LogState,
    config_manager: &GlobalConfigManagerState,
    mcp_manager: &McpManagerState,
    automation_state: &AutomationServiceState,
    executor: RuntimeQueueExecutor,
    ports: RuntimeQueueHostPorts,
) -> Result<usize, String> {
    let context = build_runtime_queue_context(
        app,
        ports.clone(),
        state,
        db,
        api_key_provider_service,
        logs,
        config_manager,
        mcp_manager,
        automation_state,
    );

    resume_persisted_runtime_queues_on_startup_impl(
        context,
        executor,
        build_runtime_queue_event_emitter(ports.event_port),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct RecordingRuntimeQueueEventPort {
        events: Mutex<Vec<(String, RuntimeAgentEvent)>>,
    }

    impl RuntimeQueueEventPort for RecordingRuntimeQueueEventPort {
        fn emit_runtime_queue_event(&self, event_name: &str, event: &RuntimeAgentEvent) {
            self.events
                .lock()
                .expect("events lock")
                .push((event_name.to_string(), event.clone()));
        }
    }

    struct NoopRuntimeQueueEventPort;

    impl RuntimeQueueEventPort for NoopRuntimeQueueEventPort {
        fn emit_runtime_queue_event(&self, _event_name: &str, _event: &RuntimeAgentEvent) {}
    }

    struct NoopRuntimeQueueExecutionPort;

    #[async_trait]
    impl RuntimeQueueExecutionPort for NoopRuntimeQueueExecutionPort {
        async fn execute_runtime_queue_payload(
            &self,
            _context: &AgentRuntimeQueueContext,
            _payload: Value,
        ) -> Result<(), String> {
            Ok(())
        }
    }

    struct NoopRuntimeQueueProjectionPort;

    #[async_trait]
    impl RuntimeQueueProjectionPort for NoopRuntimeQueueProjectionPort {
        async fn emit_subagent_status_changed(
            &self,
            _context: &AgentRuntimeQueueContext,
            _session_id: &str,
        ) {
        }
    }

    struct NoopManagedObjectiveContinuationPort;

    #[async_trait]
    impl ManagedObjectiveContinuationPort for NoopManagedObjectiveContinuationPort {
        async fn maybe_submit_auto_continuation(
            &self,
            _context: &AgentRuntimeQueueContext,
            _session_id: &str,
        ) -> Result<Option<String>, String> {
            Ok(None)
        }
    }

    #[test]
    fn runtime_queue_event_emitter_delegates_to_port() {
        let port = Arc::new(RecordingRuntimeQueueEventPort::default());
        let emitter = build_runtime_queue_event_emitter(port.clone());

        emitter(
            "agentSession/event/sess_1".to_string(),
            RuntimeAgentEvent::QueueCleared {
                session_id: "sess_1".to_string(),
                queued_turn_ids: vec!["queued_1".to_string()],
            },
        );

        let events = port.events.lock().expect("events lock");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].0, "agentSession/event/sess_1");
        match &events[0].1 {
            RuntimeAgentEvent::QueueCleared {
                session_id,
                queued_turn_ids,
            } => {
                assert_eq!(session_id, "sess_1");
                assert_eq!(queued_turn_ids, &vec!["queued_1".to_string()]);
            }
            other => panic!("unexpected event: {other:?}"),
        }
    }

    #[test]
    fn runtime_queue_host_ports_can_replace_event_port_without_rebuilding_host_ports() {
        let original_event_port: Arc<dyn RuntimeQueueEventPort> =
            Arc::new(NoopRuntimeQueueEventPort);
        let next_event_port: Arc<dyn RuntimeQueueEventPort> = Arc::new(NoopRuntimeQueueEventPort);
        let execution_port: Arc<dyn RuntimeQueueExecutionPort> =
            Arc::new(NoopRuntimeQueueExecutionPort);
        let projection_port: Arc<dyn RuntimeQueueProjectionPort> =
            Arc::new(NoopRuntimeQueueProjectionPort);
        let objective_continuation_port: Arc<dyn ManagedObjectiveContinuationPort> =
            Arc::new(NoopManagedObjectiveContinuationPort);

        let ports = RuntimeQueueHostPorts::new(
            original_event_port.clone(),
            execution_port.clone(),
            projection_port.clone(),
            objective_continuation_port.clone(),
        );
        let replaced = ports.with_event_port(next_event_port.clone());

        assert!(Arc::ptr_eq(&replaced.event_port, &next_event_port));
        assert!(!Arc::ptr_eq(&replaced.event_port, &original_event_port));
        assert!(Arc::ptr_eq(&replaced.execution_port, &execution_port));
        assert!(Arc::ptr_eq(&replaced.projection_port, &projection_port));
        assert!(Arc::ptr_eq(
            &replaced.objective_continuation_port,
            &objective_continuation_port
        ));
    }
}
