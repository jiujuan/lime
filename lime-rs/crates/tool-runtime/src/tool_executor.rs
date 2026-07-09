use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone)]
pub struct RuntimeToolExecutionContextInput {
    pub working_directory: PathBuf,
    pub session_id: String,
    pub cancel_token: Option<CancellationToken>,
    pub workspace_sandbox: Option<RuntimeWorkspaceSandboxInput>,
}

#[derive(Debug, Clone)]
pub struct RuntimeToolExecutionContext {
    working_directory: PathBuf,
    session_id: String,
    cancel_token: Option<CancellationToken>,
    workspace_sandbox: Option<RuntimeWorkspaceSandboxInput>,
    environment: HashMap<String, String>,
}

impl RuntimeToolExecutionContext {
    pub fn new(input: RuntimeToolExecutionContextInput) -> Self {
        Self {
            working_directory: input.working_directory,
            session_id: input.session_id,
            cancel_token: input.cancel_token,
            workspace_sandbox: input.workspace_sandbox,
            environment: HashMap::new(),
        }
    }

    pub fn working_directory(&self) -> &PathBuf {
        &self.working_directory
    }

    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    pub fn cancel_token(&self) -> Option<&CancellationToken> {
        self.cancel_token.as_ref()
    }

    pub fn workspace_sandbox(&self) -> Option<&RuntimeWorkspaceSandboxInput> {
        self.workspace_sandbox.as_ref()
    }

    pub fn has_workspace_sandbox(&self) -> bool {
        self.workspace_sandbox.is_some()
    }

    pub fn environment(&self) -> &HashMap<String, String> {
        &self.environment
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeWorkspaceSandboxInput {
    metadata: HashMap<String, Value>,
}

impl RuntimeWorkspaceSandboxInput {
    pub fn from_policy_metadata(metadata: &HashMap<String, Value>) -> Self {
        Self {
            metadata: metadata.clone(),
        }
    }

    pub fn metadata(&self) -> &HashMap<String, Value> {
        &self.metadata
    }
}

#[derive(Debug, Clone, Copy)]
pub struct RuntimeToolExecutionRequest<'a> {
    pub tool_name: &'a str,
    pub params: &'a Value,
    pub context: &'a RuntimeToolExecutionContext,
    pub turn_context: Option<&'a RuntimeToolTurnContext>,
}

pub type RuntimeToolTurnContext = agent_protocol::turn_context::TurnContextOverride;

pub type RuntimeToolExecutionFuture<'a> = Pin<
    Box<
        dyn Future<Output = Result<RuntimeToolExecutionResult, RuntimeToolExecutionError>>
            + Send
            + 'a,
    >,
>;

pub trait RuntimeToolExecutor: Send + Sync {
    fn execute<'a>(
        &'a self,
        request: RuntimeToolExecutionRequest<'a>,
    ) -> RuntimeToolExecutionFuture<'a>;
}

#[derive(Clone)]
pub struct RuntimeToolExecutorHandle {
    executor: Arc<dyn RuntimeToolExecutor>,
}

impl RuntimeToolExecutorHandle {
    pub fn new(executor: Arc<dyn RuntimeToolExecutor>) -> Self {
        Self { executor }
    }

    pub async fn execute(
        &self,
        request: RuntimeToolExecutionRequest<'_>,
    ) -> Result<RuntimeToolExecutionResult, RuntimeToolExecutionError> {
        self.executor.execute(request).await
    }
}

pub async fn run_runtime_tool_execution(
    executor: &RuntimeToolExecutorHandle,
    request: RuntimeToolExecutionRequest<'_>,
) -> RuntimeToolExecutionOutcome {
    RuntimeToolExecutionOutcome::from_execution_result(executor.execute(request).await)
}

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeToolExecutionResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub metadata: HashMap<String, Value>,
}

impl RuntimeToolExecutionResult {
    pub fn new(
        success: bool,
        output: String,
        error: Option<String>,
        metadata: HashMap<String, Value>,
    ) -> Self {
        Self {
            success,
            output,
            error,
            metadata,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum RuntimeToolExecutionOutcome {
    Result(RuntimeToolExecutionResult),
    Error(RuntimeToolExecutionFailure),
}

impl RuntimeToolExecutionOutcome {
    pub fn from_execution_result(
        result: Result<RuntimeToolExecutionResult, RuntimeToolExecutionError>,
    ) -> Self {
        match result {
            Ok(result) => Self::Result(result),
            Err(error) => Self::Error(RuntimeToolExecutionFailure::from_error(error)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeToolExecutionError {
    message: String,
    policy_kind: Option<RuntimeToolPolicyErrorKind>,
}

impl RuntimeToolExecutionError {
    pub fn new(
        message: impl Into<String>,
        policy_kind: Option<RuntimeToolPolicyErrorKind>,
    ) -> Self {
        Self {
            message: message.into(),
            policy_kind,
        }
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    pub fn policy_kind(&self) -> Option<&RuntimeToolPolicyErrorKind> {
        self.policy_kind.as_ref()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeToolExecutionFailure {
    message: String,
    kind: RuntimeToolExecutionFailureKind,
}

impl RuntimeToolExecutionFailure {
    pub fn from_error(error: RuntimeToolExecutionError) -> Self {
        let kind = match error.policy_kind() {
            Some(RuntimeToolPolicyErrorKind::PermissionDenied(_)) => {
                RuntimeToolExecutionFailureKind::PermissionDenied
            }
            Some(RuntimeToolPolicyErrorKind::SafetyCheckFailed(_)) => {
                RuntimeToolExecutionFailureKind::SafetyCheckFailed
            }
            Some(RuntimeToolPolicyErrorKind::ExecutionFailed(_)) | None => {
                RuntimeToolExecutionFailureKind::ExecutionFailed
            }
        };

        Self {
            message: error.message().to_string(),
            kind,
        }
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    pub fn kind(&self) -> RuntimeToolExecutionFailureKind {
        self.kind
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeToolExecutionFailureKind {
    PermissionDenied,
    SafetyCheckFailed,
    ExecutionFailed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeToolPolicyErrorKind {
    PermissionDenied(String),
    SafetyCheckFailed(String),
    ExecutionFailed(String),
}

impl RuntimeToolPolicyErrorKind {
    pub fn classification(&self) -> Option<RuntimeToolPolicyErrorClassification<'_>> {
        match self {
            RuntimeToolPolicyErrorKind::PermissionDenied(reason) => {
                Some(RuntimeToolPolicyErrorClassification {
                    event_class: "permission.denied",
                    failure_category: "permission_denied",
                    reason_code: "permission_denied",
                    reason,
                })
            }
            RuntimeToolPolicyErrorKind::SafetyCheckFailed(reason) => {
                Some(RuntimeToolPolicyErrorClassification {
                    event_class: "permission.denied",
                    failure_category: "policy_denied",
                    reason_code: "safety_check_failed",
                    reason,
                })
            }
            RuntimeToolPolicyErrorKind::ExecutionFailed(reason)
                if looks_like_sandbox_block(reason) =>
            {
                Some(RuntimeToolPolicyErrorClassification {
                    event_class: "sandbox.blocked",
                    failure_category: "sandbox_blocked",
                    reason_code: "sandbox_blocked",
                    reason,
                })
            }
            RuntimeToolPolicyErrorKind::ExecutionFailed(_) => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RuntimeToolPolicyErrorClassification<'a> {
    pub event_class: &'static str,
    pub failure_category: &'static str,
    pub reason_code: &'static str,
    pub reason: &'a str,
}

fn looks_like_sandbox_block(reason: &str) -> bool {
    let normalized = reason.to_ascii_lowercase();
    normalized.contains("sandbox")
        && (normalized.contains("block")
            || normalized.contains("denied")
            || normalized.contains("not permitted"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn runtime_tool_result_keeps_terminal_fields() {
        let result = RuntimeToolExecutionResult::new(
            true,
            "ok".to_string(),
            None,
            HashMap::from([("source".to_string(), json!("runtime"))]),
        );

        assert!(result.success);
        assert_eq!(result.output, "ok");
        assert_eq!(result.metadata.get("source"), Some(&json!("runtime")));
    }

    #[test]
    fn runtime_tool_context_keeps_execution_inputs_without_aster_types() {
        let metadata = HashMap::from([("sandboxBackend".to_string(), json!("seatbelt"))]);
        let context = RuntimeToolExecutionContext::new(RuntimeToolExecutionContextInput {
            working_directory: PathBuf::from("/tmp/workspace"),
            session_id: "session-1".to_string(),
            cancel_token: None,
            workspace_sandbox: Some(RuntimeWorkspaceSandboxInput::from_policy_metadata(
                &metadata,
            )),
        });

        assert_eq!(
            context.working_directory(),
            &PathBuf::from("/tmp/workspace")
        );
        assert_eq!(context.session_id(), "session-1");
        assert!(context.has_workspace_sandbox());
        assert_eq!(
            context
                .workspace_sandbox()
                .map(|sandbox| sandbox.metadata()),
            Some(&metadata)
        );
        assert!(context.environment().is_empty());
    }

    struct EchoExecutor;

    impl RuntimeToolExecutor for EchoExecutor {
        fn execute<'a>(
            &'a self,
            request: RuntimeToolExecutionRequest<'a>,
        ) -> RuntimeToolExecutionFuture<'a> {
            Box::pin(async move {
                Ok(RuntimeToolExecutionResult::new(
                    true,
                    format!("{}:{}", request.context.session_id(), request.tool_name),
                    None,
                    HashMap::new(),
                ))
            })
        }
    }

    #[tokio::test]
    async fn runtime_tool_executor_handle_dispatches_current_request() {
        let context = RuntimeToolExecutionContext::new(RuntimeToolExecutionContextInput {
            working_directory: PathBuf::from("/tmp/workspace"),
            session_id: "session-2".to_string(),
            cancel_token: None,
            workspace_sandbox: None,
        });
        let params = json!({});
        let executor = RuntimeToolExecutorHandle::new(Arc::new(EchoExecutor));

        let result = executor
            .execute(RuntimeToolExecutionRequest {
                tool_name: "Echo",
                params: &params,
                context: &context,
                turn_context: None,
            })
            .await
            .expect("runtime executor should return result");

        assert!(result.success);
        assert_eq!(result.output, "session-2:Echo");
    }

    #[tokio::test]
    async fn runtime_tool_runner_materializes_current_result_outcome() {
        let context = RuntimeToolExecutionContext::new(RuntimeToolExecutionContextInput {
            working_directory: PathBuf::from("/tmp/workspace"),
            session_id: "session-3".to_string(),
            cancel_token: None,
            workspace_sandbox: None,
        });
        let params = json!({});
        let executor = RuntimeToolExecutorHandle::new(Arc::new(EchoExecutor));

        let outcome = run_runtime_tool_execution(
            &executor,
            RuntimeToolExecutionRequest {
                tool_name: "Echo",
                params: &params,
                context: &context,
                turn_context: None,
            },
        )
        .await;

        match outcome {
            RuntimeToolExecutionOutcome::Result(result) => {
                assert!(result.success);
                assert_eq!(result.output, "session-3:Echo");
            }
            RuntimeToolExecutionOutcome::Error(error) => {
                panic!("runtime runner should not fail: {error:?}");
            }
        }
    }

    struct FailingExecutor {
        error: RuntimeToolExecutionError,
    }

    impl RuntimeToolExecutor for FailingExecutor {
        fn execute<'a>(
            &'a self,
            _request: RuntimeToolExecutionRequest<'a>,
        ) -> RuntimeToolExecutionFuture<'a> {
            Box::pin(async move { Err(self.error.clone()) })
        }
    }

    #[tokio::test]
    async fn runtime_tool_runner_materializes_policy_failure_outcome() {
        let context = RuntimeToolExecutionContext::new(RuntimeToolExecutionContextInput {
            working_directory: PathBuf::from("/tmp/workspace"),
            session_id: "session-4".to_string(),
            cancel_token: None,
            workspace_sandbox: None,
        });
        let params = json!({});
        let executor = RuntimeToolExecutorHandle::new(Arc::new(FailingExecutor {
            error: RuntimeToolExecutionError::new(
                "blocked by policy",
                Some(RuntimeToolPolicyErrorKind::PermissionDenied(
                    "permission_denied".to_string(),
                )),
            ),
        }));

        let outcome = run_runtime_tool_execution(
            &executor,
            RuntimeToolExecutionRequest {
                tool_name: "Echo",
                params: &params,
                context: &context,
                turn_context: None,
            },
        )
        .await;

        match outcome {
            RuntimeToolExecutionOutcome::Result(result) => {
                panic!("runtime runner should fail, got {result:?}");
            }
            RuntimeToolExecutionOutcome::Error(error) => {
                assert_eq!(error.message(), "blocked by policy");
                assert_eq!(
                    error.kind(),
                    RuntimeToolExecutionFailureKind::PermissionDenied
                );
            }
        }
    }

    #[test]
    fn policy_error_classification_projects_gui_metadata() {
        let permission_error = RuntimeToolPolicyErrorKind::PermissionDenied("blocked".to_string());
        let permission = permission_error
            .classification()
            .expect("permission denial should classify");
        assert_eq!(permission.event_class, "permission.denied");
        assert_eq!(permission.failure_category, "permission_denied");
        assert_eq!(permission.reason_code, "permission_denied");

        let sandbox_error =
            RuntimeToolPolicyErrorKind::ExecutionFailed("sandbox denied file write".to_string());
        let sandbox = sandbox_error
            .classification()
            .expect("sandbox execution failure should classify");
        assert_eq!(sandbox.event_class, "sandbox.blocked");
        assert_eq!(sandbox.failure_category, "sandbox_blocked");
        assert_eq!(sandbox.reason_code, "sandbox_blocked");

        assert!(
            RuntimeToolPolicyErrorKind::ExecutionFailed("command failed".to_string())
                .classification()
                .is_none()
        );
    }
}
