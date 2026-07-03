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
    aster_chat_request_from_request, host_system_prompt, non_empty, request_workspace_scope,
    turn_context_from_request, AsterChatRequestSnapshot, RuntimeModelSelection,
    RuntimeSessionScope,
};

pub(in crate::runtime_backend) fn session_config_from_request(
    request: &ExecutionRequest,
    host_request: Option<&AsterChatRequestSnapshot>,
    scope: &RuntimeSessionScope,
    selection: &RuntimeModelSelection,
    request_tool_policy: &RequestToolPolicy,
    config_metadata: Option<Value>,
) -> AgentSessionConfig {
    let workspace_scope = request_workspace_scope(request, host_request);
    let metadata_values = super::super::skill_runtime_enable::request_metadata_values(request);
    let fast_response_tool_surface =
        super::fast_response_tool_surface_for_request(request, request_tool_policy);
    let system_prompt = if fast_response_tool_surface.uses_light_session_prompt() {
        Some(request_system_prompt(request))
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
        let runtime_metadata = request
            .runtime_options
            .as_ref()
            .and_then(|options| options.metadata.as_ref())
            .or(request.metadata.as_ref());
        let system_prompt = append_memory_context_to_system_prompt(system_prompt, runtime_metadata);
        let system_prompt =
            append_soul_context_to_system_prompt(system_prompt, config_metadata.as_ref());
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
        include_context_trace: !fast_response_tool_surface.uses_light_session_prompt(),
    })
}

fn request_system_prompt(request: &ExecutionRequest) -> String {
    aster_chat_request_from_request(request)
        .and_then(|host| host_system_prompt(&host))
        .or_else(|| {
            request
                .runtime_options
                .as_ref()
                .and_then(|options| options.host_options.as_ref())
                .and_then(|host_options| host_options.get("asterChatRequest"))
                .and_then(|value| value.get("turn_config").or_else(|| value.get("turnConfig")))
                .and_then(|turn_config| {
                    turn_config
                        .get("system_prompt")
                        .or_else(|| turn_config.get("systemPrompt"))
                })
                .and_then(Value::as_str)
                .and_then(|value| non_empty(Some(value)))
        })
        .unwrap_or_else(|| {
            "你是 Lime 桌面端里的 AI 助手。请直接完成用户请求，保持回答清晰、准确、可执行。"
                .to_string()
        })
}
