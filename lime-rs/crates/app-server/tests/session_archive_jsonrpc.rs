use std::env;
use std::fs;
use std::io::BufRead;
use std::io::BufReader;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::process::Child;
use std::process::ChildStdout;
use std::process::Command;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;
use std::time::Instant;

use app_server::AgentAppDataSource;
use app_server::AppServer;
use app_server::AutomationManagementAppDataSource;
use app_server::AutomationOverviewAppDataSource;
use app_server::ConnectAppDataSource;
use app_server::DiagnosticsAppDataSource;
use app_server::GatewayAppDataSource;
use app_server::KnowledgeAppDataSource;
use app_server::McpAppDataSource;
use app_server::MediaAppDataSource;
use app_server::MemoryAppDataSource;
use app_server::MockBackend;
use app_server::ModelProviderAppDataSource;
use app_server::NoopAppDataSource;
use app_server::RuntimeCore;
use app_server::RuntimeCoreError;
use app_server::SessionAppDataSource;
use app_server::SkillAppDataSource;
use app_server::UsageStatsAppDataSource;
use app_server::VoiceAppDataSource;
use app_server::WorkspaceAppDataSource;
use app_server::WorkspaceSkillBindingAppDataSource;
use app_server_protocol::*;
use async_trait::async_trait;
use lime_core::database::dao::agent_timeline::AgentThreadItem;
use lime_core::database::dao::agent_timeline::AgentThreadItemPayload;
use lime_core::database::dao::agent_timeline::AgentThreadItemStatus;
use lime_core::database::dao::agent_timeline::AgentThreadTurn;
use lime_core::database::dao::agent_timeline::AgentThreadTurnStatus;
use lime_core::database::dao::agent_timeline::AgentTimelineDao;
use rusqlite::params;
use rusqlite::Connection;
use serde_json::json;
use serde_json::Value;
use tempfile::TempDir;

const SESSION_ID: &str = "persisted-session";
const SECOND_SESSION_ID: &str = "persisted-session-second";
const STDIO_SESSION_ID: &str = "persisted-stdio-session";
const THREAD_ID: &str = "persisted-thread";
const WORKSPACE_ID: &str = "workspace-current";

#[derive(Debug)]
struct PersistedSessionArchiveStore {
    sessions: Mutex<Vec<AgentSessionOverview>>,
}

#[derive(Debug, Clone)]
struct PersistedSessionArchiveDataSource {
    store: Arc<PersistedSessionArchiveStore>,
}

impl PersistedSessionArchiveDataSource {
    fn new() -> Self {
        Self::with_sessions(vec![persisted_session_overview(
            SESSION_ID,
            Some(THREAD_ID),
            "Persisted Session",
            "2026-06-07T00:00:00.000Z",
        )])
    }

    fn with_sessions(sessions: Vec<AgentSessionOverview>) -> Self {
        Self {
            store: Arc::new(PersistedSessionArchiveStore {
                sessions: Mutex::new(sessions),
            }),
        }
    }

    fn reopened(&self) -> Self {
        Self {
            store: Arc::clone(&self.store),
        }
    }
}

fn persisted_session_overview(
    session_id: &str,
    thread_id: Option<&str>,
    title: &str,
    updated_at: &str,
) -> AgentSessionOverview {
    AgentSessionOverview {
        session_id: session_id.to_string(),
        thread_id: thread_id.map(str::to_string),
        title: Some(title.to_string()),
        model: "gpt-5.4".to_string(),
        created_at: "2026-06-07T00:00:00.000Z".to_string(),
        updated_at: updated_at.to_string(),
        archived_at: None,
        workspace_id: Some(WORKSPACE_ID.to_string()),
        working_dir: Some("/tmp/workspace-current".to_string()),
        execution_strategy: Some("react".to_string()),
        messages_count: 2,
    }
}

#[async_trait]
impl SessionAppDataSource for PersistedSessionArchiveDataSource {
    async fn list_current_timeline_sessions(
        &self,
        params: AgentSessionListParams,
    ) -> Result<AgentSessionListResponse, RuntimeCoreError> {
        let include_archived = params.include_archived.unwrap_or(false);
        let archived_only = params.archived_only.unwrap_or(false);
        let mut sessions = self
            .store
            .sessions
            .lock()
            .expect("persisted session mutex poisoned")
            .iter()
            .filter(|session| {
                let archived = session.archived_at.is_some();
                let workspace_matches = params.workspace_id.as_deref().is_none_or(|workspace_id| {
                    session.workspace_id.as_deref() == Some(workspace_id)
                });
                workspace_matches
                    && ((archived_only && archived)
                        || (!archived_only && (!archived || include_archived)))
            })
            .cloned()
            .collect::<Vec<_>>();
        sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        Ok(AgentSessionListResponse { sessions })
    }

    async fn read_current_timeline_session(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<Option<AgentSessionReadResponse>, RuntimeCoreError> {
        let overview = self
            .store
            .sessions
            .lock()
            .expect("persisted session mutex poisoned")
            .iter()
            .find(|session| session.session_id == params.session_id)
            .cloned();
        let Some(overview) = overview else {
            return Ok(None);
        };
        let session_id = overview.session_id.clone();
        let thread_id = overview
            .thread_id
            .clone()
            .unwrap_or_else(|| session_id.clone());
        Ok(Some(AgentSessionReadResponse {
            session: AgentSession {
                session_id: session_id.clone(),
                thread_id,
                app_id: "desktop".to_string(),
                workspace_id: overview.workspace_id,
                business_object_ref: Some(BusinessObjectRef {
                    kind: "agent.session".to_string(),
                    id: session_id.clone(),
                    title: overview.title,
                    uri: None,
                    metadata: Some(json!({
                        "executionStrategy": overview.execution_strategy,
                    })),
                }),
                status: AgentSessionStatus::Idle,
                created_at: overview.created_at,
                updated_at: overview.updated_at,
            },
            turns: Vec::new(),
            detail: Some(json!({
                "id": session_id,
                "thread_id": overview.thread_id,
                "messages": [],
                "turns": [],
                "items": [],
                "queued_turns": [],
                "thread_read": {
                    "thread_id": THREAD_ID,
                    "status": "idle"
                },
                "child_subagent_sessions": [],
                "archived_at": overview.archived_at
            })),
        }))
    }

    async fn update_current_timeline_session(
        &self,
        params: AgentSessionUpdateParams,
    ) -> Result<AgentSessionUpdateResponse, RuntimeCoreError> {
        let mut sessions = self
            .store
            .sessions
            .lock()
            .expect("persisted session mutex poisoned");
        let session = sessions
            .iter_mut()
            .find(|session| session.session_id == params.session_id)
            .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
        if let Some(title) = params.title.as_deref().map(str::trim) {
            if !title.is_empty() {
                session.title = Some(title.to_string());
            }
        }
        if let Some(archived) = params.archived {
            session.archived_at = archived.then(|| "2026-06-07T00:00:01.000Z".to_string());
        }
        session.updated_at = "2026-06-07T00:00:01.000Z".to_string();

        Ok(AgentSessionUpdateResponse {
            session: session.clone(),
        })
    }
}

#[async_trait]
impl WorkspaceAppDataSource for PersistedSessionArchiveDataSource {
    async fn list_workspaces(&self) -> Result<WorkspaceListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_workspaces().await
    }

    async fn read_workspace(
        &self,
        params: WorkspaceReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        NoopAppDataSource.read_workspace(params).await
    }

    async fn read_workspace_by_path(
        &self,
        params: WorkspacePathReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        NoopAppDataSource.read_workspace_by_path(params).await
    }

    async fn read_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        NoopAppDataSource.read_default_workspace().await
    }

    async fn ensure_default_workspace(&self) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        NoopAppDataSource.ensure_default_workspace().await
    }

    async fn ensure_workspace_ready(
        &self,
        params: WorkspaceEnsureParams,
    ) -> Result<WorkspaceEnsureReadyResponse, RuntimeCoreError> {
        NoopAppDataSource.ensure_workspace_ready(params).await
    }

    async fn read_workspace_projects_root(
        &self,
    ) -> Result<WorkspaceProjectsRootReadResponse, RuntimeCoreError> {
        NoopAppDataSource.read_workspace_projects_root().await
    }

    async fn resolve_workspace_project_path(
        &self,
        params: WorkspaceProjectPathResolveParams,
    ) -> Result<WorkspaceProjectPathResolveResponse, RuntimeCoreError> {
        NoopAppDataSource
            .resolve_workspace_project_path(params)
            .await
    }
}

#[async_trait]
impl SkillAppDataSource for PersistedSessionArchiveDataSource {
    async fn list_skills(&self) -> Result<SkillListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_skills().await
    }

    async fn read_skill(
        &self,
        params: SkillReadParams,
    ) -> Result<SkillReadResponse, RuntimeCoreError> {
        NoopAppDataSource.read_skill(params).await
    }

    async fn inspect_local_skill_detail(
        &self,
        params: SkillLocalDetailInspectParams,
    ) -> Result<SkillLocalDetailInspectResponse, RuntimeCoreError> {
        NoopAppDataSource.inspect_local_skill_detail(params).await
    }

    async fn rename_local_skill(
        &self,
        params: SkillLocalRenameParams,
    ) -> Result<SkillLocalRenameResponse, RuntimeCoreError> {
        NoopAppDataSource.rename_local_skill(params).await
    }

    async fn inspect_local_skill_package(
        &self,
        params: SkillPackageLocalInspectParams,
    ) -> Result<SkillPackageLocalInspectResponse, RuntimeCoreError> {
        NoopAppDataSource.inspect_local_skill_package(params).await
    }

    async fn install_local_skill_package(
        &self,
        params: SkillPackageLocalInstallParams,
    ) -> Result<SkillPackageLocalInstallResponse, RuntimeCoreError> {
        NoopAppDataSource.install_local_skill_package(params).await
    }

    async fn replace_local_skill_package(
        &self,
        params: SkillPackageLocalReplaceParams,
    ) -> Result<SkillPackageLocalReplaceResponse, RuntimeCoreError> {
        NoopAppDataSource.replace_local_skill_package(params).await
    }

    async fn export_local_skill_package(
        &self,
        params: SkillPackageExportParams,
    ) -> Result<SkillPackageExportResponse, RuntimeCoreError> {
        NoopAppDataSource.export_local_skill_package(params).await
    }
}

#[async_trait]
impl WorkspaceSkillBindingAppDataSource for PersistedSessionArchiveDataSource {
    async fn list_workspace_skill_bindings(
        &self,
        params: WorkspaceSkillBindingsListParams,
    ) -> Result<WorkspaceSkillBindingsListResponse, RuntimeCoreError> {
        NoopAppDataSource
            .list_workspace_skill_bindings(params)
            .await
    }

    async fn list_workspace_registered_skills(
        &self,
        params: WorkspaceRegisteredSkillsListParams,
    ) -> Result<WorkspaceRegisteredSkillsListResponse, RuntimeCoreError> {
        NoopAppDataSource
            .list_workspace_registered_skills(params)
            .await
    }
}

#[async_trait]
impl AgentAppDataSource for PersistedSessionArchiveDataSource {
    async fn list_agent_app_installed(
        &self,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_agent_app_installed().await
    }

    async fn inspect_agent_app_local_package(
        &self,
        params: AgentAppLocalPackageInspectParams,
    ) -> Result<AgentAppLocalPackageInspectResponse, RuntimeCoreError> {
        NoopAppDataSource
            .inspect_agent_app_local_package(params)
            .await
    }

    async fn fetch_agent_app_cloud_package(
        &self,
        params: AgentAppFetchCloudPackageParams,
    ) -> Result<AgentAppPackageCacheEntry, RuntimeCoreError> {
        NoopAppDataSource
            .fetch_agent_app_cloud_package(params)
            .await
    }

    async fn save_agent_app_installed(
        &self,
        params: AgentAppInstalledSaveParams,
    ) -> Result<Value, RuntimeCoreError> {
        NoopAppDataSource.save_agent_app_installed(params).await
    }

    async fn set_agent_app_installed_disabled(
        &self,
        params: AgentAppInstalledDisabledSetParams,
    ) -> Result<AgentAppInstalledListResponse, RuntimeCoreError> {
        NoopAppDataSource
            .set_agent_app_installed_disabled(params)
            .await
    }

    async fn preview_agent_app_uninstall(
        &self,
        params: AgentAppUninstallRehearsalParams,
    ) -> Result<AgentAppUninstallRehearsalResponse, RuntimeCoreError> {
        NoopAppDataSource.preview_agent_app_uninstall(params).await
    }

    async fn uninstall_agent_app(
        &self,
        params: AgentAppUninstallParams,
    ) -> Result<AgentAppUninstallResponse, RuntimeCoreError> {
        NoopAppDataSource.uninstall_agent_app(params).await
    }
}

#[async_trait]
impl KnowledgeAppDataSource for PersistedSessionArchiveDataSource {
    async fn list_knowledge_packs(
        &self,
        params: KnowledgeListPacksParams,
    ) -> Result<KnowledgeListPacksResponse, RuntimeCoreError> {
        NoopAppDataSource.list_knowledge_packs(params).await
    }

    async fn read_knowledge_pack(
        &self,
        params: KnowledgeReadPackParams,
    ) -> Result<KnowledgeReadPackResponse, RuntimeCoreError> {
        NoopAppDataSource.read_knowledge_pack(params).await
    }

    async fn import_knowledge_source(
        &self,
        params: KnowledgeImportSourceParams,
    ) -> Result<KnowledgeImportSourceResponse, RuntimeCoreError> {
        NoopAppDataSource.import_knowledge_source(params).await
    }

    async fn compile_knowledge_pack(
        &self,
        request: lime_knowledge::KnowledgeCompilePackRequest,
    ) -> Result<KnowledgeCompilePackResponse, RuntimeCoreError> {
        NoopAppDataSource.compile_knowledge_pack(request).await
    }

    async fn set_default_knowledge_pack(
        &self,
        params: KnowledgeSetDefaultPackParams,
    ) -> Result<KnowledgeSetDefaultPackResponse, RuntimeCoreError> {
        NoopAppDataSource.set_default_knowledge_pack(params).await
    }

    async fn update_knowledge_pack_status(
        &self,
        params: KnowledgeUpdatePackStatusParams,
    ) -> Result<KnowledgeUpdatePackStatusResponse, RuntimeCoreError> {
        NoopAppDataSource.update_knowledge_pack_status(params).await
    }

    async fn resolve_knowledge_context(
        &self,
        params: KnowledgeResolveContextParams,
    ) -> Result<KnowledgeContextResolutionResponse, RuntimeCoreError> {
        NoopAppDataSource.resolve_knowledge_context(params).await
    }

    async fn validate_knowledge_context_run(
        &self,
        params: KnowledgeValidateContextRunParams,
    ) -> Result<KnowledgeValidateContextRunResponse, RuntimeCoreError> {
        NoopAppDataSource
            .validate_knowledge_context_run(params)
            .await
    }
}

#[async_trait]
impl AutomationOverviewAppDataSource for PersistedSessionArchiveDataSource {
    async fn list_automation_jobs(&self) -> Result<AutomationJobListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_automation_jobs().await
    }
}

#[async_trait]
impl MemoryAppDataSource for PersistedSessionArchiveDataSource {
    async fn read_project_memory(
        &self,
        params: ProjectMemoryReadParams,
    ) -> Result<ProjectMemoryReadResponse, RuntimeCoreError> {
        NoopAppDataSource.read_project_memory(params).await
    }
}

#[async_trait]
impl UsageStatsAppDataSource for PersistedSessionArchiveDataSource {
    async fn read_usage_stats(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsReadResponse, RuntimeCoreError> {
        NoopAppDataSource.read_usage_stats(params).await
    }

    async fn list_usage_stats_model_ranking(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsModelRankingListResponse, RuntimeCoreError> {
        NoopAppDataSource
            .list_usage_stats_model_ranking(params)
            .await
    }

    async fn list_usage_stats_daily_trends(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsDailyTrendsListResponse, RuntimeCoreError> {
        NoopAppDataSource
            .list_usage_stats_daily_trends(params)
            .await
    }
}

#[async_trait]
impl ModelProviderAppDataSource for PersistedSessionArchiveDataSource {
    async fn list_models(
        &self,
        params: ModelListParams,
    ) -> Result<ModelListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_models(params).await
    }

    async fn list_model_preferences(
        &self,
    ) -> Result<ModelPreferencesListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_model_preferences().await
    }

    async fn read_model_sync_state(&self) -> Result<ModelSyncStateReadResponse, RuntimeCoreError> {
        NoopAppDataSource.read_model_sync_state().await
    }

    async fn list_model_providers(&self) -> Result<ModelProviderListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_model_providers().await
    }

    async fn list_model_provider_catalog(
        &self,
    ) -> Result<ModelProviderCatalogListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_model_provider_catalog().await
    }

    async fn read_model_provider_alias(
        &self,
        params: ModelProviderAliasReadParams,
    ) -> Result<ModelProviderAliasReadResponse, RuntimeCoreError> {
        NoopAppDataSource.read_model_provider_alias(params).await
    }

    async fn list_model_provider_aliases(
        &self,
    ) -> Result<ModelProviderAliasListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_model_provider_aliases().await
    }
}

impl GatewayAppDataSource for PersistedSessionArchiveDataSource {}
impl MediaAppDataSource for PersistedSessionArchiveDataSource {}
impl VoiceAppDataSource for PersistedSessionArchiveDataSource {}
impl McpAppDataSource for PersistedSessionArchiveDataSource {}
impl AutomationManagementAppDataSource for PersistedSessionArchiveDataSource {}
impl DiagnosticsAppDataSource for PersistedSessionArchiveDataSource {}
impl ConnectAppDataSource for PersistedSessionArchiveDataSource {}

#[tokio::test]
async fn persisted_session_archive_and_unarchive_use_current_jsonrpc() {
    let data_source = Arc::new(PersistedSessionArchiveDataSource::new());
    let server = app_server(Arc::clone(&data_source));
    initialize_server(&server, 1, "session-archive-jsonrpc-test").await;

    let archive = request(
        &server,
        2,
        METHOD_AGENT_SESSION_UPDATE,
        json!({
            "sessionId": SESSION_ID,
            "archived": true
        }),
    )
    .await;
    let archived_at = archive
        .pointer("/result/session/archivedAt")
        .and_then(Value::as_str)
        .expect("archived persisted session should include archivedAt");
    assert!(!archived_at.is_empty());

    let recent = request(
        &server,
        3,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID
        }),
    )
    .await;
    assert_eq!(session_ids(&recent), Vec::<String>::new());

    let archived = request(
        &server,
        4,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID,
            "archivedOnly": true
        }),
    )
    .await;
    assert_eq!(session_ids(&archived), vec![SESSION_ID.to_string()]);

    let archived_read = request(
        &server,
        5,
        METHOD_AGENT_SESSION_READ,
        json!({
            "sessionId": SESSION_ID
        }),
    )
    .await;
    assert_eq!(
        archived_read.pointer("/result/detail/archived_at"),
        Some(&json!(archived_at)),
    );

    let reopened_server = app_server(Arc::new(data_source.reopened()));
    initialize_server(&reopened_server, 100, "session-archive-jsonrpc-reopen-test").await;

    let reopened_recent = request(
        &reopened_server,
        101,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID
        }),
    )
    .await;
    assert_eq!(session_ids(&reopened_recent), Vec::<String>::new());

    let reopened_archived = request(
        &reopened_server,
        102,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID,
            "archivedOnly": true
        }),
    )
    .await;
    assert_eq!(
        session_ids(&reopened_archived),
        vec![SESSION_ID.to_string()]
    );

    let reopened_read = request(
        &reopened_server,
        103,
        METHOD_AGENT_SESSION_READ,
        json!({
            "sessionId": SESSION_ID
        }),
    )
    .await;
    assert_eq!(
        reopened_read.pointer("/result/detail/archived_at"),
        Some(&json!(archived_at)),
    );

    let unarchive = request(
        &reopened_server,
        104,
        METHOD_AGENT_SESSION_UPDATE,
        json!({
            "sessionId": SESSION_ID,
            "archived": false
        }),
    )
    .await;
    assert_eq!(unarchive.pointer("/result/session/archivedAt"), None);

    let restored_server = app_server(Arc::new(data_source.reopened()));
    initialize_server(
        &restored_server,
        200,
        "session-archive-jsonrpc-restored-test",
    )
    .await;

    let restored_recent = request(
        &restored_server,
        201,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID
        }),
    )
    .await;
    assert_eq!(session_ids(&restored_recent), vec![SESSION_ID.to_string()]);

    let restored_archived = request(
        &restored_server,
        202,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID,
            "archivedOnly": true
        }),
    )
    .await;
    assert_eq!(session_ids(&restored_archived), Vec::<String>::new());
}

#[tokio::test]
async fn persisted_session_archive_many_uses_current_jsonrpc() {
    let data_source = Arc::new(PersistedSessionArchiveDataSource::with_sessions(vec![
        persisted_session_overview(
            SESSION_ID,
            Some(THREAD_ID),
            "Persisted Session",
            "2026-06-07T00:00:00.000Z",
        ),
        persisted_session_overview(
            SECOND_SESSION_ID,
            Some("persisted-thread-second"),
            "Second Persisted Session",
            "2026-06-07T00:00:02.000Z",
        ),
    ]));
    let server = app_server(Arc::clone(&data_source));
    initialize_server(&server, 1, "session-archive-many-jsonrpc-test").await;

    let archived = request(
        &server,
        2,
        METHOD_AGENT_SESSION_ARCHIVE_MANY,
        json!({
            "sessionIds": [
                format!(" {SESSION_ID} "),
                "",
                SECOND_SESSION_ID,
                SESSION_ID
            ]
        }),
    )
    .await;
    let mut archived_session_ids = session_ids(&archived);
    archived_session_ids.sort();
    assert_eq!(
        archived_session_ids,
        vec![SESSION_ID.to_string(), SECOND_SESSION_ID.to_string()]
    );
    assert!(
        session_archived_at(&archived, SESSION_ID).is_some(),
        "primary session should be archived"
    );
    assert!(
        session_archived_at(&archived, SECOND_SESSION_ID).is_some(),
        "second session should be archived"
    );

    let recent = request(
        &server,
        3,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID
        }),
    )
    .await;
    assert_eq!(session_ids(&recent), Vec::<String>::new());

    let archived_only = request(
        &server,
        4,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID,
            "archivedOnly": true
        }),
    )
    .await;
    let mut archived_only_session_ids = session_ids(&archived_only);
    archived_only_session_ids.sort();
    assert_eq!(
        archived_only_session_ids,
        vec![SESSION_ID.to_string(), SECOND_SESSION_ID.to_string()]
    );
}

#[tokio::test]
async fn persisted_session_archive_many_ignores_empty_request() {
    let data_source = Arc::new(PersistedSessionArchiveDataSource::new());
    let server = app_server(Arc::clone(&data_source));
    initialize_server(&server, 1, "session-archive-many-empty-test").await;

    let archived = request(
        &server,
        2,
        METHOD_AGENT_SESSION_ARCHIVE_MANY,
        json!({
            "sessionIds": ["", "   "]
        }),
    )
    .await;
    assert_eq!(session_ids(&archived), Vec::<String>::new());

    let recent = request(
        &server,
        3,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID
        }),
    )
    .await;
    assert_eq!(session_ids(&recent), vec![SESSION_ID.to_string()]);
}

#[test]
fn persisted_session_archive_survives_app_server_stdio_process_restarts() {
    let app_data = IsolatedStdioAppData::seed_current_timeline_session();
    let app_server_bin = app_server_bin_path();

    let mut first = StdioAppServer::spawn(&app_server_bin, &app_data);
    initialize_stdio_server(&mut first, 1, "session-archive-stdio-test");

    let archive = first.request(
        2,
        METHOD_AGENT_SESSION_UPDATE,
        json!({
            "sessionId": STDIO_SESSION_ID,
            "archived": true
        }),
    );
    let archived_at = archive
        .pointer("/result/session/archivedAt")
        .and_then(Value::as_str)
        .expect("stdio archive response should include archivedAt")
        .to_string();
    assert!(!archived_at.is_empty());

    let recent = first.request(
        3,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID
        }),
    );
    assert_eq!(session_ids(&recent), Vec::<String>::new());

    let archived = first.request(
        4,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID,
            "archivedOnly": true
        }),
    );
    assert_eq!(session_ids(&archived), vec![STDIO_SESSION_ID.to_string()]);
    assert_eq!(
        session_archived_at(&archived, STDIO_SESSION_ID),
        Some(archived_at.as_str())
    );

    let archived_read = first.request(
        5,
        METHOD_AGENT_SESSION_READ,
        json!({
            "sessionId": STDIO_SESSION_ID
        }),
    );
    assert_eq!(
        archived_read.pointer("/result/session/sessionId"),
        Some(&json!(STDIO_SESSION_ID)),
    );
    first.close();

    let mut reopened = StdioAppServer::spawn(&app_server_bin, &app_data);
    initialize_stdio_server(&mut reopened, 100, "session-archive-stdio-reopen-test");

    let reopened_archived = reopened.request(
        101,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID,
            "archivedOnly": true
        }),
    );
    assert_eq!(
        session_ids(&reopened_archived),
        vec![STDIO_SESSION_ID.to_string()]
    );
    assert_eq!(
        session_archived_at(&reopened_archived, STDIO_SESSION_ID),
        Some(archived_at.as_str())
    );

    let reopened_read = reopened.request(
        102,
        METHOD_AGENT_SESSION_READ,
        json!({
            "sessionId": STDIO_SESSION_ID
        }),
    );
    assert_eq!(
        reopened_read.pointer("/result/session/sessionId"),
        Some(&json!(STDIO_SESSION_ID)),
    );

    let unarchive = reopened.request(
        103,
        METHOD_AGENT_SESSION_UPDATE,
        json!({
            "sessionId": STDIO_SESSION_ID,
            "archived": false
        }),
    );
    assert_eq!(unarchive.pointer("/result/session/archivedAt"), None);
    reopened.close();

    let mut restored = StdioAppServer::spawn(&app_server_bin, &app_data);
    initialize_stdio_server(&mut restored, 200, "session-archive-stdio-restored-test");

    let restored_recent = restored.request(
        201,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID
        }),
    );
    assert_eq!(
        session_ids(&restored_recent),
        vec![STDIO_SESSION_ID.to_string()]
    );
    assert_eq!(
        session_archived_at(&restored_recent, STDIO_SESSION_ID),
        None
    );

    let restored_archived = restored.request(
        202,
        METHOD_AGENT_SESSION_LIST,
        json!({
            "workspaceId": WORKSPACE_ID,
            "archivedOnly": true
        }),
    );
    assert_eq!(session_ids(&restored_archived), Vec::<String>::new());

    let restored_read = restored.request(
        203,
        METHOD_AGENT_SESSION_READ,
        json!({
            "sessionId": STDIO_SESSION_ID
        }),
    );
    assert_eq!(restored_read.pointer("/result/detail/archived_at"), None);
    restored.close();
}

fn app_server(data_source: Arc<PersistedSessionArchiveDataSource>) -> AppServer {
    let runtime =
        RuntimeCore::with_backend(Arc::new(MockBackend)).with_app_data_source(data_source);
    AppServer::with_runtime(runtime)
}

struct IsolatedStdioAppData {
    _temp_dir: TempDir,
    home_dir: PathBuf,
    xdg_data_home: PathBuf,
    app_data_dir: PathBuf,
    local_app_data_dir: PathBuf,
    aster_root: PathBuf,
}

impl IsolatedStdioAppData {
    fn seed_current_timeline_session() -> Self {
        let temp_dir = TempDir::new().expect("create isolated app data temp dir");
        let root = temp_dir.path().to_path_buf();
        let home_dir = root.join("home");
        let xdg_data_home = root.join("xdg-data");
        let app_data_dir = root.join("roaming-app-data");
        let local_app_data_dir = root.join("local-app-data");
        let aster_root = root.join("aster-root");
        let workspace_root = root.join("workspace");
        for dir in [
            &home_dir,
            &xdg_data_home,
            &app_data_dir,
            &local_app_data_dir,
            &aster_root,
            &workspace_root,
        ] {
            fs::create_dir_all(dir).expect("create isolated app data directory");
        }

        let preferred_data_parent =
            preferred_data_parent_for_test(&home_dir, &xdg_data_home, &local_app_data_dir);
        let preferred_data_dir = preferred_data_parent.join("lime");
        fs::create_dir_all(&preferred_data_dir).expect("create preferred app data dir");
        let db_path = preferred_data_dir.join("lime.db");
        seed_sqlite_current_timeline_session(&db_path, &workspace_root);

        Self {
            _temp_dir: temp_dir,
            home_dir,
            xdg_data_home,
            app_data_dir,
            local_app_data_dir,
            aster_root,
        }
    }

    fn apply_env(&self, command: &mut Command) {
        command
            .env("HOME", &self.home_dir)
            .env("USERPROFILE", &self.home_dir)
            .env("XDG_DATA_HOME", &self.xdg_data_home)
            .env("APPDATA", &self.app_data_dir)
            .env("LOCALAPPDATA", &self.local_app_data_dir)
            .env("LIME_ASTER_ROOT", &self.aster_root);
    }
}

#[cfg(target_os = "windows")]
fn preferred_data_parent_for_test(
    _home_dir: &Path,
    _xdg_data_home: &Path,
    local_app_data_dir: &Path,
) -> PathBuf {
    local_app_data_dir.to_path_buf()
}

#[cfg(target_os = "macos")]
fn preferred_data_parent_for_test(
    home_dir: &Path,
    _xdg_data_home: &Path,
    _local_app_data_dir: &Path,
) -> PathBuf {
    home_dir.join("Library").join("Application Support")
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn preferred_data_parent_for_test(
    _home_dir: &Path,
    xdg_data_home: &Path,
    _local_app_data_dir: &Path,
) -> PathBuf {
    xdg_data_home.to_path_buf()
}

fn seed_sqlite_current_timeline_session(db_path: &Path, workspace_root: &Path) {
    let conn = Connection::open(db_path).expect("open isolated app-server sqlite db");
    lime_core::database::schema::create_tables(&conn).expect("create isolated app-server schema");
    let workspace_root = workspace_root.to_string_lossy().into_owned();
    conn.execute(
        "INSERT INTO workspaces (
            id, name, workspace_type, root_path, is_default, settings_json,
            created_at, updated_at, icon, color, is_favorite, is_archived,
            tags_json, default_persona_id
         )
         VALUES (?1, '当前工作区', 'persistent', ?2, 1, '{}', 1, 1,
                 NULL, NULL, 0, 0, '[]', NULL)",
        params![WORKSPACE_ID, workspace_root],
    )
    .expect("insert isolated workspace");
    conn.execute(
        "INSERT INTO agent_sessions (
            id, model, system_prompt, title, created_at, updated_at,
            working_dir, execution_strategy
         )
         VALUES (?1, 'agent:default', NULL, 'Persisted stdio session',
                 '2026-06-07T00:00:00.000Z', '2026-06-07T00:00:03.000Z',
                 ?2, 'react')",
        params![STDIO_SESSION_ID, workspace_root],
    )
    .expect("insert isolated current timeline session");

    let turn = AgentThreadTurn {
        id: "turn-stdio-current".to_string(),
        thread_id: STDIO_SESSION_ID.to_string(),
        prompt_text: "verify stdio archive persistence".to_string(),
        status: AgentThreadTurnStatus::Completed,
        started_at: "2026-06-07T00:00:01.000Z".to_string(),
        completed_at: Some("2026-06-07T00:00:03.000Z".to_string()),
        error_message: None,
        created_at: "2026-06-07T00:00:01.000Z".to_string(),
        updated_at: "2026-06-07T00:00:03.000Z".to_string(),
    };
    AgentTimelineDao::create_turn(&conn, &turn).expect("insert isolated turn");
    AgentTimelineDao::upsert_item(
        &conn,
        &AgentThreadItem {
            id: "item-stdio-user".to_string(),
            thread_id: STDIO_SESSION_ID.to_string(),
            turn_id: "turn-stdio-current".to_string(),
            sequence: 1,
            status: AgentThreadItemStatus::Completed,
            started_at: "2026-06-07T00:00:01.000Z".to_string(),
            completed_at: Some("2026-06-07T00:00:01.000Z".to_string()),
            updated_at: "2026-06-07T00:00:01.000Z".to_string(),
            payload: AgentThreadItemPayload::UserMessage {
                content: "verify stdio archive persistence".to_string(),
            },
        },
    )
    .expect("insert isolated user item");
    AgentTimelineDao::upsert_item(
        &conn,
        &AgentThreadItem {
            id: "item-stdio-agent".to_string(),
            thread_id: STDIO_SESSION_ID.to_string(),
            turn_id: "turn-stdio-current".to_string(),
            sequence: 2,
            status: AgentThreadItemStatus::Completed,
            started_at: "2026-06-07T00:00:03.000Z".to_string(),
            completed_at: Some("2026-06-07T00:00:03.000Z".to_string()),
            updated_at: "2026-06-07T00:00:03.000Z".to_string(),
            payload: AgentThreadItemPayload::AgentMessage {
                text: "stdio archive persistence verified".to_string(),
                phase: None,
            },
        },
    )
    .expect("insert isolated agent item");
}

struct StdioAppServer {
    child: Child,
    stdout: BufReader<ChildStdout>,
    closed: bool,
}

impl StdioAppServer {
    fn spawn(app_server_bin: &Path, app_data: &IsolatedStdioAppData) -> Self {
        let mut command = Command::new(app_server_bin);
        command
            .arg("--stdio")
            .arg("--backend")
            .arg("unavailable")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        app_data.apply_env(&mut command);
        let mut child = command.spawn().unwrap_or_else(|error| {
            panic!(
                "spawn app-server stdio process {}: {error}",
                app_server_bin.display()
            )
        });
        let stdout = child
            .stdout
            .take()
            .expect("app-server stdio stdout should be piped");
        Self {
            child,
            stdout: BufReader::new(stdout),
            closed: false,
        }
    }

    fn request(&mut self, id: u64, method: &str, params: Value) -> Value {
        self.write_line(&json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        }));
        self.read_response(id, method)
    }

    fn notify(&mut self, method: &str, params: Value) {
        self.write_line(&json!({
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }));
    }

    fn write_line(&mut self, message: &Value) {
        let stdin = self
            .child
            .stdin
            .as_mut()
            .expect("app-server stdio stdin should be piped");
        writeln!(stdin, "{message}").expect("write app-server stdio JSON-RPC line");
        stdin.flush().expect("flush app-server stdio JSON-RPC line");
    }

    fn read_response(&mut self, expected_id: u64, method: &str) -> Value {
        let mut line = String::new();
        self.stdout
            .read_line(&mut line)
            .unwrap_or_else(|error| panic!("read app-server stdio response for {method}: {error}"));
        if line.is_empty() {
            let status = self
                .child
                .try_wait()
                .expect("poll app-server stdio process status");
            panic!("app-server stdio closed before {method} response; status={status:?}");
        }
        let response: Value = serde_json::from_str(&line).unwrap_or_else(|error| {
            panic!("decode app-server stdio response for {method}: {error}; line={line}")
        });
        if let Some(error) = response.get("error") {
            panic!("{method} failed over app-server stdio: {error}");
        }
        assert_eq!(response.get("id"), Some(&json!(expected_id)));
        response
    }

    fn close(mut self) {
        self.close_child();
    }

    fn close_child(&mut self) {
        if self.closed {
            return;
        }
        self.closed = true;
        drop(self.child.stdin.take());
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            match self.child.try_wait() {
                Ok(Some(_status)) => return,
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(25));
                }
                Ok(None) => {
                    let _ = self.child.kill();
                    let _ = self.child.wait();
                    return;
                }
                Err(_) => return,
            }
        }
    }
}

impl Drop for StdioAppServer {
    fn drop(&mut self) {
        self.close_child();
    }
}

fn app_server_bin_path() -> PathBuf {
    if let Some(path) = option_env!("CARGO_BIN_EXE_app-server") {
        return PathBuf::from(path);
    }
    if let Ok(path) = env::var("CARGO_BIN_EXE_app-server") {
        return PathBuf::from(path);
    }
    let current_exe = env::current_exe().expect("read current test binary path");
    let target_debug_dir = current_exe
        .parent()
        .and_then(Path::parent)
        .expect("current test binary should be under target/debug/deps");
    let fallback = target_debug_dir.join(format!("app-server{}", env::consts::EXE_SUFFIX));
    assert!(
        fallback.exists(),
        "CARGO_BIN_EXE_app-server is unset and fallback binary does not exist: {}",
        fallback.display()
    );
    fallback
}

async fn initialize_server(server: &AppServer, id: u64, client_name: &str) {
    let initialize = request(
        server,
        id,
        METHOD_INITIALIZE,
        json!({
            "clientInfo": {
                "name": client_name,
                "version": "1.0.0"
            }
        }),
    )
    .await;
    assert_eq!(
        initialize.pointer("/result/serverInfo/protocolVersion"),
        Some(&json!(PROTOCOL_VERSION)),
    );
    notify(server, METHOD_INITIALIZED, json!({})).await;
}

fn initialize_stdio_server(server: &mut StdioAppServer, id: u64, client_name: &str) {
    let initialize = server.request(
        id,
        METHOD_INITIALIZE,
        json!({
            "clientInfo": {
                "name": client_name,
                "version": "1.0.0"
            }
        }),
    );
    assert_eq!(
        initialize.pointer("/result/serverInfo/protocolVersion"),
        Some(&json!(PROTOCOL_VERSION)),
    );
    server.notify(METHOD_INITIALIZED, json!({}));
}

async fn request(server: &AppServer, id: u64, method: &str, params: Value) -> Value {
    let lines = server
        .handle_json_line(
            &json!({
                "jsonrpc": "2.0",
                "id": id,
                "method": method,
                "params": params,
            })
            .to_string(),
        )
        .await
        .expect("handle JSON-RPC request");
    assert_eq!(
        lines.len(),
        1,
        "{method} should return exactly one response"
    );
    let response: Value = serde_json::from_str(&lines[0]).expect("decode JSON-RPC response");
    if let Some(error) = response.get("error") {
        panic!("{method} failed: {error}");
    }
    assert_eq!(response.get("id"), Some(&json!(id)));
    response
}

async fn notify(server: &AppServer, method: &str, params: Value) {
    let lines = server
        .handle_json_line(
            &json!({
                "jsonrpc": "2.0",
                "method": method,
                "params": params,
            })
            .to_string(),
        )
        .await
        .expect("handle JSON-RPC notification");
    assert!(
        lines.is_empty(),
        "{method} notification should not return responses"
    );
}

fn session_ids(response: &Value) -> Vec<String> {
    response
        .pointer("/result/sessions")
        .and_then(Value::as_array)
        .expect("result.sessions should be an array")
        .iter()
        .map(|session| {
            session
                .get("sessionId")
                .and_then(Value::as_str)
                .expect("sessionId should be a string")
                .to_string()
        })
        .collect()
}

fn session_archived_at<'a>(response: &'a Value, expected_session_id: &str) -> Option<&'a str> {
    response
        .pointer("/result/sessions")
        .and_then(Value::as_array)
        .expect("result.sessions should be an array")
        .iter()
        .find(|session| {
            session
                .get("sessionId")
                .and_then(Value::as_str)
                .is_some_and(|session_id| session_id == expected_session_id)
        })
        .and_then(|session| session.get("archivedAt"))
        .and_then(Value::as_str)
}
