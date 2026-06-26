use super::ExecutionRequest;
use super::RuntimeCore;
use super::RuntimeCoreError;
use super::RuntimeEvent;
use super::RuntimeEventSink;
use super::agent_app_task_runtime::{
    build_agent_app_task_runtime_contract, resolve_agent_app_runtime_dir,
};
use super::agent_app_worker_runtime::AgentAppWorkerRunRequest;
use super::timestamp;
use serde_json::Value;
use serde_json::json;

const CONTENT_FACTORY_APP_ID: &str = "content-factory-app";
const CONTENT_FACTORY_WORKSPACE_PATCH_KIND: &str = "content_factory.workspace_patch";
const PRODUCT_WORKSPACE_SCHEMA: &str = "product-workspace.v1";
const WORKER_REQUEST_SCHEMA: &str = "content-factory.worker-request.v1";
const DEFAULT_PRODUCT_PROFILE_TASK_KIND: &str = "content.factory.generate";
const CLOUD_RELEASE_SOURCE_KIND: &str = "cloud_release";
const WORKER_PACKAGE_SIGNATURE_UNVERIFIED: &str = "AGENT_APP_WORKER_PACKAGE_SIGNATURE_UNVERIFIED";

#[derive(Debug, Clone)]
struct ProductProfileWorkerTurn {
    app_id: String,
    action_key: Option<String>,
    prompt: String,
    source_object_ref: Option<Value>,
    task_kind: String,
    workspace_id: Option<String>,
}

impl RuntimeCore {
    pub(in crate::runtime) async fn maybe_run_agent_app_worker_turn(
        &self,
        request: &ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<bool, RuntimeCoreError> {
        let Some(worker_turn) = ProductProfileWorkerTurn::from_execution_request(request) else {
            return Ok(false);
        };
        let Some(installed_state) = self
            .find_agent_app_installed_state_for_worker(worker_turn.app_id.as_str())
            .await?
        else {
            return Ok(false);
        };

        sink.emit(RuntimeEvent::new(
            "turn.accepted",
            json!({
                "backend": "agent_app_worker",
                "appId": worker_turn.app_id,
                "taskKind": worker_turn.task_kind,
                "source": "right_surface_product_profile",
            }),
        ))?;

        let mut retry_attempt = 0;
        loop {
            match self
                .run_product_profile_worker_turn(request, &worker_turn, &installed_state)
                .await
            {
                Ok(events) => {
                    for event in events {
                        sink.emit(event)?;
                    }
                    sink.emit(RuntimeEvent::new(
                        "turn.completed",
                        json!({
                            "backend": "agent_app_worker",
                            "appId": worker_turn.app_id,
                            "taskId": worker_turn.task_id(request.turn.turn_id.as_str()),
                            "taskKind": worker_turn.task_kind,
                        }),
                    ))?;
                    break;
                }
                Err(error) => {
                    let failure = classify_worker_failure(error.to_string().as_str())
                        .with_retry_attempt(retry_attempt);
                    if failure.should_retry() {
                        sink.emit(RuntimeEvent::new(
                            "agent_app_worker.retry",
                            worker_turn.failure_payload(
                                request.turn.turn_id.as_str(),
                                &failure,
                                "retrying",
                            ),
                        ))?;
                        retry_attempt += 1;
                        continue;
                    }

                    let payload = worker_turn.failure_payload(
                        request.turn.turn_id.as_str(),
                        &failure,
                        "failed",
                    );
                    sink.emit(RuntimeEvent::new("runtime.error", payload.clone()))?;
                    sink.emit(RuntimeEvent::new("turn.failed", payload))?;
                    break;
                }
            }
        }

        Ok(true)
    }

    async fn run_product_profile_worker_turn(
        &self,
        request: &ExecutionRequest,
        worker_turn: &ProductProfileWorkerTurn,
        installed_state: &serde_json::Value,
    ) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
        if installed_state
            .get("disabled")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false)
        {
            return Err(RuntimeCoreError::Backend(format!(
                "Agent App 已禁用: {}",
                worker_turn.app_id
            )));
        }
        validate_worker_cloud_release_signature(installed_state)?;
        let package_root = resolve_agent_app_runtime_dir(&installed_state)?;
        let task_runtime =
            build_agent_app_task_runtime_contract(&installed_state, Some(&package_root));
        let worker_request = worker_turn.worker_request(
            request.session.session_id.as_str(),
            request.turn.turn_id.as_str(),
            task_runtime.worker_entrypoint.as_deref(),
        );

        self.run_agent_app_worker(AgentAppWorkerRunRequest::new(
            package_root,
            task_runtime,
            worker_request,
        ))
    }

    async fn find_agent_app_installed_state_for_worker(
        &self,
        app_id: &str,
    ) -> Result<Option<serde_json::Value>, RuntimeCoreError> {
        let list = self.app_data_source.list_agent_app_installed().await?;
        Ok(list
            .states
            .into_iter()
            .find(|state| json_string(state, &["appId"]).as_deref() == Some(app_id)))
    }
}

fn validate_worker_cloud_release_signature(
    installed_state: &Value,
) -> Result<(), RuntimeCoreError> {
    let source_kind = installed_state
        .get("identity")
        .and_then(|identity| json_string(identity, &["sourceKind", "source_kind"]));
    if source_kind.as_deref() != Some(CLOUD_RELEASE_SOURCE_KIND) {
        return Ok(());
    }

    let app_id =
        json_string(installed_state, &["appId", "app_id"]).unwrap_or_else(|| "unknown".to_string());
    let Some(evidence) = installed_state
        .get("setup")
        .and_then(|setup| setup.get("cloudReleaseEvidence"))
        .filter(|value| value.is_object())
    else {
        return Err(worker_package_signature_error(
            app_id.as_str(),
            "missing cloud release evidence",
        ));
    };

    let mut issues = Vec::new();
    if json_string(evidence, &["signaturePolicy", "signature_policy"]).as_deref()
        != Some("required")
    {
        issues.push("signature policy is not required");
    }
    if json_string(
        evidence,
        &[
            "signatureVerificationStatus",
            "signature_verification_status",
        ],
    )
    .as_deref()
        != Some("verified")
    {
        issues.push("signature is not verified");
    }
    if evidence
        .get("packageHashMatched")
        .or_else(|| evidence.get("package_hash_matched"))
        .and_then(Value::as_bool)
        != Some(true)
    {
        issues.push("package hash is not verified");
    }
    if evidence
        .get("manifestHashMatched")
        .or_else(|| evidence.get("manifest_hash_matched"))
        .and_then(Value::as_bool)
        != Some(true)
    {
        issues.push("manifest hash is not verified");
    }
    if json_string(
        evidence,
        &["packageVerificationStatus", "package_verification_status"],
    )
    .as_deref()
        != Some("verified")
    {
        issues.push("package verification is not verified");
    }
    if json_string(evidence, &["status"]).as_deref() != Some("ready") {
        issues.push("release evidence is not ready");
    }

    if issues.is_empty() {
        Ok(())
    } else {
        Err(worker_package_signature_error(
            app_id.as_str(),
            issues.join(", ").as_str(),
        ))
    }
}

fn worker_package_signature_error(app_id: &str, reason: &str) -> RuntimeCoreError {
    RuntimeCoreError::Backend(format!(
        "{WORKER_PACKAGE_SIGNATURE_UNVERIFIED}: cloud release package signature gate failed for {app_id}: {reason}"
    ))
}

#[derive(Debug, Clone)]
struct WorkerFailureProjection {
    error_code: &'static str,
    error_message: String,
    category: &'static str,
    retryable: bool,
    retry_advice: &'static str,
    retry_attempt: u64,
    retry_max_attempts: u64,
}

impl WorkerFailureProjection {
    fn with_retry_attempt(mut self, retry_attempt: u64) -> Self {
        self.retry_attempt = retry_attempt;
        self
    }

    fn should_retry(&self) -> bool {
        self.retryable && self.retry_attempt < self.retry_max_attempts
    }
}

fn classify_worker_failure(error_message: &str) -> WorkerFailureProjection {
    let lower = error_message.to_ascii_lowercase();
    let (error_code, category, retryable, retry_advice) =
        if lower.contains("已禁用") || lower.contains("disabled") {
            (
                "AGENT_APP_WORKER_DISABLED",
                "configuration",
                false,
                "enable_app",
            )
        } else if lower.contains("package_signature_unverified")
            || lower.contains("package signature gate")
        {
            (
                WORKER_PACKAGE_SIGNATURE_UNVERIFIED,
                "configuration",
                false,
                "reinstall_verified_package",
            )
        } else if lower.contains("blocker") {
            (
                "AGENT_APP_WORKER_BLOCKED",
                "configuration",
                false,
                "resolve_runtime_blocker",
            )
        } else if lower.contains("unsupported")
            || lower.contains("direct provider")
            || lower.contains("direct filesystem")
        {
            (
                "AGENT_APP_WORKER_CONTRACT_UNSUPPORTED",
                "configuration",
                false,
                "fix_runtime_contract",
            )
        } else if lower.contains("timed out") || lower.contains("timeout") {
            (
                "AGENT_APP_WORKER_TIMEOUT",
                "timeout",
                true,
                "retry_same_action",
            )
        } else if lower.contains("worker_retryable") {
            (
                "AGENT_APP_WORKER_RETRYABLE_FAILURE",
                "worker_retryable",
                true,
                "retry_same_action",
            )
        } else if lower.contains("missing artifacts")
            || lower.contains("artifact.snapshot")
            || lower.contains("did not complete")
            || lower.contains("decode")
            || lower.contains("json")
            || lower.contains("stdout")
        {
            (
                "AGENT_APP_WORKER_OUTPUT_INVALID",
                "worker_output",
                false,
                "inspect_worker_output",
            )
        } else if lower.contains("spawn")
            || lower.contains("exited")
            || lower.contains("entrypoint")
            || lower.contains("not found")
        {
            (
                "AGENT_APP_WORKER_RUNTIME_UNAVAILABLE",
                "runtime_unavailable",
                false,
                "fix_runtime_package",
            )
        } else {
            (
                "AGENT_APP_WORKER_FAILED",
                "unknown",
                false,
                "inspect_worker_log",
            )
        };
    WorkerFailureProjection {
        error_code,
        error_message: error_message.to_string(),
        category,
        retryable,
        retry_advice,
        retry_attempt: 0,
        retry_max_attempts: if retryable { 1 } else { 0 },
    }
}

impl ProductProfileWorkerTurn {
    fn from_execution_request(request: &ExecutionRequest) -> Option<Self> {
        let metadata = request.metadata.as_ref()?;
        if !is_product_profile_surface(metadata) {
            return None;
        }
        let agent_app = metadata
            .get("agent_app")
            .or_else(|| metadata.get("agentApp"))?;
        if json_string(agent_app, &["source"]).as_deref() != Some("right_surface_product_profile") {
            return None;
        }
        let app_id = json_string(agent_app, &["app_id", "appId"])?;
        if app_id != CONTENT_FACTORY_APP_ID {
            return None;
        }
        let action = agent_app
            .get("product_profile_action")
            .or_else(|| agent_app.get("productProfileAction"))?;
        if !action.is_object() {
            return None;
        }
        let task_kind = json_string(action, &["task_kind", "taskKind"])
            .unwrap_or_else(|| DEFAULT_PRODUCT_PROFILE_TASK_KIND.to_string());
        let prompt = json_string(action, &["prompt"]).unwrap_or_else(|| request.input.text.clone());
        if prompt.trim().is_empty() {
            return None;
        }
        Some(Self {
            app_id,
            action_key: json_string(action, &["key"]),
            prompt,
            source_object_ref: action
                .get("object")
                .filter(|value| value.is_object())
                .cloned(),
            task_kind,
            workspace_id: json_string(agent_app, &["workspace_id", "workspaceId"])
                .or_else(|| request.session.workspace_id.clone()),
        })
    }

    fn worker_request(
        &self,
        session_id: &str,
        turn_id: &str,
        worker_entrypoint: Option<&str>,
    ) -> Value {
        json!({
            "schemaVersion": WORKER_REQUEST_SCHEMA,
            "appId": self.app_id,
            "sessionId": session_id,
            "workspaceId": self.workspace_id,
            "turnId": turn_id,
            "taskId": self.task_id(turn_id),
            "taskKind": self.task_kind,
            "prompt": self.prompt,
            "actionKey": self.action_key,
            "sourceObjectRef": self.source_object_ref,
            "expectedOutput": {
                "artifactKind": CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
                "productWorkspaceSchema": PRODUCT_WORKSPACE_SCHEMA,
                "objectKinds": [
                    "contentBrief",
                    "articleDraft",
                    "imageGenerationSet",
                    "videoScript",
                    "videoStoryboard",
                    "deliveryChecklist"
                ],
                "requiredObjectKinds": [
                    "articleDraft",
                    "imageGenerationSet",
                    "videoStoryboard",
                    "deliveryChecklist"
                ]
            },
            "runtime": {
                "workerEntrypoint": worker_entrypoint,
                "outputArtifactKind": CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
                "directProviderAccess": false,
                "directFilesystemAccess": false
            },
            "requestedAt": timestamp(),
        })
    }

    fn task_id(&self, turn_id: &str) -> String {
        format!(
            "{turn_id}:{}",
            self.action_key
                .as_deref()
                .unwrap_or("product-profile-action")
        )
    }

    fn failure_payload(
        &self,
        turn_id: &str,
        failure: &WorkerFailureProjection,
        status: &str,
    ) -> Value {
        json!({
            "source": "agent_app_task_worker",
            "backend": "agent_app_worker",
            "appId": self.app_id,
            "taskId": self.task_id(turn_id),
            "taskKind": self.task_kind,
            "turnId": turn_id,
            "status": status,
            "errorCode": failure.error_code,
            "errorMessage": failure.error_message,
            "message": failure.error_message,
            "failureCategory": failure.category,
            "retryable": failure.retryable,
            "retryAdvice": failure.retry_advice,
            "retryAttempt": failure.retry_attempt,
            "retryMaxAttempts": failure.retry_max_attempts,
            "metadata": {
                "agentAppWorker": {
                    "appId": self.app_id,
                    "taskId": self.task_id(turn_id),
                    "taskKind": self.task_kind,
                    "turnId": turn_id,
                    "status": status,
                    "inputSummary": format!("prompt={}", self.prompt),
                    "errorCode": failure.error_code,
                    "errorMessage": failure.error_message,
                    "failureCategory": failure.category,
                    "retryable": failure.retryable,
                    "retryAdvice": failure.retry_advice,
                    "retryAttempt": failure.retry_attempt,
                    "retryMaxAttempts": failure.retry_max_attempts,
                }
            },
        })
    }
}

fn is_product_profile_surface(metadata: &Value) -> bool {
    metadata
        .get("right_surface")
        .or_else(|| metadata.get("rightSurface"))
        .and_then(|right_surface| json_string(right_surface, &["surface_kind", "surfaceKind"]))
        .as_deref()
        == Some("productProfile")
}

fn json_string(value: &Value, path: &[&str]) -> Option<String> {
    for key in path {
        if let Some(value) = value.get(*key).and_then(Value::as_str) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use app_server_protocol::AgentInput;
    use app_server_protocol::AgentSession;
    use app_server_protocol::AgentSessionStatus;
    use app_server_protocol::AgentTurn;
    use app_server_protocol::AgentTurnStatus;

    #[tokio::test]
    async fn skips_worker_turn_when_content_factory_is_not_installed() {
        let request = execution_request(json!({
            "agent_app": {
                "source": "right_surface_product_profile",
                "app_id": CONTENT_FACTORY_APP_ID,
                "product_profile_action": {
                    "key": "regenerate",
                    "task_kind": "content.image.generate",
                    "prompt": "重新生成配图"
                }
            },
            "right_surface": {
                "surface_kind": "productProfile"
            }
        }));
        let mut sink = TestRuntimeEventSink::default();

        let handled = RuntimeCore::default()
            .maybe_run_agent_app_worker_turn(&request, &mut sink)
            .await
            .expect("worker dispatch check");

        assert!(!handled);
        assert!(sink.events.is_empty());
    }

    #[test]
    fn extracts_content_factory_product_profile_worker_turn() {
        let request = execution_request(json!({
            "agent_app": {
                "source": "right_surface_product_profile",
                "app_id": CONTENT_FACTORY_APP_ID,
                "session_id": "session-content-factory",
                "workspace_id": "workspace-main",
                "product_profile_action": {
                    "key": "regenerate",
                    "task_kind": "content.image.generate",
                    "prompt": "重新生成配图",
                    "object": {
                        "app_id": CONTENT_FACTORY_APP_ID,
                        "kind": "imageGenerationSet",
                        "id": "image-set-1",
                        "session_id": "session-content-factory",
                        "artifact_ids": ["artifact-image-set-1"]
                    }
                }
            },
            "right_surface": {
                "surface_kind": "productProfile"
            }
        }));

        let worker_turn =
            ProductProfileWorkerTurn::from_execution_request(&request).expect("worker turn");

        assert_eq!(worker_turn.app_id, CONTENT_FACTORY_APP_ID);
        assert_eq!(worker_turn.action_key.as_deref(), Some("regenerate"));
        assert_eq!(worker_turn.task_kind, "content.image.generate");
        assert_eq!(worker_turn.workspace_id.as_deref(), Some("workspace-main"));
        assert_eq!(
            worker_turn.source_object_ref.unwrap()["kind"].as_str(),
            Some("imageGenerationSet")
        );
    }

    #[test]
    fn classifies_worker_failures_for_retry_projection() {
        let timeout = classify_worker_failure("Agent App worker timed out after 100ms");
        assert_eq!(timeout.error_code, "AGENT_APP_WORKER_TIMEOUT");
        assert_eq!(timeout.category, "timeout");
        assert!(timeout.retryable);
        assert_eq!(timeout.retry_advice, "retry_same_action");
        assert_eq!(timeout.retry_max_attempts, 1);

        let blocker = classify_worker_failure("Agent App worker runtime has blockers: key");
        assert_eq!(blocker.error_code, "AGENT_APP_WORKER_BLOCKED");
        assert_eq!(blocker.category, "configuration");
        assert!(!blocker.retryable);
        assert_eq!(blocker.retry_advice, "resolve_runtime_blocker");

        let unsupported =
            classify_worker_failure("Agent App worker direct provider access is unsupported.");
        assert_eq!(
            unsupported.error_code,
            "AGENT_APP_WORKER_CONTRACT_UNSUPPORTED"
        );
        assert_eq!(unsupported.category, "configuration");
        assert!(!unsupported.retryable);
        assert_eq!(unsupported.retry_advice, "fix_runtime_contract");

        let retryable =
            classify_worker_failure("Agent App worker did not complete: WORKER_RETRYABLE");
        assert_eq!(retryable.error_code, "AGENT_APP_WORKER_RETRYABLE_FAILURE");
        assert_eq!(retryable.category, "worker_retryable");
        assert!(retryable.retryable);
        assert_eq!(retryable.retry_advice, "retry_same_action");
        assert_eq!(retryable.retry_max_attempts, 1);
        assert!(retryable.should_retry());
        assert!(!retryable.with_retry_attempt(1).should_retry());

        let invalid_output =
            classify_worker_failure("failed to decode Agent App worker response: expected value");
        assert_eq!(invalid_output.error_code, "AGENT_APP_WORKER_OUTPUT_INVALID");
        assert_eq!(invalid_output.category, "worker_output");
        assert!(!invalid_output.retryable);
        assert_eq!(invalid_output.retry_advice, "inspect_worker_output");
    }

    #[test]
    fn accepts_verified_cloud_release_signature_evidence_for_worker() {
        let installed_state = json!({
            "schemaVersion": "agent-app.installed-state.v1",
            "appId": "content-factory-app",
            "identity": {
                "appId": "content-factory-app",
                "sourceKind": "cloud_release",
                "sourceUri": "https://lime.local/agent-apps/content-factory-app/releases/0.3.0/package.zip",
                "packageHash": "sha256:test-package",
                "manifestHash": "sha256:test-manifest"
            },
            "setup": {
                "cloudReleaseEvidence": {
                    "status": "ready",
                    "signaturePolicy": "required",
                    "signatureVerificationStatus": "verified",
                    "packageHashMatched": true,
                    "manifestHashMatched": true,
                    "packageVerificationStatus": "verified"
                }
            }
        });

        validate_worker_cloud_release_signature(&installed_state)
            .expect("verified evidence should pass");
    }

    #[test]
    fn rejects_cloud_release_worker_without_verified_signature_evidence() {
        let installed_state = json!({
            "schemaVersion": "agent-app.installed-state.v1",
            "appId": "content-factory-app",
            "identity": {
                "appId": "content-factory-app",
                "sourceKind": "cloud_release",
                "sourceUri": "https://lime.local/agent-apps/content-factory-app/releases/0.3.0/package.zip",
                "packageHash": "sha256:test-package",
                "manifestHash": "sha256:test-manifest"
            },
            "setup": {
                "cloudReleaseEvidence": {
                    "status": "blocked",
                    "signaturePolicy": "required",
                    "signatureVerificationStatus": "declared",
                    "packageHashMatched": true,
                    "manifestHashMatched": true,
                    "packageVerificationStatus": "verified"
                }
            }
        });

        let error = validate_worker_cloud_release_signature(&installed_state)
            .expect_err("unverified evidence should fail");
        let failure = classify_worker_failure(error.to_string().as_str());

        assert_eq!(
            failure.error_code,
            "AGENT_APP_WORKER_PACKAGE_SIGNATURE_UNVERIFIED"
        );
        assert_eq!(failure.category, "configuration");
        assert_eq!(failure.retry_advice, "reinstall_verified_package");
        assert!(!failure.retryable);
    }

    fn execution_request(metadata: Value) -> ExecutionRequest {
        ExecutionRequest {
            host: super::super::RuntimeHostContext::default(),
            session: AgentSession {
                session_id: "session-content-factory".to_string(),
                thread_id: "thread-content-factory".to_string(),
                app_id: CONTENT_FACTORY_APP_ID.to_string(),
                workspace_id: Some("workspace-main".to_string()),
                business_object_ref: None,
                status: AgentSessionStatus::Running,
                created_at: timestamp(),
                updated_at: timestamp(),
            },
            turn: AgentTurn {
                turn_id: "turn-action-1".to_string(),
                session_id: "session-content-factory".to_string(),
                thread_id: "thread-content-factory".to_string(),
                status: AgentTurnStatus::Accepted,
                started_at: Some(timestamp()),
                completed_at: None,
            },
            input: AgentInput {
                text: "重新生成配图".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            expected_output: None,
            structured_output: None,
            output_schema: None,
            event_name: None,
            provider_preference: None,
            model_preference: None,
            metadata: Some(metadata),
            queued_turn_id: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        }
    }

    #[derive(Default)]
    struct TestRuntimeEventSink {
        events: Vec<RuntimeEvent>,
    }

    impl RuntimeEventSink for TestRuntimeEventSink {
        fn emit(&mut self, event: RuntimeEvent) -> Result<(), RuntimeCoreError> {
            self.events.push(event);
            Ok(())
        }
    }
}
