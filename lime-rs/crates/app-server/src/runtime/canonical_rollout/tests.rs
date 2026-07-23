use std::fs;
use std::path::{Path, PathBuf};

use agent_protocol::{
    SessionId, Thread, ThreadHistoryChangeSet, ThreadId, ThreadStatus, ThreadTurnsView,
};
use serde_json::{json, Value};

use super::{scan_rollout, RolloutStore};

fn thread(id: &str) -> Thread {
    Thread {
        session_id: SessionId::new(format!("session-{id}")),
        thread_id: ThreadId::new(id),
        status: ThreadStatus::Idle,
        created_at_ms: 1_700_000_000_000,
        updated_at_ms: 1_700_000_000_000,
        archived: false,
        recency_at_ms: None,
        parent_thread_id: None,
        agent_path: None,
        agent_nickname: None,
        agent_role: None,
        last_task_message: None,
        agent_state: None,
        forked_from_id: None,
        preview: format!("preview-{id}"),
        model_provider: "test".to_string(),
        product: None,
        name: None,
        metadata: json!({}),
        turns: Vec::new(),
        turns_view: ThreadTurnsView::NotLoaded,
    }
}

fn setup(id: &str) -> (tempfile::TempDir, RolloutStore, Thread, PathBuf, PathBuf) {
    let temp = tempfile::tempdir().expect("tempdir");
    let agent_root = temp.path().join("agent-root");
    let store = RolloutStore::new(&agent_root);
    let source = thread(id);
    let relative_path = store.path_for_thread(&source).expect("rollout path");
    store
        .ensure_thread(&relative_path, &source)
        .expect("ensure rollout");
    let absolute_path = agent_root.join(&relative_path);
    (temp, store, source, relative_path, absolute_path)
}

fn changes(sequence: u64) -> ThreadHistoryChangeSet {
    ThreadHistoryChangeSet {
        sequence,
        ..Default::default()
    }
}

fn fingerprint(character: char) -> String {
    character.to_string().repeat(64)
}

fn append(
    store: &RolloutStore,
    relative_path: &Path,
    source: &Thread,
    sequence: u64,
    fingerprint: &str,
) -> Result<bool, String> {
    store.append_history(
        relative_path,
        source.session_id.as_str(),
        source.thread_id.as_str(),
        fingerprint,
        &changes(sequence),
    )
}

#[test]
fn append_history_does_not_recompute_earlier_history_digests() {
    let (_temp, store, source, relative_path, absolute_path) = setup("tail-only");
    append(&store, &relative_path, &source, 1, &fingerprint('a')).expect("append sequence 1");
    append(&store, &relative_path, &source, 2, &fingerprint('b')).expect("append sequence 2");

    let contents = fs::read_to_string(&absolute_path).expect("read rollout");
    let mut records = contents
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).expect("rollout JSON"))
        .collect::<Vec<_>>();
    records[1]["content_digest"] = Value::String("0".repeat(64));
    let rewritten = records
        .iter()
        .map(|record| serde_json::to_string(record).expect("encode rollout JSON"))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    fs::write(&absolute_path, rewritten).expect("rewrite rollout fixture");

    assert!(
        append(&store, &relative_path, &source, 3, &fingerprint('c'))
            .expect("append from latest valid history")
    );
    assert!(scan_rollout(&absolute_path)
        .expect_err("cold scan must retain full integrity validation")
        .contains("invalid rollout history record"));
}

#[test]
fn append_history_is_idempotent_for_the_latest_sequence() {
    let (_temp, store, source, relative_path, _absolute_path) = setup("idempotent");
    let expected_fingerprint = fingerprint('a');
    assert!(
        append(&store, &relative_path, &source, 1, &expected_fingerprint).expect("initial append")
    );
    assert!(
        !append(&store, &relative_path, &source, 1, &expected_fingerprint)
            .expect("idempotent append")
    );
}

#[test]
fn append_history_rejects_latest_collision_and_stale_sequence() {
    let (_temp, store, source, relative_path, _absolute_path) = setup("ordering");
    append(&store, &relative_path, &source, 2, &fingerprint('a')).expect("append sequence 2");

    let collision = append(&store, &relative_path, &source, 2, &fingerprint('b'))
        .expect_err("same sequence with another fingerprint must fail");
    assert!(collision.contains("sequence collision at 2"));

    let stale = append(&store, &relative_path, &source, 1, &fingerprint('c'))
        .expect_err("older sequence must fail");
    assert!(stale.contains("sequence 1 is stale"));
}

#[test]
fn append_history_finds_latest_history_before_trailing_metadata() {
    let (_temp, store, source, relative_path, _absolute_path) = setup("metadata-tail");
    let expected_fingerprint = fingerprint('a');
    append(&store, &relative_path, &source, 1, &expected_fingerprint).expect("append history");
    let mut next = source.clone();
    next.updated_at_ms += 1;
    next.metadata = json!({"blob": "x".repeat(100_000)});
    store
        .append_metadata(&relative_path, &source, &next)
        .expect("append metadata");

    assert!(
        !append(&store, &relative_path, &source, 1, &expected_fingerprint)
            .expect("latest history remains idempotent")
    );
    assert!(
        append(&store, &relative_path, &source, 2, &fingerprint('b'))
            .expect("append after trailing metadata")
    );
}

#[test]
fn append_history_rejects_a_corrupted_latest_history() {
    let (_temp, store, source, relative_path, absolute_path) = setup("corrupt-latest");
    append(&store, &relative_path, &source, 1, &fingerprint('a')).expect("append history");

    let contents = fs::read_to_string(&absolute_path).expect("read rollout");
    let mut records = contents
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).expect("rollout JSON"))
        .collect::<Vec<_>>();
    records[1]["content_digest"] = Value::String("0".repeat(64));
    let rewritten = records
        .iter()
        .map(|record| serde_json::to_string(record).expect("encode rollout JSON"))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    fs::write(&absolute_path, rewritten).expect("rewrite rollout fixture");

    let error = append(&store, &relative_path, &source, 2, &fingerprint('b'))
        .expect_err("corrupted latest history must fail closed");
    assert!(error.contains("invalid rollout history record"));
}
