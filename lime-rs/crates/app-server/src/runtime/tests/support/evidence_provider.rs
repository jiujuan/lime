use super::super::*;

#[derive(Default)]
pub(in crate::runtime::tests) struct TestEvidenceExportProvider {
    pub(in crate::runtime::tests) call_count: AtomicUsize,
    pub(in crate::runtime::tests) requests: Mutex<Vec<EvidencePackRequest>>,
    pub(in crate::runtime::tests) completion_audit_summary: Option<serde_json::Value>,
}

#[async_trait]
impl EvidenceExportProvider for TestEvidenceExportProvider {
    async fn export_evidence_pack(
        &self,
        request: &EvidencePackRequest,
    ) -> Result<Option<EvidencePackSummary>, RuntimeCoreError> {
        self.call_count.fetch_add(1, Ordering::SeqCst);
        self.requests
            .lock()
            .expect("test evidence requests mutex poisoned")
            .push(request.clone());
        Ok(Some(EvidencePackSummary {
            pack_relative_root: ".lime/harness/sessions/sess_evidence/evidence".to_string(),
            pack_absolute_root: Some(
                "/workspace/.lime/harness/sessions/sess_evidence/evidence".to_string(),
            ),
            exported_at: "2026-06-05T00:00:03.000Z".to_string(),
            thread_status: "running".to_string(),
            latest_turn_status: Some("accepted".to_string()),
            turn_count: request.turns.len(),
            item_count: request.events.len(),
            pending_request_count: 0,
            queued_turn_count: 0,
            recent_artifact_count: request.artifacts.len(),
            known_gaps: vec!["gui_smoke_not_run".to_string()],
            observability_summary: Some(json!({
                "schema_version": "runtime-evidence-pack.v1"
            })),
            completion_audit_summary: Some(self.completion_audit_summary.clone().unwrap_or_else(
                || {
                    json!({
                        "decision": "in_progress"
                    })
                },
            )),
            artifacts: vec![EvidencePackArtifact {
                kind: "summary".to_string(),
                title: "Evidence Summary".to_string(),
                relative_path: ".lime/harness/sessions/sess_evidence/evidence/summary.md"
                    .to_string(),
                absolute_path: None,
                bytes: 128,
            }],
        }))
    }
}
