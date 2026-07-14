//! Durable mailbox and queued-steer wait semantics.

use super::*;

impl RuntimeCore {
    pub(super) async fn execute_agent_control_wait(
        &self,
        caller: &ResolvedAgentControlCaller,
        timeout_ms: u64,
        cancel_token: Option<tokio_util::sync::CancellationToken>,
    ) -> Result<serde_json::Value, RuntimeCoreError> {
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
        let mut next_recovery = tokio::time::Instant::now();
        let mut recovery_interval = std::time::Duration::from_millis(25);
        loop {
            if self.has_queued_agent_control_steer(&caller.session.session_id, &caller.turn_id)? {
                return Ok(json!({
                    "message": "Wait interrupted by new input.",
                    "timed_out": false,
                }));
            }
            let now = tokio::time::Instant::now();
            if now >= next_recovery {
                self.recover_direct_child_terminal_activity(&caller.session)
                    .await?;
                next_recovery = now + recovery_interval;
                recovery_interval = recovery_interval
                    .saturating_mul(2)
                    .min(std::time::Duration::from_secs(2));
            }
            if self.has_queued_agent_control_steer(&caller.session.session_id, &caller.turn_id)? {
                return Ok(json!({
                    "message": "Wait interrupted by new input.",
                    "timed_out": false,
                }));
            }
            if self
                .has_pending_agent_mailbox_activity(&caller.session.session_id)
                .await?
            {
                let activity = self.consume_agent_control_wait_activity(caller).await?;
                if !activity.is_empty() {
                    return Ok(json!({
                        "message": "Wait completed.",
                        "timed_out": false,
                        "activity": activity,
                    }));
                }
            }
            if tokio::time::Instant::now() >= deadline {
                self.recover_direct_child_terminal_activity(&caller.session)
                    .await?;
                if self
                    .has_queued_agent_control_steer(&caller.session.session_id, &caller.turn_id)?
                {
                    return Ok(json!({
                        "message": "Wait interrupted by new input.",
                        "timed_out": false,
                    }));
                }
                if self
                    .has_pending_agent_mailbox_activity(&caller.session.session_id)
                    .await?
                {
                    let activity = self.consume_agent_control_wait_activity(caller).await?;
                    if !activity.is_empty() {
                        return Ok(json!({
                            "message": "Wait completed.",
                            "timed_out": false,
                            "activity": activity,
                        }));
                    }
                }
                return Ok(json!({ "message": "Wait timed out.", "timed_out": true }));
            }
            let sleep = tokio::time::sleep(std::time::Duration::from_millis(25));
            tokio::pin!(sleep);
            if let Some(cancel_token) = cancel_token.as_ref() {
                tokio::select! {
                    _ = &mut sleep => {},
                    _ = cancel_token.cancelled() => {
                        return Ok(json!({ "message": "Wait interrupted.", "timed_out": false }));
                    }
                }
            } else {
                sleep.await;
            }
        }
    }

    async fn consume_agent_control_wait_activity(
        &self,
        caller: &ResolvedAgentControlCaller,
    ) -> Result<Vec<serde_json::Value>, RuntimeCoreError> {
        let messages = self
            .consume_pending_agent_mailbox_for_wait(&caller.session.session_id, &caller.turn_id)
            .await?;
        if messages.is_empty() {
            return Ok(Vec::new());
        }
        let identities = self
            .agent_control_store()?
            .list_agent_identities(caller.identity.root_thread_id.clone())
            .await
            .map_err(agent_control_store_error)?;
        Ok(messages
            .into_iter()
            .map(|message| {
                let sender = identities
                    .iter()
                    .find(|identity| identity.thread_id == message.sender_thread_id)
                    .map(|identity| identity.agent_path.clone())
                    .unwrap_or_else(|| message.sender_thread_id.to_string());
                let kind = match message.kind {
                    AgentMailboxMessageKind::Message => "message",
                    AgentMailboxMessageKind::Result => "result",
                };
                let result_status = message.result_status.map(|status| match status {
                    thread_store::AgentMailboxResultStatus::Completed => "completed",
                    thread_store::AgentMailboxResultStatus::Failed => "failed",
                });
                json!({
                    "message_id": message.message_id,
                    "sender": sender,
                    "content": message.content,
                    "kind": kind,
                    "source_turn_id": message.source_turn_id.map(|turn_id| turn_id.to_string()),
                    "result_status": result_status,
                })
            })
            .collect())
    }

    fn has_queued_agent_control_steer(
        &self,
        session_id: &str,
        current_turn_id: &str,
    ) -> Result<bool, RuntimeCoreError> {
        let state = self
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        let stored = state
            .sessions
            .get(session_id)
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(session_id.to_string()))?;
        Ok(stored
            .turns
            .iter()
            .any(|turn| turn.turn_id != current_turn_id && turn.status == AgentTurnStatus::Queued))
    }
}
