use serde_json::Value;

pub(crate) const ARTIFACT_SNAPSHOT: &str = "artifact.snapshot";

pub(crate) const WORKFLOW_RUN_STARTED: &str = "workflow.run.started";
pub(crate) const WORKFLOW_RUN_RESUMING: &str = "workflow.run.resuming";
pub(crate) const WORKFLOW_RUN_RETRYING: &str = "workflow.run.retrying";
pub(crate) const WORKFLOW_RUN_COMPLETED: &str = "workflow.run.completed";
pub(crate) const WORKFLOW_RUN_FAILED: &str = "workflow.run.failed";
pub(crate) const WORKFLOW_RUN_CANCELED: &str = "workflow.run.canceled";

pub(crate) const WORKFLOW_STEP_STARTED: &str = "workflow.step.started";
pub(crate) const WORKFLOW_STEP_RESUMING: &str = "workflow.step.resuming";
pub(crate) const WORKFLOW_STEP_PROGRESS: &str = "workflow.step.progress";
pub(crate) const WORKFLOW_STEP_RETRYING: &str = "workflow.step.retrying";
pub(crate) const WORKFLOW_STEP_COMPLETED: &str = "workflow.step.completed";
pub(crate) const WORKFLOW_STEP_FAILED: &str = "workflow.step.failed";
pub(crate) const WORKFLOW_STEP_CANCELED: &str = "workflow.step.canceled";

pub(crate) const WORKFLOW_TOOL_STARTED: &str = "workflow.tool.started";
pub(crate) const WORKFLOW_TOOL_COMPLETED: &str = "workflow.tool.completed";
pub(crate) const WORKFLOW_CONNECTOR_REQUESTED: &str = "workflow.connector.requested";
pub(crate) const WORKFLOW_CONNECTOR_COMPLETED: &str = "workflow.connector.completed";
pub(crate) const WORKFLOW_HOOK_STARTED: &str = "workflow.hook.started";
pub(crate) const WORKFLOW_HOOK_COMPLETED: &str = "workflow.hook.completed";
pub(crate) const WORKFLOW_ARTIFACT_DELTA: &str = "workflow.artifact.delta";

pub(crate) fn workflow_run_event_is_terminal(event_type: &str) -> bool {
    matches!(
        event_type,
        WORKFLOW_RUN_COMPLETED | WORKFLOW_RUN_FAILED | WORKFLOW_RUN_CANCELED
    )
}

pub(crate) fn workflow_step_event_is_terminal(event_type: &str) -> bool {
    matches!(
        event_type,
        WORKFLOW_STEP_COMPLETED | WORKFLOW_STEP_FAILED | WORKFLOW_STEP_CANCELED
    )
}

pub(crate) fn is_allowed_worker_progress_event(event_type: &str) -> bool {
    matches!(
        event_type,
        WORKFLOW_STEP_PROGRESS
            | WORKFLOW_TOOL_STARTED
            | WORKFLOW_TOOL_COMPLETED
            | WORKFLOW_CONNECTOR_REQUESTED
            | WORKFLOW_CONNECTOR_COMPLETED
            | WORKFLOW_HOOK_STARTED
            | WORKFLOW_HOOK_COMPLETED
            | WORKFLOW_ARTIFACT_DELTA
            | ARTIFACT_SNAPSHOT
    )
}

pub(crate) fn requires_step_binding(event_type: &str) -> bool {
    matches!(
        event_type,
        WORKFLOW_STEP_PROGRESS
            | WORKFLOW_TOOL_STARTED
            | WORKFLOW_TOOL_COMPLETED
            | WORKFLOW_CONNECTOR_REQUESTED
            | WORKFLOW_CONNECTOR_COMPLETED
            | WORKFLOW_HOOK_STARTED
            | WORKFLOW_HOOK_COMPLETED
            | WORKFLOW_ARTIFACT_DELTA
    )
}

pub(crate) fn validate_required_progress_payload(
    event_type: &str,
    payload: &Value,
) -> Result<(), String> {
    if event_type.starts_with("workflow.tool.")
        && string_field(payload, &["toolName", "tool_name", "name"]).is_none()
    {
        return Err(format!("{event_type} missing toolName"));
    }
    if event_type.starts_with("workflow.connector.")
        && string_field(payload, &["connectorRef", "connector_ref"]).is_none()
    {
        return Err(format!("{event_type} missing connectorRef"));
    }
    if event_type.starts_with("workflow.hook.")
        && string_field(payload, &["hookKey", "hook_key"]).is_none()
    {
        return Err(format!("{event_type} missing hookKey"));
    }
    Ok(())
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}
