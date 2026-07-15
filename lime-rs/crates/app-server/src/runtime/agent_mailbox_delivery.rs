//! Durable mailbox consumption for canonical RuntimeCore turns.
//!
//! The mailbox table is the sole pending-work owner. A message becomes delivered only after its
//! deterministic canonical Item can be read from the canonical ThreadStore.

use super::*;
use agent_protocol::{ItemId, ThreadId, ThreadTurnsView};
use app_server_protocol::{
    AgentInput, AgentSession, AgentSessionTurnStartParams, AgentTurn, RuntimeOptions,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use thread_store::{
    AgentGraphStore, AgentIdentity, AgentIdentityStore, AgentMailboxDeliveryMode,
    AgentMailboxMessage, AgentMailboxStore, ReadThreadParams, ThreadSpawnEdgeStatus, ThreadStore,
};

const MAILBOX_ITEM_PREFIX: &str = "mailbox-item-";
const MAILBOX_TURN_PREFIX: &str = "mailbox-turn-";

#[derive(Default)]
pub(in crate::runtime) struct MailboxTurnDelivery {
    pub(in crate::runtime) events: Vec<app_server_protocol::AgentEvent>,
    consumed_messages: Vec<AgentMailboxMessage>,
}

impl RuntimeCore {
    pub(crate) async fn schedule_pending_agent_mailbox_triggers(
        &self,
        session_id: String,
        host: RuntimeHostContext,
        runtime_options: Option<RuntimeOptions>,
    ) {
        let (admitted_tx, admitted_rx) = tokio::sync::oneshot::channel();
        let core = self.clone();
        tokio::spawn(async move {
            if let Err(error) = core
                .process_pending_agent_mailbox_triggers_with_options(
                    &session_id,
                    host,
                    runtime_options,
                    Some(admitted_tx),
                )
                .await
            {
                tracing::warn!(
                    session_id = %session_id,
                    error = %error,
                    "background agent mailbox TriggerTurn processing failed"
                );
            }
        });
        let _ = admitted_rx.await;
    }

    /// Starts durable TriggerTurn messages for one recipient session.
    ///
    /// QueueOnly records are deliberately left pending here. They are consumed only by the next
    /// real turn through `deliver_pending_agent_mailbox_for_turn`.
    #[cfg(test)]
    pub(crate) async fn process_pending_agent_mailbox_triggers(
        &self,
        session_id: &str,
        host: RuntimeHostContext,
    ) -> Result<usize, RuntimeCoreError> {
        self.process_pending_agent_mailbox_triggers_with_options(session_id, host, None, None)
            .await
    }

    async fn process_pending_agent_mailbox_triggers_with_options(
        &self,
        session_id: &str,
        host: RuntimeHostContext,
        runtime_options: Option<RuntimeOptions>,
        mut admitted_tx: Option<tokio::sync::oneshot::Sender<()>>,
    ) -> Result<usize, RuntimeCoreError> {
        self.ensure_current_session_hydrated(session_id).await?;
        let (session, _) = self.session_snapshot(session_id)?;
        let Some((store, identity)) = self.mailbox_context(&session).await? else {
            return Ok(0);
        };
        let mut started = 0;
        loop {
            let message = store
                .list_pending_agent_mailbox_messages(
                    identity.root_thread_id.clone(),
                    identity.thread_id.clone(),
                )
                .await
                .map_err(mailbox_store_error)?
                .into_iter()
                .find(|message| message.delivery_mode == AgentMailboxDeliveryMode::TriggerTurn);
            let Some(message) = message else {
                break;
            };
            let turn_id = mailbox_turn_id(&message.message_id);
            let item_id = mailbox_item_id(&message.message_id);
            if canonical_mailbox_item_exists(&store, &identity.thread_id, &item_id).await? {
                acknowledge_mailbox_message(&store, &message).await?;
                continue;
            }
            let mut observe_admission = |event: app_server_protocol::AgentEvent| {
                if event.event_type == "turn.accepted" {
                    if let Some(admitted_tx) = admitted_tx.take() {
                        let _ = admitted_tx.send(());
                    }
                }
                Ok(())
            };
            match self
                .start_turn_with_event_callback(
                    AgentSessionTurnStartParams {
                        session_id: session.session_id.clone(),
                        turn_id: Some(turn_id),
                        input: AgentInput {
                            text: message.content.clone(),
                            attachments: Vec::new(),
                        },
                        runtime_options: runtime_options.clone(),
                        queue_if_busy: false,
                        skip_pre_submit_resume: false,
                    },
                    host.clone(),
                    &mut observe_admission,
                )
                .await
            {
                Ok(_) => started += 1,
                // An active recipient must retain its durable pending mail for a later retry.
                Err(RuntimeCoreError::TurnAlreadyActive(_)) => break,
                Err(error) => return Err(error),
            }
        }
        Ok(started)
    }

    /// Exposes mailbox activity for the future wait-agent boundary without process-local state.
    pub(crate) async fn has_pending_agent_mailbox_activity(
        &self,
        session_id: &str,
    ) -> Result<bool, RuntimeCoreError> {
        self.ensure_current_session_hydrated(session_id).await?;
        let (session, _) = self.session_snapshot(session_id)?;
        let Some((store, identity)) = self.mailbox_context(&session).await? else {
            return Ok(false);
        };
        store
            .list_pending_agent_mailbox_messages(
                identity.root_thread_id.clone(),
                identity.thread_id.clone(),
            )
            .await
            .map(|messages| !messages.is_empty())
            .map_err(mailbox_store_error)
    }

    pub(in crate::runtime) async fn deliver_pending_agent_mailbox_for_turn(
        &self,
        session: &AgentSession,
        turn: &AgentTurn,
        current_input: &AgentInput,
    ) -> Result<MailboxTurnDelivery, RuntimeCoreError> {
        self.recover_direct_child_terminal_activity(session).await?;
        let Some((store, identity)) = self.mailbox_context(session).await? else {
            return Ok(MailboxTurnDelivery::default());
        };
        let messages = store
            .list_pending_agent_mailbox_messages(
                identity.root_thread_id.clone(),
                identity.thread_id.clone(),
            )
            .await
            .map_err(mailbox_store_error)?;
        let messages = messages
            .into_iter()
            .filter(|message| {
                message.delivery_mode == AgentMailboxDeliveryMode::QueueOnly
                    || mailbox_turn_id(&message.message_id) == turn.turn_id
            })
            .collect::<Vec<_>>();
        self.append_mailbox_items_before_ack(session, turn, Some(current_input), &store, messages)
            .await
    }

    pub(in crate::runtime) async fn consume_pending_agent_mailbox_for_wait(
        &self,
        session_id: &str,
        turn_id: &str,
    ) -> Result<Vec<AgentMailboxMessage>, RuntimeCoreError> {
        self.ensure_current_session_hydrated(session_id).await?;
        let (session, turns) = self.session_snapshot(session_id)?;
        let turn = turns
            .into_iter()
            .find(|turn| turn.turn_id == turn_id)
            .ok_or_else(|| RuntimeCoreError::TurnNotActive(turn_id.to_string()))?;
        let Some((store, identity)) = self.mailbox_context(&session).await? else {
            return Ok(Vec::new());
        };
        let messages = store
            .list_pending_agent_mailbox_messages(
                identity.root_thread_id.clone(),
                identity.thread_id,
            )
            .await
            .map_err(mailbox_store_error)?;
        if messages.is_empty() {
            return Ok(messages);
        }
        Ok(self
            .append_mailbox_items_before_ack(&session, &turn, None, &store, messages)
            .await?
            .consumed_messages)
    }

    async fn mailbox_context(
        &self,
        session: &AgentSession,
    ) -> Result<Option<(std::sync::Arc<ProjectionStore>, AgentIdentity)>, RuntimeCoreError> {
        let Some(store) = self.projection_store.clone() else {
            return Ok(None);
        };
        let identity = store
            .read_agent_identity(ThreadId::new(session.thread_id.clone()))
            .await
            .map_err(mailbox_store_error)?;
        Ok(identity.map(|identity| (store, identity)))
    }

    pub(in crate::runtime) async fn recover_direct_child_terminal_activity(
        &self,
        session: &AgentSession,
    ) -> Result<(), RuntimeCoreError> {
        let Some((store, parent_identity)) = self.mailbox_context(session).await? else {
            return Ok(());
        };
        let Some(event_log_writer) = self.event_log_writer.as_ref() else {
            return Ok(());
        };
        let child_thread_ids = store
            .list_thread_spawn_children(
                parent_identity.thread_id.clone(),
                Some(ThreadSpawnEdgeStatus::Open),
            )
            .await
            .map_err(mailbox_store_error)?;
        for child_thread_id in child_thread_ids {
            let child_thread = store
                .read_thread(ReadThreadParams {
                    thread_id: child_thread_id.clone(),
                    include_archived: true,
                    turns_view: ThreadTurnsView::NotLoaded,
                })
                .await
                .map_err(mailbox_store_error)?
                .ok_or_else(|| {
                    RuntimeCoreError::Backend(format!(
                        "open child {child_thread_id} has no canonical Thread"
                    ))
                })?;
            let child_session_id = child_thread.session_id.to_string();
            let durable_scan = event_log_writer
                .scan_session_events(&child_session_id)
                .map_err(RuntimeCoreError::Backend)?;
            let has_terminal_in_valid_prefix = durable_scan.records.iter().any(|record| {
                matches!(
                    record.event.event_type.as_str(),
                    "turn.completed" | "turn.failed"
                )
            });
            if !has_terminal_in_valid_prefix && durable_scan.issue.is_none() {
                continue;
            }
            let context = self
                .load_projection_session(&app_server_protocol::AgentSessionReadParams {
                    session_id: child_session_id.clone(),
                    history_limit: None,
                    history_offset: None,
                    history_before_message_id: None,
                })
                .await?;
            let Some(context) = context else {
                if has_terminal_in_valid_prefix {
                    return Err(RuntimeCoreError::SessionNotFound(child_session_id));
                }
                continue;
            };
            if context.stored.session.thread_id != child_thread_id.as_str() {
                return Err(RuntimeCoreError::Backend(format!(
                    "terminal activity recovery thread mismatch for session {child_session_id}"
                )));
            }
            if !context
                .stored
                .events
                .iter()
                .any(|event| matches!(event.event_type.as_str(), "turn.completed" | "turn.failed"))
            {
                continue;
            }
            let canonical_sequence = store
                .history_sequence(child_thread_id.clone())
                .await
                .map_err(mailbox_store_error)?
                .unwrap_or(0);
            let canonical_tail = context
                .stored
                .events
                .iter()
                .filter(|event| event.sequence > canonical_sequence)
                .cloned()
                .collect::<Vec<_>>();
            if !canonical_tail.is_empty() {
                store
                    .apply_canonical_events(&context.stored, &canonical_tail)
                    .map_err(|error| {
                        RuntimeCoreError::Backend(format!(
                            "failed to recover canonical child terminal tail: {error}"
                        ))
                    })?;
            }
            store
                .append_terminal_agent_results_sync(&child_thread_id, &context.stored.events)
                .map_err(|error| {
                    RuntimeCoreError::Backend(format!(
                        "failed to recover durable child terminal activity: {error}"
                    ))
                })?;
        }
        Ok(())
    }

    async fn append_mailbox_items_before_ack(
        &self,
        session: &AgentSession,
        turn: &AgentTurn,
        current_input: Option<&AgentInput>,
        store: &ProjectionStore,
        messages: Vec<AgentMailboxMessage>,
    ) -> Result<MailboxTurnDelivery, RuntimeCoreError> {
        let mut delivered_events = self.replay_durable_mailbox_events(session, turn, &messages)?;
        let mut consumed_messages = Vec::new();
        let mut pending = Vec::new();
        let mut runtime_events = Vec::new();
        let mut contains_turn_input = false;

        for message in messages {
            let item_id = mailbox_item_id(&message.message_id);
            if canonical_mailbox_item_exists(store, &message.recipient_thread_id, &item_id).await? {
                if acknowledge_mailbox_message(store, &message).await? {
                    consumed_messages.push(message);
                }
                continue;
            }
            let is_turn_input = message.delivery_mode == AgentMailboxDeliveryMode::TriggerTurn;
            contains_turn_input |= is_turn_input;
            runtime_events.push(mailbox_message_runtime_event(
                &message,
                &item_id,
                is_turn_input,
            ));
            pending.push(message);
        }

        if !runtime_events.is_empty() && !contains_turn_input {
            if let Some(input_event) =
                current_input.and_then(super::turn_input_events::runtime_event_for_turn_input)
            {
                runtime_events.push(input_event);
            }
        }
        let events = if runtime_events.is_empty() {
            Vec::new()
        } else {
            self.append_external_runtime_events(
                &session.session_id,
                Some(&turn.turn_id),
                runtime_events,
            )?
        };
        delivered_events.extend(events);
        for message in &pending {
            let item_id = mailbox_item_id(&message.message_id);
            if !canonical_mailbox_item_exists(store, &message.recipient_thread_id, &item_id).await?
            {
                return Err(RuntimeCoreError::Backend(format!(
                    "canonical mailbox Item {} was not durable before delivery acknowledgement",
                    message.message_id
                )));
            }
        }
        for message in &pending {
            if acknowledge_mailbox_message(store, message).await? {
                consumed_messages.push(message.clone());
            }
        }
        Ok(MailboxTurnDelivery {
            events: delivered_events,
            consumed_messages,
        })
    }

    fn replay_durable_mailbox_events(
        &self,
        session: &AgentSession,
        current_turn: &AgentTurn,
        messages: &[AgentMailboxMessage],
    ) -> Result<Vec<app_server_protocol::AgentEvent>, RuntimeCoreError> {
        let Some(event_log_writer) = self.event_log_writer.as_deref() else {
            return Ok(Vec::new());
        };
        let expected_messages = messages
            .iter()
            .map(|message| (message.message_id.as_str(), message))
            .collect::<BTreeMap<_, _>>();
        if expected_messages.is_empty() {
            return Ok(Vec::new());
        }
        let records = event_log_writer
            .read_session_events(&session.session_id)
            .map_err(RuntimeCoreError::Backend)?;
        let mut recovered_message_ids = BTreeSet::new();
        let mut recovered_queue_only_turn_ids = BTreeSet::new();
        let recovered_terminal_turn_ids = records
            .iter()
            .filter_map(|record| {
                is_turn_terminal_event(&record.event)
                    .then(|| record.event.turn_id.as_deref())
                    .flatten()
            })
            .collect::<BTreeSet<_>>();
        for record in &records {
            let Some(message_id) = record
                .event
                .payload
                .pointer("/mailbox/messageId")
                .and_then(serde_json::Value::as_str)
            else {
                continue;
            };
            let Some(message) = expected_messages.get(message_id).copied() else {
                continue;
            };
            if record.event.event_type != mailbox_message_event_type(message.kind) {
                continue;
            }
            if !mailbox_event_matches_message(&record.event, message) {
                return Err(RuntimeCoreError::Backend(format!(
                    "durable mailbox event {} conflicts with pending delivery",
                    message.message_id
                )));
            }
            recovered_message_ids.insert(message.message_id.as_str());
            if message.delivery_mode == AgentMailboxDeliveryMode::QueueOnly
                && record.event.turn_id.as_deref() != Some(current_turn.turn_id.as_str())
            {
                if let Some(turn_id) = record.event.turn_id.as_deref() {
                    if !recovered_terminal_turn_ids.contains(turn_id) {
                        recovered_queue_only_turn_ids.insert(turn_id.to_string());
                    }
                }
            }
        }
        if recovered_message_ids.is_empty() {
            return Ok(Vec::new());
        }
        let mut notifications = self.replay_durable_runtime_events(
            &session.session_id,
            records.into_iter().map(|record| record.event).collect(),
        )?;
        for turn_id in recovered_queue_only_turn_ids {
            notifications.extend(self.append_durable_recovery_terminal_event(
                &session.session_id,
                &turn_id,
                RuntimeEvent::new(
                    "turn.canceled",
                    json!({
                        "reason": "mailbox_projection_recovery",
                        "mailboxRecovery": true,
                    }),
                ),
            )?);
        }
        Ok(notifications)
    }
}

pub(super) fn mailbox_message_runtime_event(
    message: &AgentMailboxMessage,
    item_id: &str,
    is_turn_input: bool,
) -> RuntimeEvent {
    let mailbox = json!({
        "messageId": message.message_id,
        "rootThreadId": message.root_thread_id.as_str(),
        "senderThreadId": message.sender_thread_id.as_str(),
        "recipientThreadId": message.recipient_thread_id.as_str(),
        "kind": mailbox_message_kind_str(message.kind),
        "sourceTurnId": message.source_turn_id.as_ref().map(|turn_id| turn_id.as_str()),
        "resultStatus": message.result_status.map(mailbox_result_status_str),
        "turnInput": is_turn_input,
        "deliveryMode": match message.delivery_mode {
            AgentMailboxDeliveryMode::QueueOnly => "queue_only",
            AgentMailboxDeliveryMode::TriggerTurn => "trigger_turn",
        },
    });
    match message.kind {
        thread_store::AgentMailboxMessageKind::Message => RuntimeEvent::new(
            "message.created",
            json!({
                "role": "user",
                "visibility": "user_visible",
                "itemId": item_id,
                "messageId": message.message_id,
                "input": {
                    "text": message.content,
                    "attachments": [],
                },
                "content": {
                    "kind": "inline_text",
                    "text": message.content,
                },
                "attachments": [],
                "mailbox": mailbox.clone(),
                "metadata": { "mailbox": mailbox },
            }),
        ),
        thread_store::AgentMailboxMessageKind::Result => RuntimeEvent::new(
            "message.delta",
            json!({
                "role": "assistant",
                "visibility": "user_visible",
                "status": "completed",
                "itemId": item_id,
                "messageId": message.message_id,
                "text": message.content,
                "content": {
                    "kind": "inline_text",
                    "text": message.content,
                },
                "mailbox": mailbox.clone(),
                "metadata": { "mailbox": mailbox },
            }),
        ),
    }
}

fn mailbox_event_matches_message(
    event: &app_server_protocol::AgentEvent,
    message: &AgentMailboxMessage,
) -> bool {
    let mailbox = event.payload.get("mailbox");
    let delivery_mode = match message.delivery_mode {
        AgentMailboxDeliveryMode::QueueOnly => "queue_only",
        AgentMailboxDeliveryMode::TriggerTurn => "trigger_turn",
    };
    let message_kind = mailbox_message_kind_str(message.kind);
    let result_status = message.result_status.map(mailbox_result_status_str);
    event.event_type == mailbox_message_event_type(message.kind)
        && match message.delivery_mode {
            AgentMailboxDeliveryMode::QueueOnly => event.turn_id.is_some(),
            AgentMailboxDeliveryMode::TriggerTurn => {
                event.turn_id.as_deref() == Some(mailbox_turn_id(&message.message_id).as_str())
            }
        }
        && event.thread_id.as_deref() == Some(message.recipient_thread_id.as_str())
        && event.payload.get("itemId") == Some(&json!(mailbox_item_id(&message.message_id)))
        && mailbox.and_then(|value| value.get("messageId")) == Some(&json!(message.message_id))
        && mailbox.and_then(|value| value.get("rootThreadId"))
            == Some(&json!(message.root_thread_id.as_str()))
        && mailbox.and_then(|value| value.get("senderThreadId"))
            == Some(&json!(message.sender_thread_id.as_str()))
        && mailbox.and_then(|value| value.get("recipientThreadId"))
            == Some(&json!(message.recipient_thread_id.as_str()))
        && mailbox.and_then(|value| value.get("kind")) == Some(&json!(message_kind))
        && mailbox.and_then(|value| value.get("sourceTurnId"))
            == Some(&json!(message
                .source_turn_id
                .as_ref()
                .map(|turn_id| turn_id.as_str())))
        && mailbox.and_then(|value| value.get("resultStatus")) == Some(&json!(result_status))
        && mailbox.and_then(|value| value.get("deliveryMode")) == Some(&json!(delivery_mode))
        && mailbox.and_then(|value| value.get("turnInput"))
            == Some(&json!(
                message.delivery_mode == AgentMailboxDeliveryMode::TriggerTurn
            ))
        && match message.kind {
            thread_store::AgentMailboxMessageKind::Message => {
                event.payload.pointer("/input/text") == Some(&json!(message.content))
                    && event.payload.get("role") == Some(&json!("user"))
            }
            thread_store::AgentMailboxMessageKind::Result => {
                event.payload.get("text") == Some(&json!(message.content))
                    && event.payload.get("role") == Some(&json!("assistant"))
                    && event.payload.pointer("/metadata/mailbox") == mailbox
            }
        }
}

fn mailbox_message_kind_str(kind: thread_store::AgentMailboxMessageKind) -> &'static str {
    match kind {
        thread_store::AgentMailboxMessageKind::Message => "message",
        thread_store::AgentMailboxMessageKind::Result => "result",
    }
}

fn mailbox_message_event_type(kind: thread_store::AgentMailboxMessageKind) -> &'static str {
    match kind {
        thread_store::AgentMailboxMessageKind::Message => "message.created",
        thread_store::AgentMailboxMessageKind::Result => "message.delta",
    }
}

fn mailbox_result_status_str(status: thread_store::AgentMailboxResultStatus) -> &'static str {
    match status {
        thread_store::AgentMailboxResultStatus::Completed => "completed",
        thread_store::AgentMailboxResultStatus::Failed => "failed",
    }
}

fn is_turn_terminal_event(event: &app_server_protocol::AgentEvent) -> bool {
    matches!(
        event.event_type.as_str(),
        "turn.completed" | "turn.failed" | "turn.canceled"
    )
}

pub(super) fn mailbox_item_id(message_id: &str) -> String {
    ItemId::new(format!(
        "{MAILBOX_ITEM_PREFIX}{}",
        stable_mailbox_digest(message_id)
    ))
    .to_string()
}

pub(super) fn mailbox_turn_id(message_id: &str) -> String {
    format!("{MAILBOX_TURN_PREFIX}{}", stable_mailbox_digest(message_id))
}

fn stable_mailbox_digest(message_id: &str) -> String {
    hex::encode(Sha256::digest(message_id.as_bytes()))
}

pub(super) async fn canonical_mailbox_item_exists(
    store: &ProjectionStore,
    thread_id: &ThreadId,
    item_id: &str,
) -> Result<bool, RuntimeCoreError> {
    let thread = store
        .read_thread(ReadThreadParams {
            thread_id: thread_id.clone(),
            include_archived: true,
            turns_view: ThreadTurnsView::Full,
        })
        .await
        .map_err(mailbox_store_error)?;
    Ok(thread.is_some_and(|thread| {
        thread
            .turns
            .iter()
            .flat_map(|turn| turn.items.iter())
            .any(|item| item.item_id.as_str() == item_id)
    }))
}

async fn acknowledge_mailbox_message(
    store: &ProjectionStore,
    message: &AgentMailboxMessage,
) -> Result<bool, RuntimeCoreError> {
    Ok(store
        .mark_agent_mailbox_message_delivered(
            message.root_thread_id.clone(),
            message.recipient_thread_id.clone(),
            message.message_id.clone(),
            chrono::Utc::now().timestamp_millis(),
        )
        .await
        .map_err(mailbox_store_error)?
        .is_some())
}

fn mailbox_store_error(error: impl std::fmt::Display) -> RuntimeCoreError {
    RuntimeCoreError::Backend(format!("durable agent mailbox failed: {error}"))
}
