use crate::native_tools::runtime_tool_bridge::execute_runtime_tool;
use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolOptions, ToolResult};
use async_trait::async_trait;
use serde_json::Value;
pub use tool_runtime::apply_patch::APPLY_PATCH_TOOL_NAME;
use tool_runtime::apply_patch::{
    apply_patch_tool_definition, check_runtime_apply_patch_permissions,
};
use tool_runtime::native_dispatch::runtime_native_dispatch_handle;

#[derive(Debug, Default)]
pub struct ApplyPatchTool;

#[async_trait]
impl Tool for ApplyPatchTool {
    fn name(&self) -> &str {
        APPLY_PATCH_TOOL_NAME
    }

    fn description(&self) -> &str {
        "Apply a structured patch to files inside the current workspace. Use this for multi-file add, update, delete, or move edits."
    }

    fn input_schema(&self) -> Value {
        apply_patch_tool_definition().input_schema
    }

    fn aliases(&self) -> &'static [&'static str] {
        &["ApplyPatchTool"]
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        execute_runtime_tool(
            runtime_native_dispatch_handle(),
            APPLY_PATCH_TOOL_NAME,
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
        match check_runtime_apply_patch_permissions(params, &context.working_directory) {
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
    use std::fs;
    use std::path::PathBuf;
    use tempfile::tempdir;

    fn context(path: PathBuf) -> ToolContext {
        ToolContext::new(path).with_session_id("test-session")
    }

    #[tokio::test]
    async fn applies_patch_inside_workspace() {
        let dir = tempdir().unwrap();
        let tool = ApplyPatchTool;
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
        let tool = ApplyPatchTool;
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
        let tool = ApplyPatchTool;
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
