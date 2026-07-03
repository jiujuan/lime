#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub(crate) const WORKFLOW_SCHEMA_VERSION: &str = "workflow.v1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum WorkflowSourceKind {
    PluginManifest,
    Skill,
    Builtin,
    ImageCommand,
    ContentFactory,
    TestFixture,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum WorkflowStepKind {
    AgentTask,
    Skill,
    Subagent,
    Tool,
    Connector,
    Hook,
    Artifact,
    Evidence,
    Storage,
    ManualGate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowSourceRef {
    pub source_kind: WorkflowSourceKind,
    pub source_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_version: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowDefinition {
    pub definition_id: String,
    pub schema_version: String,
    pub source: WorkflowSourceRef,
    pub workflow_key: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_schema: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_artifact_kind: Option<String>,
    #[serde(default)]
    pub steps: Vec<WorkflowStepDefinition>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub policies: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowStepDefinition {
    pub id: String,
    pub title: String,
    pub kind: WorkflowStepKind,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub depends_on: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skill_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subagent_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected_output: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_mapping: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_mapping: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retry_policy: Option<Value>,
    #[serde(default)]
    pub human_review: bool,
}

impl WorkflowDefinition {
    pub(crate) fn new(
        definition_id: impl Into<String>,
        source: WorkflowSourceRef,
        workflow_key: impl Into<String>,
        title: impl Into<String>,
    ) -> Self {
        Self {
            definition_id: definition_id.into(),
            schema_version: WORKFLOW_SCHEMA_VERSION.to_string(),
            source,
            workflow_key: workflow_key.into(),
            title: title.into(),
            task_kind: None,
            input_schema: None,
            output_artifact_kind: None,
            steps: Vec::new(),
            policies: None,
        }
    }
}
