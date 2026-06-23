use super::*;

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
async fn read_session_materializes_content_factory_workspace_patch_into_product_workspace() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_product_workspace".to_string()),
        thread_id: Some("thread_product_workspace".to_string()),
        app_id: "content-factory-app".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_product_workspace".to_string(),
                turn_id: Some("turn_product_workspace".to_string()),
                input: AgentInput {
                    text: "生成文章草稿".to_string(),
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
        "sess_product_workspace",
        Some(&turn.turn_id),
        vec![
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifact": {
                        "artifactId": "artifact-workspace-patch-1",
                        "path": ".lime/artifacts/content-factory-workspace-patch.json",
                        "title": "内容工厂工作区补丁",
                        "kind": "content_factory.workspace_patch",
                        "status": "ready",
                        "metadata": {
                            "contentFactoryWorkspacePatch": {
                                "schemaVersion": 1,
                                "appId": "content-factory-app",
                                "sessionId": "sess_product_workspace",
                                "primaryObjectRef": {
                                    "appId": "content-factory-app",
                                    "kind": "articleDraft",
                                    "id": "article-1",
                                    "sessionId": "sess_product_workspace",
                                    "artifactIds": ["artifact-article-1"],
                                    "sourceTurnId": "turn_product_workspace"
                                },
                                "selectedObjectRef": {
                                    "appId": "content-factory-app",
                                    "kind": "articleDraft",
                                    "id": "article-1",
                                    "sessionId": "sess_product_workspace"
                                },
                                "objects": [
                                    {
                                        "ref": {
                                            "appId": "content-factory-app",
                                            "kind": "articleDraft",
                                            "id": "article-1",
                                            "sessionId": "sess_product_workspace",
                                            "artifactIds": ["artifact-article-1"],
                                            "sourceTurnId": "turn_product_workspace"
                                        },
                                        "title": "公众号文章草稿",
                                        "status": "ready",
                                        "summary": "已生成首版文章",
                                        "previewArtifactId": "artifact-article-1",
                                        "source": {
                                            "taskKind": "content.article.generate",
                                            "taskId": "task-article-1",
                                            "turnId": "turn_product_workspace",
                                            "artifactIds": ["artifact-article-1"],
                                            "evidenceIds": ["evidence-1"]
                                        }
                                    },
                                    {
                                        "ref": {
                                            "appId": "content-factory-app",
                                            "kind": "imageGenerationSet",
                                            "id": "image-set-1",
                                            "sessionId": "sess_product_workspace",
                                            "artifactIds": ["artifact-image-1"],
                                            "sourceTurnId": "turn_product_workspace"
                                        },
                                        "title": "配图组",
                                        "status": "needs_review",
                                        "summary": "等待选择主图",
                                        "previewArtifactId": "artifact-image-1",
                                        "source": {
                                            "taskKind": "content.image.generate",
                                            "taskId": "task-image-1",
                                            "turnId": "turn_product_workspace",
                                            "artifactIds": ["artifact-image-1"],
                                            "evidenceIds": ["evidence-2"]
                                        }
                                    }
                                ],
                                "layoutState": {
                                    "activeTabKind": "productProfile",
                                    "activePaneKind": "documentCanvas",
                                    "openTabKinds": ["productProfile", "files"],
                                    "splitMode": "chat-right-dock"
                                }
                            },
                        }
                    }
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append artifact event");

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_product_workspace".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let product_workspace = &detail["product_workspace"];

    assert_eq!(product_workspace["schemaVersion"], "product-workspace.v1");
    assert_eq!(product_workspace["appId"], "content-factory-app");
    assert_eq!(product_workspace["sessionId"], "sess_product_workspace");
    assert_eq!(product_workspace["workspaceId"], "workspace-main");
    assert_eq!(product_workspace["objectCount"], 2);
    assert_eq!(
        product_workspace["primaryObjectRef"]["kind"],
        "articleDraft"
    );
    assert_eq!(product_workspace["selectedObjectRef"]["id"], "article-1");
    assert_eq!(product_workspace["objects"][0]["title"], "公众号文章草稿");
    assert_eq!(product_workspace["layoutState"]["openTabKinds"][1], "files");
    assert_eq!(
        product_workspace["sourceArtifacts"][0]["artifactRef"],
        "artifact-workspace-patch-1"
    );
    assert_eq!(
        detail["thread_read"]["product_workspace"],
        detail["product_workspace"]
    );
    assert_eq!(
        detail["thread_read"]["productWorkspace"],
        detail["productWorkspace"]
    );

    core.update_session_current(AgentSessionUpdateParams {
        session_id: "sess_product_workspace".to_string(),
        product_workspace_selected_object_ref: Some(json!({
            "appId": "content-factory-app",
            "kind": "imageGenerationSet",
            "id": "image-set-1",
            "sessionId": "sess_product_workspace"
        })),
        ..AgentSessionUpdateParams::default()
    })
    .await
    .expect("update selected product object");

    let updated_read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_product_workspace".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read updated session");
    let updated_detail = updated_read.detail.expect("updated session detail");

    assert_eq!(
        updated_detail["product_workspace"]["selectedObjectRef"]["id"],
        "image-set-1"
    );
    assert_eq!(
        updated_detail["thread_read"]["product_workspace"]["selectedObjectRef"]["kind"],
        "imageGenerationSet"
    );

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: "sess_product_workspace".to_string(),
            turn_id: Some("turn_product_profile_action".to_string()),
            input: AgentInput {
                text: "请重新生成「配图组」".to_string(),
                attachments: Vec::new(),
            },
            runtime_options: Some(RuntimeOptions {
                metadata: Some(json!({
                    "agent_app": {
                        "source": "right_surface_product_profile",
                        "app_id": "content-factory-app",
                        "session_id": "sess_product_workspace",
                        "workspace_id": "workspace-main",
                        "product_profile_action": {
                            "key": "regenerate",
                            "intent": "regenerate",
                            "risk": "write",
                            "task_kind": "content.image.generate",
                            "prompt": "请重新生成「配图组」",
                            "object": {
                                "app_id": "content-factory-app",
                                "kind": "imageGenerationSet",
                                "id": "image-set-1",
                                "session_id": "sess_product_workspace",
                                "title": "配图组",
                                "status": "needs_review",
                                "artifact_ids": ["artifact-image-1"],
                                "source_turn_id": "turn_product_workspace"
                            }
                        }
                    },
                    "right_surface": {
                        "surface_kind": "productProfile",
                        "source": "threadRead",
                        "action_key": "regenerate"
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
    .expect("start product profile action turn");

    core.append_external_runtime_events(
        "sess_product_workspace",
        Some("turn_product_profile_action"),
        vec![RuntimeEvent::new("turn.completed", json!({}))],
    )
    .expect("complete product profile action turn");

    let action_read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_product_workspace".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read action history session");
    let action_detail = action_read.detail.expect("action history detail");
    let action_history = action_detail["thread_read"]["product_profile_actions"]
        .as_array()
        .expect("product profile action history");

    assert_eq!(action_history.len(), 1);
    assert_eq!(action_history[0]["key"], "regenerate");
    assert_eq!(action_history[0]["status"], "completed");
    assert_eq!(action_history[0]["turnId"], "turn_product_profile_action");
    assert_eq!(action_history[0]["objectRef"]["id"], "image-set-1");
    assert_eq!(action_history[0]["objectTitle"], "配图组");
    assert_eq!(action_history[0]["taskKind"], "content.image.generate");
    assert_eq!(
        action_detail["product_workspace"]["actionHistory"][0],
        action_history[0]
    );
}
