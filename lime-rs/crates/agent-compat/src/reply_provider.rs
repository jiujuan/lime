use anyhow::Result;
use async_trait::async_trait;
use futures::Stream;
use model_provider::provider_stream::provider_stream_notification_payload_from_text;
use once_cell::sync::Lazy;
use reqwest::StatusCode;
use rmcp::model::Tool;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::ops::{Add, AddAssign};
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use thiserror::Error;
use utoipa::ToSchema;

use crate::conversation::message::Message;
use crate::conversation::Conversation;
use crate::model::ModelConfig;

pub static CURRENT_MODEL: Lazy<Mutex<Option<String>>> = Lazy::new(|| Mutex::new(None));

pub fn set_current_model(model: &str) {
    if let Ok(mut current_model) = CURRENT_MODEL.lock() {
        *current_model = Some(model.to_string());
    }
}

pub fn get_current_model() -> Option<String> {
    CURRENT_MODEL.lock().ok().and_then(|model| model.clone())
}

pub static MSG_COUNT_FOR_SESSION_NAME_GENERATION: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionNameGenerationExecutionStrategy {
    Background,
    AfterReply,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq)]
pub struct ModelInfo {
    pub name: String,
    pub context_limit: usize,
    pub input_token_cost: Option<f64>,
    pub output_token_cost: Option<f64>,
    pub currency: Option<String>,
    pub supports_cache_control: Option<bool>,
}

impl ModelInfo {
    pub fn new(name: impl Into<String>, context_limit: usize) -> Self {
        Self {
            name: name.into(),
            context_limit,
            input_token_cost: None,
            output_token_cost: None,
            currency: None,
            supports_cache_control: None,
        }
    }

    pub fn with_cost(
        name: impl Into<String>,
        context_limit: usize,
        input_cost: f64,
        output_cost: f64,
    ) -> Self {
        Self {
            name: name.into(),
            context_limit,
            input_token_cost: Some(input_cost),
            output_token_cost: Some(output_cost),
            currency: Some("$".to_string()),
            supports_cache_control: None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
pub enum ProviderType {
    Preferred,
    Builtin,
    Declarative,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ProviderMetadata {
    pub name: String,
    pub display_name: String,
    pub description: String,
    pub default_model: String,
    pub known_models: Vec<ModelInfo>,
    pub model_doc_link: String,
    pub config_keys: Vec<ConfigKey>,
}

impl ProviderMetadata {
    pub fn new(
        name: &str,
        display_name: &str,
        description: &str,
        default_model: &str,
        model_names: Vec<&str>,
        model_doc_link: &str,
        config_keys: Vec<ConfigKey>,
    ) -> Self {
        Self {
            name: name.to_string(),
            display_name: display_name.to_string(),
            description: description.to_string(),
            default_model: default_model.to_string(),
            known_models: model_names
                .iter()
                .map(|&name| ModelInfo {
                    name: name.to_string(),
                    context_limit: ModelConfig::new_or_fail(name).context_limit(),
                    input_token_cost: None,
                    output_token_cost: None,
                    currency: None,
                    supports_cache_control: None,
                })
                .collect(),
            model_doc_link: model_doc_link.to_string(),
            config_keys,
        }
    }

    pub fn with_models(
        name: &str,
        display_name: &str,
        description: &str,
        default_model: &str,
        models: Vec<ModelInfo>,
        model_doc_link: &str,
        config_keys: Vec<ConfigKey>,
    ) -> Self {
        Self {
            name: name.to_string(),
            display_name: display_name.to_string(),
            description: description.to_string(),
            default_model: default_model.to_string(),
            known_models: models,
            model_doc_link: model_doc_link.to_string(),
            config_keys,
        }
    }

    pub fn empty() -> Self {
        Self {
            name: String::new(),
            display_name: String::new(),
            description: String::new(),
            default_model: String::new(),
            known_models: Vec::new(),
            model_doc_link: String::new(),
            config_keys: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct ConfigKey {
    pub name: String,
    pub required: bool,
    pub secret: bool,
    pub default: Option<String>,
    pub oauth_flow: bool,
}

impl ConfigKey {
    pub fn new(name: &str, required: bool, secret: bool, default: Option<&str>) -> Self {
        Self {
            name: name.to_string(),
            required,
            secret,
            default: default.map(str::to_string),
            oauth_flow: false,
        }
    }

    pub fn new_oauth(name: &str, required: bool, secret: bool, default: Option<&str>) -> Self {
        Self {
            name: name.to_string(),
            required,
            secret,
            default: default.map(str::to_string),
            oauth_flow: true,
        }
    }
}

#[derive(Error, Debug, PartialEq)]
pub enum ProviderError {
    #[error("Authentication error: {0}")]
    Authentication(String),
    #[error("Context length exceeded: {0}")]
    ContextLengthExceeded(String),
    #[error("Rate limit exceeded: {details}")]
    RateLimitExceeded {
        details: String,
        retry_delay: Option<Duration>,
    },
    #[error("Server error: {0}")]
    ServerError(String),
    #[error("Request failed: {0}")]
    RequestFailed(String),
    #[error("Execution error: {0}")]
    ExecutionError(String),
    #[error("Usage data error: {0}")]
    UsageError(String),
    #[error("Unsupported operation: {0}")]
    NotImplemented(String),
}

impl ProviderError {
    pub fn telemetry_type(&self) -> &'static str {
        match self {
            Self::Authentication(_) => "auth",
            Self::ContextLengthExceeded(_) => "context_length",
            Self::RateLimitExceeded { .. } => "rate_limit",
            Self::ServerError(_) => "server",
            Self::RequestFailed(_) => "request",
            Self::ExecutionError(_) => "execution",
            Self::UsageError(_) => "usage",
            Self::NotImplemented(_) => "not_implemented",
        }
    }

    pub fn is_retryable(&self) -> bool {
        match self {
            Self::RateLimitExceeded { .. } | Self::ServerError(_) => true,
            Self::RequestFailed(message) => is_retryable_request_failed_message(message),
            Self::Authentication(_)
            | Self::ContextLengthExceeded(_)
            | Self::ExecutionError(_)
            | Self::UsageError(_)
            | Self::NotImplemented(_) => false,
        }
    }

    pub fn is_non_retryable_provider_rejection(&self) -> bool {
        match self {
            Self::Authentication(_) => true,
            Self::RequestFailed(message) => {
                Self::message_is_non_retryable_provider_rejection(message)
            }
            Self::ContextLengthExceeded(_)
            | Self::RateLimitExceeded { .. }
            | Self::ServerError(_)
            | Self::ExecutionError(_)
            | Self::UsageError(_)
            | Self::NotImplemented(_) => false,
        }
    }

    pub fn message_is_non_retryable_provider_rejection(message: &str) -> bool {
        let normalized = message.to_ascii_lowercase();
        normalized.contains("authentication error")
            || normalized.contains("unauthorized")
            || normalized.contains("forbidden")
            || !is_retryable_request_failed_message(message)
    }
}

fn is_retryable_request_failed_message(message: &str) -> bool {
    let normalized = message.to_ascii_lowercase();
    let non_retryable_markers = [
        "bad request (400)",
        "resource not found (404)",
        "invalid_request_error",
        "status: 400",
        "status: 401",
        "status: 403",
        "status: 404",
        "status 400",
        "status 401",
        "status 403",
        "status 404",
    ];

    !non_retryable_markers
        .iter()
        .any(|marker| normalized.contains(marker))
}

impl From<anyhow::Error> for ProviderError {
    fn from(error: anyhow::Error) -> Self {
        if let Some(reqwest_err) = error.downcast_ref::<reqwest::Error>() {
            return provider_error_from_reqwest(reqwest_err);
        }
        ProviderError::ExecutionError(error.to_string())
    }
}

impl From<reqwest::Error> for ProviderError {
    fn from(error: reqwest::Error) -> Self {
        ProviderError::RequestFailed(error.to_string())
    }
}

fn provider_error_from_reqwest(error: &reqwest::Error) -> ProviderError {
    let mut details = Vec::new();

    if let Some(status) = error.status() {
        details.push(format!("status: {}", status));
    }
    if error.is_timeout() {
        details.push("timeout".to_string());
    }
    if error.is_connect() {
        if let Some(url) = error.url() {
            if let Some(host) = url.host_str() {
                let port_info = url.port().map(|p| format!(":{p}")).unwrap_or_default();
                details.push(format!("failed to connect to {host}{port_info}"));
                if url.port().is_some() {
                    details.push("check that the port is correct".to_string());
                }
            }
        } else {
            details.push("connection failed".to_string());
        }
    }

    let message = if details.is_empty() {
        error.to_string()
    } else {
        format!("{} ({})", error, details.join(", "))
    };
    ProviderError::RequestFailed(message)
}

#[derive(Debug)]
pub enum GoogleErrorCode {
    BadRequest = 400,
    Unauthorized = 401,
    Forbidden = 403,
    NotFound = 404,
    TooManyRequests = 429,
    InternalServerError = 500,
    ServiceUnavailable = 503,
}

impl GoogleErrorCode {
    pub fn to_status_code(&self) -> StatusCode {
        match self {
            Self::BadRequest => StatusCode::BAD_REQUEST,
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::TooManyRequests => StatusCode::TOO_MANY_REQUESTS,
            Self::InternalServerError => StatusCode::INTERNAL_SERVER_ERROR,
            Self::ServiceUnavailable => StatusCode::SERVICE_UNAVAILABLE,
        }
    }

    pub fn from_code(code: u64) -> Option<Self> {
        match code {
            400 => Some(Self::BadRequest),
            401 => Some(Self::Unauthorized),
            403 => Some(Self::Forbidden),
            404 => Some(Self::NotFound),
            429 => Some(Self::TooManyRequests),
            500 => Some(Self::InternalServerError),
            503 => Some(Self::ServiceUnavailable),
            _ => Some(Self::InternalServerError),
        }
    }
}

#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub(crate) max_retries: usize,
    pub(crate) initial_interval_ms: u64,
    pub(crate) backoff_multiplier: f64,
    pub(crate) max_interval_ms: u64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_interval_ms: 1000,
            backoff_multiplier: 2.0,
            max_interval_ms: 30_000,
        }
    }
}

impl RetryConfig {
    pub fn new(
        max_retries: usize,
        initial_interval_ms: u64,
        backoff_multiplier: f64,
        max_interval_ms: u64,
    ) -> Self {
        Self {
            max_retries,
            initial_interval_ms,
            backoff_multiplier,
            max_interval_ms,
        }
    }

    pub fn max_retries(&self) -> usize {
        self.max_retries
    }

    pub fn delay_for_attempt(&self, attempt: usize) -> Duration {
        if attempt == 0 {
            return Duration::from_millis(0);
        }

        let exponent = (attempt - 1) as i32;
        let base_delay_ms =
            (self.initial_interval_ms as f64 * self.backoff_multiplier.powi(exponent)) as u64;
        let capped_delay_ms = std::cmp::min(base_delay_ms, self.max_interval_ms);
        let jitter = 0.8 + (rand::random::<f64>() * 0.4);
        Duration::from_millis((capped_delay_ms as f64 * jitter) as u64)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderUsage {
    pub model: String,
    pub usage: Usage,
}

impl ProviderUsage {
    pub fn new(model: String, usage: Usage) -> Self {
        Self { model, usage }
    }

    pub async fn ensure_tokens(
        &mut self,
        _system_prompt: &str,
        _request_messages: &[Message],
        _response: &Message,
        _tools: &[Tool],
    ) -> Result<(), ProviderError> {
        Ok(())
    }

    pub fn combine_with(&self, other: &ProviderUsage) -> ProviderUsage {
        ProviderUsage {
            model: self.model.clone(),
            usage: self.usage + other.usage,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, Copy)]
pub struct Usage {
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub total_tokens: Option<i32>,
    pub cached_input_tokens: Option<i32>,
    pub cache_creation_input_tokens: Option<i32>,
}

fn sum_optionals<T>(a: Option<T>, b: Option<T>) -> Option<T>
where
    T: Add<Output = T> + Default,
{
    match (a, b) {
        (Some(x), Some(y)) => Some(x + y),
        (Some(x), None) => Some(x + T::default()),
        (None, Some(y)) => Some(T::default() + y),
        (None, None) => None,
    }
}

impl Add for Usage {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        Self::new(
            sum_optionals(self.input_tokens, other.input_tokens),
            sum_optionals(self.output_tokens, other.output_tokens),
            sum_optionals(self.total_tokens, other.total_tokens),
        )
        .with_cached_input_tokens(sum_optionals(
            self.cached_input_tokens,
            other.cached_input_tokens,
        ))
        .with_cache_creation_input_tokens(sum_optionals(
            self.cache_creation_input_tokens,
            other.cache_creation_input_tokens,
        ))
    }
}

impl AddAssign for Usage {
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}

impl Usage {
    pub fn new(
        input_tokens: Option<i32>,
        output_tokens: Option<i32>,
        total_tokens: Option<i32>,
    ) -> Self {
        let calculated_total = total_tokens.or_else(|| match (input_tokens, output_tokens) {
            (Some(input), Some(output)) => Some(input + output),
            (Some(input), None) => Some(input),
            (None, Some(output)) => Some(output),
            (None, None) => None,
        });

        Self {
            input_tokens,
            output_tokens,
            total_tokens: calculated_total,
            cached_input_tokens: None,
            cache_creation_input_tokens: None,
        }
    }

    pub fn with_cached_input_tokens(mut self, cached_input_tokens: Option<i32>) -> Self {
        self.cached_input_tokens = cached_input_tokens;
        self
    }

    pub fn with_cache_creation_input_tokens(
        mut self,
        cache_creation_input_tokens: Option<i32>,
    ) -> Self {
        self.cache_creation_input_tokens = cache_creation_input_tokens;
        self
    }
}

pub trait LeadWorkerProviderTrait {
    fn get_model_info(&self) -> (String, String);
    fn get_active_model(&self) -> String;
    fn get_settings(&self) -> (usize, usize, usize);
}

#[async_trait]
pub trait Provider: Send + Sync {
    fn metadata() -> ProviderMetadata
    where
        Self: Sized;

    fn get_name(&self) -> &str;

    async fn complete_with_model(
        &self,
        model_config: &ModelConfig,
        system: &str,
        messages: &[Message],
        tools: &[Tool],
    ) -> Result<(Message, ProviderUsage), ProviderError>;

    async fn complete(
        &self,
        system: &str,
        messages: &[Message],
        tools: &[Tool],
    ) -> Result<(Message, ProviderUsage), ProviderError> {
        let model_config = self.get_model_config();
        self.complete_with_model(&model_config, system, messages, tools)
            .await
    }

    async fn complete_fast(
        &self,
        system: &str,
        messages: &[Message],
        tools: &[Tool],
    ) -> Result<(Message, ProviderUsage), ProviderError> {
        let model_config = self.get_model_config();
        let fast_config = model_config.use_fast_model();

        match self
            .complete_with_model(&fast_config, system, messages, tools)
            .await
        {
            Ok(result) => Ok(result),
            Err(error) if fast_config.model_name != model_config.model_name => {
                tracing::warn!(
                    "Fast model {} failed: {}. Falling back to regular model {}",
                    fast_config.model_name,
                    error,
                    model_config.model_name
                );
                self.complete_with_model(&model_config, system, messages, tools)
                    .await
            }
            Err(error) => Err(error),
        }
    }

    fn get_model_config(&self) -> ModelConfig;

    fn retry_config(&self) -> RetryConfig {
        RetryConfig::default()
    }

    async fn fetch_supported_models(&self) -> Result<Option<Vec<String>>, ProviderError> {
        Ok(None)
    }

    async fn fetch_recommended_models(&self) -> Result<Option<Vec<String>>, ProviderError> {
        self.fetch_supported_models().await
    }

    async fn map_to_canonical_model(
        &self,
        _provider_model: &str,
    ) -> Result<Option<String>, ProviderError> {
        Ok(None)
    }

    fn supports_embeddings(&self) -> bool {
        false
    }

    async fn supports_cache_control(&self) -> bool {
        false
    }

    fn supports_native_output_schema(&self) -> bool {
        false
    }

    fn supports_native_output_schema_with_model(&self, _model_config: &ModelConfig) -> bool {
        self.supports_native_output_schema()
    }

    async fn create_embeddings(&self, _texts: Vec<String>) -> Result<Vec<Vec<f32>>, ProviderError> {
        Err(ProviderError::ExecutionError(
            "This provider does not support embeddings".to_string(),
        ))
    }

    fn as_lead_worker(&self) -> Option<&dyn LeadWorkerProviderTrait> {
        None
    }

    async fn stream(
        &self,
        _system: &str,
        _messages: &[Message],
        _tools: &[Tool],
    ) -> Result<MessageStream, ProviderError> {
        Err(ProviderError::NotImplemented(
            "streaming not implemented".to_string(),
        ))
    }

    fn supports_streaming(&self) -> bool {
        false
    }

    async fn stream_with_model(
        &self,
        model_config: &ModelConfig,
        system: &str,
        messages: &[Message],
        tools: &[Tool],
    ) -> Result<MessageStream, ProviderError> {
        if self.get_model_config() == *model_config {
            self.stream(system, messages, tools).await
        } else {
            let (message, usage) = self
                .complete_with_model(model_config, system, messages, tools)
                .await?;
            Ok(stream_from_single_message(message, usage))
        }
    }

    fn get_active_model_name(&self) -> String {
        if let Some(lead_worker) = self.as_lead_worker() {
            lead_worker.get_active_model()
        } else {
            self.get_model_config().model_name
        }
    }

    fn get_initial_user_messages(&self, messages: &Conversation) -> Vec<String> {
        messages
            .iter()
            .filter(|message| message.role == rmcp::model::Role::User)
            .take(MSG_COUNT_FOR_SESSION_NAME_GENERATION)
            .map(|message| message.as_concat_text())
            .collect()
    }

    async fn generate_session_name(
        &self,
        messages: &Conversation,
    ) -> Result<String, ProviderError> {
        let context = self.get_initial_user_messages(messages);
        let prompt = self.create_session_name_prompt(&context);
        let message = Message::user().with_text(&prompt);
        let result = self
            .complete_fast(
                "Reply with only a description in four words or less",
                &[message],
                &[],
            )
            .await?;

        let description = result
            .0
            .as_concat_text()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");

        Ok(safe_truncate(&description, 100))
    }

    fn session_name_generation_execution_strategy(&self) -> SessionNameGenerationExecutionStrategy {
        SessionNameGenerationExecutionStrategy::Background
    }

    fn create_session_name_prompt(&self, context: &[String]) -> String {
        let prompt = "Based on the conversation so far, provide a concise description of this session in 4 words or less. This will be used for finding the session later in a UI with limited space - reply *ONLY* with the description";

        if context.is_empty() {
            prompt.to_string()
        } else {
            format!(
                "Here are the first few user messages:\n{}\n\n{}",
                context.join("\n"),
                prompt
            )
        }
    }

    async fn configure_oauth(&self) -> Result<(), ProviderError> {
        Err(ProviderError::ExecutionError(
            "OAuth configuration not supported by this provider".to_string(),
        ))
    }
}

pub type MessageStream = Pin<
    Box<dyn Stream<Item = Result<(Option<Message>, Option<ProviderUsage>), ProviderError>> + Send>,
>;

pub fn stream_from_single_message(message: Message, usage: ProviderUsage) -> MessageStream {
    Box::pin(futures::stream::once(async move {
        Ok((Some(message), Some(usage)))
    }))
}

pub async fn create(_name: &str, _model: ModelConfig) -> Result<Arc<dyn Provider>> {
    anyhow::bail!(
        "Aster provider factory has been removed; use the current model-provider/App Server backend"
    )
}

pub fn provider_stream_event_notification_payload_from_message(message: &Message) -> Option<Value> {
    message.content.iter().find_map(|content| {
        let notification = content.as_system_notification()?;
        provider_stream_notification_payload_from_text(&notification.msg)
    })
}

fn safe_truncate(text: &str, max_chars: usize) -> String {
    let mut iter = text.chars();
    let truncated: String = iter.by_ref().take(max_chars).collect();
    if iter.next().is_some() {
        truncated
    } else {
        text.to_string()
    }
}
