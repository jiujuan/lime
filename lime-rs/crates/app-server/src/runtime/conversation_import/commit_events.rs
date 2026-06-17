use super::codex::events::ImportedRuntimeEvent;
use serde_json::{json, Value};
use std::collections::BTreeSet;

const MAX_IMPORTED_COMMAND_TOOL_CALLS_PER_THREAD: usize = 80;
const MAX_IMPORTED_OTHER_TOOL_CALLS_PER_THREAD: usize = 40;

pub(super) trait ImportedRuntimeEventTurn {
    fn runtime_events(&self) -> &[ImportedRuntimeEvent];
    fn runtime_events_mut(&mut self) -> &mut Vec<ImportedRuntimeEvent>;
}

#[derive(Default)]
pub(super) struct ImportRuntimeEventBudget {
    pub(super) retained_command_tool_calls: usize,
    pub(super) retained_other_tool_calls: usize,
    pub(super) dropped_events: usize,
}

pub(super) fn apply_runtime_event_budget<T: ImportedRuntimeEventTurn>(
    turns: &mut [T],
) -> ImportRuntimeEventBudget {
    let mut retained_command_ids = BTreeSet::new();
    for turn in turns.iter() {
        for event in turn.runtime_events() {
            if event.event_type != "command.started" {
                continue;
            }
            if retained_command_ids.len() >= MAX_IMPORTED_COMMAND_TOOL_CALLS_PER_THREAD {
                continue;
            }
            if let Some(command_id) = string_payload(&event.payload, &["commandId", "command_id"]) {
                retained_command_ids.insert(command_id);
            }
        }
    }

    let mut retained_other_tool_ids = BTreeSet::new();
    for turn in turns.iter() {
        for event in turn.runtime_events() {
            if !event.event_type.starts_with("tool.") {
                continue;
            }
            if retained_other_tool_ids.len() >= MAX_IMPORTED_OTHER_TOOL_CALLS_PER_THREAD {
                continue;
            }
            let Some(tool_call_id) =
                string_payload(&event.payload, &["toolCallId", "tool_call_id"])
            else {
                continue;
            };
            if retained_command_ids.contains(&tool_call_id) {
                continue;
            }
            retained_other_tool_ids.insert(tool_call_id);
        }
    }

    let mut budget = ImportRuntimeEventBudget {
        retained_command_tool_calls: retained_command_ids.len(),
        retained_other_tool_calls: retained_other_tool_ids.len(),
        dropped_events: 0,
    };

    for turn in turns.iter_mut() {
        let before = turn.runtime_events().len();
        turn.runtime_events_mut().retain(|event| {
            should_keep_imported_runtime_event(
                event,
                &retained_command_ids,
                &retained_other_tool_ids,
            )
        });
        budget.dropped_events += before.saturating_sub(turn.runtime_events().len());
    }

    budget
}

pub(super) fn normalize_imported_runtime_events(
    runtime_events: Vec<ImportedRuntimeEvent>,
) -> (Vec<ImportedRuntimeEvent>, bool) {
    let mut normalized = Vec::new();
    let mut active_tools = BTreeSet::new();
    let mut active_patches = BTreeSet::new();
    let mut active_actions = BTreeSet::new();
    let mut active_commands = BTreeSet::new();
    let mut has_terminal_event = false;

    for event in runtime_events {
        match event.event_type {
            "tool.started" => {
                if let Some(tool_call_id) = string_payload(&event.payload, &["toolCallId"]) {
                    active_tools.insert(tool_call_id);
                }
                normalized.push(event);
            }
            "tool.result" | "tool.failed" => {
                let tool_call_id = string_payload(&event.payload, &["toolCallId"]);
                if let Some(tool_call_id) = tool_call_id.as_deref() {
                    if !active_tools.remove(tool_call_id) {
                        normalized.push(imported_tool_start_from_terminal(tool_call_id, &event));
                    }
                    if active_commands.remove(tool_call_id) {
                        normalized.push(imported_command_output_from_tool_terminal(
                            tool_call_id,
                            &event,
                        ));
                        normalized.push(imported_command_exited_from_tool_terminal(
                            tool_call_id,
                            &event,
                        ));
                    }
                }
                normalized.push(event);
            }
            "patch.started" => {
                if let Some(patch_id) = string_payload(&event.payload, &["patchId", "patch_id"]) {
                    active_patches.insert(patch_id);
                }
                normalized.push(event);
            }
            "patch.applied" | "patch.failed" => {
                let patch_id = string_payload(&event.payload, &["patchId", "patch_id"]);
                if let Some(patch_id) = patch_id.as_deref() {
                    if !active_patches.remove(patch_id) {
                        normalized.push(imported_patch_start_from_terminal(patch_id, &event));
                    }
                }
                normalized.push(event);
            }
            "command.started" => {
                if let Some(command_id) = string_payload(&event.payload, &["commandId"]) {
                    active_commands.insert(command_id);
                }
                normalized.push(event);
            }
            "command.output" => normalized.push(event),
            "command.exited" => {
                if let Some(command_id) = string_payload(&event.payload, &["commandId"]) {
                    active_commands.remove(&command_id);
                }
                normalized.push(event);
            }
            "action.required" => {
                let action_id =
                    string_payload(&event.payload, &["actionId", "action_id", "requestId"]);
                if let Some(action_id) = action_id.as_deref() {
                    active_actions.insert(action_id.to_string());
                }
                normalized.push(event);
                if let Some(action_id) = action_id {
                    normalized.push(imported_action_resolved(&action_id));
                    active_actions.remove(&action_id);
                }
            }
            "action.resolved" | "action.cancelled" | "action.canceled" | "action.expired" => {
                if let Some(action_id) =
                    string_payload(&event.payload, &["actionId", "action_id", "requestId"])
                {
                    active_actions.remove(&action_id);
                }
                normalized.push(event);
            }
            "turn.completed" | "turn.failed" | "turn.canceled" => {
                close_active_imported_lifecycles(
                    &mut normalized,
                    &mut active_actions,
                    &mut active_commands,
                    &mut active_patches,
                    &mut active_tools,
                );
                normalized.push(event);
                has_terminal_event = true;
            }
            _ => normalized.push(event),
        }
    }

    close_active_imported_lifecycles(
        &mut normalized,
        &mut active_actions,
        &mut active_commands,
        &mut active_patches,
        &mut active_tools,
    );
    (normalized, has_terminal_event)
}

pub(super) fn enrich_imported_runtime_event_payload(mut payload: Value) -> Value {
    if let Value::Object(ref mut object) = payload {
        object
            .entry("imported".to_string())
            .or_insert_with(|| json!(true));
        object
            .entry("sourceClient".to_string())
            .or_insert_with(|| json!("codex"));
    }
    payload
}

fn should_keep_imported_runtime_event(
    event: &ImportedRuntimeEvent,
    retained_command_ids: &BTreeSet<String>,
    retained_other_tool_ids: &BTreeSet<String>,
) -> bool {
    match event.event_type {
        "command.started" | "command.output" | "command.exited" => {
            string_payload(&event.payload, &["commandId", "command_id"])
                .is_some_and(|command_id| retained_command_ids.contains(&command_id))
        }
        value if value.starts_with("tool.") => {
            string_payload(&event.payload, &["toolCallId", "tool_call_id"]).is_some_and(
                |tool_call_id| {
                    retained_command_ids.contains(&tool_call_id)
                        || retained_other_tool_ids.contains(&tool_call_id)
                },
            )
        }
        _ => true,
    }
}

fn close_active_imported_lifecycles(
    normalized: &mut Vec<ImportedRuntimeEvent>,
    active_actions: &mut BTreeSet<String>,
    active_commands: &mut BTreeSet<String>,
    active_patches: &mut BTreeSet<String>,
    active_tools: &mut BTreeSet<String>,
) {
    let actions = std::mem::take(active_actions);
    for action_id in actions {
        normalized.push(imported_action_resolved(&action_id));
    }
    let commands = std::mem::take(active_commands);
    for command_id in commands {
        normalized.push(ImportedRuntimeEvent::new(
            "command.exited",
            json!({
                "commandId": command_id,
                "exitCode": 1,
                "result": "failed",
                "failureCategory": "incomplete_import",
                "sourceClient": "codex",
                "sourceEventType": "synthetic_command_exited",
                "importedSynthetic": true,
            }),
        ));
    }
    let patches = std::mem::take(active_patches);
    for patch_id in patches {
        normalized.push(ImportedRuntimeEvent::new(
            "patch.failed",
            json!({
                "patchId": patch_id,
                "status": "failed",
                "success": false,
                "failureCategory": "incomplete_import",
                "sourceClient": "codex",
                "sourceEventType": "synthetic_patch_failed",
                "importedSynthetic": true,
            }),
        ));
    }
    let tools = std::mem::take(active_tools);
    for tool_call_id in tools {
        normalized.push(ImportedRuntimeEvent::new(
            "tool.failed",
            json!({
                "toolCallId": tool_call_id,
                "status": "failed",
                "success": false,
                "failureCategory": "incomplete_import",
                "sourceClient": "codex",
                "sourceEventType": "synthetic_tool_failed",
                "importedSynthetic": true,
            }),
        ));
    }
}

fn imported_tool_start_from_terminal(
    tool_call_id: &str,
    terminal: &ImportedRuntimeEvent,
) -> ImportedRuntimeEvent {
    ImportedRuntimeEvent::new(
        "tool.started",
        json!({
            "toolCallId": tool_call_id,
            "toolName": string_payload(&terminal.payload, &["toolName", "tool_name", "name"]),
            "name": string_payload(&terminal.payload, &["name", "toolName", "tool_name"]),
            "sourceClient": "codex",
            "sourceEventType": "synthetic_tool_started",
            "importedSynthetic": true,
        }),
    )
}

fn imported_patch_start_from_terminal(
    patch_id: &str,
    terminal: &ImportedRuntimeEvent,
) -> ImportedRuntimeEvent {
    ImportedRuntimeEvent::new(
        "patch.started",
        json!({
            "patchId": patch_id,
            "toolCallId": string_payload(&terminal.payload, &["toolCallId", "tool_call_id"]),
            "paths": terminal.payload.get("paths").cloned(),
            "changedFiles": terminal.payload.get("changedFiles").cloned(),
            "sourceClient": "codex",
            "sourceEventType": "synthetic_patch_started",
            "importedSynthetic": true,
        }),
    )
}

fn imported_command_output_from_tool_terminal(
    command_id: &str,
    terminal: &ImportedRuntimeEvent,
) -> ImportedRuntimeEvent {
    ImportedRuntimeEvent::new(
        "command.output",
        json!({
            "commandId": command_id,
            "toolCallId": command_id,
            "outputRef": format!("output://codex-import/{command_id}"),
            "refIds": [format!("output://codex-import/{command_id}")],
            "outputPreview": string_payload(&terminal.payload, &["outputPreview", "output_preview", "output"]),
            "summary": string_payload(&terminal.payload, &["outputPreview", "output_preview", "output"]),
            "sourceClient": "codex",
            "sourceEventType": "synthetic_command_output",
            "importedSynthetic": true,
        }),
    )
}

fn imported_command_exited_from_tool_terminal(
    command_id: &str,
    terminal: &ImportedRuntimeEvent,
) -> ImportedRuntimeEvent {
    let output = string_payload(&terminal.payload, &["output"]).unwrap_or_default();
    let exit_code = parse_exit_code(&output).unwrap_or_else(|| {
        if terminal.event_type == "tool.failed" {
            1
        } else {
            0
        }
    });
    ImportedRuntimeEvent::new(
        "command.exited",
        json!({
            "commandId": command_id,
            "toolCallId": command_id,
            "exitCode": exit_code,
            "result": if exit_code == 0 { "passed" } else { "failed" },
            "sourceClient": "codex",
            "sourceEventType": "synthetic_command_exited",
            "importedSynthetic": true,
        }),
    )
}

fn imported_action_resolved(action_id: &str) -> ImportedRuntimeEvent {
    ImportedRuntimeEvent::new(
        "action.resolved",
        json!({
            "actionId": action_id,
            "requestId": action_id,
            "actionType": "tool_confirmation",
            "decision": "imported_read_only",
            "sourceClient": "codex",
            "sourceEventType": "synthetic_action_resolved",
            "importedSynthetic": true,
            "importedReadOnly": true,
        }),
    )
}

fn string_payload(payload: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| payload.get(*key).and_then(Value::as_str))
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
}

fn parse_exit_code(output: &str) -> Option<i64> {
    output.lines().find_map(|line| {
        line.strip_prefix("Exit code:")
            .and_then(|value| value.trim().parse::<i64>().ok())
    })
}
