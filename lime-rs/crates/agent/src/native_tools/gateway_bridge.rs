use crate::native_tools::runtime_tool_bridge::{
    RuntimeDefinitionPermissionCheck, RuntimeDefinitionToolAdapter,
    RuntimeNativeTurnContextProvider,
};
use crate::native_tools::NativeRegistration;
use crate::runtime_facade::current_agent_turn_context;
use aster::ToolContext;
use aster::{current_action_scope, current_session_id};
use serde_json::{json, Value};
use std::sync::Arc;
use tool_runtime::image_task::ImageTaskGateway;
use tool_runtime::mcp_resource::McpResourceGateway;
use tool_runtime::memory_store::MemoryStoreGateway;
use tool_runtime::native_dispatch::NativeDispatch;
use tool_runtime::native_overlay::{
    check_runtime_gateway_tool_permissions, RuntimeNativePermissionDecision,
};
use tool_runtime::tool_executor::{RuntimeToolExecutorHandle, RuntimeToolTurnContext};
use tool_runtime::tool_search::ToolSearchGateway;

pub(crate) fn create_memory_tools(gateway: Arc<dyn MemoryStoreGateway>) -> Vec<NativeRegistration> {
    create_gateway_tools(
        NativeDispatch::builder()
            .with_memory_store_gateway(gateway)
            .build(),
        check_gateway_tool_permissions,
        None,
    )
}

pub(crate) fn create_image_tools(gateway: Arc<dyn ImageTaskGateway>) -> Vec<NativeRegistration> {
    create_gateway_tools(
        NativeDispatch::builder()
            .with_image_task_gateway(gateway)
            .build(),
        check_gateway_tool_permissions,
        Some(runtime_turn_context_from_aster),
    )
}

pub(crate) fn create_tool_search_tools(
    gateway: Arc<dyn ToolSearchGateway>,
) -> Vec<NativeRegistration> {
    create_gateway_tools(
        NativeDispatch::builder()
            .with_tool_search_gateway(gateway)
            .build(),
        check_gateway_tool_permissions,
        None,
    )
}

pub(crate) fn create_mcp_resource_tools(
    gateway: Arc<dyn McpResourceGateway>,
) -> Vec<NativeRegistration> {
    create_gateway_tools(
        NativeDispatch::builder()
            .with_mcp_resource_gateway(gateway)
            .build(),
        check_gateway_tool_permissions,
        None,
    )
}

fn create_gateway_tools(
    dispatch: NativeDispatch,
    permission_check: RuntimeDefinitionPermissionCheck,
    turn_context_provider: Option<RuntimeNativeTurnContextProvider>,
) -> Vec<NativeRegistration> {
    let surfaces = dispatch.surfaces();
    let executor = RuntimeToolExecutorHandle::new(Arc::new(dispatch));

    surfaces
        .into_iter()
        .map(|surface| {
            let definition = surface.definition();
            let adapter = RuntimeDefinitionToolAdapter::new(
                definition.clone(),
                executor.clone(),
                permission_check,
            )
            .with_aliases(surface.aliases())
            .with_max_retries(0);
            let adapter = match turn_context_provider {
                Some(provider) => adapter.with_turn_context_provider(provider),
                None => adapter,
            };
            NativeRegistration::new(definition, Box::new(adapter))
        })
        .collect()
}

fn check_gateway_tool_permissions(
    tool_name: &str,
    params: &Value,
    context: &ToolContext,
) -> RuntimeNativePermissionDecision {
    let turn_context = runtime_turn_context_from_aster();
    check_runtime_gateway_tool_permissions(
        tool_name,
        params,
        &context.working_directory,
        &context.session_id,
        turn_context.as_ref(),
    )
}

fn runtime_turn_context_from_aster() -> Option<RuntimeToolTurnContext> {
    let mut turn_context = current_agent_turn_context();
    let had_turn_context = turn_context.is_some();
    let context = turn_context.get_or_insert_with(RuntimeToolTurnContext::default);

    if let Some(session_id) = current_session_id() {
        insert_identity_if_absent(&mut context.metadata, "session_id", session_id);
    }
    if let Some(scope) = current_action_scope() {
        if let Some(session_id) = scope.session_id {
            insert_identity_if_absent(&mut context.metadata, "session_id", session_id);
        }
        if let Some(thread_id) = scope.thread_id {
            insert_identity_if_absent(&mut context.metadata, "thread_id", thread_id);
        }
        if let Some(turn_id) = scope.turn_id {
            insert_identity_if_absent(&mut context.metadata, "turn_id", turn_id);
        }
    }

    if had_turn_context || !context.metadata.is_empty() {
        turn_context
    } else {
        None
    }
}

fn insert_identity_if_absent(
    metadata: &mut std::collections::HashMap<String, Value>,
    key: &str,
    value: String,
) {
    if value.trim().is_empty() {
        return;
    }
    metadata
        .entry(key.to_string())
        .or_insert_with(|| json!(value.trim()));
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::{
        McpToolListResponse, McpToolSearchParams, MediaTaskArtifactImageCreateParams,
        MediaTaskArtifactResponse, MemoryStoreAddNoteParams, MemoryStoreAddNoteResponse,
        MemoryStoreCitation, MemoryStoreListParams, MemoryStoreListResponse, MemoryStoreReadParams,
        MemoryStoreReadResponse, MemoryStoreSearchParams, MemoryStoreSearchResponse,
    };
    use async_trait::async_trait;
    use serde_json::json;
    use tempfile::{tempdir, TempDir};
    use tokio::sync::Mutex;

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

    #[derive(Default)]
    struct ImageToolTestGateway {
        last_params: Mutex<Option<MediaTaskArtifactImageCreateParams>>,
    }

    #[async_trait]
    impl ImageTaskGateway for ImageToolTestGateway {
        async fn create_image_media_task_artifact(
            &self,
            params: MediaTaskArtifactImageCreateParams,
        ) -> Result<MediaTaskArtifactResponse, String> {
            *self.last_params.lock().await = Some(params.clone());
            Ok(MediaTaskArtifactResponse {
                success: true,
                task_id: "task-image-1".to_string(),
                task_type: "image_generate".to_string(),
                task_family: "image".to_string(),
                status: "pending".to_string(),
                normalized_status: "pending".to_string(),
                artifact_path: ".lime/tasks/image_generate/task-image-1.json".to_string(),
                record: json!({
                    "task_type": "image_generate",
                    "payload": {
                        "provider_id": params.provider_id,
                        "model": params.model,
                        "executor_mode": params.executor_mode,
                        "entry_source": params.entry_source,
                        "modality_contract_key": params.modality_contract_key,
                        "routing_slot": params.routing_slot,
                        "usage": params.usage,
                        "slot_id": params.slot_id,
                        "anchor_section_title": params.anchor_section_title,
                        "anchor_text": params.anchor_text,
                        "model_task_request": {
                            "taskKind": "image_generate"
                        },
                        "runtime_contract": params.runtime_contract,
                    }
                }),
                ..MediaTaskArtifactResponse::default()
            })
        }
    }

    #[derive(Default)]
    struct FakeToolSearchGateway {
        last_params: Mutex<Option<McpToolSearchParams>>,
    }

    #[async_trait]
    impl ToolSearchGateway for FakeToolSearchGateway {
        async fn search_tools(
            &self,
            params: McpToolSearchParams,
        ) -> Result<McpToolListResponse, String> {
            *self.last_params.lock().await = Some(params);
            Ok(McpToolListResponse {
                tools: vec![json!({
                    "name": "mcp__browser__click",
                    "description": "Click an element",
                    "source": "extension",
                    "status": "deferred"
                })],
            })
        }
    }

    #[tokio::test]
    async fn memory_read_delegates_to_runtime_permissions_and_executor() {
        let dir = tempdir().expect("tempdir");
        let tool = create_memory_tools(Arc::new(FakeMemoryStoreGateway))
            .into_iter()
            .find(|registration| {
                registration.name() == tool_runtime::memory_store::MEMORY_READ_TOOL_NAME
            })
            .expect("memory_read tool")
            .into_tool();

        let denied = tool
            .check_permissions(
                &json!({
                    "path": "../MEMORY.md"
                }),
                &context(dir.path().to_path_buf()),
            )
            .await;
        let result = tool
            .execute(
                json!({
                    "path": "MEMORY.md"
                }),
                &context(dir.path().to_path_buf()),
            )
            .await
            .expect("tool result");

        assert!(denied.is_denied());
        assert!(result.success);
        assert_eq!(result.output.as_deref(), Some("remember this"));
        assert_eq!(result.metadata["operation"], json!("read"));
    }

    #[tokio::test]
    async fn image_task_delegates_to_runtime_permissions_and_executor() {
        let workspace = TempDir::new().expect("workspace");
        let gateway = Arc::new(ImageToolTestGateway::default());
        let tool = create_image_tools(gateway.clone())
            .into_iter()
            .next()
            .expect("image tool")
            .into_tool();

        let denied = tool
            .check_permissions(
                &json!({
                    "project_root_path": workspace.path().to_string_lossy(),
                    "prompt": "生成分镜",
                    "layout_hint": "storyboard_3x3",
                    "thread_id": "thread-image-1",
                    "turn_id": "turn-image-1"
                }),
                &context(workspace.path().to_path_buf()),
            )
            .await;
        let result = tool
            .execute(
                json!({
                    "project_root_path": workspace.path().to_string_lossy(),
                    "prompt": "生成一张青柠实验室封面",
                    "provider_id": "openai",
                    "model": "gpt-image-2",
                    "executor_mode": "images_api",
                    "thread_id": "thread-image-1",
                    "turn_id": "turn-image-1",
                    "content_id": "content-image-1",
                    "entry_source": "at_image_command",
                    "modality_contract_key": "image_generation",
                    "modality": "image",
                    "routing_slot": "image_generation_model",
                    "runtime_contract": {
                        "contract_key": "image_generation",
                        "routing_slot": "image_generation_model"
                    },
                    "usage": "document-inline",
                    "slot_id": "document-image-slot-1",
                    "anchor_section_title": "产品愿景",
                    "anchor_text": "给这一段生成配图"
                }),
                &context(workspace.path().to_path_buf()),
            )
            .await
            .expect("image tool should call gateway");

        assert!(denied.is_denied());
        assert!(result.success);
        assert_eq!(
            result.metadata.get("task_type"),
            Some(&json!("image_generate"))
        );
        let params = gateway
            .last_params
            .lock()
            .await
            .clone()
            .expect("gateway params");
        assert_eq!(params.session_id.as_deref(), Some("test-session"));
        assert_eq!(params.thread_id.as_deref(), Some("thread-image-1"));
        assert_eq!(params.turn_id.as_deref(), Some("turn-image-1"));
    }

    #[tokio::test]
    async fn tool_search_delegates_to_runtime_executor() {
        let dir = tempdir().expect("tempdir");
        let gateway = Arc::new(FakeToolSearchGateway::default());
        let tool = create_tool_search_tools(gateway.clone())
            .into_iter()
            .next()
            .expect("tool search")
            .into_tool();

        let result = tool
            .execute(
                json!({ "query": "browser click", "max_results": 3 }),
                &context(dir.path().to_path_buf()),
            )
            .await
            .expect("tool result");

        assert!(result.success);
        assert_eq!(result.metadata["tool_search_result_count"], json!(1));
        let output: Value = serde_json::from_str(result.output.as_deref().unwrap()).unwrap();
        assert_eq!(output["matches"], json!(["mcp__browser__click"]));

        let params = gateway
            .last_params
            .lock()
            .await
            .clone()
            .expect("gateway params");
        assert_eq!(params.query, "browser click");
        assert_eq!(params.limit, 3);
        assert_eq!(params.caller.as_deref(), Some("tool_search"));
    }
}
