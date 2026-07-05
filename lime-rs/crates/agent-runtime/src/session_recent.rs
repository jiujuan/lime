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

fn extract_array_from_object(
    object: &serde_json::Map<String, Value>,
    keys: &[&str],
) -> Option<Vec<Value>> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(Value::as_array)
        .cloned()
}

fn extract_array_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
    keys: &[&str],
) -> Option<Vec<Value>> {
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(Value::as_array)
        .cloned()
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeRecentTeamRole {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default, alias = "profile_id")]
    pub profile_id: Option<String>,
    #[serde(default, alias = "role_key")]
    pub role_key: Option<String>,
    #[serde(default, alias = "skill_ids")]
    pub skill_ids: Vec<String>,
}

impl SessionExecutionRuntimeRecentTeamRole {
    fn normalize(self) -> Option<Self> {
        let id = self.id.trim().to_string();
        let label = self.label.trim().to_string();
        let summary = self.summary.trim().to_string();
        if label.is_empty() && summary.is_empty() {
            return None;
        }

        let skill_ids = self
            .skill_ids
            .into_iter()
            .filter_map(|skill_id| normalize_optional_text(Some(skill_id)))
            .collect();

        Some(Self {
            id,
            label,
            summary,
            profile_id: normalize_optional_text(self.profile_id),
            role_key: normalize_optional_text(self.role_key),
            skill_ids,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeRecentTeamSelection {
    #[serde(default)]
    pub disabled: bool,
    #[serde(default)]
    pub theme: Option<String>,
    #[serde(default, alias = "preferred_team_preset_id")]
    pub preferred_team_preset_id: Option<String>,
    #[serde(default, alias = "selected_team_id")]
    pub selected_team_id: Option<String>,
    #[serde(default, alias = "selected_team_source")]
    pub selected_team_source: Option<String>,
    #[serde(default, alias = "selected_team_label")]
    pub selected_team_label: Option<String>,
    #[serde(default, alias = "selected_team_description")]
    pub selected_team_description: Option<String>,
    #[serde(default, alias = "selected_team_summary")]
    pub selected_team_summary: Option<String>,
    #[serde(default, alias = "selected_team_roles")]
    pub selected_team_roles: Option<Vec<SessionExecutionRuntimeRecentTeamRole>>,
}

impl SessionExecutionRuntimeRecentTeamSelection {
    pub fn normalize(self) -> Option<Self> {
        let selected_team_roles = self
            .selected_team_roles
            .map(|roles| {
                roles
                    .into_iter()
                    .filter_map(SessionExecutionRuntimeRecentTeamRole::normalize)
                    .collect::<Vec<_>>()
            })
            .filter(|roles| !roles.is_empty());

        let normalized = Self {
            disabled: self.disabled,
            theme: normalize_optional_text(self.theme),
            preferred_team_preset_id: normalize_optional_text(self.preferred_team_preset_id),
            selected_team_id: normalize_optional_text(self.selected_team_id),
            selected_team_source: normalize_optional_text(self.selected_team_source),
            selected_team_label: normalize_optional_text(self.selected_team_label),
            selected_team_description: normalize_optional_text(self.selected_team_description),
            selected_team_summary: normalize_optional_text(self.selected_team_summary),
            selected_team_roles,
        };

        if normalized.disabled {
            return Some(normalized);
        }

        if normalized.preferred_team_preset_id.is_none()
            && normalized.selected_team_id.is_none()
            && normalized.selected_team_source.is_none()
            && normalized.selected_team_label.is_none()
            && normalized.selected_team_description.is_none()
            && normalized.selected_team_summary.is_none()
            && normalized.selected_team_roles.is_none()
        {
            return None;
        }

        Some(normalized)
    }
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

pub fn extract_recent_team_selection_from_metadata(
    metadata: &std::collections::HashMap<String, Value>,
) -> Option<SessionExecutionRuntimeRecentTeamSelection> {
    let harness = metadata.get("harness").and_then(Value::as_object);
    let resolve_text = |keys: &[&str]| -> Option<String> {
        harness
            .and_then(|value| extract_text_from_object(value, keys))
            .or_else(|| extract_text_from_metadata(metadata, keys))
    };
    let resolve_bool = |keys: &[&str]| -> Option<bool> {
        harness
            .and_then(|value| extract_bool_from_object(value, keys))
            .or_else(|| extract_bool_from_metadata(metadata, keys))
    };
    let resolve_array = |keys: &[&str]| -> Option<Vec<Value>> {
        harness
            .and_then(|value| extract_array_from_object(value, keys))
            .or_else(|| extract_array_from_metadata(metadata, keys))
    };

    SessionExecutionRuntimeRecentTeamSelection {
        disabled: resolve_bool(&["selected_team_disabled", "selectedTeamDisabled"])
            .unwrap_or(false),
        theme: resolve_text(&["theme", "harness_theme", "harnessTheme"]),
        preferred_team_preset_id: resolve_text(&[
            "preferred_team_preset_id",
            "preferredTeamPresetId",
        ]),
        selected_team_id: resolve_text(&["selected_team_id", "selectedTeamId"]),
        selected_team_source: resolve_text(&["selected_team_source", "selectedTeamSource"]),
        selected_team_label: resolve_text(&["selected_team_label", "selectedTeamLabel"]),
        selected_team_description: resolve_text(&[
            "selected_team_description",
            "selectedTeamDescription",
        ]),
        selected_team_summary: resolve_text(&["selected_team_summary", "selectedTeamSummary"]),
        selected_team_roles: resolve_array(&["selected_team_roles", "selectedTeamRoles"])
            .and_then(extract_recent_team_roles_from_values),
    }
    .normalize()
}

fn extract_recent_team_roles_from_values(
    values: Vec<Value>,
) -> Option<Vec<SessionExecutionRuntimeRecentTeamRole>> {
    let roles = values
        .into_iter()
        .filter_map(|value| {
            serde_json::from_value::<SessionExecutionRuntimeRecentTeamRole>(value).ok()
        })
        .filter_map(SessionExecutionRuntimeRecentTeamRole::normalize)
        .collect::<Vec<_>>();

    if roles.is_empty() {
        None
    } else {
        Some(roles)
    }
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
    fn extracts_recent_team_selection_and_normalizes_empty_roles() {
        let metadata = HashMap::from([(
            "harness".to_string(),
            json!({
                "selectedTeamId": " team-a ",
                "selectedTeamLabel": " Core ",
                "selectedTeamRoles": [
                    {
                        "id": "writer",
                        "label": " Writer ",
                        "summary": " Drafts content ",
                        "skillIds": [" draft ", ""]
                    },
                    {
                        "id": "empty",
                        "label": "",
                        "summary": ""
                    }
                ]
            }),
        )]);

        assert_eq!(
            extract_recent_team_selection_from_metadata(&metadata),
            Some(SessionExecutionRuntimeRecentTeamSelection {
                disabled: false,
                theme: None,
                preferred_team_preset_id: None,
                selected_team_id: Some("team-a".to_string()),
                selected_team_source: None,
                selected_team_label: Some("Core".to_string()),
                selected_team_description: None,
                selected_team_summary: None,
                selected_team_roles: Some(vec![SessionExecutionRuntimeRecentTeamRole {
                    id: "writer".to_string(),
                    label: "Writer".to_string(),
                    summary: "Drafts content".to_string(),
                    profile_id: None,
                    role_key: None,
                    skill_ids: vec!["draft".to_string()],
                }]),
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
