use super::*;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::commands::aster_agent_cmd::runtime_turn) struct RuntimeUserLockCapabilityProjection {
    pub(in crate::commands::aster_agent_cmd::runtime_turn) status: &'static str,
    pub(in crate::commands::aster_agent_cmd::runtime_turn) request_id: String,
    pub(in crate::commands::aster_agent_cmd::runtime_turn) source: &'static str,
    pub(in crate::commands::aster_agent_cmd::runtime_turn) note: &'static str,
}

fn runtime_user_lock_capability_text_is_denial(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return false;
    }
    let normalized = trimmed.to_ascii_lowercase();
    matches!(
        normalized.as_str(),
        "deny" | "denied" | "reject" | "rejected" | "no" | "false"
    ) || trimmed.contains("拒绝")
        || trimmed.contains("不允许")
        || trimmed.contains("保持锁定")
        || trimmed.contains("停止")
}

fn runtime_user_lock_capability_value_is_denial(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::Bool(value) => !*value,
        serde_json::Value::String(value) => {
            if runtime_user_lock_capability_text_is_denial(value) {
                return true;
            }
            serde_json::from_str::<serde_json::Value>(value)
                .ok()
                .is_some_and(|parsed| runtime_user_lock_capability_value_is_denial(&parsed))
        }
        serde_json::Value::Array(values) => values
            .iter()
            .any(runtime_user_lock_capability_value_is_denial),
        serde_json::Value::Object(object) => object
            .get("answer")
            .or_else(|| object.get("decision"))
            .or_else(|| object.get("confirmed"))
            .or_else(|| object.get("approved"))
            .is_some_and(runtime_user_lock_capability_value_is_denial),
        _ => false,
    }
}

pub(in crate::commands::aster_agent_cmd::runtime_turn) fn runtime_user_lock_capability_response_confirmed(
    response: Option<&serde_json::Value>,
) -> Option<bool> {
    let response = response?;
    match response {
        serde_json::Value::Bool(value) => Some(*value),
        serde_json::Value::Object(object) => {
            let explicit = object
                .get("confirmed")
                .and_then(serde_json::Value::as_bool)
                .or_else(|| object.get("approved").and_then(serde_json::Value::as_bool));
            if explicit == Some(false) {
                return Some(false);
            }
            let answer_denied = object
                .get("userData")
                .or_else(|| object.get("response"))
                .is_some_and(runtime_user_lock_capability_value_is_denial);
            if answer_denied {
                return Some(false);
            }
            explicit
        }
        _ => None,
    }
}

fn latest_runtime_user_lock_capability_projection(
    detail: &SessionDetail,
) -> Option<RuntimeUserLockCapabilityProjection> {
    detail.items.iter().rev().find_map(|item| {
        let lime_core::database::dao::agent_timeline::AgentThreadItemPayload::RequestUserInput {
            request_id,
            response,
            ..
        } = &item.payload
        else {
            return None;
        };
        if !is_runtime_user_lock_capability_request_id(request_id) {
            return None;
        }

        match item.status {
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::InProgress => {
                Some(RuntimeUserLockCapabilityProjection {
                    status: "requested",
                    request_id: request_id.clone(),
                    source: "runtime_action_required",
                    note: "模型锁定能力确认请求正在等待用户处理",
                })
            }
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::Completed => {
                let confirmed = runtime_user_lock_capability_response_confirmed(response.as_ref());
                let (status, note) = match confirmed {
                    Some(false) => ("denied", "用户选择保持显式模型锁定，继续阻断"),
                    Some(true) => ("resolved", "用户允许取消本轮显式模型锁定并重新走模型解析"),
                    None => (
                        "requested",
                        "模型锁定能力确认请求缺少响应，继续等待用户处理",
                    ),
                };
                Some(RuntimeUserLockCapabilityProjection {
                    status,
                    request_id: request_id.clone(),
                    source: "runtime_action_required",
                    note,
                })
            }
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::Failed => {
                Some(RuntimeUserLockCapabilityProjection {
                    status: "denied",
                    request_id: request_id.clone(),
                    source: "runtime_action_required",
                    note: "模型锁定能力确认请求已失败，继续阻断",
                })
            }
        }
    })
}

fn ensure_lime_runtime_metadata_object(
    metadata: &mut Option<serde_json::Value>,
) -> &mut serde_json::Map<String, serde_json::Value> {
    let root = metadata.get_or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    if !root.is_object() {
        *root = serde_json::Value::Object(serde_json::Map::new());
    }
    let root_object = root
        .as_object_mut()
        .expect("runtime request metadata should be an object");
    let runtime_entry = root_object
        .entry(LIME_RUNTIME_METADATA_KEY.to_string())
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    if !runtime_entry.is_object() {
        *runtime_entry = serde_json::Value::Object(serde_json::Map::new());
    }
    runtime_entry
        .as_object_mut()
        .expect("lime_runtime metadata should be an object")
}

fn runtime_user_lock_capability_projection_matches_request(
    request: &AsterChatRequest,
    projection: &RuntimeUserLockCapabilityProjection,
) -> bool {
    if let Some(turn_id) = request.turn_id.as_deref() {
        if runtime_user_lock_capability_request_id(turn_id) == projection.request_id {
            return true;
        }
    }

    extract_runtime_user_lock_capability_recovery_request_id(request.metadata.as_ref()).as_deref()
        == Some(projection.request_id.as_str())
}

fn extract_runtime_user_lock_capability_recovery_request_id(
    request_metadata: Option<&serde_json::Value>,
) -> Option<String> {
    let root = request_metadata?.as_object()?;
    let runtime = root.get(LIME_RUNTIME_METADATA_KEY)?.as_object()?;
    let recovery = runtime
        .get("user_lock_capability_recovery")
        .or_else(|| runtime.get("userLockCapabilityRecovery"))?
        .as_object()?;
    recovery
        .get("requestId")
        .or_else(|| recovery.get("request_id"))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
}

pub(super) fn runtime_user_lock_capability_recovery_status_for_request(
    request_metadata: Option<&serde_json::Value>,
    request_id: &str,
) -> Option<String> {
    let root = request_metadata?.as_object()?;
    let runtime = root.get(LIME_RUNTIME_METADATA_KEY)?.as_object()?;
    let recovery = runtime
        .get("user_lock_capability_recovery")
        .or_else(|| runtime.get("userLockCapabilityRecovery"))?
        .as_object()?;
    let recovery_request_id = recovery
        .get("requestId")
        .or_else(|| recovery.get("request_id"))
        .and_then(serde_json::Value::as_str)?;
    if recovery_request_id != request_id {
        return None;
    }
    recovery
        .get("status")
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
}

pub(in crate::commands::aster_agent_cmd::runtime_turn) fn apply_runtime_user_lock_capability_projection_to_request(
    request: &mut AsterChatRequest,
    projection: &RuntimeUserLockCapabilityProjection,
) -> bool {
    if !runtime_user_lock_capability_projection_matches_request(request, projection) {
        return false;
    }

    let original_provider_preference = request.provider_preference.clone();
    let original_model_preference = request.model_preference.clone();
    let should_release_lock = projection.status == "resolved"
        && (original_provider_preference.is_some() || original_model_preference.is_some());
    if projection.status == "resolved" {
        request.provider_preference = None;
        request.model_preference = None;
    }

    let mut recovery = serde_json::Map::new();
    recovery.insert(
        "status".to_string(),
        serde_json::Value::String(projection.status.to_string()),
    );
    recovery.insert(
        "requestId".to_string(),
        serde_json::Value::String(projection.request_id.clone()),
    );
    recovery.insert(
        "source".to_string(),
        serde_json::Value::String(projection.source.to_string()),
    );
    recovery.insert(
        "action".to_string(),
        serde_json::Value::String(if projection.status == "resolved" {
            "release_explicit_model_lock".to_string()
        } else {
            "keep_explicit_model_lock".to_string()
        }),
    );
    recovery.insert(
        "note".to_string(),
        serde_json::Value::String(projection.note.to_string()),
    );
    recovery.insert(
        "releasedExplicitModelLock".to_string(),
        serde_json::Value::Bool(should_release_lock),
    );
    if let Some(provider) = original_provider_preference {
        recovery.insert(
            "originalProviderPreference".to_string(),
            serde_json::Value::String(provider),
        );
    }
    if let Some(model) = original_model_preference {
        recovery.insert(
            "originalModelPreference".to_string(),
            serde_json::Value::String(model),
        );
    }

    let runtime_object = ensure_lime_runtime_metadata_object(&mut request.metadata);
    runtime_object.insert(
        "user_lock_capability_recovery".to_string(),
        serde_json::Value::Object(recovery),
    );
    true
}

pub(in crate::commands::aster_agent_cmd::runtime_turn) async fn merge_runtime_user_lock_capability_recovery_from_session(
    db: &DbConnection,
    session_id: &str,
    request: &mut AsterChatRequest,
) {
    let detail = match AsterAgentWrapper::get_runtime_session_detail(db, session_id).await {
        Ok(detail) => detail,
        Err(error) => {
            tracing::warn!(
                "[AsterAgent] 读取模型锁定能力恢复状态失败，已保持本轮显式模型偏好: session_id={}, error={}",
                session_id,
                error
            );
            return;
        }
    };
    let Some(projection) = latest_runtime_user_lock_capability_projection(&detail) else {
        return;
    };
    if apply_runtime_user_lock_capability_projection_to_request(request, &projection) {
        tracing::info!(
            "[AsterAgent] 已合并模型锁定能力恢复状态: session_id={}, request_id={}, status={}",
            session_id,
            projection.request_id,
            projection.status
        );
    }
}
