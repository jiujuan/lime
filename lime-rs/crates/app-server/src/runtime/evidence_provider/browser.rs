mod action_index;
mod file_artifacts;

use app_server_protocol::AgentEvent;
use app_server_protocol::ArtifactSummary;
use app_server_protocol::EvidencePackArtifact;
use serde_json::Value;

pub(super) fn browser_action_index_summary(
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
) -> Option<Value> {
    action_index::browser_action_index_summary(events, artifacts)
}

pub(super) fn browser_evidence_artifacts(
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
) -> Vec<EvidencePackArtifact> {
    action_index::browser_evidence_artifacts(events, artifacts)
}

pub(super) fn browser_file_evidence_summary(
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
) -> Option<Value> {
    file_artifacts::browser_file_evidence_summary(events, artifacts)
}

pub(super) fn browser_file_evidence_artifacts(
    events: &[AgentEvent],
    artifacts: &[ArtifactSummary],
) -> Vec<EvidencePackArtifact> {
    file_artifacts::browser_file_evidence_artifacts(events, artifacts)
}
