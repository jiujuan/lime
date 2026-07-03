use crate::AppDataSource;
use app_server_protocol::{
    MemoryStoreAddNoteParams, MemoryStoreAddNoteResponse, MemoryStoreListParams,
    MemoryStoreListResponse, MemoryStoreReadParams, MemoryStoreReadResponse,
    MemoryStoreSearchParams, MemoryStoreSearchResponse,
};
use async_trait::async_trait;
use lime_agent::native_tools::{
    create_memory_tools as create_agent_memory_tools, MemoryStoreGateway,
};
use lime_agent::runtime_facade::Tool;
use std::sync::Arc;

pub(crate) fn create_memory_tools(app_data_source: Arc<dyn AppDataSource>) -> Vec<Box<dyn Tool>> {
    create_agent_memory_tools(Arc::new(AppServerMemoryStoreGateway { app_data_source }))
}

struct AppServerMemoryStoreGateway {
    app_data_source: Arc<dyn AppDataSource>,
}

#[async_trait]
impl MemoryStoreGateway for AppServerMemoryStoreGateway {
    async fn list_memory_store(
        &self,
        params: MemoryStoreListParams,
    ) -> Result<MemoryStoreListResponse, String> {
        self.app_data_source
            .list_memory_store(params)
            .await
            .map_err(|error| error.to_string())
    }

    async fn read_memory_store(
        &self,
        params: MemoryStoreReadParams,
    ) -> Result<MemoryStoreReadResponse, String> {
        self.app_data_source
            .read_memory_store(params)
            .await
            .map_err(|error| error.to_string())
    }

    async fn search_memory_store(
        &self,
        params: MemoryStoreSearchParams,
    ) -> Result<MemoryStoreSearchResponse, String> {
        self.app_data_source
            .search_memory_store(params)
            .await
            .map_err(|error| error.to_string())
    }

    async fn add_memory_store_note(
        &self,
        params: MemoryStoreAddNoteParams,
    ) -> Result<MemoryStoreAddNoteResponse, String> {
        self.app_data_source
            .add_memory_store_note(params)
            .await
            .map_err(|error| error.to_string())
    }
}
