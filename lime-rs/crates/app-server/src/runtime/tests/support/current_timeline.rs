use super::super::*;

pub(in crate::runtime::tests) struct TestCurrentTimelineDataSource {
    pub(in crate::runtime::tests) persisted: Option<AgentSessionReadResponse>,
    pub(in crate::runtime::tests) objective: Mutex<Option<ManagedObjective>>,
    pub(in crate::runtime::tests) audit_updates: Mutex<Vec<ManagedObjectiveAuditUpdate>>,
    pub(in crate::runtime::tests) read_requests: Mutex<Vec<AgentSessionReadParams>>,
    pub(in crate::runtime::tests) knowledge_compile_requests:
        Mutex<Vec<lime_knowledge::KnowledgeCompilePackRequest>>,
}

impl TestCurrentTimelineDataSource {
    pub(in crate::runtime::tests) fn new(persisted: AgentSessionReadResponse) -> Self {
        Self {
            persisted: Some(persisted),
            objective: Mutex::new(None),
            audit_updates: Mutex::new(Vec::new()),
            read_requests: Mutex::new(Vec::new()),
            knowledge_compile_requests: Mutex::new(Vec::new()),
        }
    }

    pub(in crate::runtime::tests) fn with_objective(self, objective: ManagedObjective) -> Self {
        *self
            .objective
            .lock()
            .expect("test objective mutex poisoned") = Some(objective);
        self
    }

    pub(in crate::runtime::tests) fn read_requests(&self) -> Vec<AgentSessionReadParams> {
        self.read_requests
            .lock()
            .expect("test current timeline read requests mutex poisoned")
            .clone()
    }

    pub(in crate::runtime::tests) fn objective(&self) -> Option<ManagedObjective> {
        self.objective
            .lock()
            .expect("test objective mutex poisoned")
            .clone()
    }

    pub(in crate::runtime::tests) fn audit_updates(&self) -> Vec<ManagedObjectiveAuditUpdate> {
        self.audit_updates
            .lock()
            .expect("test audit updates mutex poisoned")
            .clone()
    }

    pub(in crate::runtime::tests) fn knowledge_compile_requests(
        &self,
    ) -> Vec<lime_knowledge::KnowledgeCompilePackRequest> {
        self.knowledge_compile_requests
            .lock()
            .expect("test knowledge compile requests mutex poisoned")
            .clone()
    }
}

pub(in crate::runtime::tests) fn empty_agent_session_read_response(
    session_id: &str,
) -> AgentSessionReadResponse {
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

pub(in crate::runtime::tests) fn managed_objective(session_id: &str) -> ManagedObjective {
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
