use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolOptions, ToolResult};
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;
use tool_runtime::native_dispatch::runtime_native_dispatch_handle;
use tool_runtime::native_overlay::{
    runtime_native_tool_overlay_registrations, runtime_native_tool_surface,
    RuntimeNativeToolOverlay, RuntimeNativeToolRegistrationOwner, RuntimeNativeToolSurface,
};
use tool_runtime::tool_definition::RuntimeToolDefinition;
use tool_runtime::tool_executor::{
    RuntimeToolExecutionContext, RuntimeToolExecutionContextInput, RuntimeToolExecutionError,
    RuntimeToolExecutionRequest, RuntimeToolExecutionResult, RuntimeToolExecutorHandle,
    RuntimeToolPolicyErrorKind, RuntimeToolTurnContext,
};

pub(crate) type RuntimeNativePermissionCheck = fn(&Value, &ToolContext) -> PermissionCheckResult;
pub(crate) type RuntimeDefinitionPermissionCheck =
    fn(&str, &Value, &ToolContext) -> PermissionCheckResult;
pub(crate) type RuntimeNativeTurnContextProvider = fn() -> Option<RuntimeToolTurnContext>;

fn no_turn_context() -> Option<RuntimeToolTurnContext> {
    None
}

/// 已迁入 `tool-runtime` 的 native tool 临时 Aster `Tool` 壳。
///
/// 这是删除边界：reply loop 不再调用 Aster `Tool` 后，本 adapter 和各工具权限函数应一起删除。
pub(crate) struct RuntimeNativeToolAdapter {
    tool: RuntimeNativeToolOverlay,
    executor: RuntimeToolExecutorHandle,
    permission_check: RuntimeNativePermissionCheck,
    turn_context_provider: RuntimeNativeTurnContextProvider,
}

impl RuntimeNativeToolAdapter {
    pub(crate) fn new(
        tool: RuntimeNativeToolOverlay,
        permission_check: RuntimeNativePermissionCheck,
    ) -> Self {
        Self {
            tool,
            executor: runtime_native_dispatch_handle(),
            permission_check,
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
        (self.permission_check)(params, context)
    }

    fn options(&self) -> ToolOptions {
        runtime_native_tool_options(self.tool)
    }
}

/// 已迁入 `tool-runtime`、但需要 App Server gateway executor 的临时 Aster `Tool` 壳。
///
/// 这是删除边界：current Turn executor 直接消费 gateway-backed runtime tool 后，本 adapter 应删除。
pub(crate) struct RuntimeDefinitionToolAdapter {
    definition: RuntimeToolDefinition,
    executor: RuntimeToolExecutorHandle,
    permission_check: RuntimeDefinitionPermissionCheck,
    turn_context_provider: RuntimeNativeTurnContextProvider,
    max_retries: Option<u32>,
}

impl RuntimeDefinitionToolAdapter {
    pub(crate) fn new(
        definition: RuntimeToolDefinition,
        executor: RuntimeToolExecutorHandle,
        permission_check: RuntimeDefinitionPermissionCheck,
    ) -> Self {
        Self {
            definition,
            executor,
            permission_check,
            turn_context_provider: no_turn_context,
            max_retries: None,
        }
    }

    pub(crate) fn with_turn_context_provider(
        mut self,
        provider: RuntimeNativeTurnContextProvider,
    ) -> Self {
        self.turn_context_provider = provider;
        self
    }

    pub(crate) fn with_max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = Some(max_retries);
        self
    }
}

#[async_trait]
impl Tool for RuntimeDefinitionToolAdapter {
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

        let turn_context = (self.turn_context_provider)();
        execute_runtime_tool(
            self.executor.clone(),
            self.name(),
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
        (self.permission_check)(self.name(), params, context)
    }

    fn options(&self) -> ToolOptions {
        self.max_retries.map_or_else(ToolOptions::new, |retries| {
            ToolOptions::new().with_max_retries(retries)
        })
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
    let result = executor
        .execute(RuntimeToolExecutionRequest {
            tool_name,
            params,
            context: &runtime_context,
            turn_context,
        })
        .await
        .map_err(runtime_error_to_tool_error)?;

    Ok(tool_result_from_runtime(result))
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

pub(crate) fn tool_result_from_runtime(result: RuntimeToolExecutionResult) -> ToolResult {
    if result.success {
        ToolResult::success(result.output).with_metadata_map(result.metadata)
    } else {
        ToolResult::error(result.error.unwrap_or(result.output)).with_metadata_map(result.metadata)
    }
}

pub(crate) fn runtime_error_to_tool_error(error: RuntimeToolExecutionError) -> ToolError {
    match error.policy_kind() {
        Some(RuntimeToolPolicyErrorKind::PermissionDenied(_)) => {
            ToolError::permission_denied(error.message().to_string())
        }
        Some(RuntimeToolPolicyErrorKind::SafetyCheckFailed(_)) => {
            ToolError::safety_check_failed(error.message().to_string())
        }
        Some(RuntimeToolPolicyErrorKind::ExecutionFailed(_)) | None => {
            ToolError::execution_failed(error.message().to_string())
        }
    }
}
