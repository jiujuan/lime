use crate::{
    execute_skill_prompt, execute_skill_workflow, AsterAgentState, SkillEventEmitter,
    SkillExecutionError, SkillExecutionResult, SkillPromptExecution, SkillWorkflowExecution,
};
use lime_core::database;
use lime_skills::{ExecutionCallback, LoadedSkillDefinition};
use serde_json::Value;
use std::sync::Arc;

const DEFAULT_SKILL_PROVIDER: &str = "anthropic";
const DEFAULT_SKILL_MODEL: &str = "claude-sonnet-4-20250514";
const FALLBACK_TOOL_CAPABLE_PROVIDERS: &[(&str, &str)] = &[
    ("anthropic", "claude-sonnet-4-20250514"),
    ("openai", "gpt-4o"),
    ("gemini", "gemini-2.0-flash"),
];

pub struct KnowledgeBuilderSkillRequest<'a> {
    pub skill_name: &'a str,
    pub execution_id: &'a str,
    pub session_id: &'a str,
    pub user_input: &'a str,
    pub request_context: &'a Value,
    pub provider_override: Option<&'a str>,
    pub model_override: Option<&'a str>,
}

#[derive(Default)]
pub struct KnowledgeBuilderSkillRunner {
    agent_state: AsterAgentState,
}

impl KnowledgeBuilderSkillRunner {
    pub fn new() -> Self {
        Self {
            agent_state: AsterAgentState::new(),
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
    agent_state: &AsterAgentState,
    request: KnowledgeBuilderSkillRequest<'_>,
) -> Result<SkillExecutionResult, String> {
    let db = database::init_database()?;
    let skill = load_executable_builder_skill(request.skill_name)?;
    let (requested_provider, requested_model) = resolve_requested_provider(&skill, &request);
    configure_builder_provider(
        agent_state,
        &db,
        request.session_id,
        &requested_provider,
        &requested_model,
    )
    .await?;
    let user_input = build_skill_user_input(request.user_input, request.request_context);
    let callback = NoopSkillExecutionCallback;
    let emitter = noop_skill_event_emitter();

    if skill.execution_mode == "workflow" {
        execute_skill_workflow(SkillWorkflowExecution {
            aster_state: agent_state,
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
            aster_state: agent_state,
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

fn resolve_requested_provider(
    skill: &LoadedSkillDefinition,
    request: &KnowledgeBuilderSkillRequest<'_>,
) -> (String, String) {
    let requested_provider = request
        .provider_override
        .map(str::to_string)
        .or_else(|| skill.provider.clone())
        .unwrap_or_else(|| DEFAULT_SKILL_PROVIDER.to_string());
    let requested_model = request
        .model_override
        .map(str::to_string)
        .or_else(|| skill.model.clone())
        .unwrap_or_else(|| DEFAULT_SKILL_MODEL.to_string());
    (requested_provider, requested_model)
}

async fn configure_builder_provider(
    agent_state: &AsterAgentState,
    db: &lime_core::database::DbConnection,
    session_id: &str,
    requested_provider: &str,
    requested_model: &str,
) -> Result<(), String> {
    let mut configure_result = agent_state
        .configure_provider_from_pool(
            db,
            requested_provider,
            requested_model,
            session_id,
            None,
            None,
        )
        .await;

    if configure_result.is_err() {
        tracing::warn!(
            "[knowledge_builder_skill] 首选 Provider {} 配置失败: {:?}，尝试 fallback",
            requested_provider,
            configure_result.as_ref().err()
        );

        for (fallback_provider, fallback_model) in FALLBACK_TOOL_CAPABLE_PROVIDERS {
            if *fallback_provider == requested_provider {
                continue;
            }
            match agent_state
                .configure_provider_from_pool(
                    db,
                    fallback_provider,
                    fallback_model,
                    session_id,
                    None,
                    None,
                )
                .await
            {
                Ok(config) => {
                    tracing::info!(
                        "[knowledge_builder_skill] Fallback 到 {} / {} 成功",
                        fallback_provider,
                        fallback_model
                    );
                    configure_result = Ok(config);
                    break;
                }
                Err(error) => {
                    tracing::warn!(
                        "[knowledge_builder_skill] Fallback {} 也失败: {}",
                        fallback_provider,
                        error
                    );
                }
            }
        }
    }

    configure_result.map(|_| ()).map_err(|error| {
        format!(
            "无法配置任何可用的 Provider（需要支持工具调用的 Provider，如 Anthropic、OpenAI 或 Google）: {error}"
        )
    })
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
