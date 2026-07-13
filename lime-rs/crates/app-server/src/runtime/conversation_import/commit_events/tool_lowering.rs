use super::super::codex::events::{ImportedRuntimeEvent, ImportedToolDraft, ImportedToolPhase};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

pub(in crate::runtime::conversation_import) fn lower_imported_runtime_events_for_commit(
    events: &[ImportedRuntimeEvent],
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
) -> Vec<ImportedRuntimeEvent> {
    let mut lowered = Vec::with_capacity(events.len());
    let mut active_tools = BTreeMap::<String, ImportedToolDraft>::new();

    for (index, event) in events.iter().enumerate() {
        let Some(tool) = event.tool_draft() else {
            lowered.push(event.clone());
            continue;
        };
        let ordinal = source_event_ordinal(tool).unwrap_or(index as u64 + 1);
        let call_id = tool
            .call_id
            .as_deref()
            .expect("normalized imported tool draft must have call id");
        if tool.phase == ImportedToolPhase::Started {
            active_tools.insert(call_id.to_string(), tool.clone());
            lowered.push(lowered_tool_item_event(
                "item.started",
                session_id,
                thread_id,
                turn_id,
                call_id,
                ordinal,
                tool,
                None,
            ));
            continue;
        }

        let start = active_tools.remove(call_id).unwrap_or_else(|| tool.clone());
        if !events_before_contains_tool_start(&lowered, call_id) {
            let start_ordinal = source_event_ordinal(&start).unwrap_or(ordinal);
            lowered.push(lowered_tool_item_event(
                "item.started",
                session_id,
                thread_id,
                turn_id,
                call_id,
                start_ordinal,
                &start,
                None,
            ));
        }
        lowered.push(lowered_tool_item_event(
            "item.completed",
            session_id,
            thread_id,
            turn_id,
            call_id,
            ordinal,
            &start,
            Some(tool),
        ));
    }

    lowered
}

fn events_before_contains_tool_start(events: &[ImportedRuntimeEvent], call_id: &str) -> bool {
    events.iter().any(|event| {
        event.event_type() == "item.started"
            && event
                .payload()
                .and_then(|payload| payload.get("item"))
                .and_then(|item| item.get("payload"))
                .and_then(|payload| payload.get("call_id"))
                .and_then(Value::as_str)
                == Some(call_id)
    })
}

fn lowered_tool_item_event(
    event_type: &'static str,
    session_id: &str,
    thread_id: &str,
    turn_id: &str,
    call_id: &str,
    ordinal: u64,
    start: &ImportedToolDraft,
    terminal: Option<&ImportedToolDraft>,
) -> ImportedRuntimeEvent {
    let source = terminal.unwrap_or(start);
    let failed = terminal.is_some_and(|tool| tool.phase == ImportedToolPhase::Failed);
    let tool_name = start
        .name
        .clone()
        .or_else(|| source.name.clone())
        .unwrap_or_else(|| "unknown_tool".to_string());
    let arguments = arguments_array(start.arguments.as_ref().or(source.arguments.as_ref()));
    let metadata = tool_metadata(start, terminal);
    let output = terminal.map(|tool| tool_output(tool, failed));
    let status = if terminal.is_some() {
        if failed {
            "failed"
        } else {
            "completed"
        }
    } else {
        "inProgress"
    };
    let item = json!({
        "sessionId": session_id,
        "threadId": thread_id,
        "turnId": turn_id,
        "itemId": format!("imported-tool-{call_id}"),
        "sequence": 0,
        "ordinal": ordinal,
        "createdAtMs": 0,
        "updatedAtMs": 0,
        "completedAtMs": terminal.map(|_| 0),
        "kind": "tool",
        "status": status,
        "payload": {
            "type": "tool",
            "call_id": call_id,
            "name": tool_name,
            "arguments": arguments,
            "output": output,
        },
        "metadata": metadata,
    });
    let mut payload = Map::new();
    payload.insert("item".to_string(), item);
    copy_outer_tool_metadata(&mut payload, start, terminal);
    ImportedRuntimeEvent::new(event_type, Value::Object(payload))
}

fn arguments_array(arguments: Option<&Value>) -> Value {
    let Some(arguments) = arguments else {
        return Value::Array(Vec::new());
    };
    match arguments {
        Value::Object(object) => Value::Array(
            object
                .iter()
                .map(|(name, value)| json!({ "name": name, "value": value_to_argument_string(value) }))
                .collect(),
        ),
        Value::Array(values) => Value::Array(
            values
                .iter()
                .enumerate()
                .map(|(index, value)| {
                    if value.get("name").and_then(Value::as_str).is_some() && value.get("value").is_some() {
                        value.clone()
                    } else {
                        json!({ "name": index.to_string(), "value": value_to_argument_string(value) })
                    }
                })
                .collect(),
        ),
        value => json!([{ "name": "value", "value": value_to_argument_string(value) }]),
    }
}

fn value_to_argument_string(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

fn tool_output(tool: &ImportedToolDraft, failed: bool) -> Value {
    let raw_output = tool.output.clone();
    let output_object = raw_output.as_ref().and_then(Value::as_object);
    let text = output_object
        .and_then(|object| object.get("text").and_then(Value::as_str))
        .map(str::to_string)
        .or_else(|| {
            raw_output
                .as_ref()
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| tool.source.output_preview.clone());
    let structured_content = tool.source.structured_content.clone().or_else(|| {
        output_object
            .and_then(|object| object.get("structuredContent"))
            .cloned()
    });
    let error = tool.source.error.clone().or_else(|| {
        output_object.and_then(|object| {
            ["error", "message"]
                .iter()
                .find_map(|key| object.get(*key).and_then(Value::as_str))
                .map(str::to_string)
        })
    });
    let duration_ms = tool.source.duration_ms;
    let truncated = tool.source.truncated;
    let output_ref = tool.source.output_ref.clone();
    let mut output = Map::new();
    if let Some(text) = text {
        output.insert("text".to_string(), Value::String(text));
    }
    if let Some(structured_content) = structured_content {
        output.insert("structuredContent".to_string(), structured_content);
    } else if let Some(raw_output) = raw_output.filter(|value| !value.is_string()) {
        output.insert("structuredContent".to_string(), raw_output);
    }
    if let Some(error) = error {
        output.insert("error".to_string(), Value::String(error));
    }
    if let Some(duration_ms) = duration_ms {
        output.insert("durationMs".to_string(), json!(duration_ms));
    }
    if truncated {
        output.insert("truncated".to_string(), Value::Bool(true));
    }
    if let Some(output_ref) = output_ref {
        output.insert("outputRef".to_string(), Value::String(output_ref));
    }
    if failed && !output.contains_key("error") {
        if let Some(failure) = tool.source.failure_category.clone() {
            output.insert("error".to_string(), Value::String(failure));
        }
    }
    Value::Object(output)
}

fn tool_metadata(start: &ImportedToolDraft, terminal: Option<&ImportedToolDraft>) -> Value {
    let mut metadata = Map::new();
    merge_tool_metadata(&mut metadata, start);
    if let Some(terminal) = terminal {
        if let Some(provenance) = start.source.source_provenance.as_ref() {
            metadata.insert("start_source_provenance".to_string(), provenance.clone());
        }
        merge_tool_metadata(&mut metadata, terminal);
        if let Some(provenance) = terminal.source.source_provenance.as_ref() {
            metadata.insert("terminal_source_provenance".to_string(), provenance.clone());
        }
    }
    Value::Object(metadata)
}

fn merge_tool_metadata(metadata: &mut Map<String, Value>, tool: &ImportedToolDraft) {
    insert_true(metadata, "imported", tool.source.imported);
    insert_optional_string(
        metadata,
        "source_client",
        tool.source.source_client.as_ref(),
    );
    insert_optional_value(
        metadata,
        "source_provenance",
        tool.source.source_provenance.as_ref(),
    );
    insert_optional_string(
        metadata,
        "source_event_type",
        tool.source.source_event_type.as_ref(),
    );
    if let Some(sequence) = source_event_ordinal(tool) {
        metadata.insert("source_event_seq".to_string(), json!(sequence));
    }
    insert_true(metadata, "imported_synthetic", tool.source.synthetic);
    insert_true(metadata, "imported_incomplete", tool.source.incomplete);
    insert_true(metadata, "imported_synthetic_id", tool.source.synthetic_id);
    insert_optional_string(
        metadata,
        "failure_category",
        tool.source.failure_category.as_ref(),
    );
    insert_optional_value(metadata, "action", tool.source.action.as_ref());
    insert_optional_string(metadata, "query", tool.source.query.as_ref());
    if let Some(success) = tool.source.success {
        metadata.insert("success".to_string(), Value::Bool(success));
    }
    if !tool.source.ref_ids.is_empty() {
        metadata.insert("ref_ids".to_string(), json!(tool.source.ref_ids));
    }
    if let Some(output_bytes) = tool.source.output_bytes {
        metadata.insert("output_bytes".to_string(), json!(output_bytes));
    }
}

fn copy_outer_tool_metadata(
    payload: &mut Map<String, Value>,
    start: &ImportedToolDraft,
    terminal: Option<&ImportedToolDraft>,
) {
    let source = terminal.unwrap_or(start);
    insert_true(payload, "imported", source.source.imported);
    insert_optional_string(
        payload,
        "sourceClient",
        source.source.source_client.as_ref(),
    );
    insert_optional_value(
        payload,
        "sourceProvenance",
        source.source.source_provenance.as_ref(),
    );
    insert_optional_string(
        payload,
        "sourceEventType",
        source.source.source_event_type.as_ref(),
    );
    if let Some(sequence) = source_event_ordinal(source) {
        payload.insert("sourceEventSeq".to_string(), json!(sequence));
    }
    insert_true(payload, "importedSynthetic", source.source.synthetic);
    insert_true(payload, "importedIncomplete", source.source.incomplete);
    insert_true(payload, "importedSyntheticId", source.source.synthetic_id);
    insert_optional_string(
        payload,
        "failureCategory",
        source.source.failure_category.as_ref(),
    );
    insert_optional_value(payload, "action", source.source.action.as_ref());
    insert_optional_string(payload, "query", source.source.query.as_ref());
    if let Some(success) = source.source.success {
        payload.insert("success".to_string(), Value::Bool(success));
    }
    if !source.source.ref_ids.is_empty() {
        payload.insert("refIds".to_string(), json!(source.source.ref_ids));
    }
    if let Some(output_bytes) = source.source.output_bytes {
        payload.insert("outputBytes".to_string(), json!(output_bytes));
    }
    if let Some(start_provenance) = start.source.source_provenance.as_ref() {
        payload.insert(
            "startSourceProvenance".to_string(),
            start_provenance.clone(),
        );
    }
}

fn source_event_ordinal(tool: &ImportedToolDraft) -> Option<u64> {
    tool.source
        .source_provenance
        .as_ref()
        .and_then(|provenance| provenance.get("sourceEventSeq"))
        .and_then(|value| value.as_u64().or_else(|| value.as_str()?.parse().ok()))
}

fn insert_true(target: &mut Map<String, Value>, key: &str, value: bool) {
    if value {
        target.insert(key.to_string(), Value::Bool(true));
    }
}

fn insert_optional_string(target: &mut Map<String, Value>, key: &str, value: Option<&String>) {
    if let Some(value) = value {
        target.insert(key.to_string(), Value::String(value.clone()));
    }
}

fn insert_optional_value(target: &mut Map<String, Value>, key: &str, value: Option<&Value>) {
    if let Some(value) = value {
        target.insert(key.to_string(), value.clone());
    }
}
