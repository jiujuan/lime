use crate::runtime_facade::current_agent_turn_context;
use aster::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolOptions, ToolResult};
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;
use tool_runtime::native_dispatch::runtime_native_dispatch_handle;
use tool_runtime::native_overlay::{
    check_runtime_native_tool_permissions, runtime_native_tool_overlay_registrations,
    runtime_native_tool_surface, RuntimeNativePermissionDecision, RuntimeNativeToolOverlay,
    RuntimeNativeToolRegistrationOwner, RuntimeNativeToolSurface,
    RuntimeNativeToolTurnContextSource,
};
use tool_runtime::tool_executor::{
    run_runtime_tool_execution, RuntimeToolExecutionContext, RuntimeToolExecutionContextInput,
    RuntimeToolExecutionFailure, RuntimeToolExecutionFailureKind, RuntimeToolExecutionOutcome,
    RuntimeToolExecutionRequest, RuntimeToolExecutorHandle, RuntimeToolTurnContext,
};

pub(crate) type RuntimeNativeTurnContextProvider = fn() -> Option<RuntimeToolTurnContext>;

fn no_turn_context() -> Option<RuntimeToolTurnContext> {
    None
}

fn turn_context_provider_for_source(
    source: RuntimeNativeToolTurnContextSource,
) -> RuntimeNativeTurnContextProvider {
    match source {
        RuntimeNativeToolTurnContextSource::None => no_turn_context,
        RuntimeNativeToolTurnContextSource::AgentTurn => current_agent_turn_context,
    }
}

pub(crate) fn create_runtime_native_tool_adapter(tool: RuntimeNativeToolOverlay) -> Box<dyn Tool> {
    let adapter = RuntimeNativeToolAdapter::new(tool)
        .with_turn_context_provider(turn_context_provider_for_source(tool.turn_context_source()));
    Box::new(adapter)
}

/// 已迁入 `tool-runtime` 的 native tool 临时 Aster `Tool` 壳。
///
/// 这是删除边界：reply loop 不再调用 Aster `Tool` 后，本 adapter 和各工具权限函数应一起删除。
pub(crate) struct RuntimeNativeToolAdapter {
    tool: RuntimeNativeToolOverlay,
    executor: RuntimeToolExecutorHandle,
    turn_context_provider: RuntimeNativeTurnContextProvider,
}

impl RuntimeNativeToolAdapter {
    pub(crate) fn new(tool: RuntimeNativeToolOverlay) -> Self {
        Self {
            tool,
            executor: runtime_native_dispatch_handle(),
            turn_context_provider: no_turn_context,
        }
    }

    pub(crate) fn with_turn_context_provider(
        mut self,
        provider: RuntimeNativeTurnContextProvider,
    ) -> Self {
        self.turn_context_provider = provider;
        self
    }
}

#[async_trait]
impl Tool for RuntimeNativeToolAdapter {
    fn name(&self) -> &str {
        self.tool.name()
    }

    fn description(&self) -> &str {
        runtime_native_tool_surface_ref(self.tool).description()
    }

    fn input_schema(&self) -> Value {
        runtime_native_tool_surface_ref(self.tool).input_schema()
    }

    fn aliases(&self) -> &'static [&'static str] {
        runtime_native_tool_surface_ref(self.tool).aliases()
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        if context.is_cancelled() {
            return Err(ToolError::Cancelled);
        }

        let turn_context = (self.turn_context_provider)();
        execute_runtime_tool(
            self.executor.clone(),
            self.tool.name(),
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
        let turn_context = (self.turn_context_provider)();
        permission_decision_to_aster(check_runtime_native_tool_permissions(
            self.tool,
            params,
            &context.working_directory,
            turn_context.as_ref(),
        ))
    }

    fn options(&self) -> ToolOptions {
        runtime_native_tool_options(self.tool)
    }
}

fn permission_decision_to_aster(
    decision: RuntimeNativePermissionDecision,
) -> PermissionCheckResult {
    match decision {
        RuntimeNativePermissionDecision::Allow => PermissionCheckResult::allow(),
        RuntimeNativePermissionDecision::Deny(message) => PermissionCheckResult::deny(message),
        RuntimeNativePermissionDecision::Ask(message) => PermissionCheckResult::ask(message),
    }
}

pub(crate) fn runtime_context_from_aster(context: &ToolContext) -> RuntimeToolExecutionContext {
    RuntimeToolExecutionContext::new(RuntimeToolExecutionContextInput {
        working_directory: context.working_directory.clone(),
        session_id: context.session_id.clone(),
        cancel_token: context.cancellation_token.clone(),
        workspace_sandbox: None,
    })
}

pub(crate) async fn execute_runtime_tool(
    executor: RuntimeToolExecutorHandle,
    tool_name: &str,
    params: &Value,
    context: &ToolContext,
    turn_context: Option<&RuntimeToolTurnContext>,
) -> Result<ToolResult, ToolError> {
    let runtime_context = runtime_context_from_aster(context);
    let outcome = run_runtime_tool_execution(
        &executor,
        RuntimeToolExecutionRequest {
            tool_name,
            params,
            context: &runtime_context,
            turn_context,
        },
    )
    .await;

    runtime_outcome_to_aster(outcome)
}

pub(crate) fn runtime_native_tool_surface_ref(
    tool: RuntimeNativeToolOverlay,
) -> &'static RuntimeNativeToolSurface {
    static SURFACES: OnceLock<HashMap<RuntimeNativeToolOverlay, RuntimeNativeToolSurface>> =
        OnceLock::new();
    SURFACES
        .get_or_init(|| {
            runtime_native_tool_overlay_registrations()
                .iter()
                .filter_map(|registration| {
                    if registration.owner() != RuntimeNativeToolRegistrationOwner::NativeDispatch {
                        return None;
                    }
                    let surface = runtime_native_tool_surface(registration.tool())?;
                    Some((registration.tool(), surface))
                })
                .collect()
        })
        .get(&tool)
        .expect("native tool surface must be registered by tool-runtime")
}

pub(crate) fn runtime_native_tool_options(tool: RuntimeNativeToolOverlay) -> ToolOptions {
    let surface = runtime_native_tool_surface_ref(tool);
    surface
        .max_retries()
        .map_or_else(ToolOptions::new, |retries| {
            ToolOptions::new().with_max_retries(retries)
        })
}

pub(crate) fn runtime_outcome_to_aster(
    outcome: RuntimeToolExecutionOutcome,
) -> Result<ToolResult, ToolError> {
    match outcome {
        RuntimeToolExecutionOutcome::Result(result) => {
            let tool_result = if result.success {
                ToolResult::success(result.output)
            } else {
                ToolResult::error(result.error.unwrap_or(result.output))
            };
            Ok(tool_result.with_metadata_map(result.metadata))
        }
        RuntimeToolExecutionOutcome::Error(error) => Err(runtime_failure_to_aster(error)),
    }
}

fn runtime_failure_to_aster(error: RuntimeToolExecutionFailure) -> ToolError {
    match error.kind() {
        RuntimeToolExecutionFailureKind::PermissionDenied => {
            ToolError::permission_denied(error.message().to_string())
        }
        RuntimeToolExecutionFailureKind::SafetyCheckFailed => {
            ToolError::safety_check_failed(error.message().to_string())
        }
        RuntimeToolExecutionFailureKind::ExecutionFailed => {
            ToolError::execution_failed(error.message().to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_protocol::turn_context::TurnContextOverride;
    use aster::{PermissionBehavior, ToolContext};
    use serde_json::json;
    use std::fs;
    use tempfile::tempdir;

    fn create_test_native_tool(tool: RuntimeNativeToolOverlay) -> Box<dyn Tool> {
        match tool {
            RuntimeNativeToolOverlay::ViewImage
            | RuntimeNativeToolOverlay::ApplyPatch
            | RuntimeNativeToolOverlay::SkillSearch
            | RuntimeNativeToolOverlay::Sleep
            | RuntimeNativeToolOverlay::UpdatePlan
            | RuntimeNativeToolOverlay::WebFetch
            | RuntimeNativeToolOverlay::WebSearch => create_runtime_native_tool_adapter(tool),
            RuntimeNativeToolOverlay::Skill => {
                panic!("Skill is backed by skill gate, not native dispatch")
            }
        }
    }

    #[tokio::test]
    async fn stateless_adapter_executes_sleep_current_executor() {
        let tool = create_test_native_tool(RuntimeNativeToolOverlay::Sleep);
        let result = tool
            .execute(
                json!({ "duration_ms": 1 }),
                &ToolContext::default().with_session_id("session-sleep-1"),
            )
            .await
            .expect("sleep tool should execute");

        assert!(result.success);
        assert_eq!(result.metadata.get("tool_family"), Some(&json!("sleep")));
    }

    #[tokio::test]
    async fn stateless_adapter_executes_apply_patch_current_executor() {
        let dir = tempdir().expect("tempdir");
        let tool = create_test_native_tool(RuntimeNativeToolOverlay::ApplyPatch);
        let result = tool
            .execute(
                json!({
                    "patch": "*** Begin Patch\n*** Add File: notes/live.md\n+hello\n*** End Patch"
                }),
                &ToolContext::new(dir.path().to_path_buf()).with_session_id("session-patch-1"),
            )
            .await
            .expect("apply_patch tool should execute");

        assert!(result.success);
        assert_eq!(
            fs::read_to_string(dir.path().join("notes/live.md")).expect("patched file"),
            "hello\n"
        );
        assert_eq!(
            result.metadata.get("path").and_then(Value::as_str),
            Some("notes/live.md")
        );
    }

    #[tokio::test]
    async fn stateless_adapter_injects_turn_context_source() {
        let error = crate::runtime_facade::with_agent_turn_context(
            Some(TurnContextOverride {
                collaboration_mode: Some("plan".to_string()),
                ..TurnContextOverride::default()
            }),
            async {
                let tool = create_test_native_tool(RuntimeNativeToolOverlay::UpdatePlan);
                tool.execute(
                    json!({
                        "plan": [
                            { "step": "写计划", "status": "in_progress" }
                        ]
                    }),
                    &ToolContext::default(),
                )
                .await
            },
        )
        .await
        .expect_err("update_plan should be rejected in Plan mode");

        assert!(error.to_string().contains("not allowed in Plan mode"));
    }

    #[test]
    fn stateless_adapter_exposes_current_surface_and_aliases() {
        let tool = create_test_native_tool(RuntimeNativeToolOverlay::ViewImage);

        assert_eq!(tool.name(), "view_image");
        assert!(tool.aliases().contains(&"ViewImage"));
        assert!(tool.aliases().contains(&"ViewImageTool"));
        assert!(tool.input_schema().get("properties").is_some());
    }

    #[test]
    fn stateless_permission_conversion_delegates_to_current_runtime_rules() {
        let sleep = create_test_native_tool(RuntimeNativeToolOverlay::Sleep);
        let skill_search = create_test_native_tool(RuntimeNativeToolOverlay::SkillSearch);
        let update_plan = create_test_native_tool(RuntimeNativeToolOverlay::UpdatePlan);

        assert!(futures::executor::block_on(
            sleep.check_permissions(&json!({ "seconds": 1 }), &ToolContext::default())
        )
        .is_denied());
        assert!(futures::executor::block_on(
            skill_search.check_permissions(&json!({ "query": "" }), &ToolContext::default())
        )
        .is_denied());
        assert!(futures::executor::block_on(update_plan.check_permissions(
            &json!({
                "plan": [
                    { "step": "第一步", "status": "in_progress" },
                    { "step": "第二步", "status": "in_progress" }
                ]
            }),
            &ToolContext::default(),
        ))
        .is_denied());
    }

    #[test]
    fn apply_patch_permission_conversion_delegates_to_current_runtime_rules() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("absolute.md");
        let tool = create_test_native_tool(RuntimeNativeToolOverlay::ApplyPatch);

        let denied = futures::executor::block_on(tool.check_permissions(
            &json!({
                "patch": "*** Begin Patch\n*** Add File: ../outside.md\n+blocked\n*** End Patch"
            }),
            &ToolContext::new(dir.path().to_path_buf()).with_session_id("test-session"),
        ));
        let allowed = futures::executor::block_on(tool.check_permissions(
            &json!({
                "patch": format!(
                    "*** Begin Patch\n*** Add File: {}\n+absolute\n*** End Patch",
                    path.display()
                )
            }),
            &ToolContext::new(dir.path().to_path_buf()).with_session_id("test-session"),
        ));

        assert!(denied.is_denied());
        assert!(allowed.is_allowed());
    }

    #[test]
    fn web_fetch_permission_conversion_requires_confirmation() {
        let tool = create_test_native_tool(RuntimeNativeToolOverlay::WebFetch);
        let result = futures::executor::block_on(tool.check_permissions(
            &json!({
                "url": "https://example.com/docs",
                "prompt": "总结内容"
            }),
            &ToolContext::default(),
        ));

        assert_eq!(result.behavior, PermissionBehavior::Ask);
        assert_eq!(
            result.message,
            Some("WebFetch 将访问远程站点 example.com，请确认后继续。".to_string())
        );
    }

    #[test]
    fn web_fetch_permission_conversion_allows_preapproved_host() {
        let tool = create_test_native_tool(RuntimeNativeToolOverlay::WebFetch);
        let result = futures::executor::block_on(tool.check_permissions(
            &json!({
                "url": "https://react.dev/reference/react/useEffect",
                "prompt": "总结内容"
            }),
            &ToolContext::default(),
        ));

        assert_eq!(result.behavior, PermissionBehavior::Allow);
        assert!(result.message.is_none());
    }

    #[tokio::test]
    async fn web_search_permissions_allow_when_turn_approval_policy_is_never() {
        let result = crate::runtime_facade::with_agent_turn_context(
            Some(TurnContextOverride {
                approval_policy: Some("never".to_string()),
                ..TurnContextOverride::default()
            }),
            async {
                let tool = create_test_native_tool(RuntimeNativeToolOverlay::WebSearch);
                tool.check_permissions(
                    &json!({
                        "query": "latest ai news"
                    }),
                    &ToolContext::default(),
                )
                .await
            },
        )
        .await;

        assert_eq!(result.behavior, PermissionBehavior::Allow);
        assert!(result.message.is_none());
    }
}
