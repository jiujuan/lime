use crate::evidence::new_browser_action_id;
use crate::manager::CdpSessionHandle;
use serde_json::{json, Value};

const HUMAN_CONFIRMATION_REASON: &str = "browser_action_requires_confirmation";

pub(crate) async fn build_action_required_result(
    session: &CdpSessionHandle,
    action: &str,
    args: Value,
) -> Result<Value, String> {
    let state = session.state().await;
    let action_id = new_browser_action_id();
    let request_id = format!("browser-action-confirmation:{}", action_id);
    let target_url = action_target_url(&args).unwrap_or_else(|| {
        state
            .last_page_info
            .as_ref()
            .map(|page| page.url.clone())
            .filter(|url| !url.trim().is_empty())
            .unwrap_or_else(|| state.target_url.clone())
    });
    let risk_level = if browser_script_action(action) {
        "high"
    } else {
        "medium"
    };
    let permission_facts = json!({
        "risk_level": risk_level,
        "risk_reason": "browser",
        "scope_kind": "url",
        "scope_value": target_url,
        "requires_human_takeover": true,
    });
    let confirmation_request = json!({
        "requestId": request_id,
        "actionType": "tool_confirmation",
        "toolName": "browserSession/action/execute",
        "arguments": {
            "action": action,
            "sessionId": state.session_id,
            "profileKey": state.profile_key,
            "targetId": state.target_id,
            "url": target_url,
            "args": args,
            "permission_facts": permission_facts,
        }
    });

    session
        .take_over(Some(HUMAN_CONFIRMATION_REASON.to_string()))
        .await;

    Ok(json!({
        "actionId": action_id,
        "requestId": request_id,
        "eventClass": "action.required",
        "failureCategory": "action_required",
        "status": "pending",
        "success": false,
        "action_required": confirmation_request,
        "controlMode": "human",
        "lifecycleState": "human_controlling",
        "humanReason": HUMAN_CONFIRMATION_REASON,
    }))
}

pub(crate) fn browser_action_requires_confirmation(action: &str) -> bool {
    matches!(
        normalize_action(action).as_str(),
        "click"
            | "type"
            | "form_input"
            | "submit"
            | "select"
            | "check"
            | "uncheck"
            | "press"
            | "drag"
            | "drop"
            | "upload"
            | "file_upload"
            | "download"
            | "javascript"
            | "execute_javascript"
    )
}

fn browser_script_action(action: &str) -> bool {
    matches!(
        normalize_action(action).as_str(),
        "javascript" | "execute_javascript"
    )
}

fn normalize_action(action: &str) -> String {
    action.trim().to_ascii_lowercase().replace([' ', '-'], "_")
}

fn action_target_url(args: &Value) -> Option<String> {
    ["url", "href", "target_url", "targetUrl", "endpoint"]
        .into_iter()
        .find_map(|key| {
            args.get(key)
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mutating_browser_actions_require_confirmation_before_cdp_execution() {
        for action in [
            "click",
            "type",
            "form-input",
            "submit",
            "file_upload",
            "download",
            "javascript",
            "execute_javascript",
        ] {
            assert!(
                browser_action_requires_confirmation(action),
                "{action} should require confirmation",
            );
        }

        for action in [
            "navigate",
            "read_page",
            "get_page_info",
            "read_console_messages",
            "read_network_requests",
        ] {
            assert!(
                !browser_action_requires_confirmation(action),
                "{action} should stay auto-executable",
            );
        }
    }

    #[test]
    fn action_target_url_prefers_explicit_url_like_fields() {
        assert_eq!(
            action_target_url(&json!({
                "selector": "#pay",
                "targetUrl": "https://checkout.example/pay"
            }))
            .as_deref(),
            Some("https://checkout.example/pay"),
        );
        assert_eq!(action_target_url(&json!({ "url": "   " })), None);
    }
}
