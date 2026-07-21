use super::super::*;
use async_trait::async_trait;

#[async_trait]
impl SessionAppDataSource for LocalAppDataSource {
    async fn read_agent_session_objective(
        &self,
        params: AgentSessionObjectiveReadParams,
    ) -> Result<AgentSessionObjectiveReadResponse, RuntimeCoreError> {
        session_objectives::read_agent_session_objective(&self.db, params)
    }

    async fn set_agent_session_objective(
        &self,
        params: AgentSessionObjectiveSetParams,
    ) -> Result<AgentSessionObjectiveSetResponse, RuntimeCoreError> {
        session_objectives::set_agent_session_objective(&self.db, params)
    }

    async fn update_agent_session_objective_status(
        &self,
        params: AgentSessionObjectiveStatusUpdateParams,
    ) -> Result<AgentSessionObjectiveStatusUpdateResponse, RuntimeCoreError> {
        session_objectives::update_agent_session_objective_status(&self.db, params)
    }

    async fn clear_agent_session_objective(
        &self,
        params: AgentSessionObjectiveClearParams,
    ) -> Result<AgentSessionObjectiveClearResponse, RuntimeCoreError> {
        session_objectives::clear_agent_session_objective(&self.db, params)
    }

    async fn read_managed_objective_by_owner(
        &self,
        owner_kind: String,
        owner_id: String,
    ) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
        session_objectives::read_managed_objective_by_owner(&self.db, owner_kind, owner_id)
    }

    async fn audit_agent_session_objective(
        &self,
        owner_kind: String,
        owner_id: String,
        update: ManagedObjectiveAuditUpdate,
    ) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
        session_objectives::audit_agent_session_objective(&self.db, owner_kind, owner_id, update)
    }

    async fn get_or_create_session_file(
        &self,
        params: SessionFileGetOrCreateParams,
    ) -> Result<SessionFileMetaResponse, RuntimeCoreError> {
        session_files::get_or_create_session_file(self.session_files_root.clone(), params).await
    }

    async fn update_session_file_meta(
        &self,
        params: SessionFileUpdateMetaParams,
    ) -> Result<SessionFileMetaResponse, RuntimeCoreError> {
        session_files::update_session_file_meta(self.session_files_root.clone(), params).await
    }

    async fn save_session_file(
        &self,
        params: SessionFileSaveParams,
    ) -> Result<SessionFileEntryResponse, RuntimeCoreError> {
        session_files::save_session_file(self.session_files_root.clone(), params).await
    }

    async fn read_session_file(
        &self,
        params: SessionFileIdParams,
    ) -> Result<SessionFileReadResponse, RuntimeCoreError> {
        session_files::read_session_file(self.session_files_root.clone(), params).await
    }

    async fn resolve_session_file_path(
        &self,
        params: SessionFileIdParams,
    ) -> Result<SessionFileResolvePathResponse, RuntimeCoreError> {
        session_files::resolve_session_file_path(self.session_files_root.clone(), params).await
    }

    async fn delete_session_file(
        &self,
        params: SessionFileIdParams,
    ) -> Result<SessionFileMutationResponse, RuntimeCoreError> {
        session_files::delete_session_file(self.session_files_root.clone(), params).await
    }

    async fn list_session_files(
        &self,
        params: SessionFileGetOrCreateParams,
    ) -> Result<SessionFileListResponse, RuntimeCoreError> {
        session_files::list_session_files(self.session_files_root.clone(), params).await
    }
}
