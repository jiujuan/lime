use std::borrow::Cow;
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Instant;

use anyhow::{anyhow, Result};
use futures::FutureExt;
use rmcp::model::{Content, ErrorCode, ErrorData, Tool};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio_util::sync::CancellationToken;

use crate::agents::subagent_handler::run_complete_subagent_task;
use crate::agents::subagent_task_config::TaskConfig;
use crate::agents::tool_execution::ToolCallResult;
use crate::providers;
use crate::recipe::{Recipe, SubRecipe};
use crate::session::{
    create_subagent_session, persist_session_extension_data, SubagentSessionMetadata,
};

pub const AGENT_TOOL_NAME: &str = "Agent";
const SUBAGENT_TASK_SUMMARY_MAX_CHARS: usize = 160;

const SUMMARY_INSTRUCTIONS: &str = r#"
Important: Your parent agent will only receive your final message as a summary of your work.
Make sure your last message provides a comprehensive summary of:
- What you were asked to do
- What actions you took
- The results or outcomes
- Any important findings or recommendations

Be concise but complete.
"#;

#[derive(Debug, Deserialize)]
pub struct SubagentParams {
    pub instructions: Option<String>,
    pub subrecipe: Option<String>,
    pub role_hint: Option<String>,
    pub parameters: Option<HashMap<String, Value>>,
    pub extensions: Option<Vec<String>>,
    pub settings: Option<SubagentSettings>,
    #[serde(default = "default_summary")]
    pub summary: bool,
    pub images: Option<Vec<ImageData>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ImageData {
    pub data: String,
    pub mime_type: String,
}

fn default_summary() -> bool {
    true
}

#[derive(Debug, Deserialize)]
pub struct SubagentSettings {
    pub provider: Option<String>,
    pub model: Option<String>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Deserialize)]
struct AgentToolParams {
    description: String,
    prompt: String,
    #[serde(default)]
    subagent_type: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    run_in_background: bool,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    team_name: Option<String>,
    #[serde(default)]
    mode: Option<String>,
    #[serde(default)]
    isolation: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    allowed_tools: Vec<String>,
    #[serde(default)]
    disallowed_tools: Vec<String>,
    #[serde(default)]
    images: Option<Vec<ImageData>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentToolOutputBlock {
    #[serde(rename = "type")]
    kind: &'static str,
    text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentToolOutput {
    status: &'static str,
    agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    agent_type: Option<String>,
    content: Vec<AgentToolOutputBlock>,
    total_tool_use_count: u64,
    total_duration_ms: u64,
    total_tokens: u64,
    usage: Value,
    prompt: String,
}

pub fn create_subagent_tool(_sub_recipes: &[SubRecipe]) -> Tool {
    let description = build_tool_description();

    let schema = json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["description", "prompt"],
        "properties": {
            "description": {
                "type": "string",
                "description": "A short 3-5 word description of the delegated task."
            },
            "prompt": {
                "type": "string",
                "description": "The task for the agent to perform."
            },
            "subagent_type": {
                "type": "string",
                "description": "Optional specialized agent type. When it matches a local subrecipe, the runtime uses that recipe; otherwise it is treated as a role hint."
            },
            "model": {
                "type": "string",
                "description": "Optional model override for this agent."
            },
            "run_in_background": {
                "type": "boolean",
                "description": "Whether to launch the agent in the background. Requires a callback-backed agent runtime. In the current foreground-only runtime, true is rejected."
            },
            "name": {
                "type": "string",
                "description": "Optional display name for the agent. Callback-backed runtimes also use it as the teammate routing name. Team subagents can only spawn synchronous nested agents and must omit teammate fields."
            },
            "team_name": {
                "type": "string",
                "description": "Optional team name for teammate spawning. Requires `name` plus a callback-backed agent runtime with an existing team context. Team subagents must omit it."
            },
            "mode": {
                "type": "string",
                "description": "Optional teammate permission mode. Callback-backed runtimes forward it to the host runtime, which decides which values are supported."
            },
            "isolation": {
                "type": "string",
                "enum": ["worktree", "remote"],
                "description": "Optional isolation mode. Callback-backed runtimes forward it to the host runtime, which decides which values are supported."
            },
            "cwd": {
                "type": "string",
                "description": "Optional working directory override for the agent. The current runtime accepts an absolute path to an existing directory."
            },
            "allowed_tools": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Optional explicit tool allowlist. In callback-backed runtimes, this is enforced as session-scoped permissions."
            },
            "disallowed_tools": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Optional explicit tool denylist. Takes precedence over allowed_tools in callback-backed runtimes."
            },
            "images": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "data": {"type": "string", "description": "Base64 encoded image data"},
                        "mime_type": {"type": "string", "description": "MIME type of the image"}
                    },
                    "required": ["data", "mime_type"]
                },
                "description": "Images to include in the delegated agent task for multimodal analysis."
            }
        }
    });

    Tool::new(
        AGENT_TOOL_NAME,
        description,
        schema.as_object().unwrap().clone(),
    )
}

fn build_tool_description() -> String {
    String::from(
        "Launch a new agent to handle complex multi-step tasks autonomously.\n\n\
         Provide a short `description` plus a detailed `prompt`.\n\
         `subagent_type` is optional and becomes a role hint for a general delegated agent.\n\n\
         Without a callback-backed agent runtime, delegated agents execute only in the foreground. `run_in_background`, `team_name`, `mode`, and `isolation` are rejected, while `cwd` must be an absolute existing directory.\n\
         When callback-backed agent control is available, top-level sessions can launch async named or team-routed agents, forward `mode` / `isolation` to the host runtime, and honor `cwd` overrides.\n\
         Team subagents keep only the current synchronous nested-agent surface: they may call `Agent`, but must omit `run_in_background`, `name`, and `team_name`.",
    )
}

/// Note: SubRecipe.sequential_when_repeated is surfaced as a hint in the tool description
/// (e.g., "[run sequentially, not in parallel]") but not enforced. The LLM controls
/// sequencing by making sequential vs parallel tool calls.
pub fn handle_subagent_tool(
    params: Value,
    task_config: TaskConfig,
    sub_recipes: HashMap<String, SubRecipe>,
    working_dir: PathBuf,
    cancellation_token: Option<CancellationToken>,
) -> ToolCallResult {
    let agent_params: AgentToolParams = match serde_json::from_value(params) {
        Ok(p) => p,
        Err(e) => {
            return ToolCallResult::from(Err(ErrorData {
                code: ErrorCode::INVALID_PARAMS,
                message: Cow::from(format!("Invalid parameters: {}", e)),
                data: None,
            }));
        }
    };
    let cwd_override = match resolve_agent_cwd(agent_params.cwd.clone()) {
        Ok(path) => path,
        Err(message) => {
            return ToolCallResult::from(Err(ErrorData {
                code: ErrorCode::INVALID_PARAMS,
                message: Cow::from(message.to_string()),
                data: None,
            }));
        }
    };

    let (parsed_params, requested_agent_type, prompt) =
        match map_agent_tool_params(agent_params, &sub_recipes) {
            Ok(value) => value,
            Err(message) => {
                return ToolCallResult::from(Err(ErrorData {
                    code: ErrorCode::INVALID_PARAMS,
                    message: Cow::from(message.to_string()),
                    data: None,
                }));
            }
        };

    let recipe = match build_recipe(&parsed_params) {
        Ok(r) => r,
        Err(e) => {
            return ToolCallResult::from(Err(ErrorData {
                code: ErrorCode::INVALID_PARAMS,
                message: Cow::from(e.to_string()),
                data: None,
            }));
        }
    };

    ToolCallResult {
        notification_stream: None,
        result: Box::new(
            execute_subagent(
                recipe,
                task_config,
                parsed_params,
                requested_agent_type,
                prompt,
                cwd_override.unwrap_or(working_dir),
                cancellation_token,
            )
            .boxed(),
        ),
    }
}

fn normalize_required_text(value: String, field_name: &str) -> Result<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("{field_name} cannot be empty"));
    }

    Ok(trimmed.to_string())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn resolve_agent_cwd(value: Option<String>) -> Result<Option<PathBuf>> {
    let Some(cwd) = normalize_optional_text(value) else {
        return Ok(None);
    };

    let path = PathBuf::from(&cwd);
    if !path.is_absolute() {
        return Err(anyhow!("cwd must be an absolute path"));
    }
    if !path.is_dir() {
        return Err(anyhow!("cwd is not a directory: {cwd}"));
    }

    Ok(Some(path))
}

fn map_agent_tool_params(
    params: AgentToolParams,
    _sub_recipes: &HashMap<String, SubRecipe>,
) -> Result<(SubagentParams, Option<String>, String)> {
    let AgentToolParams {
        description,
        prompt,
        subagent_type,
        model,
        run_in_background,
        name,
        team_name,
        mode,
        isolation,
        cwd: _,
        allowed_tools,
        disallowed_tools,
        images,
    } = params;

    if run_in_background {
        return Err(anyhow!(
            "run_in_background is not supported in the current runtime; omit it or pass false"
        ));
    }
    if normalize_optional_text(team_name).is_some() {
        return Err(anyhow!("team_name is not supported in the current runtime"));
    }
    if normalize_optional_text(mode).is_some() {
        return Err(anyhow!("mode is not supported in the current runtime"));
    }
    if normalize_optional_text(isolation).is_some() {
        return Err(anyhow!("isolation is not supported in the current runtime"));
    }
    if !allowed_tools.is_empty() {
        return Err(anyhow!(
            "allowed_tools is only supported in callback-backed runtimes"
        ));
    }
    if !disallowed_tools.is_empty() {
        return Err(anyhow!(
            "disallowed_tools is only supported in callback-backed runtimes"
        ));
    }

    let description = normalize_required_text(description, "description")?;
    let prompt = normalize_required_text(prompt, "prompt")?;
    let requested_agent_type = normalize_optional_text(subagent_type);

    let instructions = if let Some(agent_type) = requested_agent_type.as_ref() {
        format!("Specialized agent hint: {agent_type}\n\n{prompt}")
    } else {
        prompt.clone()
    };

    Ok((
        SubagentParams {
            instructions: Some(instructions),
            subrecipe: None,
            role_hint: normalize_optional_text(name).or(Some(description)),
            parameters: None,
            extensions: None,
            settings: Some(SubagentSettings {
                provider: None,
                model: normalize_optional_text(model),
                temperature: None,
            }),
            summary: true,
            images,
        },
        requested_agent_type,
        prompt,
    ))
}

async fn execute_subagent(
    recipe: Recipe,
    task_config: TaskConfig,
    params: SubagentParams,
    requested_agent_type: Option<String>,
    prompt: String,
    working_dir: PathBuf,
    cancellation_token: Option<CancellationToken>,
) -> Result<rmcp::model::CallToolResult, ErrorData> {
    let start = Instant::now();
    let task_config = apply_settings_overrides(task_config, &params)
        .await
        .map_err(|e| ErrorData {
            code: ErrorCode::INVALID_PARAMS,
            message: Cow::from(e.to_string()),
            data: None,
        })?;

    let session =
        create_subagent_session(working_dir, build_subagent_session_name(&params, &recipe))
            .await
            .map_err(|e| ErrorData {
                code: ErrorCode::INTERNAL_ERROR,
                message: Cow::from(format!("Failed to create session: {}", e)),
                data: None,
            })?;

    persist_subagent_session_metadata(
        &session.id,
        &session,
        build_subagent_session_metadata(&task_config, &params, &recipe),
    )
    .await
    .map_err(|e| ErrorData {
        code: ErrorCode::INTERNAL_ERROR,
        message: Cow::from(format!(
            "Failed to persist subagent session metadata: {}",
            e
        )),
        data: None,
    })?;

    let agent_id = session.id.clone();
    let result = run_complete_subagent_task(
        recipe,
        task_config,
        params.summary,
        agent_id.clone(),
        params.images,
        cancellation_token,
    )
    .await;

    match result {
        Ok(text) => {
            let output = AgentToolOutput {
                status: "completed",
                agent_id,
                agent_type: requested_agent_type,
                content: vec![AgentToolOutputBlock { kind: "text", text }],
                total_tool_use_count: 0,
                total_duration_ms: start.elapsed().as_millis().min(u64::MAX as u128) as u64,
                total_tokens: 0,
                usage: json!({
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "cache_creation_input_tokens": Value::Null,
                    "cache_read_input_tokens": Value::Null,
                    "server_tool_use": Value::Null,
                    "service_tier": Value::Null,
                    "cache_creation": Value::Null,
                }),
                prompt,
            };
            Ok(rmcp::model::CallToolResult {
                content: vec![Content::text(
                    serde_json::to_string_pretty(&output).unwrap_or_else(|_| {
                        "{\"status\":\"completed\",\"content\":[{\"type\":\"text\",\"text\":\"Agent finished\"}]}".to_string()
                    }),
                )],
                structured_content: None,
                is_error: Some(false),
                meta: None,
            })
        }
        Err(e) => Err(ErrorData {
            code: ErrorCode::INTERNAL_ERROR,
            message: Cow::from(e.to_string()),
            data: None,
        }),
    }
}

fn build_subagent_session_metadata(
    task_config: &TaskConfig,
    params: &SubagentParams,
    recipe: &Recipe,
) -> SubagentSessionMetadata {
    SubagentSessionMetadata::new(task_config.parent_session_id.clone())
        .with_task_summary(build_subagent_task_summary(params, recipe))
        .with_role_hint(build_subagent_role_hint(params))
        .with_created_from_turn_id(resolve_parent_turn_id(&task_config.parent_session_id))
}

fn build_subagent_task_summary(params: &SubagentParams, recipe: &Recipe) -> Option<String> {
    let subrecipe_name = params
        .subrecipe
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let instruction_preview = params
        .instructions
        .as_deref()
        .map(normalize_whitespace)
        .filter(|value| !value.is_empty())
        .map(|value| truncate_chars(&value, SUBAGENT_TASK_SUMMARY_MAX_CHARS));

    match (subrecipe_name, instruction_preview) {
        (Some(subrecipe), Some(instruction)) => Some(truncate_chars(
            &format!("Run subrecipe `{}`: {}", subrecipe, instruction),
            SUBAGENT_TASK_SUMMARY_MAX_CHARS,
        )),
        (Some(subrecipe), None) => Some(truncate_chars(
            &format!("Run subrecipe `{}`", subrecipe),
            SUBAGENT_TASK_SUMMARY_MAX_CHARS,
        )),
        (None, Some(instruction)) => Some(instruction),
        (None, None) => {
            let title = recipe.title.trim();
            if title.is_empty() {
                None
            } else {
                Some(truncate_chars(title, SUBAGENT_TASK_SUMMARY_MAX_CHARS))
            }
        }
    }
}

fn build_subagent_role_hint(params: &SubagentParams) -> Option<String> {
    normalize_subagent_label(params.role_hint.as_deref())
        .or_else(|| normalize_subagent_label(params.subrecipe.as_deref()))
}

fn resolve_parent_turn_id(parent_session_id: &str) -> Option<String> {
    let scope = crate::session_context::current_action_scope()?;
    if scope.session_id.as_deref() != Some(parent_session_id) {
        return None;
    }

    normalize_optional_identifier(scope.turn_id)
}

fn build_subagent_session_name(params: &SubagentParams, recipe: &Recipe) -> String {
    build_subagent_role_hint(params)
        .or_else(|| {
            build_subagent_task_summary(params, recipe)
                .map(|summary| truncate_chars(&summary, SUBAGENT_TASK_SUMMARY_MAX_CHARS))
        })
        .unwrap_or_else(|| "Subagent task".to_string())
}

fn normalize_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_subagent_label(value: Option<&str>) -> Option<String> {
    let normalized = value
        .map(normalize_whitespace)
        .unwrap_or_default()
        .trim()
        .to_string();

    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn normalize_optional_identifier(value: Option<String>) -> Option<String> {
    let normalized = value?.trim().to_string();
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }

    if max_chars <= 3 {
        return value.chars().take(max_chars).collect();
    }

    let truncated: String = value.chars().take(max_chars - 3).collect();
    format!("{}...", truncated)
}

async fn persist_subagent_session_metadata(
    session_id: &str,
    session: &crate::session::Session,
    metadata: SubagentSessionMetadata,
) -> Result<()> {
    let extension_data = metadata.into_updated_extension_data(session)?;
    persist_session_extension_data(session_id, extension_data).await
}

fn build_recipe(params: &SubagentParams) -> Result<Recipe> {
    let mut recipe = build_adhoc_recipe(params)?;

    if params.summary {
        let current = recipe.instructions.unwrap_or_default();
        recipe.instructions = Some(format!("{}\n{}", current, SUMMARY_INSTRUCTIONS));
    }

    Ok(recipe)
}

fn build_adhoc_recipe(params: &SubagentParams) -> Result<Recipe> {
    let instructions = params
        .instructions
        .as_ref()
        .ok_or_else(|| anyhow!("Instructions required for ad-hoc task"))?;

    let recipe = Recipe::builder()
        .version("1.0.0")
        .title("Agent Task")
        .description("Ad-hoc delegated agent task")
        .instructions(instructions)
        .build()
        .map_err(|e| anyhow!("Failed to build recipe: {}", e))?;

    if recipe.check_for_security_warnings() {
        return Err(anyhow!("Recipe contains potentially harmful content"));
    }

    Ok(recipe)
}

async fn apply_settings_overrides(
    mut task_config: TaskConfig,
    params: &SubagentParams,
) -> Result<TaskConfig> {
    if let Some(settings) = &params.settings {
        let current_model_config = task_config.provider.get_model_config();
        let provider_override = settings
            .provider
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        let model_override = settings
            .model
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);

        if provider_override.is_some() || model_override.is_some() || settings.temperature.is_some()
        {
            let provider_name = provider_override
                .clone()
                .unwrap_or_else(|| task_config.provider.get_name().to_string());
            let resolved_model_name = if let Some(model) = model_override.as_deref() {
                model.to_string()
            } else if provider_override.is_some() {
                providers::create_with_default_model(&provider_name)
                    .await
                    .map_err(|e| {
                        anyhow!(
                            "Failed to resolve default model for provider '{}': {}",
                            provider_name,
                            e
                        )
                    })?
                    .get_model_config()
                    .model_name
            } else {
                current_model_config.model_name.clone()
            };

            let mut model_config = current_model_config
                .rebuild_with_model_name(&resolved_model_name)
                .map_err(|e| {
                    anyhow!(
                        "Failed to rebuild model config for model '{}': {}",
                        resolved_model_name,
                        e
                    )
                })?;

            if let Some(temp) = settings.temperature {
                model_config = model_config.with_temperature(Some(temp));
            }

            task_config.provider = providers::create(&provider_name, model_config)
                .await
                .map_err(|e| anyhow!("Failed to create provider '{}': {}", provider_name, e))?;

            if provider_override.is_some() || model_override.is_some() {
                let turn_context = task_config
                    .turn_context
                    .get_or_insert_with(crate::session::TurnContextOverride::default);
                turn_context.model = Some(task_config.provider.get_model_config().model_name);
            }
        }
    }

    if let Some(extension_names) = &params.extensions {
        if extension_names.is_empty() {
            task_config.extensions = Vec::new();
        } else {
            task_config
                .extensions
                .retain(|ext| extension_names.contains(&ext.name()));
        }
    }

    Ok(task_config)
}
