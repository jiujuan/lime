use super::support::*;
use super::*;
use std::sync::Arc;

#[tokio::test]
async fn workspace_right_surface_request_registers_pending_intent() {
    let core = RuntimeCore::default();

    let response = core
        .request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
            workspace_id: Some(" workspace-main ".to_string()),
            workspace_root: Some(" /workspace/project ".to_string()),
            session_id: Some(" sess-main ".to_string()),
            surface_kind: " objectCanvas ".to_string(),
            origin: " skill:mcp-browser ".to_string(),
            reason: Some(" Browser candidate ".to_string()),
            priority: None,
            candidate_id: Some(" candidate-1 ".to_string()),
            ttl_ms: Some(60_000),
            metadata: Some(json!({ "source": "browser-assist" })),
        })
        .await
        .expect("right surface request");

    assert_eq!(response.status, "pending");
    assert_eq!(response.pending.request_id, response.request_id);
    assert_eq!(
        response.pending.workspace_id.as_deref(),
        Some("workspace-main")
    );
    assert_eq!(
        response.pending.workspace_root.as_deref(),
        Some("/workspace/project")
    );
    assert_eq!(response.pending.session_id.as_deref(), Some("sess-main"));
    assert_eq!(response.pending.surface_kind, "objectCanvas");
    assert_eq!(response.pending.origin, "skill:mcp-browser");
    assert_eq!(response.pending.priority, "normal");
    assert_eq!(
        response.pending.candidate_id.as_deref(),
        Some("candidate-1")
    );
    assert!(response.pending.expires_at.is_some());

    let pending = core
        .list_workspace_right_surface_pending(WorkspaceRightSurfacePendingListParams {
            workspace_id: Some("workspace-main".to_string()),
            workspace_root: Some("/workspace/project".to_string()),
            session_id: Some("sess-main".to_string()),
            surface_kind: Some("objectCanvas".to_string()),
            limit: None,
        })
        .await
        .expect("pending list");

    assert_eq!(pending.pending, vec![response.pending]);
}

#[tokio::test]
async fn workspace_right_surface_pending_list_filters_and_limits_requests() {
    let core = RuntimeCore::default();
    for (workspace_id, surface_kind, priority) in [
        ("workspace-a", "files", "normal"),
        ("workspace-a", "objectCanvas", "high"),
        ("workspace-b", "objectCanvas", "normal"),
    ] {
        core.request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
            workspace_id: Some(workspace_id.to_string()),
            workspace_root: Some(format!("/repo/{workspace_id}")),
            session_id: Some("sess-filter".to_string()),
            surface_kind: surface_kind.to_string(),
            origin: "agent".to_string(),
            reason: None,
            priority: Some(priority.to_string()),
            candidate_id: None,
            ttl_ms: None,
            metadata: None,
        })
        .await
        .expect("right surface request");
    }

    let pending = core
        .list_workspace_right_surface_pending(WorkspaceRightSurfacePendingListParams {
            workspace_id: Some("workspace-a".to_string()),
            workspace_root: None,
            session_id: Some("sess-filter".to_string()),
            surface_kind: Some("objectCanvas".to_string()),
            limit: Some(1),
        })
        .await
        .expect("filtered pending");

    assert_eq!(pending.pending.len(), 1);
    assert_eq!(
        pending.pending[0].workspace_id.as_deref(),
        Some("workspace-a")
    );
    assert_eq!(pending.pending[0].surface_kind, "objectCanvas");
    assert_eq!(pending.pending[0].priority, "high");
}

#[tokio::test]
async fn workspace_right_surface_pending_list_prunes_expired_requests() {
    let core = RuntimeCore::default();
    core.request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
        workspace_id: Some("workspace-expired".to_string()),
        workspace_root: None,
        session_id: None,
        surface_kind: "files".to_string(),
        origin: "agent".to_string(),
        reason: None,
        priority: None,
        candidate_id: None,
        ttl_ms: Some(0),
        metadata: None,
    })
    .await
    .expect("expired right surface request");

    let pending = core
        .list_workspace_right_surface_pending(WorkspaceRightSurfacePendingListParams {
            workspace_id: Some("workspace-expired".to_string()),
            workspace_root: None,
            session_id: None,
            surface_kind: None,
            limit: None,
        })
        .await
        .expect("pending list");

    assert!(pending.pending.is_empty());
}

#[tokio::test]
async fn workspace_right_surface_pending_consume_removes_registered_request() {
    let core = RuntimeCore::default();
    let response = core
        .request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
            workspace_id: Some("workspace-consume".to_string()),
            workspace_root: None,
            session_id: None,
            surface_kind: "files".to_string(),
            origin: "agent".to_string(),
            reason: None,
            priority: None,
            candidate_id: None,
            ttl_ms: None,
            metadata: None,
        })
        .await
        .expect("right surface request");

    let consumed = core
        .consume_workspace_right_surface_pending(WorkspaceRightSurfacePendingConsumeParams {
            request_id: Some(format!(" {} ", response.request_id)),
            request_ids: vec![response.request_id.clone()],
        })
        .await
        .expect("consume pending request");
    assert_eq!(consumed.status, "consumed");
    assert_eq!(consumed.consumed_request_ids, vec![response.request_id]);
    assert!(consumed.missing_request_ids.is_empty());

    let pending = core
        .list_workspace_right_surface_pending(WorkspaceRightSurfacePendingListParams {
            workspace_id: Some("workspace-consume".to_string()),
            ..WorkspaceRightSurfacePendingListParams::default()
        })
        .await
        .expect("pending list");
    assert!(pending.pending.is_empty());
}

#[tokio::test]
async fn workspace_right_surface_pending_consume_reports_missing_ids() {
    let core = RuntimeCore::default();

    let consumed = core
        .consume_workspace_right_surface_pending(WorkspaceRightSurfacePendingConsumeParams {
            request_id: Some(" right-surface:missing ".to_string()),
            request_ids: vec!["right-surface:missing".to_string()],
        })
        .await
        .expect("consume missing pending request");

    assert_eq!(consumed.status, "consumed");
    assert!(consumed.consumed_request_ids.is_empty());
    assert_eq!(
        consumed.missing_request_ids,
        vec!["right-surface:missing".to_string()]
    );
}

#[tokio::test]
async fn workspace_right_surface_pending_consume_requires_request_id() {
    let core = RuntimeCore::default();

    let error = core
        .consume_workspace_right_surface_pending(WorkspaceRightSurfacePendingConsumeParams {
            request_id: Some(" ".to_string()),
            request_ids: vec![" ".to_string()],
        })
        .await
        .expect_err("missing request id");

    assert!(matches!(error, RuntimeCoreError::Backend(message) if message.contains("requestId")));
}

#[tokio::test]
async fn workspace_right_surface_pending_dismiss_removes_registered_request() {
    let core = RuntimeCore::default();
    let response = core
        .request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
            workspace_id: Some("workspace-dismiss".to_string()),
            workspace_root: None,
            session_id: None,
            surface_kind: "objectCanvas".to_string(),
            origin: "mcpTool".to_string(),
            reason: None,
            priority: None,
            candidate_id: None,
            ttl_ms: None,
            metadata: None,
        })
        .await
        .expect("right surface request");

    let dismissed = core
        .dismiss_workspace_right_surface_pending(WorkspaceRightSurfacePendingDismissParams {
            request_id: Some(format!(" {} ", response.request_id)),
            request_ids: vec![response.request_id.clone()],
            reason: Some("user_closed_surface".to_string()),
        })
        .await
        .expect("dismiss pending request");
    assert_eq!(dismissed.status, "dismissed");
    assert_eq!(dismissed.dismissed_request_ids, vec![response.request_id]);
    assert!(dismissed.missing_request_ids.is_empty());

    let pending = core
        .list_workspace_right_surface_pending(WorkspaceRightSurfacePendingListParams {
            workspace_id: Some("workspace-dismiss".to_string()),
            ..WorkspaceRightSurfacePendingListParams::default()
        })
        .await
        .expect("pending list");
    assert!(pending.pending.is_empty());
}

#[tokio::test]
async fn workspace_right_surface_pending_recovers_from_app_data_source() {
    let app_data_source = Arc::new(TestSessionDataSource::new(
        empty_agent_session_read_response("right_surface_recovery"),
    ));
    let core1 = RuntimeCore::default().with_app_data_source(app_data_source.clone());
    let response = core1
        .request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
            workspace_id: Some("workspace-recovery".to_string()),
            workspace_root: Some("/workspace/recovery".to_string()),
            session_id: Some("sess-recovery".to_string()),
            surface_kind: "objectCanvas".to_string(),
            origin: "mcpTool".to_string(),
            reason: Some("recovered from app data source".to_string()),
            priority: None,
            candidate_id: Some("candidate-recovery".to_string()),
            ttl_ms: None,
            metadata: Some(json!({ "source": "right-surface-test" })),
        })
        .await
        .expect("right surface request");

    let core2 = RuntimeCore::default().with_app_data_source(app_data_source.clone());
    let recovered = core2
        .list_workspace_right_surface_pending(WorkspaceRightSurfacePendingListParams {
            workspace_id: Some("workspace-recovery".to_string()),
            workspace_root: Some("/workspace/recovery".to_string()),
            session_id: Some("sess-recovery".to_string()),
            surface_kind: Some("objectCanvas".to_string()),
            limit: None,
        })
        .await
        .expect("recovered pending list");
    assert_eq!(recovered.pending, vec![response.pending.clone()]);

    let consumed = core2
        .consume_workspace_right_surface_pending(WorkspaceRightSurfacePendingConsumeParams {
            request_id: Some(response.request_id.clone()),
            request_ids: Vec::new(),
        })
        .await
        .expect("consume recovered pending request");
    assert_eq!(
        consumed.consumed_request_ids,
        vec![response.request_id.clone()]
    );
    assert!(consumed.missing_request_ids.is_empty());

    for core in [&core1, &core2] {
        let pending = core
            .list_workspace_right_surface_pending(WorkspaceRightSurfacePendingListParams {
                workspace_id: Some("workspace-recovery".to_string()),
                workspace_root: Some("/workspace/recovery".to_string()),
                session_id: Some("sess-recovery".to_string()),
                surface_kind: Some("objectCanvas".to_string()),
                limit: None,
            })
            .await
            .expect("pending list after consume");
        assert!(pending.pending.is_empty());
    }
}

#[tokio::test]
async fn workspace_right_surface_persist_requested_saves_object_canvas_snapshot() {
    let app_data_source = Arc::new(TestSessionDataSource::new(
        empty_agent_session_read_response("right_surface_snapshot"),
    ));
    let core = RuntimeCore::default().with_app_data_source(app_data_source.clone());

    let response = core
        .request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
            workspace_id: Some("workspace-snapshot".to_string()),
            workspace_root: Some("/workspace/snapshot".to_string()),
            session_id: Some("browser-session-1".to_string()),
            surface_kind: "objectCanvas".to_string(),
            origin: "runtime".to_string(),
            reason: Some("object_canvas_persist_requested".to_string()),
            priority: None,
            candidate_id: Some("browser-assist-candidate".to_string()),
            ttl_ms: None,
            metadata: Some(json!({
                "source": "objectCanvas",
                "schemaVersion": "object-canvas.persist.v1",
                "candidateId": "browser-assist-candidate",
                "objectCanvas": {
                    "board": {
                        "id": "object-canvas-board:browser-assist-candidate",
                        "revision": 1,
                        "primaryObjectId": "browser-session:browser-assist-candidate",
                        "objectCount": 1,
                        "edgeCount": 0
                    },
                    "event": {
                        "kind": "persistRequested",
                        "owner": "appServer",
                        "capabilityKey": "canPersist",
                        "enabled": false,
                        "request": {
                            "boardId": "object-canvas-board:browser-assist-candidate",
                            "revision": 1,
                            "persistenceKey": "workspace:object-canvas:browser-assist-candidate",
                            "objectId": "browser-session:browser-assist-candidate",
                            "objectKind": "browserSession",
                            "facts": {
                                "candidateId": "browser-assist-candidate",
                                "sessionId": "browser-session-1"
                            }
                        }
                    }
                }
            })),
        })
        .await
        .expect("persist right surface request");

    let snapshots = app_data_source
        .list_workspace_object_canvas_snapshots(WorkspaceObjectCanvasSnapshotListParams {
            workspace_id: Some("workspace-snapshot".to_string()),
            workspace_root: Some("/workspace/snapshot".to_string()),
            session_id: Some("browser-session-1".to_string()),
            board_id: Some("object-canvas-board:browser-assist-candidate".to_string()),
            persistence_key: Some("workspace:object-canvas:browser-assist-candidate".to_string()),
            limit: None,
        })
        .await
        .expect("object canvas snapshots");

    assert_eq!(snapshots.len(), 1);
    let snapshot = &snapshots[0];
    assert_eq!(
        snapshot.snapshot_id,
        format!("object_canvas_snapshot:{}", response.request_id)
    );
    assert_eq!(snapshot.request_id, response.request_id);
    assert_eq!(snapshot.workspace_id.as_deref(), Some("workspace-snapshot"));
    assert_eq!(
        snapshot.workspace_root.as_deref(),
        Some("/workspace/snapshot")
    );
    assert_eq!(snapshot.session_id.as_deref(), Some("browser-session-1"));
    assert_eq!(
        snapshot.board_id,
        "object-canvas-board:browser-assist-candidate"
    );
    assert_eq!(snapshot.revision, 1);
    assert_eq!(
        snapshot.persistence_key,
        "workspace:object-canvas:browser-assist-candidate"
    );
    assert_eq!(
        snapshot.candidate_id.as_deref(),
        Some("browser-assist-candidate")
    );
    assert_eq!(
        snapshot.object_id.as_deref(),
        Some("browser-session:browser-assist-candidate")
    );
    assert_eq!(snapshot.object_kind.as_deref(), Some("browserSession"));
    assert_eq!(
        snapshot
            .snapshot_json
            .pointer("/metadata/objectCanvas/event/kind")
            .and_then(serde_json::Value::as_str),
        Some("persistRequested")
    );
    assert_eq!(
        snapshot
            .snapshot_json
            .pointer("/pendingRequest/requestId")
            .and_then(serde_json::Value::as_str),
        Some(response.request_id.as_str())
    );
}

#[tokio::test]
async fn workspace_right_surface_non_persist_object_canvas_request_does_not_save_snapshot() {
    let app_data_source = Arc::new(TestSessionDataSource::new(
        empty_agent_session_read_response("right_surface_non_snapshot"),
    ));
    let core = RuntimeCore::default().with_app_data_source(app_data_source.clone());

    core.request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
        workspace_id: Some("workspace-replay".to_string()),
        surface_kind: "objectCanvas".to_string(),
        origin: "runtime".to_string(),
        reason: Some("object_canvas_replay_requested".to_string()),
        metadata: Some(json!({
            "source": "objectCanvas",
            "objectCanvas": {
                "event": {
                    "kind": "replayRequested",
                    "owner": "runtime",
                    "request": {
                        "boardId": "object-canvas-board:browser-assist-candidate",
                        "revision": 1,
                        "replayTarget": "activeBrowserSession"
                    }
                }
            }
        })),
        ..WorkspaceRightSurfaceRequestParams::default()
    })
    .await
    .expect("replay right surface request");

    assert!(app_data_source.object_canvas_snapshots().is_empty());
}

#[tokio::test]
async fn workspace_right_surface_replay_requested_projects_runtime_readiness() {
    let core = RuntimeCore::default();
    let response = core
        .request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
            workspace_id: Some("workspace-replay-ready".to_string()),
            workspace_root: Some("/workspace/replay-ready".to_string()),
            session_id: Some("browser-session-ready".to_string()),
            surface_kind: "objectCanvas".to_string(),
            origin: "runtime".to_string(),
            reason: Some("object_canvas_replay_requested".to_string()),
            priority: None,
            candidate_id: Some("browser-assist-ready".to_string()),
            ttl_ms: None,
            metadata: Some(json!({
                "source": "objectCanvas",
                "schemaVersion": "object-canvas.replay.v1",
                "candidateId": "browser-assist-ready",
                "objectCanvas": {
                    "board": {
                        "id": "object-canvas-board:browser-assist-ready",
                        "revision": 2,
                        "primaryObjectId": "browser-session:browser-assist-ready",
                        "objectCount": 1,
                        "edgeCount": 0
                    },
                    "snapshot": {
                        "id": "object-canvas-board:browser-assist-ready",
                        "revision": 2,
                        "primaryObjectId": "browser-session:browser-assist-ready",
                        "objects": [
                            {
                                "id": "browser-session:browser-assist-ready",
                                "kind": "browserSession"
                            }
                        ],
                        "edges": []
                    },
                    "event": {
                        "kind": "replayRequested",
                        "owner": "runtime",
                        "capabilityKey": "canReplay",
                        "enabled": false,
                        "request": {
                            "boardId": "object-canvas-board:browser-assist-ready",
                            "revision": 2,
                            "replayTarget": "runtimeSession",
                            "objectId": "browser-session:browser-assist-ready",
                            "objectKind": "browserSession",
                            "source": {
                                "kind": "browserAssist",
                                "candidateId": "browser-assist-ready"
                            },
                            "facts": {
                                "candidateId": "browser-assist-ready",
                                "sessionId": "browser-session-ready"
                            }
                        }
                    }
                }
            })),
        })
        .await
        .expect("replay right surface request");

    let readiness = core
        .list_workspace_object_canvas_replay_readiness(
            WorkspaceObjectCanvasReplayReadinessListParams {
                workspace_id: Some("workspace-replay-ready".to_string()),
                workspace_root: Some("/workspace/replay-ready".to_string()),
                session_id: Some("browser-session-ready".to_string()),
                board_id: Some("object-canvas-board:browser-assist-ready".to_string()),
                limit: None,
            },
        )
        .await
        .expect("replay readiness");

    assert_eq!(readiness.len(), 1);
    let readiness = &readiness[0];
    assert_eq!(readiness.request_id, response.request_id);
    assert_eq!(
        readiness.workspace_id.as_deref(),
        Some("workspace-replay-ready")
    );
    assert_eq!(
        readiness.workspace_root.as_deref(),
        Some("/workspace/replay-ready")
    );
    assert_eq!(
        readiness.session_id.as_deref(),
        Some("browser-session-ready")
    );
    assert_eq!(
        readiness.candidate_id.as_deref(),
        Some("browser-assist-ready")
    );
    assert_eq!(
        readiness.board_id.as_deref(),
        Some("object-canvas-board:browser-assist-ready")
    );
    assert_eq!(readiness.revision, Some(2));
    assert_eq!(
        readiness.object_id.as_deref(),
        Some("browser-session:browser-assist-ready")
    );
    assert_eq!(readiness.object_kind.as_deref(), Some("browserSession"));
    assert_eq!(readiness.replay_target.as_deref(), Some("runtimeSession"));
    assert_eq!(readiness.status, "metadataReady");
    assert!(readiness.metadata_ready);
    assert!(!readiness.execution_enabled);
    assert_eq!(
        readiness.execution_blocker.as_deref(),
        Some("runtime_replay_execution_not_implemented")
    );
    assert!(readiness.missing_fields.is_empty());
    assert_eq!(
        readiness
            .board_snapshot
            .as_ref()
            .and_then(|snapshot| snapshot.get("id"))
            .and_then(serde_json::Value::as_str),
        Some("object-canvas-board:browser-assist-ready")
    );
    assert_eq!(
        readiness
            .facts
            .as_ref()
            .and_then(|facts| facts.get("sessionId"))
            .and_then(serde_json::Value::as_str),
        Some("browser-session-ready")
    );
}

#[tokio::test]
async fn workspace_right_surface_replay_readiness_reports_missing_metadata() {
    let core = RuntimeCore::default();
    let response = core
        .request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
            workspace_id: Some("workspace-replay-incomplete".to_string()),
            surface_kind: "objectCanvas".to_string(),
            origin: "runtime".to_string(),
            reason: Some("object_canvas_replay_requested".to_string()),
            metadata: Some(json!({
                "source": "objectCanvas",
                "objectCanvas": {
                    "event": {
                        "kind": "replayRequested",
                        "owner": "runtime",
                        "request": {
                            "boardId": "object-canvas-board:incomplete",
                            "revision": 1,
                            "replayTarget": "runtimeSession"
                        }
                    }
                }
            })),
            ..WorkspaceRightSurfaceRequestParams::default()
        })
        .await
        .expect("incomplete replay right surface request");

    let readiness = core
        .list_workspace_object_canvas_replay_readiness(
            WorkspaceObjectCanvasReplayReadinessListParams {
                workspace_id: Some("workspace-replay-incomplete".to_string()),
                board_id: Some("object-canvas-board:incomplete".to_string()),
                ..WorkspaceObjectCanvasReplayReadinessListParams::default()
            },
        )
        .await
        .expect("incomplete replay readiness");

    assert_eq!(readiness.len(), 1);
    assert_eq!(readiness[0].request_id, response.request_id);
    assert_eq!(readiness[0].status, "metadataIncomplete");
    assert!(!readiness[0].metadata_ready);
    assert!(!readiness[0].execution_enabled);
    assert_eq!(
        readiness[0].missing_fields,
        vec!["objectId".to_string(), "objectCanvas.snapshot".to_string()]
    );
}

#[tokio::test]
async fn workspace_right_surface_replay_dry_run_projects_audit_event() {
    let core = RuntimeCore::default();
    let response = core
        .request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
            workspace_id: Some("workspace-replay-dry-run".to_string()),
            workspace_root: Some("/workspace/replay-dry-run".to_string()),
            session_id: Some("browser-session-dry-run".to_string()),
            surface_kind: "objectCanvas".to_string(),
            origin: "runtime".to_string(),
            reason: Some("object_canvas_replay_requested".to_string()),
            candidate_id: Some("browser-assist-dry-run".to_string()),
            metadata: Some(json!({
                "source": "objectCanvas",
                "schemaVersion": "object-canvas.replay.v1",
                "candidateId": "browser-assist-dry-run",
                "objectCanvas": {
                    "snapshot": {
                        "id": "object-canvas-board:dry-run",
                        "revision": 3,
                        "primaryObjectId": "browser-session:dry-run",
                        "objects": [
                            {
                                "id": "browser-session:dry-run",
                                "kind": "browserSession"
                            }
                        ],
                        "edges": []
                    },
                    "event": {
                        "kind": "replayRequested",
                        "owner": "runtime",
                        "request": {
                            "boardId": "object-canvas-board:dry-run",
                            "revision": 3,
                            "replayTarget": "runtimeSession",
                            "objectId": "browser-session:dry-run",
                            "objectKind": "browserSession",
                            "source": {
                                "kind": "browserAssist",
                                "candidateId": "browser-assist-dry-run"
                            },
                            "facts": {
                                "candidateId": "browser-assist-dry-run",
                                "sessionId": "browser-session-dry-run"
                            }
                        }
                    }
                }
            })),
            ..WorkspaceRightSurfaceRequestParams::default()
        })
        .await
        .expect("replay dry-run right surface request");

    let events = core
        .dry_run_workspace_object_canvas_replay(WorkspaceObjectCanvasReplayReadinessListParams {
            workspace_id: Some("workspace-replay-dry-run".to_string()),
            workspace_root: Some("/workspace/replay-dry-run".to_string()),
            session_id: Some("browser-session-dry-run".to_string()),
            board_id: Some("object-canvas-board:dry-run".to_string()),
            limit: None,
        })
        .await
        .expect("replay dry-run events");

    assert_eq!(events.len(), 1);
    let event = &events[0];
    assert_eq!(event.event_type, "object_canvas.replay.dry_run");
    assert_eq!(
        event
            .payload
            .pointer("/schemaVersion")
            .and_then(serde_json::Value::as_str),
        Some("object-canvas.replay.dry-run.v1")
    );
    assert_eq!(
        event
            .payload
            .pointer("/requestId")
            .and_then(serde_json::Value::as_str),
        Some(response.request_id.as_str())
    );
    assert_eq!(
        event
            .payload
            .pointer("/boardId")
            .and_then(serde_json::Value::as_str),
        Some("object-canvas-board:dry-run")
    );
    assert_eq!(
        event
            .payload
            .pointer("/metadata/status")
            .and_then(serde_json::Value::as_str),
        Some("metadataReady")
    );
    assert_eq!(
        event
            .payload
            .pointer("/metadata/ready")
            .and_then(serde_json::Value::as_bool),
        Some(true)
    );
    assert_eq!(
        event
            .payload
            .pointer("/execution/dryRun")
            .and_then(serde_json::Value::as_bool),
        Some(true)
    );
    assert_eq!(
        event
            .payload
            .pointer("/execution/wouldExecute")
            .and_then(serde_json::Value::as_bool),
        Some(false)
    );
    assert_eq!(
        event
            .payload
            .pointer("/execution/blocker")
            .and_then(serde_json::Value::as_str),
        Some("runtime_replay_execution_not_implemented")
    );
    assert_eq!(
        event
            .payload
            .pointer("/audit/decision")
            .and_then(serde_json::Value::as_str),
        Some("blocked")
    );
    assert_eq!(
        event
            .payload
            .pointer("/audit/blockingReasons/0")
            .and_then(serde_json::Value::as_str),
        Some("runtime_replay_execution_not_implemented")
    );
    assert_eq!(
        event
            .payload
            .pointer("/replay/boardSnapshot/primaryObjectId")
            .and_then(serde_json::Value::as_str),
        Some("browser-session:dry-run")
    );
}

#[tokio::test]
async fn workspace_right_surface_replay_dry_run_reports_missing_metadata() {
    let core = RuntimeCore::default();
    core.request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
        workspace_id: Some("workspace-replay-dry-run-incomplete".to_string()),
        surface_kind: "objectCanvas".to_string(),
        origin: "runtime".to_string(),
        reason: Some("object_canvas_replay_requested".to_string()),
        metadata: Some(json!({
            "source": "objectCanvas",
            "objectCanvas": {
                "event": {
                    "kind": "replayRequested",
                    "owner": "runtime",
                    "request": {
                        "boardId": "object-canvas-board:dry-run-incomplete",
                        "revision": 1,
                        "replayTarget": "runtimeSession"
                    }
                }
            }
        })),
        ..WorkspaceRightSurfaceRequestParams::default()
    })
    .await
    .expect("incomplete replay dry-run right surface request");

    let events = core
        .dry_run_workspace_object_canvas_replay(WorkspaceObjectCanvasReplayReadinessListParams {
            workspace_id: Some("workspace-replay-dry-run-incomplete".to_string()),
            board_id: Some("object-canvas-board:dry-run-incomplete".to_string()),
            ..WorkspaceObjectCanvasReplayReadinessListParams::default()
        })
        .await
        .expect("incomplete replay dry-run events");

    assert_eq!(events.len(), 1);
    let payload = &events[0].payload;
    assert_eq!(
        payload
            .pointer("/metadata/status")
            .and_then(serde_json::Value::as_str),
        Some("metadataIncomplete")
    );
    assert_eq!(
        payload
            .pointer("/metadata/missingFields/0")
            .and_then(serde_json::Value::as_str),
        Some("objectId")
    );
    assert_eq!(
        payload
            .pointer("/metadata/missingFields/1")
            .and_then(serde_json::Value::as_str),
        Some("objectCanvas.snapshot")
    );
    assert_eq!(
        payload
            .pointer("/audit/blockingReasons/0")
            .and_then(serde_json::Value::as_str),
        Some("objectId")
    );
    assert_eq!(
        payload
            .pointer("/audit/blockingReasons/2")
            .and_then(serde_json::Value::as_str),
        Some("runtime_replay_execution_not_implemented")
    );
}

#[tokio::test]
async fn workspace_right_surface_replay_dry_run_ignores_non_replay_pending() {
    let core = RuntimeCore::default();
    core.request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
        workspace_id: Some("workspace-non-replay-dry-run".to_string()),
        surface_kind: "objectCanvas".to_string(),
        origin: "runtime".to_string(),
        reason: Some("object_canvas_persist_requested".to_string()),
        metadata: Some(json!({
            "source": "objectCanvas",
            "objectCanvas": {
                "event": {
                    "kind": "persistRequested",
                    "owner": "appServer",
                    "request": {
                        "boardId": "object-canvas-board:persist",
                        "revision": 1,
                        "persistenceKey": "workspace:object-canvas:persist"
                    }
                }
            }
        })),
        ..WorkspaceRightSurfaceRequestParams::default()
    })
    .await
    .expect("non replay right surface request");

    let events = core
        .dry_run_workspace_object_canvas_replay(WorkspaceObjectCanvasReplayReadinessListParams {
            workspace_id: Some("workspace-non-replay-dry-run".to_string()),
            ..WorkspaceObjectCanvasReplayReadinessListParams::default()
        })
        .await
        .expect("non replay dry-run events");

    assert!(events.is_empty());
}

#[tokio::test]
async fn workspace_right_surface_request_requires_surface_kind_and_origin() {
    let core = RuntimeCore::default();

    let missing_surface = core
        .request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
            surface_kind: " ".to_string(),
            origin: "agent".to_string(),
            ..WorkspaceRightSurfaceRequestParams::default()
        })
        .await
        .expect_err("missing surface kind");
    assert!(
        matches!(missing_surface, RuntimeCoreError::Backend(message) if message.contains("surfaceKind"))
    );

    let missing_origin = core
        .request_workspace_right_surface(WorkspaceRightSurfaceRequestParams {
            surface_kind: "files".to_string(),
            origin: " ".to_string(),
            ..WorkspaceRightSurfaceRequestParams::default()
        })
        .await
        .expect_err("missing origin");
    assert!(
        matches!(missing_origin, RuntimeCoreError::Backend(message) if message.contains("origin"))
    );
}
