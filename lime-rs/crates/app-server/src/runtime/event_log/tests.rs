use super::*;
use app_server_protocol::AgentEvent;
use serde_json::json;

fn event(sequence: u64) -> AgentEvent {
    AgentEvent {
        event_id: format!("evt-{sequence}"),
        sequence,
        session_id: "session-a".to_string(),
        thread_id: Some("thread-a".to_string()),
        turn_id: Some("turn-a".to_string()),
        event_type: "message.delta".to_string(),
        timestamp: "2026-06-14T00:00:00.000Z".to_string(),
        payload: json!({ "text": format!("hello-{sequence}") }),
    }
}

#[test]
fn append_and_read_session_events() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    let first = event(1);
    let second = event(2);

    let first_path = writer.append(&first).expect("first append");
    let second_path = writer.append(&second).expect("second append");

    assert!(first_path.ends_with("sessions/session_session-a.jsonl"));
    assert_eq!(first_path, second_path);

    let records = writer.read_session_events("session-a").expect("records");
    assert_eq!(records.len(), 2);
    assert_eq!(records[0].event.sequence, 1);
    assert_eq!(records[1].event.sequence, 2);
}

#[test]
fn append_events_groups_by_session_and_writes_all_events() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    let first = event(1);
    let mut second = event(2);
    second.session_id = "session-b".to_string();
    second.event_id = "evt-2".to_string();

    let paths = writer
        .append_events(&[first.clone(), second.clone()])
        .expect("append events");

    assert_eq!(paths.len(), 2);
    let first_records = writer.read_session_events("session-a").expect("session a");
    let second_records = writer.read_session_events("session-b").expect("session b");
    assert_eq!(first_records.len(), 1);
    assert_eq!(second_records.len(), 1);
    assert_eq!(first_records[0].event.sequence, first.sequence);
    assert_eq!(second_records[0].event.sequence, second.sequence);
}

#[test]
fn append_and_read_workflow_audit_events() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    let mut first = event(1);
    first.event_type = "workflow.run.started".to_string();
    let mut second = event(2);
    second.event_type = "workflow.step.completed".to_string();

    let path = writer
        .append_workflow_audit_events("session-a", &[first.clone(), second.clone()])
        .expect("append workflow audit events");

    assert!(path.ends_with("sessions/session_session-a/workflow-events.jsonl"));
    assert_eq!(
        writer
            .read_session_events("session-a")
            .expect("regular events")
            .len(),
        0
    );
    let records = writer
        .read_session_workflow_audit_events("session-a")
        .expect("workflow audit events");
    assert_eq!(records.len(), 2);
    assert_eq!(records[0].event.event_type, "workflow.run.started");
    assert_eq!(records[1].event.event_type, "workflow.step.completed");
}

#[test]
fn workflow_audit_events_are_metadata_only_redacted() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    let mut audit = event(1);
    audit.event_type = "workflow.connector.completed".to_string();
    audit.payload = json!({
        "workflowRunId": "task-1:workflow",
        "workflowKey": "content_article_workflow",
        "stepId": "research",
        "connectorRef": "web-research",
        "toolName": "WebSearch",
        "status": "completed",
        "prompt": "写一篇包含敏感素材的文章",
        "query": "secret launch plan",
        "result": {
            "summary": "raw search result",
            "url": "https://example.test/private"
        },
        "providerConfig": {
            "apiKey": "sk-live-secret"
        },
        "metadata": {
            "pluginWorkflow": {
                "eventSource": "worker_progress",
                "safeLabel": "research"
            },
            "note": "Bearer should-redact"
        }
    });

    writer
        .append_workflow_audit_events("session-a", &[audit])
        .expect("append workflow audit");

    let records = writer
        .read_session_workflow_audit_events("session-a")
        .expect("workflow audit events");
    assert_eq!(records.len(), 1);
    let payload = &records[0].event.payload;
    assert_eq!(payload["workflowRunId"], "task-1:workflow");
    assert_eq!(payload["workflowKey"], "content_article_workflow");
    assert_eq!(payload["stepId"], "research");
    assert_eq!(payload["connectorRef"], "web-research");
    assert_eq!(payload["toolName"], "WebSearch");
    assert_eq!(payload["status"], "completed");
    assert_eq!(
        payload["metadata"]["pluginWorkflow"]["eventSource"],
        "worker_progress"
    );
    assert_eq!(
        payload["metadata"]["pluginWorkflow"]["safeLabel"],
        "research"
    );
    assert_eq!(payload["prompt"]["redacted"], true);
    assert_eq!(payload["query"]["redacted"], true);
    assert_eq!(payload["result"]["redacted"], true);
    assert_eq!(payload["providerConfig"]["redacted"], true);
    assert_eq!(
        payload["metadata"]["note"],
        "[redacted:workflow_audit_metadata_only]"
    );
    assert_eq!(
        payload["redaction"]["policy"],
        "workflow_audit_metadata_only"
    );
    assert_eq!(payload["redaction"]["promptText"], false);
    assert_eq!(payload["redaction"]["providerPayload"], false);
    assert_eq!(payload["redaction"]["rawContent"], false);
}

#[test]
fn compact_workflow_audit_archives_old_jsonl_records_and_retains_recent_events() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    let events = (1..=5)
        .map(|sequence| {
            let mut event = event(sequence);
            event.event_type = "workflow.step.completed".to_string();
            event
        })
        .collect::<Vec<_>>();

    writer
        .append_workflow_audit_events("session-a", &events)
        .expect("append workflow audit");

    let report = writer
        .compact_session_workflow_audit_events("session-a", 2)
        .expect("compact workflow audit");

    assert_eq!(report.before_count, 5);
    assert_eq!(report.archived_count, 3);
    assert_eq!(report.retained_count, 2);
    let archive_path = report.archive_path.expect("archive path");
    assert!(archive_path.ends_with(
        "sessions/session_session-a/workflow-events.archive.00000000000000000001-00000000000000000003.jsonl"
    ));
    let archived_records = read_events_from_path(&archive_path).expect("archive records");
    assert_eq!(
        archived_records
            .iter()
            .map(|record| record.event.sequence)
            .collect::<Vec<_>>(),
        vec![1, 2, 3]
    );
    let active_records =
        read_events_from_path(&writer.workflow_audit_path("session-a")).expect("active");
    assert_eq!(
        active_records
            .iter()
            .map(|record| record.event.sequence)
            .collect::<Vec<_>>(),
        vec![4, 5]
    );
    let all_records = writer
        .read_session_workflow_audit_events("session-a")
        .expect("all records");
    assert_eq!(
        all_records
            .iter()
            .map(|record| record.event.sequence)
            .collect::<Vec<_>>(),
        vec![1, 2, 3, 4, 5]
    );
}

#[test]
fn compact_workflow_audit_rejects_zero_retention_without_mutating_log() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    writer
        .append_workflow_audit_events("session-a", &[event(1), event(2)])
        .expect("append workflow audit");

    let error = writer
        .compact_session_workflow_audit_events("session-a", 0)
        .expect_err("zero retention must fail closed");

    assert_eq!(
        error,
        "workflow audit compaction retain_recent must be greater than 0"
    );
    let active_records =
        read_events_from_path(&writer.workflow_audit_path("session-a")).expect("active");
    assert_eq!(
        active_records
            .iter()
            .map(|record| record.event.sequence)
            .collect::<Vec<_>>(),
        vec![1, 2]
    );
    let all_records = writer
        .read_session_workflow_audit_events("session-a")
        .expect("all records");
    assert_eq!(all_records.len(), 2);
}

#[test]
fn compact_workflow_audit_overwrites_existing_archive_without_duplicates() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    let events = (1..=5).map(event).collect::<Vec<_>>();
    writer
        .append_workflow_audit_events("session-a", &events)
        .expect("append workflow audit");

    let current_records =
        read_events_from_path(&writer.workflow_audit_path("session-a")).expect("active");
    let archive_path = writer.workflow_audit_archive_path("session-a", &current_records[..3]);
    write_events_to_path(
        &archive_path,
        &current_records[..3]
            .iter()
            .map(|record| &record.event)
            .collect::<Vec<_>>(),
    )
    .expect("preexisting archive");

    writer
        .compact_session_workflow_audit_events("session-a", 2)
        .expect("compact workflow audit");

    let archived_records = read_events_from_path(&archive_path).expect("archive records");
    assert_eq!(
        archived_records
            .iter()
            .map(|record| record.event.sequence)
            .collect::<Vec<_>>(),
        vec![1, 2, 3]
    );
    let all_records = writer
        .read_session_workflow_audit_events("session-a")
        .expect("all records");
    assert_eq!(
        all_records
            .iter()
            .map(|record| record.event.sequence)
            .collect::<Vec<_>>(),
        vec![1, 2, 3, 4, 5]
    );
}

#[test]
fn append_workflow_audit_events_auto_compacts_when_active_log_exceeds_threshold() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    let events = (1..=WORKFLOW_AUDIT_ACTIVE_COMPACT_AFTER_RECORDS as u64 + 1)
        .map(event)
        .collect::<Vec<_>>();

    writer
        .append_workflow_audit_events("session-a", &events)
        .expect("append workflow audit");

    let active_records =
        read_events_from_path(&writer.workflow_audit_path("session-a")).expect("active");
    assert_eq!(
        active_records.len(),
        WORKFLOW_AUDIT_ACTIVE_RETAIN_RECENT_RECORDS
    );
    assert_eq!(
        active_records.first().map(|record| record.event.sequence),
        Some(514)
    );
    let archives = writer
        .workflow_audit_archive_paths("session-a")
        .expect("archive paths");
    assert_eq!(archives.len(), 1);
    let all_records = writer
        .read_session_workflow_audit_events("session-a")
        .expect("all records");
    assert_eq!(
        all_records.len(),
        WORKFLOW_AUDIT_ACTIVE_COMPACT_AFTER_RECORDS + 1
    );
}

#[test]
fn clear_session_removes_session_event_log() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    writer.append(&event(1)).expect("append");
    writer
        .append_workflow_audit_events("session-a", &[event(2), event(3), event(4)])
        .expect("append workflow audit");
    writer
        .compact_session_workflow_audit_events("session-a", 1)
        .expect("compact workflow audit");

    writer.clear_session("session-a").expect("clear");

    let records = writer.read_session_events("session-a").expect("records");
    assert!(records.is_empty());
    let audit_records = writer
        .read_session_workflow_audit_events("session-a")
        .expect("audit records");
    assert!(audit_records.is_empty());
    writer.clear_session("session-a").expect("clear missing");
}
