use super::*;

#[tokio::test]
async fn cancel_turn_cancels_runtime_stream_token() {
    let backend = RuntimeBackend::new();
    let request = request_for_test("请持续输出", None, None);
    let cancel_token = backend
        .agent_state
        .create_cancel_token(&request.session.session_id)
        .await;
    let mut sink = TestRuntimeEventSink::default();

    ExecutionBackend::cancel_turn(
        &backend,
        CancelExecutionRequest {
            host: RuntimeHostContext::default(),
            session: request.session,
            turn: request.turn,
        },
        &mut sink,
    )
    .await
    .expect("cancel should emit a runtime event");

    assert!(cancel_token.is_cancelled());
    assert_eq!(sink.events.len(), 1);
    assert_eq!(sink.events[0].event_type, "turn.canceled");
}

#[tokio::test]
async fn runtime_backend_image_command_short_circuits_before_chat_model_routing() {
    let backend = RuntimeBackend::new();
    let workspace = TempDir::new().expect("workspace");
    let request = request_for_test(
        "画一张广州夏天的图",
        None,
        Some(json!({
            "harness": {
                "projectRoot": workspace.path().to_string_lossy(),
                "image_command_intent": {
                    "kind": "image_command",
                    "image_task": {
                        "prompt": "画一张广州夏天的图",
                        "mode": "generate",
                        "count": 1,
                        "provider_id": "openai",
                        "model": "gpt-image-2",
                        "executor_mode": "images_api"
                    }
                }
            }
        })),
    );
    let mut sink = TestRuntimeEventSink::default();

    backend
        .handle_turn_start(request, &mut sink)
        .await
        .expect("image command should not require chat model routing");

    let event_types = sink
        .events
        .iter()
        .filter(|event| !event.event_type.starts_with("workflow."))
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "runtime.status",
            "tool.started",
            "tool.args",
            "image_task.create_failed",
            "tool.failed",
            "turn.completed"
        ]
    );
    assert_eq!(
        sink.events
            .iter()
            .find(|event| event.event_type == "image_task.create_failed")
            .and_then(|event| event.payload["reasonCode"].as_str()),
        Some("app_data_source_unavailable")
    );
    let workflow_event_types = sink
        .events
        .iter()
        .filter(|event| event.event_type.starts_with("workflow."))
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        workflow_event_types,
        vec![
            "workflow.run.started",
            "workflow.step.completed",
            "workflow.step.completed",
            "workflow.run.completed"
        ]
    );
    assert!(
        sink.events
            .iter()
            .all(|event| event.event_type != "routing.decision.made"),
        "image command should bypass chat model route events"
    );
}

#[tokio::test]
async fn respond_action_emits_resolved_fact_with_action_identity() {
    let backend = RuntimeBackend::new();
    let request = request_for_test("hello", None, None);
    let mut sink = TestRuntimeEventSink::default();

    ExecutionBackend::respond_action(
        &backend,
        ActionRespondRequest {
            host: RuntimeHostContext::default(),
            session: request.session,
            turn: Some(request.turn),
            request_id: "ask-1".to_string(),
            action_type: AgentSessionActionType::AskUser,
            confirmed: false,
            response: None,
            user_data: None,
            metadata: None,
            event_name: None,
            action_scope: Some(AgentSessionActionScope {
                session_id: Some("session-1".to_string()),
                thread_id: Some("thread-1".to_string()),
                turn_id: Some("turn-1".to_string()),
            }),
        },
        &mut sink,
    )
    .await
    .expect("denied ask_user action should emit a resolved fact");

    assert_eq!(sink.events.len(), 1);
    let event = &sink.events[0];
    assert_eq!(event.event_type, "action.resolved");
    assert_eq!(event.payload["requestId"].as_str(), Some("ask-1"));
    assert_eq!(event.payload["actionId"].as_str(), Some("ask-1"));
    assert_eq!(event.payload["actionType"].as_str(), Some("ask_user"));
    assert_eq!(event.payload["confirmed"].as_bool(), Some(false));
    assert_eq!(event.payload["decision"].as_str(), Some("deny"));
    assert_eq!(event.payload["scope"]["turnId"].as_str(), Some("turn-1"));
}

#[tokio::test]
async fn runtime_backend_starts_enabled_lime_mcp_servers_before_tool_sync() {
    let data_source = Arc::new(TestMcpAutostartDataSource::new(vec![
        json!({
            "name": "context7",
            "enabled_lime": true,
            "is_running": false
        }),
        json!({
            "name": "already-running",
            "enabledLime": true,
            "isRunning": true
        }),
        json!({
            "name": "disabled",
            "enabled_lime": false,
            "is_running": false
        }),
        json!({
            "name": "runtime-camel",
            "enabledLime": true,
            "runtimeStatus": {
                "isRunning": false
            }
        }),
        json!({
            "name": "runtime-running",
            "enabled_lime": true,
            "runtime_status": {
                "is_running": true
            }
        }),
        json!({
            "name": " ",
            "enabled_lime": true,
            "is_running": false
        }),
    ]));
    let app_data_source: Arc<dyn AppDataSource> = data_source.clone();

    mcp_bridges::start_enabled_lime_mcp_servers_if_needed(app_data_source).await;

    assert_eq!(
        data_source.started_servers(),
        vec!["context7".to_string(), "runtime-camel".to_string()]
    );
}

#[tokio::test]
async fn runtime_backend_mcp_autostart_failure_does_not_block_turn_preflight() {
    let data_source = Arc::new(
        TestMcpAutostartDataSource::new(vec![json!({
            "name": "context7",
            "enabled_lime": true,
            "is_running": false
        })])
        .with_fail_start(),
    );
    let app_data_source: Arc<dyn AppDataSource> = data_source.clone();

    mcp_bridges::start_enabled_lime_mcp_servers_if_needed(app_data_source).await;

    assert_eq!(data_source.started_servers(), vec!["context7".to_string()]);
}

#[tokio::test]
async fn runtime_backend_registers_memory_tools_in_agent_registry() {
    let db: lime_core::database::DbConnection = std::sync::Arc::new(std::sync::Mutex::new(
        rusqlite::Connection::open_in_memory().expect("db"),
    ));
    {
        let conn = db.lock().expect("db lock");
        lime_core::database::schema::create_tables(&conn).expect("schema");
    }
    lime_agent::initialize_agent_runtime(db.clone()).expect("runtime dirs");

    let backend = RuntimeBackend::with_db(db.clone());
    ExecutionBackend::set_app_data_source(&backend, std::sync::Arc::new(NoopAppDataSource))
        .expect("app data source should be accepted");
    backend
        .agent_state
        .init_agent_with_db(&db)
        .await
        .expect("agent should initialize");
    backend
        .register_current_native_tools_if_available()
        .await
        .expect("memory tools should register");

    let agent_arc = backend.agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard.as_ref().expect("agent");
    let registry = agent.tool_registry().read().await;
    for tool_name in [
        MEMORY_LIST_TOOL_NAME,
        MEMORY_READ_TOOL_NAME,
        MEMORY_SEARCH_TOOL_NAME,
        MEMORY_ADD_NOTE_TOOL_NAME,
    ] {
        assert!(
            registry.contains_native(tool_name),
            "{tool_name} should be registered as a native memory tool"
        );
    }
}

#[tokio::test]
async fn runtime_backend_prepares_content_factory_search_artifact_events_with_real_tool_output() {
    let db: lime_core::database::DbConnection = std::sync::Arc::new(std::sync::Mutex::new(
        rusqlite::Connection::open_in_memory().expect("db"),
    ));
    {
        let conn = db.lock().expect("db lock");
        lime_core::database::schema::create_tables(&conn).expect("schema");
    }
    lime_agent::initialize_agent_runtime(db.clone()).expect("runtime dirs");

    let backend = RuntimeBackend::with_db(db.clone());
    ExecutionBackend::set_app_data_source(&backend, std::sync::Arc::new(NoopAppDataSource))
        .expect("app data source should be accepted");
    backend
        .agent_state
        .init_agent_with_db(&db)
        .await
        .expect("agent should initialize");
    backend
        .agent_state
        .register_fixed_web_search_tool()
        .await
        .expect("web search tool should register");

    let request = request_for_test("写一篇文章", None, None);
    let mut events = vec![
        RuntimeEvent::new("turn.started", json!({})),
        article_workspace_search_request_event("Lime 写文章"),
        RuntimeEvent::new("turn.completed", json!({})),
    ];

    ExecutionBackend::prepare_runtime_worker_artifact_events(&backend, &request, &mut events)
        .await
        .expect("content factory search events");

    assert_eq!(
        &events
            .iter()
            .map(|event| event.event_type.as_str())
            .collect::<Vec<_>>()[0..4],
        vec!["turn.started", "tool.started", "tool.args", "tool.result",]
    );
    for event in events.iter().filter(|event| {
        matches!(
            event.event_type.as_str(),
            "tool.started" | "tool.args" | "tool.result"
        )
    }) {
        assert_eq!(
            event.payload["source"],
            "workspace_patch_host_tool_requests"
        );
        assert_eq!(event.payload["workflowKey"], "content_article_workflow");
        assert_eq!(event.payload["workflow_key"], "content_article_workflow");
        assert_eq!(
            event.payload["metadata"]["source"],
            "workspace_patch_host_tool_requests"
        );
        assert_eq!(
            event.payload["metadata"]["workflowKey"],
            "content_article_workflow"
        );
        assert_eq!(
            event.payload["metadata"]["workflow_key"],
            "content_article_workflow"
        );
    }
    assert_eq!(
        events.last().map(|event| event.event_type.as_str()),
        Some("turn.completed")
    );
    let artifact_events = events
        .iter()
        .filter(|event| event.event_type == "artifact.snapshot")
        .collect::<Vec<_>>();
    assert_eq!(
        artifact_events.len(),
        1,
        "宿主只回填检索 evidence，不应把最终 documentText 回切成伪流式 artifact"
    );
    assert!(artifact_events[0].payload["artifact"]["metadata"]
        .get("streamSequence")
        .is_none());

    let artifact_event = artifact_events.last().expect("artifact event");
    assert_eq!(
        artifact_event.payload["artifact"]["filePath"],
        ".lime/artifacts/content-factory/workspace-patch.json"
    );
    let patch = &artifact_event.payload["artifact"]["metadata"]["contentFactoryWorkspacePatch"];
    let evidence = patch["objects"][0]["source"]["searchEvidence"]
        .as_array()
        .expect("search evidence");
    assert_eq!(evidence.len(), 1);
    assert_eq!(evidence[0]["tool"], "WebSearch");
    assert_eq!(evidence[0]["status"], "completed");
    assert_eq!(
        evidence[0]["summary"],
        "session=session-1 query=Lime 写文章 result=found"
    );
    assert_eq!(
        patch["objects"][0]["source"]["hostSearchStatus"],
        "completed"
    );
    assert_eq!(patch["objects"][0]["source"]["hostToolStatus"], "completed");
    assert_eq!(
        patch["objects"][0]["source"]["hostSearchEvidence"],
        Value::Array(evidence.clone())
    );
    assert_eq!(
        patch["objects"][0]["source"]["hostToolEvidence"],
        Value::Array(evidence.clone())
    );
}

#[tokio::test]
async fn runtime_backend_adds_content_factory_artifact_path_without_search_requests() {
    let backend = RuntimeBackend::new();
    let request = request_for_test("写一篇文章", None, None);
    let mut events = vec![
        RuntimeEvent::new("turn.started", json!({})),
        article_workspace_snapshot_event_without_search(),
        RuntimeEvent::new("turn.completed", json!({})),
    ];

    ExecutionBackend::prepare_runtime_worker_artifact_events(&backend, &request, &mut events)
        .await
        .expect("content factory artifact path");

    assert_eq!(
        events
            .iter()
            .map(|event| event.event_type.as_str())
            .collect::<Vec<_>>(),
        vec!["turn.started", "artifact.snapshot", "turn.completed"]
    );
    assert_eq!(
        events[1].payload["artifact"]["filePath"],
        ".lime/artifacts/content-factory/workspace-patch.json"
    );
    assert_eq!(
        events[1].payload["artifact"]["path"],
        ".lime/artifacts/content-factory/workspace-patch.json"
    );
}

#[tokio::test]
async fn runtime_backend_keeps_content_factory_search_artifact_events_closed_on_tool_failure() {
    let db: lime_core::database::DbConnection = std::sync::Arc::new(std::sync::Mutex::new(
        rusqlite::Connection::open_in_memory().expect("db"),
    ));
    {
        let conn = db.lock().expect("db lock");
        lime_core::database::schema::create_tables(&conn).expect("schema");
    }
    lime_agent::initialize_agent_runtime(db.clone()).expect("runtime dirs");

    let backend = RuntimeBackend::with_db(db.clone());
    ExecutionBackend::set_app_data_source(&backend, std::sync::Arc::new(NoopAppDataSource))
        .expect("app data source should be accepted");
    backend
        .agent_state
        .init_agent_with_db(&db)
        .await
        .expect("agent should initialize");
    backend
        .agent_state
        .register_failing_web_search_tool()
        .await
        .expect("web search tool should register");

    let request = request_for_test("写一篇文章", None, None);
    let mut events = vec![
        RuntimeEvent::new("turn.started", json!({})),
        article_workspace_search_request_event("Lime 写文章"),
        RuntimeEvent::new("turn.completed", json!({})),
    ];

    ExecutionBackend::prepare_runtime_worker_artifact_events(&backend, &request, &mut events)
        .await
        .expect("content factory search events");

    assert_eq!(
        events
            .iter()
            .map(|event| event.event_type.as_str())
            .collect::<Vec<_>>(),
        vec![
            "turn.started",
            "tool.started",
            "tool.args",
            "tool.failed",
            "artifact.snapshot",
            "turn.completed"
        ]
    );
    let failed_tool_event = events
        .iter()
        .find(|event| event.event_type == "tool.failed")
        .expect("failed tool event");
    assert_eq!(
        failed_tool_event.payload["source"],
        "workspace_patch_host_tool_requests"
    );
    assert_eq!(
        failed_tool_event.payload["metadata"]["workflowKey"],
        "content_article_workflow"
    );

    let artifact_events = events
        .iter()
        .filter(|event| event.event_type == "artifact.snapshot")
        .collect::<Vec<_>>();
    assert_eq!(artifact_events.len(), 1);

    let artifact_event = artifact_events.last().expect("artifact event");
    assert_eq!(
        artifact_event.payload["artifact"]["filePath"],
        ".lime/artifacts/content-factory/workspace-patch.json"
    );
    let patch = &artifact_event.payload["artifact"]["metadata"]["contentFactoryWorkspacePatch"];
    let evidence = patch["objects"][0]["source"]["searchEvidence"]
        .as_array()
        .expect("search evidence");
    assert_eq!(evidence.len(), 1);
    assert_eq!(evidence[0]["tool"], "WebSearch");
    assert_eq!(evidence[0]["status"], "failed");
    assert_eq!(evidence[0]["summary"], "");
    assert_eq!(patch["objects"][0]["source"]["hostSearchStatus"], "failed");
    assert_eq!(patch["objects"][0]["source"]["hostToolStatus"], "failed");
    assert_eq!(
        patch["objects"][0]["source"]["hostSearchEvidence"],
        Value::Array(evidence.clone())
    );
    assert_eq!(
        patch["objects"][0]["source"]["hostToolEvidence"],
        Value::Array(evidence.clone())
    );
    assert_eq!(patch["objects"][0]["status"], "failed");
    assert_eq!(
        patch["objects"][0]["summary"],
        "检索失败，文章草稿未达到可交付状态"
    );
}
