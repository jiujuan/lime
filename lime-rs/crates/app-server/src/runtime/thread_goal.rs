use super::canonical_thread_store::{ActiveTurnGoalBinding, ThreadGoalStoreError};
use super::status::agent_turn_blocks_queue_resume;
use super::thread_usage::thread_token_usage_snapshot_from_events;
use super::{ProjectionStore, RuntimeCore, RuntimeCoreError};
use agent_protocol::ModeKind;
use app_server_protocol::protocol::v2::{ThreadGoal, ThreadGoalSetParams};
use app_server_protocol::RuntimeOptions;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum GoalAccountingMode {
    ActiveOnly,
}

pub(crate) fn turn_uses_plan_mode(runtime_options: Option<&RuntimeOptions>) -> bool {
    runtime_options
        .and_then(RuntimeOptions::runtime_request)
        .and_then(|request| request.collaboration_mode.as_ref())
        .is_some_and(|mode| mode.mode == ModeKind::Plan)
}

impl RuntimeCore {
    pub(crate) fn get_thread_goal(
        &self,
        thread_id: &str,
    ) -> Result<Option<ThreadGoal>, RuntimeCoreError> {
        self.thread_goal_store()?
            .get_thread_goal_sync(thread_id)
            .map_err(map_goal_error)
    }

    pub(crate) fn set_thread_goal(
        &self,
        params: ThreadGoalSetParams,
    ) -> Result<ThreadGoal, RuntimeCoreError> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let active_turn = state
            .sessions
            .values()
            .find(|stored| stored.session.thread_id == params.thread_id)
            .and_then(active_turn_goal_binding);
        let store = self.thread_goal_store()?;
        let result = match active_turn.as_ref() {
            Some(active_turn) => {
                store.set_thread_goal_with_active_turn_sync(params, Some(active_turn))
            }
            None => store.set_thread_goal_sync(params),
        }
        .map_err(map_goal_error);
        drop(state);
        result
    }

    pub(crate) fn clear_thread_goal(&self, thread_id: &str) -> Result<bool, RuntimeCoreError> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let active_turn = state
            .sessions
            .values()
            .find(|stored| stored.session.thread_id == thread_id)
            .and_then(active_turn_goal_binding);
        let store = self.thread_goal_store()?;
        let result = store
            .clear_thread_goal_with_active_turn_sync(thread_id, active_turn.as_ref())
            .map_err(map_goal_error);
        drop(state);
        result
    }

    fn thread_goal_store(&self) -> Result<&ProjectionStore, RuntimeCoreError> {
        self.projection_store.as_deref().ok_or_else(|| {
            RuntimeCoreError::Backend("thread goal store is unavailable".to_string())
        })
    }
}

fn active_turn_goal_binding(stored: &super::StoredSession) -> Option<ActiveTurnGoalBinding> {
    let turn = stored
        .turns
        .iter()
        .find(|turn| agent_turn_blocks_queue_resume(turn.status))?;
    let token_usage = thread_token_usage_snapshot_from_events(&stored.events)
        .map(|snapshot| snapshot.total_token_usage)
        .unwrap_or_default();
    Some(ActiveTurnGoalBinding {
        turn_id: turn.turn_id.clone(),
        plan_mode: turn_uses_plan_mode(stored.turn_runtime_options.get(&turn.turn_id)),
        source_sequence: stored
            .events
            .last()
            .map(|event| event.sequence)
            .unwrap_or(0),
        token_usage,
        observed_at_ms: chrono::Utc::now().timestamp_millis(),
    })
}

fn map_goal_error(error: ThreadGoalStoreError) -> RuntimeCoreError {
    match error {
        ThreadGoalStoreError::InvalidRequest(message) => RuntimeCoreError::InvalidRequest(message),
        ThreadGoalStoreError::Store(message) => RuntimeCoreError::Backend(message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::{
        ActionRespondRequest, CancelExecutionRequest, ExecutionBackend, ExecutionRequest,
        RuntimeEvent, RuntimeEventSink, RuntimeHostContext,
    };
    use app_server_protocol::{
        AgentInput, AgentSession, AgentSessionStartParams, AgentSessionStatus,
        AgentSessionTurnCancelParams, AgentSessionTurnStartParams, AgentTurn, AgentTurnStatus,
    };
    use async_trait::async_trait;
    use serde_json::json;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::Semaphore;

    struct PausedUsageBackend {
        release: Arc<Semaphore>,
    }

    #[async_trait]
    impl ExecutionBackend for PausedUsageBackend {
        async fn start_turn(
            &self,
            _request: ExecutionRequest,
            sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
            sink.emit(provider_usage(1, 20, 5, 10))?;
            self.release
                .acquire()
                .await
                .map_err(|_| RuntimeCoreError::Backend("late goal release closed".to_string()))?
                .forget();
            sink.emit(provider_usage(2, 10, 0, 5))?;
            sink.emit(RuntimeEvent::new("turn.completed", json!({})))
        }

        async fn cancel_turn(
            &self,
            _request: CancelExecutionRequest,
            _sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            Ok(())
        }

        async fn respond_action(
            &self,
            _request: ActionRespondRequest,
            _sink: &mut dyn RuntimeEventSink,
        ) -> Result<(), RuntimeCoreError> {
            Ok(())
        }
    }

    fn provider_usage(
        attempt: u32,
        input_tokens: i64,
        cached_input_tokens: i64,
        output_tokens: i64,
    ) -> RuntimeEvent {
        RuntimeEvent::new(
            "provider.usage",
            json!({
                "backend": "runtime",
                "attempt": attempt,
                "model_context_window": 128_000,
                "usage": {
                    "input_tokens": input_tokens,
                    "cached_input_tokens": cached_input_tokens,
                    "output_tokens": output_tokens,
                    "reasoning_output_tokens": 0,
                    "total_tokens": input_tokens + output_tokens
                }
            }),
        )
    }

    #[test]
    fn active_goal_binding_skips_queued_turn() {
        let session_id = "session-goal-binding".to_string();
        let thread_id = "thread-goal-binding".to_string();
        let turn = |turn_id: &str, status| AgentTurn {
            turn_id: turn_id.to_string(),
            session_id: session_id.clone(),
            thread_id: thread_id.clone(),
            status,
            started_at: None,
            completed_at: None,
        };
        let stored = crate::runtime::StoredSession {
            session: AgentSession {
                session_id: session_id.clone(),
                thread_id: thread_id.clone(),
                app_id: "desktop".to_string(),
                workspace_id: None,
                business_object_ref: None,
                status: AgentSessionStatus::Running,
                created_at: "2026-07-20T00:00:00Z".to_string(),
                updated_at: "2026-07-20T00:00:00Z".to_string(),
            },
            turns: vec![
                turn("turn-queued", AgentTurnStatus::Queued),
                turn("turn-running", AgentTurnStatus::Running),
            ],
            turn_inputs: HashMap::new(),
            turn_runtime_options: HashMap::new(),
            events: Vec::new(),
            output_blobs: HashMap::new(),
        };

        let binding = active_turn_goal_binding(&stored).expect("running turn goal binding");
        assert_eq!(binding.turn_id, "turn-running");
    }

    #[tokio::test]
    async fn runtime_host_cancel_drains_usage_before_canceled_terminal() {
        let temp = tempfile::tempdir().expect("runtime cancel tempdir");
        let projection_path = temp.path().join("state.sqlite");
        let projection_store = Arc::new(
            ProjectionStore::initialize(&projection_path).expect("runtime cancel projection store"),
        );
        let release = Arc::new(Semaphore::new(0));
        let core = RuntimeCore::with_backend(Arc::new(PausedUsageBackend { release }))
            .with_projection_store(projection_store);
        let mut events = core
            .event_hub
            .take_receiver()
            .expect("runtime cancel event receiver");
        let session = core
            .start_session(AgentSessionStartParams {
                session_id: Some("session-runtime-usage-cancel".to_string()),
                thread_id: Some("thread-runtime-usage-cancel".to_string()),
                app_id: "desktop".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("runtime cancel session")
            .session;
        core.set_thread_goal(ThreadGoalSetParams {
            thread_id: session.thread_id.clone(),
            objective: Some("account usage reported before host cancel".to_string()),
            status: None,
            token_budget: None,
        })
        .expect("create runtime cancel goal");
        let turn = core
            .start_turn_admitted(
                AgentSessionTurnStartParams {
                    session_id: session.session_id.clone(),
                    turn_id: Some("turn-runtime-usage-cancel".to_string()),
                    input: AgentInput {
                        text: "cancel after provider usage".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("admit runtime cancel turn")
            .response
            .turn;

        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                let event = events.recv().await.expect("runtime usage event");
                if event.event_type == "provider.usage" {
                    break;
                }
            }
        })
        .await
        .expect("provider usage before host cancel");

        let canceled = core
            .cancel_turn(
                AgentSessionTurnCancelParams {
                    session_id: session.session_id.clone(),
                    turn_id: turn.turn_id.clone(),
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("cancel active runtime turn");
        assert!(
            canceled.events.is_empty(),
            "active driver publishes its terminal through the event hub"
        );
        let immediate_read = core
            .read_session(app_server_protocol::AgentSessionReadParams {
                session_id: session.session_id.clone(),
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .expect("read runtime turn immediately after cancel response");
        assert_eq!(immediate_read.turns[0].status, AgentTurnStatus::Canceled);

        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                let event = events.recv().await.expect("runtime canceled event");
                if event.event_type == "turn.canceled" {
                    break;
                }
            }
        })
        .await
        .expect("driver-owned canceled terminal");

        let durable_events = core
            .events_for_session(&session.session_id)
            .expect("runtime cancel durable events");
        let usage_sequence = durable_events
            .iter()
            .find(|event| event.event_type == "provider.usage")
            .expect("durable provider usage")
            .sequence;
        let canceled_sequence = durable_events
            .iter()
            .find(|event| event.event_type == "turn.canceled")
            .expect("durable canceled terminal")
            .sequence;
        assert!(usage_sequence < canceled_sequence);

        let goal = core
            .get_thread_goal(&session.thread_id)
            .expect("read runtime cancel goal")
            .expect("runtime cancel goal");
        assert_eq!(goal.tokens_used, 25);
        let replayed = core
            .append_external_runtime_events(
                &session.session_id,
                Some(&turn.turn_id),
                vec![RuntimeEvent::new("turn.canceled", json!({"replay": true}))],
            )
            .expect("replay runtime canceled terminal");
        assert!(replayed.is_empty());
        assert_eq!(
            core.get_thread_goal(&session.thread_id)
                .expect("read replayed runtime cancel goal")
                .expect("replayed runtime cancel goal")
                .tokens_used,
            25
        );
        let outbox_count = rusqlite::Connection::open(projection_path)
            .expect("open runtime cancel projection store")
            .query_row(
                "SELECT COUNT(*) FROM thread_goal_update_outbox",
                [],
                |row| row.get::<_, i64>(0),
            )
            .expect("count runtime cancel goal outbox");
        assert_eq!(outbox_count, 1);
    }

    #[tokio::test]
    async fn runtime_goal_created_during_active_turn_only_accounts_later_usage() {
        let temp = tempfile::tempdir().expect("runtime late goal tempdir");
        let projection_store = Arc::new(
            ProjectionStore::initialize(temp.path().join("state.sqlite"))
                .expect("runtime late goal projection store"),
        );
        let release = Arc::new(Semaphore::new(0));
        let core = RuntimeCore::with_backend(Arc::new(PausedUsageBackend {
            release: Arc::clone(&release),
        }))
        .with_projection_store(projection_store);
        let mut events = core
            .event_hub
            .take_receiver()
            .expect("runtime late goal event receiver");
        core.start_session(AgentSessionStartParams {
            session_id: Some("session-runtime-late-goal".to_string()),
            thread_id: Some("thread-runtime-late-goal".to_string()),
            app_id: "desktop".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("runtime late goal session");
        core.start_turn_admitted(
            AgentSessionTurnStartParams {
                session_id: "session-runtime-late-goal".to_string(),
                turn_id: Some("turn-runtime-late-goal".to_string()),
                input: AgentInput {
                    text: "start before creating a goal".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("admit runtime late goal turn");
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                let event = events.recv().await.expect("runtime late goal event");
                if event.event_type == "provider.usage" {
                    break;
                }
            }
        })
        .await
        .expect("first runtime usage projection");

        let goal = core
            .set_thread_goal(ThreadGoalSetParams {
                thread_id: "thread-runtime-late-goal".to_string(),
                objective: Some("only account work after this mutation".to_string()),
                status: None,
                token_budget: None,
            })
            .expect("set runtime late goal");
        assert_eq!(goal.tokens_used, 0);
        release.add_permits(1);

        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                let event = events.recv().await.expect("runtime late goal event");
                if event.event_type == "turn.completed" {
                    break;
                }
            }
        })
        .await
        .expect("runtime late goal turn completion");
        let goal = core
            .get_thread_goal("thread-runtime-late-goal")
            .expect("read runtime late goal")
            .expect("runtime late goal");
        assert_eq!(goal.tokens_used, 15);
        assert_eq!(
            goal.status,
            app_server_protocol::protocol::v2::ThreadGoalStatus::Active
        );
    }

    #[tokio::test]
    async fn runtime_active_goal_patch_flushes_observed_usage_before_returning() {
        let temp = tempfile::tempdir().expect("runtime goal patch tempdir");
        let projection_store = Arc::new(
            ProjectionStore::initialize(temp.path().join("state.sqlite"))
                .expect("runtime goal patch projection store"),
        );
        let release = Arc::new(Semaphore::new(0));
        let core = RuntimeCore::with_backend(Arc::new(PausedUsageBackend {
            release: Arc::clone(&release),
        }))
        .with_projection_store(projection_store);
        let mut events = core
            .event_hub
            .take_receiver()
            .expect("runtime goal patch event receiver");
        core.start_session(AgentSessionStartParams {
            session_id: Some("session-runtime-goal-patch".to_string()),
            thread_id: Some("thread-runtime-goal-patch".to_string()),
            app_id: "desktop".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("runtime goal patch session");
        core.set_thread_goal(ThreadGoalSetParams {
            thread_id: "thread-runtime-goal-patch".to_string(),
            objective: Some("initial runtime goal".to_string()),
            status: None,
            token_budget: None,
        })
        .expect("create runtime goal before turn");
        core.start_turn_admitted(
            AgentSessionTurnStartParams {
                session_id: "session-runtime-goal-patch".to_string(),
                turn_id: Some("turn-runtime-goal-patch".to_string()),
                input: AgentInput {
                    text: "start goal work".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("admit runtime goal patch turn");
        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                let event = events.recv().await.expect("runtime goal patch event");
                if event.event_type == "provider.usage" {
                    break;
                }
            }
        })
        .await
        .expect("first runtime goal usage projection");

        let patched = core
            .set_thread_goal(ThreadGoalSetParams {
                thread_id: "thread-runtime-goal-patch".to_string(),
                objective: Some("patched runtime goal".to_string()),
                status: None,
                token_budget: None,
            })
            .expect("patch active runtime goal");
        assert_eq!(patched.tokens_used, 25);
        assert_eq!(patched.objective, "patched runtime goal");
        release.add_permits(1);

        tokio::time::timeout(std::time::Duration::from_secs(5), async {
            loop {
                let event = events.recv().await.expect("runtime goal patch event");
                if event.event_type == "turn.completed" {
                    break;
                }
            }
        })
        .await
        .expect("runtime goal patch turn completion");
        let goal = core
            .get_thread_goal("thread-runtime-goal-patch")
            .expect("read patched runtime goal")
            .expect("patched runtime goal");
        assert_eq!(goal.tokens_used, 40);
        assert_eq!(goal.objective, "patched runtime goal");
    }
}
