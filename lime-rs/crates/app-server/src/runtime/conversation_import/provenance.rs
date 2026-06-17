use super::codex;
use crate::runtime::timestamp;
use app_server_protocol::{
    ConversationImportFidelitySummary, ConversationImportSourceClient,
    ConversationImportSourceProvenance, ConversationImportSourceStatus, ImportedThreadSummary,
    RuntimeOptions,
};
use serde_json::{json, Value};

pub(super) const SOURCE_CLIENT_VALUE: &str = "codex";

pub(super) struct ImportProvenance {
    pub(super) source_thread_id: String,
    pub(super) source_root: String,
    pub(super) source_path: String,
    pub(super) source: Option<String>,
    pub(super) cwd: Option<String>,
    pub(super) model_provider: Option<String>,
    pub(super) model: Option<String>,
    pub(super) reasoning_effort: Option<String>,
    pub(super) metadata: Option<Value>,
    pub(super) fidelity: ConversationImportFidelitySummary,
}

impl ImportProvenance {
    pub(super) fn for_thread(
        thread: &ImportedThreadSummary,
        source_root: &std::path::Path,
        source_path: &std::path::Path,
        fidelity: &ConversationImportFidelitySummary,
    ) -> Self {
        Self {
            source_thread_id: thread.source_thread_id.clone(),
            source_root: codex::path_to_string(source_root),
            source_path: codex::path_to_string(source_path),
            source: thread.source.clone(),
            cwd: thread.cwd.clone(),
            model_provider: thread.model_provider.clone(),
            model: metadata_string(thread.metadata.as_ref(), "model"),
            reasoning_effort: metadata_string(thread.metadata.as_ref(), "reasoningEffort"),
            metadata: thread.metadata.clone(),
            fidelity: fidelity.clone(),
        }
    }

    pub(super) fn turn_runtime_options(
        &self,
        user_provenance: Option<&ConversationImportSourceProvenance>,
    ) -> RuntimeOptions {
        let metadata = self.turn_metadata(user_provenance);
        let cwd = self.cwd.clone();
        let model_provider = self.model_provider.clone();
        let model = self.model.clone();
        let reasoning_effort = self.reasoning_effort.clone();
        let approval_policy = metadata_string(self.metadata.as_ref(), "approvalPolicy");
        let approvals_reviewer = metadata_string(self.metadata.as_ref(), "approvalsReviewer");
        let sandbox_policy = metadata_value(self.metadata.as_ref(), "sandboxPolicy");
        let service_tier = metadata_string(self.metadata.as_ref(), "serviceTier");
        let collaboration_mode = metadata_string(self.metadata.as_ref(), "collaborationMode");
        let personality = metadata_value(self.metadata.as_ref(), "personality");
        RuntimeOptions {
            provider_preference: self.model_provider.clone(),
            model_preference: self.model.clone(),
            metadata: Some(metadata.clone()),
            host_options: Some(compact_json(json!({
                "asterChatRequest": {
                    "project_root": cwd.clone(),
                    "cwd": cwd.clone(),
                    "provider_preference": model_provider.clone(),
                    "model_preference": model.clone(),
                    "reasoning_effort": reasoning_effort.clone(),
                    "approval_policy": approval_policy.clone(),
                    "approvals_reviewer": approvals_reviewer.clone(),
                    "sandbox_policy": sandbox_policy.clone(),
                    "service_tier": service_tier.clone(),
                    "collaboration_mode": collaboration_mode.clone(),
                    "personality": personality.clone(),
                    "metadata": metadata.clone(),
                    "turn_config": {
                        "project_root": cwd.clone(),
                        "cwd": cwd,
                        "provider_preference": model_provider.clone(),
                        "model_preference": model,
                        "reasoning_effort": reasoning_effort,
                        "approval_policy": approval_policy,
                        "approvals_reviewer": approvals_reviewer,
                        "sandbox_policy": sandbox_policy,
                        "service_tier": service_tier,
                        "collaboration_mode": collaboration_mode,
                        "personality": personality,
                        "metadata": metadata,
                    }
                }
            }))),
            ..RuntimeOptions::default()
        }
    }

    fn turn_metadata(&self, user_provenance: Option<&ConversationImportSourceProvenance>) -> Value {
        json!({
            "imported": true,
            "sourceClient": SOURCE_CLIENT_VALUE,
            "sourceThreadId": self.source_thread_id,
            "sourceRoot": self.source_root,
            "sourcePath": self.source_path,
            "source": self.source,
            "cwd": self.cwd,
            "workingDir": self.cwd,
            "modelProvider": self.model_provider,
            "modelName": self.model,
            "reasoningEffort": self.reasoning_effort,
            "approvalPolicy": metadata_string(self.metadata.as_ref(), "approvalPolicy"),
            "approvalsReviewer": metadata_string(self.metadata.as_ref(), "approvalsReviewer"),
            "sandboxPolicy": metadata_value(self.metadata.as_ref(), "sandboxPolicy"),
            "serviceTier": metadata_string(self.metadata.as_ref(), "serviceTier"),
            "threadSource": metadata_string(self.metadata.as_ref(), "threadSource"),
            "memoryMode": metadata_string(self.metadata.as_ref(), "memoryMode"),
            "agentPath": metadata_string(self.metadata.as_ref(), "agentPath"),
            "importedThreadSettings": imported_thread_settings(
                self.cwd.clone(),
                self.model_provider.clone(),
                self.model.clone(),
                self.reasoning_effort.clone(),
                self.metadata.as_ref(),
            ),
            "importedContinuation": imported_continuation(
                self.cwd.clone(),
                self.model_provider.clone(),
                self.model.clone(),
                self.reasoning_effort.clone(),
                self.metadata.as_ref(),
            ),
            "codexMetadata": self.metadata,
            "codexImportFidelity": self.fidelity,
            "userSourceProvenance": user_provenance,
        })
    }
}

pub(super) fn commit_warnings(
    summary_warnings: &[String],
    unsupported_count: usize,
    rollout_event_items: usize,
) -> Vec<String> {
    let mut warnings = summary_warnings.to_vec();
    if unsupported_count > 0 || rollout_event_items > 0 {
        warnings.push(
            "Imported local history messages and supported tool/patch timeline events; unsupported source items remain as provenance only."
                .to_string(),
        );
    }
    warnings
}

pub(super) fn import_session_metadata(
    source_thread_id: &str,
    source_root: &std::path::Path,
    source_path: &std::path::Path,
    thread: &ImportedThreadSummary,
    fidelity: &ConversationImportFidelitySummary,
) -> Value {
    let model = metadata_string(thread.metadata.as_ref(), "model");
    let reasoning_effort = metadata_string(thread.metadata.as_ref(), "reasoningEffort");
    let imported_thread_settings = imported_thread_settings(
        thread.cwd.clone(),
        thread.model_provider.clone(),
        model.clone(),
        reasoning_effort.clone(),
        thread.metadata.as_ref(),
    );
    let imported_continuation = imported_continuation(
        thread.cwd.clone(),
        thread.model_provider.clone(),
        model.clone(),
        reasoning_effort.clone(),
        thread.metadata.as_ref(),
    );
    json!({
        "sourceClient": SOURCE_CLIENT_VALUE,
        "sourceThreadId": source_thread_id,
        "sourceRoot": codex::path_to_string(source_root),
        "sourcePath": codex::path_to_string(source_path),
        "sourceStatus": ConversationImportSourceStatus::Ready,
        "statePath": codex::newest_state_db(source_root).map(|path| codex::path_to_string(&path)),
        "cwd": thread.cwd,
        "workingDir": thread.cwd,
        "source": thread.source,
        "providerName": thread.model_provider,
        "modelProvider": thread.model_provider,
        "modelName": model,
        "model": model,
        "reasoningEffort": reasoning_effort,
        "approvalPolicy": metadata_string(thread.metadata.as_ref(), "approvalPolicy"),
        "approvalsReviewer": metadata_string(thread.metadata.as_ref(), "approvalsReviewer"),
        "sandboxPolicy": metadata_value(thread.metadata.as_ref(), "sandboxPolicy"),
        "serviceTier": metadata_string(thread.metadata.as_ref(), "serviceTier"),
        "threadSource": metadata_string(thread.metadata.as_ref(), "threadSource"),
        "memoryMode": metadata_string(thread.metadata.as_ref(), "memoryMode"),
        "agentPath": metadata_string(thread.metadata.as_ref(), "agentPath"),
        "cliVersion": metadata_string(thread.metadata.as_ref(), "cliVersion"),
        "gitSha": metadata_string(thread.metadata.as_ref(), "gitSha"),
        "gitBranch": metadata_string(thread.metadata.as_ref(), "gitBranch"),
        "gitOriginUrl": metadata_string(thread.metadata.as_ref(), "gitOriginUrl"),
        "importedThreadSettings": imported_thread_settings,
        "importedContinuation": imported_continuation,
        "importedMemory": imported_memory(thread.metadata.as_ref()),
        "archived": thread.archived,
        "codexMetadata": thread.metadata,
        "codexImportFidelity": fidelity,
        "importedAt": timestamp(),
    })
}

pub(super) fn source_provenance_value(
    provenance: &ConversationImportSourceProvenance,
) -> Option<Value> {
    serde_json::to_value(provenance).ok()
}

pub(super) fn source_provenance(
    source_client: ConversationImportSourceClient,
    source_event_type: Option<&str>,
    source_event_seq: usize,
    payload: Option<&Value>,
    source_call_id: Option<String>,
) -> ConversationImportSourceProvenance {
    let payload_type = payload
        .and_then(|value| value.get("type"))
        .and_then(Value::as_str)
        .map(str::to_string);
    ConversationImportSourceProvenance {
        source_client,
        source_thread_id: None,
        source_path: None,
        source_event_type: source_event_type.map(str::to_string),
        source_event_seq: Some(source_event_seq),
        source_payload_type: payload_type,
        source_call_id,
        source_role: payload
            .and_then(|value| metadata_string(Some(value), "role"))
            .filter(|value| !value.trim().is_empty()),
        source_channel: payload
            .and_then(|value| metadata_string(Some(value), "channel"))
            .filter(|value| !value.trim().is_empty()),
    }
}

pub(super) fn enrich_source_provenance(
    mut provenance: ConversationImportSourceProvenance,
    source_thread_id: Option<&str>,
    source_path: Option<&str>,
) -> ConversationImportSourceProvenance {
    if provenance.source_thread_id.is_none() {
        provenance.source_thread_id = source_thread_id.map(str::to_string);
    }
    if provenance.source_path.is_none() {
        provenance.source_path = source_path.map(str::to_string);
    }
    provenance
}

pub(super) fn metadata_string(metadata: Option<&Value>, key: &str) -> Option<String> {
    metadata?
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
}

pub(super) fn metadata_value(metadata: Option<&Value>, key: &str) -> Option<Value> {
    metadata?.get(key).filter(|value| !value.is_null()).cloned()
}

pub(super) fn compact_json(value: Value) -> Value {
    match value {
        Value::Object(object) => {
            let compacted = object
                .into_iter()
                .filter_map(|(key, value)| {
                    let value = compact_json(value);
                    if value.is_null() {
                        return None;
                    }
                    if matches!(&value, Value::Array(items) if items.is_empty()) {
                        return None;
                    }
                    Some((key, value))
                })
                .collect();
            Value::Object(compacted)
        }
        Value::Array(values) => Value::Array(values.into_iter().map(compact_json).collect()),
        value => value,
    }
}

fn imported_thread_settings(
    cwd: Option<String>,
    model_provider: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
    metadata: Option<&Value>,
) -> Value {
    compact_json(json!({
        "cwd": cwd,
        "modelProvider": model_provider,
        "model": model,
        "effort": reasoning_effort,
        "summary": metadata_value(metadata, "reasoningSummary"),
        "approvalPolicy": metadata_string(metadata, "approvalPolicy"),
        "approvalsReviewer": metadata_string(metadata, "approvalsReviewer"),
        "sandboxPolicy": metadata_value(metadata, "sandboxPolicy"),
        "activePermissionProfile": metadata_value(metadata, "activePermissionProfile"),
        "serviceTier": metadata_string(metadata, "serviceTier"),
        "collaborationMode": metadata_string(metadata, "collaborationMode"),
        "personality": metadata_value(metadata, "personality"),
    }))
}

fn imported_continuation(
    cwd: Option<String>,
    model_provider: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
    metadata: Option<&Value>,
) -> Value {
    compact_json(json!({
        "cwd": cwd,
        "workingDir": cwd,
        "modelProvider": model_provider,
        "providerName": model_provider,
        "model": model,
        "modelName": model,
        "reasoningEffort": reasoning_effort,
        "approvalPolicy": metadata_string(metadata, "approvalPolicy"),
        "approvalsReviewer": metadata_string(metadata, "approvalsReviewer"),
        "sandboxPolicy": metadata_value(metadata, "sandboxPolicy"),
        "serviceTier": metadata_string(metadata, "serviceTier"),
        "threadSource": metadata_string(metadata, "threadSource"),
        "memoryMode": metadata_string(metadata, "memoryMode"),
        "agentPath": metadata_string(metadata, "agentPath"),
    }))
}

fn imported_memory(metadata: Option<&Value>) -> Value {
    compact_json(json!({
        "mode": metadata_string(metadata, "memoryMode"),
        "agentPath": metadata_string(metadata, "agentPath"),
        "agentNickname": metadata_string(metadata, "agentNickname"),
        "agentRole": metadata_string(metadata, "agentRole"),
    }))
}
