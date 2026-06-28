use super::support::*;
use super::*;

#[tokio::test]
async fn compact_agent_session_writes_session_context_artifact() {
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let sidecar_store = Arc::new(SidecarStore::new(sidecar_root.path()).expect("sidecar store"));
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend))
        .with_sidecar_store(sidecar_store.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_compact".to_string()),
        thread_id: Some("thread_compact".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_compact".to_string(),
            turn_id: Some("turn_compact_1".to_string()),
            input: AgentInput {
                text: "请总结上下文".to_string(),
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

    let output = core
        .compact_agent_session(AgentSessionCompactParams {
            session_id: "sess_compact".to_string(),
            event_name: None,
        })
        .await
        .expect("compact");

    assert!(output.response.compacted);
    let completed = output
        .events
        .iter()
        .find(|event| event.event_type == "context.compaction.completed")
        .expect("completed event");
    assert_eq!(completed.payload["contextEpoch"].as_u64(), Some(1));
    assert_eq!(
        completed.payload["tailStartTurnId"].as_str(),
        Some("turn_compact_1")
    );
    assert_eq!(
        completed.payload["artifact"]["policy"]["historyRewrite"].as_bool(),
        Some(false)
    );
    assert_eq!(
        completed.payload["artifact"]["policy"]["longTermMemoryWrite"].as_bool(),
        Some(false)
    );
    let relative_path = completed.payload["sidecarRef"]["relativePath"]
        .as_str()
        .expect("sidecar relative path");
    let sidecar = sidecar_store
        .read_text(relative_path)
        .expect("sidecar content");
    assert!(sidecar.contains("\"schema\": \"session_context_compaction.v1\""));
    assert!(sidecar.contains("请总结上下文"));
}

#[tokio::test]
async fn compact_agent_session_injects_next_turn_session_context_packet() {
    let backend = Arc::new(FinalDoneRecordingBackend {
        requests: Mutex::new(Vec::new()),
    });
    let core = RuntimeCore::with_backend(backend.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_compact_next_turn".to_string()),
        thread_id: Some("thread_compact_next_turn".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_compact_next_turn".to_string(),
            turn_id: Some("turn_compact_next_1".to_string()),
            input: AgentInput {
                text: "第一轮需要保留的事实".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("first turn");
    core.compact_agent_session(AgentSessionCompactParams {
        session_id: "sess_compact_next_turn".to_string(),
        event_name: None,
    })
    .await
    .expect("compact");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_compact_next_turn".to_string(),
            turn_id: Some("turn_compact_next_2".to_string()),
            input: AgentInput {
                text: "继续".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                metadata: Some(json!({
                    "system_prompt": "base prompt"
                })),
                ..RuntimeOptions::default()
            }),
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("second turn");

    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    assert_eq!(requests.len(), 2);
    let metadata = requests[1]
        .runtime_options
        .as_ref()
        .and_then(|options| options.metadata.as_ref())
        .expect("runtime metadata");
    let compaction_context = metadata
        .get(crate::runtime::memory_prompt::SESSION_COMPACTION_PROMPT_CONTEXT_KEY)
        .expect("compaction prompt context");
    assert_eq!(
        compaction_context["schema"].as_str(),
        Some("session_compaction_prompt_context.v1")
    );
    assert_eq!(compaction_context["contextEpoch"].as_u64(), Some(1));
    assert!(compaction_context["summary"]
        .as_str()
        .expect("summary")
        .contains("Turn completed."));
    let telemetry = metadata
        .get(crate::runtime::memory_prompt::CONTEXT_PACKET_TELEMETRY_KEY)
        .expect("context telemetry");
    assert_eq!(telemetry["packetCount"].as_u64(), Some(1));
    assert_eq!(
        telemetry["packets"][0]["kind"].as_str(),
        Some("session_context_compaction")
    );
    assert_eq!(
        telemetry["packets"][0]["source"].as_str(),
        Some("session.compaction")
    );

    let prompt = crate::runtime::memory_prompt::append_memory_context_to_system_prompt(
        Some("base prompt".to_string()),
        Some(metadata),
    )
    .expect("system prompt");
    assert!(prompt.starts_with("base prompt\n\n## Session Context Compaction"));
    assert!(prompt.contains("不是长期记忆"));
    assert!(prompt.contains("不得把本摘要自动写入 memory store"));
}

#[tokio::test]
async fn list_agent_sessions_projects_runtime_core_sessions_only() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_old".to_string()),
        thread_id: Some("thread_old".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-old".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "project".to_string(),
            id: "old".to_string(),
            title: Some("Old Workspace Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "model": "gpt-test",
                "workingDir": "/tmp/old",
                "executionStrategy": "runtime-core"
            })),
        }),
        locale: None,
    })
    .expect("old workspace session");
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_current".to_string()),
        thread_id: Some("thread_current".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "project".to_string(),
            id: "current".to_string(),
            title: Some("Current Workspace Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "modelName": "claude-test",
                "working_dir": "/tmp/current",
                "execution_strategy": "runtime-core"
            })),
        }),
        locale: None,
    })
    .expect("current workspace session");

    let response = core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-current".to_string()),
            limit: Some(1),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    assert_eq!(response.sessions.len(), 1);
    assert_eq!(response.sessions[0].session_id, "sess_current");
    assert_eq!(
        response.sessions[0].thread_id.as_deref(),
        Some("thread_current")
    );
    assert_eq!(
        response.sessions[0].title.as_deref(),
        Some("Current Workspace Session")
    );
    assert_eq!(response.sessions[0].model, "claude-test");
    assert_eq!(
        response.sessions[0].working_dir.as_deref(),
        Some("/tmp/current")
    );
    assert_eq!(
        response.sessions[0].execution_strategy.as_deref(),
        Some("runtime-core")
    );
}

#[tokio::test]
async fn list_agent_sessions_keeps_workspace_id_filter_when_workspace_root_is_available() {
    let app_data_source = Arc::new(
        TestSessionDataSource::new(empty_agent_session_read_response("legacy_unexpected"))
            .with_workspace(json!({
                "id": "workspace-current",
                "rootPath": "/tmp/current",
            })),
    );
    let core = RuntimeCore::default().with_app_data_source(app_data_source);
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_workspace_only".to_string()),
        thread_id: Some("thread_workspace_only".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_workspace_only".to_string(),
            title: Some("Workspace Only Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "modelName": "fixture-model",
                "executionStrategy": "react"
            })),
        }),
        locale: None,
    })
    .expect("workspace-only session");
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_cwd_only".to_string()),
        thread_id: Some("thread_cwd_only".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: None,
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_cwd_only".to_string(),
            title: Some("Cwd Only Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "workingDir": "/tmp/current",
                "modelName": "fixture-model",
                "executionStrategy": "react"
            })),
        }),
        locale: None,
    })
    .expect("cwd-only session");

    let response = core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-current".to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");
    let ids = response
        .sessions
        .iter()
        .map(|session| session.session_id.as_str())
        .collect::<Vec<_>>();

    assert!(ids.contains(&"sess_workspace_only"));
    assert!(ids.contains(&"sess_cwd_only"));
}

#[tokio::test]
async fn list_agent_sessions_derives_placeholder_title_from_first_user_message() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_auto_title".to_string()),
        thread_id: Some("thread_auto_title".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_auto_title".to_string(),
            title: Some("新对话".to_string()),
            uri: None,
            metadata: Some(json!({ "title": "新对话" })),
        }),
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_auto_title".to_string(),
            turn_id: Some("turn_auto_title".to_string()),
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

    let listed = core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-current".to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    assert_eq!(listed.sessions.len(), 1);
    assert_eq!(
        listed.sessions[0].title.as_deref(),
        Some("整理今天的国际新闻")
    );
}

#[tokio::test]
async fn list_agent_sessions_preserves_explicit_title_when_user_message_exists() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_manual_title".to_string()),
        thread_id: Some("thread_manual_title".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_manual_title".to_string(),
            title: Some("手动标题".to_string()),
            uri: None,
            metadata: Some(json!({ "title": "手动标题" })),
        }),
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_manual_title".to_string(),
            turn_id: Some("turn_manual_title".to_string()),
            input: AgentInput {
                text: "不要覆盖我".to_string(),
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

    let listed = core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-current".to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    assert_eq!(listed.sessions.len(), 1);
    assert_eq!(listed.sessions[0].title.as_deref(), Some("手动标题"));
}

#[tokio::test]
async fn list_agent_sessions_excludes_hidden_runtime_core_sessions() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_hidden".to_string()),
        thread_id: Some("thread_hidden".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "hidden".to_string(),
            title: Some("Internal Smoke Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "harness": {
                    "hiddenFromUserRecents": true,
                    "source": "unit"
                },
                "model": "gpt-test"
            })),
        }),
        locale: None,
    })
    .expect("hidden session");
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_visible".to_string()),
        thread_id: Some("thread_visible".to_string()),
        app_id: "desktop".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "visible".to_string(),
            title: Some("Visible Session".to_string()),
            uri: None,
            metadata: Some(json!({
                "model": "gpt-test"
            })),
        }),
        locale: None,
    })
    .expect("visible session");

    let response = core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-current".to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list sessions");

    let ids = response
        .sessions
        .iter()
        .map(|session| session.session_id.as_str())
        .collect::<Vec<_>>();
    assert_eq!(ids, vec!["sess_visible"]);

    let hidden = core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_hidden".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("hidden session remains readable by id");
    assert_eq!(hidden.session.session_id, "sess_hidden");
}

#[tokio::test]
async fn read_session_current_does_not_fallback_to_persistent_history() {
    let core = RuntimeCore::default();
    let error = core
        .read_session_current(AgentSessionReadParams {
            session_id: "missing_legacy_session".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect_err("missing session should fail closed");

    assert_eq!(
        error.into_jsonrpc_error().code,
        error_codes::SESSION_NOT_FOUND
    );
}

#[tokio::test]
async fn read_session_current_repairs_and_reads_jsonl_projection() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend))
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_projection_read".to_string()),
        thread_id: Some("thread_projection_read".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_projection_read".to_string(),
            turn_id: Some("turn_projection_read".to_string()),
            input: AgentInput {
                text: "hello".to_string(),
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
    projection_store
        .clear_session("sess_projection_read")
        .expect("simulate missing projection");

    let app_data_source = Arc::new(TestSessionDataSource::new(
        empty_agent_session_read_response("legacy_unexpected"),
    ));
    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer)
        .with_projection_store(projection_store.clone())
        .with_app_data_source(app_data_source);

    let read = restarted_core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_projection_read".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read from projection");

    assert_eq!(read.session.session_id, "sess_projection_read");
    assert_eq!(read.session.thread_id, "thread_projection_read");
    assert_eq!(read.session.status, AgentSessionStatus::Completed);
    assert_eq!(read.turns.len(), 1);
    assert_eq!(read.turns[0].turn_id, "turn_projection_read");
    assert_eq!(read.turns[0].status, AgentTurnStatus::Completed);
    let detail = read.detail.expect("projection detail");
    assert_eq!(detail["projection_source"], "runtime.projection_1");
    assert_eq!(detail["thread_read"]["status"].as_str(), Some("completed"));
    let projected = projection_store
        .read_session("sess_projection_read")
        .expect("read repaired projection")
        .expect("projection row");
    assert_eq!(projected.last_event_sequence, 4);
}

#[tokio::test]
async fn read_session_respects_history_limit_for_runtime_core_session() {
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_runtime_history_limit".to_string()),
        thread_id: Some("thread_runtime_history_limit".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    for index in 0..3 {
        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_runtime_history_limit".to_string(),
                turn_id: Some(format!("turn_runtime_history_limit_{index}")),
                input: AgentInput {
                    text: format!("hello {index}"),
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
    }

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_runtime_history_limit".to_string(),
            history_limit: Some(2),
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read");
    let detail = read.detail.expect("detail");

    assert_eq!(detail["messages_count"].as_u64(), Some(6));
    assert_eq!(detail["history_limit"].as_u64(), Some(2));
    assert_eq!(detail["history_cursor"]["loaded_count"].as_u64(), Some(2));
    assert_eq!(detail["history_truncated"].as_bool(), Some(true));
    assert_eq!(detail["messages"].as_array().expect("messages").len(), 2);
}

#[tokio::test]
async fn read_session_current_uses_projection_summary_for_limited_history() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend))
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_projection_fast_read".to_string()),
        thread_id: Some("thread_projection_fast_read".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_projection_fast_read".to_string(),
            turn_id: Some("turn_projection_fast_read_1".to_string()),
            input: AgentInput {
                text: "first".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("first turn");
    let watermark_before = projection_store
        .read_watermark("sess_projection_fast_read")
        .expect("watermark")
        .expect("watermark")
        .last_sequence;
    event_log_writer
        .append(&AgentEvent {
            event_id: "evt_projection_fast_read_stale_extra".to_string(),
            sequence: watermark_before + 100,
            session_id: "sess_projection_fast_read".to_string(),
            thread_id: Some("thread_projection_fast_read".to_string()),
            turn_id: Some("turn_projection_fast_read_stale".to_string()),
            event_type: "message.created".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "input": {
                    "text": "stale event should not block limited read",
                    "attachments": []
                }
            }),
        })
        .expect("append stale event");

    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer)
        .with_projection_store(projection_store.clone());
    let read = restarted_core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_projection_fast_read".to_string(),
            history_limit: Some(1),
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read from projection summary");
    let detail = read.detail.expect("detail");
    let watermark_after = projection_store
        .read_watermark("sess_projection_fast_read")
        .expect("watermark after")
        .expect("watermark after")
        .last_sequence;

    assert_eq!(watermark_after, watermark_before);
    assert_eq!(detail["projection_source"], "runtime.projection_1");
    assert_eq!(detail["messages_count"].as_u64(), Some(2));
    assert_eq!(detail["history_cursor"]["loaded_count"].as_u64(), Some(1));
    assert_eq!(
        detail["messages"][0]["metadata"]["source"].as_str(),
        Some("projection_summary")
    );
    assert!(detail["messages"][0]["timestamp"].as_f64().is_some());
}

#[tokio::test]
async fn read_session_current_pages_projection_summary_with_cursor() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend))
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_projection_cursor_read".to_string()),
        thread_id: Some("thread_projection_cursor_read".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    for index in 0..3 {
        core.start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_projection_cursor_read".to_string(),
                turn_id: Some(format!("turn_projection_cursor_read_{index}")),
                input: AgentInput {
                    text: format!("user {index}"),
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
    }

    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer)
        .with_projection_store(projection_store);
    let tail = restarted_core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_projection_cursor_read".to_string(),
            history_limit: Some(2),
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read tail");
    let tail_detail = tail.detail.expect("tail detail");
    let oldest_message_id = tail_detail["history_cursor"]["oldest_message_id"]
        .as_i64()
        .expect("oldest message id");
    assert_eq!(tail_detail["messages_count"].as_u64(), Some(6));
    assert_eq!(
        tail_detail["history_cursor"]["start_index"].as_u64(),
        Some(4)
    );
    assert_eq!(
        tail_detail["messages"][0]["content"][0]["text"].as_str(),
        Some("user 2")
    );

    let page = restarted_core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_projection_cursor_read".to_string(),
            history_limit: Some(2),
            history_offset: None,
            history_before_message_id: Some(oldest_message_id),
        })
        .await
        .expect("read cursor page");
    let page_detail = page.detail.expect("page detail");

    assert_eq!(
        page_detail["history_cursor"]["start_index"].as_u64(),
        Some(2)
    );
    assert_eq!(
        page_detail["messages"][0]["content"][0]["text"].as_str(),
        Some("user 1")
    );
    assert_eq!(
        page_detail["messages"][1]["content"][0]["text"].as_str(),
        Some("你好！有什么可以帮你的吗？")
    );
}

#[tokio::test]
async fn list_agent_sessions_derives_projection_title_from_first_user_message() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend))
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_projection_title".to_string()),
        thread_id: Some("thread_projection_title".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: Some(app_server_protocol::BusinessObjectRef {
            kind: "agent.session".to_string(),
            id: "sess_projection_title".to_string(),
            title: Some("未命名对话".to_string()),
            uri: None,
            metadata: Some(json!({
                "title": "未命名对话",
                "modelName": "fixture-model",
            })),
        }),
        locale: None,
    })
    .expect("session");

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_projection_title".to_string(),
            turn_id: Some("turn_projection_title".to_string()),
            input: AgentInput {
                text: "根据原生方式生成标题".to_string(),
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

    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer)
        .with_projection_store(projection_store);
    let listed = restarted_core
        .list_agent_sessions(AgentSessionListParams {
            workspace_id: Some("workspace-current".to_string()),
            limit: Some(20),
            ..AgentSessionListParams::default()
        })
        .await
        .expect("list projected sessions");

    assert_eq!(listed.sessions.len(), 1);
    assert_eq!(listed.sessions[0].session_id, "sess_projection_title");
    assert_eq!(
        listed.sessions[0].title.as_deref(),
        Some("根据原生方式生成标题")
    );
}
