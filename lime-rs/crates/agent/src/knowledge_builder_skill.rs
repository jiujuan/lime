use crate::provider_configuration::{
    configure_model_route_provider_for_session_with_provider_and_credential_ref,
    ModelRouteProviderConfiguration,
};
use crate::{
    execute_skill_prompt, execute_skill_workflow, AgentRuntimeState, SkillEventEmitter,
    SkillExecutionError, SkillExecutionResult, SkillPromptExecution, SkillWorkflowExecution,
};
use lime_core::database::DbConnection;
use lime_skills::{ExecutionCallback, LoadedSkillDefinition};
use serde_json::Value;
use std::sync::Arc;

pub struct KnowledgeBuilderSkillRequest<'a> {
    pub db: &'a DbConnection,
    pub skill_name: &'a str,
    pub execution_id: &'a str,
    pub session_id: &'a str,
    pub user_input: &'a str,
    pub request_context: &'a Value,
    pub provider_configuration: ModelRouteProviderConfiguration,
}

#[derive(Default)]
pub struct KnowledgeBuilderSkillRunner {
    agent_state: AgentRuntimeState,
}

impl KnowledgeBuilderSkillRunner {
    pub fn new() -> Self {
        Self {
            agent_state: AgentRuntimeState::new(),
        }
    }

    pub async fn run(
        &self,
        request: KnowledgeBuilderSkillRequest<'_>,
    ) -> Result<SkillExecutionResult, String> {
        run_knowledge_builder_skill(&self.agent_state, request).await
    }
}

pub async fn run_knowledge_builder_skill(
    agent_state: &AgentRuntimeState,
    request: KnowledgeBuilderSkillRequest<'_>,
) -> Result<SkillExecutionResult, String> {
    let skill = load_executable_builder_skill(request.skill_name)?;
    configure_builder_provider(
        agent_state,
        request.db,
        request.session_id,
        request.provider_configuration,
    )
    .await?;
    let user_input = build_skill_user_input(request.user_input, request.request_context);
    let callback = NoopSkillExecutionCallback;
    let emitter = noop_skill_event_emitter();

    if skill.execution_mode == "workflow" {
        execute_skill_workflow(SkillWorkflowExecution {
            runtime_state: agent_state,
            skill: &skill,
            user_input: &user_input,
            user_visible_input: Some(request.user_input),
            images: &[],
            execution_id: request.execution_id,
            session_id: request.session_id,
            callback: &callback,
            memory_prompt: None,
            emitter,
        })
        .await
        .map_err(map_skill_execution_error)
    } else {
        execute_skill_prompt(SkillPromptExecution {
            runtime_state: agent_state,
            skill: &skill,
            user_input: &user_input,
            user_visible_input: Some(request.user_input),
            images: &[],
            execution_id: request.execution_id,
            session_id: request.session_id,
            memory_prompt: None,
            emitter,
        })
        .await
        .map_err(map_skill_execution_error)
    }
}

fn load_executable_builder_skill(skill_name: &str) -> Result<LoadedSkillDefinition, String> {
    let skill = lime_skills::find_skill_by_name(skill_name)?;
    if !skill.standard_compliance.validation_errors.is_empty() {
        return Err(format!(
            "Skill '{}' 未通过标准校验: {}",
            skill.skill_name,
            skill.standard_compliance.validation_errors.join("; ")
        ));
    }
    if skill.disable_model_invocation {
        return Err(format!("Skill '{skill_name}' 已禁用模型调用，无法执行"));
    }
    Ok(skill)
}

async fn configure_builder_provider(
    agent_state: &AgentRuntimeState,
    db: &DbConnection,
    session_id: &str,
    configuration: ModelRouteProviderConfiguration,
) -> Result<(), String> {
    let credential_ref = configuration.credential_ref.clone();
    configure_model_route_provider_for_session_with_provider_and_credential_ref(
        agent_state,
        db,
        session_id,
        configuration,
        credential_ref.as_deref(),
    )
    .await
    .map(|_| ())
    .map_err(|error| format!("Knowledge Builder 必须先解析 current model route: {error}"))
}

fn build_skill_user_input(user_input: &str, request_context: &Value) -> String {
    let serialized_context = serde_json::to_string_pretty(request_context)
        .unwrap_or_else(|_| request_context.to_string());
    let normalized_user_input = user_input.trim();
    if normalized_user_input.is_empty() {
        return format!(
            "以下是调用方提供的结构化上下文，请严格按字段含义执行：\n```json\n{serialized_context}\n```"
        );
    }

    format!(
        "以下是调用方提供的结构化上下文，请严格按字段含义执行：\n```json\n{serialized_context}\n```\n\n用户原始输入：\n{normalized_user_input}"
    )
}

fn map_skill_execution_error(error: SkillExecutionError) -> String {
    match error {
        SkillExecutionError::SessionInitFailed(message) => message,
    }
}

fn noop_skill_event_emitter() -> SkillEventEmitter {
    Arc::new(|_, _| {})
}

struct NoopSkillExecutionCallback;

impl ExecutionCallback for NoopSkillExecutionCallback {
    fn on_step_start(
        &self,
        _step_id: &str,
        _step_name: &str,
        _current_step: usize,
        _total_steps: usize,
    ) {
    }

    fn on_step_complete(&self, _step_id: &str, _output: &str) {}

    fn on_step_error(&self, _step_id: &str, _error: &str, _will_retry: bool) {}

    fn on_complete(&self, _success: bool, _final_output: Option<&str>, _error: Option<&str>) {}
}
