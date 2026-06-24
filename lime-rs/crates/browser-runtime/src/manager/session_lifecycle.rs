use crate::manager::session::{CdpSessionHandle, RESUME_TO_LIVE_DELAY_MS};
use crate::types::{BrowserControlMode, BrowserEventPayload, BrowserSessionLifecycleState};
use std::time::Duration;

impl CdpSessionHandle {
    pub async fn shutdown(&self, reason: &str) {
        let _ = self.stop_stream().await;
        self.set_session_state(
            BrowserSessionLifecycleState::Closed,
            BrowserControlMode::Agent,
            None,
        )
        .await;
        {
            let mut state = self.inner.state.write().await;
            state.connected = false;
        }
        if let Some(task) = self.inner.reader_task.lock().await.take() {
            task.abort();
        }
        self.emit(BrowserEventPayload::SessionClosed {
            reason: reason.to_string(),
        })
        .await;
    }

    pub async fn take_over(&self, human_reason: Option<String>) {
        self.set_session_state(
            BrowserSessionLifecycleState::HumanControlling,
            BrowserControlMode::Human,
            human_reason,
        )
        .await;
    }

    pub async fn release(&self, human_reason: Option<String>) {
        self.set_session_state(
            BrowserSessionLifecycleState::WaitingForHuman,
            BrowserControlMode::Shared,
            human_reason,
        )
        .await;
    }

    pub async fn resume(&self, human_reason: Option<String>) {
        self.set_session_state(
            BrowserSessionLifecycleState::AgentResuming,
            BrowserControlMode::Agent,
            human_reason,
        )
        .await;
        let session = self.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(RESUME_TO_LIVE_DELAY_MS)).await;
            session.promote_to_live_if_needed().await;
        });
    }

    pub(super) async fn set_session_state(
        &self,
        lifecycle_state: BrowserSessionLifecycleState,
        control_mode: BrowserControlMode,
        human_reason: Option<String>,
    ) {
        let normalized_reason = human_reason
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let should_emit = {
            let mut state = self.inner.state.write().await;
            let changed = state.lifecycle_state != lifecycle_state
                || state.control_mode != control_mode
                || state.human_reason != normalized_reason;
            state.lifecycle_state = lifecycle_state;
            state.control_mode = control_mode;
            state.human_reason = normalized_reason.clone();
            changed
        };

        if should_emit {
            self.emit(BrowserEventPayload::SessionStateChanged {
                lifecycle_state,
                control_mode,
                human_reason: normalized_reason,
            })
            .await;
        }
    }

    pub(super) async fn promote_to_live_if_needed(&self) {
        let should_promote = {
            let state = self.inner.state.read().await;
            state.connected
                && matches!(
                    state.lifecycle_state,
                    BrowserSessionLifecycleState::Launching
                        | BrowserSessionLifecycleState::AgentResuming
                )
        };

        if should_promote {
            self.set_session_state(
                BrowserSessionLifecycleState::Live,
                BrowserControlMode::Agent,
                None,
            )
            .await;
        }
    }
}
