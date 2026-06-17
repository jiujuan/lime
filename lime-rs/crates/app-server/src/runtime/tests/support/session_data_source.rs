use super::super::*;

pub(in crate::runtime::tests) struct TestSessionDataSource {
    persisted: Option<AgentSessionReadResponse>,
    workspace: Option<serde_json::Value>,
    objective: Mutex<Option<ManagedObjective>>,
    audit_updates: Mutex<Vec<ManagedObjectiveAuditUpdate>>,
    knowledge_compile_requests: Mutex<Vec<lime_knowledge::KnowledgeCompilePackRequest>>,
}

impl TestSessionDataSource {
    pub(in crate::runtime::tests) fn new(persisted: AgentSessionReadResponse) -> Self {
        Self {
            persisted: Some(persisted),
            workspace: None,
            objective: Mutex::new(None),
            audit_updates: Mutex::new(Vec::new()),
            knowledge_compile_requests: Mutex::new(Vec::new()),
        }
    }

    pub(in crate::runtime::tests) fn with_workspace(self, workspace: serde_json::Value) -> Self {
        Self {
            workspace: Some(workspace),
            ..self
        }
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
impl MemoryAppDataSource for TestSessionDataSource {}
impl DiagnosticsAppDataSource for TestSessionDataSource {}
impl UsageStatsAppDataSource for TestSessionDataSource {}
impl ModelProviderAppDataSource for TestSessionDataSource {}
impl ConnectAppDataSource for TestSessionDataSource {}
