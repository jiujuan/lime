use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::{
    artifact_protocol::{
        extend_unique_artifact_protocol_paths, push_unique_artifact_protocol_path,
    },
    aster_runtime_projection::project_aster_runtime_event,
    AgentTurnContext, AsterAgentState, SessionConfigBuilder, WriteArtifactEventEmitter,
};
use aster::agents::SessionConfig;
use aster::conversation::message::Message;
use futures::StreamExt;
use lime_skills::{ExecutionCallback, LoadedSkillDefinition};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;

pub type SkillEventEmitter = Arc<dyn Fn(String, RuntimeAgentEvent) + Send + Sync + 'static>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub step_id: String,
    pub step_name: String,
    pub success: bool,
    pub output: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInputImage {
    pub data: String,
    #[serde(alias = "mediaType")]
    pub media_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillExecutionResult {
    pub success: bool,
    pub output: Option<String>,
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub artifact_paths: Vec<String>,
    pub steps_completed: Vec<StepResult>,
}

pub struct SkillWorkflowExecution<'a> {
    pub aster_state: &'a AsterAgentState,
    pub skill: &'a LoadedSkillDefinition,
    pub user_input: &'a str,
    pub user_visible_input: Option<&'a str>,
    pub images: &'a [SkillInputImage],
    pub execution_id: &'a str,
    pub session_id: &'a str,
    pub callback: &'a dyn ExecutionCallback,
    pub memory_prompt: Option<&'a str>,
    pub emitter: SkillEventEmitter,
}

pub struct SkillPromptExecution<'a> {
    pub aster_state: &'a AsterAgentState,
    pub skill: &'a LoadedSkillDefinition,
    pub user_input: &'a str,
    pub user_visible_input: Option<&'a str>,
    pub images: &'a [SkillInputImage],
    pub execution_id: &'a str,
    pub session_id: &'a str,
    pub memory_prompt: Option<&'a str>,
    pub emitter: SkillEventEmitter,
}

#[derive(Debug, Clone)]
pub enum SkillExecutionError {
    SessionInitFailed(String),
}

impl std::fmt::Display for SkillExecutionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SessionInitFailed(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for SkillExecutionError {}

struct StreamedSkillReply {
    output: String,
    error: Option<String>,
    artifact_paths: Vec<String>,
}

fn emit_skill_event(emitter: &SkillEventEmitter, event_name: &str, event: RuntimeAgentEvent) {
    emitter(event_name.to_string(), event);
}

fn collect_artifact_path_from_event(target: &mut Vec<String>, event: &RuntimeAgentEvent) {
    if let RuntimeAgentEvent::ArtifactSnapshot { artifact } = event {
        push_unique_artifact_protocol_path(target, artifact.file_path.as_str());
    }
}

fn build_step_system_prompt(
    skill_markdown: &str,
    step_name: &str,
    step_number: usize,
    total_steps: usize,
    step_prompt: &str,
    memory_prompt: Option<&str>,
) -> String {
    let base_prompt = format!(
        "{skill_markdown}\n\n---\n\n## 当前步骤: {step_name} ({step_number}/{total_steps})\n\n{step_prompt}"
    );
    if let Some(memory_prompt) = memory_prompt {
        format!("{base_prompt}\n\n{memory_prompt}")
    } else {
        base_prompt
    }
}

fn build_step_input(user_input: &str, accumulated_context: &str, is_first_step: bool) -> String {
    if is_first_step {
        accumulated_context.to_string()
    } else {
        format!("原始需求：{user_input}\n\n前序步骤输出：\n{accumulated_context}")
    }
}

fn build_prompt_system_prompt(skill_markdown: &str, memory_prompt: Option<&str>) -> String {
    if let Some(memory_prompt) = memory_prompt {
        format!("{skill_markdown}\n\n{memory_prompt}")
    } else {
        skill_markdown.to_string()
    }
}

fn should_hide_execution_input_from_user(
    execution_input: &str,
    user_visible_input: Option<&str>,
) -> bool {
    user_visible_input
        .map(|input| {
            let visible = input.trim();
            !visible.is_empty() && visible != execution_input.trim()
        })
        .unwrap_or(false)
}

fn build_user_message(
    user_input: &str,
    user_visible_input: Option<&str>,
    images: &[SkillInputImage],
) -> Message {
    let mut user_message = Message::user().with_text(user_input);
    for image in images {
        user_message = user_message.with_image(image.data.clone(), image.media_type.clone());
    }
    if should_hide_execution_input_from_user(user_input, user_visible_input) {
        user_message = user_message.agent_only();
    }
    user_message
}

fn build_skill_turn_context(
    skill: &LoadedSkillDefinition,
    user_visible_input: Option<&str>,
) -> Option<AgentTurnContext> {
    let allowed_tools = skill
        .allowed_tools
        .as_ref()
        .filter(|tools| !tools.is_empty());
    let user_visible_input_text = user_visible_input
        .and_then(|input| (!input.trim().is_empty()).then(|| input.trim().to_string()));

    if allowed_tools.is_none() && user_visible_input_text.is_none() {
        return None;
    }

    let mut metadata = HashMap::new();
    if let Some(allowed_tools) = allowed_tools {
        metadata.insert(
            "subagent".to_string(),
            json!({
                "allowed_tools": allowed_tools,
            }),
        );
    }

    Some(AgentTurnContext {
        user_visible_input_text,
        metadata,
        ..AgentTurnContext::default()
    })
}

fn build_prompt_session_config(
    session_id: &str,
    skill: &LoadedSkillDefinition,
    user_visible_input: Option<&str>,
    memory_prompt: Option<&str>,
) -> SessionConfig {
    let mut session_config_builder = SessionConfigBuilder::new(session_id)
        .system_prompt(build_prompt_system_prompt(
            &skill.markdown_content,
            memory_prompt,
        ))
        .system_prompt_override(true)
        .include_context_trace(true);
    if let Some(turn_context) = build_skill_turn_context(skill, user_visible_input) {
        session_config_builder = session_config_builder.turn_context(turn_context);
    }
    session_config_builder.build()
}

fn build_step_session_config(
    step_session_id: &str,
    step_system_prompt: String,
    skill_turn_context: Option<AgentTurnContext>,
) -> SessionConfig {
    let mut session_config_builder = SessionConfigBuilder::new(step_session_id)
        .system_prompt(step_system_prompt)
        .system_prompt_override(true)
        .include_context_trace(true);
    if let Some(turn_context) = skill_turn_context {
        session_config_builder = session_config_builder.turn_context(turn_context);
    }
    session_config_builder.build()
}

async fn stream_skill_session(
    aster_state: &AsterAgentState,
    session_id: &str,
    event_name: &str,
    session_config: SessionConfig,
    user_message: Message,
    emitter: &SkillEventEmitter,
) -> Result<StreamedSkillReply, SkillExecutionError> {
    let agent_arc = aster_state.get_agent_arc();
    let guard = agent_arc.read().await;
    let agent = guard.as_ref().ok_or_else(|| {
        SkillExecutionError::SessionInitFailed("Agent not initialized".to_string())
    })?;

    let cancel_token = aster_state.create_cancel_token(session_id).await;
    let stream_result = agent
        .reply(user_message, session_config, Some(cancel_token.clone()))
        .await;

    let mut output = String::new();
    let mut error: Option<String> = None;
    let mut artifact_paths = Vec::new();
    let mut write_artifact_emitter = WriteArtifactEventEmitter::new(session_id.to_string());

    match stream_result {
        Ok(mut stream) => {
            while let Some(event_result) = stream.next().await {
                match event_result {
                    Ok(agent_event) => {
                        let runtime_events = project_aster_runtime_event(agent_event);
                        for mut runtime_event in runtime_events {
                            let extra_events =
                                write_artifact_emitter.process_event(&mut runtime_event);
                            for extra_event in extra_events {
                                collect_artifact_path_from_event(&mut artifact_paths, &extra_event);
                                emit_skill_event(emitter, event_name, extra_event);
                            }
                            collect_artifact_path_from_event(&mut artifact_paths, &runtime_event);
                            if let RuntimeAgentEvent::TextDelta { ref text } = runtime_event {
                                output.push_str(text);
                            }
                            emit_skill_event(emitter, event_name, runtime_event);
                        }
                    }
                    Err(stream_error) => {
                        error = Some(format!("Stream error: {stream_error}"));
                        break;
                    }
                }
            }
        }
        Err(agent_error) => {
            error = Some(format!("Agent error: {agent_error}"));
        }
    }

    aster_state.remove_cancel_token(session_id).await;

    Ok(StreamedSkillReply {
        output,
        error,
        artifact_paths,
    })
}

pub async fn execute_skill_workflow(
    request: SkillWorkflowExecution<'_>,
) -> Result<SkillExecutionResult, SkillExecutionError> {
    let SkillWorkflowExecution {
        aster_state,
        skill,
        user_input,
        user_visible_input,
        images,
        execution_id,
        session_id,
        callback,
        memory_prompt,
        emitter,
    } = request;
    let steps = &skill.workflow_steps;
    let total_steps = steps.len();
    let event_name = format!("skill-exec-{execution_id}");
    let mut steps_completed = Vec::new();
    let mut artifact_paths = Vec::new();
    let mut accumulated_context = user_input.to_string();
    let mut final_output = String::new();
    let skill_turn_context = build_skill_turn_context(skill, user_visible_input);

    tracing::info!(
        "[execute_skill_workflow] 开始 workflow 执行: steps={}, skill={}",
        total_steps,
        skill.skill_name
    );

    for (idx, step) in steps.iter().enumerate() {
        let step_num = idx + 1;
        callback.on_step_start(&step.id, &step.name, step_num, total_steps);

        tracing::info!(
            "[execute_skill_workflow] 执行步骤 {}/{}: id={}, name={}",
            step_num,
            total_steps,
            step.id,
            step.name
        );

        let step_system_prompt = build_step_system_prompt(
            &skill.markdown_content,
            &step.name,
            step_num,
            total_steps,
            &step.prompt,
            memory_prompt,
        );
        let step_session_id = format!("{session_id}-step-{}", step.id);
        let session_config = build_step_session_config(
            &step_session_id,
            step_system_prompt,
            skill_turn_context.clone(),
        );
        let step_input = build_step_input(user_input, &accumulated_context, idx == 0);
        let user_message = build_user_message(&step_input, user_visible_input, images);

        let reply = stream_skill_session(
            aster_state,
            &step_session_id,
            &event_name,
            session_config,
            user_message,
            &emitter,
        )
        .await?;
        extend_unique_artifact_protocol_paths(&mut artifact_paths, &reply.artifact_paths);

        if let Some(error) = &reply.error {
            callback.on_step_error(&step.id, error, false);
            steps_completed.push(StepResult {
                step_id: step.id.clone(),
                step_name: step.name.clone(),
                success: false,
                output: None,
                error: Some(error.clone()),
            });

            let final_error = format!("步骤 '{}' 执行失败: {}", step.name, error);
            callback.on_complete(false, None, Some(&final_error));
            emit_skill_event(
                &emitter,
                &event_name,
                RuntimeAgentEvent::FinalDone { usage: None },
            );

            return Ok(SkillExecutionResult {
                success: false,
                output: None,
                error: Some(final_error),
                artifact_paths,
                steps_completed,
            });
        }

        callback.on_step_complete(&step.id, &reply.output);
        steps_completed.push(StepResult {
            step_id: step.id.clone(),
            step_name: step.name.clone(),
            success: true,
            output: Some(reply.output.clone()),
            error: None,
        });
        accumulated_context = reply.output.clone();
        final_output = reply.output;
    }

    callback.on_complete(true, Some(&final_output), None);
    emit_skill_event(
        &emitter,
        &event_name,
        RuntimeAgentEvent::FinalDone { usage: None },
    );

    tracing::info!(
        "[execute_skill_workflow] Workflow 执行完成: skill={}, steps_completed={}",
        skill.skill_name,
        steps_completed.len()
    );

    Ok(SkillExecutionResult {
        success: true,
        output: Some(final_output),
        error: None,
        artifact_paths,
        steps_completed,
    })
}

pub async fn execute_skill_prompt(
    request: SkillPromptExecution<'_>,
) -> Result<SkillExecutionResult, SkillExecutionError> {
    let SkillPromptExecution {
        aster_state,
        skill,
        user_input,
        user_visible_input,
        images,
        execution_id,
        session_id,
        memory_prompt,
        emitter,
    } = request;
    let event_name = format!("skill-exec-{execution_id}");
    let session_config =
        build_prompt_session_config(session_id, skill, user_visible_input, memory_prompt);
    let user_message = build_user_message(user_input, user_visible_input, images);
    let reply = stream_skill_session(
        aster_state,
        session_id,
        &event_name,
        session_config,
        user_message,
        &emitter,
    )
    .await?;

    if let Some(error) = reply.error {
        return Ok(SkillExecutionResult {
            success: false,
            output: None,
            error: Some(error.clone()),
            artifact_paths: reply.artifact_paths.clone(),
            steps_completed: vec![StepResult {
                step_id: "main".to_string(),
                step_name: skill.display_name.clone(),
                success: false,
                output: None,
                error: Some(error),
            }],
        });
    }

    Ok(SkillExecutionResult {
        success: true,
        output: Some(reply.output.clone()),
        error: None,
        artifact_paths: reply.artifact_paths,
        steps_completed: vec![StepResult {
            step_id: "main".to_string(),
            step_name: skill.display_name.clone(),
            success: true,
            output: Some(reply.output),
            error: None,
        }],
    })
}

#[cfg(test)]
mod tests {
    use super::{
        build_prompt_session_config, build_skill_turn_context, build_step_session_config,
        build_step_system_prompt, build_user_message,
    };
    use lime_skills::LoadedSkillDefinition;
    use std::collections::HashMap;
    use std::path::PathBuf;

    fn build_loaded_skill(allowed_tools: Option<Vec<&str>>) -> LoadedSkillDefinition {
        LoadedSkillDefinition {
            skill_name: "image_generate".to_string(),
            display_name: "配图".to_string(),
            description: "测试 skill".to_string(),
            local_directory_path: PathBuf::from("/tmp/image_generate"),
            markdown_content: "test".to_string(),
            license: None,
            compatibility: None,
            metadata: HashMap::new(),
            allowed_tools: allowed_tools.map(|tools| {
                tools
                    .into_iter()
                    .map(|tool| tool.to_string())
                    .collect::<Vec<_>>()
            }),
            argument_hint: None,
            when_to_use: None,
            when_to_use_config: None,
            model: None,
            provider: None,
            disable_model_invocation: false,
            execution_mode: "prompt".to_string(),
            workflow_ref: None,
            workflow_steps: Vec::new(),
            standard_compliance: Default::default(),
        }
    }

    #[test]
    fn build_skill_turn_context_forwards_allowed_tools_to_subagent_scope_metadata() {
        let skill = build_loaded_skill(Some(vec![
            "lime_create_image_generation_task",
            "social_generate_cover_image",
        ]));

        let turn_context = build_skill_turn_context(&skill, None).expect("turn context");
        assert_eq!(
            turn_context.metadata["subagent"]["allowed_tools"],
            serde_json::json!([
                "lime_create_image_generation_task",
                "social_generate_cover_image"
            ])
        );
    }

    #[test]
    fn build_skill_turn_context_skips_empty_allowed_tools() {
        let skill = build_loaded_skill(Some(Vec::new()));
        assert!(build_skill_turn_context(&skill, None).is_none());

        let skill = build_loaded_skill(None);
        assert!(build_skill_turn_context(&skill, None).is_none());
    }

    #[test]
    fn build_skill_turn_context_keeps_user_visible_input_without_allowed_tools() {
        let skill = build_loaded_skill(None);

        let turn_context = build_skill_turn_context(&skill, Some("  @analysis 帮我分析一下  "))
            .expect("turn context");

        assert_eq!(
            turn_context.user_visible_input_text.as_deref(),
            Some("@analysis 帮我分析一下")
        );
        assert!(turn_context.metadata.is_empty());
    }

    #[test]
    fn build_user_message_hides_execution_input_when_visible_input_differs() {
        let message = build_user_message(
            "结构化执行输入",
            Some("@analysis 帮我分析一下今天的国际形势"),
            &[],
        );

        assert!(!message.is_user_visible());
        assert!(message.is_agent_visible());
    }

    #[test]
    fn build_user_message_keeps_plain_input_user_visible() {
        let message = build_user_message("普通用户输入", Some("普通用户输入"), &[]);

        assert!(message.is_user_visible());
        assert!(message.is_agent_visible());
    }

    #[test]
    fn prompt_skill_session_uses_skill_markdown_as_full_system_prompt() {
        let mut skill = build_loaded_skill(Some(vec!["read_file"]));
        skill.skill_name = "analysis".to_string();
        skill.markdown_content =
            "你是 Lime 的分析助手。\n\n## 输出格式（固定）\n# 分析结果".to_string();

        let session_config = build_prompt_session_config(
            "skill-session",
            &skill,
            Some("@analysis 帮我分析一下今天的国际形势"),
            Some("记忆补充"),
        );

        assert_eq!(session_config.system_prompt_override, Some(true));
        assert_eq!(session_config.include_context_trace, Some(true));
        let system_prompt = session_config.system_prompt.expect("system prompt");
        assert!(system_prompt.contains("你是 Lime 的分析助手"));
        assert!(system_prompt.contains("## 输出格式（固定）"));
        assert!(system_prompt.contains("记忆补充"));
        assert_eq!(
            session_config
                .turn_context
                .as_ref()
                .and_then(|context| context.user_visible_input_text.as_deref()),
            Some("@analysis 帮我分析一下今天的国际形势")
        );
        assert_eq!(
            session_config
                .turn_context
                .as_ref()
                .and_then(|context| context.metadata.get("subagent"))
                .and_then(|metadata| metadata.get("allowed_tools")),
            Some(&serde_json::json!(["read_file"]))
        );
    }

    #[test]
    fn workflow_step_session_uses_step_skill_prompt_as_full_system_prompt() {
        let mut skill = build_loaded_skill(None);
        skill.markdown_content = "Skill 主体指令".to_string();
        let step_prompt = build_step_system_prompt(
            &skill.markdown_content,
            "分析",
            1,
            2,
            "执行当前分析步骤",
            None,
        );

        let session_config = build_step_session_config("skill-step", step_prompt, None);

        assert_eq!(session_config.system_prompt_override, Some(true));
        assert_eq!(session_config.include_context_trace, Some(true));
        let system_prompt = session_config.system_prompt.expect("system prompt");
        assert!(system_prompt.contains("Skill 主体指令"));
        assert!(system_prompt.contains("## 当前步骤: 分析 (1/2)"));
        assert!(system_prompt.contains("执行当前分析步骤"));
    }
}
