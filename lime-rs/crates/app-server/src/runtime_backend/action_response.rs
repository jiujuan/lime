use crate::ActionRespondRequest;
use crate::RuntimeCoreError;
use crate::RuntimeEvent;
use app_server_protocol::AgentSessionActionType;
use lime_agent::AgentActionRequiredScope;
use lime_agent::AgentRuntimeState;
use serde_json::{json, Value};

pub(super) async fn handle_action_response(
    agent_state: &AgentRuntimeState,
    request: &ActionRespondRequest,
) -> Result<(), RuntimeCoreError> {
    match request.action_type {
        AgentSessionActionType::ToolConfirmation => {
            let decision = request.decision.ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "tool_confirmation action/respond requires decision".to_string(),
                )
            })?;
            agent_state
                .confirm_tool_action(&request.request_id, decision.confirmed())
                .await
                .map_err(backend_error)
        }
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
