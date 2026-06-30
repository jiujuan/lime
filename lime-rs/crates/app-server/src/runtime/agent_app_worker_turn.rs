use super::agent_app_task_runtime::{
    build_agent_app_task_runtime_contract, resolve_agent_app_runtime_dir,
};
use super::agent_app_worker_runtime::AgentAppWorkerRunRequest;
use super::timestamp;
use super::ExecutionRequest;
use super::RuntimeCore;
use super::RuntimeCoreError;
use super::RuntimeEvent;
use super::RuntimeEventSink;
use serde_json::json;
use serde_json::Value;

const CONTENT_FACTORY_APP_ID: &str = "content-factory-app";
const CONTENT_FACTORY_WORKSPACE_PATCH_KIND: &str = "content_factory.workspace_patch";
const ARTICLE_WORKSPACE_SCHEMA: &str = "article-workspace.v1";
const WORKER_REQUEST_SCHEMA: &str = "content-factory.worker-request.v1";
const DEFAULT_ARTICLE_WORKSPACE_TASK_KIND: &str = "content.factory.generate";
const CLOUD_RELEASE_SOURCE_KIND: &str = "cloud_release";
const WORKER_PACKAGE_SIGNATURE_UNVERIFIED: &str = "AGENT_APP_WORKER_PACKAGE_SIGNATURE_UNVERIFIED";
const WORKER_REMOTE_RUNTIME_DISABLED: &str = "AGENT_APP_WORKER_REMOTE_RUNTIME_DISABLED";
const WORKER_OUTPUT_UNAUTHORIZED: &str = "AGENT_APP_WORKER_OUTPUT_UNAUTHORIZED";
const WORKER_REQUEST_INVALID: &str = "AGENT_APP_WORKER_REQUEST_INVALID";
const PANE_ACTION_SOURCE: &str = "right_surface_pane_action";
const PLUGIN_ACTIVATION_SOURCE: &str = "plugin_activation_context";

#[derive(Debug, Clone)]
struct PaneActionWorkerTurn {
    app_id: String,
    action_key: Option<String>,
    action_intent: Option<String>,
    action_risk: Option<String>,
    prompt: String,
    source_object_ref: Option<Value>,
    source_artifact_ids: Vec<String>,
    source: String,
    surface_kind: Option<String>,
    pane_kind: Option<String>,
    output_artifact_kind: Option<String>,
    task_kind: String,
    workspace_id: Option<String>,
}

#[derive(Debug, Clone)]
enum PaneActionWorkerTurnResolution {
    Run(PaneActionWorkerTurn),
    Reject(PaneActionWorkerRejection),
    Ignore,
}

#[derive(Debug, Clone)]
struct PaneActionWorkerRejection {
    app_id: Option<String>,
    action_key: Option<String>,
    error_code: &'static str,
    error_message: String,
    output_artifact_kind: Option<String>,
    pane_kind: Option<String>,
    source: String,
    surface_kind: Option<String>,
    task_kind: Option<String>,
    workspace_id: Option<String>,
}

impl RuntimeCore {
    pub(in crate::runtime) async fn maybe_run_agent_app_worker_turn(
        &self,
        request: &ExecutionRequest,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<bool, RuntimeCoreError> {
        let worker_turn = match PaneActionWorkerTurn::resolve_from_execution_request(request) {
            PaneActionWorkerTurnResolution::Run(worker_turn) => worker_turn,
            PaneActionWorkerTurnResolution::Reject(rejection) => {
                sink.emit(RuntimeEvent::new(
                    "turn.accepted",
                    rejection.accepted_payload(),
                ))?;
                let payload = rejection.failure_payload(request.turn.turn_id.as_str());
                sink.emit(RuntimeEvent::new("runtime.error", payload.clone()))?;
                sink.emit(RuntimeEvent::new("turn.failed", payload))?;
                return Ok(true);
            }
            PaneActionWorkerTurnResolution::Ignore => return Ok(false),
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
                "source": worker_turn.source,
                "surfaceKind": worker_turn.surface_kind,
                "paneKind": worker_turn.pane_kind,
                "outputArtifactKind": worker_turn.output_artifact_kind(),
            }),
        ))?;

        let mut retry_attempt = 0;
        loop {
            match self
                .run_pane_action_worker_turn(request, &worker_turn, &installed_state)
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
                            "outputArtifactKind": worker_turn.output_artifact_kind(),
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

    async fn run_pane_action_worker_turn(
        &self,
        request: &ExecutionRequest,
        worker_turn: &PaneActionWorkerTurn,
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

        let mut events = self.run_agent_app_worker(AgentAppWorkerRunRequest::new(
            package_root,
            task_runtime,
            worker_request,
        ))?;
        self.backend
            .prepare_runtime_worker_artifact_events(request, &mut events)
            .await?;
        Ok(events)
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
    let signature_policy = json_string(evidence, &["signaturePolicy", "signature_policy"])
        .unwrap_or_else(|| "required".to_string());
    let signature_status = json_string(
        evidence,
        &[
            "signatureVerificationStatus",
            "signature_verification_status",
        ],
    )
    .unwrap_or_else(|| "not_configured".to_string());
    let signature_required = signature_policy == "required";
    if signature_required && signature_status != "verified" {
        issues.push("required signature is not verified");
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
    let evidence_status = json_string(evidence, &["status"]).unwrap_or_else(|| "blocked".into());
    if evidence_status == "blocked" {
        issues.push("release evidence is blocked");
    } else if signature_required && evidence_status != "ready" {
        issues.push("required-signature release evidence is not ready");
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

impl PaneActionWorkerRejection {
    fn accepted_payload(&self) -> Value {
        json!({
            "backend": "agent_app_worker",
            "appId": self.app_id,
            "taskKind": self.task_kind,
            "source": self.source,
            "workspaceId": self.workspace_id,
            "surfaceKind": self.surface_kind,
            "paneKind": self.pane_kind,
            "outputArtifactKind": self.output_artifact_kind,
            "authorization": "denied",
            "reasonCode": self.error_code,
        })
    }

    fn failure_payload(&self, turn_id: &str) -> Value {
        json!({
            "source": "agent_app_task_worker",
            "backend": "agent_app_worker",
            "appId": self.app_id,
            "taskId": self.task_id(turn_id),
            "taskKind": self.task_kind,
            "turnId": turn_id,
            "workspaceId": self.workspace_id,
            "surfaceKind": self.surface_kind,
            "paneKind": self.pane_kind,
            "outputArtifactKind": self.output_artifact_kind,
            "status": "failed",
            "authorization": "denied",
            "errorCode": self.error_code,
            "errorMessage": self.error_message,
            "message": self.error_message,
            "failureCategory": "configuration",
            "retryable": false,
            "retryAdvice": "fix_runtime_contract",
            "metadata": {
                "agentAppWorker": {
                    "appId": self.app_id,
                    "taskId": self.task_id(turn_id),
                    "taskKind": self.task_kind,
                    "turnId": turn_id,
                    "source": self.source,
                    "workspaceId": self.workspace_id,
                    "surfaceKind": self.surface_kind,
                    "paneKind": self.pane_kind,
                    "outputArtifactKind": self.output_artifact_kind,
                    "status": "failed",
                    "authorization": "denied",
                    "errorCode": self.error_code,
                    "errorMessage": self.error_message,
                    "failureCategory": "configuration",
                    "retryable": false,
                    "retryAdvice": "fix_runtime_contract",
                }
            },
        })
    }

    fn task_id(&self, turn_id: &str) -> String {
        format!(
            "{turn_id}:{}",
            self.action_key.as_deref().unwrap_or("pane-action")
        )
    }
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

impl PaneActionWorkerTurn {
    #[cfg(test)]
    fn from_execution_request(request: &ExecutionRequest) -> Option<Self> {
        match Self::resolve_from_execution_request(request) {
            PaneActionWorkerTurnResolution::Run(worker_turn) => Some(worker_turn),
            PaneActionWorkerTurnResolution::Reject(_) | PaneActionWorkerTurnResolution::Ignore => {
                None
            }
        }
    }

    fn resolve_from_execution_request(
        request: &ExecutionRequest,
    ) -> PaneActionWorkerTurnResolution {
        match Self::resolve_plugin_activation_request(request) {
            PaneActionWorkerTurnResolution::Ignore => {
                match Self::resolve_pane_action_request(request) {
                    PaneActionWorkerTurnResolution::Ignore => {
                        Self::resolve_article_workspace_action_request(request)
                    }
                    resolution => resolution,
                }
            }
            resolution => resolution,
        }
    }

    fn resolve_plugin_activation_request(
        request: &ExecutionRequest,
    ) -> PaneActionWorkerTurnResolution {
        let Some(metadata) = request.metadata.as_ref() else {
            return PaneActionWorkerTurnResolution::Ignore;
        };
        let Some(activation) = plugin_activation_value(metadata) else {
            return PaneActionWorkerTurnResolution::Ignore;
        };
        let Some(plugin_id) = json_string(activation, &["plugin_id", "pluginId"]) else {
            return PaneActionWorkerTurnResolution::Ignore;
        };
        if plugin_id != CONTENT_FACTORY_APP_ID {
            return PaneActionWorkerTurnResolution::Ignore;
        }
        let app_id = json_string(activation, &["active_agent_app_id", "activeAgentAppId"])
            .unwrap_or(plugin_id);
        if app_id != CONTENT_FACTORY_APP_ID {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                activation,
                None,
                WORKER_REMOTE_RUNTIME_DISABLED,
                format!("Remote Agent App runtime is disabled for app: {app_id}"),
            ));
        }
        let prompt =
            json_string(activation, &["body"]).unwrap_or_else(|| request.input.text.clone());
        if prompt.trim().is_empty() {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                activation,
                None,
                WORKER_REQUEST_INVALID,
                "Plugin activation prompt is missing.",
            ));
        }
        let requested_output_artifact_kind =
            json_string(activation, &["output_artifact_kind", "outputArtifactKind"]);
        let Some(output_artifact_kind) =
            content_factory_output_artifact_kind(requested_output_artifact_kind.clone())
        else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                activation,
                None,
                WORKER_OUTPUT_UNAUTHORIZED,
                format!(
                    "Agent App worker output artifact kind is not authorized: {}",
                    requested_output_artifact_kind
                        .as_deref()
                        .unwrap_or("<missing>")
                ),
            ));
        };
        let selected_object_ref = activation
            .get("selected_object_ref")
            .or_else(|| activation.get("selectedObjectRef"))
            .filter(|value| value.is_object())
            .cloned();
        let selected_object_kind = selected_object_ref
            .as_ref()
            .and_then(|object| json_string(object, &["object_kind", "objectKind"]));
        let source_artifact_ids = selected_object_ref
            .as_ref()
            .map(|object| json_string_array(object, &["artifact_ids", "artifactIds"]))
            .unwrap_or_default();
        PaneActionWorkerTurnResolution::Run(Self {
            app_id,
            action_key: json_string(activation, &["intent_key", "intentKey"])
                .or_else(|| Some("plugin-activation".to_string())),
            action_intent: Some("plugin_activation".to_string()),
            action_risk: Some("write".to_string()),
            prompt,
            source_object_ref: selected_object_ref,
            source_artifact_ids,
            source: PLUGIN_ACTIVATION_SOURCE.to_string(),
            surface_kind: json_string(activation, &["right_surface", "rightSurface"])
                .or_else(|| Some("articleWorkspace".to_string())),
            pane_kind: selected_object_kind.or_else(|| Some("articleDraft".to_string())),
            output_artifact_kind,
            task_kind: json_string(activation, &["task_kind", "taskKind"])
                .unwrap_or_else(|| DEFAULT_ARTICLE_WORKSPACE_TASK_KIND.to_string()),
            workspace_id: request.session.workspace_id.clone(),
        })
    }

    fn resolve_pane_action_request(request: &ExecutionRequest) -> PaneActionWorkerTurnResolution {
        let Some(metadata) = request.metadata.as_ref() else {
            return PaneActionWorkerTurnResolution::Ignore;
        };
        let Some(agent_app) = metadata
            .get("agent_app")
            .or_else(|| metadata.get("agentApp"))
        else {
            return PaneActionWorkerTurnResolution::Ignore;
        };
        let Some(action) = agent_app
            .get("pane_action")
            .or_else(|| agent_app.get("paneAction"))
        else {
            return PaneActionWorkerTurnResolution::Ignore;
        };
        if !action.is_object() {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                agent_app,
                Some(action),
                WORKER_REQUEST_INVALID,
                "Agent App pane action metadata must be an object.",
            ));
        }
        let Some(app_id) = json_string(agent_app, &["app_id", "appId"]) else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                agent_app,
                Some(action),
                WORKER_REQUEST_INVALID,
                "Agent App pane action app id is missing.",
            ));
        };
        if app_id != CONTENT_FACTORY_APP_ID {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                agent_app,
                Some(action),
                WORKER_REMOTE_RUNTIME_DISABLED,
                format!("Remote Agent App runtime is disabled for app: {app_id}"),
            ));
        }
        let task_kind = json_string(action, &["task_kind", "taskKind"])
            .unwrap_or_else(|| DEFAULT_ARTICLE_WORKSPACE_TASK_KIND.to_string());
        let prompt = json_string(action, &["prompt"]).unwrap_or_else(|| request.input.text.clone());
        if prompt.trim().is_empty() {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                agent_app,
                Some(action),
                WORKER_REQUEST_INVALID,
                "Agent App pane action prompt is missing.",
            ));
        }
        let Some(surface_kind) = json_string(action, &["surface_kind", "surfaceKind"])
            .or_else(|| right_surface_string(metadata, &["surface_kind", "surfaceKind"]))
        else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                agent_app,
                Some(action),
                WORKER_REQUEST_INVALID,
                "Agent App pane action surface kind is missing.",
            ));
        };
        let Some(pane_kind) = json_string(action, &["pane_kind", "paneKind"])
            .or_else(|| right_surface_string(metadata, &["pane_kind", "paneKind"]))
        else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                agent_app,
                Some(action),
                WORKER_REQUEST_INVALID,
                "Agent App pane action pane kind is missing.",
            ));
        };
        let requested_output_artifact_kind =
            json_string(action, &["output_artifact_kind", "outputArtifactKind"]);
        let Some(output_artifact_kind) =
            content_factory_output_artifact_kind(requested_output_artifact_kind.clone())
        else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                agent_app,
                Some(action),
                WORKER_OUTPUT_UNAUTHORIZED,
                format!(
                    "Agent App worker output artifact kind is not authorized: {}",
                    requested_output_artifact_kind
                        .as_deref()
                        .unwrap_or("<missing>")
                ),
            ));
        };
        PaneActionWorkerTurnResolution::Run(Self {
            app_id,
            action_key: json_string(action, &["key"]),
            action_intent: json_string(action, &["intent"]),
            action_risk: json_string(action, &["risk"]),
            prompt,
            source_object_ref: action
                .get("object")
                .filter(|value| value.is_object())
                .cloned(),
            source_artifact_ids: json_string_array(
                action,
                &["source_artifact_ids", "sourceArtifactIds"],
            ),
            source: json_string(agent_app, &["source"])
                .unwrap_or_else(|| PANE_ACTION_SOURCE.to_string()),
            surface_kind: Some(surface_kind),
            pane_kind: Some(pane_kind),
            output_artifact_kind,
            task_kind,
            workspace_id: json_string(agent_app, &["workspace_id", "workspaceId"])
                .or_else(|| request.session.workspace_id.clone()),
        })
    }

    fn resolve_article_workspace_action_request(
        request: &ExecutionRequest,
    ) -> PaneActionWorkerTurnResolution {
        let Some(metadata) = request.metadata.as_ref() else {
            return PaneActionWorkerTurnResolution::Ignore;
        };
        if !is_article_workspace_surface(metadata) {
            return PaneActionWorkerTurnResolution::Ignore;
        }
        let Some(agent_app) = metadata
            .get("agent_app")
            .or_else(|| metadata.get("agentApp"))
        else {
            return PaneActionWorkerTurnResolution::Ignore;
        };
        if !matches!(
            json_string(agent_app, &["source"]).as_deref(),
            Some("right_surface_article_workspace")
        ) {
            return PaneActionWorkerTurnResolution::Ignore;
        }
        let Some(app_id) = json_string(agent_app, &["app_id", "appId"]) else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                agent_app,
                None,
                WORKER_REQUEST_INVALID,
                "Article Workspace action app id is missing.",
            ));
        };
        if app_id != CONTENT_FACTORY_APP_ID {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                agent_app,
                None,
                WORKER_REMOTE_RUNTIME_DISABLED,
                format!("Remote Agent App runtime is disabled for app: {app_id}"),
            ));
        }
        let Some(action) = agent_app
            .get("article_workspace_action")
            .or_else(|| agent_app.get("articleWorkspaceAction"))
        else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                agent_app,
                None,
                WORKER_REQUEST_INVALID,
                "Article Workspace action metadata is missing.",
            ));
        };
        if !action.is_object() {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                agent_app,
                Some(action),
                WORKER_REQUEST_INVALID,
                "Article Workspace action metadata must be an object.",
            ));
        }
        let task_kind = json_string(action, &["task_kind", "taskKind"])
            .unwrap_or_else(|| DEFAULT_ARTICLE_WORKSPACE_TASK_KIND.to_string());
        let prompt = json_string(action, &["prompt"]).unwrap_or_else(|| request.input.text.clone());
        if prompt.trim().is_empty() {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                agent_app,
                Some(action),
                WORKER_REQUEST_INVALID,
                "Article Workspace action prompt is missing.",
            ));
        }
        let requested_output_artifact_kind =
            json_string(action, &["output_artifact_kind", "outputArtifactKind"]);
        let Some(output_artifact_kind) =
            content_factory_output_artifact_kind(requested_output_artifact_kind.clone())
        else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                agent_app,
                Some(action),
                WORKER_OUTPUT_UNAUTHORIZED,
                format!(
                    "Agent App worker output artifact kind is not authorized: {}",
                    requested_output_artifact_kind
                        .as_deref()
                        .unwrap_or("<missing>")
                ),
            ));
        };
        let mut source_artifact_ids =
            json_string_array(action, &["source_artifact_ids", "sourceArtifactIds"]);
        if source_artifact_ids.is_empty() {
            if let Some(object) = action.get("object").filter(|value| value.is_object()) {
                source_artifact_ids = json_string_array(object, &["artifact_ids", "artifactIds"]);
            }
        }

        PaneActionWorkerTurnResolution::Run(Self {
            app_id,
            action_key: json_string(action, &["key"]),
            action_intent: json_string(action, &["intent"]),
            action_risk: json_string(action, &["risk"]),
            prompt,
            source_object_ref: action
                .get("object")
                .filter(|value| value.is_object())
                .cloned(),
            source_artifact_ids,
            source: "right_surface_article_workspace".to_string(),
            surface_kind: Some("articleWorkspace".to_string()),
            pane_kind: right_surface_string(metadata, &["pane_kind", "paneKind"]).or_else(|| {
                action
                    .get("object")
                    .and_then(|object| json_string(object, &["kind"]))
            }),
            output_artifact_kind,
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
            "actionIntent": self.action_intent,
            "actionRisk": self.action_risk,
            "source": self.source,
            "surfaceKind": self.surface_kind,
            "paneKind": self.pane_kind,
            "outputArtifactKind": self.output_artifact_kind(),
            "sourceArtifactIds": self.source_artifact_ids,
            "sourceObjectRef": self.source_object_ref,
            "expectedOutput": {
                "artifactKind": self.output_artifact_kind(),
                "articleWorkspaceSchema": ARTICLE_WORKSPACE_SCHEMA,
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
                "outputArtifactKind": self.output_artifact_kind(),
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
                .unwrap_or("article-workspace-action")
        )
    }

    fn output_artifact_kind(&self) -> &str {
        self.output_artifact_kind
            .as_deref()
            .unwrap_or(CONTENT_FACTORY_WORKSPACE_PATCH_KIND)
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
            "surfaceKind": self.surface_kind,
            "paneKind": self.pane_kind,
            "outputArtifactKind": self.output_artifact_kind(),
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
                    "source": self.source,
                    "surfaceKind": self.surface_kind,
                    "paneKind": self.pane_kind,
                    "outputArtifactKind": self.output_artifact_kind(),
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

fn is_article_workspace_surface(metadata: &Value) -> bool {
    matches!(
        metadata
            .get("right_surface")
            .or_else(|| metadata.get("rightSurface"))
            .and_then(|right_surface| json_string(right_surface, &["surface_kind", "surfaceKind"]))
            .as_deref(),
        Some("articleWorkspace")
    )
}

fn worker_rejection_from_values(
    request: &ExecutionRequest,
    agent_app: &Value,
    action: Option<&Value>,
    error_code: &'static str,
    error_message: impl Into<String>,
) -> PaneActionWorkerRejection {
    let metadata = request.metadata.as_ref();
    PaneActionWorkerRejection {
        app_id: json_string(agent_app, &["app_id", "appId"]),
        action_key: action.and_then(|action| json_string(action, &["key"])),
        error_code,
        error_message: error_message.into(),
        output_artifact_kind: action.and_then(|action| {
            json_string(action, &["output_artifact_kind", "outputArtifactKind"])
        }),
        pane_kind: action
            .and_then(|action| json_string(action, &["pane_kind", "paneKind"]))
            .or_else(|| {
                metadata
                    .and_then(|metadata| right_surface_string(metadata, &["pane_kind", "paneKind"]))
            }),
        source: json_string(agent_app, &["source"])
            .unwrap_or_else(|| PANE_ACTION_SOURCE.to_string()),
        surface_kind: action
            .and_then(|action| json_string(action, &["surface_kind", "surfaceKind"]))
            .or_else(|| {
                metadata.and_then(|metadata| {
                    right_surface_string(metadata, &["surface_kind", "surfaceKind"])
                })
            }),
        task_kind: action.and_then(|action| json_string(action, &["task_kind", "taskKind"])),
        workspace_id: json_string(agent_app, &["workspace_id", "workspaceId"])
            .or_else(|| request.session.workspace_id.clone()),
    }
}

fn right_surface_string(metadata: &Value, path: &[&str]) -> Option<String> {
    metadata
        .get("right_surface")
        .or_else(|| metadata.get("rightSurface"))
        .and_then(|right_surface| json_string(right_surface, path))
}

fn plugin_activation_value(metadata: &Value) -> Option<&Value> {
    metadata
        .pointer("/harness/plugin_activation")
        .or_else(|| metadata.pointer("/harness/pluginActivation"))
        .or_else(|| metadata.get("plugin_activation"))
        .or_else(|| metadata.get("pluginActivation"))
}

fn content_factory_output_artifact_kind(
    output_artifact_kind: Option<String>,
) -> Option<Option<String>> {
    match output_artifact_kind.as_deref() {
        None => None,
        Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND) => Some(output_artifact_kind),
        Some(_) => None,
    }
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

fn json_string_array(value: &Value, path: &[&str]) -> Vec<String> {
    for key in path {
        let Some(items) = value.get(*key).and_then(Value::as_array) else {
            continue;
        };
        let mut result = Vec::new();
        for item in items {
            let Some(raw) = item.as_str() else {
                continue;
            };
            let trimmed = raw.trim();
            if trimmed.is_empty() || result.iter().any(|existing| existing == trimmed) {
                continue;
            }
            result.push(trimmed.to_string());
        }
        return result;
    }
    Vec::new()
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
                "source": "right_surface_article_workspace",
                "app_id": CONTENT_FACTORY_APP_ID,
                "article_workspace_action": {
                    "key": "regenerate",
                    "task_kind": "content.image.generate",
                    "output_artifact_kind": CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
                    "prompt": "重新生成配图"
                }
            },
            "right_surface": {
                "surface_kind": "articleWorkspace"
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
    fn extracts_content_factory_article_workspace_worker_turn() {
        let request = execution_request(json!({
            "agent_app": {
                "source": "right_surface_article_workspace",
                "app_id": CONTENT_FACTORY_APP_ID,
                "session_id": "session-content-factory",
                "workspace_id": "workspace-main",
                "article_workspace_action": {
                    "key": "regenerate",
                    "task_kind": "content.image.generate",
                    "output_artifact_kind": CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
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
                "surface_kind": "articleWorkspace"
            }
        }));

        let worker_turn =
            PaneActionWorkerTurn::from_execution_request(&request).expect("worker turn");

        assert_eq!(worker_turn.app_id, CONTENT_FACTORY_APP_ID);
        assert_eq!(worker_turn.action_key.as_deref(), Some("regenerate"));
        assert_eq!(worker_turn.task_kind, "content.image.generate");
        assert_eq!(worker_turn.workspace_id.as_deref(), Some("workspace-main"));
        assert_eq!(
            worker_turn.surface_kind.as_deref(),
            Some("articleWorkspace")
        );
        assert_eq!(worker_turn.pane_kind.as_deref(), Some("imageGenerationSet"));
        assert_eq!(
            worker_turn.output_artifact_kind.as_deref(),
            Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND)
        );
        assert_eq!(
            worker_turn.source_artifact_ids,
            vec!["artifact-image-set-1"]
        );
        assert_eq!(
            worker_turn.source_object_ref.unwrap()["kind"].as_str(),
            Some("imageGenerationSet")
        );
    }

    #[test]
    fn extracts_content_factory_plugin_activation_worker_turn() {
        let request = execution_request(json!({
            "harness": {
                "plugin_activation": {
                    "source": "plugin_explicit_mention",
                    "trigger": "@内容工厂",
                    "body": "写一篇公众号文章",
                    "session_id": "session-content-factory",
                    "plugin_id": CONTENT_FACTORY_APP_ID,
                    "active_agent_app_id": CONTENT_FACTORY_APP_ID,
                    "active_entry_key": "content_factory",
                    "intent_key": "content_article_generate",
                    "task_kind": "content.article.generate",
                    "output_artifact_kind": CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
                    "right_surface": "articleWorkspace",
                    "expected_objects": ["articleDraft"],
                    "selected_object_ref": {
                        "plugin_id": CONTENT_FACTORY_APP_ID,
                        "object_kind": "articleDraft",
                        "object_id": "pending"
                    },
                    "opened_tabs": ["articleWorkspace"],
                    "context_source": "user"
                }
            }
        }));

        let worker_turn =
            PaneActionWorkerTurn::from_execution_request(&request).expect("worker turn");

        assert_eq!(worker_turn.app_id, CONTENT_FACTORY_APP_ID);
        assert_eq!(
            worker_turn.action_key.as_deref(),
            Some("content_article_generate")
        );
        assert_eq!(
            worker_turn.action_intent.as_deref(),
            Some("plugin_activation")
        );
        assert_eq!(worker_turn.source, PLUGIN_ACTIVATION_SOURCE);
        assert_eq!(worker_turn.task_kind, "content.article.generate");
        assert_eq!(worker_turn.prompt, "写一篇公众号文章");
        assert_eq!(
            worker_turn.surface_kind.as_deref(),
            Some("articleWorkspace")
        );
        assert_eq!(worker_turn.pane_kind.as_deref(), Some("articleDraft"));
        assert_eq!(
            worker_turn.output_artifact_kind.as_deref(),
            Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND)
        );
    }

    #[test]
    fn ignores_non_content_factory_plugin_activation_worker_turn() {
        let request = execution_request(json!({
            "harness": {
                "plugin_activation": {
                    "source": "plugin_explicit_mention",
                    "trigger": "@其他插件",
                    "body": "写文章",
                    "session_id": "session-other",
                    "plugin_id": "other-plugin",
                    "active_entry_key": "other"
                }
            }
        }));

        assert!(PaneActionWorkerTurn::from_execution_request(&request).is_none());
    }

    #[test]
    fn extracts_content_factory_custom_pane_action_worker_turn() {
        let request = execution_request(json!({
            "agent_app": {
                "source": PANE_ACTION_SOURCE,
                "app_id": CONTENT_FACTORY_APP_ID,
                "session_id": "session-content-factory",
                "workspace_id": "workspace-main",
                "pane_action": {
                    "key": "regenerate",
                    "intent": "regenerate",
                    "risk": "write",
                    "task_kind": "content.image.generate",
                    "output_artifact_kind": CONTENT_FACTORY_WORKSPACE_PATCH_KIND,
                    "prompt": "重新生成配图",
                    "surface_kind": "appSurface",
                    "pane_kind": "imageGrid",
                    "source_artifact_ids": ["artifact-image-set-1", "artifact-image-set-1"],
                    "object": {
                        "app_id": CONTENT_FACTORY_APP_ID,
                        "kind": "imageGenerationSet",
                        "id": "image-set-1",
                        "session_id": "session-content-factory"
                    }
                }
            },
            "right_surface": {
                "surface_kind": "appSurface",
                "pane_kind": "imageGrid"
            }
        }));

        let worker_turn =
            PaneActionWorkerTurn::from_execution_request(&request).expect("worker turn");
        let worker_request = worker_turn.worker_request(
            request.session.session_id.as_str(),
            request.turn.turn_id.as_str(),
            Some("./src/runtime/content-factory-worker.mjs"),
        );

        assert_eq!(worker_turn.app_id, CONTENT_FACTORY_APP_ID);
        assert_eq!(worker_turn.source, PANE_ACTION_SOURCE);
        assert_eq!(worker_turn.action_key.as_deref(), Some("regenerate"));
        assert_eq!(worker_turn.action_intent.as_deref(), Some("regenerate"));
        assert_eq!(worker_turn.action_risk.as_deref(), Some("write"));
        assert_eq!(worker_turn.surface_kind.as_deref(), Some("appSurface"));
        assert_eq!(worker_turn.pane_kind.as_deref(), Some("imageGrid"));
        assert_eq!(
            worker_turn.output_artifact_kind.as_deref(),
            Some(CONTENT_FACTORY_WORKSPACE_PATCH_KIND)
        );
        assert_eq!(
            worker_turn.source_artifact_ids,
            vec!["artifact-image-set-1"]
        );
        assert_eq!(worker_request["surfaceKind"], "appSurface");
        assert_eq!(worker_request["paneKind"], "imageGrid");
        assert_eq!(
            worker_request["sourceArtifactIds"][0],
            "artifact-image-set-1"
        );
        assert_eq!(
            worker_request["outputArtifactKind"],
            CONTENT_FACTORY_WORKSPACE_PATCH_KIND
        );
        assert_eq!(
            worker_request["expectedOutput"]["artifactKind"],
            CONTENT_FACTORY_WORKSPACE_PATCH_KIND
        );
        assert_eq!(
            worker_request["runtime"]["outputArtifactKind"],
            CONTENT_FACTORY_WORKSPACE_PATCH_KIND
        );
    }

    #[test]
    fn rejects_unsupported_pane_action_output_artifact_kind() {
        let request = execution_request(json!({
            "agent_app": {
                "source": PANE_ACTION_SOURCE,
                "app_id": CONTENT_FACTORY_APP_ID,
                "pane_action": {
                    "key": "regenerate",
                    "task_kind": "content.image.generate",
                    "output_artifact_kind": "other.workspace_patch",
                    "prompt": "重新生成配图",
                    "surface_kind": "appSurface",
                    "pane_kind": "imageGrid"
                }
            },
            "right_surface": {
                "surface_kind": "appSurface",
                "pane_kind": "imageGrid"
            }
        }));

        assert!(PaneActionWorkerTurn::from_execution_request(&request).is_none());
    }

    #[test]
    fn rejects_remote_plugin_pane_action_runtime() {
        let request = execution_request(json!({
            "agent_app": {
                "source": PANE_ACTION_SOURCE,
                "app_id": "creator-pack",
                "pane_action": {
                    "key": "regenerate",
                    "task_kind": "creator.generate",
                    "output_artifact_kind": "creator.workspace_patch",
                    "prompt": "重新生成内容",
                    "surface_kind": "appSurface",
                    "pane_kind": "creatorCanvas"
                }
            },
            "right_surface": {
                "surface_kind": "appSurface",
                "pane_kind": "creatorCanvas"
            }
        }));

        let PaneActionWorkerTurnResolution::Reject(rejection) =
            PaneActionWorkerTurn::resolve_from_execution_request(&request)
        else {
            panic!("remote plugin runtime should be rejected");
        };

        assert_eq!(
            rejection.error_code,
            "AGENT_APP_WORKER_REMOTE_RUNTIME_DISABLED"
        );
        assert_eq!(rejection.app_id.as_deref(), Some("creator-pack"));
        assert_eq!(
            rejection.output_artifact_kind.as_deref(),
            Some("creator.workspace_patch")
        );
        assert!(rejection
            .error_message
            .contains("Remote Agent App runtime is disabled"));
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
    fn accepts_optional_seeded_cloud_release_signature_warning_for_worker() {
        let installed_state = json!({
            "schemaVersion": "agent-app.installed-state.v1",
            "appId": "content-factory-app",
            "identity": {
                "appId": "content-factory-app",
                "sourceKind": "cloud_release",
                "sourceUri": "https://seeded.local/agent-apps/content-factory-app/2.0.0.lapp",
                "packageHash": "sha256:test-package",
                "manifestHash": "sha256:test-manifest"
            },
            "setup": {
                "cloudReleaseEvidence": {
                    "status": "warning",
                    "signaturePolicy": "optional",
                    "signatureVerificationStatus": "not_configured",
                    "packageHashMatched": true,
                    "manifestHashMatched": true,
                    "packageVerificationStatus": "verified"
                }
            }
        });

        validate_worker_cloud_release_signature(&installed_state)
            .expect("optional seeded signature warning should not block worker");
    }

    #[test]
    fn rejects_cloud_release_worker_without_release_evidence() {
        let installed_state = json!({
            "schemaVersion": "agent-app.installed-state.v1",
            "appId": "content-factory-app",
            "identity": {
                "appId": "content-factory-app",
                "sourceKind": "cloud_release",
                "sourceUri": "https://seeded.local/agent-apps/content-factory-app/2.0.0.lapp",
                "packageHash": "sha256:test-package",
                "manifestHash": "sha256:test-manifest"
            },
            "setup": {}
        });

        let error = validate_worker_cloud_release_signature(&installed_state)
            .expect_err("missing evidence should fail closed");
        assert!(error.to_string().contains("missing cloud release evidence"));
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
