//! OpenAI Chat Completion API wire models.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageUrl {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentPart {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image_url")]
    ImageUrl { image_url: ImageUrl },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: FunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum MessageContent {
    Text(String),
    Parts(Vec<ContentPart>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<MessageContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
}

impl ChatMessage {
    pub fn get_content_text(&self) -> String {
        match &self.content {
            Some(MessageContent::Text(text)) => text.clone(),
            Some(MessageContent::Parts(parts)) => parts
                .iter()
                .filter_map(|part| {
                    if let ContentPart::Text { text } = part {
                        Some(text.clone())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
                .join(""),
            None => String::new(),
        }
    }

    pub fn get_images(&self) -> Vec<(String, String)> {
        match &self.content {
            Some(MessageContent::Parts(parts)) => parts
                .iter()
                .filter_map(|part| {
                    if let ContentPart::ImageUrl { image_url } = part {
                        if image_url.url.starts_with("data:") {
                            let parts: Vec<&str> = image_url.url.splitn(2, ',').collect();
                            if parts.len() == 2 {
                                let header = parts[0];
                                let data = parts[1];
                                let media_type = header
                                    .strip_prefix("data:")
                                    .and_then(|value| value.split(';').next())
                                    .unwrap_or("image/jpeg");
                                let format =
                                    media_type.split('/').nth(1).unwrap_or("jpeg").to_string();
                                return Some((format, data.to_string()));
                            }
                        }
                        None
                    } else {
                        None
                    }
                })
                .collect(),
            _ => Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDef {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum Tool {
    #[serde(rename = "function")]
    Function { function: FunctionDef },
    #[serde(rename = "web_search")]
    WebSearch,
    #[serde(rename = "web_search_20250305")]
    WebSearch20250305,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    #[serde(default)]
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct UsageDetails {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cached_tokens: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StreamUsage {
    #[serde(default)]
    pub prompt_tokens: u32,
    #[serde(default)]
    pub completion_tokens: u32,
    #[serde(default)]
    pub total_tokens: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_tokens_details: Option<UsageDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Choice {
    pub index: u32,
    pub message: ResponseMessage,
    pub finish_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionResponse {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<Choice>,
    pub usage: Usage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamDelta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<StreamToolCallDelta>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
}

/// OpenAI Chat Completions 流式工具调用增量。
///
/// 该 DTO 与完整 `ToolCall` 分离：真实 SSE 只会在首块给出 id/name，后续块只给出
/// index 和 arguments 片段。把它误解为完整工具调用会丢失流式工具续轮。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StreamToolCallDelta {
    pub index: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "type", default, skip_serializing_if = "Option::is_none")]
    pub call_type: Option<String>,
    #[serde(default)]
    pub function: StreamFunctionCallDelta,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StreamFunctionCallDelta {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arguments: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChoice {
    pub index: u32,
    pub delta: StreamDelta,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionChunk {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub object: String,
    pub created: u64,
    pub model: String,
    #[serde(default)]
    pub choices: Vec<StreamChoice>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<StreamUsage>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_message_roundtrips() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: Some(MessageContent::Text("Hello".to_string())),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
        };

        let json = serde_json::to_string(&message).unwrap();
        let parsed: ChatMessage = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.get_content_text(), "Hello");
    }

    #[test]
    fn stream_delta_keeps_reasoning_content_when_present() {
        let delta = StreamDelta {
            role: Some("assistant".to_string()),
            content: Some("answer".to_string()),
            tool_calls: None,
            reasoning_content: Some("thinking...".to_string()),
        };

        let json = serde_json::to_string(&delta).unwrap();
        let parsed: StreamDelta = serde_json::from_str(&json).unwrap();

        assert!(json.contains("reasoning_content"));
        assert_eq!(parsed.reasoning_content.as_deref(), Some("thinking..."));
    }

    #[test]
    fn stream_delta_skips_absent_reasoning_content() {
        let delta = StreamDelta {
            role: None,
            content: Some("hello".to_string()),
            tool_calls: None,
            reasoning_content: None,
        };

        let json = serde_json::to_string(&delta).unwrap();

        assert!(!json.contains("reasoning_content"));
    }

    #[test]
    fn stream_tool_delta_keeps_partial_fields() {
        let delta: StreamToolCallDelta =
            serde_json::from_str(r#"{"index":0,"function":{"arguments":"{\"path\":\"src"}}"#)
                .expect("parse tool delta");

        assert_eq!(delta.index, 0);
        assert_eq!(delta.id, None);
        assert_eq!(delta.function.name, None);
        assert_eq!(delta.function.arguments.as_deref(), Some("{\"path\":\"src"));
    }
}
