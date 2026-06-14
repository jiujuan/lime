use super::artifact_projection;
use super::output_refs;
use super::ArtifactContentRequest;
use super::RuntimeCore;
use super::RuntimeCoreError;
use app_server_protocol::ArtifactContentStatus;
use app_server_protocol::ArtifactReadParams;
use app_server_protocol::ArtifactReadResponse;
use std::collections::HashSet;

impl RuntimeCore {
    pub fn read_artifacts(
        &self,
        params: ArtifactReadParams,
    ) -> Result<ArtifactReadResponse, RuntimeCoreError> {
        let (session, summaries, output_blobs) = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;

            let mut seen = HashSet::new();
            let mut summaries = Vec::new();
            for event in stored.events.iter().rev() {
                if let Some(turn_id) = params.turn_id.as_deref() {
                    if event.turn_id.as_deref() != Some(turn_id) {
                        continue;
                    }
                }
                for summary in artifact_projection::artifact_summaries_from_event(event) {
                    if let Some(artifact_ref) = params.artifact_ref.as_deref() {
                        if summary.artifact_ref != artifact_ref {
                            continue;
                        }
                    }
                    if seen.insert(summary.artifact_ref.clone()) {
                        summaries.push(summary);
                    }
                }
            }
            for summary in output_refs::output_summaries_for_turn(
                stored.output_blobs.values(),
                params.turn_id.as_deref(),
            ) {
                if let Some(artifact_ref) = params.artifact_ref.as_deref() {
                    if summary.artifact_ref != artifact_ref {
                        continue;
                    }
                }
                if seen.insert(summary.artifact_ref.clone()) {
                    summaries.push(summary);
                }
            }
            (
                stored.session.clone(),
                summaries,
                stored.output_blobs.clone(),
            )
        };

        let (mut artifacts, next_cursor) = artifact_projection::paginate_artifact_summaries(
            summaries,
            params.cursor,
            params.limit,
        );
        if params.include_content.unwrap_or(false) {
            for artifact in &mut artifacts {
                let request = ArtifactContentRequest {
                    session: session.clone(),
                    artifact: artifact.clone(),
                };
                artifact.content = output_refs::output_content(
                    &output_blobs,
                    self.output_snapshot_store.as_ref(),
                    session.session_id.as_str(),
                    artifact.artifact_ref.as_str(),
                )
                .or_else(|| self.artifact_content_provider.read_content(&request));
                artifact.content_status = if artifact.content.is_some() {
                    ArtifactContentStatus::Available
                } else {
                    ArtifactContentStatus::Unavailable
                };
            }
        } else {
            for artifact in &mut artifacts {
                artifact.content = None;
                artifact.content_status = ArtifactContentStatus::NotRequested;
            }
        }
        Ok(ArtifactReadResponse {
            artifacts,
            next_cursor,
        })
    }
}
