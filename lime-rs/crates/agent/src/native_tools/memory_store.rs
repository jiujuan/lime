use crate::native_tools::runtime_tool_bridge::RuntimeDefinitionToolAdapter;
use aster::tools::{PermissionCheckResult, Tool, ToolContext};
use serde_json::Value;
use std::sync::Arc;
use tool_runtime::memory_store::{
    check_runtime_memory_store_permissions, memory_store_tool_definitions, MemoryStoreGateway,
};
use tool_runtime::native_dispatch::NativeDispatch;
use tool_runtime::tool_executor::RuntimeToolExecutorHandle;

pub(crate) fn create_memory_tools(gateway: Arc<dyn MemoryStoreGateway>) -> Vec<Box<dyn Tool>> {
    let executor = RuntimeToolExecutorHandle::new(Arc::new(
        NativeDispatch::builder()
            .with_memory_store_gateway(gateway)
            .build(),
    ));
    memory_store_tool_definitions()
        .into_iter()
        .map(|definition| {
            Box::new(
                RuntimeDefinitionToolAdapter::new(
                    definition,
                    executor.clone(),
                    check_memory_store_permissions,
                )
                .with_max_retries(0),
            ) as Box<dyn Tool>
        })
        .collect()
}

fn check_memory_store_permissions(
    tool_name: &str,
    params: &Value,
    context: &ToolContext,
) -> PermissionCheckResult {
    match check_runtime_memory_store_permissions(tool_name, params, &context.working_directory) {
        Ok(()) => PermissionCheckResult::allow(),
        Err(error) => PermissionCheckResult::deny(error.message().to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::{
        MemoryStoreAddNoteParams, MemoryStoreAddNoteResponse, MemoryStoreCitation,
        MemoryStoreListParams, MemoryStoreListResponse, MemoryStoreReadParams,
        MemoryStoreReadResponse, MemoryStoreSearchParams, MemoryStoreSearchResponse,
    };
    use async_trait::async_trait;
    use serde_json::json;
    use tempfile::tempdir;

    fn context(path: std::path::PathBuf) -> ToolContext {
        ToolContext::new(path).with_session_id("test-session")
    }

    #[derive(Default)]
    struct FakeMemoryStoreGateway;

    #[async_trait]
    impl MemoryStoreGateway for FakeMemoryStoreGateway {
        async fn list_memory_store(
            &self,
            params: MemoryStoreListParams,
        ) -> Result<MemoryStoreListResponse, String> {
            Ok(MemoryStoreListResponse {
                root_scope: params.root.scope,
                path: params.path.unwrap_or_default(),
                entries: Vec::new(),
                truncated: false,
                next_cursor: None,
            })
        }

        async fn read_memory_store(
            &self,
            params: MemoryStoreReadParams,
        ) -> Result<MemoryStoreReadResponse, String> {
            Ok(MemoryStoreReadResponse {
                path: params.path,
                start_line_number: 1,
                content: "remember this".to_string(),
                truncated: false,
                citation: MemoryStoreCitation {
                    path: "MEMORY.md".to_string(),
                    start_line_number: 1,
                    end_line_number: 1,
                },
            })
        }

        async fn search_memory_store(
            &self,
            _params: MemoryStoreSearchParams,
        ) -> Result<MemoryStoreSearchResponse, String> {
            Ok(MemoryStoreSearchResponse {
                hits: Vec::new(),
                truncated: false,
                next_cursor: None,
            })
        }

        async fn add_memory_store_note(
            &self,
            _params: MemoryStoreAddNoteParams,
        ) -> Result<MemoryStoreAddNoteResponse, String> {
            Ok(MemoryStoreAddNoteResponse {
                path: "extensions/ad_hoc/notes/note.md".to_string(),
                citation: MemoryStoreCitation {
                    path: "extensions/ad_hoc/notes/note.md".to_string(),
                    start_line_number: 1,
                    end_line_number: 1,
                },
            })
        }
    }

    #[tokio::test]
    async fn read_permission_delegates_to_runtime_rules() {
        let dir = tempdir().expect("tempdir");
        let tool = create_memory_tools(Arc::new(FakeMemoryStoreGateway))
            .into_iter()
            .find(|tool| tool.name() == tool_runtime::memory_store::MEMORY_READ_TOOL_NAME)
            .expect("memory_read tool");
        let result = tool
            .check_permissions(
                &json!({
                    "path": "../MEMORY.md"
                }),
                &context(dir.path().to_path_buf()),
            )
            .await;

        assert!(result.is_denied());
    }

    #[tokio::test]
    async fn read_execution_delegates_to_runtime_executor() {
        let dir = tempdir().expect("tempdir");
        let tool = create_memory_tools(Arc::new(FakeMemoryStoreGateway))
            .into_iter()
            .find(|tool| tool.name() == tool_runtime::memory_store::MEMORY_READ_TOOL_NAME)
            .expect("memory_read tool");
        let result = tool
            .execute(
                json!({
                    "path": "MEMORY.md"
                }),
                &context(dir.path().to_path_buf()),
            )
            .await
            .expect("tool result");

        assert!(result.success);
        assert_eq!(result.output.as_deref(), Some("remember this"));
        assert_eq!(result.metadata["operation"], json!("read"));
    }
}
