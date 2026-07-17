use super::*;
use crate::ProjectionStore;
use app_server_protocol::{
    AgentSessionReadParams, ConversationImportJobReadParams, ConversationImportJobStatus,
    ConversationImportThreadCommitParams,
};
use std::fs;
use std::sync::Arc;
use std::time::{Duration, Instant};

const COMMAND_COUNT: usize = 1_200;
const COMMIT_BUDGET: Duration = Duration::from_secs(30);
const MULTI_TURN_COUNT: usize = 40;
const COMMANDS_PER_TURN: usize = COMMAND_COUNT / MULTI_TURN_COUNT;
const BACKGROUND_START_BUDGET: Duration = Duration::from_secs(2);
const BACKGROUND_COMPLETION_BUDGET: Duration = Duration::from_secs(60);

#[test]
fn commits_large_codex_command_history_within_linear_time_budget() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-large-command-history.jsonl");
    let mut lines = Vec::with_capacity(COMMAND_COUNT * 2 + 3);
    lines.push(session_meta("thread-large-command-history"));
    lines.push(user_message("run the full command history"));
    for index in 0..COMMAND_COUNT {
        let call_id = format!("call_exec_{index}");
        lines.push(function_call(&call_id, index));
        lines.push(function_call_output(&call_id));
    }
    lines.push(agent_message("done"));
    fs::write(&rollout_path, lines.join("\n")).expect("write rollout");

    let core = RuntimeCore::default().with_projection_store(Arc::new(
        ProjectionStore::initialize(temp.path().join("projection.sqlite"))
            .expect("canonical projection store"),
    ));
    let started = Instant::now();
    let response = commit::commit_conversation_import_thread(
        &core,
        ConversationImportThreadCommitParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_path: Some(rollout_path.to_string_lossy().into_owned()),
            confirmed: true,
            ..Default::default()
        },
    )
    .expect("commit large Codex history");
    let elapsed = started.elapsed();

    assert_eq!(response.imported_turns, 1);
    assert_eq!(response.summary.fidelity.commands, COMMAND_COUNT);
    assert_eq!(response.summary.fidelity.budget_dropped, 0);
    assert!(
        elapsed < COMMIT_BUDGET,
        "large Codex history commit exceeded {COMMIT_BUDGET:?}: {elapsed:?} for {COMMAND_COUNT} commands"
    );

    let read = futures::executor::block_on(core.read_session_current(AgentSessionReadParams {
        session_id: response.session.session_id,
        history_limit: None,
        history_offset: None,
        history_before_message_id: None,
    }))
    .expect("read canonical imported session");
    let detail = read.detail.expect("canonical detail");
    assert_eq!(
        detail["thread_read"]["commands"]
            .as_array()
            .expect("commands")
            .len(),
        COMMAND_COUNT
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn starts_multi_turn_codex_history_in_background_and_reports_complete_progress() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-multi-turn-command-history.jsonl");
    let mut lines = Vec::with_capacity(COMMAND_COUNT * 2 + MULTI_TURN_COUNT * 2 + 1);
    lines.push(session_meta("thread-multi-turn-command-history"));
    for turn_index in 0..MULTI_TURN_COUNT {
        lines.push(user_message(&format!("run command batch {turn_index}")));
        for command_index in 0..COMMANDS_PER_TURN {
            let index = turn_index * COMMANDS_PER_TURN + command_index;
            let call_id = format!("call_exec_{index}");
            lines.push(function_call(&call_id, index));
            lines.push(function_call_output(&call_id));
        }
        lines.push(agent_message(&format!("batch {turn_index} done")));
    }
    fs::write(&rollout_path, lines.join("\n")).expect("write rollout");

    let core = RuntimeCore::default().with_projection_store(Arc::new(
        ProjectionStore::initialize(temp.path().join("projection.sqlite"))
            .expect("canonical projection store"),
    ));
    let started_at = Instant::now();
    let started = core
        .commit_conversation_import_thread(ConversationImportThreadCommitParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_thread_id: Some("thread-multi-turn-command-history".to_string()),
            source_path: Some(rollout_path.to_string_lossy().into_owned()),
            confirmed: true,
            ..Default::default()
        })
        .await
        .expect("start multi-turn background import");
    let start_elapsed = started_at.elapsed();
    assert!(
        start_elapsed < BACKGROUND_START_BUDGET,
        "background import start exceeded {BACKGROUND_START_BUDGET:?}: {start_elapsed:?}"
    );

    let terminal = tokio::time::timeout(BACKGROUND_COMPLETION_BUDGET, async {
        loop {
            let current = core
                .read_conversation_import_job(ConversationImportJobReadParams {
                    job_id: started.job.job_id.clone(),
                })
                .await
                .expect("read background import job")
                .job;
            if matches!(
                current.status,
                ConversationImportJobStatus::Completed | ConversationImportJobStatus::Failed
            ) {
                break current;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("multi-turn background import completion timeout");

    assert_eq!(terminal.status, ConversationImportJobStatus::Completed);
    assert_eq!(terminal.progress.total_turns, MULTI_TURN_COUNT);
    assert_eq!(terminal.progress.completed_turns, MULTI_TURN_COUNT);
    assert_eq!(
        terminal.progress.completed_items,
        terminal.progress.total_items
    );
    let result = terminal.result.expect("terminal canonical result");
    assert_eq!(result.imported_turns, MULTI_TURN_COUNT);
    assert_eq!(result.summary.fidelity.commands, COMMAND_COUNT);
    assert_eq!(result.summary.fidelity.budget_dropped, 0);
}

fn session_meta(thread_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:00.000Z",
        "type": "session_meta",
        "payload": {
            "id": thread_id,
            "timestamp": "2026-06-16T00:00:00.000Z",
            "cwd": "/workspace/app",
            "source": "cli",
            "model_provider": "openai"
        }
    })
    .to_string()
}

fn user_message(message: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.000Z",
        "type": "event_msg",
        "payload": {
            "type": "user_message",
            "message": format!("## My request for Codex: {message}")
        }
    })
    .to_string()
}

fn agent_message(message: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:02.000Z",
        "type": "event_msg",
        "payload": {
            "type": "agent_message",
            "message": message
        }
    })
    .to_string()
}

fn function_call(call_id: &str, index: usize) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.200Z",
        "type": "response_item",
        "payload": {
            "type": "function_call",
            "call_id": call_id,
            "name": "exec_command",
            "arguments": serde_json::json!({"cmd": format!("echo {index}")}).to_string()
        }
    })
    .to_string()
}

fn function_call_output(call_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.300Z",
        "type": "response_item",
        "payload": {
            "type": "function_call_output",
            "call_id": call_id,
            "output": "Exit code: 0\nWall time: 0 seconds\nOutput:\nok"
        }
    })
    .to_string()
}
