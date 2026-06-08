#![allow(dead_code)]

use super::action_runtime::respond_runtime_action_internal;
use super::command_api::runtime_api::export_runtime_evidence_pack_for_runtime;
use super::dto::AgentRuntimeActionScope;
use super::{
    build_queued_turn_task, create_runtime_session_internal_with_runtime_and_session_id,
    AgentRuntimeActionType, AgentRuntimeRespondActionRequest, AsterChatRequest,
    AsterExecutionStrategy, QueuedTurnTask, RuntimeCommandContext,
};
use crate::agent::runtime_queue_service::{
    finish_active_runtime_turn_if_matches as finish_active_runtime_turn_if_matches_service,
    RuntimeQueueEventPort, TauriRuntimeQueueEventPort,
};
use crate::agent_tools::catalog::{ToolLifecycle, WorkspaceToolSurface};
use crate::agent_tools::inventory::{
    build_tool_inventory, AgentToolInventoryBuildInput, AgentToolInventorySnapshot,
};
use crate::commands::aster_agent_cmd::command_api::runtime_api::collect_runtime_tool_inventory;
use crate::services::agent_timeline_service::abort_running_turn_by_id;
use crate::services::runtime_evidence_pack_service::{
    RuntimeEvidenceArtifact, RuntimeEvidenceArtifactKind, RuntimeEvidencePackExportResult,
};
use crate::services::runtime_skill_binding_service::{
    list_workspace_skill_bindings, resolve_workspace_skill_runtime_enable,
    AgentRuntimeListWorkspaceSkillBindingsRequest, AgentRuntimeWorkspaceSkillBindingStatus,
    AgentRuntimeWorkspaceSkillBindings, WorkspaceSkillRuntimeEnableProjection,
};
use crate::workspace::WorkspaceManager;
use app_server::{
    error_codes, runtime_event_type_from_backend_type, AgentInput, AgentSessionActionScope,
    AgentSessionActionType as AppServerActionType, AgentSessionStartParams,
    AgentSessionTurnStartParams, AppServer, AppServerEventBridge, AppServerRuntimeFactory,
    ArtifactContentProvider, ArtifactContentRequest, AsterBackendActionRespondRequest,
    AsterBackendActionRespondResult, AsterBackendCancelRequest, AsterBackendCancelResult,
    AsterBackendHost, AsterBackendSubmitRequest, AsterBackendSubmitResult, CapabilityDescriptor,
    CapabilityInventoryRecord, CapabilityInventorySource, CapabilityListContext, CapabilitySource,
    EvidenceExportProvider, EvidencePackArtifact, EvidencePackRequest, EvidencePackSummary,
    FilesystemArtifactContentProvider, JsonRpcMessage, JsonRpcNotification, JsonRpcRequest,
    RequestId, RuntimeCore, RuntimeCoreError, RuntimeEvent, RuntimeOptions,
    METHOD_AGENT_SESSION_EVENT, METHOD_AGENT_SESSION_START, METHOD_AGENT_SESSION_TURN_START,
    METHOD_CAPABILITY_LIST, METHOD_INITIALIZE, METHOD_INITIALIZED,
};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use tauri::{EventId, Listener};
use uuid::Uuid;

const RUNTIME_INTERRUPT_MESSAGE: &str = "用户已停止当前执行";
const HOST_OPTIONS_ASTER_CHAT_REQUEST: &str = "asterChatRequest";

type RuntimeEventBridgeCallback = Arc<dyn Fn(EventId, &str) + Send + Sync + 'static>;
type DesktopWorkspaceRootResolver =
    Arc<dyn Fn(&str) -> Result<Option<String>, String> + Send + Sync + 'static>;

struct AppServerRuntimeQueueEventPort {
    delegate: Option<TauriRuntimeQueueEventPort>,
    bridge: Arc<OnceLock<AppServerEventBridge>>,
    scopes: Arc<Mutex<HashMap<String, (String, String)>>>,
}

impl AppServerRuntimeQueueEventPort {
    fn new(
        app_handle: tauri::AppHandle,
        bridge: Arc<OnceLock<AppServerEventBridge>>,
        scopes: Arc<Mutex<HashMap<String, (String, String)>>>,
    ) -> Self {
        Self {
            delegate: Some(TauriRuntimeQueueEventPort::new(app_handle)),
            bridge,
            scopes,
        }
    }
}

impl RuntimeQueueEventPort for AppServerRuntimeQueueEventPort {
    fn emit_runtime_queue_event(&self, event_name: &str, event: &lime_agent::AgentEvent) {
        if let Some(app_server_bridge) = self.bridge.get() {
            let scope = self
                .scopes
                .lock()
                .ok()
                .and_then(|scopes| scopes.get(event_name).cloned());
            if let Err(error) = append_lime_agent_event_to_app_server_bridge(
                app_server_bridge,
                event_name,
                scope,
                event,
            ) {
                tracing::warn!(
                    "[AppServerHost] direct runtime event bridge failed: event_name={}, error={}",
                    event_name,
                    error
                );
            }
            if should_close_app_server_event_bridge(event) {
                if let Ok(mut scopes) = self.scopes.lock() {
                    scopes.remove(event_name);
                }
            }
        }
        if let Some(delegate) = &self.delegate {
            delegate.emit_runtime_queue_event(event_name, event);
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct RuntimeHostCancelOutcome {
    cancelled: bool,
    aborted: bool,
    gate_released: bool,
    queue_cleared: bool,
}

impl RuntimeHostCancelOutcome {
    fn touched_runtime(&self) -> bool {
        self.cancelled || self.aborted || self.gate_released || self.queue_cleared
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DesktopAsterCancelInput {
    session_id: String,
    turn_id: String,
    event_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DesktopAsterCancelOperation {
    session_id: String,
    turn_id: String,
    interrupt_message: String,
}

#[derive(Debug, Clone, PartialEq)]
struct DesktopAsterActionResponseInput {
    session_id: String,
    request_id: String,
    action_type: AgentRuntimeActionType,
    confirmed: bool,
    response: Option<String>,
    user_data: Option<serde_json::Value>,
    metadata: Option<serde_json::Value>,
    event_name: Option<String>,
    action_scope: Option<AgentRuntimeActionScope>,
}

#[derive(Debug, Clone, PartialEq)]
struct DesktopAsterActionResponseOperation {
    input: DesktopAsterActionResponseInput,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DesktopAsterEventBridgeRegistration {
    event_name: String,
    session_id: String,
    turn_id: String,
}

#[derive(Debug)]
struct DesktopAsterRuntimeEventBridgeAppend {
    session_id: String,
    turn_id: Option<String>,
    event: RuntimeEvent,
    should_close: bool,
}

#[async_trait]
trait AsterRuntimeHostBridge: Send + Sync {
    async fn ensure_persisted_session(
        &self,
        request: DesktopAsterSessionPersistenceRequest,
    ) -> Result<(), String>;

    async fn submit_runtime_turn(&self, queued_turn: DesktopAsterQueuedTurn) -> Result<(), String>;

    async fn cancel_turn(
        &self,
        operation: &DesktopAsterCancelOperation,
    ) -> Result<RuntimeHostCancelOutcome, String>;

    async fn respond_action(
        &self,
        operation: DesktopAsterActionResponseOperation,
    ) -> Result<(), String>;
}

#[derive(Clone)]
struct RuntimeCommandContextHost {
    runtime: RuntimeCommandContext,
}

impl RuntimeCommandContextHost {
    fn new(runtime: RuntimeCommandContext) -> Self {
        Self { runtime }
    }
}

#[async_trait]
impl AsterRuntimeHostBridge for RuntimeCommandContextHost {
    async fn ensure_persisted_session(
        &self,
        request: DesktopAsterSessionPersistenceRequest,
    ) -> Result<(), String> {
        ensure_persisted_runtime_session(&self.runtime, request).await
    }

    async fn submit_runtime_turn(&self, queued_turn: DesktopAsterQueuedTurn) -> Result<(), String> {
        self.runtime
            .submit_runtime_turn(
                queued_turn.queued_task,
                queued_turn.queue_if_busy,
                queued_turn.skip_pre_submit_resume,
            )
            .await
    }

    async fn cancel_turn(
        &self,
        operation: &DesktopAsterCancelOperation,
    ) -> Result<RuntimeHostCancelOutcome, String> {
        execute_runtime_cancel_operation(&self.runtime, operation).await
    }

    async fn respond_action(
        &self,
        operation: DesktopAsterActionResponseOperation,
    ) -> Result<(), String> {
        execute_desktop_aster_action_response_operation(&self.runtime, operation).await
    }
}

trait RuntimeEventBridgeRegistry: Send + Sync {
    fn listen_any(&self, event_name: String, callback: RuntimeEventBridgeCallback) -> EventId;
    fn unlisten(&self, listener_id: EventId);
}

struct TauriRuntimeEventBridgeRegistry {
    app_handle: tauri::AppHandle,
}

impl TauriRuntimeEventBridgeRegistry {
    fn new(app_handle: tauri::AppHandle) -> Self {
        Self { app_handle }
    }
}

impl RuntimeEventBridgeRegistry for TauriRuntimeEventBridgeRegistry {
    fn listen_any(&self, event_name: String, callback: RuntimeEventBridgeCallback) -> EventId {
        self.app_handle.listen_any(event_name, move |event| {
            callback(event.id(), event.payload());
        })
    }

    fn unlisten(&self, listener_id: EventId) {
        self.app_handle.unlisten(listener_id);
    }
}

#[derive(Clone)]
struct RuntimeEventBridgeSubscriptions {
    app_server_bridge: Option<Arc<OnceLock<AppServerEventBridge>>>,
    event_registry: Arc<dyn RuntimeEventBridgeRegistry>,
    active_event_bridges: Arc<Mutex<HashMap<String, EventId>>>,
    direct_event_scopes: Option<Arc<Mutex<HashMap<String, (String, String)>>>>,
}

impl RuntimeEventBridgeSubscriptions {
    fn new(
        event_registry: Arc<dyn RuntimeEventBridgeRegistry>,
        app_server_bridge: Option<Arc<OnceLock<AppServerEventBridge>>>,
    ) -> Self {
        Self {
            app_server_bridge,
            event_registry,
            active_event_bridges: Arc::new(Mutex::new(HashMap::new())),
            direct_event_scopes: None,
        }
    }

    fn new_direct(
        event_registry: Arc<dyn RuntimeEventBridgeRegistry>,
        app_server_bridge: Arc<OnceLock<AppServerEventBridge>>,
        direct_event_scopes: Arc<Mutex<HashMap<String, (String, String)>>>,
    ) -> Self {
        Self {
            app_server_bridge: Some(app_server_bridge),
            event_registry,
            active_event_bridges: Arc::new(Mutex::new(HashMap::new())),
            direct_event_scopes: Some(direct_event_scopes),
        }
    }

    fn from_runtime(
        runtime: &RuntimeCommandContext,
        app_server_bridge: Option<Arc<OnceLock<AppServerEventBridge>>>,
    ) -> Self {
        Self::new(
            Arc::new(TauriRuntimeEventBridgeRegistry::new(
                runtime.app_handle().clone(),
            )),
            app_server_bridge,
        )
    }

    fn register(&self, registration: &DesktopAsterEventBridgeRegistration) -> Option<String> {
        if let Some(direct_event_scopes) = &self.direct_event_scopes {
            if let Ok(mut scopes) = direct_event_scopes.lock() {
                scopes.insert(
                    registration.event_name.clone(),
                    (
                        registration.session_id.clone(),
                        registration.turn_id.clone(),
                    ),
                );
            }
            return Some(app_server_event_bridge_key(&registration.session_id));
        }

        let app_server_bridge = self.app_server_bridge.as_ref()?.get()?.clone();
        let bridge_key = app_server_event_bridge_key(&registration.session_id);
        self.unregister(&bridge_key);

        let event_name = registration.event_name.clone();
        let session_id = registration.session_id.clone();
        let turn_id = registration.turn_id.clone();
        let active_event_bridges = self.active_event_bridges.clone();
        let bridge_key_for_handler = bridge_key.clone();
        let event_registry = self.event_registry.clone();
        let event_name_for_log = event_name.clone();

        let listener_id = self.event_registry.listen_any(
            event_name,
            Arc::new(move |listener_id, payload| {
                let should_close = match append_lime_agent_payload_to_app_server_bridge(
                    &app_server_bridge,
                    &session_id,
                    &turn_id,
                    payload,
                ) {
                    Ok(should_close) => should_close,
                    Err(error) => {
                        tracing::warn!(
                            "[AppServerHost] failed to bridge runtime event: event_name={}, session_id={}, turn_id={}, error={}",
                            event_name_for_log,
                            session_id,
                            turn_id,
                            error
                        );
                        return;
                    }
                };

                if should_close {
                    event_registry.unlisten(listener_id);
                    if let Ok(mut active_event_bridges) = active_event_bridges.lock() {
                        active_event_bridges.remove(&bridge_key_for_handler);
                    }
                }
            }),
        );

        if let Ok(mut active_event_bridges) = self.active_event_bridges.lock() {
            active_event_bridges.insert(bridge_key.clone(), listener_id);
        }

        Some(bridge_key)
    }

    fn unregister(&self, bridge_key: &str) {
        if let Some(direct_event_scopes) = &self.direct_event_scopes {
            if let Ok(mut scopes) = direct_event_scopes.lock() {
                scopes.retain(|_, (session_id, _)| session_id != bridge_key);
            }
        }

        let Some(listener_id) = self
            .active_event_bridges
            .lock()
            .ok()
            .and_then(|mut active_event_bridges| active_event_bridges.remove(bridge_key))
        else {
            return;
        };
        self.event_registry.unlisten(listener_id);
    }
}

#[derive(Clone)]
pub(crate) struct TauriAsterBackendHost {
    runtime_host: Arc<dyn AsterRuntimeHostBridge>,
    event_subscriptions: RuntimeEventBridgeSubscriptions,
}

impl TauriAsterBackendHost {
    pub(crate) fn new(runtime: RuntimeCommandContext) -> Self {
        let event_subscriptions = RuntimeEventBridgeSubscriptions::from_runtime(&runtime, None);
        Self {
            runtime_host: Arc::new(RuntimeCommandContextHost::new(runtime)),
            event_subscriptions,
        }
    }

    fn with_app_server_bridge(
        runtime: RuntimeCommandContext,
        app_server_bridge: Arc<OnceLock<AppServerEventBridge>>,
    ) -> Self {
        let event_subscriptions =
            RuntimeEventBridgeSubscriptions::from_runtime(&runtime, Some(app_server_bridge));
        Self {
            runtime_host: Arc::new(RuntimeCommandContextHost::new(runtime)),
            event_subscriptions,
        }
    }

    fn with_direct_app_server_bridge(
        runtime: RuntimeCommandContext,
        app_server_bridge: Arc<OnceLock<AppServerEventBridge>>,
        direct_event_scopes: Arc<Mutex<HashMap<String, (String, String)>>>,
    ) -> Self {
        let event_subscriptions = RuntimeEventBridgeSubscriptions::new_direct(
            Arc::new(TauriRuntimeEventBridgeRegistry::new(
                runtime.app_handle().clone(),
            )),
            app_server_bridge,
            direct_event_scopes,
        );
        Self {
            runtime_host: Arc::new(RuntimeCommandContextHost::new(runtime)),
            event_subscriptions,
        }
    }

    #[cfg(test)]
    fn with_runtime_host(
        runtime_host: Arc<dyn AsterRuntimeHostBridge>,
        event_subscriptions: RuntimeEventBridgeSubscriptions,
    ) -> Self {
        Self {
            runtime_host,
            event_subscriptions,
        }
    }
}

pub(crate) fn build_desktop_aster_runtime_core(runtime: RuntimeCommandContext) -> RuntimeCore {
    let capability_source = desktop_app_server_capability_source_with_runtime(runtime.clone());
    let artifact_content_provider = desktop_artifact_content_provider_with_runtime(&runtime);
    let evidence_export_provider = desktop_evidence_export_provider_with_runtime(&runtime);
    let host: Arc<dyn AsterBackendHost> = Arc::new(TauriAsterBackendHost::new(runtime));
    AppServerRuntimeFactory::aster_runtime_core_with_sources_and_evidence_export_provider(
        host,
        capability_source,
        artifact_content_provider,
        evidence_export_provider,
    )
}

pub(crate) fn build_desktop_aster_app_server(runtime: RuntimeCommandContext) -> AppServer {
    let app_server_bridge = Arc::new(OnceLock::new());
    let capability_source = desktop_app_server_capability_source_with_runtime(runtime.clone());
    let artifact_content_provider = desktop_artifact_content_provider_with_runtime(&runtime);
    let evidence_export_provider = desktop_evidence_export_provider_with_runtime(&runtime);
    let host: Arc<dyn AsterBackendHost> = Arc::new(TauriAsterBackendHost::with_app_server_bridge(
        runtime,
        app_server_bridge.clone(),
    ));
    let server = AppServer::with_runtime(
        AppServerRuntimeFactory::aster_runtime_core_with_sources_and_evidence_export_provider(
            host,
            capability_source,
            artifact_content_provider,
            evidence_export_provider,
        ),
    );
    let _ = app_server_bridge.set(server.event_bridge());
    server
}

#[derive(Clone)]
struct DesktopRuntimeCapabilitySource {
    inventory_records: Arc<RwLock<Vec<CapabilityInventoryRecord>>>,
    session_policy_records: Arc<RwLock<Vec<CapabilityInventoryRecord>>>,
    workspace_root_resolver: DesktopWorkspaceRootResolver,
}

impl DesktopRuntimeCapabilitySource {
    fn baseline() -> Self {
        Self::new(capability_inventory_records_from_tool_inventory(
            &desktop_app_server_baseline_tool_inventory(),
        ))
    }

    fn new(records: Vec<CapabilityInventoryRecord>) -> Self {
        Self::new_with_workspace_root_resolver(records, missing_desktop_workspace_root_resolver())
    }

    fn new_with_workspace_root_resolver(
        records: Vec<CapabilityInventoryRecord>,
        workspace_root_resolver: DesktopWorkspaceRootResolver,
    ) -> Self {
        Self {
            inventory_records: Arc::new(RwLock::new(records)),
            session_policy_records: Arc::new(RwLock::new(Vec::new())),
            workspace_root_resolver,
        }
    }

    fn replace_from_inventory(&self, inventory: &AgentToolInventorySnapshot) {
        let records = capability_inventory_records_from_tool_inventory(inventory);
        self.replace_records(records);
    }

    fn replace_records(&self, records: Vec<CapabilityInventoryRecord>) {
        match self.inventory_records.write() {
            Ok(mut current) => {
                *current = records;
            }
            Err(error) => {
                tracing::warn!(
                    "[AppServerHost] failed to update capability inventory cache: {}",
                    error
                );
            }
        }
    }

    fn replace_session_policy_records_for_context(
        &self,
        context: &CapabilityListContext,
        records: Vec<CapabilityInventoryRecord>,
    ) {
        let session_id = context.session_id.as_deref().map(str::trim);
        match self.session_policy_records.write() {
            Ok(mut current) => {
                if let Some(session_id) = session_id.filter(|value| !value.is_empty()) {
                    current.retain(|record| {
                        !record
                            .session_ids
                            .iter()
                            .any(|record_session_id| record_session_id == session_id)
                    });
                }
                current.extend(records);
            }
            Err(error) => {
                tracing::warn!(
                    "[AppServerHost] failed to update scoped session policy capability records: {}",
                    error
                );
            }
        }
    }

    fn all_records(&self) -> Vec<CapabilityInventoryRecord> {
        let mut records = match self.inventory_records.read() {
            Ok(records) => records.clone(),
            Err(error) => {
                tracing::warn!(
                    "[AppServerHost] failed to read capability inventory cache: {}",
                    error
                );
                capability_inventory_records_from_tool_inventory(
                    &desktop_app_server_baseline_tool_inventory(),
                )
            }
        };
        match self.session_policy_records.read() {
            Ok(session_records) => records.extend(session_records.clone()),
            Err(error) => {
                tracing::warn!(
                    "[AppServerHost] failed to read session policy capability records: {}",
                    error
                );
            }
        }
        records
    }

    fn spawn_refresh(&self, runtime: RuntimeCommandContext) {
        let source = self.clone();
        tauri::async_runtime::spawn(async move {
            let mut records = match collect_runtime_tool_inventory(
                runtime.app_handle(),
                runtime.state(),
                runtime.db(),
                runtime.api_key_provider_service(),
                runtime.config_manager(),
                runtime.mcp_manager(),
                WorkspaceToolSurface::workbench_with_browser_assist(),
                "assistant".to_string(),
                None,
            )
            .await
            {
                Ok(inventory) => capability_inventory_records_from_tool_inventory(&inventory),
                Err(error) => {
                    tracing::warn!(
                        "[AppServerHost] failed to refresh desktop capability inventory: {}",
                        error
                    );
                    capability_inventory_records_from_tool_inventory(
                        &desktop_app_server_baseline_tool_inventory(),
                    )
                }
            };
            records.extend(collect_desktop_workspace_skill_capability_records(
                runtime.db(),
            ));
            source.replace_records(records);
        });
    }
}

impl CapabilitySource for DesktopRuntimeCapabilitySource {
    fn list_capabilities(&self, context: &CapabilityListContext) -> Vec<CapabilityDescriptor> {
        CapabilityInventorySource::new(self.all_records()).list_capabilities(context)
    }

    fn prepare_turn_capabilities(
        &self,
        context: &CapabilityListContext,
        runtime_options: Option<&RuntimeOptions>,
    ) {
        let records = desktop_session_policy_capability_records_from_runtime_options(
            context,
            runtime_options,
            &self.workspace_root_resolver,
        );
        self.replace_session_policy_records_for_context(context, records);
    }
}

fn desktop_app_server_capability_source() -> DesktopRuntimeCapabilitySource {
    DesktopRuntimeCapabilitySource::baseline()
}

fn desktop_app_server_capability_source_with_workspace_root_resolver(
    workspace_root_resolver: DesktopWorkspaceRootResolver,
) -> DesktopRuntimeCapabilitySource {
    DesktopRuntimeCapabilitySource::new_with_workspace_root_resolver(
        capability_inventory_records_from_tool_inventory(
            &desktop_app_server_baseline_tool_inventory(),
        ),
        workspace_root_resolver,
    )
}

fn desktop_app_server_capability_source_with_runtime(
    runtime: RuntimeCommandContext,
) -> Arc<dyn CapabilitySource> {
    let source = desktop_app_server_capability_source_with_workspace_root_resolver(
        desktop_workspace_root_resolver_from_db(runtime.db().clone()),
    );
    source.spawn_refresh(runtime);
    Arc::new(source)
}

#[derive(Clone)]
struct DesktopArtifactContentProvider {
    workspace_root_resolver: DesktopWorkspaceRootResolver,
}

impl DesktopArtifactContentProvider {
    fn new(workspace_root_resolver: DesktopWorkspaceRootResolver) -> Self {
        Self {
            workspace_root_resolver,
        }
    }
}

impl ArtifactContentProvider for DesktopArtifactContentProvider {
    fn read_content(&self, request: &ArtifactContentRequest) -> Option<String> {
        let workspace_root = resolve_desktop_artifact_workspace_root(
            request.session.workspace_id.as_deref(),
            &self.workspace_root_resolver,
        )?;
        FilesystemArtifactContentProvider::new(workspace_root).read_content(request)
    }
}

fn resolve_desktop_artifact_workspace_root(
    workspace_id: Option<&str>,
    workspace_root_resolver: &DesktopWorkspaceRootResolver,
) -> Option<String> {
    let workspace_id = workspace_id?.trim();
    if workspace_id.is_empty() || workspace_id_is_absolute_path(workspace_id) {
        return None;
    }
    let workspace_root = workspace_root_resolver(workspace_id).ok().flatten()?;
    let workspace_root = workspace_root.trim().to_string();
    if workspace_root.is_empty() || !workspace_id_is_absolute_path(&workspace_root) {
        return None;
    }
    Some(workspace_root)
}

fn desktop_artifact_content_provider_with_runtime(
    runtime: &RuntimeCommandContext,
) -> Arc<dyn ArtifactContentProvider> {
    Arc::new(DesktopArtifactContentProvider::new(
        desktop_workspace_root_resolver_from_db(runtime.db().clone()),
    ))
}

#[derive(Clone)]
struct DesktopEvidenceExportProvider {
    runtime: RuntimeCommandContext,
}

impl DesktopEvidenceExportProvider {
    fn new(runtime: RuntimeCommandContext) -> Self {
        Self { runtime }
    }
}

#[async_trait]
impl EvidenceExportProvider for DesktopEvidenceExportProvider {
    async fn export_evidence_pack(
        &self,
        request: &EvidencePackRequest,
    ) -> Result<Option<EvidencePackSummary>, RuntimeCoreError> {
        let locale = self.runtime.config_manager().0.config().language;
        let (_, export) = export_runtime_evidence_pack_for_runtime(
            &self.runtime,
            &request.session.session_id,
            Some(locale.as_str()),
            "App Server evidence/export 前",
        )
        .await
        .map_err(RuntimeCoreError::Backend)?;

        Ok(Some(evidence_pack_summary_from_runtime_export(export)))
    }
}

fn desktop_evidence_export_provider_with_runtime(
    runtime: &RuntimeCommandContext,
) -> Arc<dyn EvidenceExportProvider> {
    Arc::new(DesktopEvidenceExportProvider::new(runtime.clone()))
}

fn evidence_pack_summary_from_runtime_export(
    export: RuntimeEvidencePackExportResult,
) -> EvidencePackSummary {
    EvidencePackSummary {
        pack_relative_root: export.pack_relative_root,
        pack_absolute_root: Some(export.pack_absolute_root),
        exported_at: export.exported_at,
        thread_status: export.thread_status,
        latest_turn_status: export.latest_turn_status,
        turn_count: export.turn_count,
        item_count: export.item_count,
        pending_request_count: export.pending_request_count,
        queued_turn_count: export.queued_turn_count,
        recent_artifact_count: export.recent_artifact_count,
        known_gaps: export.known_gaps,
        observability_summary: Some(export.observability_summary),
        completion_audit_summary: Some(export.completion_audit_summary),
        artifacts: export
            .artifacts
            .into_iter()
            .map(evidence_pack_artifact_from_runtime_artifact)
            .collect(),
    }
}

fn evidence_pack_artifact_from_runtime_artifact(
    artifact: RuntimeEvidenceArtifact,
) -> EvidencePackArtifact {
    EvidencePackArtifact {
        kind: runtime_evidence_artifact_kind_value(&artifact.kind).to_string(),
        title: artifact.title,
        relative_path: artifact.relative_path,
        absolute_path: Some(artifact.absolute_path),
        bytes: artifact.bytes,
    }
}

fn runtime_evidence_artifact_kind_value(kind: &RuntimeEvidenceArtifactKind) -> &'static str {
    match kind {
        RuntimeEvidenceArtifactKind::Summary => "summary",
        RuntimeEvidenceArtifactKind::Runtime => "runtime",
        RuntimeEvidenceArtifactKind::Timeline => "timeline",
        RuntimeEvidenceArtifactKind::Artifacts => "artifacts",
    }
}

fn desktop_app_server_baseline_tool_inventory() -> AgentToolInventorySnapshot {
    let inventory = build_tool_inventory(AgentToolInventoryBuildInput {
        surface: WorkspaceToolSurface::workbench_with_browser_assist(),
        caller: "assistant".to_string(),
        agent_initialized: false,
        warnings: Vec::new(),
        persisted_execution_policy: None,
        request_metadata: None,
        mcp_server_names: Vec::new(),
        mcp_tools: Vec::new(),
        registry_definitions: Vec::new(),
        resource_helpers_supported: false,
        current_surface_tool_names: Vec::new(),
        extension_configs: Vec::new(),
        visible_extension_tools: Vec::new(),
        searchable_extension_tools: Vec::new(),
    });
    inventory
}

fn capability_inventory_records_from_tool_inventory(
    inventory: &AgentToolInventorySnapshot,
) -> Vec<CapabilityInventoryRecord> {
    let mut records = vec![CapabilityInventoryRecord::agent_session()];
    let mut seen = records
        .iter()
        .map(|record| record.descriptor.id.clone())
        .collect::<HashSet<_>>();

    for tool in inventory
        .catalog_tools
        .iter()
        .filter(|tool| tool.lifecycle == ToolLifecycle::Current)
    {
        insert_tool_capability_record(
            &mut records,
            &mut seen,
            &tool.name,
            Some("Desktop tool catalog capability".to_string()),
        );
    }

    for tool in inventory
        .runtime_tools
        .iter()
        .filter(|tool| tool.visible_in_context)
    {
        insert_tool_capability_record(
            &mut records,
            &mut seen,
            &tool.name,
            Some(tool.description.clone()),
        );
    }

    records
}

fn collect_desktop_workspace_skill_capability_records(
    db: &crate::database::DbConnection,
) -> Vec<CapabilityInventoryRecord> {
    let manager = WorkspaceManager::new(db.clone());
    let workspaces = match manager.list() {
        Ok(workspaces) => workspaces,
        Err(error) => {
            tracing::warn!(
                "[AppServerHost] failed to list workspaces for capability inventory: {}",
                error
            );
            return Vec::new();
        }
    };
    let mut records = Vec::new();

    for workspace in workspaces {
        let workspace_id = workspace.id.trim().to_string();
        if workspace_id.is_empty() {
            continue;
        }
        let workspace_root = workspace.root_path.to_string_lossy().to_string();
        match list_workspace_skill_bindings(AgentRuntimeListWorkspaceSkillBindingsRequest {
            workspace_root: workspace_root.clone(),
            caller: Some("assistant".to_string()),
            workbench: true,
            browser_assist: true,
        }) {
            Ok(bindings) => {
                append_workspace_skill_capability_records(&mut records, &workspace_id, &bindings)
            }
            Err(error) => {
                tracing::warn!(
                    "[AppServerHost] failed to refresh workspace skill capabilities: workspace_id={}, workspace_root={}, error={}",
                    workspace_id,
                    workspace_root,
                    error
                );
            }
        }
    }

    records
}

fn append_workspace_skill_capability_records(
    records: &mut Vec<CapabilityInventoryRecord>,
    workspace_id: &str,
    bindings: &AgentRuntimeWorkspaceSkillBindings,
) {
    let workspace_id = workspace_id.trim();
    if workspace_id.is_empty() {
        return;
    }

    let mut seen = records
        .iter()
        .flat_map(|record| {
            record
                .workspace_ids
                .iter()
                .map(move |scope| (record.descriptor.id.clone(), scope.clone()))
        })
        .collect::<HashSet<_>>();

    for binding in bindings.bindings.iter().filter(|binding| {
        binding.binding_status == AgentRuntimeWorkspaceSkillBindingStatus::ReadyForManualEnable
    }) {
        let directory = binding.directory.trim();
        if directory.is_empty() {
            continue;
        }
        if binding.runtime_binding_target != "workspace_skill" {
            continue;
        }
        let id = workspace_skill_capability_id(directory);
        if !seen.insert((id.clone(), workspace_id.to_string())) {
            continue;
        }
        records.push(
            CapabilityInventoryRecord::new(CapabilityDescriptor {
                id,
                title: binding.name.clone(),
                description: workspace_skill_capability_description(
                    &binding.description,
                    &binding.permission_summary,
                ),
                methods: vec![METHOD_CAPABILITY_LIST.to_string()],
            })
            .for_workspaces([workspace_id.to_string()]),
        );
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DesktopSessionPolicyCapabilityStatus {
    Executable,
    DiscoveryOnly,
    Blocked,
    Denied,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DesktopSessionPolicyCapabilityFact {
    id: String,
    title: String,
    description: Option<String>,
    app_id: String,
    workspace_id: String,
    session_id: String,
    status: DesktopSessionPolicyCapabilityStatus,
}

fn append_desktop_session_policy_capability_records(
    records: &mut Vec<CapabilityInventoryRecord>,
    facts: &[DesktopSessionPolicyCapabilityFact],
) {
    let mut seen = records
        .iter()
        .flat_map(|record| {
            record.session_ids.iter().map(move |session_id| {
                (
                    record.descriptor.id.clone(),
                    session_id.clone(),
                    record.descriptor.methods.clone(),
                )
            })
        })
        .collect::<HashSet<_>>();

    for fact in facts {
        let id = fact.id.trim();
        let title = fact.title.trim();
        let app_id = fact.app_id.trim();
        let workspace_id = fact.workspace_id.trim();
        let session_id = fact.session_id.trim();
        if id.is_empty()
            || title.is_empty()
            || app_id.is_empty()
            || workspace_id.is_empty()
            || session_id.is_empty()
        {
            continue;
        }

        let record = match fact.status {
            DesktopSessionPolicyCapabilityStatus::Executable => {
                CapabilityInventoryRecord::executable_agent_turn(
                    id.to_string(),
                    title.to_string(),
                    fact.description.clone(),
                )
            }
            DesktopSessionPolicyCapabilityStatus::DiscoveryOnly => {
                CapabilityInventoryRecord::new(CapabilityDescriptor {
                    id: id.to_string(),
                    title: title.to_string(),
                    description: fact.description.clone(),
                    methods: vec![METHOD_CAPABILITY_LIST.to_string()],
                })
            }
            DesktopSessionPolicyCapabilityStatus::Blocked
            | DesktopSessionPolicyCapabilityStatus::Denied => {
                continue;
            }
        }
        .for_apps([app_id.to_string()])
        .for_workspaces([workspace_id.to_string()])
        .for_sessions([session_id.to_string()]);

        if !seen.insert((
            record.descriptor.id.clone(),
            session_id.to_string(),
            record.descriptor.methods.clone(),
        )) {
            continue;
        }
        records.push(record);
    }
}

fn workspace_skill_capability_description(
    description: &str,
    permission_summary: &[String],
) -> Option<String> {
    let description = description.trim();
    let permission_summary = permission_summary
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("; ");
    match (description.is_empty(), permission_summary.is_empty()) {
        (true, true) => Some(
            "Workspace skill ready for manual runtime enable; not injected by default.".to_string(),
        ),
        (false, true) => Some(format!(
            "{description} Ready for manual runtime enable; not injected by default."
        )),
        (true, false) => Some(format!(
            "Workspace skill ready for manual runtime enable; permissions: {permission_summary}."
        )),
        (false, false) => Some(format!(
            "{description} Ready for manual runtime enable; permissions: {permission_summary}."
        )),
    }
}

fn insert_tool_capability_record(
    records: &mut Vec<CapabilityInventoryRecord>,
    seen: &mut HashSet<String>,
    tool_name: &str,
    description: Option<String>,
) {
    let id = runtime_tool_capability_id(tool_name);
    if !seen.insert(id.clone()) {
        return;
    }
    records.push(CapabilityInventoryRecord::executable_agent_turn(
        id,
        tool_name.to_string(),
        description,
    ));
}

fn runtime_tool_capability_id(tool_name: &str) -> String {
    format!("tool.{}", tool_name)
}

fn workspace_skill_capability_id(directory: &str) -> String {
    format!("workspace_skill.{}", directory.trim())
}

fn workspace_id_is_absolute_path(workspace_id: &str) -> bool {
    Path::new(workspace_id.trim()).is_absolute()
}

fn missing_desktop_workspace_root_resolver() -> DesktopWorkspaceRootResolver {
    Arc::new(|_| Ok(None))
}

fn desktop_workspace_root_resolver_from_db(
    db: crate::database::DbConnection,
) -> DesktopWorkspaceRootResolver {
    Arc::new(move |workspace_id| resolve_desktop_workspace_root_from_db(&db, workspace_id))
}

fn resolve_desktop_workspace_root_from_db(
    db: &crate::database::DbConnection,
    workspace_id: &str,
) -> Result<Option<String>, String> {
    let workspace_id = workspace_id.trim();
    if workspace_id.is_empty() {
        return Ok(None);
    }
    let manager = WorkspaceManager::new(db.clone());
    let workspace = manager
        .get(&workspace_id.to_string())
        .map_err(|error| format!("读取 workspace 失败: {error}"))?;
    Ok(workspace.map(|workspace| workspace.root_path.to_string_lossy().to_string()))
}

fn resolve_desktop_capability_workspace_root(
    workspace_id: &str,
    workspace_root_resolver: &DesktopWorkspaceRootResolver,
) -> Result<Option<String>, String> {
    let workspace_id = workspace_id.trim();
    if workspace_id.is_empty() {
        return Ok(None);
    }
    if workspace_id_is_absolute_path(workspace_id) {
        return Ok(Some(workspace_id.to_string()));
    }

    let Some(workspace_root) = workspace_root_resolver(workspace_id)?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };
    if !workspace_id_is_absolute_path(&workspace_root) {
        return Err(format!(
            "workspace root resolver returned non-absolute root for workspace_id={workspace_id}: {workspace_root}"
        ));
    }
    Ok(Some(workspace_root))
}

fn desktop_session_policy_capability_records_from_runtime_options(
    context: &CapabilityListContext,
    runtime_options: Option<&RuntimeOptions>,
    workspace_root_resolver: &DesktopWorkspaceRootResolver,
) -> Vec<CapabilityInventoryRecord> {
    let (Some(app_id), Some(workspace_id), Some(session_id)) = (
        context.app_id.as_deref(),
        context.workspace_id.as_deref(),
        context.session_id.as_deref(),
    ) else {
        return Vec::new();
    };
    let Some(metadata) = runtime_options.and_then(|options| options.metadata.as_ref()) else {
        return Vec::new();
    };

    let workspace_root = match resolve_desktop_capability_workspace_root(
        workspace_id,
        workspace_root_resolver,
    ) {
        Ok(Some(workspace_root)) => workspace_root,
        Ok(None) => return Vec::new(),
        Err(error) => {
            tracing::warn!(
                "[AppServerHost] failed to resolve workspace root for capability source: session_id={}, workspace_id={}, error={}",
                session_id,
                workspace_id,
                error
            );
            return Vec::new();
        }
    };

    let projection = match resolve_workspace_skill_runtime_enable(Some(metadata), &workspace_root) {
        Ok(Some(projection)) => projection,
        Ok(None) => return Vec::new(),
        Err(error) => {
            tracing::warn!(
                "[AppServerHost] failed to resolve workspace skill runtime enable for capability source: session_id={}, workspace_id={}, error={}",
                session_id,
                workspace_id,
                error
            );
            return Vec::new();
        }
    };
    desktop_session_policy_capability_records_from_runtime_enable_projection(
        app_id,
        workspace_id,
        session_id,
        &projection,
    )
}

fn desktop_session_policy_capability_records_from_runtime_enable_projection(
    app_id: &str,
    workspace_id: &str,
    session_id: &str,
    projection: &WorkspaceSkillRuntimeEnableProjection,
) -> Vec<CapabilityInventoryRecord> {
    let mut records = Vec::new();
    let facts = projection
        .bindings
        .iter()
        .map(|binding| DesktopSessionPolicyCapabilityFact {
            id: workspace_skill_capability_id(&binding.directory),
            title: format!("Skill {}", binding.directory),
            description: workspace_skill_runtime_enable_capability_description(
                &binding.permission_summary,
            ),
            app_id: app_id.to_string(),
            workspace_id: workspace_id.to_string(),
            session_id: session_id.to_string(),
            status: DesktopSessionPolicyCapabilityStatus::Executable,
        })
        .collect::<Vec<_>>();
    append_desktop_session_policy_capability_records(&mut records, &facts);
    records
}

fn workspace_skill_runtime_enable_capability_description(
    permission_summary: &[String],
) -> Option<String> {
    let permission_summary = permission_summary
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join("; ");
    if permission_summary.is_empty() {
        Some("Workspace skill manually enabled for this App Server session.".to_string())
    } else {
        Some(format!(
            "Workspace skill manually enabled for this App Server session; permissions: {permission_summary}."
        ))
    }
}

pub(crate) struct DesktopAppServerSubmitTurnInput<'a> {
    pub(crate) client_name: &'a str,
    pub(crate) client_title: &'a str,
    pub(crate) app_id: &'a str,
    pub(crate) session_id: &'a str,
    pub(crate) workspace_id: &'a str,
    pub(crate) turn_id: Option<&'a str>,
    pub(crate) event_name: &'a str,
    pub(crate) message: String,
    pub(crate) metadata: Option<serde_json::Value>,
    pub(crate) provider_preference: Option<&'a str>,
    pub(crate) model_preference: Option<&'a str>,
    pub(crate) queue_if_busy: bool,
    pub(crate) skip_pre_submit_resume: bool,
    pub(crate) queued_turn_id: Option<String>,
    pub(crate) host_options: Option<serde_json::Value>,
}

pub(crate) async fn submit_desktop_app_server_turn(
    app_server: &AppServer,
    input: DesktopAppServerSubmitTurnInput<'_>,
) -> Result<(), String> {
    initialize_desktop_app_server_adapter(app_server, &input).await?;
    match app_server
        .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
            RequestId::String(format!("desktop-session-{}", input.session_id)),
            METHOD_AGENT_SESSION_START,
            Some(
                serde_json::to_value(AgentSessionStartParams {
                    session_id: Some(input.session_id.to_string()),
                    thread_id: None,
                    app_id: input.app_id.to_string(),
                    workspace_id: Some(input.workspace_id.to_string()),
                    business_object_ref: None,
                    locale: None,
                })
                .map_err(|error| error.to_string())?,
            ),
        )))
        .await
        .map_err(|error| error.to_string())?
        .first()
    {
        Some(JsonRpcMessage::Response(_)) => {}
        Some(JsonRpcMessage::Error(error))
            if error.error.code == error_codes::SESSION_ALREADY_EXISTS => {}
        Some(JsonRpcMessage::Error(error)) => return Err(error.error.message.clone()),
        Some(other) => return Err(format!("unexpected App Server session response: {other:?}")),
        None => return Err("App Server session start returned no response".to_string()),
    }

    let response = app_server
        .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
            RequestId::String(format!(
                "desktop-turn-{}",
                input.turn_id.unwrap_or(input.session_id)
            )),
            METHOD_AGENT_SESSION_TURN_START,
            Some(
                serde_json::to_value(AgentSessionTurnStartParams {
                    session_id: input.session_id.to_string(),
                    turn_id: input.turn_id.map(str::to_string),
                    input: AgentInput {
                        text: input.message,
                        attachments: Vec::new(),
                    },
                    runtime_options: Some(RuntimeOptions {
                        capability_id: None,
                        stream: true,
                        event_name: Some(input.event_name.to_string()),
                        provider_preference: input.provider_preference.map(str::to_string),
                        model_preference: input.model_preference.map(str::to_string),
                        metadata: input.metadata,
                        queued_turn_id: input.queued_turn_id,
                        host_options: input.host_options,
                    }),
                    queue_if_busy: input.queue_if_busy,
                    skip_pre_submit_resume: input.skip_pre_submit_resume,
                })
                .map_err(|error| error.to_string())?,
            ),
        )))
        .await
        .map_err(|error| error.to_string())?;

    match response.first() {
        Some(JsonRpcMessage::Response(_)) => Ok(()),
        Some(JsonRpcMessage::Error(error)) => Err(error.error.message.clone()),
        Some(other) => Err(format!("unexpected App Server turn response: {other:?}")),
        None => Err("App Server turn start returned no response".to_string()),
    }
}

pub(crate) struct DesktopAsterChatSubmitInput<'a> {
    pub(crate) client_name: &'a str,
    pub(crate) client_title: &'a str,
    pub(crate) app_id: &'a str,
    pub(crate) request: AsterChatRequest,
    pub(crate) queue_if_busy: bool,
    pub(crate) skip_pre_submit_resume: bool,
}

pub(crate) fn ensure_desktop_aster_chat_request_ids(
    request: &mut AsterChatRequest,
    queue_if_busy: bool,
) -> Result<String, String> {
    if request.workspace_id.trim().is_empty() {
        return Err("workspace_id 必填，请先选择项目工作区".to_string());
    }
    request.workspace_id = request.workspace_id.trim().to_string();
    request.turn_id = Some(
        request
            .turn_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| Uuid::new_v4().to_string()),
    );
    let queued_turn_id = request
        .queued_turn_id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    request.queued_turn_id = Some(queued_turn_id.clone());
    request.queue_if_busy = Some(queue_if_busy);
    Ok(queued_turn_id)
}

pub(crate) async fn submit_desktop_aster_chat_request(
    app_server: &AppServer,
    input: DesktopAsterChatSubmitInput<'_>,
) -> Result<String, String> {
    let mut request = input.request;
    let queued_turn_id = ensure_desktop_aster_chat_request_ids(&mut request, input.queue_if_busy)?;
    let host_options = serde_json::to_value(&request).map_err(|error| error.to_string())?;
    let session_id = request.session_id.clone();
    let workspace_id = request.workspace_id.clone();
    let turn_id = request.turn_id.clone();
    let event_name = request.event_name.clone();
    let message = request.message.clone();
    let metadata = request.metadata.clone();
    let provider_preference = request.provider_preference.clone();
    let model_preference = request.model_preference.clone();

    submit_desktop_app_server_turn(
        app_server,
        DesktopAppServerSubmitTurnInput {
            client_name: input.client_name,
            client_title: input.client_title,
            app_id: input.app_id,
            session_id: &session_id,
            workspace_id: &workspace_id,
            turn_id: turn_id.as_deref(),
            event_name: &event_name,
            message,
            metadata,
            provider_preference: provider_preference.as_deref(),
            model_preference: model_preference.as_deref(),
            queue_if_busy: input.queue_if_busy,
            skip_pre_submit_resume: input.skip_pre_submit_resume,
            queued_turn_id: Some(queued_turn_id.clone()),
            host_options: Some(serde_json::json!({
                "asterChatRequest": host_options
            })),
        },
    )
    .await?;

    Ok(queued_turn_id)
}

async fn initialize_desktop_app_server_adapter(
    app_server: &AppServer,
    input: &DesktopAppServerSubmitTurnInput<'_>,
) -> Result<(), String> {
    let initialize_response = app_server
        .handle_message(JsonRpcMessage::Request(JsonRpcRequest::new(
            RequestId::String(format!("desktop-init-{}", input.client_name)),
            METHOD_INITIALIZE,
            Some(serde_json::json!({
                "clientInfo": {
                    "name": input.client_name,
                    "title": input.client_title,
                },
                "capabilities": {
                    "eventMethods": [METHOD_AGENT_SESSION_EVENT]
                }
            })),
        )))
        .await
        .map_err(|error| error.to_string())?;

    match initialize_response.first() {
        Some(JsonRpcMessage::Response(_)) => {}
        Some(JsonRpcMessage::Error(error))
            if error.error.code == error_codes::ALREADY_INITIALIZED => {}
        Some(JsonRpcMessage::Error(error)) => return Err(error.error.message.clone()),
        Some(other) => {
            return Err(format!(
                "unexpected App Server initialize response: {other:?}"
            ))
        }
        None => return Err("App Server initialize returned no response".to_string()),
    }

    app_server
        .handle_message(JsonRpcMessage::Notification(JsonRpcNotification::new(
            METHOD_INITIALIZED,
            Some(serde_json::json!({})),
        )))
        .await
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[derive(Debug, Clone)]
struct DesktopAsterQueuedTurn {
    queued_task: QueuedTurnTask<serde_json::Value>,
    queue_if_busy: bool,
    skip_pre_submit_resume: bool,
}

fn desktop_aster_queued_turn_from_backend_request(
    request: &AsterBackendSubmitRequest,
) -> Result<DesktopAsterQueuedTurn, String> {
    let runtime_request = aster_chat_request_from_backend_request(request);
    let queued_task = build_queued_turn_task(runtime_request)?;
    Ok(DesktopAsterQueuedTurn {
        queued_task,
        queue_if_busy: request.queue_if_busy,
        skip_pre_submit_resume: request.skip_pre_submit_resume,
    })
}

static TAURI_APP_SERVER: OnceLock<InProcessAppServerState> = OnceLock::new();

struct InProcessAppServerState {
    server: AppServer,
}

fn in_process_app_server(runtime: RuntimeCommandContext) -> &'static InProcessAppServerState {
    TAURI_APP_SERVER.get_or_init(|| {
        let app_server_bridge = Arc::new(OnceLock::new());
        let direct_event_scopes = Arc::new(Mutex::new(HashMap::new()));
        let event_port = Arc::new(AppServerRuntimeQueueEventPort::new(
            runtime.app_handle().clone(),
            app_server_bridge.clone(),
            direct_event_scopes.clone(),
        ));
        let runtime = runtime.with_runtime_queue_event_port(event_port);
        let capability_source = desktop_app_server_capability_source_with_runtime(runtime.clone());
        let artifact_content_provider = desktop_artifact_content_provider_with_runtime(&runtime);
        let evidence_export_provider = desktop_evidence_export_provider_with_runtime(&runtime);
        let host: Arc<dyn AsterBackendHost> =
            Arc::new(TauriAsterBackendHost::with_direct_app_server_bridge(
                runtime,
                app_server_bridge.clone(),
                direct_event_scopes,
            ));
        let server = AppServer::with_runtime(
            AppServerRuntimeFactory::aster_runtime_core_with_sources_and_evidence_export_provider(
                host,
                capability_source,
                artifact_content_provider,
                evidence_export_provider,
            ),
        );
        let _ = app_server_bridge.set(server.event_bridge());
        InProcessAppServerState { server }
    })
}

pub(crate) async fn handle_in_process_app_server_json_lines(
    runtime: RuntimeCommandContext,
    request_lines: Vec<String>,
) -> Result<Vec<String>, String> {
    let app_server = in_process_app_server(runtime);
    let mut lines = Vec::new();
    for line in request_lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let responses = app_server
            .server
            .handle_json_line(trimmed)
            .await
            .map_err(|error| error.to_string())?;
        lines.extend(responses);
    }
    Ok(lines)
}

#[async_trait]
impl AsterBackendHost for TauriAsterBackendHost {
    async fn submit_turn(
        &self,
        request: AsterBackendSubmitRequest,
    ) -> Result<AsterBackendSubmitResult, RuntimeCoreError> {
        self.runtime_host
            .ensure_persisted_session(
                desktop_aster_session_persistence_request_from_backend_request(&request),
            )
            .await
            .map_err(RuntimeCoreError::Backend)?;
        let queued_turn = desktop_aster_queued_turn_from_backend_request(&request)
            .map_err(RuntimeCoreError::Backend)?;
        let bridge_registration =
            desktop_aster_event_bridge_registration_from_backend_request(&request);
        let bridge_key = self.event_subscriptions.register(&bridge_registration);
        if let Err(error) = self.runtime_host.submit_runtime_turn(queued_turn).await {
            if let Some(bridge_key) = bridge_key {
                self.event_subscriptions.unregister(&bridge_key);
            }
            return Err(RuntimeCoreError::Backend(error));
        }

        Ok(AsterBackendSubmitResult::default())
    }

    async fn cancel_turn(
        &self,
        request: AsterBackendCancelRequest,
    ) -> Result<AsterBackendCancelResult, RuntimeCoreError> {
        let input = desktop_aster_cancel_input_from_backend_request(&request);
        let operation = desktop_aster_cancel_operation_from_input(&input);
        let outcome = self
            .runtime_host
            .cancel_turn(&operation)
            .await
            .map_err(RuntimeCoreError::Backend)?;

        if !outcome.touched_runtime() {
            tracing::debug!(
                "[AppServerHost] cancel_turn did not find active runtime: session_id={}, turn_id={}",
                input.session_id,
                input.turn_id
            );
        }

        Ok(AsterBackendCancelResult::default())
    }

    async fn respond_action(
        &self,
        request: AsterBackendActionRespondRequest,
    ) -> Result<AsterBackendActionRespondResult, RuntimeCoreError> {
        let input = desktop_aster_action_response_input_from_backend_request(request);
        let operation = desktop_aster_action_response_operation_from_input(input);
        self.runtime_host
            .respond_action(operation)
            .await
            .map_err(RuntimeCoreError::Backend)?;
        Ok(AsterBackendActionRespondResult::default())
    }
}

fn desktop_aster_cancel_input_from_backend_request(
    request: &AsterBackendCancelRequest,
) -> DesktopAsterCancelInput {
    DesktopAsterCancelInput {
        session_id: request.session.session_id.clone(),
        turn_id: request.turn.turn_id.clone(),
        event_name: request.event_name.clone(),
    }
}

fn desktop_aster_cancel_operation_from_input(
    input: &DesktopAsterCancelInput,
) -> DesktopAsterCancelOperation {
    DesktopAsterCancelOperation {
        session_id: input.session_id.clone(),
        turn_id: input.turn_id.clone(),
        interrupt_message: RUNTIME_INTERRUPT_MESSAGE.to_string(),
    }
}

fn desktop_aster_event_bridge_registration_from_backend_request(
    request: &AsterBackendSubmitRequest,
) -> DesktopAsterEventBridgeRegistration {
    DesktopAsterEventBridgeRegistration {
        event_name: request.event_name.clone(),
        session_id: request.session.session_id.clone(),
        turn_id: request.turn.turn_id.clone(),
    }
}

fn app_server_event_bridge_key(session_id: &str) -> String {
    session_id.to_string()
}

fn parse_lime_agent_event_payload(payload: &str) -> Result<lime_agent::AgentEvent, String> {
    serde_json::from_str(payload)
        .map_err(|error| format!("failed to parse lime-agent event payload: {error}"))
}

fn app_server_session_id_from_event_name(event_name: &str) -> Option<String> {
    event_name
        .trim()
        .strip_prefix("agentSession/event/")
        .map(str::trim)
        .filter(|session_id| !session_id.is_empty())
        .map(str::to_string)
}

fn desktop_aster_action_response_input_from_backend_request(
    request: AsterBackendActionRespondRequest,
) -> DesktopAsterActionResponseInput {
    let session_id = request.session.session_id.clone();
    let thread_id = request.session.thread_id.clone();
    DesktopAsterActionResponseInput {
        session_id: session_id.clone(),
        request_id: request.request_id,
        action_type: runtime_action_type_from_app_server(request.action_type),
        confirmed: request.confirmed,
        response: request.response,
        user_data: request.user_data,
        metadata: request.metadata,
        event_name: Some(request.event_name),
        action_scope: request
            .action_scope
            .map(runtime_action_scope_from_app_server_scope)
            .or_else(|| {
                request.turn.map(|turn| AgentRuntimeActionScope {
                    session_id: Some(session_id),
                    thread_id: Some(thread_id),
                    turn_id: Some(turn.turn_id),
                })
            }),
    }
}

fn runtime_action_request_from_desktop_aster_action_response_input(
    input: DesktopAsterActionResponseInput,
) -> AgentRuntimeRespondActionRequest {
    AgentRuntimeRespondActionRequest {
        session_id: input.session_id,
        request_id: input.request_id,
        action_type: input.action_type,
        confirmed: input.confirmed,
        response: input.response,
        user_data: input.user_data,
        metadata: input.metadata,
        event_name: input.event_name,
        action_scope: input.action_scope,
    }
}

fn desktop_aster_action_response_operation_from_input(
    input: DesktopAsterActionResponseInput,
) -> DesktopAsterActionResponseOperation {
    DesktopAsterActionResponseOperation { input }
}

async fn execute_desktop_aster_action_response_operation(
    runtime: &RuntimeCommandContext,
    operation: DesktopAsterActionResponseOperation,
) -> Result<(), String> {
    respond_runtime_action_internal(
        runtime.app_handle(),
        runtime.state(),
        runtime.db(),
        runtime_action_request_from_desktop_aster_action_response_input(operation.input),
    )
    .await
}

fn runtime_action_type_from_app_server(action_type: AppServerActionType) -> AgentRuntimeActionType {
    match action_type {
        AppServerActionType::ToolConfirmation => AgentRuntimeActionType::ToolConfirmation,
        AppServerActionType::AskUser => AgentRuntimeActionType::AskUser,
        AppServerActionType::Elicitation => AgentRuntimeActionType::Elicitation,
    }
}

fn runtime_action_scope_from_app_server_scope(
    scope: AgentSessionActionScope,
) -> AgentRuntimeActionScope {
    AgentRuntimeActionScope {
        session_id: scope.session_id,
        thread_id: scope.thread_id,
        turn_id: scope.turn_id,
    }
}

fn runtime_event_turn_id(event: &RuntimeEvent) -> Option<String> {
    event
        .payload
        .get("turn_id")
        .or_else(|| event.payload.get("turnId"))
        .or_else(|| event.payload.pointer("/turn/id"))
        .or_else(|| event.payload.pointer("/turn/turn_id"))
        .or_else(|| event.payload.pointer("/turn/turnId"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|turn_id| !turn_id.is_empty())
        .map(str::to_string)
}

fn append_lime_agent_event_to_app_server_bridge(
    app_server_bridge: &AppServerEventBridge,
    event_name: &str,
    scope: Option<(String, String)>,
    event: &lime_agent::AgentEvent,
) -> Result<bool, String> {
    let (session_id, fallback_turn_id) = scope.unwrap_or_else(|| {
        (
            app_server_session_id_from_event_name(event_name).unwrap_or_default(),
            String::new(),
        )
    });
    if session_id.trim().is_empty() {
        return Err(format!(
            "runtime event name is not an app server session event: {event_name}"
        ));
    }
    let append = desktop_aster_runtime_event_bridge_append_from_event(
        session_id,
        Some(fallback_turn_id),
        event,
    )?;
    append_desktop_aster_runtime_event_to_app_server_bridge(app_server_bridge, append)
}

fn append_lime_agent_payload_to_app_server_bridge(
    app_server_bridge: &AppServerEventBridge,
    session_id: &str,
    turn_id: &str,
    payload: &str,
) -> Result<bool, String> {
    let lime_agent_event = parse_lime_agent_event_payload(payload)?;
    let append = desktop_aster_runtime_event_bridge_append_from_event(
        session_id.to_string(),
        Some(turn_id.to_string()),
        &lime_agent_event,
    )?;
    append_desktop_aster_runtime_event_to_app_server_bridge(app_server_bridge, append)
}

fn desktop_aster_runtime_event_bridge_append_from_event(
    session_id: String,
    fallback_turn_id: Option<String>,
    event: &lime_agent::AgentEvent,
) -> Result<DesktopAsterRuntimeEventBridgeAppend, String> {
    let should_close = should_close_app_server_event_bridge(event);
    let runtime_event = runtime_event_from_lime_agent_event(event)?;
    let turn_id = runtime_event_turn_id(&runtime_event).or_else(|| {
        fallback_turn_id
            .as_deref()
            .map(str::trim)
            .filter(|turn_id| !turn_id.is_empty())
            .map(ToString::to_string)
    });
    Ok(DesktopAsterRuntimeEventBridgeAppend {
        session_id,
        turn_id,
        event: runtime_event,
        should_close,
    })
}

fn append_desktop_aster_runtime_event_to_app_server_bridge(
    app_server_bridge: &AppServerEventBridge,
    append: DesktopAsterRuntimeEventBridgeAppend,
) -> Result<bool, String> {
    let should_close = append.should_close;
    app_server_bridge
        .append_external_runtime_events(
            &append.session_id,
            append.turn_id.as_deref(),
            vec![append.event],
        )
        .map_err(|error| {
            format!(
                "failed to append runtime event to app server: code={}, message={}",
                error.code, error.message
            )
        })?;
    Ok(should_close)
}

fn runtime_event_from_lime_agent_event(
    event: &lime_agent::AgentEvent,
) -> Result<RuntimeEvent, String> {
    let payload = serde_json::to_value(event)
        .map_err(|error| format!("failed to serialize lime-agent event: {error}"))?;
    let event_type = payload
        .get("type")
        .and_then(serde_json::Value::as_str)
        .map(runtime_event_type_from_backend_type)
        .unwrap_or_else(|| "backend.event".to_string());

    Ok(RuntimeEvent::new(event_type, payload))
}

fn should_close_app_server_event_bridge(event: &lime_agent::AgentEvent) -> bool {
    matches!(
        event,
        lime_agent::AgentEvent::TurnFailed { .. }
            | lime_agent::AgentEvent::FinalDone { .. }
            | lime_agent::AgentEvent::Error { .. }
    )
}

async fn execute_runtime_cancel_operation(
    runtime: &RuntimeCommandContext,
    operation: &DesktopAsterCancelOperation,
) -> Result<RuntimeHostCancelOutcome, String> {
    let cancelled = runtime.state().cancel_session(&operation.session_id).await;
    let aborted = if cancelled {
        false
    } else {
        abort_running_turn_by_id(
            runtime.db(),
            &operation.session_id,
            &operation.turn_id,
            &operation.interrupt_message,
        )?
    };
    let gate_released =
        finish_active_runtime_turn_if_matches_service(&operation.session_id, &operation.turn_id)?;
    let queue_cleared = !runtime
        .clear_runtime_queue(&operation.session_id)
        .await?
        .is_empty();

    Ok(RuntimeHostCancelOutcome {
        cancelled,
        aborted,
        gate_released,
        queue_cleared,
    })
}

async fn ensure_persisted_runtime_session(
    runtime: &RuntimeCommandContext,
    request: DesktopAsterSessionPersistenceRequest,
) -> Result<(), String> {
    let session_exists =
        crate::agent::AsterAgentWrapper::get_session_sync(runtime.db(), &request.session_id)
            .is_ok();
    let operation =
        desktop_aster_session_persistence_operation_from_request(session_exists, request)?;
    execute_desktop_aster_session_persistence_operation(runtime, operation).await
}

fn desktop_aster_session_persistence_operation_from_request(
    session_exists: bool,
    request: DesktopAsterSessionPersistenceRequest,
) -> Result<DesktopAsterSessionPersistenceOperation, String> {
    if session_exists {
        return Ok(DesktopAsterSessionPersistenceOperation::AlreadyPersisted);
    }

    request
        .create_input
        .map(DesktopAsterSessionPersistenceOperation::Create)
}

async fn execute_desktop_aster_session_persistence_operation(
    runtime: &RuntimeCommandContext,
    operation: DesktopAsterSessionPersistenceOperation,
) -> Result<(), String> {
    let DesktopAsterSessionPersistenceOperation::Create(input) = operation else {
        return Ok(());
    };

    create_runtime_session_internal_with_runtime_and_session_id(
        runtime.db(),
        runtime.state(),
        runtime.mcp_manager(),
        input.session_id,
        None,
        input.workspace_id,
        input.title,
        Some(AsterExecutionStrategy::React),
        true,
    )
    .await
    .map(|_| ())
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DesktopAsterSessionPersistenceInput {
    session_id: String,
    workspace_id: String,
    title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DesktopAsterSessionPersistenceRequest {
    session_id: String,
    create_input: Result<DesktopAsterSessionPersistenceInput, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum DesktopAsterSessionPersistenceOperation {
    AlreadyPersisted,
    Create(DesktopAsterSessionPersistenceInput),
}

fn desktop_aster_session_persistence_request_from_backend_request(
    request: &AsterBackendSubmitRequest,
) -> DesktopAsterSessionPersistenceRequest {
    DesktopAsterSessionPersistenceRequest {
        session_id: request.session.session_id.clone(),
        create_input: desktop_aster_session_persistence_input_from_backend_request(request),
    }
}

fn desktop_aster_session_persistence_input_from_backend_request(
    request: &AsterBackendSubmitRequest,
) -> Result<DesktopAsterSessionPersistenceInput, String> {
    let workspace_id = request
        .session
        .workspace_id
        .clone()
        .ok_or_else(|| "workspace_id 必填，请先选择项目工作区".to_string())?;
    let title = request
        .session
        .business_object_ref
        .as_ref()
        .and_then(|object| {
            object
                .title
                .as_ref()
                .map(|title| title.trim())
                .filter(|title| !title.is_empty())
                .map(ToString::to_string)
        });

    Ok(DesktopAsterSessionPersistenceInput {
        session_id: request.session.session_id.clone(),
        workspace_id,
        title,
    })
}

fn aster_chat_request_from_backend_request(
    request: &AsterBackendSubmitRequest,
) -> AsterChatRequest {
    if let Some(host_request) = aster_chat_request_from_host_options(request) {
        return host_request;
    }

    AsterChatRequest {
        message: request.input.text.clone(),
        session_id: request.session.session_id.clone(),
        event_name: request.event_name.clone(),
        images: None,
        provider_config: None,
        provider_preference: request.provider_preference.clone().or_else(|| {
            request
                .runtime_options
                .as_ref()
                .and_then(|options| options.provider_preference.clone())
        }),
        model_preference: request.model_preference.clone().or_else(|| {
            request
                .runtime_options
                .as_ref()
                .and_then(|options| options.model_preference.clone())
        }),
        reasoning_effort: None,
        thinking_enabled: None,
        approval_policy: None,
        sandbox_policy: None,
        project_id: None,
        workspace_id: request.session.workspace_id.clone().unwrap_or_default(),
        web_search: None,
        search_mode: None,
        execution_strategy: Some(AsterExecutionStrategy::React),
        auto_continue: None,
        system_prompt: None,
        metadata: aster_chat_metadata_from_backend_request(request),
        turn_id: Some(request.turn.turn_id.clone()),
        queue_if_busy: Some(request.queue_if_busy),
        queued_turn_id: request.queued_turn_id.clone().or_else(|| {
            request
                .runtime_options
                .as_ref()
                .and_then(|options| options.queued_turn_id.clone())
        }),
    }
}

fn aster_chat_request_from_host_options(
    request: &AsterBackendSubmitRequest,
) -> Option<AsterChatRequest> {
    let host_options = request.runtime_options.as_ref()?.host_options.as_ref()?;
    let value = host_options.get(HOST_OPTIONS_ASTER_CHAT_REQUEST)?.clone();
    match serde_json::from_value::<AsterChatRequest>(value) {
        Ok(mut host_request) => {
            host_request.session_id = request.session.session_id.clone();
            host_request.event_name = request.event_name.clone();
            host_request.message = request.input.text.clone();
            host_request.turn_id = Some(request.turn.turn_id.clone());
            host_request.queue_if_busy = Some(request.queue_if_busy);
            host_request.queued_turn_id = request.queued_turn_id.clone().or_else(|| {
                request
                    .runtime_options
                    .as_ref()
                    .and_then(|options| options.queued_turn_id.clone())
            });
            Some(host_request)
        }
        Err(error) => {
            tracing::warn!(
                "[AppServerHost] ignored invalid hostOptions.asterChatRequest: {}",
                error
            );
            None
        }
    }
}

fn aster_chat_metadata_from_backend_request(
    request: &AsterBackendSubmitRequest,
) -> Option<serde_json::Value> {
    let mut metadata = request
        .metadata
        .clone()
        .or_else(|| request.runtime_options.as_ref()?.metadata.clone())
        .unwrap_or_else(|| serde_json::json!({}));

    let Some(metadata_object) = metadata.as_object_mut() else {
        metadata = serde_json::json!({
            "value": metadata,
        });
        let metadata_object = metadata
            .as_object_mut()
            .expect("metadata object after wrapping value");
        metadata_object.insert(
            "app_server".to_string(),
            build_app_server_request_metadata(request),
        );
        return Some(metadata);
    };

    metadata_object.insert(
        "app_server".to_string(),
        build_app_server_request_metadata(request),
    );
    Some(metadata)
}

fn build_app_server_request_metadata(request: &AsterBackendSubmitRequest) -> serde_json::Value {
    serde_json::json!({
        "client_name": request.host.client_name.clone(),
        "client_version": request.host.client_version.clone(),
        "capability_id": request
            .runtime_options
            .as_ref()
            .and_then(|options| options.capability_id.clone()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::capability_draft_service::{
        create_capability_draft, register_capability_draft, verify_capability_draft,
        CapabilityDraftFileInput, CapabilityDraftRegistrationSummary, CreateCapabilityDraftRequest,
        RegisterCapabilityDraftRequest, VerifyCapabilityDraftRequest,
    };
    use crate::services::runtime_skill_binding_service::{
        AgentRuntimeWorkspaceSkillBindingCounts, AgentRuntimeWorkspaceSkillBindingRecord,
        AgentRuntimeWorkspaceSkillBindingRequestSnapshot,
        AgentRuntimeWorkspaceSkillBindingSurfaceSnapshot,
    };
    use app_server::{
        AgentInput, AgentSession, AgentSessionStartParams, AgentSessionStatus,
        AgentSessionTurnStartParams, AgentTurn, AgentTurnStatus, ArtifactContentStatus,
        ArtifactSummary, InlineArtifactContentProvider, MockBackend, RuntimeCore,
        RuntimeHostContext, RuntimeOptions,
    };
    use aster::tools::ToolDefinition;
    use lime_core::database::dao::agent_timeline::{AgentThreadTurn, AgentThreadTurnStatus};
    use lime_core::models::{SkillResourceSummary, SkillStandardCompliance};
    use std::collections::HashMap;
    use std::sync::Arc;
    use tempfile::TempDir;

    fn first_response_result(lines: Vec<String>) -> serde_json::Value {
        let line = lines.first().expect("response line");
        let value: serde_json::Value = serde_json::from_str(line).expect("json response");
        value.get("result").cloned().expect("json-rpc result")
    }

    fn definition(name: &str, description: &str, schema: serde_json::Value) -> ToolDefinition {
        ToolDefinition::new(name, description, schema)
    }

    #[derive(Clone, Default)]
    struct FakeRuntimeEventBridgeRegistry {
        next_id: Arc<Mutex<EventId>>,
        listeners: Arc<Mutex<HashMap<EventId, (String, RuntimeEventBridgeCallback)>>>,
        unlisten_calls: Arc<Mutex<Vec<EventId>>>,
    }

    impl FakeRuntimeEventBridgeRegistry {
        fn listener_ids(&self) -> Vec<EventId> {
            self.listeners
                .lock()
                .expect("listeners lock")
                .keys()
                .copied()
                .collect()
        }

        fn listener_event_names(&self) -> Vec<String> {
            self.listeners
                .lock()
                .expect("listeners lock")
                .values()
                .map(|(event_name, _)| event_name.clone())
                .collect()
        }

        fn trigger(&self, listener_id: EventId, payload: &str) {
            let callback = self
                .listeners
                .lock()
                .expect("listeners lock")
                .get(&listener_id)
                .map(|(_, callback)| callback.clone())
                .expect("listener callback");
            callback(listener_id, payload);
        }

        fn unlisten_calls(&self) -> Vec<EventId> {
            self.unlisten_calls
                .lock()
                .expect("unlisten calls lock")
                .clone()
        }
    }

    impl RuntimeEventBridgeRegistry for FakeRuntimeEventBridgeRegistry {
        fn listen_any(&self, event_name: String, callback: RuntimeEventBridgeCallback) -> EventId {
            let mut next_id = self.next_id.lock().expect("next id lock");
            *next_id += 1;
            let listener_id = *next_id;
            self.listeners
                .lock()
                .expect("listeners lock")
                .insert(listener_id, (event_name, callback));
            listener_id
        }

        fn unlisten(&self, listener_id: EventId) {
            self.unlisten_calls
                .lock()
                .expect("unlisten calls lock")
                .push(listener_id);
            self.listeners
                .lock()
                .expect("listeners lock")
                .remove(&listener_id);
        }
    }

    #[derive(Clone)]
    struct FakeAsterRuntimeHostBridge {
        ensure_requests: Arc<Mutex<Vec<DesktopAsterSessionPersistenceRequest>>>,
        submitted_tasks: Arc<Mutex<Vec<QueuedTurnTask<serde_json::Value>>>>,
        submit_flags: Arc<Mutex<Vec<(bool, bool)>>>,
        cancel_operations: Arc<Mutex<Vec<DesktopAsterCancelOperation>>>,
        action_operations: Arc<Mutex<Vec<DesktopAsterActionResponseOperation>>>,
        submit_result: Arc<Mutex<Result<(), String>>>,
        cancel_result: Arc<Mutex<Result<RuntimeHostCancelOutcome, String>>>,
        action_result: Arc<Mutex<Result<(), String>>>,
    }

    impl Default for FakeAsterRuntimeHostBridge {
        fn default() -> Self {
            Self {
                ensure_requests: Arc::new(Mutex::new(Vec::new())),
                submitted_tasks: Arc::new(Mutex::new(Vec::new())),
                submit_flags: Arc::new(Mutex::new(Vec::new())),
                cancel_operations: Arc::new(Mutex::new(Vec::new())),
                action_operations: Arc::new(Mutex::new(Vec::new())),
                submit_result: Arc::new(Mutex::new(Ok(()))),
                cancel_result: Arc::new(Mutex::new(Ok(RuntimeHostCancelOutcome::default()))),
                action_result: Arc::new(Mutex::new(Ok(()))),
            }
        }
    }

    impl FakeAsterRuntimeHostBridge {
        fn fail_submit(message: &str) -> Self {
            Self {
                submit_result: Arc::new(Mutex::new(Err(message.to_string()))),
                ..Self::default()
            }
        }

        fn with_cancel_outcome(outcome: RuntimeHostCancelOutcome) -> Self {
            Self {
                cancel_result: Arc::new(Mutex::new(Ok(outcome))),
                ..Self::default()
            }
        }

        fn ensure_requests(&self) -> Vec<DesktopAsterSessionPersistenceRequest> {
            self.ensure_requests
                .lock()
                .expect("ensure requests lock")
                .clone()
        }

        fn submitted_tasks(&self) -> Vec<QueuedTurnTask<serde_json::Value>> {
            self.submitted_tasks
                .lock()
                .expect("submitted tasks lock")
                .clone()
        }

        fn submit_flags(&self) -> Vec<(bool, bool)> {
            self.submit_flags.lock().expect("submit flags lock").clone()
        }

        fn cancel_operations(&self) -> Vec<DesktopAsterCancelOperation> {
            self.cancel_operations
                .lock()
                .expect("cancel operations lock")
                .clone()
        }

        fn action_operations(&self) -> Vec<DesktopAsterActionResponseOperation> {
            self.action_operations
                .lock()
                .expect("action operations lock")
                .clone()
        }
    }

    #[async_trait]
    impl AsterRuntimeHostBridge for FakeAsterRuntimeHostBridge {
        async fn ensure_persisted_session(
            &self,
            request: DesktopAsterSessionPersistenceRequest,
        ) -> Result<(), String> {
            self.ensure_requests
                .lock()
                .expect("ensure requests lock")
                .push(request);
            Ok(())
        }

        async fn submit_runtime_turn(
            &self,
            queued_turn: DesktopAsterQueuedTurn,
        ) -> Result<(), String> {
            self.submitted_tasks
                .lock()
                .expect("submitted tasks lock")
                .push(queued_turn.queued_task);
            self.submit_flags.lock().expect("submit flags lock").push((
                queued_turn.queue_if_busy,
                queued_turn.skip_pre_submit_resume,
            ));
            self.submit_result
                .lock()
                .expect("submit result lock")
                .clone()
        }

        async fn cancel_turn(
            &self,
            operation: &DesktopAsterCancelOperation,
        ) -> Result<RuntimeHostCancelOutcome, String> {
            self.cancel_operations
                .lock()
                .expect("cancel operations lock")
                .push(operation.clone());
            self.cancel_result
                .lock()
                .expect("cancel result lock")
                .clone()
        }

        async fn respond_action(
            &self,
            operation: DesktopAsterActionResponseOperation,
        ) -> Result<(), String> {
            self.action_operations
                .lock()
                .expect("action operations lock")
                .push(operation);
            self.action_result
                .lock()
                .expect("action result lock")
                .clone()
        }
    }

    fn app_server_host_with_fakes(
        runtime_host: Arc<dyn AsterRuntimeHostBridge>,
        registry: FakeRuntimeEventBridgeRegistry,
        app_server_bridge: Option<Arc<OnceLock<AppServerEventBridge>>>,
    ) -> TauriAsterBackendHost {
        TauriAsterBackendHost::with_runtime_host(
            runtime_host,
            RuntimeEventBridgeSubscriptions::new(Arc::new(registry), app_server_bridge),
        )
    }

    fn backend_submit_request() -> AsterBackendSubmitRequest {
        AsterBackendSubmitRequest {
            host: RuntimeHostContext {
                client_name: Some("content-studio".to_string()),
                client_version: Some("0.1.0".to_string()),
            },
            session: AgentSession {
                session_id: "sess_submit".to_string(),
                thread_id: "thread_submit".to_string(),
                app_id: "content-studio".to_string(),
                workspace_id: Some("workspace_1".to_string()),
                business_object_ref: None,
                status: AgentSessionStatus::Running,
                created_at: "2026-06-04T00:00:00.000Z".to_string(),
                updated_at: "2026-06-04T00:00:00.000Z".to_string(),
            },
            turn: AgentTurn {
                turn_id: "turn_submit".to_string(),
                session_id: "sess_submit".to_string(),
                thread_id: "thread_submit".to_string(),
                status: AgentTurnStatus::Accepted,
                started_at: None,
                completed_at: None,
            },
            input: AgentInput {
                text: "生成草稿".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                capability_id: Some("draft.write".to_string()),
                stream: true,
                event_name: None,
                provider_preference: None,
                model_preference: None,
                metadata: None,
                queued_turn_id: None,
                host_options: None,
            }),
            provider_preference: None,
            model_preference: None,
            metadata: None,
            event_name: "agentSession/event/sess_submit".to_string(),
            queued_turn_id: None,
            queue_if_busy: true,
            skip_pre_submit_resume: false,
        }
    }

    fn backend_cancel_request() -> AsterBackendCancelRequest {
        let submit_request = backend_submit_request();
        AsterBackendCancelRequest {
            host: submit_request.host,
            session: submit_request.session,
            turn: submit_request.turn,
            event_name: submit_request.event_name,
        }
    }

    fn backend_action_respond_request() -> AsterBackendActionRespondRequest {
        let submit_request = backend_submit_request();
        AsterBackendActionRespondRequest {
            host: submit_request.host,
            session: submit_request.session,
            turn: Some(submit_request.turn),
            request_id: "req_confirm_1".to_string(),
            action_type: AppServerActionType::ToolConfirmation,
            confirmed: true,
            response: Some("allow".to_string()),
            user_data: Some(serde_json::json!({
                "reason": "user-approved",
            })),
            metadata: Some(serde_json::json!({
                "source": "app-server",
            })),
            event_name: submit_request.event_name,
            action_scope: Some(AgentSessionActionScope {
                session_id: Some("sess_submit".to_string()),
                thread_id: Some("thread_submit".to_string()),
                turn_id: Some("turn_submit".to_string()),
            }),
        }
    }

    #[test]
    fn desktop_aster_queued_turn_boundary_preserves_submit_mapping_without_host_state() {
        let mut request = backend_submit_request();
        request.provider_preference = Some("direct-provider".to_string());
        request.model_preference = Some("direct-model".to_string());
        request.metadata = Some(serde_json::json!({
            "source": "app-server-boundary-test",
        }));
        request.queued_turn_id = Some("queued-from-app-server".to_string());
        request.skip_pre_submit_resume = true;

        let queued_turn =
            desktop_aster_queued_turn_from_backend_request(&request).expect("queued turn");

        assert!(queued_turn.queue_if_busy);
        assert!(queued_turn.skip_pre_submit_resume);
        assert_eq!(queued_turn.queued_task.session_id, "sess_submit");
        assert_eq!(
            queued_turn.queued_task.event_name,
            "agentSession/event/sess_submit"
        );
        assert_eq!(queued_turn.queued_task.message_text, "生成草稿");
        assert_eq!(
            queued_turn.queued_task.queued_turn_id,
            "queued-from-app-server"
        );
        assert_eq!(queued_turn.queued_task.payload["session_id"], "sess_submit");
        assert_eq!(queued_turn.queued_task.payload["turn_id"], "turn_submit");
        assert_eq!(
            queued_turn.queued_task.payload["provider_preference"],
            "direct-provider"
        );
        assert_eq!(
            queued_turn.queued_task.payload["model_preference"],
            "direct-model"
        );
        assert_eq!(
            queued_turn.queued_task.payload["queued_turn_id"],
            "queued-from-app-server"
        );
        assert_eq!(
            queued_turn.queued_task.payload["metadata"]["source"],
            "app-server-boundary-test"
        );
        assert_eq!(
            queued_turn.queued_task.payload["metadata"]["app_server"]["client_name"],
            "content-studio"
        );
        assert_eq!(
            queued_turn.queued_task.payload["metadata"]["app_server"]["capability_id"],
            "draft.write"
        );
    }

    #[test]
    fn desktop_aster_session_persistence_input_keeps_request_identity_without_runtime_context() {
        let mut request = backend_submit_request();
        request.session.business_object_ref = Some(
            serde_json::from_value(serde_json::json!({
                "kind": "document",
                "id": "doc-1",
                "title": "  发布计划  "
            }))
            .expect("business object ref"),
        );

        let input = desktop_aster_session_persistence_input_from_backend_request(&request)
            .expect("session persistence input");

        assert_eq!(input.session_id, "sess_submit");
        assert_eq!(input.workspace_id, "workspace_1");
        assert_eq!(input.title.as_deref(), Some("发布计划"));
    }

    #[test]
    fn desktop_aster_session_persistence_input_requires_workspace_id_before_runtime_context() {
        let mut request = backend_submit_request();
        request.session.workspace_id = None;

        let error = desktop_aster_session_persistence_input_from_backend_request(&request)
            .expect_err("workspace required");

        assert!(error.contains("workspace_id 必填，请先选择项目工作区"));
    }

    #[test]
    fn desktop_aster_session_persistence_request_keeps_session_id_before_create_input() {
        let mut request = backend_submit_request();
        request.session.workspace_id = None;

        let persistence_request =
            desktop_aster_session_persistence_request_from_backend_request(&request);

        assert_eq!(persistence_request.session_id, "sess_submit");
        assert!(persistence_request
            .create_input
            .expect_err("workspace required")
            .contains("workspace_id 必填，请先选择项目工作区"));
    }

    #[test]
    fn desktop_aster_session_persistence_operation_skips_create_input_for_existing_session() {
        let mut request = backend_submit_request();
        request.session.workspace_id = None;
        let persistence_request =
            desktop_aster_session_persistence_request_from_backend_request(&request);

        let operation =
            desktop_aster_session_persistence_operation_from_request(true, persistence_request)
                .expect("operation");

        assert_eq!(
            operation,
            DesktopAsterSessionPersistenceOperation::AlreadyPersisted
        );
    }

    #[test]
    fn desktop_aster_session_persistence_operation_requires_create_input_for_new_session() {
        let mut request = backend_submit_request();
        request.session.business_object_ref = Some(
            serde_json::from_value(serde_json::json!({
                "kind": "document",
                "id": "doc-1",
                "title": "  发布计划  "
            }))
            .expect("business object ref"),
        );
        let persistence_request =
            desktop_aster_session_persistence_request_from_backend_request(&request);

        let operation =
            desktop_aster_session_persistence_operation_from_request(false, persistence_request)
                .expect("operation");

        assert_eq!(
            operation,
            DesktopAsterSessionPersistenceOperation::Create(DesktopAsterSessionPersistenceInput {
                session_id: "sess_submit".to_string(),
                workspace_id: "workspace_1".to_string(),
                title: Some("发布计划".to_string()),
            })
        );
    }

    #[test]
    fn desktop_aster_cancel_input_keeps_request_scope_without_runtime_context() {
        let request = backend_cancel_request();

        let input = desktop_aster_cancel_input_from_backend_request(&request);

        assert_eq!(input.session_id, "sess_submit");
        assert_eq!(input.turn_id, "turn_submit");
        assert_eq!(input.event_name, "agentSession/event/sess_submit");
    }

    #[test]
    fn desktop_aster_cancel_operation_maps_runtime_scope_without_protocol_event() {
        let input = desktop_aster_cancel_input_from_backend_request(&backend_cancel_request());

        let operation = desktop_aster_cancel_operation_from_input(&input);

        assert_eq!(operation.session_id, "sess_submit");
        assert_eq!(operation.turn_id, "turn_submit");
        assert_eq!(operation.interrupt_message, RUNTIME_INTERRUPT_MESSAGE);
    }

    #[test]
    fn desktop_aster_action_response_input_maps_protocol_without_runtime_context() {
        let input = desktop_aster_action_response_input_from_backend_request(
            backend_action_respond_request(),
        );

        assert_eq!(input.session_id, "sess_submit");
        assert_eq!(input.request_id, "req_confirm_1");
        assert_eq!(input.action_type, AgentRuntimeActionType::ToolConfirmation);
        assert!(input.confirmed);
        assert_eq!(input.response.as_deref(), Some("allow"));
        assert_eq!(
            input.user_data.as_ref().expect("user data")["reason"],
            "user-approved"
        );
        assert_eq!(
            input.metadata.as_ref().expect("metadata")["source"],
            "app-server"
        );
        assert_eq!(
            input.event_name.as_deref(),
            Some("agentSession/event/sess_submit")
        );
        let scope = input.action_scope.as_ref().expect("action scope");
        assert_eq!(scope.session_id.as_deref(), Some("sess_submit"));
        assert_eq!(scope.thread_id.as_deref(), Some("thread_submit"));
        assert_eq!(scope.turn_id.as_deref(), Some("turn_submit"));
    }

    #[test]
    fn desktop_aster_action_response_operation_maps_runtime_input_without_context() {
        let input = desktop_aster_action_response_input_from_backend_request(
            backend_action_respond_request(),
        );

        let operation = desktop_aster_action_response_operation_from_input(input.clone());

        assert_eq!(operation.input, input);
    }

    #[test]
    fn desktop_aster_event_bridge_registration_maps_scope_without_runtime_context() {
        let request = backend_submit_request();

        let registration = desktop_aster_event_bridge_registration_from_backend_request(&request);

        assert_eq!(registration.event_name, "agentSession/event/sess_submit");
        assert_eq!(registration.session_id, "sess_submit");
        assert_eq!(registration.turn_id, "turn_submit");
    }

    fn workspace_skill_bindings_fixture(
        bindings: Vec<AgentRuntimeWorkspaceSkillBindingRecord>,
    ) -> AgentRuntimeWorkspaceSkillBindings {
        let ready_for_manual_enable_total = bindings
            .iter()
            .filter(|binding| {
                binding.binding_status
                    == AgentRuntimeWorkspaceSkillBindingStatus::ReadyForManualEnable
            })
            .count();
        let blocked_total = bindings
            .iter()
            .filter(|binding| {
                binding.binding_status == AgentRuntimeWorkspaceSkillBindingStatus::Blocked
            })
            .count();
        AgentRuntimeWorkspaceSkillBindings {
            request: AgentRuntimeWorkspaceSkillBindingRequestSnapshot {
                workspace_root: "/tmp/workspace-main".to_string(),
                caller: "assistant".to_string(),
                surface: AgentRuntimeWorkspaceSkillBindingSurfaceSnapshot {
                    workbench: true,
                    browser_assist: true,
                },
            },
            warnings: Vec::new(),
            counts: AgentRuntimeWorkspaceSkillBindingCounts {
                registered_total: bindings.len(),
                ready_for_manual_enable_total,
                blocked_total,
                query_loop_visible_total: 0,
                tool_runtime_visible_total: 0,
                launch_enabled_total: 0,
            },
            bindings,
        }
    }

    fn workspace_skill_binding_record(
        directory: &str,
        status: AgentRuntimeWorkspaceSkillBindingStatus,
    ) -> AgentRuntimeWorkspaceSkillBindingRecord {
        AgentRuntimeWorkspaceSkillBindingRecord {
            key: format!("workspace_skill:{directory}"),
            name: format!("Skill {directory}"),
            description: format!("Description for {directory}"),
            directory: directory.to_string(),
            registered_skill_directory: format!("/tmp/workspace-main/.agents/skills/{directory}"),
            registration: CapabilityDraftRegistrationSummary {
                registration_id: format!("capreg-{directory}"),
                registered_at: "2026-06-05T00:00:00.000Z".to_string(),
                skill_directory: directory.to_string(),
                registered_skill_directory: format!(
                    "/tmp/workspace-main/.agents/skills/{directory}"
                ),
                source_draft_id: format!("capdraft-{directory}"),
                source_verification_report_id: Some(format!("capver-{directory}")),
                generated_file_count: 1,
                permission_summary: vec!["Level 0 read-only".to_string()],
                verification_gates: Vec::new(),
                approval_requests: Vec::new(),
            },
            permission_summary: vec!["Level 0 read-only".to_string()],
            metadata: HashMap::new(),
            allowed_tools: Vec::new(),
            resource_summary: SkillResourceSummary::default(),
            standard_compliance: SkillStandardCompliance::default(),
            runtime_binding_target: "workspace_skill".to_string(),
            binding_status: status,
            binding_status_reason: "fixture".to_string(),
            next_gate: "manual_runtime_enable".to_string(),
            query_loop_visible: false,
            tool_runtime_visible: false,
            launch_enabled: false,
            runtime_gate: "fixture".to_string(),
        }
    }

    fn standard_verifiable_capability_request(
        root: &std::path::Path,
    ) -> CreateCapabilityDraftRequest {
        CreateCapabilityDraftRequest {
            workspace_root: root.to_string_lossy().to_string(),
            name: "只读 CLI 报告草案".to_string(),
            description: "把只读 CLI 输出整理成 Markdown 报告。".to_string(),
            user_goal: "每天读取本地 CLI 输出并保存趋势摘要。".to_string(),
            source_kind: "cli".to_string(),
            source_refs: vec!["trendctl --help".to_string()],
            permission_summary: vec![
                "Level 0 只读发现".to_string(),
                "允许执行本地 CLI，但只读取输出，不做外部写操作".to_string(),
            ],
            generated_files: vec![
                CapabilityDraftFileInput {
                    relative_path: "SKILL.md".to_string(),
                    content: [
                        "---",
                        "name: 只读 CLI 报告",
                        "description: 把本地只读 CLI 输出整理成 Markdown 报告。",
                        "---",
                        "",
                        "# 只读 CLI 报告",
                        "",
                        "## 何时使用",
                        "当用户需要把本地只读 CLI 输出整理为 Markdown 报告时使用。",
                        "",
                        "## 输入",
                        "- topic: 报告主题",
                        "",
                        "## 执行步骤",
                        "1. 读取用户提供的只读 CLI 输出或 fixture。",
                        "2. 提炼趋势、异常和后续建议。",
                        "",
                        "## 输出",
                        "- markdown_report: 生成的 Markdown 摘要",
                    ]
                    .join("\n"),
                },
                CapabilityDraftFileInput {
                    relative_path: "contract/input.schema.json".to_string(),
                    content:
                        r#"{"type":"object","required":["topic"],"properties":{"topic":{"type":"string"}}}"#
                            .to_string(),
                },
                CapabilityDraftFileInput {
                    relative_path: "contract/output.schema.json".to_string(),
                    content:
                        r#"{"type":"object","required":["markdown_report"],"properties":{"markdown_report":{"type":"string"}}}"#
                            .to_string(),
                },
                CapabilityDraftFileInput {
                    relative_path: "examples/input.sample.json".to_string(),
                    content: r#"{"topic":"AI Agent"}"#.to_string(),
                },
            ],
        }
    }

    fn register_standard_workspace_skill(
        workspace_root: &std::path::Path,
    ) -> crate::services::capability_draft_service::RegisterCapabilityDraftResult {
        let created =
            create_capability_draft(standard_verifiable_capability_request(workspace_root))
                .expect("create capability draft");
        verify_capability_draft(VerifyCapabilityDraftRequest {
            workspace_root: workspace_root.to_string_lossy().to_string(),
            draft_id: created.manifest.draft_id.clone(),
        })
        .expect("verify capability draft");
        register_capability_draft(RegisterCapabilityDraftRequest {
            workspace_root: workspace_root.to_string_lossy().to_string(),
            draft_id: created.manifest.draft_id.clone(),
        })
        .expect("register capability draft")
    }

    fn workspace_root_resolver_fixture(
        mappings: Vec<(&str, String)>,
    ) -> DesktopWorkspaceRootResolver {
        let roots = mappings
            .into_iter()
            .map(|(workspace_id, workspace_root)| (workspace_id.to_string(), workspace_root))
            .collect::<HashMap<_, _>>();
        Arc::new(move |workspace_id| Ok(roots.get(workspace_id.trim()).cloned()))
    }

    struct ProbeAsterBackendHost {
        submit_request: Arc<Mutex<Option<AsterBackendSubmitRequest>>>,
    }

    #[async_trait]
    impl AsterBackendHost for ProbeAsterBackendHost {
        async fn submit_turn(
            &self,
            request: AsterBackendSubmitRequest,
        ) -> Result<AsterBackendSubmitResult, RuntimeCoreError> {
            *self.submit_request.lock().expect("submit request lock") = Some(request.clone());
            Ok(AsterBackendSubmitResult {
                events: vec![RuntimeEvent::new(
                    "message.delta",
                    serde_json::json!({
                        "text": format!("accepted:{}", request.input.text),
                    }),
                )],
            })
        }

        async fn cancel_turn(
            &self,
            _request: AsterBackendCancelRequest,
        ) -> Result<AsterBackendCancelResult, RuntimeCoreError> {
            Ok(AsterBackendCancelResult::default())
        }

        async fn respond_action(
            &self,
            _request: AsterBackendActionRespondRequest,
        ) -> Result<AsterBackendActionRespondResult, RuntimeCoreError> {
            Ok(AsterBackendActionRespondResult::default())
        }
    }

    #[derive(Default)]
    struct ProbeEvidenceExportProvider {
        requests: Arc<Mutex<Vec<EvidencePackRequest>>>,
    }

    #[async_trait]
    impl EvidenceExportProvider for ProbeEvidenceExportProvider {
        async fn export_evidence_pack(
            &self,
            request: &EvidencePackRequest,
        ) -> Result<Option<EvidencePackSummary>, RuntimeCoreError> {
            self.requests
                .lock()
                .expect("evidence requests lock")
                .push(request.clone());
            Ok(Some(EvidencePackSummary {
                pack_relative_root: ".lime/harness/sessions/sess_in_process/evidence".to_string(),
                pack_absolute_root: Some(
                    "/workspace/.lime/harness/sessions/sess_in_process/evidence".to_string(),
                ),
                exported_at: "2026-06-05T00:00:03.000Z".to_string(),
                thread_status: "running".to_string(),
                latest_turn_status: Some("accepted".to_string()),
                turn_count: request.turns.len(),
                item_count: request.events.len(),
                pending_request_count: 0,
                queued_turn_count: 0,
                recent_artifact_count: request.artifacts.len(),
                known_gaps: vec!["desktop_gui_smoke_not_run".to_string()],
                observability_summary: Some(serde_json::json!({
                    "source": "desktop-provider"
                })),
                completion_audit_summary: Some(serde_json::json!({
                    "decision": "in_progress"
                })),
                artifacts: vec![EvidencePackArtifact {
                    kind: "summary".to_string(),
                    title: "Evidence Summary".to_string(),
                    relative_path: ".lime/harness/sessions/sess_in_process/evidence/summary.md"
                        .to_string(),
                    absolute_path: Some(
                        "/workspace/.lime/harness/sessions/sess_in_process/evidence/summary.md"
                            .to_string(),
                    ),
                    bytes: 128,
                }],
            }))
        }
    }

    #[tokio::test]
    async fn app_server_aster_host_port_preserves_json_rpc_session_contract() {
        let submit_request = Arc::new(Mutex::new(None));
        let server = AppServer::with_runtime(
            AppServerRuntimeFactory::aster_runtime_core_with_capability_source(
                Arc::new(ProbeAsterBackendHost {
                    submit_request: submit_request.clone(),
                }),
                Arc::new(desktop_app_server_capability_source()),
            ),
        );

        let initialize_result = first_response_result(
            server
                .handle_json_line(
                    r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"content-studio","version":"0.1.0"},"capabilities":{}}}"#,
                )
                .await
                .expect("initialize"),
        );
        assert_eq!(initialize_result["serverInfo"]["name"], "app-server");
        server
            .handle_json_line(r#"{"jsonrpc":"2.0","method":"initialized","params":{}}"#)
            .await
            .expect("initialized");

        let start_result = first_response_result(
            server
                .handle_json_line(
                    r#"{"jsonrpc":"2.0","id":2,"method":"agentSession/start","params":{"sessionId":"sess_in_process","threadId":"thread_in_process","appId":"content-studio","workspaceId":"workspace_1"}}"#,
                )
                .await
                .expect("session start"),
        );
        assert_eq!(start_result["session"]["sessionId"], "sess_in_process");
        assert_eq!(start_result["session"]["threadId"], "thread_in_process");
        assert_eq!(start_result["session"]["appId"], "content-studio");

        let turn_lines = server
            .handle_json_line(
                r#"{"jsonrpc":"2.0","id":3,"method":"agentSession/turn/start","params":{"sessionId":"sess_in_process","input":{"text":"生成草稿"},"runtimeOptions":{"capabilityId":"tool.Agent","stream":true,"eventName":"agent_app_runtime:content-studio:task-1","providerPreference":"deepseek","modelPreference":"deepseek-v4-flash","metadata":{"agent_app_runtime":{"task_id":"task-1"}},"queuedTurnId":"agent-app-queued-task-1"},"queueIfBusy":true,"skipPreSubmitResume":true}}"#,
            )
            .await
            .expect("turn start");
        let turn_result = first_response_result(turn_lines.clone());
        let turn_id = turn_result["turn"]["turnId"].as_str().expect("turn id");
        let notification: serde_json::Value =
            serde_json::from_str(turn_lines.get(1).expect("turn event")).expect("event json");
        assert_eq!(notification["method"], "agentSession/event");
        assert_eq!(
            notification["params"]["event"]["payload"]["text"],
            "accepted:生成草稿"
        );

        let captured = submit_request
            .lock()
            .expect("submit request lock")
            .take()
            .expect("submit request");
        assert_eq!(captured.host.client_name.as_deref(), Some("content-studio"));
        assert_eq!(captured.host.client_version.as_deref(), Some("0.1.0"));
        assert_eq!(captured.session.session_id, "sess_in_process");
        assert_eq!(captured.session.thread_id, "thread_in_process");
        assert_eq!(captured.turn.turn_id, turn_id);
        assert_eq!(captured.input.text, "生成草稿");
        assert_eq!(
            captured
                .runtime_options
                .as_ref()
                .and_then(|options| options.capability_id.as_deref()),
            Some("tool.Agent")
        );
        assert_eq!(
            captured.event_name,
            "agent_app_runtime:content-studio:task-1"
        );
        assert_eq!(captured.provider_preference.as_deref(), Some("deepseek"));
        assert_eq!(
            captured.model_preference.as_deref(),
            Some("deepseek-v4-flash")
        );
        assert_eq!(
            captured.metadata.as_ref().and_then(|metadata| {
                metadata
                    .pointer("/agent_app_runtime/task_id")
                    .and_then(serde_json::Value::as_str)
            }),
            Some("task-1")
        );
        assert_eq!(
            captured.queued_turn_id.as_deref(),
            Some("agent-app-queued-task-1")
        );
        assert!(captured.queue_if_busy);
        assert!(captured.skip_pre_submit_resume);
    }

    #[tokio::test]
    async fn app_server_aster_host_port_json_rpc_evidence_export_uses_injected_provider() {
        let evidence_provider = Arc::new(ProbeEvidenceExportProvider::default());
        let server = AppServer::with_runtime(
            AppServerRuntimeFactory::aster_runtime_core_with_sources_and_evidence_export_provider(
                Arc::new(ProbeAsterBackendHost {
                    submit_request: Arc::new(Mutex::new(None)),
                }),
                Arc::new(desktop_app_server_capability_source()),
                Arc::new(InlineArtifactContentProvider),
                evidence_provider.clone(),
            ),
        );

        server
            .handle_json_line(
                r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"content-studio","version":"0.1.0"},"capabilities":{}}}"#,
            )
            .await
            .expect("initialize");
        server
            .handle_json_line(r#"{"jsonrpc":"2.0","method":"initialized","params":{}}"#)
            .await
            .expect("initialized");
        server
            .handle_json_line(
                r#"{"jsonrpc":"2.0","id":2,"method":"agentSession/start","params":{"sessionId":"sess_in_process","threadId":"thread_in_process","appId":"content-studio","workspaceId":"workspace_1"}}"#,
            )
            .await
            .expect("session start");
        server
            .handle_json_line(
                r#"{"jsonrpc":"2.0","id":3,"method":"agentSession/turn/start","params":{"sessionId":"sess_in_process","turnId":"turn_in_process","input":{"text":"生成草稿"},"runtimeOptions":{"capabilityId":"tool.Agent","stream":true},"queueIfBusy":true,"skipPreSubmitResume":true}}"#,
            )
            .await
            .expect("turn start");

        let evidence_result = first_response_result(
            server
                .handle_json_line(
                    r#"{"jsonrpc":"2.0","id":4,"method":"evidence/export","params":{"sessionId":"sess_in_process","turnId":"turn_in_process","includeEvents":true,"includeArtifacts":true,"includeEvidencePack":true}}"#,
                )
                .await
                .expect("evidence export"),
        );

        assert_eq!(evidence_result["session"]["sessionId"], "sess_in_process");
        assert_eq!(evidence_result["turns"][0]["turnId"], "turn_in_process");
        assert!(evidence_result["events"]
            .as_array()
            .expect("evidence events")
            .iter()
            .any(|event| event["type"] == "message.delta"));
        assert_eq!(
            evidence_result["evidencePack"]["packRelativeRoot"],
            ".lime/harness/sessions/sess_in_process/evidence"
        );
        assert_eq!(
            evidence_result["evidencePack"]["completionAuditSummary"]["decision"],
            "in_progress"
        );
        assert_eq!(
            evidence_result["evidencePack"]["artifacts"][0]["kind"],
            "summary"
        );

        let requests = evidence_provider
            .requests
            .lock()
            .expect("evidence requests lock");
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].session.session_id, "sess_in_process");
        assert_eq!(requests[0].turns[0].turn_id, "turn_in_process");
        assert!(requests[0]
            .events
            .iter()
            .any(|event| event.event_type == "message.delta"));
    }

    #[test]
    fn desktop_app_server_capability_source_exposes_current_tool_capabilities() {
        let source = desktop_app_server_capability_source();
        let capabilities = app_server::CapabilitySource::list_capabilities(
            &source,
            &app_server::CapabilityListContext::default(),
        );
        let ids = capabilities
            .iter()
            .map(|capability| capability.id.as_str())
            .collect::<Vec<_>>();

        assert!(ids.contains(&"agent.session"));
        assert!(ids.contains(&"tool.Agent"));
    }

    #[test]
    fn desktop_capability_records_keep_visible_runtime_tools() {
        let inventory = build_tool_inventory(AgentToolInventoryBuildInput {
            surface: WorkspaceToolSurface::core(),
            caller: "assistant".to_string(),
            agent_initialized: true,
            warnings: Vec::new(),
            persisted_execution_policy: None,
            request_metadata: None,
            mcp_server_names: Vec::new(),
            mcp_tools: Vec::new(),
            registry_definitions: vec![
                definition(
                    "custom_visible",
                    "visible runtime tool",
                    serde_json::json!({ "type": "object" }),
                ),
                definition(
                    "admin_secret",
                    "secret",
                    serde_json::json!({
                        "type": "object",
                        "x-lime": {
                            "allowed_callers": ["code_execution"]
                        }
                    }),
                ),
            ],
            resource_helpers_supported: false,
            current_surface_tool_names: vec!["custom_visible".to_string()],
            extension_configs: Vec::new(),
            visible_extension_tools: Vec::new(),
            searchable_extension_tools: Vec::new(),
        });

        let records = capability_inventory_records_from_tool_inventory(&inventory);
        let ids = records
            .iter()
            .map(|record| record.descriptor.id.as_str())
            .collect::<Vec<_>>();

        assert!(ids.contains(&"agent.session"));
        assert!(ids.contains(&"tool.Agent"));
        assert!(ids.contains(&"tool.custom_visible"));
        assert!(!ids.contains(&"tool.admin_secret"));
        let custom = records
            .iter()
            .find(|record| record.descriptor.id == "tool.custom_visible")
            .expect("custom runtime capability record");
        assert_eq!(custom.descriptor.title, "custom_visible");
        assert_eq!(
            custom.descriptor.description.as_deref(),
            Some("visible runtime tool")
        );
        assert_eq!(
            custom.descriptor.methods,
            vec![METHOD_AGENT_SESSION_TURN_START.to_string()]
        );
    }

    #[test]
    fn desktop_runtime_capability_source_refreshes_from_runtime_inventory() {
        let source = desktop_app_server_capability_source();
        let baseline = app_server::CapabilitySource::list_capabilities(
            &source,
            &app_server::CapabilityListContext::default(),
        );
        assert!(baseline
            .iter()
            .any(|capability| capability.id == "agent.session"));

        let inventory = build_tool_inventory(AgentToolInventoryBuildInput {
            surface: WorkspaceToolSurface::core(),
            caller: "assistant".to_string(),
            agent_initialized: true,
            warnings: Vec::new(),
            persisted_execution_policy: None,
            request_metadata: None,
            mcp_server_names: Vec::new(),
            mcp_tools: Vec::new(),
            registry_definitions: vec![
                definition(
                    "custom_visible",
                    "visible runtime tool",
                    serde_json::json!({ "type": "object" }),
                ),
                definition(
                    "admin_secret",
                    "secret",
                    serde_json::json!({
                        "type": "object",
                        "x-lime": {
                            "allowed_callers": ["code_execution"]
                        }
                    }),
                ),
            ],
            resource_helpers_supported: false,
            current_surface_tool_names: vec!["custom_visible".to_string()],
            extension_configs: Vec::new(),
            visible_extension_tools: Vec::new(),
            searchable_extension_tools: Vec::new(),
        });

        source.replace_from_inventory(&inventory);
        let refreshed = app_server::CapabilitySource::list_capabilities(
            &source,
            &app_server::CapabilityListContext::default(),
        );
        let ids = refreshed
            .iter()
            .map(|capability| capability.id.as_str())
            .collect::<Vec<_>>();

        assert!(ids.contains(&"agent.session"));
        assert!(ids.contains(&"tool.custom_visible"));
        assert!(!ids.contains(&"tool.admin_secret"));
    }

    #[test]
    fn desktop_capability_records_project_ready_workspace_skills_with_scope() {
        let mut records = capability_inventory_records_from_tool_inventory(
            &desktop_app_server_baseline_tool_inventory(),
        );
        append_workspace_skill_capability_records(
            &mut records,
            "workspace-main",
            &workspace_skill_bindings_fixture(vec![
                workspace_skill_binding_record(
                    "capability-report",
                    AgentRuntimeWorkspaceSkillBindingStatus::ReadyForManualEnable,
                ),
                workspace_skill_binding_record(
                    "capability-blocked",
                    AgentRuntimeWorkspaceSkillBindingStatus::Blocked,
                ),
            ]),
        );
        let source = CapabilityInventorySource::new(records);

        let scoped = source.list_capabilities(&CapabilityListContext {
            app_id: None,
            workspace_id: Some("workspace-main".to_string()),
            session_id: None,
        });
        let scoped_ids = scoped
            .iter()
            .map(|capability| capability.id.as_str())
            .collect::<Vec<_>>();
        assert!(scoped_ids.contains(&"agent.session"));
        assert!(scoped_ids.contains(&"workspace_skill.capability-report"));
        assert!(!scoped_ids.contains(&"workspace_skill.capability-blocked"));

        let unscoped = source.list_capabilities(&CapabilityListContext::default());
        assert!(!unscoped
            .iter()
            .any(|capability| capability.id == "workspace_skill.capability-report"));

        let ready = scoped
            .iter()
            .find(|capability| capability.id == "workspace_skill.capability-report")
            .expect("ready workspace skill capability");
        assert_eq!(ready.title, "Skill capability-report");
        assert_eq!(ready.methods, vec![METHOD_CAPABILITY_LIST.to_string()]);
        assert!(!ready
            .methods
            .iter()
            .any(|method| method == METHOD_AGENT_SESSION_TURN_START));
        assert!(ready
            .description
            .as_deref()
            .expect("description")
            .contains("Ready for manual runtime enable"));
    }

    #[tokio::test]
    async fn desktop_session_policy_records_project_executable_capability_only_for_matching_session(
    ) {
        let mut records = capability_inventory_records_from_tool_inventory(
            &desktop_app_server_baseline_tool_inventory(),
        );
        append_desktop_session_policy_capability_records(
            &mut records,
            &[
                DesktopSessionPolicyCapabilityFact {
                    id: "session_policy.draft.write".to_string(),
                    title: "Session Draft Write".to_string(),
                    description: Some("Allowed for this App Server session.".to_string()),
                    app_id: "content-studio".to_string(),
                    workspace_id: "workspace-main".to_string(),
                    session_id: "sess_policy_allowed".to_string(),
                    status: DesktopSessionPolicyCapabilityStatus::Executable,
                },
                DesktopSessionPolicyCapabilityFact {
                    id: "session_policy.preflight".to_string(),
                    title: "Session Preflight".to_string(),
                    description: Some("Readonly policy preflight.".to_string()),
                    app_id: "content-studio".to_string(),
                    workspace_id: "workspace-main".to_string(),
                    session_id: "sess_policy_allowed".to_string(),
                    status: DesktopSessionPolicyCapabilityStatus::DiscoveryOnly,
                },
                DesktopSessionPolicyCapabilityFact {
                    id: "session_policy.blocked".to_string(),
                    title: "Blocked Policy".to_string(),
                    description: None,
                    app_id: "content-studio".to_string(),
                    workspace_id: "workspace-main".to_string(),
                    session_id: "sess_policy_allowed".to_string(),
                    status: DesktopSessionPolicyCapabilityStatus::Blocked,
                },
                DesktopSessionPolicyCapabilityFact {
                    id: "session_policy.denied".to_string(),
                    title: "Denied Policy".to_string(),
                    description: None,
                    app_id: "content-studio".to_string(),
                    workspace_id: "workspace-main".to_string(),
                    session_id: "sess_policy_allowed".to_string(),
                    status: DesktopSessionPolicyCapabilityStatus::Denied,
                },
            ],
        );
        let source = CapabilityInventorySource::new(records);

        let listed = source.list_capabilities(&CapabilityListContext {
            app_id: Some("content-studio".to_string()),
            workspace_id: Some("workspace-main".to_string()),
            session_id: Some("sess_policy_allowed".to_string()),
        });
        let ids = listed
            .iter()
            .map(|capability| capability.id.as_str())
            .collect::<Vec<_>>();
        assert!(ids.contains(&"session_policy.draft.write"));
        assert!(ids.contains(&"session_policy.preflight"));
        assert!(!ids.contains(&"session_policy.blocked"));
        assert!(!ids.contains(&"session_policy.denied"));

        let executable = listed
            .iter()
            .find(|capability| capability.id == "session_policy.draft.write")
            .expect("executable policy capability");
        assert_eq!(
            executable.methods,
            vec![METHOD_AGENT_SESSION_TURN_START.to_string()]
        );
        let preflight = listed
            .iter()
            .find(|capability| capability.id == "session_policy.preflight")
            .expect("preflight policy capability");
        assert_eq!(preflight.methods, vec![METHOD_CAPABILITY_LIST.to_string()]);

        let other_session = source.list_capabilities(&CapabilityListContext {
            app_id: Some("content-studio".to_string()),
            workspace_id: Some("workspace-main".to_string()),
            session_id: Some("sess_other".to_string()),
        });
        assert!(!other_session
            .iter()
            .any(|capability| capability.id == "session_policy.draft.write"));

        let core = RuntimeCore::with_backend_and_capability_source(
            Arc::new(MockBackend),
            Arc::new(source),
        );
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_policy_allowed".to_string()),
            thread_id: Some("thread_policy_allowed".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace-main".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_policy_allowed".to_string(),
                turn_id: Some("turn_policy_allowed".to_string()),
                input: AgentInput {
                    text: "生成草稿".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    capability_id: Some("session_policy.draft.write".to_string()),
                    stream: false,
                    event_name: None,
                    provider_preference: None,
                    model_preference: None,
                    metadata: None,
                    queued_turn_id: None,
                    host_options: None,
                }),
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("executable policy capability should start turn");

        let error = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_policy_allowed".to_string(),
                    turn_id: Some("turn_policy_preflight_denied".to_string()),
                    input: AgentInput {
                        text: "只读预检".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: Some(RuntimeOptions {
                        capability_id: Some("session_policy.preflight".to_string()),
                        stream: false,
                        event_name: None,
                        provider_preference: None,
                        model_preference: None,
                        metadata: None,
                        queued_turn_id: None,
                        host_options: None,
                    }),
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect_err("discovery-only policy capability denied");
        match error {
            RuntimeCoreError::CapabilityDenied(capability_id) => {
                assert_eq!(capability_id, "session_policy.preflight");
            }
            other => panic!("expected capability denied, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn desktop_runtime_enable_metadata_projects_workspace_skill_as_session_executable_capability(
    ) {
        let temp = TempDir::new().expect("temp workspace");
        let registered = register_standard_workspace_skill(temp.path());
        let workspace_root = temp.path().to_string_lossy().to_string();
        let directory = registered.registration.skill_directory.clone();
        let bindings =
            list_workspace_skill_bindings(AgentRuntimeListWorkspaceSkillBindingsRequest {
                workspace_root: workspace_root.clone(),
                caller: Some("assistant".to_string()),
                workbench: true,
                browser_assist: false,
            })
            .expect("workspace skill bindings");
        let mut records = capability_inventory_records_from_tool_inventory(
            &desktop_app_server_baseline_tool_inventory(),
        );
        append_workspace_skill_capability_records(&mut records, &workspace_root, &bindings);
        let source = desktop_app_server_capability_source();
        source.replace_records(records);

        let readiness = source.list_capabilities(&CapabilityListContext {
            app_id: Some("content-studio".to_string()),
            workspace_id: Some(workspace_root.clone()),
            session_id: None,
        });
        let readiness_capability = readiness
            .iter()
            .find(|capability| capability.id == workspace_skill_capability_id(&directory))
            .expect("readiness capability");
        assert_eq!(
            readiness_capability.methods,
            vec![METHOD_CAPABILITY_LIST.to_string()]
        );

        let core = RuntimeCore::with_backend_and_capability_source(
            Arc::new(MockBackend),
            Arc::new(source.clone()),
        );
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_workspace_skill_enable".to_string()),
            thread_id: Some("thread_workspace_skill_enable".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some(workspace_root.clone()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
        let metadata = serde_json::json!({
            "harness": {
                "workspace_skill_runtime_enable": {
                    "source": "manual_session_enable",
                    "approval": "manual",
                    "workspace_root": workspace_root.clone(),
                    "bindings": [{
                        "directory": directory.clone()
                    }]
                }
            }
        });

        let output = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_workspace_skill_enable".to_string(),
                    turn_id: Some("turn_workspace_skill_enable".to_string()),
                    input: AgentInput {
                        text: "运行工作区技能".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: Some(RuntimeOptions {
                        capability_id: Some(workspace_skill_capability_id(&directory)),
                        stream: false,
                        event_name: None,
                        provider_preference: None,
                        model_preference: None,
                        metadata: Some(metadata),
                        queued_turn_id: None,
                        host_options: None,
                    }),
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("workspace skill executable capability should start turn");
        assert_eq!(output.response.turn.turn_id, "turn_workspace_skill_enable");

        let session_scoped = source.list_capabilities(&CapabilityListContext {
            app_id: Some("content-studio".to_string()),
            workspace_id: Some(temp.path().to_string_lossy().to_string()),
            session_id: Some("sess_workspace_skill_enable".to_string()),
        });
        let executable = session_scoped
            .iter()
            .find(|capability| capability.id == workspace_skill_capability_id(&directory))
            .expect("session executable capability");
        assert_eq!(
            executable.methods,
            vec![METHOD_AGENT_SESSION_TURN_START.to_string()]
        );
    }

    #[tokio::test]
    async fn desktop_runtime_enable_metadata_resolves_workspace_id_to_root_for_session_executable_capability(
    ) {
        let temp = TempDir::new().expect("temp workspace");
        let registered = register_standard_workspace_skill(temp.path());
        let workspace_root = temp.path().to_string_lossy().to_string();
        let directory = registered.registration.skill_directory.clone();
        let source = desktop_app_server_capability_source_with_workspace_root_resolver(
            workspace_root_resolver_fixture(vec![("workspace_1", workspace_root.clone())]),
        );

        let core = RuntimeCore::with_backend_and_capability_source(
            Arc::new(MockBackend),
            Arc::new(source.clone()),
        );
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess_workspace_skill_enable_by_id".to_string()),
            thread_id: Some("thread_workspace_skill_enable_by_id".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace_1".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");

        let output = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_workspace_skill_enable_by_id".to_string(),
                    turn_id: Some("turn_workspace_skill_enable_by_id".to_string()),
                    input: AgentInput {
                        text: "运行工作区技能".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: Some(RuntimeOptions {
                        capability_id: Some(workspace_skill_capability_id(&directory)),
                        stream: false,
                        event_name: None,
                        provider_preference: None,
                        model_preference: None,
                        metadata: Some(serde_json::json!({
                            "harness": {
                                "workspace_skill_runtime_enable": {
                                    "source": "manual_session_enable",
                                    "approval": "manual",
                                    "workspace_root": workspace_root.clone(),
                                    "bindings": [{
                                        "directory": directory.clone()
                                    }]
                                }
                            }
                        })),
                        queued_turn_id: None,
                        host_options: None,
                    }),
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("workspace id resolver should project executable capability");
        assert_eq!(
            output.response.turn.turn_id,
            "turn_workspace_skill_enable_by_id"
        );

        let session_scoped = source.list_capabilities(&CapabilityListContext {
            app_id: Some("content-studio".to_string()),
            workspace_id: Some("workspace_1".to_string()),
            session_id: Some("sess_workspace_skill_enable_by_id".to_string()),
        });
        let executable = session_scoped
            .iter()
            .find(|capability| capability.id == workspace_skill_capability_id(&directory))
            .expect("session executable capability");
        assert_eq!(
            executable.methods,
            vec![METHOD_AGENT_SESSION_TURN_START.to_string()]
        );
    }

    #[tokio::test]
    async fn desktop_artifact_content_provider_resolves_session_workspace_id_to_root() {
        let temp = TempDir::new().expect("temp workspace");
        let artifact_dir = temp.path().join(".app-server").join("artifacts");
        std::fs::create_dir_all(&artifact_dir).expect("artifact dir");
        std::fs::write(artifact_dir.join("report.md"), "# Desktop Report").expect("artifact file");
        let workspace_root = temp.path().to_string_lossy().to_string();
        let provider =
            DesktopArtifactContentProvider::new(workspace_root_resolver_fixture(vec![(
                "workspace_1",
                workspace_root,
            )]));

        let session = AgentSession {
            session_id: "sess_artifact_content".to_string(),
            thread_id: "thread_artifact_content".to_string(),
            app_id: "content-studio".to_string(),
            workspace_id: Some("workspace_1".to_string()),
            business_object_ref: None,
            status: AgentSessionStatus::Idle,
            created_at: "2026-06-05T00:00:00.000Z".to_string(),
            updated_at: "2026-06-05T00:00:00.000Z".to_string(),
        };
        let artifact = ArtifactSummary {
            artifact_ref: "artifact-report".to_string(),
            event_id: "evt-artifact-report".to_string(),
            sequence: 1,
            turn_id: None,
            artifact_id: Some("artifact-report".to_string()),
            path: Some(".app-server/artifacts/report.md".to_string()),
            title: None,
            kind: None,
            status: None,
            content: None,
            content_status: ArtifactContentStatus::NotRequested,
            metadata: None,
        };

        let content = provider.read_content(&ArtifactContentRequest {
            session: session.clone(),
            artifact: artifact.clone(),
        });
        assert_eq!(content.as_deref(), Some("# Desktop Report"));

        let unresolved =
            DesktopArtifactContentProvider::new(workspace_root_resolver_fixture(Vec::new()))
                .read_content(&ArtifactContentRequest { session, artifact });
        assert_eq!(unresolved, None);
    }

    #[tokio::test]
    async fn desktop_artifact_content_provider_rejects_absolute_workspace_id_root() {
        let temp = TempDir::new().expect("temp workspace");
        let artifact_dir = temp.path().join(".app-server").join("artifacts");
        std::fs::create_dir_all(&artifact_dir).expect("artifact dir");
        std::fs::write(artifact_dir.join("report.md"), "# Desktop Report").expect("artifact file");
        let workspace_root = temp.path().to_string_lossy().to_string();
        let provider =
            DesktopArtifactContentProvider::new(workspace_root_resolver_fixture(Vec::new()));

        let content = provider.read_content(&ArtifactContentRequest {
            session: AgentSession {
                session_id: "sess_artifact_content_absolute".to_string(),
                thread_id: "thread_artifact_content_absolute".to_string(),
                app_id: "content-studio".to_string(),
                workspace_id: Some(workspace_root),
                business_object_ref: None,
                status: AgentSessionStatus::Idle,
                created_at: "2026-06-05T00:00:00.000Z".to_string(),
                updated_at: "2026-06-05T00:00:00.000Z".to_string(),
            },
            artifact: ArtifactSummary {
                artifact_ref: "artifact-report".to_string(),
                event_id: "evt-artifact-report".to_string(),
                sequence: 1,
                turn_id: None,
                artifact_id: Some("artifact-report".to_string()),
                path: Some(".app-server/artifacts/report.md".to_string()),
                title: None,
                kind: None,
                status: None,
                content: None,
                content_status: ArtifactContentStatus::NotRequested,
                metadata: None,
            },
        });

        assert_eq!(content, None);
    }

    #[test]
    fn desktop_evidence_export_maps_runtime_pack_to_app_server_summary() {
        let summary = evidence_pack_summary_from_runtime_export(RuntimeEvidencePackExportResult {
            session_id: "sess_evidence".to_string(),
            thread_id: "thread_evidence".to_string(),
            workspace_id: Some("workspace_1".to_string()),
            workspace_root: "/workspace".to_string(),
            pack_relative_root: ".lime/harness/sessions/sess_evidence/evidence".to_string(),
            pack_absolute_root: "/workspace/.lime/harness/sessions/sess_evidence/evidence"
                .to_string(),
            exported_at: "2026-06-05T00:00:03.000Z".to_string(),
            thread_status: "running".to_string(),
            latest_turn_status: Some("completed".to_string()),
            turn_count: 2,
            item_count: 5,
            pending_request_count: 1,
            queued_turn_count: 0,
            recent_artifact_count: 1,
            known_gaps: vec!["gui_smoke_not_run".to_string()],
            observability_summary: serde_json::json!({
                "schema_version": "runtime-evidence-pack.v1"
            }),
            completion_audit_summary: serde_json::json!({
                "decision": "completed"
            }),
            artifacts: vec![RuntimeEvidenceArtifact {
                kind: RuntimeEvidenceArtifactKind::Summary,
                title: "Evidence Summary".to_string(),
                relative_path: ".lime/harness/sessions/sess_evidence/evidence/summary.md"
                    .to_string(),
                absolute_path:
                    "/workspace/.lime/harness/sessions/sess_evidence/evidence/summary.md"
                        .to_string(),
                bytes: 128,
            }],
        });

        assert_eq!(
            summary.pack_relative_root,
            ".lime/harness/sessions/sess_evidence/evidence"
        );
        assert_eq!(
            summary.pack_absolute_root.as_deref(),
            Some("/workspace/.lime/harness/sessions/sess_evidence/evidence")
        );
        assert_eq!(summary.thread_status, "running");
        assert_eq!(summary.latest_turn_status.as_deref(), Some("completed"));
        assert_eq!(summary.turn_count, 2);
        assert_eq!(summary.pending_request_count, 1);
        assert_eq!(summary.known_gaps, vec!["gui_smoke_not_run"]);
        assert_eq!(
            summary
                .completion_audit_summary
                .as_ref()
                .and_then(|value| value.get("decision"))
                .and_then(serde_json::Value::as_str),
            Some("completed")
        );
        assert_eq!(summary.artifacts.len(), 1);
        assert_eq!(summary.artifacts[0].kind, "summary");
        assert_eq!(summary.artifacts[0].bytes, 128);
        assert_eq!(
            runtime_evidence_artifact_kind_value(&RuntimeEvidenceArtifactKind::Runtime),
            "runtime"
        );
        assert_eq!(
            runtime_evidence_artifact_kind_value(&RuntimeEvidenceArtifactKind::Timeline),
            "timeline"
        );
        assert_eq!(
            runtime_evidence_artifact_kind_value(&RuntimeEvidenceArtifactKind::Artifacts),
            "artifacts"
        );
    }

    #[tokio::test]
    async fn desktop_runtime_enable_metadata_clears_session_executable_capability_when_missing() {
        let temp = TempDir::new().expect("temp workspace");
        let registered = register_standard_workspace_skill(temp.path());
        let workspace_root = temp.path().to_string_lossy().to_string();
        let directory = registered.registration.skill_directory.clone();
        let source = desktop_app_server_capability_source();
        let context = CapabilityListContext {
            app_id: Some("content-studio".to_string()),
            workspace_id: Some(workspace_root.clone()),
            session_id: Some("sess_policy_clear".to_string()),
        };
        source.prepare_turn_capabilities(
            &context,
            Some(&RuntimeOptions {
                capability_id: Some(workspace_skill_capability_id(&directory)),
                stream: false,
                event_name: None,
                provider_preference: None,
                model_preference: None,
                metadata: Some(serde_json::json!({
                    "harness": {
                        "workspace_skill_runtime_enable": {
                            "source": "manual_session_enable",
                            "approval": "manual",
                            "workspace_root": workspace_root.clone(),
                            "bindings": [{
                                "directory": directory.clone()
                            }]
                        }
                    }
                })),
                queued_turn_id: None,
                host_options: None,
            }),
        );
        assert!(source
            .list_capabilities(&context)
            .iter()
            .any(
                |capability| capability.id == workspace_skill_capability_id(&directory)
                    && capability.methods == vec![METHOD_AGENT_SESSION_TURN_START.to_string()]
            ));

        source.prepare_turn_capabilities(
            &context,
            Some(&RuntimeOptions {
                capability_id: Some(workspace_skill_capability_id(&directory)),
                stream: false,
                event_name: None,
                provider_preference: None,
                model_preference: None,
                metadata: None,
                queued_turn_id: None,
                host_options: None,
            }),
        );

        assert!(!source
            .list_capabilities(&context)
            .iter()
            .any(
                |capability| capability.id == workspace_skill_capability_id(&directory)
                    && capability.methods == vec![METHOD_AGENT_SESSION_TURN_START.to_string()]
            ));
    }

    #[test]
    fn desktop_runtime_enable_metadata_ignores_non_absolute_workspace_id() {
        let records = desktop_session_policy_capability_records_from_runtime_options(
            &CapabilityListContext {
                app_id: Some("content-studio".to_string()),
                workspace_id: Some("workspace_1".to_string()),
                session_id: Some("sess_non_absolute".to_string()),
            },
            Some(&RuntimeOptions {
                capability_id: Some("workspace_skill.capability-report".to_string()),
                stream: false,
                event_name: None,
                provider_preference: None,
                model_preference: None,
                metadata: Some(serde_json::json!({
                    "harness": {
                        "workspace_skill_runtime_enable": {
                            "bindings": [{
                                "directory": "capability-report"
                            }]
                        }
                    }
                })),
                queued_turn_id: None,
                host_options: None,
            }),
            &missing_desktop_workspace_root_resolver(),
        );

        assert!(records.is_empty());
    }

    #[test]
    fn desktop_runtime_enable_metadata_ignores_unresolved_workspace_id() {
        let records = desktop_session_policy_capability_records_from_runtime_options(
            &CapabilityListContext {
                app_id: Some("content-studio".to_string()),
                workspace_id: Some("workspace_1".to_string()),
                session_id: Some("sess_unresolved_workspace".to_string()),
            },
            Some(&RuntimeOptions {
                capability_id: Some("workspace_skill.capability-report".to_string()),
                stream: false,
                event_name: None,
                provider_preference: None,
                model_preference: None,
                metadata: Some(serde_json::json!({
                    "harness": {
                        "workspace_skill_runtime_enable": {
                            "workspace_root": "/tmp/workspace-main",
                            "bindings": [{
                                "directory": "capability-report"
                            }]
                        }
                    }
                })),
                queued_turn_id: None,
                host_options: None,
            }),
            &workspace_root_resolver_fixture(Vec::new()),
        );

        assert!(records.is_empty());
    }

    #[test]
    fn desktop_runtime_enable_metadata_ignores_mismatched_resolved_workspace_root() {
        let records = desktop_session_policy_capability_records_from_runtime_options(
            &CapabilityListContext {
                app_id: Some("content-studio".to_string()),
                workspace_id: Some("workspace_1".to_string()),
                session_id: Some("sess_mismatched_workspace".to_string()),
            },
            Some(&RuntimeOptions {
                capability_id: Some("workspace_skill.capability-report".to_string()),
                stream: false,
                event_name: None,
                provider_preference: None,
                model_preference: None,
                metadata: Some(serde_json::json!({
                    "harness": {
                        "workspace_skill_runtime_enable": {
                            "workspace_root": "/tmp/workspace-other",
                            "bindings": [{
                                "directory": "capability-report"
                            }]
                        }
                    }
                })),
                queued_turn_id: None,
                host_options: None,
            }),
            &workspace_root_resolver_fixture(vec![(
                "workspace_1",
                "/tmp/workspace-main".to_string(),
            )]),
        );

        assert!(records.is_empty());
    }

    #[tokio::test]
    async fn app_server_aster_runtime_can_list_desktop_tool_capabilities() {
        let server = AppServer::with_runtime(
            AppServerRuntimeFactory::aster_runtime_core_with_capability_source(
                Arc::new(ProbeAsterBackendHost {
                    submit_request: Arc::new(Mutex::new(None)),
                }),
                Arc::new(desktop_app_server_capability_source()),
            ),
        );
        server
            .handle_json_line(
                r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"clientInfo":{"name":"content-studio"},"capabilities":{}}}"#,
            )
            .await
            .expect("initialize");
        server
            .handle_json_line(r#"{"jsonrpc":"2.0","method":"initialized","params":{}}"#)
            .await
            .expect("initialized");

        let result = first_response_result(
            server
                .handle_json_line(
                    r#"{"jsonrpc":"2.0","id":2,"method":"capability/list","params":{"limit":1000}}"#,
                )
                .await
                .expect("capability list"),
        );
        let ids = result["capabilities"]
            .as_array()
            .expect("capabilities")
            .iter()
            .filter_map(|capability| capability["id"].as_str())
            .collect::<Vec<_>>();

        assert!(ids.contains(&"agent.session"));
        assert!(ids.contains(&"tool.Agent"));
    }

    #[tokio::test]
    async fn tauri_aster_backend_host_submit_persists_registers_and_delegates_runtime_turn() {
        let runtime_host = FakeAsterRuntimeHostBridge::default();
        let registry = FakeRuntimeEventBridgeRegistry::default();
        let bridge = Arc::new(OnceLock::new());
        assert!(bridge.set(AppServer::new().event_bridge()).is_ok());
        let host = app_server_host_with_fakes(
            Arc::new(runtime_host.clone()),
            registry.clone(),
            Some(bridge),
        );

        host.submit_turn(backend_submit_request())
            .await
            .expect("submit");

        let ensure_requests = runtime_host.ensure_requests();
        assert_eq!(ensure_requests.len(), 1);
        assert_eq!(ensure_requests[0].session_id, "sess_submit");
        let create_input = ensure_requests[0]
            .create_input
            .as_ref()
            .expect("create input");
        assert_eq!(create_input.session_id, "sess_submit");
        assert_eq!(create_input.workspace_id, "workspace_1");
        assert_eq!(
            registry.listener_event_names(),
            vec!["agentSession/event/sess_submit".to_string()]
        );
        let submitted_tasks = runtime_host.submitted_tasks();
        assert_eq!(submitted_tasks.len(), 1);
        assert_eq!(submitted_tasks[0].session_id, "sess_submit");
        assert_eq!(
            submitted_tasks[0].event_name,
            "agentSession/event/sess_submit"
        );
        assert_eq!(submitted_tasks[0].message_text, "生成草稿");
        assert_eq!(submitted_tasks[0].payload["message"], "生成草稿");
        assert_eq!(submitted_tasks[0].payload["turn_id"], "turn_submit");
        assert_eq!(
            submitted_tasks[0].payload["metadata"]["app_server"]["capability_id"],
            "draft.write"
        );
        assert_eq!(runtime_host.submit_flags(), vec![(true, false)]);
        assert!(registry.unlisten_calls().is_empty());
    }

    #[tokio::test]
    async fn tauri_aster_backend_host_submit_preserves_host_options_aster_request() {
        let mut request = backend_submit_request();
        let host_request = AsterChatRequest {
            message: "旧入口消息".to_string(),
            session_id: "will_be_overwritten".to_string(),
            event_name: "will_be_overwritten".to_string(),
            images: None,
            provider_config: None,
            provider_preference: Some("custom-provider".to_string()),
            model_preference: Some("gpt-5.3-codex".to_string()),
            reasoning_effort: Some("high".to_string()),
            thinking_enabled: Some(true),
            approval_policy: Some("on-request".to_string()),
            sandbox_policy: Some("workspace-write".to_string()),
            project_id: Some("project-1".to_string()),
            workspace_id: "workspace_from_host_options".to_string(),
            web_search: Some(true),
            search_mode: None,
            execution_strategy: Some(AsterExecutionStrategy::React),
            auto_continue: None,
            system_prompt: Some("runtime prompt".to_string()),
            metadata: Some(serde_json::json!({
                "source": "agent_runtime_submit_turn"
            })),
            turn_id: Some("will_be_overwritten".to_string()),
            queue_if_busy: Some(false),
            queued_turn_id: Some("will_be_overwritten".to_string()),
        };
        request.runtime_options = Some(RuntimeOptions {
            capability_id: Some("runtime.submit".to_string()),
            stream: true,
            event_name: None,
            provider_preference: None,
            model_preference: None,
            metadata: None,
            queued_turn_id: Some("queue-from-runtime-options".to_string()),
            host_options: Some(serde_json::json!({
                HOST_OPTIONS_ASTER_CHAT_REQUEST: host_request
            })),
        });

        let runtime_host = FakeAsterRuntimeHostBridge::default();
        let registry = FakeRuntimeEventBridgeRegistry::default();
        let host = app_server_host_with_fakes(Arc::new(runtime_host.clone()), registry, None);

        host.submit_turn(request).await.expect("submit");

        let submitted_tasks = runtime_host.submitted_tasks();
        assert_eq!(submitted_tasks.len(), 1);
        let payload = &submitted_tasks[0].payload;
        assert_eq!(payload["session_id"], "sess_submit");
        assert_eq!(payload["event_name"], "agentSession/event/sess_submit");
        assert_eq!(payload["message"], "生成草稿");
        assert_eq!(payload["turn_id"], "turn_submit");
        assert_eq!(payload["workspace_id"], "workspace_from_host_options");
        assert_eq!(payload["web_search"], true);
        assert_eq!(payload["reasoning_effort"], "high");
        assert_eq!(payload["system_prompt"], "runtime prompt");
        assert_eq!(payload["queued_turn_id"], "queue-from-runtime-options");
    }

    #[tokio::test]
    async fn tauri_aster_backend_host_submit_failure_unregisters_listener() {
        let runtime_host = FakeAsterRuntimeHostBridge::fail_submit("submit failed");
        let registry = FakeRuntimeEventBridgeRegistry::default();
        let bridge = Arc::new(OnceLock::new());
        assert!(bridge.set(AppServer::new().event_bridge()).is_ok());
        let host = app_server_host_with_fakes(
            Arc::new(runtime_host.clone()),
            registry.clone(),
            Some(bridge),
        );

        let error = host
            .submit_turn(backend_submit_request())
            .await
            .expect_err("submit error");

        match error {
            RuntimeCoreError::Backend(message) => assert_eq!(message, "submit failed"),
            other => panic!("expected backend error, got {other:?}"),
        }
        let ensure_requests = runtime_host.ensure_requests();
        assert_eq!(ensure_requests.len(), 1);
        assert_eq!(ensure_requests[0].session_id, "sess_submit");
        assert_eq!(runtime_host.submitted_tasks().len(), 1);
        assert!(registry.listener_ids().is_empty());
        assert_eq!(registry.unlisten_calls(), vec![1]);
    }

    #[tokio::test]
    async fn tauri_aster_backend_host_cancel_delegates_to_runtime_host() {
        let runtime_host =
            FakeAsterRuntimeHostBridge::with_cancel_outcome(RuntimeHostCancelOutcome {
                cancelled: true,
                aborted: false,
                gate_released: false,
                queue_cleared: false,
            });
        let registry = FakeRuntimeEventBridgeRegistry::default();
        let host = app_server_host_with_fakes(Arc::new(runtime_host.clone()), registry, None);

        host.cancel_turn(backend_cancel_request())
            .await
            .expect("cancel");

        let operations = runtime_host.cancel_operations();
        assert_eq!(operations.len(), 1);
        assert_eq!(operations[0].session_id, "sess_submit");
        assert_eq!(operations[0].turn_id, "turn_submit");
        assert_eq!(operations[0].interrupt_message, RUNTIME_INTERRUPT_MESSAGE);
    }

    #[tokio::test]
    async fn desktop_aster_backend_host_respond_action_delegates_action_operation() {
        let runtime_host = FakeAsterRuntimeHostBridge::default();
        let registry = FakeRuntimeEventBridgeRegistry::default();
        let host = app_server_host_with_fakes(Arc::new(runtime_host.clone()), registry, None);

        host.respond_action(backend_action_respond_request())
            .await
            .expect("respond action");

        let operations = runtime_host.action_operations();
        assert_eq!(operations.len(), 1);
        let input = &operations[0].input;
        assert_eq!(input.session_id, "sess_submit");
        assert_eq!(input.request_id, "req_confirm_1");
        assert_eq!(input.action_type, AgentRuntimeActionType::ToolConfirmation);
        assert!(input.confirmed);
        assert_eq!(input.response.as_deref(), Some("allow"));
        assert_eq!(
            input.user_data.as_ref().expect("user data")["reason"],
            "user-approved"
        );
        assert_eq!(
            input.metadata.as_ref().expect("metadata")["source"],
            "app-server"
        );
        assert_eq!(
            input.event_name.as_deref(),
            Some("agentSession/event/sess_submit")
        );
        let scope = input.action_scope.as_ref().expect("action scope");
        assert_eq!(scope.session_id.as_deref(), Some("sess_submit"));
        assert_eq!(scope.thread_id.as_deref(), Some("thread_submit"));
        assert_eq!(scope.turn_id.as_deref(), Some("turn_submit"));
    }

    #[tokio::test]
    async fn runtime_event_bridge_subscription_replaces_existing_listener_and_closes_on_terminal_event(
    ) {
        let runtime = RuntimeCore::with_backend(Arc::new(MockBackend));
        let server = AppServer::with_runtime(runtime.clone());
        let mut outbound = server.subscribe_outbound_messages();
        let session = runtime
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_bridge".to_string()),
                thread_id: Some("thread_bridge".to_string()),
                app_id: "content-studio".to_string(),
                workspace_id: Some("workspace_1".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session")
            .session;
        let turn = runtime
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: session.session_id.clone(),
                    turn_id: None,
                    input: AgentInput {
                        text: "生成草稿".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("turn")
            .response
            .turn;
        let bridge = Arc::new(OnceLock::new());
        assert!(bridge.set(server.event_bridge()).is_ok());
        let registry = FakeRuntimeEventBridgeRegistry::default();
        let subscriptions =
            RuntimeEventBridgeSubscriptions::new(Arc::new(registry.clone()), Some(bridge));
        let request = AsterBackendSubmitRequest {
            host: RuntimeHostContext::default(),
            session: session.clone(),
            turn: turn.clone(),
            input: AgentInput {
                text: "生成草稿".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            provider_preference: None,
            model_preference: None,
            metadata: None,
            event_name: "agentSession/event/sess_bridge".to_string(),
            queued_turn_id: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        };
        let registration = desktop_aster_event_bridge_registration_from_backend_request(&request);

        assert_eq!(
            subscriptions.register(&registration).as_deref(),
            Some("sess_bridge")
        );
        let first_listener_id = registry.listener_ids()[0];
        assert_eq!(
            registry.listener_event_names(),
            vec!["agentSession/event/sess_bridge".to_string()]
        );

        assert_eq!(
            subscriptions.register(&registration).as_deref(),
            Some("sess_bridge")
        );
        let second_listener_id = registry.listener_ids()[0];
        assert_ne!(first_listener_id, second_listener_id);
        assert_eq!(registry.unlisten_calls(), vec![first_listener_id]);

        let delta_payload = serde_json::to_string(&lime_agent::AgentEvent::TextDelta {
            text: "delta".to_string(),
        })
        .expect("delta payload");
        registry.trigger(second_listener_id, &delta_payload);
        assert_eq!(registry.listener_ids(), vec![second_listener_id]);

        let delta_notification =
            tokio::time::timeout(std::time::Duration::from_secs(1), outbound.recv())
                .await
                .expect("delta outbound timeout")
                .expect("delta outbound");
        match delta_notification {
            app_server::JsonRpcMessage::Notification(notification) => {
                let event = &notification.params.as_ref().expect("params")["event"];
                assert_eq!(event["sessionId"], "sess_bridge");
                assert_eq!(event["turnId"], turn.turn_id);
                assert_eq!(event["type"], "message.delta");
                assert_eq!(event["payload"]["text"], "delta");
            }
            other => panic!("expected outbound notification, got {other:?}"),
        }

        let terminal_payload =
            serde_json::to_string(&lime_agent::AgentEvent::FinalDone { usage: None })
                .expect("terminal payload");
        registry.trigger(second_listener_id, &terminal_payload);
        assert!(registry.listener_ids().is_empty());
        assert_eq!(
            registry.unlisten_calls(),
            vec![first_listener_id, second_listener_id]
        );
    }

    #[test]
    fn backend_submit_request_maps_to_aster_chat_request_without_protocol_leak() {
        let request = AsterBackendSubmitRequest {
            host: RuntimeHostContext {
                client_name: Some("content-studio".to_string()),
                client_version: Some("0.1.0".to_string()),
            },
            session: AgentSession {
                session_id: "sess_1".to_string(),
                thread_id: "thread_1".to_string(),
                app_id: "content-studio".to_string(),
                workspace_id: Some("workspace_1".to_string()),
                business_object_ref: None,
                status: AgentSessionStatus::Running,
                created_at: "2026-06-04T00:00:00.000Z".to_string(),
                updated_at: "2026-06-04T00:00:00.000Z".to_string(),
            },
            turn: AgentTurn {
                turn_id: "turn_1".to_string(),
                session_id: "sess_1".to_string(),
                thread_id: "thread_1".to_string(),
                status: AgentTurnStatus::Accepted,
                started_at: None,
                completed_at: None,
            },
            input: AgentInput {
                text: "生成草稿".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                capability_id: Some("draft.write".to_string()),
                stream: true,
                event_name: None,
                provider_preference: Some("deepseek".to_string()),
                model_preference: Some("deepseek-v4-flash".to_string()),
                metadata: Some(serde_json::json!({
                    "agent_app_runtime": {
                        "task_id": "task-1"
                    }
                })),
                queued_turn_id: Some("agent-app-queued-task-1".to_string()),
                host_options: None,
            }),
            provider_preference: Some("deepseek".to_string()),
            model_preference: Some("deepseek-v4-flash".to_string()),
            metadata: Some(serde_json::json!({
                "agent_app_runtime": {
                    "task_id": "task-1"
                }
            })),
            event_name: "agentSession/event/sess_1".to_string(),
            queued_turn_id: Some("agent-app-queued-task-1".to_string()),
            queue_if_busy: true,
            skip_pre_submit_resume: false,
        };

        let mapped = aster_chat_request_from_backend_request(&request);

        assert_eq!(mapped.message, "生成草稿");
        assert_eq!(mapped.session_id, "sess_1");
        assert_eq!(mapped.event_name, "agentSession/event/sess_1");
        assert_eq!(mapped.workspace_id, "workspace_1");
        assert_eq!(mapped.turn_id.as_deref(), Some("turn_1"));
        assert_eq!(mapped.queue_if_busy, Some(true));
        assert_eq!(mapped.provider_preference.as_deref(), Some("deepseek"));
        assert_eq!(
            mapped.model_preference.as_deref(),
            Some("deepseek-v4-flash")
        );
        assert_eq!(
            mapped.queued_turn_id.as_deref(),
            Some("agent-app-queued-task-1")
        );
        assert_eq!(
            mapped.metadata.as_ref().expect("metadata")["app_server"]["capability_id"],
            "draft.write"
        );
        assert_eq!(
            mapped.metadata.as_ref().expect("metadata")["agent_app_runtime"]["task_id"],
            "task-1"
        );
    }

    #[test]
    fn app_server_event_bridge_parses_and_maps_lime_agent_event_payload() {
        let payload = serde_json::to_string(&lime_agent::AgentEvent::TextDelta {
            text: "hello".to_string(),
        })
        .expect("payload");

        let parsed = parse_lime_agent_event_payload(&payload).expect("parsed event");
        let runtime_event = runtime_event_from_lime_agent_event(&parsed).expect("runtime event");

        assert_eq!(runtime_event.event_type, "message.delta");
        assert_eq!(runtime_event.payload["type"], "text_delta");
        assert_eq!(runtime_event.payload["text"], "hello");
        assert!(!should_close_app_server_event_bridge(&parsed));
    }

    #[test]
    fn desktop_aster_runtime_event_bridge_append_maps_event_without_bridge_state() {
        let append = desktop_aster_runtime_event_bridge_append_from_event(
            "sess_append".to_string(),
            Some("turn_fallback".to_string()),
            &lime_agent::AgentEvent::TextDelta {
                text: "hello".to_string(),
            },
        )
        .expect("append");

        assert_eq!(append.session_id, "sess_append");
        assert_eq!(append.turn_id.as_deref(), Some("turn_fallback"));
        assert_eq!(append.event.event_type, "message.delta");
        assert_eq!(append.event.payload["text"], "hello");
        assert!(!append.should_close);
    }

    #[test]
    fn desktop_aster_runtime_event_bridge_append_prefers_event_turn_id() {
        let append = desktop_aster_runtime_event_bridge_append_from_event(
            "sess_append".to_string(),
            Some("turn_fallback".to_string()),
            &lime_agent::AgentEvent::TurnCompleted {
                turn: AgentThreadTurn {
                    id: "turn_payload".to_string(),
                    thread_id: "thread_append".to_string(),
                    prompt_text: "生成草稿".to_string(),
                    status: AgentThreadTurnStatus::Completed,
                    started_at: "2026-03-13T00:00:00Z".to_string(),
                    completed_at: Some("2026-03-13T00:00:01Z".to_string()),
                    error_message: None,
                    created_at: "2026-03-13T00:00:00Z".to_string(),
                    updated_at: "2026-03-13T00:00:01Z".to_string(),
                },
            },
        );

        let append = append.expect("append");
        assert_eq!(append.session_id, "sess_append");
        assert_eq!(append.turn_id.as_deref(), Some("turn_payload"));
        assert_eq!(append.event.event_type, "turn.completed");
        assert!(!append.should_close);
    }

    #[test]
    fn app_server_event_bridge_closes_on_terminal_lime_agent_event() {
        assert!(should_close_app_server_event_bridge(
            &lime_agent::AgentEvent::FinalDone { usage: None }
        ));
        assert!(should_close_app_server_event_bridge(
            &lime_agent::AgentEvent::Error {
                message: "failed".to_string(),
            }
        ));
        assert!(!should_close_app_server_event_bridge(
            &lime_agent::AgentEvent::Warning {
                code: None,
                message: "keep listening".to_string(),
            }
        ));
    }

    #[tokio::test]
    async fn app_server_event_bridge_appends_payload_to_read_model_and_outbound_notification() {
        let runtime = RuntimeCore::with_backend(Arc::new(MockBackend));
        let server = AppServer::with_runtime(runtime.clone());
        let mut outbound = server.subscribe_outbound_messages();
        let session = runtime
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_1".to_string()),
                thread_id: Some("thread_1".to_string()),
                app_id: "content-studio".to_string(),
                workspace_id: Some("workspace_1".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session")
            .session;
        let turn = runtime
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: session.session_id.clone(),
                    turn_id: None,
                    input: AgentInput {
                        text: "生成草稿".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("turn")
            .response
            .turn;
        let payload = serde_json::to_string(&lime_agent::AgentEvent::TextDelta {
            text: "delta".to_string(),
        })
        .expect("payload");

        let should_close = append_lime_agent_payload_to_app_server_bridge(
            &server.event_bridge(),
            &session.session_id,
            &turn.turn_id,
            &payload,
        )
        .expect("append");

        assert!(!should_close);
        let events = runtime
            .events_for_session(&session.session_id)
            .expect("events");
        assert_eq!(events.len(), 2);
        assert_eq!(events[1].event_type, "message.delta");
        assert_eq!(events[1].turn_id.as_deref(), Some(turn.turn_id.as_str()));

        let notification = tokio::time::timeout(std::time::Duration::from_secs(1), outbound.recv())
            .await
            .expect("outbound timeout")
            .expect("outbound message");
        match notification {
            app_server::JsonRpcMessage::Notification(notification) => {
                let event = &notification.params.as_ref().expect("params")["event"];
                assert_eq!(event["sessionId"], "sess_1");
                assert_eq!(event["turnId"], turn.turn_id);
                assert_eq!(event["type"], "message.delta");
                assert_eq!(event["payload"]["text"], "delta");
            }
            other => panic!("expected outbound notification, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn app_server_runtime_queue_event_port_appends_direct_runtime_event() {
        let runtime = RuntimeCore::with_backend(Arc::new(MockBackend));
        let server = AppServer::with_runtime(runtime.clone());
        let bridge = Arc::new(OnceLock::new());
        assert!(bridge.set(server.event_bridge()).is_ok());
        let scopes = Arc::new(Mutex::new(HashMap::from([(
            "agentSession/event/sess_direct".to_string(),
            ("sess_direct".to_string(), "turn_direct".to_string()),
        )])));
        let port = AppServerRuntimeQueueEventPort {
            delegate: None,
            bridge,
            scopes: scopes.clone(),
        };
        let mut outbound = server.subscribe_outbound_messages();
        runtime
            .start_session(AgentSessionStartParams {
                session_id: Some("sess_direct".to_string()),
                thread_id: Some("thread_direct".to_string()),
                app_id: "content-studio".to_string(),
                workspace_id: Some("workspace_1".to_string()),
                business_object_ref: None,
                locale: None,
            })
            .expect("session");
        runtime
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_direct".to_string(),
                    turn_id: Some("turn_direct".to_string()),
                    input: AgentInput {
                        text: "生成草稿".to_string(),
                        attachments: Vec::new(),
                    },
                    runtime_options: None,
                    queue_if_busy: false,
                    skip_pre_submit_resume: false,
                },
                RuntimeHostContext::default(),
            )
            .await
            .expect("turn");

        port.emit_runtime_queue_event(
            "agentSession/event/sess_direct",
            &lime_agent::AgentEvent::TextDelta {
                text: "direct".to_string(),
            },
        );

        let events = runtime.events_for_session("sess_direct").expect("events");
        assert_eq!(
            events.last().expect("last event").event_type,
            "message.delta"
        );
        assert_eq!(
            events.last().expect("last event").turn_id.as_deref(),
            Some("turn_direct")
        );
        let notification = tokio::time::timeout(std::time::Duration::from_secs(1), outbound.recv())
            .await
            .expect("outbound timeout")
            .expect("outbound message");
        match notification {
            app_server::JsonRpcMessage::Notification(notification) => {
                let event = &notification.params.as_ref().expect("params")["event"];
                assert_eq!(event["sessionId"], "sess_direct");
                assert_eq!(event["turnId"], "turn_direct");
                assert_eq!(event["payload"]["text"], "direct");
            }
            other => panic!("expected outbound notification, got {other:?}"),
        }

        port.emit_runtime_queue_event(
            "agentSession/event/sess_direct",
            &lime_agent::AgentEvent::FinalDone { usage: None },
        );
        assert!(!scopes
            .lock()
            .expect("scopes lock")
            .contains_key("agentSession/event/sess_direct"));
    }
}
