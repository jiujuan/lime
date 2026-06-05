use super::super::extract_harness_nested_object;
use serde_json::{json, Value};
use std::collections::HashSet;

fn collect_required_skill_names_from_contract_object(
    contract: &serde_json::Map<String, Value>,
) -> Vec<String> {
    let mut names = Vec::new();
    let mut seen = HashSet::new();

    for key in [
        "required_skills",
        "requiredSkills",
        "skill_refs",
        "skillRefs",
        "skills",
    ] {
        let Some(items) = contract.get(key).and_then(Value::as_array) else {
            continue;
        };
        for item in items {
            let required = item
                .as_object()
                .and_then(|object| object.get("required"))
                .and_then(Value::as_bool)
                .unwrap_or(true);
            if !required {
                continue;
            }
            let name = item
                .as_str()
                .map(str::to_string)
                .or_else(|| {
                    item.as_object().and_then(|object| {
                        ["skill", "id", "name"]
                            .iter()
                            .filter_map(|key| object.get(*key))
                            .find_map(Value::as_str)
                            .map(str::to_string)
                    })
                })
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());
            let Some(name) = name else {
                continue;
            };
            if seen.insert(name.to_ascii_lowercase()) {
                names.push(name);
            }
        }
    }

    names
}

pub(super) fn resolve_agent_app_required_skill_tool_allowlist(
    request_metadata: Option<&Value>,
) -> Option<Vec<String>> {
    for key in [
        "content_factory_skill_contract",
        "agent_app_runtime_skill_contract",
    ] {
        let Some(contract) = extract_harness_nested_object(request_metadata, &[key]) else {
            continue;
        };
        let names = collect_required_skill_names_from_contract_object(contract);
        if !names.is_empty() {
            return Some(names);
        }
    }

    None
}

pub(super) fn resolve_agent_app_required_skill_contract(
    request_metadata: Option<&Value>,
) -> Option<(Value, Vec<String>)> {
    for key in [
        "content_factory_skill_contract",
        "agent_app_runtime_skill_contract",
    ] {
        let Some(contract) = extract_harness_nested_object(request_metadata, &[key]) else {
            continue;
        };
        let names = collect_required_skill_names_from_contract_object(contract);
        if !names.is_empty() {
            return Some((Value::Object(contract.clone()), names));
        }
    }

    None
}

fn clone_harness_nested_object_value(
    request_metadata: Option<&Value>,
    keys: &[&str],
) -> Option<Value> {
    extract_harness_nested_object(request_metadata, keys)
        .map(|object| Value::Object(object.clone()))
}

fn build_agent_app_required_skill_args(
    request_metadata: Option<&Value>,
    skill_contract: &Value,
    skill_name: &str,
    skill_index: usize,
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
) -> Value {
    let mut args = serde_json::Map::new();
    args.insert(
        "agentTaskContract".to_string(),
        json!({
            "runtimeSurface": "agent_app",
            "source": "agent_app_required_skill_contract_preexecution",
            "policy": "must_use_required_skills_before_final_patch",
            "requiredSkills": skill_contract
                .get("required_skills")
                .or_else(|| skill_contract.get("requiredSkills"))
                .cloned()
                .unwrap_or_else(|| json!([])),
        }),
    );
    args.insert("skillContract".to_string(), skill_contract.clone());
    args.insert(
        "requiredSkill".to_string(),
        json!({
            "skill": skill_name,
            "index": skill_index,
            "required": true,
        }),
    );
    args.insert(
        "runtime".to_string(),
        json!({
            "sessionId": session_id,
            "threadId": thread_id,
            "turnId": turn_id,
            "source": "lime_agent_runtime_contract",
        }),
    );

    if let Some(agent_app_runtime) = clone_harness_nested_object_value(
        request_metadata,
        &["agent_app_runtime", "agentAppRuntime"],
    ) {
        args.insert("agentAppRuntime".to_string(), agent_app_runtime);
    }
    if let Some(output_contract) = clone_harness_nested_object_value(
        request_metadata,
        &[
            "agent_app_runtime_output_contract",
            "agentAppRuntimeOutputContract",
        ],
    ) {
        args.insert("outputContract".to_string(), output_contract);
    }

    Value::Object(args)
}

pub(super) fn build_agent_app_required_skill_tool_params(
    request_metadata: Option<&Value>,
    skill_contract: &Value,
    skill_name: &str,
    skill_index: usize,
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
) -> Value {
    json!({
        "skill": skill_name,
        "args": build_agent_app_required_skill_args(
            request_metadata,
            skill_contract,
            skill_name,
            skill_index,
            session_id,
            thread_id,
            turn_id,
        ),
    })
}
