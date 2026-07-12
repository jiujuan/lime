//! Subagent session read-model projection.
//!
//! Agent extension data stays at the adapter boundary; this module owns the
//! Lime read-model rules for subagent presentation metadata.

use serde::Deserialize;
use serde_json::Value;
use thread_store::session_record::{
    parse_optional_json, SessionRecordProjection, SessionRecordRow, DEFAULT_MODEL_NAME,
};

use super::session_store_subagent_context::SubagentPresentationProjection;
use super::session_store_subagent_context::SubagentSessionProjection;
use super::session_store_types::{normalize_optional_nonempty_body, normalize_optional_text};
use crate::subagent_profiles::SubagentCustomizationState;

pub(crate) const SUBAGENT_SESSION_EXTENSION_NAME: &str = "subagent_session";
pub(crate) const SUBAGENT_SESSION_EXTENSION_VERSION: &str = "v0";
pub(crate) const SUBAGENT_CUSTOMIZATION_EXTENSION_NAME: &str = "subagent_customization";
pub(crate) const SUBAGENT_CUSTOMIZATION_EXTENSION_VERSION: &str = "v0";

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
struct SubagentSessionMetadataSource {
    parent_session_id: String,
    origin_tool: String,
    #[serde(default)]
    task_summary: Option<String>,
    #[serde(default)]
    role_hint: Option<String>,
    #[serde(default)]
    created_from_turn_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
struct SubagentModelConfigSource {
    #[serde(default)]
    model_name: Option<String>,
}

fn extension_state_value(
    extension_data: &Value,
    extension_name: &str,
    version: &str,
) -> Option<Value> {
    let key = format!("{extension_name}.{version}");
    extension_data.as_object()?.get(&key).cloned()
}

pub(crate) fn project_subagent_presentation_projection(
    metadata_value: Option<Value>,
    customization_value: Option<Value>,
) -> Option<SubagentPresentationProjection> {
    let metadata = serde_json::from_value::<SubagentSessionMetadataSource>(metadata_value?).ok()?;
    let parent_session_id = normalize_optional_text(Some(metadata.parent_session_id))?;
    let customization = customization_value
        .and_then(|value| serde_json::from_value::<SubagentCustomizationState>(value).ok())
        .unwrap_or_default();

    Some(SubagentPresentationProjection {
        parent_session_id,
        task_summary: normalize_optional_nonempty_body(metadata.task_summary),
        role_hint: normalize_optional_text(metadata.role_hint),
        origin_tool: normalize_optional_text(Some(metadata.origin_tool)),
        created_from_turn_id: normalize_optional_text(metadata.created_from_turn_id),
        blueprint_role_id: customization.blueprint_role_id,
        blueprint_role_label: customization.blueprint_role_label,
        profile_id: customization.profile_id,
        profile_name: customization.profile_name,
        role_key: customization.role_key,
        team_preset_id: customization.team_preset_id,
        theme: customization.theme,
        output_contract: customization.output_contract,
        skill_ids: customization.skill_ids,
        skills: customization.skills,
    })
}

pub(crate) fn project_subagent_presentation_from_extension_data_json(
    extension_data_json: &str,
) -> Option<SubagentPresentationProjection> {
    let extension_data = serde_json::from_str::<Value>(extension_data_json).ok()?;
    project_subagent_presentation_projection(
        extension_state_value(
            &extension_data,
            SUBAGENT_SESSION_EXTENSION_NAME,
            SUBAGENT_SESSION_EXTENSION_VERSION,
        ),
        extension_state_value(
            &extension_data,
            SUBAGENT_CUSTOMIZATION_EXTENSION_NAME,
            SUBAGENT_CUSTOMIZATION_EXTENSION_VERSION,
        ),
    )
}

fn resolve_subagent_record_model_name(projection: &SessionRecordProjection) -> Option<String> {
    parse_optional_json::<SubagentModelConfigSource>(projection.model_config_json.clone())
        .and_then(|config| normalize_optional_text(config.model_name))
        .or_else(|| {
            let model = projection.model.trim();
            if model.is_empty() || model == DEFAULT_MODEL_NAME {
                None
            } else {
                Some(model.to_string())
            }
        })
        .or_else(|| projection.provider_name.clone())
}

pub(crate) fn project_session_record_subagent_session(
    row: SessionRecordRow,
) -> Option<SubagentSessionProjection> {
    let projection = row.project();
    if projection.session_type != "sub_agent" {
        return None;
    }

    let presentation =
        project_subagent_presentation_from_extension_data_json(&projection.extension_data_json)?;
    let model = resolve_subagent_record_model_name(&projection);
    Some(SubagentSessionProjection {
        id: projection.id,
        name: projection.title,
        created_at: projection.created_at.timestamp(),
        updated_at: projection.updated_at.timestamp(),
        session_type: projection.session_type,
        model,
        provider_name: projection.provider_name,
        working_dir: projection.working_dir,
        presentation,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        project_session_record_subagent_session,
        project_subagent_presentation_from_extension_data_json,
        project_subagent_presentation_projection,
    };
    use thread_store::session_record::SessionRecordRow;

    #[test]
    fn projects_subagent_presentation_from_current_raw_extension_values() {
        let projection = project_subagent_presentation_projection(
            Some(serde_json::json!({
                "parent_session_id": " parent-1 ",
                "origin_tool": " Agent ",
                "task_summary": "  梳理问题  ",
                "role_hint": " explorer ",
                "created_from_turn_id": " turn-1 "
            })),
            Some(serde_json::json!({
                "blueprint_role_id": "runtime-explorer",
                "blueprint_role_label": "分析",
                "profile_id": "code-explorer",
                "profile_name": "代码分析员",
                "role_key": "explorer",
                "team_preset_id": "code-triage-team",
                "theme": "engineering",
                "output_contract": "输出证据、影响面与建议。",
                "skill_ids": ["repo-exploration"],
                "skills": [{
                    "id": "repo-exploration",
                    "name": "仓库探索",
                    "description": "优先读事实源",
                    "source": "builtin"
                }]
            })),
        )
        .expect("应投影 subagent 展示信息");

        assert_eq!(projection.parent_session_id, "parent-1");
        assert_eq!(projection.origin_tool.as_deref(), Some("Agent"));
        assert_eq!(projection.task_summary.as_deref(), Some("  梳理问题  "));
        assert_eq!(projection.role_hint.as_deref(), Some("explorer"));
        assert_eq!(projection.created_from_turn_id.as_deref(), Some("turn-1"));
        assert_eq!(
            projection.blueprint_role_id.as_deref(),
            Some("runtime-explorer")
        );
        assert_eq!(projection.profile_id.as_deref(), Some("code-explorer"));
        assert_eq!(projection.skill_ids, vec!["repo-exploration".to_string()]);
        assert_eq!(projection.skills.len(), 1);
        assert_eq!(projection.skills[0].name, "仓库探索");
    }

    #[test]
    fn ignores_missing_or_empty_parent_session_id() {
        assert!(project_subagent_presentation_projection(None, None).is_none());
        assert!(project_subagent_presentation_projection(
            Some(serde_json::json!({
                "parent_session_id": " ",
                "origin_tool": "Agent"
            })),
            None,
        )
        .is_none());
    }

    #[test]
    fn projects_presentation_from_current_extension_data_json() {
        let projection = project_subagent_presentation_from_extension_data_json(
            &serde_json::json!({
                "subagent_session.v0": {
                    "parent_session_id": "parent-1",
                    "origin_tool": "Agent"
                },
                "subagent_customization.v0": {
                    "profile_id": "code-reviewer",
                    "skill_ids": ["repo-exploration"]
                }
            })
            .to_string(),
        )
        .expect("应从 current extension_data_json 投影");

        assert_eq!(projection.parent_session_id, "parent-1");
        assert_eq!(projection.profile_id.as_deref(), Some("code-reviewer"));
        assert_eq!(projection.skill_ids, vec!["repo-exploration".to_string()]);
    }

    #[test]
    fn projects_subagent_session_from_current_session_record() {
        let row = SessionRecordRow {
            id: "child-1".to_string(),
            model: "agent:default".to_string(),
            title: Some("  子代理  ".to_string()),
            created_at: "2026-07-01T00:00:00Z".to_string(),
            updated_at: "2026-07-02T00:00:00Z".to_string(),
            working_dir: Some(" /tmp/project ".to_string()),
            session_type: Some("sub_agent".to_string()),
            user_set_name: false,
            extension_data_json: serde_json::json!({
                "subagent_session.v0": {
                    "parent_session_id": "parent-1",
                    "origin_tool": "Agent",
                    "role_hint": "reviewer"
                }
            })
            .to_string(),
            total_tokens: None,
            input_tokens: None,
            output_tokens: None,
            cached_input_tokens: None,
            cache_creation_input_tokens: None,
            accumulated_total_tokens: None,
            accumulated_input_tokens: None,
            accumulated_output_tokens: None,
            schedule_id: None,
            recipe_json: None,
            user_recipe_values_json: None,
            provider_name: Some("openai".to_string()),
            model_config_json: Some(r#"{"model_name":"gpt-5.1"}"#.to_string()),
            message_count: 0,
        };

        let projection =
            project_session_record_subagent_session(row).expect("应投影 subagent session");

        assert_eq!(projection.id, "child-1");
        assert_eq!(projection.name, "子代理");
        assert_eq!(projection.model.as_deref(), Some("gpt-5.1"));
        assert_eq!(projection.working_dir.as_deref(), Some("/tmp/project"));
        assert_eq!(
            projection.presentation.role_hint.as_deref(),
            Some("reviewer")
        );
    }
}
