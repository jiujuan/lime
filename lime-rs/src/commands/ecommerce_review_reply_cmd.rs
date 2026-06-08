use serde::{Deserialize, Serialize};

use crate::agent::AsterAgentState;
use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::config::GlobalConfigManagerState;
use crate::database::DbConnection;
use crate::skills::SkillExecutionResult;

const DEPRECATED_ECOMMERCE_REVIEW_REPLY_COMMAND: &str =
    "旧电商差评回复 Tauri 快捷命令已下线；生产技能执行必须经 Agent / Skill current 主链。";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EcommerceReviewReplyRequest {
    pub platform: String,
    pub review_url: String,
    pub tone: String,
    pub length: String,
    pub template: Option<String>,
    pub model: Option<String>,
    pub execution_id: Option<String>,
}

#[tauri::command]
pub async fn execute_ecommerce_review_reply(
    _app_handle: tauri::AppHandle,
    _db: tauri::State<'_, DbConnection>,
    _api_key_provider_service: tauri::State<'_, ApiKeyProviderServiceState>,
    _config_manager: tauri::State<'_, GlobalConfigManagerState>,
    _aster_state: tauri::State<'_, AsterAgentState>,
    _request: EcommerceReviewReplyRequest,
) -> Result<SkillExecutionResult, String> {
    Err(format!(
        "{DEPRECATED_ECOMMERCE_REVIEW_REPLY_COMMAND} command=execute_ecommerce_review_reply"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_serialization() {
        let request = EcommerceReviewReplyRequest {
            platform: "taobao".to_string(),
            review_url: "https://example.com/review/123".to_string(),
            tone: "sincere".to_string(),
            length: "medium".to_string(),
            template: None,
            model: Some("claude-sonnet-4-5".to_string()),
            execution_id: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        let deserialized: EcommerceReviewReplyRequest = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.platform, "taobao");
        assert_eq!(deserialized.tone, "sincere");
    }
}
