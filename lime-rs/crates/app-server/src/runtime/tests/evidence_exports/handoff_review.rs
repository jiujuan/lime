use super::*;
use crate::runtime::agent_control::AgentControlSpawnRequest;
use agent_protocol::ThreadId;
use thread_store::AgentGraphStore;
use thread_store::ThreadSpawnEdgeStatus;

#[tokio::test]
async fn export_handoff_bundle_writes_current_session_bundle_to_workspace() {
    let temp = tempfile::tempdir().expect("workspace");
    let workspace_root = temp.path().to_string_lossy().to_string();
    let app_data_source = Arc::new(
        TestSessionDataSource::new(empty_agent_session_read_response("unused"))
            .with_memory_data_root(temp.path().join("data-root")),
    );
    let projection_store = Arc::new(
        ProjectionStore::initialize(temp.path().join("projection.sqlite"))
            .expect("projection store"),
    );
    let core = RuntimeCore::default()
        .with_projection_store(projection_store.clone())
        .with_app_data_source(app_data_source.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_handoff".to_string()),
        thread_id: Some("thread_handoff".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_handoff".to_string(),
            title: Some("Current Handoff".to_string()),
            uri: None,
            metadata: Some(json!({
                "workspaceRoot": workspace_root.clone(),
                "model": "gpt-test",
                "executionStrategy": "runtime-core"
            })),
        }),
        locale: None,
    })
    .expect("session");
    for (session_id, thread_id) in [
        ("sess_handoff_active_child", "thread_handoff_active_child"),
        ("sess_handoff_closed_child", "thread_handoff_closed_child"),
    ] {
        core.spawn_agent_controlled(AgentControlSpawnRequest {
            parent_session_id: "sess_handoff".to_string(),
            child_session_id: Some(session_id.to_string()),
            child_thread_id: Some(thread_id.to_string()),
        })
        .await
        .expect("spawn canonical child");
    }
    projection_store
        .set_thread_spawn_edge_status(
            ThreadId::new("thread_handoff_closed_child"),
            ThreadSpawnEdgeStatus::Closed,
        )
        .await
        .expect("close canonical child edge");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_handoff".to_string(),
            turn_id: Some("turn_handoff".to_string()),
            input: AgentInput {
                text: "生成 handoff".to_string(),
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
        "sess_handoff",
        Some("turn_handoff"),
        vec![
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-handoff",
                    "path": ".app-server/artifacts/handoff.md",
                    "title": "Handoff Draft",
                    "kind": "markdown"
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append events");

    let response = core
        .export_handoff_bundle(AgentSessionHandoffBundleExportParams {
            session_id: " sess_handoff ".to_string(),
            locale: Some("en-US".to_string()),
        })
        .await
        .expect("export handoff bundle");

    assert_eq!(response.session_id, "sess_handoff");
    assert_eq!(response.thread_id, "thread_handoff");
    assert_eq!(
        response.bundle_relative_root,
        ".lime/harness/sessions/sess_handoff"
    );
    assert_eq!(response.thread_status, "completed");
    assert_eq!(response.latest_turn_status.as_deref(), Some("completed"));
    assert_eq!(response.active_subagent_count, 1);
    assert_eq!(response.artifacts.len(), 4);
    let kinds = response
        .artifacts
        .iter()
        .map(|artifact| artifact.kind.as_str())
        .collect::<Vec<_>>();
    assert_eq!(kinds, vec!["plan", "progress", "handoff", "review_summary"]);
    for artifact in &response.artifacts {
        assert!(Path::new(&artifact.absolute_path).is_file());
        assert!(artifact
            .relative_path
            .starts_with(".lime/harness/sessions/sess_handoff/"));
        assert!(artifact.bytes > 0);
    }
    let progress_path = temp
        .path()
        .join(".lime")
        .join("harness")
        .join("sessions")
        .join("sess_handoff")
        .join("progress.json");
    let progress = fs::read_to_string(progress_path).expect("progress.json");
    assert!(progress.contains("\"schemaVersion\": \"agent-session-handoff-bundle.v1\""));
    assert!(progress.contains("\"activeSubagent\": 1"));
    assert!(progress.contains(".app-server/artifacts/handoff.md"));

    let memory_root = temp.path().join(".lime").join("memories");
    let rollout_summaries = memory_root.join("rollout_summaries");
    let candidates = fs::read_dir(&rollout_summaries)
        .expect("rollout summaries")
        .map(|entry| entry.expect("rollout candidate").path())
        .filter(|path| {
            path.extension()
                .and_then(std::ffi::OsStr::to_str)
                .is_some_and(|extension| extension == "md")
        })
        .collect::<Vec<_>>();
    assert_eq!(candidates.len(), 1);
    let candidate = fs::read_to_string(&candidates[0]).expect("rollout candidate");
    assert!(candidate.contains("handoff_bundle"));
    assert!(candidate.contains(".lime/harness/sessions/sess_handoff"));
    assert!(candidate.contains("Handoff Draft"));
    let memory = fs::read_to_string(memory_root.join("MEMORY.md")).expect("memory file");
    let summary = fs::read_to_string(memory_root.join("memory_summary.md")).expect("summary file");
    assert!(!memory.contains("handoff_bundle"));
    assert!(!summary.contains("handoff_bundle"));

    let consolidated = app_data_source
        .consolidate_memory_store(MemoryStoreConsolidateParams {
            root: MemoryStoreRootParams {
                scope: MemoryStoreScope::Workspace,
                workspace_root: Some(workspace_root),
            },
            max_notes: Some(5),
        })
        .await
        .expect("consolidate rollout candidate");
    assert_eq!(consolidated.processed_notes, 1);
    let summary = fs::read_to_string(memory_root.join("memory_summary.md")).expect("summary file");
    assert!(summary.contains("handoff_bundle"));
}

#[tokio::test]
async fn export_runtime_review_residuals_write_current_session_artifacts() {
    let temp = tempfile::tempdir().expect("workspace");
    let workspace_root = temp.path().to_string_lossy().to_string();
    let app_data_source = Arc::new(
        TestSessionDataSource::new(empty_agent_session_read_response("unused"))
            .with_memory_data_root(temp.path().join("data-root")),
    );
    let core = RuntimeCore::default().with_app_data_source(app_data_source);
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_review_export".to_string()),
        thread_id: Some("thread_review_export".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_review_export".to_string(),
            title: Some("Review Export".to_string()),
            uri: None,
            metadata: Some(json!({
                "workspaceRoot": workspace_root,
            })),
        }),
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_review_export".to_string(),
            turn_id: Some("turn_review_export".to_string()),
            input: AgentInput {
                text: "生成 review export".to_string(),
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
        "sess_review_export",
        Some("turn_review_export"),
        vec![
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifactId": "artifact-review",
                    "path": ".app-server/artifacts/review.md",
                    "title": "Review Draft",
                    "kind": "markdown"
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append events");

    let replay = core
        .export_replay_case(AgentSessionReplayCaseExportParams {
            session_id: "sess_review_export".to_string(),
            locale: None,
        })
        .await
        .expect("replay");
    assert_eq!(replay.artifacts.len(), 4);
    assert_eq!(replay.artifacts[0].kind, "input");
    assert!(Path::new(&replay.artifacts[0].absolute_path).is_file());
    let rollout_summaries = temp
        .path()
        .join(".lime")
        .join("memories")
        .join("rollout_summaries");
    let replay_candidate = read_rollout_candidate(&rollout_summaries, "replay_case");
    assert!(replay_candidate.contains(".lime/harness/sessions/sess_review_export/replay"));

    let analysis = core
        .export_analysis_handoff(AgentSessionAnalysisHandoffExportParams {
            session_id: "sess_review_export".to_string(),
            locale: None,
        })
        .await
        .expect("analysis");
    assert_eq!(analysis.artifacts.len(), 2);
    assert_eq!(analysis.artifacts[0].kind, "analysis_brief");
    assert!(analysis.copy_prompt.contains("sess_review_export"));
    let analysis_candidate = read_rollout_candidate(&rollout_summaries, "analysis_handoff");
    assert!(analysis_candidate.contains(".lime/harness/sessions/sess_review_export/analysis"));

    let review = core
        .export_review_decision_template(AgentSessionReviewDecisionTemplateExportParams {
            session_id: "sess_review_export".to_string(),
            locale: None,
        })
        .await
        .expect("review template");
    assert_eq!(review.artifacts.len(), 2);
    assert_eq!(review.decision.decision_status, "pending_review");
    assert_eq!(rollout_candidate_count(&rollout_summaries), 2);

    let saved = core
        .save_review_decision(AgentSessionReviewDecisionSaveParams {
            session_id: "sess_review_export".to_string(),
            decision_status: "accepted".to_string(),
            decision_summary: "current path accepted".to_string(),
            chosen_fix_strategy: "keep app server path".to_string(),
            risk_level: "low".to_string(),
            risk_tags: vec!["runtime".to_string()],
            human_reviewer: "reviewer".to_string(),
            followup_actions: vec!["run contracts".to_string()],
            regression_requirements: vec!["npm run test:contracts".to_string()],
            notes: "done".to_string(),
            locale: None,
        })
        .await
        .expect("save review");
    assert_eq!(saved.decision.decision_status, "accepted");
    let review_json = fs::read_to_string(
        temp.path()
            .join(".lime")
            .join("harness")
            .join("sessions")
            .join("sess_review_export")
            .join("review")
            .join("review-decision.json"),
    )
    .expect("review decision json");
    assert!(review_json.contains("current path accepted"));
    let review_candidate = read_rollout_candidate(&rollout_summaries, "review_decision");
    assert!(review_candidate.contains(".lime/harness/sessions/sess_review_export/review"));
    assert!(review_candidate.contains("Review Draft"));
    assert_eq!(rollout_candidate_count(&rollout_summaries), 3);
}

#[tokio::test]
async fn export_runtime_handoff_residuals_apply_locale_copy_and_generation_brief_boundary() {
    let temp = tempfile::tempdir().expect("workspace");
    let workspace_root = temp.path().to_string_lossy().to_string();
    let app_data_source = Arc::new(
        TestSessionDataSource::new(empty_agent_session_read_response("unused"))
            .with_memory_data_root(temp.path().join("data-root")),
    );
    let core = RuntimeCore::default().with_app_data_source(app_data_source);
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_locale_export".to_string()),
        thread_id: Some("thread_locale_export".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_locale_export".to_string(),
            title: Some("Locale Export".to_string()),
            uri: None,
            metadata: Some(json!({
                "workspaceRoot": workspace_root,
            })),
        }),
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_locale_export".to_string(),
            turn_id: Some("turn_locale_export".to_string()),
            input: AgentInput {
                text: "生成 locale export".to_string(),
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

    let analysis = core
        .export_analysis_handoff(AgentSessionAnalysisHandoffExportParams {
            session_id: "sess_locale_export".to_string(),
            locale: Some("ja-JP".to_string()),
        })
        .await
        .expect("analysis locale export");
    assert_eq!(analysis.title, "外部分析引き継ぎ");
    assert_eq!(analysis.artifacts[0].title, "外部分析ブリーフ");
    assert!(analysis.copy_prompt.contains("Generation Brief"));
    assert!(analysis.copy_prompt.contains("sess_locale_export"));

    let analysis_brief = fs::read_to_string(
        temp.path()
            .join(".lime")
            .join("harness")
            .join("sessions")
            .join("sess_locale_export")
            .join("analysis")
            .join("analysis-brief.md"),
    )
    .expect("analysis brief");
    assert!(analysis_brief.contains("## Generation Brief 境界"));
    assert!(analysis_brief.contains("generation_brief_only"));
    assert!(analysis_brief.contains("Product Soul"));
    assert!(!analysis_brief.contains("Review the current App Server read model"));
    assert!(!analysis_brief.contains("cheeky_sassy_executor"));

    let review = core
        .export_review_decision_template(AgentSessionReviewDecisionTemplateExportParams {
            session_id: "sess_locale_export".to_string(),
            locale: Some("ko-KR".to_string()),
        })
        .await
        .expect("review locale export");
    assert_eq!(review.title, "리뷰 결정");
    assert_eq!(review.artifacts[0].title, "리뷰 결정");
    assert!(review
        .review_checklist
        .iter()
        .any(|item| item.contains("App Server current 경로 증거")));
    let review_markdown = fs::read_to_string(
        temp.path()
            .join(".lime")
            .join("harness")
            .join("sessions")
            .join("sess_locale_export")
            .join("review")
            .join("review-decision.md"),
    )
    .expect("review markdown");
    assert!(review_markdown.contains("## Generation Brief 경계"));
    assert!(review_markdown.contains("generation_brief_only"));
}

fn read_rollout_candidate(root: &Path, marker: &str) -> String {
    let path = fs::read_dir(root)
        .expect("rollout summaries")
        .map(|entry| entry.expect("rollout candidate").path())
        .find(|path| {
            path.extension()
                .and_then(std::ffi::OsStr::to_str)
                .is_some_and(|extension| extension == "md")
                && fs::read_to_string(path)
                    .expect("rollout candidate")
                    .contains(marker)
        })
        .unwrap_or_else(|| panic!("rollout candidate should contain {marker}"));
    fs::read_to_string(path).expect("rollout candidate content")
}

fn rollout_candidate_count(root: &Path) -> usize {
    fs::read_dir(root)
        .expect("rollout summaries")
        .map(|entry| entry.expect("rollout candidate").path())
        .filter(|path| {
            path.extension()
                .and_then(std::ffi::OsStr::to_str)
                .is_some_and(|extension| extension == "md")
        })
        .count()
}
