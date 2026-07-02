use serde_json::Value;

#[derive(Debug, Clone, Default)]
pub(super) struct AgentAppWorkerOrchestration {
    pub(super) workflow_key: Option<String>,
    pub(super) workflow_title: Option<String>,
    pub(super) hook_policy: Option<Value>,
    pub(super) subagents: Vec<String>,
    pub(super) skill_refs: Vec<String>,
    pub(super) cli_refs: Vec<String>,
    pub(super) connector_refs: Vec<String>,
    pub(super) orchestration: Option<Value>,
}

#[derive(Debug, Clone, Default)]
pub(super) struct AgentAppWorkerOrchestrationOverrides {
    pub(super) workflow_key: Option<String>,
    pub(super) hook_policy: Option<Value>,
    pub(super) subagents: Vec<String>,
    pub(super) skill_refs: Vec<String>,
    pub(super) cli_refs: Vec<String>,
    pub(super) connector_refs: Vec<String>,
    pub(super) orchestration: Option<Value>,
}

pub(super) fn resolve_agent_app_worker_orchestration(
    installed_state: &Value,
    task_kind: &str,
    overrides: AgentAppWorkerOrchestrationOverrides,
) -> AgentAppWorkerOrchestration {
    let manifest = installed_state.get("manifest").unwrap_or(installed_state);
    let workflow = selected_workflow(manifest, overrides.workflow_key.as_deref(), task_kind);
    let mut resolved = workflow
        .map(|workflow| orchestration_from_workflow(workflow, manifest))
        .unwrap_or_default();

    if resolved.workflow_key.is_none() {
        resolved.workflow_key = overrides.workflow_key.clone();
    }
    apply_overrides(&mut resolved, overrides);
    resolved
}

pub(super) fn hook_refs_for_scope(policy: &Value, hook_scope: &str) -> Vec<String> {
    string_list_field(policy, &[hook_scope])
}

fn apply_overrides(
    resolved: &mut AgentAppWorkerOrchestration,
    overrides: AgentAppWorkerOrchestrationOverrides,
) {
    if overrides.workflow_key.is_some() {
        resolved.workflow_key = overrides.workflow_key;
    }
    if overrides.hook_policy.is_some() {
        resolved.hook_policy = overrides.hook_policy;
    }
    if !overrides.subagents.is_empty() {
        resolved.subagents = overrides.subagents;
    }
    if !overrides.skill_refs.is_empty() {
        resolved.skill_refs = overrides.skill_refs;
    }
    if !overrides.cli_refs.is_empty() {
        resolved.cli_refs = overrides.cli_refs;
    }
    if !overrides.connector_refs.is_empty() {
        resolved.connector_refs = overrides.connector_refs;
    }
    if overrides.orchestration.is_some() {
        resolved.orchestration = overrides.orchestration;
    }
}

fn orchestration_from_workflow(workflow: &Value, manifest: &Value) -> AgentAppWorkerOrchestration {
    let steps = workflow
        .get("steps")
        .or_else(|| workflow.get("orchestration"))
        .filter(|value| value.as_array().is_some_and(|items| !items.is_empty()))
        .cloned();
    let mut subagents = string_list_field(workflow, &["subagents", "sub_agents"]);
    if subagents.is_empty() {
        subagents = string_list_from_step_field(steps.as_ref(), "subagent");
    }

    let mut skill_refs = string_list_field(workflow, &["skillRefs", "skill_refs"]);
    if skill_refs.is_empty() {
        skill_refs =
            string_list_from_step_array_field(steps.as_ref(), &["skillRefs", "skill_refs"]);
    }
    if skill_refs.is_empty() {
        skill_refs = string_list_field(manifest, &["skillRefs", "skill_refs"]);
    }

    AgentAppWorkerOrchestration {
        workflow_key: string_field(workflow, &["key", "workflowKey", "workflow_key"]),
        workflow_title: string_field(workflow, &["title", "name"]),
        hook_policy: object_field(workflow, &["hookPolicy", "hook_policy"]),
        subagents,
        skill_refs,
        cli_refs: string_list_field(workflow, &["cliRefs", "cli_refs"]),
        connector_refs: string_list_field(workflow, &["connectorRefs", "connector_refs"]),
        orchestration: steps,
    }
}

fn selected_workflow<'a>(
    manifest: &'a Value,
    workflow_key: Option<&str>,
    task_kind: &str,
) -> Option<&'a Value> {
    let workflows = manifest
        .get("agentRuntime")
        .and_then(|runtime| runtime.get("workflows"))
        .or_else(|| manifest.get("workflows"))
        .and_then(Value::as_array)?;
    workflows.iter().find(|workflow| {
        workflow_key
            .and_then(|key| string_field(workflow, &["key"]).map(|value| value == key))
            .unwrap_or(false)
            || string_field(workflow, &["taskKind", "task_kind"])
                .map(|value| value == task_kind)
                .unwrap_or(false)
    })
}

fn string_list_from_step_field(steps: Option<&Value>, key: &str) -> Vec<String> {
    let Some(items) = steps.and_then(Value::as_array) else {
        return Vec::new();
    };
    dedupe_strings(
        items
            .iter()
            .filter_map(|item| item.get(key))
            .filter_map(string_value),
    )
}

fn string_list_from_step_array_field(steps: Option<&Value>, keys: &[&str]) -> Vec<String> {
    let Some(items) = steps.and_then(Value::as_array) else {
        return Vec::new();
    };
    let values = items.iter().flat_map(|item| string_list_field(item, keys));
    dedupe_strings(values)
}

pub(super) fn string_list_field(value: &Value, keys: &[&str]) -> Vec<String> {
    for key in keys {
        let Some(items) = value.get(*key).and_then(Value::as_array) else {
            continue;
        };
        return dedupe_strings(items.iter().filter_map(string_value));
    }
    Vec::new()
}

fn object_field(value: &Value, keys: &[&str]) -> Option<Value> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .filter(|value| value.is_object())
        .cloned()
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .and_then(string_value)
}

fn string_value(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return non_empty_string(text);
    }
    let object = value.as_object()?;
    ["id", "key", "name"]
        .iter()
        .find_map(|key| object.get(*key))
        .and_then(Value::as_str)
        .and_then(non_empty_string)
}

fn non_empty_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn dedupe_strings(values: impl IntoIterator<Item = String>) -> Vec<String> {
    values.into_iter().fold(Vec::new(), |mut result, value| {
        if !result.iter().any(|existing| existing == &value) {
            result.push(value);
        }
        result
    })
}
