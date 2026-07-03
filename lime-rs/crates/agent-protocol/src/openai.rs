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
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
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
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<StreamChoice>,
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
}
