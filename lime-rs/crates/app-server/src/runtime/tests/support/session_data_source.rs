use super::super::*;
use crate::MemoryBackend;

pub(in crate::runtime::tests) struct TestSessionDataSource {
    persisted: Option<AgentSessionReadResponse>,
    workspace: Option<serde_json::Value>,
    memory_store_read_response: Mutex<Option<Result<MemoryStoreReadResponse, String>>>,
    memory_store_read_requests: Mutex<Vec<MemoryStoreReadParams>>,
    memory_backend: Option<crate::LocalMemoryBackend>,
    objective: Mutex<Option<ManagedObjective>>,
    audit_updates: Mutex<Vec<ManagedObjectiveAuditUpdate>>,
    knowledge_compile_requests: Mutex<Vec<lime_knowledge::KnowledgeCompilePackRequest>>,
    right_surface_pending: Mutex<Vec<WorkspaceRightSurfacePendingRequest>>,
    object_canvas_snapshots: Mutex<Vec<WorkspaceObjectCanvasSnapshot>>,
}

impl TestSessionDataSource {
    pub(in crate::runtime::tests) fn new(persisted: AgentSessionReadResponse) -> Self {
        Self {
            persisted: Some(persisted),
            workspace: None,
            memory_store_read_response: Mutex::new(None),
            memory_store_read_requests: Mutex::new(Vec::new()),
            memory_backend: None,
            objective: Mutex::new(None),
            audit_updates: Mutex::new(Vec::new()),
            knowledge_compile_requests: Mutex::new(Vec::new()),
            right_surface_pending: Mutex::new(Vec::new()),
            object_canvas_snapshots: Mutex::new(Vec::new()),
        }
    }

    pub(in crate::runtime::tests) fn with_workspace(self, workspace: serde_json::Value) -> Self {
        Self {
            workspace: Some(workspace),
            ..self
        }
    }

    pub(in crate::runtime::tests) fn with_memory_data_root(
        self,
        data_root: impl Into<std::path::PathBuf>,
    ) -> Self {
        Self {
            memory_backend: Some(crate::LocalMemoryBackend::new(data_root)),
            ..self
        }
    }

    pub(in crate::runtime::tests) fn with_memory_store_read_response(
        self,
        response: Result<MemoryStoreReadResponse, String>,
    ) -> Self {
        *self
            .memory_store_read_response
            .lock()
            .expect("test memory response mutex poisoned") = Some(response);
        self
    }

    pub(in crate::runtime::tests) fn with_objective(self, objective: ManagedObjective) -> Self {
        *self
            .objective
            .lock()
            .expect("test objective mutex poisoned") = Some(objective);
        self
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

    pub(in crate::runtime::tests) fn memory_store_read_requests(
        &self,
    ) -> Vec<MemoryStoreReadParams> {
        self.memory_store_read_requests
            .lock()
            .expect("test memory requests mutex poisoned")
            .clone()
    }

    pub(in crate::runtime::tests) fn object_canvas_snapshots(
        &self,
    ) -> Vec<WorkspaceObjectCanvasSnapshot> {
        self.object_canvas_snapshots
            .lock()
            .expect("test object canvas snapshot mutex poisoned")
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
impl SessionAppDataSource for TestSessionDataSource {
    async fn read_agent_session(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<Option<AgentSessionReadResponse>, RuntimeCoreError> {
        Ok(self
            .persisted
            .as_ref()
            .filter(|response| response.session.session_id == params.session_id)
            .cloned())
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
}

#[async_trait]
impl KnowledgeAppDataSource for TestSessionDataSource {
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
}

#[async_trait]
impl WorkspaceAppDataSource for TestSessionDataSource {
    async fn read_workspace(
        &self,
        _params: WorkspaceReadParams,
    ) -> Result<WorkspaceReadResponse, RuntimeCoreError> {
        Ok(WorkspaceReadResponse {
            workspace: self.workspace.clone(),
        })
    }
}
impl SkillAppDataSource for TestSessionDataSource {}
impl WorkspaceSkillBindingAppDataSource for TestSessionDataSource {}
impl GatewayAppDataSource for TestSessionDataSource {}
impl MediaAppDataSource for TestSessionDataSource {}
impl VoiceAppDataSource for TestSessionDataSource {}
impl AgentAppDataSource for TestSessionDataSource {}
impl AutomationOverviewAppDataSource for TestSessionDataSource {}
impl McpAppDataSource for TestSessionDataSource {}
impl AutomationManagementAppDataSource for TestSessionDataSource {}
#[async_trait]
impl MemoryAppDataSource for TestSessionDataSource {
    async fn read_memory_store(
        &self,
        params: MemoryStoreReadParams,
    ) -> Result<MemoryStoreReadResponse, RuntimeCoreError> {
        self.memory_store_read_requests
            .lock()
            .expect("test memory requests mutex poisoned")
            .push(params);
        let response = self
            .memory_store_read_response
            .lock()
            .expect("test memory response mutex poisoned")
            .clone();
        match response {
            Some(Ok(response)) => Ok(response),
            Some(Err(message)) => Err(RuntimeCoreError::Backend(message)),
            None => Err(RuntimeCoreError::Backend(
                "memoryStore/read unavailable in test data source".to_string(),
            )),
        }
    }

    async fn write_memory_rollout_summary(
        &self,
        params: crate::RolloutSummaryWriteParams,
    ) -> Result<MemoryStoreAddNoteResponse, RuntimeCoreError> {
        let Some(memory_backend) = &self.memory_backend else {
            return Err(RuntimeCoreError::Backend(
                "memory rollout summary write unavailable in test data source".to_string(),
            ));
        };
        memory_backend.write_rollout_summary(params).await
    }

    async fn consolidate_memory_store(
        &self,
        params: MemoryStoreConsolidateParams,
    ) -> Result<MemoryStoreConsolidateResponse, RuntimeCoreError> {
        let Some(memory_backend) = &self.memory_backend else {
            return Err(RuntimeCoreError::Backend(
                "memoryStore/consolidate unavailable in test data source".to_string(),
            ));
        };
        memory_backend.consolidate(params).await
    }
}
impl DiagnosticsAppDataSource for TestSessionDataSource {}
impl UsageStatsAppDataSource for TestSessionDataSource {}
impl ModelProviderAppDataSource for TestSessionDataSource {}
impl ConnectAppDataSource for TestSessionDataSource {}

#[async_trait]
impl RightSurfaceAppDataSource for TestSessionDataSource {
    fn workspace_right_surface_pending_persistence_enabled(&self) -> bool {
        true
    }

    async fn save_workspace_right_surface_pending(
        &self,
        request: WorkspaceRightSurfacePendingRequest,
    ) -> Result<(), RuntimeCoreError> {
        let mut pending = self
            .right_surface_pending
            .lock()
            .expect("test right surface pending mutex poisoned");
        pending.retain(|item| item.request_id != request.request_id);
        pending.push(request);
        Ok(())
    }

    async fn list_workspace_right_surface_pending(
        &self,
        params: WorkspaceRightSurfacePendingListParams,
    ) -> Result<Vec<WorkspaceRightSurfacePendingRequest>, RuntimeCoreError> {
        let workspace_id = optional_trimmed(params.workspace_id);
        let workspace_root = optional_trimmed(params.workspace_root);
        let session_id = optional_trimmed(params.session_id);
        let surface_kind = optional_trimmed(params.surface_kind);
        let mut pending = self
            .right_surface_pending
            .lock()
            .expect("test right surface pending mutex poisoned")
            .iter()
            .filter(|request| {
                optional_filter_matches(&workspace_id, request.workspace_id.as_deref())
            })
            .filter(|request| {
                optional_filter_matches(&workspace_root, request.workspace_root.as_deref())
            })
            .filter(|request| optional_filter_matches(&session_id, request.session_id.as_deref()))
            .filter(|request| {
                surface_kind
                    .as_ref()
                    .is_none_or(|value| request.surface_kind == *value)
            })
            .cloned()
            .collect::<Vec<_>>();
        if let Some(limit) = params.limit.map(|value| value as usize) {
            pending.truncate(limit);
        }
        Ok(pending)
    }

    async fn delete_workspace_right_surface_pending(
        &self,
        request_ids: Vec<String>,
    ) -> Result<Vec<String>, RuntimeCoreError> {
        let mut deleted = Vec::new();
        let mut pending = self
            .right_surface_pending
            .lock()
            .expect("test right surface pending mutex poisoned");
        pending.retain(|request| {
            if request_ids.contains(&request.request_id) {
                deleted.push(request.request_id.clone());
                false
            } else {
                true
            }
        });
        Ok(deleted)
    }

    async fn save_workspace_object_canvas_snapshot(
        &self,
        snapshot: WorkspaceObjectCanvasSnapshot,
    ) -> Result<(), RuntimeCoreError> {
        let mut snapshots = self
            .object_canvas_snapshots
            .lock()
            .expect("test object canvas snapshot mutex poisoned");
        snapshots.retain(|item| {
            item.persistence_key != snapshot.persistence_key || item.revision != snapshot.revision
        });
        snapshots.push(snapshot);
        Ok(())
    }

    async fn list_workspace_object_canvas_snapshots(
        &self,
        params: WorkspaceObjectCanvasSnapshotListParams,
    ) -> Result<Vec<WorkspaceObjectCanvasSnapshot>, RuntimeCoreError> {
        let workspace_id = optional_trimmed(params.workspace_id);
        let workspace_root = optional_trimmed(params.workspace_root);
        let session_id = optional_trimmed(params.session_id);
        let board_id = optional_trimmed(params.board_id);
        let persistence_key = optional_trimmed(params.persistence_key);
        let mut snapshots = self
            .object_canvas_snapshots
            .lock()
            .expect("test object canvas snapshot mutex poisoned")
            .iter()
            .filter(|snapshot| {
                optional_filter_matches(&workspace_id, snapshot.workspace_id.as_deref())
            })
            .filter(|snapshot| {
                optional_filter_matches(&workspace_root, snapshot.workspace_root.as_deref())
            })
            .filter(|snapshot| optional_filter_matches(&session_id, snapshot.session_id.as_deref()))
            .filter(|snapshot| optional_filter_matches(&board_id, Some(snapshot.board_id.as_str())))
            .filter(|snapshot| {
                optional_filter_matches(&persistence_key, Some(snapshot.persistence_key.as_str()))
            })
            .cloned()
            .collect::<Vec<_>>();
        if let Some(limit) = params.limit.map(|value| value as usize) {
            snapshots.truncate(limit);
        }
        Ok(snapshots)
    }
}

fn optional_trimmed(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn optional_filter_matches(filter: &Option<String>, value: Option<&str>) -> bool {
    filter
        .as_ref()
        .is_none_or(|filter| value == Some(filter.as_str()))
}
