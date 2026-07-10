use chrono::Utc;
use rmcp::model::{
    AnnotateAble, CallToolRequestParam, CallToolResult, Content, ErrorData, ImageContent,
    JsonObject, PromptMessage, PromptMessageContent, PromptMessageRole, RawContent,
    RawImageContent, RawTextContent, ResourceContents, Role, TextContent,
};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashSet;
use std::fmt;
use utoipa::ToSchema;

use crate::conversation::tool_result_serde;
use crate::conversation::unicode_tags::sanitize_tags;

pub type ToolResult<T> = Result<T, ErrorData>;

#[derive(ToSchema)]
pub enum ToolCallResult<T> {
    Success { value: T },
    Error { error: String },
}

/// Custom deserializer for MessageContent that sanitizes Unicode Tags in text content
fn deserialize_sanitized_content<'de, D>(deserializer: D) -> Result<Vec<MessageContent>, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de::Error;

    let mut raw: Vec<serde_json::Value> = Vec::deserialize(deserializer)?;

    // Filter out old "conversationCompacted" messages from pre-14.0
    raw.retain(|item| item.get("type").and_then(|v| v.as_str()) != Some("conversationCompacted"));

    let mut content: Vec<MessageContent> = serde_json::from_value(serde_json::Value::Array(raw))
        .map_err(|e| Error::custom(format!("Failed to deserialize MessageContent: {}", e)))?;

    for message_content in &mut content {
        if let MessageContent::Text(text_content) = message_content {
            let original = &text_content.text;
            let sanitized = sanitize_tags(original);
            if *original != sanitized {
                tracing::info!(
                    original = %original,
                    sanitized = %sanitized,
                    removed_count = original.len() - sanitized.len(),
                    "Unicode Tags sanitized during Message deserialization"
                );
                text_content.text = sanitized;
            }
        }
    }

    Ok(content)
}

/// Provider-specific metadata for tool requests/responses.
/// Allows providers to store custom data without polluting the core model.
pub type ProviderMetadata = serde_json::Map<String, serde_json::Value>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(ToSchema)]
pub struct ToolRequest {
    pub id: String,
    #[serde(with = "tool_result_serde")]
    #[schema(value_type = Object)]
    pub tool_call: ToolResult<CallToolRequestParam>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Object)]
    pub metadata: Option<ProviderMetadata>,
    #[serde(rename = "_meta", skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Object)]
    pub tool_meta: Option<serde_json::Value>,
}

impl ToolRequest {
    pub fn to_readable_string(&self) -> String {
        match &self.tool_call {
            Ok(tool_call) => {
                format!(
                    "Tool: {}, Args: {}",
                    tool_call.name,
                    serde_json::to_string_pretty(&tool_call.arguments)
                        .unwrap_or_else(|_| "<<invalid json>>".to_string())
                )
            }
            Err(e) => format!("Invalid tool call: {}", e),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(ToSchema)]
pub struct ToolResponse {
    pub id: String,
    #[serde(with = "tool_result_serde::call_tool_result")]
    #[schema(value_type = Object)]
    pub tool_result: ToolResult<CallToolResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Object)]
    pub metadata: Option<ProviderMetadata>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(ToSchema)]
pub struct ToolConfirmationRequest {
    pub id: String,
    pub tool_name: String,
    pub arguments: JsonObject,
    pub prompt: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "actionType", rename_all = "camelCase")]
pub enum ActionRequiredData {
    #[serde(rename_all = "camelCase")]
    ToolConfirmation {
        id: String,
        tool_name: String,
        arguments: JsonObject,
        prompt: Option<String>,
    },
    Elicitation {
        id: String,
        message: String,
        requested_schema: serde_json::Value,
    },
    ElicitationResponse {
        id: String,
        user_data: serde_json::Value,
    },
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ActionRequiredScope {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ActionRequired {
    pub data: ActionRequiredData,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<ActionRequiredScope>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct ThinkingContent {
    pub thinking: String,
    pub signature: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct RedactedThinkingContent {
    pub data: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct FrontendToolRequest {
    pub id: String,
    #[serde(with = "tool_result_serde")]
    #[schema(value_type = Object)]
    pub tool_call: ToolResult<CallToolRequestParam>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ToolInputDeltaContent {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    pub delta: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accumulated_arguments: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub enum SystemNotificationType {
    ThinkingMessage,
    InlineMessage,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SystemNotificationContent {
    pub notification_type: SystemNotificationType,
    pub msg: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
/// Content passed inside a message, which can be both simple content and tool content
#[serde(tag = "type", rename_all = "camelCase")]
pub enum MessageContent {
    Text(TextContent),
    Image(ImageContent),
    ToolRequest(ToolRequest),
    ToolResponse(ToolResponse),
    ToolConfirmationRequest(ToolConfirmationRequest),
    ActionRequired(ActionRequired),
    FrontendToolRequest(FrontendToolRequest),
    ToolInputDelta(ToolInputDeltaContent),
    Thinking(ThinkingContent),
    RedactedThinking(RedactedThinkingContent),
    SystemNotification(SystemNotificationContent),
}

impl fmt::Display for MessageContent {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MessageContent::Text(t) => write!(f, "{}", t.text),
            MessageContent::Image(i) => write!(f, "[Image: {}]", i.mime_type),
            MessageContent::ToolRequest(r) => {
                write!(f, "[ToolRequest: {}]", r.to_readable_string())
            }
            MessageContent::ToolResponse(r) => write!(
                f,
                "[ToolResponse: {}]",
                match &r.tool_result {
                    Ok(result) => format!("{} content item(s)", result.content.len()),
                    Err(e) => format!("Error: {e}"),
                }
            ),
            MessageContent::ToolConfirmationRequest(r) => {
                write!(f, "[ToolConfirmationRequest: {}]", r.tool_name)
            }
            MessageContent::ActionRequired(a) => match &a.data {
                ActionRequiredData::ToolConfirmation { tool_name, .. } => {
                    write!(f, "[ActionRequired: ToolConfirmation for {}]", tool_name)
                }
                ActionRequiredData::Elicitation { message, .. } => {
                    write!(f, "[ActionRequired: Elicitation - {}]", message)
                }
                ActionRequiredData::ElicitationResponse { id, .. } => {
                    write!(f, "[ActionRequired: ElicitationResponse for {}]", id)
                }
            },
            MessageContent::FrontendToolRequest(r) => match &r.tool_call {
                Ok(tool_call) => write!(f, "[FrontendToolRequest: {}]", tool_call.name),
                Err(e) => write!(f, "[FrontendToolRequest: Error: {}]", e),
            },
            MessageContent::ToolInputDelta(delta) => write!(
                f,
                "[ToolInputDelta: {} {} chars]",
                delta.tool_name.as_deref().unwrap_or("unknown"),
                delta.delta.len()
            ),
            MessageContent::Thinking(t) => write!(f, "[Thinking: {}]", t.thinking),
            MessageContent::RedactedThinking(_r) => write!(f, "[RedactedThinking]"),
            MessageContent::SystemNotification(r) => {
                write!(f, "[SystemNotification: {}]", r.msg)
            }
        }
    }
}

impl MessageContent {
    pub fn text<S: Into<String>>(text: S) -> Self {
        MessageContent::Text(
            RawTextContent {
                text: text.into(),
                meta: None,
            }
            .no_annotation(),
        )
    }

    pub fn image<S: Into<String>, T: Into<String>>(data: S, mime_type: T) -> Self {
        MessageContent::Image(
            RawImageContent {
                data: data.into(),
                mime_type: mime_type.into(),
                meta: None,
            }
            .no_annotation(),
        )
    }

    pub fn tool_request<S: Into<String>>(
        id: S,
        tool_call: ToolResult<CallToolRequestParam>,
    ) -> Self {
        MessageContent::ToolRequest(ToolRequest {
            id: id.into(),
            tool_call,
            metadata: None,
            tool_meta: None,
        })
    }

    pub fn tool_request_with_metadata<S: Into<String>>(
        id: S,
        tool_call: ToolResult<CallToolRequestParam>,
        metadata: Option<&ProviderMetadata>,
    ) -> Self {
        MessageContent::ToolRequest(ToolRequest {
            id: id.into(),
            tool_call,
            metadata: metadata.cloned(),
            tool_meta: None,
        })
    }

    pub fn tool_response<S: Into<String>>(id: S, tool_result: ToolResult<CallToolResult>) -> Self {
        MessageContent::ToolResponse(ToolResponse {
            id: id.into(),
            tool_result,
            metadata: None,
        })
    }

    pub fn tool_response_with_metadata<S: Into<String>>(
        id: S,
        tool_result: ToolResult<CallToolResult>,
        metadata: Option<&ProviderMetadata>,
    ) -> Self {
        MessageContent::ToolResponse(ToolResponse {
            id: id.into(),
            tool_result,
            metadata: metadata.cloned(),
        })
    }

    pub fn action_required<S: Into<String>>(
        id: S,
        tool_name: String,
        arguments: JsonObject,
        prompt: Option<String>,
    ) -> Self {
        MessageContent::ActionRequired(ActionRequired {
            data: ActionRequiredData::ToolConfirmation {
                id: id.into(),
                tool_name,
                arguments,
                prompt,
            },
            scope: None,
        })
    }

    pub fn action_required_elicitation<S: Into<String>>(
        id: S,
        message: String,
        requested_schema: serde_json::Value,
    ) -> Self {
        MessageContent::ActionRequired(ActionRequired {
            data: ActionRequiredData::Elicitation {
                id: id.into(),
                message,
                requested_schema,
            },
            scope: None,
        })
    }

    pub fn action_required_elicitation_response<S: Into<String>>(
        id: S,
        user_data: serde_json::Value,
    ) -> Self {
        MessageContent::ActionRequired(ActionRequired {
            data: ActionRequiredData::ElicitationResponse {
                id: id.into(),
                user_data,
            },
            scope: None,
        })
    }

    pub fn thinking<S1: Into<String>, S2: Into<String>>(thinking: S1, signature: S2) -> Self {
        MessageContent::Thinking(ThinkingContent {
            thinking: thinking.into(),
            signature: signature.into(),
        })
    }

    pub fn redacted_thinking<S: Into<String>>(data: S) -> Self {
        MessageContent::RedactedThinking(RedactedThinkingContent { data: data.into() })
    }

    pub fn frontend_tool_request<S: Into<String>>(
        id: S,
        tool_call: ToolResult<CallToolRequestParam>,
    ) -> Self {
        MessageContent::FrontendToolRequest(FrontendToolRequest {
            id: id.into(),
            tool_call,
        })
    }

    pub fn tool_input_delta<S1, S2, S3, S4, S5>(
        id: S1,
        tool_name: Option<S2>,
        delta: S3,
        accumulated_arguments: Option<S4>,
        provider: Option<S5>,
    ) -> Self
    where
        S1: Into<String>,
        S2: Into<String>,
        S3: Into<String>,
        S4: Into<String>,
        S5: Into<String>,
    {
        MessageContent::ToolInputDelta(ToolInputDeltaContent {
            id: id.into(),
            tool_name: tool_name.map(Into::into),
            delta: delta.into(),
            accumulated_arguments: accumulated_arguments.map(Into::into),
            provider: provider.map(Into::into),
        })
    }

    pub fn system_notification<S: Into<String>>(
        notification_type: SystemNotificationType,
        msg: S,
    ) -> Self {
        MessageContent::SystemNotification(SystemNotificationContent {
            notification_type,
            msg: msg.into(),
        })
    }

    pub fn as_system_notification(&self) -> Option<&SystemNotificationContent> {
        if let MessageContent::SystemNotification(ref notification) = self {
            Some(notification)
        } else {
            None
        }
    }

    pub fn as_tool_request(&self) -> Option<&ToolRequest> {
        if let MessageContent::ToolRequest(ref tool_request) = self {
            Some(tool_request)
        } else {
            None
        }
    }

    pub fn as_tool_response(&self) -> Option<&ToolResponse> {
        if let MessageContent::ToolResponse(ref tool_response) = self {
            Some(tool_response)
        } else {
            None
        }
    }

    pub fn as_action_required(&self) -> Option<&ActionRequired> {
        if let MessageContent::ActionRequired(ref action_required) = self {
            Some(action_required)
        } else {
            None
        }
    }

    pub fn as_tool_response_text(&self) -> Option<String> {
        if let Some(tool_response) = self.as_tool_response() {
            if let Ok(result) = &tool_response.tool_result {
                let texts: Vec<String> = result
                    .content
                    .iter()
                    .filter_map(|content| content.as_text().map(|t| t.text.to_string()))
                    .collect();
                if !texts.is_empty() {
                    return Some(texts.join("\n"));
                }
            }
        }
        None
    }

    /// Get the text content if this is a TextContent variant
    pub fn as_text(&self) -> Option<&str> {
        match self {
            MessageContent::Text(text) => Some(&text.text),
            _ => None,
        }
    }

    /// Get the thinking content if this is a ThinkingContent variant
    pub fn as_thinking(&self) -> Option<&ThinkingContent> {
        match self {
            MessageContent::Thinking(thinking) => Some(thinking),
            _ => None,
        }
    }

    /// Get the redacted thinking content if this is a RedactedThinkingContent variant
    pub fn as_redacted_thinking(&self) -> Option<&RedactedThinkingContent> {
        match self {
            MessageContent::RedactedThinking(redacted) => Some(redacted),
            _ => None,
        }
    }
}

impl From<Content> for MessageContent {
    fn from(content: Content) -> Self {
        match content.raw {
            RawContent::Text(text) => {
                MessageContent::Text(text.optional_annotate(content.annotations))
            }
            RawContent::Image(image) => {
                MessageContent::Image(image.optional_annotate(content.annotations))
            }
            RawContent::ResourceLink(_link) => MessageContent::text("[Resource link]"),
            RawContent::Resource(resource) => {
                let text = match &resource.resource {
                    ResourceContents::TextResourceContents { text, .. } => text.clone(),
                    ResourceContents::BlobResourceContents { blob, .. } => {
                        format!("[Binary content: {}]", blob.clone())
                    }
                };
                MessageContent::text(text)
            }
            RawContent::Audio(_) => {
                MessageContent::text("[Audio content: not supported]".to_string())
            }
        }
    }
}

impl From<PromptMessage> for Message {
    fn from(prompt_message: PromptMessage) -> Self {
        // Create a new message with the appropriate role
        let message = match prompt_message.role {
            PromptMessageRole::User => Message::user(),
            PromptMessageRole::Assistant => Message::assistant(),
        };

        // Convert and add the content
        let content = match prompt_message.content {
            PromptMessageContent::Text { text } => MessageContent::text(text),
            PromptMessageContent::Image { image } => {
                MessageContent::image(image.data.clone(), image.mime_type.clone())
            }
            PromptMessageContent::ResourceLink { .. } => MessageContent::text("[Resource link]"),
            PromptMessageContent::Resource { resource } => {
                // For resources, convert to text content with the resource text
                match &resource.resource {
                    ResourceContents::TextResourceContents { text, .. } => {
                        MessageContent::text(text.clone())
                    }
                    ResourceContents::BlobResourceContents { blob, .. } => {
                        MessageContent::text(format!("[Binary content: {}]", blob.clone()))
                    }
                }
            }
        };

        message.with_content(content)
    }
}

#[derive(ToSchema, Clone, Copy, PartialEq, Serialize, Deserialize, Debug)]
/// Metadata for message visibility
#[serde(rename_all = "camelCase")]
pub struct MessageMetadata {
    /// Whether the message should be visible to the user in the UI
    pub user_visible: bool,
    /// Whether the message should be included in the agent's context window
    pub agent_visible: bool,
}

impl Default for MessageMetadata {
    fn default() -> Self {
        MessageMetadata {
            user_visible: true,
            agent_visible: true,
        }
    }
}

impl MessageMetadata {
    /// Create metadata for messages visible only to the agent
    pub fn agent_only() -> Self {
        MessageMetadata {
            user_visible: false,
            agent_visible: true,
        }
    }

    /// Create metadata for messages visible only to the user
    pub fn user_only() -> Self {
        MessageMetadata {
            user_visible: true,
            agent_visible: false,
        }
    }

    /// Create metadata for messages visible to neither user nor agent (archived)
    pub fn invisible() -> Self {
        MessageMetadata {
            user_visible: false,
            agent_visible: false,
        }
    }

    /// Return a copy with agent_visible set to false
    pub fn with_agent_invisible(self) -> Self {
        Self {
            agent_visible: false,
            ..self
        }
    }

    /// Return a copy with user_visible set to false
    pub fn with_user_invisible(self) -> Self {
        Self {
            user_visible: false,
            ..self
        }
    }

    /// Return a copy with agent_visible set to true
    pub fn with_agent_visible(self) -> Self {
        Self {
            agent_visible: true,
            ..self
        }
    }

    /// Return a copy with user_visible set to true
    pub fn with_user_visible(self) -> Self {
        Self {
            user_visible: true,
            ..self
        }
    }
}

#[derive(ToSchema, Clone, PartialEq, Serialize, Deserialize, Debug)]
/// A message to or from an LLM
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: Option<String>,
    pub role: Role,
    pub created: i64,
    #[serde(deserialize_with = "deserialize_sanitized_content")]
    pub content: Vec<MessageContent>,
    pub metadata: MessageMetadata,
}

impl Message {
    pub fn new(role: Role, created: i64, content: Vec<MessageContent>) -> Self {
        Message {
            id: None,
            role,
            created,
            content,
            metadata: MessageMetadata::default(),
        }
    }
    pub fn debug(&self) -> String {
        format!("{:?}", self)
    }

    /// Create a new user message with the current timestamp
    pub fn user() -> Self {
        Message {
            id: None,
            role: Role::User,
            created: Utc::now().timestamp(),
            content: Vec::new(),
            metadata: MessageMetadata::default(),
        }
    }

    /// Create a new assistant message with the current timestamp
    pub fn assistant() -> Self {
        Message {
            id: None,
            role: Role::Assistant,
            created: Utc::now().timestamp(),
            content: Vec::new(),
            metadata: MessageMetadata::default(),
        }
    }

    pub fn with_id<S: Into<String>>(mut self, id: S) -> Self {
        self.id = Some(id.into());
        self
    }

    /// Add any MessageContent to the message
    pub fn with_content(mut self, content: MessageContent) -> Self {
        self.content.push(content);
        self
    }

    /// Add text content to the message
    pub fn with_text<S: Into<String>>(self, text: S) -> Self {
        let raw_text = text.into();
        let sanitized_text = sanitize_tags(&raw_text);

        self.with_content(MessageContent::Text(
            RawTextContent {
                text: sanitized_text,
                meta: None,
            }
            .no_annotation(),
        ))
    }

    /// Add image content to the message
    pub fn with_image<S: Into<String>, T: Into<String>>(self, data: S, mime_type: T) -> Self {
        self.with_content(MessageContent::image(data, mime_type))
    }

    /// Add a tool request to the message
    pub fn with_tool_request<S: Into<String>>(
        self,
        id: S,
        tool_call: ToolResult<CallToolRequestParam>,
    ) -> Self {
        self.with_content(MessageContent::tool_request(id, tool_call))
    }

    pub fn with_tool_request_with_metadata<S: Into<String>>(
        self,
        id: S,
        tool_call: ToolResult<CallToolRequestParam>,
        metadata: Option<&ProviderMetadata>,
        tool_meta: Option<serde_json::Value>,
    ) -> Self {
        self.with_content(MessageContent::ToolRequest(ToolRequest {
            id: id.into(),
            tool_call,
            metadata: metadata.cloned(),
            tool_meta,
        }))
    }

    /// Add a tool response to the message
    pub fn with_tool_response<S: Into<String>>(
        self,
        id: S,
        result: ToolResult<CallToolResult>,
    ) -> Self {
        self.with_content(MessageContent::tool_response(id, result))
    }

    pub fn with_tool_response_with_metadata<S: Into<String>>(
        self,
        id: S,
        result: ToolResult<CallToolResult>,
        metadata: Option<&ProviderMetadata>,
    ) -> Self {
        self.with_content(MessageContent::tool_response_with_metadata(
            id, result, metadata,
        ))
    }

    /// Add an action required message for tool confirmation
    pub fn with_action_required<S: Into<String>>(
        self,
        id: S,
        tool_name: String,
        arguments: JsonObject,
        prompt: Option<String>,
    ) -> Self {
        self.with_content(MessageContent::action_required(
            id, tool_name, arguments, prompt,
        ))
    }

    pub fn with_frontend_tool_request<S: Into<String>>(
        self,
        id: S,
        tool_call: ToolResult<CallToolRequestParam>,
    ) -> Self {
        self.with_content(MessageContent::frontend_tool_request(id, tool_call))
    }

    pub fn with_tool_input_delta<S1, S2, S3, S4, S5>(
        self,
        id: S1,
        tool_name: Option<S2>,
        delta: S3,
        accumulated_arguments: Option<S4>,
        provider: Option<S5>,
    ) -> Self
    where
        S1: Into<String>,
        S2: Into<String>,
        S3: Into<String>,
        S4: Into<String>,
        S5: Into<String>,
    {
        self.with_content(MessageContent::tool_input_delta(
            id,
            tool_name,
            delta,
            accumulated_arguments,
            provider,
        ))
    }

    /// Add thinking content to the message
    pub fn with_thinking<S1: Into<String>, S2: Into<String>>(
        self,
        thinking: S1,
        signature: S2,
    ) -> Self {
        self.with_content(MessageContent::thinking(thinking, signature))
    }

    /// Add redacted thinking content to the message
    pub fn with_redacted_thinking<S: Into<String>>(self, data: S) -> Self {
        self.with_content(MessageContent::redacted_thinking(data))
    }

    /// Get the concatenated text content of the message, separated by newlines
    pub fn as_concat_text(&self) -> String {
        self.content
            .iter()
            .filter_map(|c| c.as_text())
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// Check if the message is a tool call
    pub fn is_tool_call(&self) -> bool {
        self.content
            .iter()
            .any(|c| matches!(c, MessageContent::ToolRequest(_)))
    }

    /// Check if the message is a tool response
    pub fn is_tool_response(&self) -> bool {
        self.content
            .iter()
            .any(|c| matches!(c, MessageContent::ToolResponse(_)))
    }

    /// Retrieves all tool `id` from the message
    pub fn get_tool_ids(&self) -> HashSet<&str> {
        self.content
            .iter()
            .filter_map(|content| match content {
                MessageContent::ToolRequest(req) => Some(req.id.as_str()),
                MessageContent::ToolResponse(res) => Some(res.id.as_str()),
                _ => None,
            })
            .collect()
    }

    /// Retrieves all tool `id` from ToolRequest messages
    pub fn get_tool_request_ids(&self) -> HashSet<&str> {
        self.content
            .iter()
            .filter_map(|content| {
                if let MessageContent::ToolRequest(req) = content {
                    Some(req.id.as_str())
                } else {
                    None
                }
            })
            .collect()
    }

    /// Retrieves all tool `id` from ToolResponse messages
    pub fn get_tool_response_ids(&self) -> HashSet<&str> {
        self.content
            .iter()
            .filter_map(|content| {
                if let MessageContent::ToolResponse(res) = content {
                    Some(res.id.as_str())
                } else {
                    None
                }
            })
            .collect()
    }

    /// Check if the message has only TextContent
    pub fn has_only_text_content(&self) -> bool {
        self.content
            .iter()
            .all(|c| matches!(c, MessageContent::Text(_)))
    }

    pub fn with_system_notification<S: Into<String>>(
        self,
        notification_type: SystemNotificationType,
        msg: S,
    ) -> Self {
        self.with_content(MessageContent::system_notification(notification_type, msg))
            .with_metadata(MessageMetadata::user_only())
    }

    /// Set the visibility metadata for the message
    pub fn with_visibility(mut self, user_visible: bool, agent_visible: bool) -> Self {
        self.metadata.user_visible = user_visible;
        self.metadata.agent_visible = agent_visible;
        self
    }

    /// Set the entire metadata for the message
    pub fn with_metadata(mut self, metadata: MessageMetadata) -> Self {
        self.metadata = metadata;
        self
    }

    /// Mark the message as only visible to the user (not the agent)
    pub fn user_only(mut self) -> Self {
        self.metadata.user_visible = true;
        self.metadata.agent_visible = false;
        self
    }

    /// Mark the message as only visible to the agent (not the user)
    pub fn agent_only(mut self) -> Self {
        self.metadata.user_visible = false;
        self.metadata.agent_visible = true;
        self
    }

    /// Check if the message is visible to the user
    pub fn is_user_visible(&self) -> bool {
        self.metadata.user_visible
    }

    /// Check if the message is visible to the agent
    pub fn is_agent_visible(&self) -> bool {
        self.metadata.agent_visible
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TokenState {
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub total_tokens: i32,
    pub accumulated_input_tokens: i32,
    pub accumulated_output_tokens: i32,
    pub accumulated_total_tokens: i32,
}
