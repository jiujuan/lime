use std::path::Path;

use lime_skills::{
    build_agent_skill_snapshot_from_workspace, contains_agent_skills_prompt,
    contains_selected_agent_skill_body_prompt, read_agent_skill_body,
    render_available_agent_skills, render_selected_agent_skill_bodies,
    reorder_agent_skill_snapshot_for_query, select_agent_skills_by_name_candidates,
    select_explicit_agent_skills, select_implicit_agent_skills, AgentSkillBodyRenderOptions,
    AgentSkillRenderOptions, AgentSkillSelection, AgentSkillSelectionTrigger, AgentSkillSnapshot,
};
use serde_json::Value;

pub(super) fn append_agent_skills_context_to_system_prompt(
    system_prompt: Option<String>,
    user_input: &str,
    metadata_values: &[&Value],
    working_dir: Option<&Path>,
    project_root: Option<&Path>,
) -> Option<String> {
    let snapshot = build_agent_skill_snapshot_from_workspace(working_dir, project_root);
    let system_prompt =
        append_selected_agent_skill_bodies(system_prompt, user_input, metadata_values, &snapshot);

    if system_prompt
        .as_deref()
        .is_some_and(contains_agent_skills_prompt)
    {
        return system_prompt;
    }

    let render_snapshot =
        reorder_agent_skill_snapshot_for_query(&snapshot, user_input, Default::default());
    let Some(context) =
        render_available_agent_skills(&render_snapshot, AgentSkillRenderOptions::default())
    else {
        return system_prompt;
    };

    append_context_block(system_prompt, context)
}

pub(super) fn selected_agent_skill_names_for_turn(
    user_input: &str,
    metadata_values: &[&Value],
    working_dir: Option<&Path>,
    project_root: Option<&Path>,
) -> Vec<String> {
    let snapshot = build_agent_skill_snapshot_from_workspace(working_dir, project_root);
    selected_agent_skill_selections(user_input, metadata_values, &snapshot)
        .into_iter()
        .map(|selection| selection.locator.name)
        .collect()
}

pub(super) fn selected_agent_skill_allowed_tools_for_turn(
    user_input: &str,
    metadata_values: &[&Value],
    working_dir: Option<&Path>,
    project_root: Option<&Path>,
) -> Vec<String> {
    let snapshot = build_agent_skill_snapshot_from_workspace(working_dir, project_root);
    let selections = selected_agent_skill_selections(user_input, metadata_values, &snapshot);
    let mut allowed_tools = Vec::new();
    for selection in selections {
        let Some(skill) = snapshot.skills.iter().find(|skill| {
            skill.skill_file_path == selection.locator.skill_file_path
                || skill.name == selection.locator.name
        }) else {
            continue;
        };
        for tool in &skill.allowed_tools {
            push_unique_string(&mut allowed_tools, tool);
        }
    }
    allowed_tools
}

fn append_selected_agent_skill_bodies(
    system_prompt: Option<String>,
    user_input: &str,
    metadata_values: &[&Value],
    snapshot: &AgentSkillSnapshot,
) -> Option<String> {
    if system_prompt
        .as_deref()
        .is_some_and(contains_selected_agent_skill_body_prompt)
    {
        return system_prompt;
    }

    let selections = selected_agent_skill_selections(user_input, metadata_values, snapshot);
    if selections.is_empty() {
        return system_prompt;
    }
    let bodies = selections
        .iter()
        .filter_map(|selection| match read_agent_skill_body(&selection.locator) {
            Ok(body) => Some(body),
            Err(error) => {
                tracing::warn!(
                    "[AgentSkillsContext] 读取显式选择的 Agent Skill 失败: name={}, path={}, error={}",
                    selection.locator.name,
                    selection.locator.skill_file_path.display(),
                    error
                );
                None
            }
        })
        .collect::<Vec<_>>();
    let Some(context) =
        render_selected_agent_skill_bodies(&bodies, AgentSkillBodyRenderOptions::default())
    else {
        return system_prompt;
    };

    append_context_block(system_prompt, context)
}

pub(super) fn selected_agent_skill_selections(
    user_input: &str,
    metadata_values: &[&Value],
    snapshot: &AgentSkillSnapshot,
) -> Vec<AgentSkillSelection> {
    let mut selections = select_catalog_bound_agent_skills(metadata_values, snapshot);
    selections.extend(select_explicit_agent_skills(user_input, snapshot));
    let selections = dedupe_agent_skill_selections(selections);
    if !selections.is_empty() {
        return selections;
    }
    select_implicit_agent_skills(user_input, snapshot)
}

fn select_catalog_bound_agent_skills(
    metadata_values: &[&Value],
    snapshot: &AgentSkillSnapshot,
) -> Vec<AgentSkillSelection> {
    select_agent_skills_by_name_candidates(
        catalog_bound_skill_candidates(metadata_values),
        snapshot,
        AgentSkillSelectionTrigger::CatalogBinding,
    )
}

fn dedupe_agent_skill_selections(selections: Vec<AgentSkillSelection>) -> Vec<AgentSkillSelection> {
    let mut deduped = Vec::new();
    for selection in selections {
        if deduped.iter().any(|existing: &AgentSkillSelection| {
            existing.locator.skill_file_path == selection.locator.skill_file_path
        }) {
            continue;
        }
        deduped.push(selection);
    }
    deduped
}

fn catalog_bound_skill_candidates(metadata_values: &[&Value]) -> Vec<String> {
    let mut candidates = Vec::new();
    for metadata in metadata_values {
        let Some(service_scene_run) = service_scene_run_value(metadata) else {
            continue;
        };
        collect_skill_locator_candidates(&mut candidates, service_scene_run);
        push_string_candidate(
            &mut candidates,
            service_scene_run
                .get("skill_key")
                .or_else(|| service_scene_run.get("skillKey")),
        );
        push_string_candidate(
            &mut candidates,
            service_scene_run
                .get("linked_skill_id")
                .or_else(|| service_scene_run.get("linkedSkillId")),
        );
        push_string_candidate(
            &mut candidates,
            service_scene_run
                .get("skill_id")
                .or_else(|| service_scene_run.get("skillId")),
        );
    }
    candidates
}

fn collect_skill_locator_candidates(candidates: &mut Vec<String>, service_scene_run: &Value) {
    let Some(locator) = service_scene_run
        .get("skill_locator")
        .or_else(|| service_scene_run.get("skillLocator"))
    else {
        return;
    };
    push_string_candidate(
        candidates,
        locator
            .get("name")
            .or_else(|| locator.get("skill_name"))
            .or_else(|| locator.get("skillName")),
    );
    push_string_candidate(
        candidates,
        locator
            .get("directory")
            .or_else(|| locator.get("skill_directory"))
            .or_else(|| locator.get("skillDirectory")),
    );
    push_string_candidate(
        candidates,
        locator
            .get("skill_file_path")
            .or_else(|| locator.get("skillFilePath")),
    );
}

fn service_scene_run_value(metadata: &Value) -> Option<&Value> {
    metadata
        .pointer("/harness/service_scene_launch/service_scene_run")
        .or_else(|| metadata.pointer("/harness/serviceSceneLaunch/serviceSceneRun"))
        .or_else(|| metadata.pointer("/service_scene_launch/service_scene_run"))
        .or_else(|| metadata.pointer("/serviceSceneLaunch/serviceSceneRun"))
}

fn push_string_candidate(candidates: &mut Vec<String>, value: Option<&Value>) {
    let Some(candidate) = value
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
    else {
        return;
    };
    if !candidates.iter().any(|existing| existing == candidate) {
        candidates.push(candidate.to_string());
    }
}

fn push_unique_string(values: &mut Vec<String>, value: &str) {
    let value = value.trim();
    if value.is_empty() {
        return;
    }
    if !values
        .iter()
        .any(|existing| existing.eq_ignore_ascii_case(value))
    {
        values.push(value.to_string());
    }
}

fn append_context_block(system_prompt: Option<String>, context: String) -> Option<String> {
    let mut prompt = system_prompt.unwrap_or_default();
    if !prompt.trim().is_empty() {
        prompt.push_str("\n\n");
    }
    prompt.push_str(&context);
    Some(prompt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn appends_project_skill_metadata_without_enabling_skilltool() {
        let workspace = TempDir::new().expect("workspace");
        write_skill(
            &workspace,
            "research",
            "Research",
            "Use source-backed research.",
        );

        let prompt = append_agent_skills_context_to_system_prompt(
            Some("base".to_string()),
            "hello",
            &[],
            Some(workspace.path()),
            Some(workspace.path()),
        )
        .expect("prompt");

        assert!(prompt.starts_with("base"));
        assert!(prompt.contains("## 可用 Agent Skills"));
        assert!(prompt.contains("`research`"));
        assert!(prompt.contains("必须先读取对应 `SKILL.md`"));
        assert!(!prompt.contains("Full body should not be rendered"));
        assert!(!prompt.contains("allow_model_skills"));
    }

    #[test]
    fn appends_explicitly_selected_skill_body() {
        let workspace = TempDir::new().expect("workspace");
        write_skill(&workspace, "writer", "Writer", "Write clearly.");

        let prompt = append_agent_skills_context_to_system_prompt(
            Some("base".to_string()),
            "请用 $writer 改写这段话",
            &[],
            Some(workspace.path()),
            Some(workspace.path()),
        )
        .expect("prompt");

        assert!(prompt.contains("<selected_skill_instructions>"));
        assert!(prompt.contains("`writer`"));
        assert!(prompt.contains("# Body"));
        assert!(prompt.contains("Full body should not be rendered."));
        assert!(prompt.contains("## 可用 Agent Skills"));
        assert!(!prompt.contains("allow_model_skills"));
    }

    #[test]
    fn skips_duplicate_skills_prompt() {
        let existing = "<skills_instructions>\n## Skills\n</skills_instructions>";

        let prompt = append_agent_skills_context_to_system_prompt(
            Some(existing.to_string()),
            "hello",
            &[],
            None,
            None,
        )
        .expect("prompt");

        assert_eq!(prompt, existing);
    }

    #[test]
    fn appends_catalog_bound_skill_body_from_service_scene_metadata() {
        let workspace = TempDir::new().expect("workspace");
        write_skill(&workspace, "writer", "Writer", "Write clearly.");
        let metadata = serde_json::json!({
            "harness": {
                "service_scene_launch": {
                    "service_scene_run": {
                        "skill_locator": {
                            "source": "catalog",
                            "name": "local:writer"
                        },
                        "skill_id": "service-skill-writer",
                        "linked_skill_id": "service-skill-writer"
                    }
                }
            }
        });

        let prompt = append_agent_skills_context_to_system_prompt(
            Some("base".to_string()),
            "帮我处理这段话",
            &[&metadata],
            Some(workspace.path()),
            Some(workspace.path()),
        )
        .expect("prompt");

        assert!(prompt.contains("<selected_skill_instructions>"));
        assert!(prompt.contains("`writer`"));
        assert!(prompt.contains("# Body"));
        assert!(prompt.contains("## 可用 Agent Skills"));
    }

    #[test]
    fn catalog_bound_selection_ignores_unknown_skill_metadata() {
        let workspace = TempDir::new().expect("workspace");
        write_skill(&workspace, "writer", "Writer", "Write clearly.");
        let metadata = serde_json::json!({
            "harness": {
                "service_scene_launch": {
                    "service_scene_run": {
                        "skill_key": "missing"
                    }
                }
            }
        });

        let names = selected_agent_skill_names_for_turn(
            "",
            &[&metadata],
            Some(workspace.path()),
            Some(workspace.path()),
        );

        assert!(names.is_empty());
    }

    #[test]
    fn appends_implicit_high_confidence_skill_body() {
        let workspace = TempDir::new().expect("workspace");
        write_skill(
            &workspace,
            "fact-check-lab",
            "Fact Check Lab",
            "联网信息检索与事实核验",
        );
        write_skill(&workspace, "writer", "Writer", "写作润色");

        let prompt = append_agent_skills_context_to_system_prompt(
            Some("base".to_string()),
            "帮我做最新事实核验和趋势调研",
            &[],
            Some(workspace.path()),
            Some(workspace.path()),
        )
        .expect("prompt");

        assert!(prompt.contains("<selected_skill_instructions>"));
        assert!(prompt.contains("`fact-check-lab`"));
        assert!(prompt.contains("# Body"));
        assert!(prompt.contains("## 可用 Agent Skills"));
    }

    #[test]
    fn implicit_selection_enables_selected_skill_name_for_turn() {
        let workspace = TempDir::new().expect("workspace");
        write_skill(
            &workspace,
            "fact-check-lab",
            "Fact Check Lab",
            "联网信息检索与事实核验",
        );
        write_skill(&workspace, "writer", "Writer", "写作润色");

        let names = selected_agent_skill_names_for_turn(
            "帮我做最新事实核验和趋势调研",
            &[],
            Some(workspace.path()),
            Some(workspace.path()),
        );

        assert_eq!(names, vec!["fact-check-lab".to_string()]);
    }

    fn write_skill(workspace: &TempDir, name: &str, display_name: &str, description: &str) {
        let skill_dir = workspace.path().join(".agents/skills").join(name);
        std::fs::create_dir_all(&skill_dir).expect("skill dir");
        std::fs::write(
            skill_dir.join("SKILL.md"),
            format!(
                "---\nname: {display_name}\ndescription: {description}\nmetadata:\n  lime_when_to_use: {description}\n---\n\n# Body\n\nFull body should not be rendered."
            ),
        )
        .expect("skill");
    }
}
