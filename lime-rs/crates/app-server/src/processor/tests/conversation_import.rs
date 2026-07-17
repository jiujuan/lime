//! conversation import public JSON-RPC integration tests.

use super::super::*;
use super::tests_support::initialize_processor;
use app_server_protocol::{
    ConversationImportJobReadResponse, ConversationImportJobStatus,
    ConversationImportThreadCommitStartResponse, JsonRpcMessage, RequestId,
    METHOD_CONVERSATION_IMPORT_JOB_READ, METHOD_CONVERSATION_IMPORT_THREAD_COMMIT,
};
use serde_json::{json, Value};
use std::fs;
use std::time::Duration;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn conversation_import_commit_and_job_read_share_public_json_rpc_lifecycle() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-public-background-import.jsonl");
    fs::write(
        &rollout_path,
        [
            json!({
                "timestamp": "2026-07-17T00:00:00.000Z",
                "type": "session_meta",
                "payload": {
                    "id": "thread-public-background-import",
                    "cwd": "/workspace/app",
                    "source": "cli",
                    "model_provider": "openai"
                }
            }),
            json!({
                "timestamp": "2026-07-17T00:00:01.000Z",
                "type": "event_msg",
                "payload": {
                    "type": "user_message",
                    "message": "## My request for Codex: import through JSON-RPC"
                }
            }),
            json!({
                "timestamp": "2026-07-17T00:00:02.000Z",
                "type": "event_msg",
                "payload": {
                    "type": "agent_message",
                    "message": "Public import completed."
                }
            }),
        ]
        .into_iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>()
        .join("\n"),
    )
    .expect("write rollout");
    let processor = RequestProcessor::new(RuntimeCore::default());
    initialize_processor(&processor).await;

    let started = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(10),
            METHOD_CONVERSATION_IMPORT_THREAD_COMMIT,
            Some(json!({
                "sourceClient": "codex",
                "sourceRoot": temp.path().to_string_lossy(),
                "sourceThreadId": "thread-public-background-import",
                "sourcePath": rollout_path.to_string_lossy(),
                "confirmed": true
            })),
        ))
        .await
        .expect("commit start response");
    let started: ConversationImportThreadCommitStartResponse =
        serde_json::from_value(response_result(&started)).expect("typed commit start response");
    assert_eq!(started.job.status, ConversationImportJobStatus::Queued);

    let terminal = tokio::time::timeout(Duration::from_secs(10), async {
        let mut request_id = 11;
        loop {
            let messages = processor
                .handle_request(JsonRpcRequest::new(
                    RequestId::Integer(request_id),
                    METHOD_CONVERSATION_IMPORT_JOB_READ,
                    Some(json!({ "jobId": &started.job.job_id })),
                ))
                .await
                .expect("job read response");
            request_id += 1;
            let response: ConversationImportJobReadResponse =
                serde_json::from_value(response_result(&messages))
                    .expect("typed job read response");
            if matches!(
                response.job.status,
                ConversationImportJobStatus::Completed | ConversationImportJobStatus::Failed
            ) {
                break response.job;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("public background import terminal timeout");

    assert_eq!(terminal.status, ConversationImportJobStatus::Completed);
    let result = terminal.result.expect("terminal canonical result");
    assert_eq!(
        result.thread.source_thread_id,
        "thread-public-background-import"
    );
    assert_eq!(result.imported_turns, 1);
    assert!(result.can_continue);
}

fn response_result(messages: &[JsonRpcMessage]) -> Value {
    match messages.first() {
        Some(JsonRpcMessage::Response(response)) => response.result.clone(),
        other => panic!("expected JSON-RPC response, got {other:?}"),
    }
}
