use super::request_context::{
    apply_app_server_turn_policy, effective_runtime_options_for_turn, host_reasoning_effort,
    host_thinking_enabled, request_workspace_scope, resolve_runtime_model_selection,
    selection_from_explicit_preferences, selection_from_host_provider_config,
    selection_from_session_default, selection_with_effective_reasoning,
    should_use_compact_tool_surface, turn_context_from_request, RuntimeModelSelection,
};
use super::*;
use crate::runtime::ToolInventoryReadRequest;
use crate::AppDataSource;
use crate::AutomationManagementAppDataSource;
use crate::AutomationOverviewAppDataSource;
use crate::ConnectAppDataSource;
use crate::DiagnosticsAppDataSource;
use crate::GatewayAppDataSource;
use crate::KnowledgeAppDataSource;
use crate::McpAppDataSource;
use crate::MediaAppDataSource;
use crate::MemoryAppDataSource;
use crate::ModelProviderAppDataSource;
use crate::NoopAppDataSource;
use crate::PluginDataSource;
use crate::RightSurfaceAppDataSource;
use crate::RuntimeHostContext;
use crate::SessionAppDataSource;
use crate::SkillAppDataSource;
use crate::UsageStatsAppDataSource;
use crate::VoiceAppDataSource;
use crate::WorkspaceAppDataSource;
use crate::WorkspaceSkillBindingAppDataSource;
use crate::{ActionRespondRequest, CancelExecutionRequest, ExecutionBackend};
use agent_protocol::turn_context::TurnOutputSchemaSource;
use app_server_protocol::AgentInput;
use app_server_protocol::AgentSession;
use app_server_protocol::AgentSessionActionScope;
use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentTurn;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::BusinessObjectRef;
use app_server_protocol::McpServerLifecycleResponse;
use app_server_protocol::McpServerStartParams;
use app_server_protocol::McpServerStatusListResponse;
use app_server_protocol::RuntimeOptions;
use async_trait::async_trait;
use lime_agent::agent_tools::catalog::{
    MEMORY_ADD_NOTE_TOOL_NAME, MEMORY_LIST_TOOL_NAME, MEMORY_READ_TOOL_NAME,
    MEMORY_SEARCH_TOOL_NAME, TOOL_SEARCH_TOOL_NAME,
};
use lime_agent::{
    AgentEvent as RuntimeAgentEvent, AgentToolResult, RequestToolPolicyMode, SessionProviderConfig,
};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::Mutex;
use tempfile::TempDir;

mod coding_event_projection;
mod image_tools;
mod model_selection;
mod session_prompt_context;
mod session_skill_context;
mod session_soul_context;
mod tool_inventory;
mod tool_policy_context;
mod tool_surface;
mod turn_flows;
mod workspace_scope_context;

#[derive(Default)]
struct TestRuntimeEventSink {
    events: Vec<RuntimeEvent>,
}

impl RuntimeEventSink for TestRuntimeEventSink {
    fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError> {
        self.events.push(event);
        Ok(())
    }
}

#[derive(Default)]
struct TestMcpAutostartDataSource {
    servers: Vec<Value>,
    started_servers: Mutex<Vec<String>>,
    fail_start: bool,
    hang_start: bool,
}

impl TestMcpAutostartDataSource {
    fn new(servers: Vec<Value>) -> Self {
        Self {
            servers,
            started_servers: Mutex::new(Vec::new()),
            fail_start: false,
            hang_start: false,
        }
    }

    fn with_fail_start(mut self) -> Self {
        self.fail_start = true;
        self
    }

    fn with_hanging_start(mut self) -> Self {
        self.hang_start = true;
        self
    }

    fn started_servers(&self) -> Vec<String> {
        self.started_servers
            .lock()
            .expect("started servers lock")
            .clone()
    }
}

impl SessionAppDataSource for TestMcpAutostartDataSource {}
impl WorkspaceAppDataSource for TestMcpAutostartDataSource {}
impl SkillAppDataSource for TestMcpAutostartDataSource {}
impl WorkspaceSkillBindingAppDataSource for TestMcpAutostartDataSource {}
impl GatewayAppDataSource for TestMcpAutostartDataSource {}
impl MediaAppDataSource for TestMcpAutostartDataSource {}
impl VoiceAppDataSource for TestMcpAutostartDataSource {}
impl PluginDataSource for TestMcpAutostartDataSource {}
impl KnowledgeAppDataSource for TestMcpAutostartDataSource {}
impl AutomationOverviewAppDataSource for TestMcpAutostartDataSource {}
impl AutomationManagementAppDataSource for TestMcpAutostartDataSource {}
impl MemoryAppDataSource for TestMcpAutostartDataSource {}
impl DiagnosticsAppDataSource for TestMcpAutostartDataSource {}
impl UsageStatsAppDataSource for TestMcpAutostartDataSource {}
impl ModelProviderAppDataSource for TestMcpAutostartDataSource {}
impl ConnectAppDataSource for TestMcpAutostartDataSource {}
impl RightSurfaceAppDataSource for TestMcpAutostartDataSource {}

#[async_trait]
impl McpAppDataSource for TestMcpAutostartDataSource {
    async fn list_mcp_servers_with_status(
        &self,
    ) -> Result<McpServerStatusListResponse, RuntimeCoreError> {
        Ok(McpServerStatusListResponse {
            servers: self.servers.clone(),
        })
    }

    async fn start_mcp_server(
        &self,
        params: McpServerStartParams,
    ) -> Result<McpServerLifecycleResponse, RuntimeCoreError> {
        self.started_servers
            .lock()
            .expect("started servers lock")
            .push(params.name);
        if self.hang_start {
            std::future::pending().await
        }
        if self.fail_start {
            return Err(RuntimeCoreError::Backend("start failed".to_string()));
        }
        Ok(McpServerLifecycleResponse::default())
    }
}

pub(super) fn request_for_test(
    message: &str,
    runtime_request: Option<app_server_protocol::RuntimeRequest>,
    metadata: Option<Value>,
) -> ExecutionRequest {
    let runtime_request = match (runtime_request, metadata) {
        (Some(mut runtime_request), Some(metadata)) => {
            runtime_request.metadata = Some(metadata);
            Some(runtime_request)
        }
        (Some(runtime_request), None) => Some(runtime_request),
        (None, Some(metadata)) => Some(app_server_protocol::RuntimeRequest {
            metadata: Some(metadata),
            ..app_server_protocol::RuntimeRequest::default()
        }),
        (None, None) => None,
    };
    ExecutionRequest {
        host: RuntimeHostContext::default(),
        session: AgentSession {
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            status: AgentSessionStatus::Running,
            created_at: "2026-06-07T00:00:00.000Z".to_string(),
            updated_at: "2026-06-07T00:00:00.000Z".to_string(),
        },
        turn: AgentTurn {
            turn_id: "turn-1".to_string(),
            session_id: "session-1".to_string(),
            thread_id: "thread-1".to_string(),
            status: AgentTurnStatus::Accepted,
            started_at: None,
            completed_at: None,
        },
        input: AgentInput {
            text: message.to_string(),
            attachments: Vec::new(),
        },
        runtime_options: Some(RuntimeOptions {
            stream: true,
            runtime_request,
            ..RuntimeOptions::default()
        }),
        event_name: None,
        expected_output: None,
        structured_output: None,
        output_schema: None,
        queued_turn_id: None,
        queue_if_busy: false,
        skip_pre_submit_resume: false,
        agent_control_gateway: None,
    }
}

pub(super) fn apply_detached_desktop_first_turn_policy(request: &mut ExecutionRequest) {
    request.session.app_id = "desktop".to_string();
    request.session.workspace_id = None;
    request.session.business_object_ref = None;
    let host_request = super::request_context::runtime_request_from_request(request);
    let tool_policy =
        super::request_context::request_tool_policy_from_request(host_request.as_ref());
    apply_app_server_turn_policy(request, true, &tool_policy);
}

fn request_with_session_metadata(metadata: Value) -> ExecutionRequest {
    let mut request = request_for_test("hello", None, None);
    request.session.business_object_ref = Some(BusinessObjectRef {
        kind: "agent_session".to_string(),
        id: "session-1".to_string(),
        title: None,
        uri: None,
        metadata: Some(metadata),
    });
    request.runtime_options = None;
    request
}

fn imported_request_with_session_metadata(metadata: Value) -> ExecutionRequest {
    let mut request = request_with_session_metadata(metadata);
    if let Some(reference) = request.session.business_object_ref.as_mut() {
        reference.kind = "conversation.import".to_string();
    }
    request
}

fn article_workspace_snapshot_event_without_search() -> RuntimeEvent {
    RuntimeEvent::new(
        "artifact.snapshot",
        json!({
            "artifact": {
                "artifactId": "artifact-article-workspace",
                "kind": "content_factory.workspace_patch",
                "metadata": {
                    "contentFactoryWorkspacePatch": {
                        "schemaVersion": 1,
                        "appId": "content-factory-app",
                        "sessionId": "session-1",
                        "objects": [
                            {
                                "ref": {
                                    "appId": "content-factory-app",
                                    "kind": "articleDraft",
                                    "id": "article-draft-1",
                                    "sessionId": "session-1"
                                },
                                "title": "公众号文章草稿",
                                "status": "ready",
                                "source": {
                                    "taskKind": "content.article.generate",
                                    "taskId": "task-article-draft-1",
                                    "documentText": "# 草稿\n\n正文。",
                                    "finalMarkdown": "# 草稿\n\n正文。"
                                }
                            }
                        ]
                    }
                }
            }
        }),
    )
}
