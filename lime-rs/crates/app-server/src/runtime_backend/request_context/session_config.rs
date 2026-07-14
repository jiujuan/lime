use crate::runtime::memory_prompt::{
    append_memory_context_to_system_prompt, append_soul_context_to_system_prompt,
};
use crate::ExecutionRequest;
use lime_agent::{
    build_agent_session_config, merge_system_prompt_with_request_tool_policy,
    merge_system_prompt_with_runtime_agents_for_project, AgentSessionConfig,
    AgentSessionConfigurationRequest, RequestToolPolicy,
};
use serde_json::Value;

use super::{
    host_system_prompt, request_workspace_scope, runtime_request_from_request,
    turn_context_from_request, RuntimeModelSelection, RuntimeRequest, RuntimeSessionScope,
};

const DEFAULT_SESSION_SYSTEM_PROMPT: &str = "你是 Lime 桌面端中的 AI 助手。交互口吻、问候、自我介绍、工具进展和失败恢复由当前会话的 `memory.soul` 上下文控制；如果没有 `memory.soul` 上下文，保持清晰、准确、可执行。";

pub(in crate::runtime_backend) fn session_config_from_request(
    request: &ExecutionRequest,
    host_request: Option<&RuntimeRequest>,
    scope: &RuntimeSessionScope,
    selection: &RuntimeModelSelection,
    request_tool_policy: &RequestToolPolicy,
    config_metadata: Option<Value>,
) -> AgentSessionConfig {
    let workspace_scope = request_workspace_scope(request, host_request);
    let metadata_values = super::super::skill_runtime_enable::request_metadata_values(request);
    let turn_tool_surface = super::turn_tool_surface_for_request(request);
    let runtime_metadata = request.runtime_metadata();
    let system_prompt = if turn_tool_surface.uses_light_session_prompt() {
        append_soul_context_to_system_prompt(
            Some(request_system_prompt(request)),
            config_metadata.as_ref(),
            runtime_metadata,
        )
    } else {
        let system_prompt = merge_system_prompt_with_runtime_agents_for_project(
            Some(request_system_prompt(request)),
            workspace_scope.working_dir.as_deref(),
            workspace_scope.project_root.as_deref(),
        );
        let system_prompt =
            super::super::agent_skills_context::append_agent_skills_context_to_system_prompt(
                system_prompt,
                &request.input.text,
                &metadata_values,
                workspace_scope.working_dir.as_deref(),
                workspace_scope.project_root.as_deref(),
            );
        let system_prompt =
            super::super::plugin_activation_context::append_plugin_activation_context_to_system_prompt(
                system_prompt,
                &metadata_values,
            );
        let system_prompt =
            super::super::plugin_runtime_context::append_plugin_runtime_context_to_system_prompt(
                system_prompt,
                &metadata_values,
            );
        let system_prompt = append_memory_context_to_system_prompt(system_prompt, runtime_metadata);
        let system_prompt = append_soul_context_to_system_prompt(
            system_prompt,
            config_metadata.as_ref(),
            runtime_metadata,
        );
        merge_system_prompt_with_request_tool_policy(system_prompt, request_tool_policy)
    };
    let turn_context =
        turn_context_from_request(request, host_request, scope, selection, config_metadata);
    build_agent_session_config(AgentSessionConfigurationRequest {
        session_id: scope.session_id.clone(),
        thread_id: scope.thread_id.clone(),
        turn_id: scope.turn_id.clone(),
        system_prompt,
        turn_context,
        include_context_trace: !turn_tool_surface.uses_light_session_prompt(),
    })
}

fn request_system_prompt(request: &ExecutionRequest) -> String {
    runtime_request_from_request(request)
        .and_then(|host| host_system_prompt(&host))
        .unwrap_or_else(|| DEFAULT_SESSION_SYSTEM_PROMPT.to_string())
}
