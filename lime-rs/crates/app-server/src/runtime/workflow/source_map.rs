#![allow(dead_code)]

use super::definition::{
    WorkflowDefinition, WorkflowSourceKind, WorkflowSourceRef, WorkflowStepDefinition,
    WorkflowStepKind,
};
use serde_json::{Map, Value};

pub(crate) struct WorkflowDefinitionSourceInput<'a> {
    pub(crate) source: WorkflowSourceRef,
    pub(crate) workflow_key: &'a str,
    pub(crate) title: Option<&'a str>,
    pub(crate) task_kind: Option<&'a str>,
    pub(crate) input_schema: Option<&'a Value>,
    pub(crate) output_artifact_kind: Option<&'a str>,
    pub(crate) steps: Option<&'a Value>,
    pub(crate) policies: Option<&'a Value>,
}

pub(crate) fn workflow_definition_from_manifest(
    manifest: &Value,
    source: WorkflowSourceRef,
    workflow_key: &str,
) -> Option<WorkflowDefinition> {
    let workflow = workflow_record_from_manifest(manifest, workflow_key)?;
    workflow_definition_from_workflow_record(workflow, source)
}

pub(crate) fn workflow_definition_from_workflow_record(
    workflow: &Value,
    source: WorkflowSourceRef,
) -> Option<WorkflowDefinition> {
    let workflow_key = string_field(workflow, &["key", "workflowKey", "workflow_key"])?;
    workflow_definition_from_source(WorkflowDefinitionSourceInput {
        source,
        workflow_key: &workflow_key,
        title: string_field(workflow, &["title", "name"]).as_deref(),
        task_kind: string_field(workflow, &["taskKind", "task_kind"]).as_deref(),
        input_schema: workflow
            .get("inputSchema")
            .or_else(|| workflow.get("input_schema")),
        output_artifact_kind: string_field(
            workflow,
            &["outputArtifactKind", "output_artifact_kind"],
        )
        .as_deref(),
        steps: workflow
            .get("steps")
            .or_else(|| workflow.get("orchestration")),
        policies: workflow.get("policies"),
    })
}

pub(crate) fn workflow_definition_from_source(
    input: WorkflowDefinitionSourceInput<'_>,
) -> Option<WorkflowDefinition> {
    let workflow_key = non_empty_string(input.workflow_key)?;
    let default_kind = default_step_kind_for_source(input.source.source_kind.clone());
    let steps = workflow_step_definitions_from_value(input.steps, default_kind);
    if steps.is_empty() {
        return None;
    }

    let source_kind = input.source.source_kind.clone();
    let mut definition = WorkflowDefinition::new(
        definition_id(&source_kind, &input.source.source_id, &workflow_key),
        input.source,
        workflow_key.clone(),
        input
            .title
            .and_then(non_empty_string)
            .unwrap_or_else(|| humanize_id(&workflow_key)),
    );
    definition.task_kind = input.task_kind.and_then(non_empty_string);
    definition.input_schema = input.input_schema.cloned();
    definition.output_artifact_kind = input.output_artifact_kind.and_then(non_empty_string);
    definition.steps = steps;
    definition.policies =
        normalized_policies(input.policies, source_kind == WorkflowSourceKind::Skill);
    Some(definition)
}

pub(crate) fn workflow_step_definitions_from_value(
    value: Option<&Value>,
    default_kind: Option<WorkflowStepKind>,
) -> Vec<WorkflowStepDefinition> {
    let Some(items) = value.and_then(Value::as_array) else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| workflow_step_definition_from_value(item, default_kind.clone()))
        .collect()
}

fn workflow_record_from_manifest<'a>(manifest: &'a Value, workflow_key: &str) -> Option<&'a Value> {
    let workflows = manifest
        .get("agentRuntime")
        .and_then(|runtime| runtime.get("workflows"))
        .or_else(|| manifest.get("workflows"))
        .and_then(Value::as_array)?;
    workflows.iter().find(|workflow| {
        string_field(workflow, &["key", "workflowKey", "workflow_key"]).as_deref()
            == Some(workflow_key)
    })
}

fn workflow_step_definition_from_value(
    value: &Value,
    default_kind: Option<WorkflowStepKind>,
) -> Option<WorkflowStepDefinition> {
    let id = string_field(value, &["id", "key", "stepId", "step_id"])?;
    let skill_refs = string_list_field(value, &["skillRefs", "skill_refs", "skills"]);
    let subagent_ref = string_field(
        value,
        &["subagentRef", "subagent_ref", "subagent", "subAgent"],
    );
    let tool_refs = unique_strings(
        string_list_field(value, &["toolRefs", "tool_refs", "tools"])
            .into_iter()
            .chain(string_list_field(
                value,
                &["connectorRefs", "connector_refs"],
            ))
            .chain(string_list_field(value, &["cliRefs", "cli_refs"])),
    );
    let human_review = bool_field(value, &["humanReview", "human_review"]).unwrap_or(false);
    let kind = string_field(value, &["kind", "type"])
        .and_then(|kind| normalize_step_kind(&kind))
        .unwrap_or_else(|| {
            infer_step_kind(
                default_kind,
                subagent_ref.as_ref(),
                &skill_refs,
                &tool_refs,
                human_review,
            )
        });

    Some(WorkflowStepDefinition {
        id: id.clone(),
        title: string_field(
            value,
            &["title", "name", "label", "stepTitle", "step_title"],
        )
        .unwrap_or_else(|| humanize_id(&id)),
        kind,
        depends_on: string_list_field(value, &["dependsOn", "depends_on", "dependencies"]),
        skill_refs,
        subagent_ref,
        tool_refs,
        expected_output: string_field(value, &["expectedOutput", "expected_output"]),
        input_mapping: value
            .get("inputMapping")
            .or_else(|| value.get("input_mapping"))
            .cloned(),
        output_mapping: value
            .get("outputMapping")
            .or_else(|| value.get("output_mapping"))
            .cloned(),
        retry_policy: value
            .get("retryPolicy")
            .or_else(|| value.get("retry_policy"))
            .cloned(),
        human_review,
    })
}

fn default_step_kind_for_source(source_kind: WorkflowSourceKind) -> Option<WorkflowStepKind> {
    match source_kind {
        WorkflowSourceKind::Skill => Some(WorkflowStepKind::Skill),
        WorkflowSourceKind::ImageCommand | WorkflowSourceKind::Builtin => {
            Some(WorkflowStepKind::AgentTask)
        }
        WorkflowSourceKind::PluginManifest
        | WorkflowSourceKind::ContentFactory
        | WorkflowSourceKind::TestFixture => None,
    }
}

fn normalize_step_kind(value: &str) -> Option<WorkflowStepKind> {
    match value.trim().to_ascii_lowercase().as_str() {
        "agent_task" | "agenttask" | "agent-task" | "agent.starttask" | "agent.start_task" => {
            Some(WorkflowStepKind::AgentTask)
        }
        "skill" => Some(WorkflowStepKind::Skill),
        "subagent" | "sub_agent" | "sub-agent" => Some(WorkflowStepKind::Subagent),
        "tool" => Some(WorkflowStepKind::Tool),
        "connector" | "knowledge.search" | "knowledge_search" => Some(WorkflowStepKind::Connector),
        "hook" => Some(WorkflowStepKind::Hook),
        "artifact" | "artifacts.create" | "artifact.create" => Some(WorkflowStepKind::Artifact),
        "evidence" | "evidence.record" => Some(WorkflowStepKind::Evidence),
        "storage" | "storage.set" => Some(WorkflowStepKind::Storage),
        "manual_gate" | "manualgate" | "manual-gate" | "human_review" | "humanreview" => {
            Some(WorkflowStepKind::ManualGate)
        }
        _ => None,
    }
}

fn infer_step_kind(
    default_kind: Option<WorkflowStepKind>,
    subagent_ref: Option<&String>,
    skill_refs: &[String],
    tool_refs: &[String],
    human_review: bool,
) -> WorkflowStepKind {
    if subagent_ref.is_some() {
        return WorkflowStepKind::Subagent;
    }
    if !skill_refs.is_empty() {
        return WorkflowStepKind::Skill;
    }
    if !tool_refs.is_empty() {
        return WorkflowStepKind::Tool;
    }
    if human_review {
        return WorkflowStepKind::ManualGate;
    }
    default_kind.unwrap_or(WorkflowStepKind::AgentTask)
}

fn normalized_policies(policies: Option<&Value>, summary_only: bool) -> Option<Value> {
    if !summary_only {
        return policies.cloned();
    }
    let mut object = policies
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    object.insert("summaryOnly".to_string(), Value::Bool(true));
    Some(Value::Object(object))
}

fn definition_id(source_kind: &WorkflowSourceKind, source_id: &str, workflow_key: &str) -> String {
    format!(
        "{}:{}:{}",
        source_kind_slug(source_kind),
        normalize_id_segment(source_id),
        normalize_id_segment(workflow_key)
    )
}

fn source_kind_slug(source_kind: &WorkflowSourceKind) -> &'static str {
    match source_kind {
        WorkflowSourceKind::PluginManifest => "plugin_manifest",
        WorkflowSourceKind::Skill => "skill",
        WorkflowSourceKind::Builtin => "builtin",
        WorkflowSourceKind::ImageCommand => "image_command",
        WorkflowSourceKind::ContentFactory => "content_factory",
        WorkflowSourceKind::TestFixture => "test_fixture",
    }
}

fn normalize_id_segment(value: &str) -> String {
    let normalized = value
        .trim()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    if normalized.is_empty() {
        "unknown".to_string()
    } else {
        normalized
    }
}

fn humanize_id(value: &str) -> String {
    let text = value
        .trim()
        .replace(['_', '-', '.'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    if text.is_empty() {
        "Workflow".to_string()
    } else {
        text
    }
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .and_then(string_value)
}

fn string_list_field(value: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .map(|field| match field {
            Value::Array(items) => items.iter().filter_map(string_value).collect::<Vec<_>>(),
            other => string_value(other).into_iter().collect(),
        })
        .map(unique_strings)
        .unwrap_or_default()
}

fn string_value(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        return non_empty_string(text);
    }
    value
        .as_object()
        .and_then(|object| string_from_object(object, &["id", "key", "name", "title"]))
}

fn string_from_object(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| object.get(*key))
        .and_then(Value::as_str)
        .and_then(non_empty_string)
}

fn bool_field(value: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .and_then(Value::as_bool)
}

fn non_empty_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

fn unique_strings(values: impl IntoIterator<Item = String>) -> Vec<String> {
    values.into_iter().fold(Vec::new(), |mut result, value| {
        if !result.iter().any(|existing| existing == &value) {
            result.push(value);
        }
        result
    })
}
