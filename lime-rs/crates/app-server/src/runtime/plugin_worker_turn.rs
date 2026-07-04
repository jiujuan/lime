use super::plugin_task_runtime::{build_plugin_task_runtime_contract, resolve_plugin_runtime_dir};
use super::plugin_worker_orchestration::hook_refs_for_scope;
#[cfg(test)]
use super::plugin_worker_output_contract::{
    CONTENT_FACTORY_APP_ID, LEGACY_CREATOR_WORKSPACE_PATCH_KIND, WORKSPACE_PATCH_KIND,
};
use super::plugin_worker_runtime::{PluginHookRunRequest, PluginWorkerRunRequest};
use super::plugin_worker_streaming::{
    initial_workspace_patch_snapshot, is_incomplete_workspace_patch_snapshot,
    WorkspacePatchStreamingSnapshot,
};
use super::plugin_worker_workflow::{
    workflow_completed_events, workflow_connector_completed_events_from_artifact_events,
    workflow_failed_events, workflow_started_events, PluginWorkerWorkflowContext,
};
use super::plugin_worker_workflow_hooks::workflow_hook_completed_events_from_worker_hook_events;
use super::plugin_worker_workflow_retry::workflow_retry_events;
use super::ExecutionRequest;
use super::RuntimeCore;
use super::RuntimeCoreError;
use super::RuntimeEvent;
use super::RuntimeEventSink;
use serde_json::json;
use serde_json::Value;
use std::path::Path;

mod failure;
mod hooks;
mod json_helpers;
mod launch_gate;
mod progress;
mod request;

use self::failure::classify_worker_failure;
use self::hooks::{hook_declarations, hook_error_reason, hook_result_status};
use self::json_helpers::json_string;
use self::launch_gate::validate_worker_turn_launch_preconditions;
use self::progress::{
    assistant_message_events_from_worker_events, emit_worker_progress_events,
    is_streaming_workspace_patch_snapshot, split_workflow_audit_events, worker_completion_context,
    worker_progress_events_for_sink,
};
use self::request::{runtime_locale, validate_worker_turn_runtime_contract};

#[cfg(test)]
const WORKER_APP_ID: &str = CONTENT_FACTORY_APP_ID;
const WORKER_REQUEST_SCHEMA: &str = "content-factory.worker-request.v1";
const DEFAULT_ARTICLE_WORKSPACE_TASK_KIND: &str = "content.factory.generate";
const CLOUD_RELEASE_SOURCE_KIND: &str = "cloud_release";
const WORKER_PACKAGE_SIGNATURE_UNVERIFIED: &str = "PLUGIN_WORKER_PACKAGE_SIGNATURE_UNVERIFIED";
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
                    for event in
                        assistant_message_events_from_worker_events(request, &worker_turn, &events)
                    {
                        sink.emit(event)?;
                    }
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
        validate_worker_turn_runtime_contract(worker_turn, &task_runtime)?;
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

#[cfg(test)]
mod tests;
