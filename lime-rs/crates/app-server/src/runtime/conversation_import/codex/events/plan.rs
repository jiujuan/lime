use super::{call_id, compact_json, parsed_arguments, string_field, ImportedRuntimeEvent};
use serde_json::{json, Value};

pub(super) fn plan_final_from_response_item(payload: &Value) -> Option<ImportedRuntimeEvent> {
    let arguments = parsed_arguments(payload)?;
    let plan = plan_steps(&arguments);
    if plan.is_empty() {
        return None;
    }
    let text = plan_markdown(&plan);
    Some(ImportedRuntimeEvent::new(
        "plan.final",
        compact_json(json!({
            "planId": call_id(payload),
            "toolCallId": call_id(payload),
            "toolName": "update_plan",
            "name": "update_plan",
            "status": "completed",
            "text": text,
            "explanation": string_field(&arguments, &["explanation"]),
            "plan": plan,
            "arguments": arguments,
            "sourceClient": "codex",
            "sourceEventType": payload.get("type").and_then(Value::as_str),
        })),
    ))
}

pub(super) fn completed_plan_event(item: &Value) -> Option<ImportedRuntimeEvent> {
    let item_id = string_field(item, &["id"])?;
    let text = string_field(item, &["text"])?;
    Some(ImportedRuntimeEvent::new(
        "plan.final",
        compact_json(json!({
            "itemId": item_id,
            "planId": item_id,
            "revisionId": item_id,
            "sourceItemId": item_id,
            "status": "completed",
            "text": text,
            "sourceClient": "codex",
            "sourceEventType": "item_completed",
        })),
    ))
}

fn plan_steps(arguments: &Value) -> Vec<Value> {
    arguments
        .get("plan")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let step = string_field(item, &["step"])?;
            let status = plan_step_status(item)?;
            Some(json!({
                "step": step,
                "status": status,
            }))
        })
        .collect()
}

fn plan_step_status(item: &Value) -> Option<&'static str> {
    match item.get("status").and_then(Value::as_str)?.trim() {
        "pending" => Some("pending"),
        "in_progress" | "in-progress" | "inProgress" => Some("in_progress"),
        "completed" => Some("completed"),
        _ => None,
    }
}

fn plan_markdown(plan: &[Value]) -> String {
    plan.iter()
        .filter_map(|item| {
            let step = item.get("step").and_then(Value::as_str)?.trim();
            if step.is_empty() {
                return None;
            }
            let status = item
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("pending");
            let marker = if status == "completed" { "[x]" } else { "[ ]" };
            Some(format!("- {marker} {step}"))
        })
        .collect::<Vec<_>>()
        .join("\n")
}
