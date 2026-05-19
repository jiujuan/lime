use super::readiness::connector_value_at_path;
use super::readiness::ConnectorAdapterReadiness;
use super::readiness::ConnectorProductionDelivery;
use super::sanitize::sanitized_connector_input;
use super::*;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn cloud_overlay_mutation_id(params: &serde_json::Value) -> String {
    [
        &["idempotencyKey"][..],
        &["idempotency_key"][..],
        &["input", "idempotencyKey"][..],
        &["input", "idempotency_key"][..],
    ]
    .iter()
    .find_map(|path| connector_value_at_path(Some(params), path))
    .and_then(serde_json::Value::as_str)
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_string)
    .unwrap_or_else(|| format!("cloud-overlay-mutation-{}", Uuid::new_v4()))
}

async fn append_json_line(path: &Path, payload: &serde_json::Value) -> Result<(), ToolError> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let mut line = serde_json::to_string(payload)
        .map_err(|error| ToolError::execution_failed(error.to_string()))?;
    line.push('\n');
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await?;
    file.write_all(line.as_bytes()).await?;
    file.flush().await?;
    Ok(())
}

fn external_delivery_target_hash(target: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(target.trim().as_bytes());
    format!("sha256:{}", hex::encode(hasher.finalize()))
}

fn external_delivery_error_code(error: &reqwest::Error) -> &'static str {
    if error.is_timeout() {
        "timeout"
    } else if error.is_connect() {
        "connect_failed"
    } else if error.is_request() {
        "request_build_failed"
    } else {
        "request_failed"
    }
}

fn production_delivery_projection(
    delivery_ref_observed: bool,
    external_delivery: Option<&serde_json::Value>,
    production_delivery: Option<&ConnectorProductionDelivery>,
) -> serde_json::Value {
    if let Some(production_delivery) = production_delivery {
        return serde_json::json!({
            "status": "production_platform_delivered",
            "proofLevel": production_delivery.proof_level.as_str(),
            "externalDeliveryObserved": external_delivery
                .and_then(|value| value.get("externalPlatformDelivered"))
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false),
            "productionPlatformDelivered": true,
            "oauthHandshakeRequired": false,
            "rawSecretMaterialAdapterRequired": false,
            "nextRequired": "production_connector_delivery_complete",
            "receiptRef": production_delivery.receipt_ref.as_deref(),
            "platform": production_delivery.platform.as_deref(),
            "deliveredAt": production_delivery.delivered_at.as_deref()
        });
    }
    let external_delivery_observed = external_delivery
        .and_then(|value| value.get("externalPlatformDelivered"))
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    let proof_level = if external_delivery_observed {
        "host_managed_webhook_receipt"
    } else if delivery_ref_observed {
        "local_cloud_overlay_worker_receipt"
    } else {
        "not_configured"
    };

    serde_json::json!({
        "status": "production_platform_delivery_not_verified",
        "proofLevel": proof_level,
        "externalDeliveryObserved": external_delivery_observed,
        "productionPlatformDelivered": false,
        "oauthHandshakeRequired": true,
        "rawSecretMaterialAdapterRequired": true,
        "nextRequired": "production_connector_delivery_adapter"
    })
}

enum ExternalDeliveryAttempt {
    HttpStatus(u16),
    Error(&'static str),
}

struct LocalWebhookTarget {
    host: String,
    port: u16,
    host_header: String,
    path_and_query: String,
}

fn local_http_webhook_target(target: &str) -> Option<LocalWebhookTarget> {
    let trimmed = target.trim();
    let url = url::Url::parse(trimmed).ok()?;
    if url.scheme() != "http" {
        return None;
    }
    let host = url.host_str()?.trim().to_ascii_lowercase();
    if !matches!(host.as_str(), "127.0.0.1" | "localhost") {
        return None;
    }
    let port = url.port()?;
    let host_header = format!("{host}:{port}");
    let mut path_and_query = url.path().to_string();
    if path_and_query.is_empty() {
        path_and_query = "/".to_string();
    }
    if let Some(query) = url.query() {
        path_and_query.push('?');
        path_and_query.push_str(query);
    }

    Some(LocalWebhookTarget {
        host,
        port,
        host_header,
        path_and_query,
    })
}

async fn deliver_local_http_webhook(
    target: &str,
    delivery_ref: &str,
    request_payload: &serde_json::Value,
) -> ExternalDeliveryAttempt {
    let Some(target) = local_http_webhook_target(target) else {
        return ExternalDeliveryAttempt::Error("request_build_failed");
    };
    let body = match serde_json::to_vec(request_payload) {
        Ok(body) => body,
        Err(_) => return ExternalDeliveryAttempt::Error("request_build_failed"),
    };
    let connect = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        tokio::net::TcpStream::connect((target.host.as_str(), target.port)),
    )
    .await;
    let mut socket = match connect {
        Ok(Ok(socket)) => socket,
        Err(_) => return ExternalDeliveryAttempt::Error("timeout"),
        Ok(Err(_)) => return ExternalDeliveryAttempt::Error("connect_failed"),
    };

    let header = format!(
        concat!(
            "POST {} HTTP/1.1\r\n",
            "Host: {}\r\n",
            "Content-Type: application/json\r\n",
            "Content-Length: {}\r\n",
            "Connection: close\r\n",
            "X-Lime-Connector-Delivery-Ref: {}\r\n",
            "\r\n"
        ),
        target.path_and_query,
        target.host_header,
        body.len(),
        delivery_ref
    );
    let write_result = tokio::time::timeout(std::time::Duration::from_secs(10), async {
        socket.write_all(header.as_bytes()).await?;
        socket.write_all(&body).await?;
        socket.flush().await
    })
    .await;
    match write_result {
        Ok(Ok(())) => {}
        Err(_) => return ExternalDeliveryAttempt::Error("timeout"),
        Ok(Err(_)) => return ExternalDeliveryAttempt::Error("request_failed"),
    }

    let mut response = Vec::new();
    let read_result = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        socket.read_to_end(&mut response),
    )
    .await;
    match read_result {
        Ok(Ok(_)) => {}
        Err(_) => return ExternalDeliveryAttempt::Error("timeout"),
        Ok(Err(_)) => return ExternalDeliveryAttempt::Error("request_failed"),
    }
    let first_line = response
        .split(|byte| *byte == b'\n')
        .next()
        .and_then(|line| std::str::from_utf8(line).ok())
        .map(str::trim);
    let Some(status) = first_line
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|status| status.parse::<u16>().ok())
    else {
        return ExternalDeliveryAttempt::Error("request_failed");
    };

    ExternalDeliveryAttempt::HttpStatus(status)
}

async fn post_external_delivery(
    target: &str,
    delivery_ref: &str,
    request_payload: &serde_json::Value,
) -> ExternalDeliveryAttempt {
    if local_http_webhook_target(target).is_some() {
        return deliver_local_http_webhook(target, delivery_ref, request_payload).await;
    }

    match reqwest::Client::builder().build() {
        Ok(client) => match client
            .post(target)
            .header("X-Lime-Connector-Delivery-Ref", delivery_ref)
            .json(request_payload)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            Ok(response) => ExternalDeliveryAttempt::HttpStatus(response.status().as_u16()),
            Err(error) => ExternalDeliveryAttempt::Error(external_delivery_error_code(&error)),
        },
        Err(_) => ExternalDeliveryAttempt::Error("request_build_failed"),
    }
}

async fn deliver_external_platform(
    connector_id: &str,
    action: &str,
    mutation_id: &str,
    evidence_ref: &str,
    delivery_ref: &str,
    input_preview: &serde_json::Value,
    adapter: &ConnectorAdapterReadiness,
) -> serde_json::Value {
    let Some(config) = adapter.external_delivery.as_ref() else {
        return serde_json::json!({
            "status": "not_configured",
            "externalPlatformDelivered": false
        });
    };
    let target_hash = external_delivery_target_hash(config.target.as_str());
    let delivered_at = chrono::Utc::now().to_rfc3339();
    let request_payload = serde_json::json!({
        "connectorId": connector_id,
        "action": action,
        "mutationId": mutation_id,
        "outboxRef": evidence_ref,
        "deliveryRef": delivery_ref,
        "inputPreview": input_preview,
        "source": "agent_app_connector_cloud_overlay_external_delivery_adapter"
    });
    match post_external_delivery(config.target.as_str(), delivery_ref, &request_payload).await {
        ExternalDeliveryAttempt::HttpStatus(http_status) => {
            let delivered = (200..300).contains(&http_status);
            serde_json::json!({
                "status": if delivered { "delivered_to_external_platform" } else { "external_platform_delivery_failed" },
                "channel": config.channel.as_str(),
                "targetHash": target_hash,
                "targetLabel": config.target_label.as_deref(),
                "targetExposed": false,
                "credentialMaterialExposed": false,
                "tokenExposed": false,
                "proofLevel": "host_managed_webhook_receipt",
                "productionPlatformDelivered": false,
                "httpStatus": http_status,
                "deliveredAt": delivered_at,
                "externalPlatformDelivered": delivered
            })
        }
        ExternalDeliveryAttempt::Error(error) => serde_json::json!({
            "status": "external_platform_delivery_failed",
            "channel": config.channel.as_str(),
            "targetHash": target_hash,
            "targetLabel": config.target_label.as_deref(),
            "targetExposed": false,
            "credentialMaterialExposed": false,
            "tokenExposed": false,
            "proofLevel": "host_managed_webhook_receipt",
            "productionPlatformDelivered": false,
            "error": error,
            "deliveredAt": delivered_at,
            "externalPlatformDelivered": false
        }),
    }
}

pub(super) async fn enqueue_cloud_overlay_connector_mutation(
    connector_id: &str,
    action: &str,
    params: &serde_json::Value,
    context: &ToolContext,
    adapter: &ConnectorAdapterReadiness,
) -> Result<ToolResult, ToolError> {
    let mutation_id = cloud_overlay_mutation_id(params);
    let occurred_at = chrono::Utc::now().to_rfc3339();
    let relative_path = Path::new(".lime")
        .join("agent-app-connectors")
        .join("cloud-overlay")
        .join("outbox.jsonl");
    let outbox_path = context.working_directory.join(&relative_path);
    let delivery_relative_path = Path::new(".lime")
        .join("agent-app-connectors")
        .join("cloud-overlay")
        .join("delivery-receipts.jsonl");
    let delivery_path = context.working_directory.join(&delivery_relative_path);

    let input_preview = sanitized_connector_input(params);
    let evidence_ref = format!("outbox://connector/{connector_id}/{action}/{mutation_id}");
    let lease_observed = adapter.secret_delivery_lease_ref.is_some();
    let delivery_ref = adapter
        .secret_delivery_lease_ref
        .as_ref()
        .map(|_| format!("delivery://connector/{connector_id}/{action}/{mutation_id}"));
    let external_delivery = if let Some(delivery_ref) = delivery_ref.as_deref() {
        Some(
            deliver_external_platform(
                connector_id,
                action,
                &mutation_id,
                &evidence_ref,
                delivery_ref,
                &input_preview,
                adapter,
            )
            .await,
        )
    } else {
        None
    };
    let production_delivery = production_delivery_projection(
        delivery_ref.is_some(),
        external_delivery.as_ref(),
        adapter.production_delivery.as_ref(),
    );
    let secret_delivery = serde_json::json!({
        "status": adapter.secret_delivery_status,
        "binding": "host_managed",
        "source": adapter.secret_delivery_source,
        "target": adapter.secret_delivery_target,
        "leaseObserved": lease_observed,
        "leaseRefExposed": false,
        "leaseHandleStatus": if lease_observed { "host_managed" } else { "not_observed" },
        "credentialMaterialExposed": false,
        "tokenExposed": false
    });
    let mut evidence_refs = vec![serde_json::json!({
        "kind": "connector_cloud_overlay_outbox",
        "ref": evidence_ref,
        "storage": "workspace_local",
        "relativePath": ".lime/agent-app-connectors/cloud-overlay/outbox.jsonl"
    })];
    let delivery_receipt = delivery_ref.as_deref().map(|delivery_ref| {
        let external_delivery = external_delivery.clone().unwrap_or_else(|| {
            serde_json::json!({
                "status": "not_configured",
                "externalPlatformDelivered": false
            })
        });
        let external_platform_delivered = external_delivery
            .get("externalPlatformDelivered")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        let production_platform_delivered = adapter.production_delivery.is_some();
        let delivery_status = if production_platform_delivered {
            "delivered_to_production_platform"
        } else {
            external_delivery
                .get("status")
                .and_then(serde_json::Value::as_str)
                .filter(|status| *status != "not_configured")
                .unwrap_or("accepted_by_local_cloud_overlay_worker")
        };
        evidence_refs.push(serde_json::json!({
            "kind": "connector_cloud_overlay_worker_delivery_receipt",
            "ref": delivery_ref,
            "storage": "workspace_local",
            "relativePath": ".lime/agent-app-connectors/cloud-overlay/delivery-receipts.jsonl"
        }));
        serde_json::json!({
            "status": delivery_status,
            "receiptRef": delivery_ref,
            "outboxRef": evidence_ref,
            "storage": "workspace_local",
            "relativePath": ".lime/agent-app-connectors/cloud-overlay/delivery-receipts.jsonl",
            "externalPlatformDelivered": external_platform_delivered,
            "externalDelivery": external_delivery,
            "productionPlatformDelivered": production_platform_delivered,
            "productionDelivery": production_delivery.clone(),
            "credentialMaterialExposed": false,
            "tokenExposed": false
        })
    });
    let production_platform_delivered = adapter.production_delivery.is_some();
    let external_platform_delivered = external_delivery
        .as_ref()
        .and_then(|value| value.get("externalPlatformDelivered"))
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false);
    let next_required = if production_platform_delivered {
        "production_connector_delivery_complete"
    } else if external_platform_delivered {
        "external_platform_delivery_complete"
    } else if delivery_ref.is_some() {
        "external_platform_delivery"
    } else {
        adapter.next_required
    };
    let external_status = if production_platform_delivered || external_platform_delivered {
        "delivered"
    } else {
        "not_delivered"
    };
    let mut result_payload = serde_json::json!({
        "success": true,
        "status": "queued_for_cloud_overlay",
        "externalStatus": external_status,
        "connectorId": connector_id,
        "action": action,
        "mutationId": mutation_id,
        "occurredAt": occurred_at,
        "adapterKind": adapter.kind,
        "adapterReadiness": adapter.readiness,
        "secretBinding": "host_managed",
        "tokenExposed": false,
        "secretDelivery": secret_delivery,
        "productionDelivery": production_delivery,
        "source": "agent_app_connector_cloud_overlay_outbox_adapter",
        "inputPreview": input_preview,
        "evidenceRefs": evidence_refs,
        "next": {
            "owner": "lime_cloud_overlay_connector_worker",
            "required": next_required
        }
    });
    if let Some(delivery_receipt) = delivery_receipt.clone() {
        result_payload["delivery"] = delivery_receipt;
    }
    let mut outbox_payload = result_payload.clone();
    if let Some(lease_ref) = adapter.secret_delivery_lease_ref.as_deref() {
        outbox_payload["secretDeliveryInternal"] = serde_json::json!({
            "binding": "host_managed",
            "source": adapter.secret_delivery_source,
            "target": adapter.secret_delivery_target,
            "leaseRef": lease_ref,
            "expiresAt": adapter.secret_delivery_expires_at.as_deref(),
            "credentialMaterialExposed": false,
            "tokenExposed": false
        });
    }
    append_json_line(&outbox_path, &outbox_payload).await?;
    if let (Some(delivery_receipt), Some(lease_ref)) = (
        delivery_receipt,
        adapter.secret_delivery_lease_ref.as_deref(),
    ) {
        let mut delivery_payload = delivery_receipt;
        delivery_payload["connectorId"] = serde_json::json!(connector_id);
        delivery_payload["action"] = serde_json::json!(action);
        delivery_payload["mutationId"] = serde_json::json!(mutation_id);
        delivery_payload["occurredAt"] = serde_json::json!(occurred_at);
        delivery_payload["source"] =
            serde_json::json!("agent_app_connector_cloud_overlay_outbox_adapter");
        delivery_payload["target"] = serde_json::json!("local_cloud_overlay_worker_delivery_proof");
        delivery_payload["secretDeliveryInternal"] = serde_json::json!({
            "binding": "host_managed",
            "source": adapter.secret_delivery_source,
            "target": adapter.secret_delivery_target,
            "leaseRef": lease_ref,
            "expiresAt": adapter.secret_delivery_expires_at.as_deref(),
            "credentialMaterialExposed": false,
            "tokenExposed": false
        });
        append_json_line(&delivery_path, &delivery_payload).await?;
    }

    let output = serde_json::to_string_pretty(&result_payload)
        .unwrap_or_else(|_| result_payload.to_string());
    Ok(ToolResult::success(output).with_metadata("result", result_payload))
}
