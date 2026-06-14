use super::super::*;
use async_trait::async_trait;

#[async_trait]
impl McpAppDataSource for LocalAppDataSource {
    async fn list_mcp_servers(&self) -> Result<McpServerListResponse, RuntimeCoreError> {
        mcp::list_mcp_servers(&self.db)
    }

    async fn list_mcp_servers_with_status(
        &self,
    ) -> Result<McpServerStatusListResponse, RuntimeCoreError> {
        mcp::list_mcp_servers_with_status(&self.db, &self.mcp_manager).await
    }

    async fn create_mcp_server(
        &self,
        params: McpServerCreateParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        mcp::create_mcp_server(&self.db, params)
    }

    async fn update_mcp_server(
        &self,
        params: McpServerUpdateParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        mcp::update_mcp_server(&self.db, params)
    }

    async fn delete_mcp_server(
        &self,
        params: McpServerDeleteParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        mcp::delete_mcp_server(&self.db, params)
    }

    async fn set_mcp_server_enabled(
        &self,
        params: McpServerEnabledSetParams,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        mcp::set_mcp_server_enabled(&self.db, params)
    }

    async fn import_mcp_servers_from_app(
        &self,
        params: McpServerImportFromAppParams,
    ) -> Result<McpServerImportFromAppResponse, RuntimeCoreError> {
        mcp::import_mcp_servers_from_app(&self.db, params)
    }

    async fn sync_all_mcp_servers_to_live(
        &self,
    ) -> Result<McpServerListResponse, RuntimeCoreError> {
        mcp::sync_all_mcp_servers_to_live(&self.db)
    }

    async fn start_mcp_server(
        &self,
        params: McpServerStartParams,
    ) -> Result<McpServerLifecycleResponse, RuntimeCoreError> {
        mcp::start_mcp_server(&self.db, &self.mcp_manager, params).await
    }

    async fn stop_mcp_server(
        &self,
        params: McpServerStopParams,
    ) -> Result<McpServerLifecycleResponse, RuntimeCoreError> {
        mcp::stop_mcp_server(&self.mcp_manager, params).await
    }

    async fn list_mcp_tools(&self) -> Result<McpToolListResponse, RuntimeCoreError> {
        mcp::list_mcp_tools(&self.mcp_manager).await
    }

    async fn list_mcp_tools_for_context(
        &self,
        params: McpToolListForContextParams,
    ) -> Result<McpToolListResponse, RuntimeCoreError> {
        mcp::list_mcp_tools_for_context(&self.mcp_manager, params).await
    }

    async fn search_mcp_tools(
        &self,
        params: McpToolSearchParams,
    ) -> Result<McpToolListResponse, RuntimeCoreError> {
        mcp::search_mcp_tools(&self.mcp_manager, params).await
    }

    async fn call_mcp_tool(
        &self,
        params: McpToolCallParams,
    ) -> Result<McpToolCallResponse, RuntimeCoreError> {
        mcp::call_mcp_tool(&self.mcp_manager, params).await
    }

    async fn call_mcp_tool_with_caller(
        &self,
        params: McpToolCallWithCallerParams,
    ) -> Result<McpToolCallResponse, RuntimeCoreError> {
        mcp::call_mcp_tool_with_caller(&self.mcp_manager, params).await
    }

    async fn list_mcp_prompts(&self) -> Result<McpPromptListResponse, RuntimeCoreError> {
        mcp::list_mcp_prompts(&self.mcp_manager).await
    }

    async fn get_mcp_prompt(
        &self,
        params: McpPromptGetParams,
    ) -> Result<McpPromptGetResponse, RuntimeCoreError> {
        mcp::get_mcp_prompt(&self.mcp_manager, params).await
    }

    async fn list_mcp_resources(&self) -> Result<McpResourceListResponse, RuntimeCoreError> {
        mcp::list_mcp_resources(&self.mcp_manager).await
    }

    async fn read_mcp_resource(
        &self,
        params: McpResourceReadParams,
    ) -> Result<McpResourceReadResponse, RuntimeCoreError> {
        mcp::read_mcp_resource(&self.mcp_manager, params).await
    }
}
