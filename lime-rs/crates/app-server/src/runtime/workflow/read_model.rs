use super::status::{status_from_event_or_payload, WorkflowStatus};
use app_server_protocol::AgentEvent;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowReadModel {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_workflow_run_id: Option<String>,
    #[serde(default)]
    pub workflow_runs: Vec<WorkflowRunReadModel>,
    #[serde(default)]
    pub workflow_steps: Vec<WorkflowStepReadModel>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub actions: Vec<WorkflowActionReadModel>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowRunReadModel {
    pub workflow_run_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workflow_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub status: WorkflowStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<String>,
    #[serde(default)]
    pub step_counts: WorkflowStepCounts,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub artifact_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub evidence_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowStepReadModel {
    pub workflow_run_id: String,
    pub step_id: String,
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    pub status: WorkflowStatus,
    pub attempt: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub index: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step_count: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress_message: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_call_ids: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub artifact_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub evidence_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowStepCounts {
    pub total: usize,
    pub queued: usize,
    pub running: usize,
    pub waiting: usize,
    pub completed: usize,
    pub failed: usize,
    pub canceled: usize,
    pub retrying: usize,
    pub skipped: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowActionReadModel {
    pub workflow_run_id: String,
    pub action_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step_id: Option<String>,
}

pub(crate) fn workflow_read_model_from_events(events: &[AgentEvent]) -> WorkflowReadModel {
    let mut projector = WorkflowProjector::default();
    for event in events {
        projector.apply_event(event);
    }
    projector.finish()
}

#[derive(Default)]
struct WorkflowProjector {
    thread_id: Option<String>,
    active_workflow_run_id: Option<String>,
    runs: BTreeMap<String, WorkflowRunReadModel>,
    steps: BTreeMap<(String, String), WorkflowStepReadModel>,
    updated_at: Option<String>,
}

impl WorkflowProjector {
    fn apply_event(&mut self, event: &AgentEvent) {
        if !event.event_type.starts_with("workflow.") {
            return;
        }
        let Some(workflow_run_id) = string_field(
            &event.payload,
            &["workflowRunId", "workflow_run_id", "runId", "run_id"],
        ) else {
            return;
        };

        self.thread_id = self.thread_id.clone().or_else(|| event.thread_id.clone());
        self.updated_at = Some(event.timestamp.clone());

        if event.event_type.starts_with("workflow.run.") {
            self.apply_run_event(event, &workflow_run_id);
        }
        if event.event_type.starts_with("workflow.step.") {
            self.apply_step_event(event, &workflow_run_id);
        }
        if let Some(steps) = event.payload.get("steps").and_then(Value::as_array) {
            for step in steps {
                self.apply_embedded_step(event, &workflow_run_id, step);
            }
        }
    }

    fn apply_run_event(&mut self, event: &AgentEvent, workflow_run_id: &str) {
        let status = event_status(event).unwrap_or(WorkflowStatus::Running);
        let run = self
            .runs
            .entry(workflow_run_id.to_string())
            .or_insert_with(|| new_run(event, workflow_run_id, status));
        merge_run(run, event, status);
        if status.is_terminal() {
            if self.active_workflow_run_id.as_deref() == Some(workflow_run_id) {
                self.active_workflow_run_id = None;
            }
        } else {
            self.active_workflow_run_id = Some(workflow_run_id.to_string());
        }
    }

    fn apply_step_event(&mut self, event: &AgentEvent, workflow_run_id: &str) {
        let Some(step_id) = string_field(&event.payload, &["stepId", "step_id", "id"]) else {
            return;
        };
        let status = event_status(event).unwrap_or(WorkflowStatus::Running);
        let key = (workflow_run_id.to_string(), step_id.clone());
        let step = self
            .steps
            .entry(key)
            .or_insert_with(|| new_step(event, workflow_run_id, &step_id, status));
        merge_step(step, event, status);
    }

    fn apply_embedded_step(&mut self, event: &AgentEvent, workflow_run_id: &str, step: &Value) {
        let Some(step_id) = string_field(step, &["stepId", "step_id", "id"]) else {
            return;
        };
        let status = string_field(step, &["status"])
            .and_then(|value| status_from_event_or_payload("", Some(&value)))
            .unwrap_or(WorkflowStatus::Queued);
        let key = (workflow_run_id.to_string(), step_id.clone());
        let read_model_step = self
            .steps
            .entry(key)
            .or_insert_with(|| new_step(event, workflow_run_id, &step_id, status));
        merge_step_payload(read_model_step, event, step, status);
    }

    fn finish(mut self) -> WorkflowReadModel {
        for step in self.steps.values() {
            if let Some(run) = self.runs.get_mut(&step.workflow_run_id) {
                increment_step_counts(&mut run.step_counts, step.status);
            }
        }
        WorkflowReadModel {
            thread_id: self.thread_id,
            active_workflow_run_id: self.active_workflow_run_id,
            workflow_runs: self.runs.into_values().collect(),
            workflow_steps: self.steps.into_values().collect(),
            actions: Vec::new(),
            updated_at: self.updated_at,
        }
    }
}

fn new_run(
    event: &AgentEvent,
    workflow_run_id: &str,
    status: WorkflowStatus,
) -> WorkflowRunReadModel {
    WorkflowRunReadModel {
        workflow_run_id: workflow_run_id.to_string(),
        workflow_key: string_field(&event.payload, &["workflowKey", "workflow_key", "key"]),
        title: string_field(
            &event.payload,
            &["workflowTitle", "workflow_title", "title"],
        ),
        status,
        task_id: string_field(&event.payload, &["taskId", "task_id"]),
        turn_id: event
            .turn_id
            .clone()
            .or_else(|| string_field(&event.payload, &["turnId", "turn_id"])),
        app_id: string_field(&event.payload, &["appId", "app_id"]),
        source_kind: string_field(&event.payload, &["sourceKind", "source_kind", "source"]),
        started_at: Some(event.timestamp.clone()),
        updated_at: Some(event.timestamp.clone()),
        finished_at: status.is_terminal().then(|| event.timestamp.clone()),
        step_counts: WorkflowStepCounts::default(),
        artifact_refs: string_list_field(&event.payload, &["artifactRefs", "artifact_refs"]),
        evidence_refs: string_list_field(&event.payload, &["evidenceRefs", "evidence_refs"]),
        failure: event.payload.get("failure").cloned(),
    }
}

fn merge_run(run: &mut WorkflowRunReadModel, event: &AgentEvent, status: WorkflowStatus) {
    run.status = status;
    run.workflow_key = run
        .workflow_key
        .clone()
        .or_else(|| string_field(&event.payload, &["workflowKey", "workflow_key", "key"]));
    run.title = run.title.clone().or_else(|| {
        string_field(
            &event.payload,
            &["workflowTitle", "workflow_title", "title"],
        )
    });
    run.task_id = run
        .task_id
        .clone()
        .or_else(|| string_field(&event.payload, &["taskId", "task_id"]));
    run.turn_id = run.turn_id.clone().or_else(|| {
        event
            .turn_id
            .clone()
            .or_else(|| string_field(&event.payload, &["turnId", "turn_id"]))
    });
    run.updated_at = Some(event.timestamp.clone());
    if status.is_terminal() {
        run.finished_at = Some(event.timestamp.clone());
    }
    if let Some(failure) = event.payload.get("failure") {
        run.failure = Some(failure.clone());
    }
    merge_string_list(
        &mut run.artifact_refs,
        string_list_field(&event.payload, &["artifactRefs", "artifact_refs"]),
    );
    merge_string_list(
        &mut run.evidence_refs,
        string_list_field(&event.payload, &["evidenceRefs", "evidence_refs"]),
    );
}

fn new_step(
    event: &AgentEvent,
    workflow_run_id: &str,
    step_id: &str,
    status: WorkflowStatus,
) -> WorkflowStepReadModel {
    WorkflowStepReadModel {
        workflow_run_id: workflow_run_id.to_string(),
        step_id: step_id.to_string(),
        title: string_field(&event.payload, &["stepTitle", "step_title", "title"])
            .unwrap_or_else(|| step_id.to_string()),
        kind: string_field(&event.payload, &["stepKind", "step_kind", "kind"]),
        status,
        attempt: 1,
        index: usize_field(&event.payload, &["stepIndex", "step_index", "index"]),
        step_count: usize_field(&event.payload, &["stepCount", "step_count", "count"]),
        progress_message: string_field(
            &event.payload,
            &["progressMessage", "progress_message", "message"],
        ),
        tool_call_ids: string_list_field(&event.payload, &["toolCallIds", "tool_call_ids"]),
        artifact_refs: string_list_field(&event.payload, &["artifactRefs", "artifact_refs"]),
        evidence_refs: string_list_field(&event.payload, &["evidenceRefs", "evidence_refs"]),
        failure: event.payload.get("failure").cloned(),
        started_at: Some(event.timestamp.clone()),
        updated_at: Some(event.timestamp.clone()),
        finished_at: status.is_terminal().then(|| event.timestamp.clone()),
    }
}

fn merge_step(step: &mut WorkflowStepReadModel, event: &AgentEvent, status: WorkflowStatus) {
    merge_step_payload(step, event, &event.payload, status);
}

fn merge_step_payload(
    step: &mut WorkflowStepReadModel,
    event: &AgentEvent,
    payload: &Value,
    status: WorkflowStatus,
) {
    step.status = status;
    step.title = string_field(payload, &["stepTitle", "step_title", "title"])
        .unwrap_or_else(|| step.title.clone());
    step.kind = step
        .kind
        .clone()
        .or_else(|| string_field(payload, &["stepKind", "step_kind", "kind"]));
    step.index = step
        .index
        .or_else(|| usize_field(payload, &["stepIndex", "step_index", "index"]));
    step.step_count = step
        .step_count
        .or_else(|| usize_field(payload, &["stepCount", "step_count", "count"]));
    step.progress_message =
        string_field(payload, &["progressMessage", "progress_message", "message"])
            .or_else(|| step.progress_message.clone());
    step.updated_at = Some(event.timestamp.clone());
    if status.is_terminal() {
        step.finished_at = Some(event.timestamp.clone());
    }
    if let Some(failure) = payload.get("failure") {
        step.failure = Some(failure.clone());
    }
    merge_string_list(
        &mut step.tool_call_ids,
        string_list_field(payload, &["toolCallIds", "tool_call_ids"]),
    );
    merge_string_list(
        &mut step.artifact_refs,
        string_list_field(payload, &["artifactRefs", "artifact_refs"]),
    );
    merge_string_list(
        &mut step.evidence_refs,
        string_list_field(payload, &["evidenceRefs", "evidence_refs"]),
    );
}

fn event_status(event: &AgentEvent) -> Option<WorkflowStatus> {
    let payload_status = string_field(&event.payload, &["status"]);
    status_from_event_or_payload(&event.event_type, payload_status.as_deref())
}

fn increment_step_counts(counts: &mut WorkflowStepCounts, status: WorkflowStatus) {
    counts.total += 1;
    match status {
        WorkflowStatus::Queued => counts.queued += 1,
        WorkflowStatus::Running => counts.running += 1,
        WorkflowStatus::Waiting => counts.waiting += 1,
        WorkflowStatus::Completed => counts.completed += 1,
        WorkflowStatus::Failed => counts.failed += 1,
        WorkflowStatus::Canceled => counts.canceled += 1,
        WorkflowStatus::Retrying => counts.retrying += 1,
        WorkflowStatus::Skipped => counts.skipped += 1,
    }
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn usize_field(value: &Value, keys: &[&str]) -> Option<usize> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(|value| match value {
            Value::Number(number) => number
                .as_u64()
                .and_then(|value| usize::try_from(value).ok()),
            Value::String(value) => value.trim().parse::<usize>().ok(),
            _ => None,
        })
}

fn string_list_field(value: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(|value| match value {
            Value::Array(items) => Some(
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned)
                    .collect::<Vec<_>>(),
            ),
            Value::String(value) => Some(vec![value.trim().to_string()]),
            _ => None,
        })
        .unwrap_or_default()
}

fn merge_string_list(target: &mut Vec<String>, incoming: Vec<String>) {
    for value in incoming {
        if !target.iter().any(|existing| existing == &value) {
            target.push(value);
        }
    }
}
