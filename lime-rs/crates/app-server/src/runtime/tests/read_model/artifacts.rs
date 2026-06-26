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
async fn product_profile_artifact_documents_merge_version_history_across_turns() {
    let core = RuntimeCore::default();
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_product_artifact_versions".to_string()),
        thread_id: Some("thread_product_artifact_versions".to_string()),
        app_id: "content-factory-app".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    for (version, body) in [
        ("1", "第一版正文"),
        ("2", "第二版正文，包含编辑后的交付内容"),
    ] {
        let turn_id = format!("turn_article_v{version}");
        let turn = core
            .start_turn(
                AgentSessionTurnStartParams {
                    session_id: "sess_product_artifact_versions".to_string(),
                    turn_id: Some(turn_id.clone()),
                    input: AgentInput {
                        text: format!("生成文章草稿 v{version}"),
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
            "sess_product_artifact_versions",
            Some(&turn.turn_id),
            vec![
                RuntimeEvent::new(
                    "artifact.snapshot",
                    json!({
                        "artifact": {
                            "artifactId": format!("artifact-workspace-patch-v{version}"),
                            "path": format!(".lime/artifacts/content-factory-workspace-patch-v{version}.json"),
                            "title": format!("内容工厂工作区补丁 v{version}"),
                            "kind": "content_factory.workspace_patch",
                            "status": "ready",
                            "metadata": {
                                "contentFactoryWorkspacePatch": {
                                    "schemaVersion": 1,
                                    "appId": "content-factory-app",
                                    "sessionId": "sess_product_artifact_versions",
                                    "objects": [
                                        {
                                            "ref": {
                                                "appId": "content-factory-app",
                                                "kind": "articleDraft",
                                                "id": "article-1",
                                                "sessionId": "sess_product_artifact_versions",
                                                "artifactIds": ["artifact-article-1"],
                                                "sourceTurnId": turn_id,
                                                "version": version
                                            },
                                            "title": format!("公众号文章草稿 v{version}"),
                                            "status": "ready",
                                            "summary": format!("文章草稿第 {version} 版"),
                                            "previewArtifactId": "artifact-article-1",
                                            "source": {
                                                "taskKind": "content.article.generate",
                                                "taskId": format!("task-article-v{version}"),
                                                "turnId": turn.turn_id,
                                                "artifactIds": ["artifact-article-1"],
                                                "markdown": body
                                            }
                                        }
                                    ],
                                    "layoutState": {
                                        "activeTabKind": "productProfile",
                                        "openTabKinds": ["productProfile"]
                                    }
                                }
                            }
                        }
                    }),
                ),
                RuntimeEvent::new("turn.completed", json!({})),
            ],
        )
        .expect("append artifact event");
    }

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: "sess_product_artifact_versions".to_string(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read session");
    let detail = read.detail.expect("session detail");
    let artifacts = detail["thread_read"]["artifacts"]
        .as_array()
        .expect("thread read artifacts");
    let article_artifact = artifacts
        .iter()
        .find(|artifact| artifact["artifactRef"] == "artifact-article-1")
        .expect("article artifact document");

    assert_eq!(
        article_artifact["metadata"]["artifactDocument"]["metadata"]["currentVersionNo"],
        2
    );
    assert_eq!(
        article_artifact["metadata"]["artifactDocument"]["metadata"]["versionHistory"]
            .as_array()
            .expect("version history")
            .len(),
        2
    );
    assert_eq!(
        article_artifact["metadata"]["artifactDocument"]["metadata"]["versionHistory"][0]["id"],
        "artifact-document:content-factory-app:artifact-article-1:v1"
    );
    assert_eq!(
        article_artifact["metadata"]["artifactDocument"]["metadata"]["versionHistory"][1]["id"],
        "artifact-document:content-factory-app:artifact-article-1:v2"
    );

    let artifact_read = core
        .read_artifacts(ArtifactReadParams {
            session_id: "sess_product_artifact_versions".to_string(),
            turn_id: None,
            artifact_ref: Some("artifact-article-1".to_string()),
            include_content: Some(true),
            cursor: None,
            limit: Some(1),
        })
        .expect("read merged artifact document");
    assert_eq!(artifact_read.artifacts.len(), 1);
    assert_eq!(
        artifact_read.artifacts[0].content_status,
        ArtifactContentStatus::Available
    );
    let content: serde_json::Value = serde_json::from_str(
        artifact_read.artifacts[0]
            .content
            .as_deref()
            .expect("artifact document content"),
    )
    .expect("artifact document json");

    assert_eq!(content["metadata"]["currentVersionNo"], 2);
    assert_eq!(
        content["metadata"]["versionHistory"]
            .as_array()
            .expect("content version history")
            .len(),
        2
    );
    assert_eq!(
        content["blocks"][0]["content"],
        "第二版正文，包含编辑后的交付内容"
    );
}

#[tokio::test]
async fn artifact_workbench_save_snapshot_merges_with_product_profile_artifact_document_history() {
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let core = RuntimeCore::default().with_sidecar_store(Arc::new(
        SidecarStore::new(sidecar_root.path()).expect("sidecar store"),
    ));
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_product_artifact_workbench_save".to_string()),
        thread_id: Some("thread_product_artifact_workbench_save".to_string()),
        app_id: "content-factory-app".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let first_turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_product_artifact_workbench_save".to_string(),
                turn_id: Some("turn_article_generated".to_string()),
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
        .expect("first turn")
        .response
        .turn;

    core.append_external_runtime_events(
        "sess_product_artifact_workbench_save",
        Some(&first_turn.turn_id),
        vec![
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifact": {
                        "artifactId": "artifact-workspace-patch-generated",
                        "path": ".lime/artifacts/content-factory-workspace-patch-generated.json",
                        "title": "内容工厂工作区补丁",
                        "kind": "content_factory.workspace_patch",
                        "status": "ready",
                        "metadata": {
                            "contentFactoryWorkspacePatch": {
                                "schemaVersion": 1,
                                "appId": "content-factory-app",
                                "sessionId": "sess_product_artifact_workbench_save",
                                "objects": [
                                    {
                                        "ref": {
                                            "appId": "content-factory-app",
                                            "kind": "articleDraft",
                                            "id": "article-1",
                                            "sessionId": "sess_product_artifact_workbench_save",
                                            "artifactIds": ["artifact-article-1"],
                                            "sourceTurnId": "turn_article_generated",
                                            "version": "1"
                                        },
                                        "title": "公众号文章草稿",
                                        "status": "ready",
                                        "summary": "首版文章草稿",
                                        "previewArtifactId": "artifact-article-1",
                                        "source": {
                                            "taskKind": "content.article.generate",
                                            "taskId": "task-article-v1",
                                            "turnId": "turn_article_generated",
                                            "artifactIds": ["artifact-article-1"],
                                            "markdown": "生成的首版正文"
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append generated artifact event");

    let saved_turn = core
        .start_turn(
            AgentSessionTurnStartParams {
                session_id: "sess_product_artifact_workbench_save".to_string(),
                turn_id: Some("turn_article_workbench_save".to_string()),
                input: AgentInput {
                    text: "保存 Artifact Workbench 编辑稿".to_string(),
                    attachments: Vec::new(),
                },
                runtime_options: None,
                queue_if_busy: false,
                skip_pre_submit_resume: false,
            },
            RuntimeHostContext::default(),
        )
        .await
        .expect("save turn")
        .response
        .turn;

    let saved_document = json!({
        "schemaVersion": "artifact_document.v1",
        "artifactId": "artifact-document:content-factory-app:artifact-article-1",
        "workspaceId": "workspace-main",
        "threadId": null,
        "turnId": "turn_article_workbench_save",
        "kind": "report",
        "title": "公众号文章草稿",
        "status": "ready",
        "language": "zh-CN",
        "summary": "用户在 Artifact Workbench 保存的第二版",
        "blocks": [
            {
                "id": "body",
                "type": "rich_text",
                "contentFormat": "markdown",
                "content": "用户编辑后的第二版正文",
                "markdown": "用户编辑后的第二版正文"
            }
        ],
        "sources": [],
        "metadata": {
            "generatedBy": "user",
            "currentVersionId": "artifact-document:content-factory-app:artifact-article-1:v2",
            "currentVersionNo": 2,
            "versionHistory": [
                {
                    "id": "artifact-document:content-factory-app:artifact-article-1:v2",
                    "artifactId": "artifact-document:content-factory-app:artifact-article-1",
                    "versionNo": 2,
                    "title": "公众号文章草稿",
                    "status": "ready",
                    "createdBy": "user"
                }
            ],
            "productProfile": {
                "appId": "content-factory-app",
                "sessionId": "sess_product_artifact_workbench_save",
                "workspaceId": "workspace-main",
                "objectKind": "articleDraft",
                "objectId": "article-1",
                "artifactIds": ["artifact-article-1"]
            }
        }
    });
    let saved_content =
        serde_json::to_string_pretty(&saved_document).expect("saved document content");

    core.append_external_runtime_events(
        "sess_product_artifact_workbench_save",
        Some(&saved_turn.turn_id),
        vec![
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifact": {
                        "artifactId": "artifact-article-1",
                        "artifactRef": "artifact-article-1",
                        "artifactDocumentId": "artifact-document:content-factory-app:artifact-article-1",
                        "filePath": "article.md",
                        "path": "article.md",
                        "title": "公众号文章草稿",
                        "kind": "artifact_document",
                        "status": "ready",
                        "content": saved_content,
                        "metadata": {
                            "artifactSchema": "artifact_document.v1",
                            "artifactKind": "report",
                            "artifactDocument": saved_document,
                            "artifactTitle": "公众号文章草稿",
                            "artifactDocumentId": "artifact-document:content-factory-app:artifact-article-1",
                            "artifactVersionId": "artifact-document:content-factory-app:artifact-article-1:v2",
                            "artifactVersionNo": 2,
                            "artifactRef": "artifact-article-1",
                            "filePath": "article.md",
                            "productProfile": {
                                "appId": "content-factory-app",
                                "sessionId": "sess_product_artifact_workbench_save",
                                "workspaceId": "workspace-main",
                                "objectKind": "articleDraft",
                                "objectId": "article-1",
                                "artifactIds": ["artifact-article-1"]
                            }
                        }
                    }
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
    )
    .expect("append saved artifact event");

    let artifact_read = core
        .read_artifacts(ArtifactReadParams {
            session_id: "sess_product_artifact_workbench_save".to_string(),
            turn_id: None,
            artifact_ref: Some("artifact-article-1".to_string()),
            include_content: Some(true),
            cursor: None,
            limit: Some(1),
        })
        .expect("read saved artifact document");
    assert_eq!(artifact_read.artifacts.len(), 1);
    assert_eq!(
        artifact_read.artifacts[0].content_status,
        ArtifactContentStatus::Available
    );
    let content: serde_json::Value = serde_json::from_str(
        artifact_read.artifacts[0]
            .content
            .as_deref()
            .expect("saved artifact document content"),
    )
    .expect("saved artifact document json");

    assert_eq!(content["metadata"]["currentVersionNo"], 2);
    assert_eq!(content["blocks"][0]["content"], "用户编辑后的第二版正文");
    assert_eq!(
        content["metadata"]["versionHistory"]
            .as_array()
            .expect("merged version history")
            .len(),
        2
    );
    assert_eq!(
        content["metadata"]["versionHistory"][0]["id"],
        "artifact-document:content-factory-app:artifact-article-1:v1"
    );
    assert_eq!(
        content["metadata"]["versionHistory"][1]["id"],
        "artifact-document:content-factory-app:artifact-article-1:v2"
    );
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
                            "agentAppWorker": {
                                "appId": "content-factory-app",
                                "taskId": "task-article-1",
                                "taskKind": "content.article.generate",
                                "turnId": "turn_product_workspace",
                                "workerEntrypoint": "./runtime/content-factory-worker.mjs",
                                "status": "completed",
                                "inputSummary": "prompt=生成文章; inputKeys=topic",
                                "outputSummary": "2 objects: 公众号文章草稿, 配图组",
                                "outputObjectCount": 2,
                                "outputArtifactKind": "content_factory.workspace_patch"
                            },
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
            RuntimeEvent::new(
                "runtime.error",
                json!({
                    "source": "agent_app_task_worker",
                    "appId": "content-factory-app",
                    "taskId": "task-image-1",
                    "taskKind": "content.image.generate",
                    "turnId": "turn_product_workspace",
                    "status": "failed",
                    "errorCode": "worker_invalid_json_output",
                    "errorMessage": "Agent App worker returned invalid JSON",
                    "message": "Agent App task worker failed: Agent App worker returned invalid JSON",
                    "metadata": {
                        "agentAppWorker": {
                            "appId": "content-factory-app",
                            "taskId": "task-image-1",
                            "taskKind": "content.image.generate",
                            "turnId": "turn_product_workspace",
                            "status": "failed",
                            "errorCode": "worker_invalid_json_output",
                            "workerEntrypoint": "./runtime/content-factory-worker.mjs",
                            "inputSummary": "prompt=生成图片; inputKeys=topic"
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
        product_workspace["workerEvidence"][0]["taskId"],
        "task-article-1"
    );
    assert_eq!(
        product_workspace["workerEvidence"][0]["status"],
        "completed"
    );
    assert_eq!(
        product_workspace["workerEvidence"][0]["workerEntrypoint"],
        "./runtime/content-factory-worker.mjs"
    );
    assert_eq!(
        product_workspace["workerEvidence"][0]["inputSummary"],
        "prompt=生成文章; inputKeys=topic"
    );
    assert_eq!(
        product_workspace["workerEvidence"][0]["outputSummary"],
        "2 objects: 公众号文章草稿, 配图组"
    );
    assert_eq!(
        product_workspace["workerEvidence"][0]["outputObjectCount"],
        2
    );
    assert_eq!(
        product_workspace["workerEvidence"][1]["taskId"],
        "task-image-1"
    );
    assert_eq!(product_workspace["workerEvidence"][1]["status"], "failed");
    assert_eq!(
        product_workspace["workerEvidence"][1]["errorCode"],
        "worker_invalid_json_output"
    );
    assert_eq!(
        product_workspace["workerEvidence"][1]["inputSummary"],
        "prompt=生成图片; inputKeys=topic"
    );
    assert_eq!(
        detail["thread_read"]["product_workspace"],
        detail["product_workspace"]
    );
    assert_eq!(
        detail["thread_read"]["productWorkspace"],
        detail["productWorkspace"]
    );
    let artifacts = detail["thread_read"]["artifacts"]
        .as_array()
        .expect("thread read artifacts");
    let article_artifact = artifacts
        .iter()
        .find(|artifact| artifact["artifactRef"] == "artifact-article-1")
        .expect("article product object artifact document");
    assert_eq!(article_artifact["kind"], "artifact_document");
    assert_eq!(article_artifact["title"], "公众号文章草稿");
    assert_eq!(
        article_artifact["metadata"]["artifactSchema"],
        "artifact_document.v1"
    );
    assert_eq!(
        article_artifact["metadata"]["artifactDocumentId"],
        "artifact-document:content-factory-app:artifact-article-1"
    );
    assert_eq!(
        article_artifact["metadata"]["artifactDocument"]["metadata"]["currentVersionId"],
        "artifact-document:content-factory-app:artifact-article-1:v1"
    );
    assert_eq!(
        article_artifact["metadata"]["artifactDocument"]["metadata"]["sourceRunBinding"]["taskId"],
        "task-article-1"
    );
    assert_eq!(
        article_artifact["metadata"]["productProfile"]["objectKind"],
        "articleDraft"
    );
    assert!(article_artifact["content"].is_null());
    assert_eq!(article_artifact["contentStatus"], "notRequested");

    let artifact_read = core
        .read_artifacts(ArtifactReadParams {
            session_id: "sess_product_workspace".to_string(),
            turn_id: Some("turn_product_workspace".to_string()),
            artifact_ref: Some("artifact-article-1".to_string()),
            include_content: Some(true),
            cursor: None,
            limit: Some(1),
        })
        .expect("read product object artifact document");
    assert_eq!(artifact_read.artifacts.len(), 1);
    assert_eq!(
        artifact_read.artifacts[0].content_status,
        ArtifactContentStatus::Available
    );
    let content = artifact_read.artifacts[0]
        .content
        .as_deref()
        .expect("artifact document content");
    assert!(content.contains("\"schemaVersion\": \"artifact_document.v1\""));
    assert!(
        content.contains(
            "\"artifactId\": \"artifact-document:content-factory-app:artifact-article-1\""
        )
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
        vec![
            RuntimeEvent::new(
                "artifact.snapshot",
                json!({
                    "artifact": {
                        "artifactId": "artifact-image-regenerate-workspace-patch",
                        "artifactRef": "artifact-image-regenerate-workspace-patch",
                        "path": ".lime/artifacts/product-profile/image-regenerate-workspace-patch.json",
                        "title": "配图组重新生成结果",
                        "kind": "content_factory.workspace_patch",
                        "status": "ready",
                        "metadata": {
                            "agentAppWorker": {
                                "appId": "content-factory-app",
                                "taskId": "task-image-regenerate-1",
                                "taskKind": "content.image.generate",
                                "turnId": "turn_product_profile_action",
                                "workerEntrypoint": "./runtime/content-factory-worker.mjs",
                                "status": "completed",
                                "inputSummary": "action=regenerate; object=image-set-1",
                                "outputSummary": "1 object: 配图组重新生成结果",
                                "outputObjectCount": 1,
                                "outputArtifactKind": "content_factory.workspace_patch"
                            },
                            "contentFactoryWorkspacePatch": {
                                "schemaVersion": 1,
                                "appId": "content-factory-app",
                                "sessionId": "sess_product_workspace",
                                "selectedObjectRef": {
                                    "appId": "content-factory-app",
                                    "kind": "imageGenerationSet",
                                    "id": "image-set-1",
                                    "sessionId": "sess_product_workspace"
                                },
                                "objects": [
                                    {
                                        "ref": {
                                            "appId": "content-factory-app",
                                            "kind": "imageGenerationSet",
                                            "id": "image-set-1",
                                            "sessionId": "sess_product_workspace",
                                            "artifactIds": ["artifact-image-regenerated"],
                                            "sourceTurnId": "turn_product_profile_action",
                                            "sourceTaskId": "task-image-regenerate-1",
                                            "version": "2"
                                        },
                                        "title": "配图组",
                                        "status": "ready",
                                        "summary": "已重新生成 2 张候选图",
                                        "previewArtifactId": "artifact-image-regenerated",
                                        "source": {
                                            "taskKind": "content.image.generate",
                                            "taskId": "task-image-regenerate-1",
                                            "turnId": "turn_product_profile_action",
                                            "artifactIds": ["artifact-image-regenerated"],
                                            "images": [
                                                {
                                                    "id": "image-regenerated-1",
                                                    "title": "厨房台面主图",
                                                    "url": "file:///tmp/content-factory/image-regenerated-1.png",
                                                    "prompt": "厨房台面主图，明亮自然光"
                                                },
                                                {
                                                    "id": "image-regenerated-2",
                                                    "title": "产品细节图",
                                                    "url": "file:///tmp/content-factory/image-regenerated-2.png",
                                                    "prompt": "产品细节图，突出质感"
                                                }
                                            ]
                                        }
                                    }
                                ],
                                "layoutState": {
                                    "activeTabKind": "productProfile",
                                    "activePaneKind": "imageGrid",
                                    "openTabKinds": ["productProfile", "files"],
                                    "splitMode": "chat-right-dock"
                                }
                            }
                        }
                    }
                }),
            ),
            RuntimeEvent::new("turn.completed", json!({})),
        ],
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
    let action_result_artifacts = action_history[0]["resultArtifacts"]
        .as_array()
        .expect("product profile action result artifacts");
    assert!(
        action_result_artifacts
            .iter()
            .any(
                |artifact| artifact["artifactRef"] == "artifact-image-regenerated"
                    && artifact["kind"] == "artifact_document"
                    && artifact["title"] == "配图组"
            )
    );
    assert!(
        action_result_artifacts
            .iter()
            .any(
                |artifact| artifact["artifactRef"] == "artifact-image-regenerate-workspace-patch"
                    && artifact["kind"] == "content_factory.workspace_patch"
            )
    );
    assert_eq!(
        action_detail["product_workspace"]["actionHistory"][0],
        action_history[0]
    );
    let image_object = action_detail["product_workspace"]["objects"]
        .as_array()
        .expect("product workspace objects")
        .iter()
        .find(|object| object["ref"]["id"] == "image-set-1")
        .expect("updated image object");
    assert_eq!(image_object["status"], "ready");
    assert_eq!(image_object["summary"], "已重新生成 2 张候选图");
    assert_eq!(
        image_object["previewArtifactId"],
        "artifact-image-regenerated"
    );
    assert_eq!(
        image_object["ref"]["sourceTurnId"],
        "turn_product_profile_action"
    );
    assert_eq!(
        image_object["ref"]["sourceTaskId"],
        "task-image-regenerate-1"
    );
    assert_eq!(
        action_detail["product_workspace"]["selectedObjectRef"]["id"],
        "image-set-1"
    );
    assert_eq!(
        action_detail["product_workspace"]["workerEvidence"][2]["taskId"],
        "task-image-regenerate-1"
    );
    assert_eq!(
        action_detail["product_workspace"]["workerEvidence"][2]["status"],
        "completed"
    );
}
