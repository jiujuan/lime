use super::super::common::{
    non_empty, AGENT_APP_RUNTIME_CAPABILITY_SOURCE, LIME_RUNTIME_METADATA_KEY,
    LIME_RUNTIME_TOOL_SURFACE_KEY,
};
use super::super::types::AgentAppRuntimeStartTaskRequest;
use serde_json::{json, Map, Value};
use std::collections::HashSet;

fn read_object_string(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        object
            .get(*key)
            .and_then(Value::as_str)
            .and_then(|value| non_empty(Some(value)))
    })
}

fn normalize_agent_app_skill_ref(value: &Value) -> Option<Value> {
    if let Some(skill) = value.as_str().and_then(|value| non_empty(Some(value))) {
        return Some(json!({
            "id": skill,
            "skill": skill,
            "standard": "agentskills",
            "required": true,
        }));
    }

    let object = value.as_object()?;
    let id = read_object_string(object, &["id", "skillId", "skill_id", "skill", "name"])?;
    let skill = read_object_string(object, &["skill", "skillName", "skill_name"])
        .unwrap_or_else(|| id.clone());
    let standard =
        read_object_string(object, &["standard"]).unwrap_or_else(|| "agentskills".to_string());
    let required = object
        .get("required")
        .and_then(Value::as_bool)
        .unwrap_or(true);

    let mut normalized = Map::new();
    normalized.insert("id".to_string(), json!(id));
    normalized.insert("skill".to_string(), json!(skill));
    normalized.insert("standard".to_string(), json!(standard));
    normalized.insert("required".to_string(), json!(required));
    for key in ["title", "role", "description", "reason"] {
        if let Some(value) = read_object_string(object, &[key]) {
            normalized.insert(key.to_string(), json!(value));
        }
    }

    Some(Value::Object(normalized))
}

fn skill_ref_key(value: &Value) -> Option<String> {
    let object = value.as_object()?;
    let standard = object
        .get("standard")
        .and_then(Value::as_str)
        .unwrap_or("agentskills");
    let skill = object
        .get("skill")
        .or_else(|| object.get("id"))
        .and_then(Value::as_str)?;
    Some(format!(
        "{}:{}",
        standard.trim().to_ascii_lowercase(),
        skill.trim().to_ascii_lowercase()
    ))
}

fn collect_agent_app_skill_refs_from_array(
    value: Option<&Value>,
    refs: &mut Vec<Value>,
    seen: &mut HashSet<String>,
) {
    let Some(items) = value.and_then(Value::as_array) else {
        return;
    };
    for item in items {
        let Some(normalized) = normalize_agent_app_skill_ref(item) else {
            continue;
        };
        let Some(key) = skill_ref_key(&normalized) else {
            continue;
        };
        if seen.insert(key) {
            refs.push(normalized);
        }
    }
}

fn collect_agent_app_skill_refs_from_object(
    object: &Map<String, Value>,
    refs: &mut Vec<Value>,
    seen: &mut HashSet<String>,
) {
    for key in [
        "requiredSkills",
        "required_skills",
        "skills",
        "skillRefs",
        "skill_refs",
    ] {
        collect_agent_app_skill_refs_from_array(object.get(key), refs, seen);
    }

    for key in [
        "agentTaskContract",
        "agent_task_contract",
        "contentFactory",
        "content_factory",
        "skillContract",
        "skill_contract",
    ] {
        if let Some(nested) = object.get(key).and_then(Value::as_object) {
            collect_agent_app_skill_refs_from_object(nested, refs, seen);
        }
    }
}

fn collect_agent_app_skill_refs_from_value(
    value: Option<&Value>,
    refs: &mut Vec<Value>,
    seen: &mut HashSet<String>,
) {
    if let Some(object) = value.and_then(Value::as_object) {
        collect_agent_app_skill_refs_from_object(object, refs, seen);
    }
}

fn collect_agent_app_skill_refs(request: &AgentAppRuntimeStartTaskRequest) -> Vec<Value> {
    let mut refs = Vec::new();
    let mut seen = HashSet::new();
    collect_agent_app_skill_refs_from_value(request.input.as_ref(), &mut refs, &mut seen);
    collect_agent_app_skill_refs_from_value(request.expected_output.as_ref(), &mut refs, &mut seen);
    collect_agent_app_skill_refs_from_value(request.metadata.as_ref(), &mut refs, &mut seen);
    refs
}

pub(super) fn build_agent_app_skill_contract(
    request: &AgentAppRuntimeStartTaskRequest,
    is_content_factory_task: bool,
) -> Option<Value> {
    if !is_content_factory_task {
        return None;
    }
    let required_skills = collect_agent_app_skill_refs(request);
    if required_skills.is_empty() {
        return None;
    }

    Some(json!({
        "source": AGENT_APP_RUNTIME_CAPABILITY_SOURCE,
        "app_id": request.app_id.trim(),
        "task_kind": request.task_kind.trim(),
        "standard": "agentskills",
        "invocation": "Lime AgentRuntime Skill tool",
        "policy": "must_use_required_skills_before_final_patch",
        "required_skills": required_skills,
        "evidence_required": true,
        "evidence_fields": ["skillId", "skill", "status", "summary"],
    }))
}

pub(super) fn render_agent_app_skill_contract_lines(skill_contract: &Value) -> Vec<String> {
    let skills = skill_contract
        .get("required_skills")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_object)
                .filter_map(|skill| {
                    let skill_name =
                        read_object_string(skill, &["skill", "id"]).unwrap_or_default();
                    if skill_name.is_empty() {
                        return None;
                    }
                    let title = read_object_string(skill, &["title", "role", "description"]);
                    Some(match title {
                        Some(title) => format!("- skill=\"{skill_name}\"：{title}"),
                        None => format!("- skill=\"{skill_name}\""),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let mut lines = vec![
        "".to_string(),
        "Content Factory Skill Contract:".to_string(),
        "- 本任务必须通过 Lime AgentRuntime 的 Skill 工具调用下列业务 Skills；不得绕过 Skill 直接普通回答。".to_string(),
        "- 本回合只应调用工具名 Skill；不要调用 Agent、Bash、Write、Read、Edit、Glob 或 Grep 来模拟业务 Skill。".to_string(),
        "- 调用示例：tool=Skill, args={\"skill\":\"knowledge-builder\",\"args\":\"基于 Input JSON 整理项目知识库\"}。".to_string(),
        "- 参数 skill 必须使用下面的 skill 值；至少调用 required=true 的 Skill。".to_string(),
        "- Skill 负责生产工艺，App 负责页面流程和产物回写；最终仍必须产出 contentFactoryWorkspacePatch / workspacePatch。".to_string(),
        "- 最终 patch 或 evidence 中必须记录 skillEvidence / skillRefs，说明每个 required Skill 的使用状态。".to_string(),
    ];
    lines.extend(skills);
    lines
}

pub(super) fn insert_agent_app_required_skill_tool_scope(root: &mut Map<String, Value>) {
    root.insert(
        "tool_scope".to_string(),
        json!({
            "source": AGENT_APP_RUNTIME_CAPABILITY_SOURCE,
            "reason": "agent_app_required_skills",
            "allowed_tools": ["Skill"],
        }),
    );
    let lime_runtime = root
        .entry(LIME_RUNTIME_METADATA_KEY.to_string())
        .or_insert_with(|| json!({}));
    if let Some(lime_runtime) = lime_runtime.as_object_mut() {
        // 占住 tool_surface，阻止 provider 默认 compact_tools 把 Skill 从工具面过滤掉。
        lime_runtime.insert(
            LIME_RUNTIME_TOOL_SURFACE_KEY.to_string(),
            json!("agent_app_required_skills"),
        );
    }
}
