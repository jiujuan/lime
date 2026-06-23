use super::new_id;
use super::RuntimeCore;
use super::RuntimeCoreError;
use super::RuntimeEvent;
use app_server_protocol::WorkspaceRightSurfacePendingConsumeParams;
use app_server_protocol::WorkspaceRightSurfacePendingConsumeResponse;
use app_server_protocol::WorkspaceRightSurfacePendingDismissParams;
use app_server_protocol::WorkspaceRightSurfacePendingDismissResponse;
use app_server_protocol::WorkspaceRightSurfacePendingListParams;
use app_server_protocol::WorkspaceRightSurfacePendingListResponse;
use app_server_protocol::WorkspaceRightSurfacePendingRequest;
use app_server_protocol::WorkspaceRightSurfaceRequestParams;
use app_server_protocol::WorkspaceRightSurfaceRequestResponse;
use chrono::Duration;
use chrono::SecondsFormat;
use chrono::Utc;
use serde_json::json;
use serde_json::Value;
use std::collections::HashSet;

const DEFAULT_PRIORITY: &str = "normal";
const OBJECT_CANVAS_PERSIST_EVENT_KIND: &str = "persistRequested";
const OBJECT_CANVAS_PERSIST_EVENT_OWNER: &str = "appServer";
const OBJECT_CANVAS_REPLAY_EVENT_KIND: &str = "replayRequested";
const OBJECT_CANVAS_REPLAY_EVENT_OWNER: &str = "runtime";
const OBJECT_CANVAS_REPLAY_DRY_RUN_EVENT_TYPE: &str = "object_canvas.replay.dry_run";
const OBJECT_CANVAS_SNAPSHOT_PREFIX: &str = "object_canvas_snapshot";
const REPLAY_EXECUTION_BLOCKER: &str = "runtime_replay_execution_not_implemented";
const REPLAY_STATUS_METADATA_INCOMPLETE: &str = "metadataIncomplete";
const REPLAY_STATUS_METADATA_READY: &str = "metadataReady";
const SURFACE_OBJECT_CANVAS: &str = "objectCanvas";
const STATUS_CONSUMED: &str = "consumed";
const STATUS_DISMISSED: &str = "dismissed";
const STATUS_PENDING: &str = "pending";

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorkspaceObjectCanvasReplayReadinessListParams {
    pub workspace_id: Option<String>,
    pub workspace_root: Option<String>,
    pub session_id: Option<String>,
    pub board_id: Option<String>,
    pub limit: Option<u64>,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct WorkspaceObjectCanvasReplayReadiness {
    pub request_id: String,
    pub workspace_id: Option<String>,
    pub workspace_root: Option<String>,
    pub session_id: Option<String>,
    pub candidate_id: Option<String>,
    pub board_id: Option<String>,
    pub revision: Option<u64>,
    pub object_id: Option<String>,
    pub object_kind: Option<String>,
    pub replay_target: Option<String>,
    pub source: Option<Value>,
    pub facts: Option<Value>,
    pub board_snapshot: Option<Value>,
    pub requested_at: String,
    pub status: String,
    pub missing_fields: Vec<String>,
    pub metadata_ready: bool,
    pub execution_enabled: bool,
    pub execution_blocker: Option<String>,
}

impl RuntimeCore {
    pub async fn request_workspace_right_surface(
        &self,
        params: WorkspaceRightSurfaceRequestParams,
    ) -> Result<WorkspaceRightSurfaceRequestResponse, RuntimeCoreError> {
        let surface_kind = required_string(
            params.surface_kind,
            "surfaceKind is required for workspaceRightSurface/request",
        )?;
        let origin = required_string(
            params.origin,
            "origin is required for workspaceRightSurface/request",
        )?;
        let priority = optional_trimmed(params.priority).unwrap_or_else(|| DEFAULT_PRIORITY.into());
        let now = Utc::now();
        let requested_at = now.to_rfc3339_opts(SecondsFormat::Millis, true);
        let expires_at = params.ttl_ms.and_then(|ttl_ms| {
            Duration::try_milliseconds(ttl_ms as i64)
                .map(|duration| (now + duration).to_rfc3339_opts(SecondsFormat::Millis, true))
        });
        let pending = WorkspaceRightSurfacePendingRequest {
            request_id: new_id("right_surface"),
            workspace_id: optional_trimmed(params.workspace_id),
            workspace_root: optional_trimmed(params.workspace_root),
            session_id: optional_trimmed(params.session_id),
            surface_kind,
            origin,
            reason: optional_trimmed(params.reason),
            priority,
            candidate_id: optional_trimmed(params.candidate_id),
            ttl_ms: params.ttl_ms,
            metadata: params.metadata,
            requested_at,
            expires_at,
            status: STATUS_PENDING.to_string(),
        };
        if let Some(snapshot) = object_canvas_snapshot_from_pending(&pending) {
            self.app_data_source
                .save_workspace_object_canvas_snapshot(snapshot)
                .await?;
        }
        self.app_data_source
            .save_workspace_right_surface_pending(pending.clone())
            .await?;
        let mut state = self.state.lock().map_err(|_| {
            RuntimeCoreError::Backend(
                "failed to lock runtime state for workspaceRightSurface/request".to_string(),
            )
        })?;
        prune_expired_pending(&mut state.right_surface_pending);
        state.right_surface_pending.push(pending.clone());
        Ok(WorkspaceRightSurfaceRequestResponse {
            status: STATUS_PENDING.to_string(),
            request_id: pending.request_id.clone(),
            pending,
        })
    }

    pub async fn list_workspace_right_surface_pending(
        &self,
        params: WorkspaceRightSurfacePendingListParams,
    ) -> Result<WorkspaceRightSurfacePendingListResponse, RuntimeCoreError> {
        let normalized_params = normalize_pending_list_params(params);
        let persistence_enabled = self
            .app_data_source
            .workspace_right_surface_pending_persistence_enabled();
        let persisted_pending = if persistence_enabled {
            let mut persistence_params = normalized_params.clone();
            persistence_params.limit = None;
            self.app_data_source
                .list_workspace_right_surface_pending(persistence_params)
                .await?
        } else {
            Vec::new()
        };
        let mut state = self.state.lock().map_err(|_| {
            RuntimeCoreError::Backend(
                "failed to lock runtime state for workspaceRightSurface/pending/list".to_string(),
            )
        })?;
        prune_expired_pending(&mut state.right_surface_pending);

        if persistence_enabled {
            let persisted_ids = persisted_pending
                .iter()
                .map(|request| request.request_id.as_str())
                .collect::<HashSet<_>>();
            state.right_surface_pending.retain(|request| {
                !pending_matches_params(&normalized_params, request)
                    || persisted_ids.contains(request.request_id.as_str())
            });
        }

        let mut pending = state
            .right_surface_pending
            .iter()
            .filter(|request| pending_matches_params(&normalized_params, request))
            .cloned()
            .collect::<Vec<_>>();
        merge_pending_requests(&mut pending, persisted_pending);
        if let Some(limit) = normalized_params.limit.map(|value| value as usize) {
            pending.truncate(limit);
        }
        Ok(WorkspaceRightSurfacePendingListResponse { pending })
    }

    pub async fn consume_workspace_right_surface_pending(
        &self,
        params: WorkspaceRightSurfacePendingConsumeParams,
    ) -> Result<WorkspaceRightSurfacePendingConsumeResponse, RuntimeCoreError> {
        let request_ids = normalize_pending_request_ids(
            params.request_id,
            params.request_ids,
            "requestId is required for workspaceRightSurface/pending/consume",
        )?;
        let persisted_request_ids = self
            .app_data_source
            .delete_workspace_right_surface_pending(request_ids.clone())
            .await?;
        let mut state = self.state.lock().map_err(|_| {
            RuntimeCoreError::Backend(
                "failed to lock runtime state for workspaceRightSurface/pending/consume"
                    .to_string(),
            )
        })?;
        prune_expired_pending(&mut state.right_surface_pending);

        let memory_request_ids =
            remove_pending_requests(&mut state.right_surface_pending, &request_ids);
        let consumed_request_ids = merge_request_ids(memory_request_ids, persisted_request_ids);
        let missing_request_ids = missing_request_ids(&request_ids, &consumed_request_ids);

        Ok(WorkspaceRightSurfacePendingConsumeResponse {
            status: STATUS_CONSUMED.to_string(),
            consumed_request_ids,
            missing_request_ids,
        })
    }

    pub async fn dismiss_workspace_right_surface_pending(
        &self,
        params: WorkspaceRightSurfacePendingDismissParams,
    ) -> Result<WorkspaceRightSurfacePendingDismissResponse, RuntimeCoreError> {
        let request_ids = normalize_pending_request_ids(
            params.request_id,
            params.request_ids,
            "requestId is required for workspaceRightSurface/pending/dismiss",
        )?;
        let persisted_request_ids = self
            .app_data_source
            .delete_workspace_right_surface_pending(request_ids.clone())
            .await?;
        let mut state = self.state.lock().map_err(|_| {
            RuntimeCoreError::Backend(
                "failed to lock runtime state for workspaceRightSurface/pending/dismiss"
                    .to_string(),
            )
        })?;
        prune_expired_pending(&mut state.right_surface_pending);

        let memory_request_ids =
            remove_pending_requests(&mut state.right_surface_pending, &request_ids);
        let dismissed_request_ids = merge_request_ids(memory_request_ids, persisted_request_ids);
        let missing_request_ids = missing_request_ids(&request_ids, &dismissed_request_ids);

        Ok(WorkspaceRightSurfacePendingDismissResponse {
            status: STATUS_DISMISSED.to_string(),
            dismissed_request_ids,
            missing_request_ids,
        })
    }

    pub async fn list_workspace_object_canvas_replay_readiness(
        &self,
        params: WorkspaceObjectCanvasReplayReadinessListParams,
    ) -> Result<Vec<WorkspaceObjectCanvasReplayReadiness>, RuntimeCoreError> {
        let board_id = optional_trimmed(params.board_id);
        let mut pending = self
            .list_workspace_right_surface_pending(WorkspaceRightSurfacePendingListParams {
                workspace_id: optional_trimmed(params.workspace_id),
                workspace_root: optional_trimmed(params.workspace_root),
                session_id: optional_trimmed(params.session_id),
                surface_kind: Some(SURFACE_OBJECT_CANVAS.to_string()),
                limit: None,
            })
            .await?
            .pending
            .into_iter()
            .filter_map(|request| object_canvas_replay_readiness_from_pending(&request))
            .filter(|readiness| optional_filter_matches(&board_id, readiness.board_id.as_deref()))
            .collect::<Vec<_>>();
        if let Some(limit) = params.limit.map(|value| value as usize) {
            pending.truncate(limit);
        }
        Ok(pending)
    }

    pub async fn dry_run_workspace_object_canvas_replay(
        &self,
        params: WorkspaceObjectCanvasReplayReadinessListParams,
    ) -> Result<Vec<RuntimeEvent>, RuntimeCoreError> {
        let readiness = self
            .list_workspace_object_canvas_replay_readiness(params)
            .await?;
        Ok(readiness
            .iter()
            .map(object_canvas_replay_dry_run_event_from_readiness)
            .collect())
    }
}

fn required_string(value: String, message: &str) -> Result<String, RuntimeCoreError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(RuntimeCoreError::Backend(message.to_string()))
    } else {
        Ok(trimmed.to_string())
    }
}

fn optional_trimmed(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn optional_filter_matches(filter: &Option<String>, value: Option<&str>) -> bool {
    filter
        .as_ref()
        .is_none_or(|filter| value == Some(filter.as_str()))
}

fn normalize_pending_list_params(
    params: WorkspaceRightSurfacePendingListParams,
) -> WorkspaceRightSurfacePendingListParams {
    WorkspaceRightSurfacePendingListParams {
        workspace_id: optional_trimmed(params.workspace_id),
        workspace_root: optional_trimmed(params.workspace_root),
        session_id: optional_trimmed(params.session_id),
        surface_kind: optional_trimmed(params.surface_kind),
        limit: params.limit,
    }
}

fn pending_matches_params(
    params: &WorkspaceRightSurfacePendingListParams,
    request: &WorkspaceRightSurfacePendingRequest,
) -> bool {
    optional_filter_matches(&params.workspace_id, request.workspace_id.as_deref())
        && optional_filter_matches(&params.workspace_root, request.workspace_root.as_deref())
        && optional_filter_matches(&params.session_id, request.session_id.as_deref())
        && params
            .surface_kind
            .as_ref()
            .is_none_or(|value| request.surface_kind == *value)
}

fn normalize_pending_request_ids(
    request_id: Option<String>,
    request_ids: Vec<String>,
    empty_message: &str,
) -> Result<Vec<String>, RuntimeCoreError> {
    let mut normalized_request_ids = Vec::new();
    if let Some(request_id) = optional_trimmed(request_id) {
        normalized_request_ids.push(request_id);
    }
    normalized_request_ids.extend(
        request_ids
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
    );
    normalized_request_ids.sort();
    normalized_request_ids.dedup();

    if normalized_request_ids.is_empty() {
        Err(RuntimeCoreError::Backend(empty_message.to_string()))
    } else {
        Ok(normalized_request_ids)
    }
}

fn remove_pending_requests(
    pending: &mut Vec<WorkspaceRightSurfacePendingRequest>,
    request_ids: &[String],
) -> Vec<String> {
    let mut removed_request_ids = Vec::new();
    pending.retain(|request| {
        if request_ids.contains(&request.request_id) {
            removed_request_ids.push(request.request_id.clone());
            false
        } else {
            true
        }
    });

    removed_request_ids
}

fn merge_pending_requests(
    pending: &mut Vec<WorkspaceRightSurfacePendingRequest>,
    persisted_pending: Vec<WorkspaceRightSurfacePendingRequest>,
) {
    let mut seen_request_ids = pending
        .iter()
        .map(|request| request.request_id.clone())
        .collect::<HashSet<_>>();
    for request in persisted_pending {
        if seen_request_ids.insert(request.request_id.clone()) {
            pending.push(request);
        }
    }
}

fn merge_request_ids(mut primary: Vec<String>, secondary: Vec<String>) -> Vec<String> {
    for request_id in secondary {
        if !primary.contains(&request_id) {
            primary.push(request_id);
        }
    }
    primary
}

fn missing_request_ids(request_ids: &[String], removed_request_ids: &[String]) -> Vec<String> {
    request_ids
        .iter()
        .filter(|request_id| !removed_request_ids.contains(request_id))
        .cloned()
        .collect()
}

fn prune_expired_pending(pending: &mut Vec<WorkspaceRightSurfacePendingRequest>) {
    let now = Utc::now();
    pending.retain(|request| {
        request
            .expires_at
            .as_deref()
            .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
            .is_none_or(|expires_at| expires_at.with_timezone(&Utc) > now)
    });
}

fn object_canvas_snapshot_from_pending(
    request: &WorkspaceRightSurfacePendingRequest,
) -> Option<super::WorkspaceObjectCanvasSnapshot> {
    if request.surface_kind != SURFACE_OBJECT_CANVAS {
        return None;
    }

    let metadata = request.metadata.as_ref()?;
    let event = metadata.pointer("/objectCanvas/event")?;
    if string_field(event, "kind").as_deref() != Some(OBJECT_CANVAS_PERSIST_EVENT_KIND)
        || string_field(event, "owner").as_deref() != Some(OBJECT_CANVAS_PERSIST_EVENT_OWNER)
    {
        return None;
    }

    let event_request = event.get("request")?;
    let board_id = string_field(event_request, "boardId")?;
    let revision = u64_field(event_request, "revision")?;
    let persistence_key = string_field(event_request, "persistenceKey")?;
    let candidate_id = optional_string_field(metadata, "candidateId")
        .or_else(|| request.candidate_id.clone())
        .filter(|value| !value.trim().is_empty());
    let object_id = optional_string_field(event_request, "objectId");
    let object_kind = optional_string_field(event_request, "objectKind");

    Some(super::WorkspaceObjectCanvasSnapshot {
        snapshot_id: format!("{OBJECT_CANVAS_SNAPSHOT_PREFIX}:{}", request.request_id),
        request_id: request.request_id.clone(),
        workspace_id: request.workspace_id.clone(),
        workspace_root: request.workspace_root.clone(),
        session_id: request.session_id.clone(),
        board_id,
        revision,
        persistence_key,
        candidate_id,
        object_id,
        object_kind,
        snapshot_json: json!({
            "source": "workspaceRightSurface/request",
            "metadata": metadata.clone(),
            "pendingRequest": {
                "requestId": request.request_id.clone(),
                "surfaceKind": request.surface_kind.clone(),
                "origin": request.origin.clone(),
                "reason": request.reason.clone(),
                "requestedAt": request.requested_at.clone(),
            },
        }),
        created_at: request.requested_at.clone(),
    })
}

fn object_canvas_replay_readiness_from_pending(
    request: &WorkspaceRightSurfacePendingRequest,
) -> Option<WorkspaceObjectCanvasReplayReadiness> {
    if request.surface_kind != SURFACE_OBJECT_CANVAS {
        return None;
    }

    let metadata = request.metadata.as_ref()?;
    let event = metadata.pointer("/objectCanvas/event")?;
    if string_field(event, "kind").as_deref() != Some(OBJECT_CANVAS_REPLAY_EVENT_KIND)
        || string_field(event, "owner").as_deref() != Some(OBJECT_CANVAS_REPLAY_EVENT_OWNER)
    {
        return None;
    }

    let event_request = event.get("request").unwrap_or(&Value::Null);
    let board_id = optional_string_field(event_request, "boardId");
    let revision = u64_field(event_request, "revision");
    let object_id = optional_string_field(event_request, "objectId");
    let object_kind = optional_string_field(event_request, "objectKind");
    let replay_target = optional_string_field(event_request, "replayTarget");
    let source = optional_value_field(event_request, "source");
    let facts = optional_value_field(event_request, "facts");
    let board_snapshot = metadata.pointer("/objectCanvas/snapshot").cloned();

    let mut missing_fields = Vec::new();
    if board_id.is_none() {
        missing_fields.push("boardId".to_string());
    }
    if revision.is_none() {
        missing_fields.push("revision".to_string());
    }
    if object_id.is_none() {
        missing_fields.push("objectId".to_string());
    }
    if replay_target.is_none() {
        missing_fields.push("replayTarget".to_string());
    }
    if board_snapshot.is_none() {
        missing_fields.push("objectCanvas.snapshot".to_string());
    }
    let metadata_ready = missing_fields.is_empty();

    Some(WorkspaceObjectCanvasReplayReadiness {
        request_id: request.request_id.clone(),
        workspace_id: request.workspace_id.clone(),
        workspace_root: request.workspace_root.clone(),
        session_id: request.session_id.clone(),
        candidate_id: optional_string_field(metadata, "candidateId")
            .or_else(|| request.candidate_id.clone())
            .filter(|value| !value.trim().is_empty()),
        board_id,
        revision,
        object_id,
        object_kind,
        replay_target,
        source,
        facts,
        board_snapshot,
        requested_at: request.requested_at.clone(),
        status: if metadata_ready {
            REPLAY_STATUS_METADATA_READY
        } else {
            REPLAY_STATUS_METADATA_INCOMPLETE
        }
        .to_string(),
        missing_fields,
        metadata_ready,
        execution_enabled: false,
        execution_blocker: Some(REPLAY_EXECUTION_BLOCKER.to_string()),
    })
}

fn object_canvas_replay_dry_run_event_from_readiness(
    readiness: &WorkspaceObjectCanvasReplayReadiness,
) -> RuntimeEvent {
    let mut blocking_reasons = readiness.missing_fields.clone();
    if let Some(blocker) = readiness.execution_blocker.as_ref() {
        if !blocking_reasons.contains(blocker) {
            blocking_reasons.push(blocker.clone());
        }
    }

    RuntimeEvent::new(
        OBJECT_CANVAS_REPLAY_DRY_RUN_EVENT_TYPE,
        json!({
            "schemaVersion": "object-canvas.replay.dry-run.v1",
            "source": "workspaceRightSurface/request",
            "requestId": readiness.request_id,
            "workspaceId": readiness.workspace_id,
            "workspaceRoot": readiness.workspace_root,
            "sessionId": readiness.session_id,
            "candidateId": readiness.candidate_id,
            "boardId": readiness.board_id,
            "revision": readiness.revision,
            "objectId": readiness.object_id,
            "objectKind": readiness.object_kind,
            "replayTarget": readiness.replay_target,
            "requestedAt": readiness.requested_at,
            "metadata": {
                "status": readiness.status,
                "ready": readiness.metadata_ready,
                "missingFields": readiness.missing_fields,
            },
            "execution": {
                "dryRun": true,
                "enabled": readiness.execution_enabled,
                "blocker": readiness.execution_blocker,
                "wouldExecute": readiness.metadata_ready && readiness.execution_enabled,
            },
            "audit": {
                "decision": "blocked",
                "blockingReasons": blocking_reasons,
            },
            "replay": {
                "target": readiness.replay_target,
                "source": readiness.source,
                "facts": readiness.facts,
                "boardSnapshot": readiness.board_snapshot,
            },
        }),
    )
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn optional_string_field(value: &Value, key: &str) -> Option<String> {
    string_field(value, key)
}

fn optional_value_field(value: &Value, key: &str) -> Option<Value> {
    value.get(key).filter(|value| !value.is_null()).cloned()
}

fn u64_field(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(|value| {
        value
            .as_u64()
            .or_else(|| value.as_i64().and_then(|value| u64::try_from(value).ok()))
    })
}
