use crate::AppServerError;
use crate::RuntimeCore;
use crate::RuntimeCoreError;
use crate::RuntimeHostContext;
use app_server_protocol::error_codes;
use app_server_protocol::AgentAppFetchCloudPackageParams;
use app_server_protocol::AgentAppInstalledDisabledSetParams;
use app_server_protocol::AgentAppInstalledSaveParams;
use app_server_protocol::AgentAppLocalPackageInspectParams;
use app_server_protocol::AgentAppShellPrepareParams;
use app_server_protocol::AgentAppUiRuntimeStartParams;
use app_server_protocol::AgentAppUiRuntimeStatusParams;
use app_server_protocol::AgentAppUiRuntimeStopParams;
use app_server_protocol::AgentAppUninstallParams;
use app_server_protocol::AgentAppUninstallRehearsalParams;
use app_server_protocol::AgentEvent;
use app_server_protocol::AgentSessionActionRespondParams;
use app_server_protocol::AgentSessionEventParams;
use app_server_protocol::AgentSessionListParams;
use app_server_protocol::AgentSessionUpdateParams;
use app_server_protocol::ArtifactReadParams;
use app_server_protocol::AutomationJobCreateParams;
use app_server_protocol::AutomationJobHealthParams;
use app_server_protocol::AutomationJobIdParams;
use app_server_protocol::AutomationJobRunHistoryParams;
use app_server_protocol::AutomationJobUpdateParams;
use app_server_protocol::AutomationScheduleParams;
use app_server_protocol::AutomationSchedulerConfigUpdateParams;
use app_server_protocol::CapabilityListParams;
use app_server_protocol::ClientInfo;
use app_server_protocol::ConnectCallbackSendParams;
use app_server_protocol::ConnectDeepLinkResolveParams;
use app_server_protocol::ConnectOpenDeepLinkResolveParams;
use app_server_protocol::ConnectRelayApiKeySaveParams;
use app_server_protocol::EvidenceExportParams;
use app_server_protocol::FileSystemCreateDirectoryParams;
use app_server_protocol::FileSystemCreateFileParams;
use app_server_protocol::FileSystemDeleteFileParams;
use app_server_protocol::FileSystemListDirectoryParams;
use app_server_protocol::FileSystemReadFilePreviewParams;
use app_server_protocol::FileSystemRenameFileParams;
use app_server_protocol::InitializeParams;
use app_server_protocol::InitializeResponse;
use app_server_protocol::JsonRpcError;
use app_server_protocol::JsonRpcErrorResponse;
use app_server_protocol::JsonRpcMessage;
use app_server_protocol::JsonRpcNotification;
use app_server_protocol::JsonRpcRequest;
use app_server_protocol::JsonRpcResponse;
use app_server_protocol::KnowledgeCompilePackParams;
use app_server_protocol::KnowledgeImportSourceParams;
use app_server_protocol::KnowledgeListPacksParams;
use app_server_protocol::KnowledgeReadPackParams;
use app_server_protocol::KnowledgeResolveContextParams;
use app_server_protocol::KnowledgeSetDefaultPackParams;
use app_server_protocol::KnowledgeUpdatePackStatusParams;
use app_server_protocol::KnowledgeValidateContextRunParams;
use app_server_protocol::McpPromptGetParams;
use app_server_protocol::McpResourceReadParams;
use app_server_protocol::McpServerCreateParams;
use app_server_protocol::McpServerDeleteParams;
use app_server_protocol::McpServerEnabledSetParams;
use app_server_protocol::McpServerImportFromAppParams;
use app_server_protocol::McpServerStartParams;
use app_server_protocol::McpServerStopParams;
use app_server_protocol::McpServerUpdateParams;
use app_server_protocol::McpToolCallParams;
use app_server_protocol::McpToolCallWithCallerParams;
use app_server_protocol::McpToolListForContextParams;
use app_server_protocol::McpToolSearchParams;
use app_server_protocol::ModelListParams;
use app_server_protocol::ModelProviderAliasReadParams;
use app_server_protocol::ModelProviderConfigExportParams;
use app_server_protocol::ModelProviderConfigImportParams;
use app_server_protocol::ModelProviderCreateParams;
use app_server_protocol::ModelProviderDeleteParams;
use app_server_protocol::ModelProviderFetchModelsParams;
use app_server_protocol::ModelProviderKeyCreateParams;
use app_server_protocol::ModelProviderKeyDeleteParams;
use app_server_protocol::ModelProviderKeyEventParams;
use app_server_protocol::ModelProviderKeyNextParams;
use app_server_protocol::ModelProviderKeyUpdateParams;
use app_server_protocol::ModelProviderReadParams;
use app_server_protocol::ModelProviderSortOrdersUpdateParams;
use app_server_protocol::ModelProviderTestChatParams;
use app_server_protocol::ModelProviderTestConnectionParams;
use app_server_protocol::ModelProviderUiStateReadParams;
use app_server_protocol::ModelProviderUiStateWriteParams;
use app_server_protocol::ModelProviderUpdateParams;
use app_server_protocol::PlatformInfo;
use app_server_protocol::ProjectMemoryReadParams;
use app_server_protocol::ServerCapabilities;
use app_server_protocol::ServerInfo;
use app_server_protocol::SkillReadParams;
use app_server_protocol::UsageStatsRangeParams;
use app_server_protocol::WorkspaceEnsureParams;
use app_server_protocol::WorkspacePathReadParams;
use app_server_protocol::WorkspaceProjectPathResolveParams;
use app_server_protocol::WorkspaceReadParams;
use app_server_protocol::WorkspaceRegisteredSkillsListParams;
use app_server_protocol::WorkspaceSkillBindingsListParams;
use app_server_protocol::METHOD_AGENT_APP_INSTALLED_DISABLED_SET;
use app_server_protocol::METHOD_AGENT_APP_INSTALLED_LIST;
use app_server_protocol::METHOD_AGENT_APP_INSTALLED_SAVE;
use app_server_protocol::METHOD_AGENT_APP_INSTALLED_UNINSTALL;
use app_server_protocol::METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL;
use app_server_protocol::METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT;
use app_server_protocol::METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD;
use app_server_protocol::METHOD_AGENT_APP_SHELL_PREPARE;
use app_server_protocol::METHOD_AGENT_APP_UI_RUNTIME_START;
use app_server_protocol::METHOD_AGENT_APP_UI_RUNTIME_STATUS;
use app_server_protocol::METHOD_AGENT_APP_UI_RUNTIME_STOP;
use app_server_protocol::METHOD_AGENT_SESSION_ACTION_RESPOND;
use app_server_protocol::METHOD_AGENT_SESSION_EVENT;
use app_server_protocol::METHOD_AGENT_SESSION_LIST;
use app_server_protocol::METHOD_AGENT_SESSION_READ;
use app_server_protocol::METHOD_AGENT_SESSION_START;
use app_server_protocol::METHOD_AGENT_SESSION_TURN_CANCEL;
use app_server_protocol::METHOD_AGENT_SESSION_TURN_START;
use app_server_protocol::METHOD_AGENT_SESSION_UPDATE;
use app_server_protocol::METHOD_ARTIFACT_READ;
use app_server_protocol::METHOD_AUTOMATION_JOB_CREATE;
use app_server_protocol::METHOD_AUTOMATION_JOB_DELETE;
use app_server_protocol::METHOD_AUTOMATION_JOB_HEALTH;
use app_server_protocol::METHOD_AUTOMATION_JOB_LIST;
use app_server_protocol::METHOD_AUTOMATION_JOB_READ;
use app_server_protocol::METHOD_AUTOMATION_JOB_RUN_HISTORY;
use app_server_protocol::METHOD_AUTOMATION_JOB_RUN_NOW;
use app_server_protocol::METHOD_AUTOMATION_JOB_UPDATE;
use app_server_protocol::METHOD_AUTOMATION_SCHEDULER_CONFIG_READ;
use app_server_protocol::METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE;
use app_server_protocol::METHOD_AUTOMATION_SCHEDULER_STATUS;
use app_server_protocol::METHOD_AUTOMATION_SCHEDULE_PREVIEW;
use app_server_protocol::METHOD_AUTOMATION_SCHEDULE_VALIDATE;
use app_server_protocol::METHOD_CAPABILITY_LIST;
use app_server_protocol::METHOD_CONNECT_CALLBACK_SEND;
use app_server_protocol::METHOD_CONNECT_DEEP_LINK_RESOLVE;
use app_server_protocol::METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE;
use app_server_protocol::METHOD_CONNECT_RELAY_API_KEY_SAVE;
use app_server_protocol::METHOD_EVIDENCE_EXPORT;
use app_server_protocol::METHOD_FILE_SYSTEM_CREATE_DIRECTORY;
use app_server_protocol::METHOD_FILE_SYSTEM_CREATE_FILE;
use app_server_protocol::METHOD_FILE_SYSTEM_DELETE_FILE;
use app_server_protocol::METHOD_FILE_SYSTEM_LIST_DIRECTORY;
use app_server_protocol::METHOD_FILE_SYSTEM_READ_FILE_PREVIEW;
use app_server_protocol::METHOD_FILE_SYSTEM_RENAME_FILE;
use app_server_protocol::METHOD_INITIALIZE;
use app_server_protocol::METHOD_INITIALIZED;
use app_server_protocol::METHOD_KNOWLEDGE_CONTEXT_RESOLVE;
use app_server_protocol::METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE;
use app_server_protocol::METHOD_KNOWLEDGE_PACK_COMPILE;
use app_server_protocol::METHOD_KNOWLEDGE_PACK_DEFAULT_SET;
use app_server_protocol::METHOD_KNOWLEDGE_PACK_LIST;
use app_server_protocol::METHOD_KNOWLEDGE_PACK_READ;
use app_server_protocol::METHOD_KNOWLEDGE_PACK_STATUS_UPDATE;
use app_server_protocol::METHOD_KNOWLEDGE_SOURCE_IMPORT;
use app_server_protocol::METHOD_MCP_PROMPT_GET;
use app_server_protocol::METHOD_MCP_PROMPT_LIST;
use app_server_protocol::METHOD_MCP_RESOURCE_LIST;
use app_server_protocol::METHOD_MCP_RESOURCE_READ;
use app_server_protocol::METHOD_MCP_SERVER_CREATE;
use app_server_protocol::METHOD_MCP_SERVER_DELETE;
use app_server_protocol::METHOD_MCP_SERVER_ENABLED_SET;
use app_server_protocol::METHOD_MCP_SERVER_IMPORT_FROM_APP;
use app_server_protocol::METHOD_MCP_SERVER_LIST;
use app_server_protocol::METHOD_MCP_SERVER_START;
use app_server_protocol::METHOD_MCP_SERVER_STATUS_LIST;
use app_server_protocol::METHOD_MCP_SERVER_STOP;
use app_server_protocol::METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE;
use app_server_protocol::METHOD_MCP_SERVER_UPDATE;
use app_server_protocol::METHOD_MCP_TOOL_CALL;
use app_server_protocol::METHOD_MCP_TOOL_CALL_WITH_CALLER;
use app_server_protocol::METHOD_MCP_TOOL_LIST;
use app_server_protocol::METHOD_MCP_TOOL_LIST_FOR_CONTEXT;
use app_server_protocol::METHOD_MCP_TOOL_SEARCH;
use app_server_protocol::METHOD_MODEL_LIST;
use app_server_protocol::METHOD_MODEL_PREFERENCES_LIST;
use app_server_protocol::METHOD_MODEL_PROVIDER_ALIAS_LIST;
use app_server_protocol::METHOD_MODEL_PROVIDER_ALIAS_READ;
use app_server_protocol::METHOD_MODEL_PROVIDER_CATALOG_LIST;
use app_server_protocol::METHOD_MODEL_PROVIDER_CONFIG_EXPORT;
use app_server_protocol::METHOD_MODEL_PROVIDER_CONFIG_IMPORT;
use app_server_protocol::METHOD_MODEL_PROVIDER_CREATE;
use app_server_protocol::METHOD_MODEL_PROVIDER_DELETE;
use app_server_protocol::METHOD_MODEL_PROVIDER_FETCH_MODELS;
use app_server_protocol::METHOD_MODEL_PROVIDER_KEY_CREATE;
use app_server_protocol::METHOD_MODEL_PROVIDER_KEY_DELETE;
use app_server_protocol::METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD;
use app_server_protocol::METHOD_MODEL_PROVIDER_KEY_NEXT;
use app_server_protocol::METHOD_MODEL_PROVIDER_KEY_UPDATE;
use app_server_protocol::METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD;
use app_server_protocol::METHOD_MODEL_PROVIDER_LIST;
use app_server_protocol::METHOD_MODEL_PROVIDER_READ;
use app_server_protocol::METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE;
use app_server_protocol::METHOD_MODEL_PROVIDER_TEST_CHAT;
use app_server_protocol::METHOD_MODEL_PROVIDER_TEST_CONNECTION;
use app_server_protocol::METHOD_MODEL_PROVIDER_UI_STATE_READ;
use app_server_protocol::METHOD_MODEL_PROVIDER_UI_STATE_WRITE;
use app_server_protocol::METHOD_MODEL_PROVIDER_UPDATE;
use app_server_protocol::METHOD_MODEL_SYNC_STATE_READ;
use app_server_protocol::METHOD_PROJECT_MEMORY_READ;
use app_server_protocol::METHOD_SKILL_LIST;
use app_server_protocol::METHOD_SKILL_READ;
use app_server_protocol::METHOD_USAGE_STATS_DAILY_TRENDS_LIST;
use app_server_protocol::METHOD_USAGE_STATS_MODEL_RANKING_LIST;
use app_server_protocol::METHOD_USAGE_STATS_READ;
use app_server_protocol::METHOD_WORKSPACE_BY_PATH_READ;
use app_server_protocol::METHOD_WORKSPACE_DEFAULT_ENSURE;
use app_server_protocol::METHOD_WORKSPACE_DEFAULT_READ;
use app_server_protocol::METHOD_WORKSPACE_ENSURE_READY;
use app_server_protocol::METHOD_WORKSPACE_LIST;
use app_server_protocol::METHOD_WORKSPACE_PROJECTS_ROOT_READ;
use app_server_protocol::METHOD_WORKSPACE_PROJECT_PATH_RESOLVE;
use app_server_protocol::METHOD_WORKSPACE_READ;
use app_server_protocol::METHOD_WORKSPACE_REGISTERED_SKILLS_LIST;
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
            METHOD_FILE_SYSTEM_LIST_DIRECTORY => {
                self.handle_file_system_list_directory(params).await
            }
            METHOD_FILE_SYSTEM_READ_FILE_PREVIEW => {
                self.handle_file_system_read_file_preview(params).await
            }
            METHOD_FILE_SYSTEM_CREATE_FILE => self.handle_file_system_create_file(params).await,
            METHOD_FILE_SYSTEM_CREATE_DIRECTORY => {
                self.handle_file_system_create_directory(params).await
            }
            METHOD_FILE_SYSTEM_RENAME_FILE => self.handle_file_system_rename_file(params).await,
            METHOD_FILE_SYSTEM_DELETE_FILE => self.handle_file_system_delete_file(params).await,
            METHOD_EVIDENCE_EXPORT => self.handle_evidence_export(params).await,
            METHOD_AGENT_SESSION_LIST => self.handle_session_list(params).await,
            METHOD_AGENT_SESSION_UPDATE => self.handle_session_update(params).await,
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
            METHOD_WORKSPACE_REGISTERED_SKILLS_LIST => {
                self.handle_workspace_registered_skills_list(params).await
            }
            METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT => {
                self.handle_agent_app_local_package_inspect(params).await
            }
            METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD => {
                self.handle_agent_app_package_fetch_cloud(params).await
            }
            METHOD_AGENT_APP_INSTALLED_SAVE => self.handle_agent_app_installed_save(params).await,
            METHOD_AGENT_APP_INSTALLED_LIST => self.handle_agent_app_installed_list().await,
            METHOD_AGENT_APP_INSTALLED_DISABLED_SET => {
                self.handle_agent_app_installed_disabled_set(params).await
            }
            METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL => {
                self.handle_agent_app_installed_uninstall_rehearsal(params)
                    .await
            }
            METHOD_AGENT_APP_INSTALLED_UNINSTALL => {
                self.handle_agent_app_installed_uninstall(params).await
            }
            METHOD_AGENT_APP_SHELL_PREPARE => self.handle_agent_app_shell_prepare(params).await,
            METHOD_AGENT_APP_UI_RUNTIME_START => {
                self.handle_agent_app_ui_runtime_start(params).await
            }
            METHOD_AGENT_APP_UI_RUNTIME_STATUS => {
                self.handle_agent_app_ui_runtime_status(params).await
            }
            METHOD_AGENT_APP_UI_RUNTIME_STOP => self.handle_agent_app_ui_runtime_stop(params).await,
            METHOD_KNOWLEDGE_PACK_LIST => self.handle_knowledge_pack_list(params).await,
            METHOD_KNOWLEDGE_PACK_READ => self.handle_knowledge_pack_read(params).await,
            METHOD_KNOWLEDGE_SOURCE_IMPORT => self.handle_knowledge_source_import(params).await,
            METHOD_KNOWLEDGE_PACK_COMPILE => self.handle_knowledge_pack_compile(params).await,
            METHOD_KNOWLEDGE_PACK_DEFAULT_SET => {
                self.handle_knowledge_pack_default_set(params).await
            }
            METHOD_KNOWLEDGE_PACK_STATUS_UPDATE => {
                self.handle_knowledge_pack_status_update(params).await
            }
            METHOD_KNOWLEDGE_CONTEXT_RESOLVE => self.handle_knowledge_context_resolve(params).await,
            METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE => {
                self.handle_knowledge_context_run_validate(params).await
            }
            METHOD_AUTOMATION_SCHEDULER_CONFIG_READ => {
                self.handle_automation_scheduler_config_read().await
            }
            METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE => {
                self.handle_automation_scheduler_config_update(params).await
            }
            METHOD_AUTOMATION_SCHEDULER_STATUS => self.handle_automation_scheduler_status().await,
            METHOD_AUTOMATION_JOB_LIST => self.handle_automation_job_list().await,
            METHOD_AUTOMATION_JOB_READ => self.handle_automation_job_read(params).await,
            METHOD_AUTOMATION_JOB_CREATE => self.handle_automation_job_create(params).await,
            METHOD_AUTOMATION_JOB_UPDATE => self.handle_automation_job_update(params).await,
            METHOD_AUTOMATION_JOB_DELETE => self.handle_automation_job_delete(params).await,
            METHOD_AUTOMATION_JOB_RUN_NOW => self.handle_automation_job_run_now(params).await,
            METHOD_AUTOMATION_JOB_HEALTH => self.handle_automation_job_health(params).await,
            METHOD_AUTOMATION_JOB_RUN_HISTORY => {
                self.handle_automation_job_run_history(params).await
            }
            METHOD_AUTOMATION_SCHEDULE_PREVIEW => {
                self.handle_automation_schedule_preview(params).await
            }
            METHOD_AUTOMATION_SCHEDULE_VALIDATE => {
                self.handle_automation_schedule_validate(params).await
            }
            METHOD_MCP_SERVER_LIST => self.handle_mcp_server_list().await,
            METHOD_MCP_SERVER_STATUS_LIST => self.handle_mcp_server_status_list().await,
            METHOD_MCP_SERVER_CREATE => self.handle_mcp_server_create(params).await,
            METHOD_MCP_SERVER_UPDATE => self.handle_mcp_server_update(params).await,
            METHOD_MCP_SERVER_DELETE => self.handle_mcp_server_delete(params).await,
            METHOD_MCP_SERVER_ENABLED_SET => self.handle_mcp_server_enabled_set(params).await,
            METHOD_MCP_SERVER_IMPORT_FROM_APP => {
                self.handle_mcp_server_import_from_app(params).await
            }
            METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE => self.handle_mcp_server_sync_all_to_live().await,
            METHOD_MCP_SERVER_START => self.handle_mcp_server_start(params).await,
            METHOD_MCP_SERVER_STOP => self.handle_mcp_server_stop(params).await,
            METHOD_MCP_TOOL_LIST => self.handle_mcp_tool_list().await,
            METHOD_MCP_TOOL_LIST_FOR_CONTEXT => self.handle_mcp_tool_list_for_context(params).await,
            METHOD_MCP_TOOL_SEARCH => self.handle_mcp_tool_search(params).await,
            METHOD_MCP_TOOL_CALL => self.handle_mcp_tool_call(params).await,
            METHOD_MCP_TOOL_CALL_WITH_CALLER => self.handle_mcp_tool_call_with_caller(params).await,
            METHOD_MCP_PROMPT_LIST => self.handle_mcp_prompt_list().await,
            METHOD_MCP_PROMPT_GET => self.handle_mcp_prompt_get(params).await,
            METHOD_MCP_RESOURCE_LIST => self.handle_mcp_resource_list().await,
            METHOD_MCP_RESOURCE_READ => self.handle_mcp_resource_read(params).await,
            METHOD_PROJECT_MEMORY_READ => self.handle_project_memory_read(params).await,
            METHOD_USAGE_STATS_READ => self.handle_usage_stats_read(params).await,
            METHOD_USAGE_STATS_MODEL_RANKING_LIST => {
                self.handle_usage_stats_model_ranking_list(params).await
            }
            METHOD_USAGE_STATS_DAILY_TRENDS_LIST => {
                self.handle_usage_stats_daily_trends_list(params).await
            }
            METHOD_MODEL_LIST => self.handle_model_list(params).await,
            METHOD_MODEL_PREFERENCES_LIST => self.handle_model_preferences_list().await,
            METHOD_MODEL_SYNC_STATE_READ => self.handle_model_sync_state_read().await,
            METHOD_MODEL_PROVIDER_LIST => self.handle_model_provider_list().await,
            METHOD_MODEL_PROVIDER_CATALOG_LIST => self.handle_model_provider_catalog_list().await,
            METHOD_MODEL_PROVIDER_READ => self.handle_model_provider_read(params).await,
            METHOD_MODEL_PROVIDER_CREATE => self.handle_model_provider_create(params).await,
            METHOD_MODEL_PROVIDER_UPDATE => self.handle_model_provider_update(params).await,
            METHOD_MODEL_PROVIDER_DELETE => self.handle_model_provider_delete(params).await,
            METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE => {
                self.handle_model_provider_sort_orders_update(params).await
            }
            METHOD_MODEL_PROVIDER_CONFIG_EXPORT => {
                self.handle_model_provider_config_export(params).await
            }
            METHOD_MODEL_PROVIDER_CONFIG_IMPORT => {
                self.handle_model_provider_config_import(params).await
            }
            METHOD_MODEL_PROVIDER_TEST_CONNECTION => {
                self.handle_model_provider_test_connection(params).await
            }
            METHOD_MODEL_PROVIDER_TEST_CHAT => self.handle_model_provider_test_chat(params).await,
            METHOD_MODEL_PROVIDER_FETCH_MODELS => {
                self.handle_model_provider_fetch_models(params).await
            }
            METHOD_MODEL_PROVIDER_KEY_CREATE => self.handle_model_provider_key_create(params).await,
            METHOD_MODEL_PROVIDER_KEY_UPDATE => self.handle_model_provider_key_update(params).await,
            METHOD_MODEL_PROVIDER_KEY_DELETE => self.handle_model_provider_key_delete(params).await,
            METHOD_MODEL_PROVIDER_KEY_NEXT => self.handle_model_provider_key_next(params).await,
            METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD => {
                self.handle_model_provider_key_usage_record(params).await
            }
            METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD => {
                self.handle_model_provider_key_error_record(params).await
            }
            METHOD_MODEL_PROVIDER_UI_STATE_READ => {
                self.handle_model_provider_ui_state_read(params).await
            }
            METHOD_MODEL_PROVIDER_UI_STATE_WRITE => {
                self.handle_model_provider_ui_state_write(params).await
            }
            METHOD_MODEL_PROVIDER_ALIAS_READ => self.handle_model_provider_alias_read(params).await,
            METHOD_MODEL_PROVIDER_ALIAS_LIST => self.handle_model_provider_alias_list().await,
            METHOD_CONNECT_DEEP_LINK_RESOLVE => self.handle_connect_deep_link_resolve(params).await,
            METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE => {
                self.handle_connect_open_deep_link_resolve(params).await
            }
            METHOD_CONNECT_RELAY_API_KEY_SAVE => {
                self.handle_connect_relay_api_key_save(params).await
            }
            METHOD_CONNECT_CALLBACK_SEND => self.handle_connect_callback_send(params).await,
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

    async fn handle_session_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentSessionUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_session_current(params)
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

    async fn handle_workspace_registered_skills_list(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: WorkspaceRegisteredSkillsListParams = parse_params(params)?;
        let response = self
            .runtime
            .list_workspace_registered_skills(params)
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

    async fn handle_agent_app_local_package_inspect(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppLocalPackageInspectParams = parse_params(params)?;
        let response = self
            .runtime
            .inspect_agent_app_local_package(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_package_fetch_cloud(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppFetchCloudPackageParams = parse_params(params)?;
        let response = self
            .runtime
            .fetch_agent_app_cloud_package(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_installed_save(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppInstalledSaveParams = parse_params(params)?;
        let response = self
            .runtime
            .save_agent_app_installed(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_installed_disabled_set(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppInstalledDisabledSetParams = parse_params(params)?;
        let response = self
            .runtime
            .set_agent_app_installed_disabled(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_installed_uninstall_rehearsal(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUninstallRehearsalParams = parse_params(params)?;
        let response = self
            .runtime
            .preview_agent_app_uninstall(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_installed_uninstall(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUninstallParams = parse_params(params)?;
        let response = self
            .runtime
            .uninstall_agent_app(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_shell_prepare(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppShellPrepareParams = parse_params(params)?;
        let response = self
            .runtime
            .prepare_agent_app_shell(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_ui_runtime_start(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUiRuntimeStartParams = parse_params(params)?;
        let response = self
            .runtime
            .start_agent_app_ui_runtime(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_ui_runtime_status(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUiRuntimeStatusParams = parse_params(params)?;
        let response = self
            .runtime
            .agent_app_ui_runtime_status(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_agent_app_ui_runtime_stop(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AgentAppUiRuntimeStopParams = parse_params(params)?;
        let response = self
            .runtime
            .stop_agent_app_ui_runtime(params)
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

    async fn handle_knowledge_pack_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeReadPackParams = parse_params(params)?;
        let response = self
            .runtime
            .read_knowledge_pack(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_source_import(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeImportSourceParams = parse_params(params)?;
        let response = self
            .runtime
            .import_knowledge_source(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_pack_compile(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeCompilePackParams = parse_params(params)?;
        let response = self
            .runtime
            .compile_knowledge_pack(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_pack_default_set(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeSetDefaultPackParams = parse_params(params)?;
        let response = self
            .runtime
            .set_default_knowledge_pack(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_pack_status_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeUpdatePackStatusParams = parse_params(params)?;
        let response = self
            .runtime
            .update_knowledge_pack_status(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_context_resolve(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeResolveContextParams = parse_params(params)?;
        let response = self
            .runtime
            .resolve_knowledge_context(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_knowledge_context_run_validate(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: KnowledgeValidateContextRunParams = parse_params(params)?;
        let response = self
            .runtime
            .validate_knowledge_context_run(params)
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

    async fn handle_automation_scheduler_config_read(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_automation_scheduler_config()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_scheduler_config_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationSchedulerConfigUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_automation_scheduler_config(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_scheduler_status(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .read_automation_scheduler_status()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobIdParams = parse_params(params)?;
        let response = self
            .runtime
            .read_automation_job(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_automation_job(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_automation_job(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobIdParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_automation_job(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_run_now(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobIdParams = parse_params(params)?;
        let response = self
            .runtime
            .run_automation_job_now(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_health(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobHealthParams = parse_params(params)?;
        let response = self
            .runtime
            .read_automation_health(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_job_run_history(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationJobRunHistoryParams = parse_params(params)?;
        let response = self
            .runtime
            .read_automation_run_history(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_schedule_preview(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationScheduleParams = parse_params(params)?;
        let response = self
            .runtime
            .preview_automation_schedule(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_automation_schedule_validate(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: AutomationScheduleParams = parse_params(params)?;
        let response = self
            .runtime
            .validate_automation_schedule(params)
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

    async fn handle_mcp_server_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_mcp_servers()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_status_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_mcp_servers_with_status()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_mcp_server(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_mcp_server(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerDeleteParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_mcp_server(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_enabled_set(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerEnabledSetParams = parse_params(params)?;
        let response = self
            .runtime
            .set_mcp_server_enabled(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_import_from_app(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerImportFromAppParams = parse_params(params)?;
        let response = self
            .runtime
            .import_mcp_servers_from_app(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_sync_all_to_live(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .sync_all_mcp_servers_to_live()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_start(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerStartParams = parse_params(params)?;
        let response = self
            .runtime
            .start_mcp_server(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_server_stop(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpServerStopParams = parse_params(params)?;
        let response = self
            .runtime
            .stop_mcp_server(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_tool_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_mcp_tools()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_tool_list_for_context(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpToolListForContextParams = parse_params(params)?;
        let response = self
            .runtime
            .list_mcp_tools_for_context(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_tool_search(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpToolSearchParams = parse_params(params)?;
        let response = self
            .runtime
            .search_mcp_tools(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_tool_call(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpToolCallParams = parse_params(params)?;
        let response = self
            .runtime
            .call_mcp_tool(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_tool_call_with_caller(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpToolCallWithCallerParams = parse_params(params)?;
        let response = self
            .runtime
            .call_mcp_tool_with_caller(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_prompt_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_mcp_prompts()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_prompt_get(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpPromptGetParams = parse_params(params)?;
        let response = self
            .runtime
            .get_mcp_prompt(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_resource_list(&self) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let response = self
            .runtime
            .list_mcp_resources()
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_mcp_resource_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: McpResourceReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_mcp_resource(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

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

    async fn handle_model_provider_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_model_provider(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_model_provider(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_model_provider(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderDeleteParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_model_provider(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_sort_orders_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderSortOrdersUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_model_provider_sort_orders(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_config_export(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderConfigExportParams = parse_params(params)?;
        let response = self
            .runtime
            .export_model_provider_config(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_config_import(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderConfigImportParams = parse_params(params)?;
        let response = self
            .runtime
            .import_model_provider_config(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_test_connection(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderTestConnectionParams = parse_params(params)?;
        let response = self
            .runtime
            .test_model_provider_connection(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_test_chat(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderTestChatParams = parse_params(params)?;
        let response = self
            .runtime
            .test_model_provider_chat(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_fetch_models(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderFetchModelsParams = parse_params(params)?;
        let response = self
            .runtime
            .fetch_model_provider_models(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_key_create(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderKeyCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_model_provider_key(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_key_update(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderKeyUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_model_provider_key(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_key_delete(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderKeyDeleteParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_model_provider_key(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_key_next(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderKeyNextParams = parse_params(params)?;
        let response = self
            .runtime
            .read_next_model_provider_key(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_key_usage_record(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderKeyEventParams = parse_params(params)?;
        let response = self
            .runtime
            .record_model_provider_key_usage(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_key_error_record(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderKeyEventParams = parse_params(params)?;
        let response = self
            .runtime
            .record_model_provider_key_error(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_ui_state_read(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderUiStateReadParams = parse_params(params)?;
        let response = self
            .runtime
            .read_model_provider_ui_state(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_model_provider_ui_state_write(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ModelProviderUiStateWriteParams = parse_params(params)?;
        let response = self
            .runtime
            .write_model_provider_ui_state(params)
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

    async fn handle_connect_deep_link_resolve(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConnectDeepLinkResolveParams = parse_params(params)?;
        let response = self
            .runtime
            .resolve_connect_deep_link(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_connect_open_deep_link_resolve(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConnectOpenDeepLinkResolveParams = parse_params(params)?;
        let response = self
            .runtime
            .resolve_connect_open_deep_link(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_connect_relay_api_key_save(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConnectRelayApiKeySaveParams = parse_params(params)?;
        let response = self
            .runtime
            .save_connect_relay_api_key(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_connect_callback_send(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: ConnectCallbackSendParams = parse_params(params)?;
        let response = self
            .runtime
            .deliver_connect_callback(params)
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

    async fn handle_file_system_list_directory(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemListDirectoryParams = parse_params(params)?;
        let response = self
            .runtime
            .list_directory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_system_read_file_preview(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemReadFilePreviewParams = parse_params(params)?;
        let response = self
            .runtime
            .read_file_preview(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_system_create_file(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemCreateFileParams = parse_params(params)?;
        let response = self
            .runtime
            .create_file(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_system_create_directory(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemCreateDirectoryParams = parse_params(params)?;
        let response = self
            .runtime
            .create_directory(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_system_rename_file(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemRenameFileParams = parse_params(params)?;
        let response = self
            .runtime
            .rename_file(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    async fn handle_file_system_delete_file(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: FileSystemDeleteFileParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_file(params)
            .await
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
    async fn app_server_file_system_methods_require_initialized_and_return_current_results() {
        let processor = RequestProcessor::new(RuntimeCore::default());
        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_FILE_SYSTEM_CREATE_FILE,
                Some(json!({ "path": "." })),
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

        let temp_dir = tempfile::tempdir().expect("temp dir");
        let file_path = temp_dir.path().join("README.md");
        std::fs::write(&file_path, "# Lime").expect("write file");
        let created_file_path = temp_dir.path().join("created.txt");
        let created_dir_path = temp_dir.path().join("created-dir");
        let renamed_file_path = temp_dir.path().join("renamed.txt");
        let expected_dir_path = std::fs::canonicalize(temp_dir.path())
            .expect("canonical temp dir")
            .to_string_lossy()
            .into_owned();
        let expected_file_path = std::fs::canonicalize(&file_path)
            .expect("canonical file")
            .to_string_lossy()
            .into_owned();

        let listing_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_FILE_SYSTEM_LIST_DIRECTORY,
                Some(json!({ "path": temp_dir.path() })),
            ))
            .await
            .expect("directory listing response");
        match &listing_messages[0] {
            JsonRpcMessage::Response(response) => {
                let actual_dir_path =
                    std::fs::canonicalize(response.result["path"].as_str().expect("listing path"))
                        .expect("canonical response dir")
                        .to_string_lossy()
                        .into_owned();
                assert_eq!(actual_dir_path.as_str(), expected_dir_path.as_str());
                assert_eq!(response.result["entries"][0]["name"], "README.md");
            }
            other => panic!("expected response, got {other:?}"),
        }

        let create_file_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(5),
                METHOD_FILE_SYSTEM_CREATE_FILE,
                Some(json!({ "path": created_file_path })),
            ))
            .await
            .expect("create file response");
        assert!(matches!(
            &create_file_messages[0],
            JsonRpcMessage::Response(response)
                if response.result == serde_json::json!({})
        ));
        assert!(created_file_path.is_file());

        let create_directory_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(6),
                METHOD_FILE_SYSTEM_CREATE_DIRECTORY,
                Some(json!({ "path": created_dir_path })),
            ))
            .await
            .expect("create directory response");
        assert!(matches!(
            &create_directory_messages[0],
            JsonRpcMessage::Response(response)
                if response.result == serde_json::json!({})
        ));
        assert!(created_dir_path.is_dir());

        let rename_file_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(7),
                METHOD_FILE_SYSTEM_RENAME_FILE,
                Some(json!({
                    "oldPath": created_file_path,
                    "newPath": renamed_file_path,
                })),
            ))
            .await
            .expect("rename file response");
        assert!(matches!(
            &rename_file_messages[0],
            JsonRpcMessage::Response(response)
                if response.result == serde_json::json!({})
        ));
        assert!(!created_file_path.exists());
        assert!(renamed_file_path.is_file());

        let delete_file_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(8),
                METHOD_FILE_SYSTEM_DELETE_FILE,
                Some(json!({
                    "path": renamed_file_path,
                    "recursive": false,
                })),
            ))
            .await
            .expect("delete file response");
        assert!(matches!(
            &delete_file_messages[0],
            JsonRpcMessage::Response(response)
                if response.result == serde_json::json!({})
        ));
        assert!(!renamed_file_path.exists());

        processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(9),
                METHOD_FILE_SYSTEM_DELETE_FILE,
                Some(json!({
                    "path": created_dir_path,
                    "recursive": true,
                })),
            ))
            .await
            .expect("delete directory response");
        assert!(!created_dir_path.exists());

        let preview_messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(10),
                METHOD_FILE_SYSTEM_READ_FILE_PREVIEW,
                Some(json!({
                    "path": file_path,
                    "maxSize": 1024,
                })),
            ))
            .await
            .expect("file preview response");
        match &preview_messages[0] {
            JsonRpcMessage::Response(response) => {
                let actual_file_path =
                    std::fs::canonicalize(response.result["path"].as_str().expect("preview path"))
                        .expect("canonical response file")
                        .to_string_lossy()
                        .into_owned();
                assert_eq!(actual_file_path.as_str(), expected_file_path.as_str());
                assert_eq!(response.result["content"], "# Lime");
                assert_eq!(response.result["isBinary"], false);
            }
            other => panic!("expected response, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn mcp_list_methods_require_initialized_and_return_current_empty_state() {
        let processor = RequestProcessor::new(RuntimeCore::default());
        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_MCP_TOOL_LIST,
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

        let cases = [
            (RequestId::Integer(3), METHOD_MCP_SERVER_LIST, "servers"),
            (
                RequestId::Integer(4),
                METHOD_MCP_SERVER_STATUS_LIST,
                "servers",
            ),
            (RequestId::Integer(5), METHOD_MCP_TOOL_LIST, "tools"),
            (RequestId::Integer(6), METHOD_MCP_PROMPT_LIST, "prompts"),
            (RequestId::Integer(7), METHOD_MCP_RESOURCE_LIST, "resources"),
        ];

        for (id, method, field) in cases {
            let messages = processor
                .handle_request(JsonRpcRequest::new(id, method, Some(json!({}))))
                .await
                .expect("mcp list response");

            match &messages[0] {
                JsonRpcMessage::Response(response) => {
                    assert_eq!(response.result[field], json!([]));
                }
                other => panic!("expected response, got {other:?}"),
            }
        }
    }

    #[tokio::test]
    async fn mcp_runtime_methods_require_initialized_and_fail_closed_without_manager() {
        let processor = RequestProcessor::new(RuntimeCore::default());
        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_MCP_TOOL_CALL,
                Some(json!({
                    "toolName": "mcp__docs__search",
                    "arguments": {},
                })),
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
                METHOD_MCP_SERVER_CREATE,
                json!({
                    "server": {
                        "id": "server-1",
                        "name": "docs",
                        "server_config": { "command": "node" },
                        "enabled_lime": true,
                        "enabled_claude": false,
                        "enabled_codex": true,
                        "enabled_gemini": false,
                    }
                }),
            ),
            (
                RequestId::Integer(4),
                METHOD_MCP_SERVER_UPDATE,
                json!({
                    "server": {
                        "id": "server-1",
                        "name": "docs",
                        "server_config": { "command": "node" },
                        "enabled_lime": true,
                        "enabled_claude": false,
                        "enabled_codex": true,
                        "enabled_gemini": false,
                    }
                }),
            ),
            (
                RequestId::Integer(5),
                METHOD_MCP_SERVER_DELETE,
                json!({ "id": "server-1" }),
            ),
            (
                RequestId::Integer(6),
                METHOD_MCP_SERVER_ENABLED_SET,
                json!({ "id": "server-1", "appType": "codex", "enabled": true }),
            ),
            (
                RequestId::Integer(7),
                METHOD_MCP_SERVER_IMPORT_FROM_APP,
                json!({ "appType": "codex" }),
            ),
            (
                RequestId::Integer(8),
                METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE,
                json!({}),
            ),
            (
                RequestId::Integer(9),
                METHOD_MCP_SERVER_START,
                json!({ "name": "docs" }),
            ),
            (
                RequestId::Integer(10),
                METHOD_MCP_SERVER_STOP,
                json!({ "name": "docs" }),
            ),
            (
                RequestId::Integer(11),
                METHOD_MCP_TOOL_CALL,
                json!({ "toolName": "mcp__docs__search", "arguments": {} }),
            ),
            (
                RequestId::Integer(12),
                METHOD_MCP_TOOL_CALL_WITH_CALLER,
                json!({
                    "toolName": "mcp__docs__search",
                    "arguments": {},
                    "caller": "assistant",
                }),
            ),
            (
                RequestId::Integer(13),
                METHOD_MCP_PROMPT_GET,
                json!({ "name": "docs_prompt", "arguments": {} }),
            ),
            (
                RequestId::Integer(14),
                METHOD_MCP_RESOURCE_READ,
                json!({ "uri": "docs://readme" }),
            ),
        ];

        for (id, method, params) in cases {
            let messages = processor
                .handle_request(JsonRpcRequest::new(id, method, Some(params)))
                .await
                .expect("mcp runtime response");

            match &messages[0] {
                JsonRpcMessage::Error(error) => {
                    assert_eq!(error.error.code, error_codes::RUNTIME_ERROR);
                }
                other => panic!("expected runtime error, got {other:?}"),
            }
        }
    }

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
