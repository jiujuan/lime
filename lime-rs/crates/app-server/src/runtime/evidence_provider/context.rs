use app_server_protocol::AgentEvent;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

#[derive(Debug, Default)]
struct ContextEvidenceSummary {
    packet_count: usize,
    admitted_count: usize,
    rejected_count: usize,
    total_tokens: u64,
    fragment_count: usize,
    model_preview_redacted_count: usize,
    sidecar_references: Vec<ContextSidecarRefSummary>,
    budget_status_counts: BTreeMap<String, usize>,
    source_counts: BTreeMap<String, ContextSourceSummary>,
    source_turn_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ContextSidecarRefSummary {
    kind: String,
    uri: String,
    sha256_present: bool,
}

#[derive(Debug, Default)]
struct ContextSourceSummary {
    kind: String,
    label: Option<String>,
    count: usize,
}

pub(super) fn context_evidence_summary(
    turn_runtime_metadata: &BTreeMap<String, Value>,
    events: &[AgentEvent],
) -> Value {
    let mut summary = ContextEvidenceSummary::default();
    for (turn_id, metadata) in turn_runtime_metadata {
        collect_context_telemetry_from_value(&mut summary, Some(turn_id.as_str()), metadata);
    }
    for event in events {
        collect_context_telemetry_from_value(
            &mut summary,
            event.turn_id.as_deref(),
            &event.payload,
        );
    }

    json!({
        "schemaVersion": "context-evidence-summary.v1",
        "packetCount": summary.packet_count,
        "admittedCount": summary.admitted_count,
        "rejectedCount": summary.rejected_count,
        "totalTokens": summary.total_tokens,
        "fragmentCount": summary.fragment_count,
        "modelPreviewRedactedCount": summary.model_preview_redacted_count,
        "sidecarReferenceCount": summary.sidecar_references.len(),
        "sidecarReferences": sidecar_references_json(&summary.sidecar_references),
        "budgetStatusBreakdown": map_counts_json(summary.budget_status_counts),
        "sources": sources_json(summary.source_counts),
        "sourceTurnIds": summary.source_turn_ids,
    })
}

fn collect_context_telemetry_from_value(
    summary: &mut ContextEvidenceSummary,
    turn_id: Option<&str>,
    value: &Value,
) {
    if let Some(telemetry) = context_telemetry_value(value) {
        collect_context_assembly(summary, turn_id, telemetry);
        return;
    }
    if let Some(metadata) = value.get("metadata") {
        if let Some(telemetry) = context_telemetry_value(metadata) {
            collect_context_assembly(summary, turn_id, telemetry);
            return;
        }
    }
    for key in [
        "memory_store_prompt_context",
        "session_compaction_prompt_context",
        "memory_soul_prompt_context",
    ] {
        if let Some(telemetry) = value.get(key).and_then(context_telemetry_value) {
            collect_context_assembly(summary, turn_id, telemetry);
        }
    }
}

fn context_telemetry_value(value: &Value) -> Option<&Value> {
    value
        .get("context_packet_telemetry")
        .or_else(|| value.get("contextPacketTelemetry"))
}

fn collect_context_assembly(
    summary: &mut ContextEvidenceSummary,
    turn_id: Option<&str>,
    telemetry: &Value,
) {
    let Some(packets) = telemetry.get("packets").and_then(Value::as_array) else {
        return;
    };
    push_turn_id(summary, turn_id);
    for packet in packets {
        collect_context_packet(summary, packet);
    }
}

fn collect_context_packet(summary: &mut ContextEvidenceSummary, packet: &Value) {
    summary.packet_count += 1;
    if packet.get("admitted").and_then(Value::as_bool) == Some(true) {
        summary.admitted_count += 1;
    } else if packet.get("admitted").and_then(Value::as_bool) == Some(false) {
        summary.rejected_count += 1;
    }
    summary.total_tokens = summary.total_tokens.saturating_add(
        packet
            .get("actualTokens")
            .or_else(|| packet.get("actual_tokens"))
            .and_then(Value::as_u64)
            .unwrap_or(0),
    );

    let envelope = packet
        .get("fragmentEnvelope")
        .or_else(|| packet.get("fragment_envelope"));
    if let Some(envelope) = envelope.and_then(Value::as_object) {
        collect_fragment_envelope(summary, packet, envelope);
    } else {
        collect_packet_source(summary, packet, None);
    }
}

fn collect_fragment_envelope(
    summary: &mut ContextEvidenceSummary,
    packet: &Value,
    envelope: &Map<String, Value>,
) {
    summary.fragment_count += 1;
    if non_empty_string_field(envelope, &["model_visible_preview", "modelVisiblePreview"]).is_some()
    {
        summary.model_preview_redacted_count += 1;
    }
    collect_packet_source(summary, packet, envelope.get("source"));
    if let Some(status) = envelope
        .get("budget_decision")
        .or_else(|| envelope.get("budgetDecision"))
        .and_then(|decision| string_field(decision, &["status"]))
    {
        *summary.budget_status_counts.entry(status).or_default() += 1;
    }
    if let Some(sidecar_ref) = envelope
        .get("sidecar_reference")
        .or_else(|| envelope.get("sidecarReference"))
        .and_then(Value::as_object)
    {
        collect_sidecar_reference(summary, sidecar_ref);
    }
}

fn collect_packet_source(
    summary: &mut ContextEvidenceSummary,
    packet: &Value,
    envelope_source: Option<&Value>,
) {
    let kind = envelope_source
        .and_then(|source| string_field(source, &["kind"]))
        .or_else(|| string_field(packet, &["source"]))
        .unwrap_or_else(|| "unknown".to_string());
    let label = envelope_source
        .and_then(|source| string_field(source, &["label"]))
        .or_else(|| string_field(packet, &["kind"]));
    let key = format!("{}::{}", kind, label.as_deref().unwrap_or(""));
    let source = summary
        .source_counts
        .entry(key)
        .or_insert_with(|| ContextSourceSummary {
            kind,
            label,
            count: 0,
        });
    source.count += 1;
}

fn collect_sidecar_reference(
    summary: &mut ContextEvidenceSummary,
    sidecar_ref: &Map<String, Value>,
) {
    let Some(uri) = non_empty_string_field(
        sidecar_ref,
        &["uri", "ref", "relativePath", "relative_path"],
    ) else {
        return;
    };
    let kind = non_empty_string_field(sidecar_ref, &["kind"])
        .unwrap_or_else(|| "context_sidecar".to_string());
    let item = ContextSidecarRefSummary {
        kind,
        uri,
        sha256_present: non_empty_string_field(sidecar_ref, &["sha256"]).is_some(),
    };
    if !summary
        .sidecar_references
        .iter()
        .any(|existing| existing == &item)
    {
        summary.sidecar_references.push(item);
    }
}

fn push_turn_id(summary: &mut ContextEvidenceSummary, turn_id: Option<&str>) {
    let Some(turn_id) = turn_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    if !summary
        .source_turn_ids
        .iter()
        .any(|existing| existing == turn_id)
    {
        summary.source_turn_ids.push(turn_id.to_string());
    }
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    value
        .as_object()
        .and_then(|object| non_empty_string_field(object, keys))
}

fn non_empty_string_field(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn sidecar_references_json(sidecar_refs: &[ContextSidecarRefSummary]) -> Vec<Value> {
    sidecar_refs
        .iter()
        .map(|item| {
            json!({
                "kind": item.kind,
                "uri": item.uri,
                "sha256Present": item.sha256_present,
            })
        })
        .collect()
}

fn map_counts_json(counts: BTreeMap<String, usize>) -> Value {
    let mut object = Map::new();
    for (key, count) in counts {
        object.insert(key, json!(count));
    }
    Value::Object(object)
}

fn sources_json(sources: BTreeMap<String, ContextSourceSummary>) -> Vec<Value> {
    sources
        .into_values()
        .map(|source| {
            json!({
                "kind": source.kind,
                "label": source.label,
                "count": source.count,
            })
        })
        .collect()
}
