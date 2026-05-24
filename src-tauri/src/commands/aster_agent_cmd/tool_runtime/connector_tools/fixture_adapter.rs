use super::readiness::connector_value_at_path;
use super::readiness::ConnectorAdapterReadiness;
use super::sanitize::sanitized_connector_input;
use super::*;
use tokio::io::AsyncWriteExt;

fn fixture_mutation_id(params: &serde_json::Value) -> String {
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
    .unwrap_or_else(|| format!("fixture-mutation-{}", Uuid::new_v4()))
}

pub(super) async fn execute_host_fixture_connector_mutation(
    connector_id: &str,
    action: &str,
    params: &serde_json::Value,
    context: &ToolContext,
    adapter: &ConnectorAdapterReadiness,
) -> Result<ToolResult, ToolError> {
    let mutation_id = fixture_mutation_id(params);
    let occurred_at = chrono::Utc::now().to_rfc3339();
    let relative_path = Path::new(".lime")
        .join("agent-app-connectors")
        .join("fixture")
        .join("mutations.jsonl");
    let log_path = context.working_directory.join(&relative_path);
    if let Some(parent) = log_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let input_preview = sanitized_connector_input(params);
    let evidence_ref = format!("fixture://connector/{connector_id}/{action}/{mutation_id}");
    let result_payload = serde_json::json!({
        "success": true,
        "status": "completed",
        "connectorId": connector_id,
        "action": action,
        "mutationId": mutation_id,
        "occurredAt": occurred_at,
        "adapterKind": adapter.kind,
        "adapterReadiness": adapter.readiness,
        "secretBinding": "host_managed",
        "tokenExposed": false,
        "source": "agent_app_connector_fixture_adapter",
        "inputPreview": input_preview,
        "evidenceRefs": [{
            "kind": "connector_fixture_mutation_log",
            "ref": evidence_ref,
            "storage": "workspace_local",
            "relativePath": ".lime/agent-app-connectors/fixture/mutations.jsonl"
        }],
        "next": {
            "owner": "lime_connector_policy",
            "required": adapter.next_required
        }
    });
    let mut line = serde_json::to_string(&result_payload)
        .map_err(|error| ToolError::execution_failed(error.to_string()))?;
    line.push('\n');
    let mut log_file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .await?;
    log_file.write_all(line.as_bytes()).await?;
    log_file.flush().await?;

    let output = serde_json::to_string_pretty(&result_payload)
        .unwrap_or_else(|_| result_payload.to_string());
    Ok(ToolResult::success(output).with_metadata("result", result_payload))
}
