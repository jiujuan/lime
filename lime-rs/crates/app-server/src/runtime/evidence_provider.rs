use super::status::agent_session_status_label;
use super::status::agent_turn_is_active;
use super::status::agent_turn_status_label;
use super::timestamp;
use super::EvidenceExportProvider;
use super::EvidencePackRequest;
use super::RuntimeCoreError;
use app_server_protocol::AgentSessionStatus;
use app_server_protocol::AgentTurnStatus;
use app_server_protocol::EvidencePackArtifact;
use app_server_protocol::EvidencePackSummary;
use async_trait::async_trait;
use serde_json::json;
use serde_json::Value;

#[derive(Debug, Default)]
pub struct NoopEvidenceExportProvider;

#[async_trait]
impl EvidenceExportProvider for NoopEvidenceExportProvider {
    async fn export_evidence_pack(
        &self,
        _request: &EvidencePackRequest,
    ) -> Result<Option<EvidencePackSummary>, RuntimeCoreError> {
        Ok(None)
    }
}

#[derive(Debug, Default)]
pub struct BasicEvidenceExportProvider;

#[async_trait]
impl EvidenceExportProvider for BasicEvidenceExportProvider {
    async fn export_evidence_pack(
        &self,
        request: &EvidencePackRequest,
    ) -> Result<Option<EvidencePackSummary>, RuntimeCoreError> {
        Ok(Some(basic_evidence_pack_summary(request)))
    }
}

fn basic_evidence_pack_summary(request: &EvidencePackRequest) -> EvidencePackSummary {
    let latest_turn_status = request
        .turns
        .last()
        .map(|turn| agent_turn_status_label(turn.status).to_string());
    let pending_request_count = request
        .events
        .iter()
        .filter(|event| event.event_type == "action.required")
        .count();
    let queued_turn_count = request
        .turns
        .iter()
        .filter(|turn| matches!(turn.status, AgentTurnStatus::Queued))
        .count();
    let running_turn_count = request
        .turns
        .iter()
        .filter(|turn| agent_turn_is_active(turn.status))
        .count();
    let completion_decision = if pending_request_count > 0 {
        "needs_input"
    } else if running_turn_count > 0 || queued_turn_count > 0 {
        "in_progress"
    } else if matches!(
        request.session.status,
        AgentSessionStatus::Failed | AgentSessionStatus::Canceled
    ) {
        "failed"
    } else {
        "verifying"
    };
    let known_gaps = if request.artifacts.is_empty() {
        vec!["no_recent_artifacts".to_string()]
    } else {
        Vec::new()
    };

    let evidence_artifacts = evidence_pack_artifacts(request);

    EvidencePackSummary {
        pack_relative_root: format!(
            ".lime/harness/sessions/{}/evidence",
            request.session.session_id
        ),
        pack_absolute_root: None,
        exported_at: timestamp(),
        thread_status: agent_session_status_label(request.session.status).to_string(),
        latest_turn_status,
        turn_count: request.turns.len(),
        item_count: request.events.len(),
        pending_request_count,
        queued_turn_count,
        recent_artifact_count: request.artifacts.len(),
        known_gaps,
        observability_summary: Some(json!({
            "schema_version": "runtime-evidence-pack.v1",
            "source": "app-server-basic",
            "event_count": request.events.len(),
            "artifact_count": request.artifacts.len(),
            "evidence_artifact_count": evidence_artifacts.len(),
        })),
        completion_audit_summary: Some(json!({
            "decision": completion_decision,
            "pendingRequestCount": pending_request_count,
            "queuedTurnCount": queued_turn_count,
            "runningTurnCount": running_turn_count,
            "artifactCount": request.artifacts.len(),
            "turnCount": request.turns.len(),
            "notes": [
                "App Server current evidence/export generated a basic audit summary without Desktop legacy evidence writer."
            ],
        })),
        artifacts: evidence_artifacts,
    }
}

fn evidence_pack_artifacts(request: &EvidencePackRequest) -> Vec<EvidencePackArtifact> {
    let mut artifacts = Vec::new();
    for artifact in &request.artifacts {
        artifacts.push(EvidencePackArtifact {
            kind: "artifact".to_string(),
            title: artifact
                .title
                .clone()
                .unwrap_or_else(|| artifact.artifact_ref.clone()),
            relative_path: artifact
                .path
                .clone()
                .unwrap_or_else(|| artifact.artifact_ref.clone()),
            absolute_path: None,
            bytes: 0,
        });
        artifacts.extend(snapshot_evidence_artifacts_from_metadata(
            artifact.metadata.as_ref(),
            artifact.artifact_ref.as_str(),
        ));
    }
    for event in &request.events {
        artifacts.extend(snapshot_evidence_artifacts_from_metadata(
            Some(&event.payload),
            event.event_id.as_str(),
        ));
    }
    dedupe_evidence_artifacts(artifacts)
}

fn snapshot_evidence_artifacts_from_metadata(
    metadata: Option<&Value>,
    title_scope: &str,
) -> Vec<EvidencePackArtifact> {
    let mut artifacts = Vec::new();
    if let Some(path) = metadata_string(metadata, &["outputSnapshotFile", "output_snapshot_file"]) {
        artifacts.push(EvidencePackArtifact {
            kind: "tool_output_snapshot".to_string(),
            title: format!("{title_scope} output snapshot"),
            relative_path: path,
            absolute_path: None,
            bytes: metadata_usize(metadata, &["outputBytes", "output_bytes"]).unwrap_or(0),
        });
    }
    if let Some(path) = metadata_string(
        metadata,
        &["checkpointSnapshotFile", "checkpoint_snapshot_file"],
    )
    .or_else(|| {
        nested_metadata_string(
            metadata,
            "file_change",
            &[
                "previousContentSnapshotFile",
                "previous_content_snapshot_file",
                "checkpointSnapshotFile",
                "checkpoint_snapshot_file",
            ],
        )
    })
    .or_else(|| {
        nested_metadata_string(
            metadata,
            "change",
            &[
                "previousContentSnapshotFile",
                "previous_content_snapshot_file",
                "checkpointSnapshotFile",
                "checkpoint_snapshot_file",
            ],
        )
    }) {
        artifacts.push(EvidencePackArtifact {
            kind: "file_checkpoint_snapshot".to_string(),
            title: format!("{title_scope} checkpoint snapshot"),
            relative_path: path,
            absolute_path: None,
            bytes: 0,
        });
    }
    artifacts
}

fn dedupe_evidence_artifacts(artifacts: Vec<EvidencePackArtifact>) -> Vec<EvidencePackArtifact> {
    let mut deduped = Vec::new();
    for artifact in artifacts {
        if deduped.iter().any(|existing: &EvidencePackArtifact| {
            existing.kind == artifact.kind && existing.relative_path == artifact.relative_path
        }) {
            continue;
        }
        deduped.push(artifact);
    }
    deduped
}

fn metadata_string(metadata: Option<&Value>, keys: &[&str]) -> Option<String> {
    let metadata = metadata?;
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(value_string)
}

fn nested_metadata_string(metadata: Option<&Value>, parent: &str, keys: &[&str]) -> Option<String> {
    let parent = metadata?.get(parent)?;
    keys.iter()
        .filter_map(|key| parent.get(*key))
        .find_map(value_string)
}

fn metadata_usize(metadata: Option<&Value>, keys: &[&str]) -> Option<usize> {
    let metadata = metadata?;
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(Value::as_u64)
        .and_then(|value| usize::try_from(value).ok())
}

fn value_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}
