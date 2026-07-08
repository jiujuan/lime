//! Config warning notification integration tests.

use super::tests_support::initialize_processor;
use crate::processor::config_warning::{ConfigWarningProvider, ConfigWarningScope};
use crate::RuntimeCore;
use app_server_protocol::{
    AgentInput, AgentSessionStartParams, AgentSessionTurnStartParams, ClientCapabilities,
    ClientInfo, ConfigWarningNotification, InitializeParams, JsonRpcMessage, JsonRpcRequest,
    RequestId, ServerNotification, METHOD_AGENT_SESSION_TURN_START, METHOD_CONFIG_WARNING,
    METHOD_INITIALIZE,
};
use serde_json::json;
use std::sync::Arc;

fn config_warning(summary: &str) -> app_server_protocol::JsonRpcNotification {
    ServerNotification::ConfigWarning(ConfigWarningNotification {
        summary: summary.to_string(),
        details: Some("synthetic config parser warning".to_string()),
        path: Some("/tmp/lime/config.yaml".to_string()),
        range: None,
    })
    .into()
}

fn scoped_config_warning_provider() -> ConfigWarningProvider {
    Arc::new(|scope| {
        let summary = match scope {
            ConfigWarningScope::Initialize => "test initialize config warning",
            ConfigWarningScope::TurnStart => "test turn start config warning",
        };
        vec![config_warning(summary)]
    })
}

fn multi_config_warning_provider() -> ConfigWarningProvider {
    Arc::new(|_| {
        vec![
            config_warning("test first config warning"),
            config_warning("test second config warning"),
        ]
    })
}

#[tokio::test]
async fn initialize_returns_config_warning_notification() {
    let processor = crate::processor::RequestProcessor::new_with_config_warning_provider(
        RuntimeCore::default(),
        scoped_config_warning_provider(),
    );

    let messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(1),
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

    assert_eq!(messages.len(), 2);
    assert!(matches!(messages[0], JsonRpcMessage::Response(_)));
    let JsonRpcMessage::Notification(notification) = &messages[1] else {
        panic!("expected config warning notification");
    };
    assert_eq!(notification.method, METHOD_CONFIG_WARNING);
    assert_eq!(
        notification.params.as_ref().expect("params")["summary"],
        json!("test initialize config warning")
    );
}

#[tokio::test]
async fn initialize_returns_all_config_warning_notifications() {
    let processor = crate::processor::RequestProcessor::new_with_config_warning_provider(
        RuntimeCore::default(),
        multi_config_warning_provider(),
    );

    let messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(1),
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

    assert_eq!(messages.len(), 3);
    assert!(matches!(messages[0], JsonRpcMessage::Response(_)));
    let summaries: Vec<_> = messages
        .iter()
        .filter_map(|message| match message {
            JsonRpcMessage::Notification(notification)
                if notification.method == METHOD_CONFIG_WARNING =>
            {
                Some(
                    notification.params.as_ref().expect("params")["summary"]
                        .as_str()
                        .expect("summary"),
                )
            }
            _ => None,
        })
        .collect();
    assert_eq!(
        summaries,
        vec!["test first config warning", "test second config warning"]
    );
}

#[tokio::test]
async fn turn_start_returns_config_warning_notification_on_request_response_path() {
    let processor = crate::processor::RequestProcessor::new_with_config_warning_provider(
        RuntimeCore::default(),
        scoped_config_warning_provider(),
    );
    initialize_processor(&processor).await;

    processor
        .runtime()
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_config_warning".to_string()),
            thread_id: Some("thread_config_warning".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

    let messages = processor
        .handle_request(JsonRpcRequest::new(
            RequestId::Integer(2),
            METHOD_AGENT_SESSION_TURN_START,
            Some(
                serde_json::to_value(AgentSessionTurnStartParams {
                    session_id: "sess_config_warning".to_string(),
                    turn_id: Some("turn_config_warning".to_string()),
                    input: AgentInput {
                        text: "hello".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                })
                .expect("turn params"),
            ),
        ))
        .await
        .expect("turn start");

    assert!(matches!(messages[0], JsonRpcMessage::Response(_)));
    let notification = messages
        .iter()
        .filter_map(|message| match message {
            JsonRpcMessage::Notification(notification)
                if notification.method == METHOD_CONFIG_WARNING =>
            {
                Some(notification)
            }
            _ => None,
        })
        .next()
        .expect("config warning notification");
    assert_eq!(
        notification.params.as_ref().expect("params")["summary"],
        json!("test turn start config warning")
    );
}
