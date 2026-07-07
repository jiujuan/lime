use crate::native_tools::runtime_tool_bridge::execute_runtime_tool;
use crate::runtime_facade::current_agent_turn_context;
use aster::session_context::{current_action_scope, current_session_id};
use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolOptions, ToolResult};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;
use tool_runtime::image_task::{
    check_runtime_image_task_permissions, image_task_tool_definition, ImageTaskGateway,
    IMAGE_TASK_TOOL_NAME,
};
use tool_runtime::native_dispatch::NativeDispatch;
use tool_runtime::tool_definition::RuntimeToolDefinition;
use tool_runtime::tool_executor::{RuntimeToolExecutorHandle, RuntimeToolTurnContext};

pub(crate) fn create_image_tools(gateway: Arc<dyn ImageTaskGateway>) -> Vec<Box<dyn Tool>> {
    let executor = RuntimeToolExecutorHandle::new(Arc::new(
        NativeDispatch::builder()
            .with_image_task_gateway(gateway)
            .build(),
    ));
    vec![Box::new(ImageTaskTool::new(
        image_task_tool_definition(),
        executor,
    ))]
}

struct ImageTaskTool {
    definition: RuntimeToolDefinition,
    executor: RuntimeToolExecutorHandle,
}

impl ImageTaskTool {
    fn new(definition: RuntimeToolDefinition, executor: RuntimeToolExecutorHandle) -> Self {
        Self {
            definition,
            executor,
        }
    }
}

#[async_trait]
impl Tool for ImageTaskTool {
    fn name(&self) -> &str {
        &self.definition.name
    }

    fn description(&self) -> &str {
        &self.definition.description
    }

    fn input_schema(&self) -> Value {
        self.definition.input_schema.clone()
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        let turn_context = runtime_turn_context_from_aster();
        execute_runtime_tool(
            self.executor.clone(),
            IMAGE_TASK_TOOL_NAME,
            &params,
            context,
            turn_context.as_ref(),
        )
        .await
    }

    async fn check_permissions(
        &self,
        params: &Value,
        context: &ToolContext,
    ) -> PermissionCheckResult {
        let turn_context = runtime_turn_context_from_aster();
        match check_runtime_image_task_permissions(
            params,
            &context.working_directory,
            &context.session_id,
            turn_context.as_ref(),
        ) {
            Ok(()) => PermissionCheckResult::allow(),
            Err(error) => PermissionCheckResult::deny(error.message().to_string()),
        }
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new().with_max_retries(0)
    }
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
    use app_server_protocol::{MediaTaskArtifactImageCreateParams, MediaTaskArtifactResponse};
    use async_trait::async_trait;
    use serde_json::json;
    use tempfile::TempDir;
    use tokio::sync::Mutex;

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

    fn context(path: std::path::PathBuf) -> ToolContext {
        ToolContext::new(path).with_session_id("session-image-1")
    }

    #[tokio::test]
    async fn image_tool_delegates_to_runtime_executor() {
        let workspace = TempDir::new().expect("workspace");
        let gateway = Arc::new(ImageToolTestGateway::default());
        let tool = create_image_tools(gateway.clone())
            .into_iter()
            .next()
            .expect("image tool");
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

        assert!(result.success);
        assert_eq!(
            result.metadata.get("task_type"),
            Some(&json!("image_generate"))
        );
        assert_eq!(result.metadata.get("task_family"), Some(&json!("image")));
        assert_eq!(
            result.metadata.get("normalized_status"),
            Some(&json!("pending"))
        );
        let artifact_path = result
            .metadata
            .get("artifact_path")
            .and_then(Value::as_str)
            .expect("artifact path");
        assert!(artifact_path.starts_with(".lime/tasks/image_generate/"));
        assert!(artifact_path.ends_with(".json"));

        let params = gateway
            .last_params
            .lock()
            .await
            .clone()
            .expect("gateway params");
        assert_eq!(params.session_id.as_deref(), Some("session-image-1"));
        assert_eq!(params.thread_id.as_deref(), Some("thread-image-1"));
        assert_eq!(params.turn_id.as_deref(), Some("turn-image-1"));
    }

    #[tokio::test]
    async fn image_tool_permission_delegates_to_runtime_rules() {
        let workspace = TempDir::new().expect("workspace");
        let tool = create_image_tools(Arc::new(ImageToolTestGateway::default()))
            .into_iter()
            .next()
            .expect("image tool");
        let result = tool
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

        assert!(result.is_denied());
    }
}
