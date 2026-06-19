use super::unavailable;
use super::NoopAppDataSource;
use super::RuntimeCoreError;
use app_server_protocol::*;
use async_trait::async_trait;

#[async_trait]
pub trait MemoryAppDataSource: Send + Sync {
    async fn read_project_memory(
        &self,
        _params: ProjectMemoryReadParams,
    ) -> Result<ProjectMemoryReadResponse, RuntimeCoreError> {
        Ok(ProjectMemoryReadResponse::default())
    }

    async fn list_memory_store(
        &self,
        _params: MemoryStoreListParams,
    ) -> Result<MemoryStoreListResponse, RuntimeCoreError> {
        Err(unavailable("memoryStore/list"))
    }

    async fn read_memory_store(
        &self,
        _params: MemoryStoreReadParams,
    ) -> Result<MemoryStoreReadResponse, RuntimeCoreError> {
        Err(unavailable("memoryStore/read"))
    }

    async fn search_memory_store(
        &self,
        _params: MemoryStoreSearchParams,
    ) -> Result<MemoryStoreSearchResponse, RuntimeCoreError> {
        Err(unavailable("memoryStore/search"))
    }

    async fn add_memory_store_note(
        &self,
        _params: MemoryStoreAddNoteParams,
    ) -> Result<MemoryStoreAddNoteResponse, RuntimeCoreError> {
        Err(unavailable("memoryStore/addNote"))
    }

    async fn health_memory_store(
        &self,
        _params: MemoryStoreRootParams,
    ) -> Result<MemoryStoreHealthResponse, RuntimeCoreError> {
        Err(unavailable("memoryStore/health"))
    }

    async fn reset_memory_store(
        &self,
        _params: MemoryStoreResetParams,
    ) -> Result<MemoryStoreResetResponse, RuntimeCoreError> {
        Err(unavailable("memoryStore/reset"))
    }
}

impl MemoryAppDataSource for NoopAppDataSource {}
