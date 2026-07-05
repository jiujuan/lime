use super::super::plugin_worker_orchestration::{
    resolve_plugin_worker_orchestration, string_list_field, PluginWorkerOrchestration,
    PluginWorkerOrchestrationOverrides,
};
use super::super::plugin_worker_output_contract::{
    expected_output_contract, plugin_output_artifact_kind, CONTENT_FACTORY_APP_ID,
    WORKSPACE_PATCH_KIND,
};
use super::super::plugin_worker_workflow::{
    build_plugin_worker_workflow_context, PluginWorkerWorkflowContext,
    PluginWorkerWorkflowContextInput,
};
use super::super::{timestamp, ExecutionRequest, RuntimeCoreError};
use super::failure::WorkerFailureProjection;
use super::hooks::host_managed_generation_config;
use super::json_helpers::{json_string, json_string_array, json_string_from_optional_value};
use super::{
    PaneActionWorkerRejection, PaneActionWorkerTurn, PaneActionWorkerTurnResolution,
    PluginHookDeclaration, DEFAULT_ARTICLE_WORKSPACE_TASK_KIND, HOOK_REQUEST_SCHEMA,
    PANE_ACTION_SOURCE, WORKER_OUTPUT_UNAUTHORIZED, WORKER_REQUEST_INVALID, WORKER_REQUEST_SCHEMA,
};
use serde_json::{json, Value};

impl PaneActionWorkerTurn {
    #[cfg(test)]
    pub(super) fn from_execution_request(request: &ExecutionRequest) -> Option<Self> {
        match Self::resolve_from_execution_request(request) {
            PaneActionWorkerTurnResolution::Run(worker_turn) => Some(worker_turn),
            PaneActionWorkerTurnResolution::Reject(_) | PaneActionWorkerTurnResolution::Ignore => {
                None
            }
        }
    }

    pub(super) fn resolve_from_execution_request(
        request: &ExecutionRequest,
    ) -> PaneActionWorkerTurnResolution {
        match Self::resolve_pane_action_request(request) {
            PaneActionWorkerTurnResolution::Ignore => {
                Self::resolve_article_workspace_action_request(request)
            }
            resolution => resolution,
        }
    }

    pub(super) fn from_plugin_activation_request(request: &ExecutionRequest) -> Option<Self> {
        let metadata = request.metadata.as_ref()?;
        let activation = metadata
            .pointer("/harness/plugin_activation")
            .or_else(|| metadata.pointer("/harness/pluginActivation"))
            .or_else(|| metadata.get("plugin_activation"))
            .or_else(|| metadata.get("pluginActivation"))?;
        let app_id = json_string(activation, &["active_plugin_id", "activePluginId"])
            .or_else(|| json_string(activation, &["plugin_id", "pluginId"]))?;
        if app_id != CONTENT_FACTORY_APP_ID {
            return None;
        }

        let workflow_contract = activation
            .get("workflow_contract")
            .or_else(|| activation.get("workflowContract"));
        let task_kind = json_string(activation, &["task_kind", "taskKind"])
            .or_else(|| json_string_from_optional_value(workflow_contract, &["taskKind"]))
            .or_else(|| json_string_from_optional_value(workflow_contract, &["task_kind"]))
            .unwrap_or_else(|| "content.article.generate".to_string());
        let output_artifact_kind = plugin_output_artifact_kind(
            app_id.as_str(),
            json_string(activation, &["output_artifact_kind", "outputArtifactKind"])
                .or_else(|| {
                    json_string_from_optional_value(workflow_contract, &["outputArtifactKind"])
                })
                .or_else(|| {
                    json_string_from_optional_value(workflow_contract, &["output_artifact_kind"])
                })
                .or_else(|| Some(WORKSPACE_PATCH_KIND.to_string())),
        )?;
        if output_artifact_kind.as_deref() != Some(WORKSPACE_PATCH_KIND) {
            return None;
        }
        let active_entry_key = json_string(activation, &["active_entry_key", "activeEntryKey"]);
        if active_entry_key.as_deref() != Some("content_factory")
            && !matches!(
                task_kind.as_str(),
                "content.article.generate" | "content.factory.generate"
            )
        {
            return None;
        }

        let prompt = json_string(activation, &["body"])
            .unwrap_or_else(|| request.input.text.clone())
            .trim()
            .to_string();
        if prompt.is_empty() {
            return None;
        }
        let surface_kind = json_string(activation, &["right_surface", "rightSurface"])
            .or_else(|| json_string_from_optional_value(workflow_contract, &["rightSurface"]))
            .or_else(|| json_string_from_optional_value(workflow_contract, &["right_surface"]))
            .unwrap_or_else(|| "articleWorkspace".to_string());
        let selected_object_ref = activation
            .get("selected_object_ref")
            .or_else(|| activation.get("selectedObjectRef"))
            .filter(|value| value.is_object())
            .cloned();
        let workflow_key = json_string(activation, &["workflow_key", "workflowKey"])
            .or_else(|| json_string_from_optional_value(workflow_contract, &["key"]))
            .or_else(|| json_string_from_optional_value(workflow_contract, &["workflow_key"]))
            .or_else(|| json_string_from_optional_value(workflow_contract, &["workflowKey"]));
        let hook_policy = workflow_contract
            .and_then(|contract| {
                contract
                    .get("hook_policy")
                    .or_else(|| contract.get("hookPolicy"))
            })
            .filter(|value| value.is_object())
            .cloned();
        let orchestration = workflow_contract
            .and_then(|contract| {
                contract
                    .get("steps")
                    .or_else(|| contract.get("orchestration"))
            })
            .filter(|value| value.is_array())
            .cloned();

        Some(Self {
            app_id,
            action_key: json_string(activation, &["intent_key", "intentKey"])
                .or_else(|| Some("plugin-activation".to_string())),
            action_intent: json_string(activation, &["intent_key", "intentKey"]),
            action_risk: Some("write".to_string()),
            prompt,
            source_object_ref: selected_object_ref,
            source_artifact_ids: Vec::new(),
            source: "plugin_activation".to_string(),
            surface_kind: Some(surface_kind),
            pane_kind: Some("articleDraft".to_string()),
            output_artifact_kind,
            task_kind,
            workflow_key,
            hook_policy,
            subagents: workflow_contract
                .map(|contract| string_list_field(contract, &["subagents", "sub_agents"]))
                .unwrap_or_default(),
            skill_refs: workflow_contract
                .map(|contract| string_list_field(contract, &["skillRefs", "skill_refs"]))
                .unwrap_or_default(),
            cli_refs: workflow_contract
                .map(|contract| string_list_field(contract, &["cliRefs", "cli_refs"]))
                .unwrap_or_default(),
            connector_refs: workflow_contract
                .map(|contract| string_list_field(contract, &["connectorRefs", "connector_refs"]))
                .unwrap_or_default(),
            orchestration,
            workspace_id: json_string(activation, &["workspace_id", "workspaceId"])
                .or_else(|| request.session.workspace_id.clone()),
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
            plugin_output_artifact_kind(app_id.as_str(), requested_output_artifact_kind.clone())
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
            plugin_output_artifact_kind(app_id.as_str(), requested_output_artifact_kind.clone())
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

    pub(super) fn worker_request(
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
            "expectedOutput": expected_output_contract(self.output_artifact_kind()),
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

    pub(super) fn worker_orchestration(
        &self,
        installed_state: &Value,
    ) -> PluginWorkerOrchestration {
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

    pub(super) fn workflow_context(
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

    pub(super) fn hook_request_payload(
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

    pub(super) fn hook_lifecycle_payload(
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

    pub(super) fn task_id(&self, turn_id: &str) -> String {
        format!(
            "{turn_id}:{}",
            self.action_key
                .as_deref()
                .unwrap_or("article-workspace-action")
        )
    }

    pub(super) fn output_artifact_kind(&self) -> &str {
        self.output_artifact_kind
            .as_deref()
            .unwrap_or(WORKSPACE_PATCH_KIND)
    }

    pub(super) fn should_emit_initial_workspace_snapshot(&self) -> bool {
        self.output_artifact_kind() == WORKSPACE_PATCH_KIND
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

    pub(super) fn failure_payload(
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

pub(super) fn validate_worker_turn_runtime_contract(
    worker_turn: &PaneActionWorkerTurn,
    task_runtime: &app_server_protocol::PluginTaskRuntimeContract,
) -> Result<(), RuntimeCoreError> {
    if let Some(expected_output_artifact_kind) = task_runtime.output_artifact_kind.as_deref() {
        if worker_turn.output_artifact_kind() != expected_output_artifact_kind {
            return Err(RuntimeCoreError::Backend(format!(
                "Plugin worker output artifact kind is unsupported by runtime contract: requested={}, declared={}",
                worker_turn.output_artifact_kind(),
                expected_output_artifact_kind
            )));
        }
    }
    Ok(())
}

pub(super) fn runtime_locale(request: &ExecutionRequest) -> Option<String> {
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
