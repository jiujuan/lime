use crate::AppServerError;
use crate::RuntimeCore;
use crate::RuntimeCoreError;
use crate::RuntimeHostContext;
use app_server_protocol::error_codes;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSessionActionRespondParams;
use app_server_protocol::AgentSessionEventParams;
use app_server_protocol::AgentSessionListParams;
use app_server_protocol::ArtifactReadParams;
use app_server_protocol::CapabilityListParams;
use app_server_protocol::ClientInfo;
use app_server_protocol::EvidenceExportParams;
use app_server_protocol::InitializeParams;
use app_server_protocol::InitializeResponse;
use app_server_protocol::JsonRpcError;
use app_server_protocol::JsonRpcErrorResponse;
use app_server_protocol::JsonRpcMessage;
use app_server_protocol::JsonRpcNotification;
use app_server_protocol::JsonRpcRequest;
use app_server_protocol::JsonRpcResponse;
use app_server_protocol::KnowledgeListPacksParams;
use app_server_protocol::ModelListParams;
use app_server_protocol::ModelProviderAliasReadParams;
use app_server_protocol::PlatformInfo;
use app_server_protocol::ProjectMemoryReadParams;
use app_server_protocol::ServerCapabilities;
use app_server_protocol::ServerInfo;
use app_server_protocol::SkillReadParams;
use app_server_protocol::WorkspaceEnsureParams;
use app_server_protocol::WorkspacePathReadParams;
use app_server_protocol::WorkspaceProjectPathResolveParams;
use app_server_protocol::WorkspaceReadParams;
use app_server_protocol::WorkspaceSkillBindingsListParams;
use app_server_protocol::METHOD_AGENT_APP_INSTALLED_LIST;
use app_server_protocol::METHOD_AGENT_SESSION_ACTION_RESPOND;
use app_server_protocol::METHOD_AGENT_SESSION_EVENT;
use app_server_protocol::METHOD_AGENT_SESSION_LIST;
use app_server_protocol::METHOD_AGENT_SESSION_READ;
use app_server_protocol::METHOD_AGENT_SESSION_START;
use app_server_protocol::METHOD_AGENT_SESSION_TURN_CANCEL;
use app_server_protocol::METHOD_AGENT_SESSION_TURN_START;
use app_server_protocol::METHOD_ARTIFACT_READ;
use app_server_protocol::METHOD_AUTOMATION_JOB_LIST;
use app_server_protocol::METHOD_CAPABILITY_LIST;
use app_server_protocol::METHOD_EVIDENCE_EXPORT;
use app_server_protocol::METHOD_INITIALIZE;
use app_server_protocol::METHOD_INITIALIZED;
use app_server_protocol::METHOD_KNOWLEDGE_PACK_LIST;
use app_server_protocol::METHOD_MODEL_LIST;
use app_server_protocol::METHOD_MODEL_PREFERENCES_LIST;
use app_server_protocol::METHOD_MODEL_PROVIDER_ALIAS_LIST;
use app_server_protocol::METHOD_MODEL_PROVIDER_ALIAS_READ;
use app_server_protocol::METHOD_MODEL_PROVIDER_CATALOG_LIST;
use app_server_protocol::METHOD_MODEL_PROVIDER_LIST;
use app_server_protocol::METHOD_MODEL_SYNC_STATE_READ;
use app_server_protocol::METHOD_PROJECT_MEMORY_READ;
use app_server_protocol::METHOD_SKILL_LIST;
use app_server_protocol::METHOD_SKILL_READ;
use app_server_protocol::METHOD_WORKSPACE_BY_PATH_READ;
use app_server_protocol::METHOD_WORKSPACE_DEFAULT_ENSURE;
use app_server_protocol::METHOD_WORKSPACE_DEFAULT_READ;
use app_server_protocol::METHOD_WORKSPACE_ENSURE_READY;
use app_server_protocol::METHOD_WORKSPACE_LIST;
use app_server_protocol::METHOD_WORKSPACE_PROJECTS_ROOT_READ;
use app_server_protocol::METHOD_WORKSPACE_PROJECT_PATH_RESOLVE;
use app_server_protocol::METHOD_WORKSPACE_READ;
use app_server_protocol::METHOD_WORKSPACE_SKILL_BINDINGS_LIST;
use app_server_protocol::PROTOCOL_VERSION;
use app_server_protocol::SERVER_NAME;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::sync::Arc;
use std::sync::Mutex;

#[derive(Clone)]
pub struct RequestProcessor {
    state: Arc<Mutex<ProcessorState>>,
    runtime: RuntimeCore,
}

#[derive(Debug, Default)]
struct ProcessorState {
    initialize_accepted: bool,
    initialized: bool,
    client_info: Option<ClientInfo>,
}

impl RequestProcessor {
    pub fn new(runtime: RuntimeCore) -> Self {
        Self {
            state: Arc::new(Mutex::new(ProcessorState::default())),
            runtime,
        }
    }

    pub fn runtime(&self) -> &RuntimeCore {
        &self.runtime
    }

    pub async fn handle_request(
        &self,
        request: JsonRpcRequest,
    ) -> Result<Vec<JsonRpcMessage>, AppServerError> {
        self.handle_request_inner(request, None).await
    }

    pub async fn handle_request_streaming(
        &self,
        request: JsonRpcRequest,
        event_callback: &mut (dyn FnMut(JsonRpcMessage) + Send),
    ) -> Result<Vec<JsonRpcMessage>, AppServerError> {
        self.handle_request_inner(request, Some(event_callback))
            .await
    }

    async fn handle_request_inner(
        &self,
        request: JsonRpcRequest,
        event_callback: Option<&mut (dyn FnMut(JsonRpcMessage) + Send)>,
    ) -> Result<Vec<JsonRpcMessage>, AppServerError> {
        let JsonRpcRequest { id, method, params } = request;
        let result = match method.as_str() {
            METHOD_INITIALIZE => self.initialize(params).map(RpcDispatch::single),
            METHOD_CAPABILITY_LIST => self.handle_capability_list(params),
            METHOD_ARTIFACT_READ => self.handle_artifact_read(params),
            METHOD_EVIDENCE_EXPORT => self.handle_evidence_export(params).await,
            METHOD_AGENT_SESSION_LIST => self.handle_session_list(params).await,
            METHOD_AGENT_SESSION_START => self.handle_session_start(params),
            METHOD_AGENT_SESSION_READ => self.handle_session_read(params).await,
            METHOD_WORKSPACE_LIST => self.handle_workspace_list().await,
            METHOD_WORKSPACE_READ => self.handle_workspace_read(params).await,
            METHOD_WORKSPACE_BY_PATH_READ => self.handle_workspace_by_path_read(params).await,
            METHOD_WORKSPACE_DEFAULT_READ => self.handle_workspace_default_read().await,
            METHOD_WORKSPACE_DEFAULT_ENSURE => self.handle_workspace_default_ensure().await,
            METHOD_WORKSPACE_PROJECTS_ROOT_READ => self.handle_workspace_projects_root_read().await,
            METHOD_WORKSPACE_PROJECT_PATH_RESOLVE => {
                self.handle_workspace_project_path_resolve(params).await
            }
            METHOD_WORKSPACE_ENSURE_READY => self.handle_workspace_ensure_ready(params).await,
            METHOD_SKILL_LIST => self.handle_skill_list().await,
            METHOD_SKILL_READ => self.handle_skill_read(params).await,
            METHOD_WORKSPACE_SKILL_BINDINGS_LIST => {
                self.handle_workspace_skill_bindings_list(params).await
            }
            METHOD_AGENT_APP_INSTALLED_LIST => self.handle_agent_app_installed_list().await,
            METHOD_KNOWLEDGE_PACK_LIST => self.handle_knowledge_pack_list(params).await,
            METHOD_AUTOMATION_JOB_LIST => self.handle_automation_job_list().await,
            METHOD_PROJECT_MEMORY_READ => self.handle_project_memory_read(params).await,
            METHOD_MODEL_LIST => self.handle_model_list(params).await,
            METHOD_MODEL_PREFERENCES_LIST => self.handle_model_preferences_list().await,
            METHOD_MODEL_SYNC_STATE_READ => self.handle_model_sync_state_read().await,
            METHOD_MODEL_PROVIDER_LIST => self.handle_model_provider_list().await,
            METHOD_MODEL_PROVIDER_CATALOG_LIST => self.handle_model_provider_catalog_list().await,
            METHOD_MODEL_PROVIDER_ALIAS_READ => self.handle_model_provider_alias_read(params).await,
            METHOD_MODEL_PROVIDER_ALIAS_LIST => self.handle_model_provider_alias_list().await,
            METHOD_AGENT_SESSION_TURN_START => self.handle_turn_start(params, event_callback).await,
            METHOD_AGENT_SESSION_TURN_CANCEL => self.handle_turn_cancel(params).await,
            METHOD_AGENT_SESSION_ACTION_RESPOND => self.handle_action_respond(params).await,
            _ => Err(JsonRpcError::new(
                error_codes::METHOD_NOT_FOUND,
                format!("method not found: {method}"),
            )),
        };

        match result {
            Ok(dispatch) => {
                let mut messages = Vec::with_capacity(dispatch.events.len() + 1);
                messages.push(JsonRpcMessage::Response(JsonRpcResponse {
                    id,
                    result: dispatch.result,
                }));
                for event in dispatch.events {
                    messages.push(event_notification(event)?);
                }
                Ok(messages)
            }
            Err(error) => Ok(vec![JsonRpcMessage::Error(JsonRpcErrorResponse {
                id,
                error,
            })]),
        }
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

    async fn handle_session_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_agent_sessions(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_session_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params = parse_params(params)?;
        let response = self
            .runtime
            .read_session_current(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_workspaces()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_workspace(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_by_path_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspacePathReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_workspace_by_path(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_default_read(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_default_workspace()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_default_ensure(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .ensure_default_workspace()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_projects_root_read(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_workspace_projects_root()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_project_path_resolve(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceProjectPathResolveParams = parse_params(params)?;
        let response = self
            .runtime
            .resolve_workspace_project_path(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_ensure_ready(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceEnsureParams = parse_params(params)?;
        let response = self
            .runtime
            .ensure_workspace_ready(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self.runtime.list_skills().await.map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_skill_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: SkillReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_skill(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_workspace_skill_bindings_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceSkillBindingsListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_workspace_skill_bindings(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_installed_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_agent_app_installed()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_pack_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeListPacksParams = parse_params(params)?;
        let response = self
            .runtime
            .list_knowledge_packs(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_automation_jobs()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_project_memory_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ProjectMemoryReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_project_memory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_models(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_preferences_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_model_preferences()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_sync_state_read(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_model_sync_state()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_model_providers()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_catalog_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_model_provider_catalog()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_alias_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderAliasReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_model_provider_alias(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_alias_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_model_provider_aliases()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

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

    fn runtime_host_context(&self) -> RuntimeHostContext {
        let client_info = self
            .state
            .lock()
            .expect("app-server state mutex poisoned")
            .client_info
            .clone();
        RuntimeHostContext::from(client_info)
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

fn parse_params<T>(params: Option<serde_json::Value>) -> Result<T, JsonRpcError>
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

struct RpcDispatch {
    result: serde_json::Value,
    events: Vec<AgentEvent>,
}

impl RpcDispatch {
    fn single(result: serde_json::Value) -> Self {
        Self {
            result,
            events: Vec::new(),
        }
    }
}

fn dispatch_result(value: impl Serialize) -> Result<RpcDispatch, JsonRpcError> {
    Ok(RpcDispatch::single(serialize_result(value)?))
}

fn dispatch_result_with_events(
    value: impl Serialize,
    events: Vec<AgentEvent>,
) -> Result<RpcDispatch, JsonRpcError> {
    Ok(RpcDispatch {
        result: serialize_result(value)?,
        events,
    })
}

fn event_notification(event: AgentEvent) -> Result<JsonRpcMessage, AppServerError> {
    Ok(JsonRpcMessage::Notification(JsonRpcNotification::new(
        METHOD_AGENT_SESSION_EVENT,
        Some(serde_json::to_value(AgentSessionEventParams { event })?),
    )))
}

fn to_jsonrpc_error(error: RuntimeCoreError) -> JsonRpcError {
    error.into_jsonrpc_error()
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::AgentSessionStartParams;
    use app_server_protocol::CapabilityDescriptor;
    use app_server_protocol::ClientCapabilities;
    use app_server_protocol::JsonRpcMessage;
    use app_server_protocol::RequestId;
    use serde_json::json;
    use std::sync::Arc;

    struct ScopedCapabilitySource;

    impl crate::CapabilitySource for ScopedCapabilitySource {
        fn list_capabilities(
            &self,
            context: &crate::CapabilityListContext,
        ) -> Vec<CapabilityDescriptor> {
            vec![CapabilityDescriptor {
                id: format!("scoped.{}", context.app_id.as_deref().unwrap_or("unscoped")),
                title: "Scoped Capability".to_string(),
                description: context.workspace_id.clone(),
                methods: vec![METHOD_AGENT_SESSION_START.to_string()],
            }]
        }
    }

    #[tokio::test]
    async fn capability_list_requires_initialized_and_returns_minimal_descriptors() {
        let runtime = RuntimeCore::with_backend_and_capability_source(
            Arc::new(crate::MockBackend),
            Arc::new(ScopedCapabilitySource),
        );
        let processor = RequestProcessor::new(runtime);

        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_CAPABILITY_LIST,
                Some(json!({})),
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

        let messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_CAPABILITY_LIST,
                Some(json!({
                    "appId": "content-studio",
                    "workspaceId": "workspace-main",
                })),
            ))
            .await
            .expect("capability list response");

        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(
                    response.result["capabilities"][0]["id"],
                    "scoped.content-studio"
                );
                assert_eq!(
                    response.result["capabilities"][0]["description"],
                    "workspace-main"
                );
                assert_eq!(
                    response.result["capabilities"][0]["methods"][0],
                    METHOD_AGENT_SESSION_START
                );
            }
            other => panic!("expected response, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn artifact_read_requires_initialized_and_returns_artifact_summaries() {
        let runtime = RuntimeCore::default();
        runtime
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_artifact".to_string()),
                thread_id: Some("thread_artifact".to_string()),
                app_id: "content-studio".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session");
        runtime
            .append_external_runtime_events(
                "sess_artifact",
                None,
                vec![crate::RuntimeEvent::new(
                    "artifact.snapshot",
                    json!({
                        "artifactId": "artifact-report",
                        "filePath": ".app-server/artifacts/report.md",
                        "title": "Report",
                        "kind": "markdown",
                        "status": "ready",
                        "content": "# Report",
                    }),
                )],
            )
            .expect("artifact event");

        let processor = RequestProcessor::new(runtime);
        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_ARTIFACT_READ,
                Some(json!({ "sessionId": "sess_artifact" })),
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

        let messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_ARTIFACT_READ,
                Some(json!({
                    "sessionId": "sess_artifact",
                    "artifactRef": "artifact-report",
                })),
            ))
            .await
            .expect("artifact read response");

        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(
                    response.result["artifacts"][0]["artifactRef"],
                    "artifact-report"
                );
                assert_eq!(
                    response.result["artifacts"][0]["path"],
                    ".app-server/artifacts/report.md"
                );
                assert_eq!(response.result["artifacts"][0]["title"], "Report");
                assert_eq!(
                    response.result["artifacts"][0]["contentStatus"],
                    "notRequested"
                );
                assert!(response.result["artifacts"][0].get("content").is_none());
            }
            other => panic!("expected response, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn evidence_export_requires_initialized_and_returns_read_model_snapshot() {
        let runtime = RuntimeCore::default();
        runtime
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_evidence".to_string()),
                thread_id: Some("thread_evidence".to_string()),
                app_id: "content-studio".to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session");
        runtime
            .start_turn(
                app_server_protocol::AgentSessionTurnStartParams {
                    session_id: "sess_evidence".to_string(),
                    turn_id: Some("turn_evidence".to_string()),
                    input: app_server_protocol::AgentInput {
                        text: "draft".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("turn");
        runtime
            .append_external_runtime_events(
                "sess_evidence",
                Some("turn_evidence"),
                vec![
                    crate::RuntimeEvent::new(
                        "message.delta",
                        json!({
                            "text": "draft",
                            "evidenceRefs": ["evidence://sess_evidence/runtime"]
                        }),
                    ),
                    crate::RuntimeEvent::new(
                        "artifact.snapshot",
                        json!({
                            "artifactId": "artifact-report",
                            "path": ".app-server/artifacts/report.md",
                            "content": "# Report"
                        }),
                    ),
                ],
            )
            .expect("evidence events");

        let processor = RequestProcessor::new(runtime);
        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_EVIDENCE_EXPORT,
                Some(json!({ "sessionId": "sess_evidence" })),
            ))
            .await
            .expect("blocked response");
        assert!(matches!(
            &blocked[0],
            JsonRpcMessage::Error(error) if error.error.code == error_codes::NOT_INITIALIZED
        ));

        let initialize = processor
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
        match &initialize[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["capabilities"]["evidence"], true);
            }
            other => panic!("expected initialize response, got {other:?}"),
        }
        processor.handle_notification(JsonRpcNotification::new(
            METHOD_INITIALIZED,
            Some(json!({})),
        ));

        let messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_EVIDENCE_EXPORT,
                Some(json!({
                    "sessionId": "sess_evidence",
                    "turnId": "turn_evidence",
                    "includeEvents": true,
                    "includeArtifacts": true
                })),
            ))
            .await
            .expect("evidence export response");

        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["session"]["sessionId"], "sess_evidence");
                assert_eq!(response.result["events"].as_array().unwrap().len(), 3);
                assert_eq!(
                    response.result["artifacts"][0]["artifactRef"],
                    "artifact-report"
                );
                assert!(response.result["artifacts"][0].get("content").is_none());
                assert!(!response.result["exportedAt"].as_str().unwrap().is_empty());
                assert!(response.result.get("threadStatus").is_none());
                assert!(response.result.get("completionAuditSummary").is_none());
            }
            other => panic!("expected response, got {other:?}"),
        }
    }
}
