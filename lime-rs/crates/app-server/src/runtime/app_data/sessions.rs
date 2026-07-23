use super::unavailable;
use super::NoopAppDataSource;
use super::RuntimeCoreError;
use app_server_protocol::*;
use async_trait::async_trait;

#[async_trait]
pub trait SessionAppDataSource: Send + Sync {
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
