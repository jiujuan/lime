use super::*;
use crate::services::runtime_evidence_projection_service::collect_runtime_evidence_projection_summary_from_value;
use std::io::Read;
use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[tokio::test]
async fn agent_app_connector_preview_reports_desktop_adapter_readiness() {
    let metadata = serde_json::json!({
        "harness": {
            "agent_app_tool_execution": {
                "request": {
                    "capability": "lime.connectors",
                    "method": "invoke",
                    "action": "create_reminder",
                    "input": {
                        "connectorId": "reminders",
                        "action": "create_reminder"
                    },
                    "policy": {
                        "secretBinding": "host_managed",
                        "tokenExposed": false
                    }
                }
            }
        }
    });
    let mut registry = aster::tools::ToolRegistry::new();

    let registered = register_agent_app_connector_preview_tools(&mut registry, Some(&metadata));

    assert_eq!(registered, 1);
    let result = registry
        .execute(
            "connector__reminders__create_reminder",
            serde_json::json!({
                "connectorId": "reminders",
                "action": "create_reminder",
                "input": {
                    "title": "复盘 P18.7"
                }
            }),
            &ToolContext::new(PathBuf::from(".")),
            None,
        )
        .await
        .expect("desktop connector preview should return controlled result");
    let payload = result.metadata.get("result").expect("result metadata");

    assert!(!result.success);
    assert_eq!(
        payload.get("reason"),
        Some(&serde_json::json!(
            "desktop_connector_action_adapter_not_configured"
        ))
    );
    assert_eq!(
        payload.get("adapterKind"),
        Some(&serde_json::json!("desktop_system_connector"))
    );
    assert_eq!(
        payload.get("adapterReadiness"),
        Some(&serde_json::json!("desktop_action_surface_known"))
    );
    assert_eq!(
        payload.pointer("/next/required"),
        Some(&serde_json::json!("desktop_connector_action_adapter"))
    );
}

#[tokio::test]
async fn agent_app_connector_authorized_cloud_overlay_queues_outbox_mutation() {
    let metadata = serde_json::json!({
        "harness": {
            "agent_app_tool_execution": {
                "request": {
                    "capability": "lime.connectors",
                    "method": "invoke",
                    "action": "createPage",
                    "input": {
                        "connectorId": "notion",
                        "action": "createPage",
                        "connectorRuntimeFacts": {
                            "authorizationStatus": "authorized"
                        }
                    },
                    "policy": {
                        "secretBinding": "host_managed",
                        "tokenExposed": false
                    }
                }
            }
        }
    });
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let mut registry = aster::tools::ToolRegistry::new();

    let registered = register_agent_app_connector_preview_tools(&mut registry, Some(&metadata));

    assert_eq!(registered, 1);
    let result = registry
        .execute(
            "connector__notion__createPage",
            serde_json::json!({
                "connectorId": "notion",
                "action": "createPage",
                "idempotencyKey": "notion-create-page-1",
                "input": {
                    "title": "内容计划",
                    "refreshToken": "notion-refresh-token",
                    "workspaceRoot": temp_dir.path().to_string_lossy()
                },
                "evidenceRef": "app-made-cloud-evidence"
            }),
            &ToolContext::new(temp_dir.path().to_path_buf()),
            None,
        )
        .await
        .expect("cloud connector preview should return controlled result");
    let payload = result.metadata.get("result").expect("result metadata");

    assert!(result.success);
    assert_eq!(
        payload.get("status"),
        Some(&serde_json::json!("queued_for_cloud_overlay"))
    );
    assert_eq!(
        payload.get("adapterReadiness"),
        Some(&serde_json::json!("host_managed_outbox_adapter_ready"))
    );
    assert_eq!(
        payload.pointer("/next/required"),
        Some(&serde_json::json!("cloud_overlay_secret_delivery_adapter"))
    );
    assert_eq!(
        payload.pointer("/secretDelivery/status"),
        Some(&serde_json::json!("pending"))
    );
    assert_eq!(
        payload.pointer("/evidenceRefs/0/kind"),
        Some(&serde_json::json!("connector_cloud_overlay_outbox"))
    );
    let metadata_value = serde_json::to_value(&result.metadata).expect("metadata value");
    let evidence_summary = collect_runtime_evidence_projection_summary_from_value(&metadata_value);
    assert_eq!(
        evidence_summary.evidence_refs,
        vec!["outbox://connector/notion/createPage/notion-create-page-1"]
    );
    let serialized = serde_json::to_string(&result).expect("result should serialize");
    assert!(!serialized.contains("notion-refresh-token"));
    assert!(!serialized.contains("app-made-cloud-evidence"));
    assert!(!serialized.contains(temp_dir.path().to_string_lossy().as_ref()));

    let outbox_path = temp_dir
        .path()
        .join(".lime/agent-app-connectors/cloud-overlay/outbox.jsonl");
    let mut outbox = String::new();
    std::fs::File::open(outbox_path)
        .expect("cloud overlay outbox should exist")
        .read_to_string(&mut outbox)
        .expect("cloud overlay outbox should be readable");
    assert!(outbox.contains("queued_for_cloud_overlay"));
    assert!(!outbox.contains("notion-refresh-token"));
}

#[tokio::test]
async fn agent_app_connector_cloud_overlay_observes_host_managed_secret_delivery_fact() {
    let metadata = serde_json::json!({
        "harness": {
            "agent_app_tool_execution": {
                "request": {
                    "capability": "lime.connectors",
                    "method": "invoke",
                    "action": "createPage",
                    "input": {
                        "connectorId": "notion",
                        "action": "createPage",
                        "connectorRuntimeFacts": {
                            "authorizationStatus": "authorized",
                            "secretBinding": "host_managed",
                            "tokenExposed": false,
                            "secretDelivery": {
                                "status": "ready",
                                "binding": "host_managed",
                                "source": "host_managed_secret_delivery_fact",
                                "target": "cloud_overlay_worker",
                                "leaseObserved": true,
                                "leaseRefExposed": false,
                                "leaseHandleStatus": "host_managed",
                                "credentialMaterialExposed": false,
                                "tokenExposed": false
                            }
                        }
                    },
                    "policy": {
                        "secretBinding": "host_managed",
                        "tokenExposed": false
                    }
                },
                "internalRequest": {
                    "capability": "lime.connectors",
                    "method": "invoke",
                    "action": "createPage",
                    "input": {
                        "connectorId": "notion",
                        "action": "createPage",
                        "connectorRuntimeFacts": {
                            "authorizationStatus": "authorized",
                            "secretBinding": "host_managed",
                            "tokenExposed": false,
                            "secretDelivery": {
                                "status": "ready",
                                "binding": "host_managed",
                                "source": "host_managed_secret_delivery_fact",
                                "target": "cloud_overlay_worker",
                                "leaseRef": "secret-lease://connector/notion/createPage/test-lease",
                                "expiresAt": "2026-05-18T01:00:00Z",
                                "credentialMaterialExposed": false,
                                "tokenExposed": false
                            }
                        }
                    },
                    "policy": {
                        "secretBinding": "host_managed",
                        "tokenExposed": false
                    }
                }
            }
        }
    });
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let mut registry = aster::tools::ToolRegistry::new();

    let registered = register_agent_app_connector_preview_tools(&mut registry, Some(&metadata));

    assert_eq!(registered, 1);
    let result = registry
        .execute(
            "connector__notion__createPage",
            serde_json::json!({
                "connectorId": "notion",
                "action": "createPage",
                "idempotencyKey": "notion-secret-delivery-ready-1",
                "input": {
                    "title": "内容计划",
                    "accessToken": "raw-token-should-not-leak"
                }
            }),
            &ToolContext::new(temp_dir.path().to_path_buf()),
            None,
        )
        .await
        .expect("cloud connector should queue with secret delivery facts");
    let payload = result.metadata.get("result").expect("result metadata");

    assert!(result.success);
    assert_eq!(
        payload.get("adapterReadiness"),
        Some(&serde_json::json!(
            "host_managed_secret_delivery_adapter_ready"
        ))
    );
    assert_eq!(
        payload.pointer("/secretDelivery/status"),
        Some(&serde_json::json!("ready"))
    );
    assert_eq!(
        payload.pointer("/secretDelivery/credentialMaterialExposed"),
        Some(&serde_json::json!(false))
    );
    assert_eq!(
        payload.pointer("/secretDelivery/target"),
        Some(&serde_json::json!("cloud_overlay_worker"))
    );
    assert_eq!(
        payload.pointer("/secretDelivery/leaseObserved"),
        Some(&serde_json::json!(true))
    );
    assert_eq!(
        payload.pointer("/secretDelivery/leaseRefExposed"),
        Some(&serde_json::json!(false))
    );
    assert_eq!(
        payload.pointer("/secretDelivery/leaseHandleStatus"),
        Some(&serde_json::json!("host_managed"))
    );
    assert!(payload.pointer("/secretDelivery/leaseRef").is_none());
    assert_eq!(
        payload.pointer("/next/required"),
        Some(&serde_json::json!("external_platform_delivery"))
    );
    assert_eq!(
        payload.pointer("/delivery/status"),
        Some(&serde_json::json!("accepted_by_local_cloud_overlay_worker"))
    );
    assert_eq!(
        payload.pointer("/delivery/externalPlatformDelivered"),
        Some(&serde_json::json!(false))
    );
    assert_eq!(
        payload.pointer("/evidenceRefs/1/kind"),
        Some(&serde_json::json!(
            "connector_cloud_overlay_worker_delivery_receipt"
        ))
    );
    let serialized = serde_json::to_string(&result).expect("result should serialize");
    assert!(!serialized.contains("raw-token-should-not-leak"));
    assert!(!serialized.contains("secret-lease://connector/"));

    let outbox_path = temp_dir
        .path()
        .join(".lime/agent-app-connectors/cloud-overlay/outbox.jsonl");
    let mut outbox = String::new();
    std::fs::File::open(outbox_path)
        .expect("cloud overlay outbox should exist")
        .read_to_string(&mut outbox)
        .expect("cloud overlay outbox should be readable");
    assert!(outbox.contains("secret-lease://connector/notion/createPage/test-lease"));
    assert!(outbox.contains("secretDeliveryInternal"));
    let receipt_path = temp_dir
        .path()
        .join(".lime/agent-app-connectors/cloud-overlay/delivery-receipts.jsonl");
    let mut receipt = String::new();
    std::fs::File::open(receipt_path)
        .expect("cloud overlay delivery receipt should exist")
        .read_to_string(&mut receipt)
        .expect("cloud overlay delivery receipt should be readable");
    assert!(receipt.contains("accepted_by_local_cloud_overlay_worker"));
    assert!(receipt.contains("secret-lease://connector/notion/createPage/test-lease"));
    assert!(!receipt.contains("raw-token-should-not-leak"));
}

#[tokio::test]
async fn agent_app_connector_cloud_overlay_can_deliver_to_host_managed_webhook() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("local webhook listener");
    let target_url = format!("http://{}", listener.local_addr().expect("listener addr"));
    let webhook = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.expect("webhook accept");
        let mut buffer = Vec::new();
        let mut chunk = [0_u8; 1024];
        loop {
            let read = socket.read(&mut chunk).await.expect("webhook read");
            if read == 0 {
                break;
            }
            buffer.extend_from_slice(&chunk[..read]);
            let header_end = buffer
                .windows(4)
                .position(|window| window == b"\r\n\r\n")
                .map(|index| index + 4);
            let Some(header_end) = header_end else {
                continue;
            };
            let headers = String::from_utf8_lossy(&buffer[..header_end]);
            let content_length = headers
                .lines()
                .find_map(|line| {
                    let (name, value) = line.split_once(':')?;
                    name.eq_ignore_ascii_case("content-length").then_some(value)
                })
                .and_then(|value| value.trim().parse::<usize>().ok())
                .unwrap_or(0);
            if buffer.len() >= header_end + content_length {
                break;
            }
        }
        let request = String::from_utf8_lossy(&buffer).to_string();
        socket
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK")
            .await
            .expect("webhook response");
        request
    });
    let metadata = serde_json::json!({
        "harness": {
            "agent_app_tool_execution": {
                "request": {
                    "capability": "lime.connectors",
                    "method": "invoke",
                    "action": "createPage",
                    "input": {
                        "connectorId": "notion",
                        "action": "createPage",
                        "connectorRuntimeFacts": {
                            "authorizationStatus": "authorized",
                            "secretBinding": "host_managed",
                            "tokenExposed": false,
                            "secretDelivery": {
                                "status": "ready",
                                "binding": "host_managed",
                                "source": "host_managed_secret_delivery_fact",
                                "target": "cloud_overlay_worker",
                                "leaseObserved": true,
                                "leaseRefExposed": false,
                                "leaseHandleStatus": "host_managed",
                                "credentialMaterialExposed": false,
                                "tokenExposed": false
                            }
                        }
                    },
                    "policy": {
                        "secretBinding": "host_managed",
                        "tokenExposed": false
                    }
                },
                "internalRequest": {
                    "capability": "lime.connectors",
                    "method": "invoke",
                    "action": "createPage",
                    "input": {
                        "connectorId": "notion",
                        "action": "createPage",
                        "connectorRuntimeFacts": {
                            "authorizationStatus": "authorized",
                            "secretBinding": "host_managed",
                            "tokenExposed": false,
                            "secretDelivery": {
                                "status": "ready",
                                "binding": "host_managed",
                                "source": "host_managed_secret_delivery_fact",
                                "target": "cloud_overlay_worker",
                                "leaseRef": "secret-lease://connector/notion/createPage/webhook-lease",
                                "credentialMaterialExposed": false,
                                "tokenExposed": false,
                                "externalDelivery": {
                                    "status": "ready",
                                    "binding": "host_managed",
                                    "channel": "webhook",
                                    "target": target_url,
                                    "targetLabel": "local-test-webhook",
                                    "targetExposed": false,
                                    "credentialMaterialExposed": false,
                                    "tokenExposed": false
                                }
                            }
                        }
                    },
                    "policy": {
                        "secretBinding": "host_managed",
                        "tokenExposed": false
                    }
                }
            }
        }
    });
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let mut registry = aster::tools::ToolRegistry::new();

    let registered = register_agent_app_connector_preview_tools(&mut registry, Some(&metadata));

    assert_eq!(registered, 1);
    let result = registry
        .execute(
            "connector__notion__createPage",
            serde_json::json!({
                "connectorId": "notion",
                "action": "createPage",
                "idempotencyKey": "notion-external-delivery-ready-1",
                "input": {
                    "title": "内容计划",
                    "accessToken": "raw-token-should-not-leak"
                }
            }),
            &ToolContext::new(temp_dir.path().to_path_buf()),
            None,
        )
        .await
        .expect("cloud connector should deliver to host-managed webhook");
    let payload = result.metadata.get("result").expect("result metadata");

    assert!(result.success);
    assert_eq!(
        payload.pointer("/delivery/status"),
        Some(&serde_json::json!("delivered_to_external_platform")),
        "delivery payload: {payload}"
    );
    assert_eq!(
        payload.pointer("/externalStatus"),
        Some(&serde_json::json!("delivered"))
    );
    assert_eq!(
        payload.pointer("/delivery/externalPlatformDelivered"),
        Some(&serde_json::json!(true))
    );
    assert_eq!(
        payload.pointer("/delivery/externalDelivery/channel"),
        Some(&serde_json::json!("webhook"))
    );
    assert_eq!(
        payload.pointer("/delivery/externalDelivery/targetExposed"),
        Some(&serde_json::json!(false))
    );
    assert_eq!(
        payload.pointer("/next/required"),
        Some(&serde_json::json!("external_platform_delivery_complete"))
    );
    let request = webhook.await.expect("webhook join");
    assert!(request.contains("POST / HTTP/1.1"));
    assert!(request.contains("notion-external-delivery-ready-1"));
    let serialized = serde_json::to_string(&result).expect("result should serialize");
    assert!(!serialized.contains(&target_url));
    assert!(!serialized.contains("raw-token-should-not-leak"));
    assert!(!serialized.contains("secret-lease://connector/"));

    let receipt_path = temp_dir
        .path()
        .join(".lime/agent-app-connectors/cloud-overlay/delivery-receipts.jsonl");
    let mut receipt = String::new();
    std::fs::File::open(receipt_path)
        .expect("cloud overlay delivery receipt should exist")
        .read_to_string(&mut receipt)
        .expect("cloud overlay delivery receipt should be readable");
    assert!(receipt.contains("delivered_to_external_platform"));
    assert!(receipt.contains("externalPlatformDelivered\":true"));
    assert!(!receipt.contains(&target_url));
    assert!(!receipt.contains("raw-token-should-not-leak"));
}

#[tokio::test]
async fn agent_app_connector_external_delivery_rejects_inline_secret_material() {
    let metadata = serde_json::json!({
        "harness": {
            "agent_app_tool_execution": {
                "request": {
                    "capability": "lime.connectors",
                    "method": "invoke",
                    "action": "createPage",
                    "input": {
                        "connectorId": "notion",
                        "action": "createPage",
                        "connectorRuntimeFacts": {
                            "authorizationStatus": "authorized",
                            "secretBinding": "host_managed",
                            "tokenExposed": false,
                            "secretDelivery": {
                                "status": "ready",
                                "binding": "host_managed",
                                "source": "host_managed_secret_delivery_fact",
                                "target": "cloud_overlay_worker",
                                "leaseObserved": true,
                                "leaseRefExposed": false,
                                "leaseHandleStatus": "host_managed",
                                "credentialMaterialExposed": false,
                                "tokenExposed": false
                            }
                        }
                    },
                    "policy": {
                        "secretBinding": "host_managed",
                        "tokenExposed": false
                    }
                },
                "internalRequest": {
                    "capability": "lime.connectors",
                    "method": "invoke",
                    "action": "createPage",
                    "input": {
                        "connectorId": "notion",
                        "action": "createPage",
                        "connectorRuntimeFacts": {
                            "authorizationStatus": "authorized",
                            "secretBinding": "host_managed",
                            "tokenExposed": false,
                            "secretDelivery": {
                                "status": "ready",
                                "binding": "host_managed",
                                "source": "host_managed_secret_delivery_fact",
                                "target": "cloud_overlay_worker",
                                "leaseRef": "secret-lease://connector/notion/createPage/raw-header-lease",
                                "credentialMaterialExposed": false,
                                "tokenExposed": false,
                                "externalDelivery": {
                                    "status": "ready",
                                    "binding": "host_managed",
                                    "channel": "webhook",
                                    "target": "https://example.com/connector-webhook",
                                    "targetLabel": "raw-header-should-not-run",
                                    "targetExposed": false,
                                    "credentialMaterialExposed": false,
                                    "tokenExposed": false,
                                    "authorizationHeader": "Bearer raw-secret-should-not-leak"
                                }
                            }
                        }
                    },
                    "policy": {
                        "secretBinding": "host_managed",
                        "tokenExposed": false
                    }
                }
            }
        }
    });
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let mut registry = aster::tools::ToolRegistry::new();

    let registered = register_agent_app_connector_preview_tools(&mut registry, Some(&metadata));

    assert_eq!(registered, 1);
    let result = registry
        .execute(
            "connector__notion__createPage",
            serde_json::json!({
                "connectorId": "notion",
                "action": "createPage",
                "idempotencyKey": "notion-inline-secret-rejected-1"
            }),
            &ToolContext::new(temp_dir.path().to_path_buf()),
            None,
        )
        .await
        .expect("cloud connector should keep local worker receipt only");
    let payload = result.metadata.get("result").expect("result metadata");

    assert!(result.success);
    assert_eq!(
        payload.get("adapterReadiness"),
        Some(&serde_json::json!(
            "host_managed_secret_delivery_adapter_ready"
        ))
    );
    assert_eq!(
        payload.pointer("/delivery/status"),
        Some(&serde_json::json!("accepted_by_local_cloud_overlay_worker"))
    );
    assert_eq!(
        payload.pointer("/delivery/externalDelivery/status"),
        Some(&serde_json::json!("not_configured"))
    );
    assert_eq!(
        payload.pointer("/delivery/externalPlatformDelivered"),
        Some(&serde_json::json!(false))
    );
    assert_eq!(
        payload.pointer("/next/required"),
        Some(&serde_json::json!("external_platform_delivery"))
    );
    let serialized = serde_json::to_string(&result).expect("result should serialize");
    assert!(!serialized.contains("raw-secret-should-not-leak"));
    assert!(!serialized.contains("https://example.com/connector-webhook"));
}

#[tokio::test]
async fn agent_app_connector_secret_delivery_requires_host_managed_lease_ref() {
    let metadata = serde_json::json!({
        "harness": {
            "agent_app_tool_execution": {
                "request": {
                    "capability": "lime.connectors",
                    "method": "invoke",
                    "action": "createPage",
                    "input": {
                        "connectorId": "notion",
                        "action": "createPage",
                        "connectorRuntimeFacts": {
                            "authorizationStatus": "authorized",
                            "secretBinding": "host_managed",
                            "tokenExposed": false,
                            "secretDelivery": {
                                "status": "ready",
                                "binding": "host_managed",
                                "source": "host_managed_secret_delivery_fact",
                                "target": "cloud_overlay_worker",
                                "credentialMaterialExposed": false,
                                "tokenExposed": false
                            }
                        }
                    },
                    "policy": {
                        "secretBinding": "host_managed",
                        "tokenExposed": false
                    }
                }
            }
        }
    });
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let mut registry = aster::tools::ToolRegistry::new();

    let registered = register_agent_app_connector_preview_tools(&mut registry, Some(&metadata));

    assert_eq!(registered, 1);
    let result = registry
        .execute(
            "connector__notion__createPage",
            serde_json::json!({
                "connectorId": "notion",
                "action": "createPage",
                "idempotencyKey": "notion-secret-delivery-no-lease-1"
            }),
            &ToolContext::new(temp_dir.path().to_path_buf()),
            None,
        )
        .await
        .expect("cloud connector should still queue without delivery readiness");
    let payload = result.metadata.get("result").expect("result metadata");

    assert!(result.success);
    assert_eq!(
        payload.get("adapterReadiness"),
        Some(&serde_json::json!("host_managed_outbox_adapter_ready"))
    );
    assert_eq!(
        payload.pointer("/secretDelivery/status"),
        Some(&serde_json::json!("pending"))
    );
    assert_eq!(
        payload.pointer("/secretDelivery/leaseObserved"),
        Some(&serde_json::json!(false))
    );
    assert_eq!(
        payload.pointer("/secretDelivery/leaseRefExposed"),
        Some(&serde_json::json!(false))
    );
    assert!(payload.pointer("/secretDelivery/leaseRef").is_none());
}

#[tokio::test]
async fn agent_app_connector_secret_delivery_requires_no_credential_material() {
    let metadata = serde_json::json!({
        "harness": {
            "agent_app_tool_execution": {
                "request": {
                    "capability": "lime.connectors",
                    "method": "invoke",
                    "action": "createPage",
                    "input": {
                        "connectorId": "notion",
                        "action": "createPage",
                        "connectorRuntimeFacts": {
                            "authorizationStatus": "authorized",
                            "secretBinding": "host_managed",
                            "tokenExposed": false,
                            "secretDeliveryStatus": "ready",
                            "credentialMaterialExposed": true
                        }
                    },
                    "policy": {
                        "secretBinding": "host_managed",
                        "tokenExposed": false
                    }
                }
            }
        }
    });
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let mut registry = aster::tools::ToolRegistry::new();

    let registered = register_agent_app_connector_preview_tools(&mut registry, Some(&metadata));

    assert_eq!(registered, 1);
    let result = registry
        .execute(
            "connector__notion__createPage",
            serde_json::json!({
                "connectorId": "notion",
                "action": "createPage",
                "idempotencyKey": "notion-secret-delivery-exposed-1"
            }),
            &ToolContext::new(temp_dir.path().to_path_buf()),
            None,
        )
        .await
        .expect("cloud connector should still queue without delivery readiness");
    let payload = result.metadata.get("result").expect("result metadata");

    assert!(result.success);
    assert_eq!(
        payload.get("adapterReadiness"),
        Some(&serde_json::json!("host_managed_outbox_adapter_ready"))
    );
    assert_eq!(
        payload.pointer("/secretDelivery/status"),
        Some(&serde_json::json!("pending"))
    );
}

#[tokio::test]
async fn agent_app_connector_preview_requires_host_managed_secret_fact() {
    let metadata = serde_json::json!({
        "harness": {
            "agent_app_tool_execution": {
                "request": {
                    "capability": "lime.connectors",
                    "method": "invoke",
                    "action": "createPage",
                    "input": {
                        "connectorId": "notion",
                        "action": "createPage",
                        "connectorRuntimeFacts": {
                            "authorizationStatus": "authorized"
                        }
                    }
                }
            }
        }
    });
    let mut registry = aster::tools::ToolRegistry::new();

    let registered = register_agent_app_connector_preview_tools(&mut registry, Some(&metadata));

    assert_eq!(registered, 1);
    let result = registry
        .execute(
            "connector__notion__createPage",
            serde_json::json!({
                "connectorId": "notion",
                "action": "createPage"
            }),
            &ToolContext::new(PathBuf::from(".")),
            None,
        )
        .await
        .expect("connector preview should return controlled result");
    let payload = result.metadata.get("result").expect("result metadata");

    assert!(!result.success);
    assert_eq!(
        payload.get("reason"),
        Some(&serde_json::json!(
            "connector_toolruntime_adapter_not_configured"
        ))
    );
    assert_eq!(
        payload.get("adapterReadiness"),
        Some(&serde_json::json!("adapter_not_configured"))
    );
    assert_eq!(
        payload.pointer("/next/required"),
        Some(&serde_json::json!("current_connector_toolruntime_adapter"))
    );
}

#[tokio::test]
async fn agent_app_connector_preview_does_not_trust_generic_tool_facts() {
    let metadata = serde_json::json!({
        "harness": {
            "agent_app_tool_execution": {
                "request": {
                    "capability": "lime.tools",
                    "method": "invoke",
                    "toolName": "connector__notion__createPage",
                    "input": {
                        "connectorRuntimeFacts": {
                            "authorizationStatus": "authorized",
                            "secretBinding": "host_managed",
                            "tokenExposed": false
                        }
                    },
                    "policy": {
                        "secretBinding": "host_managed",
                        "tokenExposed": false
                    }
                }
            }
        }
    });
    let mut registry = aster::tools::ToolRegistry::new();

    let registered = register_agent_app_connector_preview_tools(&mut registry, Some(&metadata));

    assert_eq!(registered, 1);
    let result = registry
        .execute(
            "connector__notion__createPage",
            serde_json::json!({
                "connectorId": "notion",
                "action": "createPage"
            }),
            &ToolContext::new(PathBuf::from(".")),
            None,
        )
        .await
        .expect("connector preview should return controlled result");
    let payload = result.metadata.get("result").expect("result metadata");

    assert!(!result.success);
    assert_eq!(
        payload.get("adapterReadiness"),
        Some(&serde_json::json!("adapter_not_configured"))
    );
    assert_eq!(
        payload.pointer("/next/required"),
        Some(&serde_json::json!("current_connector_toolruntime_adapter"))
    );
}

#[tokio::test]
async fn agent_app_connector_fixture_executes_host_managed_mutation() {
    let metadata = serde_json::json!({
        "harness": {
            "agent_app_tool_execution": {
                "request": {
                    "capability": "lime.connectors",
                    "method": "invoke",
                    "action": "recordMutation",
                    "input": {
                        "connectorId": "lime_fixture",
                        "action": "recordMutation",
                        "connectorRuntimeFacts": {
                            "authorizationStatus": "authorized",
                            "secretBinding": "host_managed",
                            "tokenExposed": false,
                            "source": "agent_app_connector_authorization_task"
                        }
                    },
                    "policy": {
                        "secretBinding": "host_managed",
                        "tokenExposed": false
                    }
                }
            }
        }
    });
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let mut registry = aster::tools::ToolRegistry::new();

    let registered = register_agent_app_connector_preview_tools(&mut registry, Some(&metadata));

    assert_eq!(registered, 1);
    let result = registry
        .execute(
            "connector__lime_fixture__recordMutation",
            serde_json::json!({
                "connectorId": "lime_fixture",
                "action": "recordMutation",
                "idempotencyKey": "fixture-mutation-1",
                "input": {
                    "title": "P18.7 mutation proof",
                    "refreshToken": "fixture-refresh-token",
                    "workspaceRoot": temp_dir.path().to_string_lossy()
                },
                "evidenceRef": "app-made-evidence"
            }),
            &ToolContext::new(temp_dir.path().to_path_buf()),
            None,
        )
        .await
        .expect("fixture connector should execute controlled mutation");
    let payload = result.metadata.get("result").expect("result metadata");

    assert!(result.success);
    assert_eq!(payload.get("status"), Some(&serde_json::json!("completed")));
    assert_eq!(
        payload.get("adapterKind"),
        Some(&serde_json::json!("host_fixture_connector"))
    );
    assert_eq!(
        payload.get("adapterReadiness"),
        Some(&serde_json::json!("host_managed_fixture_adapter_ready"))
    );
    assert_eq!(
        payload.pointer("/evidenceRefs/0/kind"),
        Some(&serde_json::json!("connector_fixture_mutation_log"))
    );
    assert_eq!(
        payload.pointer("/next/required"),
        Some(&serde_json::json!("external_connector_oauth_adapter"))
    );

    let serialized = serde_json::to_string(&result).expect("result should serialize");
    assert!(!serialized.contains("fixture-refresh-token"));
    assert!(!serialized.contains("app-made-evidence"));
    assert!(!serialized.contains(temp_dir.path().to_string_lossy().as_ref()));

    let log_path = temp_dir
        .path()
        .join(".lime/agent-app-connectors/fixture/mutations.jsonl");
    let mut log = String::new();
    std::fs::File::open(log_path)
        .expect("fixture mutation log should exist")
        .read_to_string(&mut log)
        .expect("fixture mutation log should be readable");
    assert!(log.contains("fixture-mutation-1"));
    assert!(!log.contains("fixture-refresh-token"));
}

#[tokio::test]
async fn agent_app_connector_fixture_requires_host_managed_authorization_fact() {
    let metadata = serde_json::json!({
        "harness": {
            "agent_app_tool_execution": {
                "request": {
                    "capability": "lime.connectors",
                    "method": "invoke",
                    "action": "recordMutation",
                    "input": {
                        "connectorId": "lime_fixture",
                        "action": "recordMutation"
                    }
                }
            }
        }
    });
    let mut registry = aster::tools::ToolRegistry::new();

    let registered = register_agent_app_connector_preview_tools(&mut registry, Some(&metadata));

    assert_eq!(registered, 1);
    let result = registry
        .execute(
            "connector__lime_fixture__recordMutation",
            serde_json::json!({
                "connectorId": "lime_fixture",
                "action": "recordMutation"
            }),
            &ToolContext::new(PathBuf::from(".")),
            None,
        )
        .await
        .expect("fixture connector should return controlled result");
    let payload = result.metadata.get("result").expect("result metadata");

    assert!(!result.success);
    assert_eq!(
        payload.get("adapterReadiness"),
        Some(&serde_json::json!("adapter_not_configured"))
    );
}
