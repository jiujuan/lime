use crate::ActionRespondRequest;
use crate::CancelExecutionRequest;
use crate::ExecutionBackend;
use crate::ExecutionRequest;
use crate::RuntimeCoreError;
use crate::RuntimeEvent;
use crate::RuntimeEventSink;
use crate::RuntimeHostContext;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

pub const DEFAULT_EXTERNAL_BACKEND_TIMEOUT_MS: u64 = 30_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExternalBackendConfig {
    pub command: String,
    pub args: Vec<String>,
    pub timeout_ms: u64,
}

impl ExternalBackendConfig {
    pub fn new(command: impl Into<String>) -> Self {
        Self {
            command: command.into(),
            args: Vec::new(),
            timeout_ms: DEFAULT_EXTERNAL_BACKEND_TIMEOUT_MS,
        }
    }

    pub fn with_args(mut self, args: impl IntoIterator<Item = impl Into<String>>) -> Self {
        self.args = args.into_iter().map(Into::into).collect();
        self
    }

    pub fn with_timeout_ms(mut self, timeout_ms: u64) -> Self {
        self.timeout_ms = timeout_ms;
        self
    }
}

#[derive(Clone)]
pub struct ExternalBackend {
    config: ExternalBackendConfig,
}

impl ExternalBackend {
    pub fn new(config: ExternalBackendConfig) -> Self {
        Self { config }
    }

    async fn invoke(
        &self,
        kind: &str,
        request: serde_json::Value,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        let response = invoke_external_backend(&self.config, kind, request).await?;
        for event in response.events {
            sink.emit(RuntimeEvent::new(event.event_type, event.payload))?;
        }
        Ok(())
    }
}

#[async_trait]
impl ExecutionBackend for ExternalBackend {
    async fn start_turn(
        &self,
        request: ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.invoke("turnStart", start_turn_request_value(request), sink)
            .await
    }

    async fn cancel_turn(
        &self,
        request: CancelExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.invoke("turnCancel", cancel_turn_request_value(request), sink)
            .await
    }

    async fn respond_action(
        &self,
        request: ActionRespondRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<(), RuntimeCoreError> {
        self.invoke("actionRespond", action_respond_request_value(request), sink)
            .await
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExternalBackendResponse {
    #[serde(default)]
    events: Vec<ExternalBackendEvent>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExternalBackendEvent {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(default)]
    payload: serde_json::Value,
}

async fn invoke_external_backend(
    config: &ExternalBackendConfig,
    kind: &str,
    request: serde_json::Value,
) -> Result<ExternalBackendResponse, RuntimeCoreError> {
    if config.command.trim().is_empty() {
        return Err(RuntimeCoreError::Backend(
            "external app-server backend command is not configured".to_string(),
        ));
    }

    let input = json!({
        "kind": kind,
        "request": request,
    });

    let mut child = Command::new(&config.command)
        .args(&config.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            RuntimeCoreError::Backend(format!(
                "failed to spawn external app-server backend: {error}"
            ))
        })?;

    if let Some(mut stdin) = child.stdin.take() {
        let input = serde_json::to_vec(&input).map_err(|error| {
            RuntimeCoreError::Backend(format!(
                "failed to encode external app-server backend request: {error}"
            ))
        })?;
        stdin.write_all(&input).await.map_err(|error| {
            RuntimeCoreError::Backend(format!(
                "failed to write external app-server backend request: {error}"
            ))
        })?;
        stdin.write_all(b"\n").await.map_err(|error| {
            RuntimeCoreError::Backend(format!(
                "failed to finish external app-server backend request: {error}"
            ))
        })?;
    }

    let output = timeout(
        Duration::from_millis(config.timeout_ms),
        child.wait_with_output(),
    )
    .await
    .map_err(|_| {
        RuntimeCoreError::Backend(format!(
            "external app-server backend timed out after {}ms",
            config.timeout_ms
        ))
    })?
    .map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "failed to wait for external app-server backend: {error}"
        ))
    })?;

    if !output.status.success() {
        return Err(RuntimeCoreError::Backend(format!(
            "external app-server backend exited with status {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }

    serde_json::from_slice(&output.stdout).map_err(|error| {
        RuntimeCoreError::Backend(format!(
            "failed to decode external app-server backend response: {error}"
        ))
    })
}

fn host_value(host: RuntimeHostContext) -> serde_json::Value {
    json!({
        "clientName": host.client_name,
        "clientVersion": host.client_version,
    })
}

fn start_turn_request_value(request: ExecutionRequest) -> serde_json::Value {
    json!({
        "host": host_value(request.host),
        "session": request.session,
        "turn": request.turn,
        "input": request.input,
        "runtimeOptions": request.runtime_options,
        "eventName": request.event_name,
        "providerPreference": request.provider_preference,
        "modelPreference": request.model_preference,
        "metadata": request.metadata,
        "queuedTurnId": request.queued_turn_id,
        "queueIfBusy": request.queue_if_busy,
        "skipPreSubmitResume": request.skip_pre_submit_resume,
    })
}

fn cancel_turn_request_value(request: CancelExecutionRequest) -> serde_json::Value {
    json!({
        "host": host_value(request.host),
        "session": request.session,
        "turn": request.turn,
    })
}

fn action_respond_request_value(request: ActionRespondRequest) -> serde_json::Value {
    json!({
        "host": host_value(request.host),
        "session": request.session,
        "turn": request.turn,
        "requestId": request.request_id,
        "actionType": request.action_type,
        "confirmed": request.confirmed,
        "response": request.response,
        "userData": request.user_data,
        "metadata": request.metadata,
        "eventName": request.event_name,
        "actionScope": request.action_scope,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::RuntimeCore;
    use app_server_protocol::AgentSessionStartParams;
    use app_server_protocol::AgentSessionTurnStartParams;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::Arc;

    #[tokio::test]
    async fn external_backend_invokes_process_and_maps_runtime_events() {
        let Some(node) = node_binary() else {
            return;
        };
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let script_path = temp_dir.path().join("external-backend.mjs");
        fs::write(
            &script_path,
            r#"
              import { readFileSync } from 'node:fs';
              const input = JSON.parse(readFileSync(0, 'utf8'));
              const text = input.request.input?.text ?? '';
              console.log(JSON.stringify({
                events: [
                  {
                    type: 'message.delta',
                    payload: {
                      backend: 'external',
                      kind: input.kind,
                      inputTextLength: text.length
                    }
                  }
                ]
              }));
            "#,
        )
        .expect("write backend script");

        let core = RuntimeCore::with_backend(Arc::new(ExternalBackend::new(
            ExternalBackendConfig::new(node).with_args([script_path.to_string_lossy().to_string()]),
        )));
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_external".to_string()),
            thread_id: Some("thread_external".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: None,
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        let output = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_external".to_string(),
                    turn_id: Some("turn_external".to_string()),
                    input: app_server_protocol::AgentInput {
                        text: "draft".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext {
                    client_name: Some("content-studio".to_string()),
                    client_version: Some("0.1.0".to_string()),
                },
            )
            .await
            .expect("turn");

        assert_eq!(output.events.len(), 1);
        assert_eq!(output.events[0].event_type, "message.delta");
        assert_eq!(output.events[0].payload["backend"], "external");
        assert_eq!(output.events[0].payload["kind"], "turnStart");
        assert_eq!(output.events[0].payload["inputTextLength"], 5);
    }

    #[test]
    fn external_backend_config_keeps_command_and_args_separate() {
        let config = ExternalBackendConfig::new("/bin/backend")
            .with_args(["--mode", "agent"])
            .with_timeout_ms(42);

        assert_eq!(config.command, "/bin/backend");
        assert_eq!(config.args, vec!["--mode".to_string(), "agent".to_string()]);
        assert_eq!(config.timeout_ms, 42);
    }

    fn node_binary() -> Option<String> {
        let candidates = std::env::var("NODE")
            .ok()
            .into_iter()
            .chain(["node".to_string()]);
        for candidate in candidates {
            if std::process::Command::new(&candidate)
                .arg("--version")
                .output()
                .is_ok_and(|output| output.status.success())
            {
                return Some(candidate);
            }
        }
        None
    }

    #[allow(dead_code)]
    fn _assert_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<ExternalBackend>();
        assert_send_sync::<ExternalBackendConfig>();
        let _ = PathBuf::new();
    }
}
