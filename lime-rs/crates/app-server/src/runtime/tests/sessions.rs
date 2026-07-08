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

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_compact".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("detail");
    let items = detail["items"].as_array().expect("items");
    assert!(items.iter().any(|item| {
        item["type"] == "context_compaction"
            && item["id"] == completed.payload["compactionId"]
            && item["status"] == "completed"
    }));
}

#[tokio::test]
async fn compact_agent_session_injects_next_turn_session_context_packet() {
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let sidecar_store = Arc::new(SidecarStore::new(sidecar_root.path()).expect("sidecar store"));
    let backend = Arc::new(TurnCompletedRecordingBackend {
        requests: Mutex::new(Vec::new()),
    });
    let core = RuntimeCore::with_backend(backend.clone()).with_sidecar_store(sidecar_store.clone());
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
                    "system_prompt": "base prompt",
                    "harness": {
                        "model_request_policy": {
                            "context_policy": {
                                "context_window": 8000
                            }
                        }
                    }
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
    assert_eq!(
        compaction_context["sidecarRef"]["kind"].as_str(),
        Some("context_compaction")
    );
    assert!(compaction_context["sidecarRef"]["sha256"]
        .as_str()
        .is_some_and(|value| !value.is_empty()));
    assert_eq!(compaction_context["packetTokenBudget"].as_u64(), Some(720));
    assert_eq!(
        compaction_context["contextBudgetPolicy"]["source"].as_str(),
        Some("model_request_policy")
    );
    assert_eq!(
        compaction_context["contextBudgetPolicy"]["modelContextWindow"].as_u64(),
        Some(7600)
    );
    assert_eq!(
        compaction_context["contextBudgetPolicy"]["autoCompactTokenLimit"].as_u64(),
        Some(7200)
    );
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
    assert_eq!(telemetry["packets"][0]["tokenBudget"].as_u64(), Some(720));
    assert_eq!(
        telemetry["packets"][0]["fragmentEnvelope"]["sidecar_reference"]["kind"].as_str(),
        Some("context_compaction")
    );
    assert!(
        telemetry["packets"][0]["fragmentEnvelope"]["sidecar_reference"]["sha256"]
            .as_str()
            .is_some_and(|value| !value.is_empty())
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
async fn read_session_current_projection_summary_projects_turn_usage() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let core = RuntimeCore::with_backend(Arc::new(CompletedBackend))
        .with_event_log_writer(event_log_writer.clone())
        .with_projection_store(projection_store.clone());
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_projection_usage_read".to_string()),
        thread_id: Some("thread_projection_usage_read".to_string()),
        app_id: "agent-chat".to_string(),
        workspace_id: Some("workspace-current".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_projection_usage_read".to_string(),
            turn_id: Some("turn_projection_usage_read".to_string()),
            input: AgentInput {
                text: "@配图 画一张深圳夏天的图".to_string(),
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
    let watermark_before = projection_store
        .read_watermark("sess_projection_usage_read")
        .expect("watermark")
        .expect("watermark")
        .last_sequence;
    event_log_writer
        .append(&AgentEvent {
            event_id: "evt_projection_usage_terminal".to_string(),
            sequence: watermark_before + 100,
            session_id: "sess_projection_usage_read".to_string(),
            thread_id: Some("thread_projection_usage_read".to_string()),
            turn_id: Some("turn_projection_usage_read".to_string()),
            event_type: "turn.completed".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "usage": {
                    "input_tokens": 1175,
                    "output_tokens": 112,
                    "cached_input_tokens": 0
                }
            }),
        })
        .expect("append usage terminal event");

    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer)
        .with_projection_store(projection_store.clone());
    let read = restarted_core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_projection_usage_read".to_string(),
            history_limit: Some(1),
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read projection summary");
    let detail = read.detail.expect("detail");
    let watermark_after = projection_store
        .read_watermark("sess_projection_usage_read")
        .expect("watermark after")
        .expect("watermark after")
        .last_sequence;

    assert_eq!(watermark_after, watermark_before);
    assert_eq!(detail["projection_source"], "runtime.projection_1");
    assert_eq!(
        detail["messages"][0]["metadata"]["source"].as_str(),
        Some("projection_summary")
    );
    assert_eq!(
        detail["turns"][0]["usage"]["input_tokens"].as_u64(),
        Some(1175)
    );
    assert_eq!(
        detail["thread_read"]["turns"][0]["usage"]["output_tokens"].as_u64(),
        Some(112)
    );
    assert_eq!(
        detail["thread_read"]["diagnostics"]["latest_turn_usage"]["cached_input_tokens"].as_u64(),
        Some(0)
    );
    assert_eq!(
        detail["thread_read"]["runtime_summary"]["latestTurnUsage"]["input_tokens"].as_u64(),
        Some(1175)
    );
}

#[tokio::test]
async fn read_session_current_projection_summary_preserves_process_items() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let event_log_writer = Arc::new(EventLogWriter::new(&roots.event_log_root).expect("writer"));
    let projection_store =
        Arc::new(ProjectionStore::initialize(&roots.projection_db_path).expect("projection"));
    let events = vec![
        AgentEvent {
            event_id: "evt_projection_process_user".to_string(),
            sequence: 1,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "message.created".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "input": {
                    "text": "打开历史时保留工具调用和思考",
                    "attachments": []
                },
                "session": {
                    "workspaceId": "workspace-current",
                    "modelName": "fixture-model"
                }
            }),
        },
        AgentEvent {
            event_id: "evt_projection_process_reasoning".to_string(),
            sequence: 2,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "reasoning.delta".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "text": "我会先查找历史事件，再汇总结论。",
                "metadata": {
                    "source": "reasoning"
                }
            }),
        },
        AgentEvent {
            event_id: "evt_projection_process_tool".to_string(),
            sequence: 3,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "item.completed".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "item": {
                    "id": "tool-history-web-search",
                    "type": "tool_call",
                    "status": "completed",
                    "payload": {
                        "type": "tool_call",
                        "name": "WebSearch",
                        "arguments": {
                            "query": "history process preservation"
                        },
                        "output": "搜索完成",
                        "success": true
                    }
                }
            }),
        },
        AgentEvent {
            event_id: "evt_projection_process_commentary".to_string(),
            sequence: 4,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "message.delta".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "text": "上面工具还在查找。",
                "phase": "commentary"
            }),
        },
        AgentEvent {
            event_id: "evt_projection_process_routing".to_string(),
            sequence: 5,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "routing.decision.made".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "routingDecision": {
                    "decisionSource": "profile_model_slot",
                    "decisionReason": "profile_slot_selected",
                    "serviceModelSlot": "coding",
                    "selectedProvider": "custom-coding",
                    "selectedModel": "coder-large"
                }
            }),
        },
        AgentEvent {
            event_id: "evt_projection_process_commentary_batch".to_string(),
            sequence: 6,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "message.delta_batch".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "deltas": [
                    {
                        "text": "批量过程输出也要保留。"
                    },
                    {
                        "text": "不能混进最终结论。"
                    }
                ],
                "phase": "commentary"
            }),
        },
        AgentEvent {
            event_id: "evt_projection_process_test_started".to_string(),
            sequence: 7,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "test.started".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "testRunId": "test-history-read",
                "suite": "app-server",
                "commandSummary": "cargo test read_session_current_"
            }),
        },
        AgentEvent {
            event_id: "evt_projection_process_test_completed".to_string(),
            sequence: 8,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "test.completed".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "testRunId": "test-history-read",
                "suite": "app-server",
                "commandSummary": "cargo test read_session_current_",
                "result": "passed",
                "passed": 5,
                "failed": 0
            }),
        },
        AgentEvent {
            event_id: "evt_projection_process_ask".to_string(),
            sequence: 9,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "action.required".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "requestId": "ask-history-process",
                "actionType": "ask_user",
                "prompt": "是否继续对齐 Codex？",
                "questions": [
                    {
                        "question": "是否继续保留非工具过程项？",
                        "header": "历史",
                        "options": [
                            {
                                "label": "继续",
                                "description": "保留 reasoning、测试、告警和产物。"
                            }
                        ]
                    }
                ]
            }),
        },
        AgentEvent {
            event_id: "evt_projection_process_ask_resolved".to_string(),
            sequence: 10,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "action.resolved".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "requestId": "ask-history-process",
                "actionType": "ask_user",
                "decision": "submitted"
            }),
        },
        AgentEvent {
            event_id: "evt_projection_process_warning".to_string(),
            sequence: 11,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "runtime.warning".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "message": "模型路由发生降级，但任务继续。"
            }),
        },
        AgentEvent {
            event_id: "evt_projection_process_artifact".to_string(),
            sequence: 12,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "artifact.snapshot".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "artifact": {
                    "id": "artifact-history-workspace",
                    "kind": "article_workspace",
                    "title": "历史过程工作台",
                    "status": "completed",
                    "metadata": {
                        "pluginWorker": {
                            "appId": "content-factory",
                            "taskId": "task-history-workspace",
                            "taskKind": "content.article.generate",
                            "outputArtifactKind": "article_workspace"
                        },
                        "articleWorkspace": {
                            "objects": [
                                {
                                    "ref": {
                                        "appId": "agent-runtime",
                                        "sessionId": "sess_projection_process",
                                        "kind": "articleDraft",
                                        "id": "draft-history"
                                    },
                                    "kind": "articleDraft",
                                    "title": "历史过程草稿",
                                    "documentText": "过程项已保留"
                                }
                            ]
                        }
                    }
                }
            }),
        },
        AgentEvent {
            event_id: "evt_projection_process_assistant".to_string(),
            sequence: 13,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "message.delta_batch".to_string(),
            timestamp: timestamp(),
            payload: json!({
                "deltas": [
                    {
                        "text": "结论：历史打开后应保留工具调用"
                    },
                    {
                        "text": "和思考。"
                    }
                ],
                "phase": "final"
            }),
        },
        AgentEvent {
            event_id: "evt_projection_process_completed".to_string(),
            sequence: 14,
            session_id: "sess_projection_process".to_string(),
            thread_id: Some("thread_projection_process".to_string()),
            turn_id: Some("turn_projection_process".to_string()),
            event_type: "turn.completed".to_string(),
            timestamp: timestamp(),
            payload: json!({}),
        },
    ];
    event_log_writer
        .append_events(&events)
        .expect("append events");
    projection_store
        .apply_events(&events)
        .expect("apply events");

    let restarted_core = RuntimeCore::default()
        .with_event_log_writer(event_log_writer)
        .with_projection_store(projection_store);
    let read = restarted_core
        .read_session_current(AgentSessionReadParams {
            session_id: "sess_projection_process".to_string(),
            history_limit: Some(2),
            history_offset: None,
            history_before_message_id: None,
        })
        .await
        .expect("read projection summary");
    let detail = read.detail.expect("detail");
    let items = detail["items"].as_array().expect("items");

    assert_eq!(detail["projection_source"], "runtime.projection_1");
    assert_eq!(
        detail["messages"][1]["metadata"]["source"].as_str(),
        Some("projection_summary")
    );
    assert_eq!(
        detail["messages"][1]["content"][0]["text"].as_str(),
        Some("结论：历史打开后应保留工具调用和思考。")
    );
    assert!(items.iter().any(|item| {
        item["type"].as_str() == Some("reasoning")
            && item["text"]
                .as_str()
                .is_some_and(|text| text.contains("查找历史事件"))
    }));
    assert!(items.iter().any(|item| {
        item["type"].as_str() == Some("web_search")
            && item["tool_name"].as_str() == Some("WebSearch")
    }));
    assert!(items.iter().any(|item| {
        item["type"].as_str() == Some("agent_message")
            && item["phase"].as_str() == Some("commentary")
            && item["text"].as_str().is_some_and(|text| {
                text.contains("上面工具还在查找。")
                    && text.contains("批量过程输出也要保留。")
                    && text.contains("不能混进最终结论。")
            })
    }));
    assert!(items.iter().any(|item| {
        item["type"].as_str() == Some("request_user_input")
            && item["action_type"].as_str() == Some("ask_user")
            && item["status"].as_str() == Some("completed")
            && item["prompt"].as_str() == Some("是否继续对齐 Codex？")
    }));
    assert!(items.iter().any(|item| {
        item["type"].as_str() == Some("warning")
            && item["message"]
                .as_str()
                .is_some_and(|message| message.contains("模型路由发生降级"))
    }));
    assert_eq!(detail["thread_read"]["thread_items"], detail["items"]);
    assert_eq!(
        detail["thread_read"]["model_routing"]["decisionSource"].as_str(),
        Some("profile_model_slot")
    );
    assert_eq!(
        detail["thread_read"]["service_model_slot"].as_str(),
        Some("coding")
    );
    let tests = detail["thread_read"]["tests"].as_array().expect("tests");
    assert!(tests.iter().any(|test| {
        test["test_run_id"].as_str() == Some("test-history-read")
            && test["status"].as_str() == Some("completed")
            && test["result"].as_str() == Some("passed")
            && test["passed"].as_i64() == Some(5)
    }));
    let artifacts = detail["artifacts"].as_array().expect("artifacts");
    assert!(artifacts.iter().any(|artifact| {
        artifact["artifactRef"].as_str() == Some("artifact-history-workspace")
            && artifact["kind"].as_str() == Some("article_workspace")
    }));
    assert_eq!(
        detail["article_workspace"]["workerEvidence"][0]["eventType"].as_str(),
        Some("artifact.snapshot")
    );
    let tool_calls = detail["thread_read"]["tool_calls"]
        .as_array()
        .expect("tool calls");
    assert!(tool_calls.iter().any(|tool| {
        tool["tool_name"].as_str() == Some("WebSearch")
            && tool["status"].as_str() == Some("completed")
    }));
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
