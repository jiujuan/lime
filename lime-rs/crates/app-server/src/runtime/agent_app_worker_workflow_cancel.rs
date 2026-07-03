use super::event_log::EventLogRecord;
use super::{timestamp, RuntimeEvent};
use serde_json::{json, Value};
use std::collections::BTreeSet;

pub(super) fn workflow_cancel_events_from_audit_records(
    records: &[EventLogRecord],
    turn_id: &str,
) -> Vec<RuntimeEvent> {
    let mut events = Vec::new();
    let mut seen_run_ids = BTreeSet::new();
    for run_started in records.iter().filter(|record| {
        record.event.turn_id.as_deref() == Some(turn_id)
            && record.event.event_type == "workflow.run.started"
    }) {
        let Some(workflow_run_id) = workflow_run_id(&run_started.event.payload) else {
            continue;
        };
        if !seen_run_ids.insert(workflow_run_id.clone()) {
            continue;
        }
        if workflow_run_is_terminal(records, turn_id, &workflow_run_id) {
            continue;
        }

        if let Some(step_payload) =
            open_step_payload(records, turn_id, &workflow_run_id).map(canceled_payload)
        {
            events.push(RuntimeEvent::new("workflow.step.canceled", step_payload));
        }

        events.push(RuntimeEvent::new(
            "workflow.run.canceled",
            canceled_payload(run_started.event.payload.clone()),
        ));
    }
    events
}

fn workflow_run_is_terminal(
    records: &[EventLogRecord],
    turn_id: &str,
    workflow_run_id: &str,
) -> bool {
    records.iter().any(|record| {
        record.event.turn_id.as_deref() == Some(turn_id)
            && workflow_run_id_matches(&record.event.payload, workflow_run_id)
            && matches!(
                record.event.event_type.as_str(),
                "workflow.run.completed" | "workflow.run.failed" | "workflow.run.canceled"
            )
    })
}

fn open_step_payload(
    records: &[EventLogRecord],
    turn_id: &str,
    workflow_run_id: &str,
) -> Option<Value> {
    records
        .iter()
        .enumerate()
        .rev()
        .find(|(index, record)| {
            record.event.turn_id.as_deref() == Some(turn_id)
                && record.event.event_type.starts_with("workflow.step.")
                && workflow_run_id_matches(&record.event.payload, workflow_run_id)
                && !workflow_step_event_is_terminal(record)
                && !step_has_later_terminal_event(records, *index, turn_id, workflow_run_id, record)
        })
        .map(|(_, record)| record.event.payload.clone())
}

fn step_has_later_terminal_event(
    records: &[EventLogRecord],
    index: usize,
    turn_id: &str,
    workflow_run_id: &str,
    record: &EventLogRecord,
) -> bool {
    let Some(step_id) = string_field(&record.event.payload, "stepId") else {
        return false;
    };
    records.iter().skip(index + 1).any(|later| {
        later.event.turn_id.as_deref() == Some(turn_id)
            && workflow_run_id_matches(&later.event.payload, workflow_run_id)
            && string_field(&later.event.payload, "stepId").as_deref() == Some(step_id.as_str())
            && workflow_step_event_is_terminal(later)
    })
}

fn workflow_step_event_is_terminal(record: &EventLogRecord) -> bool {
    matches!(
        record.event.event_type.as_str(),
        "workflow.step.completed" | "workflow.step.failed" | "workflow.step.canceled"
    ) || matches!(
        string_field(&record.event.payload, "status").as_deref(),
        Some("completed" | "failed" | "canceled")
    )
}

fn workflow_run_id_matches(payload: &Value, expected: &str) -> bool {
    workflow_run_id(payload).as_deref() == Some(expected)
}

fn workflow_run_id(payload: &Value) -> Option<String> {
    string_field(payload, "workflowRunId").or_else(|| string_field(payload, "run_id"))
}

fn canceled_payload(mut payload: Value) -> Value {
    let canceled_at = timestamp();
    if let Some(object) = payload.as_object_mut() {
        object.insert("status".to_string(), json!("canceled"));
        object.insert("updatedAt".to_string(), json!(canceled_at));
        object.insert(
            "cancellation".to_string(),
            json!({
                "source": "agentSession/turn/cancel",
                "reasonCode": "turn_canceled",
                "canceledAt": canceled_at,
            }),
        );
        if let Some(metadata) = object
            .get_mut("metadata")
            .and_then(Value::as_object_mut)
            .and_then(|metadata| metadata.get_mut("agentAppWorkflow"))
            .and_then(Value::as_object_mut)
        {
            metadata.insert("status".to_string(), json!("canceled"));
        }
    }
    payload
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::AgentEvent;
    use serde_json::json;
    use std::path::PathBuf;

    #[test]
    fn builds_cancel_events_from_open_workflow_audit_run() {
        let records = vec![
            record(
                "workflow.run.started",
                json!({
                    "workflowRunId": "task-1:workflow",
                    "workflowKey": "content_article_workflow",
                    "status": "running",
                    "metadata": {
                        "agentAppWorkflow": {
                            "status": "running"
                        }
                    }
                }),
            ),
            record(
                "workflow.step.started",
                json!({
                    "workflowRunId": "task-1:workflow",
                    "stepId": "research",
                    "status": "running",
                    "metadata": {
                        "agentAppWorkflow": {
                            "status": "running"
                        }
                    }
                }),
            ),
        ];

        let events = workflow_cancel_events_from_audit_records(&records, "turn-1");

        assert_eq!(events.len(), 2);
        assert_eq!(events[0].event_type, "workflow.step.canceled");
        assert_eq!(events[0].payload["stepId"], "research");
        assert_eq!(events[0].payload["status"], "canceled");
        assert_eq!(
            events[0].payload["cancellation"]["reasonCode"],
            "turn_canceled"
        );
        assert_eq!(events[1].event_type, "workflow.run.canceled");
        assert_eq!(events[1].payload["workflowRunId"], "task-1:workflow");
        assert_eq!(events[1].payload["status"], "canceled");
        assert_eq!(
            events[1].payload["metadata"]["agentAppWorkflow"]["status"],
            "canceled"
        );
    }

    #[test]
    fn skips_cancel_events_when_workflow_run_already_terminal() {
        let records = vec![
            record(
                "workflow.run.started",
                json!({
                    "workflowRunId": "task-1:workflow",
                    "status": "running"
                }),
            ),
            record(
                "workflow.run.completed",
                json!({
                    "workflowRunId": "task-1:workflow",
                    "status": "completed"
                }),
            ),
        ];

        let events = workflow_cancel_events_from_audit_records(&records, "turn-1");

        assert!(events.is_empty());
    }

    #[test]
    fn does_not_cancel_step_that_already_reached_terminal_state() {
        let records = vec![
            record(
                "workflow.run.started",
                json!({
                    "workflowRunId": "task-1:workflow",
                    "status": "running"
                }),
            ),
            record(
                "workflow.step.started",
                json!({
                    "workflowRunId": "task-1:workflow",
                    "stepId": "research",
                    "status": "running"
                }),
            ),
            record(
                "workflow.step.completed",
                json!({
                    "workflowRunId": "task-1:workflow",
                    "stepId": "research",
                    "status": "completed"
                }),
            ),
        ];

        let events = workflow_cancel_events_from_audit_records(&records, "turn-1");

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "workflow.run.canceled");
    }

    fn record(event_type: &str, payload: Value) -> EventLogRecord {
        EventLogRecord {
            path: PathBuf::from("workflow-events.jsonl"),
            event: AgentEvent {
                event_id: format!("event-{event_type}"),
                sequence: 1,
                session_id: "session-1".to_string(),
                thread_id: Some("thread-1".to_string()),
                turn_id: Some("turn-1".to_string()),
                event_type: event_type.to_string(),
                timestamp: "2026-07-03T00:00:00.000Z".to_string(),
                payload,
            },
        }
    }
}
