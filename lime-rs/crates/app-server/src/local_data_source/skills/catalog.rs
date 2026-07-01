use app_server_protocol::SkillListResponse;
use app_server_protocol::SkillReadParams;
use app_server_protocol::SkillReadResponse;
use lime_skills::find_skill_by_name;
use lime_skills::get_skill_roots;
use lime_skills::load_skill_summaries_from_directory;
use lime_skills::LoadedSkillDefinition;
use lime_skills::LoadedSkillSummary;
use serde_json::json;
use serde_json::Value;
use std::collections::HashSet;

pub(crate) fn list_skills() -> SkillListResponse {
    let mut skills = Vec::new();
    let mut seen = HashSet::new();
    for root in get_skill_roots() {
        for skill in load_skill_summaries_from_directory(&root) {
            if !skill.disable_model_invocation && seen.insert(skill.skill_name.clone()) {
                skills.push(skill_summary_to_executable_value(skill));
            }
        }
    }
    SkillListResponse { skills }
}

pub(crate) fn read_skill(params: SkillReadParams) -> Result<SkillReadResponse, String> {
    let skill = find_skill_by_name(&params.skill_name)?;
    if !skill.standard_compliance.validation_errors.is_empty() {
        return Err(format!(
            "skill '{}' failed standard validation: {}",
            params.skill_name,
            skill.standard_compliance.validation_errors.join("; ")
        ));
    }
    if skill.disable_model_invocation {
        return Err(format!(
            "skill '{}' disabled model invocation",
            params.skill_name
        ));
    }
    Ok(SkillReadResponse {
        skill: skill_to_detail_value(skill),
    })
}

fn skill_summary_to_executable_value(skill: LoadedSkillSummary) -> Value {
    json!({
        "name": skill.skill_name,
        "display_name": skill.display_name,
        "description": skill.description,
        "local_directory_path": skill.local_directory_path.to_string_lossy().to_string(),
        "execution_mode": skill.execution_mode,
        "has_workflow": skill.execution_mode == "workflow",
        "provider": skill.provider,
        "model": skill.model,
        "argument_hint": skill.argument_hint,
    })
}

fn skill_to_detail_value(skill: LoadedSkillDefinition) -> Value {
    let workflow_steps = if skill.workflow_steps.is_empty() {
        Value::Null
    } else {
        Value::Array(
            skill
                .workflow_steps
                .iter()
                .map(|step| {
                    json!({
                        "id": step.id,
                        "name": step.name,
                        "dependencies": [],
                    })
                })
                .collect(),
        )
    };
    json!({
        "name": skill.skill_name,
        "display_name": skill.display_name,
        "description": skill.description,
        "local_directory_path": skill.local_directory_path.to_string_lossy().to_string(),
        "execution_mode": skill.execution_mode,
        "has_workflow": skill.execution_mode == "workflow",
        "provider": skill.provider,
        "model": skill.model,
        "argument_hint": skill.argument_hint,
        "markdown_content": skill.markdown_content,
        "workflow_steps": workflow_steps,
        "allowed_tools": skill.allowed_tools,
        "when_to_use": skill.when_to_use,
    })
}
