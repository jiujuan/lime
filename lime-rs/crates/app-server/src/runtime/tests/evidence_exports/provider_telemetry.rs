use super::*;

#[tokio::test]
async fn export_evidence_uses_injected_evidence_pack_provider() {
    let provider = Arc::new(TestEvidenceExportProvider::default());
    let core = RuntimeCore::with_backend_capability_source_artifact_content_provider_and_evidence_export_provider(
            Arc::new(MockBackend),
            Arc::new(CapabilityInventorySource::default()),
            Arc::new(InlineArtifactContentProvider),
            provider.clone(),
        );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_evidence".to_string()),
        thread_id: Some("thread_evidence".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_evidence".to_string(),
            turn_id: Some("turn_evidence".to_string()),
            input: AgentInput {
                text: "生成 evidence".to_string(),
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
        "sess_evidence",
        Some("turn_evidence"),
        vec![RuntimeEvent::new(
            "artifact.snapshot",
            json!({
                "artifactId": "artifact-report",
                "path": ".app-server/artifacts/report.md"
            }),
        )],
    )
    .expect("append evidence events");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_evidence".to_string(),
            turn_id: Some("turn_evidence".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: None,
        })
        .await
        .expect("export evidence");

    assert_eq!(provider.call_count.load(Ordering::SeqCst), 1);
    let requests = provider
        .requests
        .lock()
        .expect("test evidence requests mutex poisoned");
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].session.session_id, "sess_evidence");
    assert_eq!(requests[0].turns[0].turn_id, "turn_evidence");
    assert_eq!(requests[0].events.len(), 3);
    assert_eq!(requests[0].artifacts[0].artifact_ref, "artifact-report");

    let evidence_pack = response.evidence_pack.expect("evidence pack");
    assert_eq!(evidence_pack.thread_status, "running");
    assert_eq!(
        evidence_pack.latest_turn_status.as_deref(),
        Some("accepted")
    );
    assert_eq!(evidence_pack.turn_count, 1);
    assert_eq!(evidence_pack.recent_artifact_count, 1);
    assert_eq!(
        evidence_pack
            .completion_audit_summary
            .as_ref()
            .and_then(|summary| summary.get("decision"))
            .and_then(|decision| decision.as_str()),
        Some("in_progress")
    );
}

#[tokio::test]
async fn export_evidence_reads_request_logs_from_telemetry_store() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");
    let telemetry_store =
        TelemetryStore::initialize(&roots.telemetry_db_path).expect("telemetry store");
    let mut request_log = lime_infra::telemetry::RequestLog::new(
        "request-telemetry-1".to_string(),
        lime_core::ProviderType::OpenAI,
        "gpt-4o".to_string(),
        true,
    );
    request_log.session_id = Some("sess_telemetry_export".to_string());
    request_log.thread_id = Some("thread_telemetry_export".to_string());
    request_log.turn_id = Some("turn_telemetry_export".to_string());
    request_log.mark_success(125, 200);
    telemetry_store
        .upsert_request_log(&request_log)
        .expect("upsert telemetry log");

    let core = RuntimeCore::default()
        .with_telemetry_store(Arc::new(telemetry_store))
        .with_event_log_writer(Arc::new(
            EventLogWriter::new(&roots.event_log_root).expect("writer"),
        ))
        .with_projection_store(Arc::new(
            ProjectionStore::initialize(&roots.projection_db_path).expect("projection"),
        ));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_telemetry_export".to_string()),
        thread_id: Some("thread_telemetry_export".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_telemetry_export".to_string(),
            turn_id: Some("turn_telemetry_export".to_string()),
            input: AgentInput {
                text: "生成 telemetry evidence".to_string(),
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

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_telemetry_export".to_string(),
            turn_id: Some("turn_telemetry_export".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export evidence");

    let evidence_pack = response.evidence_pack.expect("evidence pack");
    let request_telemetry = evidence_pack
        .observability_summary
        .as_ref()
        .and_then(|summary| summary.get("request_telemetry"))
        .expect("request telemetry summary");
    assert_eq!(
        request_telemetry
            .get("status")
            .and_then(serde_json::Value::as_str),
        Some("exported")
    );
    assert_eq!(
        request_telemetry
            .get("requestCount")
            .and_then(serde_json::Value::as_u64),
        Some(1)
    );
    assert_eq!(
        request_telemetry
            .get("sessionRequestCount")
            .and_then(serde_json::Value::as_u64),
        Some(1)
    );
    assert_eq!(
        request_telemetry
            .get("turnRequestCount")
            .and_then(serde_json::Value::as_u64),
        Some(1)
    );
    assert_eq!(
        request_telemetry
            .get("statusBreakdown")
            .and_then(|value| value.get("success"))
            .and_then(serde_json::Value::as_u64),
        Some(1)
    );
    assert_eq!(
        request_telemetry
            .get("statusBreakdown")
            .and_then(|value| value.get("failed"))
            .and_then(serde_json::Value::as_u64),
        Some(0)
    );
    assert_eq!(
        request_telemetry
            .get("statusBreakdown")
            .and_then(|value| value.get("timeout"))
            .and_then(serde_json::Value::as_u64),
        Some(0)
    );
    assert_eq!(
        request_telemetry
            .get("statusBreakdown")
            .and_then(|value| value.get("cancelled"))
            .and_then(serde_json::Value::as_u64),
        Some(0)
    );
}

#[tokio::test]
async fn export_evidence_records_skill_invocation_from_tool_metadata() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_skill_invocation_evidence".to_string()),
        thread_id: Some("thread_skill_invocation_evidence".to_string()),
        app_id: "agent-runtime".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_skill_invocation_evidence".to_string(),
            turn_id: Some("turn_skill_invocation_evidence".to_string()),
            input: AgentInput {
                text: "用 $capability-report 生成报告".to_string(),
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
        "sess_skill_invocation_evidence",
        Some("turn_skill_invocation_evidence"),
        vec![
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "skill-call-1",
                    "toolName": "Skill",
                    "arguments": {
                        "skill": "project:capability-report"
                    }
                }),
            ),
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "skill-search-call-1",
                    "toolName": "skill_search",
                    "arguments": {
                        "query": "capability report"
                    }
                }),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "skill-search-call-1",
                    "toolName": "skill_search",
                    "arguments": {
                        "query": "capability report"
                    },
                    "outputPreview": "{\"results\":[]}",
                    "success": true,
                    "metadata": {
                        "tool_family": "skill_search",
                        "skill_search_query": "capability report",
                        "skill_search_snapshot_skill_count": 7,
                        "skill_search_result_count": 2
                    }
                }),
            ),
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "mcp-search-call-1",
                    "toolName": "mcp__docs__search_docs",
                    "arguments": {
                        "query": "mcp structured content"
                    }
                }),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "mcp-search-call-1",
                    "toolName": "mcp__docs__search_docs",
                    "success": true,
                    "result": {
                        "content": [
                            {
                                "type": "text",
                                "text": "docs found"
                            }
                        ],
                        "structuredContent": {
                            "answer": "ok",
                            "ids": ["doc-1"]
                        },
                        "isError": false
                    }
                }),
            ),
            RuntimeEvent::new(
                "tool.started",
                json!({
                    "toolCallId": "mcp-resource-call-1",
                    "toolName": "ReadMcpResourceTool",
                    "arguments": {
                        "server": "docs",
                        "uri": "file:///docs/intro.md"
                    }
                }),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "mcp-resource-call-1",
                    "toolName": "ReadMcpResourceTool",
                    "arguments": {
                        "server": "docs",
                        "uri": "file:///docs/intro.md"
                    },
                    "success": true,
                    "result": {
                        "uri": "file:///docs/intro.md",
                        "mime_type": "text/markdown",
                        "text": "# Intro"
                    }
                }),
            ),
            RuntimeEvent::new(
                "tool.result",
                json!({
                    "toolCallId": "skill-call-1",
                    "toolName": "Skill",
                    "arguments": {
                        "skill": "project:capability-report"
                    },
                    "outputPreview": "报告已生成",
                    "success": true,
                    "metadata": {
                        "tool_family": "skill",
                        "skill_name": "project:capability-report",
                        "workspace_skill_source": {
                            "workspaceRoot": "/tmp/workspace",
                            "source": "manual_session_enable",
                            "approval": "manual",
                            "authorizationScope": "session",
                            "directory": "capability-report",
                            "registeredSkillDirectory": "capability-report",
                            "skillName": "project:capability-report"
                        },
                        "workspace_skill_runtime_enable": {
                            "source": "manual_session_enable",
                            "approval": "manual",
                            "authorization_scope": "session",
                            "workspace_root": "/tmp/workspace",
                            "directory": "capability-report",
                            "skill": "project:capability-report"
                        }
                    }
                }),
            ),
        ],
    )
    .expect("append skill invocation event");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_skill_invocation_evidence".to_string(),
            turn_id: Some("turn_skill_invocation_evidence".to_string()),
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export evidence");

    let evidence_pack = response.evidence_pack.expect("evidence pack");
    let skill_invocations = evidence_pack
        .observability_summary
        .as_ref()
        .and_then(|summary| summary.get("skill_invocations"))
        .and_then(serde_json::Value::as_array)
        .expect("skill invocations");
    assert_eq!(skill_invocations.len(), 1);
    assert_eq!(
        skill_invocations[0]
            .get("event")
            .and_then(serde_json::Value::as_str),
        Some("skill_invocation")
    );
    assert_eq!(
        skill_invocations[0]
            .get("skillName")
            .and_then(serde_json::Value::as_str),
        Some("project:capability-report")
    );
    assert_eq!(
        skill_invocations[0]
            .get("status")
            .and_then(serde_json::Value::as_str),
        Some("completed")
    );
    assert_eq!(
        skill_invocations[0]
            .get("workspaceSkillRuntimeEnable")
            .and_then(|value| value.get("approval"))
            .and_then(serde_json::Value::as_str),
        Some("manual")
    );
    let skill_searches = evidence_pack
        .observability_summary
        .as_ref()
        .and_then(|summary| summary.get("skill_searches"))
        .and_then(serde_json::Value::as_array)
        .expect("skill searches");
    assert_eq!(skill_searches.len(), 1);
    assert_eq!(
        skill_searches[0]
            .get("event")
            .and_then(serde_json::Value::as_str),
        Some("skill_search")
    );
    assert_eq!(
        skill_searches[0]
            .get("query")
            .and_then(serde_json::Value::as_str),
        Some("capability report")
    );
    assert_eq!(
        skill_searches[0]
            .get("resultCount")
            .and_then(serde_json::Value::as_u64),
        Some(2)
    );
    assert_eq!(
        skill_searches[0]
            .get("snapshotSkillCount")
            .and_then(serde_json::Value::as_u64),
        Some(7)
    );
    assert_eq!(
        skill_searches[0]
            .get("toolCallId")
            .and_then(serde_json::Value::as_str),
        Some("skill-search-call-1")
    );
    let mcp_tool_results = evidence_pack
        .observability_summary
        .as_ref()
        .and_then(|summary| summary.get("mcp_tool_results"))
        .and_then(serde_json::Value::as_array)
        .expect("mcp tool results");
    assert_eq!(mcp_tool_results.len(), 1);
    assert_eq!(
        mcp_tool_results[0]
            .get("event")
            .and_then(serde_json::Value::as_str),
        Some("mcp_tool_result")
    );
    assert_eq!(
        mcp_tool_results[0]
            .get("toolName")
            .and_then(serde_json::Value::as_str),
        Some("mcp__docs__search_docs")
    );
    assert_eq!(
        mcp_tool_results[0]
            .get("hasStructuredContent")
            .and_then(serde_json::Value::as_bool),
        Some(true)
    );
    assert_eq!(
        mcp_tool_results[0]
            .get("structuredContentKeys")
            .and_then(serde_json::Value::as_array)
            .map(|keys| keys.len()),
        Some(2)
    );
    assert_eq!(
        mcp_tool_results[0]
            .get("toolCallId")
            .and_then(serde_json::Value::as_str),
        Some("mcp-search-call-1")
    );
    assert!(mcp_tool_results[0].get("structuredContent").is_none());
    let mcp_resource_reads = evidence_pack
        .observability_summary
        .as_ref()
        .and_then(|summary| summary.get("mcp_resource_reads"))
        .and_then(serde_json::Value::as_array)
        .expect("mcp resource reads");
    assert_eq!(mcp_resource_reads.len(), 1);
    assert_eq!(
        mcp_resource_reads[0]
            .get("event")
            .and_then(serde_json::Value::as_str),
        Some("mcp_resource_read")
    );
    assert_eq!(
        mcp_resource_reads[0]
            .get("server")
            .and_then(serde_json::Value::as_str),
        Some("docs")
    );
    assert_eq!(
        mcp_resource_reads[0]
            .get("uri")
            .and_then(serde_json::Value::as_str),
        Some("file:///docs/intro.md")
    );
    assert_eq!(
        mcp_resource_reads[0]
            .get("mimeTypes")
            .and_then(serde_json::Value::as_array)
            .and_then(|items| items.first())
            .and_then(serde_json::Value::as_str),
        Some("text/markdown")
    );
    assert_eq!(
        mcp_resource_reads[0]
            .get("contentRefs")
            .and_then(serde_json::Value::as_array)
            .and_then(|items| items.first())
            .and_then(|item| item.get("textCharCount"))
            .and_then(serde_json::Value::as_u64),
        Some(7)
    );
    assert!(mcp_resource_reads[0].get("text").is_none());
    let audit = evidence_pack
        .completion_audit_summary
        .as_ref()
        .expect("completion audit");
    assert_eq!(
        audit
            .get("workspaceSkillToolCallCount")
            .and_then(serde_json::Value::as_u64),
        Some(1)
    );
    assert_eq!(
        audit
            .get("requiredEvidence")
            .and_then(|value| value.get("workspaceSkillToolCall"))
            .and_then(serde_json::Value::as_bool),
        Some(true)
    );
}

#[tokio::test]
async fn export_evidence_can_skip_injected_evidence_pack_provider() {
    let provider = Arc::new(TestEvidenceExportProvider::default());
    let core = RuntimeCore::with_backend_capability_source_artifact_content_provider_and_evidence_export_provider(
            Arc::new(MockBackend),
            Arc::new(CapabilityInventorySource::default()),
            Arc::new(InlineArtifactContentProvider),
            provider.clone(),
        );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_evidence".to_string()),
        thread_id: Some("thread_evidence".to_string()),
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_evidence".to_string(),
            turn_id: None,
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(false),
        })
        .await
        .expect("export evidence");

    assert_eq!(provider.call_count.load(Ordering::SeqCst), 0);
    assert_eq!(response.evidence_pack, None);
}

#[tokio::test]
async fn default_runtime_exports_basic_evidence_pack_without_desktop_provider() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_basic_evidence".to_string()),
        thread_id: Some("thread_basic_evidence".to_string()),
        app_id: "agent-runtime".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");
    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_basic_evidence".to_string(),
            turn_id: Some("turn_basic_evidence".to_string()),
            input: AgentInput {
                text: "生成基础 evidence".to_string(),
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

    let response = core
        .export_evidence(EvidenceExportParams {
            session_id: "sess_basic_evidence".to_string(),
            turn_id: None,
            include_events: Some(true),
            include_artifacts: Some(true),
            include_evidence_pack: Some(true),
        })
        .await
        .expect("export evidence");

    let evidence_pack = response.evidence_pack.expect("basic evidence pack");
    assert_eq!(
        evidence_pack.pack_relative_root,
        ".lime/harness/sessions/sess_basic_evidence/evidence"
    );
    assert_eq!(evidence_pack.thread_status, "running");
    assert_eq!(
        evidence_pack
            .completion_audit_summary
            .as_ref()
            .and_then(|summary| summary.get("decision"))
            .and_then(serde_json::Value::as_str),
        Some("in_progress")
    );
    assert_eq!(
        evidence_pack
            .observability_summary
            .as_ref()
            .and_then(|summary| summary.get("source"))
            .and_then(serde_json::Value::as_str),
        Some("app-server-basic")
    );
}
