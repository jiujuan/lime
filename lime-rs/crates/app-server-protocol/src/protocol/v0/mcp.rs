use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerListResponse {
    #[serde(default)]
    pub servers: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStatusListResponse {
    #[serde(default)]
    pub servers: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerCreateParams {
    pub server: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerUpdateParams {
    pub server: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerDeleteParams {
    pub id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerEnabledSetParams {
    pub id: String,
    pub app_type: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerImportFromAppParams {
    pub app_type: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerImportFromAppResponse {
    pub imported_count: usize,
    #[serde(default)]
    pub servers: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStartParams {
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerStopParams {
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerOauthLoginParams {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scopes: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_secs: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerOauthLoginResponse {
    pub authorization_url: String,
    pub state: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerLifecycleResponse {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerElicitationRequestParams {
    #[schemars(length(min = 1))]
    #[serde(deserialize_with = "deserialize_non_empty_string")]
    pub thread_id: String,
    #[serde(default, deserialize_with = "deserialize_optional_non_empty_string")]
    pub turn_id: Option<String>,
    #[schemars(length(min = 1))]
    #[serde(deserialize_with = "deserialize_non_empty_string")]
    pub server_name: String,
    #[serde(flatten)]
    pub request: McpServerElicitationRequest,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "mode", rename_all = "camelCase")]
pub enum McpServerElicitationRequest {
    #[serde(rename_all = "camelCase")]
    Form {
        #[serde(rename = "_meta", default)]
        meta: Option<serde_json::Value>,
        #[schemars(length(min = 1))]
        #[serde(deserialize_with = "deserialize_non_empty_string")]
        message: String,
        requested_schema: serde_json::Map<String, serde_json::Value>,
    },
}

fn deserialize_non_empty_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = String::deserialize(deserializer)?;
    if value.trim().is_empty() {
        return Err(serde::de::Error::custom("value must not be empty"));
    }
    Ok(value)
}

fn deserialize_optional_non_empty_string<'de, D>(
    deserializer: D,
) -> Result<Option<String>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    if value.as_ref().is_some_and(|value| value.trim().is_empty()) {
        return Err(serde::de::Error::custom("value must not be empty"));
    }
    Ok(value)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum McpServerElicitationAction {
    Accept,
    Decline,
    Cancel,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpServerElicitationResponse {
    pub action: McpServerElicitationAction,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<serde_json::Value>,
    #[serde(rename = "_meta", default, skip_serializing_if = "Option::is_none")]
    pub meta: Option<serde_json::Map<String, serde_json::Value>>,
}

impl McpServerElicitationResponse {
    pub fn validate(&self) -> Result<(), &'static str> {
        match (self.action, self.content.as_ref()) {
            (McpServerElicitationAction::Accept, Some(serde_json::Value::Object(_))) => Ok(()),
            (McpServerElicitationAction::Accept, _) => {
                Err("accepted MCP elicitation requires structured object content")
            }
            (McpServerElicitationAction::Decline | McpServerElicitationAction::Cancel, None) => {
                Ok(())
            }
            (McpServerElicitationAction::Decline | McpServerElicitationAction::Cancel, Some(_)) => {
                Err("declined or canceled MCP elicitation must not include content")
            }
        }
    }
}

#[cfg(test)]
mod elicitation_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn mcp_server_elicitation_request_matches_codex_current_form_contract() {
        let params = McpServerElicitationRequestParams {
            thread_id: "thread-7".to_string(),
            turn_id: None,
            server_name: "form-server".to_string(),
            request: McpServerElicitationRequest::Form {
                meta: None,
                message: "Choose a value".to_string(),
                requested_schema: serde_json::from_value(json!({
                    "type": "object",
                    "properties": { "confirmed": { "type": "boolean" } },
                    "required": ["confirmed"]
                }))
                .expect("object schema"),
            },
        };

        assert_eq!(
            serde_json::to_value(params).expect("serialize params"),
            json!({
                "threadId": "thread-7",
                "turnId": null,
                "serverName": "form-server",
                "mode": "form",
                "_meta": null,
                "message": "Choose a value",
                "requestedSchema": {
                    "type": "object",
                    "properties": { "confirmed": { "type": "boolean" } },
                    "required": ["confirmed"]
                }
            })
        );
    }

    #[test]
    fn mcp_server_elicitation_request_rejects_missing_or_empty_owner() {
        let valid = json!({
            "threadId": "thread-7",
            "turnId": "turn-7",
            "serverName": "form-server",
            "mode": "form",
            "_meta": null,
            "message": "Choose a value",
            "requestedSchema": { "type": "object", "properties": {} }
        });

        assert!(serde_json::from_value::<McpServerElicitationRequestParams>(valid.clone()).is_ok());
        let mut missing_thread = valid.clone();
        missing_thread
            .as_object_mut()
            .expect("request object")
            .remove("threadId");
        assert!(
            serde_json::from_value::<McpServerElicitationRequestParams>(missing_thread).is_err()
        );

        for (field, value) in [
            ("threadId", json!(" ")),
            ("turnId", json!("")),
            ("serverName", json!(" ")),
        ] {
            let mut invalid = valid.clone();
            invalid[field] = value;
            assert!(
                serde_json::from_value::<McpServerElicitationRequestParams>(invalid).is_err(),
                "{field} must reject empty values"
            );
        }
    }

    #[test]
    fn mcp_server_elicitation_response_rejects_invalid_action_content_pairs() {
        assert!(McpServerElicitationResponse {
            action: McpServerElicitationAction::Accept,
            content: Some(json!({ "confirmed": true })),
            meta: Some(serde_json::from_value(json!({ "trace": "accepted" })).expect("meta")),
        }
        .validate()
        .is_ok());
        assert!(McpServerElicitationResponse {
            action: McpServerElicitationAction::Decline,
            content: Some(json!({ "confirmed": true })),
            meta: None,
        }
        .validate()
        .is_err());
        assert!(McpServerElicitationResponse {
            action: McpServerElicitationAction::Cancel,
            content: None,
            meta: None,
        }
        .validate()
        .is_ok());
    }

    #[test]
    fn mcp_server_elicitation_response_preserves_optional_meta() {
        let response: McpServerElicitationResponse = serde_json::from_value(json!({
            "action": "decline",
            "_meta": { "trace": "declined" }
        }))
        .expect("deserialize response metadata");

        assert_eq!(
            response.meta,
            Some(serde_json::from_value(json!({ "trace": "declined" })).expect("meta"))
        );
        assert!(
            serde_json::from_value::<McpServerElicitationResponse>(json!({
                "action": "decline",
                "_meta": "not-an-object"
            }))
            .is_err()
        );
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpToolListResponse {
    #[serde(default)]
    pub tools: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpToolListForContextParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caller: Option<String>,
    #[serde(default)]
    pub include_deferred: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpToolSearchParams {
    pub query: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caller: Option<String>,
    #[serde(default = "default_mcp_tool_search_limit")]
    pub limit: usize,
}

fn default_mcp_tool_search_limit() -> usize {
    10
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpToolCallParams {
    pub tool_name: String,
    pub arguments: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpToolCallWithCallerParams {
    pub tool_name: String,
    pub arguments: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub caller: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct McpToolCallResponse {
    #[serde(default)]
    pub content: Vec<McpContent>,
    #[serde(
        default,
        rename = "structuredContent",
        skip_serializing_if = "Option::is_none"
    )]
    pub structured_content: Option<serde_json::Value>,
    pub is_error: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpPromptListResponse {
    #[serde(default)]
    pub prompts: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpPromptGetParams {
    #[schemars(length(min = 1))]
    pub server: String,
    #[schemars(length(min = 1))]
    pub name: String,
    #[serde(default)]
    pub arguments: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpPromptGetResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub messages: Vec<McpPromptMessage>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpResourceListResponse {
    #[serde(default)]
    pub resources: Vec<serde_json::Value>,
    #[serde(default)]
    pub resource_templates: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpResourceReadParams {
    #[schemars(length(min = 1))]
    pub server: String,
    #[schemars(length(min = 1))]
    pub uri: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpResourceSubscribeParams {
    #[schemars(length(min = 1))]
    pub server: String,
    #[schemars(length(min = 1))]
    pub uri: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpResourceUnsubscribeParams {
    #[schemars(length(min = 1))]
    pub server: String,
    #[schemars(length(min = 1))]
    pub uri: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpResourceSubscriptionResponse {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct McpResourceReadResponse {
    pub uri: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blob: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type")]
pub enum McpContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "image")]
    Image { data: String, mime_type: String },
    #[serde(rename = "resource")]
    Resource {
        uri: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        text: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        blob: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct McpPromptMessage {
    pub role: String,
    pub content: McpContent,
}
