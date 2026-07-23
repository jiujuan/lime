use super::super::*;
use async_trait::async_trait;

#[async_trait]
impl SessionAppDataSource for LocalAppDataSource {
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
