use rmcp::model::{
    AnnotateAble, CallToolRequestParam, CallToolResult, Content, ErrorData, ImageContent,
    JsonObject, PromptMessage, PromptMessageContent, PromptMessageRole, RawContent,
    RawImageContent, RawTextContent, ResourceContents, Role, TextContent,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fmt;
use thiserror::Error;
use utoipa::ToSchema;

#[allow(unused_imports)]
pub mod message {
    pub use super::{
        ActionRequired, ActionRequiredData, ActionRequiredScope, FrontendToolRequest, Message,
        MessageContent, MessageMetadata, ProviderMetadata, RedactedThinkingContent,
        SystemNotificationContent, SystemNotificationType, ThinkingContent, TokenState,
        ToolConfirmationRequest, ToolInputDeltaContent, ToolRequest, ToolResponse, ToolResult,
    };
}

pub mod unicode_tags {
    pub fn sanitize_tags(value: &str) -> String {
        value.to_string()
    }
}

pub type ToolResult<T> = Result<T, ErrorData>;
pub type ProviderMetadata = serde_json::Map<String, serde_json::Value>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ToolRequest {
    pub id: String,
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
            Ok(tool_call) => format!(
                "Tool: {}, Args: {}",
                tool_call.name,
                serde_json::to_string_pretty(&tool_call.arguments)
                    .unwrap_or_else(|_| "<<invalid json>>".to_string())
            ),
            Err(error) => format!("Invalid tool call: {error}"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ToolResponse {
    pub id: String,
    #[schema(value_type = Object)]
    pub tool_result: ToolResult<CallToolResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Object)]
    pub metadata: Option<ProviderMetadata>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
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
            Self::Text(text) => write!(f, "{}", text.text),
            Self::Image(image) => write!(f, "[Image: {}]", image.mime_type),
            Self::ToolRequest(request) => {
                write!(f, "[ToolRequest: {}]", request.to_readable_string())
            }
            Self::ToolResponse(response) => match &response.tool_result {
                Ok(result) => write!(
                    f,
                    "[ToolResponse: {} content item(s)]",
                    result.content.len()
                ),
                Err(error) => write!(f, "[ToolResponse: Error: {error}]"),
            },
            Self::ToolConfirmationRequest(request) => {
                write!(f, "[ToolConfirmationRequest: {}]", request.tool_name)
            }
            Self::ActionRequired(action) => match &action.data {
                ActionRequiredData::ToolConfirmation { tool_name, .. } => {
                    write!(f, "[ActionRequired: ToolConfirmation for {tool_name}]")
                }
                ActionRequiredData::Elicitation { message, .. } => {
                    write!(f, "[ActionRequired: Elicitation - {message}]")
                }
                ActionRequiredData::ElicitationResponse { id, .. } => {
                    write!(f, "[ActionRequired: ElicitationResponse for {id}]")
                }
            },
            Self::FrontendToolRequest(request) => match &request.tool_call {
                Ok(tool_call) => write!(f, "[FrontendToolRequest: {}]", tool_call.name),
                Err(error) => write!(f, "[FrontendToolRequest: Error: {error}]"),
            },
            Self::ToolInputDelta(delta) => write!(
                f,
                "[ToolInputDelta: {} {} chars]",
                delta.tool_name.as_deref().unwrap_or("unknown"),
                delta.delta.len()
            ),
            Self::Thinking(thinking) => write!(f, "[Thinking: {}]", thinking.thinking),
            Self::RedactedThinking(_) => write!(f, "[RedactedThinking]"),
            Self::SystemNotification(notification) => {
                write!(f, "[SystemNotification: {}]", notification.msg)
            }
        }
    }
}

impl MessageContent {
    pub fn text(text: impl Into<String>) -> Self {
        Self::Text(
            RawTextContent {
                text: text.into(),
                meta: None,
            }
            .no_annotation(),
        )
    }

    pub fn image(data: impl Into<String>, mime_type: impl Into<String>) -> Self {
        Self::Image(
            RawImageContent {
                data: data.into(),
                mime_type: mime_type.into(),
                meta: None,
            }
            .no_annotation(),
        )
    }

    pub fn tool_request(
        id: impl Into<String>,
        tool_call: ToolResult<CallToolRequestParam>,
    ) -> Self {
        Self::ToolRequest(ToolRequest {
            id: id.into(),
            tool_call,
            metadata: None,
            tool_meta: None,
        })
    }

    pub fn tool_request_with_metadata(
        id: impl Into<String>,
        tool_call: ToolResult<CallToolRequestParam>,
        metadata: Option<&ProviderMetadata>,
    ) -> Self {
        Self::ToolRequest(ToolRequest {
            id: id.into(),
            tool_call,
            metadata: metadata.cloned(),
            tool_meta: None,
        })
    }

    pub fn tool_response(id: impl Into<String>, tool_result: ToolResult<CallToolResult>) -> Self {
        Self::ToolResponse(ToolResponse {
            id: id.into(),
            tool_result,
            metadata: None,
        })
    }

    pub fn tool_response_with_metadata(
        id: impl Into<String>,
        tool_result: ToolResult<CallToolResult>,
        metadata: Option<&ProviderMetadata>,
    ) -> Self {
        Self::ToolResponse(ToolResponse {
            id: id.into(),
            tool_result,
            metadata: metadata.cloned(),
        })
    }

    pub fn action_required(
        id: impl Into<String>,
        tool_name: String,
        arguments: JsonObject,
        prompt: Option<String>,
    ) -> Self {
        Self::ActionRequired(ActionRequired {
            data: ActionRequiredData::ToolConfirmation {
                id: id.into(),
                tool_name,
                arguments,
                prompt,
            },
            scope: None,
        })
    }

    pub fn action_required_elicitation(
        id: impl Into<String>,
        message: String,
        requested_schema: serde_json::Value,
    ) -> Self {
        Self::ActionRequired(ActionRequired {
            data: ActionRequiredData::Elicitation {
                id: id.into(),
                message,
                requested_schema,
            },
            scope: None,
        })
    }

    pub fn action_required_elicitation_response(
        id: impl Into<String>,
        user_data: serde_json::Value,
    ) -> Self {
        Self::ActionRequired(ActionRequired {
            data: ActionRequiredData::ElicitationResponse {
                id: id.into(),
                user_data,
            },
            scope: None,
        })
    }

    pub fn thinking(thinking: impl Into<String>, signature: impl Into<String>) -> Self {
        Self::Thinking(ThinkingContent {
            thinking: thinking.into(),
            signature: signature.into(),
        })
    }

    pub fn redacted_thinking(data: impl Into<String>) -> Self {
        Self::RedactedThinking(RedactedThinkingContent { data: data.into() })
    }

    pub fn frontend_tool_request(
        id: impl Into<String>,
        tool_call: ToolResult<CallToolRequestParam>,
    ) -> Self {
        Self::FrontendToolRequest(FrontendToolRequest {
            id: id.into(),
            tool_call,
        })
    }

    pub fn tool_input_delta(
        id: impl Into<String>,
        tool_name: Option<impl Into<String>>,
        delta: impl Into<String>,
        accumulated_arguments: Option<impl Into<String>>,
        provider: Option<impl Into<String>>,
    ) -> Self {
        Self::ToolInputDelta(ToolInputDeltaContent {
            id: id.into(),
            tool_name: tool_name.map(Into::into),
            delta: delta.into(),
            accumulated_arguments: accumulated_arguments.map(Into::into),
            provider: provider.map(Into::into),
        })
    }

    pub fn system_notification(
        notification_type: SystemNotificationType,
        msg: impl Into<String>,
    ) -> Self {
        Self::SystemNotification(SystemNotificationContent {
            notification_type,
            msg: msg.into(),
        })
    }

    pub fn as_system_notification(&self) -> Option<&SystemNotificationContent> {
        match self {
            Self::SystemNotification(notification) => Some(notification),
            _ => None,
        }
    }

    pub fn as_tool_request(&self) -> Option<&ToolRequest> {
        match self {
            Self::ToolRequest(request) => Some(request),
            _ => None,
        }
    }

    pub fn as_tool_response(&self) -> Option<&ToolResponse> {
        match self {
            Self::ToolResponse(response) => Some(response),
            _ => None,
        }
    }

    pub fn as_action_required(&self) -> Option<&ActionRequired> {
        match self {
            Self::ActionRequired(action) => Some(action),
            _ => None,
        }
    }

    pub fn as_tool_response_text(&self) -> Option<String> {
        let response = self.as_tool_response()?;
        let result = response.tool_result.as_ref().ok()?;
        let texts = result
            .content
            .iter()
            .filter_map(|content| content.as_text().map(|text| text.text.to_string()))
            .collect::<Vec<_>>();
        (!texts.is_empty()).then(|| texts.join("\n"))
    }

    pub fn as_text(&self) -> Option<&str> {
        match self {
            Self::Text(text) => Some(&text.text),
            _ => None,
        }
    }

    pub fn as_thinking(&self) -> Option<&ThinkingContent> {
        match self {
            Self::Thinking(thinking) => Some(thinking),
            _ => None,
        }
    }

    pub fn as_redacted_thinking(&self) -> Option<&RedactedThinkingContent> {
        match self {
            Self::RedactedThinking(redacted) => Some(redacted),
            _ => None,
        }
    }
}

impl From<Content> for MessageContent {
    fn from(content: Content) -> Self {
        match content.raw {
            RawContent::Text(text) => Self::Text(text.optional_annotate(content.annotations)),
            RawContent::Image(image) => Self::Image(image.optional_annotate(content.annotations)),
            RawContent::ResourceLink(_) => Self::text("[Resource link]"),
            RawContent::Resource(resource) => match resource.resource {
                ResourceContents::TextResourceContents { text, .. } => Self::text(text),
                ResourceContents::BlobResourceContents { blob, .. } => {
                    Self::text(format!("[Binary content: {blob}]"))
                }
            },
            RawContent::Audio(_) => Self::text("[Audio content: not supported]"),
        }
    }
}

#[derive(ToSchema, Clone, Copy, PartialEq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MessageMetadata {
    pub user_visible: bool,
    pub agent_visible: bool,
}

impl Default for MessageMetadata {
    fn default() -> Self {
        Self {
            user_visible: true,
            agent_visible: true,
        }
    }
}

impl MessageMetadata {
    pub fn agent_only() -> Self {
        Self {
            user_visible: false,
            agent_visible: true,
        }
    }

    pub fn user_only() -> Self {
        Self {
            user_visible: true,
            agent_visible: false,
        }
    }

    pub fn invisible() -> Self {
        Self {
            user_visible: false,
            agent_visible: false,
        }
    }

    pub fn with_agent_invisible(self) -> Self {
        Self {
            agent_visible: false,
            ..self
        }
    }

    pub fn with_user_invisible(self) -> Self {
        Self {
            user_visible: false,
            ..self
        }
    }

    pub fn with_agent_visible(self) -> Self {
        Self {
            agent_visible: true,
            ..self
        }
    }

    pub fn with_user_visible(self) -> Self {
        Self {
            user_visible: true,
            ..self
        }
    }
}

#[derive(ToSchema, Clone, PartialEq, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: Option<String>,
    pub role: Role,
    pub created: i64,
    pub content: Vec<MessageContent>,
    pub metadata: MessageMetadata,
}

impl Message {
    pub fn new(role: Role, created: i64, content: Vec<MessageContent>) -> Self {
        Self {
            id: None,
            role,
            created,
            content,
            metadata: MessageMetadata::default(),
        }
    }

    pub fn user() -> Self {
        Self::new(Role::User, chrono::Utc::now().timestamp(), Vec::new())
    }

    pub fn assistant() -> Self {
        Self::new(Role::Assistant, chrono::Utc::now().timestamp(), Vec::new())
    }

    pub fn debug(&self) -> String {
        format!("{self:?}")
    }

    pub fn with_id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    pub fn with_content(mut self, content: MessageContent) -> Self {
        self.content.push(content);
        self
    }

    pub fn with_text(self, text: impl Into<String>) -> Self {
        self.with_content(MessageContent::text(text))
    }

    pub fn with_image(self, data: impl Into<String>, mime_type: impl Into<String>) -> Self {
        self.with_content(MessageContent::image(data, mime_type))
    }

    pub fn with_tool_request(
        self,
        id: impl Into<String>,
        tool_call: ToolResult<CallToolRequestParam>,
    ) -> Self {
        self.with_content(MessageContent::tool_request(id, tool_call))
    }

    pub fn with_tool_request_with_metadata(
        self,
        id: impl Into<String>,
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

    pub fn with_tool_response(
        self,
        id: impl Into<String>,
        result: ToolResult<CallToolResult>,
    ) -> Self {
        self.with_content(MessageContent::tool_response(id, result))
    }

    pub fn with_tool_response_with_metadata(
        self,
        id: impl Into<String>,
        result: ToolResult<CallToolResult>,
        metadata: Option<&ProviderMetadata>,
    ) -> Self {
        self.with_content(MessageContent::tool_response_with_metadata(
            id, result, metadata,
        ))
    }

    pub fn with_action_required(
        self,
        id: impl Into<String>,
        tool_name: String,
        arguments: JsonObject,
        prompt: Option<String>,
    ) -> Self {
        self.with_content(MessageContent::action_required(
            id, tool_name, arguments, prompt,
        ))
    }

    pub fn with_frontend_tool_request(
        self,
        id: impl Into<String>,
        tool_call: ToolResult<CallToolRequestParam>,
    ) -> Self {
        self.with_content(MessageContent::frontend_tool_request(id, tool_call))
    }

    pub fn with_tool_input_delta(
        self,
        id: impl Into<String>,
        tool_name: Option<impl Into<String>>,
        delta: impl Into<String>,
        accumulated_arguments: Option<impl Into<String>>,
        provider: Option<impl Into<String>>,
    ) -> Self {
        self.with_content(MessageContent::tool_input_delta(
            id,
            tool_name,
            delta,
            accumulated_arguments,
            provider,
        ))
    }

    pub fn with_thinking(self, thinking: impl Into<String>, signature: impl Into<String>) -> Self {
        self.with_content(MessageContent::thinking(thinking, signature))
    }

    pub fn with_redacted_thinking(self, data: impl Into<String>) -> Self {
        self.with_content(MessageContent::redacted_thinking(data))
    }

    pub fn with_system_notification(
        self,
        notification_type: SystemNotificationType,
        msg: impl Into<String>,
    ) -> Self {
        self.with_content(MessageContent::system_notification(notification_type, msg))
            .with_metadata(MessageMetadata::user_only())
    }

    pub fn with_visibility(mut self, user_visible: bool, agent_visible: bool) -> Self {
        self.metadata.user_visible = user_visible;
        self.metadata.agent_visible = agent_visible;
        self
    }

    pub fn with_metadata(mut self, metadata: MessageMetadata) -> Self {
        self.metadata = metadata;
        self
    }

    pub fn user_only(mut self) -> Self {
        self.metadata = MessageMetadata::user_only();
        self
    }

    pub fn agent_only(mut self) -> Self {
        self.metadata = MessageMetadata::agent_only();
        self
    }

    pub fn as_concat_text(&self) -> String {
        self.content
            .iter()
            .filter_map(MessageContent::as_text)
            .collect::<Vec<_>>()
            .join("\n")
    }

    pub fn is_tool_call(&self) -> bool {
        self.content
            .iter()
            .any(|content| matches!(content, MessageContent::ToolRequest(_)))
    }

    pub fn is_tool_response(&self) -> bool {
        self.content
            .iter()
            .any(|content| matches!(content, MessageContent::ToolResponse(_)))
    }

    pub fn get_tool_ids(&self) -> HashSet<&str> {
        self.content
            .iter()
            .filter_map(|content| match content {
                MessageContent::ToolRequest(request) => Some(request.id.as_str()),
                MessageContent::ToolResponse(response) => Some(response.id.as_str()),
                _ => None,
            })
            .collect()
    }

    pub fn get_tool_request_ids(&self) -> HashSet<&str> {
        self.content
            .iter()
            .filter_map(|content| match content {
                MessageContent::ToolRequest(request) => Some(request.id.as_str()),
                _ => None,
            })
            .collect()
    }

    pub fn get_tool_response_ids(&self) -> HashSet<&str> {
        self.content
            .iter()
            .filter_map(|content| match content {
                MessageContent::ToolResponse(response) => Some(response.id.as_str()),
                _ => None,
            })
            .collect()
    }

    pub fn has_only_text_content(&self) -> bool {
        self.content
            .iter()
            .all(|content| matches!(content, MessageContent::Text(_)))
    }

    pub fn is_user_visible(&self) -> bool {
        self.metadata.user_visible
    }

    pub fn is_agent_visible(&self) -> bool {
        self.metadata.agent_visible
    }
}

impl From<PromptMessage> for Message {
    fn from(prompt_message: PromptMessage) -> Self {
        let message = match prompt_message.role {
            PromptMessageRole::User => Self::user(),
            PromptMessageRole::Assistant => Self::assistant(),
        };
        let content = match prompt_message.content {
            PromptMessageContent::Text { text } => MessageContent::text(text),
            PromptMessageContent::Image { image } => {
                MessageContent::image(image.data.clone(), image.mime_type.clone())
            }
            PromptMessageContent::ResourceLink { .. } => MessageContent::text("[Resource link]"),
            PromptMessageContent::Resource { resource } => match &resource.resource {
                ResourceContents::TextResourceContents { text, .. } => {
                    MessageContent::text(text.clone())
                }
                ResourceContents::BlobResourceContents { blob, .. } => {
                    MessageContent::text(format!("[Binary content: {blob}]"))
                }
            },
        };
        message.with_content(content)
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

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, PartialEq)]
pub struct Conversation(Vec<Message>);

#[derive(Error, Debug)]
#[error("invalid conversation: {reason}")]
pub struct InvalidConversation {
    pub reason: String,
    pub conversation: Conversation,
}

impl Conversation {
    pub fn new<I>(messages: I) -> Result<Self, InvalidConversation>
    where
        I: IntoIterator<Item = Message>,
    {
        Ok(Self::new_unvalidated(messages))
    }

    pub fn new_unvalidated<I>(messages: I) -> Self
    where
        I: IntoIterator<Item = Message>,
    {
        Self(messages.into_iter().collect())
    }

    pub fn empty() -> Self {
        Self(Vec::new())
    }

    pub fn messages(&self) -> &Vec<Message> {
        &self.0
    }

    pub fn push(&mut self, message: Message) {
        self.0.push(message);
    }

    pub fn last(&self) -> Option<&Message> {
        self.0.last()
    }

    pub fn first(&self) -> Option<&Message> {
        self.0.first()
    }

    pub fn len(&self) -> usize {
        self.0.len()
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn extend<I>(&mut self, iter: I)
    where
        I: IntoIterator<Item = Message>,
    {
        self.0.extend(iter);
    }

    pub fn iter(&self) -> std::slice::Iter<'_, Message> {
        self.0.iter()
    }

    pub fn pop(&mut self) -> Option<Message> {
        self.0.pop()
    }

    pub fn truncate(&mut self, len: usize) {
        self.0.truncate(len);
    }

    pub fn clear(&mut self) {
        self.0.clear();
    }

    pub fn filtered_messages<F>(&self, filter: F) -> Vec<Message>
    where
        F: Fn(&MessageMetadata) -> bool,
    {
        self.0
            .iter()
            .filter(|message| filter(&message.metadata))
            .cloned()
            .collect()
    }

    pub fn agent_visible_messages(&self) -> Vec<Message> {
        self.filtered_messages(|metadata| metadata.agent_visible)
    }

    pub fn user_visible_messages(&self) -> Vec<Message> {
        self.filtered_messages(|metadata| metadata.user_visible)
    }
}

impl Default for Conversation {
    fn default() -> Self {
        Self::empty()
    }
}

impl IntoIterator for Conversation {
    type Item = Message;
    type IntoIter = std::vec::IntoIter<Message>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

impl<'a> IntoIterator for &'a Conversation {
    type Item = &'a Message;
    type IntoIter = std::slice::Iter<'a, Message>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.iter()
    }
}

pub fn fix_conversation(conversation: Conversation) -> (Conversation, Vec<String>) {
    (conversation, Vec::new())
}

pub fn debug_conversation_fix(
    before: &[Message],
    after: &[Message],
    issues: &[String],
) -> serde_json::Value {
    serde_json::json!({
        "before_message_count": before.len(),
        "after_message_count": after.len(),
        "issues": issues,
    })
}
