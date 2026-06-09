use super::json_value_fields::json_string_field;
#[cfg(test)]
use super::thread_read_projection::{
    latest_model_delta_timing_from_run, merge_latest_model_delta_timing_into_thread_read,
};
use super::*;
use crate::database::lock_db;
use crate::services::runtime_evidence_pack_service::{
    export_runtime_evidence_pack_with_owner_runs_and_locale, resolve_runtime_export_workspace_root,
    RuntimeEvidencePackExportResult,
};
use crate::services::thread_reliability_projection_service::sync_thread_reliability_projection;
#[cfg(test)]
use lime_core::database::dao::agent_run::AgentRun;
use lime_core::database::dao::agent_run::AgentRunDao;
use lime_core::database::dao::agent_timeline::AgentThreadTurnStatus;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

const TOOL_INVENTORY_AUX_TIMEOUT: Duration = Duration::from_secs(3);

async fn resume_runtime_queue_with_warning(
    runtime: &RuntimeCommandContext,
    session_id: &str,
    action_label: &str,
) {
    if let Err(error) = runtime
        .resume_runtime_queue_if_needed(session_id.to_string())
        .await
    {
        tracing::warn!(
            "[AsterAgent][Queue] {}恢复排队执行失败: session_id={}, error={}",
            action_label,
            session_id,
            error
        );
    }
}

pub(crate) struct RuntimeExportContext {
    detail: SessionDetail,
    thread_read: AgentRuntimeThreadReadModel,
    workspace_root: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AgentAppRuntimeExportProjectionScope {
    app_id: String,
    task_id: String,
    trace_id: Option<String>,
    task_kind: Option<String>,
}

async fn load_runtime_export_context(
    runtime: &RuntimeCommandContext,
    session_id: &str,
    action_label: &str,
) -> Result<RuntimeExportContext, String> {
    resume_runtime_queue_with_warning(runtime, session_id, action_label).await;

    let detail = AsterAgentWrapper::get_runtime_session_detail(runtime.db(), session_id).await?;
    let queued_turns = list_runtime_queue_snapshots_service(session_id).await?;
    let projection = sync_thread_reliability_projection(runtime.db(), &detail)?;
    let interrupt_marker = runtime.state().get_interrupt_marker(session_id).await;
    let thread_read = AgentRuntimeThreadReadModel::from_parts(
        &detail,
        &queued_turns,
        projection.pending_requests,
        projection.last_outcome,
        projection.incidents,
        interrupt_marker.as_ref(),
    );
    let workspace_root = resolve_runtime_export_workspace_root(runtime.db(), &detail)?;

    Ok(RuntimeExportContext {
        detail,
        thread_read,
        workspace_root,
    })
}

pub(crate) async fn export_runtime_evidence_pack_for_runtime(
    runtime: &RuntimeCommandContext,
    session_id: &str,
    locale: Option<&str>,
    action_label: &str,
) -> Result<(RuntimeExportContext, RuntimeEvidencePackExportResult), String> {
    let context = load_runtime_export_context(runtime, session_id, action_label).await?;
    let owner_runs = {
        let conn = lock_db(runtime.db())?;
        AgentRunDao::list_runs_by_session(&conn, session_id, 20)
            .map_err(|error| format!("查询 evidence pack owner runs 失败: {error}"))?
    };
    let export = export_runtime_evidence_pack_with_owner_runs_and_locale(
        &context.detail,
        &context.thread_read,
        &context.workspace_root,
        &owner_runs,
        locale,
    )?;

    Ok((context, export))
}

fn normalize_agent_app_projection_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn agent_app_runtime_export_event_name(scope: &AgentAppRuntimeExportProjectionScope) -> String {
    format!("agent_app_runtime:{}:{}", scope.app_id, scope.task_id)
}

fn agent_app_runtime_export_scope_from_runtime_summary_value(
    summary: Option<&Value>,
) -> Option<AgentAppRuntimeExportProjectionScope> {
    let summary = summary?;
    let surface = json_string_field(summary, &["surface"])?;
    if surface != "agent_app" {
        return None;
    }

    Some(AgentAppRuntimeExportProjectionScope {
        app_id: json_string_field(summary, &["appId", "app_id"])?,
        task_id: json_string_field(summary, &["taskId", "task_id"])?,
        trace_id: json_string_field(summary, &["traceId", "trace_id"]),
        task_kind: json_string_field(summary, &["taskKind", "task_kind"]),
    })
}

fn agent_app_runtime_export_scope_from_execution_runtime(
    runtime: Option<&lime_agent::SessionExecutionRuntime>,
) -> Option<AgentAppRuntimeExportProjectionScope> {
    let summary = runtime?.runtime_summary.as_ref()?;
    if summary.surface.as_deref().map(str::trim) != Some("agent_app") {
        return None;
    }

    Some(AgentAppRuntimeExportProjectionScope {
        app_id: normalize_agent_app_projection_text(summary.app_id.as_deref())?,
        task_id: normalize_agent_app_projection_text(summary.task_id.as_deref())?,
        trace_id: normalize_agent_app_projection_text(summary.trace_id.as_deref()),
        task_kind: normalize_agent_app_projection_text(summary.task_kind.as_deref()),
    })
}

fn resolve_agent_app_runtime_export_projection_scope(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
) -> Option<AgentAppRuntimeExportProjectionScope> {
    agent_app_runtime_export_scope_from_runtime_summary_value(thread_read.runtime_summary.as_ref())
        .or_else(|| {
            agent_app_runtime_export_scope_from_execution_runtime(detail.execution_runtime.as_ref())
        })
}

fn json_array_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Vec<Value>> {
    keys.iter().find_map(|key| value.get(*key)?.as_array())
}

fn harness_export_kind_label(export_kind: &str) -> &'static str {
    match export_kind {
        "evidence_pack" => "Evidence Pack",
        "analysis_handoff" => "Analysis Handoff",
        "review_decision" => "Review Decision",
        _ => "Harness Export",
    }
}

fn harness_export_root_ref(export_kind: &str, export: &Value) -> Option<String> {
    match export_kind {
        "evidence_pack" => json_string_field(export, &["packRelativeRoot", "pack_relative_root"]),
        "analysis_handoff" => {
            json_string_field(export, &["analysisRelativeRoot", "analysis_relative_root"])
        }
        "review_decision" => {
            json_string_field(export, &["reviewRelativeRoot", "review_relative_root"])
        }
        _ => None,
    }
}

fn harness_exported_at(export: &Value) -> Option<String> {
    json_string_field(export, &["exportedAt", "exported_at"])
}

fn build_harness_export_root_task_event(export_kind: &str, export: &Value) -> Option<Value> {
    let root_ref = harness_export_root_ref(export_kind, export)?;
    let label = harness_export_kind_label(export_kind);
    let mut task_event = serde_json::Map::new();
    task_event.insert(
        "id".to_string(),
        json!(format!("harness:{export_kind}:exported")),
    );
    task_event.insert(
        "eventType".to_string(),
        json!(if export_kind == "evidence_pack" {
            "evidence:recorded"
        } else {
            "artifact:created"
        }),
    );
    task_event.insert(
        "status".to_string(),
        json!(if export_kind == "evidence_pack" {
            "recorded"
        } else {
            "created"
        }),
    );
    task_event.insert("message".to_string(), json!(format!("{label} 已导出")));
    task_event.insert("occurredAt".to_string(), json!(harness_exported_at(export)));
    task_event.insert(
        "payload".to_string(),
        json!({
            "exportKind": export_kind,
            "rootRef": root_ref.clone(),
            "export": export,
        }),
    );
    if export_kind == "evidence_pack" {
        task_event.insert("evidenceRef".to_string(), json!(root_ref));
    } else {
        task_event.insert("artifactRef".to_string(), json!(root_ref));
    }
    Some(Value::Object(task_event))
}

fn build_harness_export_artifact_task_event(
    export_kind: &str,
    source_key: &str,
    index: usize,
    artifact: &Value,
) -> Option<Value> {
    let artifact_ref = json_string_field(artifact, &["relativePath", "relative_path"])?;
    let label = harness_export_kind_label(export_kind);
    let mut task_event = serde_json::Map::new();
    task_event.insert(
        "id".to_string(),
        json!(format!("harness:{export_kind}:{source_key}:{index}")),
    );
    task_event.insert("eventType".to_string(), json!("artifact:created"));
    task_event.insert("status".to_string(), json!("created"));
    task_event.insert("message".to_string(), json!(format!("{label} 制品已导出")));
    task_event.insert("artifactRef".to_string(), json!(artifact_ref));
    task_event.insert(
        "payload".to_string(),
        json!({
            "exportKind": export_kind,
            "source": source_key,
            "artifact": artifact,
        }),
    );
    Some(Value::Object(task_event))
}

fn build_harness_export_completion_verified_event(
    export_kind: &str,
    export: &Value,
) -> Option<Value> {
    if export_kind != "evidence_pack" {
        return None;
    }
    let completion_audit_summary = export
        .get("completionAuditSummary")
        .or_else(|| export.get("completion_audit_summary"))?;
    let decision = json_string_field(completion_audit_summary, &["decision"])?;
    if decision != "completed" {
        return None;
    }

    let evidence_ref = harness_export_root_ref(export_kind, export);
    let mut task_event = serde_json::Map::new();
    task_event.insert(
        "id".to_string(),
        json!("harness:evidence_pack:completion_audit"),
    );
    task_event.insert("eventType".to_string(), json!("evidence:verified"));
    task_event.insert("status".to_string(), json!(decision));
    task_event.insert("message".to_string(), json!("Evidence Pack 完成审计已通过"));
    task_event.insert("occurredAt".to_string(), json!(harness_exported_at(export)));
    task_event.insert(
        "payload".to_string(),
        json!({
            "exportKind": export_kind,
            "completionAuditSummary": completion_audit_summary,
        }),
    );
    if let Some(evidence_ref) = evidence_ref {
        task_event.insert("evidenceRef".to_string(), json!(evidence_ref));
    }
    Some(Value::Object(task_event))
}

fn build_harness_export_task_events(export_kind: &str, export: &Value) -> Vec<Value> {
    let mut task_events = Vec::new();
    if let Some(task_event) = build_harness_export_root_task_event(export_kind, export) {
        task_events.push(task_event);
    }
    if let Some(artifacts) = json_array_field(export, &["artifacts"]) {
        for (index, artifact) in artifacts.iter().enumerate() {
            if let Some(task_event) =
                build_harness_export_artifact_task_event(export_kind, "artifacts", index, artifact)
            {
                task_events.push(task_event);
            }
        }
    }
    if let Some(artifacts) = json_array_field(export, &["analysisArtifacts", "analysis_artifacts"])
    {
        for (index, artifact) in artifacts.iter().enumerate() {
            if let Some(task_event) = build_harness_export_artifact_task_event(
                export_kind,
                "analysisArtifacts",
                index,
                artifact,
            ) {
                task_events.push(task_event);
            }
        }
    }
    if let Some(task_event) = build_harness_export_completion_verified_event(export_kind, export) {
        task_events.push(task_event);
    }
    task_events
}

fn build_agent_app_runtime_harness_export_projection_payload(
    detail: &SessionDetail,
    thread_read: &AgentRuntimeThreadReadModel,
    export_kind: &str,
    export: &Value,
) -> Option<Value> {
    let scope = resolve_agent_app_runtime_export_projection_scope(detail, thread_read)?;
    let task_events = build_harness_export_task_events(export_kind, export);
    if task_events.is_empty() {
        return None;
    }
    let runtime_event_name = agent_app_runtime_export_event_name(&scope);
    let status = task_events
        .first()
        .and_then(|event| event.get("status").and_then(Value::as_str))
        .unwrap_or("created")
        .to_string();

    Some(json!({
        "type": "agent_app_runtime:harnessExportProjection",
        "eventType": "task:runtimeEvent",
        "appId": scope.app_id,
        "taskId": scope.task_id,
        "traceId": scope.trace_id,
        "taskKind": scope.task_kind,
        "sessionId": detail.id.clone(),
        "threadId": detail.thread_id.clone(),
        "status": status,
        "exportKind": export_kind,
        "harnessExport": export,
        "runtimeEvent": {
            "type": "harnessExport",
            "exportKind": export_kind,
            "result": export,
        },
        "taskEvents": task_events,
        "runtimeEventName": runtime_event_name,
        "emittedAt": chrono::Utc::now().to_rfc3339(),
    }))
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn collect_runtime_tool_inventory(
    app: &AppHandle,
    state: &AsterAgentState,
    db: &DbConnection,
    api_key_provider_service: &ApiKeyProviderServiceState,
    config_manager: &GlobalConfigManagerState,
    mcp_manager: &McpManagerState,
    surface: WorkspaceToolSurface,
    caller: String,
    request_metadata: Option<serde_json::Value>,
) -> Result<crate::agent_tools::inventory::AgentToolInventorySnapshot, String> {
    let mut warnings = Vec::new();

    if state.is_initialized().await {
        match tokio::time::timeout(
            TOOL_INVENTORY_AUX_TIMEOUT,
            ensure_runtime_support_tools_registered(
                app,
                state,
                db,
                api_key_provider_service,
                mcp_manager,
            ),
        )
        .await
        {
            Ok(Ok(())) => {}
            Ok(Err(error)) => warnings.push(format!("同步 runtime support tools 失败: {error}")),
            Err(_) => warnings
                .push("同步 runtime support tools 超时，已使用当前 registry 快照".to_string()),
        }
    }

    let (mcp_server_names, mcp_tools) = {
        let manager = mcp_manager.lock().await;
        let server_names =
            match tokio::time::timeout(TOOL_INVENTORY_AUX_TIMEOUT, manager.get_running_servers())
                .await
            {
                Ok(server_names) => server_names,
                Err(_) => {
                    warnings.push("读取 MCP 服务列表超时，已跳过 MCP 服务快照".to_string());
                    Vec::new()
                }
            };
        let tools =
            match tokio::time::timeout(TOOL_INVENTORY_AUX_TIMEOUT, manager.list_tools()).await {
                Ok(Ok(tools)) => tools,
                Ok(Err(error)) => {
                    warnings.push(format!("读取 MCP 工具列表失败: {error}"));
                    Vec::new()
                }
                Err(_) => {
                    warnings.push("读取 MCP 工具列表超时，已跳过 MCP 工具快照".to_string());
                    Vec::new()
                }
            };
        (server_names, tools)
    };

    let agent_arc = state.get_agent_arc();
    let guard = match tokio::time::timeout(TOOL_INVENTORY_AUX_TIMEOUT, agent_arc.read()).await {
        Ok(guard) => guard,
        Err(_) => {
            warnings.push("读取 Aster Agent 状态超时，runtime registry 快照为空".to_string());
            return Ok(build_tool_inventory(AgentToolInventoryBuildInput {
                surface,
                caller,
                agent_initialized: false,
                warnings,
                persisted_execution_policy: Some(config_manager.config().agent.tool_execution),
                request_metadata: request_metadata.clone(),
                mcp_server_names,
                mcp_tools,
                registry_definitions: Vec::new(),
                resource_helpers_supported: false,
                current_surface_tool_names: Vec::new(),
                extension_configs: Vec::new(),
                visible_extension_tools: Vec::new(),
                searchable_extension_tools: Vec::new(),
            }));
        }
    };
    let Some(agent) = guard.as_ref() else {
        warnings.push("Aster Agent 尚未初始化，runtime registry / extension 快照为空".to_string());
        return Ok(build_tool_inventory(AgentToolInventoryBuildInput {
            surface,
            caller,
            agent_initialized: false,
            warnings,
            persisted_execution_policy: Some(config_manager.config().agent.tool_execution),
            request_metadata: request_metadata.clone(),
            mcp_server_names,
            mcp_tools,
            registry_definitions: Vec::new(),
            resource_helpers_supported: false,
            current_surface_tool_names: Vec::new(),
            extension_configs: Vec::new(),
            visible_extension_tools: Vec::new(),
            searchable_extension_tools: Vec::new(),
        }));
    };

    let registry_arc = agent.tool_registry().clone();
    let registry = match tokio::time::timeout(TOOL_INVENTORY_AUX_TIMEOUT, registry_arc.read()).await
    {
        Ok(registry) => registry,
        Err(_) => {
            warnings.push("读取 runtime registry 超时，已返回空 registry 快照".to_string());
            return Ok(build_tool_inventory(AgentToolInventoryBuildInput {
                surface,
                caller,
                agent_initialized: true,
                warnings,
                persisted_execution_policy: Some(config_manager.config().agent.tool_execution),
                request_metadata: request_metadata.clone(),
                mcp_server_names,
                mcp_tools,
                registry_definitions: Vec::new(),
                resource_helpers_supported: false,
                current_surface_tool_names: Vec::new(),
                extension_configs: Vec::new(),
                visible_extension_tools: Vec::new(),
                searchable_extension_tools: Vec::new(),
            }));
        }
    };
    let mut registry_definitions = registry.get_definitions();
    drop(registry);

    let existing_runtime_tool_names = registry_definitions
        .iter()
        .map(|definition| definition.name.clone())
        .collect::<std::collections::HashSet<_>>();
    let mut current_surface_tool_names = Vec::new();
    for definition in crate::commands::aster_agent_cmd::tool_runtime::list_current_surface_tool_definitions_from_agent(agent)
        .await
    {
        if existing_runtime_tool_names.contains(&definition.name) {
            continue;
        }

        current_surface_tool_names.push(definition.name.clone());
        registry_definitions.push(definition);
    }

    let extension_configs = agent.get_extension_configs().await;
    let extension_manager = agent.extension_manager.clone();
    let resource_helpers_supported = match tokio::time::timeout(
        TOOL_INVENTORY_AUX_TIMEOUT,
        extension_manager.supports_resources(),
    )
    .await
    {
        Ok(supported) => supported,
        Err(_) => {
            warnings.push(
                "读取 MCP resource capability 超时，resource helper 已按不可见处理".to_string(),
            );
            false
        }
    };
    let visible_extension_tools = match tokio::time::timeout(
        TOOL_INVENTORY_AUX_TIMEOUT,
        extension_manager.get_prefixed_tools(None),
    )
    .await
    {
        Ok(Ok(tools)) => tools
            .into_iter()
            .map(|tool| ExtensionToolInventorySeed {
                name: tool.name.to_string(),
                description: tool.description.clone().unwrap_or_default().to_string(),
            })
            .collect(),
        Ok(Err(error)) => {
            warnings.push(format!("读取已加载 extension tools 失败: {error}"));
            Vec::new()
        }
        Err(_) => {
            warnings.push("读取已加载 extension tools 超时，已跳过 extension 工具快照".to_string());
            Vec::new()
        }
    };
    let searchable_extension_tools = match tokio::time::timeout(
        TOOL_INVENTORY_AUX_TIMEOUT,
        extension_manager.get_prefixed_tools_for_search(None),
    )
    .await
    {
        Ok(Ok(tools)) => tools
            .into_iter()
            .map(|tool| ExtensionToolInventorySeed {
                name: tool.name.to_string(),
                description: tool.description.clone().unwrap_or_default().to_string(),
            })
            .collect(),
        Ok(Err(error)) => {
            warnings.push(format!("读取 extension 搜索工具面失败: {error}"));
            Vec::new()
        }
        Err(_) => {
            warnings.push("读取 extension 搜索工具面超时，已跳过 extension 搜索快照".to_string());
            Vec::new()
        }
    };

    Ok(build_tool_inventory(AgentToolInventoryBuildInput {
        surface,
        caller,
        agent_initialized: true,
        warnings,
        persisted_execution_policy: Some(config_manager.config().agent.tool_execution),
        request_metadata,
        mcp_server_names,
        mcp_tools,
        registry_definitions,
        resource_helpers_supported,
        current_surface_tool_names,
        extension_configs,
        visible_extension_tools,
        searchable_extension_tools,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn detail_with_turn_status(status: AgentThreadTurnStatus) -> lime_agent::SessionDetail {
        lime_agent::SessionDetail {
            id: "session-runtime-queue".to_string(),
            name: "队列快路径判定".to_string(),
            created_at: 0,
            updated_at: 0,
            thread_id: "session-runtime-queue".to_string(),
            model: Some("agent:test".to_string()),
            working_dir: None,
            workspace_id: None,
            messages: Vec::new(),
            execution_strategy: Some("react".to_string()),
            execution_runtime: None,
            turns: vec![lime_core::database::dao::agent_timeline::AgentThreadTurn {
                id: "turn-runtime-queue".to_string(),
                thread_id: "session-runtime-queue".to_string(),
                prompt_text: "测试".to_string(),
                status,
                started_at: "2026-03-18T08:00:00Z".to_string(),
                completed_at: None,
                error_message: None,
                created_at: "2026-03-18T08:00:00Z".to_string(),
                updated_at: "2026-03-18T08:00:00Z".to_string(),
            }],
            items: Vec::new(),
            todo_items: Vec::new(),
            child_subagent_sessions: Vec::new(),
            subagent_parent_context: None,
        }
    }

    fn thread_read_for_harness_projection(runtime_summary: Value) -> AgentRuntimeThreadReadModel {
        AgentRuntimeThreadReadModel {
            thread_id: "thread-agent-app".to_string(),
            status: "completed".to_string(),
            profile_status: "completed".to_string(),
            active_turn_id: None,
            turns: Vec::new(),
            pending_requests: Vec::new(),
            last_outcome: None,
            incidents: Vec::new(),
            queued_turns: Vec::new(),
            tool_calls: Vec::new(),
            artifacts: Vec::new(),
            model_routing: None,
            evidence_summary: Default::default(),
            telemetry_summary: Default::default(),
            context_summary: None,
            interrupt_state: None,
            updated_at: None,
            latest_compaction_boundary: None,
            file_checkpoint_summary: None,
            diagnostics: None,
            task_kind: None,
            service_model_slot: None,
            routing_mode: None,
            decision_source: None,
            decision_reason: None,
            candidate_count: None,
            fallback_chain: None,
            capability_gap: None,
            estimated_cost_class: None,
            single_candidate_only: None,
            oem_policy: None,
            runtime_summary: Some(runtime_summary),
            auxiliary_task_runtime: None,
            limit_state: None,
            cost_state: None,
            permission_state: None,
            limit_event: None,
            managed_objective: None,
        }
    }

    #[test]
    fn agent_app_runtime_export_projection_extracts_scope_from_runtime_summary() {
        let scope = agent_app_runtime_export_scope_from_runtime_summary_value(Some(&json!({
            "surface": "agent_app",
            "appId": "content-factory-app",
            "taskId": "task-1",
            "traceId": "trace-1",
            "taskKind": "content_factory.copy.generate"
        })))
        .expect("agent app scope");

        assert_eq!(scope.app_id, "content-factory-app");
        assert_eq!(scope.task_id, "task-1");
        assert_eq!(scope.trace_id.as_deref(), Some("trace-1"));
        assert_eq!(
            scope.task_kind.as_deref(),
            Some("content_factory.copy.generate")
        );
        assert!(
            agent_app_runtime_export_scope_from_runtime_summary_value(Some(&json!({
                "surface": "chat",
                "appId": "content-factory-app",
                "taskId": "task-1"
            })))
            .is_none()
        );
    }

    #[test]
    fn agent_app_runtime_harness_export_projection_builds_evidence_task_events() {
        let detail = detail_with_turn_status(AgentThreadTurnStatus::Completed);
        let thread_read = thread_read_for_harness_projection(json!({
            "surface": "agent_app",
            "appId": "content-factory-app",
            "taskId": "task-1",
            "traceId": "trace-1",
            "taskKind": "content_factory.copy.generate"
        }));
        let export = json!({
            "sessionId": detail.id.clone(),
            "threadId": detail.thread_id.clone(),
            "packRelativeRoot": ".lime/harness/sessions/session-runtime-queue/evidence",
            "exportedAt": "2026-05-16T00:00:00Z",
            "completionAuditSummary": {
                "source": "runtime_evidence_pack_completion_audit",
                "decision": "completed"
            },
            "artifacts": [
                {
                    "kind": "summary",
                    "title": "Evidence summary",
                    "relativePath": ".lime/harness/sessions/session-runtime-queue/evidence/summary.md"
                }
            ]
        });

        let payload = build_agent_app_runtime_harness_export_projection_payload(
            &detail,
            &thread_read,
            "evidence_pack",
            &export,
        )
        .expect("projection payload");
        let task_events = payload
            .get("taskEvents")
            .and_then(Value::as_array)
            .expect("task events");

        assert_eq!(
            payload.get("type"),
            Some(&json!("agent_app_runtime:harnessExportProjection"))
        );
        assert_eq!(
            payload.get("runtimeEventName"),
            Some(&json!("agent_app_runtime:content-factory-app:task-1"))
        );
        assert!(task_events
            .iter()
            .any(|event| event.get("eventType") == Some(&json!("evidence:recorded"))));
        assert!(task_events
            .iter()
            .any(|event| event.get("eventType") == Some(&json!("artifact:created"))));
        assert!(task_events
            .iter()
            .any(|event| event.get("eventType") == Some(&json!("evidence:verified"))));
    }

    #[test]
    fn agent_app_runtime_harness_export_projection_builds_review_artifact_events() {
        let detail = detail_with_turn_status(AgentThreadTurnStatus::Completed);
        let thread_read = thread_read_for_harness_projection(json!({
            "surface": "agent_app",
            "appId": "content-factory-app",
            "taskId": "task-review"
        }));
        let export = json!({
            "sessionId": detail.id.clone(),
            "threadId": detail.thread_id.clone(),
            "reviewRelativeRoot": ".lime/harness/sessions/session-runtime-queue/review",
            "exportedAt": "2026-05-16T00:00:00Z",
            "analysisArtifacts": [
                {
                    "kind": "analysis_brief",
                    "title": "Analysis brief",
                    "relativePath": ".lime/harness/sessions/session-runtime-queue/analysis/analysis-brief.md"
                }
            ],
            "artifacts": [
                {
                    "kind": "review_decision_markdown",
                    "title": "Review decision",
                    "relativePath": ".lime/harness/sessions/session-runtime-queue/review/review-decision.md"
                }
            ]
        });

        let payload = build_agent_app_runtime_harness_export_projection_payload(
            &detail,
            &thread_read,
            "review_decision",
            &export,
        )
        .expect("review projection payload");
        let task_events = payload
            .get("taskEvents")
            .and_then(Value::as_array)
            .expect("task events");

        assert_eq!(
            task_events
                .first()
                .and_then(|event| event.get("eventType"))
                .and_then(Value::as_str),
            Some("artifact:created")
        );
        assert_eq!(
            task_events
                .iter()
                .filter(|event| event.get("eventType") == Some(&json!("artifact:created")))
                .count(),
            3
        );
    }

    #[test]
    fn latest_model_delta_timing_from_run_should_project_agent_run_metadata() {
        let run = AgentRun {
            id: "run-ttft-1".to_string(),
            source: "chat".to_string(),
            source_ref: Some("turn-1".to_string()),
            session_id: Some("session-ttft".to_string()),
            status: lime_core::database::dao::agent_run::AgentRunStatus::Success,
            started_at: "2026-05-12T02:48:34Z".to_string(),
            finished_at: Some("2026-05-12T02:48:36Z".to_string()),
            duration_ms: Some(1386),
            error_code: None,
            error_message: None,
            metadata: Some(
                json!({
                    "model_first_visible_delta_ms": 986,
                    "model_first_thinking_delta_ms": 986,
                    "model_first_text_delta_ms": 1377,
                    "turn_state": {
                        "execution_profile": "full_runtime",
                        "requested_execution_strategy": "react",
                        "effective_execution_strategy": "react"
                    },
                    "request_metadata": {
                        "lime_runtime": {
                            "routing_decision": {
                                "decisionSource": "responsive_chat_auto",
                                "decisionReason": "service_models.responsive_chat 历史样本不满足低延迟目标，已继续进入自动 responsive_chat 候选。",
                                "fallbackChain": ["deepseek:deepseek-v4-pro", "deepseek:deepseek-v4-flash"],
                                "settingsSource": "service_models.responsive_chat:auto",
                                "serviceModelSlot": "responsive_chat",
                                "selectedProvider": "deepseek",
                                "selectedModel": "deepseek-v4-flash"
                            }
                        }
                    }
                })
                .to_string(),
            ),
            created_at: "2026-05-12T02:48:34Z".to_string(),
            updated_at: "2026-05-12T02:48:36Z".to_string(),
        };

        let timing = latest_model_delta_timing_from_run(&run).expect("应投影首字证据");

        assert_eq!(timing["source"], "agent_runs.metadata");
        assert_eq!(timing["runId"], "run-ttft-1");
        assert_eq!(timing["firstTextDeltaMs"], 1377);
        assert_eq!(timing["executionProfile"], "full_runtime");
        assert_eq!(timing["requestedExecutionStrategy"], "react");
        assert_eq!(timing["effectiveExecutionStrategy"], "react");
        assert_eq!(timing["routing"]["decisionSource"], "responsive_chat_auto");
        assert_eq!(
            timing["routing"]["decisionReason"],
            "service_models.responsive_chat 历史样本不满足低延迟目标，已继续进入自动 responsive_chat 候选。"
        );
        assert_eq!(
            timing["routing"]["fallbackChain"],
            json!(["deepseek:deepseek-v4-pro", "deepseek:deepseek-v4-flash"])
        );
        assert_eq!(timing["routing"]["serviceModelSlot"], "responsive_chat");
        assert_eq!(timing["routing"]["selectedModel"], "deepseek-v4-flash");
    }

    #[test]
    fn merge_latest_model_delta_timing_should_keep_existing_model_routing() {
        let mut thread_read = AgentRuntimeThreadReadModel {
            thread_id: "thread-ttft".to_string(),
            status: "completed".to_string(),
            profile_status: "completed".to_string(),
            active_turn_id: None,
            turns: Vec::new(),
            pending_requests: Vec::new(),
            last_outcome: None,
            incidents: Vec::new(),
            queued_turns: Vec::new(),
            tool_calls: Vec::new(),
            artifacts: Vec::new(),
            model_routing: Some(json!({
                "decisionSource": "responsive_chat_auto",
                "selectedModel": "deepseek-v4-flash"
            })),
            evidence_summary: Default::default(),
            telemetry_summary: Default::default(),
            context_summary: None,
            interrupt_state: None,
            updated_at: None,
            latest_compaction_boundary: None,
            file_checkpoint_summary: None,
            diagnostics: None,
            task_kind: None,
            service_model_slot: None,
            routing_mode: None,
            decision_source: None,
            decision_reason: None,
            candidate_count: None,
            fallback_chain: None,
            capability_gap: None,
            estimated_cost_class: None,
            single_candidate_only: None,
            oem_policy: None,
            runtime_summary: None,
            auxiliary_task_runtime: None,
            limit_state: None,
            cost_state: None,
            permission_state: None,
            limit_event: None,
            managed_objective: None,
        };

        merge_latest_model_delta_timing_into_thread_read(
            &mut thread_read,
            json!({
                "source": "agent_runs.metadata",
                "firstTextDeltaMs": 1244
            }),
        );

        let model_routing = thread_read
            .model_routing
            .as_ref()
            .and_then(Value::as_object)
            .expect("应保留 model_routing");
        assert_eq!(model_routing["decisionSource"], "responsive_chat_auto");
        assert_eq!(model_routing["selectedModel"], "deepseek-v4-flash");
        assert_eq!(
            model_routing["latestModelDeltaTiming"]["firstTextDeltaMs"],
            1244
        );
    }
}
