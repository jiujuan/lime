use super::*;
use app_server_protocol::AgentEvent;
use serde_json::json;
use std::fs;
use std::io::Read;
use zip::ZipArchive;

fn traced_event(trace_id: &str, session_id: &str, sequence: u64) -> AgentEvent {
    AgentEvent {
        event_id: format!("evt-{sequence}"),
        sequence,
        session_id: session_id.to_string(),
        thread_id: Some("thread-a".to_string()),
        turn_id: Some("turn-a".to_string()),
        event_type: "message.delta".to_string(),
        timestamp: "2026-06-14T00:00:00.000Z".to_string(),
        payload: json!({
            "text": "secret assistant text",
            "trace_id": trace_id,
            "server_event_emitted_at": 1_780_000_000_000i64,
            "trace": {
                "schemaVersion": 1,
                "checkpoint": "app_server.message_delta.emitted",
                "traceId": trace_id,
                "runId": "run-a",
                "requestId": "request-a",
                "w3cTraceId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                "w3cTraceparent": "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01"
            }
        }),
    }
}

#[test]
fn trace_writer_persists_summary_only_events() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = TraceEventWriter::new(temp.path()).expect("writer");

    writer
        .append_agent_events(&[traced_event("trace-a", "session-a", 1)])
        .expect("append trace");
    writer
        .append_agent_events(&[traced_event("trace-a", "session-a", 2)])
        .expect("append trace again");

    let records = writer
        .read_raw_trace_events("session-a", "trace-a")
        .expect("records");
    assert_eq!(records.len(), 2);
    assert_eq!(records[0].event.seq, 1);
    assert_eq!(records[1].event.seq, 2);
    assert_eq!(records[0].event.trace_id, "trace-a");
    assert_eq!(
        records[0].event.checkpoint,
        "app_server.message_delta.emitted"
    );
    assert_eq!(records[0].event.metrics["text_chars"], json!(21));
    assert_eq!(
        records[0].event.metrics["w3c_trace_id"],
        json!("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    );
    assert_eq!(
        records[0].event.metrics["w3c_traceparent"],
        json!("00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01")
    );
    assert_eq!(records[0].event.redaction.mode, "summary_only");
    let raw = fs::read_to_string(&records[0].path).expect("trace file");
    assert!(!raw.contains("secret assistant text"));
    assert!(!raw.contains("\"text\""));

    let list = writer
        .list_trace_events(DiagnosticsTraceListParams {
            session_id: Some("session-a".to_string()),
            limit: None,
        })
        .expect("list traces");
    assert!(list.available);
    assert_eq!(list.trace_root, None);
    assert_eq!(list.traces.len(), 1);
    assert_eq!(list.traces[0].trace_id, "trace-a");
    assert_eq!(
        list.traces[0].path,
        "sessions/session_session-a/trace_trace-a.jsonl"
    );
    assert_eq!(list.traces[0].event_count, 2);
    assert!(!list.traces[0].path.starts_with('/'));

    let read = writer
        .read_trace_events(DiagnosticsTraceReadParams {
            session_id: "session-a".to_string(),
            trace_id: "trace-a".to_string(),
            max_events: Some(1),
        })
        .expect("read trace");
    assert!(read.available);
    assert_eq!(read.trace.expect("trace").event_count, 2);
    assert_eq!(read.events.len(), 1);
    assert_eq!(read.events[0].redaction.mode, "summary_only");
}

#[test]
fn trace_writer_clear_session_is_scoped_and_idempotent() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = TraceEventWriter::new(temp.path()).expect("writer");
    writer
        .append_agent_events(&[
            traced_event("trace-a", "session-a", 1),
            traced_event("trace-b", "session-b", 1),
        ])
        .expect("append traces");

    writer.clear_session("session-a").expect("clear session");
    writer
        .clear_session("session-a")
        .expect("clear missing session");

    assert!(writer
        .read_raw_trace_events("session-a", "trace-a")
        .expect("cleared trace")
        .is_empty());
    assert_eq!(
        writer
            .read_raw_trace_events("session-b", "trace-b")
            .expect("retained trace")
            .len(),
        1
    );
}

#[test]
fn trace_writer_exports_summary_only_zip() {
    let temp = tempfile::tempdir().expect("tempdir");
    let trace_root = temp.path().join("trace-store");
    let export_root = temp.path().join("exports");
    let writer = TraceEventWriter::new(&trace_root).expect("writer");

    writer
        .append_agent_events(&[traced_event("trace-a", "session-a", 1)])
        .expect("append trace");

    let response = writer
        .export_trace_events_to_directory(
            DiagnosticsTraceExportParams {
                session_id: "session-a".to_string(),
                trace_id: "trace-a".to_string(),
            },
            export_root.clone(),
        )
        .expect("export trace");

    assert!(response.available);
    assert!(response.exported);
    assert_eq!(
        response.output_directory,
        Some(export_root.to_string_lossy().to_string())
    );
    assert_eq!(
        response.included_sections,
        vec![
            "meta/manifest.json",
            "meta/trace-summary.json",
            "trace/events.jsonl",
            "README.txt"
        ]
    );
    assert!(response
        .omitted_sections
        .iter()
        .any(|section| section == "assistant delta text"));
    assert_eq!(response.redaction.mode, "summary_only");

    let bundle_path = response.bundle_path.expect("bundle path");
    assert!(std::path::Path::new(&bundle_path).is_file());
    let bundle = fs::File::open(&bundle_path).expect("open export zip");
    let mut archive = ZipArchive::new(bundle).expect("read export zip");
    let mut names = Vec::new();
    for index in 0..archive.len() {
        names.push(
            archive
                .by_index(index)
                .expect("zip entry")
                .name()
                .to_string(),
        );
    }
    assert_eq!(
        names,
        vec![
            "meta/manifest.json",
            "meta/trace-summary.json",
            "trace/events.jsonl",
            "README.txt"
        ]
    );

    let mut manifest = String::new();
    archive
        .by_name("meta/manifest.json")
        .expect("manifest")
        .read_to_string(&mut manifest)
        .expect("read manifest");
    assert!(manifest.contains("\"summaryOnlyTraceEventsIncluded\": true"));
    assert!(manifest.contains("\"prompt text\""));

    let mut events = String::new();
    archive
        .by_name("trace/events.jsonl")
        .expect("events")
        .read_to_string(&mut events)
        .expect("read events");
    assert!(events.contains("\"checkpoint\":\"app_server.message_delta.emitted\""));
    assert!(events.contains("\"text_chars\":21"));
    assert!(!events.contains("secret assistant text"));
    assert!(!events.contains("\"text\""));
}

#[test]
fn trace_writer_does_not_export_missing_trace() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = TraceEventWriter::new(temp.path().join("trace-store")).expect("writer");

    let response = writer
        .export_trace_events_to_directory(
            DiagnosticsTraceExportParams {
                session_id: "session-a".to_string(),
                trace_id: "missing".to_string(),
            },
            temp.path().join("exports"),
        )
        .expect("export missing trace");

    assert!(response.available);
    assert!(!response.exported);
    assert_eq!(response.trace, None);
    assert_eq!(response.bundle_path, None);
    assert_eq!(response.output_directory, None);
    assert_eq!(response.generated_at, None);
    assert!(response.included_sections.is_empty());
    assert!(response
        .omitted_sections
        .iter()
        .any(|section| section == "unparsed raw JSONL bytes"));
}

#[test]
fn trace_writer_keeps_recent_trace_files_per_session() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = TraceEventWriter::new(temp.path()).expect("writer");

    for index in 0..(TRACE_EVENT_MAX_FILES_PER_SESSION + 2) {
        writer
            .append_agent_events(&[traced_event(
                &format!("trace-{index:03}"),
                "session-a",
                index as u64 + 1,
            )])
            .expect("append trace");
    }

    assert!(writer
        .read_raw_trace_events("session-a", "trace-000")
        .expect("old trace")
        .is_empty());
    assert!(
        writer
            .read_trace_events(DiagnosticsTraceReadParams {
                session_id: "session-a".to_string(),
                trace_id: format!("trace-{:03}", TRACE_EVENT_MAX_FILES_PER_SESSION + 1),
                max_events: None,
            })
            .expect("new trace")
            .events
            .len()
            == 1
    );
}
