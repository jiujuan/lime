use super::output_refs;
use super::string_array_field;
use super::string_field;
use super::StoredSession;
use app_server_protocol::AgentEvent;
use app_server_protocol::ArtifactContentStatus;
use app_server_protocol::ArtifactSummary;
use std::collections::HashSet;

pub(super) fn paginate_artifact_summaries(
    artifacts: Vec<ArtifactSummary>,
    cursor: Option<String>,
    limit: Option<u32>,
) -> (Vec<ArtifactSummary>, Option<String>) {
    let start = cursor
        .as_deref()
        .and_then(|cursor| cursor.parse::<usize>().ok())
        .unwrap_or(0)
        .min(artifacts.len());
    let Some(limit) = limit
        .filter(|limit| *limit > 0)
        .and_then(|limit| usize::try_from(limit).ok())
    else {
        return (artifacts.into_iter().skip(start).collect(), None);
    };

    let end = start.saturating_add(limit).min(artifacts.len());
    let next_cursor = (end < artifacts.len()).then(|| end.to_string());
    (
        artifacts
            .into_iter()
            .skip(start)
            .take(end.saturating_sub(start))
            .collect(),
        next_cursor,
    )
}

pub(super) fn events_for_turn(events: &[AgentEvent], turn_id: Option<&str>) -> Vec<AgentEvent> {
    events
        .iter()
        .filter(|event| match turn_id {
            Some(turn_id) => event.turn_id.as_deref() == Some(turn_id),
            None => true,
        })
        .cloned()
        .collect()
}

pub(super) fn artifact_summaries_for_turn(
    events: &[AgentEvent],
    turn_id: Option<&str>,
) -> Vec<ArtifactSummary> {
    let mut seen = HashSet::new();
    let mut summaries = Vec::new();
    for event in events.iter().rev() {
        if let Some(turn_id) = turn_id {
            if event.turn_id.as_deref() != Some(turn_id) {
                continue;
            }
        }
        for mut summary in artifact_summaries_from_event(event) {
            summary.content = None;
            summary.content_status = ArtifactContentStatus::NotRequested;
            if seen.insert(summary.artifact_ref.clone()) {
                summaries.push(summary);
            }
        }
    }
    summaries
}

pub(super) fn stored_artifact_summaries_for_turn(
    stored: &StoredSession,
    turn_id: Option<&str>,
) -> Vec<ArtifactSummary> {
    let mut summaries = artifact_summaries_for_turn(&stored.events, turn_id);
    let mut seen = summaries
        .iter()
        .map(|summary| summary.artifact_ref.clone())
        .collect::<HashSet<_>>();
    for summary in output_refs::output_summaries_for_turn(stored.output_blobs.values(), turn_id) {
        if seen.insert(summary.artifact_ref.clone()) {
            summaries.push(summary);
        }
    }
    summaries
}

pub(super) fn artifact_summaries_from_event(event: &AgentEvent) -> Vec<ArtifactSummary> {
    let mut summaries = Vec::new();
    if let Some(summary) = artifact_summary_from_event(event) {
        summaries.push(summary);
    }
    summaries.extend(artifact_ref_summaries_from_event(event));
    dedupe_artifact_summaries(summaries)
}

fn artifact_summary_from_event(event: &AgentEvent) -> Option<ArtifactSummary> {
    let payload = &event.payload;
    let artifact = payload.get("artifact").unwrap_or(payload);
    let is_artifact_event = event.event_type.contains("artifact")
        || payload.get("artifact").is_some()
        || string_field(payload, &["artifactRef"]).is_some();
    if !is_artifact_event {
        return None;
    }

    let artifact_id = string_field(artifact, &["artifactId", "artifact_id", "id"])
        .or_else(|| string_field(payload, &["artifactId", "artifact_id"]));
    let path = string_field(artifact, &["filePath", "file_path", "path", "artifactRef"])
        .or_else(|| string_field(payload, &["filePath", "file_path", "path", "artifactRef"]));
    let artifact_ref = artifact_id
        .clone()
        .or_else(|| path.clone())
        .unwrap_or_else(|| event.event_id.clone());
    let metadata = artifact
        .get("metadata")
        .cloned()
        .or_else(|| payload.get("metadata").cloned())
        .or_else(|| {
            if payload.get("artifact").is_some() && artifact.is_object() {
                Some(artifact.clone())
            } else {
                None
            }
        });

    Some(ArtifactSummary {
        artifact_ref,
        event_id: event.event_id.clone(),
        sequence: event.sequence,
        turn_id: event.turn_id.clone(),
        artifact_id,
        path,
        title: string_field(artifact, &["title", "artifactTitle"])
            .or_else(|| string_field(payload, &["title", "artifactTitle"])),
        kind: string_field(artifact, &["kind", "artifactKind"])
            .or_else(|| string_field(payload, &["kind", "artifactKind"])),
        status: string_field(artifact, &["status", "artifactStatus"])
            .or_else(|| string_field(payload, &["status", "artifactStatus"])),
        content: string_field(artifact, &["content"])
            .or_else(|| string_field(payload, &["content"])),
        content_status: ArtifactContentStatus::NotRequested,
        metadata,
    })
}

fn artifact_ref_summaries_from_event(event: &AgentEvent) -> Vec<ArtifactSummary> {
    let payload = &event.payload;
    let artifact_refs = string_array_field(
        payload,
        &[
            "artifactRefs",
            "artifact_refs",
            "artifactIds",
            "artifact_ids",
            "artifactRef",
            "artifact_ref",
            "artifactId",
            "artifact_id",
        ],
    );
    if artifact_refs.is_empty() {
        return Vec::new();
    }
    let path = string_field(payload, &["filePath", "file_path", "path", "artifactPath"]);
    let metadata = payload.get("metadata").cloned();
    artifact_refs
        .into_iter()
        .map(|artifact_ref| ArtifactSummary {
            artifact_id: Some(artifact_ref.clone()),
            artifact_ref,
            event_id: event.event_id.clone(),
            sequence: event.sequence,
            turn_id: event.turn_id.clone(),
            path: path.clone(),
            title: string_field(payload, &["title", "artifactTitle"]),
            kind: string_field(payload, &["kind", "artifactKind"]),
            status: string_field(payload, &["status", "artifactStatus"]),
            content: string_field(payload, &["content"]),
            content_status: ArtifactContentStatus::NotRequested,
            metadata: metadata.clone(),
        })
        .collect()
}

fn dedupe_artifact_summaries(summaries: Vec<ArtifactSummary>) -> Vec<ArtifactSummary> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for summary in summaries {
        if seen.insert(summary.artifact_ref.clone()) {
            deduped.push(summary);
        }
    }
    deduped
}
