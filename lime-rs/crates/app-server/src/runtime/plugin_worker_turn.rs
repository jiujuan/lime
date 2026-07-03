use super::plugin_task_runtime::{build_plugin_task_runtime_contract, resolve_plugin_runtime_dir};
use super::plugin_worker_orchestration::{
    hook_refs_for_scope, resolve_plugin_worker_orchestration, string_list_field,
    PluginWorkerOrchestration, PluginWorkerOrchestrationOverrides,
};
use super::plugin_worker_runtime::{PluginHookRunRequest, PluginWorkerRunRequest};
use super::plugin_worker_streaming::{
    ensure_workspace_patch_artifact_paths, initial_workspace_patch_snapshot,
    is_incomplete_workspace_patch_snapshot, WorkspacePatchStreamingSnapshot,
};
use super::plugin_worker_workflow::{
    build_plugin_worker_workflow_context, workflow_completed_events,
    workflow_connector_completed_events_from_artifact_events, workflow_failed_events,
    workflow_started_events, PluginWorkerWorkflowContext, PluginWorkerWorkflowContextInput,
};
use super::plugin_worker_workflow_hooks::workflow_hook_completed_events_from_worker_hook_events;
use super::plugin_worker_workflow_retry::workflow_retry_events;
use super::timestamp;
use super::ExecutionRequest;
use super::RuntimeCore;
use super::RuntimeCoreError;
use super::RuntimeEvent;
use super::RuntimeEventSink;
use serde_json::json;
use serde_json::Value;
use std::path::Path;
use std::time::Duration;

const WORKER_APP_ID: &str = "content-factory-app";
const WORKSPACE_PATCH_KIND: &str = "content_factory.workspace_patch";
const ARTICLE_WORKSPACE_SCHEMA: &str = "article-workspace.v1";
const WORKER_REQUEST_SCHEMA: &str = "content-factory.worker-request.v1";
const DEFAULT_ARTICLE_WORKSPACE_TASK_KIND: &str = "content.factory.generate";
const CLOUD_RELEASE_SOURCE_KIND: &str = "cloud_release";
const WORKER_PACKAGE_SIGNATURE_UNVERIFIED: &str = "PLUGIN_WORKER_PACKAGE_SIGNATURE_UNVERIFIED";
const WORKER_REMOTE_RUNTIME_DISABLED: &str = "PLUGIN_WORKER_REMOTE_RUNTIME_DISABLED";
const WORKER_OUTPUT_UNAUTHORIZED: &str = "PLUGIN_WORKER_OUTPUT_UNAUTHORIZED";
const WORKER_REQUEST_INVALID: &str = "PLUGIN_WORKER_REQUEST_INVALID";
const PANE_ACTION_SOURCE: &str = "right_surface_pane_action";
const PLUGIN_ACTIVATION_SOURCE: &str = "plugin_activation_context";
const HOOK_REQUEST_SCHEMA: &str = "lime.plugin.hook-request.v1";

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
    workflow_key: Option<String>,
    hook_policy: Option<Value>,
    subagents: Vec<String>,
    skill_refs: Vec<String>,
    cli_refs: Vec<String>,
    connector_refs: Vec<String>,
    orchestration: Option<Value>,
    workspace_id: Option<String>,
}

#[derive(Debug, Clone)]
struct PluginHookDeclaration {
    key: String,
    event: Option<String>,
    entrypoint: Option<String>,
    required: bool,
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
    pub(in crate::runtime) async fn maybe_run_plugin_worker_turn(
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
            .find_plugin_installed_state_for_worker(worker_turn.app_id.as_str())
            .await?
        else {
            return Ok(false);
        };

        sink.emit(RuntimeEvent::new(
            "turn.accepted",
            json!({
                "backend": "plugin_worker",
                "appId": worker_turn.app_id,
                "taskKind": worker_turn.task_kind,
                "source": worker_turn.source,
                "surfaceKind": worker_turn.surface_kind,
                "paneKind": worker_turn.pane_kind,
                "outputArtifactKind": worker_turn.output_artifact_kind(),
            }),
        ))?;

        if let Err(error) =
            validate_worker_turn_launch_preconditions(&installed_state, &worker_turn)
        {
            let failure = classify_worker_failure(error.to_string().as_str());
            let payload =
                worker_turn.failure_payload(request.turn.turn_id.as_str(), &failure, "failed");
            sink.emit(RuntimeEvent::new("runtime.error", payload.clone()))?;
            sink.emit(RuntimeEvent::new("turn.failed", payload))?;
            return Ok(true);
        }

        let package_root = resolve_plugin_runtime_dir(&installed_state)?;
        let workflow_context = worker_turn.workflow_context(request, &installed_state);
        if let Some(context) = workflow_context.as_ref() {
            self.append_workflow_audit_runtime_events(request, workflow_started_events(context))?;
        }
        let prompt_hook_events = self.run_worker_hook_lifecycle_events(
            package_root.as_path(),
            &installed_state,
            &worker_turn,
            request,
            "prompt",
            "prompt.submit",
            None,
        );
        if let Some(context) = workflow_context.as_ref() {
            self.append_workflow_audit_runtime_events(
                request,
                workflow_hook_completed_events_from_worker_hook_events(
                    context,
                    &prompt_hook_events,
                )
                .map_err(RuntimeCoreError::Backend)?,
            )?;
        }

        if worker_turn.should_emit_initial_workspace_snapshot() {
            let task_id = worker_turn.task_id(request.turn.turn_id.as_str());
            sink.emit(RuntimeEvent::new(
                "message.delta",
                json!({
                    "role": "assistant",
                    "visibility": "user_visible",
                    "content": {
                        "kind": "inline_text",
                        "text": worker_turn.prompt,
                    },
                    "status": "streaming",
                    "streamPhase": "process",
                }),
            ))?;
            sink.emit(initial_workspace_patch_snapshot(
                WorkspacePatchStreamingSnapshot {
                    app_id: worker_turn.app_id.as_str(),
                    locale: runtime_locale(request).as_deref(),
                    prompt: worker_turn.prompt.as_str(),
                    process_markdown: None,
                    session_id: request.session.session_id.as_str(),
                    surface_kind: worker_turn.surface_kind.as_deref(),
                    task_id: task_id.as_str(),
                    task_kind: worker_turn.task_kind.as_str(),
                    turn_id: request.turn.turn_id.as_str(),
                    workspace_id: worker_turn.workspace_id.as_deref(),
                },
            ))?;
        }

        let mut retry_attempt = 0;
        loop {
            match self
                .run_pane_action_worker_turn(
                    request,
                    &worker_turn,
                    &installed_state,
                    workflow_context.as_ref(),
                    sink,
                )
                .await
            {
                Ok(events) => {
                    let completion_context = worker_completion_context(&events);
                    for event in events
                        .into_iter()
                        .filter(|event| !is_incomplete_workspace_patch_snapshot(event))
                    {
                        sink.emit(event)?;
                    }
                    let task_hook_events = self.run_worker_hook_lifecycle_events(
                        package_root.as_path(),
                        &installed_state,
                        &worker_turn,
                        request,
                        "task",
                        "task.complete",
                        Some(completion_context.clone()),
                    );
                    if let Some(context) = workflow_context.as_ref() {
                        self.append_workflow_audit_runtime_events(
                            request,
                            workflow_hook_completed_events_from_worker_hook_events(
                                context,
                                &task_hook_events,
                            )
                            .map_err(RuntimeCoreError::Backend)?,
                        )?;
                    }
                    if let Some(context) = workflow_context.as_ref() {
                        self.append_workflow_audit_runtime_events(
                            request,
                            workflow_completed_events(context, &completion_context),
                        )?;
                    }
                    sink.emit(RuntimeEvent::new(
                        "turn.completed",
                        json!({
                            "backend": "plugin_worker",
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
                        let payload = worker_turn.failure_payload(
                            request.turn.turn_id.as_str(),
                            &failure,
                            "retrying",
                        );
                        if let Some(context) = workflow_context.as_ref() {
                            self.append_workflow_audit_runtime_events(
                                request,
                                workflow_retry_events(context, &payload),
                            )?;
                        }
                        sink.emit(RuntimeEvent::new("plugin_worker.retry", payload))?;
                        retry_attempt += 1;
                        continue;
                    }

                    let payload = worker_turn.failure_payload(
                        request.turn.turn_id.as_str(),
                        &failure,
                        "failed",
                    );
                    if let Some(context) = workflow_context.as_ref() {
                        self.append_workflow_audit_runtime_events(
                            request,
                            workflow_failed_events(context, &payload),
                        )?;
                    }
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
        workflow_context: Option<&PluginWorkerWorkflowContext>,
        sink: &mut dyn RuntimeEventSink,
    ) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
        let package_root = resolve_plugin_runtime_dir(&installed_state)?;
        let task_runtime =
            build_plugin_task_runtime_contract(&installed_state, Some(&package_root));
        let mut worker_request = worker_turn.worker_request(
            request.session.session_id.as_str(),
            request.turn.turn_id.as_str(),
            task_runtime.worker_entrypoint.as_deref(),
            installed_state,
        );
        self.backend
            .prepare_plugin_worker_request(request, &mut worker_request)
            .await?;

        let mut emitted_workspace_progress = false;
        let mut events = self.run_plugin_worker_with_progress(
            PluginWorkerRunRequest::new(package_root, task_runtime, worker_request),
            &mut |event| {
                let progress_events = worker_progress_events_for_sink(event, workflow_context)?;
                let (audit_events, ui_events) = split_workflow_audit_events(progress_events);
                self.append_workflow_audit_runtime_events(request, audit_events)?;
                if ui_events.iter().any(is_streaming_workspace_patch_snapshot) {
                    emitted_workspace_progress = true;
                }
                emit_worker_progress_events(sink, ui_events)
            },
        )?;
        self.backend
            .prepare_runtime_worker_artifact_events(request, &mut events)
            .await?;
        if let Some(context) = workflow_context {
            self.append_workflow_audit_runtime_events(
                request,
                workflow_connector_completed_events_from_artifact_events(context, &events)
                    .map_err(RuntimeCoreError::Backend)?,
            )?;
        }
        if emitted_workspace_progress {
            events.retain(|event| !is_streaming_workspace_patch_snapshot(event));
        }
        Ok(events)
    }

    fn run_worker_hook_lifecycle_events(
        &self,
        package_root: &Path,
        installed_state: &Value,
        worker_turn: &PaneActionWorkerTurn,
        request: &ExecutionRequest,
        hook_scope: &str,
        hook_event: &str,
        completion_context: Option<Value>,
    ) -> Vec<RuntimeEvent> {
        let orchestration = worker_turn.worker_orchestration(installed_state);
        let refs = orchestration
            .hook_policy
            .as_ref()
            .map(|policy| hook_refs_for_scope(policy, hook_scope))
            .unwrap_or_default();
        if refs.is_empty() {
            return Vec::new();
        }
        let declarations = hook_declarations(installed_state);
        refs.into_iter()
            .map(|hook_key| {
                let declaration = declarations
                    .iter()
                    .find(|declaration| declaration.matches(hook_key.as_str(), hook_event));
                let payload = match declaration {
                    Some(declaration) => match declaration.entrypoint.as_deref() {
                        Some(entrypoint) => {
                            let hook_request = worker_turn.hook_request_payload(
                                request,
                                &orchestration,
                                hook_scope,
                                hook_event,
                                hook_key.as_str(),
                                completion_context.clone(),
                            );
                            match self.run_plugin_hook(PluginHookRunRequest::new(
                                package_root,
                                entrypoint,
                                hook_request,
                            )) {
                                Ok(result) => {
                                    let status = hook_result_status(&result).to_string();
                                    worker_turn.hook_lifecycle_payload(
                                        request,
                                        &orchestration,
                                        hook_scope,
                                        hook_event,
                                        hook_key.as_str(),
                                        Some(declaration),
                                        status.as_str(),
                                        None,
                                        Some(result),
                                        completion_context.clone(),
                                    )
                                }
                                Err(error) => worker_turn.hook_lifecycle_payload(
                                    request,
                                    &orchestration,
                                    hook_scope,
                                    hook_event,
                                    hook_key.as_str(),
                                    Some(declaration),
                                    if declaration.required {
                                        "failed"
                                    } else {
                                        "skipped"
                                    },
                                    Some(hook_error_reason(error.to_string().as_str())),
                                    None,
                                    completion_context.clone(),
                                ),
                            }
                        }
                        None => worker_turn.hook_lifecycle_payload(
                            request,
                            &orchestration,
                            hook_scope,
                            hook_event,
                            hook_key.as_str(),
                            Some(declaration),
                            "skipped",
                            Some("HOOK_HANDLER_ENTRYPOINT_MISSING"),
                            None,
                            completion_context.clone(),
                        ),
                    },
                    None => worker_turn.hook_lifecycle_payload(
                        request,
                        &orchestration,
                        hook_scope,
                        hook_event,
                        hook_key.as_str(),
                        None,
                        "skipped",
                        Some("HOOK_HANDLER_NOT_DECLARED"),
                        None,
                        completion_context.clone(),
                    ),
                };
                RuntimeEvent::new("plugin_worker.hook", payload)
            })
            .collect()
    }

    async fn find_plugin_installed_state_for_worker(
        &self,
        app_id: &str,
    ) -> Result<Option<serde_json::Value>, RuntimeCoreError> {
        let list = self.app_data_source.list_plugin_installed().await?;
        Ok(list
            .states
            .into_iter()
            .find(|state| json_string(state, &["appId"]).as_deref() == Some(app_id)))
    }
}

fn worker_progress_events_for_sink(
    event: RuntimeEvent,
    workflow_context: Option<&PluginWorkerWorkflowContext>,
) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
    if event.event_type.starts_with("workflow.") {
        let context = workflow_context.ok_or_else(|| {
            RuntimeCoreError::Backend(format!(
                "Plugin worker emitted {} without plugin workflow context",
                event.event_type
            ))
        })?;
        return context
            .bind_worker_progress_event(event)
            .map(|event| vec![event])
            .map_err(RuntimeCoreError::Backend);
    }
    if event.event_type != "artifact.snapshot" {
        return Ok(vec![event]);
    }
    let mut events = vec![event];
    ensure_workspace_patch_artifact_paths(events.as_mut_slice());
    Ok(events)
}

fn emit_worker_progress_events(
    sink: &mut dyn RuntimeEventSink,
    events: Vec<RuntimeEvent>,
) -> Result<(), RuntimeCoreError> {
    let total = events.len();
    for (index, event) in events.into_iter().enumerate() {
        sink.emit(event)?;
        if total > 1 && index + 1 < total {
            std::thread::sleep(Duration::from_millis(80));
        }
    }
    Ok(())
}

fn split_workflow_audit_events(
    events: Vec<RuntimeEvent>,
) -> (Vec<RuntimeEvent>, Vec<RuntimeEvent>) {
    let mut audit_events = Vec::new();
    let mut ui_events = Vec::new();
    for event in events {
        if is_workflow_audit_event_type(event.event_type.as_str()) {
            audit_events.push(event);
        } else {
            ui_events.push(event);
        }
    }
    (audit_events, ui_events)
}

fn is_workflow_audit_event_type(event_type: &str) -> bool {
    event_type.starts_with("workflow.")
}

fn is_streaming_workspace_patch_snapshot(event: &RuntimeEvent) -> bool {
    if event.event_type != "artifact.snapshot" {
        return false;
    }
    let Some(artifact) = event.payload.get("artifact") else {
        return false;
    };
    artifact
        .get("metadata")
        .and_then(|metadata| metadata.get("complete"))
        .and_then(Value::as_bool)
        == Some(false)
        && (artifact
            .get("metadata")
            .and_then(|metadata| metadata.get("contentFactoryWorkspacePatch"))
            .is_some()
            || artifact
                .get("metadata")
                .and_then(|metadata| metadata.get("workspace_patch"))
                .is_some())
}

fn hook_result_status(result: &Value) -> &str {
    match json_string(result, &["status"]).as_deref() {
        Some("completed" | "ok" | "ready") | None => "completed",
        Some("skipped") => "skipped",
        Some("failed" | "error") => "failed",
        Some(_) => "completed",
    }
}

fn hook_error_reason(error_message: &str) -> &'static str {
    let lower = error_message.to_ascii_lowercase();
    if lower.contains("not found") {
        "HOOK_HANDLER_NOT_FOUND"
    } else if lower.contains("timed out") || lower.contains("timeout") {
        "HOOK_HANDLER_TIMEOUT"
    } else if lower.contains("decode") || lower.contains("json") || lower.contains("stdout") {
        "HOOK_HANDLER_OUTPUT_INVALID"
    } else {
        "HOOK_HANDLER_FAILED"
    }
}

fn worker_completion_context(events: &[RuntimeEvent]) -> Value {
    let artifact_refs = events
        .iter()
        .filter(|event| event.event_type == "artifact.snapshot")
        .filter_map(|event| {
            let artifact = event.payload.get("artifact").unwrap_or(&event.payload);
            json_string(
                artifact,
                &[
                    "artifactId",
                    "artifact_id",
                    "artifactRef",
                    "artifact_ref",
                    "path",
                ],
            )
        })
        .collect::<Vec<_>>();
    let artifact_count = artifact_refs.len();
    json!({
        "status": "completed",
        "artifactRefs": artifact_refs,
        "artifactCount": artifact_count,
    })
}

fn hook_declarations(installed_state: &Value) -> Vec<PluginHookDeclaration> {
    let manifest = installed_state.get("manifest").unwrap_or(installed_state);
    let agent_runtime = manifest.get("agentRuntime");
    let runtime_package = manifest.get("runtimePackage");
    let sources = [
        agent_runtime
            .and_then(|runtime| runtime.get("hooks"))
            .and_then(|hooks| hooks.get("handlers")),
        runtime_package
            .and_then(|runtime| runtime.get("hooks"))
            .and_then(|hooks| hooks.get("handlers")),
        manifest
            .get("hooks")
            .and_then(|hooks| hooks.get("handlers")),
        manifest.get("hooks"),
    ];
    let mut declarations = Vec::new();
    for source in sources.into_iter().flatten() {
        let Some(items) = source.as_array() else {
            continue;
        };
        for item in items {
            let Some(key) = json_string(item, &["key", "id"]) else {
                continue;
            };
            let event = json_string(item, &["event", "hookEvent"]);
            if declarations.iter().any(|existing: &PluginHookDeclaration| {
                existing.key == key && existing.event == event
            }) {
                continue;
            }
            declarations.push(PluginHookDeclaration {
                key,
                event,
                entrypoint: json_string(item, &["entrypoint", "path"]),
                required: item
                    .get("required")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            });
        }
    }
    declarations
}

fn host_managed_generation_config(installed_state: &Value) -> Option<Value> {
    let manifest = installed_state.get("manifest").unwrap_or(installed_state);
    manifest
        .pointer("/agentRuntime/worker/hostManagedGeneration")
        .or_else(|| manifest.pointer("/runtimePackage/worker/hostManagedGeneration"))
        .filter(|value| value.is_object())
        .cloned()
}

impl PluginHookDeclaration {
    fn matches(&self, key: &str, hook_event: &str) -> bool {
        self.key == key
            && self
                .event
                .as_deref()
                .map(|event| event == hook_event)
                .unwrap_or(true)
    }
}

fn validate_worker_turn_launch_preconditions(
    installed_state: &Value,
    worker_turn: &PaneActionWorkerTurn,
) -> Result<(), RuntimeCoreError> {
    if installed_state
        .get("disabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
    {
        return Err(RuntimeCoreError::Backend(format!(
            "Plugin 已禁用: {}",
            worker_turn.app_id
        )));
    }
    validate_worker_cloud_release_signature(installed_state)
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
            "backend": "plugin_worker",
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
            "source": "plugin_task_worker",
            "backend": "plugin_worker",
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
                "pluginWorker": {
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
                "PLUGIN_WORKER_DISABLED",
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
                "PLUGIN_WORKER_BLOCKED",
                "configuration",
                false,
                "resolve_runtime_blocker",
            )
        } else if lower.contains("unsupported")
            || lower.contains("direct provider")
            || lower.contains("direct filesystem")
        {
            (
                "PLUGIN_WORKER_CONTRACT_UNSUPPORTED",
                "configuration",
                false,
                "fix_runtime_contract",
            )
        } else if lower.contains("timed out") || lower.contains("timeout") {
            (
                "PLUGIN_WORKER_TIMEOUT",
                "timeout",
                true,
                "retry_same_action",
            )
        } else if lower.contains("worker_retryable") {
            (
                "PLUGIN_WORKER_RETRYABLE_FAILURE",
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
                "PLUGIN_WORKER_OUTPUT_INVALID",
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
                "PLUGIN_WORKER_RUNTIME_UNAVAILABLE",
                "runtime_unavailable",
                false,
                "fix_runtime_package",
            )
        } else {
            (
                "PLUGIN_WORKER_FAILED",
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
        if plugin_id != WORKER_APP_ID {
            return PaneActionWorkerTurnResolution::Ignore;
        }
        let app_id =
            json_string(activation, &["active_plugin_id", "activePluginId"]).unwrap_or(plugin_id);
        if app_id != WORKER_APP_ID {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                activation,
                None,
                WORKER_REMOTE_RUNTIME_DISABLED,
                format!("Remote Plugin runtime is disabled for app: {app_id}"),
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
            workspace_patch_output_artifact_kind(requested_output_artifact_kind.clone())
        else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                activation,
                None,
                WORKER_OUTPUT_UNAUTHORIZED,
                format!(
                    "Plugin worker output artifact kind is not authorized: {}",
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
        let workflow_key = json_string(activation, &["workflow_key", "workflowKey"]);
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
            workflow_key,
            hook_policy: activation
                .get("hook_policy")
                .or_else(|| activation.get("hookPolicy"))
                .filter(|value| value.is_object())
                .cloned(),
            subagents: string_list_field(activation, &["subagents", "sub_agents"]),
            skill_refs: string_list_field(activation, &["skillRefs", "skill_refs"]),
            cli_refs: string_list_field(activation, &["cliRefs", "cli_refs"]),
            connector_refs: string_list_field(activation, &["connectorRefs", "connector_refs"]),
            orchestration: activation
                .get("orchestration")
                .filter(|value| value.is_array())
                .cloned(),
            workspace_id: request.session.workspace_id.clone(),
        })
    }

    fn resolve_pane_action_request(request: &ExecutionRequest) -> PaneActionWorkerTurnResolution {
        let Some(metadata) = request.metadata.as_ref() else {
            return PaneActionWorkerTurnResolution::Ignore;
        };
        let Some(plugin) = metadata.get("plugin").or_else(|| metadata.get("plugin")) else {
            return PaneActionWorkerTurnResolution::Ignore;
        };
        let Some(action) = plugin
            .get("pane_action")
            .or_else(|| plugin.get("paneAction"))
        else {
            return PaneActionWorkerTurnResolution::Ignore;
        };
        if !action.is_object() {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                plugin,
                Some(action),
                WORKER_REQUEST_INVALID,
                "Plugin pane action metadata must be an object.",
            ));
        }
        let Some(app_id) = json_string(plugin, &["app_id", "appId"]) else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                plugin,
                Some(action),
                WORKER_REQUEST_INVALID,
                "Plugin pane action app id is missing.",
            ));
        };
        if app_id != WORKER_APP_ID {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                plugin,
                Some(action),
                WORKER_REMOTE_RUNTIME_DISABLED,
                format!("Remote Plugin runtime is disabled for app: {app_id}"),
            ));
        }
        let task_kind = json_string(action, &["task_kind", "taskKind"])
            .unwrap_or_else(|| DEFAULT_ARTICLE_WORKSPACE_TASK_KIND.to_string());
        let prompt = json_string(action, &["prompt"]).unwrap_or_else(|| request.input.text.clone());
        if prompt.trim().is_empty() {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                plugin,
                Some(action),
                WORKER_REQUEST_INVALID,
                "Plugin pane action prompt is missing.",
            ));
        }
        let Some(surface_kind) = json_string(action, &["surface_kind", "surfaceKind"])
            .or_else(|| right_surface_string(metadata, &["surface_kind", "surfaceKind"]))
        else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                plugin,
                Some(action),
                WORKER_REQUEST_INVALID,
                "Plugin pane action surface kind is missing.",
            ));
        };
        let Some(pane_kind) = json_string(action, &["pane_kind", "paneKind"])
            .or_else(|| right_surface_string(metadata, &["pane_kind", "paneKind"]))
        else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                plugin,
                Some(action),
                WORKER_REQUEST_INVALID,
                "Plugin pane action pane kind is missing.",
            ));
        };
        let requested_output_artifact_kind =
            json_string(action, &["output_artifact_kind", "outputArtifactKind"]);
        let Some(output_artifact_kind) =
            workspace_patch_output_artifact_kind(requested_output_artifact_kind.clone())
        else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                plugin,
                Some(action),
                WORKER_OUTPUT_UNAUTHORIZED,
                format!(
                    "Plugin worker output artifact kind is not authorized: {}",
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
            source: json_string(plugin, &["source"])
                .unwrap_or_else(|| PANE_ACTION_SOURCE.to_string()),
            surface_kind: Some(surface_kind),
            pane_kind: Some(pane_kind),
            output_artifact_kind,
            task_kind,
            workflow_key: json_string(action, &["workflow_key", "workflowKey"]),
            hook_policy: action
                .get("hook_policy")
                .or_else(|| action.get("hookPolicy"))
                .filter(|value| value.is_object())
                .cloned(),
            subagents: string_list_field(action, &["subagents", "sub_agents"]),
            skill_refs: string_list_field(action, &["skillRefs", "skill_refs"]),
            cli_refs: string_list_field(action, &["cliRefs", "cli_refs"]),
            connector_refs: string_list_field(action, &["connectorRefs", "connector_refs"]),
            orchestration: action
                .get("orchestration")
                .filter(|value| value.is_array())
                .cloned(),
            workspace_id: json_string(plugin, &["workspace_id", "workspaceId"])
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
        let Some(plugin) = metadata.get("plugin").or_else(|| metadata.get("plugin")) else {
            return PaneActionWorkerTurnResolution::Ignore;
        };
        if !matches!(
            json_string(plugin, &["source"]).as_deref(),
            Some("right_surface_article_workspace")
        ) {
            return PaneActionWorkerTurnResolution::Ignore;
        }
        let Some(app_id) = json_string(plugin, &["app_id", "appId"]) else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                plugin,
                None,
                WORKER_REQUEST_INVALID,
                "Article Workspace action app id is missing.",
            ));
        };
        if app_id != WORKER_APP_ID {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                plugin,
                None,
                WORKER_REMOTE_RUNTIME_DISABLED,
                format!("Remote Plugin runtime is disabled for app: {app_id}"),
            ));
        }
        let Some(action) = plugin
            .get("article_workspace_action")
            .or_else(|| plugin.get("articleWorkspaceAction"))
        else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                plugin,
                None,
                WORKER_REQUEST_INVALID,
                "Article Workspace action metadata is missing.",
            ));
        };
        if !action.is_object() {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                plugin,
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
                plugin,
                Some(action),
                WORKER_REQUEST_INVALID,
                "Article Workspace action prompt is missing.",
            ));
        }
        let requested_output_artifact_kind =
            json_string(action, &["output_artifact_kind", "outputArtifactKind"]);
        let Some(output_artifact_kind) =
            workspace_patch_output_artifact_kind(requested_output_artifact_kind.clone())
        else {
            return PaneActionWorkerTurnResolution::Reject(worker_rejection_from_values(
                request,
                plugin,
                Some(action),
                WORKER_OUTPUT_UNAUTHORIZED,
                format!(
                    "Plugin worker output artifact kind is not authorized: {}",
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
            workflow_key: json_string(action, &["workflow_key", "workflowKey"]),
            hook_policy: action
                .get("hook_policy")
                .or_else(|| action.get("hookPolicy"))
                .filter(|value| value.is_object())
                .cloned(),
            subagents: string_list_field(action, &["subagents", "sub_agents"]),
            skill_refs: string_list_field(action, &["skillRefs", "skill_refs"]),
            cli_refs: string_list_field(action, &["cliRefs", "cli_refs"]),
            connector_refs: string_list_field(action, &["connectorRefs", "connector_refs"]),
            orchestration: action
                .get("orchestration")
                .filter(|value| value.is_array())
                .cloned(),
            workspace_id: json_string(plugin, &["workspace_id", "workspaceId"])
                .or_else(|| request.session.workspace_id.clone()),
        })
    }

    fn worker_request(
        &self,
        session_id: &str,
        turn_id: &str,
        worker_entrypoint: Option<&str>,
        installed_state: &Value,
    ) -> Value {
        let orchestration = self.worker_orchestration(installed_state);
        let workflow_key = orchestration.workflow_key.clone();
        let hook_policy = orchestration.hook_policy.clone();
        let subagents = orchestration.subagents.clone();
        let skill_refs = orchestration.skill_refs.clone();
        let cli_refs = orchestration.cli_refs.clone();
        let connector_refs = orchestration.connector_refs.clone();
        let orchestration_steps = orchestration.orchestration.clone();
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
            "workflowKey": workflow_key,
            "hookPolicy": hook_policy,
            "subagents": subagents,
            "skillRefs": skill_refs,
            "cliRefs": cli_refs,
            "connectorRefs": connector_refs,
            "orchestration": orchestration_steps,
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
                "directFilesystemAccess": false,
                "hostManagedGeneration": host_managed_generation_config(installed_state)
            },
            "requestedAt": timestamp(),
        })
    }

    fn worker_orchestration(&self, installed_state: &Value) -> PluginWorkerOrchestration {
        resolve_plugin_worker_orchestration(
            installed_state,
            self.task_kind.as_str(),
            PluginWorkerOrchestrationOverrides {
                workflow_key: self.workflow_key.clone(),
                hook_policy: self.hook_policy.clone(),
                subagents: self.subagents.clone(),
                skill_refs: self.skill_refs.clone(),
                cli_refs: self.cli_refs.clone(),
                connector_refs: self.connector_refs.clone(),
                orchestration: self.orchestration.clone(),
            },
        )
    }

    fn workflow_context(
        &self,
        request: &ExecutionRequest,
        installed_state: &Value,
    ) -> Option<PluginWorkerWorkflowContext> {
        let orchestration = self.worker_orchestration(installed_state);
        let task_id = self.task_id(request.turn.turn_id.as_str());
        build_plugin_worker_workflow_context(PluginWorkerWorkflowContextInput {
            app_id: self.app_id.as_str(),
            output_artifact_kind: self.output_artifact_kind(),
            pane_kind: self.pane_kind.as_deref(),
            prompt: self.prompt.as_str(),
            session_id: request.session.session_id.as_str(),
            source: self.source.as_str(),
            source_object_ref: self.source_object_ref.as_ref(),
            steps: orchestration.orchestration.as_ref(),
            surface_kind: self.surface_kind.as_deref(),
            task_id: task_id.as_str(),
            task_kind: self.task_kind.as_str(),
            turn_id: request.turn.turn_id.as_str(),
            workflow_key: orchestration.workflow_key.as_deref(),
            workflow_title: orchestration.workflow_title.as_deref(),
            workspace_id: self.workspace_id.as_deref(),
        })
    }

    fn hook_request_payload(
        &self,
        request: &ExecutionRequest,
        orchestration: &PluginWorkerOrchestration,
        hook_scope: &str,
        hook_event: &str,
        hook_key: &str,
        completion_context: Option<Value>,
    ) -> Value {
        let workflow_key = orchestration.workflow_key.clone();
        json!({
            "schemaVersion": HOOK_REQUEST_SCHEMA,
            "appId": self.app_id,
            "hookKey": hook_key,
            "hookEvent": hook_event,
            "hookScope": hook_scope,
            "sessionId": request.session.session_id,
            "workspaceId": self.workspace_id,
            "turnId": request.turn.turn_id,
            "taskId": self.task_id(request.turn.turn_id.as_str()),
            "taskKind": self.task_kind,
            "workflowKey": workflow_key,
            "prompt": self.prompt,
            "source": self.source,
            "surfaceKind": self.surface_kind,
            "paneKind": self.pane_kind,
            "outputArtifactKind": self.output_artifact_kind(),
            "sourceArtifactIds": self.source_artifact_ids,
            "sourceObjectRef": self.source_object_ref,
            "completion": completion_context,
            "requestedAt": timestamp(),
        })
    }

    fn hook_lifecycle_payload(
        &self,
        request: &ExecutionRequest,
        orchestration: &PluginWorkerOrchestration,
        hook_scope: &str,
        hook_event: &str,
        hook_key: &str,
        declaration: Option<&PluginHookDeclaration>,
        status: &str,
        reason_code: Option<&str>,
        result: Option<Value>,
        completion_context: Option<Value>,
    ) -> Value {
        let result_summary = result
            .as_ref()
            .and_then(|value| json_string(value, &["summary", "message", "resultSummary"]));
        let workflow_key = orchestration.workflow_key.clone();
        let hook_entrypoint = declaration.and_then(|declaration| declaration.entrypoint.clone());
        let hook_required = declaration
            .map(|declaration| declaration.required)
            .unwrap_or(false);
        json!({
            "source": "plugin_task_worker",
            "backend": "plugin_worker",
            "appId": self.app_id,
            "taskId": self.task_id(request.turn.turn_id.as_str()),
            "taskKind": self.task_kind,
            "turnId": request.turn.turn_id,
            "workflowKey": workflow_key,
            "surfaceKind": self.surface_kind,
            "paneKind": self.pane_kind,
            "outputArtifactKind": self.output_artifact_kind(),
            "status": status,
            "hookKey": hook_key,
            "hookEvent": hook_event,
            "hookScope": hook_scope,
            "hookEntrypoint": hook_entrypoint,
            "hookRequired": hook_required,
            "reasonCode": reason_code,
            "resultSummary": result_summary.clone(),
            "result": result,
            "completion": completion_context,
            "metadata": {
                "pluginWorker": {
                    "appId": self.app_id,
                    "taskId": self.task_id(request.turn.turn_id.as_str()),
                    "taskKind": self.task_kind,
                    "turnId": request.turn.turn_id,
                    "workflowKey": workflow_key.clone(),
                    "source": self.source,
                    "surfaceKind": self.surface_kind,
                    "paneKind": self.pane_kind,
                    "outputArtifactKind": self.output_artifact_kind(),
                    "status": status,
                    "hookKey": hook_key,
                    "hookEvent": hook_event,
                    "hookScope": hook_scope,
                    "hookEntrypoint": hook_entrypoint,
                    "hookRequired": hook_required,
                    "reasonCode": reason_code,
                    "resultSummary": result_summary,
                }
            },
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
            .unwrap_or(WORKSPACE_PATCH_KIND)
    }

    fn should_emit_initial_workspace_snapshot(&self) -> bool {
        self.app_id == WORKER_APP_ID
            && self.output_artifact_kind() == WORKSPACE_PATCH_KIND
            && self.is_article_workspace_draft_turn()
    }

    fn is_article_workspace_draft_turn(&self) -> bool {
        matches!(
            self.task_kind.as_str(),
            "content.article.generate" | "content.factory.generate"
        ) || self.pane_kind.as_deref() == Some("articleDraft")
            || self
                .source_object_ref
                .as_ref()
                .and_then(|object| json_string(object, &["kind", "object_kind", "objectKind"]))
                .as_deref()
                == Some("articleDraft")
    }

    fn failure_payload(
        &self,
        turn_id: &str,
        failure: &WorkerFailureProjection,
        status: &str,
    ) -> Value {
        json!({
            "source": "plugin_task_worker",
            "backend": "plugin_worker",
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
                "pluginWorker": {
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
    plugin: &Value,
    action: Option<&Value>,
    error_code: &'static str,
    error_message: impl Into<String>,
) -> PaneActionWorkerRejection {
    let metadata = request.metadata.as_ref();
    PaneActionWorkerRejection {
        app_id: json_string(plugin, &["app_id", "appId"]),
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
        source: json_string(plugin, &["source"]).unwrap_or_else(|| PANE_ACTION_SOURCE.to_string()),
        surface_kind: action
            .and_then(|action| json_string(action, &["surface_kind", "surfaceKind"]))
            .or_else(|| {
                metadata.and_then(|metadata| {
                    right_surface_string(metadata, &["surface_kind", "surfaceKind"])
                })
            }),
        task_kind: action.and_then(|action| json_string(action, &["task_kind", "taskKind"])),
        workspace_id: json_string(plugin, &["workspace_id", "workspaceId"])
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

fn workspace_patch_output_artifact_kind(
    output_artifact_kind: Option<String>,
) -> Option<Option<String>> {
    match output_artifact_kind.as_deref() {
        None => None,
        Some(WORKSPACE_PATCH_KIND) => Some(output_artifact_kind),
        Some(_) => None,
    }
}

fn runtime_locale(request: &ExecutionRequest) -> Option<String> {
    let metadata = request.metadata.as_ref();
    json_string_from_optional_value(
        metadata,
        &[
            "agent_response_language",
            "agentResponseLanguage",
            "locale",
            "uiLocale",
            "ui_locale",
            "language",
        ],
    )
    .or_else(|| {
        metadata
            .and_then(|metadata| metadata.get("harness"))
            .and_then(|harness| {
                json_string_from_optional_value(
                    Some(harness),
                    &[
                        "agent_response_language",
                        "agentResponseLanguage",
                        "locale",
                        "uiLocale",
                        "ui_locale",
                        "language",
                    ],
                )
            })
    })
}

fn json_string_from_optional_value(value: Option<&Value>, path: &[&str]) -> Option<String> {
    value.and_then(|value| json_string(value, path))
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

    #[test]
    fn worker_delta_workspace_snapshot_passes_through_without_resplitting() {
        let document_text = "# 草稿\n\n第一段用于验证 worker 已经按段落输出 partial snapshot，App Server 不应再拿当前 partial 做比例切片。\n\n第二段用于验证同一个 artifact 继续增长，sequence 由 worker 负责维护。";
        let event = RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifact": {
                    "artifactId": "task-article-1:workspace-patch",
                    "status": "streaming",
                    "metadata": {
                        "complete": false,
                        "writePhase": "streaming",
                        "contentStatus": "streaming",
                        "streamSource": "worker_delta",
                        "streamSequence": 7,
                        "contentFactoryWorkspacePatch": {
                            "objects": [
                                {
                                    "ref": {
                                        "kind": "articleDraft"
                                    },
                                    "source": {
                                        "documentText": document_text,
                                        "finalMarkdown": document_text
                                    }
                                }
                            ]
                        }
                    }
                }
            }),
        );

        let events = worker_progress_events_for_sink(event, None).expect("progress events");

        assert_eq!(events.len(), 1);
        let artifact = &events[0].payload["artifact"];
        assert_eq!(artifact["metadata"]["streamSource"], "worker_delta");
        assert_eq!(artifact["metadata"]["streamSequence"], 7);
        assert_eq!(
            artifact["metadata"]["contentFactoryWorkspacePatch"]["objects"][0]["source"]
                ["documentText"],
            document_text
        );
        assert_eq!(
            artifact["filePath"],
            ".lime/artifacts/content-factory/workspace-patch.json"
        );
    }

    #[test]
    fn complete_workspace_snapshot_passes_through_without_fake_streaming() {
        let document_text = "# 草稿\n\n第一段是 worker 最终正文。\n\n第二段也是最终正文。";
        let event = RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifact": {
                    "artifactId": "task-article-1:workspace-patch",
                    "status": "ready",
                    "metadata": {
                        "complete": true,
                        "contentFactoryWorkspacePatch": {
                            "objects": [
                                {
                                    "ref": {
                                        "kind": "articleDraft"
                                    },
                                    "source": {
                                        "documentText": document_text,
                                        "finalMarkdown": document_text
                                    }
                                }
                            ]
                        }
                    }
                }
            }),
        );

        let events = worker_progress_events_for_sink(event, None).expect("progress events");

        assert_eq!(events.len(), 1);
        let artifact = &events[0].payload["artifact"];
        assert_eq!(artifact["metadata"]["complete"], true);
        assert!(artifact["metadata"].get("streamSequence").is_none());
        assert_eq!(
            artifact["metadata"]["contentFactoryWorkspacePatch"]["objects"][0]["source"]
                ["documentText"],
            document_text
        );
        assert_eq!(
            artifact["filePath"],
            ".lime/artifacts/content-factory/workspace-patch.json"
        );
    }

    #[test]
    fn workflow_worker_progress_without_context_fails_closed() {
        let error = worker_progress_events_for_sink(
            RuntimeEvent::new(
                "workflow.tool.completed",
                json!({
                    "stepId": "research",
                    "toolName": "WebSearch"
                }),
            ),
            None,
        )
        .expect_err("workflow progress requires plugin workflow context");

        assert!(error
            .to_string()
            .contains("without plugin workflow context"));
    }

    #[tokio::test]
    async fn skips_worker_turn_when_content_factory_is_not_installed() {
        let request = execution_request(json!({
            "plugin": {
                "source": "right_surface_article_workspace",
                "app_id": WORKER_APP_ID,
                "article_workspace_action": {
                    "key": "regenerate",
                    "task_kind": "content.image.generate",
                    "output_artifact_kind": WORKSPACE_PATCH_KIND,
                    "prompt": "重新生成配图"
                }
            },
            "right_surface": {
                "surface_kind": "articleWorkspace"
            }
        }));
        let mut sink = TestRuntimeEventSink::default();

        let handled = RuntimeCore::default()
            .maybe_run_plugin_worker_turn(&request, &mut sink)
            .await
            .expect("worker dispatch check");

        assert!(!handled);
        assert!(sink.events.is_empty());
    }

    #[test]
    fn extracts_content_factory_article_workspace_worker_turn() {
        let request = execution_request(json!({
            "plugin": {
                "source": "right_surface_article_workspace",
                "app_id": WORKER_APP_ID,
                "session_id": "session-content-factory",
                "workspace_id": "workspace-main",
                "article_workspace_action": {
                    "key": "regenerate",
                    "task_kind": "content.image.generate",
                    "output_artifact_kind": WORKSPACE_PATCH_KIND,
                    "prompt": "重新生成配图",
                    "object": {
                        "app_id": WORKER_APP_ID,
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

        assert_eq!(worker_turn.app_id, WORKER_APP_ID);
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
            Some(WORKSPACE_PATCH_KIND)
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
    fn article_workspace_worker_request_resolves_manifest_workflow_defaults() {
        let request = execution_request(json!({
            "plugin": {
                "source": "right_surface_article_workspace",
                "app_id": WORKER_APP_ID,
                "workspace_id": "workspace-main",
                "article_workspace_action": {
                    "key": "write_article",
                    "intent": "write_article",
                    "risk": "write",
                    "task_kind": "content.article.generate",
                    "output_artifact_kind": WORKSPACE_PATCH_KIND,
                    "prompt": "写一篇关于内容工厂插件编排的文章",
                    "object": {
                        "app_id": WORKER_APP_ID,
                        "kind": "articleDraft",
                        "id": "article-1",
                        "session_id": "session-content-factory"
                    }
                }
            },
            "right_surface": {
                "surface_kind": "articleWorkspace"
            }
        }));
        let installed_state = json!({
            "manifest": {
                "agentRuntime": {
                    "workflows": [
                        {
                            "key": "content_article_workflow",
                            "taskKind": "content.article.generate",
                            "cliRefs": ["content-factory"],
                            "connectorRefs": ["lime-knowledge", "web-research"],
                            "hookPolicy": {
                                "prompt": ["prompt-submit"],
                                "task": ["task-complete"]
                            },
                            "steps": [
                                {
                                    "id": "draft",
                                    "subagent": "article-writer",
                                    "skillRefs": ["article-writing"]
                                },
                                {
                                    "id": "image-plan",
                                    "subagent": "image-planner",
                                    "skillRefs": ["article-image-plan"]
                                }
                            ]
                        }
                    ]
                }
            }
        });

        let worker_turn =
            PaneActionWorkerTurn::from_execution_request(&request).expect("worker turn");
        let worker_request = worker_turn.worker_request(
            request.session.session_id.as_str(),
            request.turn.turn_id.as_str(),
            Some("./src/runtime/content-factory-worker.mjs"),
            &installed_state,
        );

        assert_eq!(worker_request["workflowKey"], "content_article_workflow");
        assert_eq!(worker_request["hookPolicy"]["prompt"][0], "prompt-submit");
        assert_eq!(worker_request["cliRefs"][0], "content-factory");
        assert_eq!(worker_request["connectorRefs"][1], "web-research");
        assert!(worker_request["subagents"]
            .as_array()
            .expect("subagents")
            .iter()
            .any(|value| value == "article-writer"));
        assert_eq!(
            worker_request["skillRefs"]
                .as_array()
                .expect("plugin workflow skill refs")
                .len(),
            2
        );
        assert!(worker_request["skillRefs"]
            .as_array()
            .expect("plugin workflow skill refs")
            .iter()
            .any(|value| value == "article-image-plan"));
        assert_eq!(
            worker_request["orchestration"]
                .as_array()
                .expect("plugin workflow steps")
                .len(),
            2
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
                    "plugin_id": WORKER_APP_ID,
                    "active_plugin_id": WORKER_APP_ID,
                    "active_entry_key": "content_factory",
                    "intent_key": "content_article_generate",
                    "task_kind": "content.article.generate",
                    "output_artifact_kind": WORKSPACE_PATCH_KIND,
                    "right_surface": "articleWorkspace",
                    "expected_objects": ["articleDraft"],
                    "selected_object_ref": {
                        "plugin_id": WORKER_APP_ID,
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

        assert_eq!(worker_turn.app_id, WORKER_APP_ID);
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
            Some(WORKSPACE_PATCH_KIND)
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
            "plugin": {
                "source": PANE_ACTION_SOURCE,
                "app_id": WORKER_APP_ID,
                "session_id": "session-content-factory",
                "workspace_id": "workspace-main",
                "pane_action": {
                    "key": "regenerate",
                    "intent": "regenerate",
                    "risk": "write",
                    "task_kind": "content.image.generate",
                    "output_artifact_kind": WORKSPACE_PATCH_KIND,
                    "prompt": "重新生成配图",
                    "surface_kind": "appSurface",
                    "pane_kind": "imageGrid",
                    "source_artifact_ids": ["artifact-image-set-1", "artifact-image-set-1"],
                    "object": {
                        "app_id": WORKER_APP_ID,
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
            &json!({}),
        );

        assert_eq!(worker_turn.app_id, WORKER_APP_ID);
        assert_eq!(worker_turn.source, PANE_ACTION_SOURCE);
        assert_eq!(worker_turn.action_key.as_deref(), Some("regenerate"));
        assert_eq!(worker_turn.action_intent.as_deref(), Some("regenerate"));
        assert_eq!(worker_turn.action_risk.as_deref(), Some("write"));
        assert_eq!(worker_turn.surface_kind.as_deref(), Some("appSurface"));
        assert_eq!(worker_turn.pane_kind.as_deref(), Some("imageGrid"));
        assert_eq!(
            worker_turn.output_artifact_kind.as_deref(),
            Some(WORKSPACE_PATCH_KIND)
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
        assert_eq!(worker_request["outputArtifactKind"], WORKSPACE_PATCH_KIND);
        assert_eq!(
            worker_request["expectedOutput"]["artifactKind"],
            WORKSPACE_PATCH_KIND
        );
        assert_eq!(
            worker_request["runtime"]["outputArtifactKind"],
            WORKSPACE_PATCH_KIND
        );
    }

    #[test]
    fn rejects_unsupported_pane_action_output_artifact_kind() {
        let request = execution_request(json!({
            "plugin": {
                "source": PANE_ACTION_SOURCE,
                "app_id": WORKER_APP_ID,
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
            "plugin": {
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
            "PLUGIN_WORKER_REMOTE_RUNTIME_DISABLED"
        );
        assert_eq!(rejection.app_id.as_deref(), Some("creator-pack"));
        assert_eq!(
            rejection.output_artifact_kind.as_deref(),
            Some("creator.workspace_patch")
        );
        assert!(rejection
            .error_message
            .contains("Remote Plugin runtime is disabled"));
    }

    #[test]
    fn classifies_worker_failures_for_retry_projection() {
        let timeout = classify_worker_failure("Plugin worker timed out after 100ms");
        assert_eq!(timeout.error_code, "PLUGIN_WORKER_TIMEOUT");
        assert_eq!(timeout.category, "timeout");
        assert!(timeout.retryable);
        assert_eq!(timeout.retry_advice, "retry_same_action");
        assert_eq!(timeout.retry_max_attempts, 1);

        let blocker = classify_worker_failure("Plugin worker runtime has blockers: key");
        assert_eq!(blocker.error_code, "PLUGIN_WORKER_BLOCKED");
        assert_eq!(blocker.category, "configuration");
        assert!(!blocker.retryable);
        assert_eq!(blocker.retry_advice, "resolve_runtime_blocker");

        let unsupported =
            classify_worker_failure("Plugin worker direct provider access is unsupported.");
        assert_eq!(unsupported.error_code, "PLUGIN_WORKER_CONTRACT_UNSUPPORTED");
        assert_eq!(unsupported.category, "configuration");
        assert!(!unsupported.retryable);
        assert_eq!(unsupported.retry_advice, "fix_runtime_contract");

        let retryable = classify_worker_failure("Plugin worker did not complete: WORKER_RETRYABLE");
        assert_eq!(retryable.error_code, "PLUGIN_WORKER_RETRYABLE_FAILURE");
        assert_eq!(retryable.category, "worker_retryable");
        assert!(retryable.retryable);
        assert_eq!(retryable.retry_advice, "retry_same_action");
        assert_eq!(retryable.retry_max_attempts, 1);
        assert!(retryable.should_retry());
        assert!(!retryable.with_retry_attempt(1).should_retry());

        let invalid_output =
            classify_worker_failure("failed to decode Plugin worker response: expected value");
        assert_eq!(invalid_output.error_code, "PLUGIN_WORKER_OUTPUT_INVALID");
        assert_eq!(invalid_output.category, "worker_output");
        assert!(!invalid_output.retryable);
        assert_eq!(invalid_output.retry_advice, "inspect_worker_output");
    }

    #[test]
    fn accepts_verified_cloud_release_signature_evidence_for_worker() {
        let installed_state = json!({
            "schemaVersion": "plugin.installed-state.v1",
            "appId": "content-factory-app",
            "identity": {
                "appId": "content-factory-app",
                "sourceKind": "cloud_release",
                "sourceUri": "https://lime.local/plugins/content-factory-app/releases/0.3.0/package.zip",
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
            "schemaVersion": "plugin.installed-state.v1",
            "appId": "content-factory-app",
            "identity": {
                "appId": "content-factory-app",
                "sourceKind": "cloud_release",
                "sourceUri": "https://seeded.local/plugins/content-factory-app/2.0.0.lapp",
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
            "schemaVersion": "plugin.installed-state.v1",
            "appId": "content-factory-app",
            "identity": {
                "appId": "content-factory-app",
                "sourceKind": "cloud_release",
                "sourceUri": "https://seeded.local/plugins/content-factory-app/2.0.0.lapp",
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
            "schemaVersion": "plugin.installed-state.v1",
            "appId": "content-factory-app",
            "identity": {
                "appId": "content-factory-app",
                "sourceKind": "cloud_release",
                "sourceUri": "https://lime.local/plugins/content-factory-app/releases/0.3.0/package.zip",
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
            "PLUGIN_WORKER_PACKAGE_SIGNATURE_UNVERIFIED"
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
                app_id: WORKER_APP_ID.to_string(),
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
