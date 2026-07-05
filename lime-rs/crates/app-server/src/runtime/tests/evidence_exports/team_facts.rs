use super::*;

#[tokio::test]
async fn export_evidence_pack_includes_multi_agent_team_facts() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_team_evidence".to_string()),
        thread_id: Some("thread_team_evidence".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_team_evidence".to_string(),
            turn_id: Some("turn_team_evidence".to_string()),
            input: AgentInput {
                text: "运行多 Agent 团队".to_string(),
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
    core.append_external_runtime_events(
        "sess_team_evidence",
        Some("turn_team_evidence"),
        vec![
            RuntimeEvent::new(
                "team.changed",
                json!({
                    "teamEvent": "teammate_status_changed",
                    "parentSessionId": "sess_team_evidence",
                    "childSessionId": "child-researcher",
                    "status": "running",
                    "teamPhase": "queued",
                    "teamParallelBudget": 2,
                    "teamActiveCount": 1,
                    "teamQueuedCount": 1
                }),
            ),
            RuntimeEvent::new(
                "task.changed",
                json!({
                    "taskEvent": "team_control",
                    "taskId": "child-researcher",
                    "agentId": "child-researcher",
                    "parentSessionId": "sess_team_evidence",
                    "runtimeEntity": "subagent_turn",
                    "runtimeStatus": "running",
                    "latestTurnStatus": "queued"
                }),
            ),
            RuntimeEvent::new(
                "agent.handoff",
                json!({
                    "handoffId": "sess_team_evidence:handoff:child-researcher",
                    "parentSessionId": "sess_team_evidence",
                    "childSessionId": "child-researcher",
                    "status": "accepted",
                    "from": "sess_team_evidence",
                    "to": "child-researcher",
                    "contextBoundary": "subagent_session",
                    "transcriptRef": "child-researcher:turn-child-1"
                }),
            ),
            RuntimeEvent::new(
                "worker.notification",
                json!({
                    "workerNotificationId": "child-researcher:completed",
                    "notificationKind": "worker_completed",
                    "parentSessionId": "sess_team_evidence",
                    "childSessionId": "child-researcher",
                    "status": "completed",
                    "resultRef": "artifact://team/worker-result",
                    "transcriptRef": "child-researcher:turn-child-1"
                }),
            ),
            RuntimeEvent::new(
                "task.changed",
                json!({
                    "taskEvent": "team_control",
                    "surface": "review_lane",
                    "reviewId": "review-team-1",
                    "workItemId": "review-team-1",
                    "parentSessionId": "sess_team_evidence",
                    "childSessionId": "child-reviewer",
                    "runtimeEntity": "work_item",
                    "runtimeStatus": "waiting"
                }),
            ),
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "team-worker-result",
                    "path": ".lime/artifacts/team/worker-result.json",
                    "kind": "team_worker_result",
                    "metadata": {
                        "parentSessionId": "sess_team_evidence",
                        "childSessionId": "child-researcher",
                        "threadId": "thread_team_evidence",
                        "turnId": "turn_team_evidence"
                    }
                }),
            ),
        ],
    )
    .expect("append team fact evidence events");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_team_evidence".to_string(),
            turn_id: Some("turn_team_evidence".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export team fact evidence");

    assert_eq!(response.session.session_id, "sess_team_evidence");
    assert_eq!(response.session.thread_id, "thread_team_evidence");
    assert!(response.events.iter().any(|event| {
        event.event_type == "agent.handoff"
            && event.session_id == "sess_team_evidence"
            && event.thread_id.as_deref() == Some("thread_team_evidence")
            && event.turn_id.as_deref() == Some("turn_team_evidence")
            && event.payload["parentSessionId"] == "sess_team_evidence"
            && event.payload["childSessionId"] == "child-researcher"
    }));
    assert!(response.events.iter().any(|event| {
        event.event_type == "worker.notification"
            && event.payload["workerNotificationId"] == "child-researcher:completed"
    }));
    assert!(response.artifacts.iter().any(|artifact| {
        artifact.artifact_ref == "team-worker-result"
            && artifact.path.as_deref() == Some(".lime/artifacts/team/worker-result.json")
    }));

    let evidence_pack = response.evidence_pack.expect("evidence pack");
    assert_eq!(evidence_pack.turn_count, 1);
    assert!(evidence_pack
        .artifacts
        .iter()
        .any(|artifact| { artifact.relative_path == ".lime/artifacts/team/worker-result.json" }));
    let team_facts = evidence_pack
        .observability_summary
        .expect("observability summary")
        .get("team_facts")
        .cloned()
        .expect("team facts summary");
    assert_eq!(team_facts["status"], "exported");
    assert_eq!(team_facts["teamEventCount"], json!(1));
    assert_eq!(team_facts["taskEventCount"], json!(2));
    assert_eq!(team_facts["handoffCount"], json!(1));
    assert_eq!(team_facts["workerNotificationCount"], json!(1));
    assert_eq!(team_facts["reviewLaneCount"], json!(1));
    assert_json_array_contains(&team_facts, "parentSessionIds", "sess_team_evidence");
    assert_json_array_contains(&team_facts, "childSessionIds", "child-researcher");
    assert_json_array_contains(&team_facts, "childSessionIds", "child-reviewer");
    assert_json_array_contains(&team_facts, "threadIds", "thread_team_evidence");
    assert_json_array_contains(&team_facts, "turnIds", "turn_team_evidence");
    assert_json_array_contains(
        &team_facts,
        "handoffIds",
        "sess_team_evidence:handoff:child-researcher",
    );
    assert_json_array_contains(
        &team_facts,
        "workerNotificationIds",
        "child-researcher:completed",
    );
    assert_json_array_contains(&team_facts, "reviewIds", "review-team-1");
    assert_json_array_contains(&team_facts, "teamPhases", "queued");
}

fn assert_json_array_contains(value: &serde_json::Value, key: &str, expected: &str) {
    assert!(
        value
            .get(key)
            .and_then(serde_json::Value::as_array)
            .is_some_and(|values| values.iter().any(|value| value.as_str() == Some(expected))),
        "expected {key} to contain {expected}, got {value}"
    );
}
