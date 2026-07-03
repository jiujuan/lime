use crate::AppDataSource;
use app_server_protocol::{MediaTaskArtifactImageCreateParams, MediaTaskArtifactResponse};
use async_trait::async_trait;
use lime_agent::native_tools::{
    create_image_tools as create_agent_image_tools, image_tool_result_from_response,
    ImageTaskGateway,
};
use lime_agent::runtime_facade::{Tool, ToolResult};
use std::sync::Arc;

pub(crate) fn create_image_tools(app_data_source: Arc<dyn AppDataSource>) -> Vec<Box<dyn Tool>> {
    create_agent_image_tools(Arc::new(AppServerImageTaskGateway { app_data_source }))
}

pub(super) fn tool_result_from_response(response: MediaTaskArtifactResponse) -> ToolResult {
    image_tool_result_from_response(response)
}

struct AppServerImageTaskGateway {
    app_data_source: Arc<dyn AppDataSource>,
}

#[async_trait]
impl ImageTaskGateway for AppServerImageTaskGateway {
    async fn create_image_media_task_artifact(
        &self,
        params: MediaTaskArtifactImageCreateParams,
    ) -> Result<MediaTaskArtifactResponse, String> {
        self.app_data_source
            .create_image_media_task_artifact(params)
            .await
            .map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::RuntimeCoreError;
    use crate::WorkspaceSkillBindingAppDataSource;
    use crate::{AutomationManagementAppDataSource, PluginDataSource};
    use crate::{AutomationOverviewAppDataSource, ConnectAppDataSource, DiagnosticsAppDataSource};
    use crate::{GatewayAppDataSource, KnowledgeAppDataSource, McpAppDataSource};
    use crate::{MediaAppDataSource, MemoryAppDataSource, ModelProviderAppDataSource};
    use crate::{RightSurfaceAppDataSource, SessionAppDataSource, SkillAppDataSource};
    use crate::{UsageStatsAppDataSource, VoiceAppDataSource, WorkspaceAppDataSource};
    use app_server_protocol::{MediaTaskArtifactImageCreateParams, MediaTaskArtifactResponse};
    use async_trait::async_trait;
    use lime_agent::runtime_facade::ToolContext;
    use serde_json::{json, Value};
    use tempfile::TempDir;

    #[derive(Default)]
    struct ImageToolTestDataSource;

    impl SessionAppDataSource for ImageToolTestDataSource {}
    impl WorkspaceAppDataSource for ImageToolTestDataSource {}
    impl SkillAppDataSource for ImageToolTestDataSource {}
    impl WorkspaceSkillBindingAppDataSource for ImageToolTestDataSource {}
    impl GatewayAppDataSource for ImageToolTestDataSource {}
    impl VoiceAppDataSource for ImageToolTestDataSource {}
    impl PluginDataSource for ImageToolTestDataSource {}
    impl KnowledgeAppDataSource for ImageToolTestDataSource {}
    impl AutomationOverviewAppDataSource for ImageToolTestDataSource {}
    impl McpAppDataSource for ImageToolTestDataSource {}
    impl AutomationManagementAppDataSource for ImageToolTestDataSource {}
    impl MemoryAppDataSource for ImageToolTestDataSource {}
    impl DiagnosticsAppDataSource for ImageToolTestDataSource {}
    impl UsageStatsAppDataSource for ImageToolTestDataSource {}
    impl ModelProviderAppDataSource for ImageToolTestDataSource {}
    impl ConnectAppDataSource for ImageToolTestDataSource {}
    impl RightSurfaceAppDataSource for ImageToolTestDataSource {}

    #[async_trait]
    impl MediaAppDataSource for ImageToolTestDataSource {
        async fn create_image_media_task_artifact(
            &self,
            params: MediaTaskArtifactImageCreateParams,
        ) -> Result<MediaTaskArtifactResponse, RuntimeCoreError> {
            crate::media_task::create_image_generation_task_artifact(params, None)
                .map_err(RuntimeCoreError::Backend)
        }
    }

    #[tokio::test]
    async fn image_tool_creates_standard_image_task_artifact() {
        let workspace = TempDir::new().expect("workspace");
        let mut tools = create_image_tools(Arc::new(ImageToolTestDataSource));
        let tool = tools.pop().expect("image tool");
        let result = tool
            .execute(
                json!({
                    "project_root_path": workspace.path().to_string_lossy(),
                    "prompt": "生成一张青柠实验室封面",
                    "provider_id": "openai",
                    "model": "gpt-image-2",
                    "executor_mode": "images_api",
                    "session_id": "session-image-1",
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
                &ToolContext::new(workspace.path().to_path_buf()),
            )
            .await
            .expect("image tool should create task artifact");

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

        let record = result.metadata.get("record").expect("record metadata");
        assert_eq!(record["task_type"].as_str(), Some("image_generate"));
        let payload = &record["payload"];
        assert_eq!(payload["provider_id"].as_str(), Some("openai"));
        assert_eq!(payload["model"].as_str(), Some("gpt-image-2"));
        assert_eq!(payload["executor_mode"].as_str(), Some("images_api"));
        assert_eq!(payload["entry_source"].as_str(), Some("at_image_command"));
        assert_eq!(
            payload["modality_contract_key"].as_str(),
            Some("image_generation")
        );
        assert_eq!(
            payload["routing_slot"].as_str(),
            Some("image_generation_model")
        );
        assert_eq!(payload["usage"].as_str(), Some("document-inline"));
        assert_eq!(payload["slot_id"].as_str(), Some("document-image-slot-1"));
        assert_eq!(payload["anchor_section_title"].as_str(), Some("产品愿景"));
        assert_eq!(payload["anchor_text"].as_str(), Some("给这一段生成配图"));
        assert_eq!(
            payload["model_task_request"]["taskKind"].as_str(),
            Some("image_generate")
        );
        assert_eq!(
            payload["runtime_contract"]["contract_key"].as_str(),
            Some("image_generation")
        );

        let absolute_artifact_path = workspace.path().join(artifact_path);
        assert!(
            absolute_artifact_path.exists(),
            "standard image task artifact should exist at {}",
            absolute_artifact_path.display()
        );
    }
}
