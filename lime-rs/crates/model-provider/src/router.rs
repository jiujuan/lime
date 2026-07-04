//! Provider Router trait 和相关 DTO
//!
//! 定义模型提供者路由的核心接口，负责：
//! - 将请求路由到具体的模型提供者
//! - 处理流式响应
//! - 查询模型能力

use agent_protocol::{ModelId, TurnId};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{ModelProviderResult, ModelRoute};

/// 统一的消息角色
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    System,
    User,
    Assistant,
    Tool,
}

/// 统一的消息内容块
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult { tool_use_id: String, content: Value },
    #[serde(rename = "thinking")]
    Thinking { thinking: String },
}

/// 统一的消息结构
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Message {
    pub role: MessageRole,
    pub content: Vec<ContentBlock>,
    #[serde(default)]
    pub metadata: Value,
}

/// 统一的工具定义
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Tool {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_schema: Option<Value>,
}

/// Token 使用统计
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
}

impl TokenUsage {
    pub fn new(input_tokens: u32, output_tokens: u32) -> Self {
        Self {
            input_tokens,
            output_tokens,
        }
    }

    pub fn total(&self) -> u32 {
        self.input_tokens + self.output_tokens
    }
}

/// 发送给 Provider 的请求
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ProviderRequest {
    pub turn_id: TurnId,
    pub model: ModelId,
    pub messages: Vec<Message>,
    #[serde(default)]
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<Value>,
    #[serde(default)]
    pub metadata: Value,
}

/// Provider 返回的完整响应
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ProviderResponse {
    pub id: String,
    pub model: ModelId,
    pub content: Vec<ContentBlock>,
    pub usage: TokenUsage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_reason: Option<String>,
    #[serde(default)]
    pub metadata: Value,
}

impl ProviderResponse {
    /// 拼接响应中的文本块。
    pub fn concat_text(&self) -> String {
        self.content
            .iter()
            .filter_map(|block| match block {
                ContentBlock::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

/// 流式响应的增量内容
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentDelta {
    #[serde(rename = "text_delta")]
    TextDelta { text: String },
    #[serde(rename = "tool_use_start")]
    ToolUseStart { id: String, name: String },
    #[serde(rename = "tool_input_delta")]
    ToolInputDelta { partial_json: String },
    #[serde(rename = "thinking_delta")]
    ThinkingDelta { thinking: String },
}

/// 流式响应的单个块
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct StreamChunk {
    pub index: u32,
    pub delta: ContentDelta,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
}

/// 模型能力描述
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ModelCapability {
    pub name: String,
    pub supported: bool,
    #[serde(default)]
    pub metadata: Value,
}

/// Provider 路由器核心 trait
///
/// 负责将请求路由到具体的模型提供者，处理流式响应，查询模型能力
pub trait ProviderRouter: Send + Sync {
    /// 为给定请求选择合适的路由
    ///
    /// # Arguments
    /// * `request` - Provider 请求
    ///
    /// # Returns
    /// * `ModelRoute` - 选中的路由信息，包含 provider、model、protocol 等
    fn route_request(&self, request: &ProviderRequest) -> ModelProviderResult<ModelRoute>;

    /// 流式处理响应
    ///
    /// # Arguments
    /// * `route` - 已选择的路由
    /// * `request` - Provider 请求
    ///
    /// # Returns
    /// * 异步流，每个元素是 `StreamChunk`
    fn stream_response(
        &self,
        route: &ModelRoute,
        request: &ProviderRequest,
    ) -> ModelProviderResult<Box<dyn StreamResponse>>;

    /// 获取模型的特定能力信息
    ///
    /// # Arguments
    /// * `model` - 模型 ID
    /// * `capability_name` - 能力名称，如 "streaming", "tools", "vision" 等
    ///
    /// # Returns
    /// * `ModelCapability` - 能力详情
    fn get_capability(
        &self,
        model: &ModelId,
        capability_name: &str,
    ) -> ModelProviderResult<ModelCapability>;

    /// 获取模型的上下文窗口大小
    ///
    /// # Arguments
    /// * `model` - 模型 ID
    ///
    /// # Returns
    /// * 上下文窗口 token 数量
    fn get_context_window(&self, model: &ModelId) -> ModelProviderResult<usize> {
        agent_protocol::model_context::resolve_model_context_window(model.as_str())
            .ok_or_else(|| crate::ModelProviderError::new("无法解析模型上下文窗口"))
    }
}

/// 流式响应 trait，用于抽象不同的异步流实现
pub trait StreamResponse: Send {
    /// 获取下一个流块
    fn poll_next(&mut self) -> ModelProviderResult<Option<StreamChunk>>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_usage_calculates_total() {
        let usage = TokenUsage::new(100, 50);
        assert_eq!(usage.total(), 150);
    }

    #[test]
    fn message_role_serializes_lowercase() {
        let role = MessageRole::User;
        let json = serde_json::to_string(&role).unwrap();
        assert_eq!(json, "\"user\"");
    }

    #[test]
    fn content_block_text_roundtrips() {
        let block = ContentBlock::Text {
            text: "Hello".to_string(),
        };
        let json = serde_json::to_string(&block).unwrap();
        let parsed: ContentBlock = serde_json::from_str(&json).unwrap();

        assert!(matches!(parsed, ContentBlock::Text { .. }));
    }

    #[test]
    fn provider_request_with_minimal_fields() {
        let request = ProviderRequest {
            turn_id: TurnId::new("turn-1"),
            model: ModelId::new("claude-sonnet-4-20250514"),
            messages: vec![Message {
                role: MessageRole::User,
                content: vec![ContentBlock::Text {
                    text: "Hello".to_string(),
                }],
                metadata: Value::Null,
            }],
            stream: false,
            max_tokens: None,
            temperature: None,
            tools: None,
            tool_choice: None,
            metadata: Value::Null,
        };

        let json = serde_json::to_string(&request).unwrap();
        let parsed: ProviderRequest = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.model.as_str(), "claude-sonnet-4-20250514");
        assert_eq!(parsed.messages.len(), 1);
    }

    #[test]
    fn provider_response_concatenates_text_blocks() {
        let response = ProviderResponse {
            id: "response-1".to_string(),
            model: ModelId::new("claude-sonnet-4-20250514"),
            content: vec![
                ContentBlock::Text {
                    text: "第一段".to_string(),
                },
                ContentBlock::Thinking {
                    thinking: "内部思考不进入文本输出".to_string(),
                },
                ContentBlock::Text {
                    text: "第二段".to_string(),
                },
            ],
            usage: TokenUsage::new(10, 5),
            stop_reason: None,
            metadata: Value::Null,
        };

        assert_eq!(response.concat_text(), "第一段\n第二段");
    }
}
