use crate::aster_runtime_projection::project_aster_runtime_event;
use crate::protocol::{
    build_diagnostics_runtime_status_metadata, AgentEvent as RuntimeAgentEvent, AgentRuntimeStatus,
};
use crate::session_config_adapter::to_aster_session_config;
use crate::session_configuration::AgentSessionConfig;
use crate::turn_context_configuration::AgentTurnContext;
use aster::agents::Agent;

pub(crate) fn build_empty_reply_retry_runtime_status() -> AgentRuntimeStatus {
    AgentRuntimeStatus {
        phase: "retrying".to_string(),
        title: "正在重试生成答复".to_string(),
        detail: "模型上一轮没有输出任何内容，正在基于当前上下文补发最终答复，不重复执行工具。"
            .to_string(),
        checkpoints: vec![
            "首轮流式回复未产出正文".to_string(),
            "当前轮次未检测到真实工具产物".to_string(),
            "正在直接补发最终答复".to_string(),
        ],
        metadata: Some(build_diagnostics_runtime_status_metadata()),
    }
}

pub(crate) fn build_provider_tail_failure_retry_runtime_status(
    error_detail: &str,
) -> AgentRuntimeStatus {
    AgentRuntimeStatus {
        phase: "retrying".to_string(),
        title: "正在恢复模型输出".to_string(),
        detail: "模型通道在尾段暂时中断，正在基于已完成的工具结果和上下文补齐最终答复。"
            .to_string(),
        checkpoints: vec![
            "已保留本轮已有工具结果和部分输出".to_string(),
            format!("检测到可重试的模型通道错误：{error_detail}"),
            "正在继续生成最终答复".to_string(),
        ],
        metadata: Some(build_diagnostics_runtime_status_metadata()),
    }
}

pub(crate) fn build_incomplete_tool_batch_continue_runtime_status() -> AgentRuntimeStatus {
    AgentRuntimeStatus {
        phase: "continuing".to_string(),
        title: "正在补齐剩余证据".to_string(),
        detail: "检测到上一轮只给出了中间过程结论，正在继续推进下一批必要工具或整理最终结论。"
            .to_string(),
        checkpoints: vec![
            "已完成上一批工具调用".to_string(),
            "当前答复仍停留在中间过程结论".to_string(),
            "继续推进直到形成完整答复".to_string(),
        ],
        metadata: Some(build_diagnostics_runtime_status_metadata()),
    }
}

pub(crate) fn build_web_search_synthesis_runtime_status(
    coverage_summary: Option<&str>,
) -> AgentRuntimeStatus {
    let mut checkpoints = vec![
        "已完成 WebSearch 预检索".to_string(),
        "正在把检索结果整理为最终答复".to_string(),
        "本阶段不再重复执行搜索".to_string(),
    ];
    if let Some(summary) = coverage_summary
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        checkpoints.push(summary.to_string());
    }

    AgentRuntimeStatus {
        phase: "synthesizing".to_string(),
        title: "正在整理联网结果".to_string(),
        detail: "已完成前置扩搜，正在基于已有 WebSearch 结果输出最终总结，不再重复检索。"
            .to_string(),
        checkpoints,
        metadata: Some(build_diagnostics_runtime_status_metadata()),
    }
}

pub(crate) fn build_web_retrieval_synthesis_runtime_status(
    completed_count: usize,
) -> AgentRuntimeStatus {
    let completed_label = if completed_count > 1 {
        format!("已收到 {completed_count} 个网页检索结果")
    } else {
        "已收到网页检索结果".to_string()
    };

    AgentRuntimeStatus {
        phase: "synthesizing".to_string(),
        title: "正在整理联网结果".to_string(),
        detail: "网页检索工具已返回结果，正在整理来源、判断是否还缺证据，并准备输出最终答复。"
            .to_string(),
        checkpoints: vec![
            completed_label,
            "正在归纳来源与关键信息".to_string(),
            "如仍缺证据，会继续请求网页工具".to_string(),
        ],
        metadata: Some(build_diagnostics_runtime_status_metadata()),
    }
}

pub(crate) async fn emit_runtime_status_with_projection<F>(
    agent: &Agent,
    session_config: &AgentSessionConfig,
    mut status: AgentRuntimeStatus,
    on_event: &mut F,
) where
    F: FnMut(&RuntimeAgentEvent),
{
    apply_soul_style_to_runtime_status(&mut status, session_config.turn_context.as_ref());
    let aster_session_config = to_aster_session_config(session_config.clone());
    match agent
        .upsert_runtime_status_item(
            &aster_session_config,
            status.phase.clone(),
            status.title.clone(),
            status.detail.clone(),
            status.checkpoints.clone(),
        )
        .await
    {
        Ok(agent_event) => {
            for event in project_aster_runtime_event(agent_event) {
                on_event(&event);
            }
        }
        Err(error) => {
            tracing::warn!(
                "[AgentRuntime][RuntimeStatus] 写入 runtime item 失败，降级仅发 transient 事件: {}",
                error
            );
        }
    }

    let event = RuntimeAgentEvent::RuntimeStatus { status };
    on_event(&event);
}

fn apply_soul_style_to_runtime_status(
    status: &mut AgentRuntimeStatus,
    turn_context: Option<&AgentTurnContext>,
) {
    let Some(style_profile_id) = active_soul_style_profile_id(turn_context) else {
        return;
    };
    let intensity = active_soul_style_intensity(turn_context).unwrap_or("low");
    match style_profile_id {
        "cheeky_sassy_executor" => apply_cheeky_sassy_runtime_status(status, intensity),
        "warm_supportive_companion" => apply_warm_supportive_runtime_status(status),
        "cool_confident_operator" => apply_cool_confident_runtime_status(status),
        "calm_professional_partner" => {}
        _ => {}
    }
}

fn apply_cheeky_sassy_runtime_status(status: &mut AgentRuntimeStatus, intensity: &str) {
    let suffix = match intensity {
        "high" => "，我在加速收尾。",
        "medium" => "，我在收尾。",
        _ => "，马上收尾。",
    };
    status.title = match status.phase.as_str() {
        "retrying" if status.title.contains("重试") => format!("刚才没吐字{suffix}"),
        "retrying" if status.title.contains("恢复") => format!("尾巴断了一下{suffix}"),
        "continuing" => format!("证据还差一点{suffix}"),
        "synthesizing" => format!("联网结果到手{suffix}"),
        _ => status.title.clone(),
    };
}

fn apply_cool_confident_runtime_status(status: &mut AgentRuntimeStatus) {
    status.title = match status.phase.as_str() {
        "retrying" if status.title.contains("重试") => "正在补发最终答复".to_string(),
        "retrying" if status.title.contains("恢复") => "正在接回输出".to_string(),
        "continuing" => "继续补齐证据".to_string(),
        "synthesizing" => "联网结果已到位".to_string(),
        _ => status.title.clone(),
    };
}

fn apply_warm_supportive_runtime_status(status: &mut AgentRuntimeStatus) {
    status.title = match status.phase.as_str() {
        "retrying" if status.title.contains("重试") => "正在补发最终答复".to_string(),
        "retrying" if status.title.contains("恢复") => "正在接上模型输出".to_string(),
        "continuing" => "正在补齐剩余信息".to_string(),
        "synthesizing" => "正在整理已有结果".to_string(),
        _ => status.title.clone(),
    };
}

fn active_soul_style_profile_id(turn_context: Option<&AgentTurnContext>) -> Option<&str> {
    turn_context?
        .metadata
        .get("config")?
        .pointer("/memory/soul/styleProfile/id")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn active_soul_style_intensity(turn_context: Option<&AgentTurnContext>) -> Option<&str> {
    turn_context?
        .metadata
        .get("config")?
        .pointer("/memory/soul/styleProfile/intensity")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    fn turn_context_with_soul(style_profile_id: &str, intensity: &str) -> AgentTurnContext {
        AgentTurnContext {
            metadata: HashMap::from([(
                "config".to_string(),
                json!({
                    "memory": {
                        "soul": {
                            "styleProfile": {
                                "id": style_profile_id,
                                "intensity": intensity
                            }
                        }
                    }
                }),
            )]),
            ..AgentTurnContext::default()
        }
    }

    #[test]
    fn runtime_status_keeps_default_copy_without_soul_context() {
        let mut status = build_web_search_synthesis_runtime_status(None);

        apply_soul_style_to_runtime_status(&mut status, None);

        assert_eq!(status.title, "正在整理联网结果");
        assert!(status.detail.contains("已完成前置扩搜"));
    }

    #[test]
    fn runtime_status_applies_cheeky_sassy_soul_style() {
        let mut status = build_web_search_synthesis_runtime_status(None);
        let turn_context = turn_context_with_soul("cheeky_sassy_executor", "medium");

        apply_soul_style_to_runtime_status(&mut status, Some(&turn_context));

        assert_eq!(status.title, "联网结果到手，我在收尾。");
        assert!(status.detail.contains("已完成前置扩搜"));
        assert!(!status.detail.contains("Soul"));
        assert!(!status.detail.contains("口吻"));
    }

    #[test]
    fn runtime_status_applies_warm_supportive_soul_style() {
        let mut status = build_provider_tail_failure_retry_runtime_status("stream interrupted");
        let turn_context = turn_context_with_soul("warm_supportive_companion", "low");

        apply_soul_style_to_runtime_status(&mut status, Some(&turn_context));

        assert_eq!(status.title, "正在接上模型输出");
    }

    #[test]
    fn runtime_status_applies_cool_confident_soul_style() {
        let mut status = build_web_search_synthesis_runtime_status(None);
        let turn_context = turn_context_with_soul("cool_confident_operator", "low");

        apply_soul_style_to_runtime_status(&mut status, Some(&turn_context));

        assert_eq!(status.title, "联网结果已到位");
    }
}
