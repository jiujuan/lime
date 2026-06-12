use super::support::*;
use super::*;

#[tokio::test]
async fn read_session_projects_runtime_turns_into_gui_messages() {
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_messages".to_string()),
        thread_id: Some("thread_messages".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_messages".to_string(),
            title: Some("Messages Read".to_string()),
            uri: None,
            metadata: None,
        }),
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_messages".to_string(),
            turn_id: Some("turn_messages".to_string()),
            input: AgentInput {
                text: "你好，帮我整理今天的计划".to_string(),
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

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_messages".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let messages = detail["messages"].as_array().expect("messages");

    assert_eq!(detail["messages_count"], 2);
    assert_eq!(detail["history_cursor"]["loaded_count"], 2);
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0]["id"], "turn_messages:user");
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(
        messages[0]["content"][0]["text"],
        "你好，帮我整理今天的计划"
    );
    assert_eq!(messages[1]["id"], "turn_messages:assistant");
    assert_eq!(messages[1]["role"], "assistant");
    assert_eq!(
        messages[1]["content"][0]["text"],
        "你好！有什么可以帮你的吗？"
    );
}

#[tokio::test]
async fn read_session_projects_failed_runtime_event_into_diagnostics_and_error_item() {
    let core = RuntimeCore::with_backend(Arc::new(PartialFailureBackend));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_failed_read".to_string()),
        thread_id: Some("thread_failed_read".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_failed_read".to_string(),
            title: Some("Failed Read".to_string()),
            uri: None,
            metadata: None,
        }),
        locale: None,
    })
    .expect("session");

    let error = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_failed_read".to_string(),
                turn_id: Some("turn_failed_read".to_string()),
                input: AgentInput {
                    text: "整理今天的国际新闻".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("backend failure should propagate");
    let expected_error_message = error.to_string();
    assert!(expected_error_message.contains("provider stream timed out"));

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_failed_read".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read failed session");
    let detail = read.detail.expect("session detail");

    assert_eq!(
        detail["thread_read"]["diagnostics"]["latest_turn_status"],
        "failed"
    );
    assert_eq!(
        detail["thread_read"]["diagnostics"]["latest_turn_error_message"].as_str(),
        Some(expected_error_message.as_str())
    );
    assert_eq!(
        detail["thread_read"]["runtime_summary"]["latestTurnErrorMessage"].as_str(),
        Some(expected_error_message.as_str())
    );

    let messages = detail["messages"].as_array().expect("messages");
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0]["role"], "user");
    assert_eq!(messages[0]["content"][0]["text"], "整理今天的国际新闻");

    let items = detail["items"].as_array().expect("items");
    assert_eq!(items.len(), 1);
    assert_eq!(items[0]["type"], "error");
    assert_eq!(items[0]["status"], "failed");
    assert_eq!(
        items[0]["message"].as_str(),
        Some(expected_error_message.as_str())
    );
}

#[tokio::test]
async fn start_turn_hydrates_current_timeline_session_before_backend_submit() {
    let persisted_session = AgentSession {
        session_id: "sess_persisted".to_string(),
        thread_id: "thread_persisted".to_string(),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_persisted".to_string(),
            title: Some("Persisted Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "model": "gpt-test",
                "workingDir": "/workspace/current"
            })),
        }),
        status: AgentSessionStatus::Completed,
        created_at: "2026-06-06T00:00:00.000Z".to_string(),
        updated_at: "2026-06-06T00:00:10.000Z".to_string(),
    };
    let persisted_turn = AgentTurn {
        turn_id: "turn_existing".to_string(),
        session_id: persisted_session.session_id.clone(),
        thread_id: persisted_session.thread_id.clone(),
        status: AgentTurnStatus::Completed,
        started_at: Some("2026-06-06T00:00:01.000Z".to_string()),
        completed_at: Some("2026-06-06T00:00:09.000Z".to_string()),
    };
    let app_data_source = Arc::new(TestCurrentTimelineDataSource::new(
        AgentSessionReadResponse {
            session: persisted_session.clone(),
            turns: vec![persisted_turn],
            detail: None,
        },
    ));
    let backend = Arc::new(RecordingBackend::default());
    let core = RuntimeCore::with_backend_and_capability_source(
        backend.clone(),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "session.resume".to_string(),
                title: "Resume Session".to_string(),
                description: None,
                methods: vec![METHOD_AGENT_SESSION_TURN_START.to_string()],
            })
            .for_apps(["content-studio"])
            .for_workspaces(["workspace-main"])
            .for_sessions(["sess_persisted"]),
        ])),
    )
    .with_app_data_source(app_data_source.clone());

    let output = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_persisted".to_string(),
                turn_id: Some("turn_resumed".to_string()),
                input: AgentInput {
                    text: "继续".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: Some(RuntimeOptions {
                    capability_id: Some("session.resume".to_string()),
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
        .expect("resumed turn");

    assert_eq!(output.response.turn.turn_id, "turn_resumed");
    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].session.session_id, "sess_persisted");
    assert_eq!(requests[0].session.thread_id, "thread_persisted");
    assert_eq!(requests[0].turn.turn_id, "turn_resumed");
    drop(requests);

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_persisted".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("hydrated session remains readable");
    let turn_ids = read
        .turns
        .iter()
        .map(|turn| turn.turn_id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(turn_ids, vec!["turn_existing", "turn_resumed"]);

    let read_requests = app_data_source.read_requests();
    assert_eq!(read_requests.len(), 1);
    assert_eq!(read_requests[0].session_id, "sess_persisted");
}

#[tokio::test]
async fn read_session_projects_runtime_events_into_thread_read_tool_calls() {
    let core = RuntimeCore::with_backend(Arc::new(ToolReadModelBackend));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_tool_read".to_string()),
        thread_id: Some("thread_tool_read".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_tool_read".to_string(),
            title: Some("Tool Read".to_string()),
            uri: None,
            metadata: Some(json!({
                "executionStrategy": "react"
            })),
        }),
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_tool_read".to_string(),
            turn_id: Some("turn_tool_read".to_string()),
            input: AgentInput {
                text: "整理今天的国际新闻".to_string(),
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

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_tool_read".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    assert_eq!(detail["execution_strategy"], "react");
    assert_eq!(detail["thread_read"]["status"], "completed");
    assert_eq!(detail["thread_read"]["execution_strategy"], "react");
    let tool_calls = detail["thread_read"]["tool_calls"]
        .as_array()
        .expect("tool calls");
    assert_eq!(tool_calls.len(), 2);
    let web_fetch = tool_calls
        .iter()
        .find(|call| call["tool_name"] == "WebFetch")
        .expect("WebFetch call");
    assert_eq!(web_fetch["status"], "completed");
    assert_eq!(web_fetch["success"], true);
    assert_eq!(web_fetch["output_preview"], "fetched https://example.com");

    let web_search = tool_calls
        .iter()
        .find(|call| call["tool_name"] == "WebSearch")
        .expect("WebSearch call");
    assert_eq!(web_search["id"], "search-call-1");
    assert_eq!(web_search["status"], "completed");
    assert_eq!(web_search["success"], true);
    assert_eq!(web_search["output_preview"], "search results");
}

#[tokio::test]
async fn read_session_projects_runtime_events_into_thread_read_artifacts() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_thread_read_artifacts".to_string()),
        thread_id: Some("thread_read_artifacts".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_thread_read_artifacts".to_string(),
                turn_id: Some("turn_thread_read_artifacts".to_string()),
                input: AgentInput {
                    text: "生成内容工厂产物".to_string(),
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
    core.append_external_runtime_events(
        "sess_thread_read_artifacts",
        Some(&turn.turn_id),
        vec![RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifact": {
                    "artifactId": "artifact-content-batch",
                    "path": ".lime/artifacts/content-batch.json",
                    "title": "Content Batch",
                    "kind": "content_factory.workspace_patch",
                    "status": "ready",
                    "metadata": {
                        "contentFactoryWorkspacePatch": {
                            "kind": "content_batch",
                            "contentBatch": {
                                "count": 1
                            }
                        }
                    }
                }
            }),
        )],
    )
    .expect("append artifact event");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_thread_read_artifacts".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let artifacts = detail["thread_read"]["artifacts"]
        .as_array()
        .expect("thread read artifacts");

    assert_eq!(artifacts.len(), 1);
    assert_eq!(detail["artifacts"], detail["thread_read"]["artifacts"]);
    assert_eq!(artifacts[0]["artifactRef"], "artifact-content-batch");
    assert_eq!(artifacts[0]["path"], ".lime/artifacts/content-batch.json");
    assert_eq!(artifacts[0]["kind"], "content_factory.workspace_patch");
    assert_eq!(artifacts[0]["status"], "ready");
    assert_eq!(
        artifacts[0]["metadata"]["contentFactoryWorkspacePatch"]["kind"],
        "content_batch"
    );
    assert!(artifacts[0]["content"].is_null());
    assert_eq!(artifacts[0]["contentStatus"], "notRequested");
}

#[tokio::test]
async fn start_turn_missing_current_timeline_session_still_fails_closed() {
    let app_data_source = Arc::new(TestCurrentTimelineDataSource {
        persisted: None,
        objective: Mutex::new(None),
        audit_updates: Mutex::new(Vec::new()),
        read_requests: Mutex::new(Vec::new()),
        knowledge_compile_requests: Mutex::new(Vec::new()),
    });
    let backend = Arc::new(RecordingBackend::default());
    let core =
        RuntimeCore::with_backend(backend.clone()).with_app_data_source(app_data_source.clone());

    let error = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_missing".to_string(),
                turn_id: Some("turn_missing".to_string()),
                input: AgentInput {
                    text: "继续".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect_err("missing session should fail closed");

    assert_eq!(
        error.into_jsonrpc_error().code,
        error_codes::SESSION_NOT_FOUND
    );
    assert!(backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned")
        .is_empty());
    let read_requests = app_data_source.read_requests();
    assert_eq!(read_requests.len(), 1);
    assert_eq!(read_requests[0].session_id, "sess_missing");
}
