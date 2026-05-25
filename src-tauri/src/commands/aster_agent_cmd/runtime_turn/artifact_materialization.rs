use super::*;

#[path = "artifact_materialization/contract_artifact.rs"]
mod contract_artifact;
#[path = "artifact_materialization/document_autopersist.rs"]
mod document_autopersist;
#[path = "artifact_materialization/output_contract.rs"]
mod output_contract;
#[path = "artifact_materialization/workspace_patch.rs"]
mod workspace_patch;

pub(super) use self::contract_artifact::materialize_agent_app_output_contract_artifact_after_stream;
pub(super) use self::document_autopersist::maybe_persist_artifact_document_after_stream;
#[cfg(test)]
pub(super) use self::document_autopersist::should_skip_default_fast_chat_artifact_autopersist;
#[cfg(test)]
pub(super) use self::workspace_patch::build_agent_app_output_contract_workspace_patch;
