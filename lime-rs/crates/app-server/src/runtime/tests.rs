use super::*;
use app_server_protocol::AgentInput;
use app_server_protocol::CapabilityDescriptor;
use app_server_protocol::EvidencePackArtifact;
use app_server_protocol::RuntimeOptions;
use app_server_protocol::METHOD_AGENT_SESSION_TURN_START;
use std::sync::atomic::AtomicUsize;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tokio::time::timeout;

struct FinalDoneBackend;

#[async_trait]
impl ExecutionBackend for FinalDoneBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        sink.emit(RuntimeEvent::new(
            "message.delta",
            json!({ "text": "你好！有什么可以帮你的吗？" }),
        ))?;
        sink.emit(RuntimeEvent::new("turn.final_done", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

struct ToolReadModelBackend;

#[async_trait]
impl ExecutionBackend for ToolReadModelBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        sink.emit(RuntimeEvent::new(
            "tool.started",
            json!({
                "toolName": "WebFetch",
            }),
        ))?;
        sink.emit(RuntimeEvent::new(
            "tool.result",
            json!({
                "toolName": "WebFetch",
                "output": "fetched https://example.com",
            }),
        ))?;
        sink.emit(RuntimeEvent::new(
            "tool.started",
            json!({
                "toolCallId": "search-call-1",
                "toolName": "WebSearch",
            }),
        ))?;
        sink.emit(RuntimeEvent::new(
            "tool.result",
            json!({
                "toolCallId": "search-call-1",
                "toolName": "WebSearch",
                "outputPreview": "search results",
            }),
        ))?;
        sink.emit(RuntimeEvent::new("turn.final_done", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

struct PartialFailureBackend;

#[async_trait]
impl ExecutionBackend for PartialFailureBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        Err(RuntimeCoreError::Backend(
            "provider stream timed out after 60s".to_string(),
        ))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

struct FailBeforeEmitBackend {
    start_count: AtomicUsize,
}

#[async_trait]
impl ExecutionBackend for FailBeforeEmitBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        if self.start_count.fetch_add(1, Ordering::SeqCst) == 0 {
            return sink.emit(RuntimeEvent::new("turn.accepted", json!({})));
        }
        Err(RuntimeCoreError::Backend(
            "backend unavailable before turn start".to_string(),
        ))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

struct HangingCancelBackend {
    cancel_count: AtomicUsize,
}

#[async_trait]
impl ExecutionBackend for HangingCancelBackend {
    async fn start_turn(
        &self,
        _request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        sink.emit(RuntimeEvent::new("turn.started", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.cancel_count.fetch_add(1, Ordering::SeqCst);
        std::future::pending::<()>().await;
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

struct FinalDoneRecordingBackend {
    requests: Mutex<Vec<ExecutionRequest>>,
}

#[async_trait]
impl ExecutionBackend for FinalDoneRecordingBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.requests
            .lock()
            .expect("test backend requests mutex poisoned")
            .push(request);
        sink.emit(RuntimeEvent::new("turn.started", json!({})))?;
        sink.emit(RuntimeEvent::new("turn.completed", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

struct TestCapabilitySource;

impl CapabilitySource for TestCapabilitySource {
    fn list_capabilities(&self, context: &CapabilityListContext) -> Vec<CapabilityDescriptor> {
        let app_id = context.app_id.as_deref().unwrap_or("unknown-app");
        let workspace_id = context
            .workspace_id
            .as_deref()
            .unwrap_or("unknown-workspace");
        vec![CapabilityDescriptor {
            id: format!("test.capability.{app_id}.{workspace_id}"),
            title: format!("Test Capability for {app_id}"),
            description: None,
            methods: vec!["test/method".to_string()],
        }]
    }
}

#[derive(Default)]
struct RecordingBackend {
    requests: Mutex<Vec<ExecutionRequest>>,
}

#[async_trait]
impl ExecutionBackend for RecordingBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.requests
            .lock()
            .expect("test backend requests mutex poisoned")
            .push(request);
        sink.emit(RuntimeEvent::new("turn.accepted", json!({})))
    }

    async fn cancel_turn(
        &self,
        _request: CancelExecutionRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn respond_action(
        &self,
        _request: ActionRespondRequest,
        _sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }
}

struct TestCurrentTimelineDataSource {
    persisted: Option<AgentSessionReadResponse>,
    objective: Mutex<Option<ManagedObjective>>,
    audit_updates: Mutex<Vec<ManagedObjectiveAuditUpdate>>,
    read_requests: Mutex<Vec<AgentSessionReadParams>>,
    knowledge_compile_requests: Mutex<Vec<lime_knowledge::KnowledgeCompilePackRequest>>,
}

impl TestCurrentTimelineDataSource {
    fn new(persisted: AgentSessionReadResponse) -> Self {
        Self {
            persisted: Some(persisted),
            objective: Mutex::new(None),
            audit_updates: Mutex::new(Vec::new()),
            read_requests: Mutex::new(Vec::new()),
            knowledge_compile_requests: Mutex::new(Vec::new()),
        }
    }

    fn with_objective(self, objective: ManagedObjective) -> Self {
        *self
            .objective
            .lock()
            .expect("test objective mutex poisoned") = Some(objective);
        self
    }

    fn read_requests(&self) -> Vec<AgentSessionReadParams> {
        self.read_requests
            .lock()
            .expect("test current timeline read requests mutex poisoned")
            .clone()
    }

    fn objective(&self) -> Option<ManagedObjective> {
        self.objective
            .lock()
            .expect("test objective mutex poisoned")
            .clone()
    }

    fn audit_updates(&self) -> Vec<ManagedObjectiveAuditUpdate> {
        self.audit_updates
            .lock()
            .expect("test audit updates mutex poisoned")
            .clone()
    }

    fn knowledge_compile_requests(&self) -> Vec<lime_knowledge::KnowledgeCompilePackRequest> {
        self.knowledge_compile_requests
            .lock()
            .expect("test knowledge compile requests mutex poisoned")
            .clone()
    }
}

fn empty_agent_session_read_response(session_id: &str) -> AgentSessionReadResponse {
    AgentSessionReadResponse {
        session: AgentSession {
            session_id: session_id.to_string(),
            thread_id: session_id.to_string(),
            app_id: "agent-runtime".to_string(),
            workspace_id: None,
            business_object_ref: None,
            status: AgentSessionStatus::Idle,
            created_at: timestamp(),
            updated_at: timestamp(),
        },
        turns: Vec::new(),
        detail: None,
    }
}

fn managed_objective(session_id: &str) -> ManagedObjective {
    ManagedObjective {
        objective_id: "objective-1".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        owner_kind: crate::objective::MANAGED_OBJECTIVE_OWNER_AGENT_SESSION.to_string(),
        owner_id: session_id.to_string(),
        objective_text: "完成生产命令 current 迁移".to_string(),
        success_criteria: vec!["契约通过".to_string()],
        status: ManagedObjectiveStatus::Active,
        budget_policy: None,
        risk_policy: None,
        approval_policy: None,
        continuation_policy: None,
        last_audit_summary: None,
        last_evidence_pack_ref: None,
        last_artifact_refs: Vec::new(),
        blocker_reason: None,
        created_at: timestamp(),
        updated_at: timestamp(),
    }
}

struct TestKnowledgeBuilderRuntimeExecutor {
    calls: Mutex<Vec<lime_knowledge::KnowledgeBuilderRuntimePlan>>,
}

impl TestKnowledgeBuilderRuntimeExecutor {
    fn new() -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
        }
    }

    fn calls(&self) -> Vec<lime_knowledge::KnowledgeBuilderRuntimePlan> {
        self.calls
            .lock()
            .expect("test knowledge builder calls mutex poisoned")
            .clone()
    }
}

#[async_trait]
impl KnowledgeBuilderRuntimeExecutor for TestKnowledgeBuilderRuntimeExecutor {
    async fn execute(
        &self,
        plan: lime_knowledge::KnowledgeBuilderRuntimePlan,
    ) -> Result<lime_knowledge::KnowledgeBuilderRuntimeExecution, RuntimeCoreError> {
        self.calls
            .lock()
            .expect("test knowledge builder calls mutex poisoned")
            .push(plan.clone());
        Ok(lime_knowledge::KnowledgeBuilderRuntimeExecution {
                skill_name: plan.skill_name,
                execution_id: plan.execution_id,
                session_id: Some(plan.session_id),
                status: "succeeded".to_string(),
                provider: plan.provider_override,
                model: plan.model_override,
                output: Some(
                    json!({
                        "primaryDocument": {
                            "path": "documents/runtime-founder.md",
                            "content": "# Runtime 创始人\n\n## 智能体应用指南\n\n- 只引用长期主义与不夸大收入。"
                        },
                        "status": "needs-review",
                        "missingFacts": ["代表案例待补充"],
                        "warnings": ["收入数据未确认"],
                        "provenance": {
                            "kind": "agent-skill",
                            "name": "personal-ip-knowledge-builder",
                            "version": "1.0.0"
                        }
                    })
                    .to_string(),
                ),
                error: None,
            })
    }
}

#[async_trait]
impl AppDataSource for TestCurrentTimelineDataSource {
    async fn list_current_timeline_sessions(
        &self,
        params: AgentSessionListParams,
    ) -> Result<AgentSessionListResponse, RuntimeCoreError> {
        NoopAppDataSource
            .list_current_timeline_sessions(params)
            .await
    }

    async fn read_current_timeline_session(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<Option<AgentSessionReadResponse>, RuntimeCoreError> {
        self.read_requests
            .lock()
            .expect("test current timeline read requests mutex poisoned")
            .push(params.clone());
        Ok(self
            .persisted
            .as_ref()
            .filter(|response| response.session.session_id == params.session_id)
            .cloned())
    }

    async fn update_current_timeline_session(
        &self,
        params: AgentSessionUpdateParams,
    ) -> Result<AgentSessionUpdateResponse, RuntimeCoreError> {
        NoopAppDataSource
            .update_current_timeline_session(params)
            .await
    }

    async fn read_agent_session_objective(
        &self,
        _params: AgentSessionObjectiveReadParams,
    ) -> Result<AgentSessionObjectiveReadResponse, RuntimeCoreError> {
        Ok(AgentSessionObjectiveReadResponse {
            objective: self.objective(),
        })
    }

    async fn read_managed_objective_by_owner(
        &self,
        owner_kind: String,
        owner_id: String,
    ) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
        Ok(self.objective().filter(|objective| {
            objective.owner_kind == owner_kind && objective.owner_id == owner_id
        }))
    }

    async fn audit_agent_session_objective(
        &self,
        _owner_kind: String,
        _owner_id: String,
        update: ManagedObjectiveAuditUpdate,
    ) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
        self.audit_updates
            .lock()
            .expect("test audit updates mutex poisoned")
            .push(update.clone());
        let mut objective = self
            .objective
            .lock()
            .expect("test objective mutex poisoned");
        if let Some(objective) = objective.as_mut() {
            objective.status = update.status;
            objective.last_audit_summary = update.last_audit_summary;
            objective.last_evidence_pack_ref = update.last_evidence_pack_ref;
            objective.last_artifact_refs = update.last_artifact_refs;
            objective.blocker_reason = update.blocker_reason;
        }
        Ok(objective.clone())
    }

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

    async fn install_marketplace_skill(
        &self,
        params: SkillMarketplaceInstallParams,
    ) -> Result<SkillMarketplaceInstallResponse, RuntimeCoreError> {
        NoopAppDataSource.install_marketplace_skill(params).await
    }

    async fn install_skill_from_download_url(
        &self,
        params: SkillDownloadInstallParams,
    ) -> Result<SkillDownloadInstallResponse, RuntimeCoreError> {
        NoopAppDataSource
            .install_skill_from_download_url(params)
            .await
    }

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
    ) -> Result<serde_json::Value, RuntimeCoreError> {
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
        self.knowledge_compile_requests
            .lock()
            .expect("test knowledge compile requests mutex poisoned")
            .push(request.clone());
        let response =
            lime_knowledge::compile_knowledge_pack(request).map_err(RuntimeCoreError::Backend)?;
        Ok(KnowledgeCompilePackResponse {
            pack: serde_json::to_value(response.pack)
                .map_err(|error| RuntimeCoreError::Backend(error.to_string()))?,
            selected_source_count: response.selected_source_count,
            compiled_view: serde_json::to_value(response.compiled_view)
                .map_err(|error| RuntimeCoreError::Backend(error.to_string()))?,
            run: serde_json::to_value(response.run)
                .map_err(|error| RuntimeCoreError::Backend(error.to_string()))?,
            warnings: response.warnings,
        })
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

    async fn list_automation_jobs(&self) -> Result<AutomationJobListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_automation_jobs().await
    }

    async fn read_project_memory(
        &self,
        params: ProjectMemoryReadParams,
    ) -> Result<ProjectMemoryReadResponse, RuntimeCoreError> {
        NoopAppDataSource.read_project_memory(params).await
    }

    async fn get_gallery_material(
        &self,
        params: GalleryMaterialLookupParams,
    ) -> Result<GalleryMaterialResponse, RuntimeCoreError> {
        NoopAppDataSource.get_gallery_material(params).await
    }

    async fn create_gallery_material_metadata(
        &self,
        params: GalleryMaterialMetadataCreateParams,
    ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
        NoopAppDataSource
            .create_gallery_material_metadata(params)
            .await
    }

    async fn get_gallery_material_metadata(
        &self,
        params: GalleryMaterialLookupParams,
    ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
        NoopAppDataSource
            .get_gallery_material_metadata(params)
            .await
    }

    async fn update_gallery_material_metadata(
        &self,
        params: GalleryMaterialMetadataUpdateParams,
    ) -> Result<GalleryMaterialMetadataResponse, RuntimeCoreError> {
        NoopAppDataSource
            .update_gallery_material_metadata(params)
            .await
    }

    async fn delete_gallery_material_metadata(
        &self,
        params: GalleryMaterialLookupParams,
    ) -> Result<GalleryMaterialDeleteResponse, RuntimeCoreError> {
        NoopAppDataSource
            .delete_gallery_material_metadata(params)
            .await
    }

    async fn list_gallery_materials_by_image_category(
        &self,
        params: GalleryMaterialFilterParams,
    ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
        NoopAppDataSource
            .list_gallery_materials_by_image_category(params)
            .await
    }

    async fn list_gallery_materials_by_layout_category(
        &self,
        params: GalleryMaterialFilterParams,
    ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
        NoopAppDataSource
            .list_gallery_materials_by_layout_category(params)
            .await
    }

    async fn list_gallery_materials_by_mood(
        &self,
        params: GalleryMaterialFilterParams,
    ) -> Result<GalleryMaterialListResponse, RuntimeCoreError> {
        NoopAppDataSource
            .list_gallery_materials_by_mood(params)
            .await
    }

    async fn list_project_materials(
        &self,
        params: ProjectMaterialListParams,
    ) -> Result<ProjectMaterialListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_project_materials(params).await
    }

    async fn get_project_material(
        &self,
        params: ProjectMaterialLookupParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        NoopAppDataSource.get_project_material(params).await
    }

    async fn count_project_materials(
        &self,
        params: ProjectMaterialListParams,
    ) -> Result<ProjectMaterialCountResponse, RuntimeCoreError> {
        NoopAppDataSource.count_project_materials(params).await
    }

    async fn upload_project_material(
        &self,
        params: ProjectMaterialUploadParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        NoopAppDataSource.upload_project_material(params).await
    }

    async fn import_project_material_from_url(
        &self,
        params: ProjectMaterialImportFromUrlParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        NoopAppDataSource
            .import_project_material_from_url(params)
            .await
    }

    async fn update_project_material(
        &self,
        params: ProjectMaterialUpdateParams,
    ) -> Result<ProjectMaterialResponse, RuntimeCoreError> {
        NoopAppDataSource.update_project_material(params).await
    }

    async fn delete_project_material(
        &self,
        params: ProjectMaterialLookupParams,
    ) -> Result<ProjectMaterialDeleteResponse, RuntimeCoreError> {
        NoopAppDataSource.delete_project_material(params).await
    }

    async fn read_project_material_content(
        &self,
        params: ProjectMaterialLookupParams,
    ) -> Result<ProjectMaterialContentResponse, RuntimeCoreError> {
        NoopAppDataSource
            .read_project_material_content(params)
            .await
    }

    async fn list_voice_asr_credentials(
        &self,
    ) -> Result<VoiceAsrCredentialListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_voice_asr_credentials().await
    }

    async fn create_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialCreateParams,
    ) -> Result<VoiceAsrCredentialWriteResponse, RuntimeCoreError> {
        NoopAppDataSource.create_voice_asr_credential(params).await
    }

    async fn update_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialUpdateParams,
    ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
        NoopAppDataSource.update_voice_asr_credential(params).await
    }

    async fn delete_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialIdParams,
    ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
        NoopAppDataSource.delete_voice_asr_credential(params).await
    }

    async fn set_default_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialIdParams,
    ) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
        NoopAppDataSource
            .set_default_voice_asr_credential(params)
            .await
    }

    async fn test_voice_asr_credential(
        &self,
        params: VoiceAsrCredentialIdParams,
    ) -> Result<VoiceAsrCredentialTestResponse, RuntimeCoreError> {
        NoopAppDataSource.test_voice_asr_credential(params).await
    }

    async fn test_transcribe_voice_model_file(
        &self,
        params: VoiceModelTestTranscribeFileParams,
    ) -> Result<VoiceModelTestTranscribeFileResponse, RuntimeCoreError> {
        NoopAppDataSource
            .test_transcribe_voice_model_file(params)
            .await
    }

    async fn list_voice_instructions(
        &self,
    ) -> Result<VoiceInstructionListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_voice_instructions().await
    }

    async fn save_voice_instruction(
        &self,
        params: VoiceInstructionSaveParams,
    ) -> Result<VoiceInstructionMutationResponse, RuntimeCoreError> {
        NoopAppDataSource.save_voice_instruction(params).await
    }

    async fn delete_voice_instruction(
        &self,
        params: VoiceInstructionIdParams,
    ) -> Result<VoiceInstructionMutationResponse, RuntimeCoreError> {
        NoopAppDataSource.delete_voice_instruction(params).await
    }

    async fn list_logs(&self) -> Result<LogListResponse, RuntimeCoreError> {
        NoopAppDataSource.list_logs().await
    }

    async fn read_persisted_log_tail(
        &self,
        params: LogPersistedTailParams,
    ) -> Result<LogPersistedTailResponse, RuntimeCoreError> {
        NoopAppDataSource.read_persisted_log_tail(params).await
    }

    async fn clear_logs(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        NoopAppDataSource.clear_logs().await
    }

    async fn clear_diagnostic_log_history(&self) -> Result<LogClearResponse, RuntimeCoreError> {
        NoopAppDataSource.clear_diagnostic_log_history().await
    }

    async fn read_log_storage_diagnostics(
        &self,
    ) -> Result<LogStorageDiagnosticsResponse, RuntimeCoreError> {
        NoopAppDataSource.read_log_storage_diagnostics().await
    }

    async fn export_support_bundle(&self) -> Result<SupportBundleExportResponse, RuntimeCoreError> {
        NoopAppDataSource.export_support_bundle().await
    }

    async fn read_windows_startup_diagnostics(
        &self,
    ) -> Result<WindowsStartupDiagnosticsResponse, RuntimeCoreError> {
        NoopAppDataSource.read_windows_startup_diagnostics().await
    }

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

#[tokio::test]
async fn knowledge_compile_pack_runs_builder_runtime_executor_on_current_path() {
    let temp = tempfile::tempdir().expect("create temp dir");
    let working_dir = temp.path().to_string_lossy().to_string();
    lime_knowledge::import_knowledge_source(lime_knowledge::KnowledgeImportSourceRequest {
        working_dir: working_dir.clone(),
        pack_name: "runtime-founder".to_string(),
        description: Some("Runtime 创始人".to_string()),
        pack_type: Some("personal-ip".to_string()),
        language: Some("zh-CN".to_string()),
        source_file_name: Some("interview.md".to_string()),
        source_text: Some("她强调长期主义，也提醒不要夸大收入。".to_string()),
    })
    .expect("import source");

    let app_data_source = Arc::new(TestCurrentTimelineDataSource::new(
        empty_agent_session_read_response("knowledge-builder-session"),
    ));
    let executor = Arc::new(TestKnowledgeBuilderRuntimeExecutor::new());
    let core = RuntimeCore::with_backend(Arc::new(MockBackend))
        .with_app_data_source(app_data_source.clone())
        .with_knowledge_builder_runtime_executor(executor.clone());

    let response = core
        .compile_knowledge_pack(KnowledgeCompilePackParams {
            working_dir: working_dir.clone(),
            name: "runtime-founder".to_string(),
            builder_runtime: Some(json!({
                "enabled": true,
                "providerOverride": "openai",
                "modelOverride": "gpt-4o",
                "sessionId": "builder-session-1"
            })),
        })
        .await
        .expect("compile knowledge pack");

    let calls = executor.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].skill_name, "personal-ip-knowledge-builder");
    assert_eq!(calls[0].session_id, "builder-session-1");
    assert_eq!(calls[0].provider_override.as_deref(), Some("openai"));
    assert_eq!(calls[0].model_override.as_deref(), Some("gpt-4o"));

    let requests = app_data_source.knowledge_compile_requests();
    assert_eq!(requests.len(), 1);
    assert!(requests[0].builder_execution.is_some());
    assert!(response
        .warnings
        .iter()
        .any(|warning| warning.contains("代表案例待补充")));
    let produced_by = response
        .pack
        .pointer("/metadata/metadata/producedBy")
        .expect("producedBy metadata");
    assert_eq!(
        produced_by
            .pointer("/runtimeBinding/executed")
            .and_then(serde_json::Value::as_bool),
        Some(true)
    );
    assert_eq!(
        produced_by
            .pointer("/runtimeBinding/executionId")
            .and_then(serde_json::Value::as_str),
        requests[0]
            .builder_execution
            .as_ref()
            .map(|execution| execution.execution_id.as_str())
    );
}

#[derive(Default)]
struct TestEvidenceExportProvider {
    call_count: AtomicUsize,
    requests: Mutex<Vec<EvidencePackRequest>>,
    completion_audit_summary: Option<serde_json::Value>,
}

#[async_trait]
impl EvidenceExportProvider for TestEvidenceExportProvider {
    async fn export_evidence_pack(
        &self,
        request: &EvidencePackRequest,
    ) -> Result<Option<EvidencePackSummary>, RuntimeCoreError> {
        self.call_count.fetch_add(1, Ordering::SeqCst);
        self.requests
            .lock()
            .expect("test evidence requests mutex poisoned")
            .push(request.clone());
        Ok(Some(EvidencePackSummary {
            pack_relative_root: ".lime/harness/sessions/sess_evidence/evidence".to_string(),
            pack_absolute_root: Some(
                "/workspace/.lime/harness/sessions/sess_evidence/evidence".to_string(),
            ),
            exported_at: "2026-06-05T00:00:03.000Z".to_string(),
            thread_status: "running".to_string(),
            latest_turn_status: Some("accepted".to_string()),
            turn_count: request.turns.len(),
            item_count: request.events.len(),
            pending_request_count: 0,
            queued_turn_count: 0,
            recent_artifact_count: request.artifacts.len(),
            known_gaps: vec!["gui_smoke_not_run".to_string()],
            observability_summary: Some(json!({
                "schema_version": "runtime-evidence-pack.v1"
            })),
            completion_audit_summary: Some(self.completion_audit_summary.clone().unwrap_or_else(
                || {
                    json!({
                        "decision": "in_progress"
                    })
                },
            )),
            artifacts: vec![EvidencePackArtifact {
                kind: "summary".to_string(),
                title: "Evidence Summary".to_string(),
                relative_path: ".lime/harness/sessions/sess_evidence/evidence/summary.md"
                    .to_string(),
                absolute_path: None,
                bytes: 128,
            }],
        }))
    }
}

#[tokio::test]
async fn list_agent_sessions_projects_runtime_core_sessions_only() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_old".to_string()),
        thread_id: Some("thread_old".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-old".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "project".to_string(),
            id: "old".to_string(),
            title: Some("Old Workspace Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "model": "gpt-test",
                "workingDir": "/tmp/old",
                "executionStrategy": "runtime-core"
            })),
        }),
        locale: None,
    })
    .expect("old workspace session");
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_current".to_string()),
        thread_id: Some("thread_current".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "project".to_string(),
            id: "current".to_string(),
            title: Some("Current Workspace Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "modelName": "claude-test",
                "working_dir": "/tmp/current",
                "execution_strategy": "runtime-core"
            })),
        }),
        locale: None,
    })
    .expect("current workspace session");

    let response = core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-current".to_string()),
            limit: Some(1),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    assert_eq!(response.sessions.len(), 1);
    assert_eq!(response.sessions[0].session_id, "sess_current");
    assert_eq!(
        response.sessions[0].thread_id.as_deref(),
        Some("thread_current")
    );
    assert_eq!(
        response.sessions[0].title.as_deref(),
        Some("Current Workspace Session")
    );
    assert_eq!(response.sessions[0].model, "claude-test");
    assert_eq!(
        response.sessions[0].working_dir.as_deref(),
        Some("/tmp/current")
    );
    assert_eq!(
        response.sessions[0].execution_strategy.as_deref(),
        Some("runtime-core")
    );
}

#[tokio::test]
async fn queue_session_controls_use_current_runtime_core_read_model() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_queue".to_string()),
        thread_id: Some("thread_queue".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_queue".to_string(),
            turn_id: Some("turn_running".to_string()),
            input: AgentInput {
                text: "running".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: Some("fixture-provider".to_string()),
                model_preference: Some("fixture-model".to_string()),
                host_options: Some(json!({
                    "asterChatRequest": {
                        "provider_config": {
                            "provider_id": "fixture-provider",
                            "provider_name": "openai",
                            "model_name": "fixture-model",
                            "api_key": "fixture-key",
                            "base_url": "http://127.0.0.1:65535"
                        }
                    }
                })),
                ..RuntimeOptions::default()
            }),
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("running turn");
    let queued = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_queue".to_string(),
                turn_id: Some("turn_queued".to_string()),
                input: AgentInput {
                    text: "queued".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: true,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("queued turn");
    assert_eq!(queued.response.turn.status, AgentTurnStatus::Queued);
    assert!(queued
        .events
        .iter()
        .any(|event| event.event_type == "queue.added"));

    let promoted = core
        .promote_agent_session_queued_turn(AgentSessionQueuedTurnPromoteParams {
            session_id: "sess_queue".to_string(),
            queued_turn_id: "turn_queued".to_string(),
        })
        .await
        .expect("promote");
    assert!(promoted.response.promoted);
    assert_eq!(
        promoted.response.turns[1].turn_id, "turn_queued",
        "only one queued turn keeps its position after active turn"
    );

    let blocked_resume = core
        .resume_agent_session_thread(
            AgentSessionThreadResumeParams {
                session_id: "sess_queue".to_string(),
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("blocked resume");
    assert!(!blocked_resume.response.resumed);

    core.append_external_runtime_events(
        "sess_queue",
        Some("turn_running"),
        vec![RuntimeEvent::new("turn.completed", json!({}))],
    )
    .expect("complete running");
    let resumed = core
        .resume_agent_session_thread(
            AgentSessionThreadResumeParams {
                session_id: "sess_queue".to_string(),
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("resume queued");
    assert!(resumed.response.resumed);
    assert!(resumed
        .response
        .turns
        .iter()
        .any(|turn| turn.turn_id == "turn_queued" && turn.status == AgentTurnStatus::Accepted));

    let second_queued = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_queue".to_string(),
                turn_id: Some("turn_remove".to_string()),
                input: AgentInput {
                    text: "remove".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: true,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("second queued");
    assert_eq!(second_queued.response.turn.status, AgentTurnStatus::Queued);
    let removed = core
        .remove_agent_session_queued_turn(AgentSessionQueuedTurnRemoveParams {
            session_id: "sess_queue".to_string(),
            queued_turn_id: "turn_remove".to_string(),
        })
        .await
        .expect("remove queued");
    assert!(removed.response.removed);
    assert!(!removed
        .response
        .turns
        .iter()
        .any(|turn| turn.turn_id == "turn_remove"));
}

#[tokio::test]
async fn resume_queued_turn_restores_queue_when_backend_fails_before_emit() {
    let core = RuntimeCore::with_backend(Arc::new(FailBeforeEmitBackend {
        start_count: AtomicUsize::new(0),
    }));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_queue_rollback".to_string()),
        thread_id: Some("thread_queue_rollback".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_queue_rollback".to_string(),
            turn_id: Some("turn_running".to_string()),
            input: AgentInput {
                text: "running".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: Some("fixture-provider".to_string()),
                model_preference: Some("fixture-model".to_string()),
                host_options: Some(json!({
                    "asterChatRequest": {
                        "provider_config": {
                            "provider_id": "fixture-provider",
                            "provider_name": "openai",
                            "model_name": "fixture-model",
                            "api_key": "fixture-key",
                            "base_url": "http://127.0.0.1:65535"
                        }
                    }
                })),
                ..RuntimeOptions::default()
            }),
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("running turn");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_queue_rollback".to_string(),
            turn_id: Some("turn_queued".to_string()),
            input: AgentInput {
                text: "queued".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: Some("fixture-provider".to_string()),
                model_preference: Some("fixture-model".to_string()),
                ..RuntimeOptions::default()
            }),
            queue_if_busy: true,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("queued turn");
    core.append_external_runtime_events(
        "sess_queue_rollback",
        Some("turn_running"),
        vec![RuntimeEvent::new("turn.completed", json!({}))],
    )
    .expect("complete running");

    let error = core
        .resume_agent_session_thread(
            AgentSessionThreadResumeParams {
                session_id: "sess_queue_rollback".to_string(),
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("resume should fail before backend emits");
    assert!(matches!(error, RuntimeCoreError::Backend(_)));

    let read = core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_queue_rollback".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read session");
    assert!(read
        .turns
        .iter()
        .any(|turn| turn.turn_id == "turn_queued" && turn.status == AgentTurnStatus::Queued));
}

#[tokio::test]
async fn list_agent_sessions_excludes_hidden_runtime_core_sessions() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_hidden".to_string()),
        thread_id: Some("thread_hidden".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "hidden".to_string(),
            title: Some("Internal Smoke Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "harness": {
                    "hiddenFromUserRecents": true,
                    "source": "unit"
                },
                "model": "gpt-test"
            })),
        }),
        locale: None,
    })
    .expect("hidden session");
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_visible".to_string()),
        thread_id: Some("thread_visible".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "visible".to_string(),
            title: Some("Visible Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "model": "gpt-test"
            })),
        }),
        locale: None,
    })
    .expect("visible session");

    let response = core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-current".to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    let ids = response
        .sessions
        .iter()
        .map(|session| session.session_id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(ids, vec!["sess_visible"]);

    let hidden = core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_hidden".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("hidden session remains readable by id");
    assert_eq!(hidden.session.session_id, "sess_hidden");
}

#[tokio::test]
async fn read_session_current_does_not_fallback_to_persistent_history() {
    let core = RuntimeCore::default();
    let error = core
        .read_session_current(AgentSessionReadParams {
            session_id: "missing_legacy_session".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect_err("missing session should fail closed");

    assert_eq!(
        error.into_jsonrpc_error().code,
        error_codes::SESSION_NOT_FOUND
    );
}

#[tokio::test]
async fn objective_continue_fails_closed_when_pending_requests_exist() {
    let mut persisted = empty_agent_session_read_response("sess_objective_continue");
    persisted.session.workspace_id = Some("workspace-main".to_string());
    persisted.detail = Some(json!({
        "thread_read": {
            "pending_requests": [
                {
                    "id": "request-1",
                    "type": "ask_user"
                }
            ],
            "queued_turns": []
        }
    }));
    let app_data_source = Arc::new(
        TestCurrentTimelineDataSource::new(persisted)
            .with_objective(managed_objective("sess_objective_continue")),
    );
    let backend = Arc::new(RecordingBackend::default());
    let core =
        RuntimeCore::with_backend(backend.clone()).with_app_data_source(app_data_source.clone());

    let error = core
        .continue_agent_session_objective(
            AgentSessionObjectiveContinueParams {
                session_id: "sess_objective_continue".to_string(),
                owner_kind: None,
                owner_id: None,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("pending request should block objective continuation");

    assert!(error
        .to_string()
        .contains("当前会话还有 1 个待处理请求，不能继续推进目标"));
    assert!(backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned")
        .is_empty());
}

#[tokio::test]
async fn objective_continue_uses_host_provider_config_without_runtime_explicit_preferences() {
    let session_id = "sess_objective_continue_provider_config";
    let mut persisted = empty_agent_session_read_response(session_id);
    persisted.session.workspace_id = Some("workspace-main".to_string());
    let app_data_source = Arc::new(
        TestCurrentTimelineDataSource::new(persisted).with_objective(managed_objective(session_id)),
    );
    let backend = Arc::new(FinalDoneRecordingBackend {
        requests: Mutex::new(Vec::new()),
    });
    let core =
        RuntimeCore::with_backend(backend.clone()).with_app_data_source(app_data_source.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some(session_id.to_string()),
        thread_id: Some("thread_objective_continue_provider_config".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session_id.to_string(),
            turn_id: Some("turn_initial".to_string()),
            input: AgentInput {
                text: "首轮".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: Some("fixture-provider".to_string()),
                model_preference: Some("fixture-model".to_string()),
                host_options: Some(json!({
                    "asterChatRequest": {
                        "turnConfig": {
                            "providerConfig": {
                                "provider_id": "fixture-provider",
                                "provider_name": "openai",
                                "model_name": "fixture-model",
                                "api_key": "fixture-key",
                                "base_url": "http://127.0.0.1:65535"
                            },
                            "providerPreference": "fixture-provider",
                            "modelPreference": "fixture-model",
                            "approvalPolicy": "never",
                            "sandboxPolicy": "read-only"
                        }
                    }
                })),
                ..RuntimeOptions::default()
            }),
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("initial turn");

    core.continue_agent_session_objective(
        AgentSessionObjectiveContinueParams {
            session_id: session_id.to_string(),
            owner_kind: None,
            owner_id: None,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("continue objective");

    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    assert_eq!(requests.len(), 2);
    let continuation_request = &requests[1];
    assert_eq!(continuation_request.provider_preference, None);
    assert_eq!(continuation_request.model_preference, None);
    let runtime_options = continuation_request
        .runtime_options
        .as_ref()
        .expect("runtime options");
    assert_eq!(runtime_options.provider_preference, None);
    assert_eq!(runtime_options.model_preference, None);
    let host_options = runtime_options.host_options.as_ref().expect("host options");
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/provider_config/base_url")
            .and_then(serde_json::Value::as_str),
        Some("http://127.0.0.1:65535")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/provider_config/base_url")
            .and_then(serde_json::Value::as_str),
        Some("http://127.0.0.1:65535")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/provider_preference")
            .and_then(serde_json::Value::as_str),
        Some("fixture-provider")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/approval_policy")
            .and_then(serde_json::Value::as_str),
        Some("never")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/sandbox_policy")
            .and_then(serde_json::Value::as_str),
        Some("read-only")
    );
}

#[tokio::test]
async fn managed_objective_auto_continuation_submits_current_turn_after_terminal_turn() {
    let mut persisted = empty_agent_session_read_response("sess_objective_auto_allow");
    persisted.session.workspace_id = Some("workspace-main".to_string());
    let mut objective = managed_objective("sess_objective_auto_allow");
    objective.risk_policy = Some(json!({ "allowAutoContinuation": true }));
    objective.continuation_policy = Some(json!({
        "autoIdle": true,
        "maxAutoTurns": 1,
        "maxElapsedMs": 180000
    }));
    objective.budget_policy = Some(json!({ "maxTurns": 1 }));
    let app_data_source =
        Arc::new(TestCurrentTimelineDataSource::new(persisted).with_objective(objective));
    let backend = Arc::new(RecordingBackend::default());
    let core =
        RuntimeCore::with_backend(backend.clone()).with_app_data_source(app_data_source.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_objective_auto_allow".to_string()),
        thread_id: Some("thread_objective_auto_allow".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_objective_auto_allow".to_string(),
            turn_id: Some("turn_initial".to_string()),
            input: AgentInput {
                text: "首轮".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: Some("fixture-provider".to_string()),
                model_preference: Some("fixture-model".to_string()),
                host_options: Some(json!({
                    "asterChatRequest": {
                        "turnConfig": {
                            "providerConfig": {
                                "provider_id": "fixture-provider",
                                "provider_name": "openai",
                                "model_name": "fixture-model",
                                "api_key": "fixture-key",
                                "base_url": "http://127.0.0.1:65535"
                            },
                            "providerPreference": "fixture-provider",
                            "modelPreference": "fixture-model",
                            "approvalPolicy": "never",
                            "sandboxPolicy": "read-only"
                        }
                    }
                })),
                ..RuntimeOptions::default()
            }),
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("initial turn");
    core.append_external_runtime_events(
        "sess_objective_auto_allow",
        Some("turn_initial"),
        vec![RuntimeEvent::new("turn.completed", json!({}))],
    )
    .expect("complete initial turn");
    core.maybe_submit_managed_objective_auto_continuation(
        "sess_objective_auto_allow",
        RuntimeHostContext::default(),
    )
    .await;

    let audit_updates = app_data_source.audit_updates();
    assert_eq!(audit_updates.len(), 1);
    let summary = audit_updates[0]
        .last_audit_summary
        .as_deref()
        .unwrap_or_default();
    assert!(summary.contains("auto_continuation_guard decision=allow"));
    assert!(summary.contains("queued_turn_id="));

    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    assert_eq!(requests.len(), 2);
    let auto_request = &requests[1];
    assert_eq!(auto_request.session.session_id, "sess_objective_auto_allow");
    assert_eq!(auto_request.queue_if_busy, false);
    assert_eq!(auto_request.provider_preference, None);
    assert_eq!(auto_request.model_preference, None);
    let runtime_options = auto_request
        .runtime_options
        .as_ref()
        .expect("runtime options");
    assert_eq!(runtime_options.provider_preference, None);
    assert_eq!(runtime_options.model_preference, None);
    let host_options = runtime_options.host_options.as_ref().expect("host options");
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/provider_config/base_url")
            .and_then(serde_json::Value::as_str),
        Some("http://127.0.0.1:65535")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/provider_config/base_url")
            .and_then(serde_json::Value::as_str),
        Some("http://127.0.0.1:65535")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/provider_preference")
            .and_then(serde_json::Value::as_str),
        Some("fixture-provider")
    );
    assert_eq!(
        host_options
            .pointer("/asterChatRequest/turn_config/approval_policy")
            .and_then(serde_json::Value::as_str),
        Some("never")
    );
    let managed_objective = auto_request
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.pointer("/harness/managed_objective"))
        .expect("managed objective metadata");
    assert_eq!(
        managed_objective
            .get("continuation_source")
            .and_then(serde_json::Value::as_str),
        Some("auto_idle")
    );
    assert!(managed_objective.get("auto_continuation_guard").is_some());
}

#[tokio::test]
async fn managed_objective_auto_continuation_stops_at_budget_after_auto_turn() {
    let mut persisted = empty_agent_session_read_response("sess_objective_auto_budget");
    persisted.session.workspace_id = Some("workspace-main".to_string());
    let mut objective = managed_objective("sess_objective_auto_budget");
    objective.risk_policy = Some(json!({ "allowAutoContinuation": true }));
    objective.continuation_policy = Some(json!({
        "autoIdle": true,
        "maxAutoTurns": 1,
        "maxElapsedMs": 180000
    }));
    objective.budget_policy = Some(json!({ "maxTurns": 1 }));
    let app_data_source =
        Arc::new(TestCurrentTimelineDataSource::new(persisted).with_objective(objective));
    let backend = Arc::new(FinalDoneRecordingBackend {
        requests: Mutex::new(Vec::new()),
    });
    let core =
        RuntimeCore::with_backend(backend.clone()).with_app_data_source(app_data_source.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_objective_auto_budget".to_string()),
        thread_id: Some("thread_objective_auto_budget".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_objective_auto_budget".to_string(),
            turn_id: Some("turn_initial".to_string()),
            input: AgentInput {
                text: "首轮".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("initial turn with auto continuation");

    let objective = app_data_source.objective().expect("objective");
    assert_eq!(objective.status, ManagedObjectiveStatus::BudgetLimited);
    let summary = objective.last_audit_summary.as_deref().unwrap_or_default();
    assert!(summary.contains("auto_continuation_guard decision=budget_limited"));
    assert!(summary.contains("decision=allow"));
    assert!(summary.contains("auto_turns=1/1"));

    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    assert_eq!(requests.len(), 2);
    assert!(requests[1]
        .metadata
        .as_ref()
        .and_then(|metadata| metadata.pointer("/harness/managed_objective/auto_continuation_guard"))
        .is_some());
}

#[tokio::test]
async fn action_replay_rebuilds_current_pending_action_from_runtime_events() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_action_replay".to_string()),
        thread_id: Some("thread_action_replay".to_string()),
        app_id: "agent-runtime".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.append_external_runtime_events(
        "sess_action_replay",
        None,
        vec![RuntimeEvent::new(
            "action.required",
            json!({
                "requestId": "req-replay",
                "actionType": "elicitation",
                "data": {
                    "message": "请补充发布渠道",
                    "requestedSchema": {
                        "type": "object",
                        "properties": {
                            "channel": { "type": "string" }
                        }
                    }
                },
                "scope": {
                    "sessionId": "sess_action_replay",
                    "threadId": "thread_action_replay",
                    "turnId": "turn_action_replay"
                }
            }),
        )],
    )
    .expect("append action event");

    let response = core
        .replay_action(AgentSessionActionReplayParams {
            session_id: "sess_action_replay".to_string(),
            request_id: "req-replay".to_string(),
        })
        .await
        .expect("replay action");
    let action = response
        .response
        .action
        .expect("pending action should be replayed");

    assert_eq!(action.event_type, "action_required");
    assert_eq!(action.request_id, "req-replay");
    assert_eq!(action.action_type, AgentSessionActionType::Elicitation);
    assert_eq!(action.prompt.as_deref(), Some("请补充发布渠道"));
    assert!(action.requested_schema.is_some());
    assert_eq!(
        action.scope.and_then(|scope| scope.turn_id),
        Some("turn_action_replay".to_string())
    );

    core.append_external_runtime_events(
        "sess_action_replay",
        None,
        vec![RuntimeEvent::new(
            "action.resolved",
            json!({
                "requestId": "req-replay",
                "actionType": "elicitation",
                "confirmed": true
            }),
        )],
    )
    .expect("append resolved event");

    let resolved = core
        .replay_action(AgentSessionActionReplayParams {
            session_id: "sess_action_replay".to_string(),
            request_id: "req-replay".to_string(),
        })
        .await
        .expect("replay resolved action");
    assert!(resolved.response.action.is_none());
}

#[tokio::test]
async fn managed_objective_auto_continuation_submits_and_budget_limits_on_current_path() {
    let session_id = "sess_auto_objective";
    let mut objective = managed_objective(session_id);
    objective.continuation_policy = Some(json!({
        "autoIdle": true,
        "maxAutoTurns": 1,
        "maxElapsedMs": 180000,
        "maxEstimatedTotalCost": 1.0
    }));
    objective.budget_policy = Some(json!({
        "maxTurns": 1
    }));
    objective.risk_policy = Some(json!({
        "allowAutoContinuation": true
    }));
    let mut persisted = empty_agent_session_read_response(session_id);
    persisted.session.workspace_id = Some("workspace-main".to_string());
    let app_data_source =
        Arc::new(TestCurrentTimelineDataSource::new(persisted).with_objective(objective));
    let backend = Arc::new(FinalDoneBackend);
    let core = RuntimeCore::with_backend(backend).with_app_data_source(app_data_source.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some(session_id.to_string()),
        thread_id: Some("thread_auto_objective".to_string()),
        app_id: "agent-runtime".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session_id.to_string(),
            turn_id: Some("turn_initial".to_string()),
            input: AgentInput {
                text: "initial".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                provider_preference: Some("fixture-provider".to_string()),
                model_preference: Some("fixture-model".to_string()),
                metadata: Some(json!({
                    "harness": {
                        "managed_objective_smoke": {
                            "source": "unit"
                        }
                    }
                })),
                ..RuntimeOptions::default()
            }),
            queue_if_busy: false,
            skip_pre_submit_resume: true,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("initial turn");

    let read_after_initial = core
        .read_session_current(AgentSessionReadParams {
            session_id: session_id.to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read after initial");
    assert_eq!(read_after_initial.turns.len(), 2);
    assert!(read_after_initial
        .turns
        .iter()
        .all(|turn| { matches!(turn.status, AgentTurnStatus::Completed) }));

    let final_objective = app_data_source.objective().expect("final objective");
    assert_eq!(
        final_objective.status,
        ManagedObjectiveStatus::BudgetLimited
    );
    assert!(final_objective
        .last_audit_summary
        .as_deref()
        .unwrap_or_default()
        .contains("auto_continuation_guard decision=budget_limited"));
    assert!(final_objective
        .last_audit_summary
        .as_deref()
        .unwrap_or_default()
        .contains("decision=allow"));
    assert!(final_objective
        .last_audit_summary
        .as_deref()
        .unwrap_or_default()
        .contains("auto_turns=1/1"));
    assert!(final_objective
        .blocker_reason
        .as_deref()
        .unwrap_or_default()
        .contains("最大轮数"));

    let final_read = core
        .read_session_current(AgentSessionReadParams {
            session_id: session_id.to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("final read");
    assert_eq!(final_read.turns.len(), 2);
    assert!(final_read.turns.iter().any(|turn| {
        turn.turn_id != "turn_initial" && matches!(turn.status, AgentTurnStatus::Completed)
    }));

    let evidence = core
        .export_evidence(EvidenceExportParams {
            session_id: session_id.to_string(),
            turn_id: None,
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export evidence");
    let evidence_pack = evidence.evidence_pack.expect("objective evidence pack");
    assert_eq!(
        evidence_pack
            .completion_audit_summary
            .as_ref()
            .and_then(|summary| summary.get("decision"))
            .and_then(serde_json::Value::as_str),
        Some("budget_limited")
    );
    assert_eq!(evidence_pack.turn_count, 2);
}

#[tokio::test]
async fn objective_audit_writes_current_evidence_pack_decision() {
    let provider = Arc::new(TestEvidenceExportProvider {
        completion_audit_summary: Some(json!({
            "decision": "completed",
            "artifactCount": 1,
            "checkedCriteria": [
                {
                    "criterion": "契约通过",
                    "satisfied": true
                }
            ]
        })),
        ..TestEvidenceExportProvider::default()
    });
    let mut persisted = empty_agent_session_read_response("sess_objective_audit");
    persisted.session.workspace_id = Some("workspace-main".to_string());
    let app_data_source = Arc::new(
        TestCurrentTimelineDataSource::new(persisted)
            .with_objective(managed_objective("sess_objective_audit")),
    );
    let core = RuntimeCore::with_backend_capability_source_artifact_content_provider_and_evidence_export_provider(
            Arc::new(MockBackend),
            Arc::new(CapabilityInventorySource::default()),
            Arc::new(InlineArtifactContentProvider),
            provider.clone(),
        )
        .with_app_data_source(app_data_source.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_objective_audit".to_string()),
        thread_id: Some("thread_objective_audit".to_string()),
        app_id: "agent-runtime".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.append_external_runtime_events(
        "sess_objective_audit",
        None,
        vec![RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifactId": "artifact-report",
                "path": ".lime/artifacts/report.md"
            }),
        )],
    )
    .expect("append evidence event");

    let response = core
        .audit_agent_session_objective(AgentSessionObjectiveAuditParams {
            session_id: "sess_objective_audit".to_string(),
            owner_kind: None,
            owner_id: None,
        })
        .await
        .expect("audit objective");

    assert_eq!(provider.call_count.load(Ordering::SeqCst), 1);
    assert_eq!(response.objective.status, ManagedObjectiveStatus::Completed);
    assert!(response
        .objective
        .last_audit_summary
        .as_deref()
        .unwrap_or_default()
        .contains("decision=completed"));
    assert_eq!(
        response.objective.last_evidence_pack_ref.as_deref(),
        Some("/workspace/.lime/harness/sessions/sess_evidence/evidence")
    );
    assert_eq!(app_data_source.audit_updates().len(), 1);
}

#[tokio::test]
async fn read_session_projects_runtime_turns_into_gui_messages() {
    let core = RuntimeCore::with_backend(Arc::new(FinalDoneBackend));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_messages".to_string()),
        thread_id: Some("thread_messages".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_messages".to_string(),
            title: Some("Messages Read".to_string()),
            uri: None,
            metadata: None,
        }),
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_messages".to_string(),
            turn_id: Some("turn_messages".to_string()),
            input: AgentInput {
                text: "你好，帮我整理今天的计划".to_string(),
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

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_messages".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let messages = detail["messages"].as_array().expect("messages");

    assert_eq!(detail["messages_count"], 2);
    assert_eq!(detail["history_cursor"]["loaded_count"], 2);
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0]["id"], "turn_messages:user");
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(
        messages[0]["content"][0]["text"],
        "你好，帮我整理今天的计划"
    );
    assert_eq!(messages[1]["id"], "turn_messages:assistant");
    assert_eq!(messages[1]["role"], "assistant");
    assert_eq!(
        messages[1]["content"][0]["text"],
        "你好！有什么可以帮你的吗？"
    );
}

#[tokio::test]
async fn read_session_projects_failed_runtime_event_into_diagnostics_and_error_item() {
    let core = RuntimeCore::with_backend(Arc::new(PartialFailureBackend));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_failed_read".to_string()),
        thread_id: Some("thread_failed_read".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_failed_read".to_string(),
            title: Some("Failed Read".to_string()),
            uri: None,
            metadata: None,
        }),
        locale: None,
    })
    .expect("session");

    let error = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_failed_read".to_string(),
                turn_id: Some("turn_failed_read".to_string()),
                input: AgentInput {
                    text: "整理今天的国际新闻".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("backend failure should propagate");
    let expected_error_message = error.to_string();
    assert!(expected_error_message.contains("provider stream timed out"));

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_failed_read".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read failed session");
    let detail = read.detail.expect("session detail");

    assert_eq!(
        detail["thread_read"]["diagnostics"]["latest_turn_status"],
        "failed"
    );
    assert_eq!(
        detail["thread_read"]["diagnostics"]["latest_turn_error_message"].as_str(),
        Some(expected_error_message.as_str())
    );
    assert_eq!(
        detail["thread_read"]["runtime_summary"]["latestTurnErrorMessage"].as_str(),
        Some(expected_error_message.as_str())
    );

    let messages = detail["messages"].as_array().expect("messages");
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(messages[0]["content"][0]["text"], "整理今天的国际新闻");

    let items = detail["items"].as_array().expect("items");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["type"], "error");
    assert_eq!(items[0]["status"], "failed");
    assert_eq!(
        items[0]["message"].as_str(),
        Some(expected_error_message.as_str())
    );
}

#[tokio::test]
async fn start_turn_hydrates_current_timeline_session_before_backend_submit() {
    let persisted_session = AgentSession {
        session_id: "sess_persisted".to_string(),
        thread_id: "thread_persisted".to_string(),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_persisted".to_string(),
            title: Some("Persisted Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "model": "gpt-test",
                "workingDir": "/workspace/current"
            })),
        }),
        status: AgentSessionStatus::Completed,
        created_at: "2026-06-06T00:00:00.000Z".to_string(),
        updated_at: "2026-06-06T00:00:10.000Z".to_string(),
    };
    let persisted_turn = AgentTurn {
        turn_id: "turn_existing".to_string(),
        session_id: persisted_session.session_id.clone(),
        thread_id: persisted_session.thread_id.clone(),
        status: AgentTurnStatus::Completed,
        started_at: Some("2026-06-06T00:00:01.000Z".to_string()),
        completed_at: Some("2026-06-06T00:00:09.000Z".to_string()),
    };
    let app_data_source = Arc::new(TestCurrentTimelineDataSource::new(
        AgentSessionReadResponse {
            session: persisted_session.clone(),
            turns: vec![persisted_turn],
            detail: None,
        },
    ));
    let backend = Arc::new(RecordingBackend::default());
    let core = RuntimeCore::with_backend_and_capability_source(
        backend.clone(),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "session.resume".to_string(),
                title: "Resume Session".to_string(),
                description: None,
                methods: vec![METHOD_AGENT_SESSION_TURN_START.to_string()],
            })
            .for_apps(["content-studio"])
            .for_workspaces(["workspace-main"])
            .for_sessions(["sess_persisted"]),
        ])),
    )
    .with_app_data_source(app_data_source.clone());

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_persisted".to_string(),
                turn_id: Some("turn_resumed".to_string()),
                input: AgentInput {
                    text: "继续".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    capability_id: Some("session.resume".to_string()),
                    stream: false,
                    event_name: None,
                    provider_preference: None,
                    model_preference: None,
                    metadata: None,
                    queued_turn_id: None,
                    host_options: None,
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("resumed turn");

    assert_eq!(output.response.turn.turn_id, "turn_resumed");
    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].session.session_id, "sess_persisted");
    assert_eq!(requests[0].session.thread_id, "thread_persisted");
    assert_eq!(requests[0].turn.turn_id, "turn_resumed");
    drop(requests);

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_persisted".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("hydrated session remains readable");
    let turn_ids = read
        .turns
        .iter()
        .map(|turn| turn.turn_id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(turn_ids, vec!["turn_existing", "turn_resumed"]);

    let read_requests = app_data_source.read_requests();
    assert_eq!(read_requests.len(), 1);
    assert_eq!(read_requests[0].session_id, "sess_persisted");
}

#[tokio::test]
async fn read_session_projects_runtime_events_into_thread_read_tool_calls() {
    let core = RuntimeCore::with_backend(Arc::new(ToolReadModelBackend));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_tool_read".to_string()),
        thread_id: Some("thread_tool_read".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_tool_read".to_string(),
            title: Some("Tool Read".to_string()),
            uri: None,
            metadata: Some(json!({
                "executionStrategy": "react"
            })),
        }),
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_tool_read".to_string(),
            turn_id: Some("turn_tool_read".to_string()),
            input: AgentInput {
                text: "整理今天的国际新闻".to_string(),
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

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_tool_read".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    assert_eq!(detail["execution_strategy"], "react");
    assert_eq!(detail["thread_read"]["status"], "completed");
    assert_eq!(detail["thread_read"]["execution_strategy"], "react");
    let tool_calls = detail["thread_read"]["tool_calls"]
        .as_array()
        .expect("tool calls");
    assert_eq!(tool_calls.len(), 2);
    let web_fetch = tool_calls
        .iter()
        .find(|call| call["tool_name"] == "WebFetch")
        .expect("WebFetch call");
    assert_eq!(web_fetch["status"], "completed");
    assert_eq!(web_fetch["success"], true);
    assert_eq!(web_fetch["output_preview"], "fetched https://example.com");

    let web_search = tool_calls
        .iter()
        .find(|call| call["tool_name"] == "WebSearch")
        .expect("WebSearch call");
    assert_eq!(web_search["id"], "search-call-1");
    assert_eq!(web_search["status"], "completed");
    assert_eq!(web_search["success"], true);
    assert_eq!(web_search["output_preview"], "search results");
}

#[tokio::test]
async fn read_session_projects_runtime_events_into_thread_read_artifacts() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_thread_read_artifacts".to_string()),
        thread_id: Some("thread_read_artifacts".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_thread_read_artifacts".to_string(),
                turn_id: Some("turn_thread_read_artifacts".to_string()),
                input: AgentInput {
                    text: "生成内容工厂产物".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn")
        .response
        .turn;
    core.append_external_runtime_events(
        "sess_thread_read_artifacts",
        Some(&turn.turn_id),
        vec![RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifact": {
                    "artifactId": "artifact-content-batch",
                    "path": ".lime/artifacts/content-batch.json",
                    "title": "Content Batch",
                    "kind": "content_factory.workspace_patch",
                    "status": "ready",
                    "metadata": {
                        "contentFactoryWorkspacePatch": {
                            "kind": "content_batch",
                            "contentBatch": {
                                "count": 1
                            }
                        }
                    }
                }
            }),
        )],
    )
    .expect("append artifact event");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_thread_read_artifacts".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let artifacts = detail["thread_read"]["artifacts"]
        .as_array()
        .expect("thread read artifacts");

    assert_eq!(artifacts.len(), 1);
    assert_eq!(detail["artifacts"], detail["thread_read"]["artifacts"]);
    assert_eq!(artifacts[0]["artifactRef"], "artifact-content-batch");
    assert_eq!(artifacts[0]["path"], ".lime/artifacts/content-batch.json");
    assert_eq!(artifacts[0]["kind"], "content_factory.workspace_patch");
    assert_eq!(artifacts[0]["status"], "ready");
    assert_eq!(
        artifacts[0]["metadata"]["contentFactoryWorkspacePatch"]["kind"],
        "content_batch"
    );
    assert!(artifacts[0]["content"].is_null());
    assert_eq!(artifacts[0]["contentStatus"], "notRequested");
}

#[tokio::test]
async fn start_turn_missing_current_timeline_session_still_fails_closed() {
    let app_data_source = Arc::new(TestCurrentTimelineDataSource {
        persisted: None,
        objective: Mutex::new(None),
        audit_updates: Mutex::new(Vec::new()),
        read_requests: Mutex::new(Vec::new()),
        knowledge_compile_requests: Mutex::new(Vec::new()),
    });
    let backend = Arc::new(RecordingBackend::default());
    let core =
        RuntimeCore::with_backend(backend.clone()).with_app_data_source(app_data_source.clone());

    let error = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_missing".to_string(),
                turn_id: Some("turn_missing".to_string()),
                input: AgentInput {
                    text: "继续".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("missing session should fail closed");

    assert_eq!(
        error.into_jsonrpc_error().code,
        error_codes::SESSION_NOT_FOUND
    );
    assert!(backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned")
        .is_empty());
    let read_requests = app_data_source.read_requests();
    assert_eq!(read_requests.len(), 1);
    assert_eq!(read_requests[0].session_id, "sess_missing");
}

#[test]
fn runtime_core_uses_injected_capability_source() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(TestCapabilitySource),
    );

    let response = core
        .list_capabilities(CapabilityListParams {
            app_id: Some("content-studio".to_string()),
            workspace_id: Some("workspace-main".to_string()),
            session_id: None,
            cursor: None,
            limit: None,
        })
        .expect("capability list");

    assert_eq!(response.capabilities.len(), 1);
    assert_eq!(
        response.capabilities[0].id,
        "test.capability.content-studio.workspace-main"
    );
    assert_eq!(
        response.capabilities[0].title,
        "Test Capability for content-studio"
    );
    assert_eq!(response.capabilities[0].methods, vec!["test/method"]);
    assert_eq!(response.next_cursor, None);
}

#[test]
fn runtime_core_paginates_capability_list_after_scope_filtering() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "cap.1".to_string(),
                title: "Capability 1".to_string(),
                description: None,
                methods: vec!["method/one".to_string()],
            }),
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "cap.2".to_string(),
                title: "Capability 2".to_string(),
                description: None,
                methods: vec!["method/two".to_string()],
            })
            .for_apps(["content-studio"]),
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "cap.3".to_string(),
                title: "Capability 3".to_string(),
                description: None,
                methods: vec!["method/three".to_string()],
            }),
        ])),
    );

    let first_page = core
        .list_capabilities(CapabilityListParams {
            app_id: Some("content-studio".to_string()),
            workspace_id: None,
            session_id: None,
            cursor: None,
            limit: Some(2),
        })
        .expect("first page");
    let first_ids: Vec<&str> = first_page
        .capabilities
        .iter()
        .map(|capability| capability.id.as_str())
        .collect();
    assert_eq!(first_ids, vec!["cap.1", "cap.2"]);
    assert_eq!(first_page.next_cursor.as_deref(), Some("2"));

    let second_page = core
        .list_capabilities(CapabilityListParams {
            app_id: Some("content-studio".to_string()),
            workspace_id: None,
            session_id: None,
            cursor: first_page.next_cursor,
            limit: Some(2),
        })
        .expect("second page");
    let second_ids: Vec<&str> = second_page
        .capabilities
        .iter()
        .map(|capability| capability.id.as_str())
        .collect();
    assert_eq!(second_ids, vec!["cap.3"]);
    assert_eq!(second_page.next_cursor, None);
}

#[test]
fn capability_list_with_session_id_uses_stored_session_scope() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "session.draft.write".to_string(),
                title: "Session Draft Write".to_string(),
                description: None,
                methods: vec![METHOD_AGENT_SESSION_TURN_START.to_string()],
            })
            .for_apps(["content-studio"])
            .for_workspaces(["workspace-main"])
            .for_sessions(["sess_allowed"]),
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "workspace.readiness".to_string(),
                title: "Workspace Readiness".to_string(),
                description: None,
                methods: vec!["capability/list".to_string()],
            })
            .for_workspaces(["workspace-main"]),
        ])),
    );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_allowed".to_string()),
        thread_id: None,
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let listed = core
        .list_capabilities(CapabilityListParams {
            app_id: Some("other-app".to_string()),
            workspace_id: Some("other-workspace".to_string()),
            session_id: Some("sess_allowed".to_string()),
            cursor: None,
            limit: None,
        })
        .expect("capability list");
    let ids: Vec<&str> = listed
        .capabilities
        .iter()
        .map(|capability| capability.id.as_str())
        .collect();

    assert_eq!(ids, vec!["session.draft.write", "workspace.readiness"]);
}

#[tokio::test]
async fn read_artifacts_indexes_latest_artifact_events_for_session() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_artifacts".to_string()),
        thread_id: Some("thread_artifacts".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_artifacts".to_string(),
                turn_id: Some("turn_artifacts".to_string()),
                input: AgentInput {
                    text: "生成产物".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn")
        .response
        .turn;
    core.append_external_runtime_events(
        "sess_artifacts",
        Some(&turn.turn_id),
        vec![
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-report",
                    "filePath": ".lime/artifacts/report-v1.md",
                    "title": "Report",
                    "kind": "markdown_report",
                    "status": "ready",
                    "metadata": {
                        "version": 1
                    }
                }),
            ),
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-report",
                    "filePath": ".lime/artifacts/report-v2.md",
                    "title": "Report",
                    "kind": "markdown_report",
                    "status": "ready",
                    "metadata": {
                        "version": 2
                    }
                }),
            ),
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifact": {
                        "id": "artifact-outline",
                        "path": ".lime/artifacts/outline.md",
                        "content": "# Outline"
                    }
                }),
            ),
        ],
    )
    .expect("append artifact events");

    let response = core
        .read_artifacts(ArtifactReadParams {
            session_id: "sess_artifacts".to_string(),
            turn_id: Some("turn_artifacts".to_string()),
            artifact_ref: None,
            include_content: None,
            cursor: None,
            limit: Some(1),
        })
        .expect("read artifacts");

    assert_eq!(response.artifacts.len(), 1);
    assert_eq!(response.next_cursor.as_deref(), Some("1"));
    assert_eq!(response.artifacts[0].artifact_ref, "artifact-outline");
    assert_eq!(
        response.artifacts[0].path.as_deref(),
        Some(".lime/artifacts/outline.md")
    );
    assert_eq!(response.artifacts[0].content, None);
    assert_eq!(
        response.artifacts[0].content_status,
        ArtifactContentStatus::NotRequested
    );

    let filtered = core
        .read_artifacts(ArtifactReadParams {
            session_id: "sess_artifacts".to_string(),
            turn_id: None,
            artifact_ref: Some("artifact-report".to_string()),
            include_content: Some(true),
            cursor: None,
            limit: None,
        })
        .expect("filtered artifacts");
    assert_eq!(filtered.artifacts.len(), 1);
    assert_eq!(
        filtered.artifacts[0].path.as_deref(),
        Some(".lime/artifacts/report-v2.md")
    );
    assert_eq!(
        filtered.artifacts[0]
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.get("version")),
        Some(&json!(2))
    );
    assert_eq!(
        filtered.artifacts[0].content_status,
        ArtifactContentStatus::Unavailable
    );
}

#[test]
fn read_artifacts_uses_injected_content_provider_for_current_page() {
    #[derive(Debug)]
    struct TestArtifactContentProvider;

    impl ArtifactContentProvider for TestArtifactContentProvider {
        fn read_content(&self, request: &ArtifactContentRequest) -> Option<String> {
            Some(format!(
                "{}:{}",
                request.session.app_id, request.artifact.artifact_ref
            ))
        }
    }

    let core = RuntimeCore::with_backend_capability_source_and_artifact_content_provider(
        Arc::new(MockBackend),
        Arc::new(CapabilityInventorySource::default()),
        Arc::new(TestArtifactContentProvider),
    );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_content".to_string()),
        thread_id: None,
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.append_external_runtime_events(
        "sess_content",
        None,
        vec![RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifactId": "artifact-provider",
                "path": ".app-server/artifacts/provider.md",
                "content": "inline content"
            }),
        )],
    )
    .expect("append artifact event");

    let without_content = core
        .read_artifacts(ArtifactReadParams {
            session_id: "sess_content".to_string(),
            turn_id: None,
            artifact_ref: Some("artifact-provider".to_string()),
            include_content: None,
            cursor: None,
            limit: None,
        })
        .expect("read summary");
    assert_eq!(without_content.artifacts[0].content, None);
    assert_eq!(
        without_content.artifacts[0].content_status,
        ArtifactContentStatus::NotRequested
    );

    let with_content = core
        .read_artifacts(ArtifactReadParams {
            session_id: "sess_content".to_string(),
            turn_id: None,
            artifact_ref: Some("artifact-provider".to_string()),
            include_content: Some(true),
            cursor: None,
            limit: None,
        })
        .expect("read content");
    assert_eq!(
        with_content.artifacts[0].content.as_deref(),
        Some("content-studio:artifact-provider")
    );
    assert_eq!(
        with_content.artifacts[0].content_status,
        ArtifactContentStatus::Available
    );
}

#[test]
fn filesystem_artifact_content_provider_reads_allowed_relative_path() {
    let temp = tempfile::tempdir().expect("temp dir");
    let artifact_dir = temp.path().join(".app-server").join("artifacts");
    fs::create_dir_all(&artifact_dir).expect("artifact dir");
    fs::write(artifact_dir.join("provider.md"), "# Provider").expect("artifact file");

    let core = RuntimeCore::with_backend_capability_source_and_artifact_content_provider(
        Arc::new(MockBackend),
        Arc::new(CapabilityInventorySource::default()),
        Arc::new(FilesystemArtifactContentProvider::new(temp.path())),
    );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_file_content".to_string()),
        thread_id: None,
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.append_external_runtime_events(
        "sess_file_content",
        None,
        vec![RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifactId": "artifact-file",
                "path": ".app-server/artifacts/provider.md"
            }),
        )],
    )
    .expect("append artifact event");

    let response = core
        .read_artifacts(ArtifactReadParams {
            session_id: "sess_file_content".to_string(),
            turn_id: None,
            artifact_ref: Some("artifact-file".to_string()),
            include_content: Some(true),
            cursor: None,
            limit: None,
        })
        .expect("read file content");

    assert_eq!(response.artifacts.len(), 1);
    assert_eq!(response.artifacts[0].content.as_deref(), Some("# Provider"));
    assert_eq!(
        response.artifacts[0].content_status,
        ArtifactContentStatus::Available
    );
}

#[test]
fn filesystem_artifact_content_provider_rejects_escape_and_oversized_files() {
    let temp = tempfile::tempdir().expect("temp dir");
    let artifact_dir = temp.path().join("artifacts");
    fs::create_dir_all(&artifact_dir).expect("artifact dir");
    fs::write(artifact_dir.join("small.md"), "ok").expect("small file");
    fs::write(artifact_dir.join("large.md"), "too-large").expect("large file");
    let outside = tempfile::tempdir().expect("outside dir");
    fs::write(outside.path().join("outside.md"), "outside").expect("outside file");

    let provider = FilesystemArtifactContentProvider::new(temp.path()).with_max_bytes(2);
    let session = AgentSession {
        session_id: "sess_fs".to_string(),
        thread_id: "thread_fs".to_string(),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        status: AgentSessionStatus::Idle,
        created_at: timestamp(),
        updated_at: timestamp(),
    };

    let small = provider.read_content(&ArtifactContentRequest {
        session: session.clone(),
        artifact: ArtifactSummary {
            artifact_ref: "small".to_string(),
            event_id: "evt-small".to_string(),
            sequence: 1,
            turn_id: None,
            artifact_id: Some("small".to_string()),
            path: Some("artifacts/small.md".to_string()),
            title: None,
            kind: None,
            status: None,
            content: None,
            content_status: ArtifactContentStatus::NotRequested,
            metadata: None,
        },
    });
    assert_eq!(small.as_deref(), Some("ok"));

    let oversized = provider.read_content(&ArtifactContentRequest {
        session: session.clone(),
        artifact: ArtifactSummary {
            artifact_ref: "large".to_string(),
            event_id: "evt-large".to_string(),
            sequence: 2,
            turn_id: None,
            artifact_id: Some("large".to_string()),
            path: Some("artifacts/large.md".to_string()),
            title: None,
            kind: None,
            status: None,
            content: Some("inline fallback".to_string()),
            content_status: ArtifactContentStatus::NotRequested,
            metadata: None,
        },
    });
    assert_eq!(oversized.as_deref(), Some("inline fallback"));

    let escaped = provider.read_content(&ArtifactContentRequest {
        session,
        artifact: ArtifactSummary {
            artifact_ref: "escape".to_string(),
            event_id: "evt-escape".to_string(),
            sequence: 3,
            turn_id: None,
            artifact_id: Some("escape".to_string()),
            path: Some(format!(
                "../{}/outside.md",
                outside
                    .path()
                    .file_name()
                    .expect("outside file name")
                    .to_string_lossy()
            )),
            title: None,
            kind: None,
            status: None,
            content: Some("inline fallback".to_string()),
            content_status: ArtifactContentStatus::NotRequested,
            metadata: None,
        },
    });
    assert_eq!(escaped.as_deref(), Some("inline fallback"));
}

#[tokio::test]
async fn export_evidence_reads_session_turn_events_and_artifact_summaries() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_evidence".to_string()),
        thread_id: Some("thread_evidence".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_evidence".to_string(),
            turn_id: Some("turn_evidence".to_string()),
            input: AgentInput {
                text: "生成 evidence".to_string(),
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
    core.append_external_runtime_events(
        "sess_evidence",
        Some("turn_evidence"),
        vec![
            RuntimeEvent::new(
                "message.delta",
                json!({
                    "text": "draft",
                    "evidenceRefs": ["evidence://sess_evidence/runtime"]
                }),
            ),
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-report",
                    "path": ".app-server/artifacts/report.md",
                    "content": "# Report"
                }),
            ),
        ],
    )
    .expect("append evidence events");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_evidence".to_string(),
            turn_id: Some("turn_evidence".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: None,
        })
        .await
        .expect("export evidence");

    assert_eq!(response.session.session_id, "sess_evidence");
    assert_eq!(response.turns.len(), 1);
    assert_eq!(response.turns[0].turn_id, "turn_evidence");
    assert_eq!(response.events.len(), 3);
    assert_eq!(response.events[1].event_type, "message.delta");
    assert_eq!(response.artifacts.len(), 1);
    assert_eq!(response.artifacts[0].artifact_ref, "artifact-report");
    assert_eq!(response.artifacts[0].content, None);
    assert_eq!(
        response.artifacts[0].content_status,
        ArtifactContentStatus::NotRequested
    );
    assert!(!response.exported_at.is_empty());
    let evidence_pack = response.evidence_pack.expect("basic evidence pack");
    assert_eq!(evidence_pack.thread_status, "running");
    assert_eq!(
        evidence_pack.latest_turn_status.as_deref(),
        Some("accepted")
    );
    assert_eq!(evidence_pack.turn_count, 1);
    assert_eq!(evidence_pack.item_count, 3);
    assert_eq!(evidence_pack.recent_artifact_count, 1);
    assert_eq!(
        evidence_pack
            .completion_audit_summary
            .as_ref()
            .and_then(|summary| summary.get("decision"))
            .and_then(serde_json::Value::as_str),
        Some("in_progress")
    );

    let summary_only = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_evidence".to_string(),
            turn_id: Some("turn_evidence".to_string()),
            include_events: Some(false),
            include_artifacts: Some(false),
            include_evidence_pack: Some(false),
        })
        .await
        .expect("export summary-only evidence");
    assert_eq!(summary_only.events.len(), 0);
    assert_eq!(summary_only.artifacts.len(), 0);
    assert_eq!(summary_only.turns.len(), 1);
    assert_eq!(summary_only.evidence_pack, None);
}

#[tokio::test]
async fn export_handoff_bundle_writes_current_session_bundle_to_workspace() {
    let temp = tempfile::tempdir().expect("workspace");
    let workspace_root = temp.path().to_string_lossy().to_string();
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_handoff".to_string()),
        thread_id: Some("thread_handoff".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_handoff".to_string(),
            title: Some("Current Handoff".to_string()),
            uri: None,
            metadata: Some(json!({
                "workspaceRoot": workspace_root,
                "model": "gpt-test",
                "executionStrategy": "runtime-core"
            })),
        }),
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_handoff".to_string(),
            turn_id: Some("turn_handoff".to_string()),
            input: AgentInput {
                text: "生成 handoff".to_string(),
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
    core.append_external_runtime_events(
        "sess_handoff",
        Some("turn_handoff"),
        vec![
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-handoff",
                    "path": ".app-server/artifacts/handoff.md",
                    "title": "Handoff Draft",
                    "kind": "markdown"
                }),
            ),
            RuntimeEvent::new("turn.final_done", json!({})),
        ],
    )
    .expect("append events");

    let response = core
        .export_handoff_bundle(AgentSessionHandoffBundleExportParams {
            session_id: " sess_handoff ".to_string(),
            locale: Some("en-US".to_string()),
        })
        .await
        .expect("export handoff bundle");

    assert_eq!(response.session_id, "sess_handoff");
    assert_eq!(response.thread_id, "thread_handoff");
    assert_eq!(
        response.bundle_relative_root,
        ".lime/harness/sessions/sess_handoff"
    );
    assert_eq!(response.thread_status, "completed");
    assert_eq!(response.latest_turn_status.as_deref(), Some("completed"));
    assert_eq!(response.artifacts.len(), 4);
    let kinds = response
        .artifacts
        .iter()
        .map(|artifact| artifact.kind.as_str())
        .collect::<Vec<_>>();
    assert_eq!(kinds, vec!["plan", "progress", "handoff", "review_summary"]);
    for artifact in &response.artifacts {
        assert!(Path::new(&artifact.absolute_path).is_file());
        assert!(artifact
            .relative_path
            .starts_with(".lime/harness/sessions/sess_handoff/"));
        assert!(artifact.bytes > 0);
    }
    let progress_path = temp
        .path()
        .join(".lime")
        .join("harness")
        .join("sessions")
        .join("sess_handoff")
        .join("progress.json");
    let progress = fs::read_to_string(progress_path).expect("progress.json");
    assert!(progress.contains("\"schemaVersion\": \"agent-session-handoff-bundle.v1\""));
    assert!(progress.contains(".app-server/artifacts/handoff.md"));
}

#[tokio::test]
async fn export_runtime_review_residuals_write_current_session_artifacts() {
    let temp = tempfile::tempdir().expect("workspace");
    let workspace_root = temp.path().to_string_lossy().to_string();
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_review_export".to_string()),
        thread_id: Some("thread_review_export".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_review_export".to_string(),
            title: Some("Review Export".to_string()),
            uri: None,
            metadata: Some(json!({
                "workspaceRoot": workspace_root,
            })),
        }),
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_review_export".to_string(),
            turn_id: Some("turn_review_export".to_string()),
            input: AgentInput {
                text: "生成 review export".to_string(),
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
    core.append_external_runtime_events(
        "sess_review_export",
        Some("turn_review_export"),
        vec![
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-review",
                    "path": ".app-server/artifacts/review.md",
                    "title": "Review Draft",
                    "kind": "markdown"
                }),
            ),
            RuntimeEvent::new("turn.final_done", json!({})),
        ],
    )
    .expect("append events");

    let replay = core
        .export_replay_case(AgentSessionReplayCaseExportParams {
            session_id: "sess_review_export".to_string(),
            locale: None,
        })
        .await
        .expect("replay");
    assert_eq!(replay.artifacts.len(), 4);
    assert_eq!(replay.artifacts[0].kind, "input");
    assert!(Path::new(&replay.artifacts[0].absolute_path).is_file());

    let analysis = core
        .export_analysis_handoff(AgentSessionAnalysisHandoffExportParams {
            session_id: "sess_review_export".to_string(),
            locale: None,
        })
        .await
        .expect("analysis");
    assert_eq!(analysis.artifacts.len(), 2);
    assert_eq!(analysis.artifacts[0].kind, "analysis_brief");
    assert!(analysis.copy_prompt.contains("sess_review_export"));

    let review = core
        .export_review_decision_template(AgentSessionReviewDecisionTemplateExportParams {
            session_id: "sess_review_export".to_string(),
            locale: None,
        })
        .await
        .expect("review template");
    assert_eq!(review.artifacts.len(), 2);
    assert_eq!(review.decision.decision_status, "pending_review");

    let saved = core
        .save_review_decision(AgentSessionReviewDecisionSaveParams {
            session_id: "sess_review_export".to_string(),
            decision_status: "accepted".to_string(),
            decision_summary: "current path accepted".to_string(),
            chosen_fix_strategy: "keep app server path".to_string(),
            risk_level: "low".to_string(),
            risk_tags: vec!["runtime".to_string()],
            human_reviewer: "reviewer".to_string(),
            followup_actions: vec!["run contracts".to_string()],
            regression_requirements: vec!["npm run test:contracts".to_string()],
            notes: "done".to_string(),
            locale: None,
        })
        .await
        .expect("save review");
    assert_eq!(saved.decision.decision_status, "accepted");
    let review_json = fs::read_to_string(
        temp.path()
            .join(".lime")
            .join("harness")
            .join("sessions")
            .join("sess_review_export")
            .join("review")
            .join("review-decision.json"),
    )
    .expect("review decision json");
    assert!(review_json.contains("current path accepted"));
}

#[tokio::test]
async fn export_evidence_uses_injected_evidence_pack_provider() {
    let provider = Arc::new(TestEvidenceExportProvider::default());
    let core = RuntimeCore::with_backend_capability_source_artifact_content_provider_and_evidence_export_provider(
            Arc::new(MockBackend),
            Arc::new(CapabilityInventorySource::default()),
            Arc::new(InlineArtifactContentProvider),
            provider.clone(),
        );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_evidence".to_string()),
        thread_id: Some("thread_evidence".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_evidence".to_string(),
            turn_id: Some("turn_evidence".to_string()),
            input: AgentInput {
                text: "生成 evidence".to_string(),
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
    core.append_external_runtime_events(
        "sess_evidence",
        Some("turn_evidence"),
        vec![RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifactId": "artifact-report",
                "path": ".app-server/artifacts/report.md"
            }),
        )],
    )
    .expect("append evidence events");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_evidence".to_string(),
            turn_id: Some("turn_evidence".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: None,
        })
        .await
        .expect("export evidence");

    assert_eq!(provider.call_count.load(Ordering::SeqCst), 1);
    let requests = provider
        .requests
        .lock()
        .expect("test evidence requests mutex poisoned");
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].session.session_id, "sess_evidence");
    assert_eq!(requests[0].turns[0].turn_id, "turn_evidence");
    assert_eq!(requests[0].events.len(), 2);
    assert_eq!(requests[0].artifacts[0].artifact_ref, "artifact-report");

    let evidence_pack = response.evidence_pack.expect("evidence pack");
    assert_eq!(evidence_pack.thread_status, "running");
    assert_eq!(
        evidence_pack.latest_turn_status.as_deref(),
        Some("accepted")
    );
    assert_eq!(evidence_pack.turn_count, 1);
    assert_eq!(evidence_pack.recent_artifact_count, 1);
    assert_eq!(
        evidence_pack
            .completion_audit_summary
            .as_ref()
            .and_then(|summary| summary.get("decision"))
            .and_then(|decision| decision.as_str()),
        Some("in_progress")
    );
}

#[tokio::test]
async fn export_evidence_can_skip_injected_evidence_pack_provider() {
    let provider = Arc::new(TestEvidenceExportProvider::default());
    let core = RuntimeCore::with_backend_capability_source_artifact_content_provider_and_evidence_export_provider(
            Arc::new(MockBackend),
            Arc::new(CapabilityInventorySource::default()),
            Arc::new(InlineArtifactContentProvider),
            provider.clone(),
        );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_evidence".to_string()),
        thread_id: Some("thread_evidence".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_evidence".to_string(),
            turn_id: None,
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(false),
        })
        .await
        .expect("export evidence");

    assert_eq!(provider.call_count.load(Ordering::SeqCst), 0);
    assert_eq!(response.evidence_pack, None);
}

#[tokio::test]
async fn default_runtime_exports_basic_evidence_pack_without_desktop_provider() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_basic_evidence".to_string()),
        thread_id: Some("thread_basic_evidence".to_string()),
        app_id: "agent-runtime".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_basic_evidence".to_string(),
            turn_id: Some("turn_basic_evidence".to_string()),
            input: AgentInput {
                text: "生成基础 evidence".to_string(),
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

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_basic_evidence".to_string(),
            turn_id: None,
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export evidence");

    let evidence_pack = response.evidence_pack.expect("basic evidence pack");
    assert_eq!(
        evidence_pack.pack_relative_root,
        ".lime/harness/sessions/sess_basic_evidence/evidence"
    );
    assert_eq!(evidence_pack.thread_status, "running");
    assert_eq!(
        evidence_pack
            .completion_audit_summary
            .as_ref()
            .and_then(|summary| summary.get("decision"))
            .and_then(serde_json::Value::as_str),
        Some("in_progress")
    );
    assert_eq!(
        evidence_pack
            .observability_summary
            .as_ref()
            .and_then(|summary| summary.get("source"))
            .and_then(serde_json::Value::as_str),
        Some("app-server-basic")
    );
}

#[test]
fn capability_list_with_unknown_session_id_returns_session_not_found() {
    let core = RuntimeCore::default();

    let error = core
        .list_capabilities(CapabilityListParams {
            app_id: None,
            workspace_id: None,
            session_id: Some("sess_missing".to_string()),
            cursor: None,
            limit: None,
        })
        .expect_err("missing session");

    match error {
        RuntimeCoreError::SessionNotFound(session_id) => {
            assert_eq!(session_id, "sess_missing");
        }
        other => panic!("expected session not found, got {other:?}"),
    }
}

#[tokio::test]
async fn mock_backend_emits_public_runtime_event() {
    let core = RuntimeCore::default();
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: None,
            thread_id: None,
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: None,
                input: AgentInput {
                    text: "hello".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext {
                client_name: Some("test-client".to_string()),
                client_version: None,
            },
        )
        .await
        .expect("turn");

    let events = core
        .events_for_session(&session.session_id)
        .expect("runtime events");
    assert_eq!(events.len(), 1);
    assert_eq!(output.events.len(), 1);
    assert_eq!(events[0].event_type, "turn.accepted");
    assert_eq!(events[0].payload["backend"], "mock");
    assert_eq!(events[0].payload["clientName"], "test-client");
}

#[tokio::test]
async fn final_done_runtime_event_marks_turn_completed() {
    let core = RuntimeCore::with_backend(Arc::new(FinalDoneBackend));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_final_done".to_string()),
            thread_id: Some("thread_final_done".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_final_done".to_string()),
                input: AgentInput {
                    text: "hello".to_string(),
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

    assert_eq!(output.response.turn.status, AgentTurnStatus::Completed);
    assert!(output.response.turn.completed_at.is_some());

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert_eq!(read.session.status, AgentSessionStatus::Completed);
    assert_eq!(read.turns.len(), 1);
    assert_eq!(read.turns[0].status, AgentTurnStatus::Completed);
    assert!(read.turns[0].completed_at.is_some());
}

#[tokio::test]
async fn cancel_turn_returns_canceled_without_waiting_for_backend_cancel() {
    let backend = Arc::new(HangingCancelBackend {
        cancel_count: AtomicUsize::new(0),
    });
    let core = RuntimeCore::with_backend(backend.clone());
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_cancel_fast".to_string()),
            thread_id: Some("thread_cancel_fast".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_cancel_fast".to_string()),
                input: AgentInput {
                    text: "please keep running".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn")
        .response
        .turn;
    assert_eq!(turn.status, AgentTurnStatus::Running);

    let output = timeout(
        Duration::from_millis(100),
        core.cancel_turn(
            AgentSessionTurnCancelParams {
                session_id: session.session_id.clone(),
                turn_id: turn.turn_id.clone(),
            },
            RuntimeHostContext::default(),
        ),
    )
    .await
    .expect("cancel should not wait for backend")
    .expect("cancel");

    assert_eq!(output.events.len(), 1);
    assert_eq!(output.events[0].event_type, "turn.canceled");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert_eq!(read.session.status, AgentSessionStatus::Canceled);
    assert_eq!(read.turns[0].status, AgentTurnStatus::Canceled);
    assert!(read.turns[0].completed_at.is_some());
}

#[tokio::test]
async fn canceled_turn_ignores_late_runtime_events() {
    let core = RuntimeCore::with_backend(Arc::new(HangingCancelBackend {
        cancel_count: AtomicUsize::new(0),
    }));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_cancel_late".to_string()),
            thread_id: Some("thread_cancel_late".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;
    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_cancel_late".to_string()),
                input: AgentInput {
                    text: "please keep running".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn")
        .response
        .turn;
    core.cancel_turn(
        AgentSessionTurnCancelParams {
            session_id: session.session_id.clone(),
            turn_id: turn.turn_id.clone(),
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("cancel");

    let late_events = core
        .append_external_runtime_events(
            &session.session_id,
            Some(&turn.turn_id),
            vec![
                RuntimeEvent::new("message.delta", json!({ "text": "late reply" })),
                RuntimeEvent::new("turn.final_done", json!({})),
            ],
        )
        .expect("append late events");

    assert!(late_events.is_empty());
    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert_eq!(read.session.status, AgentSessionStatus::Canceled);
    assert_eq!(read.turns[0].status, AgentTurnStatus::Canceled);
    assert_eq!(
        read.detail.unwrap()["messages"].as_array().unwrap().len(),
        1
    );
}

#[tokio::test]
async fn unavailable_backend_rejects_turn_without_persisting_fake_turn() {
    let core = RuntimeCore::with_backend(Arc::new(UnavailableBackend));
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_unavailable".to_string()),
            thread_id: None,
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let error = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_unavailable".to_string()),
                input: AgentInput {
                    text: "hello".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("unavailable backend");

    match error {
        RuntimeCoreError::Backend(message) => {
            assert!(message.contains("standalone app-server backend is not configured"));
        }
        other => panic!("expected backend error, got {other:?}"),
    }

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert_eq!(read.session.status, AgentSessionStatus::Idle);
    assert!(read.turns.is_empty());
    assert!(core
        .events_for_session("sess_unavailable")
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn start_turn_allows_visible_capability_id() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "content.draft.generate".to_string(),
                title: "Generate Draft".to_string(),
                description: None,
                methods: vec!["agentSession/turn/start".to_string()],
            })
            .for_apps(["content-studio"]),
        ])),
    );
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_capability".to_string()),
            thread_id: None,
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: Some("turn_capability".to_string()),
                input: AgentInput {
                    text: "draft".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    capability_id: Some("content.draft.generate".to_string()),
                    stream: false,
                    event_name: None,
                    provider_preference: None,
                    model_preference: None,
                    metadata: None,
                    queued_turn_id: None,
                    host_options: None,
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn");

    assert_eq!(output.response.turn.turn_id, "turn_capability");
}

#[tokio::test]
async fn start_turn_allows_session_scoped_capability_id() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "session.draft.write".to_string(),
                title: "Session Draft Write".to_string(),
                description: None,
                methods: vec![METHOD_AGENT_SESSION_TURN_START.to_string()],
            })
            .for_apps(["content-studio"])
            .for_workspaces(["workspace-main"])
            .for_sessions(["sess_runtime_allowed"]),
        ])),
    );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_runtime_allowed".to_string()),
        thread_id: None,
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_runtime_allowed".to_string(),
                turn_id: Some("turn_session_capability".to_string()),
                input: AgentInput {
                    text: "draft".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    capability_id: Some("session.draft.write".to_string()),
                    stream: false,
                    event_name: None,
                    provider_preference: None,
                    model_preference: None,
                    metadata: None,
                    queued_turn_id: None,
                    host_options: None,
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("turn");

    assert_eq!(output.response.turn.turn_id, "turn_session_capability");
}

#[tokio::test]
async fn start_turn_rejects_hidden_capability_id_without_persisting_turn() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "content.draft.generate".to_string(),
                title: "Generate Draft".to_string(),
                description: None,
                methods: vec!["agentSession/turn/start".to_string()],
            })
            .for_apps(["other-app"]),
        ])),
    );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_capability_denied".to_string()),
        thread_id: None,
        app_id: "content-studio".to_string(),
        workspace_id: Some("default".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let error = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_capability_denied".to_string(),
                turn_id: Some("turn_denied".to_string()),
                input: AgentInput {
                    text: "draft".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    capability_id: Some("content.draft.generate".to_string()),
                    stream: false,
                    event_name: None,
                    provider_preference: None,
                    model_preference: None,
                    metadata: None,
                    queued_turn_id: None,
                    host_options: None,
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("capability denied");

    match error {
        RuntimeCoreError::CapabilityDenied(capability_id) => {
            assert_eq!(capability_id, "content.draft.generate");
        }
        other => panic!("expected capability denied, got {other:?}"),
    }
    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_capability_denied".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert!(read.turns.is_empty());
}

#[tokio::test]
async fn start_turn_rejects_readiness_only_capability_id_without_persisting_turn() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "content.readiness.check".to_string(),
                title: "Readiness Check".to_string(),
                description: None,
                methods: vec!["capability/list".to_string()],
            })
            .for_apps(["content-studio"]),
        ])),
    );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_readiness_only".to_string()),
        thread_id: None,
        app_id: "content-studio".to_string(),
        workspace_id: Some("default".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let listed = core
        .list_capabilities(CapabilityListParams {
            app_id: Some("content-studio".to_string()),
            workspace_id: Some("default".to_string()),
            session_id: None,
            cursor: None,
            limit: None,
        })
        .expect("capability list");
    assert_eq!(listed.capabilities.len(), 1);
    assert_eq!(listed.capabilities[0].id, "content.readiness.check");

    let error = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_readiness_only".to_string(),
                turn_id: Some("turn_readiness_denied".to_string()),
                input: AgentInput {
                    text: "draft".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    capability_id: Some("content.readiness.check".to_string()),
                    stream: false,
                    event_name: None,
                    provider_preference: None,
                    model_preference: None,
                    metadata: None,
                    queued_turn_id: None,
                    host_options: None,
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("capability denied");

    match error {
        RuntimeCoreError::CapabilityDenied(capability_id) => {
            assert_eq!(capability_id, "content.readiness.check");
        }
        other => panic!("expected capability denied, got {other:?}"),
    }
    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_readiness_only".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    assert!(read.turns.is_empty());
}

#[test]
fn start_session_can_bind_caller_supplied_ids() {
    let core = RuntimeCore::default();

    let response = core
        .start_session(AgentSessionStartParams {
            session_id: Some(" sess_external ".to_string()),
            thread_id: Some(" thread_external ".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

    assert_eq!(response.session.session_id, "sess_external");
    assert_eq!(response.session.thread_id, "thread_external");
}

#[test]
fn start_session_rejects_duplicate_session_id() {
    let core = RuntimeCore::default();
    let params = AgentSessionStartParams {
        session_id: Some("sess_external".to_string()),
        thread_id: Some("thread_external".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("default".to_string()),
        business_object_ref: None,
        locale: None,
    };

    core.start_session(params.clone()).expect("first session");
    let error = core
        .start_session(params)
        .expect_err("duplicate session should fail");

    match error {
        RuntimeCoreError::SessionAlreadyExists(session_id) => {
            assert_eq!(session_id, "sess_external");
        }
        other => panic!("expected duplicate session error, got {other:?}"),
    }
}

#[tokio::test]
async fn append_external_runtime_events_keeps_sequence_and_turn_scope() {
    let core = RuntimeCore::default();
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_external".to_string()),
            thread_id: Some("thread_external".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;
    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: session.session_id.clone(),
                turn_id: None,
                input: AgentInput {
                    text: "hello".to_string(),
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
    let turn_id = output.response.turn.turn_id;

    let appended = core
        .append_external_runtime_events(
            &session.session_id,
            Some(&turn_id),
            vec![RuntimeEvent::new(
                "message.delta",
                json!({ "text": "delta" }),
            )],
        )
        .expect("append");

    assert_eq!(appended.len(), 1);
    assert_eq!(appended[0].sequence, 2);
    assert_eq!(appended[0].session_id, "sess_external");
    assert_eq!(appended[0].thread_id.as_deref(), Some("thread_external"));
    assert_eq!(appended[0].turn_id.as_deref(), Some(turn_id.as_str()));
    assert_eq!(appended[0].event_type, "message.delta");
    assert_eq!(appended[0].payload["text"], "delta");
}
