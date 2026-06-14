use super::super::*;
use async_trait::async_trait;

#[async_trait]
impl MemoryAppDataSource for LocalAppDataSource {
    async fn read_project_memory(
        &self,
        params: ProjectMemoryReadParams,
    ) -> Result<ProjectMemoryReadResponse, RuntimeCoreError> {
        let memory = lime_core::memory::read_project_memory(self.db.clone(), &params.project_id)
            .map_err(data_error)?;
        Ok(ProjectMemoryReadResponse {
            memory: serde_json::to_value(memory).map_err(data_error)?,
        })
    }

    async fn list_unified_memories(
        &self,
        params: UnifiedMemoryListParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        unified_memory::list_unified_memories(&self.db, params).map_err(data_error)
    }

    async fn get_unified_memory(
        &self,
        params: UnifiedMemoryGetParams,
    ) -> Result<UnifiedMemoryGetResponse, RuntimeCoreError> {
        unified_memory::get_unified_memory(&self.db, params).map_err(data_error)
    }

    async fn create_unified_memory(
        &self,
        params: UnifiedMemoryCreateParams,
    ) -> Result<UnifiedMemoryWriteResponse, RuntimeCoreError> {
        unified_memory::create_unified_memory(&self.db, params).map_err(data_error)
    }

    async fn update_unified_memory(
        &self,
        params: UnifiedMemoryUpdateParams,
    ) -> Result<UnifiedMemoryWriteResponse, RuntimeCoreError> {
        unified_memory::update_unified_memory(&self.db, params).map_err(data_error)
    }

    async fn delete_unified_memory(
        &self,
        params: UnifiedMemoryDeleteParams,
    ) -> Result<UnifiedMemoryDeleteResponse, RuntimeCoreError> {
        unified_memory::delete_unified_memory(&self.db, params).map_err(data_error)
    }

    async fn search_unified_memories(
        &self,
        params: UnifiedMemorySearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        unified_memory::search_unified_memories(&self.db, params).map_err(data_error)
    }

    async fn read_unified_memory_stats(
        &self,
    ) -> Result<UnifiedMemoryStatsResponse, RuntimeCoreError> {
        unified_memory::read_unified_memory_stats(&self.db).map_err(data_error)
    }

    async fn analyze_unified_memories(
        &self,
        params: UnifiedMemoryAnalyzeParams,
    ) -> Result<UnifiedMemoryAnalysisResponse, RuntimeCoreError> {
        unified_memory::analyze_unified_memories(params).map_err(data_error)
    }

    async fn semantic_search_unified_memories(
        &self,
        params: UnifiedMemorySemanticSearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        unified_memory::semantic_search_unified_memories(params).map_err(data_error)
    }

    async fn hybrid_search_unified_memories(
        &self,
        params: UnifiedMemoryHybridSearchParams,
    ) -> Result<UnifiedMemoryListResponse, RuntimeCoreError> {
        unified_memory::hybrid_search_unified_memories(params).map_err(data_error)
    }
}
