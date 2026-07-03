use crate::RuntimeCoreError;
use async_trait::async_trait;
use lime_agent::{KnowledgeBuilderSkillRequest, KnowledgeBuilderSkillRunner, SkillExecutionResult};
use lime_knowledge::{KnowledgeBuilderRuntimeExecution, KnowledgeBuilderRuntimePlan};

#[async_trait]
pub trait KnowledgeBuilderRuntimeExecutor: Send + Sync {
    async fn execute(
        &self,
        plan: KnowledgeBuilderRuntimePlan,
    ) -> Result<KnowledgeBuilderRuntimeExecution, RuntimeCoreError>;
}

#[derive(Default)]
pub struct NativeKnowledgeBuilderRuntimeExecutor {
    runner: KnowledgeBuilderSkillRunner,
}

impl NativeKnowledgeBuilderRuntimeExecutor {
    pub fn new() -> Self {
        Self {
            runner: KnowledgeBuilderSkillRunner::new(),
        }
    }
}

#[async_trait]
impl KnowledgeBuilderRuntimeExecutor for NativeKnowledgeBuilderRuntimeExecutor {
    async fn execute(
        &self,
        plan: KnowledgeBuilderRuntimePlan,
    ) -> Result<KnowledgeBuilderRuntimeExecution, RuntimeCoreError> {
        Ok(execute_native_knowledge_builder_skill(&self.runner, plan).await)
    }
}

async fn execute_native_knowledge_builder_skill(
    runner: &KnowledgeBuilderSkillRunner,
    plan: KnowledgeBuilderRuntimePlan,
) -> KnowledgeBuilderRuntimeExecution {
    let result = runner
        .run(KnowledgeBuilderSkillRequest {
            skill_name: &plan.skill_name,
            execution_id: &plan.execution_id,
            session_id: &plan.session_id,
            user_input: &plan.user_input,
            request_context: &plan.request_context,
            provider_override: plan.provider_override.as_deref(),
            model_override: plan.model_override.as_deref(),
        })
        .await;
    knowledge_builder_execution_from_skill_result(plan, result)
}

fn knowledge_builder_execution_from_skill_result(
    plan: KnowledgeBuilderRuntimePlan,
    result: Result<SkillExecutionResult, String>,
) -> KnowledgeBuilderRuntimeExecution {
    match result {
        Ok(output) if output.success => KnowledgeBuilderRuntimeExecution {
            skill_name: plan.skill_name,
            execution_id: plan.execution_id,
            session_id: Some(plan.session_id),
            status: "succeeded".to_string(),
            provider: plan.provider_override,
            model: plan.model_override,
            output: output.output,
            error: None,
        },
        Ok(output) => KnowledgeBuilderRuntimeExecution {
            skill_name: plan.skill_name,
            execution_id: plan.execution_id,
            session_id: Some(plan.session_id),
            status: "failed".to_string(),
            provider: plan.provider_override,
            model: plan.model_override,
            output: output.output,
            error: output
                .error
                .or_else(|| Some("Builder Skill 执行失败".to_string())),
        },
        Err(error) => KnowledgeBuilderRuntimeExecution {
            skill_name: plan.skill_name,
            execution_id: plan.execution_id,
            session_id: Some(plan.session_id),
            status: "failed".to_string(),
            provider: plan.provider_override,
            model: plan.model_override,
            output: None,
            error: Some(error),
        },
    }
}
