mod agent_app;
mod agent_session;
mod automation;
mod browser_session;
mod connect;
mod conversation_import;
mod diagnostics;
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
mod project;
mod project_git;
mod project_shell;
mod request_trace;
mod right_surface;
mod skill;
mod voice;
mod wechat;
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
use app_server_protocol::JsonRpcErrorResponse;
use app_server_protocol::JsonRpcMessage;
use app_server_protocol::JsonRpcNotification;
use app_server_protocol::JsonRpcRequest;
use app_server_protocol::JsonRpcResponse;
use app_server_protocol::PlatformInfo;
// ProjectGit* 类型已移至 processor/project_git.rs
use app_server_protocol::ServerCapabilities;
use app_server_protocol::ServerInfo;
use app_server_protocol::UsageStatsRangeParams;
use app_server_protocol::METHOD_AGENT_APP_HOST_LIFECYCLE_LIST;
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
use app_server_protocol::METHOD_AGENT_SESSION_ACTION_REPLAY;
use app_server_protocol::METHOD_AGENT_SESSION_ACTION_RESPOND;
use app_server_protocol::METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT;
use app_server_protocol::METHOD_AGENT_SESSION_ARCHIVE_MANY;
use app_server_protocol::METHOD_AGENT_SESSION_COMPACT;
use app_server_protocol::METHOD_AGENT_SESSION_DELETE;
use app_server_protocol::METHOD_AGENT_SESSION_EVENT;
use app_server_protocol::METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF;
use app_server_protocol::METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET;
use app_server_protocol::METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST;
use app_server_protocol::METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE;
use app_server_protocol::METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT;
use app_server_protocol::METHOD_AGENT_SESSION_LIST;
use app_server_protocol::METHOD_AGENT_SESSION_OBJECTIVE_AUDIT;
use app_server_protocol::METHOD_AGENT_SESSION_OBJECTIVE_CLEAR;
use app_server_protocol::METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE;
use app_server_protocol::METHOD_AGENT_SESSION_OBJECTIVE_READ;
use app_server_protocol::METHOD_AGENT_SESSION_OBJECTIVE_SET;
use app_server_protocol::METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE;
use app_server_protocol::METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE;
use app_server_protocol::METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE;
use app_server_protocol::METHOD_AGENT_SESSION_READ;
use app_server_protocol::METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT;
use app_server_protocol::METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE;
use app_server_protocol::METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT;
use app_server_protocol::METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND;
use app_server_protocol::METHOD_AGENT_SESSION_START;
use app_server_protocol::METHOD_AGENT_SESSION_THREAD_RESUME;
use app_server_protocol::METHOD_AGENT_SESSION_TOOL_INVENTORY_READ;
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
use app_server_protocol::METHOD_BROWSER_SESSION_ACTION_EXECUTE;
use app_server_protocol::METHOD_BROWSER_SESSION_CLOSE;
use app_server_protocol::METHOD_BROWSER_SESSION_EVENT_LIST;
use app_server_protocol::METHOD_BROWSER_SESSION_OPEN;
use app_server_protocol::METHOD_BROWSER_SESSION_READ;
use app_server_protocol::METHOD_BROWSER_SESSION_TARGET_LIST;
use app_server_protocol::METHOD_CAPABILITY_LIST;
use app_server_protocol::METHOD_CONNECT_CALLBACK_SEND;
use app_server_protocol::METHOD_CONNECT_DEEP_LINK_RESOLVE;
use app_server_protocol::METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE;
use app_server_protocol::METHOD_CONNECT_RELAY_API_KEY_SAVE;
use app_server_protocol::METHOD_CONVERSATION_IMPORT_SOURCE_SCAN;
use app_server_protocol::METHOD_CONVERSATION_IMPORT_THREAD_COMMIT;
use app_server_protocol::METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW;
use app_server_protocol::METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ;
use app_server_protocol::METHOD_DIAGNOSTICS_LOG_STORAGE_READ;
use app_server_protocol::METHOD_DIAGNOSTICS_SERVER_READ;
use app_server_protocol::METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT;
use app_server_protocol::METHOD_DIAGNOSTICS_TRACE_EXPORT;
use app_server_protocol::METHOD_DIAGNOSTICS_TRACE_LIST;
use app_server_protocol::METHOD_DIAGNOSTICS_TRACE_READ;
use app_server_protocol::METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ;
use app_server_protocol::METHOD_DISCORD_CHANNEL_PROBE;
use app_server_protocol::METHOD_EVIDENCE_EXPORT;
use app_server_protocol::METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT;
use app_server_protocol::METHOD_EXECUTION_PROCESS_INTERRUPT;
use app_server_protocol::METHOD_EXECUTION_PROCESS_START;
use app_server_protocol::METHOD_EXECUTION_PROCESS_STATUS;
use app_server_protocol::METHOD_EXECUTION_PROCESS_TERMINATE;
use app_server_protocol::METHOD_EXECUTION_PROCESS_WRITE_STDIN;
use app_server_protocol::METHOD_FEISHU_CHANNEL_PROBE;
use app_server_protocol::METHOD_FILE_SYSTEM_CREATE_DIRECTORY;
use app_server_protocol::METHOD_FILE_SYSTEM_CREATE_FILE;
use app_server_protocol::METHOD_FILE_SYSTEM_DELETE_FILE;
use app_server_protocol::METHOD_FILE_SYSTEM_LIST_DIRECTORY;
use app_server_protocol::METHOD_FILE_SYSTEM_READ_FILE_PREVIEW;
use app_server_protocol::METHOD_FILE_SYSTEM_RENAME_FILE;
use app_server_protocol::METHOD_GALLERY_MATERIAL_GET;
use app_server_protocol::METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY;
use app_server_protocol::METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY;
use app_server_protocol::METHOD_GALLERY_MATERIAL_LIST_BY_MOOD;
use app_server_protocol::METHOD_GALLERY_MATERIAL_METADATA_CREATE;
use app_server_protocol::METHOD_GALLERY_MATERIAL_METADATA_DELETE;
use app_server_protocol::METHOD_GALLERY_MATERIAL_METADATA_GET;
use app_server_protocol::METHOD_GALLERY_MATERIAL_METADATA_UPDATE;
use app_server_protocol::METHOD_GATEWAY_CHANNEL_START;
use app_server_protocol::METHOD_GATEWAY_CHANNEL_STATUS;
use app_server_protocol::METHOD_GATEWAY_CHANNEL_STOP;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_CREATE;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_PROBE;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_RESTART;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_START;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_STATUS;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_STOP;
use app_server_protocol::METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL;
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
use app_server_protocol::METHOD_LOG_CLEAR;
use app_server_protocol::METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR;
use app_server_protocol::METHOD_LOG_LIST;
use app_server_protocol::METHOD_LOG_PERSISTED_TAIL;
use app_server_protocol::METHOD_MCP_PROMPT_GET;
use app_server_protocol::METHOD_MCP_PROMPT_LIST;
use app_server_protocol::METHOD_MCP_RESOURCE_LIST;
use app_server_protocol::METHOD_MCP_RESOURCE_READ;
use app_server_protocol::METHOD_MCP_RESOURCE_SUBSCRIBE;
use app_server_protocol::METHOD_MCP_RESOURCE_UNSUBSCRIBE;
use app_server_protocol::METHOD_MCP_SERVER_CREATE;
use app_server_protocol::METHOD_MCP_SERVER_DELETE;
use app_server_protocol::METHOD_MCP_SERVER_ENABLED_SET;
use app_server_protocol::METHOD_MCP_SERVER_IMPORT_FROM_APP;
use app_server_protocol::METHOD_MCP_SERVER_LIST;
use app_server_protocol::METHOD_MCP_SERVER_OAUTH_LOGIN;
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
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE;
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE;
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_CANCEL;
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_GET;
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE;
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_LIST;
use app_server_protocol::METHOD_MEDIA_TASK_ARTIFACT_VIDEO_CREATE;
use app_server_protocol::METHOD_MEMORY_STORE_ADD_NOTE;
use app_server_protocol::METHOD_MEMORY_STORE_CONSOLIDATE;
use app_server_protocol::METHOD_MEMORY_STORE_HEALTH;
use app_server_protocol::METHOD_MEMORY_STORE_INDEX_REBUILD;
use app_server_protocol::METHOD_MEMORY_STORE_LIST;
use app_server_protocol::METHOD_MEMORY_STORE_READ;
use app_server_protocol::METHOD_MEMORY_STORE_RESET;
use app_server_protocol::METHOD_MEMORY_STORE_REVIEW_LIST;
use app_server_protocol::METHOD_MEMORY_STORE_REVIEW_RESOLVE;
use app_server_protocol::METHOD_MEMORY_STORE_SEARCH;
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
use app_server_protocol::METHOD_PROJECT_GIT_BRANCH_CHECKOUT;
use app_server_protocol::METHOD_PROJECT_GIT_BRANCH_CREATE;
use app_server_protocol::METHOD_PROJECT_GIT_COMMITS_LIST;
use app_server_protocol::METHOD_PROJECT_GIT_DIFF;
use app_server_protocol::METHOD_PROJECT_GIT_STATUS;
use app_server_protocol::METHOD_PROJECT_GIT_WORKTREE_CREATE;
use app_server_protocol::METHOD_PROJECT_MATERIAL_CONTENT;
use app_server_protocol::METHOD_PROJECT_MATERIAL_COUNT;
use app_server_protocol::METHOD_PROJECT_MATERIAL_DELETE;
use app_server_protocol::METHOD_PROJECT_MATERIAL_GET;
use app_server_protocol::METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL;
use app_server_protocol::METHOD_PROJECT_MATERIAL_LIST;
use app_server_protocol::METHOD_PROJECT_MATERIAL_UPDATE;
use app_server_protocol::METHOD_PROJECT_MATERIAL_UPLOAD;
use app_server_protocol::METHOD_PROJECT_MEMORY_READ;
use app_server_protocol::METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS;
use app_server_protocol::METHOD_PROJECT_SHELL_SESSION_KILL;
use app_server_protocol::METHOD_PROJECT_SHELL_SESSION_RESIZE;
use app_server_protocol::METHOD_PROJECT_SHELL_SESSION_START;
use app_server_protocol::METHOD_PROJECT_SHELL_SESSION_WRITE;
use app_server_protocol::METHOD_SESSION_FILE_DELETE;
use app_server_protocol::METHOD_SESSION_FILE_GET_OR_CREATE;
use app_server_protocol::METHOD_SESSION_FILE_LIST;
use app_server_protocol::METHOD_SESSION_FILE_READ;
use app_server_protocol::METHOD_SESSION_FILE_RESOLVE_PATH;
use app_server_protocol::METHOD_SESSION_FILE_SAVE;
use app_server_protocol::METHOD_SESSION_FILE_UPDATE_META;
use app_server_protocol::METHOD_SKILL_CACHE_REFRESH;
use app_server_protocol::METHOD_SKILL_INSTALLED_DIRECTORIES_LIST;
use app_server_protocol::METHOD_SKILL_LIST;
use app_server_protocol::METHOD_SKILL_LOCAL_DETAIL_INSPECT;
use app_server_protocol::METHOD_SKILL_LOCAL_IMPORT;
use app_server_protocol::METHOD_SKILL_LOCAL_INSPECT;
use app_server_protocol::METHOD_SKILL_LOCAL_RENAME;
use app_server_protocol::METHOD_SKILL_LOCAL_SCAFFOLD_CREATE;
use app_server_protocol::METHOD_SKILL_MANAGEMENT_INSTALL;
use app_server_protocol::METHOD_SKILL_MANAGEMENT_LIST;
use app_server_protocol::METHOD_SKILL_MANAGEMENT_UNINSTALL;
use app_server_protocol::METHOD_SKILL_MARKETPLACE_INSTALL;
use app_server_protocol::METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL;
use app_server_protocol::METHOD_SKILL_PACKAGE_EXPORT;
use app_server_protocol::METHOD_SKILL_PACKAGE_LOCAL_INSPECT;
use app_server_protocol::METHOD_SKILL_PACKAGE_LOCAL_INSTALL;
use app_server_protocol::METHOD_SKILL_PACKAGE_LOCAL_REPLACE;
use app_server_protocol::METHOD_SKILL_READ;
use app_server_protocol::METHOD_SKILL_REMOTE_INSPECT;
use app_server_protocol::METHOD_SKILL_REPOSITORY_DELETE;
use app_server_protocol::METHOD_SKILL_REPOSITORY_LIST;
use app_server_protocol::METHOD_SKILL_REPOSITORY_SAVE;
use app_server_protocol::METHOD_TELEGRAM_CHANNEL_PROBE;
use app_server_protocol::METHOD_USAGE_STATS_DAILY_TRENDS_LIST;
use app_server_protocol::METHOD_USAGE_STATS_MODEL_RANKING_LIST;
use app_server_protocol::METHOD_USAGE_STATS_READ;
use app_server_protocol::METHOD_VOICE_ASR_CREDENTIAL_CREATE;
use app_server_protocol::METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET;
use app_server_protocol::METHOD_VOICE_ASR_CREDENTIAL_DELETE;
use app_server_protocol::METHOD_VOICE_ASR_CREDENTIAL_LIST;
use app_server_protocol::METHOD_VOICE_ASR_CREDENTIAL_TEST;
use app_server_protocol::METHOD_VOICE_ASR_CREDENTIAL_UPDATE;
use app_server_protocol::METHOD_VOICE_INSTRUCTION_DELETE;
use app_server_protocol::METHOD_VOICE_INSTRUCTION_LIST;
use app_server_protocol::METHOD_VOICE_INSTRUCTION_SAVE;
use app_server_protocol::METHOD_VOICE_MODEL_DEFAULT_SET;
use app_server_protocol::METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE;
use app_server_protocol::METHOD_WECHAT_CHANNEL_ACCOUNT_LIST;
use app_server_protocol::METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE;
use app_server_protocol::METHOD_WECHAT_CHANNEL_LOGIN_START;
use app_server_protocol::METHOD_WECHAT_CHANNEL_LOGIN_WAIT;
use app_server_protocol::METHOD_WECHAT_CHANNEL_PROBE;
use app_server_protocol::METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET;
use app_server_protocol::METHOD_WORKSPACE_BY_PATH_READ;
use app_server_protocol::METHOD_WORKSPACE_DEFAULT_ENSURE;
use app_server_protocol::METHOD_WORKSPACE_DEFAULT_READ;
use app_server_protocol::METHOD_WORKSPACE_DELETE;
use app_server_protocol::METHOD_WORKSPACE_ENSURE;
use app_server_protocol::METHOD_WORKSPACE_ENSURE_READY;
use app_server_protocol::METHOD_WORKSPACE_LIST;
use app_server_protocol::METHOD_WORKSPACE_PROJECTS_ROOT_READ;
use app_server_protocol::METHOD_WORKSPACE_PROJECT_PATH_RESOLVE;
use app_server_protocol::METHOD_WORKSPACE_READ;
use app_server_protocol::METHOD_WORKSPACE_REGISTERED_SKILLS_LIST;
use app_server_protocol::METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED;
use app_server_protocol::METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CONSUME;
use app_server_protocol::METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_DISMISS;
use app_server_protocol::METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST;
use app_server_protocol::METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST;
use app_server_protocol::METHOD_WORKSPACE_SKILL_BINDINGS_LIST;
use app_server_protocol::METHOD_WORKSPACE_UPDATE;
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
                self.handle_file_system_list_directory_impl(params).await
            }
            METHOD_FILE_SYSTEM_READ_FILE_PREVIEW => {
                self.handle_file_system_read_file_preview_impl(params).await
            }
            METHOD_FILE_SYSTEM_CREATE_FILE => {
                self.handle_file_system_create_file_impl(params).await
            }
            METHOD_FILE_SYSTEM_CREATE_DIRECTORY => {
                self.handle_file_system_create_directory_impl(params).await
            }
            METHOD_FILE_SYSTEM_RENAME_FILE => {
                self.handle_file_system_rename_file_impl(params).await
            }
            METHOD_FILE_SYSTEM_DELETE_FILE => {
                self.handle_file_system_delete_file_impl(params).await
            }
            METHOD_PROJECT_GIT_STATUS => self.handle_project_git_status_impl(params).await,
            METHOD_PROJECT_GIT_DIFF => self.handle_project_git_diff_impl(params).await,
            METHOD_PROJECT_GIT_COMMITS_LIST => {
                self.handle_project_git_commits_list_impl(params).await
            }
            METHOD_PROJECT_GIT_BRANCH_CHECKOUT => {
                self.handle_project_git_branch_checkout_impl(params).await
            }
            METHOD_PROJECT_GIT_BRANCH_CREATE => {
                self.handle_project_git_branch_create_impl(params).await
            }
            METHOD_PROJECT_GIT_WORKTREE_CREATE => {
                self.handle_project_git_worktree_create_impl(params).await
            }
            METHOD_PROJECT_SHELL_SESSION_START => {
                self.handle_project_shell_session_start_impl(params).await
            }
            METHOD_PROJECT_SHELL_SESSION_WRITE => {
                self.handle_project_shell_session_write_impl(params).await
            }
            METHOD_PROJECT_SHELL_SESSION_RESIZE => {
                self.handle_project_shell_session_resize_impl(params).await
            }
            METHOD_PROJECT_SHELL_SESSION_KILL => {
                self.handle_project_shell_session_kill_impl(params).await
            }
            METHOD_PROJECT_SHELL_SESSION_DRAIN_EVENTS => {
                self.handle_project_shell_session_drain_events_impl(params)
                    .await
            }
            METHOD_EXECUTION_PROCESS_START => {
                self.handle_execution_process_start_impl(params).await
            }
            METHOD_EXECUTION_PROCESS_WRITE_STDIN => {
                self.handle_execution_process_write_stdin_impl(params).await
            }
            METHOD_EXECUTION_PROCESS_INTERRUPT => {
                self.handle_execution_process_interrupt_impl(params).await
            }
            METHOD_EXECUTION_PROCESS_TERMINATE => {
                self.handle_execution_process_terminate_impl(params).await
            }
            METHOD_EXECUTION_PROCESS_STATUS => {
                self.handle_execution_process_status_impl(params).await
            }
            METHOD_EXECUTION_PROCESS_DRAIN_OUTPUT => {
                self.handle_execution_process_drain_output_impl(params)
                    .await
            }
            METHOD_EVIDENCE_EXPORT => self.handle_evidence_export(params).await,
            METHOD_AGENT_SESSION_HANDOFF_BUNDLE_EXPORT => {
                self.handle_handoff_bundle_export(params).await
            }
            METHOD_AGENT_SESSION_REPLAY_CASE_EXPORT => self.handle_replay_case_export(params).await,
            METHOD_AGENT_SESSION_ANALYSIS_HANDOFF_EXPORT => {
                self.handle_analysis_handoff_export(params).await
            }
            METHOD_AGENT_SESSION_REVIEW_DECISION_TEMPLATE_EXPORT => {
                self.handle_review_decision_template_export(params).await
            }
            METHOD_AGENT_SESSION_REVIEW_DECISION_SAVE => {
                self.handle_review_decision_save(params).await
            }
            METHOD_AGENT_SESSION_LIST => self.handle_session_list_impl(params).await,
            METHOD_AGENT_SESSION_UPDATE => self.handle_session_update_impl(params).await,
            METHOD_AGENT_SESSION_ARCHIVE_MANY => {
                self.handle_session_archive_many_impl(params).await
            }
            METHOD_AGENT_SESSION_DELETE => self.handle_session_delete_impl(params).await,
            METHOD_AGENT_SESSION_OBJECTIVE_READ => self.handle_objective_read_impl(params).await,
            METHOD_AGENT_SESSION_OBJECTIVE_SET => self.handle_objective_set_impl(params).await,
            METHOD_AGENT_SESSION_OBJECTIVE_STATUS_UPDATE => {
                self.handle_objective_status_update_impl(params).await
            }
            METHOD_AGENT_SESSION_OBJECTIVE_CLEAR => self.handle_objective_clear_impl(params).await,
            METHOD_AGENT_SESSION_OBJECTIVE_CONTINUE => {
                self.handle_objective_continue_impl(params).await
            }
            METHOD_AGENT_SESSION_OBJECTIVE_AUDIT => self.handle_objective_audit_impl(params).await,
            METHOD_AGENT_SESSION_COMPACT => self.handle_session_compact_impl(params).await,
            METHOD_AGENT_SESSION_THREAD_RESUME => {
                self.handle_session_thread_resume_impl(params).await
            }
            METHOD_AGENT_SESSION_QUEUED_TURN_REMOVE => {
                self.handle_session_queued_turn_remove_impl(params).await
            }
            METHOD_AGENT_SESSION_QUEUED_TURN_PROMOTE => {
                self.handle_session_queued_turn_promote_impl(params).await
            }
            METHOD_AGENT_SESSION_FILE_CHECKPOINT_LIST => {
                self.handle_file_checkpoint_list_impl(params).await
            }
            METHOD_AGENT_SESSION_FILE_CHECKPOINT_GET => {
                self.handle_file_checkpoint_get_impl(params).await
            }
            METHOD_AGENT_SESSION_FILE_CHECKPOINT_DIFF => {
                self.handle_file_checkpoint_diff_impl(params).await
            }
            METHOD_AGENT_SESSION_FILE_CHECKPOINT_RESTORE => {
                self.handle_file_checkpoint_restore_impl(params).await
            }
            METHOD_SESSION_FILE_GET_OR_CREATE => {
                self.handle_session_file_get_or_create_impl(params).await
            }
            METHOD_SESSION_FILE_UPDATE_META => {
                self.handle_session_file_update_meta_impl(params).await
            }
            METHOD_SESSION_FILE_SAVE => self.handle_session_file_save_impl(params).await,
            METHOD_SESSION_FILE_READ => self.handle_session_file_read_impl(params).await,
            METHOD_SESSION_FILE_RESOLVE_PATH => {
                self.handle_session_file_resolve_path_impl(params).await
            }
            METHOD_SESSION_FILE_DELETE => self.handle_session_file_delete_impl(params).await,
            METHOD_SESSION_FILE_LIST => self.handle_session_file_list_impl(params).await,
            METHOD_AGENT_SESSION_START => self.handle_session_start(params),
            METHOD_AGENT_SESSION_READ => self.handle_session_read_impl(params).await,
            METHOD_WORKSPACE_LIST => self.handle_workspace_list_impl().await,
            METHOD_WORKSPACE_READ => self.handle_workspace_read_impl(params).await,
            METHOD_WORKSPACE_UPDATE => self.handle_workspace_update_impl(params).await,
            METHOD_WORKSPACE_DELETE => self.handle_workspace_delete_impl(params).await,
            METHOD_WORKSPACE_ENSURE => self.handle_workspace_ensure_impl(params).await,
            METHOD_WORKSPACE_BY_PATH_READ => self.handle_workspace_by_path_read_impl(params).await,
            METHOD_WORKSPACE_DEFAULT_READ => self.handle_workspace_default_read_impl().await,
            METHOD_WORKSPACE_DEFAULT_ENSURE => self.handle_workspace_default_ensure_impl().await,
            METHOD_WORKSPACE_PROJECTS_ROOT_READ => {
                self.handle_workspace_projects_root_read_impl().await
            }
            METHOD_WORKSPACE_PROJECT_PATH_RESOLVE => {
                self.handle_workspace_project_path_resolve_impl(params)
                    .await
            }
            METHOD_WORKSPACE_ENSURE_READY => self.handle_workspace_ensure_ready_impl(params).await,
            METHOD_SKILL_LIST => self.handle_skill_list_impl().await,
            METHOD_SKILL_READ => self.handle_skill_read_impl(params).await,
            METHOD_SKILL_MANAGEMENT_LIST => self.handle_skill_management_list_impl(params).await,
            METHOD_SKILL_MANAGEMENT_INSTALL => {
                self.handle_skill_management_install_impl(params).await
            }
            METHOD_SKILL_MANAGEMENT_UNINSTALL => {
                self.handle_skill_management_uninstall_impl(params).await
            }
            METHOD_SKILL_REPOSITORY_LIST => self.handle_skill_repository_list_impl().await,
            METHOD_SKILL_REPOSITORY_SAVE => self.handle_skill_repository_save_impl(params).await,
            METHOD_SKILL_REPOSITORY_DELETE => {
                self.handle_skill_repository_delete_impl(params).await
            }
            METHOD_SKILL_CACHE_REFRESH => self.handle_skill_cache_refresh_impl().await,
            METHOD_SKILL_INSTALLED_DIRECTORIES_LIST => {
                self.handle_skill_installed_directories_list_impl().await
            }
            METHOD_SKILL_LOCAL_INSPECT => self.handle_skill_local_inspect_impl(params).await,
            METHOD_SKILL_LOCAL_DETAIL_INSPECT => {
                self.handle_skill_local_detail_inspect_impl(params).await
            }
            METHOD_SKILL_LOCAL_SCAFFOLD_CREATE => {
                self.handle_skill_local_scaffold_create_impl(params).await
            }
            METHOD_SKILL_LOCAL_IMPORT => self.handle_skill_local_import_impl(params).await,
            METHOD_SKILL_LOCAL_RENAME => self.handle_skill_local_rename_impl(params).await,
            METHOD_SKILL_REMOTE_INSPECT => self.handle_skill_remote_inspect_impl(params).await,
            METHOD_SKILL_PACKAGE_LOCAL_INSPECT => {
                self.handle_skill_package_local_inspect_impl(params).await
            }
            METHOD_SKILL_PACKAGE_LOCAL_INSTALL => {
                self.handle_skill_package_local_install_impl(params).await
            }
            METHOD_SKILL_PACKAGE_LOCAL_REPLACE => {
                self.handle_skill_package_local_replace_impl(params).await
            }
            METHOD_SKILL_PACKAGE_EXPORT => self.handle_skill_package_export_impl(params).await,
            METHOD_SKILL_MARKETPLACE_INSTALL => {
                self.handle_skill_marketplace_install_impl(params).await
            }
            METHOD_SKILL_PACKAGE_DOWNLOAD_INSTALL => {
                self.handle_skill_download_install_impl(params).await
            }
            METHOD_GATEWAY_CHANNEL_START => self.handle_gateway_channel_start_impl(params).await,
            METHOD_GATEWAY_CHANNEL_STOP => self.handle_gateway_channel_stop_impl(params).await,
            METHOD_GATEWAY_CHANNEL_STATUS => self.handle_gateway_channel_status_impl(params).await,
            METHOD_GATEWAY_TUNNEL_PROBE => self.handle_gateway_tunnel_probe_impl().await,
            METHOD_GATEWAY_TUNNEL_CLOUDFLARED_DETECT => {
                self.handle_gateway_tunnel_cloudflared_detect_impl().await
            }
            METHOD_GATEWAY_TUNNEL_CLOUDFLARED_INSTALL => {
                self.handle_gateway_tunnel_cloudflared_install_impl(params)
                    .await
            }
            METHOD_GATEWAY_TUNNEL_CREATE => self.handle_gateway_tunnel_create_impl(params).await,
            METHOD_GATEWAY_TUNNEL_START => self.handle_gateway_tunnel_start_impl().await,
            METHOD_GATEWAY_TUNNEL_STOP => self.handle_gateway_tunnel_stop_impl().await,
            METHOD_GATEWAY_TUNNEL_RESTART => self.handle_gateway_tunnel_restart_impl().await,
            METHOD_GATEWAY_TUNNEL_STATUS => self.handle_gateway_tunnel_status_impl().await,
            METHOD_GATEWAY_TUNNEL_SYNC_WEBHOOK_URL => {
                self.handle_gateway_tunnel_sync_webhook_url_impl(params)
                    .await
            }
            METHOD_TELEGRAM_CHANNEL_PROBE => self.handle_telegram_channel_probe(params).await,
            METHOD_FEISHU_CHANNEL_PROBE => self.handle_feishu_channel_probe(params).await,
            METHOD_DISCORD_CHANNEL_PROBE => self.handle_discord_channel_probe(params).await,
            METHOD_WECHAT_CHANNEL_PROBE => self.handle_wechat_channel_probe_impl(params).await,
            METHOD_WECHAT_CHANNEL_LOGIN_START => {
                self.handle_wechat_channel_login_start_impl(params).await
            }
            METHOD_WECHAT_CHANNEL_LOGIN_WAIT => {
                self.handle_wechat_channel_login_wait_impl(params).await
            }
            METHOD_WECHAT_CHANNEL_ACCOUNT_LIST => {
                self.handle_wechat_channel_account_list_impl().await
            }
            METHOD_WECHAT_CHANNEL_ACCOUNT_REMOVE => {
                self.handle_wechat_channel_account_remove_impl(params).await
            }
            METHOD_WECHAT_CHANNEL_RUNTIME_MODEL_SET => {
                self.handle_wechat_channel_runtime_model_set_impl(params)
                    .await
            }
            METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE => {
                self.handle_media_task_artifact_image_create_impl(params)
                    .await
            }
            METHOD_MEDIA_TASK_ARTIFACT_AUDIO_CREATE => {
                self.handle_media_task_artifact_audio_create_impl(params)
                    .await
            }
            METHOD_MEDIA_TASK_ARTIFACT_VIDEO_CREATE => {
                self.handle_media_task_artifact_video_create_impl(params)
                    .await
            }
            METHOD_MEDIA_TASK_ARTIFACT_AUDIO_COMPLETE => {
                self.handle_media_task_artifact_audio_complete_impl(params)
                    .await
            }
            METHOD_MEDIA_TASK_ARTIFACT_GET => {
                self.handle_media_task_artifact_get_impl(params).await
            }
            METHOD_MEDIA_TASK_ARTIFACT_LIST => {
                self.handle_media_task_artifact_list_impl(params).await
            }
            METHOD_MEDIA_TASK_ARTIFACT_CANCEL => {
                self.handle_media_task_artifact_cancel_impl(params).await
            }
            METHOD_GALLERY_MATERIAL_GET => self.handle_gallery_material_get_impl(params).await,
            METHOD_GALLERY_MATERIAL_METADATA_CREATE => {
                self.handle_gallery_material_metadata_create_impl(params)
                    .await
            }
            METHOD_GALLERY_MATERIAL_METADATA_GET => {
                self.handle_gallery_material_metadata_get_impl(params).await
            }
            METHOD_GALLERY_MATERIAL_METADATA_UPDATE => {
                self.handle_gallery_material_metadata_update_impl(params)
                    .await
            }
            METHOD_GALLERY_MATERIAL_METADATA_DELETE => {
                self.handle_gallery_material_metadata_delete_impl(params)
                    .await
            }
            METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY => {
                self.handle_gallery_material_list_by_image_category_impl(params)
                    .await
            }
            METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY => {
                self.handle_gallery_material_list_by_layout_category_impl(params)
                    .await
            }
            METHOD_GALLERY_MATERIAL_LIST_BY_MOOD => {
                self.handle_gallery_material_list_by_mood_impl(params).await
            }
            METHOD_PROJECT_MATERIAL_LIST => self.handle_project_material_list_impl(params).await,
            METHOD_PROJECT_MATERIAL_GET => self.handle_project_material_get_impl(params).await,
            METHOD_PROJECT_MATERIAL_COUNT => self.handle_project_material_count_impl(params).await,
            METHOD_PROJECT_MATERIAL_UPLOAD => {
                self.handle_project_material_upload_impl(params).await
            }
            METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL => {
                self.handle_project_material_import_from_url_impl(params)
                    .await
            }
            METHOD_PROJECT_MATERIAL_UPDATE => {
                self.handle_project_material_update_impl(params).await
            }
            METHOD_PROJECT_MATERIAL_DELETE => {
                self.handle_project_material_delete_impl(params).await
            }
            METHOD_PROJECT_MATERIAL_CONTENT => {
                self.handle_project_material_content_impl(params).await
            }
            METHOD_VOICE_ASR_CREDENTIAL_LIST => self.handle_voice_asr_credential_list_impl().await,
            METHOD_VOICE_ASR_CREDENTIAL_CREATE => {
                self.handle_voice_asr_credential_create_impl(params).await
            }
            METHOD_VOICE_ASR_CREDENTIAL_UPDATE => {
                self.handle_voice_asr_credential_update_impl(params).await
            }
            METHOD_VOICE_ASR_CREDENTIAL_DELETE => {
                self.handle_voice_asr_credential_delete_impl(params).await
            }
            METHOD_VOICE_ASR_CREDENTIAL_DEFAULT_SET => {
                self.handle_voice_asr_credential_default_set_impl(params)
                    .await
            }
            METHOD_VOICE_ASR_CREDENTIAL_TEST => {
                self.handle_voice_asr_credential_test_impl(params).await
            }
            METHOD_VOICE_INSTRUCTION_LIST => self.handle_voice_instruction_list_impl().await,
            METHOD_VOICE_INSTRUCTION_SAVE => self.handle_voice_instruction_save_impl(params).await,
            METHOD_VOICE_INSTRUCTION_DELETE => {
                self.handle_voice_instruction_delete_impl(params).await
            }
            METHOD_VOICE_MODEL_DEFAULT_SET => {
                self.handle_voice_model_default_set_impl(params).await
            }
            METHOD_VOICE_MODEL_TEST_TRANSCRIBE_FILE => {
                self.handle_voice_model_test_transcribe_file_impl(params)
                    .await
            }
            METHOD_WORKSPACE_SKILL_BINDINGS_LIST => {
                self.handle_workspace_skill_bindings_list_impl(params).await
            }
            METHOD_WORKSPACE_REGISTERED_SKILLS_LIST => {
                self.handle_workspace_registered_skills_list_impl(params)
                    .await
            }
            METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST => {
                self.handle_workspace_right_surface_request_impl(params)
                    .await
            }
            METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST => {
                self.handle_workspace_right_surface_pending_list_impl(params)
                    .await
            }
            METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CONSUME => {
                self.handle_workspace_right_surface_pending_consume_impl(params)
                    .await
            }
            METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_DISMISS => {
                self.handle_workspace_right_surface_pending_dismiss_impl(params)
                    .await
            }
            METHOD_BROWSER_SESSION_TARGET_LIST => {
                self.handle_browser_session_target_list_impl(params).await
            }
            METHOD_BROWSER_SESSION_OPEN => self.handle_browser_session_open_impl(params).await,
            METHOD_BROWSER_SESSION_READ => self.handle_browser_session_read_impl(params).await,
            METHOD_BROWSER_SESSION_CLOSE => self.handle_browser_session_close_impl(params).await,
            METHOD_BROWSER_SESSION_EVENT_LIST => {
                self.handle_browser_session_event_list_impl(params).await
            }
            METHOD_BROWSER_SESSION_ACTION_EXECUTE => {
                self.handle_browser_session_action_execute_impl(params)
                    .await
            }
            METHOD_AGENT_APP_LOCAL_PACKAGE_INSPECT => {
                self.handle_agent_app_local_package_inspect_impl(params)
                    .await
            }
            METHOD_AGENT_APP_PACKAGE_FETCH_CLOUD => {
                self.handle_agent_app_package_fetch_cloud_impl(params).await
            }
            METHOD_AGENT_APP_INSTALLED_SAVE => {
                self.handle_agent_app_installed_save_impl(params).await
            }
            METHOD_AGENT_APP_INSTALLED_LIST => self.handle_agent_app_installed_list_impl().await,
            METHOD_AGENT_APP_INSTALLED_DISABLED_SET => {
                self.handle_agent_app_installed_disabled_set_impl(params)
                    .await
            }
            METHOD_AGENT_APP_INSTALLED_UNINSTALL_REHEARSAL => {
                self.handle_agent_app_installed_uninstall_rehearsal_impl(params)
                    .await
            }
            METHOD_AGENT_APP_INSTALLED_UNINSTALL => {
                self.handle_agent_app_installed_uninstall_impl(params).await
            }
            METHOD_AGENT_APP_HOST_LIFECYCLE_LIST => {
                self.handle_agent_app_host_lifecycle_list_impl().await
            }
            METHOD_AGENT_APP_SHELL_PREPARE => {
                self.handle_agent_app_shell_prepare_impl(params).await
            }
            METHOD_AGENT_APP_UI_RUNTIME_START => {
                self.handle_agent_app_ui_runtime_start_impl(params).await
            }
            METHOD_AGENT_APP_UI_RUNTIME_STATUS => {
                self.handle_agent_app_ui_runtime_status_impl(params).await
            }
            METHOD_AGENT_APP_UI_RUNTIME_STOP => {
                self.handle_agent_app_ui_runtime_stop_impl(params).await
            }
            METHOD_KNOWLEDGE_PACK_LIST => self.handle_knowledge_pack_list_impl(params).await,
            METHOD_KNOWLEDGE_PACK_READ => self.handle_knowledge_pack_read_impl(params).await,
            METHOD_KNOWLEDGE_SOURCE_IMPORT => {
                self.handle_knowledge_source_import_impl(params).await
            }
            METHOD_KNOWLEDGE_PACK_COMPILE => self.handle_knowledge_pack_compile_impl(params).await,
            METHOD_KNOWLEDGE_PACK_DEFAULT_SET => {
                self.handle_knowledge_pack_default_set_impl(params).await
            }
            METHOD_KNOWLEDGE_PACK_STATUS_UPDATE => {
                self.handle_knowledge_pack_status_update_impl(params).await
            }
            METHOD_KNOWLEDGE_CONTEXT_RESOLVE => {
                self.handle_knowledge_context_resolve_impl(params).await
            }
            METHOD_KNOWLEDGE_CONTEXT_RUN_VALIDATE => {
                self.handle_knowledge_context_run_validate_impl(params)
                    .await
            }
            METHOD_AUTOMATION_SCHEDULER_CONFIG_READ => {
                self.handle_automation_scheduler_config_read_impl().await
            }
            METHOD_AUTOMATION_SCHEDULER_CONFIG_UPDATE => {
                self.handle_automation_scheduler_config_update_impl(params)
                    .await
            }
            METHOD_AUTOMATION_SCHEDULER_STATUS => {
                self.handle_automation_scheduler_status_impl().await
            }
            METHOD_AUTOMATION_JOB_LIST => self.handle_automation_job_list_impl().await,
            METHOD_AUTOMATION_JOB_READ => self.handle_automation_job_read_impl(params).await,
            METHOD_AUTOMATION_JOB_CREATE => self.handle_automation_job_create_impl(params).await,
            METHOD_AUTOMATION_JOB_UPDATE => self.handle_automation_job_update_impl(params).await,
            METHOD_AUTOMATION_JOB_DELETE => self.handle_automation_job_delete_impl(params).await,
            METHOD_AUTOMATION_JOB_RUN_NOW => self.handle_automation_job_run_now_impl(params).await,
            METHOD_AUTOMATION_JOB_HEALTH => self.handle_automation_job_health_impl(params).await,
            METHOD_AUTOMATION_JOB_RUN_HISTORY => {
                self.handle_automation_job_run_history_impl(params).await
            }
            METHOD_AUTOMATION_SCHEDULE_PREVIEW => {
                self.handle_automation_schedule_preview_impl(params).await
            }
            METHOD_AUTOMATION_SCHEDULE_VALIDATE => {
                self.handle_automation_schedule_validate_impl(params).await
            }
            METHOD_MCP_SERVER_LIST => self.handle_mcp_server_list_impl().await,
            METHOD_MCP_SERVER_STATUS_LIST => self.handle_mcp_server_status_list_impl().await,
            METHOD_MCP_SERVER_CREATE => self.handle_mcp_server_create_impl(params).await,
            METHOD_MCP_SERVER_UPDATE => self.handle_mcp_server_update_impl(params).await,
            METHOD_MCP_SERVER_DELETE => self.handle_mcp_server_delete_impl(params).await,
            METHOD_MCP_SERVER_ENABLED_SET => self.handle_mcp_server_enabled_set_impl(params).await,
            METHOD_MCP_SERVER_IMPORT_FROM_APP => {
                self.handle_mcp_server_import_from_app_impl(params).await
            }
            METHOD_MCP_SERVER_SYNC_ALL_TO_LIVE => {
                self.handle_mcp_server_sync_all_to_live_impl().await
            }
            METHOD_MCP_SERVER_OAUTH_LOGIN => self.handle_mcp_server_oauth_login_impl(params).await,
            METHOD_MCP_SERVER_START => self.handle_mcp_server_start_impl(params).await,
            METHOD_MCP_SERVER_STOP => self.handle_mcp_server_stop_impl(params).await,
            METHOD_MCP_TOOL_LIST => self.handle_mcp_tool_list_impl().await,
            METHOD_MCP_TOOL_LIST_FOR_CONTEXT => {
                self.handle_mcp_tool_list_for_context_impl(params).await
            }
            METHOD_MCP_TOOL_SEARCH => self.handle_mcp_tool_search_impl(params).await,
            METHOD_MCP_TOOL_CALL => self.handle_mcp_tool_call_impl(params).await,
            METHOD_MCP_TOOL_CALL_WITH_CALLER => {
                self.handle_mcp_tool_call_with_caller_impl(params).await
            }
            METHOD_MCP_PROMPT_LIST => self.handle_mcp_prompt_list_impl().await,
            METHOD_MCP_PROMPT_GET => self.handle_mcp_prompt_get_impl(params).await,
            METHOD_MCP_RESOURCE_LIST => self.handle_mcp_resource_list_impl().await,
            METHOD_MCP_RESOURCE_READ => self.handle_mcp_resource_read_impl(params).await,
            METHOD_MCP_RESOURCE_SUBSCRIBE => self.handle_mcp_resource_subscribe_impl(params).await,
            METHOD_MCP_RESOURCE_UNSUBSCRIBE => {
                self.handle_mcp_resource_unsubscribe_impl(params).await
            }
            METHOD_PROJECT_MEMORY_READ => self.handle_project_memory_read_impl(params).await,
            METHOD_MEMORY_STORE_LIST => self.handle_memory_store_list_impl(params).await,
            METHOD_MEMORY_STORE_READ => self.handle_memory_store_read_impl(params).await,
            METHOD_MEMORY_STORE_SEARCH => self.handle_memory_store_search_impl(params).await,
            METHOD_MEMORY_STORE_ADD_NOTE => self.handle_memory_store_add_note_impl(params).await,
            METHOD_MEMORY_STORE_CONSOLIDATE => {
                self.handle_memory_store_consolidate_impl(params).await
            }
            METHOD_MEMORY_STORE_REVIEW_LIST => {
                self.handle_memory_store_review_list_impl(params).await
            }
            METHOD_MEMORY_STORE_REVIEW_RESOLVE => {
                self.handle_memory_store_review_resolve_impl(params).await
            }
            METHOD_MEMORY_STORE_HEALTH => self.handle_memory_store_health_impl(params).await,
            METHOD_MEMORY_STORE_RESET => self.handle_memory_store_reset_impl(params).await,
            METHOD_MEMORY_STORE_INDEX_REBUILD => {
                self.handle_memory_store_index_rebuild_impl(params).await
            }
            METHOD_LOG_LIST => self.handle_log_list_impl().await,
            METHOD_LOG_PERSISTED_TAIL => self.handle_log_persisted_tail_impl(params).await,
            METHOD_LOG_CLEAR => self.handle_log_clear_impl().await,
            METHOD_LOG_DIAGNOSTIC_HISTORY_CLEAR => {
                self.handle_log_diagnostic_history_clear_impl().await
            }
            METHOD_DIAGNOSTICS_LOG_STORAGE_READ => {
                self.handle_diagnostics_log_storage_read_impl().await
            }
            METHOD_DIAGNOSTICS_SUPPORT_BUNDLE_EXPORT => {
                self.handle_diagnostics_support_bundle_export_impl(params)
                    .await
            }
            METHOD_DIAGNOSTICS_SERVER_READ => self.handle_diagnostics_server_read_impl().await,
            METHOD_DIAGNOSTICS_WINDOWS_STARTUP_READ => {
                self.handle_diagnostics_windows_startup_read_impl().await
            }
            METHOD_DIAGNOSTICS_TRACE_LIST => self.handle_diagnostics_trace_list_impl(params).await,
            METHOD_DIAGNOSTICS_TRACE_READ => self.handle_diagnostics_trace_read_impl(params).await,
            METHOD_DIAGNOSTICS_TRACE_EXPORT => {
                self.handle_diagnostics_trace_export_impl(params).await
            }
            METHOD_USAGE_STATS_READ => self.handle_usage_stats_read(params).await,
            METHOD_USAGE_STATS_MODEL_RANKING_LIST => {
                self.handle_usage_stats_model_ranking_list(params).await
            }
            METHOD_USAGE_STATS_DAILY_TRENDS_LIST => {
                self.handle_usage_stats_daily_trends_list(params).await
            }
            METHOD_MODEL_LIST => self.handle_model_list_impl(params).await,
            METHOD_MODEL_PREFERENCES_LIST => self.handle_model_preferences_list_impl().await,
            METHOD_MODEL_SYNC_STATE_READ => self.handle_model_sync_state_read_impl().await,
            METHOD_MODEL_PROVIDER_LIST => self.handle_model_provider_list_impl().await,
            METHOD_MODEL_PROVIDER_CATALOG_LIST => {
                self.handle_model_provider_catalog_list_impl().await
            }
            METHOD_MODEL_PROVIDER_READ => self.handle_model_provider_read_impl(params).await,
            METHOD_MODEL_PROVIDER_CREATE => self.handle_model_provider_create_impl(params).await,
            METHOD_MODEL_PROVIDER_UPDATE => self.handle_model_provider_update_impl(params).await,
            METHOD_MODEL_PROVIDER_DELETE => self.handle_model_provider_delete_impl(params).await,
            METHOD_MODEL_PROVIDER_SORT_ORDERS_UPDATE => {
                self.handle_model_provider_sort_orders_update_impl(params)
                    .await
            }
            METHOD_MODEL_PROVIDER_CONFIG_EXPORT => {
                self.handle_model_provider_config_export_impl(params).await
            }
            METHOD_MODEL_PROVIDER_CONFIG_IMPORT => {
                self.handle_model_provider_config_import_impl(params).await
            }
            METHOD_MODEL_PROVIDER_TEST_CONNECTION => {
                self.handle_model_provider_test_connection_impl(params)
                    .await
            }
            METHOD_MODEL_PROVIDER_TEST_CHAT => {
                self.handle_model_provider_test_chat_impl(params).await
            }
            METHOD_MODEL_PROVIDER_FETCH_MODELS => {
                self.handle_model_provider_fetch_models_impl(params).await
            }
            METHOD_MODEL_PROVIDER_KEY_CREATE => {
                self.handle_model_provider_key_create_impl(params).await
            }
            METHOD_MODEL_PROVIDER_KEY_UPDATE => {
                self.handle_model_provider_key_update_impl(params).await
            }
            METHOD_MODEL_PROVIDER_KEY_DELETE => {
                self.handle_model_provider_key_delete_impl(params).await
            }
            METHOD_MODEL_PROVIDER_KEY_NEXT => {
                self.handle_model_provider_key_next_impl(params).await
            }
            METHOD_MODEL_PROVIDER_KEY_USAGE_RECORD => {
                self.handle_model_provider_key_usage_record_impl(params)
                    .await
            }
            METHOD_MODEL_PROVIDER_KEY_ERROR_RECORD => {
                self.handle_model_provider_key_error_record_impl(params)
                    .await
            }
            METHOD_MODEL_PROVIDER_UI_STATE_READ => {
                self.handle_model_provider_ui_state_read_impl(params).await
            }
            METHOD_MODEL_PROVIDER_UI_STATE_WRITE => {
                self.handle_model_provider_ui_state_write_impl(params).await
            }
            METHOD_MODEL_PROVIDER_ALIAS_READ => {
                self.handle_model_provider_alias_read_impl(params).await
            }
            METHOD_MODEL_PROVIDER_ALIAS_LIST => self.handle_model_provider_alias_list_impl().await,
            METHOD_CONNECT_DEEP_LINK_RESOLVE => {
                self.handle_connect_deep_link_resolve_impl(params).await
            }
            METHOD_CONNECT_OPEN_DEEP_LINK_RESOLVE => {
                self.handle_connect_open_deep_link_resolve_impl(params)
                    .await
            }
            METHOD_CONNECT_RELAY_API_KEY_SAVE => {
                self.handle_connect_relay_api_key_save_impl(params).await
            }
            METHOD_CONNECT_CALLBACK_SEND => self.handle_connect_callback_send_impl(params).await,
            METHOD_CONVERSATION_IMPORT_SOURCE_SCAN => {
                self.handle_conversation_import_source_scan_impl(params)
                    .await
            }
            METHOD_CONVERSATION_IMPORT_THREAD_PREVIEW => {
                self.handle_conversation_import_thread_preview_impl(params)
                    .await
            }
            METHOD_CONVERSATION_IMPORT_THREAD_COMMIT => {
                self.handle_conversation_import_thread_commit_impl(params)
                    .await
            }
            METHOD_CONVERSATION_IMPORT_THREAD_RUNTIME_EVENTS_READ => {
                self.handle_conversation_import_thread_runtime_events_read_impl(params)
                    .await
            }
            METHOD_AGENT_SESSION_TURN_START => self.handle_turn_start(params, event_callback).await,
            METHOD_AGENT_SESSION_TURN_CANCEL => self.handle_turn_cancel(params).await,
            METHOD_AGENT_SESSION_ACTION_REPLAY => self.handle_action_replay(params).await,
            METHOD_AGENT_SESSION_ACTION_RESPOND => self.handle_action_respond(params).await,
            METHOD_AGENT_SESSION_RUNTIME_EVENTS_APPEND => {
                self.handle_runtime_events_append_impl(params).await
            }
            METHOD_AGENT_SESSION_TOOL_INVENTORY_READ => {
                self.handle_tool_inventory_read_impl(params).await
            }
            _ => Err(JsonRpcError::new(
                error_codes::METHOD_NOT_FOUND,
                format!("method not found: {method}"),
            )),
        };

        match result {
            Ok(dispatch) => {
                let mut messages =
                    Vec::with_capacity(dispatch.events.len() + dispatch.notifications.len() + 1);
                messages.push(JsonRpcMessage::Response(JsonRpcResponse {
                    id,
                    result: dispatch.result,
                }));
                for event in dispatch.events {
                    messages.push(event_notification(event)?);
                }
                for notification in dispatch.notifications {
                    messages.push(JsonRpcMessage::Notification(notification));
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
mod tests {
    use super::*;
    use crate::SidecarStore;
    use app_server_protocol::AgentSessionStartParams;
    use app_server_protocol::CapabilityDescriptor;
    use app_server_protocol::ClientCapabilities;
    use app_server_protocol::JsonRpcMessage;
    use app_server_protocol::RequestId;
    use serde_json::json;
    use std::sync::Arc;
    use tokio::time::Duration;

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

    async fn initialize_processor(processor: &RequestProcessor) {
        processor
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
        processor.handle_notification(JsonRpcNotification::new(
            METHOD_INITIALIZED,
            Some(json!({})),
        ));
    }

    fn assert_right_surface_pending_changed_notification(
        message: &JsonRpcMessage,
        change_type: &str,
        request_ids: serde_json::Value,
    ) {
        match message {
            JsonRpcMessage::Notification(notification) => {
                assert_eq!(
                    notification.method,
                    METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CHANGED
                );
                let params = notification.params.as_ref().expect("notification params");
                assert_eq!(params["changeType"], change_type);
                assert_eq!(params["requestIds"], request_ids);
            }
            other => panic!("expected right surface notification, got {other:?}"),
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
    async fn workspace_right_surface_methods_register_and_list_pending_requests() {
        let processor = RequestProcessor::new(RuntimeCore::default());
        initialize_processor(&processor).await;

        let requested = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(20),
                METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
                Some(json!({
                    "workspaceId": "workspace-main",
                    "workspaceRoot": "/workspace/project",
                    "sessionId": "sess-main",
                    "surfaceKind": "objectCanvas",
                    "origin": "mcp:browser",
                    "reason": "Browser candidate",
                    "priority": "high",
                    "candidateId": "candidate-1",
                    "metadata": { "source": "browser-assist" },
                })),
            ))
            .await
            .expect("right surface request response");
        assert_eq!(requested.len(), 2);

        let request_id = match &requested[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["status"], "pending");
                assert_eq!(response.result["pending"]["surfaceKind"], "objectCanvas");
                assert_eq!(response.result["pending"]["origin"], "mcp:browser");
                assert_eq!(response.result["pending"]["priority"], "high");
                assert_eq!(
                    response.result["pending"]["metadata"],
                    json!({ "source": "browser-assist" })
                );
                response.result["requestId"]
                    .as_str()
                    .expect("request id")
                    .to_string()
            }
            other => panic!("expected response, got {other:?}"),
        };
        assert_right_surface_pending_changed_notification(
            &requested[1],
            "requested",
            json!([request_id.clone()]),
        );
        match &requested[1] {
            JsonRpcMessage::Notification(notification) => {
                let params = notification.params.as_ref().expect("notification params");
                assert_eq!(params["surfaceKind"], "objectCanvas");
                assert_eq!(params["pending"][0]["requestId"], request_id);
                assert_eq!(params["pending"][0]["workspaceRoot"], "/workspace/project");
            }
            other => panic!("expected right surface notification, got {other:?}"),
        }

        let listed = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(21),
                METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST,
                Some(json!({
                    "workspaceId": "workspace-main",
                    "surfaceKind": "objectCanvas",
                    "limit": 5,
                })),
            ))
            .await
            .expect("right surface pending list response");

        match &listed[0] {
            JsonRpcMessage::Response(response) => {
                let pending = response.result["pending"]
                    .as_array()
                    .expect("pending array");
                assert_eq!(pending.len(), 1);
                assert_eq!(pending[0]["workspaceRoot"], "/workspace/project");
                assert_eq!(pending[0]["sessionId"], "sess-main");
                assert_eq!(pending[0]["candidateId"], "candidate-1");
            }
            other => panic!("expected response, got {other:?}"),
        }

        let consumed = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(22),
                METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_CONSUME,
                Some(json!({
                    "requestId": request_id.clone(),
                    "requestIds": ["right-surface:missing"],
                })),
            ))
            .await
            .expect("right surface pending consume response");
        assert_eq!(consumed.len(), 2);

        match &consumed[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["status"], "consumed");
                assert_eq!(
                    response.result["consumedRequestIds"],
                    json!([request_id.clone()])
                );
                assert_eq!(
                    response.result["missingRequestIds"],
                    json!(["right-surface:missing"])
                );
            }
            other => panic!("expected response, got {other:?}"),
        }
        assert_right_surface_pending_changed_notification(
            &consumed[1],
            "consumed",
            json!([request_id.clone()]),
        );
        match &consumed[1] {
            JsonRpcMessage::Notification(notification) => {
                let params = notification.params.as_ref().expect("notification params");
                assert_eq!(params["consumedRequestIds"], json!([request_id.clone()]));
                assert_eq!(
                    params["missingRequestIds"],
                    json!(["right-surface:missing"])
                );
            }
            other => panic!("expected right surface notification, got {other:?}"),
        }

        let listed_after_consume = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(23),
                METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST,
                Some(json!({
                    "workspaceId": "workspace-main",
                    "surfaceKind": "objectCanvas",
                })),
            ))
            .await
            .expect("right surface pending list response after consume");

        match &listed_after_consume[0] {
            JsonRpcMessage::Response(response) => {
                let pending = response.result["pending"]
                    .as_array()
                    .expect("pending array");
                assert!(pending.is_empty());
            }
            other => panic!("expected response, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn workspace_right_surface_pending_dismiss_removes_pending_request() {
        let processor = RequestProcessor::new(RuntimeCore::default());
        initialize_processor(&processor).await;

        let requested = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(24),
                METHOD_WORKSPACE_RIGHT_SURFACE_REQUEST,
                Some(json!({
                    "workspaceId": "workspace-dismiss",
                    "surfaceKind": "files",
                    "origin": "skill",
                    "reason": "file preview ready",
                })),
            ))
            .await
            .expect("right surface request response");
        assert_eq!(requested.len(), 2);

        let request_id = match &requested[0] {
            JsonRpcMessage::Response(response) => response.result["requestId"]
                .as_str()
                .expect("request id")
                .to_string(),
            other => panic!("expected response, got {other:?}"),
        };

        let dismissed = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(25),
                METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_DISMISS,
                Some(json!({
                    "requestId": request_id.clone(),
                    "requestIds": ["right-surface:missing"],
                    "reason": "user_closed_surface",
                })),
            ))
            .await
            .expect("right surface pending dismiss response");
        assert_eq!(dismissed.len(), 2);

        match &dismissed[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["status"], "dismissed");
                assert_eq!(
                    response.result["dismissedRequestIds"],
                    json!([request_id.clone()])
                );
                assert_eq!(
                    response.result["missingRequestIds"],
                    json!(["right-surface:missing"])
                );
            }
            other => panic!("expected response, got {other:?}"),
        }
        assert_right_surface_pending_changed_notification(
            &dismissed[1],
            "dismissed",
            json!([request_id.clone()]),
        );
        match &dismissed[1] {
            JsonRpcMessage::Notification(notification) => {
                let params = notification.params.as_ref().expect("notification params");
                assert_eq!(params["dismissedRequestIds"], json!([request_id.clone()]));
                assert_eq!(
                    params["missingRequestIds"],
                    json!(["right-surface:missing"])
                );
            }
            other => panic!("expected right surface notification, got {other:?}"),
        }

        let listed_after_dismiss = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(26),
                METHOD_WORKSPACE_RIGHT_SURFACE_PENDING_LIST,
                Some(json!({
                    "workspaceId": "workspace-dismiss",
                    "surfaceKind": "files",
                })),
            ))
            .await
            .expect("right surface pending list response after dismiss");

        match &listed_after_dismiss[0] {
            JsonRpcMessage::Response(response) => {
                let pending = response.result["pending"]
                    .as_array()
                    .expect("pending array");
                assert!(pending.is_empty());
            }
            other => panic!("expected response, got {other:?}"),
        }
    }

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

    #[tokio::test]
    async fn artifact_read_requires_initialized_and_returns_artifact_summaries() {
        let sidecar_root = tempfile::tempdir().expect("sidecar root");
        let runtime = RuntimeCore::default().with_sidecar_store(Arc::new(
            SidecarStore::new(sidecar_root.path()).expect("sidecar store"),
        ));
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
    async fn project_git_status_requires_initialized_and_returns_local_mode_for_plain_directory() {
        let processor = RequestProcessor::new(RuntimeCore::default());
        let blocked = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(1),
                METHOD_PROJECT_GIT_STATUS,
                Some(json!({ "rootPath": "." })),
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
        let messages = processor
            .handle_request(JsonRpcRequest::new(
                RequestId::Integer(3),
                METHOD_PROJECT_GIT_STATUS,
                Some(json!({ "rootPath": temp_dir.path() })),
            ))
            .await
            .expect("project git status response");

        match &messages[0] {
            JsonRpcMessage::Response(response) => {
                assert_eq!(response.result["hasGitRepository"], false);
                assert_eq!(response.result["branches"], serde_json::json!([]));
                assert_eq!(response.result["uncommittedFileCount"], 0);
                assert!(response.result.get("currentBranch").is_none());
                assert!(response.result.get("repositoryRoot").is_none());
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
            (
                RequestId::Integer(15),
                METHOD_MCP_RESOURCE_SUBSCRIBE,
                json!({ "uri": "docs://readme" }),
            ),
            (
                RequestId::Integer(16),
                METHOD_MCP_RESOURCE_UNSUBSCRIBE,
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
        let sidecar_root = tempfile::tempdir().expect("sidecar root");
        let runtime = RuntimeCore::default().with_sidecar_store(Arc::new(
            SidecarStore::new(sidecar_root.path()).expect("sidecar store"),
        ));
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
                assert_eq!(response.result["events"].as_array().unwrap().len(), 4);
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
