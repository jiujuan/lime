use super::readiness::connector_value_at_path;
use super::readiness::ConnectorAdapterReadiness;
use super::sanitize::sanitized_connector_input;
use super::*;
use tokio::io::AsyncWriteExt;

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
    if let Some(parent) = outbox_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let input_preview = sanitized_connector_input(params);
    let evidence_ref = format!("outbox://connector/{connector_id}/{action}/{mutation_id}");
    let lease_observed = adapter.secret_delivery_lease_ref.is_some();
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
    let result_payload = serde_json::json!({
        "success": true,
        "status": "queued_for_cloud_overlay",
        "externalStatus": "not_delivered",
        "connectorId": connector_id,
        "action": action,
        "mutationId": mutation_id,
        "occurredAt": occurred_at,
        "adapterKind": adapter.kind,
        "adapterReadiness": adapter.readiness,
        "secretBinding": "host_managed",
        "tokenExposed": false,
        "secretDelivery": secret_delivery,
        "source": "agent_app_connector_cloud_overlay_outbox_adapter",
        "inputPreview": input_preview,
        "evidenceRefs": [{
            "kind": "connector_cloud_overlay_outbox",
            "ref": evidence_ref,
            "storage": "workspace_local",
            "relativePath": ".lime/agent-app-connectors/cloud-overlay/outbox.jsonl"
        }],
        "next": {
            "owner": "lime_cloud_overlay_connector_worker",
            "required": adapter.next_required
        }
    });
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
    let mut line = serde_json::to_string(&outbox_payload)
        .map_err(|error| ToolError::execution_failed(error.to_string()))?;
    line.push('\n');
    tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&outbox_path)
        .await?
        .write_all(line.as_bytes())
        .await?;

    let output = serde_json::to_string_pretty(&result_payload)
        .unwrap_or_else(|_| result_payload.to_string());
    Ok(ToolResult::success(output).with_metadata("result", result_payload))
}
