use crate::ActionRespondRequest;
use crate::RuntimeCoreError;
use crate::RuntimeEvent;
use app_server_protocol::AgentSessionActionType;
use lime_agent::AgentActionRequiredScope;
use lime_agent::AsterAgentState;
use serde_json::{json, Value};

pub(super) async fn handle_action_response(
    agent_state: &AsterAgentState,
    request: &ActionRespondRequest,
) -> Result<(), RuntimeCoreError> {
    match request.action_type {
        AgentSessionActionType::ToolConfirmation => agent_state
            .confirm_tool_action(&request.request_id, request.confirmed)
            .await
            .map_err(backend_error),
        AgentSessionActionType::AskUser | AgentSessionActionType::Elicitation => {
            if !request.confirmed {
                return Ok(());
            }
            let user_data = action_response_user_data(request);
            agent_state
                .submit_elicitation_response(
                    &request.session.session_id,
                    &request.request_id,
                    user_data,
                    request
                        .action_scope
                        .clone()
                        .map(agent_action_required_scope_from_protocol),
                )
                .await
                .map_err(backend_error)
        }
    }
}

pub(super) fn action_resolved_event(request: &ActionRespondRequest) -> RuntimeEvent {
    RuntimeEvent::new(
        "action.resolved",
        json!({
            "backend": "runtime",
            "requestId": request.request_id,
            "actionId": request.request_id,
            "actionType": request.action_type,
            "confirmed": request.confirmed,
            "decision": if request.confirmed { "approve" } else { "deny" },
            "response": request.response,
            "userData": request.user_data,
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

fn backend_error(error: impl std::fmt::Display) -> RuntimeCoreError {
    RuntimeCoreError::Backend(error.to_string())
}
