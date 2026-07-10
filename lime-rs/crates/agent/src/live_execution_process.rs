use std::sync::Arc;

use aster::{Agent, NativeToolExecutionHook, NativeToolExecutionRequest, ToolCallResult};
use futures::channel::mpsc::{unbounded, UnboundedSender};
use futures::FutureExt;
use rmcp::model::{
    ErrorCode, ErrorData, LoggingLevel, LoggingMessageNotification,
    LoggingMessageNotificationMethod, LoggingMessageNotificationParam, ServerNotification,
};
use serde_json::{json, Value};
use tokio::sync::oneshot;
use tool_runtime::execution_process::live::{
    run_runtime_live_execution_process, runtime_live_execution_canonical_shell_tool_name,
    runtime_live_execution_process_id, runtime_live_execution_shell_background_requested,
    runtime_live_execution_shell_command, RuntimeLiveExecutionNotificationSink,
    RuntimeLiveExecutionRequest, RUNTIME_LIVE_EXECUTION_DEFAULT_DRAIN_MAX_BYTES,
};

use crate::agent_tools::execution::{
    decide_tool_execution, ToolExecutionDecisionInput, ToolExecutionDecisionKind,
    ToolExecutionResolverInput,
};
use crate::runtime_facade::current_agent_turn_context;
use crate::tool_output_truncation::tool_output_truncation_policy_from_turn_context;
use crate::{
    agent_turn_approval_policy, agent_turn_context_metadata, agent_turn_sandbox_policy,
    native_tool_policy_disallowed_tool_names, native_tool_policy_from_turn_context,
};

pub use tool_runtime::execution_process::live::RuntimeLiveExecutionGateway as LiveExecutionProcessGateway;

#[derive(Clone)]
pub(crate) struct RuntimeLiveExecutionProcessHook {
    gateway: Arc<dyn LiveExecutionProcessGateway>,
}

impl RuntimeLiveExecutionProcessHook {
    pub(crate) fn new(gateway: Arc<dyn LiveExecutionProcessGateway>) -> Self {
        Self { gateway }
    }
}

pub(crate) fn install_runtime_live_execution_process_hook(
    agent: &mut Agent,
    gateway: Arc<dyn LiveExecutionProcessGateway>,
) {
    let hook = RuntimeLiveExecutionProcessHook::new(gateway);
    agent.set_native_tool_execution_hook(Some(Arc::new(hook)));
}

impl NativeToolExecutionHook for RuntimeLiveExecutionProcessHook {
    fn execute_native_tool(&self, request: NativeToolExecutionRequest) -> Option<ToolCallResult> {
        let runtime_request = prepare_live_execution(request)?;
        let (notification_tx, notification_rx) = unbounded();
        let (result_tx, result_rx) = oneshot::channel();
        let gateway = self.gateway.clone();
        let notification_sink: RuntimeLiveExecutionNotificationSink = Arc::new(move |data| {
            send_notification(&notification_tx, data);
        });

        tokio::spawn(async move {
            let result =
                run_runtime_live_execution_process(gateway, runtime_request, notification_sink)
                    .await;
            let _ = result_tx.send(result);
        });

        Some(ToolCallResult {
            result: Box::new(
                async move {
                    result_rx.await.unwrap_or_else(|_| {
                        Err(ErrorData::new(
                            ErrorCode::INTERNAL_ERROR,
                            "Live execution process task ended before returning a result",
                            None,
                        ))
                    })
                }
                .boxed(),
            ),
            notification_stream: Some(Box::new(notification_rx)),
        })
    }
}

fn prepare_live_execution(
    request: NativeToolExecutionRequest,
) -> Option<RuntimeLiveExecutionRequest> {
    let tool_name = runtime_live_execution_canonical_shell_tool_name(&request.tool_name)?;
    if request.context.workspace_sandbox.is_some() {
        return None;
    }
    if runtime_live_execution_shell_background_requested(tool_name, &request.params) {
        return None;
    }
    let command_text = request
        .params
        .get("command")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?
        .to_string();
    let turn_context = current_agent_turn_context();
    if !live_execution_shell_enabled(turn_context.as_ref(), tool_name) {
        return None;
    }
    let output_truncation_policy = tool_output_truncation_policy_from_turn_context(
        turn_context.as_ref(),
        RUNTIME_LIVE_EXECUTION_DEFAULT_DRAIN_MAX_BYTES,
    );
    let output_drain_max_bytes = live_execution_output_drain_max_bytes(turn_context.as_ref());
    let runtime_metadata = agent_turn_context_metadata(turn_context.as_ref());
    let approval_policy = agent_turn_approval_policy(turn_context.as_ref());
    let sandbox_policy = agent_turn_sandbox_policy(turn_context.as_ref());
    let decision = decide_tool_execution(ToolExecutionDecisionInput {
        tool_name,
        params: &json!({ "command": command_text.clone() }),
        working_directory: &request.context.working_directory,
        surface: "runtime_live_process",
        auto_mode: false,
        bypass_restrictions: false,
        approval_policy: approval_policy.as_deref(),
        requested_sandbox_policy: sandbox_policy.as_deref(),
        resolver_input: ToolExecutionResolverInput {
            persisted_policy: None,
            request_metadata: runtime_metadata.as_ref(),
        },
    });
    if !matches!(decision.kind, ToolExecutionDecisionKind::Allow)
        || decision.requires_sandboxed_execution()
    {
        return None;
    }

    let mut env = request.context.environment.clone();
    env.insert("ASTER_TERMINAL".to_string(), "1".to_string());
    let command = runtime_live_execution_shell_command(tool_name, &command_text);
    let working_directory = request
        .context
        .working_directory
        .to_string_lossy()
        .to_string();

    Some(RuntimeLiveExecutionRequest {
        process_id: runtime_live_execution_process_id(&request.tool_id),
        tool_id: request.tool_id,
        tool_name: tool_name.to_string(),
        command_text,
        command,
        working_directory,
        approval_policy,
        sandbox_policy,
        runtime_metadata,
        output_drain_max_bytes,
        output_truncation_policy,
        env,
        cancellation_token: request.context.cancellation_token,
    })
}

fn live_execution_shell_enabled(
    turn_context: Option<&crate::AgentTurnContext>,
    tool_name: &str,
) -> bool {
    let native_policy = native_tool_policy_from_turn_context(turn_context);
    !native_tool_policy_disallowed_tool_names(native_policy.as_ref())
        .iter()
        .any(|disallowed| tool_name.eq_ignore_ascii_case(disallowed))
}

fn live_execution_output_drain_max_bytes(turn_context: Option<&crate::AgentTurnContext>) -> u64 {
    tool_output_truncation_policy_from_turn_context(
        turn_context,
        RUNTIME_LIVE_EXECUTION_DEFAULT_DRAIN_MAX_BYTES,
    )
    .drain_max_bytes(RUNTIME_LIVE_EXECUTION_DEFAULT_DRAIN_MAX_BYTES)
}

fn send_notification(sender: &UnboundedSender<ServerNotification>, data: Value) {
    let _ = sender.unbounded_send(ServerNotification::LoggingMessageNotification(
        LoggingMessageNotification {
            method: LoggingMessageNotificationMethod,
            params: LoggingMessageNotificationParam {
                level: LoggingLevel::Info,
                logger: Some("runtime_live_process".to_string()),
                data,
            },
            extensions: Default::default(),
        },
    ));
}

#[cfg(test)]
mod tests {
    use std::collections::{HashMap, VecDeque};
    use std::path::PathBuf;
    use std::sync::Mutex;

    use super::*;
    use app_server_protocol::{
        ExecutionProcessDrainOutputParams, ExecutionProcessDrainOutputResponse,
        ExecutionProcessIdParams, ExecutionProcessOutputDelta, ExecutionProcessOutputKind,
        ExecutionProcessSnapshot, ExecutionProcessStartParams, ExecutionProcessStartResponse,
        ExecutionProcessStatus, ExecutionProcessStatusResponse,
    };
    use aster::ToolContext;
    use async_trait::async_trait;

    use crate::runtime_facade::with_agent_turn_context;
    use crate::AgentTurnContext;

    #[derive(Default)]
    struct TestLiveExecutionProcessGateway {
        drain_params: Mutex<Vec<ExecutionProcessDrainOutputParams>>,
        output: Mutex<VecDeque<ExecutionProcessOutputDelta>>,
        retained_output: Mutex<Option<String>>,
        snapshot: Mutex<Option<ExecutionProcessSnapshot>>,
    }

    impl TestLiveExecutionProcessGateway {
        fn with_retained_output(output: impl Into<String>) -> Self {
            Self {
                retained_output: Mutex::new(Some(output.into())),
                ..Self::default()
            }
        }
    }

    fn native_tool_context(working_directory: PathBuf) -> ToolContext {
        ToolContext::new(working_directory)
    }

    #[async_trait]
    impl LiveExecutionProcessGateway for TestLiveExecutionProcessGateway {
        async fn start_process(
            &self,
            params: ExecutionProcessStartParams,
        ) -> Result<ExecutionProcessStartResponse, String> {
            let output = self
                .retained_output
                .lock()
                .expect("retained output lock")
                .clone()
                .unwrap_or_else(|| "live-process".to_string());
            let snapshot = ExecutionProcessSnapshot {
                process_id: params.process_id.clone(),
                tool_id: params.tool_id.clone(),
                tool_name: params.tool_name,
                status: ExecutionProcessStatus::Exited,
                exit_code: Some(0),
                elapsed_ms: 1,
                output_bytes: output.len() as u64,
                output_omitted_bytes: 0,
                output_truncated: false,
                retained_output: output.clone(),
                failure: None,
            };
            self.output
                .lock()
                .expect("output lock")
                .push_back(ExecutionProcessOutputDelta {
                    process_id: params.process_id,
                    tool_id: params.tool_id,
                    sequence: 1,
                    kind: ExecutionProcessOutputKind::Stdout,
                    delta: output,
                    bytes: 12,
                    omitted_bytes: 0,
                    truncated: false,
                });
            *self.snapshot.lock().expect("snapshot lock") = Some(snapshot.clone());
            Ok(ExecutionProcessStartResponse { snapshot })
        }

        fn terminate(
            &self,
            _params: ExecutionProcessIdParams,
        ) -> Result<ExecutionProcessStatusResponse, String> {
            Ok(ExecutionProcessStatusResponse {
                snapshot: self
                    .snapshot
                    .lock()
                    .expect("snapshot lock")
                    .clone()
                    .unwrap(),
            })
        }

        fn status(
            &self,
            _params: ExecutionProcessIdParams,
        ) -> Result<ExecutionProcessStatusResponse, String> {
            Ok(ExecutionProcessStatusResponse {
                snapshot: self
                    .snapshot
                    .lock()
                    .expect("snapshot lock")
                    .clone()
                    .unwrap(),
            })
        }

        fn drain_output(
            &self,
            params: ExecutionProcessDrainOutputParams,
        ) -> Result<ExecutionProcessDrainOutputResponse, String> {
            self.drain_params
                .lock()
                .expect("drain params lock")
                .push(params);
            let mut output = self.output.lock().expect("output lock");
            Ok(ExecutionProcessDrainOutputResponse {
                deltas: output.drain(..).collect(),
                next_sequence: Some(1),
            })
        }
    }

    #[tokio::test]
    async fn hook_runs_bash_through_live_execution_gateway() {
        let gateway = Arc::new(TestLiveExecutionProcessGateway::default());
        let hook = RuntimeLiveExecutionProcessHook::new(gateway);
        let turn_context = AgentTurnContext {
            approval_policy: Some("never".to_string()),
            sandbox_policy: Some("danger-full-access".to_string()),
            ..AgentTurnContext::default()
        };
        let tool_call = with_agent_turn_context(Some(turn_context), async {
            hook.execute_native_tool(NativeToolExecutionRequest {
                tool_name: "Bash".to_string(),
                tool_id: "tool-live-test".to_string(),
                params: json!({ "command": "printf live-process" }),
                context: native_tool_context(std::env::current_dir().unwrap_or_default()),
            })
        })
        .await
        .expect("bash should be handled by live execution hook");

        let result = tool_call.result.await.expect("tool result should succeed");

        assert_eq!(result.is_error, Some(false));
        assert_eq!(
            result
                .meta
                .as_ref()
                .and_then(|meta| meta.0.get("processId"))
                .and_then(Value::as_str),
            Some("process-tool-live-test")
        );
        assert_eq!(
            result
                .meta
                .as_ref()
                .and_then(|meta| meta.0.get("executionProcessControlStatus"))
                .and_then(Value::as_str),
            Some("registered")
        );
        assert_eq!(
            result
                .meta
                .as_ref()
                .and_then(|meta| meta.0.get("stdinWritable"))
                .and_then(Value::as_bool),
            Some(false)
        );
    }

    #[test]
    fn hook_ignores_background_shell_requests() {
        let hook = RuntimeLiveExecutionProcessHook::new(Arc::new(
            TestLiveExecutionProcessGateway::default(),
        ));
        let result = hook.execute_native_tool(NativeToolExecutionRequest {
            tool_name: "Bash".to_string(),
            tool_id: "tool-background".to_string(),
            params: json!({ "command": "sleep 1", "background": true }),
            context: native_tool_context(PathBuf::from(".")),
        });

        assert!(result.is_none());
    }

    #[tokio::test]
    async fn hook_applies_bytes_truncation_policy_to_live_process_drain() {
        let gateway = Arc::new(TestLiveExecutionProcessGateway::default());
        let hook = RuntimeLiveExecutionProcessHook::new(gateway.clone());
        let turn_context = AgentTurnContext {
            approval_policy: Some("never".to_string()),
            sandbox_policy: Some("danger-full-access".to_string()),
            metadata: HashMap::from([(
                "runtime_options".to_string(),
                json!({
                    "harness": {
                        "model_request_policy": {
                            "truncation_policy": {
                                "mode": "bytes",
                                "limit": 2048
                            }
                        }
                    }
                }),
            )]),
            ..AgentTurnContext::default()
        };

        let tool_call = with_agent_turn_context(Some(turn_context), async {
            hook.execute_native_tool(NativeToolExecutionRequest {
                tool_name: "Bash".to_string(),
                tool_id: "tool-truncation-policy".to_string(),
                params: json!({ "command": "printf live-process" }),
                context: native_tool_context(std::env::current_dir().unwrap_or_default()),
            })
        })
        .await
        .expect("bash should be handled by live execution hook");

        let result = tool_call.result.await.expect("tool result should succeed");
        assert_eq!(result.is_error, Some(false));

        let drain_params = gateway.drain_params.lock().expect("drain params lock");
        assert!(
            drain_params
                .iter()
                .any(|params| params.max_bytes == Some(2048)),
            "expected live process drain to use model bytes truncation policy, got {drain_params:?}"
        );
    }

    #[test]
    fn live_execution_output_drain_max_bytes_keeps_default_for_token_policy() {
        let turn_context = AgentTurnContext {
            metadata: HashMap::from([(
                "runtime_options".to_string(),
                json!({
                    "harness": {
                        "model_request_policy": {
                            "truncation_policy": {
                                "mode": "tokens",
                                "limit": 2048
                            }
                        }
                    }
                }),
            )]),
            ..AgentTurnContext::default()
        };

        assert_eq!(
            live_execution_output_drain_max_bytes(Some(&turn_context)),
            RUNTIME_LIVE_EXECUTION_DEFAULT_DRAIN_MAX_BYTES
        );
    }

    #[tokio::test]
    async fn hook_applies_token_truncation_policy_to_final_tool_output() {
        let output = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda ".repeat(20);
        let gateway = Arc::new(TestLiveExecutionProcessGateway::with_retained_output(
            output,
        ));
        let hook = RuntimeLiveExecutionProcessHook::new(gateway.clone());
        let turn_context = AgentTurnContext {
            approval_policy: Some("never".to_string()),
            sandbox_policy: Some("danger-full-access".to_string()),
            metadata: HashMap::from([(
                "runtime_options".to_string(),
                json!({
                    "harness": {
                        "model_request_policy": {
                            "truncation_policy": {
                                "mode": "tokens",
                                "limit": 12
                            }
                        }
                    }
                }),
            )]),
            ..AgentTurnContext::default()
        };

        let tool_call = with_agent_turn_context(Some(turn_context), async {
            hook.execute_native_tool(NativeToolExecutionRequest {
                tool_name: "Bash".to_string(),
                tool_id: "tool-token-truncation-policy".to_string(),
                params: json!({ "command": "printf large-output" }),
                context: native_tool_context(std::env::current_dir().unwrap_or_default()),
            })
        })
        .await
        .expect("bash should be handled by live execution hook");

        let result = tool_call.result.await.expect("tool result should succeed");
        let text: &str = result
            .content
            .iter()
            .find_map(|content| content.as_text())
            .map(|content| content.text.as_ref())
            .expect("text output");

        assert!(text.starts_with("Warning: truncated output"));
        assert!(text.contains("tokens truncated"));

        let drain_params = gateway.drain_params.lock().expect("drain params lock");
        assert!(
            drain_params
                .iter()
                .any(|params| params.max_bytes == Some(RUNTIME_LIVE_EXECUTION_DEFAULT_DRAIN_MAX_BYTES)),
            "token truncation should keep live drain bytes at current safety default, got {drain_params:?}"
        );
    }

    #[tokio::test]
    async fn hook_respects_native_tool_policy_disabling_shell() {
        let hook = RuntimeLiveExecutionProcessHook::new(Arc::new(
            TestLiveExecutionProcessGateway::default(),
        ));
        let turn_context = AgentTurnContext {
            approval_policy: Some("never".to_string()),
            sandbox_policy: Some("danger-full-access".to_string()),
            metadata: HashMap::from([(
                "runtime_options".to_string(),
                json!({
                    "harness": {
                        "model_request_policy": {
                            "native_tool_policy": {
                                "shell_type": "disabled",
                                "shell_tool_enabled": false
                            }
                        }
                    }
                }),
            )]),
            ..AgentTurnContext::default()
        };

        let result = with_agent_turn_context(Some(turn_context), async {
            hook.execute_native_tool(NativeToolExecutionRequest {
                tool_name: "Bash".to_string(),
                tool_id: "tool-shell-disabled".to_string(),
                params: json!({ "command": "printf should-not-run" }),
                context: native_tool_context(std::env::current_dir().unwrap_or_default()),
            })
        })
        .await;

        assert!(result.is_none());
    }

    #[tokio::test]
    async fn hook_rejects_legacy_shell_when_model_prefers_unified_exec() {
        let hook = RuntimeLiveExecutionProcessHook::new(Arc::new(
            TestLiveExecutionProcessGateway::default(),
        ));
        let turn_context = AgentTurnContext {
            approval_policy: Some("never".to_string()),
            sandbox_policy: Some("danger-full-access".to_string()),
            metadata: HashMap::from([(
                "runtime_options".to_string(),
                json!({
                    "harness": {
                        "model_request_policy": {
                            "native_tool_policy": {
                                "shell_type": "unified_exec"
                            }
                        }
                    }
                }),
            )]),
            ..AgentTurnContext::default()
        };

        let result = with_agent_turn_context(Some(turn_context), async {
            hook.execute_native_tool(NativeToolExecutionRequest {
                tool_name: "Bash".to_string(),
                tool_id: "tool-unified-exec-shell".to_string(),
                params: json!({ "command": "printf should-not-run" }),
                context: native_tool_context(std::env::current_dir().unwrap_or_default()),
            })
        })
        .await;

        assert!(result.is_none());
    }
}
