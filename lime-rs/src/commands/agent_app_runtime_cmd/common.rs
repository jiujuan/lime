use crate::agent::AsterAgentState;
use crate::app::LogState;
use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::commands::aster_agent_cmd::app_server_host::{
    app_server_handle_json_lines, AppServerHandleJsonLinesRequest,
};
use crate::config::GlobalConfigManagerState;
use crate::database::DbConnection;
use crate::mcp::McpManagerState;
use crate::services::automation_service::AutomationServiceState;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub(super) const AGENT_APP_RUNTIME_EVENT_PREFIX: &str = "agent_app_runtime";
pub(super) const AGENT_APP_RUNTIME_METADATA_KEY: &str = "agent_app_runtime";
pub(super) const LIME_RUNTIME_METADATA_KEY: &str = "lime_runtime";
pub(super) const LIME_RUNTIME_TOOL_SURFACE_KEY: &str = "tool_surface";
pub(super) const AGENT_APP_RUNTIME_CAPABILITY_SOURCE: &str = "agent_app_runtime";
pub(super) const CONTENT_FACTORY_WORKSPACE_PATCH_KIND: &str = "content_factory.workspace_patch";
pub(super) const AGENT_APP_RUNTIME_SESSION_ID_PREFIX: &str = "agent-app-runtime-";

pub(super) fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
}

pub(super) fn new_agent_app_runtime_session_id() -> String {
    format!("{}{}", AGENT_APP_RUNTIME_SESSION_ID_PREFIX, Uuid::new_v4())
}

pub(super) fn agent_app_runtime_event_name(app_id: &str, task_id: &str) -> String {
    format!("{AGENT_APP_RUNTIME_EVENT_PREFIX}:{app_id}:{task_id}")
}

pub(super) fn require_text(value: Option<&str>, label: &str) -> Result<String, String> {
    non_empty(value).ok_or_else(|| format!("{label} 不能为空"))
}

static APP_SERVER_HANDSHAKE_SENT: AtomicBool = AtomicBool::new(false);
static APP_SERVER_HANDSHAKE_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

pub(super) async fn invoke_agent_app_runtime_app_server<T>(
    app: AppHandle,
    request_id: impl Into<String>,
    method: &'static str,
    params: impl serde::Serialize,
) -> Result<T, String>
where
    T: serde::de::DeserializeOwned,
{
    let value =
        invoke_agent_app_runtime_app_server_value(app, request_id, method, params, &[]).await?;
    let value = value.ok_or_else(|| format!("App Server method {method} returned no response"))?;

    serde_json::from_value(value).map_err(|error| error.to_string())
}

pub(super) async fn invoke_agent_app_runtime_app_server_value(
    app: AppHandle,
    request_id: impl Into<String>,
    method: &'static str,
    params: impl serde::Serialize,
    allowed_error_codes: &[i64],
) -> Result<Option<serde_json::Value>, String> {
    let request_id = app_server::RequestId::String(request_id.into());
    let response_request_id = request_id.clone();
    let params = serde_json::to_value(params).map_err(|error| error.to_string())?;
    ensure_agent_app_runtime_app_server_initialized(app.clone()).await?;
    let lines = vec![serialize_app_server_line(
        app_server::JsonRpcMessage::Request(app_server::JsonRpcRequest::new(
            request_id.clone(),
            method,
            Some(params),
        )),
    )?];
    let response = handle_agent_app_runtime_app_server_lines(app, lines).await?;
    let message = response
        .lines
        .iter()
        .filter_map(|line| serde_json::from_str::<app_server::JsonRpcMessage>(line).ok())
        .find_map(|message| match message {
            app_server::JsonRpcMessage::Response(response)
                if response.id == response_request_id =>
            {
                Some(Ok(Some(response)))
            }
            app_server::JsonRpcMessage::Error(error) if error.id == response_request_id => {
                if allowed_error_codes.contains(&error.error.code) {
                    Some(Ok(None))
                } else {
                    Some(Err(error.error.message))
                }
            }
            _ => None,
        })
        .ok_or_else(|| format!("App Server method {method} returned no response"))??;

    Ok(message.map(|response| response.result))
}

async fn ensure_agent_app_runtime_app_server_initialized(app: AppHandle) -> Result<(), String> {
    if APP_SERVER_HANDSHAKE_SENT.load(Ordering::Acquire) {
        return Ok(());
    }

    let handshake_lock = APP_SERVER_HANDSHAKE_LOCK.get_or_init(|| tokio::sync::Mutex::new(()));
    let _guard = handshake_lock.lock().await;
    if APP_SERVER_HANDSHAKE_SENT.load(Ordering::Acquire) {
        return Ok(());
    }

    let lines = vec![
        serialize_app_server_line(app_server::JsonRpcMessage::Request(
            app_server::JsonRpcRequest::new(
                app_server::RequestId::String("agent-app-runtime-init".to_string()),
                app_server::METHOD_INITIALIZE,
                Some(serde_json::json!({
                    "clientInfo": {
                        "name": "agent-app-runtime",
                        "title": "Agent App Runtime",
                    },
                    "capabilities": {
                        "eventMethods": [app_server::METHOD_AGENT_SESSION_EVENT],
                    },
                })),
            ),
        ))?,
        serialize_app_server_line(app_server::JsonRpcMessage::Notification(
            app_server::JsonRpcNotification::new(
                app_server::METHOD_INITIALIZED,
                Some(serde_json::json!({})),
            ),
        ))?,
    ];
    let _ = handle_agent_app_runtime_app_server_lines(app, lines).await?;
    APP_SERVER_HANDSHAKE_SENT.store(true, Ordering::Release);
    Ok(())
}

async fn handle_agent_app_runtime_app_server_lines(
    app: AppHandle,
    lines: Vec<String>,
) -> Result<crate::commands::aster_agent_cmd::app_server_host::AppServerHandleJsonLinesResult, String>
{
    app_server_handle_json_lines(
        app.clone(),
        app.state::<AsterAgentState>(),
        app.state::<DbConnection>(),
        app.state::<ApiKeyProviderServiceState>(),
        app.state::<LogState>(),
        app.state::<GlobalConfigManagerState>(),
        app.state::<McpManagerState>(),
        app.state::<AutomationServiceState>(),
        AppServerHandleJsonLinesRequest { lines },
    )
    .await
}

fn serialize_app_server_line(message: app_server::JsonRpcMessage) -> Result<String, String> {
    let mut line = serde_json::to_string(&message).map_err(|error| error.to_string())?;
    line.push('\n');
    Ok(line)
}
