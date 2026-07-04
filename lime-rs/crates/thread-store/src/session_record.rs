//! Agent session record projection.
//!
//! This module owns session row semantics without a direct Aster dependency.
//! Runtime-specific crates may project these records into their own DTOs, but
//! the database row rules should stay here.

use chrono::{DateTime, Utc};
use serde::de::DeserializeOwned;

pub const DEFAULT_SESSION_TYPE: &str = "user";
pub const DEFAULT_SESSION_TITLE: &str = "未命名会话";
pub const DEFAULT_MODEL_NAME: &str = "agent:default";

#[derive(Clone, Debug, PartialEq)]
pub struct SessionRecordRow {
    pub id: String,
    pub model: String,
    pub title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub working_dir: Option<String>,
    pub session_type: Option<String>,
    pub user_set_name: bool,
    pub extension_data_json: String,
    pub total_tokens: Option<i32>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cached_input_tokens: Option<i32>,
    pub cache_creation_input_tokens: Option<i32>,
    pub accumulated_total_tokens: Option<i32>,
    pub accumulated_input_tokens: Option<i32>,
    pub accumulated_output_tokens: Option<i32>,
    pub schedule_id: Option<String>,
    pub recipe_json: Option<String>,
    pub user_recipe_values_json: Option<String>,
    pub provider_name: Option<String>,
    pub model_config_json: Option<String>,
    pub message_count: usize,
}

#[derive(Clone, Debug, PartialEq)]
pub struct SessionRecordProjection {
    pub id: String,
    pub model: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub working_dir: Option<String>,
    pub session_type: String,
    pub user_set_name: bool,
    pub extension_data_json: String,
    pub total_tokens: Option<i32>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cached_input_tokens: Option<i32>,
    pub cache_creation_input_tokens: Option<i32>,
    pub accumulated_total_tokens: Option<i32>,
    pub accumulated_input_tokens: Option<i32>,
    pub accumulated_output_tokens: Option<i32>,
    pub schedule_id: Option<String>,
    pub recipe_json: Option<String>,
    pub user_recipe_values_json: Option<String>,
    pub provider_name: Option<String>,
    pub model_config_json: Option<String>,
    pub message_count: usize,
}

impl SessionRecordRow {
    pub fn project(self) -> SessionRecordProjection {
        let session_type = resolve_session_type_name(self.session_type, &self.model);
        SessionRecordProjection {
            id: self.id,
            model: self.model,
            title: normalize_optional_text(self.title)
                .unwrap_or_else(|| DEFAULT_SESSION_TITLE.to_string()),
            created_at: parse_timestamp_or_now(&self.created_at),
            updated_at: parse_timestamp_or_now(&self.updated_at),
            working_dir: normalize_optional_text(self.working_dir),
            session_type,
            user_set_name: self.user_set_name,
            extension_data_json: self.extension_data_json,
            total_tokens: self.total_tokens,
            input_tokens: self.input_tokens,
            output_tokens: self.output_tokens,
            cached_input_tokens: self.cached_input_tokens,
            cache_creation_input_tokens: self.cache_creation_input_tokens,
            accumulated_total_tokens: self.accumulated_total_tokens,
            accumulated_input_tokens: self.accumulated_input_tokens,
            accumulated_output_tokens: self.accumulated_output_tokens,
            schedule_id: normalize_optional_text(self.schedule_id),
            recipe_json: self.recipe_json,
            user_recipe_values_json: self.user_recipe_values_json,
            provider_name: normalize_optional_text(self.provider_name),
            model_config_json: self.model_config_json,
            message_count: self.message_count,
        }
    }
}

pub fn normalize_optional_text(value: Option<String>) -> Option<String> {
    let value = value?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn parse_optional_json<T: DeserializeOwned>(raw: Option<String>) -> Option<T> {
    raw.and_then(|text| serde_json::from_str(&text).ok())
}

pub fn parse_timestamp_or_now(raw: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(raw)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now())
}

pub fn resolve_session_type_name(raw: Option<String>, model: &str) -> String {
    let parsed_model = parse_session_type_name(model);
    match raw.as_deref().and_then(parse_session_type_name) {
        Some(DEFAULT_SESSION_TYPE)
            if parsed_model.is_some_and(|value| value != DEFAULT_SESSION_TYPE) =>
        {
            parsed_model.unwrap_or(DEFAULT_SESSION_TYPE).to_string()
        }
        Some(session_type) => session_type.to_string(),
        None => parsed_model.unwrap_or(DEFAULT_SESSION_TYPE).to_string(),
    }
}

fn parse_session_type_name(value: &str) -> Option<&'static str> {
    match value.trim() {
        "user" => Some("user"),
        "sub_agent" => Some("sub_agent"),
        "hidden" => Some("hidden"),
        "scheduled" => Some("scheduled"),
        "terminal" => Some("terminal"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_optional_text, parse_optional_json, resolve_session_type_name, SessionRecordRow,
        DEFAULT_SESSION_TITLE, DEFAULT_SESSION_TYPE,
    };

    #[test]
    fn normalize_optional_text_should_trim_and_drop_empty_values() {
        assert_eq!(
            normalize_optional_text(Some("  openai  ".to_string())).as_deref(),
            Some("openai")
        );
        assert_eq!(normalize_optional_text(Some("  ".to_string())), None);
        assert_eq!(normalize_optional_text(None), None);
    }

    #[test]
    fn resolve_session_type_name_should_prefer_non_user_model_fallback() {
        assert_eq!(
            resolve_session_type_name(Some(DEFAULT_SESSION_TYPE.to_string()), "sub_agent"),
            "sub_agent"
        );
        assert_eq!(
            resolve_session_type_name(Some("hidden".to_string()), "sub_agent"),
            "hidden"
        );
        assert_eq!(resolve_session_type_name(None, "terminal"), "terminal");
        assert_eq!(resolve_session_type_name(None, "agent:default"), "user");
    }

    #[test]
    fn session_record_row_should_project_normalized_defaults() {
        let row = SessionRecordRow {
            id: "session-1".to_string(),
            model: "agent:default".to_string(),
            title: Some(" ".to_string()),
            created_at: "bad-date".to_string(),
            updated_at: "bad-date".to_string(),
            working_dir: Some("  /tmp/workspace  ".to_string()),
            session_type: None,
            user_set_name: false,
            extension_data_json: "{}".to_string(),
            total_tokens: None,
            input_tokens: None,
            output_tokens: None,
            cached_input_tokens: None,
            cache_creation_input_tokens: None,
            accumulated_total_tokens: None,
            accumulated_input_tokens: None,
            accumulated_output_tokens: None,
            schedule_id: Some("  job-1  ".to_string()),
            recipe_json: None,
            user_recipe_values_json: None,
            provider_name: Some("  openai  ".to_string()),
            model_config_json: None,
            message_count: 2,
        };

        let projection = row.project();

        assert_eq!(projection.title, DEFAULT_SESSION_TITLE);
        assert_eq!(projection.working_dir.as_deref(), Some("/tmp/workspace"));
        assert_eq!(projection.session_type, DEFAULT_SESSION_TYPE);
        assert_eq!(projection.schedule_id.as_deref(), Some("job-1"));
        assert_eq!(projection.provider_name.as_deref(), Some("openai"));
        assert_eq!(projection.message_count, 2);
    }

    #[test]
    fn parse_optional_json_should_return_none_for_invalid_json() {
        assert_eq!(
            parse_optional_json::<serde_json::Value>(Some("{\"ok\":true}".to_string())),
            Some(serde_json::json!({ "ok": true }))
        );
        assert_eq!(
            parse_optional_json::<serde_json::Value>(Some("{".to_string())),
            None
        );
    }
}
