use std::sync::Arc;

use agent_protocol::{
    ItemId, ItemStatus, SessionId, ThreadId, ThreadItem, ThreadItemPayload, ToolArgument,
    ToolOutput, TurnId,
};
use app_server::{
    ActionRespondRequest, CancelExecutionRequest, ExecutionBackend, ExecutionRequest,
    ProjectionStore, RuntimeCore, RuntimeCoreError, RuntimeEvent, RuntimeEventSink,
    RuntimeHostContext,
};
use app_server_protocol::{
    AgentInput, AgentSessionActionRespondParams, AgentSessionActionScope, AgentSessionActionType,
    AgentSessionApprovalDecision, AgentSessionReadParams, AgentSessionStartParams,
    AgentSessionTurnStartParams, AgentTurnStatus,
};
use async_trait::async_trait;
use serde_json::{json, Value};

const SESSION_ID: &str = "sess_file_change_decline";
const THREAD_ID: &str = "thread_file_change_decline";
const TURN_ID: &str = "turn_file_change_decline";
const ACTION_ID: &str = "approval_file_change_decline";
const PATCH_ID: &str = "patch_file_change_decline";
const TOOL_ITEM_ID: &str = "item_file_change_decline";

struct FileChangeDeclineBackend;

#[async_trait]
impl ExecutionBackend for FileChangeDeclineBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        sink.emit(tool_event(
            &request.session.session_id,
            &request.session.thread_id,
            &request.turn.turn_id,
            ItemStatus::InProgress,
            None,
        ))?;
        sink.emit(RuntimeEvent::new(
            "patch.started",
            json!({
                "patchId": PATCH_ID,
                "status": "proposed",
                "changes": changes(),
            }),
        ))?;
        sink.emit(RuntimeEvent::new(
            "action.required",
            json!({
                "requestId": ACTION_ID,
                "actionId": ACTION_ID,
                "actionType": "tool_confirmation",
                "actionKind": "tool_execution_policy",
                "availableDecisions": ["allow_once", "decline", "cancel"],
                "toolCallId": PATCH_ID,
                "toolName": "apply_patch",
                "prompt": "Apply this patch?",
                "scope": {
                    "sessionId": request.session.session_id,
                    "threadId": request.session.thread_id,
                    "turnId": request.turn.turn_id,
                },
            }),
        ))
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
        request: ActionRespondRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        let turn = request.turn.as_ref().ok_or_else(|| {
            RuntimeCoreError::Backend("file change decline requires an active turn".to_string())
        })?;
        let canceled = request
            .decision
            .is_some_and(AgentSessionApprovalDecision::is_cancel);
        sink.emit(RuntimeEvent::new(
            if canceled {
                "action.canceled"
            } else {
                "action.resolved"
            },
            json!({
                "requestId": request.request_id,
                "actionId": ACTION_ID,
                "actionType": "tool_confirmation",
                "decision": if canceled { "cancel" } else { "decline" },
                "confirmed": false,
                "toolCallId": PATCH_ID,
                "toolName": "apply_patch",
            }),
        ))?;
        if canceled {
            sink.emit(tool_event(
                &request.session.session_id,
                &request.session.thread_id,
                &turn.turn_id,
                ItemStatus::Cancelled,
                None,
            ))?;
            return sink.emit(RuntimeEvent::new(
                "turn.canceled",
                json!({ "reason": "file_change_approval_cancelled" }),
            ));
        }
        sink.emit(RuntimeEvent::new(
            "patch.declined",
            json!({
                "patchId": PATCH_ID,
                "status": "declined",
                "changes": changes(),
            }),
        ))?;
        sink.emit(tool_event(
            &request.session.session_id,
            &request.session.thread_id,
            &turn.turn_id,
            ItemStatus::Failed,
            Some(ToolOutput {
                text: None,
                structured_content: Some(json!({
                    "success": false,
                    "reasonCode": "tool_approval_declined",
                })),
                error: Some("patch declined by user".to_string()),
                duration_ms: None,
                truncated: false,
                output_ref: None,
            }),
        ))?;
        sink.emit(RuntimeEvent::new(
            "turn.completed",
            json!({ "reason": "file_change_approval_declined" }),
        ))
    }
}

#[tokio::test]
async fn file_change_decline_closes_patch_and_updates_the_read_model() {
    let temp = tempfile::tempdir().expect("file change decline temp dir");
    let core = RuntimeCore::with_backend(Arc::new(FileChangeDeclineBackend)).with_projection_store(
        Arc::new(
            ProjectionStore::initialize(temp.path().join("projection.sqlite"))
                .expect("file change decline projection store"),
        ),
    );
    core.start_session(AgentSessionStartParams {
        session_id: Some(SESSION_ID.to_string()),
        thread_id: Some(THREAD_ID.to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-file-change-decline".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("start file change decline session");

    let pending = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: SESSION_ID.to_string(),
                turn_id: Some(TURN_ID.to_string()),
                input: AgentInput {
                    text: "apply a protected patch".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: true,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("start pending file change turn");
    assert_eq!(pending.response.turn.status, AgentTurnStatus::WaitingAction);

    core.respond_action(
        AgentSessionActionRespondParams {
            session_id: SESSION_ID.to_string(),
            request_id: ACTION_ID.to_string(),
            action_type: AgentSessionActionType::ToolConfirmation,
            decision: Some(AgentSessionApprovalDecision::Decline),
            confirmed: None,
            response: None,
            user_data: None,
            metadata: None,
            event_name: None,
            action_scope: Some(AgentSessionActionScope {
                session_id: Some(SESSION_ID.to_string()),
                thread_id: Some(THREAD_ID.to_string()),
                turn_id: Some(TURN_ID.to_string()),
            }),
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("decline file change action");

    let read = core
        .read_session_current(AgentSessionReadParams {
            session_id: SESSION_ID.to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read file change decline session");
    let turn = read
        .turns
        .iter()
        .find(|turn| turn.turn_id == TURN_ID)
        .expect("declined file change turn");
    assert_eq!(turn.status, AgentTurnStatus::Completed);

    let detail = read.detail.expect("file change decline detail");
    let item = detail["thread_read"]["thread_items"]
        .as_array()
        .expect("thread items")
        .iter()
        .find(|item| item["type"] == "patch" && item["id"] == PATCH_ID)
        .unwrap_or_else(|| panic!("missing declined FileChange item: {detail:#?}"));
    assert_eq!(item["status"], "failed");
    assert_eq!(item["file_status"], "rejected");
    assert_eq!(item["changes"].as_array().map(Vec::len), Some(4));
    assert_eq!(item["changes"][3]["path"], "src/move-source.ts");
    assert_eq!(item["changes"][3]["kind"]["type"], "update");
    assert_eq!(
        item["changes"][3]["kind"]["move_path"],
        "src/move-destination.ts"
    );
    assert_eq!(
        detail["thread_read"]["change_summary"]["running_patch_count"],
        0
    );
}

#[tokio::test]
async fn file_change_cancel_interrupts_without_a_patch_terminal() {
    let temp = tempfile::tempdir().expect("file change cancel temp dir");
    let core = RuntimeCore::with_backend(Arc::new(FileChangeDeclineBackend)).with_projection_store(
        Arc::new(
            ProjectionStore::initialize(temp.path().join("projection.sqlite"))
                .expect("file change cancel projection store"),
        ),
    );
    core.start_session(AgentSessionStartParams {
        session_id: Some(SESSION_ID.to_string()),
        thread_id: Some(THREAD_ID.to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-file-change-cancel".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("start file change cancel session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: SESSION_ID.to_string(),
            turn_id: Some(TURN_ID.to_string()),
            input: AgentInput {
                text: "cancel a protected patch".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: true,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("start pending file change cancel turn");

    core.respond_action(
        AgentSessionActionRespondParams {
            session_id: SESSION_ID.to_string(),
            request_id: ACTION_ID.to_string(),
            action_type: AgentSessionActionType::ToolConfirmation,
            decision: Some(AgentSessionApprovalDecision::Cancel),
            confirmed: None,
            response: None,
            user_data: None,
            metadata: None,
            event_name: None,
            action_scope: Some(AgentSessionActionScope {
                session_id: Some(SESSION_ID.to_string()),
                thread_id: Some(THREAD_ID.to_string()),
                turn_id: Some(TURN_ID.to_string()),
            }),
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("cancel file change action");

    let read = core
        .read_session_current(AgentSessionReadParams {
            session_id: SESSION_ID.to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read file change cancel session");
    assert_eq!(read.turns[0].status, AgentTurnStatus::Canceled);

    let events = core
        .events_for_session(SESSION_ID)
        .expect("file change cancel events");
    let terminal_types = events
        .iter()
        .filter_map(|event| {
            let matches_terminal = match event.event_type.as_str() {
                "action.canceled" | "turn.canceled" => true,
                "item.completed" => event.payload["item"]["itemId"] == TOOL_ITEM_ID,
                _ => false,
            };
            matches_terminal.then_some(event.event_type.as_str())
        })
        .collect::<Vec<_>>();
    assert_eq!(
        terminal_types,
        vec!["action.canceled", "item.completed", "turn.canceled"]
    );
    assert!(events.iter().all(|event| {
        !matches!(
            event.event_type.as_str(),
            "patch.applied" | "patch.failed" | "patch.declined"
        )
    }));
    let canceled_tool = events
        .iter()
        .find(|event| {
            event.event_type == "item.completed" && event.payload["item"]["itemId"] == TOOL_ITEM_ID
        })
        .expect("cancelled apply_patch tool item");
    assert_eq!(canceled_tool.payload["item"]["status"], "cancelled");
}

fn tool_event(
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    status: ItemStatus,
    output: Option<ToolOutput>,
) -> RuntimeEvent {
    let completed_at_ms = status.is_terminal().then_some(2);
    let payload = ThreadItemPayload::Tool {
        call_id: PATCH_ID.to_string(),
        name: "apply_patch".to_string(),
        arguments: vec![ToolArgument {
            name: "changes".to_string(),
            value: changes().to_string(),
        }],
        output,
    };
    RuntimeEvent::new(
        if status.is_terminal() {
            "item.completed"
        } else {
            "item.started"
        },
        json!({
            "item": ThreadItem {
                session_id: SessionId::new(session_id),
                thread_id: ThreadId::new(thread_id),
                turn_id: TurnId::new(turn_id),
                item_id: ItemId::new(TOOL_ITEM_ID),
                sequence: 1,
                ordinal: 1,
                created_at_ms: 1,
                updated_at_ms: completed_at_ms.unwrap_or(1),
                completed_at_ms,
                kind: payload.kind(),
                status,
                payload,
                metadata: json!({}),
            }
        }),
    )
}

fn changes() -> Value {
    json!([
        {
            "path": "src/added.ts",
            "kind": "add",
            "diff": "+export const added = true;",
        },
        {
            "path": "src/deleted.ts",
            "kind": "delete",
            "diff": "-export const deleted = true;",
        },
        {
            "path": "src/updated.ts",
            "kind": "update",
            "diff": "-false\n+true",
        },
        {
            "path": "src/move-source.ts",
            "kind": "update",
            "movePath": "src/move-destination.ts",
            "diff": "-source\n+destination",
        },
    ])
}
