use crate::native_tools::runtime_tool_bridge::RuntimeNativeToolAdapter;
use aster::tools::{PermissionCheckResult, Tool, ToolContext};
use serde_json::Value;
use tool_runtime::apply_patch::check_runtime_apply_patch_permissions;
pub use tool_runtime::apply_patch::APPLY_PATCH_TOOL_NAME;
use tool_runtime::native_overlay::RuntimeNativeToolOverlay;

pub(crate) fn create_apply_patch_tool() -> Box<dyn Tool> {
    debug_assert_eq!(
        RuntimeNativeToolOverlay::ApplyPatch.name(),
        APPLY_PATCH_TOOL_NAME
    );
    Box::new(RuntimeNativeToolAdapter::new(
        RuntimeNativeToolOverlay::ApplyPatch,
        check_apply_patch_permissions,
    ))
}

fn check_apply_patch_permissions(params: &Value, context: &ToolContext) -> PermissionCheckResult {
    match check_runtime_apply_patch_permissions(params, &context.working_directory) {
        Ok(()) => PermissionCheckResult::allow(),
        Err(error) => PermissionCheckResult::deny(error.message().to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::tempdir;

    fn context(path: PathBuf) -> ToolContext {
        ToolContext::new(path).with_session_id("test-session")
    }

    #[tokio::test]
    async fn applies_patch_inside_workspace() {
        let dir = tempdir().unwrap();
        let tool = create_apply_patch_tool();
        let result = tool
            .execute(
                json!({
                    "patch": "*** Begin Patch\n*** Add File: notes/live.md\n+hello\n*** End Patch"
                }),
                &context(dir.path().to_path_buf()),
            )
            .await
            .unwrap();

        assert!(result.success);
        assert_eq!(
            fs::read_to_string(dir.path().join("notes/live.md")).unwrap(),
            "hello\n"
        );
        assert_eq!(
            result.metadata.get("path").and_then(Value::as_str),
            Some("notes/live.md")
        );
        let file_change = result
            .metadata
            .get("file_change")
            .expect("file_change metadata");
        assert_eq!(file_change["path"].as_str(), Some("notes/live.md"));
        assert_eq!(file_change["kind"].as_str(), Some("add"));
        assert!(file_change["checkpointRef"]
            .as_str()
            .is_some_and(|value| value.starts_with("checkpoint:file:")));
    }

    #[tokio::test]
    async fn rejects_patch_path_outside_workspace() {
        let dir = tempdir().unwrap();
        let tool = create_apply_patch_tool();
        let permission = tool
            .check_permissions(
                &json!({
                    "patch": "*** Begin Patch\n*** Add File: ../outside.md\n+blocked\n*** End Patch"
                }),
                &context(dir.path().to_path_buf()),
            )
            .await;

        assert!(permission.is_denied());
    }

    #[tokio::test]
    async fn allows_absolute_path_inside_workspace() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("absolute.md");
        let tool = create_apply_patch_tool();
        let permission = tool
            .check_permissions(
                &json!({
                    "patch": format!(
                        "*** Begin Patch\n*** Add File: {}\n+absolute\n*** End Patch",
                        path.display()
                    )
                }),
                &context(dir.path().to_path_buf()),
            )
            .await;

        assert!(permission.is_allowed());
    }
}
