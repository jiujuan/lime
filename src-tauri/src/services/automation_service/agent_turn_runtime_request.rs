//! 自动化 AgentTurn 到标准 runtime turn 请求的组包边界。

use super::AutomationJobRecord;
use crate::commands::aster_agent_cmd::{AsterChatRequest, ConfigureProviderRequest};
use chrono::Utc;
use serde_json::{Map, Value};

#[derive(Debug)]
pub(super) struct AgentTurnRuntimeRequest {
    pub request: AsterChatRequest,
    pub access_mode: lime_agent::SessionExecutionRuntimeAccessMode,
}

pub(super) fn build_agent_turn_runtime_request(
    job: &AutomationJobRecord,
    session_id: &str,
    prompt: String,
    system_prompt: Option<String>,
    web_search: bool,
    approval_policy: Option<String>,
    sandbox_policy: Option<String>,
    provider_config: Option<ConfigureProviderRequest>,
    provider_preference: Option<String>,
    model_preference: Option<String>,
    request_metadata: Option<Value>,
    content_id: Option<String>,
) -> Result<AgentTurnRuntimeRequest, String> {
    let access_mode = resolve_agent_turn_access_mode_from_payload(
        approval_policy.as_deref(),
        sandbox_policy.as_deref(),
        request_metadata.as_ref(),
    )?;
    let event_name = format!("automation:agent:{}:{}", job.id, Utc::now().timestamp());

    Ok(AgentTurnRuntimeRequest {
        request: AsterChatRequest {
            message: build_prompt(job, &prompt, web_search),
            session_id: session_id.to_string(),
            event_name,
            images: None,
            provider_config,
            provider_preference,
            model_preference,
            reasoning_effort: None,
            thinking_enabled: None,
            approval_policy: Some(access_mode.approval_policy().to_string()),
            sandbox_policy: Some(access_mode.sandbox_policy().to_string()),
            project_id: None,
            workspace_id: job.workspace_id.clone(),
            web_search: Some(web_search),
            search_mode: None,
            execution_strategy: None,
            auto_continue: None,
            system_prompt,
            metadata: normalize_agent_turn_request_metadata(request_metadata, content_id),
            turn_id: None,
            queue_if_busy: Some(false),
            queued_turn_id: None,
        },
        access_mode,
    })
}

fn build_prompt(job: &AutomationJobRecord, prompt: &str, web_search: bool) -> String {
    let mut sections = vec![
        "你是一个自动化任务执行助手。".to_string(),
        format!("任务名称：{}", job.name),
        format!("任务描述：{}", job.description.clone().unwrap_or_default()),
        format!("工作区 ID：{}", job.workspace_id),
    ];
    if web_search {
        sections.push("允许按需使用 WebSearch。".to_string());
    }
    sections.push("请执行以下自动化任务：".to_string());
    sections.push(prompt.trim().to_string());
    sections.join("\n\n")
}

fn extract_access_mode_text(request_metadata: Option<&Value>) -> Option<&str> {
    let root = request_metadata?.as_object()?;
    let harness = root.get("harness").and_then(Value::as_object);

    harness
        .and_then(|value| value.get("access_mode").and_then(Value::as_str))
        .or_else(|| harness.and_then(|value| value.get("accessMode").and_then(Value::as_str)))
        .or_else(|| root.get("access_mode").and_then(Value::as_str))
        .or_else(|| root.get("accessMode").and_then(Value::as_str))
}

pub(super) fn resolve_agent_turn_access_mode_from_payload(
    approval_policy: Option<&str>,
    sandbox_policy: Option<&str>,
    request_metadata: Option<&Value>,
) -> Result<lime_agent::SessionExecutionRuntimeAccessMode, String> {
    if approval_policy.is_some() || sandbox_policy.is_some() {
        return match (approval_policy.map(str::trim), sandbox_policy.map(str::trim)) {
            (Some("on-request"), Some("read-only")) | (None, Some("read-only")) => {
                Ok(lime_agent::SessionExecutionRuntimeAccessMode::ReadOnly)
            }
            (Some("on-request"), Some("workspace-write"))
            | (None, Some("workspace-write")) => {
                Ok(lime_agent::SessionExecutionRuntimeAccessMode::Current)
            }
            (Some("never"), Some("danger-full-access"))
            | (None, Some("danger-full-access")) => {
                Ok(lime_agent::SessionExecutionRuntimeAccessMode::FullAccess)
            }
            _ => Err(
                "自动化任务 approval_policy/sandbox_policy 仅支持 read-only/current/full-access 对应的正式策略组合"
                    .to_string(),
            ),
        };
    }

    Ok(
        lime_agent::SessionExecutionRuntimeAccessMode::from_access_mode_text(
            extract_access_mode_text(request_metadata),
        )
        .unwrap_or_else(lime_agent::SessionExecutionRuntimeAccessMode::default_for_session),
    )
}

fn normalize_agent_turn_request_metadata(
    request_metadata: Option<Value>,
    content_id: Option<String>,
) -> Option<Value> {
    let normalized_content_id = content_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    if request_metadata.is_none() && normalized_content_id.is_none() {
        return None;
    }

    let mut root = match request_metadata {
        Some(Value::Object(object)) => object,
        Some(other) => {
            let mut object = Map::new();
            object.insert("request_metadata".to_string(), other);
            object
        }
        None => Map::new(),
    };

    if let Some(content_id) = normalized_content_id {
        let harness_entry = root
            .entry("harness".to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        if !harness_entry.is_object() {
            *harness_entry = Value::Object(Map::new());
        }
        if let Some(harness) = harness_entry.as_object_mut() {
            harness.insert("content_id".to_string(), Value::String(content_id));
        }
    }

    Some(Value::Object(root))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::aster_agent_cmd::AsterChatRequest;
    use lime_core::config::{AutomationExecutionMode, DeliveryConfig, TaskSchedule};
    use serde_json::json;

    fn sample_job() -> AutomationJobRecord {
        let now = Utc::now().to_rfc3339();
        AutomationJobRecord {
            id: "job-daily-report".to_string(),
            name: "每日趋势摘要".to_string(),
            description: Some("每天生成 Markdown 趋势摘要".to_string()),
            enabled: true,
            workspace_id: "workspace-1".to_string(),
            execution_mode: AutomationExecutionMode::Skill,
            schedule: TaskSchedule::Every { every_secs: 300 },
            payload: json!({"kind": "agent_turn", "prompt": "生成 Markdown 趋势摘要"}),
            delivery: DeliveryConfig::default(),
            timeout_secs: None,
            max_retries: 2,
            next_run_at: None,
            last_status: None,
            last_error: None,
            last_run_at: None,
            last_finished_at: None,
            running_started_at: None,
            consecutive_failures: 0,
            last_retry_count: 0,
            auto_disabled_until: None,
            last_delivery: None,
            created_at: now.clone(),
            updated_at: now,
        }
    }

    #[test]
    fn agent_turn_runtime_request_should_materialize_app_server_host_options_payload() {
        let built = build_agent_turn_runtime_request(
            &sample_job(),
            "session-1",
            "生成 Markdown 趋势摘要".to_string(),
            Some("只输出 Markdown".to_string()),
            false,
            None,
            None,
            None,
            None,
            None,
            Some(json!({
                "harness": {
                    "access_mode": "current",
                    "managed_objective": {
                        "objective_id": "objective-1",
                        "continuation_policy": {
                            "dispatch": "agent_runtime_submit_turn"
                        }
                    }
                },
                "artifact": {
                    "artifact_kind": "report"
                }
            })),
            Some("content-1".to_string()),
        )
        .expect("build runtime request");

        assert_eq!(
            built.access_mode,
            lime_agent::SessionExecutionRuntimeAccessMode::Current
        );

        let host_options =
            serde_json::to_value(&built.request).expect("serialize app server host options");
        let payload: AsterChatRequest =
            serde_json::from_value(host_options).expect("deserialize host options payload");

        assert_eq!(payload.session_id, "session-1");
        assert_eq!(payload.workspace_id, "workspace-1");
        assert_eq!(payload.queue_if_busy, Some(false));
        assert!(payload.auto_continue.is_none());
        assert!(payload.queued_turn_id.is_none());
        assert!(payload.turn_id.is_none());
        assert!(payload.message.contains("任务名称：每日趋势摘要"));
        assert!(payload.message.contains("生成 Markdown 趋势摘要"));
        assert_eq!(payload.system_prompt.as_deref(), Some("只输出 Markdown"));
        assert_eq!(payload.approval_policy.as_deref(), Some("on-request"));
        assert_eq!(payload.sandbox_policy.as_deref(), Some("workspace-write"));
        assert_eq!(payload.web_search, Some(false));
        assert!(payload.provider_config.is_none());
        assert!(payload.provider_preference.is_none());
        assert!(payload.model_preference.is_none());
        assert_eq!(
            payload
                .metadata
                .as_ref()
                .and_then(|value| value
                    .pointer("/harness/managed_objective/continuation_policy/dispatch"))
                .and_then(Value::as_str),
            Some("agent_runtime_submit_turn")
        );
        assert_eq!(
            payload
                .metadata
                .as_ref()
                .and_then(|value| value.pointer("/harness/content_id"))
                .and_then(Value::as_str),
            Some("content-1")
        );
    }

    #[test]
    fn agent_turn_runtime_request_should_forward_explicit_provider_config_without_preferences() {
        let built = build_agent_turn_runtime_request(
            &sample_job(),
            "session-fixture",
            "生成 Markdown 趋势摘要".to_string(),
            None,
            false,
            None,
            None,
            Some(ConfigureProviderRequest {
                provider_id: Some("fixture-openai".to_string()),
                provider_name: "openai".to_string(),
                model_name: "lime-fixture-chat".to_string(),
                api_key: Some("fixture-key".to_string()),
                base_url: Some("http://127.0.0.1:12345".to_string()),
                model_capabilities: None,
                tool_call_strategy: None,
                toolshim_model: None,
            }),
            None,
            None,
            None,
            None,
        )
        .expect("build runtime request");

        let host_options =
            serde_json::to_value(&built.request).expect("serialize app server host options");
        let payload: AsterChatRequest =
            serde_json::from_value(host_options).expect("deserialize host options payload");
        let provider_config = payload
            .provider_config
            .expect("fixture provider_config should be forwarded");

        assert_eq!(
            provider_config.provider_id.as_deref(),
            Some("fixture-openai")
        );
        assert_eq!(provider_config.provider_name, "openai");
        assert_eq!(provider_config.model_name, "lime-fixture-chat");
        assert_eq!(provider_config.api_key.as_deref(), Some("fixture-key"));
        assert_eq!(
            provider_config.base_url.as_deref(),
            Some("http://127.0.0.1:12345")
        );
        assert!(payload.provider_preference.is_none());
        assert!(payload.model_preference.is_none());
    }

    #[test]
    fn normalize_agent_turn_request_metadata_should_attach_content_id_to_harness() {
        let normalized = normalize_agent_turn_request_metadata(
            Some(json!({
                "artifact": {
                    "artifact_mode": "draft",
                    "artifact_kind": "analysis"
                }
            })),
            Some("content-1".to_string()),
        )
        .expect("normalized metadata");

        assert_eq!(
            normalized
                .pointer("/harness/content_id")
                .and_then(Value::as_str),
            Some("content-1")
        );
        assert_eq!(
            normalized
                .pointer("/artifact/artifact_kind")
                .and_then(Value::as_str),
            Some("analysis")
        );
    }

    #[test]
    fn normalize_agent_turn_request_metadata_should_create_minimal_harness_when_only_content_id_exists(
    ) {
        let normalized = normalize_agent_turn_request_metadata(None, Some("content-2".to_string()))
            .expect("normalized metadata");

        assert_eq!(
            normalized
                .pointer("/harness/content_id")
                .and_then(Value::as_str),
            Some("content-2")
        );
    }

    #[test]
    fn resolve_agent_turn_access_mode_prefers_formal_policies_over_legacy_metadata() {
        assert_eq!(
            resolve_agent_turn_access_mode_from_payload(
                Some("never"),
                Some("danger-full-access"),
                Some(&json!({
                    "harness": {
                        "access_mode": "read-only"
                    }
                })),
            )
            .expect("resolved access mode"),
            lime_agent::SessionExecutionRuntimeAccessMode::FullAccess
        );
    }

    #[test]
    fn resolve_agent_turn_access_mode_prefers_explicit_harness_value_when_formal_policies_missing()
    {
        assert_eq!(
            resolve_agent_turn_access_mode_from_payload(
                None,
                None,
                Some(&json!({
                    "harness": {
                        "access_mode": "read-only"
                    }
                })),
            )
            .expect("resolved access mode"),
            lime_agent::SessionExecutionRuntimeAccessMode::ReadOnly
        );
    }

    #[test]
    fn resolve_agent_turn_access_mode_defaults_to_full_access() {
        assert_eq!(
            resolve_agent_turn_access_mode_from_payload(None, None, None)
                .expect("resolved access mode"),
            lime_agent::SessionExecutionRuntimeAccessMode::FullAccess
        );
    }

    #[test]
    fn resolve_agent_turn_access_mode_rejects_invalid_formal_policy_pair() {
        assert_eq!(
            resolve_agent_turn_access_mode_from_payload(
                Some("never"),
                Some("workspace-write"),
                None,
            ),
            Err(
                "自动化任务 approval_policy/sandbox_policy 仅支持 read-only/current/full-access 对应的正式策略组合"
                    .to_string()
            )
        );
    }
}
