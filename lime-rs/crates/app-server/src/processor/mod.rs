mod agent_session;
mod automation;
mod browser_session;
mod connect;
mod conversation_import;
mod diagnostics;
mod dispatch;
mod execution_process;
mod file;
mod gallery;
mod gateway;
mod knowledge;
mod log;
mod mcp;
mod media;
mod memory_store;
mod model;
mod plugin;
mod project;
mod project_git;
mod project_shell;
mod request_trace;
mod right_surface;
mod skill;
mod voice;
mod wechat;
mod workflow;
mod workspace;

use crate::execution_process::ExecutionProcessServer;
use crate::project_shell::ProjectShellManager;
use crate::AppServerError;
use crate::RuntimeCore;
use crate::RuntimeCoreError;
use crate::RuntimeHostContext;
use app_server_protocol::error_codes;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSessionActionReplayParams;
use app_server_protocol::AgentSessionActionRespondParams;
use app_server_protocol::AgentSessionAnalysisHandoffExportParams;
use app_server_protocol::AgentSessionEventParams;
use app_server_protocol::AgentSessionHandoffBundleExportParams;
use app_server_protocol::AgentSessionReplayCaseExportParams;
use app_server_protocol::AgentSessionReviewDecisionSaveParams;
use app_server_protocol::AgentSessionReviewDecisionTemplateExportParams;
use app_server_protocol::ArtifactReadParams;
use app_server_protocol::CapabilityListParams;
use app_server_protocol::ChannelProbeParams;
use app_server_protocol::ClientInfo;
use app_server_protocol::EvidenceExportParams;
use app_server_protocol::InitializeParams;
use app_server_protocol::InitializeResponse;
use app_server_protocol::JsonRpcError;
use app_server_protocol::JsonRpcMessage;
use app_server_protocol::JsonRpcNotification;
use app_server_protocol::JsonRpcRequest;
use app_server_protocol::PlatformInfo;
// ProjectGit* 类型已移至 processor/project_git.rs
use app_server_protocol::ServerCapabilities;
use app_server_protocol::ServerInfo;
use app_server_protocol::UsageStatsRangeParams;
use app_server_protocol::METHOD_AGENT_SESSION_EVENT;
use app_server_protocol::METHOD_INITIALIZED;
use app_server_protocol::METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED;
use app_server_protocol::PROTOCOL_VERSION;
use app_server_protocol::SERVER_NAME;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::sync::Arc;
use std::sync::Mutex;
use tracing::Instrument;

#[derive(Clone)]
pub struct RequestProcessor {
    state: Arc<Mutex<ProcessorState>>,
    runtime: Arc<RuntimeCore>,
    project_shell: ProjectShellManager,
    execution_process: ExecutionProcessServer,
}

#[derive(Debug, Default)]
struct ProcessorState {
    initialize_accepted: bool,
    initialized: bool,
    client_info: Option<ClientInfo>,
}

impl RequestProcessor {
    pub fn new(runtime: RuntimeCore) -> Self {
        let execution_process = runtime
            .execution_process_server()
            .unwrap_or_else(ExecutionProcessServer::default);
        Self::new_with_execution_process(runtime, execution_process)
    }

    pub(crate) fn new_with_execution_process(
        runtime: RuntimeCore,
        execution_process: ExecutionProcessServer,
    ) -> Self {
        Self {
            state: Arc::new(Mutex::new(ProcessorState::default())),
            runtime: Arc::new(runtime),
            project_shell: ProjectShellManager::default(),
            execution_process,
        }
    }

    pub fn runtime(&self) -> &RuntimeCore {
        self.runtime.as_ref()
    }

    pub fn runtime_arc(&self) -> Arc<RuntimeCore> {
        self.runtime.clone()
    }

    pub async fn handle_request(
        &self,
        request: JsonRpcRequest,
    ) -> Result<Vec<JsonRpcMessage>, AppServerError> {
        let client_info = self.client_info();
        let span = request_trace::request_span(&request, client_info.as_ref());
        self.handle_request_inner(request, None)
            .instrument(span)
            .await
    }

    pub async fn handle_request_streaming(
        &self,
        request: JsonRpcRequest,
        event_callback: &mut (dyn FnMut(JsonRpcMessage) + Send),
    ) -> Result<Vec<JsonRpcMessage>, AppServerError> {
        let client_info = self.client_info();
        let span = request_trace::request_span(&request, client_info.as_ref());
        self.handle_request_inner(request, Some(event_callback))
            .instrument(span)
            .await
    }

    pub fn handle_notification(&self, notification: JsonRpcNotification) {
        if notification.method != METHOD_INITIALIZED {
            return;
        }

        let mut state = self.state.lock().expect("app-server state mutex poisoned");
        if state.initialize_accepted {
            state.initialized = true;
        }
    }

    fn handle_session_start(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params = parse_params(params)?;
        let response = self
            .runtime
            .start_session(params)
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    fn handle_capability_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: CapabilityListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_capabilities(params)
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
    // agent_session handlers 已提取到 processor/agent_session.rs
    // workspace + session_file handlers 已提取到 processor/workspace.rs
    // skill handlers 已提取到 processor/skill.rs

    // gateway handlers 已提取到 processor/gateway.rs
    async fn handle_telegram_channel_probe(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ChannelProbeParams = parse_params(params)?;
        let response = self
            .runtime
            .probe_telegram_channel(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_feishu_channel_probe(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ChannelProbeParams = parse_params(params)?;
        let response = self
            .runtime
            .probe_feishu_channel(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_discord_channel_probe(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ChannelProbeParams = parse_params(params)?;
        let response = self
            .runtime
            .probe_discord_channel(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    // wechat handlers 已提取到 processor/wechat.rs

    // media handlers 已提取到 processor/media.rs
    // gallery handlers 已提取到 processor/gallery.rs

    // log handlers 已提取到 processor/log.rs

    // diagnostics handlers 已提取到 processor/diagnostics.rs

    async fn handle_usage_stats_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UsageStatsRangeParams = parse_params(params)?;
        let response = self
            .runtime
            .read_usage_stats(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_usage_stats_model_ranking_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UsageStatsRangeParams = parse_params(params)?;
        let response = self
            .runtime
            .list_usage_stats_model_ranking(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_usage_stats_daily_trends_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: UsageStatsRangeParams = parse_params(params)?;
        let response = self
            .runtime
            .list_usage_stats_daily_trends(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    // connect handlers 已提取到 processor/connect.rs

    fn handle_artifact_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ArtifactReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_artifacts(params)
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
    // file system handlers 已提取到 processor/file.rs

    // project_git handlers 已提取到 processor/project_git.rs

    async fn handle_evidence_export(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: EvidenceExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_evidence(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_handoff_bundle_export(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionHandoffBundleExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_handoff_bundle(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_replay_case_export(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionReplayCaseExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_replay_case(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_analysis_handoff_export(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionAnalysisHandoffExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_analysis_handoff(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_review_decision_template_export(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionReviewDecisionTemplateExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_review_decision_template(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_review_decision_save(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionReviewDecisionSaveParams = parse_params(params)?;
        let response = self
            .runtime
            .save_review_decision(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_turn_start(
        &self,
        params: Option<serde_json::Value>,
        event_callback: Option<&mut (dyn FnMut(JsonRpcMessage) + Send)>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params = parse_params(params)?;
        let host = self.runtime_host_context();
        if let Some(event_callback) = event_callback {
            let mut runtime_event_callback = |event: AgentEvent| {
                let message = event_notification_jsonrpc(event).map_err(|error| {
                    RuntimeCoreError::Backend(format!(
                        "failed to serialize streaming event notification: {}",
                        error.message
                    ))
                })?;
                event_callback(message);
                Ok(())
            };
            let output = self
                .runtime
                .start_turn_with_event_callback(params, host, &mut runtime_event_callback)
                .await
                .map_err(to_jsonrpc_error)?;
            dispatch_result(output.response)
        } else {
            let output = self
                .runtime
                .start_turn(params, host)
                .await
                .map_err(to_jsonrpc_error)?;
            dispatch_result_with_events(output.response, output.events)
        }
    }

    async fn handle_turn_cancel(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params = parse_params(params)?;
        let host = self.runtime_host_context();
        let output = self
            .runtime
            .cancel_turn(params, host)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    async fn handle_action_respond(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionActionRespondParams = parse_params(params)?;
        let host = self.runtime_host_context();
        let output = self
            .runtime
            .respond_action(params, host)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    async fn handle_action_replay(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionActionReplayParams = parse_params(params)?;
        let output = self
            .runtime
            .replay_action(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result_with_events(output.response, output.events)
    }

    fn initialize(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, JsonRpcError> {
        let params: InitializeParams = parse_params(params)?;
        let mut state = self.state.lock().expect("app-server state mutex poisoned");
        if state.initialize_accepted {
            return Err(JsonRpcError::new(
                error_codes::ALREADY_INITIALIZED,
                "initialize has already been accepted",
            ));
        }

        state.initialize_accepted = true;
        state.client_info = Some(params.client_info);

        serialize_result(InitializeResponse {
            server_info: ServerInfo {
                name: SERVER_NAME.to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
                protocol_version: PROTOCOL_VERSION.to_string(),
            },
            platform: PlatformInfo {
                family: "desktop".to_string(),
                os: std::env::consts::OS.to_string(),
            },
            capabilities: ServerCapabilities {
                agent_session: true,
                capability_discovery: true,
                artifact: true,
                evidence: true,
                workspace: false,
            },
        })
    }

    fn ensure_initialized(&self) -> Result<(), JsonRpcError> {
        let initialized = self
            .state
            .lock()
            .expect("app-server state mutex poisoned")
            .initialized;
        if !initialized {
            return Err(JsonRpcError::new(
                error_codes::NOT_INITIALIZED,
                "initialize and initialized must complete before business methods",
            ));
        }
        Ok(())
    }

    fn client_info(&self) -> Option<ClientInfo> {
        self.state
            .lock()
            .expect("app-server state mutex poisoned")
            .client_info
            .clone()
    }

    pub(super) fn runtime_host_context(&self) -> RuntimeHostContext {
        RuntimeHostContext::from(self.client_info())
    }
}

pub fn event_notification_jsonrpc(event: AgentEvent) -> Result<JsonRpcMessage, JsonRpcError> {
    let params = serde_json::to_value(AgentSessionEventParams { event }).map_err(|error| {
        JsonRpcError::new(
            error_codes::RUNTIME_ERROR,
            format!("failed to serialize event notification: {error}"),
        )
    })?;
    Ok(JsonRpcMessage::Notification(JsonRpcNotification::new(
        METHOD_AGENT_SESSION_EVENT,
        Some(params),
    )))
}

pub(super) fn parse_params<T>(params: Option<serde_json::Value>) -> Result<T, JsonRpcError>
where
    T: DeserializeOwned,
{
    serde_json::from_value(params.unwrap_or_else(|| serde_json::json!({}))).map_err(|error| {
        JsonRpcError::new(
            error_codes::INVALID_PARAMS,
            format!("invalid params: {error}"),
        )
    })
}

fn serialize_result(value: impl Serialize) -> Result<serde_json::Value, JsonRpcError> {
    serde_json::to_value(value).map_err(|error| {
        JsonRpcError::new(
            error_codes::RUNTIME_ERROR,
            format!("failed to serialize response: {error}"),
        )
    })
}

pub(super) struct RpcDispatch {
    result: serde_json::Value,
    events: Vec<AgentEvent>,
    notifications: Vec<JsonRpcNotification>,
}

impl RpcDispatch {
    fn single(result: serde_json::Value) -> Self {
        Self {
            result,
            events: Vec::new(),
            notifications: Vec::new(),
        }
    }

    pub(super) fn with_notification(mut self, notification: JsonRpcNotification) -> Self {
        self.notifications.push(notification);
        self
    }
}

pub(super) fn dispatch_result(value: impl Serialize) -> Result<RpcDispatch, JsonRpcError> {
    Ok(RpcDispatch::single(serialize_result(value)?))
}

pub(super) fn dispatch_result_with_events(
    value: impl Serialize,
    events: Vec<AgentEvent>,
) -> Result<RpcDispatch, JsonRpcError> {
    Ok(RpcDispatch {
        result: serialize_result(value)?,
        events,
        notifications: Vec::new(),
    })
}

pub(super) fn workspace_right_surface_pending_changed_notification(
    params: app_server_protocol::WorkspaceRightSurfacePendingChangedParams,
) -> Result<JsonRpcNotification, JsonRpcError> {
    let params = serde_json::to_value(params).map_err(|error| {
        JsonRpcError::new(
            error_codes::RUNTIME_ERROR,
            format!("failed to serialize workspace right surface notification: {error}"),
        )
    })?;
    Ok(JsonRpcNotification::new(
        METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED,
        Some(params),
    ))
}

fn event_notification(event: AgentEvent) -> Result<JsonRpcMessage, AppServerError> {
    Ok(JsonRpcMessage::Notification(JsonRpcNotification::new(
        METHOD_AGENT_SESSION_EVENT,
        Some(serde_json::to_value(AgentSessionEventParams { event })?),
    )))
}

pub(super) fn to_jsonrpc_error(error: RuntimeCoreError) -> JsonRpcError {
    error.into_jsonrpc_error()
}

#[cfg(test)]
mod tests;
