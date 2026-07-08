use super::builders::build_rollout_summary_candidate_markdown;
use super::metrics::{HandoffMetrics, HandoffRecentArtifact};
use super::RuntimeCore;
use crate::runtime::soul::locale_copy::RuntimeExportCopy;
use crate::RuntimeCoreError;
use app_server_protocol::{AgentSessionReadResponse, MemoryStoreRootParams, MemoryStoreScope};
use std::path::Path;

impl RuntimeCore {
    pub(super) async fn write_export_rollout_summary_candidate(
        &self,
        read: &AgentSessionReadResponse,
        metrics: &HandoffMetrics,
        recent_artifacts: &[HandoffRecentArtifact],
        workspace_root: &Path,
        exported_at: &str,
        export_relative_root: &str,
        export_kind: &str,
        source_method: &str,
        copy: &RuntimeExportCopy,
    ) -> Result<(), RuntimeCoreError> {
        self.app_data_source
            .write_memory_rollout_summary(crate::RolloutSummaryWriteParams {
                root: MemoryStoreRootParams {
                    scope: MemoryStoreScope::Workspace,
                    workspace_root: Some(workspace_root.to_string_lossy().to_string()),
                },
                title: format!("{export_kind}-{}", read.session.session_id),
                source: source_method.to_string(),
                exported_at: exported_at.to_string(),
                content: build_rollout_summary_candidate_markdown(
                    read,
                    metrics,
                    recent_artifacts,
                    exported_at,
                    export_relative_root,
                    export_kind,
                    copy,
                ),
            })
            .await?;
        Ok(())
    }
}
