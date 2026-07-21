use crate::ActionRespondRequest;
use crate::RuntimeCoreError;
use crate::RuntimeEvent;
use agent_runtime::action_required::ActionRequiredError;
use app_server_protocol::AgentSessionActionType;
use lime_agent::AgentActionRequiredScope;
use lime_agent::AgentRuntimeState;
use serde_json::{json, Value};

pub(super) enum ActionResponseOutcome {
    Resolved,
    Canceled,
}

pub(super) async fn handle_action_response(
    agent_state: &AgentRuntimeState,
    request: &ActionRespondRequest,
) -> Result<ActionResponseOutcome, RuntimeCoreError> {
    let action_scope = required_action_scope(request)?;
    match request.action_type {
        AgentSessionActionType::ToolConfirmation => {
            let decision = request.decision.ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "tool_confirmation action/respond requires decision".to_string(),
                )
            })?;
            if decision.is_cancel() {
                agent_state
                    .cancel_action(
                        &request.session.session_id,
                        &request.request_id,
                        Some(action_scope),
                    )
                    .await
                    .map_err(action_required_error)?;
                return Ok(ActionResponseOutcome::Canceled);
            }
            agent_state
                .confirm_tool_action(
                    &request.session.session_id,
                    &request.request_id,
                    decision.confirmed(),
                    Some(action_scope),
                )
                .await
                .map_err(action_required_error)?;
            Ok(ActionResponseOutcome::Resolved)
        }
        AgentSessionActionType::AskUser | AgentSessionActionType::Elicitation => {
            if !request.confirmed {
                agent_state
                    .cancel_action(
                        &request.session.session_id,
                        &request.request_id,
                        Some(action_scope),
                    )
                    .await
                    .map_err(action_required_error)?;
                return Ok(ActionResponseOutcome::Canceled);
            }
            let user_data = action_response_user_data(request);
            agent_state
                .submit_elicitation_response(
                    &request.session.session_id,
                    &request.request_id,
                    user_data,
                    Some(action_scope),
                )
                .await
                .map_err(action_required_error)?;
            Ok(ActionResponseOutcome::Resolved)
        }
    }
}

pub(super) fn validate_action_scope(
    request: &ActionRespondRequest,
) -> Result<(), RuntimeCoreError> {
    required_action_scope(request).map(|_| ())
}

fn required_action_scope(
    request: &ActionRespondRequest,
) -> Result<AgentActionRequiredScope, RuntimeCoreError> {
    let scope = request
        .action_scope
        .clone()
        .ok_or_else(|| action_response_error("action_scope_missing", &request.request_id))?;
    let complete = [
        scope.session_id.as_deref(),
        scope.thread_id.as_deref(),
        scope.turn_id.as_deref(),
    ]
    .into_iter()
    .all(|field| field.is_some_and(|value| !value.trim().is_empty()));
    let session_matches = scope.session_id.as_deref() == Some(request.session.session_id.as_str());
    let thread_matches = scope.thread_id.as_deref() == Some(request.session.thread_id.as_str());
    let turn_matches = request
        .turn
        .as_ref()
        .is_none_or(|turn| scope.turn_id.as_deref() == Some(turn.turn_id.as_str()));
    if !complete || !session_matches || !thread_matches || !turn_matches {
        return Err(action_response_error(
            "action_scope_mismatch",
            &request.request_id,
        ));
    }
    Ok(agent_action_required_scope_from_protocol(scope))
}

pub(super) fn action_resolved_event(request: &ActionRespondRequest) -> RuntimeEvent {
    let mut payload = json!({
            "backend": "runtime",
            "requestId": request.request_id,
            "actionId": request.request_id,
            "actionType": request.action_type,
            "confirmed": request.confirmed,
            "response": request.response,
            "userData": request.user_data,
            "scope": request.action_scope,
    });
    if let Some(decision) = request.decision {
        if let Some(object) = payload.as_object_mut() {
            object.insert("decision".to_string(), json!(decision.as_str()));
            object.insert("decisionScope".to_string(), json!(decision.scope()));
        }
    }
    RuntimeEvent::new("action.resolved", payload)
}

pub(super) fn action_canceled_event(request: &ActionRespondRequest) -> RuntimeEvent {
    RuntimeEvent::new(
        "action.canceled",
        json!({
            "backend": "runtime",
            "requestId": request.request_id,
            "actionId": request.request_id,
            "actionType": request.action_type,
            "confirmed": false,
            "scope": request.action_scope,
        }),
    )
}

fn action_response_user_data(request: &ActionRespondRequest) -> Value {
    request
        .user_data
        .clone()
        .or_else(|| {
            request
                .response
                .as_ref()
                .map(|response| json!({ "answer": response }))
        })
        .unwrap_or_else(|| json!({}))
}

fn agent_action_required_scope_from_protocol(
    scope: app_server_protocol::AgentSessionActionScope,
) -> AgentActionRequiredScope {
    AgentActionRequiredScope {
        session_id: scope.session_id,
        thread_id: scope.thread_id,
        turn_id: scope.turn_id,
    }
}

fn action_required_error(error: ActionRequiredError) -> RuntimeCoreError {
    action_response_error(error.code(), error.request_id())
}

fn action_response_error(code: &str, request_id: &str) -> RuntimeCoreError {
    RuntimeCoreError::ActionResponse {
        code: code.to_string(),
        request_id: request_id.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::RuntimeHostContext;
    use agent_runtime::action_required::{
        ActionTerminalStatus, PendingActionDescriptor, PendingActionStatus,
    };
    use app_server_protocol::{
        AgentSession, AgentSessionActionScope, AgentSessionApprovalDecision, AgentSessionStatus,
        AgentTurn, AgentTurnStatus,
    };

    fn session() -> AgentSession {
        AgentSession {
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            app_id: "agent".to_string(),
            workspace_id: None,
            business_object_ref: None,
            status: AgentSessionStatus::WaitingAction,
            created_at: "2026-07-12T15:00:00Z".to_string(),
            updated_at: "2026-07-12T15:00:00Z".to_string(),
        }
    }

    fn turn(status: AgentTurnStatus) -> AgentTurn {
        AgentTurn {
            turn_id: "turn-1".to_string(),
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            status,
            started_at: Some("2026-07-12T15:00:00Z".to_string()),
            completed_at: None,
        }
    }

    fn action_request(scope: Option<AgentSessionActionScope>) -> ActionRespondRequest {
        ActionRespondRequest {
            host: RuntimeHostContext::default(),
            session: session(),
            turn: Some(turn(AgentTurnStatus::WaitingAction)),
            request_id: "approval-1".to_string(),
            action_type: AgentSessionActionType::AskUser,
            decision: None,
            confirmed: true,
            response: None,
            user_data: None,
            metadata: None,
            event_name: None,
            action_scope: scope,
            pending_action_descriptor: None,
        }
    }

    fn complete_scope() -> AgentSessionActionScope {
        AgentSessionActionScope {
            session_id: Some("session-1".to_string()),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
        }
    }

    fn restored_tool_confirmation() -> PendingActionDescriptor {
        PendingActionDescriptor {
            request_id: "approval-1".to_string(),
            action_type: "tool_confirmation".to_string(),
            tool_id: Some("tool-1".to_string()),
            message: Some("Allow?".to_string()),
            requested_schema: None,
            available_decisions: vec!["allow_once".to_string(), "decline".to_string()],
            scope: AgentActionRequiredScope::from_parts(
                Some("session-1".to_string()),
                Some("thread-1".to_string()),
                Some("turn-1".to_string()),
            ),
            created_at_ms: Some(1_783_900_000_000),
            deadline_at_ms: Some(1_999_999_999_999),
            status: PendingActionStatus::Pending,
        }
    }

    #[test]
    fn action_scope_requires_canonical_session_thread_and_turn() {
        let missing = required_action_scope(&action_request(None)).expect_err("missing scope");
        assert!(missing.to_string().contains("action_scope_missing"));

        let mut wrong_session = complete_scope();
        wrong_session.session_id = Some("wrong-session".to_string());
        let error = required_action_scope(&action_request(Some(wrong_session)))
            .expect_err("wrong canonical scope");
        assert!(error.to_string().contains("action_scope_mismatch"));

        let mut wrong_thread = complete_scope();
        wrong_thread.thread_id = Some("wrong-thread".to_string());
        assert!(required_action_scope(&action_request(Some(wrong_thread))).is_err());
        let mut wrong_turn = complete_scope();
        wrong_turn.turn_id = Some("wrong-turn".to_string());
        assert!(required_action_scope(&action_request(Some(wrong_turn))).is_err());
        assert!(required_action_scope(&action_request(Some(complete_scope()))).is_ok());
    }

    #[tokio::test]
    async fn tool_confirmation_cancel_terminalizes_without_resolving_as_decline() {
        let agent_state = AgentRuntimeState::default();
        assert!(matches!(
            agent_state
                .restore_pending_action_descriptors([restored_tool_confirmation()])
                .await
                .as_slice(),
            [agent_runtime::action_required::PendingActionRestoreOutcome::Restored]
        ));
        let mut request = action_request(Some(complete_scope()));
        request.action_type = AgentSessionActionType::ToolConfirmation;
        request.decision = Some(AgentSessionApprovalDecision::Cancel);
        request.confirmed = false;

        let outcome = handle_action_response(&agent_state, &request)
            .await
            .expect("cancel tool confirmation");

        assert!(matches!(outcome, ActionResponseOutcome::Canceled));
        assert_eq!(
            agent_state.terminal_action_status("approval-1").await,
            Some(ActionTerminalStatus::Canceled)
        );
    }
}
