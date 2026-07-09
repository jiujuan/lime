use crate::AppDataSource;
use app_server_protocol::{McpToolListResponse, McpToolSearchParams};
use async_trait::async_trait;
use std::sync::Arc;
use tool_runtime::tool_search::ToolSearchGateway;

pub(crate) fn tool_search_gateway(
    app_data_source: Arc<dyn AppDataSource>,
) -> Arc<dyn ToolSearchGateway> {
    Arc::new(AppServerToolSearchGateway { app_data_source })
}

struct AppServerToolSearchGateway {
    app_data_source: Arc<dyn AppDataSource>,
}

#[async_trait]
impl ToolSearchGateway for AppServerToolSearchGateway {
    async fn search_tools(
        &self,
        params: McpToolSearchParams,
    ) -> Result<McpToolListResponse, String> {
        self.app_data_source
            .search_mcp_tools(params)
            .await
            .map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::NoopAppDataSource;

    #[tokio::test]
    async fn tool_search_gateway_uses_app_data_source_mcp_search() {
        let gateway = tool_search_gateway(Arc::new(NoopAppDataSource));
        let response = gateway
            .search_tools(McpToolSearchParams {
                query: "browser".to_string(),
                caller: Some("tool_search".to_string()),
                limit: 5,
            })
            .await
            .expect("noop app data source returns empty search response");

        assert!(response.tools.is_empty());
    }
}
