use serde::{Deserialize, Serialize};
use serde_json::Value;

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    let trimmed = value?.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn extract_text_from_value(value: Option<&Value>) -> Option<String> {
    normalize_optional_text(value.and_then(Value::as_str).map(ToString::to_string))
}

fn extract_text_from_object(
    object: &serde_json::Map<String, Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter()
        .find_map(|key| extract_text_from_value(object.get(*key)))
}

fn extract_text_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter()
        .find_map(|key| extract_text_from_value(metadata.get(*key)))
}

fn extract_bool_from_value(value: Option<&Value>) -> Option<bool> {
    value.and_then(Value::as_bool)
}

fn extract_bool_from_object(
    object: &serde_json::Map<String, Value>,
    keys: &[&str],
) -> Option<bool> {
    keys.iter()
        .find_map(|key| extract_bool_from_value(object.get(*key)))
}

fn extract_bool_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
    keys: &[&str],
) -> Option<bool> {
    keys.iter()
        .find_map(|key| extract_bool_from_value(metadata.get(*key)))
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SessionExecutionRuntimeAccessMode {
    #[serde(alias = "read_only")]
    ReadOnly,
    Current,
    #[serde(alias = "full_access")]
    FullAccess,
}

impl SessionExecutionRuntimeAccessMode {
    pub fn default_for_session() -> Self {
        Self::FullAccess
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ReadOnly => "read-only",
            Self::Current => "current",
            Self::FullAccess => "full-access",
        }
    }

    pub fn approval_policy(&self) -> &'static str {
        match self {
            Self::FullAccess => "never",
            Self::ReadOnly | Self::Current => "on-request",
        }
    }

    pub fn sandbox_policy(&self) -> &'static str {
        match self {
            Self::ReadOnly => "read-only",
            Self::Current => "workspace-write",
            Self::FullAccess => "danger-full-access",
        }
    }

    pub fn from_access_mode_text(value: Option<&str>) -> Option<Self> {
        match value.map(str::trim) {
            Some("read-only") => Some(Self::ReadOnly),
            Some("current") => Some(Self::Current),
            Some("full-access") => Some(Self::FullAccess),
            _ => None,
        }
    }

    pub fn from_runtime_policies(
        _approval_policy: Option<&str>,
        sandbox_policy: Option<&str>,
    ) -> Option<Self> {
        match sandbox_policy.map(str::trim) {
            Some("read-only") => Some(Self::ReadOnly),
            Some("workspace-write") => Some(Self::Current),
            Some("danger-full-access") => Some(Self::FullAccess),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimePreferences {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub web_search: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking: Option<bool>,
    pub task: bool,
    pub subagent: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RecentHarnessContext {
    pub theme: Option<String>,
    pub session_mode: Option<String>,
    pub gate_key: Option<String>,
    pub run_title: Option<String>,
    pub content_id: Option<String>,
    pub response_language: Option<String>,
}

pub fn extract_recent_preferences_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
) -> Option<SessionExecutionRuntimePreferences> {
    let harness = metadata.get("harness").and_then(Value::as_object);
    let nested_preferences = harness
        .and_then(|value| value.get("preferences"))
        .and_then(Value::as_object)
        .or_else(|| metadata.get("preferences").and_then(Value::as_object));
    let resolve_nested = |keys: &[&str]| -> Option<bool> {
        nested_preferences.and_then(|value| extract_bool_from_object(value, keys))
    };
    let resolve_flat = |keys: &[&str]| -> Option<bool> {
        harness
            .and_then(|value| extract_bool_from_object(value, keys))
            .or_else(|| extract_bool_from_metadata(metadata, keys))
    };

    let web_search = resolve_nested(&["web_search", "webSearch"])
        .or_else(|| resolve_flat(&["web_search_enabled", "webSearchEnabled"]));
    let thinking = resolve_nested(&["thinking", "thinking_enabled", "thinkingEnabled"])
        .or_else(|| resolve_flat(&["thinking_enabled", "thinkingEnabled"]));
    let task = resolve_nested(&["task", "task_mode", "taskMode"])
        .or_else(|| resolve_flat(&["task_mode_enabled", "taskModeEnabled"]));
    let subagent = resolve_nested(&["subagent", "subagent_mode", "subagentMode"])
        .or_else(|| resolve_flat(&["subagent_mode_enabled", "subagentModeEnabled"]));

    if web_search.is_none() && thinking.is_none() && task.is_none() && subagent.is_none() {
        return None;
    }

    Some(SessionExecutionRuntimePreferences {
        web_search,
        thinking,
        task: task.unwrap_or(false),
        subagent: subagent.unwrap_or(false),
    })
}

pub fn extract_recent_access_mode_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
) -> Option<SessionExecutionRuntimeAccessMode> {
    let harness = metadata.get("harness").and_then(Value::as_object);
    let access_mode = harness
        .and_then(|value| extract_text_from_object(value, &["access_mode", "accessMode"]))
        .or_else(|| extract_text_from_metadata(metadata, &["access_mode", "accessMode"]));

    SessionExecutionRuntimeAccessMode::from_access_mode_text(access_mode.as_deref())
}

pub fn extract_recent_harness_context_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
) -> RecentHarnessContext {
    let harness = metadata.get("harness").and_then(Value::as_object);
    let resolve_text = |keys: &[&str]| -> Option<String> {
        harness
            .and_then(|value| extract_text_from_object(value, keys))
            .or_else(|| extract_text_from_metadata(metadata, keys))
    };

    RecentHarnessContext {
        theme: resolve_text(&["theme", "harness_theme", "harnessTheme"]),
        session_mode: normalize_session_mode(resolve_text(&["session_mode", "sessionMode"])),
        gate_key: resolve_text(&["gate_key", "gateKey"]),
        run_title: resolve_text(&["run_title", "runTitle", "title"]),
        content_id: resolve_text(&["content_id", "contentId"]),
        response_language: resolve_text(&[
            "agent_response_language",
            "agentResponseLanguage",
            "response_language",
            "responseLanguage",
        ]),
    }
}

fn normalize_session_mode(value: Option<String>) -> Option<String> {
    match value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some("theme_workbench") | Some("general_workbench") => {
            Some("general_workbench".to_string())
        }
        Some("default") => Some("default".to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn access_mode_serde_uses_current_wire_values_and_accepts_legacy_alias() {
        assert_eq!(
            serde_json::to_value(SessionExecutionRuntimeAccessMode::FullAccess).unwrap(),
            json!("full-access")
        );
        assert_eq!(
            serde_json::from_value::<SessionExecutionRuntimeAccessMode>(json!("full_access"))
                .unwrap(),
            SessionExecutionRuntimeAccessMode::FullAccess
        );
    }

    #[test]
    fn extracts_recent_preferences_from_harness_metadata() {
        let metadata = HashMap::from([(
            "harness".to_string(),
            json!({
                "preferences": {
                    "webSearch": true,
                    "thinking": false,
                    "task": true,
                    "subagent": true
                }
            }),
        )]);

        assert_eq!(
            extract_recent_preferences_from_metadata(&metadata),
            Some(SessionExecutionRuntimePreferences {
                web_search: Some(true),
                thinking: Some(false),
                task: true,
                subagent: true,
            })
        );
    }

    #[test]
    fn extracts_harness_context_and_normalizes_session_mode() {
        let metadata = HashMap::from([(
            "harness".to_string(),
            json!({
                "theme": "agent",
                "sessionMode": "theme_workbench",
                "gateKey": "gate",
                "runTitle": "Run",
                "contentId": "content-1",
                "responseLanguage": "zh-CN"
            }),
        )]);

        assert_eq!(
            extract_recent_harness_context_from_metadata(&metadata),
            RecentHarnessContext {
                theme: Some("agent".to_string()),
                session_mode: Some("general_workbench".to_string()),
                gate_key: Some("gate".to_string()),
                run_title: Some("Run".to_string()),
                content_id: Some("content-1".to_string()),
                response_language: Some("zh-CN".to_string()),
            }
        );
    }
}
