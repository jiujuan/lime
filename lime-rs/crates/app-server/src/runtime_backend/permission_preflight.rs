use super::request_context::{
    host_approval_policy, host_metadata_value, host_sandbox_policy, AsterChatRequestSnapshot,
    RuntimeSessionScope,
};
use crate::runtime::{ExecutionRequest, RuntimeEvent};
use serde_json::{json, Value};

const APPROVAL_ON_REQUEST: &str = "on-request";
const SANDBOX_WORKSPACE_WRITE: &str = "workspace-write";
const BROWSER_CONTROL_CONTRACT: &str = "browser_control";

pub(super) fn browser_control_permission_event(
    request: &ExecutionRequest,
    host_request: Option<&AsterChatRequestSnapshot>,
    scope: &RuntimeSessionScope,
) -> Option<RuntimeEvent> {
    let host_request = host_request?;
    let approval_policy = host_approval_policy(host_request)?;
    let sandbox_policy = host_sandbox_policy(host_request)?;
    if approval_policy != APPROVAL_ON_REQUEST || sandbox_policy != SANDBOX_WORKSPACE_WRITE {
        return None;
    }

    let metadata = host_metadata_value(host_request).or_else(|| request.metadata.clone())?;
    let contract = metadata.pointer("/harness/browser_assist/runtime_contract")?;
    if contract.get("contract_key").and_then(Value::as_str) != Some(BROWSER_CONTROL_CONTRACT) {
        return None;
    }

    let request_id = format!("permission-{}", scope.turn_id);
    let permission_state = json!({
        "status": "requires_confirmation",
        "confirmation_status": "requested",
        "confirmation_request_id": request_id,
        "confirmation_source": "runtime_preflight",
        "ask_profile_keys": ["browser_control_profile"],
        "required_profile_keys": ["browser_control_profile"],
        "approval_policy": approval_policy,
        "sandbox_policy": sandbox_policy,
    });
    let scope_payload = json!({
        "sessionId": scope.session_id,
        "threadId": scope.thread_id,
        "turnId": scope.turn_id,
    });

    Some(RuntimeEvent::new(
        "action.required",
        json!({
            "requestId": request_id,
            "actionId": request_id,
            "actionType": "elicitation",
            "actionKind": "permission_preflight",
            "prompt": "需要确认浏览器控制权限",
            "message": "需要确认浏览器控制权限",
            "permission_state": permission_state,
            "data": {
                "prompt": "需要确认浏览器控制权限",
                "permission_state": permission_state,
                "runtime_contract": contract,
            },
            "scope": scope_payload,
            "runtime_contract": contract,
            "approval_policy": approval_policy,
            "sandbox_policy": sandbox_policy,
        }),
    ))
}
