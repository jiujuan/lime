use super::super::pending_action_descriptor;
use super::super::workflow::read_model::WorkflowReadModel;
use super::super::StoredSession;
use app_server_protocol::AgentSessionActionType;

pub(super) fn retain_canonical_respond_actions(
    stored: &StoredSession,
    read_model: &mut WorkflowReadModel,
) {
    let runs = &read_model.workflow_runs;
    read_model.actions.retain(|action| {
        if action.action_type != "respond" {
            return true;
        }
        let Some(request_id) = action.request_id.as_deref() else {
            return false;
        };
        let Some(identity) =
            pending_action_descriptor::identity_from_stored_session(stored, request_id)
        else {
            return false;
        };
        let Some(descriptor) = pending_action_descriptor::from_stored_session(stored, request_id)
        else {
            return false;
        };
        if descriptor.deadline_at_ms.is_none()
            || (identity.action_type == AgentSessionActionType::ToolConfirmation
                && descriptor.available_decisions.is_empty())
            || action.agent_action_type.as_deref()
                != Some(canonical_action_type_name(identity.action_type))
        {
            return false;
        }
        let Some(run_turn_id) = runs
            .iter()
            .find(|run| run.workflow_run_id == action.workflow_run_id)
            .and_then(|run| run.turn_id.as_deref())
        else {
            return false;
        };
        identity.scope.turn_id.as_deref() == Some(run_turn_id)
    });
}

fn canonical_action_type_name(action_type: AgentSessionActionType) -> &'static str {
    match action_type {
        AgentSessionActionType::ToolConfirmation => "tool_confirmation",
        AgentSessionActionType::AskUser => "ask_user",
        AgentSessionActionType::Elicitation => "elicitation",
    }
}
