use super::*;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RuntimePermissionConfirmationProjection {
    pub(super) status: &'static str,
    pub(super) request_id: String,
    pub(super) source: &'static str,
    pub(super) note: &'static str,
}

pub(super) fn latest_runtime_permission_confirmation_projection(
    detail: &SessionDetail,
) -> Option<RuntimePermissionConfirmationProjection> {
    detail.items.iter().rev().find_map(|item| {
        let lime_core::database::dao::agent_timeline::AgentThreadItemPayload::RequestUserInput {
            request_id,
            response,
            ..
        } = &item.payload
        else {
            return None;
        };
        if !is_runtime_permission_confirmation_request_id(request_id) {
            return None;
        }

        match item.status {
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::InProgress => {
                Some(RuntimePermissionConfirmationProjection {
                    status: "requested",
                    request_id: request_id.clone(),
                    source: "runtime_action_required",
                    note: "真实权限确认请求正在等待用户处理",
                })
            }
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::Completed => {
                let confirmed =
                    runtime_permission_confirmation_response_confirmed(response.as_ref());
                let (status, note) = match confirmed {
                    Some(false) => ("denied", "真实权限确认请求已拒绝"),
                    Some(true) => ("resolved", "真实权限确认请求已完成"),
                    None => ("requested", "真实权限确认请求缺少响应，继续等待用户处理"),
                };
                Some(RuntimePermissionConfirmationProjection {
                    status,
                    request_id: request_id.clone(),
                    source: "runtime_action_required",
                    note,
                })
            }
            lime_core::database::dao::agent_timeline::AgentThreadItemStatus::Failed => {
                Some(RuntimePermissionConfirmationProjection {
                    status: "denied",
                    request_id: request_id.clone(),
                    source: "runtime_action_required",
                    note: "真实权限确认请求已失败或拒绝",
                })
            }
        }
    })
}

pub(super) fn append_permission_confirmation_note(
    permission_object: &mut serde_json::Map<String, serde_json::Value>,
    note: &str,
) {
    let notes_entry = permission_object
        .entry("notes".to_string())
        .or_insert_with(|| serde_json::Value::Array(Vec::new()));
    if !notes_entry.is_array() {
        *notes_entry = serde_json::Value::Array(Vec::new());
    }
    let Some(notes) = notes_entry.as_array_mut() else {
        return;
    };
    if notes.iter().any(|value| value.as_str() == Some(note)) {
        return;
    }
    notes.push(serde_json::Value::String(note.to_string()));
}

pub(super) fn apply_runtime_permission_confirmation_projection_to_metadata(
    metadata: &mut Option<serde_json::Value>,
    projection: &RuntimePermissionConfirmationProjection,
) -> bool {
    let Some(root) = metadata.as_mut().and_then(serde_json::Value::as_object_mut) else {
        return false;
    };
    let Some(runtime_object) = root
        .get_mut(LIME_RUNTIME_METADATA_KEY)
        .and_then(serde_json::Value::as_object_mut)
    else {
        return false;
    };
    let Some(permission_object) = runtime_object
        .get_mut("permission_state")
        .and_then(serde_json::Value::as_object_mut)
    else {
        return false;
    };
    if permission_object
        .get("status")
        .and_then(serde_json::Value::as_str)
        != Some("requires_confirmation")
    {
        return false;
    }

    permission_object.insert(
        "confirmationStatus".to_string(),
        serde_json::Value::String(projection.status.to_string()),
    );
    permission_object.insert(
        "confirmationRequestId".to_string(),
        serde_json::Value::String(projection.request_id.clone()),
    );
    permission_object.insert(
        "confirmationSource".to_string(),
        serde_json::Value::String(projection.source.to_string()),
    );
    append_permission_confirmation_note(permission_object, projection.note);
    true
}

pub(super) async fn merge_runtime_permission_confirmation_from_session(
    db: &DbConnection,
    session_id: &str,
    request: &mut AsterChatRequest,
) {
    let detail = match AsterAgentWrapper::get_runtime_session_detail(db, session_id).await {
        Ok(detail) => detail,
        Err(error) => {
            tracing::warn!(
                "[AsterAgent] 读取权限确认状态失败，已保持本轮声明态权限摘要: session_id={}, error={}",
                session_id,
                error
            );
            return;
        }
    };
    let Some(projection) = latest_runtime_permission_confirmation_projection(&detail) else {
        return;
    };
    if apply_runtime_permission_confirmation_projection_to_metadata(
        &mut request.metadata,
        &projection,
    ) {
        tracing::info!(
            "[AsterAgent] 已合并真实权限确认状态: session_id={}, request_id={}, status={}",
            session_id,
            projection.request_id,
            projection.status
        );
    }
}

pub(super) fn permission_state_requires_turn_gating(
    permission_state: &lime_agent::SessionExecutionRuntimePermissionState,
) -> bool {
    permission_state.status == "requires_confirmation"
        && permission_state.confirmation_status.as_deref() != Some("resolved")
}

pub(super) fn should_create_runtime_permission_confirmation_request(
    permission_state: &lime_agent::SessionExecutionRuntimePermissionState,
) -> bool {
    permission_state.status == "requires_confirmation"
        && matches!(
            permission_state.confirmation_status.as_deref(),
            None | Some("not_requested")
        )
        && permission_state.confirmation_request_id.is_none()
}

pub(super) fn runtime_permission_confirmation_request_id(turn_id: &str) -> String {
    format!("{RUNTIME_PERMISSION_CONFIRMATION_REQUEST_PREFIX}{turn_id}")
}

pub(super) fn runtime_permission_ask_profile_label(
    permission_state: &lime_agent::SessionExecutionRuntimePermissionState,
) -> String {
    if permission_state.ask_profile_keys.is_empty() {
        return "未记录 askProfileKeys".to_string();
    }

    permission_state.ask_profile_keys.join(", ")
}

pub(super) fn format_permission_turn_gating_error(
    permission_state: &lime_agent::SessionExecutionRuntimePermissionState,
) -> String {
    let confirmation_status = permission_state
        .confirmation_status
        .as_deref()
        .unwrap_or("未记录 confirmationStatus");
    let ask_profile_keys = runtime_permission_ask_profile_label(permission_state);

    format!(
        "运行时权限声明需要真实确认，当前 turn 已在模型执行前等待用户确认：confirmationStatus={confirmation_status}，askProfileKeys={ask_profile_keys}。已创建真实权限确认请求；请确认后重试或恢复本轮执行。"
    )
}

pub(super) fn build_runtime_permission_confirmation_prompt(
    permission_state: &lime_agent::SessionExecutionRuntimePermissionState,
) -> String {
    format!(
        "当前执行需要确认运行时权限：{}。确认后才允许继续模型执行；拒绝会保持阻断。",
        runtime_permission_ask_profile_label(permission_state)
    )
}

pub(super) fn build_runtime_permission_confirmation_questions(
    permission_state: &lime_agent::SessionExecutionRuntimePermissionState,
) -> Vec<lime_core::database::dao::agent_timeline::AgentRequestQuestion> {
    vec![
        lime_core::database::dao::agent_timeline::AgentRequestQuestion {
            header: Some("运行时权限确认".to_string()),
            question: build_runtime_permission_confirmation_prompt(permission_state),
            options: Some(vec![
                lime_core::database::dao::agent_timeline::AgentRequestOption {
                    label: "允许本次执行".to_string(),
                    description: Some("写入 resolved，下一次恢复执行可通过权限门禁。".to_string()),
                },
                lime_core::database::dao::agent_timeline::AgentRequestOption {
                    label: "拒绝".to_string(),
                    description: Some("写入 denied，本次执行需求继续阻断。".to_string()),
                },
            ]),
            multi_select: Some(false),
        },
    ]
}

pub(super) fn build_runtime_permission_confirmation_schema(
    questions: &[lime_core::database::dao::agent_timeline::AgentRequestQuestion],
) -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "properties": {
            "answer": {
                "type": "string",
                "enum": ["允许本次执行", "拒绝"]
            }
        },
        "required": ["answer"],
        "x-lime-ask-user-questions": questions,
    })
}

pub(super) fn maybe_emit_runtime_permission_confirmation_request(
    side_event_host: RuntimeSideEventHostContext<'_>,
    request: &AsterChatRequest,
    thread_id: &str,
    turn_id: &str,
    permission_state: &lime_agent::SessionExecutionRuntimePermissionState,
) {
    if !should_create_runtime_permission_confirmation_request(permission_state) {
        return;
    }

    let request_id = runtime_permission_confirmation_request_id(turn_id);
    let prompt = build_runtime_permission_confirmation_prompt(permission_state);
    let questions = build_runtime_permission_confirmation_questions(permission_state);
    if let Err(error) = side_event_host.record_request_user_input(
        request_id.clone(),
        "elicitation".to_string(),
        Some(prompt.clone()),
        Some(questions.clone()),
    ) {
        tracing::warn!(
            "[AsterAgent] 记录权限确认请求失败（已降级只发送 action_required）: {}",
            error
        );
    }

    side_event_host.emit_side_event(RuntimeAgentEvent::ActionRequired {
        request_id,
        action_type: "elicitation".to_string(),
        data: serde_json::json!({
            "request_id": runtime_permission_confirmation_request_id(turn_id),
            "action_type": "elicitation",
            "prompt": prompt,
            "questions": questions,
            "requested_schema": build_runtime_permission_confirmation_schema(&questions),
            "permission_state": permission_state,
            "source": "runtime_permission_confirmation",
        }),
        scope: Some(lime_agent::AgentActionRequiredScope {
            session_id: Some(request.session_id.clone()),
            thread_id: Some(thread_id.to_string()),
            turn_id: Some(turn_id.to_string()),
        }),
    });
}

pub(super) fn build_runtime_permission_review_status_from_state(
    permission_state: &lime_agent::SessionExecutionRuntimePermissionState,
) -> Option<AgentRuntimeStatus> {
    if permission_state.status != "requires_confirmation" {
        return None;
    }

    let mut metadata = build_diagnostics_runtime_status_metadata();
    metadata.insert(
        "permission_status".to_string(),
        serde_json::Value::String(permission_state.status.clone()),
    );
    metadata.insert(
        "required_profile_keys".to_string(),
        serde_json::to_value(&permission_state.required_profile_keys)
            .unwrap_or_else(|_| serde_json::Value::Array(Vec::new())),
    );
    metadata.insert(
        "ask_profile_keys".to_string(),
        serde_json::to_value(&permission_state.ask_profile_keys)
            .unwrap_or_else(|_| serde_json::Value::Array(Vec::new())),
    );
    metadata.insert(
        "blocking_profile_keys".to_string(),
        serde_json::to_value(&permission_state.blocking_profile_keys)
            .unwrap_or_else(|_| serde_json::Value::Array(Vec::new())),
    );
    metadata.insert(
        "decision_source".to_string(),
        serde_json::Value::String(permission_state.decision_source.clone()),
    );
    metadata.insert(
        "decision_scope".to_string(),
        serde_json::Value::String(permission_state.decision_scope.clone()),
    );
    if let Some(confirmation_status) = permission_state.confirmation_status.as_ref() {
        metadata.insert(
            "confirmation_status".to_string(),
            serde_json::Value::String(confirmation_status.clone()),
        );
    }
    if let Some(confirmation_request_id) = permission_state.confirmation_request_id.as_ref() {
        metadata.insert(
            "confirmation_request_id".to_string(),
            serde_json::Value::String(confirmation_request_id.clone()),
        );
    }
    if let Some(confirmation_source) = permission_state.confirmation_source.as_ref() {
        metadata.insert(
            "confirmation_source".to_string(),
            serde_json::Value::String(confirmation_source.clone()),
        );
    }
    let declared_only = permission_state.confirmation_request_id.is_none()
        && permission_state.confirmation_source.as_deref() != Some("runtime_action_required");
    metadata.insert(
        "declared_only".to_string(),
        serde_json::Value::Bool(declared_only),
    );
    let turn_gating = permission_state_requires_turn_gating(permission_state);
    metadata.insert(
        "turn_gating".to_string(),
        serde_json::Value::Bool(turn_gating),
    );

    let ask_count = permission_state.ask_profile_keys.len();
    let required_count = permission_state.required_profile_keys.len();
    let confirmation_status = permission_state
        .confirmation_status
        .as_deref()
        .unwrap_or("未记录 confirmationStatus");
    let detail = if turn_gating {
        format!(
            "当前执行画像声明了 {required_count} 项权限，其中 {ask_count} 项需要确认；confirmationStatus={confirmation_status} 尚未 resolved，本轮会在模型执行前阻断。"
        )
    } else {
        format!(
            "当前执行画像声明了 {required_count} 项权限，其中 {ask_count} 项需要确认；confirmationStatus=resolved，允许继续模型执行。"
        )
    };
    let checkpoints = if turn_gating {
        vec![
            "权限需求来自 modality execution profile".to_string(),
            "未解决权限确认会在 prelude 后、模型执行前阻断本轮 turn".to_string(),
            "本事件不代表 ApprovalRequest 已创建；只有 confirmationStatus=resolved 才允许继续"
                .to_string(),
        ]
    } else {
        vec![
            "权限需求来自 modality execution profile".to_string(),
            "已记录 resolved 权限确认，本轮允许继续执行".to_string(),
            "本事件仍只投影确认状态，不伪造新的 ApprovalRequest".to_string(),
        ]
    };
    Some(AgentRuntimeStatus {
        phase: "permission_review".to_string(),
        title: "运行时权限需要确认".to_string(),
        detail,
        checkpoints,
        metadata: Some(metadata),
    })
}
