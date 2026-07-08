//! usage stats request processor tests.

use super::super::*;
use app_server_protocol::{
    ClientCapabilities, JsonRpcMessage, METHOD_INITIALIZE, METHOD_INITIALIZED,
    METHOD_USAGE_STATS_DAILY_TRENDS_LIST, METHOD_USAGE_STATS_MODEL_RANKING_LIST,
    METHOD_USAGE_STATS_READ, RequestId,
};
use serde_json::json;

#[tokio::test]
async fn usage_stats_methods_require_initialized_and_return_current_dto() {
    let processor = RequestProcessor::new(RuntimeCore::default());
    let blocked = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(1),
            METHOD_USAGE_STATS_READ,
            Some(json!({ "timeRange": "month" })),
        ))
        .await
        .expect("blocked response");
    assert!(matches!(
        &blocked[0],
        JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
    ));

    processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(2),
            METHOD_INITIALIZE,
            Some(
                serde_json::to_value(InitializeParams {
                    client_info: ClientInfo {
                        name: "test-client".to_string(),
                        title: None,
                        version: None,
                    },
                    capabilities: ClientCapabilities::default(),
                })
                .expect("initialize params"),
            ),
        ))
        .await
        .expect("initialize");
    processor.handle_notification(JsonRpcNotification::new(
        METHOD_INITIALIZED,
        Some(json!({})),
    ));

    let cases = [
        (
            RequestId::Integer(3),
            METHOD_USAGE_STATS_READ,
            "stats",
            "object",
        ),
        (
            RequestId::Integer(4),
            METHOD_USAGE_STATS_MODEL_RANKING_LIST,
            "ranking",
            "array",
        ),
        (
            RequestId::Integer(5),
            METHOD_USAGE_STATS_DAILY_TRENDS_LIST,
            "trends",
            "array",
        ),
    ];

    for (id, method, field, expected_kind) in cases {
        let messages = processor
            .handle_request(JsonRpcRequest::new(
                id,
                method,
                Some(json!({ "timeRange": "month" })),
            ))
            .await
            .expect("usage stats response");

        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                let value = response.result.get(field).expect("response field");
                match expected_kind {
                    "object" => assert!(value.is_object()),
                    "array" => assert!(value.is_array()),
                    other => panic!("unexpected expected kind {other}"),
                }
            }
            other => panic!("expected response, got {other:?}"),
        }
    }
}
