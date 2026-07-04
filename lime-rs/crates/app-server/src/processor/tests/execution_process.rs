//! execution process request processor tests.

use super::super::*;
use super::tests_support::*;
use app_server_protocol::{
    JsonRpcMessage, RequestId, METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT,
    METHOD_EXECUTION_PROCESS_START, METHOD_EXECUTION_PROCESS_STATUS,
};
use serde_json::json;
use tokio::time::Duration;

#[tokio::test]
async fn execution_process_methods_start_drain_and_report_status() {
    let processor = RequestProcessor::new(RuntimeCore::default());
    initialize_processor(&processor).await;

    let started = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(10),
            METHOD_EXECUTION_PROCESS_START,
            Some(json!({
                "processId": "jsonrpc-process-test",
                "toolId": "tool-jsonrpc",
                "toolName": "Bash",
                "command": ["sh", "-c", "printf jsonrpc-process"],
                "workingDirectory": std::env::current_dir()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                "approvalPolicy": "never",
                "sandboxPolicy": "danger-full-access",
            })),
        ))
        .await
        .expect("execution process start response");
    match &started[0] {
        JsonRpcMessage::Response(response) => {
            assert_eq!(
                response.result["snapshot"]["processId"],
                "jsonrpc-process-test"
            );
            assert_eq!(response.result["snapshot"]["status"], "running");
        }
        other => panic!("expected response, got {other:?}"),
    }

    let mut drained_deltas = Vec::new();
    for attempt in 0..20 {
        let drained = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(11 + attempt),
                METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT,
                Some(json!({
                    "processId": "jsonrpc-process-test",
                    "afterSequence": 0,
                    "maxBytes": 65536,
                })),
            ))
            .await
            .expect("execution process output response");
        match &drained[0] {
            JsonRpcMessage::Response(response) => {
                let deltas = response.result["deltas"]
                    .as_array()
                    .expect("deltas should be an array");
                if !deltas.is_empty() {
                    assert!(response.result["nextSequence"].as_u64().is_some());
                }
                drained_deltas.extend(deltas.iter().cloned());
                if drained_deltas.iter().any(|delta| {
                    delta["delta"]
                        .as_str()
                        .is_some_and(|value| value.contains("jsonrpc-process"))
                }) {
                    break;
                }
            }
            other => panic!("expected response, got {other:?}"),
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    assert!(drained_deltas.iter().any(|delta| {
        delta["delta"]
            .as_str()
            .is_some_and(|value| value.contains("jsonrpc-process"))
    }));

    let status = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(12),
            METHOD_EXECUTION_PROCESS_STATUS,
            Some(json!({
                "processId": "jsonrpc-process-test",
            })),
        ))
        .await
        .expect("execution process status response");
    match &status[0] {
        JsonRpcMessage::Response(response) => {
            assert_eq!(response.result["snapshot"]["status"], "exited");
        }
        other => panic!("expected response, got {other:?}"),
    }
}

#[tokio::test]
async fn execution_process_start_rejects_workspace_sandbox_without_process_owner() {
    let processor = RequestProcessor::new(RuntimeCore::default());
    initialize_processor(&processor).await;

    let response = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(13),
            METHOD_EXECUTION_PROCESS_START,
            Some(json!({
                "processId": "jsonrpc-process-sandbox",
                "toolId": "tool-jsonrpc-sandbox",
                "toolName": "Bash",
                "command": ["sh", "-c", "printf blocked"],
                "workingDirectory": std::env::current_dir()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                "approvalPolicy": "never",
                "sandboxPolicy": "workspace-write",
            })),
        ))
        .await
        .expect("execution process sandbox rejection response");

    match &response[0] {
        JsonRpcMessage::Error(response) => {
            assert!(response.error.message.contains("requires sandbox backend"));
        }
        other => panic!("expected response, got {other:?}"),
    }
}
