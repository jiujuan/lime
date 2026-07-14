//! 当前 provider client。
//!
//! 该模块是固定模型回合的唯一网络边界。它以 Lime 自己的 message/tool contract
//! lower 到 OpenAI Chat Completions、OpenAI Responses 或 Anthropic Messages，并将
//! SSE 重新物化为统一的 response event。这里不依赖 Agent provider、Message 或
//! session 类型。

use crate::provider_stream::{
    RuntimeProviderBackend, RuntimeReplyModelRequestPolicy, RuntimeReplyProviderHandle,
    RuntimeReplyProviderRequestWireShape,
};
use crate::runtime_provider::{RuntimeProviderConfig, RuntimeProviderProtocol};
use crate::ModelProviderProtocol;
use futures::future::BoxFuture;
use futures::Stream;
use reqwest::{Client, Response, StatusCode};
pub use runtime_core::{CanonicalLlmEvent, FinishReason, Usage};
use runtime_core::{
    CanonicalRequest, CanonicalRole, CanonicalToolDefinition, ContentPart, ToolResultValue,
};
use serde_json::Value;
use std::fmt;
use std::pin::Pin;
use std::time::Duration;

mod lowering;
mod stream;
mod transport;

use lowering::{anthropic_request, chat_completions_request, responses_request};
use stream::{anthropic_sse, openai_chat_sse, responses_sse};
use transport::{
    request_failure, retry_delay, should_retry_stream_request_status, MAX_STREAM_REQUEST_ATTEMPTS,
};

pub type CurrentProviderStream =
    Pin<Box<dyn Stream<Item = Result<CanonicalLlmEvent, CurrentProviderError>> + Send>>;

/// Turn executor 依赖的 current provider stream contract。
///
/// HTTP client 只是其中一个实现；运行时通过该窄接口消费统一 response event，测试和
/// 其他 current transport 不需要伪造 HTTP 或引入 provider-specific trait object。
pub trait CurrentProvider: Send + Sync {
    fn stream<'a>(
        &'a self,
        request: CurrentProviderRequest,
    ) -> BoxFuture<'a, Result<CurrentProviderStream, CurrentProviderError>>;
}

#[derive(Clone, Debug, PartialEq)]
pub struct CurrentProviderRequest {
    pub system_prompt: Option<String>,
    pub messages: Vec<CurrentProviderMessage>,
    pub tools: Vec<CurrentProviderTool>,
    pub model_request_policy: Option<RuntimeReplyModelRequestPolicy>,
}

impl CurrentProviderRequest {
    pub fn new(messages: Vec<CurrentProviderMessage>) -> Self {
        Self {
            system_prompt: None,
            messages,
            tools: Vec::new(),
            model_request_policy: None,
        }
    }

    pub fn with_system_prompt(mut self, system_prompt: Option<String>) -> Self {
        self.system_prompt = system_prompt;
        self
    }

    pub fn with_tools(mut self, tools: Vec<CurrentProviderTool>) -> Self {
        self.tools = tools;
        self
    }

    pub fn with_model_request_policy(
        mut self,
        model_request_policy: Option<RuntimeReplyModelRequestPolicy>,
    ) -> Self {
        self.model_request_policy = model_request_policy;
        self
    }

    /// 将回合边界的历史消息转换为唯一的 provider-neutral request contract。
    ///
    /// `CurrentProviderMessage` 仍由上层 transcript 使用，模型名由 current client
    /// 的 route config 注入；wire lowering 不再读取这些旧消息结构。
    pub(crate) fn into_canonical(
        &self,
        model: impl Into<String>,
    ) -> Result<CanonicalRequest, CurrentProviderError> {
        let mut canonical = CanonicalRequest::text(model, "");
        canonical.messages.clear();
        canonical.system = self
            .system_prompt
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .map(|value| vec![ContentPart::text(value)])
            .unwrap_or_default();
        canonical.messages = self
            .messages
            .iter()
            .map(canonical_message)
            .collect::<Result<Vec<_>, _>>()?;
        canonical.tools = self
            .tools
            .iter()
            .map(|tool| CanonicalToolDefinition {
                name: tool.name.clone(),
                description: tool.description.clone(),
                input_schema: tool.input_schema.clone(),
                output_schema: None,
                metadata: Default::default(),
            })
            .collect();
        Ok(canonical)
    }
}

fn canonical_message(
    message: &CurrentProviderMessage,
) -> Result<runtime_core::CanonicalMessage, CurrentProviderError> {
    let role = match message.role {
        CurrentProviderRole::User => CanonicalRole::User,
        CurrentProviderRole::Assistant => CanonicalRole::Assistant,
        CurrentProviderRole::Tool => CanonicalRole::Tool,
    };
    let content = message
        .content
        .iter()
        .map(canonical_content)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(runtime_core::CanonicalMessage {
        id: None,
        role,
        content,
        metadata: Default::default(),
    })
}

fn canonical_content(
    content: &CurrentProviderContent,
) -> Result<ContentPart, CurrentProviderError> {
    match content {
        CurrentProviderContent::Text(text) => Ok(ContentPart::text(text)),
        CurrentProviderContent::Reasoning(text) => Ok(ContentPart::Reasoning {
            text: text.clone(),
            encrypted: None,
            metadata: Default::default(),
        }),
        CurrentProviderContent::Image { data, media_type } => {
            ContentPart::media(data.clone(), media_type.clone()).map_err(|error| {
                CurrentProviderError::new(format!("canonical media input rejected: {error}"))
            })
        }
        CurrentProviderContent::ToolCall(call) => Ok(ContentPart::ToolCall {
            id: call.id.clone(),
            name: call.name.clone(),
            input: call.arguments.clone(),
            provider_executed: None,
            metadata: Default::default(),
        }),
        CurrentProviderContent::ToolResult(result) => Ok(ContentPart::ToolResult {
            id: result.call_id.clone(),
            name: result.name.clone(),
            result: if result.success {
                ToolResultValue::text(result.output.clone())
            } else {
                ToolResultValue::Error {
                    value: serde_json::json!({
                        "output": result.output,
                        "error": result.error,
                    }),
                }
            },
            error: result.error.clone(),
            provider_executed: Some(false),
            metadata: Default::default(),
        }),
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct CurrentProviderMessage {
    pub role: CurrentProviderRole,
    pub content: Vec<CurrentProviderContent>,
}

impl CurrentProviderMessage {
    pub fn user(content: Vec<CurrentProviderContent>) -> Self {
        Self {
            role: CurrentProviderRole::User,
            content,
        }
    }

    pub fn assistant(content: Vec<CurrentProviderContent>) -> Self {
        Self {
            role: CurrentProviderRole::Assistant,
            content,
        }
    }

    pub fn tool(content: Vec<CurrentProviderContent>) -> Self {
        Self {
            role: CurrentProviderRole::Tool,
            content,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CurrentProviderRole {
    User,
    Assistant,
    Tool,
}

#[derive(Clone, Debug, PartialEq)]
pub enum CurrentProviderContent {
    Text(String),
    Reasoning(String),
    Image { data: String, media_type: String },
    ToolCall(CurrentProviderToolCall),
    ToolResult(CurrentProviderToolResult),
}

#[derive(Clone, Debug, PartialEq)]
pub struct CurrentProviderToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
    pub raw_arguments: String,
}

impl CurrentProviderToolCall {
    pub fn new(id: impl Into<String>, name: impl Into<String>, arguments: Value) -> Self {
        let raw_arguments = serde_json::to_string(&arguments).unwrap_or_else(|_| "{}".to_string());
        Self {
            id: id.into(),
            name: name.into(),
            arguments,
            raw_arguments,
        }
    }

    fn try_from_raw(
        id: String,
        name: String,
        raw_arguments: String,
    ) -> Result<Self, CurrentProviderError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(CurrentProviderError::new(
                "Provider tool call omitted tool name",
            ));
        }
        let arguments = serde_json::from_str(&raw_arguments).map_err(|error| {
            CurrentProviderError::new(format!(
                "Provider returned invalid JSON arguments for tool {name}: {error}"
            ))
        })?;
        Ok(Self {
            id,
            name: name.to_string(),
            arguments,
            raw_arguments,
        })
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct CurrentProviderToolResult {
    pub call_id: String,
    pub name: String,
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CurrentProviderTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct CurrentProviderUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cached_input_tokens: Option<u32>,
    pub cache_creation_input_tokens: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CurrentProviderError {
    pub message: String,
    pub status: Option<u16>,
}

impl CurrentProviderError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            status: None,
        }
    }

    fn with_status(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            status: Some(status.as_u16()),
        }
    }
}

impl fmt::Display for CurrentProviderError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for CurrentProviderError {}

#[derive(Clone)]
pub struct CurrentProviderClient {
    config: RuntimeProviderConfig,
    client: Client,
}

impl CurrentProviderClient {
    pub fn new(config: RuntimeProviderConfig) -> Result<Self, CurrentProviderError> {
        let mut client_builder = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(600))
            .tcp_keepalive(Duration::from_secs(60))
            .gzip(true)
            .brotli(true)
            .deflate(true);
        if config
            .base_url
            .as_deref()
            .is_some_and(crate::http::should_bypass_system_proxy)
        {
            client_builder = client_builder.no_proxy();
        }
        let client = client_builder.build().map_err(|error| {
            CurrentProviderError::new(format!("创建 provider HTTP client 失败: {error}"))
        })?;
        Ok(Self { config, client })
    }

    pub fn with_client(config: RuntimeProviderConfig, client: Client) -> Self {
        Self { config, client }
    }

    pub fn config(&self) -> &RuntimeProviderConfig {
        &self.config
    }

    pub fn runtime_handle(&self) -> RuntimeReplyProviderHandle {
        RuntimeReplyProviderHandle::from_config(&self.config, RuntimeProviderBackend::Current)
    }

    pub fn protocol(&self) -> ModelProviderProtocol {
        match self.config.protocol {
            Some(RuntimeProviderProtocol::Responses) => ModelProviderProtocol::Responses,
            Some(RuntimeProviderProtocol::AnthropicMessages) => {
                ModelProviderProtocol::AnthropicMessages
            }
            Some(RuntimeProviderProtocol::ChatCompletions) => {
                ModelProviderProtocol::ChatCompletions
            }
            None if provider_uses_anthropic_messages(&self.config) => {
                ModelProviderProtocol::AnthropicMessages
            }
            None => ModelProviderProtocol::ChatCompletions,
        }
    }

    pub async fn stream(
        &self,
        request: CurrentProviderRequest,
    ) -> Result<CurrentProviderStream, CurrentProviderError> {
        let protocol = self.protocol();
        let canonical_request = request.into_canonical(&self.config.model_name)?;
        let wire_shape = RuntimeReplyProviderRequestWireShape::from_model_request_policy(
            request.model_request_policy.as_ref(),
        );
        let payload = match protocol {
            ModelProviderProtocol::Responses => {
                responses_request(&self.config, &canonical_request, &wire_shape)
            }
            ModelProviderProtocol::AnthropicMessages => {
                anthropic_request(&self.config, &canonical_request)
            }
            ModelProviderProtocol::ChatCompletions | ModelProviderProtocol::Custom(_) => {
                chat_completions_request(&self.config, &canonical_request, &wire_shape)
            }
        };
        let response = self
            .send_stream_request(&protocol, payload, &wire_shape)
            .await?;
        let stream: CurrentProviderStream = match protocol {
            ModelProviderProtocol::Responses => Box::pin(responses_sse(response)),
            ModelProviderProtocol::AnthropicMessages => Box::pin(anthropic_sse(response)),
            ModelProviderProtocol::ChatCompletions | ModelProviderProtocol::Custom(_) => {
                Box::pin(openai_chat_sse(response))
            }
        };
        Ok(stream)
    }

    async fn send_stream_request(
        &self,
        protocol: &ModelProviderProtocol,
        payload: Value,
        wire_shape: &RuntimeReplyProviderRequestWireShape,
    ) -> Result<Response, CurrentProviderError> {
        let api_key = self
            .config
            .api_key
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| CurrentProviderError::new("Provider API key 未配置"))?;
        let urls = provider_urls(protocol, self.config.base_url.as_deref());
        let mut last_response = None;
        let mut attempts = 0;

        for url in urls {
            while attempts < MAX_STREAM_REQUEST_ATTEMPTS {
                attempts += 1;
                let mut request = self
                    .client
                    .post(&url)
                    .header("Content-Type", "application/json")
                    .header("Accept", "text/event-stream")
                    .json(&payload);
                request = match protocol {
                    ModelProviderProtocol::AnthropicMessages => request
                        .header("x-api-key", api_key)
                        .header("anthropic-version", "2023-06-01"),
                    _ => request.header("Authorization", format!("Bearer {api_key}")),
                };
                for header in &wire_shape.headers {
                    request = request.header(&header.name, &header.value);
                }
                let response = match request.send().await {
                    Ok(response) => response,
                    Err(_) if attempts < MAX_STREAM_REQUEST_ATTEMPTS => {
                        tokio::time::sleep(retry_delay(
                            &reqwest::header::HeaderMap::new(),
                            attempts,
                        ))
                        .await;
                        continue;
                    }
                    Err(error) => return Err(request_failure(&url, error)),
                };
                if response.status() == StatusCode::NOT_FOUND {
                    last_response = Some(response);
                    break;
                }
                if should_retry_stream_request_status(response.status())
                    && attempts < MAX_STREAM_REQUEST_ATTEMPTS
                {
                    let delay = retry_delay(response.headers(), attempts);
                    drop(response);
                    tokio::time::sleep(delay).await;
                    continue;
                }
                return ensure_success_response(response).await;
            }
        }

        let response =
            last_response.ok_or_else(|| CurrentProviderError::new("Provider 未生成请求地址"))?;
        ensure_success_response(response).await
    }
}

impl CurrentProvider for CurrentProviderClient {
    fn stream<'a>(
        &'a self,
        request: CurrentProviderRequest,
    ) -> BoxFuture<'a, Result<CurrentProviderStream, CurrentProviderError>> {
        Box::pin(async move { CurrentProviderClient::stream(self, request).await })
    }
}

async fn ensure_success_response(response: Response) -> Result<Response, CurrentProviderError> {
    if response.status().is_success() {
        return Ok(response);
    }
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    let body = body.trim();
    let detail = if body.is_empty() {
        String::new()
    } else {
        format!(": {body}")
    };
    Err(CurrentProviderError::with_status(
        status,
        format!("Provider 请求失败 ({status}){detail}"),
    ))
}

fn provider_uses_anthropic_messages(config: &RuntimeProviderConfig) -> bool {
    [
        config.provider_name.as_str(),
        config.provider_selector.as_deref().unwrap_or_default(),
    ]
    .iter()
    .any(|value| {
        let value = value.to_ascii_lowercase();
        value == "anthropic" || value == "claude" || value.contains("anthropic")
    })
}

fn provider_urls(protocol: &ModelProviderProtocol, base_url: Option<&str>) -> Vec<String> {
    let base_url = base_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| match protocol {
            ModelProviderProtocol::AnthropicMessages => "https://api.anthropic.com",
            _ => "https://api.openai.com",
        });
    let endpoint = match protocol {
        ModelProviderProtocol::Responses => "responses",
        ModelProviderProtocol::AnthropicMessages => "messages",
        ModelProviderProtocol::ChatCompletions | ModelProviderProtocol::Custom(_) => {
            "chat/completions"
        }
    };
    endpoint_urls(base_url, endpoint)
}

fn endpoint_urls(base_url: &str, endpoint: &str) -> Vec<String> {
    let base = base_url.trim_end_matches('/');
    if base.ends_with(endpoint) {
        return vec![base.to_string()];
    }
    let ends_with_version = base.rsplit('/').next().is_some_and(|segment| {
        segment.starts_with('v')
            && segment.len() > 1
            && segment[1..]
                .chars()
                .all(|character| character.is_ascii_digit())
    });
    let primary = if ends_with_version {
        format!("{base}/{endpoint}")
    } else if url::Url::parse(base)
        .ok()
        .is_some_and(|url| url.path().trim_matches('/').is_empty())
    {
        format!("{base}/v1/{endpoint}")
    } else {
        format!("{base}/{endpoint}")
    };
    let mut urls = vec![primary.clone()];
    if primary.contains("/v1/") {
        let without_v1 = primary.replacen("/v1/", "/", 1);
        if without_v1 != primary {
            urls.push(without_v1);
        }
    }
    urls
}

#[cfg(test)]
mod tests {
    use super::lowering::chat_completions_request;
    use super::stream::{
        drain_sse_frames, openai_chat_sse, parse_sse_frame, response_item_tool_call, responses_sse,
    };
    use super::*;
    use crate::runtime_provider::RuntimeProviderConfig;
    use futures::StreamExt;
    use serde_json::json;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
        task::JoinHandle,
    };

    fn config(protocol: Option<RuntimeProviderProtocol>) -> RuntimeProviderConfig {
        RuntimeProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("openai".to_string()),
            model_name: "gpt-5-codex".to_string(),
            api_key: Some("test".to_string()),
            base_url: Some("https://gateway.example.com/v1".to_string()),
            credential_uuid: "credential-1".to_string(),
            reasoning_effort: Some("medium".to_string()),
            protocol,
            toolshim: false,
            toolshim_model: None,
        }
    }

    #[test]
    fn endpoint_urls_keep_versioned_and_custom_provider_paths() {
        assert_eq!(
            endpoint_urls("https://api.openai.com", "chat/completions"),
            vec![
                "https://api.openai.com/v1/chat/completions".to_string(),
                "https://api.openai.com/chat/completions".to_string(),
            ]
        );
        assert_eq!(
            endpoint_urls(
                "https://gateway.example.com/compatible-mode/v2",
                "chat/completions"
            ),
            vec!["https://gateway.example.com/compatible-mode/v2/chat/completions".to_string()]
        );
    }

    #[test]
    fn client_selects_anthropic_from_current_config() {
        let mut config = config(None);
        config.provider_name = "anthropic".to_string();
        let client = CurrentProviderClient::with_client(config, Client::new());

        assert_eq!(client.protocol(), ModelProviderProtocol::AnthropicMessages);
        assert_eq!(
            client.runtime_handle().backend,
            RuntimeProviderBackend::Current
        );
    }

    #[test]
    fn chat_lowering_preserves_images_prior_tool_calls_and_results() {
        let request = CurrentProviderRequest::new(vec![
            CurrentProviderMessage::user(vec![
                CurrentProviderContent::Text("look".to_string()),
                CurrentProviderContent::Image {
                    data: "sidecar://image-1".to_string(),
                    media_type: "image/png".to_string(),
                },
            ]),
            CurrentProviderMessage::assistant(vec![CurrentProviderContent::ToolCall(
                CurrentProviderToolCall::new("call-1", "Read", json!({ "path": "README.md" })),
            )]),
            CurrentProviderMessage::tool(vec![CurrentProviderContent::ToolResult(
                CurrentProviderToolResult {
                    call_id: "call-1".to_string(),
                    name: "Read".to_string(),
                    success: true,
                    output: "content".to_string(),
                    error: None,
                },
            )]),
        ]);

        let canonical = request
            .into_canonical("gpt-5-codex")
            .expect("canonical request");
        let value = chat_completions_request(
            &config(Some(RuntimeProviderProtocol::ChatCompletions)),
            &canonical,
            &RuntimeReplyProviderRequestWireShape::default(),
        );

        assert_eq!(value["messages"][0]["content"][1]["type"], "image_url");
        assert_eq!(
            value["messages"][1]["tool_calls"][0]["function"]["name"],
            "Read"
        );
        assert_eq!(value["messages"][2]["tool_call_id"], "call-1");
    }

    #[test]
    fn canonical_request_rejects_inline_media_payloads() {
        let request = CurrentProviderRequest::new(vec![CurrentProviderMessage::user(vec![
            CurrentProviderContent::Image {
                data: "data:image/png;base64,abc".to_string(),
                media_type: "image/png".to_string(),
            },
        ])]);

        let error = request
            .into_canonical("gpt-5-codex")
            .expect_err("inline media must fail closed");

        assert!(error.message.contains("canonical media input rejected"));
    }

    #[test]
    fn responses_tool_call_is_normalized_from_final_item() {
        let item = json!({
            "type": "function_call",
            "call_id": "call-7",
            "name": "apply_patch",
            "arguments": "{\"patch\":\"*** Begin Patch\"}"
        });
        let call = response_item_tool_call(&item)
            .expect("valid tool call")
            .expect("tool call");

        assert_eq!(call.id, "call-7");
        assert_eq!(call.name, "apply_patch");
        assert_eq!(call.arguments["patch"], "*** Begin Patch");
    }

    #[test]
    fn responses_tool_call_rejects_invalid_json_arguments() {
        let item = json!({
            "type": "function_call",
            "call_id": "call-invalid",
            "name": "apply_patch",
            "arguments": "{not-json"
        });

        let error = response_item_tool_call(&item).expect_err("invalid JSON must fail closed");

        assert!(error.message.contains("invalid JSON arguments"));
    }

    #[test]
    fn responses_tool_call_rejects_blank_tool_name() {
        let item = json!({
            "type": "function_call",
            "call_id": "call-blank-name",
            "name": "  ",
            "arguments": "{}"
        });

        let error = response_item_tool_call(&item).expect_err("blank tool name must fail closed");

        assert_eq!(error.message, "Provider tool call omitted tool name");
    }

    #[test]
    fn sse_frame_parser_keeps_multiline_data_without_comments() {
        let frame =
            parse_sse_frame(": keepalive\ndata: {\"type\":\"response.created\"}\ndata: second")
                .expect("frame");
        assert_eq!(frame.data, "{\"type\":\"response.created\"}\nsecond");
    }

    #[test]
    fn sse_frame_buffer_preserves_utf8_split_across_chunks() {
        let mut pending = b"data: {\"delta\":\"".to_vec();
        pending.extend_from_slice(&[0xE4, 0xB8]);

        assert!(drain_sse_frames(&mut pending)
            .expect("incomplete UTF-8 must stay buffered")
            .is_empty());

        pending.extend_from_slice(&[0xAD, b'\"', b'}', b'\n', b'\n']);
        let frames = drain_sse_frames(&mut pending).expect("valid UTF-8 frame");

        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].data, "{\"delta\":\"中\"}");
        assert!(pending.is_empty());
    }

    #[tokio::test]
    async fn openai_tool_stream_accepts_arguments_before_name() {
        let body = concat!(
            "data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-5.5\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call-1\",\"type\":\"function\",\"function\":{\"arguments\":\"{\\\"query\\\":\\\"\"}}]},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-5.5\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"name\":\"WebSearch\"}}]},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-5.5\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"Rust release\\\"}\"}}]},\"finish_reason\":null}]}\n\n",
            "data: {\"id\":\"chatcmpl-1\",\"object\":\"chat.completion.chunk\",\"created\":1,\"model\":\"gpt-5.5\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"tool_calls\"}]}\n\n",
            "data: [DONE]\n\n"
        );
        let (base_url, _requests, server) = spawn_http_fixture(vec![fixture_response(
            "200 OK",
            "Content-Type: text/event-stream\r\n",
            body,
        )])
        .await;
        let response = Client::builder()
            .no_proxy()
            .build()
            .expect("HTTP client")
            .get(base_url)
            .send()
            .await
            .expect("SSE response");

        let events = openai_chat_sse(response)
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<Vec<_>, _>>()
            .expect("out-of-order tool fields must normalize");

        server.await.expect("fixture server");
        assert!(events.iter().any(|event| matches!(
            event,
            CanonicalLlmEvent::ToolCall { name, input, .. }
                if name == "WebSearch" && input == &json!({ "query": "Rust release" })
        )));
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event, CanonicalLlmEvent::ToolCall { .. }))
                .count(),
            1
        );
        let lifecycle = events
            .iter()
            .filter_map(|event| match event {
                CanonicalLlmEvent::ToolInputStart { .. } => Some("start"),
                CanonicalLlmEvent::ToolInputDelta { .. } => Some("delta"),
                CanonicalLlmEvent::ToolInputEnd { .. } => Some("end"),
                CanonicalLlmEvent::ToolCall { .. } => Some("call"),
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(lifecycle, ["start", "delta", "delta", "end", "call"]);
    }

    #[tokio::test]
    async fn responses_tool_stream_accepts_arguments_before_name() {
        let body = concat!(
            "data: {\"type\":\"response.function_call_arguments.delta\",\"call_id\":\"call-1\",\"delta\":\"{\\\"query\\\":\\\"\"}\n\n",
            "data: {\"type\":\"response.function_call_arguments.delta\",\"call_id\":\"call-1\",\"name\":\"WebSearch\",\"delta\":\"Rust release\\\"}\"}\n\n",
            "data: {\"type\":\"response.function_call_arguments.done\",\"call_id\":\"call-1\",\"arguments\":\"{\\\"query\\\":\\\"Rust release\\\"}\"}\n\n",
            "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp-1\",\"output\":[]}}\n\n"
        );
        let (base_url, _requests, server) = spawn_http_fixture(vec![fixture_response(
            "200 OK",
            "Content-Type: text/event-stream\r\n",
            body,
        )])
        .await;
        let response = Client::builder()
            .no_proxy()
            .build()
            .expect("HTTP client")
            .get(base_url)
            .send()
            .await
            .expect("SSE response");

        let events = responses_sse(response)
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<Vec<_>, _>>()
            .expect("out-of-order tool fields must normalize");

        server.await.expect("fixture server");
        assert!(events.iter().any(|event| matches!(
            event,
            CanonicalLlmEvent::ToolCall { name, input, .. }
                if name == "WebSearch" && input == &json!({ "query": "Rust release" })
        )));
        assert_eq!(
            events
                .iter()
                .filter(|event| matches!(event, CanonicalLlmEvent::ToolCall { .. }))
                .count(),
            1
        );
        let lifecycle = events
            .iter()
            .filter_map(|event| match event {
                CanonicalLlmEvent::ToolInputStart { .. } => Some("start"),
                CanonicalLlmEvent::ToolInputDelta { .. } => Some("delta"),
                CanonicalLlmEvent::ToolInputEnd { .. } => Some("end"),
                CanonicalLlmEvent::ToolCall { .. } => Some("call"),
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(lifecycle, ["start", "delta", "end", "call"]);
    }

    #[tokio::test]
    async fn responses_tool_stream_rejects_terminal_arguments_without_name() {
        let body = concat!(
            "data: {\"type\":\"response.function_call_arguments.delta\",\"call_id\":\"call-1\",\"delta\":\"{}\"}\n\n",
            "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp-1\",\"output\":[]}}\n\n"
        );
        let (base_url, _requests, server) = spawn_http_fixture(vec![fixture_response(
            "200 OK",
            "Content-Type: text/event-stream\r\n",
            body,
        )])
        .await;
        let response = Client::builder()
            .no_proxy()
            .build()
            .expect("HTTP client")
            .get(base_url)
            .send()
            .await
            .expect("SSE response");

        let error = responses_sse(response)
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .collect::<Result<Vec<_>, _>>()
            .expect_err("terminal incomplete tool call must fail closed");

        server.await.expect("fixture server");
        assert_eq!(error.message, "Provider tool call omitted tool name");
    }

    #[tokio::test]
    async fn stream_request_retries_transient_statuses_until_success() {
        let (base_url, requests, server) = spawn_http_fixture(vec![
            fixture_response(
                "503 Service Unavailable",
                "Retry-After: 0\r\n",
                "unavailable",
            ),
            fixture_response(
                "503 Service Unavailable",
                "Retry-After: 0\r\n",
                "unavailable",
            ),
            fixture_response("200 OK", "", ""),
        ])
        .await;
        let mut runtime_config = config(Some(RuntimeProviderProtocol::ChatCompletions));
        runtime_config.base_url = Some(base_url);
        let client = CurrentProviderClient::with_client(
            runtime_config,
            Client::builder().no_proxy().build().expect("HTTP client"),
        );

        let response = client
            .send_stream_request(
                &ModelProviderProtocol::ChatCompletions,
                json!({ "stream": true }),
                &RuntimeReplyProviderRequestWireShape::default(),
            )
            .await
            .expect("third attempt succeeds");

        assert_eq!(response.status(), StatusCode::OK);
        server.await.expect("fixture server");
        assert_eq!(requests.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn stream_request_does_not_retry_non_retryable_statuses() {
        let (base_url, requests, server) = spawn_http_fixture(vec![fixture_response(
            "400 Bad Request",
            "",
            "invalid model",
        )])
        .await;
        let mut runtime_config = config(Some(RuntimeProviderProtocol::ChatCompletions));
        runtime_config.base_url = Some(base_url);
        let client = CurrentProviderClient::with_client(
            runtime_config,
            Client::builder().no_proxy().build().expect("HTTP client"),
        );

        let error = client
            .send_stream_request(
                &ModelProviderProtocol::ChatCompletions,
                json!({ "stream": true }),
                &RuntimeReplyProviderRequestWireShape::default(),
            )
            .await
            .expect_err("bad request must fail immediately");

        assert_eq!(error.status, Some(StatusCode::BAD_REQUEST.as_u16()));
        assert!(error.message.contains("invalid model"));
        server.await.expect("fixture server");
        assert_eq!(requests.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn stream_request_returns_final_transient_status_after_retry_budget() {
        let (base_url, requests, server) = spawn_http_fixture(vec![
            fixture_response("503 Service Unavailable", "Retry-After: 0\r\n", "first"),
            fixture_response("503 Service Unavailable", "Retry-After: 0\r\n", "second"),
            fixture_response("503 Service Unavailable", "Retry-After: 0\r\n", "third"),
            fixture_response("503 Service Unavailable", "Retry-After: 0\r\n", "fourth"),
            fixture_response("503 Service Unavailable", "Retry-After: 0\r\n", "final"),
        ])
        .await;
        let mut runtime_config = config(Some(RuntimeProviderProtocol::ChatCompletions));
        runtime_config.base_url = Some(base_url);
        let client = CurrentProviderClient::with_client(
            runtime_config,
            Client::builder().no_proxy().build().expect("HTTP client"),
        );

        let error = client
            .send_stream_request(
                &ModelProviderProtocol::ChatCompletions,
                json!({ "stream": true }),
                &RuntimeReplyProviderRequestWireShape::default(),
            )
            .await
            .expect_err("all transient failures must remain visible");

        assert_eq!(error.status, Some(StatusCode::SERVICE_UNAVAILABLE.as_u16()));
        assert!(error.message.contains("final"));
        server.await.expect("fixture server");
        assert_eq!(
            requests.load(Ordering::SeqCst),
            usize::from(MAX_STREAM_REQUEST_ATTEMPTS)
        );
    }

    #[tokio::test]
    async fn stream_request_shares_retry_budget_with_compatible_endpoint_probe() {
        let (base_url, requests, server) = spawn_http_fixture(vec![
            fixture_response("404 Not Found", "", "not found"),
            fixture_response("503 Service Unavailable", "Retry-After: 0\r\n", "second"),
            fixture_response("503 Service Unavailable", "Retry-After: 0\r\n", "third"),
            fixture_response("503 Service Unavailable", "Retry-After: 0\r\n", "fourth"),
            fixture_response("503 Service Unavailable", "Retry-After: 0\r\n", "final"),
        ])
        .await;
        let mut runtime_config = config(Some(RuntimeProviderProtocol::ChatCompletions));
        runtime_config.base_url = Some(base_url);
        let client = CurrentProviderClient::with_client(
            runtime_config,
            Client::builder().no_proxy().build().expect("HTTP client"),
        );

        let error = client
            .send_stream_request(
                &ModelProviderProtocol::ChatCompletions,
                json!({ "stream": true }),
                &RuntimeReplyProviderRequestWireShape::default(),
            )
            .await
            .expect_err("shared retry budget is exhausted");

        assert_eq!(error.status, Some(StatusCode::SERVICE_UNAVAILABLE.as_u16()));
        assert!(error.message.contains("final"));
        server.await.expect("fixture server");
        assert_eq!(
            requests.load(Ordering::SeqCst),
            usize::from(MAX_STREAM_REQUEST_ATTEMPTS)
        );
    }

    async fn spawn_http_fixture(
        responses: Vec<String>,
    ) -> (String, Arc<AtomicUsize>, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind fixture server");
        let address = listener.local_addr().expect("fixture address");
        let requests = Arc::new(AtomicUsize::new(0));
        let request_count = Arc::clone(&requests);
        let server = tokio::spawn(async move {
            for response in responses {
                let (mut stream, _) = listener.accept().await.expect("accept fixture request");
                request_count.fetch_add(1, Ordering::SeqCst);
                read_http_headers(&mut stream).await;
                stream
                    .write_all(response.as_bytes())
                    .await
                    .expect("write fixture response");
                stream.shutdown().await.expect("close fixture response");
            }
        });
        (format!("http://{address}"), requests, server)
    }

    async fn read_http_headers(stream: &mut tokio::net::TcpStream) {
        let mut received = Vec::new();
        let mut buffer = [0_u8; 1024];
        while !received.windows(4).any(|window| window == b"\r\n\r\n") {
            let read = stream
                .read(&mut buffer)
                .await
                .expect("read fixture request");
            if read == 0 {
                return;
            }
            received.extend_from_slice(&buffer[..read]);
        }
    }

    fn fixture_response(status: &str, extra_headers: &str, body: &str) -> String {
        format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{extra_headers}\r\n{body}",
            body.len()
        )
    }
}
