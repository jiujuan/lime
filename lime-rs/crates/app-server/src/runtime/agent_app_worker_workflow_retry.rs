use super::agent_app_worker_workflow::AgentAppWorkerWorkflowContext;
use super::RuntimeEvent;
use serde_json::{Map, Value};

pub(super) fn workflow_retry_events(
    context: &AgentAppWorkerWorkflowContext,
    failure: &Value,
) -> Vec<RuntimeEvent> {
    let mut events = Vec::new();
    if let Some(payload) = context.first_step_payload("retrying", Some(failure.clone())) {
        events.push(RuntimeEvent::new("workflow.step.retrying", payload));
    }
    let mut payload = context.workflow_run_payload("retrying");
    insert_object_field(&mut payload, "failure", failure.clone());
    events.push(RuntimeEvent::new("workflow.run.retrying", payload));
    events
}

fn insert_object_field(value: &mut Value, key: &str, field: Value) {
    if let Some(object) = value.as_object_mut() {
        object.insert(key.to_string(), field);
        return;
    }
    let mut object = Map::new();
    object.insert(key.to_string(), field);
    *value = Value::Object(object);
}
