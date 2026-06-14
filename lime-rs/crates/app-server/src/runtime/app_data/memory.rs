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

    async fn list_unified_memories(
        &self,
        _params: UnifiedMemoryListParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        Err(unavailable("unifiedMemory/list"))
    }

    async fn get_unified_memory(
        &self,
        _params: UnifiedMemoryGetParams,
    ) -> Result<UnifiedMemoryGetResponse, RuntimeCoreError> {
        Err(unavailable("unifiedMemory/get"))
    }

    async fn create_unified_memory(
        &self,
        _params: UnifiedMemoryCreateParams,
    ) -> Result<UnifiedMemoryWriteResponse, RuntimeCoreError> {
        Err(unavailable("unifiedMemory/create"))
    }

    async fn update_unified_memory(
        &self,
        _params: UnifiedMemoryUpdateParams,
    ) -> Result<UnifiedMemoryWriteResponse, RuntimeCoreError> {
        Err(unavailable("unifiedMemory/update"))
    }

    async fn delete_unified_memory(
        &self,
        _params: UnifiedMemoryDeleteParams,
    ) -> Result<UnifiedMemoryDeleteResponse, RuntimeCoreError> {
        Err(unavailable("unifiedMemory/delete"))
    }

    async fn search_unified_memories(
        &self,
        _params: UnifiedMemorySearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        Err(unavailable("unifiedMemory/search"))
    }

    async fn read_unified_memory_stats(
        &self,
    ) -> Result<UnifiedMemoryStatsResponse, RuntimeCoreError> {
        Err(unavailable("unifiedMemory/stats"))
    }

    async fn analyze_unified_memories(
        &self,
        _params: UnifiedMemoryAnalyzeParams,
    ) -> Result<UnifiedMemoryAnalysisResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "unifiedMemory/analyze requires RuntimeCore memory extraction current implementation"
                .to_string(),
        ))
    }

    async fn semantic_search_unified_memories(
        &self,
        _params: UnifiedMemorySemanticSearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "unifiedMemory/semanticSearch requires current embedding provider integration"
                .to_string(),
        ))
    }

    async fn hybrid_search_unified_memories(
        &self,
        _params: UnifiedMemoryHybridSearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        Err(RuntimeCoreError::Backend(
            "unifiedMemory/hybridSearch requires current embedding provider integration"
                .to_string(),
        ))
    }
}

impl MemoryAppDataSource for NoopAppDataSource {}
