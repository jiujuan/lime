use super::*;
use app_server_protocol::AgentEvent;
use serde_json::json;
use std::io::Write;

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
fn lists_exact_session_ids_from_durable_events() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    let first = event(1);
    let mut second = event(1);
    second.event_id = "evt-unsafe-session".to_string();
    second.session_id = "session/unsafe".to_string();

    writer.append(&first).expect("first append");
    writer.append(&second).expect("second append");
    std::fs::write(temp.path().join("sessions/session_empty.jsonl"), b"\n").expect("empty log");
    std::fs::create_dir_all(temp.path().join("sessions/session_audit-only"))
        .expect("workflow audit directory");

    assert_eq!(
        writer.list_session_ids().expect("list session ids"),
        vec!["session-a".to_string(), "session/unsafe".to_string()]
    );
}

#[test]
fn discovers_only_sessions_with_unresolved_durable_queued_turns() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");

    let mut queued = event(1);
    queued.event_type = "queue.added".to_string();
    queued.turn_id = Some("queued-a".to_string());
    writer.append(&queued).expect("queued session");

    let mut removed = event(1);
    removed.session_id = "session-b".to_string();
    removed.event_id = "evt-session-b-queued".to_string();
    removed.event_type = "queue.added".to_string();
    removed.turn_id = Some("queued-b".to_string());
    let mut removal = removed.clone();
    removal.event_id = "evt-session-b-removed".to_string();
    removal.sequence = 2;
    removal.event_type = "queue.removed".to_string();
    removal.turn_id = None;
    removal.payload = json!({ "queuedTurnId": "queued-b" });
    writer
        .append_events(&[removed, removal])
        .expect("removed queued session");

    let mut completed = event(1);
    completed.session_id = "session-c".to_string();
    completed.event_id = "evt-session-c-queued".to_string();
    completed.event_type = "queue.added".to_string();
    completed.turn_id = Some("queued-c".to_string());
    let mut terminal = completed.clone();
    terminal.event_id = "evt-session-c-completed".to_string();
    terminal.sequence = 2;
    terminal.event_type = "turn.completed".to_string();
    writer
        .append_events(&[completed, terminal])
        .expect("completed queued session");

    assert_eq!(
        writer
            .list_queued_session_ids()
            .expect("discover queued sessions"),
        vec!["session-a".to_string()]
    );
}

#[test]
fn cloned_writer_blocks_repair_until_an_inflight_record_is_complete() {
    use std::sync::mpsc;
    use std::time::Duration;

    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    writer.append(&event(1)).expect("first append");
    let second = event(2);
    let second_json = serde_json::to_vec(&second).expect("serialize second event");

    let path = writer.session_path("session-a");
    let io_lock = writer.io_lock_for(&path).expect("event log I/O lock");
    let io_guard = io_lock.lock().expect("event log I/O guard");
    let mut file = open_event_log_for_append(&path).expect("append event log");
    file.write_all(&second_json).expect("write partial record");
    file.flush().expect("flush partial record");

    let repair_writer = writer.clone();
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        sender
            .send(repair_writer.repair_session_event_log("session-a"))
            .expect("send repair result");
    });
    assert!(receiver.recv_timeout(Duration::from_millis(25)).is_err());

    file.write_all(b"\n").expect("complete record");
    file.flush().expect("flush complete record");
    drop(file);
    drop(io_guard);

    let scan = receiver
        .recv_timeout(Duration::from_secs(1))
        .expect("repair completes after append")
        .expect("repair scan");
    assert!(scan.issue.is_none());
    assert_eq!(scan.records.len(), 2);
    assert_eq!(scan.records[1].event, second);
}

#[test]
fn session_io_lock_does_not_block_another_session_append() {
    use std::sync::mpsc;
    use std::time::Duration;

    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    writer.append(&event(1)).expect("session a append");
    let session_a_path = writer.session_path("session-a");
    let session_a_lock = writer
        .io_lock_for(&session_a_path)
        .expect("session a I/O lock");
    let session_a_guard = session_a_lock.lock().expect("session a I/O guard");

    let mut session_b_event = event(1);
    session_b_event.session_id = "session-b".to_string();
    session_b_event.thread_id = Some("thread-b".to_string());
    session_b_event.turn_id = Some("turn-b".to_string());
    session_b_event.event_id = "evt-session-b-1".to_string();
    let append_writer = writer.clone();
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        sender
            .send(append_writer.append(&session_b_event))
            .expect("send append result");
    });

    receiver
        .recv_timeout(Duration::from_secs(1))
        .expect("session b append is independent")
        .expect("session b append");
    drop(session_a_guard);
    assert_eq!(
        writer
            .read_session_events("session-b")
            .expect("session b records")
            .len(),
        1
    );
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

#[test]
fn canonical_scan_fingerprint_ignores_source_json_field_order() {
    let first_temp = tempfile::tempdir().expect("first tempdir");
    let first_writer = EventLogWriter::new(first_temp.path()).expect("first writer");
    first_writer
        .append(&event(1))
        .expect("append canonical event");

    let second_temp = tempfile::tempdir().expect("second tempdir");
    let second_writer = EventLogWriter::new(second_temp.path()).expect("second writer");
    let reordered = json!({
        "payload": { "text": "hello-1" },
        "timestamp": "2026-06-14T00:00:00.000Z",
        "type": "message.delta",
        "turnId": "turn-a",
        "threadId": "thread-a",
        "sessionId": "session-a",
        "sequence": 1,
        "eventId": "evt-1"
    });
    let second_path = second_writer.session_path("session-a");
    fs::create_dir_all(second_path.parent().expect("second parent")).expect("create second parent");
    fs::write(second_path, format!("{reordered}\n")).expect("write reordered event");

    let first = first_writer
        .scan_session_events("session-a")
        .expect("first scan");
    let second = second_writer
        .scan_session_events("session-a")
        .expect("second scan");

    assert!(first.issue.is_none());
    assert!(second.issue.is_none());
    assert_eq!(first.fingerprint, second.fingerprint);
    assert_eq!(first.last_valid_offset, first.file_len);
}

#[test]
fn malformed_tail_is_isolated_and_truncated_to_last_valid_offset() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    writer.append(&event(1)).expect("append");
    let path = writer.session_path("session-a");
    let valid_len = fs::metadata(&path).expect("metadata").len();
    fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .expect("open tail")
        .write_all(br#"{"eventId":"evt-2"#)
        .expect("write malformed tail");

    let scan = writer.scan_session_events("session-a").expect("scan");
    assert_eq!(scan.records.len(), 1);
    assert_eq!(scan.last_valid_offset, valid_len);
    assert!(matches!(
        scan.issue,
        Some(EventLogIssue::MalformedTail { offset, .. }) if offset == valid_len
    ));
    assert!(writer.read_session_events("session-a").is_err());

    let repaired = writer
        .repair_session_event_log("session-a")
        .expect("repair tail");
    assert!(repaired.issue.is_none());
    assert_eq!(repaired.records.len(), 1);
    assert_eq!(repaired.file_len, valid_len);
    assert_eq!(
        fs::metadata(path).expect("repaired metadata").len(),
        valid_len
    );
}

#[test]
fn complete_but_unterminated_tail_is_not_assumed_committed() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    writer.append(&event(1)).expect("append");
    let path = writer.session_path("session-a");
    let valid_len = fs::metadata(&path).expect("metadata").len();
    let tail = serde_json::to_vec(&event(2)).expect("serialize tail");
    fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .expect("open tail")
        .write_all(&tail)
        .expect("write tail");

    let scan = writer.scan_session_events("session-a").expect("scan");
    assert_eq!(scan.records.len(), 1);
    assert_eq!(scan.last_valid_offset, valid_len);
    assert_eq!(
        scan.issue,
        Some(EventLogIssue::UnterminatedTail { offset: valid_len })
    );
}

#[test]
fn append_terminates_valid_tail_and_truncates_malformed_tail_before_writing() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    writer.append(&event(1)).expect("append first");
    let path = writer.session_path("session-a");
    let second = serde_json::to_vec(&event(2)).expect("serialize second");
    fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .expect("open valid tail")
        .write_all(&second)
        .expect("write valid tail");

    writer.append(&event(3)).expect("append after valid tail");
    let records = writer
        .read_session_events("session-a")
        .expect("records after valid tail");
    assert_eq!(
        records
            .iter()
            .map(|record| record.event.sequence)
            .collect::<Vec<_>>(),
        vec![1, 2, 3]
    );

    writer.clear_session("session-a").expect("clear");
    writer.append(&event(1)).expect("append first again");
    fs::OpenOptions::new()
        .append(true)
        .open(&path)
        .expect("open malformed tail")
        .write_all(br#"{"eventId":"broken"#)
        .expect("write malformed tail");
    writer
        .append(&event(2))
        .expect("append after malformed tail");
    let records = writer
        .read_session_events("session-a")
        .expect("records after malformed tail");
    assert_eq!(
        records
            .iter()
            .map(|record| record.event.sequence)
            .collect::<Vec<_>>(),
        vec![1, 2]
    );
}

#[test]
fn malformed_middle_record_is_not_truncated_by_tail_repair() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    let path = writer.session_path("session-a");
    fs::create_dir_all(path.parent().expect("parent")).expect("create parent");
    let first = serde_json::to_string(&event(1)).expect("first");
    let third = serde_json::to_string(&event(3)).expect("third");
    fs::write(&path, format!("{first}\n{{broken}}\n{third}\n")).expect("write log");
    let before = fs::read(&path).expect("before");

    let scan = writer.scan_session_events("session-a").expect("scan");
    assert!(matches!(
        scan.issue,
        Some(EventLogIssue::MalformedRecord { .. })
    ));
    assert!(writer.repair_session_event_log("session-a").is_err());
    assert_eq!(fs::read(path).expect("after"), before);
}

#[test]
fn canonical_scan_rejects_gap_regression_and_equal_sequence_divergence() {
    let temp = tempfile::tempdir().expect("tempdir");
    let writer = EventLogWriter::new(temp.path()).expect("writer");
    let path = writer.session_path("session-a");
    fs::create_dir_all(path.parent().expect("parent")).expect("create parent");

    write_events_to_path(&path, &[&event(1), &event(3)]).expect("write gap");
    let gap = writer.scan_session_events("session-a").expect("gap scan");
    assert!(matches!(
        gap.issue,
        Some(EventLogIssue::SequenceGap {
            expected: 2,
            actual: 3,
            ..
        })
    ));

    write_events_to_path(&path, &[&event(3), &event(2)]).expect("write regression");
    let regression = writer
        .scan_session_events("session-a")
        .expect("regression scan");
    assert!(matches!(
        regression.issue,
        Some(EventLogIssue::SequenceRegression {
            previous: 3,
            actual: 2,
            ..
        })
    ));

    let mut divergent = event(1);
    divergent.event_id = "evt-divergent".to_string();
    write_events_to_path(&path, &[&event(1), &divergent]).expect("write divergence");
    let divergence = writer
        .scan_session_events("session-a")
        .expect("divergence scan");
    assert!(matches!(
        divergence.issue,
        Some(EventLogIssue::EqualSequenceDivergence { sequence: 1, .. })
    ));
}
