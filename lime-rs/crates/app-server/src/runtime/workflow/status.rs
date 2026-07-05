use serde::{Deserialize, Serialize};

use super::events;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum WorkflowStatus {
    Queued,
    Running,
    Waiting,
    Completed,
    Failed,
    Canceled,
    Retrying,
    Skipped,
}

impl WorkflowStatus {
    pub(crate) fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Failed | Self::Canceled | Self::Skipped
        )
    }
}

pub(crate) fn workflow_status_from_event_type(event_type: &str) -> Option<WorkflowStatus> {
    match event_type {
        events::WORKFLOW_RUN_STARTED
        | events::WORKFLOW_RUN_RESUMING
        | events::WORKFLOW_STEP_STARTED
        | events::WORKFLOW_STEP_RESUMING => Some(WorkflowStatus::Running),
        events::WORKFLOW_RUN_RETRYING | events::WORKFLOW_STEP_RETRYING => {
            Some(WorkflowStatus::Retrying)
        }
        events::WORKFLOW_RUN_COMPLETED | events::WORKFLOW_STEP_COMPLETED => {
            Some(WorkflowStatus::Completed)
        }
        events::WORKFLOW_RUN_FAILED | events::WORKFLOW_STEP_FAILED => Some(WorkflowStatus::Failed),
        events::WORKFLOW_RUN_CANCELED | events::WORKFLOW_STEP_CANCELED => {
            Some(WorkflowStatus::Canceled)
        }
        events::WORKFLOW_STEP_PROGRESS => None,
        _ => None,
    }
}

pub(crate) fn normalize_workflow_status(value: &str) -> Option<WorkflowStatus> {
    match value.trim().to_ascii_lowercase().as_str() {
        "queued" | "pending" => Some(WorkflowStatus::Queued),
        "running" | "active" | "in_progress" | "in-progress" | "started" => {
            Some(WorkflowStatus::Running)
        }
        "waiting" | "waiting_action" | "waitingaction" | "waiting_permission" => {
            Some(WorkflowStatus::Waiting)
        }
        "completed" | "complete" | "succeeded" | "success" | "successful" => {
            Some(WorkflowStatus::Completed)
        }
        "failed" | "failure" | "error" | "errored" | "timeout" => Some(WorkflowStatus::Failed),
        "canceled" | "cancelled" => Some(WorkflowStatus::Canceled),
        "retrying" | "retry" => Some(WorkflowStatus::Retrying),
        "skipped" | "skip" => Some(WorkflowStatus::Skipped),
        _ => None,
    }
}

pub(crate) fn status_from_event_or_payload(
    event_type: &str,
    payload_status: Option<&str>,
) -> Option<WorkflowStatus> {
    workflow_status_from_event_type(event_type)
        .or_else(|| payload_status.and_then(normalize_workflow_status))
}
