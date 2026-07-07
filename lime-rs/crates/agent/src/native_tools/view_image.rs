use crate::native_tools::runtime_tool_bridge::execute_runtime_tool;
use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolOptions, ToolResult};
use async_trait::async_trait;
use serde_json::Value;
use tool_runtime::native_dispatch::runtime_native_dispatch_handle;
use tool_runtime::view_image::{
    check_runtime_view_image_permissions, view_image_tool_definition, VIEW_IMAGE_LEGACY_ALIASES,
    VIEW_IMAGE_TOOL_NAME,
};

pub(crate) fn create_view_image_tool() -> Box<dyn Tool> {
    Box::new(ImageViewAdapter)
}

#[derive(Debug, Default)]
struct ImageViewAdapter;

#[async_trait]
impl Tool for ImageViewAdapter {
    fn name(&self) -> &str {
        VIEW_IMAGE_TOOL_NAME
    }

    fn description(&self) -> &str {
        "View a local image file from the filesystem when visual inspection is needed."
    }

    fn input_schema(&self) -> Value {
        view_image_tool_definition().input_schema
    }

    fn aliases(&self) -> &'static [&'static str] {
        VIEW_IMAGE_LEGACY_ALIASES
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        execute_runtime_tool(
            runtime_native_dispatch_handle(),
            VIEW_IMAGE_TOOL_NAME,
            &params,
            context,
            None,
        )
        .await
    }

    async fn check_permissions(
        &self,
        params: &Value,
        context: &ToolContext,
    ) -> PermissionCheckResult {
        match check_runtime_view_image_permissions(params, &context.working_directory) {
            Ok(()) => PermissionCheckResult::allow(),
            Err(error) => PermissionCheckResult::deny(error.message().to_string()),
        }
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new().with_max_retries(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    const PNG_BYTES: &[u8] = &[
        0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n', 0, 0, 0, 13, b'I', b'H', b'D', b'R', 0,
        0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0,
    ];

    #[tokio::test]
    async fn view_image_permission_delegates_to_current_runtime_rules() {
        let result = ImageViewAdapter
            .check_permissions(
                &json!({
                    "path": "sample.png",
                    "detail": "low"
                }),
                &ToolContext::default(),
            )
            .await;

        assert!(result.is_denied());
    }

    #[tokio::test]
    async fn view_image_tool_delegates_to_current_executor() {
        let dir = tempdir().expect("tempdir");
        std::fs::write(dir.path().join("sample.png"), PNG_BYTES).expect("write image");
        let result = ImageViewAdapter
            .execute(
                json!({ "path": "sample.png" }),
                &ToolContext::new(dir.path().to_path_buf()).with_session_id("session-image-1"),
            )
            .await
            .expect("view_image tool should execute");

        assert!(result.success);
        assert_eq!(
            result.metadata.get("tool_family"),
            Some(&json!("view_image"))
        );
        assert_eq!(
            result.metadata.get("model_visible_image"),
            Some(&json!(true))
        );
    }
}
