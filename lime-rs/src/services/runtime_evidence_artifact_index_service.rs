//! Runtime evidence 最近 artifact 索引。
//!
//! 负责从 session timeline 中抽取去重后的 file artifact 引用，主导出服务只消费结果。

use crate::agent::SessionDetail;
use crate::services::runtime_evidence_json_utils_service::normalize_optional_text;
use lime_core::database::dao::agent_timeline::AgentThreadItemPayload;
use serde_json::Value;
use std::collections::HashSet;

const MAX_RECENT_ARTIFACTS: usize = 12;

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RuntimeRecentArtifact {
    pub(crate) path: String,
    pub(crate) metadata: Option<Value>,
}

pub(crate) fn collect_recent_artifacts(detail: &SessionDetail) -> Vec<RuntimeRecentArtifact> {
    let mut seen = HashSet::new();
    let mut artifacts = Vec::new();

    for item in detail.items.iter().rev() {
        let Some((path, metadata)) = (match &item.payload {
            AgentThreadItemPayload::FileArtifact { path, metadata, .. } => {
                normalize_optional_text(Some(path.clone()))
                    .map(|normalized| (normalized, metadata.clone()))
            }
            _ => None,
        }) else {
            continue;
        };

        if seen.insert(path.clone()) {
            artifacts.push(RuntimeRecentArtifact { path, metadata });
        }
        if artifacts.len() >= MAX_RECENT_ARTIFACTS {
            break;
        }
    }

    artifacts
}
