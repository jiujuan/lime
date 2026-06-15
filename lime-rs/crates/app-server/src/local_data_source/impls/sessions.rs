use super::super::*;
use crate::LegacyAgentSessionTranscript;
use async_trait::async_trait;

#[async_trait]
impl SessionAppDataSource for LocalAppDataSource {
    async fn list_current_timeline_sessions(
        &self,
        params: AgentSessionListParams,
    ) -> Result<AgentSessionListResponse, RuntimeCoreError> {
        current_timeline::list_current_timeline_sessions(&self.db, params)
    }

    async fn read_current_timeline_session(
        &self,
        params: AgentSessionReadParams,
    ) -> Result<Option<AgentSessionReadResponse>, RuntimeCoreError> {
        current_timeline::read_current_timeline_session(&self.db, params)
    }

    async fn update_current_timeline_session(
        &self,
        params: AgentSessionUpdateParams,
    ) -> Result<AgentSessionUpdateResponse, RuntimeCoreError> {
        current_timeline::update_current_timeline_session(&self.db, params)
    }

    async fn archive_many_current_timeline_sessions(
        &self,
        params: AgentSessionArchiveManyParams,
    ) -> Result<AgentSessionArchiveManyResponse, RuntimeCoreError> {
        current_timeline::archive_many_current_timeline_sessions(&self.db, params)
    }

    async fn list_legacy_agent_message_transcripts(
        &self,
        params: AgentSessionListParams,
    ) -> Result<Vec<LegacyAgentSessionTranscript>, RuntimeCoreError> {
        legacy_message_backfill_source::list_legacy_agent_message_transcripts(&self.db, params)
    }

    async fn read_legacy_agent_message_transcript(
        &self,
        session_id: String,
    ) -> Result<Option<LegacyAgentSessionTranscript>, RuntimeCoreError> {
        legacy_message_backfill_source::read_legacy_agent_message_transcript(&self.db, &session_id)
    }

    async fn clear_legacy_agent_message_sessions(
        &self,
        session_ids: Vec<String>,
    ) -> Result<usize, RuntimeCoreError> {
        legacy_message_backfill_source::clear_legacy_agent_message_sessions(&self.db, &session_ids)
    }

    async fn drop_empty_legacy_agent_message_tables(&self) -> Result<usize, RuntimeCoreError> {
        legacy_message_backfill_source::drop_empty_legacy_agent_message_tables(&self.db)
    }

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
        session_files::get_or_create_session_file(params).await
    }

    async fn update_session_file_meta(
        &self,
        params: SessionFileUpdateMetaParams,
    ) -> Result<SessionFileMetaResponse, RuntimeCoreError> {
        session_files::update_session_file_meta(params).await
    }

    async fn save_session_file(
        &self,
        params: SessionFileSaveParams,
    ) -> Result<SessionFileEntryResponse, RuntimeCoreError> {
        session_files::save_session_file(params).await
    }

    async fn read_session_file(
        &self,
        params: SessionFileIdParams,
    ) -> Result<SessionFileReadResponse, RuntimeCoreError> {
        session_files::read_session_file(params).await
    }

    async fn resolve_session_file_path(
        &self,
        params: SessionFileIdParams,
    ) -> Result<SessionFileResolvePathResponse, RuntimeCoreError> {
        session_files::resolve_session_file_path(params).await
    }

    async fn delete_session_file(
        &self,
        params: SessionFileIdParams,
    ) -> Result<SessionFileMutationResponse, RuntimeCoreError> {
        session_files::delete_session_file(params).await
    }

    async fn list_session_files(
        &self,
        params: SessionFileGetOrCreateParams,
    ) -> Result<SessionFileListResponse, RuntimeCoreError> {
        session_files::list_session_files(params).await
    }
}
