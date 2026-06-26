use app_server_protocol::{
    BrowserSessionActionExecuteParams, BrowserSessionActionExecuteResponse,
    BrowserSessionCloseResponse, BrowserSessionEventItem, BrowserSessionEventListParams,
    BrowserSessionEventListResponse, BrowserSessionIdParams, BrowserSessionOpenParams,
    BrowserSessionOpenResponse, BrowserSessionPageInfo, BrowserSessionReadResponse,
    BrowserSessionState, BrowserSessionTargetInfo, BrowserSessionTargetListParams,
    BrowserSessionTargetListResponse,
};
use lime_browser_runtime::{
    cleanup_plan_for_owner, BrowserProfileCleanupPlan, BrowserProfileOwner, BrowserProfileScope,
    CdpSessionState, CdpTargetInfo, OpenSessionRequest,
};
use serde::Serialize;
use serde_json::json;
use serde_json::Map;
use serde_json::Value;

use crate::{RuntimeCore, RuntimeCoreError};

impl RuntimeCore {
    pub async fn list_browser_session_targets(
        &self,
        params: BrowserSessionTargetListParams,
    ) -> Result<BrowserSessionTargetListResponse, RuntimeCoreError> {
        let targets = self
            .browser_runtime
            .list_targets(params.remote_debugging_port)
            .await
            .map_err(RuntimeCoreError::Backend)?
            .into_iter()
            .map(project_target)
            .collect();
        Ok(BrowserSessionTargetListResponse { targets })
    }

    pub async fn open_browser_session(
        &self,
        params: BrowserSessionOpenParams,
    ) -> Result<BrowserSessionOpenResponse, RuntimeCoreError> {
        let state = self
            .browser_runtime
            .open_session(OpenSessionRequest {
                profile_key: params.profile_key,
                remote_debugging_port: params.remote_debugging_port,
                target_id: params.target_id,
                environment_preset_id: params.environment_preset_id,
                environment_preset_name: params.environment_preset_name,
            })
            .await
            .map_err(RuntimeCoreError::Backend)?;

        let state = if let Some(launch_url) = params
            .launch_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            self.browser_runtime
                .execute_action(
                    &state.session_id,
                    "navigate",
                    serde_json::json!({ "url": launch_url }),
                )
                .await
                .map_err(RuntimeCoreError::Backend)?;
            self.browser_runtime
                .refresh_page_info(&state.session_id)
                .await
                .unwrap_or(state)
        } else {
            state
        };

        self.register_browser_profile_scope(&state);

        Ok(BrowserSessionOpenResponse {
            session: project_state(state),
        })
    }

    pub async fn read_browser_session(
        &self,
        params: BrowserSessionIdParams,
    ) -> Result<BrowserSessionReadResponse, RuntimeCoreError> {
        let session = self
            .browser_runtime
            .get_session_state(&params.session_id)
            .await
            .map_err(RuntimeCoreError::Backend)?;
        Ok(BrowserSessionReadResponse {
            session: project_state(session),
        })
    }

    pub async fn close_browser_session(
        &self,
        params: BrowserSessionIdParams,
    ) -> Result<BrowserSessionCloseResponse, RuntimeCoreError> {
        let session = self
            .browser_runtime
            .get_session_state(&params.session_id)
            .await
            .map_err(RuntimeCoreError::Backend)?;
        let cleanup_plan = self.take_browser_profile_cleanup_plan(&session.session_id);
        if cleanup_plan.is_empty() {
            self.browser_runtime
                .close_session(&params.session_id)
                .await
                .map_err(RuntimeCoreError::Backend)?;
        } else {
            for profile_key in cleanup_plan.profile_keys {
                self.browser_runtime
                    .close_sessions_by_profile_key(&profile_key)
                    .await;
            }
        }
        Ok(BrowserSessionCloseResponse {
            status: "closed".to_string(),
            session_id: params.session_id,
        })
    }

    pub async fn list_browser_session_events(
        &self,
        params: BrowserSessionEventListParams,
    ) -> Result<BrowserSessionEventListResponse, RuntimeCoreError> {
        let snapshot = self
            .browser_runtime
            .get_event_buffer(&params.session_id, params.cursor)
            .await
            .map_err(RuntimeCoreError::Backend)?;
        let events = snapshot
            .events
            .into_iter()
            .map(|event| BrowserSessionEventItem {
                session_id: event.session_id,
                sequence: event.sequence,
                occurred_at: event.occurred_at,
                payload: serde_json::to_value(event.payload).unwrap_or(serde_json::Value::Null),
            })
            .collect();
        Ok(BrowserSessionEventListResponse {
            events,
            next_cursor: snapshot.next_cursor,
        })
    }

    pub async fn execute_browser_session_action(
        &self,
        params: BrowserSessionActionExecuteParams,
    ) -> Result<BrowserSessionActionExecuteResponse, RuntimeCoreError> {
        let args = params.args.unwrap_or(Value::Null);
        let result = self
            .browser_runtime
            .execute_action(&params.session_id, &params.action, args)
            .await
            .map_err(RuntimeCoreError::Backend)?;
        let session_state = self
            .browser_runtime
            .get_session_state(&params.session_id)
            .await
            .ok();
        let result = attach_browser_action_trace(
            result,
            params.session_id.as_str(),
            params.action.as_str(),
            session_state.as_ref(),
        );
        Ok(BrowserSessionActionExecuteResponse {
            session_id: params.session_id,
            action: params.action,
            result,
        })
    }
}

impl RuntimeCore {
    fn register_browser_profile_scope(&self, state: &CdpSessionState) {
        let scope = BrowserProfileScope::task_scoped(
            state.profile_key.clone(),
            browser_profile_owner_for_session(&state.session_id),
        );
        let mut runtime_state = self.state.lock().expect("runtime state lock poisoned");
        runtime_state.browser_profile_scopes.retain(|existing| {
            existing.profile_key != scope.profile_key || existing.owner != scope.owner
        });
        runtime_state.browser_profile_scopes.push(scope);
    }

    fn take_browser_profile_cleanup_plan(&self, session_id: &str) -> BrowserProfileCleanupPlan {
        let owner = browser_profile_owner_for_session(session_id);
        let mut runtime_state = self.state.lock().expect("runtime state lock poisoned");
        let plan = cleanup_plan_for_owner(owner, &runtime_state.browser_profile_scopes);
        if !plan.is_empty() {
            runtime_state.browser_profile_scopes.retain(|scope| {
                !scope.is_owned_by(&plan.owner)
                    || !plan
                        .profile_keys
                        .iter()
                        .any(|key| key == &scope.profile_key)
            });
        }
        plan
    }
}

fn browser_profile_owner_for_session(session_id: &str) -> BrowserProfileOwner {
    BrowserProfileOwner::new(session_id.to_string(), Option::<String>::None)
}

fn attach_browser_action_trace(
    result: Value,
    session_id: &str,
    action: &str,
    session_state: Option<&CdpSessionState>,
) -> Value {
    let action_id = action_id_from_result(&result)
        .unwrap_or_else(|| format!("browser-action:{}:{}", session_id, uuid::Uuid::new_v4()));
    let tab_id = string_from_result_paths(&result, &[&["tab", "id"][..], &["targetId"][..]])
        .or_else(|| session_state.map(|state| state.target_id.clone()));
    let evidence_refs = browser_action_evidence_refs(session_id, action_id.as_str(), &result);
    let status = string_from_result_paths(
        &result,
        &[
            &["browser_action_trace", "status"][..],
            &["status"][..],
            &["action_required", "status"][..],
        ],
    )
    .unwrap_or_else(|| {
        if result_event_class(&result).as_deref() == Some("action.required") {
            "pending".to_string()
        } else {
            "completed".to_string()
        }
    });
    let success = bool_from_result_paths(
        &result,
        &[
            &["browser_action_trace", "success"][..],
            &["success"][..],
            &["ok"][..],
        ],
    )
    .unwrap_or(status == "completed");
    let trace = json!({
        "schemaVersion": "browser-action-trace.v1",
        "sessionId": session_id,
        "tabId": tab_id,
        "actionId": action_id,
        "action": action,
        "status": status,
        "success": success,
        "evidenceRefs": evidence_refs,
        "profileKey": session_state.map(|state| state.profile_key.clone()),
        "backend": "cdp_direct",
        "eventClass": result_event_class(&result),
        "failureCategory": string_from_result_paths(&result, &[&["failureCategory"][..], &["failure_category"][..]]),
        "requestId": string_from_result_paths(&result, &[&["requestId"][..], &["request_id"][..], &["action_required", "requestId"][..], &["action_required", "request_id"][..]]),
        "controlMode": string_from_result_paths(&result, &[&["controlMode"][..], &["control_mode"][..]])
            .or_else(|| session_state.map(|state| serialize_enum_string(state.control_mode))),
        "lifecycleState": string_from_result_paths(&result, &[&["lifecycleState"][..], &["lifecycle_state"][..]])
            .or_else(|| session_state.map(|state| serialize_enum_string(state.lifecycle_state))),
        "humanReason": string_from_result_paths(&result, &[&["humanReason"][..], &["human_reason"][..]])
            .or_else(|| session_state.and_then(|state| state.human_reason.clone())),
        "lastUrl": string_from_result_paths(&result, &[&["page_info", "url"][..], &["url"][..]])
            .or_else(|| session_state.and_then(|state| state.last_page_info.as_ref().map(|page| page.url.clone())))
            .or_else(|| session_state.map(|state| state.target_url.clone())),
        "title": string_from_result_paths(&result, &[&["page_info", "title"][..], &["tab", "title"][..]])
            .or_else(|| session_state.and_then(|state| state.last_page_info.as_ref().map(|page| page.title.clone())))
            .or_else(|| session_state.map(|state| state.target_title.clone())),
    });

    match result {
        Value::Object(mut object) => {
            object
                .entry("browser_action_trace".to_string())
                .or_insert(trace);
            Value::Object(object)
        }
        value => {
            let mut object = Map::new();
            object.insert("value".to_string(), value);
            object.insert("browser_action_trace".to_string(), trace);
            Value::Object(object)
        }
    }
}

fn result_event_class(result: &Value) -> Option<String> {
    string_from_result_paths(
        result,
        &[
            &["browser_action_trace", "eventClass"][..],
            &["browser_action_trace", "event_class"][..],
            &["eventClass"][..],
            &["event_class"][..],
        ],
    )
}

fn action_id_from_result(result: &Value) -> Option<String> {
    string_from_result_paths(
        result,
        &[
            &["browser_action_trace", "actionId"][..],
            &["browser_action_trace", "action_id"][..],
            &["browserActionTrace", "actionId"][..],
            &["browserActionTrace", "action_id"][..],
            &["actionId"][..],
            &["action_id"][..],
            &["requestId"][..],
            &["request_id"][..],
        ],
    )
}

fn browser_action_evidence_refs(session_id: &str, action_id: &str, result: &Value) -> Vec<String> {
    let mut refs = Vec::new();
    push_unique_ref(&mut refs, format!("browser_session:{session_id}"));
    push_unique_ref(
        &mut refs,
        format!("browser_action:{session_id}:{action_id}"),
    );
    if result.get("page_info").is_some()
        || result.get("pageInfo").is_some()
        || result.get("markdown").is_some()
    {
        push_unique_ref(
            &mut refs,
            format!("browser_snapshot:{session_id}:{action_id}"),
        );
    }
    for key in [
        "browser_network_log",
        "browserNetworkLog",
        "browser_console_log",
        "browserConsoleLog",
        "browser_screenshot",
        "browserScreenshot",
        "browser_dom_snapshot",
        "browserDomSnapshot",
        "browser_accessibility_snapshot",
        "browserAccessibilitySnapshot",
    ] {
        collect_result_evidence_refs(&mut refs, result.get(key));
    }
    refs
}

fn collect_result_evidence_refs(refs: &mut Vec<String>, value: Option<&Value>) {
    let Some(value) = value else {
        return;
    };
    for key in ["evidenceRefs", "evidence_refs"] {
        let Some(ref_value) = value.get(key) else {
            continue;
        };
        match ref_value {
            Value::Array(items) => {
                for item in items {
                    if let Some(text) = value_string(item) {
                        push_unique_ref(refs, text);
                    }
                }
            }
            _ => {
                if let Some(text) = value_string(ref_value) {
                    push_unique_ref(refs, text);
                }
            }
        }
    }
}

fn push_unique_ref(refs: &mut Vec<String>, value: String) {
    if !refs.iter().any(|existing| existing == &value) {
        refs.push(value);
    }
}

fn string_from_result_paths(result: &Value, paths: &[&[&str]]) -> Option<String> {
    paths
        .iter()
        .filter_map(|path| value_at_path(result, path))
        .filter_map(value_string)
        .next()
}

fn value_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    Some(current)
}

fn bool_from_result_paths(result: &Value, paths: &[&[&str]]) -> Option<bool> {
    paths
        .iter()
        .filter_map(|path| value_at_path(result, path))
        .find_map(Value::as_bool)
}

fn value_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn project_target(target: CdpTargetInfo) -> BrowserSessionTargetInfo {
    BrowserSessionTargetInfo {
        id: target.id,
        title: target.title,
        url: target.url,
        target_type: target.target_type,
        web_socket_debugger_url: target.web_socket_debugger_url,
        devtools_frontend_url: target.devtools_frontend_url,
    }
}

fn project_state(state: CdpSessionState) -> BrowserSessionState {
    BrowserSessionState {
        session_id: state.session_id,
        profile_key: state.profile_key,
        environment_preset_id: state.environment_preset_id,
        environment_preset_name: state.environment_preset_name,
        target_id: state.target_id,
        target_title: state.target_title,
        target_url: state.target_url,
        remote_debugging_port: state.remote_debugging_port,
        ws_debugger_url: state.ws_debugger_url,
        devtools_frontend_url: state.devtools_frontend_url,
        stream_mode: state.stream_mode.map(serialize_enum_string),
        transport_kind: serialize_enum_string(state.transport_kind),
        lifecycle_state: serialize_enum_string(state.lifecycle_state),
        control_mode: serialize_enum_string(state.control_mode),
        human_reason: state.human_reason,
        last_page_info: state.last_page_info.map(|page| BrowserSessionPageInfo {
            title: page.title,
            url: page.url,
            markdown: page.markdown,
            updated_at: page.updated_at,
        }),
        last_event_at: state.last_event_at,
        last_frame_at: state.last_frame_at,
        last_error: state.last_error,
        created_at: state.created_at,
        connected: state.connected,
    }
}

fn serialize_enum_string<T: Serialize>(value: T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|value| value.as_str().map(ToOwned::to_owned))
        .unwrap_or_else(|| "unknown".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_browser_runtime::{
        BrowserControlMode, BrowserSessionLifecycleState, BrowserTransportKind,
    };

    #[test]
    fn browser_session_action_result_gets_trace_with_join_keys() {
        let traced = attach_browser_action_trace(
            json!({
                "page_info": {
                    "title": "Example",
                    "url": "https://example.test/"
                },
                "markdown": "# Example"
            }),
            "browser-session-1",
            "read_page",
            None,
        );

        let trace = traced
            .get("browser_action_trace")
            .expect("browser action trace");
        assert_eq!(trace["schemaVersion"], "browser-action-trace.v1");
        assert_eq!(trace["sessionId"], "browser-session-1");
        assert_eq!(trace["action"], "read_page");
        assert_eq!(trace["status"], "completed");
        assert_eq!(trace["success"], true);
        assert!(trace["actionId"]
            .as_str()
            .is_some_and(|value| value.starts_with("browser-action:browser-session-1:")));
        assert!(trace["evidenceRefs"].as_array().is_some_and(|refs| refs
            .iter()
            .any(|value| value.as_str() == Some("browser_session:browser-session-1"))));
        assert!(trace["evidenceRefs"]
            .as_array()
            .is_some_and(|refs| refs.iter().any(|value| value
                .as_str()
                .is_some_and(|text| text.starts_with("browser_snapshot:browser-session-1:")))));
    }

    #[test]
    fn browser_session_action_result_preserves_existing_action_id() {
        let traced = attach_browser_action_trace(
            json!({
                "requestId": "browser-action-explicit",
                "url": "https://example.test/"
            }),
            "browser-session-1",
            "navigate",
            None,
        );

        assert_eq!(
            traced["browser_action_trace"]["actionId"],
            "browser-action-explicit"
        );
        assert_eq!(traced["url"], "https://example.test/");
    }

    #[test]
    fn browser_session_action_trace_refs_file_evidence() {
        let traced = attach_browser_action_trace(
            json!({
                "actionId": "browser-action-1",
                "browser_network_log": {
                    "evidenceRefs": [
                        "browser_action:browser-session-1:browser-action-1",
                        "browser_network:browser-session-1:browser-action-1"
                    ]
                },
                "browser_console_log": {
                    "evidenceRefs": [
                        "browser_console:browser-session-1:browser-action-1"
                    ]
                },
                "browser_screenshot": {
                    "evidenceRefs": [
                        "browser_screenshot:browser-session-1:browser-action-1"
                    ]
                },
                "browser_dom_snapshot": {
                    "evidenceRefs": [
                        "browser_dom:browser-session-1:browser-action-1"
                    ]
                },
                "browser_accessibility_snapshot": {
                    "evidenceRefs": [
                        "browser_accessibility:browser-session-1:browser-action-1"
                    ]
                }
            }),
            "browser-session-1",
            "read_page",
            None,
        );

        let refs = traced["browser_action_trace"]["evidenceRefs"]
            .as_array()
            .expect("evidence refs");
        for expected in [
            "browser_network:browser-session-1:browser-action-1",
            "browser_console:browser-session-1:browser-action-1",
            "browser_screenshot:browser-session-1:browser-action-1",
            "browser_dom:browser-session-1:browser-action-1",
            "browser_accessibility:browser-session-1:browser-action-1",
        ] {
            assert!(
                refs.iter().any(|value| value.as_str() == Some(expected)),
                "missing {expected} in {refs:?}",
            );
        }
    }

    #[test]
    fn browser_session_action_trace_preserves_action_required_state() {
        let state = cdp_state("browser-session-1", "task-profile-1");
        let traced = attach_browser_action_trace(
            json!({
                "actionId": "browser-action-risky",
                "requestId": "browser-action-confirmation:browser-action-risky",
                "eventClass": "action.required",
                "failureCategory": "action_required",
                "status": "pending",
                "success": false,
                "controlMode": "human",
                "lifecycleState": "human_controlling",
                "humanReason": "browser_action_requires_confirmation",
                "action_required": {
                    "requestId": "browser-action-confirmation:browser-action-risky",
                    "actionType": "tool_confirmation",
                    "toolName": "browserSession/action/execute"
                }
            }),
            "browser-session-1",
            "click",
            Some(&state),
        );

        let trace = traced
            .get("browser_action_trace")
            .expect("browser action trace");
        assert_eq!(trace["action"], "click");
        assert_eq!(trace["status"], "pending");
        assert_eq!(trace["success"], false);
        assert_eq!(trace["eventClass"], "action.required");
        assert_eq!(trace["failureCategory"], "action_required");
        assert_eq!(
            trace["requestId"],
            "browser-action-confirmation:browser-action-risky"
        );
        assert_eq!(trace["controlMode"], "human");
        assert_eq!(trace["lifecycleState"], "human_controlling");
        assert_eq!(trace["humanReason"], "browser_action_requires_confirmation");
    }

    #[test]
    fn browser_profile_scope_registers_task_owner_once() {
        let runtime = RuntimeCore::default();
        let state = cdp_state("browser-session-1", "task-profile-1");

        runtime.register_browser_profile_scope(&state);
        runtime.register_browser_profile_scope(&state);

        let runtime_state = runtime.state.lock().expect("runtime state");
        assert_eq!(runtime_state.browser_profile_scopes.len(), 1);
        let scope = &runtime_state.browser_profile_scopes[0];
        assert_eq!(scope.profile_key, "task-profile-1");
        assert!(scope.cleanup_on_owner_end);
        assert_eq!(
            scope.owner.as_ref().map(|owner| owner.session_id.as_str()),
            Some("browser-session-1")
        );
    }

    #[test]
    fn browser_profile_cleanup_plan_removes_only_matching_owner_scope() {
        let runtime = RuntimeCore::default();
        runtime.register_browser_profile_scope(&cdp_state("browser-session-1", "task-profile-1"));
        runtime.register_browser_profile_scope(&cdp_state("browser-session-2", "task-profile-2"));

        let plan = runtime.take_browser_profile_cleanup_plan("browser-session-1");

        assert_eq!(plan.profile_keys, vec!["task-profile-1".to_string()]);
        let runtime_state = runtime.state.lock().expect("runtime state");
        assert_eq!(runtime_state.browser_profile_scopes.len(), 1);
        assert_eq!(
            runtime_state.browser_profile_scopes[0].profile_key,
            "task-profile-2"
        );
    }

    fn cdp_state(session_id: &str, profile_key: &str) -> CdpSessionState {
        CdpSessionState {
            session_id: session_id.to_string(),
            profile_key: profile_key.to_string(),
            environment_preset_id: None,
            environment_preset_name: None,
            target_id: "target-1".to_string(),
            target_title: "Example".to_string(),
            target_url: "https://example.test/".to_string(),
            remote_debugging_port: 9222,
            ws_debugger_url: "ws://127.0.0.1/devtools/page/1".to_string(),
            devtools_frontend_url: None,
            stream_mode: None,
            transport_kind: BrowserTransportKind::CdpFrames,
            lifecycle_state: BrowserSessionLifecycleState::Live,
            control_mode: BrowserControlMode::Agent,
            human_reason: None,
            last_page_info: None,
            last_event_at: None,
            last_frame_at: None,
            last_error: None,
            created_at: "2026-06-24T00:00:00Z".to_string(),
            connected: true,
        }
    }
}
