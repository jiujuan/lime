use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub app_type: String,
    pub name: String,
    pub settings_config: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort_index: Option<i32>,
    #[serde(default)]
    pub is_current: bool,
}

impl Provider {
    #[allow(dead_code)]
    pub fn new(id: String, app_type: String, name: String, settings_config: Value) -> Self {
        Self {
            id,
            app_type,
            name,
            settings_config,
            category: None,
            icon: None,
            icon_color: None,
            notes: None,
            created_at: Some(chrono::Utc::now().timestamp()),
            sort_index: None,
            is_current: false,
        }
    }
}
