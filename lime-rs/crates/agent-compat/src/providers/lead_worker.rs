use anyhow::Result;
use async_trait::async_trait;
use std::ops::Deref;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::base::{LeadWorkerProviderTrait, Provider, ProviderMetadata, ProviderUsage};
use super::errors::ProviderError;
use crate::conversation::message::{Message, MessageContent};
use crate::model::ModelConfig;
use rmcp::model::Tool;
use rmcp::model::{Content, RawContent};

/// A provider that switches between a lead model and a worker model based on turn count
/// and can fallback to lead model on consecutive failures
pub struct LeadWorkerProvider {
    lead_provider: Arc<dyn Provider>,
    worker_provider: Arc<dyn Provider>,
    lead_turns: usize,
    turn_count: Arc<Mutex<usize>>,
    failure_count: Arc<Mutex<usize>>,
    max_failures_before_fallback: usize,
    fallback_turns: usize,
    in_fallback_mode: Arc<Mutex<bool>>,
    fallback_remaining: Arc<Mutex<usize>>,
}

impl LeadWorkerProvider {
    /// Create a new LeadWorkerProvider
    ///
    /// # Arguments
    /// * `lead_provider` - The provider to use for the initial turns
    /// * `worker_provider` - The provider to use after lead_turns
    /// * `lead_turns` - Number of turns to use the lead provider (default: 3)
    pub fn new(
        lead_provider: Arc<dyn Provider>,
        worker_provider: Arc<dyn Provider>,
        lead_turns: Option<usize>,
    ) -> Self {
        Self {
            lead_provider,
            worker_provider,
            lead_turns: lead_turns.unwrap_or(3),
            turn_count: Arc::new(Mutex::new(0)),
            failure_count: Arc::new(Mutex::new(0)),
            max_failures_before_fallback: 2, // Fallback after 2 consecutive failures
            fallback_turns: 2,               // Use lead model for 2 turns when in fallback mode
            in_fallback_mode: Arc::new(Mutex::new(false)),
            fallback_remaining: Arc::new(Mutex::new(0)),
        }
    }

    /// Create a new LeadWorkerProvider with custom settings
    ///
    /// # Arguments
    /// * `lead_provider` - The provider to use for the initial turns
    /// * `worker_provider` - The provider to use after lead_turns
    /// * `lead_turns` - Number of turns to use the lead provider
    /// * `failure_threshold` - Number of consecutive failures before fallback
    /// * `fallback_turns` - Number of turns to use lead model in fallback mode
    pub fn new_with_settings(
        lead_provider: Arc<dyn Provider>,
        worker_provider: Arc<dyn Provider>,
        lead_turns: usize,
        failure_threshold: usize,
        fallback_turns: usize,
    ) -> Self {
        Self {
            lead_provider,
            worker_provider,
            lead_turns,
            turn_count: Arc::new(Mutex::new(0)),
            failure_count: Arc::new(Mutex::new(0)),
            max_failures_before_fallback: failure_threshold,
            fallback_turns,
            in_fallback_mode: Arc::new(Mutex::new(false)),
            fallback_remaining: Arc::new(Mutex::new(0)),
        }
    }

    /// Reset the turn counter and failure tracking (useful for new conversations)
    pub async fn reset_turn_count(&self) {
        let mut count = self.turn_count.lock().await;
        *count = 0;
        let mut failures = self.failure_count.lock().await;
        *failures = 0;
        let mut fallback = self.in_fallback_mode.lock().await;
        *fallback = false;
        let mut remaining = self.fallback_remaining.lock().await;
        *remaining = 0;
    }

    /// Get the current turn count
    pub async fn get_turn_count(&self) -> usize {
        *self.turn_count.lock().await
    }

    /// Get the current failure count
    pub async fn get_failure_count(&self) -> usize {
        *self.failure_count.lock().await
    }

    /// Check if currently in fallback mode
    pub async fn is_in_fallback_mode(&self) -> bool {
        *self.in_fallback_mode.lock().await
    }

    /// Get the currently active provider based on turn count and fallback state
    async fn get_active_provider(&self) -> Arc<dyn Provider> {
        let count = *self.turn_count.lock().await;
        let in_fallback = *self.in_fallback_mode.lock().await;

        // Use lead provider if we're in initial turns OR in fallback mode
        if count < self.lead_turns || in_fallback {
            Arc::clone(&self.lead_provider)
        } else {
            Arc::clone(&self.worker_provider)
        }
    }

    /// Handle the result of a completion attempt and update failure tracking
    async fn handle_completion_result(
        &self,
        result: &Result<(Message, ProviderUsage), ProviderError>,
    ) {
        match result {
            Ok((message, _usage)) => {
                // Check for task-level failures in the response
                let has_task_failure = self.detect_task_failures(message).await;

                if has_task_failure {
                    // Task failure detected - increment failure count
                    let mut failures = self.failure_count.lock().await;
                    *failures += 1;

                    let failure_count = *failures;
                    let turn_count = *self.turn_count.lock().await;

                    tracing::warn!(
                        "Task failure detected in response (failure count: {})",
                        failure_count
                    );

                    // Check if we should trigger fallback
                    if turn_count >= self.lead_turns
                        && !*self.in_fallback_mode.lock().await
                        && failure_count >= self.max_failures_before_fallback
                    {
                        let mut in_fallback = self.in_fallback_mode.lock().await;
                        let mut fallback_remaining = self.fallback_remaining.lock().await;

                        *in_fallback = true;
                        *fallback_remaining = self.fallback_turns;
                        *failures = 0; // Reset failure count when entering fallback

                        tracing::warn!(
                            "🔄 SWITCHING TO LEAD MODEL: Entering fallback mode after {} consecutive task failures - using lead model for {} turns",
                            self.max_failures_before_fallback,
                            self.fallback_turns
                        );
                    }
                } else {
                    // Success - reset failure count and handle fallback mode
                    let mut failures = self.failure_count.lock().await;
                    *failures = 0;

                    let mut in_fallback = self.in_fallback_mode.lock().await;
                    let mut fallback_remaining = self.fallback_remaining.lock().await;

                    if *in_fallback {
                        *fallback_remaining -= 1;
                        if *fallback_remaining == 0 {
                            *in_fallback = false;
                            tracing::info!("✅ SWITCHING BACK TO WORKER MODEL: Exiting fallback mode - worker model resumed");
                        }
                    }
                }

                // Increment turn count on any completion (success or task failure)
                let mut count = self.turn_count.lock().await;
                *count += 1;
            }
            Err(_) => {
                // Technical failure - just log and let it bubble up
                // For technical failures (API/LLM issues), we don't want to second-guess
                // the model choice - just let the default model handle it
                tracing::warn!(
                    "Technical failure detected - API/LLM issue, will use default model"
                );

                // Don't increment turn count or failure tracking for technical failures
                // as these are temporary infrastructure issues, not model capability issues
            }
        }
    }

    /// Detect task-level failures in the model's response
    async fn detect_task_failures(&self, message: &Message) -> bool {
        let mut failure_indicators = 0;

        for content in &message.content {
            match content {
                MessageContent::ToolRequest(tool_request) => {
                    // Check if tool request itself failed (malformed, etc.)
                    if tool_request.tool_call.is_err() {
                        failure_indicators += 1;
                        tracing::debug!(
                            "Failed tool request detected: {:?}",
                            tool_request.tool_call
                        );
                    }
                }
                MessageContent::ToolResponse(tool_response) => {
                    // Check if tool execution failed
                    if let Err(tool_error) = &tool_response.tool_result {
                        failure_indicators += 1;
                        tracing::debug!("Tool execution failure detected: {:?}", tool_error);
                    } else if let Ok(result) = &tool_response.tool_result {
                        // Check tool output for error indicators
                        if self.contains_error_indicators(&result.content) {
                            failure_indicators += 1;
                            tracing::debug!("Tool output contains error indicators");
                        }
                    }
                }
                MessageContent::Text(text_content) => {
                    // Check for user correction patterns or error acknowledgments
                    if self.contains_user_correction_patterns(&text_content.text) {
                        failure_indicators += 1;
                        tracing::debug!("User correction pattern detected in text");
                    }
                }
                _ => {}
            }
        }

        // Consider it a failure if we have multiple failure indicators
        failure_indicators >= 1
    }

    /// Check if tool output contains error indicators
    fn contains_error_indicators(&self, contents: &[Content]) -> bool {
        for content in contents {
            if let RawContent::Text(text_content) = content.deref() {
                let text_lower = text_content.text.to_lowercase();

                // Common error patterns in tool outputs
                if text_lower.contains("error:")
                    || text_lower.contains("failed:")
                    || text_lower.contains("exception:")
                    || text_lower.contains("traceback")
                    || text_lower.contains("syntax error")
                    || text_lower.contains("permission denied")
                    || text_lower.contains("file not found")
                    || text_lower.contains("command not found")
                    || text_lower.contains("compilation failed")
                    || text_lower.contains("test failed")
                    || text_lower.contains("assertion failed")
                {
                    return true;
                }
            }
        }
        false
    }

    /// Check for user correction patterns in text
    fn contains_user_correction_patterns(&self, text: &str) -> bool {
        let text_lower = text.to_lowercase();

        // Patterns indicating user is correcting or expressing dissatisfaction
        text_lower.contains("that's wrong")
            || text_lower.contains("that's not right")
            || text_lower.contains("that doesn't work")
            || text_lower.contains("try again")
            || text_lower.contains("let me correct")
            || text_lower.contains("actually, ")
            || text_lower.contains("no, that's")
            || text_lower.contains("that's incorrect")
            || text_lower.contains("fix this")
            || text_lower.contains("this is broken")
            || text_lower.contains("this doesn't")
            || text_lower.starts_with("no,")
            || text_lower.starts_with("wrong")
            || text_lower.starts_with("incorrect")
    }
}

impl LeadWorkerProviderTrait for LeadWorkerProvider {
    /// Get information about the lead and worker models for logging
    fn get_model_info(&self) -> (String, String) {
        let lead_model = self.lead_provider.get_model_config().model_name;
        let worker_model = self.worker_provider.get_model_config().model_name;
        (lead_model, worker_model)
    }

    /// Get the currently active model name
    fn get_active_model(&self) -> String {
        // Read from the global store which was set during complete()
        use super::base::get_current_model;
        get_current_model().unwrap_or_else(|| {
            // Fallback to lead model if no current model is set
            self.lead_provider.get_model_config().model_name
        })
    }

    /// Get (lead_turns, failure_threshold, fallback_turns)
    fn get_settings(&self) -> (usize, usize, usize) {
        (
            self.lead_turns,
            self.max_failures_before_fallback,
            self.fallback_turns,
        )
    }
}

#[async_trait]
impl Provider for LeadWorkerProvider {
    fn metadata() -> ProviderMetadata {
        // This is a wrapper provider, so we return minimal metadata
        ProviderMetadata::new(
            "lead_worker",
            "Lead/Worker Provider",
            "A provider that switches between lead and worker models based on turn count",
            "",     // No default model as this is determined by the wrapped providers
            vec![], // No known models as this depends on wrapped providers
            "",     // No doc link
            vec![], // No config keys as configuration is done through wrapped providers
        )
    }

    fn get_name(&self) -> &str {
        // Return the lead provider's name as the default
        self.lead_provider.get_name()
    }

    fn get_model_config(&self) -> ModelConfig {
        // Return the lead provider's model config as the default
        // In practice, this might need to be more sophisticated
        self.lead_provider.get_model_config()
    }

    async fn complete_with_model(
        &self,
        _model_config: &ModelConfig,
        system: &str,
        messages: &[Message],
        tools: &[Tool],
    ) -> Result<(Message, ProviderUsage), ProviderError> {
        // Get the active provider
        let provider = self.get_active_provider().await;

        // Log which provider is being used
        let turn_count = *self.turn_count.lock().await;
        let in_fallback = *self.in_fallback_mode.lock().await;
        let fallback_remaining = *self.fallback_remaining.lock().await;

        let provider_type = if turn_count < self.lead_turns {
            "lead (initial)"
        } else if in_fallback {
            "lead (fallback)"
        } else {
            "worker"
        };

        // Get the active model name and update the global store
        let active_model_name = if turn_count < self.lead_turns || in_fallback {
            self.lead_provider.get_model_config().model_name.clone()
        } else {
            self.worker_provider.get_model_config().model_name.clone()
        };

        // Update the global current model store
        super::base::set_current_model(&active_model_name);

        if in_fallback {
            tracing::info!(
                "🔄 Using {} provider for turn {} (FALLBACK MODE: {} turns remaining) - Model: {}",
                provider_type,
                turn_count + 1,
                fallback_remaining,
                active_model_name
            );
        } else {
            tracing::info!(
                "Using {} provider for turn {} (lead_turns: {}) - Model: {}",
                provider_type,
                turn_count + 1,
                self.lead_turns,
                active_model_name
            );
        }

        // Make the completion request
        let result = provider.complete(system, messages, tools).await;

        // For technical failures, try with default model (lead provider) instead
        let final_result = match &result {
            Err(_) => {
                tracing::warn!("Technical failure with {} provider, retrying with default model (lead provider)", provider_type);

                // Try with lead provider as the default/fallback for technical failures
                let default_result = self.lead_provider.complete(system, messages, tools).await;

                match &default_result {
                    Ok(_) => {
                        tracing::info!(
                            "✅ Default model (lead provider) succeeded after technical failure"
                        );
                        default_result
                    }
                    Err(_) => {
                        tracing::error!("❌ Default model (lead provider) also failed - returning original error");
                        result // Return the original error
                    }
                }
            }
            Ok(_) => result, // Success with original provider
        };

        // Handle the result and update tracking (only for successful completions)
        self.handle_completion_result(&final_result).await;

        final_result
    }

    async fn fetch_supported_models(&self) -> Result<Option<Vec<String>>, ProviderError> {
        // Combine models from both providers
        let lead_models = self.lead_provider.fetch_supported_models().await?;
        let worker_models = self.worker_provider.fetch_supported_models().await?;

        match (lead_models, worker_models) {
            (Some(lead), Some(worker)) => {
                let mut all_models = lead;
                all_models.extend(worker);
                all_models.sort();
                all_models.dedup();
                Ok(Some(all_models))
            }
            (Some(models), None) | (None, Some(models)) => Ok(Some(models)),
            (None, None) => Ok(None),
        }
    }

    fn supports_embeddings(&self) -> bool {
        // Support embeddings if either provider supports them
        self.lead_provider.supports_embeddings() || self.worker_provider.supports_embeddings()
    }

    async fn create_embeddings(&self, texts: Vec<String>) -> Result<Vec<Vec<f32>>, ProviderError> {
        // Use the lead provider for embeddings if it supports them, otherwise use worker
        if self.lead_provider.supports_embeddings() {
            self.lead_provider.create_embeddings(texts).await
        } else if self.worker_provider.supports_embeddings() {
            self.worker_provider.create_embeddings(texts).await
        } else {
            Err(ProviderError::ExecutionError(
                "Neither lead nor worker provider supports embeddings".to_string(),
            ))
        }
    }

    /// Check if this provider is a LeadWorkerProvider
    fn as_lead_worker(&self) -> Option<&dyn LeadWorkerProviderTrait> {
        Some(self)
    }
}
