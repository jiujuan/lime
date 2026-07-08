use crate::native_tools::runtime_tool_bridge::RuntimeNativeToolAdapter;
use aster::tools::{PermissionCheckResult, Tool, ToolContext};
use serde_json::Value;
use tool_runtime::native_overlay::RuntimeNativeToolOverlay;
use tool_runtime::view_image::{check_runtime_view_image_permissions, VIEW_IMAGE_TOOL_NAME};

pub(crate) fn create_view_image_tool() -> Box<dyn Tool> {
    debug_assert_eq!(
        RuntimeNativeToolOverlay::ViewImage.name(),
        VIEW_IMAGE_TOOL_NAME
    );
    Box::new(RuntimeNativeToolAdapter::new(
        RuntimeNativeToolOverlay::ViewImage,
        check_view_image_permissions,
    ))
}

fn check_view_image_permissions(params: &Value, context: &ToolContext) -> PermissionCheckResult {
    match check_runtime_view_image_permissions(params, &context.working_directory) {
        Ok(()) => PermissionCheckResult::allow(),
        Err(error) => PermissionCheckResult::deny(error.message().to_string()),
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
        let tool = create_view_image_tool();
        let result = tool
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
        let tool = create_view_image_tool();
        let result = tool
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
