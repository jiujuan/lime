use crate::protocol::{
    build_diagnostics_runtime_status_metadata, AgentEvent as RuntimeAgentEvent, AgentRuntimeStatus,
};
use crate::protocol_projection::project_runtime_event;
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
    session_config: &aster::agents::SessionConfig,
    status: AgentRuntimeStatus,
    on_event: &mut F,
) where
    F: FnMut(&RuntimeAgentEvent),
{
    match agent
        .upsert_runtime_status_item(
            session_config,
            status.phase.clone(),
            status.title.clone(),
            status.detail.clone(),
            status.checkpoints.clone(),
        )
        .await
    {
        Ok(agent_event) => {
            for event in project_runtime_event(agent_event) {
                on_event(&event);
            }
        }
        Err(error) => {
            tracing::warn!(
                "[AsterAgent][RuntimeStatus] 写入 runtime item 失败，降级仅发 transient 事件: {}",
                error
            );
        }
    }

    let event = RuntimeAgentEvent::RuntimeStatus { status };
    on_event(&event);
}
