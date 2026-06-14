use super::service_projection::{
    file_system_directory_listing_from_service, file_system_file_preview_from_service,
    file_system_required_path,
};
use super::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::*;

impl RuntimeCore {
    pub async fn list_directory(
        &self,
        params: FileSystemListDirectoryParams,
    ) -> Result<FileSystemDirectoryListing, RuntimeCoreError> {
        let path = params.path.trim();
        if path.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "path is required for fileSystem/listDirectory".to_string(),
            ));
        }
        let path = path.to_string();
        let listing = tokio::task::spawn_blocking(move || {
            lime_services::file_browser_service::list_directory(&path)
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("目录读取任务失败: {error}")))?;
        Ok(file_system_directory_listing_from_service(listing))
    }

    pub async fn read_file_preview(
        &self,
        params: FileSystemReadFilePreviewParams,
    ) -> Result<FileSystemFilePreview, RuntimeCoreError> {
        let path = params.path.trim();
        if path.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "path is required for fileSystem/readFilePreview".to_string(),
            ));
        }
        let path = path.to_string();
        let max_size = params.max_size;
        let preview = tokio::task::spawn_blocking(move || {
            lime_services::file_browser_service::read_file_preview(&path, max_size)
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("文件预览任务失败: {error}")))?;
        Ok(file_system_file_preview_from_service(preview))
    }

    pub async fn create_file(
        &self,
        params: FileSystemCreateFileParams,
    ) -> Result<FileSystemMutationResponse, RuntimeCoreError> {
        let path = file_system_required_path(params.path, "fileSystem/createFile")?;
        let handle = tokio::runtime::Handle::current();
        tokio::task::spawn_blocking(move || {
            handle.block_on(lime_services::file_browser_service::create_file(path))
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("文件创建任务失败: {error}")))?
        .map_err(RuntimeCoreError::Backend)?;
        Ok(FileSystemMutationResponse::default())
    }

    pub async fn create_directory(
        &self,
        params: FileSystemCreateDirectoryParams,
    ) -> Result<FileSystemMutationResponse, RuntimeCoreError> {
        let path = file_system_required_path(params.path, "fileSystem/createDirectory")?;
        let handle = tokio::runtime::Handle::current();
        tokio::task::spawn_blocking(move || {
            handle.block_on(lime_services::file_browser_service::create_directory(path))
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("目录创建任务失败: {error}")))?
        .map_err(RuntimeCoreError::Backend)?;
        Ok(FileSystemMutationResponse::default())
    }

    pub async fn rename_file(
        &self,
        params: FileSystemRenameFileParams,
    ) -> Result<FileSystemMutationResponse, RuntimeCoreError> {
        let old_path = file_system_required_path(params.old_path, "fileSystem/renameFile.oldPath")?;
        let new_path = file_system_required_path(params.new_path, "fileSystem/renameFile.newPath")?;
        let handle = tokio::runtime::Handle::current();
        tokio::task::spawn_blocking(move || {
            handle.block_on(lime_services::file_browser_service::rename_file(
                old_path, new_path,
            ))
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("文件重命名任务失败: {error}")))?
        .map_err(RuntimeCoreError::Backend)?;
        Ok(FileSystemMutationResponse::default())
    }

    pub async fn delete_file(
        &self,
        params: FileSystemDeleteFileParams,
    ) -> Result<FileSystemMutationResponse, RuntimeCoreError> {
        let path = file_system_required_path(params.path, "fileSystem/deleteFile")?;
        let recursive = params.recursive.unwrap_or(false);
        let handle = tokio::runtime::Handle::current();
        tokio::task::spawn_blocking(move || {
            handle.block_on(lime_services::file_browser_service::delete_file(
                path, recursive,
            ))
        })
        .await
        .map_err(|error| RuntimeCoreError::Backend(format!("文件删除任务失败: {error}")))?
        .map_err(RuntimeCoreError::Backend)?;
        Ok(FileSystemMutationResponse::default())
    }
}
