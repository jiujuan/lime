use super::unavailable;
use super::NoopAppDataSource;
use super::RuntimeCoreError;
use crate::runtime::ManagedObjectiveAuditUpdate;
use app_server_protocol::*;
use async_trait::async_trait;

#[async_trait]
pub trait SessionAppDataSource: Send + Sync {
    async fn read_agent_session(
        &self,
        _params: AgentSessionReadParams,
    ) -> Result<Option<AgentSessionReadResponse>, RuntimeCoreError> {
        Ok(None)
    }

    async fn read_agent_session_objective(
        &self,
        _params: AgentSessionObjectiveReadParams,
    ) -> Result<AgentSessionObjectiveReadResponse, RuntimeCoreError> {
        Err(unavailable("agentSession/objective/read"))
    }

    async fn set_agent_session_objective(
        &self,
        _params: AgentSessionObjectiveSetParams,
    ) -> Result<AgentSessionObjectiveSetResponse, RuntimeCoreError> {
        Err(unavailable("agentSession/objective/set"))
    }

    async fn update_agent_session_objective_status(
        &self,
        _params: AgentSessionObjectiveStatusUpdateParams,
    ) -> Result<AgentSessionObjectiveStatusUpdateResponse, RuntimeCoreError> {
        Err(unavailable("agentSession/objective/status/update"))
    }

    async fn clear_agent_session_objective(
        &self,
        _params: AgentSessionObjectiveClearParams,
    ) -> Result<AgentSessionObjectiveClearResponse, RuntimeCoreError> {
        Err(unavailable("agentSession/objective/clear"))
    }

    async fn read_managed_objective_by_owner(
        &self,
        _owner_kind: String,
        _owner_id: String,
    ) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
        Err(unavailable("managed objective owner read"))
    }

    async fn audit_agent_session_objective(
        &self,
        _owner_kind: String,
        _owner_id: String,
        _update: ManagedObjectiveAuditUpdate,
    ) -> Result<Option<ManagedObjective>, RuntimeCoreError> {
        Err(unavailable("agentSession/objective/audit"))
    }

    async fn get_or_create_session_file(
        &self,
        _params: SessionFileGetOrCreateParams,
    ) -> Result<SessionFileMetaResponse, RuntimeCoreError> {
        Err(unavailable("sessionFile/getOrCreate"))
    }

    async fn update_session_file_meta(
        &self,
        _params: SessionFileUpdateMetaParams,
    ) -> Result<SessionFileMetaResponse, RuntimeCoreError> {
        Err(unavailable("sessionFile/updateMeta"))
    }

    async fn save_session_file(
        &self,
        _params: SessionFileSaveParams,
    ) -> Result<SessionFileEntryResponse, RuntimeCoreError> {
        Err(unavailable("sessionFile/save"))
    }

    async fn read_session_file(
        &self,
        _params: SessionFileIdParams,
    ) -> Result<SessionFileReadResponse, RuntimeCoreError> {
        Err(unavailable("sessionFile/read"))
    }

    async fn resolve_session_file_path(
        &self,
        _params: SessionFileIdParams,
    ) -> Result<SessionFileResolvePathResponse, RuntimeCoreError> {
        Err(unavailable("sessionFile/resolvePath"))
    }

    async fn delete_session_file(
        &self,
        _params: SessionFileIdParams,
    ) -> Result<SessionFileMutationResponse, RuntimeCoreError> {
        Err(unavailable("sessionFile/delete"))
    }

    async fn list_session_files(
        &self,
        _params: SessionFileGetOrCreateParams,
    ) -> Result<SessionFileListResponse, RuntimeCoreError> {
        Err(unavailable("sessionFile/list"))
    }
}

impl SessionAppDataSource for NoopAppDataSource {}
