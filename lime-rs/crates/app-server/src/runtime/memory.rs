use super::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::*;

impl RuntimeCore {
    pub async fn read_project_memory(
        &self,
        params: ProjectMemoryReadParams,
    ) -> Result<ProjectMemoryReadResponse, RuntimeCoreError> {
        self.app_data_source.read_project_memory(params).await
    }

    pub async fn list_unified_memories(
        &self,
        params: UnifiedMemoryListParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        self.app_data_source.list_unified_memories(params).await
    }

    pub async fn get_unified_memory(
        &self,
        params: UnifiedMemoryGetParams,
    ) -> Result<UnifiedMemoryGetResponse, RuntimeCoreError> {
        self.app_data_source.get_unified_memory(params).await
    }

    pub async fn create_unified_memory(
        &self,
        params: UnifiedMemoryCreateParams,
    ) -> Result<UnifiedMemoryWriteResponse, RuntimeCoreError> {
        self.app_data_source.create_unified_memory(params).await
    }

    pub async fn update_unified_memory(
        &self,
        params: UnifiedMemoryUpdateParams,
    ) -> Result<UnifiedMemoryWriteResponse, RuntimeCoreError> {
        self.app_data_source.update_unified_memory(params).await
    }

    pub async fn delete_unified_memory(
        &self,
        params: UnifiedMemoryDeleteParams,
    ) -> Result<UnifiedMemoryDeleteResponse, RuntimeCoreError> {
        self.app_data_source.delete_unified_memory(params).await
    }

    pub async fn search_unified_memories(
        &self,
        params: UnifiedMemorySearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        self.app_data_source.search_unified_memories(params).await
    }

    pub async fn read_unified_memory_stats(
        &self,
    ) -> Result<UnifiedMemoryStatsResponse, RuntimeCoreError> {
        self.app_data_source.read_unified_memory_stats().await
    }

    pub async fn analyze_unified_memories(
        &self,
        params: UnifiedMemoryAnalyzeParams,
    ) -> Result<UnifiedMemoryAnalysisResponse, RuntimeCoreError> {
        self.app_data_source.analyze_unified_memories(params).await
    }

    pub async fn semantic_search_unified_memories(
        &self,
        params: UnifiedMemorySemanticSearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        self.app_data_source
            .semantic_search_unified_memories(params)
            .await
    }

    pub async fn hybrid_search_unified_memories(
        &self,
        params: UnifiedMemoryHybridSearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        self.app_data_source
            .hybrid_search_unified_memories(params)
            .await
    }
}
