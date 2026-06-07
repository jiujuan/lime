use super::*;

#[path = "request_resolution_user_lock/recovery.rs"]
mod recovery;

pub(super) use self::recovery::merge_runtime_user_lock_capability_recovery_from_session;
use self::recovery::runtime_user_lock_capability_recovery_status_for_request;
#[cfg(test)]
pub(super) use self::recovery::{
    apply_runtime_user_lock_capability_projection_to_request,
    runtime_user_lock_capability_response_confirmed, RuntimeUserLockCapabilityProjection,
};

pub(super) fn limit_state_requires_user_lock_capability_gating(
    limit_state: &lime_agent::SessionExecutionRuntimeLimitState,
) -> bool {
    limit_state.status == "user_locked_capability_gap" && limit_state.capability_gap.is_some()
}

pub(super) fn format_user_lock_capability_gating_error(
    limit_state: &lime_agent::SessionExecutionRuntimeLimitState,
    routing_decision: Option<&lime_agent::SessionExecutionRuntimeRoutingDecision>,
    task_profile: Option<&lime_agent::SessionExecutionRuntimeTaskProfile>,
) -> String {
    let gap = limit_state
        .capability_gap
        .as_deref()
        .unwrap_or("unknown_capability_gap");
    let model = routing_decision
        .and_then(|decision| decision.selected_model.as_deref())
        .unwrap_or("未记录 selectedModel");
    let requested_model = routing_decision
        .and_then(|decision| decision.requested_model.as_deref())
        .unwrap_or(model);
    let routing_slot = task_profile
        .and_then(|profile| profile.routing_slot.as_deref())
        .unwrap_or("未记录 routingSlot");
    format!(
        "显式用户模型锁定不满足当前执行画像，已在模型执行前阻断：requestedModel={requested_model}，selectedModel={model}，routingSlot={routing_slot}，capabilityGap={gap}。请切换到满足该 routing slot 的模型，或移除本轮显式模型锁定后重试。"
    )
}

pub(super) fn build_runtime_user_lock_capability_status_from_state(
    limit_state: &lime_agent::SessionExecutionRuntimeLimitState,
) -> Option<AgentRuntimeStatus> {
    if !limit_state_requires_user_lock_capability_gating(limit_state) {
        return None;
    }

    let gap = limit_state
        .capability_gap
        .as_deref()
        .unwrap_or("unknown_capability_gap");
    let mut metadata = build_diagnostics_runtime_status_metadata();
    metadata.insert(
        "limit_status".to_string(),
        serde_json::Value::String(limit_state.status.clone()),
    );
    metadata.insert(
        "capability_gap".to_string(),
        serde_json::Value::String(gap.to_string()),
    );
    metadata.insert("turn_gating".to_string(), serde_json::Value::Bool(true));
    Some(AgentRuntimeStatus {
        phase: "routing".to_string(),
        title: "显式模型锁定能力不匹配".to_string(),
        detail: format!("当前用户锁定模型缺少执行画像要求的能力：{gap}；本轮会在模型执行前阻断。"),
        checkpoints: vec![
            "能力缺口来自 routing slot 与模型目录匹配结果".to_string(),
            "显式用户锁定不会被自动重选覆盖".to_string(),
            "请切换模型或取消本轮显式模型锁定后重试".to_string(),
        ],
        metadata: Some(metadata),
    })
}

pub(super) fn should_create_runtime_user_lock_capability_request(
    limit_state: &lime_agent::SessionExecutionRuntimeLimitState,
    request_metadata: Option<&serde_json::Value>,
    turn_id: &str,
) -> bool {
    if !limit_state_requires_user_lock_capability_gating(limit_state) {
        return false;
    }

    let request_id = runtime_user_lock_capability_request_id(turn_id);
    !matches!(
        runtime_user_lock_capability_recovery_status_for_request(request_metadata, &request_id,)
            .as_deref(),
        Some("requested" | "denied" | "resolved")
    )
}

pub(super) fn runtime_user_lock_capability_request_id(turn_id: &str) -> String {
    format!("{RUNTIME_USER_LOCK_CAPABILITY_REQUEST_PREFIX}{turn_id}")
}

pub(super) fn runtime_user_lock_capability_gap_label(
    limit_state: &lime_agent::SessionExecutionRuntimeLimitState,
) -> String {
    limit_state
        .capability_gap
        .as_deref()
        .unwrap_or("unknown_capability_gap")
        .to_string()
}

pub(super) fn build_runtime_user_lock_capability_prompt(
    limit_state: &lime_agent::SessionExecutionRuntimeLimitState,
    routing_decision: Option<&lime_agent::SessionExecutionRuntimeRoutingDecision>,
    task_profile: Option<&lime_agent::SessionExecutionRuntimeTaskProfile>,
) -> String {
    let gap = runtime_user_lock_capability_gap_label(limit_state);
    let requested_model = routing_decision
        .and_then(|decision| decision.requested_model.as_deref())
        .or_else(|| routing_decision.and_then(|decision| decision.selected_model.as_deref()))
        .unwrap_or("未记录 requestedModel");
    let routing_slot = task_profile
        .and_then(|profile| profile.routing_slot.as_deref())
        .unwrap_or("未记录 routingSlot");
    format!(
        "当前显式锁定模型 {requested_model} 不满足执行画像 {routing_slot} 的能力要求：{gap}。允许取消本轮显式模型锁定后，下一次恢复会重新走模型解析；保持锁定则继续阻断。"
    )
}

pub(super) fn build_runtime_user_lock_capability_questions(
    limit_state: &lime_agent::SessionExecutionRuntimeLimitState,
    routing_decision: Option<&lime_agent::SessionExecutionRuntimeRoutingDecision>,
    task_profile: Option<&lime_agent::SessionExecutionRuntimeTaskProfile>,
) -> Vec<lime_core::database::dao::agent_timeline::AgentRequestQuestion> {
    vec![lime_core::database::dao::agent_timeline::AgentRequestQuestion {
        header: Some("模型锁定能力确认".to_string()),
        question: build_runtime_user_lock_capability_prompt(
            limit_state,
            routing_decision,
            task_profile,
        ),
        options: Some(vec![
            lime_core::database::dao::agent_timeline::AgentRequestOption {
                label: "取消本轮显式模型锁定并重试".to_string(),
                description: Some(
                    "写入 resolved；下一次同 turn 恢复会释放 provider/model 显式偏好并重新解析模型。"
                        .to_string(),
                ),
            },
            lime_core::database::dao::agent_timeline::AgentRequestOption {
                label: "保持锁定并停止".to_string(),
                description: Some("写入 denied；显式模型锁定能力缺口继续阻断。".to_string()),
            },
        ]),
        multi_select: Some(false),
    }]
}

pub(super) fn build_runtime_user_lock_capability_schema(
    questions: &[lime_core::database::dao::agent_timeline::AgentRequestQuestion],
) -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "answer": {
                "type": "string",
                "enum": ["取消本轮显式模型锁定并重试", "保持锁定并停止"]
            }
        },
        "required": ["answer"],
        "x-lime-ask-user-questions": questions,
    })
}

#[allow(clippy::too_many_arguments)]
pub(super) fn maybe_emit_runtime_user_lock_capability_request(
    side_event_host: RuntimeSideEventHostContext<'_>,
    request: &AsterChatRequest,
    thread_id: &str,
    turn_id: &str,
    limit_state: &lime_agent::SessionExecutionRuntimeLimitState,
    routing_decision: Option<&lime_agent::SessionExecutionRuntimeRoutingDecision>,
    task_profile: Option<&lime_agent::SessionExecutionRuntimeTaskProfile>,
) {
    if !should_create_runtime_user_lock_capability_request(
        limit_state,
        request.metadata.as_ref(),
        turn_id,
    ) {
        return;
    }

    let request_id = runtime_user_lock_capability_request_id(turn_id);
    let prompt =
        build_runtime_user_lock_capability_prompt(limit_state, routing_decision, task_profile);
    let questions =
        build_runtime_user_lock_capability_questions(limit_state, routing_decision, task_profile);
    if let Err(error) = side_event_host.record_request_user_input(
        request_id.clone(),
        "elicitation".to_string(),
        Some(prompt.clone()),
        Some(questions.clone()),
    ) {
        tracing::warn!(
            "[AsterAgent] 记录模型锁定能力确认请求失败（已降级只发送 action_required）: {}",
            error
        );
    }

    side_event_host.emit_side_event(RuntimeAgentEvent::ActionRequired {
        request_id,
        action_type: "elicitation".to_string(),
        data: serde_json::json!({
            "request_id": runtime_user_lock_capability_request_id(turn_id),
            "action_type": "elicitation",
            "prompt": prompt,
            "questions": questions,
            "requested_schema": build_runtime_user_lock_capability_schema(&questions),
            "limit_state": limit_state,
            "routing_decision": routing_decision,
            "task_profile": task_profile,
            "source": "runtime_user_lock_capability_confirmation",
        }),
        scope: Some(lime_agent::AgentActionRequiredScope {
            session_id: Some(request.session_id.clone()),
            thread_id: Some(thread_id.to_string()),
            turn_id: Some(turn_id.to_string()),
        }),
    });
}
