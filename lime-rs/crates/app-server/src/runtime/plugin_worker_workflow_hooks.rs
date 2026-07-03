use super::plugin_worker_workflow::PluginWorkerWorkflowContext;
use super::RuntimeEvent;
use serde_json::{json, Map, Value};

pub(super) fn workflow_hook_completed_events_from_worker_hook_events(
    context: &PluginWorkerWorkflowContext,
    hook_events: &[RuntimeEvent],
) -> Result<Vec<RuntimeEvent>, String> {
    hook_events
        .iter()
        .filter(|event| event.event_type == "plugin_worker.hook")
        .map(|event| workflow_hook_completed_event_from_worker_hook(context, event))
        .collect()
}

fn workflow_hook_completed_event_from_worker_hook(
    context: &PluginWorkerWorkflowContext,
    event: &RuntimeEvent,
) -> Result<RuntimeEvent, String> {
    let mut payload = event.payload.clone();
    let hook_scope = string_field(&payload, &["hookScope", "hook_scope"]);
    let step_id = context.hook_step_id(hook_scope.as_deref())?;
    insert_object_field(&mut payload, "stepId", json!(step_id));
    insert_object_field(&mut payload, "auditOnly", json!(true));
    context.bind_internal_workflow_event(
        RuntimeEvent::new("workflow.hook.completed", payload),
        "plugin_worker_hook",
    )
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
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
