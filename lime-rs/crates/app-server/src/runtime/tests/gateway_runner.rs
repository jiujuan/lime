use super::support::*;
use super::*;
use crate::runtime::gateway_runner::RuntimeGatewayAgentRunner;
use lime_gateway::agent_runner::{GatewayAgentRunRequest, GatewayAgentRunner};

#[tokio::test]
async fn gateway_runner_executes_turn_through_runtime_core_read_model() {
    let core = Arc::new(RuntimeCore::with_backend(Arc::new(CompletedBackend)));
    let runner = RuntimeGatewayAgentRunner::new(core.clone());

    let response = runner
        .run_agent_turn(GatewayAgentRunRequest {
            channel: "telegram".to_string(),
            account_id: "account-1".to_string(),
            session_id: "gateway-session-1".to_string(),
            input_text: "你好".to_string(),
            metadata: json!({ "source": "test" }),
            provider_preference: Some("provider-a".to_string()),
            model_preference: Some("model-a".to_string()),
        })
        .await
        .expect("gateway runner turn");

    assert_eq!(response.session_id, "gateway-session-1");
    assert_eq!(response.reply_text, "你好！有什么可以帮你的吗？");
    assert!(!response.turn_id.is_empty());

    let read = core
        .read_session_current(AgentSessionReadParams {
            session_id: "gateway-session-1".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read gateway session");
    let detail = read.detail.expect("session detail");
    let business_object_ref = read
        .session
        .business_object_ref
        .expect("business object ref");

    assert_eq!(detail["messages_count"], 2);
    assert_eq!(business_object_ref.kind, "gateway.channel.session");
    assert_eq!(
        business_object_ref
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("source"))
            .and_then(serde_json::Value::as_str),
        Some("gateway_channel")
    );
    assert_eq!(detail["messages"][0]["role"], "user");
    assert_eq!(detail["messages"][0]["content"][0]["text"], "你好");
    assert_eq!(detail["messages"][1]["role"], "assistant");
    assert_eq!(
        detail["messages"][1]["content"][0]["text"],
        "你好！有什么可以帮你的吗？"
    );
}
