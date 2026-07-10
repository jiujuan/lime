use anyhow::Result;
use std::sync::Arc;
use std::time::Instant;

use async_stream::try_stream;
use futures::stream::StreamExt;
use serde_json::Value;
use tracing::debug;
use uuid::Uuid;

use super::super::agents::Agent;
use crate::conversation::message::{Message, MessageContent, ToolRequest};
use crate::conversation::Conversation;
use crate::model::ModelConfig;
use crate::providers::base::{stream_from_single_message, MessageStream, Provider, ProviderUsage};
use crate::providers::errors::ProviderError;
use crate::providers::toolshim::{
    augment_message_with_tool_calls, convert_tool_messages_to_text,
    modify_system_prompt_for_tool_json, OllamaInterpreter,
};
use crate::session_context::current_turn_context;
use crate::tools::{ToolRegistry, VIEW_IMAGE_TOOL_NAME};

use crate::agents::code_execution_extension::EXTENSION_NAME as CODE_EXECUTION_EXTENSION;
use crate::agents::subagent_tool::AGENT_TOOL_NAME;
use crate::agents::tool_argument_coercion::coerce_tool_arguments;
use crate::session::{
    apply_session_update, query_session, SessionStore, TokenStatsUpdate, TurnContextOverride,
};
use model_provider::provider_stream::{
    provider_stream_first_text_delta_chars,
    provider_stream_image_input_policy_disables_provider_images,
    provider_stream_model_supports_image_input, provider_stream_plaintext_tool_use_is_complete,
    provider_stream_plaintext_tool_use_progress, provider_stream_plaintext_tool_use_start,
    provider_stream_plaintext_tool_uses, provider_stream_should_omit_image_input,
    RuntimeReplyProviderPlaintextToolCall, RuntimeReplyProviderSamplingMode,
    RuntimeReplyProviderSamplingRequest, RuntimeReplyProviderStreamProgress,
    PROVIDER_STREAM_PLAINTEXT_TOOL_USE_PROVIDER,
};
use rmcp::model::{CallToolRequestParam, Content, Tool};
use tool_runtime::tool_call_surface::{
    runtime_tool_call_normalize_arguments, runtime_tool_call_surface_name,
};
use tool_runtime::turn_tool_surface::{
    runtime_turn_tool_scope_allows_tool_name, runtime_turn_tool_scope_from_metadata,
    runtime_turn_tool_surface_allows_tool_name, runtime_turn_tool_surface_is_direct_answer,
    runtime_turn_tool_surface_mode_from_metadata, runtime_turn_tool_surface_prompt_guidance,
    runtime_turn_tool_surface_should_load_workspace_hints,
    runtime_turn_tool_surface_should_strip_extension_prompt_context, RuntimeTurnToolScope,
    RuntimeTurnToolSurfaceMode, RUNTIME_METADATA_KEY,
};

fn current_turn_image_input_policy_disables_provider_images() -> bool {
    let Some(turn_context) = current_turn_context() else {
        return false;
    };

    provider_stream_image_input_policy_disables_provider_images(
        turn_context.metadata.get(RUNTIME_METADATA_KEY),
    )
}

fn current_turn_should_omit_provider_image_input(model_supports_image_input: Option<bool>) -> bool {
    let Some(turn_context) = current_turn_context() else {
        return provider_stream_should_omit_image_input(model_supports_image_input, None);
    };

    provider_stream_should_omit_image_input(
        model_supports_image_input,
        turn_context.metadata.get(RUNTIME_METADATA_KEY),
    )
}

fn filter_tools_for_image_input_support(
    mut tools: Vec<Tool>,
    model_supports_image_input: Option<bool>,
) -> Vec<Tool> {
    if current_turn_should_omit_provider_image_input(model_supports_image_input) {
        tools.retain(|tool| tool.name.as_ref() != VIEW_IMAGE_TOOL_NAME);
    }
    tools
}

fn first_text_delta_chars(message: &Message) -> Option<usize> {
    provider_stream_first_text_delta_chars(message.content.iter().filter_map(|content| {
        let MessageContent::Text(text) = content else {
            return None;
        };
        Some(text.text.as_str())
    }))
}

fn trace_first_provider_text_delta(
    progress: &mut RuntimeReplyProviderStreamProgress,
    provider_name: &str,
    model_name: &str,
    started_at: &Instant,
    message: &Message,
) {
    let Some(chars) = progress.note_first_text_delta(first_text_delta_chars(message)) else {
        return;
    };
    tracing::info!(
        "[AsterAgent][TTFT] first provider text delta decoded: provider={}, model={}, elapsed_ms={}, chars={}",
        provider_name,
        model_name,
        started_at.elapsed().as_millis(),
        chars
    );
}

fn strip_images_for_text_only_provider(messages: &[Message]) -> Conversation {
    let mut removed_total = 0usize;
    let stripped_messages = messages
        .iter()
        .cloned()
        .map(|mut message| {
            let mut removed_from_message = 0usize;

            let mut stripped_content = Vec::with_capacity(message.content.len());
            for mut content in std::mem::take(&mut message.content) {
                match &mut content {
                    MessageContent::Image(_) => {
                        removed_from_message += 1;
                    }
                    MessageContent::ToolResponse(tool_response) => {
                        if let Ok(result) = tool_response.tool_result.as_mut() {
                            let before = result.content.len();
                            result.content.retain(|content| content.as_image().is_none());
                            let removed_from_tool_result = before.saturating_sub(result.content.len());
                            if removed_from_tool_result > 0 {
                                removed_from_message += removed_from_tool_result;
                                result.content.push(Content::text(format!(
                                    "[系统提示] 这个工具结果包含 {} 张图片，但当前模型不支持图片输入；图片已在发送给模型前省略。",
                                    removed_from_tool_result
                                )));
                            }
                        }
                        stripped_content.push(content);
                    }
                    _ => stripped_content.push(content),
                }
            }
            message.content = stripped_content;

            if removed_from_message > 0 {
                removed_total += removed_from_message;
                message = message.with_text(format!(
                    "[系统提示] 这条历史消息包含 {} 张图片，但当前模型不支持图片输入；图片已在发送给模型前省略。",
                    removed_from_message
                ));
            }

            message
        })
        .collect::<Vec<_>>();

    if removed_total > 0 {
        tracing::warn!(
            removed_total,
            "[AsterAgent] 当前模型不支持图片输入，已在 provider 请求前省略图片内容"
        );
    }

    Conversation::new_unvalidated(stripped_messages)
}

fn resolve_turn_tool_surface_mode() -> Option<RuntimeTurnToolSurfaceMode> {
    current_turn_context()
        .as_ref()
        .and_then(|context| runtime_turn_tool_surface_mode_from_metadata(&context.metadata))
}

pub(super) fn turn_context_tool_surface_direct_answer(
    turn_context: Option<&TurnContextOverride>,
) -> bool {
    let mode = turn_context
        .and_then(|context| runtime_turn_tool_surface_mode_from_metadata(&context.metadata));
    runtime_turn_tool_surface_is_direct_answer(mode.as_ref())
}

fn resolve_turn_tool_scope() -> RuntimeTurnToolScope {
    current_turn_context()
        .as_ref()
        .map(|context| runtime_turn_tool_scope_from_metadata(&context.metadata))
        .unwrap_or_default()
}

fn filter_tools_for_turn_scope(
    mut tools: Vec<Tool>,
    tool_scope: &RuntimeTurnToolScope,
    tool_registry: Option<&ToolRegistry>,
) -> Vec<Tool> {
    let canonical_name =
        |name: &str| tool_registry.and_then(|registry| registry.canonical_name(name));
    tools.retain(|tool| {
        runtime_turn_tool_scope_allows_tool_name(&tool.name, tool_scope, &canonical_name)
    });
    tools
}

fn filter_tools_for_turn_surface(
    mut tools: Vec<Tool>,
    tool_surface_mode: Option<&RuntimeTurnToolSurfaceMode>,
    tool_scope: &RuntimeTurnToolScope,
    tool_registry: Option<&ToolRegistry>,
) -> Vec<Tool> {
    let canonical_name =
        |name: &str| tool_registry.and_then(|registry| registry.canonical_name(name));
    tools.retain(|tool| {
        runtime_turn_tool_surface_allows_tool_name(
            &tool.name,
            tool_surface_mode,
            &tool_scope.allowed_tools,
            &canonical_name,
        )
    });
    tools
}

fn normalize_response_tool_requests(response: &Message, tool_requests: &[ToolRequest]) -> Message {
    let mut normalized_response = response.clone();
    let mut normalized_content = Vec::with_capacity(response.content.len());
    let mut tool_request_index = 0;

    for content in &response.content {
        match content {
            MessageContent::ToolRequest(_) => {
                if let Some(request) = tool_requests.get(tool_request_index) {
                    normalized_content.push(MessageContent::ToolRequest(request.clone()));
                }
                tool_request_index += 1;
            }
            _ => normalized_content.push(content.clone()),
        }
    }

    debug_assert_eq!(
        tool_request_index,
        tool_requests.len(),
        "normalized tool request count should match response tool request count",
    );

    normalized_response.content = normalized_content;
    normalized_response
}

fn provider_plaintext_tool_call_to_request(
    tool_call: RuntimeReplyProviderPlaintextToolCall,
) -> CallToolRequestParam {
    CallToolRequestParam {
        name: tool_call.name.into(),
        arguments: tool_call.arguments,
    }
}

fn assistant_single_text_content(message: &Message) -> Option<&str> {
    if message.role != rmcp::model::Role::Assistant || message.content.len() != 1 {
        return None;
    }

    message.content.first()?.as_text()
}

fn message_with_single_text(message: &Message, text: String) -> Message {
    let mut next = message.clone();
    next.content = vec![MessageContent::text(text)];
    next
}

fn normalize_plaintext_tool_use_message(message: Message) -> Message {
    normalize_plaintext_tool_use_message_with_ids(message, &[])
}

fn normalize_plaintext_tool_use_message_with_ids(
    message: Message,
    preallocated_tool_ids: &[String],
) -> Message {
    if message.role != rmcp::model::Role::Assistant
        || message
            .content
            .iter()
            .any(|content| matches!(content, MessageContent::ToolRequest(_)))
    {
        return message;
    }

    let mut normalized_message = message;
    let original_content = std::mem::take(&mut normalized_message.content);
    let mut normalized_content = Vec::with_capacity(original_content.len());
    let mut converted_any = false;

    for content in original_content {
        match content {
            MessageContent::Text(text) if !converted_any => {
                if let Some(plaintext_tool_use) = provider_stream_plaintext_tool_uses(&text.text) {
                    converted_any = true;
                    let visible_prefix = plaintext_tool_use.prefix.trim();
                    if !visible_prefix.is_empty() {
                        normalized_content.push(MessageContent::text(visible_prefix.to_string()));
                    }
                    for (idx, tool_call) in plaintext_tool_use.tool_calls.into_iter().enumerate() {
                        let tool_request_id = preallocated_tool_ids
                            .get(idx)
                            .cloned()
                            .unwrap_or_else(|| Uuid::new_v4().to_string());
                        normalized_content.push(MessageContent::tool_request(
                            tool_request_id,
                            Ok(provider_plaintext_tool_call_to_request(tool_call)),
                        ));
                    }
                } else {
                    normalized_content.push(MessageContent::Text(text));
                }
            }
            MessageContent::Text(_) if converted_any => {
                // 模型在 XML tool_use 后追加的自然语言通常是“未暴露工具”的误判结论；
                // 工具已被提升为结构化调用后，后续结论应由下一轮基于工具结果生成。
            }
            other => normalized_content.push(other),
        }
    }

    if converted_any {
        normalized_message.content = normalized_content;
        normalized_message
    } else {
        normalized_message.content = normalized_content;
        normalized_message
    }
}

#[derive(Default)]
struct PlaintextToolUseStreamNormalizer {
    pending_message: Option<Message>,
    pending_text: String,
    pending_tool_ids: Vec<String>,
}

impl PlaintextToolUseStreamNormalizer {
    fn finish(&mut self) -> Option<Message> {
        let pending_message = self.pending_message.take()?;
        let pending_text = std::mem::take(&mut self.pending_text);
        self.pending_tool_ids.clear();
        Some(message_with_single_text(&pending_message, pending_text))
    }

    fn finish_normalized(&mut self) -> Option<Message> {
        let pending_message = self.pending_message.take()?;
        let pending_text = std::mem::take(&mut self.pending_text);
        let pending_tool_ids = std::mem::take(&mut self.pending_tool_ids);
        Some(normalize_plaintext_tool_use_message_with_ids(
            message_with_single_text(&pending_message, pending_text),
            &pending_tool_ids,
        ))
    }

    fn pending_tool_input_delta(&self, base: &Message, delta_text: &str) -> Option<Message> {
        let tool_id = self.pending_tool_ids.first()?;
        let progress =
            provider_stream_plaintext_tool_use_progress(self.pending_text.as_str(), delta_text)?;
        let mut message = base.clone();
        message.content = vec![MessageContent::tool_input_delta(
            tool_id.clone(),
            progress.tool_name,
            progress.delta,
            progress.accumulated_arguments,
            Some(PROVIDER_STREAM_PLAINTEXT_TOOL_USE_PROVIDER.to_string()),
        )];
        Some(message)
    }

    fn process(&mut self, response: Message) -> Vec<Message> {
        if self.pending_message.is_some() {
            if let Some(text) = assistant_single_text_content(&response) {
                self.pending_text.push_str(text);
                if provider_stream_plaintext_tool_use_is_complete(&self.pending_text) {
                    if let Some(message) = self.finish_normalized() {
                        return vec![message];
                    }
                }
                return self
                    .pending_tool_input_delta(&response, text)
                    .into_iter()
                    .collect();
            }

            let mut output = Vec::new();
            if let Some(pending) = self.finish() {
                output.push(normalize_plaintext_tool_use_message(pending));
            }
            output.extend(self.process(response));
            return output;
        }

        let Some(text) = assistant_single_text_content(&response) else {
            return vec![normalize_plaintext_tool_use_message(response)];
        };
        let Some(tool_start) = provider_stream_plaintext_tool_use_start(text) else {
            return vec![normalize_plaintext_tool_use_message(response)];
        };
        if provider_stream_plaintext_tool_use_is_complete(text) {
            return vec![normalize_plaintext_tool_use_message(response)];
        }

        let prefix = text[..tool_start].trim().to_string();
        let pending = text[tool_start..].to_string();
        let mut output = Vec::new();
        if !prefix.trim().is_empty() {
            output.push(message_with_single_text(&response, prefix));
        }

        let mut pending_message = response;
        pending_message.content.clear();
        let tool_id = Uuid::new_v4().to_string();
        self.pending_message = Some(pending_message);
        self.pending_tool_ids = vec![tool_id];
        self.pending_text.push_str(&pending);
        if let Some(pending_message) = self.pending_message.as_ref() {
            if let Some(delta_message) =
                self.pending_tool_input_delta(pending_message, self.pending_text.as_str())
            {
                output.push(delta_message);
            }
        }
        output
    }
}

async fn toolshim_postprocess(
    response: Message,
    toolshim_tools: &[Tool],
    toolshim_model: Option<&str>,
) -> Result<Message, ProviderError> {
    let interpreter = OllamaInterpreter::new_with_model(toolshim_model.map(str::to_string))
        .map_err(|e| {
            ProviderError::ExecutionError(format!("Failed to create OllamaInterpreter: {}", e))
        })?;

    augment_message_with_tool_calls(&interpreter, response, toolshim_tools)
        .await
        .map_err(|e| ProviderError::ExecutionError(format!("Failed to augment message: {}", e)))
}

impl Agent {
    pub async fn prepare_tools_and_prompt(
        &self,
        working_dir: &std::path::Path,
        session_prompt: Option<&str>,
        session_prompt_override: bool,
        model_config: &ModelConfig,
    ) -> Result<(Vec<Tool>, Vec<Tool>, String)> {
        let started_at = Instant::now();
        let turn_tool_surface_mode = resolve_turn_tool_surface_mode();
        let direct_answer_surface =
            runtime_turn_tool_surface_is_direct_answer(turn_tool_surface_mode.as_ref());

        let mut tools = if direct_answer_surface {
            Vec::new()
        } else {
            // Get tools from extension manager
            let mut tools = self.list_tools(None).await;

            // Add frontend tools
            let frontend_tools = self.frontend_tools.lock().await;
            for frontend_tool in frontend_tools.values() {
                tools.push(frontend_tool.tool.clone());
            }
            tools
        };

        let code_execution_active = if direct_answer_surface {
            false
        } else {
            self.extension_manager
                .is_extension_enabled(CODE_EXECUTION_EXTENSION)
                .await
        };
        if code_execution_active && turn_tool_surface_mode.is_none() {
            let code_exec_prefix = format!("{CODE_EXECUTION_EXTENSION}__");
            tools.retain(|tool| tool.name.starts_with(&code_exec_prefix));
        }

        let turn_tool_scope = resolve_turn_tool_scope();
        let tool_registry = self.tool_registry.read().await;
        tools = filter_tools_for_turn_surface(
            tools,
            turn_tool_surface_mode.as_ref(),
            &turn_tool_scope,
            Some(&tool_registry),
        );
        tools = filter_tools_for_turn_scope(tools, &turn_tool_scope, Some(&tool_registry));
        drop(tool_registry);
        if !tools.is_empty() {
            let provider_name = self
                .provider()
                .await
                .ok()
                .map(|provider| provider.get_name().to_string());
            let model_supports_image_input = provider_name.as_deref().and_then(|name| {
                provider_stream_model_supports_image_input(name, &model_config.model_name)
            });
            tools = filter_tools_for_image_input_support(tools, model_supports_image_input);
        }
        let subagents_enabled = tools.iter().any(|tool| tool.name == AGENT_TOOL_NAME);

        // Stable tool ordering is important for multi session prompt caching.
        tools.sort_by(|a, b| a.name.cmp(&b.name));

        // Prepare system prompt
        let strip_extension_prompt_context =
            runtime_turn_tool_surface_should_strip_extension_prompt_context(
                turn_tool_surface_mode.as_ref(),
            );
        let (extensions_info, extension_count, tool_count) = if strip_extension_prompt_context {
            (Vec::new(), 0, tools.len())
        } else {
            let extensions_info = self.extension_manager.get_extensions_info().await;
            let (extension_count, tool_count) =
                self.extension_manager.get_extension_and_tool_counts().await;
            (extensions_info, extension_count, tool_count)
        };

        let final_output_instruction = self
            .final_output_tool
            .lock()
            .await
            .as_ref()
            .map(|tool| tool.system_prompt());
        let frontend_instructions = if direct_answer_surface {
            None
        } else {
            self.frontend_instructions.lock().await.clone()
        };

        let prompt_manager = self.prompt_manager.lock().await;
        let mut prompt_builder = prompt_manager
            .builder()
            .with_extensions(extensions_info.into_iter())
            .with_frontend_instructions(frontend_instructions)
            .with_additional_instruction(final_output_instruction)
            .with_extension_and_tool_counts(extension_count, tool_count)
            .with_code_execution_mode(code_execution_active)
            .with_enable_subagents(subagents_enabled)
            .with_session_prompt(session_prompt.map(|s| s.to_string()))
            .with_session_prompt_override(session_prompt_override)
            .with_capabilities_layer(!direct_answer_surface);
        if runtime_turn_tool_surface_should_load_workspace_hints(turn_tool_surface_mode.as_ref()) {
            prompt_builder = prompt_builder.with_hints(working_dir);
        }
        let mut system_prompt = prompt_builder.build();
        if let Some(guidance) =
            runtime_turn_tool_surface_prompt_guidance(turn_tool_surface_mode.as_ref())
        {
            system_prompt.push_str("\n\n");
            system_prompt.push_str(guidance);
        }
        // Handle toolshim if enabled
        let mut toolshim_tools = vec![];
        if model_config.toolshim {
            // If tool interpretation is enabled, modify the system prompt
            system_prompt = modify_system_prompt_for_tool_json(&system_prompt, &tools);
            // Make a copy of tools before emptying
            toolshim_tools = tools.clone();
            // Empty the tools vector for provider completion
            tools = vec![];
        }

        tracing::info!(
            "[AsterAgent][TTFT] tools/prompt prepared: model={}, tool_surface={:?}, tools={}, toolshim_tools={}, system_chars={}, elapsed_ms={}",
            model_config.model_name,
            turn_tool_surface_mode,
            tools.len(),
            toolshim_tools.len(),
            system_prompt.chars().count(),
            started_at.elapsed().as_millis()
        );

        Ok((tools, toolshim_tools, system_prompt))
    }

    /// Stream a response from the LLM provider.
    /// Handles toolshim transformations if needed
    pub(crate) async fn stream_response_from_provider(
        provider: Arc<dyn Provider>,
        model_config: &ModelConfig,
        system_prompt: &str,
        messages: &[Message],
        tools: &[Tool],
        toolshim_tools: &[Tool],
    ) -> Result<MessageStream, ProviderError> {
        let started_at = Instant::now();
        // Convert tool messages to text if toolshim is enabled
        let messages_for_provider = if model_config.toolshim {
            convert_tool_messages_to_text(messages)
        } else {
            Conversation::new_unvalidated(messages.to_vec())
        };
        let messages_for_provider = if current_turn_image_input_policy_disables_provider_images() {
            strip_images_for_text_only_provider(messages_for_provider.messages())
        } else {
            messages_for_provider
        };

        // Clone owned data to move into the async stream
        let model_config = model_config.clone();
        let system_prompt = system_prompt.to_owned();
        let tools = tools.to_owned();
        let toolshim_tools = toolshim_tools.to_owned();
        let provider = provider.clone();
        let turn_tool_surface_mode = resolve_turn_tool_surface_mode();
        let direct_answer_surface =
            runtime_turn_tool_surface_is_direct_answer(turn_tool_surface_mode.as_ref());
        let sampling_request = RuntimeReplyProviderSamplingRequest::new(
            provider.get_name(),
            model_config.model_name.clone(),
            messages_for_provider.messages().len(),
            tools.len(),
            system_prompt.chars().count(),
            turn_tool_surface_mode
                .as_ref()
                .map(|mode| mode.as_str().to_string()),
            provider.supports_streaming(),
        );

        // Capture errors during stream creation and return them as part of the stream
        // so they can be handled by the existing error handling logic in the agent
        let stream_result = if sampling_request.sampling_mode()
            == RuntimeReplyProviderSamplingMode::Streaming
        {
            tracing::info!(
                "[AsterAgent][TTFT] provider stream request start: provider={}, model={}, messages={}, tools={}, tool_surface={:?}, system_chars={}",
                sampling_request.provider_name,
                sampling_request.model_name,
                sampling_request.message_count,
                sampling_request.tool_count,
                sampling_request.tool_surface,
                sampling_request.system_chars
            );
            debug!("WAITING_LLM_STREAM_START");
            let result = provider
                .stream_with_model(
                    &model_config,
                    system_prompt.as_str(),
                    messages_for_provider.messages(),
                    &tools,
                )
                .await;
            let elapsed_ms = started_at.elapsed().as_millis();
            match &result {
                Ok(_) => tracing::info!(
                    "[AsterAgent][TTFT] provider stream response headers received: provider={}, model={}, elapsed_ms={}",
                    sampling_request.provider_name,
                    sampling_request.model_name,
                    elapsed_ms
                ),
                Err(error) => {
                    if error.is_non_retryable_provider_rejection() {
                        tracing::info!(
                            "[AsterAgent][TTFT] provider stream request rejected before body: provider={}, model={}, elapsed_ms={}, error={}",
                            sampling_request.provider_name,
                            sampling_request.model_name,
                            elapsed_ms,
                            error
                        );
                    } else {
                        tracing::warn!(
                            "[AsterAgent][TTFT] provider stream request failed before body: provider={}, model={}, elapsed_ms={}, error={}",
                            sampling_request.provider_name,
                            sampling_request.model_name,
                            elapsed_ms,
                            error
                        );
                    }
                }
            }
            debug!("WAITING_LLM_STREAM_END");
            result
        } else {
            tracing::info!(
                "[AsterAgent][TTFT] provider non-stream request start: provider={}, model={}, messages={}, tools={}, tool_surface={:?}, system_chars={}",
                sampling_request.provider_name,
                sampling_request.model_name,
                sampling_request.message_count,
                sampling_request.tool_count,
                sampling_request.tool_surface,
                sampling_request.system_chars
            );
            debug!("WAITING_LLM_START");
            let complete_result = provider
                .complete_with_model(
                    &model_config,
                    system_prompt.as_str(),
                    messages_for_provider.messages(),
                    &tools,
                )
                .await;
            tracing::info!(
                "[AsterAgent][TTFT] provider non-stream response complete: provider={}, model={}, elapsed_ms={}",
                sampling_request.provider_name,
                sampling_request.model_name,
                started_at.elapsed().as_millis()
            );
            debug!("WAITING_LLM_END");

            match complete_result {
                Ok((message, usage)) => Ok(stream_from_single_message(message, usage)),
                Err(e) => Err(e),
            }
        };

        // If there was an error creating the stream, return a stream that yields that error
        let mut stream = match stream_result {
            Ok(s) => s,
            Err(e) => {
                // Return a stream that immediately yields the error
                // This allows the error to be caught by existing error handling in agent.rs
                return Ok(Box::pin(try_stream! {
                    yield Err(e)?;
                }));
            }
        };

        Ok(Box::pin(try_stream! {
            let mut provider_stream_progress = RuntimeReplyProviderStreamProgress::new();
            let mut plaintext_tool_use_normalizer = PlaintextToolUseStreamNormalizer::default();
            while let Some(next) = stream.next().await {
                let (mut message, usage) = match next {
                    Ok(next) => next,
                    Err(error)
                        if provider_stream_progress.should_retry_empty_first_content(&error) =>
                    {
                        tracing::warn!(
                            "[AsterAgent][TTFT] empty provider stream before first message, retrying non-stream fallback: provider={}, model={}, elapsed_ms={}, error={}",
                            sampling_request.provider_name,
                            sampling_request.model_name,
                            started_at.elapsed().as_millis(),
                            error
                        );
                        let (message, usage) = provider
                            .complete_with_model(
                                &model_config,
                                system_prompt.as_str(),
                                messages_for_provider.messages(),
                                &tools,
                            )
                            .await?;
                        (Some(message), Some(usage))
                    }
                    Err(error) => Err(error)?,
                };
                if provider_stream_progress.note_first_content(message.is_some()) {
                    tracing::info!(
                        "[AsterAgent][TTFT] first provider stream message decoded: provider={}, model={}, elapsed_ms={}",
                        provider.get_name(),
                        model_config.model_name,
                        started_at.elapsed().as_millis()
                    );
                }
                // Store the model information in the global store
                if let Some(usage) = usage.as_ref() {
                    crate::providers::base::set_current_model(&usage.model);
                }

                // Post-process / structure the response only if tool interpretation is enabled
                if message.is_some() && model_config.toolshim {
                    message = Some(
                        toolshim_postprocess(
                            message.unwrap(),
                            &toolshim_tools,
                            model_config.toolshim_model.as_deref(),
                        )
                        .await?,
                    );
                }
                if let Some(response) = message.take() {
                    let mut usage_to_emit = usage;
                    if direct_answer_surface {
                        trace_first_provider_text_delta(
                            &mut provider_stream_progress,
                            provider.get_name(),
                            &model_config.model_name,
                            &started_at,
                            &response,
                        );
                        yield (Some(response), usage_to_emit.take());
                        if usage_to_emit.is_some() {
                            yield (None, usage_to_emit);
                        }
                        continue;
                    }
                    let normalized_messages = plaintext_tool_use_normalizer.process(response);
                    let mut emitted_message = false;
                    for normalized_message in normalized_messages {
                        trace_first_provider_text_delta(
                            &mut provider_stream_progress,
                            provider.get_name(),
                            &model_config.model_name,
                            &started_at,
                            &normalized_message,
                        );
                        emitted_message = true;
                        yield (Some(normalized_message), usage_to_emit.take());
                    }
                    if usage_to_emit.is_some() {
                        if let Some(pending_message) = plaintext_tool_use_normalizer.finish() {
                            let pending_message = normalize_plaintext_tool_use_message(pending_message);
                            trace_first_provider_text_delta(
                                &mut provider_stream_progress,
                                provider.get_name(),
                                &model_config.model_name,
                                &started_at,
                                &pending_message,
                            );
                            emitted_message = true;
                            yield (
                                Some(pending_message),
                                usage_to_emit.take(),
                            );
                        }
                    }
                    if !emitted_message && usage_to_emit.is_some() {
                        yield (None, usage_to_emit);
                    }
                    continue;
                }

                yield (message, usage);
            }
            if let Some(pending_message) = plaintext_tool_use_normalizer.finish() {
                let pending_message = normalize_plaintext_tool_use_message(pending_message);
                trace_first_provider_text_delta(
                    &mut provider_stream_progress,
                    provider.get_name(),
                    &model_config.model_name,
                    &started_at,
                    &pending_message,
                );
                yield (Some(pending_message), None);
            }
        }))
    }

    /// Categorize tool requests from the response into different types
    /// Returns:
    /// - frontend_requests: Tool requests that should be handled by the frontend
    /// - other_requests: All other tool requests (including requests to enable extensions)
    /// - filtered_message: The original message with frontend tool requests removed
    pub(crate) async fn categorize_tool_requests(
        &self,
        response: &Message,
        tools: &[Tool],
    ) -> (Vec<ToolRequest>, Vec<ToolRequest>, Message, Message) {
        // First collect all tool requests with coercion applied
        let tool_requests: Vec<ToolRequest> = {
            let registry = self.tool_registry.read().await;
            let available_tool_names: Vec<&str> =
                tools.iter().map(|tool| tool.name.as_ref()).collect();
            let canonical_name = |name: &str| registry.canonical_name(name);
            response
                .content
                .iter()
                .filter_map(|content| {
                    if let MessageContent::ToolRequest(req) = content {
                        let mut coerced_req = req.clone();

                        if let Ok(ref mut tool_call) = coerced_req.tool_call {
                            if let Some(surface_name) = runtime_tool_call_surface_name(
                                &available_tool_names,
                                tool_call.name.as_ref(),
                                &canonical_name,
                            ) {
                                tool_call.name = surface_name.into();
                            }
                            let tool_name = tool_call.name.as_ref().to_string();
                            if let Some(arguments) = tool_call.arguments.as_mut() {
                                runtime_tool_call_normalize_arguments(&tool_name, arguments);
                            }

                            if let Some(tool) = tools
                                .iter()
                                .find(|t| t.name.as_ref() == tool_call.name.as_ref())
                            {
                                let schema_value =
                                    Value::Object(tool.input_schema.as_ref().clone());
                                tool_call.arguments = coerce_tool_arguments(
                                    tool_call.arguments.clone(),
                                    &schema_value,
                                );

                                if let Some(ref meta) = tool.meta {
                                    coerced_req.tool_meta = serde_json::to_value(meta).ok();
                                }
                            }
                        }

                        Some(coerced_req)
                    } else {
                        None
                    }
                })
                .collect()
        };

        // Create a filtered message with frontend tool requests removed
        let mut filtered_content = Vec::new();
        let mut tool_request_index = 0;

        for content in &response.content {
            match content {
                MessageContent::ToolRequest(_) => {
                    if tool_request_index < tool_requests.len() {
                        let coerced_req = &tool_requests[tool_request_index];
                        tool_request_index += 1;

                        let should_include = if let Ok(tool_call) = &coerced_req.tool_call {
                            !self.is_frontend_tool(&tool_call.name).await
                        } else {
                            true
                        };

                        if should_include {
                            filtered_content.push(MessageContent::ToolRequest(coerced_req.clone()));
                        }
                    }
                }
                _ => {
                    filtered_content.push(content.clone());
                }
            }
        }

        let mut filtered_message =
            Message::new(response.role.clone(), response.created, filtered_content);

        // Preserve the ID if it exists
        if let Some(id) = response.id.clone() {
            filtered_message = filtered_message.with_id(id);
        }

        let normalized_response = normalize_response_tool_requests(response, &tool_requests);

        // Categorize tool requests
        let mut frontend_requests = Vec::new();
        let mut other_requests = Vec::new();

        for request in tool_requests {
            if let Ok(tool_call) = &request.tool_call {
                if self.is_frontend_tool(&tool_call.name).await {
                    frontend_requests.push(request);
                } else {
                    other_requests.push(request);
                }
            } else {
                // If there's an error in the tool call, add it to other_requests
                other_requests.push(request);
            }
        }

        (
            frontend_requests,
            other_requests,
            filtered_message,
            normalized_response,
        )
    }

    pub(crate) async fn update_session_metrics(
        session_config: &crate::agents::types::SessionConfig,
        usage: &ProviderUsage,
        is_compaction_usage: bool,
        session_store: Option<&Arc<dyn SessionStore>>,
    ) -> Result<()> {
        let session_id = session_config.id.as_str();
        let session = if let Some(store) = session_store {
            store.get_session(session_id, false).await?
        } else {
            query_session(session_id, false).await?
        };

        let accumulate = |a: Option<i32>, b: Option<i32>| -> Option<i32> {
            match (a, b) {
                (Some(x), Some(y)) => Some(x + y),
                _ => a.or(b),
            }
        };

        let accumulated_total =
            accumulate(session.accumulated_total_tokens, usage.usage.total_tokens);
        let accumulated_input =
            accumulate(session.accumulated_input_tokens, usage.usage.input_tokens);
        let accumulated_output =
            accumulate(session.accumulated_output_tokens, usage.usage.output_tokens);

        let (current_total, current_input, current_output) = if is_compaction_usage {
            // After compaction: summary output becomes new input context
            let new_input = usage.usage.output_tokens;
            (new_input, new_input, None)
        } else {
            (
                usage.usage.total_tokens,
                usage.usage.input_tokens,
                usage.usage.output_tokens,
            )
        };
        let current_cached_input = if is_compaction_usage {
            Some(0)
        } else {
            usage.usage.cached_input_tokens
        };
        let current_cache_creation_input = if is_compaction_usage {
            Some(0)
        } else {
            usage.usage.cache_creation_input_tokens
        };

        if let Some(store) = session_store {
            store
                .update_token_stats(
                    session_id,
                    TokenStatsUpdate {
                        schedule_id: session_config.schedule_id.clone(),
                        total_tokens: current_total,
                        input_tokens: current_input,
                        output_tokens: current_output,
                        cached_input_tokens: current_cached_input,
                        cache_creation_input_tokens: current_cache_creation_input,
                        accumulated_total,
                        accumulated_input,
                        accumulated_output,
                    },
                )
                .await?;
        } else {
            apply_session_update(session_id, |update| {
                update
                    .schedule_id(session_config.schedule_id.clone())
                    .total_tokens(current_total)
                    .input_tokens(current_input)
                    .output_tokens(current_output)
                    .cached_input_tokens(current_cached_input)
                    .cache_creation_input_tokens(current_cache_creation_input)
                    .accumulated_total_tokens(accumulated_total)
                    .accumulated_input_tokens(accumulated_input)
                    .accumulated_output_tokens(accumulated_output)
            })
            .await?;
        }

        Ok(())
    }
}
