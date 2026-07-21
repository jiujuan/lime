use agent_protocol::CollaborationMode;
use schemars::JsonSchema;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSettingsUpdateParams {
    pub thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approvals_reviewer: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sandbox_policy: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub permissions: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(
        default,
        deserialize_with = "deserialize_double_option",
        skip_serializing_if = "Option::is_none"
    )]
    pub service_tier: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collaboration_mode: Option<CollaborationMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub personality: Option<Value>,
}

impl ThreadSettingsUpdateParams {
    pub fn has_updates(&self) -> bool {
        self.cwd.is_some()
            || self.approval_policy.is_some()
            || self.approvals_reviewer.is_some()
            || self.sandbox_policy.is_some()
            || self.permissions.is_some()
            || self.model.is_some()
            || self.service_tier.is_some()
            || self.effort.is_some()
            || self.summary.is_some()
            || self.collaboration_mode.is_some()
            || self.personality.is_some()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSettingsUpdateResponse {}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSettings {
    pub cwd: String,
    pub approval_policy: Value,
    pub approvals_reviewer: Value,
    pub sandbox_policy: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_permission_profile: Option<Value>,
    pub model: String,
    pub model_provider: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub service_tier: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<Value>,
    pub collaboration_mode: CollaborationMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub personality: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSettingsUpdatedNotification {
    pub thread_id: String,
    pub thread_settings: ThreadSettings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ThreadMemoryMode {
    Enabled,
    Disabled,
}

impl ThreadMemoryMode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Enabled => "enabled",
            Self::Disabled => "disabled",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMemoryModeSetParams {
    pub thread_id: String,
    pub mode: ThreadMemoryMode,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ThreadMemoryModeSetResponse {}

fn deserialize_double_option<'de, D>(deserializer: D) -> Result<Option<Option<String>>, D::Error>
where
    D: Deserializer<'de>,
{
    Option::<String>::deserialize(deserializer).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn service_tier_distinguishes_omission_null_and_value() {
        let omitted: ThreadSettingsUpdateParams = serde_json::from_value(json!({
            "threadId": "thread-1"
        }))
        .expect("omitted service tier");
        let cleared: ThreadSettingsUpdateParams = serde_json::from_value(json!({
            "threadId": "thread-1",
            "serviceTier": null
        }))
        .expect("cleared service tier");
        let selected: ThreadSettingsUpdateParams = serde_json::from_value(json!({
            "threadId": "thread-1",
            "serviceTier": "priority"
        }))
        .expect("selected service tier");

        assert_eq!(omitted.service_tier, None);
        assert_eq!(cleared.service_tier, Some(None));
        assert_eq!(selected.service_tier, Some(Some("priority".to_string())));
    }
}
