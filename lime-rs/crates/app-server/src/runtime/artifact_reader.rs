use super::artifact_projection;
use super::output_refs;
use super::sidecar_store::SidecarStore;
use super::ArtifactContentRequest;
use super::RuntimeCore;
use super::RuntimeCoreError;
use app_server_protocol::ArtifactContentStatus;
use app_server_protocol::ArtifactReadParams;
use app_server_protocol::ArtifactReadResponse;
use std::collections::HashMap;

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

            let mut index_by_ref = HashMap::new();
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
                    artifact_projection::upsert_artifact_summary(
                        &mut summaries,
                        &mut index_by_ref,
                        summary,
                    );
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
                artifact_projection::upsert_artifact_summary(
                    &mut summaries,
                    &mut index_by_ref,
                    summary,
                );
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
                let projected_content = artifact.content.clone();
                let request = ArtifactContentRequest {
                    session: session.clone(),
                    artifact: artifact.clone(),
                };
                artifact.content = projected_content
                    .or_else(|| {
                        output_refs::output_content(
                            &output_blobs,
                            self.output_snapshot_store.as_ref(),
                            session.session_id.as_str(),
                            artifact.artifact_ref.as_str(),
                        )
                    })
                    .or_else(|| {
                        artifact_sidecar_content(
                            self.sidecar_store.as_deref(),
                            session.session_id.as_str(),
                            artifact,
                        )
                    })
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

fn artifact_sidecar_content(
    sidecar_store: Option<&SidecarStore>,
    session_id: &str,
    artifact: &app_server_protocol::ArtifactSummary,
) -> Option<String> {
    let sidecar_store = sidecar_store?;
    let sidecar_ref = artifact.metadata.as_ref().and_then(|metadata| {
        metadata.get("sidecarRef").or_else(|| {
            metadata
                .get("artifact")
                .and_then(|artifact| artifact.get("sidecarRef"))
        })
    })?;
    let relative_path = sidecar_ref
        .get("relativePath")
        .and_then(serde_json::Value::as_str)?;
    sidecar_store.read_text(relative_path).or_else(|| {
        let prefixed = format!(
            "sessions/{}/{}",
            session_id,
            relative_path.trim_start_matches("sessions/")
        );
        sidecar_store.read_text(prefixed.as_str())
    })
}
