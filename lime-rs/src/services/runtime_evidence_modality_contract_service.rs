//! Runtime evidence modality contract 投影。
//!
//! 负责从 artifact / tool trace 中提取多模态 runtime contract、routing、policy 与浏览器动作索引，
//! evidence pack 主服务只消费已归一化的 stable facts。

use crate::agent::SessionDetail;
use crate::commands::modality_runtime_contracts::{
    AUDIO_TRANSCRIPTION_CONTRACT_KEY, AUDIO_TRANSCRIPTION_LIMECORE_POLICY_REFS,
    AUDIO_TRANSCRIPTION_ROUTING_SLOT, BROWSER_CONTROL_CONTRACT_KEY,
    BROWSER_CONTROL_LIMECORE_POLICY_REFS, BROWSER_CONTROL_ROUTING_SLOT,
    IMAGE_GENERATION_CONTRACT_KEY, IMAGE_GENERATION_LIMECORE_POLICY_REFS,
    IMAGE_GENERATION_ROUTING_SLOT, LIMECORE_POLICY_DECISION_ALLOW,
    LIMECORE_POLICY_DECISION_REASON_NO_LOCAL_DENY,
    LIMECORE_POLICY_DECISION_SCOPE_LOCAL_DEFAULTS_ONLY,
    LIMECORE_POLICY_DECISION_SOURCE_LOCAL_DEFAULT, LIMECORE_POLICY_INPUT_STATUS_DECLARED_ONLY,
    LIMECORE_POLICY_INPUT_STATUS_RESOLVED, LIMECORE_POLICY_INPUT_VALUE_SOURCE_LIMECORE_PENDING,
    LIMECORE_POLICY_SNAPSHOT_STATUS_LOCAL_DEFAULTS_EVALUATED,
    LIMECORE_POLICY_VALUE_HIT_STATUS_RESOLVED, PDF_EXTRACT_CONTRACT_KEY,
    PDF_EXTRACT_LIMECORE_POLICY_REFS, PDF_EXTRACT_ROUTING_SLOT, TEXT_TRANSFORM_CONTRACT_KEY,
    TEXT_TRANSFORM_LIMECORE_POLICY_REFS, TEXT_TRANSFORM_ROUTING_SLOT,
    VOICE_GENERATION_CONTRACT_KEY, VOICE_GENERATION_LIMECORE_POLICY_REFS,
    VOICE_GENERATION_ROUTING_SLOT, WEB_RESEARCH_CONTRACT_KEY, WEB_RESEARCH_LIMECORE_POLICY_REFS,
    WEB_RESEARCH_ROUTING_SLOT,
};
use crate::services::runtime_evidence_artifact_index_service::RuntimeRecentArtifact;
use crate::services::runtime_evidence_json_utils_service::{
    find_json_value, find_json_value_at_paths, json_value_has_content, read_json_bool,
    read_json_string, read_json_string_array, read_json_usize,
};
use crate::services::runtime_evidence_path_service::resolve_workspace_path;
use crate::services::runtime_evidence_tool_classifier_service::is_browser_tool_name;
use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentThreadItemPayload};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

const MAX_BROWSER_ACTION_OBSERVABILITY_ITEMS: usize = 5;
const MAX_TIMELINE_TOOL_CONTRACT_SNAPSHOTS: usize = 12;

#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct RuntimeModalityContractSnapshotSummary {
    pub(crate) applicable_count: usize,
    pub(crate) snapshots: Vec<Value>,
}

pub(crate) fn build_modality_runtime_contracts_json(
    summary: &RuntimeModalityContractSnapshotSummary,
) -> Value {
    json!({
        "applicableArtifactCount": summary.applicable_count,
        "snapshotCount": summary.snapshots.len(),
        "snapshotIndex": build_modality_runtime_contract_snapshot_index(&summary.snapshots),
        "snapshots": summary.snapshots.clone()
    })
}

pub(crate) fn build_modality_runtime_contracts_observability_summary_json(
    summary: &RuntimeModalityContractSnapshotSummary,
) -> Value {
    let snapshot_index = build_modality_runtime_contract_snapshot_index(&summary.snapshots);
    let task_index = snapshot_index.get("taskIndex").cloned().unwrap_or_else(|| {
        json!({
            "snapshotCount": 0,
            "threadIds": [],
            "turnIds": [],
            "contentIds": [],
            "entryKeys": [],
            "modalities": [],
            "skillIds": [],
            "modelIds": [],
            "executorKinds": [],
            "executorBindingKeys": [],
            "costStates": [],
            "limitStates": [],
            "estimatedCostClasses": [],
            "limitEventKinds": [],
            "quotaLowCount": 0,
            "items": []
        })
    });
    let browser_action_index = snapshot_index
        .get("browserActionIndex")
        .cloned()
        .map(compact_browser_action_index_for_observability)
        .unwrap_or_else(|| {
            json!({
                "actionCount": 0,
                "sessionCount": 0,
                "observationCount": 0,
                "screenshotCount": 0,
                "lastUrl": null,
                "sessionIds": [],
                "targetIds": [],
                "profileKeys": [],
                "statusCounts": [],
                "artifactKindCounts": [],
                "actionCounts": [],
                "backendCounts": [],
                "items": []
            })
        });
    let limecore_policy_index = snapshot_index
        .get("limecorePolicyIndex")
        .cloned()
        .unwrap_or_else(|| {
            json!({
                "snapshotCount": 0,
                "refKeys": [],
                "statusCounts": [],
                "decisionCounts": [],
                "items": []
            })
        });

    json!({
        "snapshotCount": summary.snapshots.len(),
        "snapshotIndex": {
            "taskIndex": task_index,
            "browserActionIndex": browser_action_index,
            "limecorePolicyIndex": limecore_policy_index
        }
    })
}

fn compact_browser_action_index_for_observability(mut index: Value) -> Value {
    if let Some(items) = index.get_mut("items").and_then(Value::as_array_mut) {
        if items.len() > MAX_BROWSER_ACTION_OBSERVABILITY_ITEMS {
            let keep_from = items.len() - MAX_BROWSER_ACTION_OBSERVABILITY_ITEMS;
            *items = items.split_off(keep_from);
        }
    }

    index
}

fn build_modality_runtime_contract_snapshot_index(snapshots: &[Value]) -> Value {
    let mut contract_keys = BTreeSet::new();
    let mut sources: BTreeMap<String, usize> = BTreeMap::new();
    let mut routing_outcomes: BTreeMap<String, usize> = BTreeMap::new();
    let mut expected_routing_slots = BTreeSet::new();
    let mut execution_profile_keys = BTreeSet::new();
    let mut executor_adapter_keys = BTreeSet::new();
    let mut task_thread_ids = BTreeSet::new();
    let mut task_turn_ids = BTreeSet::new();
    let mut task_content_ids = BTreeSet::new();
    let mut task_entry_keys = BTreeSet::new();
    let mut task_modalities = BTreeSet::new();
    let mut task_skill_ids = BTreeSet::new();
    let mut task_model_ids = BTreeSet::new();
    let mut task_executor_kinds = BTreeSet::new();
    let mut task_executor_binding_keys = BTreeSet::new();
    let mut task_cost_states = BTreeSet::new();
    let mut task_limit_states = BTreeSet::new();
    let mut task_estimated_cost_classes = BTreeSet::new();
    let mut task_limit_event_kinds = BTreeSet::new();
    let mut task_quota_low_count = 0usize;
    let mut task_index_items = Vec::new();
    let mut limecore_policy_refs = BTreeSet::new();
    let mut limecore_policy_missing_inputs = BTreeSet::new();
    let mut limecore_policy_pending_hit_refs = BTreeSet::new();
    let mut limecore_policy_value_hit_count = 0usize;
    let mut limecore_policy_statuses: BTreeMap<String, usize> = BTreeMap::new();
    let mut limecore_policy_decisions: BTreeMap<String, usize> = BTreeMap::new();
    let mut limecore_policy_items = Vec::new();
    let mut trace_items = Vec::new();
    let mut audio_output_statuses: BTreeMap<String, usize> = BTreeMap::new();
    let mut audio_output_error_codes = BTreeSet::new();
    let mut audio_output_items = Vec::new();
    let mut transcript_statuses: BTreeMap<String, usize> = BTreeMap::new();
    let mut transcript_error_codes = BTreeSet::new();
    let mut transcript_items = Vec::new();
    let mut browser_action_statuses: BTreeMap<String, usize> = BTreeMap::new();
    let mut browser_action_kinds: BTreeMap<String, usize> = BTreeMap::new();
    let mut browser_action_names: BTreeMap<String, usize> = BTreeMap::new();
    let mut browser_session_ids = BTreeSet::new();
    let mut browser_target_ids = BTreeSet::new();
    let mut browser_profile_keys = BTreeSet::new();
    let mut browser_backends: BTreeMap<String, usize> = BTreeMap::new();
    let mut browser_last_url = None;
    let mut browser_observation_count = 0usize;
    let mut browser_screenshot_count = 0usize;
    let mut browser_action_items = Vec::new();

    for snapshot in snapshots {
        let contract_key = snapshot_string(snapshot, "contractKey");
        let source = snapshot_string(snapshot, "source");
        let routing_outcome = snapshot_string(snapshot, "routingOutcome");
        let expected_routing_slot = snapshot_string(snapshot, "expectedRoutingSlot");
        let execution_profile_key = snapshot_string(snapshot, "executionProfileKey");
        let executor_adapter_key = snapshot_string(snapshot, "executorAdapterKey");
        let thread_id = snapshot_string(snapshot, "threadId");
        let turn_id = snapshot_string(snapshot, "turnId");
        let content_id = snapshot_string(snapshot, "contentId");
        let entry_key = snapshot_string(snapshot, "entryKey")
            .or_else(|| snapshot_string(snapshot, "entrySource"));
        let modality = snapshot_string(snapshot, "modality");
        let skill_id = snapshot_string(snapshot, "skillId");
        let model_id =
            snapshot_string(snapshot, "modelId").or_else(|| snapshot_string(snapshot, "model"));
        let executor_kind = snapshot_string(snapshot, "executorKind");
        let executor_binding_key = snapshot_string(snapshot, "executorBindingKey");
        let cost_state = snapshot_string(snapshot, "costState");
        let limit_state = snapshot_string(snapshot, "limitState");
        let estimated_cost_class = snapshot_string(snapshot, "estimatedCostClass");
        let limit_event_kind = snapshot_string(snapshot, "limitEventKind");
        let quota_low = snapshot.get("quotaLow").and_then(Value::as_bool);
        let snapshot_limecore_policy_refs =
            read_json_string_array(snapshot, &[&["limecorePolicyRefs"][..]]);
        let limecore_policy_snapshot = snapshot
            .get("limecorePolicySnapshot")
            .filter(|value| value.is_object());

        if let Some(contract_key) = contract_key.as_deref() {
            contract_keys.insert(contract_key.to_string());
        }
        if let Some(source) = source.as_deref() {
            *sources.entry(source.to_string()).or_insert(0) += 1;
        }
        if let Some(routing_outcome) = routing_outcome.as_deref() {
            *routing_outcomes
                .entry(routing_outcome.to_string())
                .or_insert(0) += 1;
        }
        if let Some(expected_routing_slot) = expected_routing_slot.as_deref() {
            expected_routing_slots.insert(expected_routing_slot.to_string());
        }
        if let Some(execution_profile_key) = execution_profile_key.as_deref() {
            execution_profile_keys.insert(execution_profile_key.to_string());
        }
        if let Some(executor_adapter_key) = executor_adapter_key.as_deref() {
            executor_adapter_keys.insert(executor_adapter_key.to_string());
        }
        if let Some(value) = thread_id.as_deref() {
            task_thread_ids.insert(value.to_string());
        }
        if let Some(value) = turn_id.as_deref() {
            task_turn_ids.insert(value.to_string());
        }
        if let Some(value) = content_id.as_deref() {
            task_content_ids.insert(value.to_string());
        }
        if let Some(value) = entry_key.as_deref() {
            task_entry_keys.insert(value.to_string());
        }
        if let Some(value) = modality.as_deref() {
            task_modalities.insert(value.to_string());
        }
        if let Some(value) = skill_id.as_deref() {
            task_skill_ids.insert(value.to_string());
        }
        if let Some(value) = model_id.as_deref() {
            task_model_ids.insert(value.to_string());
        }
        if let Some(value) = executor_kind.as_deref() {
            task_executor_kinds.insert(value.to_string());
        }
        if let Some(value) = executor_binding_key.as_deref() {
            task_executor_binding_keys.insert(value.to_string());
        }
        if let Some(value) = cost_state.as_deref() {
            task_cost_states.insert(value.to_string());
        }
        if let Some(value) = limit_state.as_deref() {
            task_limit_states.insert(value.to_string());
        }
        if let Some(value) = estimated_cost_class.as_deref() {
            task_estimated_cost_classes.insert(value.to_string());
        }
        if let Some(value) = limit_event_kind.as_deref() {
            task_limit_event_kinds.insert(value.to_string());
        }
        if quota_low == Some(true) {
            task_quota_low_count += 1;
        }
        task_index_items.push(json!({
            "artifactPath": snapshot.get("artifactPath").cloned().unwrap_or(Value::Null),
            "taskId": snapshot.get("taskId").cloned().unwrap_or(Value::Null),
            "taskType": snapshot.get("taskType").cloned().unwrap_or(Value::Null),
            "contractKey": contract_key.clone(),
            "source": source.clone(),
            "threadId": thread_id,
            "turnId": turn_id,
            "contentId": content_id,
            "entryKey": entry_key,
            "entrySource": snapshot.get("entrySource").cloned().unwrap_or(Value::Null),
            "modality": modality,
            "skillId": skill_id,
            "modelId": model_id,
            "executorKind": executor_kind,
            "executorBindingKey": executor_binding_key,
            "costState": cost_state,
            "limitState": limit_state,
            "estimatedCostClass": estimated_cost_class,
            "limitEventKind": limit_event_kind,
            "quotaLow": quota_low,
            "routingOutcome": snapshot.get("routingOutcome").cloned().unwrap_or(Value::Null),
        }));
        for policy_ref in &snapshot_limecore_policy_refs {
            limecore_policy_refs.insert(policy_ref.to_string());
        }
        if !snapshot_limecore_policy_refs.is_empty() || limecore_policy_snapshot.is_some() {
            let status = limecore_policy_snapshot
                .and_then(|value| snapshot_string(value, "status"))
                .unwrap_or_else(|| {
                    LIMECORE_POLICY_SNAPSHOT_STATUS_LOCAL_DEFAULTS_EVALUATED.to_string()
                });
            let decision = limecore_policy_snapshot
                .and_then(|value| snapshot_string(value, "decision"))
                .unwrap_or_else(|| LIMECORE_POLICY_DECISION_ALLOW.to_string());
            let decision_source = limecore_policy_snapshot
                .and_then(|value| {
                    read_json_string(value, &[&["decision_source"][..], &["decisionSource"][..]])
                })
                .unwrap_or_else(|| LIMECORE_POLICY_DECISION_SOURCE_LOCAL_DEFAULT.to_string());
            let decision_scope = limecore_policy_snapshot
                .and_then(|value| {
                    read_json_string(value, &[&["decision_scope"][..], &["decisionScope"][..]])
                })
                .unwrap_or_else(|| LIMECORE_POLICY_DECISION_SCOPE_LOCAL_DEFAULTS_ONLY.to_string());
            let decision_reason = limecore_policy_snapshot
                .and_then(|value| {
                    read_json_string(value, &[&["decision_reason"][..], &["decisionReason"][..]])
                })
                .unwrap_or_else(|| LIMECORE_POLICY_DECISION_REASON_NO_LOCAL_DENY.to_string());
            let policy_evaluation = limecore_policy_snapshot
                .and_then(|value| {
                    value
                        .get("policy_evaluation")
                        .or_else(|| value.get("policyEvaluation"))
                        .filter(|item| item.is_object())
                        .cloned()
                })
                .unwrap_or(Value::Null);
            let policy_value_hits = limecore_policy_snapshot
                .and_then(|value| {
                    value
                        .get("policy_value_hits")
                        .or_else(|| value.get("policyValueHits"))
                        .filter(|item| item.is_array())
                        .cloned()
                })
                .unwrap_or_else(|| json!([]));
            let resolved_hit_refs = limecore_policy_resolved_hit_refs(&policy_value_hits);
            let mut unresolved_refs = limecore_policy_snapshot
                .map(|value| {
                    read_json_string_array(
                        value,
                        &[&["unresolved_refs"][..], &["unresolvedRefs"][..]],
                    )
                })
                .unwrap_or_default();
            if unresolved_refs.is_empty() {
                unresolved_refs = limecore_policy_refs_without_resolved_hits(
                    &snapshot_limecore_policy_refs,
                    &resolved_hit_refs,
                );
            }
            let policy_inputs = limecore_policy_snapshot
                .and_then(|value| {
                    value
                        .get("policy_inputs")
                        .or_else(|| value.get("policyInputs"))
                        .filter(|item| item.is_array())
                        .cloned()
                })
                .unwrap_or_else(|| {
                    build_limecore_policy_inputs_value_with_hits(
                        &snapshot_limecore_policy_refs,
                        &policy_value_hits,
                    )
                });
            let mut missing_inputs = limecore_policy_snapshot
                .map(|value| {
                    read_json_string_array(
                        value,
                        &[&["missing_inputs"][..], &["missingInputs"][..]],
                    )
                })
                .unwrap_or_default();
            if missing_inputs.is_empty() {
                missing_inputs = unresolved_refs.clone();
            }
            if missing_inputs.is_empty() {
                missing_inputs = limecore_policy_refs_without_resolved_hits(
                    &snapshot_limecore_policy_refs,
                    &resolved_hit_refs,
                );
            }
            for missing_input in &missing_inputs {
                limecore_policy_missing_inputs.insert(missing_input.to_string());
            }
            let policy_value_hit_count = limecore_policy_snapshot
                .and_then(|value| {
                    read_json_usize(
                        value,
                        &[
                            &["policy_value_hit_count"][..],
                            &["policyValueHitCount"][..],
                        ],
                    )
                })
                .unwrap_or_else(|| {
                    policy_value_hits
                        .as_array()
                        .map(|items| items.len())
                        .unwrap_or_default()
                });
            limecore_policy_value_hit_count += policy_value_hit_count;
            let mut pending_hit_refs = limecore_policy_snapshot
                .map(|value| {
                    read_json_string_array(
                        value,
                        &[&["pending_hit_refs"][..], &["pendingHitRefs"][..]],
                    )
                })
                .unwrap_or_default();
            if pending_hit_refs.is_empty() {
                pending_hit_refs = missing_inputs.clone();
            }
            for pending_hit_ref in &pending_hit_refs {
                limecore_policy_pending_hit_refs.insert(pending_hit_ref.to_string());
            }
            *limecore_policy_statuses.entry(status.clone()).or_insert(0) += 1;
            *limecore_policy_decisions
                .entry(decision.clone())
                .or_insert(0) += 1;
            limecore_policy_items.push(json!({
                "artifactPath": snapshot.get("artifactPath").cloned().unwrap_or(Value::Null),
                "contractKey": contract_key.clone(),
                "executionProfileKey": snapshot.get("executionProfileKey").cloned().unwrap_or(Value::Null),
                "executorAdapterKey": snapshot.get("executorAdapterKey").cloned().unwrap_or(Value::Null),
                "refs": snapshot_limecore_policy_refs,
                "status": status,
                "decision": decision,
                "decisionSource": decision_source,
                "decisionScope": decision_scope,
                "decisionReason": decision_reason,
                "policyEvaluation": policy_evaluation,
                "policyInputs": policy_inputs,
                "policyValueHits": policy_value_hits,
                "policyValueHitCount": policy_value_hit_count,
                "pendingHitRefs": pending_hit_refs,
                "unresolvedRefs": unresolved_refs,
                "missingInputs": missing_inputs,
                "source": limecore_policy_snapshot
                    .and_then(|value| value.get("source"))
                    .cloned()
                    .unwrap_or_else(|| Value::String("modality_runtime_contract".to_string())),
            }));
        }

        if source
            .as_deref()
            .map(is_runtime_contract_tool_trace_source)
            .unwrap_or(false)
        {
            trace_items.push(json!({
                "artifactPath": snapshot.get("artifactPath").cloned().unwrap_or(Value::Null),
                "source": source.clone(),
                "contractKey": contract_key.clone(),
                "routingEvent": snapshot.get("routingEvent").cloned().unwrap_or(Value::Null),
                "routingOutcome": snapshot.get("routingOutcome").cloned().unwrap_or(Value::Null),
                "expectedRoutingSlot": snapshot.get("expectedRoutingSlot").cloned().unwrap_or(Value::Null),
                "executionProfileKey": snapshot.get("executionProfileKey").cloned().unwrap_or(Value::Null),
                "executorAdapterKey": snapshot.get("executorAdapterKey").cloned().unwrap_or(Value::Null),
                "limecorePolicyRefs": snapshot.get("limecorePolicyRefs").cloned().unwrap_or(Value::Null),
                "entrySource": snapshot.get("entrySource").cloned().unwrap_or(Value::Null),
                "executorBindingKey": snapshot
                    .pointer("/runtimeContract/executor_binding/binding_key")
                    .cloned()
                    .unwrap_or(Value::Null),
            }));
        }

        if let Some(browser_action) = snapshot
            .get("browserAction")
            .filter(|value| value.is_object())
        {
            if let Some(status) = snapshot_string(browser_action, "status") {
                *browser_action_statuses.entry(status).or_insert(0) += 1;
            }
            if let Some(artifact_kind) = snapshot_string(browser_action, "artifactKind") {
                *browser_action_kinds.entry(artifact_kind).or_insert(0) += 1;
            }
            if let Some(action) = snapshot_string(browser_action, "action") {
                *browser_action_names.entry(action).or_insert(0) += 1;
            }
            if let Some(session_id) = snapshot_string(browser_action, "sessionId") {
                browser_session_ids.insert(session_id);
            }
            if let Some(target_id) = snapshot_string(browser_action, "targetId") {
                browser_target_ids.insert(target_id);
            }
            if let Some(profile_key) = snapshot_string(browser_action, "profileKey") {
                browser_profile_keys.insert(profile_key);
            }
            if let Some(backend) = snapshot_string(browser_action, "backend") {
                *browser_backends.entry(backend).or_insert(0) += 1;
            }
            if let Some(last_url) = snapshot_string(browser_action, "lastUrl") {
                browser_last_url = Some(last_url);
            }
            if read_json_bool(browser_action, &[&["observationAvailable"][..]]).unwrap_or(false) {
                browser_observation_count += 1;
            }
            if read_json_bool(browser_action, &[&["screenshotAvailable"][..]]).unwrap_or(false) {
                browser_screenshot_count += 1;
            }
            browser_action_items.push(json!({
                "artifactPath": snapshot.get("artifactPath").cloned().unwrap_or(Value::Null),
                "contractKey": contract_key.clone(),
                "source": source.clone(),
                "entrySource": snapshot.get("entrySource").cloned().unwrap_or(Value::Null),
                "artifactKind": browser_action.get("artifactKind").cloned().unwrap_or(Value::Null),
                "toolName": browser_action.get("toolName").cloned().unwrap_or(Value::Null),
                "action": browser_action.get("action").cloned().unwrap_or(Value::Null),
                "status": browser_action.get("status").cloned().unwrap_or(Value::Null),
                "success": browser_action.get("success").cloned().unwrap_or(Value::Null),
                "sessionId": browser_action.get("sessionId").cloned().unwrap_or(Value::Null),
                "targetId": browser_action.get("targetId").cloned().unwrap_or(Value::Null),
                "profileKey": browser_action.get("profileKey").cloned().unwrap_or(Value::Null),
                "backend": browser_action.get("backend").cloned().unwrap_or(Value::Null),
                "requestId": browser_action.get("requestId").cloned().unwrap_or(Value::Null),
                "lastUrl": browser_action.get("lastUrl").cloned().unwrap_or(Value::Null),
                "title": browser_action.get("title").cloned().unwrap_or(Value::Null),
                "attemptCount": browser_action.get("attemptCount").cloned().unwrap_or(Value::Null),
                "observationAvailable": browser_action.get("observationAvailable").cloned().unwrap_or(Value::Null),
                "screenshotAvailable": browser_action.get("screenshotAvailable").cloned().unwrap_or(Value::Null),
            }));
        }

        if let Some(audio_output) = snapshot
            .get("audioOutput")
            .filter(|value| value.is_object())
        {
            if let Some(status) = snapshot_string(audio_output, "status") {
                *audio_output_statuses.entry(status).or_insert(0) += 1;
            }
            if let Some(error_code) = snapshot_string(audio_output, "errorCode") {
                audio_output_error_codes.insert(error_code);
            }
            audio_output_items.push(json!({
                "artifactPath": snapshot.get("artifactPath").cloned().unwrap_or(Value::Null),
                "taskId": snapshot.get("taskId").cloned().unwrap_or(Value::Null),
                "status": audio_output.get("status").cloned().unwrap_or(Value::Null),
                "audioPath": audio_output.get("audioPath").cloned().unwrap_or(Value::Null),
                "mimeType": audio_output.get("mimeType").cloned().unwrap_or(Value::Null),
                "durationMs": audio_output.get("durationMs").cloned().unwrap_or(Value::Null),
                "providerId": audio_output.get("providerId").cloned().unwrap_or(Value::Null),
                "model": audio_output.get("model").cloned().unwrap_or(Value::Null),
                "errorCode": audio_output.get("errorCode").cloned().unwrap_or(Value::Null),
                "retryable": audio_output.get("retryable").cloned().unwrap_or(Value::Null),
                "workerId": audio_output.get("workerId").cloned().unwrap_or(Value::Null),
            }));
        }

        if let Some(transcript) = snapshot.get("transcript").filter(|value| value.is_object()) {
            if let Some(status) = snapshot_string(transcript, "status") {
                *transcript_statuses.entry(status).or_insert(0) += 1;
            }
            if let Some(error_code) = snapshot_string(transcript, "errorCode") {
                transcript_error_codes.insert(error_code);
            }
            transcript_items.push(json!({
                "artifactPath": snapshot.get("artifactPath").cloned().unwrap_or(Value::Null),
                "taskId": snapshot.get("taskId").cloned().unwrap_or(Value::Null),
                "status": transcript.get("status").cloned().unwrap_or(Value::Null),
                "transcriptPath": transcript.get("transcriptPath").cloned().unwrap_or(Value::Null),
                "sourceUrl": transcript.get("sourceUrl").cloned().unwrap_or(Value::Null),
                "sourcePath": transcript.get("sourcePath").cloned().unwrap_or(Value::Null),
                "language": transcript.get("language").cloned().unwrap_or(Value::Null),
                "outputFormat": transcript.get("outputFormat").cloned().unwrap_or(Value::Null),
                "providerId": transcript.get("providerId").cloned().unwrap_or(Value::Null),
                "model": transcript.get("model").cloned().unwrap_or(Value::Null),
                "errorCode": transcript.get("errorCode").cloned().unwrap_or(Value::Null),
                "retryable": transcript.get("retryable").cloned().unwrap_or(Value::Null),
                "workerId": transcript.get("workerId").cloned().unwrap_or(Value::Null),
            }));
        }
    }

    let limecore_policy_ref_keys = limecore_policy_refs.into_iter().collect::<Vec<_>>();

    json!({
        "contractKeys": contract_keys.into_iter().collect::<Vec<_>>(),
        "sourceCounts": sources
            .into_iter()
            .map(|(source, count)| json!({ "source": source, "count": count }))
            .collect::<Vec<_>>(),
        "routingOutcomeCounts": routing_outcomes
            .into_iter()
            .map(|(outcome, count)| json!({ "outcome": outcome, "count": count }))
            .collect::<Vec<_>>(),
        "expectedRoutingSlots": expected_routing_slots.into_iter().collect::<Vec<_>>(),
        "executionProfileKeys": execution_profile_keys.into_iter().collect::<Vec<_>>(),
        "executorAdapterKeys": executor_adapter_keys.into_iter().collect::<Vec<_>>(),
        "taskIndex": {
            "snapshotCount": task_index_items.len(),
            "threadIds": task_thread_ids.into_iter().collect::<Vec<_>>(),
            "turnIds": task_turn_ids.into_iter().collect::<Vec<_>>(),
            "contentIds": task_content_ids.into_iter().collect::<Vec<_>>(),
            "entryKeys": task_entry_keys.into_iter().collect::<Vec<_>>(),
            "modalities": task_modalities.into_iter().collect::<Vec<_>>(),
            "skillIds": task_skill_ids.into_iter().collect::<Vec<_>>(),
            "modelIds": task_model_ids.into_iter().collect::<Vec<_>>(),
            "executorKinds": task_executor_kinds.into_iter().collect::<Vec<_>>(),
            "executorBindingKeys": task_executor_binding_keys.into_iter().collect::<Vec<_>>(),
            "costStates": task_cost_states.into_iter().collect::<Vec<_>>(),
            "limitStates": task_limit_states.into_iter().collect::<Vec<_>>(),
            "estimatedCostClasses": task_estimated_cost_classes.into_iter().collect::<Vec<_>>(),
            "limitEventKinds": task_limit_event_kinds.into_iter().collect::<Vec<_>>(),
            "quotaLowCount": task_quota_low_count,
            "items": task_index_items,
        },
        "limecorePolicyRefs": limecore_policy_ref_keys.clone(),
        "limecorePolicyIndex": {
            "snapshotCount": limecore_policy_items.len(),
            "refKeys": limecore_policy_ref_keys,
            "missingInputs": limecore_policy_missing_inputs.into_iter().collect::<Vec<_>>(),
            "pendingHitRefs": limecore_policy_pending_hit_refs.into_iter().collect::<Vec<_>>(),
            "policyValueHitCount": limecore_policy_value_hit_count,
            "statusCounts": limecore_policy_statuses
                .into_iter()
                .map(|(status, count)| json!({ "status": status, "count": count }))
                .collect::<Vec<_>>(),
            "decisionCounts": limecore_policy_decisions
                .into_iter()
                .map(|(decision, count)| json!({ "decision": decision, "count": count }))
                .collect::<Vec<_>>(),
            "items": limecore_policy_items,
        },
        "toolTraceIndex": {
            "traceCount": trace_items.len(),
            "items": trace_items,
        },
        "audioOutputIndex": {
            "outputCount": audio_output_items.len(),
            "statusCounts": audio_output_statuses
                .into_iter()
                .map(|(status, count)| json!({ "status": status, "count": count }))
                .collect::<Vec<_>>(),
            "errorCodes": audio_output_error_codes.into_iter().collect::<Vec<_>>(),
            "items": audio_output_items,
        },
        "transcriptIndex": {
            "transcriptCount": transcript_items.len(),
            "statusCounts": transcript_statuses
                .into_iter()
                .map(|(status, count)| json!({ "status": status, "count": count }))
                .collect::<Vec<_>>(),
            "errorCodes": transcript_error_codes.into_iter().collect::<Vec<_>>(),
            "items": transcript_items,
        },
        "browserActionIndex": {
            "actionCount": browser_action_items.len(),
            "sessionCount": browser_session_ids.len(),
            "observationCount": browser_observation_count,
            "screenshotCount": browser_screenshot_count,
            "lastUrl": browser_last_url,
            "sessionIds": browser_session_ids.into_iter().collect::<Vec<_>>(),
            "targetIds": browser_target_ids.into_iter().collect::<Vec<_>>(),
            "profileKeys": browser_profile_keys.into_iter().collect::<Vec<_>>(),
            "statusCounts": browser_action_statuses
                .into_iter()
                .map(|(status, count)| json!({ "status": status, "count": count }))
                .collect::<Vec<_>>(),
            "artifactKindCounts": browser_action_kinds
                .into_iter()
                .map(|(artifact_kind, count)| json!({ "artifactKind": artifact_kind, "count": count }))
                .collect::<Vec<_>>(),
            "actionCounts": browser_action_names
                .into_iter()
                .map(|(action, count)| json!({ "action": action, "count": count }))
                .collect::<Vec<_>>(),
            "backendCounts": browser_backends
                .into_iter()
                .map(|(backend, count)| json!({ "backend": backend, "count": count }))
                .collect::<Vec<_>>(),
            "items": browser_action_items,
        }
    })
}

fn snapshot_string(snapshot: &Value, field_name: &str) -> Option<String> {
    snapshot
        .get(field_name)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn is_runtime_contract_tool_trace_source(source: &str) -> bool {
    source.contains("skill_trace")
        || source.contains("browser_action_trace")
        || source.contains("service_scene_trace")
        || source.contains("audio_task")
        || source.contains("transcription_task")
}

fn extract_audio_output_snapshot(document: &Value) -> Option<Value> {
    let audio_output = find_json_value_at_paths(
        document,
        &[
            &["audio_output"][..],
            &["audioOutput"][..],
            &["payload", "audio_output"][..],
            &["payload", "audioOutput"][..],
            &["result", "audio_output"][..],
            &["result", "audioOutput"][..],
            &["record", "payload", "audio_output"][..],
            &["record", "payload", "audioOutput"][..],
            &["record", "result", "audio_output"][..],
            &["record", "result", "audioOutput"][..],
        ],
    )
    .filter(|value| value.is_object())?;

    Some(json!({
        "kind": read_json_string(audio_output, &[&["kind"][..]]).unwrap_or_else(|| "audio_output".to_string()),
        "status": read_json_string(audio_output, &[&["status"][..]]),
        "audioPath": read_json_string(audio_output, &[&["audio_path"][..], &["audioPath"][..]]),
        "mimeType": read_json_string(audio_output, &[&["mime_type"][..], &["mimeType"][..]]),
        "durationMs": find_json_value_at_paths(audio_output, &[&["duration_ms"][..], &["durationMs"][..]])
            .cloned()
            .unwrap_or(Value::Null),
        "sourceText": read_json_string(audio_output, &[&["source_text"][..], &["sourceText"][..]]),
        "voice": read_json_string(audio_output, &[&["voice"][..]]),
        "providerId": read_json_string(audio_output, &[&["provider_id"][..], &["providerId"][..]]),
        "model": read_json_string(audio_output, &[&["model"][..]]),
        "errorCode": read_json_string(audio_output, &[&["error_code"][..], &["errorCode"][..]]),
        "errorMessage": read_json_string(audio_output, &[&["error_message"][..], &["errorMessage"][..]]),
        "retryable": find_json_value_at_paths(audio_output, &[&["retryable"][..]])
            .cloned()
            .unwrap_or(Value::Null),
        "stage": read_json_string(audio_output, &[&["stage"][..]]),
        "workerId": read_json_string(
            document,
            &[
                &["current_attempt_worker_id"][..],
                &["currentAttemptWorkerId"][..],
                &["record", "current_attempt_worker_id"][..],
                &["record", "currentAttemptWorkerId"][..],
            ],
        ),
    }))
}

fn extract_transcript_snapshot(document: &Value) -> Option<Value> {
    let transcript = find_json_value_at_paths(
        document,
        &[
            &["transcript"][..],
            &["payload", "transcript"][..],
            &["result", "transcript"][..],
            &["record", "payload", "transcript"][..],
            &["record", "result", "transcript"][..],
        ],
    )
    .filter(|value| value.is_object())?;

    Some(json!({
        "kind": read_json_string(transcript, &[&["kind"][..]]).unwrap_or_else(|| "transcript".to_string()),
        "status": read_json_string(transcript, &[&["status"][..]]),
        "transcriptPath": read_json_string(transcript, &[&["transcript_path"][..], &["transcriptPath"][..], &["path"][..]]),
        "sourceUrl": read_json_string(transcript, &[&["source_url"][..], &["sourceUrl"][..]]),
        "sourcePath": read_json_string(transcript, &[&["source_path"][..], &["sourcePath"][..]]),
        "language": read_json_string(transcript, &[&["language"][..]]),
        "outputFormat": read_json_string(transcript, &[&["output_format"][..], &["outputFormat"][..]]),
        "timestamps": find_json_value_at_paths(transcript, &[&["timestamps"][..]])
            .cloned()
            .unwrap_or(Value::Null),
        "speakerLabels": find_json_value_at_paths(transcript, &[&["speaker_labels"][..], &["speakerLabels"][..]])
            .cloned()
            .unwrap_or(Value::Null),
        "providerId": read_json_string(transcript, &[&["provider_id"][..], &["providerId"][..]]),
        "model": read_json_string(transcript, &[&["model"][..]]),
        "errorCode": read_json_string(transcript, &[&["error_code"][..], &["errorCode"][..]]),
        "errorMessage": read_json_string(transcript, &[&["error_message"][..], &["errorMessage"][..]]),
        "retryable": find_json_value_at_paths(transcript, &[&["retryable"][..]])
            .cloned()
            .unwrap_or(Value::Null),
        "stage": read_json_string(transcript, &[&["stage"][..]]),
        "workerId": read_json_string(
            document,
            &[
                &["current_attempt_worker_id"][..],
                &["currentAttemptWorkerId"][..],
                &["record", "current_attempt_worker_id"][..],
                &["record", "currentAttemptWorkerId"][..],
            ],
        ),
    }))
}

pub(crate) fn collect_modality_runtime_contract_snapshots(
    detail: &SessionDetail,
    workspace_root: Option<&Path>,
    recent_artifacts: &[RuntimeRecentArtifact],
) -> RuntimeModalityContractSnapshotSummary {
    let mut summary = RuntimeModalityContractSnapshotSummary::default();

    for artifact in recent_artifacts {
        if !is_modality_runtime_contract_applicable(artifact) {
            continue;
        }

        summary.applicable_count += 1;

        if let Some(metadata) = artifact.metadata.as_ref() {
            if let Some(snapshot) =
                extract_modality_runtime_contract_snapshot(metadata, artifact.path.as_str())
            {
                summary.snapshots.push(snapshot);
                continue;
            }
        }

        let Some(workspace_root) = workspace_root else {
            continue;
        };

        let absolute_path = resolve_workspace_path(workspace_root, artifact.path.as_str());
        let Ok(raw) = fs::read_to_string(&absolute_path) else {
            continue;
        };
        let Ok(document) = serde_json::from_str::<Value>(raw.as_str()) else {
            continue;
        };

        if let Some(snapshot) =
            extract_modality_runtime_contract_snapshot(&document, artifact.path.as_str())
        {
            summary.snapshots.push(snapshot);
        }
    }

    for item in detail.items.iter().rev() {
        let AgentThreadItemPayload::ToolCall {
            tool_name,
            arguments,
            success,
            metadata,
            ..
        } = &item.payload
        else {
            continue;
        };
        let artifact_path = format!("runtime_timeline/{}/{}", item.id, tool_name);
        let snapshot = if is_browser_tool_name(tool_name.as_str()) {
            extract_browser_control_contract_snapshot(
                item.id.as_str(),
                tool_name.as_str(),
                arguments.as_ref(),
                *success,
                metadata.as_ref(),
                artifact_path.as_str(),
            )
        } else {
            extract_pdf_read_skill_contract_snapshot(
                tool_name.as_str(),
                arguments.as_ref(),
                metadata.as_ref(),
                *success,
                artifact_path.as_str(),
            )
            .or_else(|| {
                extract_voice_generation_service_contract_snapshot(
                    tool_name.as_str(),
                    arguments.as_ref(),
                    metadata.as_ref(),
                    *success,
                    artifact_path.as_str(),
                )
            })
            .or_else(|| {
                extract_web_research_skill_contract_snapshot(
                    tool_name.as_str(),
                    arguments.as_ref(),
                    metadata.as_ref(),
                    *success,
                    artifact_path.as_str(),
                )
            })
            .or_else(|| {
                extract_text_transform_skill_contract_snapshot(
                    tool_name.as_str(),
                    arguments.as_ref(),
                    metadata.as_ref(),
                    *success,
                    artifact_path.as_str(),
                )
            })
        };
        let Some(mut snapshot) = snapshot else {
            continue;
        };
        enrich_modality_runtime_contract_snapshot_with_thread_item(&mut snapshot, item);
        summary.applicable_count += 1;
        summary.snapshots.push(snapshot);
        if summary.snapshots.len() >= MAX_TIMELINE_TOOL_CONTRACT_SNAPSHOTS {
            break;
        }
    }

    summary
}

fn enrich_modality_runtime_contract_snapshot_with_thread_item(
    snapshot: &mut Value,
    item: &AgentThreadItem,
) {
    let Some(object) = snapshot.as_object_mut() else {
        return;
    };

    if object.get("threadId").map_or(true, Value::is_null) {
        object.insert(
            "threadId".to_string(),
            Value::String(item.thread_id.clone()),
        );
    }
    if object.get("turnId").map_or(true, Value::is_null) {
        object.insert("turnId".to_string(), Value::String(item.turn_id.clone()));
    }
}

fn is_modality_runtime_contract_applicable(artifact: &RuntimeRecentArtifact) -> bool {
    let normalized_path = artifact.path.replace('\\', "/").to_ascii_lowercase();
    if normalized_path.contains(".lime/tasks/image_generate/")
        || normalized_path.contains(".lime/tasks/audio_generate/")
        || normalized_path.contains(".lime/tasks/transcription_generate/")
    {
        return true;
    }

    artifact
        .metadata
        .as_ref()
        .map(|metadata| {
            read_json_string(
                metadata,
                &[
                    &["modality_contract_key"][..],
                    &["modalityContractKey"][..],
                    &["runtime_contract", "contract_key"][..],
                    &["runtimeContract", "contractKey"][..],
                ],
            )
            .is_some()
                || read_json_string(
                    metadata,
                    &[
                        &["task_type"][..],
                        &["taskType"][..],
                        &["type"][..],
                        &["artifactType"][..],
                    ],
                )
                .map(|value| {
                    value.eq_ignore_ascii_case("image_generate")
                        || value.eq_ignore_ascii_case("audio_generate")
                        || value.eq_ignore_ascii_case("transcription_generate")
                })
                .unwrap_or(false)
        })
        .unwrap_or(false)
}

fn extract_pdf_read_skill_contract_snapshot(
    tool_name: &str,
    arguments: Option<&Value>,
    metadata: Option<&Value>,
    success: Option<bool>,
    artifact_path: &str,
) -> Option<Value> {
    if !is_pdf_read_skill_tool_call(tool_name, arguments, metadata) {
        return None;
    }

    for mut document in collect_pdf_extract_contract_documents(arguments, metadata) {
        apply_tool_call_status_to_contract_document(&mut document, success);
        if let Some(snapshot) = extract_modality_runtime_contract_snapshot(&document, artifact_path)
        {
            return Some(snapshot);
        }
    }

    None
}

fn is_pdf_read_skill_tool_call(
    tool_name: &str,
    arguments: Option<&Value>,
    metadata: Option<&Value>,
) -> bool {
    let normalized_tool_name = tool_name.trim().to_ascii_lowercase();
    let tool_is_skill = normalized_tool_name == "skill" || normalized_tool_name.contains("skill");
    let tool_is_pdf_read = normalized_tool_name == "pdf_read"
        || normalized_tool_name.contains("pdf_read")
        || normalized_tool_name.contains("pdf-read");
    let argument_skill_is_pdf_read = arguments
        .and_then(|arguments| {
            read_json_string(
                arguments,
                &[
                    &["skill"][..],
                    &["skill_name"][..],
                    &["skillName"][..],
                    &["name"][..],
                ],
            )
        })
        .map(|value| value == "pdf_read")
        .unwrap_or(false);
    let has_pdf_contract = !collect_pdf_extract_contract_documents(arguments, metadata).is_empty();

    tool_is_pdf_read || (tool_is_skill && (argument_skill_is_pdf_read || has_pdf_contract))
}

fn collect_pdf_extract_contract_documents(
    arguments: Option<&Value>,
    metadata: Option<&Value>,
) -> Vec<Value> {
    let mut documents = Vec::new();

    if let Some(metadata) = metadata {
        push_pdf_extract_contract_candidates(metadata, &mut documents);
    }

    if let Some(arguments) = arguments {
        push_pdf_extract_contract_candidates(arguments, &mut documents);
        if let Some(skill_args) = arguments.get("args") {
            match skill_args {
                Value::Object(_) => {
                    push_pdf_extract_contract_candidates(skill_args, &mut documents)
                }
                Value::String(text) => {
                    if let Ok(parsed) = serde_json::from_str::<Value>(text.trim()) {
                        push_pdf_extract_contract_candidates(&parsed, &mut documents);
                    }
                }
                _ => {}
            }
        }
    }

    documents
        .into_iter()
        .filter(has_pdf_extract_contract)
        .collect()
}

fn push_pdf_extract_contract_candidates(source: &Value, documents: &mut Vec<Value>) {
    documents.push(source.clone());
    for path in [
        &["harness", "pdf_read_skill_launch"][..],
        &["harness", "pdfReadSkillLaunch"][..],
        &["harness", "pdf_read_skill_launch", "pdf_read_request"][..],
        &["harness", "pdfReadSkillLaunch", "pdfReadRequest"][..],
        &["pdf_read_skill_launch"][..],
        &["pdfReadSkillLaunch"][..],
        &["pdf_read_skill_launch", "pdf_read_request"][..],
        &["pdfReadSkillLaunch", "pdfReadRequest"][..],
        &["pdf_read_request"][..],
        &["pdfReadRequest"][..],
    ] {
        if let Some(candidate) = find_json_value(source, path) {
            documents.push(candidate.clone());
        }
    }
}

fn has_pdf_extract_contract(document: &Value) -> bool {
    read_json_string(
        document,
        &[
            &["modality_contract_key"][..],
            &["modalityContractKey"][..],
            &["runtime_contract", "contract_key"][..],
            &["runtimeContract", "contractKey"][..],
        ],
    )
    .map(|value| value == PDF_EXTRACT_CONTRACT_KEY)
    .unwrap_or(false)
}

fn extract_voice_generation_service_contract_snapshot(
    tool_name: &str,
    arguments: Option<&Value>,
    metadata: Option<&Value>,
    success: Option<bool>,
    artifact_path: &str,
) -> Option<Value> {
    if !is_voice_generation_service_tool_call(tool_name, arguments, metadata) {
        return None;
    }

    for mut document in collect_voice_generation_contract_documents(arguments, metadata) {
        apply_tool_call_status_to_contract_document(&mut document, success);
        if let Some(snapshot) = extract_modality_runtime_contract_snapshot(&document, artifact_path)
        {
            return Some(snapshot);
        }
    }

    None
}

fn is_voice_generation_service_tool_call(
    tool_name: &str,
    arguments: Option<&Value>,
    metadata: Option<&Value>,
) -> bool {
    let normalized_tool_name = tool_name.trim().to_ascii_lowercase();
    let tool_is_voice_generation = normalized_tool_name == "voice_runtime"
        || normalized_tool_name.contains("voice_runtime")
        || normalized_tool_name.contains("voice-generation")
        || normalized_tool_name.contains("voice_generation");
    let tool_is_service_scene = normalized_tool_name.contains("service_scene")
        || normalized_tool_name.contains("service-skill")
        || normalized_tool_name.contains("service_skill")
        || normalized_tool_name.contains("lime_run_service_skill");
    let has_voice_contract =
        !collect_voice_generation_contract_documents(arguments, metadata).is_empty();

    tool_is_voice_generation || (tool_is_service_scene && has_voice_contract)
}

fn collect_voice_generation_contract_documents(
    arguments: Option<&Value>,
    metadata: Option<&Value>,
) -> Vec<Value> {
    let mut documents = Vec::new();

    if let Some(metadata) = metadata {
        push_voice_generation_contract_candidates(metadata, &mut documents);
    }

    if let Some(arguments) = arguments {
        push_voice_generation_contract_candidates(arguments, &mut documents);
        if let Some(skill_args) = arguments.get("args") {
            match skill_args {
                Value::Object(_) => {
                    push_voice_generation_contract_candidates(skill_args, &mut documents)
                }
                Value::String(text) => {
                    if let Ok(parsed) = serde_json::from_str::<Value>(text.trim()) {
                        push_voice_generation_contract_candidates(&parsed, &mut documents);
                    }
                }
                _ => {}
            }
        }
    }

    documents
        .into_iter()
        .filter(has_voice_generation_contract)
        .collect()
}

fn push_voice_generation_contract_candidates(source: &Value, documents: &mut Vec<Value>) {
    documents.push(source.clone());
    for path in [
        &["harness", "service_scene_launch"][..],
        &["harness", "serviceSceneLaunch"][..],
        &["harness", "service_scene_launch", "service_scene_run"][..],
        &["harness", "serviceSceneLaunch", "serviceSceneRun"][..],
        &["service_scene_launch"][..],
        &["serviceSceneLaunch"][..],
        &["service_scene_launch", "service_scene_run"][..],
        &["serviceSceneLaunch", "serviceSceneRun"][..],
        &["service_scene_run"][..],
        &["serviceSceneRun"][..],
        &["result"][..],
        &["result", "service_scene_launch"][..],
        &["result", "serviceSceneLaunch"][..],
        &["result", "service_scene_launch", "service_scene_run"][..],
        &["result", "serviceSceneLaunch", "serviceSceneRun"][..],
        &["result", "service_scene_run"][..],
        &["result", "serviceSceneRun"][..],
    ] {
        if let Some(candidate) = find_json_value(source, path) {
            documents.push(candidate.clone());
        }
    }
}

fn has_voice_generation_contract(document: &Value) -> bool {
    read_json_string(
        document,
        &[
            &["modality_contract_key"][..],
            &["modalityContractKey"][..],
            &["runtime_contract", "contract_key"][..],
            &["runtimeContract", "contractKey"][..],
        ],
    )
    .map(|value| value == VOICE_GENERATION_CONTRACT_KEY)
    .unwrap_or(false)
}

fn extract_web_research_skill_contract_snapshot(
    tool_name: &str,
    arguments: Option<&Value>,
    metadata: Option<&Value>,
    success: Option<bool>,
    artifact_path: &str,
) -> Option<Value> {
    if !is_web_research_skill_tool_call(tool_name, arguments, metadata) {
        return None;
    }

    for mut document in collect_web_research_contract_documents(arguments, metadata) {
        apply_tool_call_status_to_contract_document(&mut document, success);
        if let Some(snapshot) = extract_modality_runtime_contract_snapshot(&document, artifact_path)
        {
            return Some(snapshot);
        }
    }

    None
}

fn is_web_research_skill_tool_call(
    tool_name: &str,
    arguments: Option<&Value>,
    metadata: Option<&Value>,
) -> bool {
    let normalized_tool_name = tool_name.trim().to_ascii_lowercase();
    let tool_is_skill = normalized_tool_name == "skill" || normalized_tool_name.contains("skill");
    let tool_is_research = normalized_tool_name == "research"
        || normalized_tool_name.contains("research")
        || normalized_tool_name == "site_search"
        || normalized_tool_name.contains("site_search")
        || normalized_tool_name.contains("site-search")
        || normalized_tool_name == "report_generate"
        || normalized_tool_name.contains("report_generate")
        || normalized_tool_name.contains("report-generate");
    let argument_skill_is_web_research = arguments
        .and_then(|arguments| {
            read_json_string(
                arguments,
                &[
                    &["skill"][..],
                    &["skill_name"][..],
                    &["skillName"][..],
                    &["name"][..],
                ],
            )
        })
        .map(|value| value == "research" || value == "site_search" || value == "report_generate")
        .unwrap_or(false);
    let has_web_research_contract =
        !collect_web_research_contract_documents(arguments, metadata).is_empty();

    tool_is_research
        || (tool_is_skill && (argument_skill_is_web_research || has_web_research_contract))
}

fn collect_web_research_contract_documents(
    arguments: Option<&Value>,
    metadata: Option<&Value>,
) -> Vec<Value> {
    let mut documents = Vec::new();

    if let Some(metadata) = metadata {
        push_web_research_contract_candidates(metadata, &mut documents);
    }

    if let Some(arguments) = arguments {
        push_web_research_contract_candidates(arguments, &mut documents);
        if let Some(skill_args) = arguments.get("args") {
            match skill_args {
                Value::Object(_) => {
                    push_web_research_contract_candidates(skill_args, &mut documents)
                }
                Value::String(text) => {
                    if let Ok(parsed) = serde_json::from_str::<Value>(text.trim()) {
                        push_web_research_contract_candidates(&parsed, &mut documents);
                    }
                }
                _ => {}
            }
        }
    }

    documents
        .into_iter()
        .filter(has_web_research_contract)
        .collect()
}

fn push_web_research_contract_candidates(source: &Value, documents: &mut Vec<Value>) {
    documents.push(source.clone());
    for path in [
        &["harness", "research_skill_launch"][..],
        &["harness", "researchSkillLaunch"][..],
        &["harness", "research_skill_launch", "research_request"][..],
        &["harness", "researchSkillLaunch", "researchRequest"][..],
        &["harness", "deep_search_skill_launch"][..],
        &["harness", "deepSearchSkillLaunch"][..],
        &["harness", "deep_search_skill_launch", "deep_search_request"][..],
        &["harness", "deepSearchSkillLaunch", "deepSearchRequest"][..],
        &["harness", "site_search_skill_launch"][..],
        &["harness", "siteSearchSkillLaunch"][..],
        &["harness", "site_search_skill_launch", "site_search_request"][..],
        &["harness", "siteSearchSkillLaunch", "siteSearchRequest"][..],
        &["harness", "report_skill_launch"][..],
        &["harness", "reportSkillLaunch"][..],
        &["harness", "report_skill_launch", "report_request"][..],
        &["harness", "reportSkillLaunch", "reportRequest"][..],
        &["research_skill_launch"][..],
        &["researchSkillLaunch"][..],
        &["research_skill_launch", "research_request"][..],
        &["researchSkillLaunch", "researchRequest"][..],
        &["deep_search_skill_launch"][..],
        &["deepSearchSkillLaunch"][..],
        &["deep_search_skill_launch", "deep_search_request"][..],
        &["deepSearchSkillLaunch", "deepSearchRequest"][..],
        &["site_search_skill_launch"][..],
        &["siteSearchSkillLaunch"][..],
        &["site_search_skill_launch", "site_search_request"][..],
        &["siteSearchSkillLaunch", "siteSearchRequest"][..],
        &["report_skill_launch"][..],
        &["reportSkillLaunch"][..],
        &["report_skill_launch", "report_request"][..],
        &["reportSkillLaunch", "reportRequest"][..],
        &["research_request"][..],
        &["researchRequest"][..],
        &["deep_search_request"][..],
        &["deepSearchRequest"][..],
        &["site_search_request"][..],
        &["siteSearchRequest"][..],
        &["report_request"][..],
        &["reportRequest"][..],
    ] {
        if let Some(candidate) = find_json_value(source, path) {
            documents.push(candidate.clone());
        }
    }
}

fn has_web_research_contract(document: &Value) -> bool {
    read_json_string(
        document,
        &[
            &["modality_contract_key"][..],
            &["modalityContractKey"][..],
            &["runtime_contract", "contract_key"][..],
            &["runtimeContract", "contractKey"][..],
        ],
    )
    .map(|value| value == WEB_RESEARCH_CONTRACT_KEY)
    .unwrap_or(false)
}

fn extract_text_transform_skill_contract_snapshot(
    tool_name: &str,
    arguments: Option<&Value>,
    metadata: Option<&Value>,
    success: Option<bool>,
    artifact_path: &str,
) -> Option<Value> {
    if !is_text_transform_skill_tool_call(tool_name, arguments, metadata) {
        return None;
    }

    for mut document in collect_text_transform_contract_documents(arguments, metadata) {
        apply_tool_call_status_to_contract_document(&mut document, success);
        if let Some(snapshot) = extract_modality_runtime_contract_snapshot(&document, artifact_path)
        {
            return Some(snapshot);
        }
    }

    None
}

fn is_text_transform_skill_tool_call(
    tool_name: &str,
    arguments: Option<&Value>,
    metadata: Option<&Value>,
) -> bool {
    let normalized_tool_name = tool_name.trim().to_ascii_lowercase();
    let tool_is_skill = normalized_tool_name == "skill" || normalized_tool_name.contains("skill");
    let tool_is_text_transform = normalized_tool_name == "summary"
        || normalized_tool_name.contains("summary")
        || normalized_tool_name == "translation"
        || normalized_tool_name.contains("translation")
        || normalized_tool_name == "analysis"
        || normalized_tool_name.contains("analysis");
    let argument_skill_is_text_transform = arguments
        .and_then(|arguments| {
            read_json_string(
                arguments,
                &[
                    &["skill"][..],
                    &["skill_name"][..],
                    &["skillName"][..],
                    &["name"][..],
                ],
            )
        })
        .map(|value| value == "summary" || value == "translation" || value == "analysis")
        .unwrap_or(false);
    let has_text_transform_contract =
        !collect_text_transform_contract_documents(arguments, metadata).is_empty();

    tool_is_text_transform
        || (tool_is_skill && (argument_skill_is_text_transform || has_text_transform_contract))
}

fn collect_text_transform_contract_documents(
    arguments: Option<&Value>,
    metadata: Option<&Value>,
) -> Vec<Value> {
    let mut documents = Vec::new();

    if let Some(metadata) = metadata {
        push_text_transform_contract_candidates(metadata, &mut documents);
    }

    if let Some(arguments) = arguments {
        push_text_transform_contract_candidates(arguments, &mut documents);
        if let Some(skill_args) = arguments.get("args") {
            match skill_args {
                Value::Object(_) => {
                    push_text_transform_contract_candidates(skill_args, &mut documents)
                }
                Value::String(text) => {
                    if let Ok(parsed) = serde_json::from_str::<Value>(text.trim()) {
                        push_text_transform_contract_candidates(&parsed, &mut documents);
                    }
                }
                _ => {}
            }
        }
    }

    documents
        .into_iter()
        .filter(has_text_transform_contract)
        .collect()
}

fn push_text_transform_contract_candidates(source: &Value, documents: &mut Vec<Value>) {
    documents.push(source.clone());
    for path in [
        &["harness", "summary_skill_launch"][..],
        &["harness", "summarySkillLaunch"][..],
        &["harness", "summary_skill_launch", "summary_request"][..],
        &["harness", "summarySkillLaunch", "summaryRequest"][..],
        &["harness", "translation_skill_launch"][..],
        &["harness", "translationSkillLaunch"][..],
        &["harness", "translation_skill_launch", "translation_request"][..],
        &["harness", "translationSkillLaunch", "translationRequest"][..],
        &["harness", "analysis_skill_launch"][..],
        &["harness", "analysisSkillLaunch"][..],
        &["harness", "analysis_skill_launch", "analysis_request"][..],
        &["harness", "analysisSkillLaunch", "analysisRequest"][..],
        &["summary_skill_launch"][..],
        &["summarySkillLaunch"][..],
        &["summary_skill_launch", "summary_request"][..],
        &["summarySkillLaunch", "summaryRequest"][..],
        &["translation_skill_launch"][..],
        &["translationSkillLaunch"][..],
        &["translation_skill_launch", "translation_request"][..],
        &["translationSkillLaunch", "translationRequest"][..],
        &["analysis_skill_launch"][..],
        &["analysisSkillLaunch"][..],
        &["analysis_skill_launch", "analysis_request"][..],
        &["analysisSkillLaunch", "analysisRequest"][..],
        &["summary_request"][..],
        &["summaryRequest"][..],
        &["translation_request"][..],
        &["translationRequest"][..],
        &["analysis_request"][..],
        &["analysisRequest"][..],
    ] {
        if let Some(candidate) = find_json_value(source, path) {
            documents.push(candidate.clone());
        }
    }
}

fn has_text_transform_contract(document: &Value) -> bool {
    read_json_string(
        document,
        &[
            &["modality_contract_key"][..],
            &["modalityContractKey"][..],
            &["runtime_contract", "contract_key"][..],
            &["runtimeContract", "contractKey"][..],
        ],
    )
    .map(|value| value == TEXT_TRANSFORM_CONTRACT_KEY)
    .unwrap_or(false)
}

fn apply_tool_call_status_to_contract_document(document: &mut Value, success: Option<bool>) {
    let Some(map) = document.as_object_mut() else {
        return;
    };
    let status = match success {
        Some(false) => "failed",
        Some(true) => "completed",
        None => return,
    };
    map.entry("status".to_string())
        .or_insert_with(|| Value::String(status.to_string()));
    map.entry("normalized_status".to_string())
        .or_insert_with(|| Value::String(status.to_string()));
}

fn extract_browser_control_contract_snapshot(
    item_id: &str,
    tool_name: &str,
    arguments: Option<&Value>,
    success: Option<bool>,
    metadata: Option<&Value>,
    artifact_path: &str,
) -> Option<Value> {
    let metadata = metadata?;
    let mut snapshot = extract_modality_runtime_contract_snapshot(metadata, artifact_path)?;
    if snapshot.get("contractKey").and_then(Value::as_str) != Some(BROWSER_CONTROL_CONTRACT_KEY) {
        return Some(snapshot);
    }

    if let Value::Object(object) = &mut snapshot {
        object.insert(
            "browserAction".to_string(),
            build_browser_action_contract_index_item(
                item_id, tool_name, arguments, success, metadata,
            ),
        );
    }

    Some(snapshot)
}

fn build_browser_action_contract_index_item(
    item_id: &str,
    tool_name: &str,
    arguments: Option<&Value>,
    success: Option<bool>,
    metadata: &Value,
) -> Value {
    let action = read_json_string(metadata, &[&["action"][..], &["result", "action"][..]])
        .unwrap_or_else(|| infer_browser_action_name(tool_name));
    let artifact_kind = infer_browser_action_artifact_kind(action.as_str());
    let action_success =
        read_json_bool(metadata, &[&["result", "success"][..], &["success"][..]]).or(success);
    let status = match action_success {
        Some(true) => "completed",
        Some(false) => "failed",
        None => "unknown",
    };
    let attempt_count = read_json_usize(metadata, &[&["attempt_count"][..], &["attemptCount"][..]])
        .or_else(|| {
            metadata
                .get("attempts")
                .and_then(Value::as_array)
                .map(Vec::len)
        })
        .or_else(|| {
            metadata
                .pointer("/result/attempts")
                .and_then(Value::as_array)
                .map(Vec::len)
        });
    let last_url = read_json_string(
        metadata,
        &[
            &["browser_session", "target_url"][..],
            &["browserSession", "targetUrl"][..],
            &["result", "data", "browser_session", "target_url"][..],
            &["result", "data", "browserSession", "targetUrl"][..],
            &["result", "data", "target_url"][..],
            &["result", "data", "targetUrl"][..],
            &["result", "data", "url"][..],
            &["result", "data", "tab", "url"][..],
            &["result", "target_url"][..],
            &["result", "targetUrl"][..],
            &["result", "url"][..],
        ],
    )
    .or_else(|| {
        arguments.and_then(|arguments| {
            read_json_string(
                arguments,
                &[
                    &["url"][..],
                    &["target_url"][..],
                    &["targetUrl"][..],
                    &["page_url"][..],
                    &["pageUrl"][..],
                ],
            )
        })
    });
    let screenshot_available = has_browser_screenshot(metadata);
    let observation_available =
        artifact_kind == "browser_snapshot" || screenshot_available || last_url.is_some();

    json!({
        "itemId": item_id,
        "artifactKind": artifact_kind,
        "toolName": tool_name,
        "action": action,
        "status": status,
        "success": action_success,
        "sessionId": read_json_string(
            metadata,
            &[
                &["browser_session", "session_id"][..],
                &["browserSession", "sessionId"][..],
                &["result", "session_id"][..],
                &["result", "sessionId"][..],
                &["result", "data", "session_id"][..],
                &["result", "data", "sessionId"][..],
                &["result", "data", "browser_session", "session_id"][..],
                &["result", "data", "browserSession", "sessionId"][..],
            ],
        ),
        "targetId": read_json_string(
            metadata,
            &[
                &["browser_session", "target_id"][..],
                &["browserSession", "targetId"][..],
                &["result", "target_id"][..],
                &["result", "targetId"][..],
                &["result", "data", "target_id"][..],
                &["result", "data", "targetId"][..],
                &["result", "data", "browser_session", "target_id"][..],
                &["result", "data", "browserSession", "targetId"][..],
                &["result", "data", "tab", "id"][..],
            ],
        ),
        "profileKey": read_json_string(
            metadata,
            &[
                &["browser_session", "profile_key"][..],
                &["browserSession", "profileKey"][..],
                &["result", "data", "profile_key"][..],
                &["result", "data", "profileKey"][..],
                &["result", "data", "browser_session", "profile_key"][..],
                &["result", "data", "browserSession", "profileKey"][..],
            ],
        ),
        "backend": read_json_string(
            metadata,
            &[&["selected_backend"][..], &["selectedBackend"][..], &["result", "backend"][..]],
        ),
        "requestId": read_json_string(
            metadata,
            &[&["result", "request_id"][..], &["result", "requestId"][..]],
        ),
        "lastUrl": last_url,
        "title": read_json_string(
            metadata,
            &[
                &["browser_session", "target_title"][..],
                &["browserSession", "targetTitle"][..],
                &["result", "data", "title"][..],
                &["result", "data", "target_title"][..],
                &["result", "data", "targetTitle"][..],
                &["result", "data", "browser_session", "target_title"][..],
                &["result", "data", "browserSession", "targetTitle"][..],
            ],
        ),
        "attemptCount": attempt_count,
        "observationAvailable": observation_available,
        "screenshotAvailable": screenshot_available,
    })
}

fn infer_browser_action_name(tool_name: &str) -> String {
    tool_name
        .rsplit("__")
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(tool_name)
        .to_string()
}

fn infer_browser_action_artifact_kind(action: &str) -> &'static str {
    let normalized = action.trim().to_ascii_lowercase();
    if normalized.contains("snapshot")
        || normalized.contains("read_page")
        || normalized.contains("get_page")
        || normalized.contains("page_info")
        || normalized.contains("page_text")
        || normalized.contains("console")
        || normalized.contains("network")
        || normalized.contains("find")
        || normalized.contains("tabs_context")
    {
        "browser_snapshot"
    } else {
        "browser_session"
    }
}

fn has_browser_screenshot(metadata: &Value) -> bool {
    find_json_value_at_paths(
        metadata,
        &[
            &["screenshot"][..],
            &["screenshot_path"][..],
            &["screenshotPath"][..],
            &["result", "data", "screenshot"][..],
            &["result", "data", "screenshot_path"][..],
            &["result", "data", "screenshotPath"][..],
        ],
    )
    .map(json_value_has_content)
    .unwrap_or(false)
}

fn extract_modality_runtime_contract_snapshot(
    document: &Value,
    artifact_path: &str,
) -> Option<Value> {
    let contract_key = read_json_string(
        document,
        &[
            &["modality_contract_key"][..],
            &["modalityContractKey"][..],
            &["payload", "modality_contract_key"][..],
            &["payload", "modalityContractKey"][..],
            &["record", "payload", "modality_contract_key"][..],
            &["record", "payload", "modalityContractKey"][..],
            &["runtime_contract", "contract_key"][..],
            &["runtimeContract", "contractKey"][..],
            &["payload", "runtime_contract", "contract_key"][..],
            &["payload", "runtimeContract", "contractKey"][..],
            &["record", "payload", "runtime_contract", "contract_key"][..],
            &["record", "payload", "runtimeContract", "contractKey"][..],
        ],
    )?;
    let task_type = read_json_string(
        document,
        &[
            &["task_type"][..],
            &["taskType"][..],
            &["record", "task_type"][..],
            &["record", "taskType"][..],
        ],
    );
    let normalized_status = read_json_string(
        document,
        &[
            &["normalized_status"][..],
            &["normalizedStatus"][..],
            &["record", "normalized_status"][..],
            &["record", "normalizedStatus"][..],
        ],
    );
    let last_error = find_json_value_at_paths(
        document,
        &[
            &["last_error"][..],
            &["lastError"][..],
            &["record", "last_error"][..],
            &["record", "lastError"][..],
        ],
    )
    .filter(|value| !value.is_null())
    .cloned();
    let failure_code = last_error
        .as_ref()
        .and_then(|error| read_json_string(error, &[&["code"][..]]));
    let failure_stage = last_error
        .as_ref()
        .and_then(|error| read_json_string(error, &[&["stage"][..]]));
    let is_contract_routing_failure = failure_code
        .as_deref()
        .map(is_modality_contract_routing_failure_code)
        .unwrap_or(false);
    let is_runtime_preflight_failure = failure_code
        .as_deref()
        .map(is_modality_runtime_preflight_failure_code)
        .unwrap_or(false);
    let is_image_generation_contract = contract_key == IMAGE_GENERATION_CONTRACT_KEY;
    let is_browser_control_contract = contract_key == BROWSER_CONTROL_CONTRACT_KEY;
    let is_pdf_extract_contract = contract_key == PDF_EXTRACT_CONTRACT_KEY;
    let is_voice_generation_contract = contract_key == VOICE_GENERATION_CONTRACT_KEY;
    let is_audio_transcription_contract = contract_key == AUDIO_TRANSCRIPTION_CONTRACT_KEY;
    let is_web_research_contract = contract_key == WEB_RESEARCH_CONTRACT_KEY;
    let is_text_transform_contract = contract_key == TEXT_TRANSFORM_CONTRACT_KEY;
    let is_audio_task_artifact = is_voice_generation_contract
        && (task_type.as_deref() == Some("audio_generate")
            || artifact_path
                .replace('\\', "/")
                .to_ascii_lowercase()
                .contains(".lime/tasks/audio_generate/"));
    let is_transcription_task_artifact = is_audio_transcription_contract
        && (task_type.as_deref() == Some("transcription_generate")
            || artifact_path
                .replace('\\', "/")
                .to_ascii_lowercase()
                .contains(".lime/tasks/transcription_generate/"));
    let routing_event = if is_contract_routing_failure {
        "routing_not_possible"
    } else if is_runtime_preflight_failure {
        "runtime_preflight"
    } else if is_browser_control_contract {
        "browser_action_requested"
    } else if is_pdf_extract_contract
        || is_voice_generation_contract
        || is_audio_transcription_contract
        || is_web_research_contract
        || is_text_transform_contract
    {
        "executor_invoked"
    } else {
        "model_routing_decision"
    };
    let routing_outcome = if is_contract_routing_failure || is_runtime_preflight_failure {
        "blocked"
    } else if normalized_status.as_deref() == Some("failed") {
        "failed"
    } else {
        "accepted"
    };
    let limecore_policy_refs =
        extract_runtime_contract_limecore_policy_refs(document, contract_key.as_str());
    let limecore_policy_snapshot =
        extract_runtime_contract_limecore_policy_snapshot(document, &limecore_policy_refs);
    let entry_source = read_modality_contract_entry_source(document);
    let entry_key = read_modality_contract_entry_key(document).or_else(|| entry_source.clone());
    let modality = read_json_string(
        document,
        &[
            &["modality"][..],
            &["payload", "modality"][..],
            &["record", "payload", "modality"][..],
            &["runtime_contract", "modality"][..],
            &["runtimeContract", "modality"][..],
            &["payload", "runtime_contract", "modality"][..],
            &["payload", "runtimeContract", "modality"][..],
            &["record", "payload", "runtime_contract", "modality"][..],
            &["record", "payload", "runtimeContract", "modality"][..],
        ],
    );
    let model = read_modality_contract_model(document);
    let model_id = read_modality_contract_model_id(document).or_else(|| model.clone());
    let executor_kind = extract_runtime_contract_executor_kind(document);
    let executor_binding_key = extract_runtime_contract_executor_binding_key(document);
    let skill_id =
        read_modality_contract_skill_id(document).or_else(|| match executor_kind.as_deref() {
            Some("skill") | Some("service_skill") => executor_binding_key.clone(),
            _ => None,
        });
    let cost_state = read_modality_contract_cost_state(document);
    let estimated_cost_class = read_modality_contract_estimated_cost_class(document);
    let limit_state = read_modality_contract_limit_state(document);
    let limit_event_kind = read_modality_contract_limit_event_kind(document);
    let quota_low = read_modality_contract_quota_low(document, limit_event_kind.as_deref());

    Some(json!({
        "artifactPath": artifact_path,
        "source": if is_browser_control_contract {
            "browser_action_trace.modality_runtime_contract"
        } else if is_pdf_extract_contract {
            "pdf_read_skill_trace.modality_runtime_contract"
        } else if is_audio_task_artifact {
            "audio_task.modality_runtime_contract"
        } else if is_transcription_task_artifact {
            "transcription_task.modality_runtime_contract"
        } else if is_voice_generation_contract {
            "voice_generation_service_scene_trace.modality_runtime_contract"
        } else if is_web_research_contract {
            "web_research_skill_trace.modality_runtime_contract"
        } else if is_text_transform_contract {
            "text_transform_skill_trace.modality_runtime_contract"
        } else {
            "image_task.modality_runtime_contract"
        },
        "taskId": read_json_string(
            document,
            &[
                &["task_id"][..],
                &["taskId"][..],
                &["record", "task_id"][..],
                &["record", "taskId"][..],
            ],
        ),
        "taskType": task_type,
        "threadId": read_modality_contract_thread_id(document),
        "turnId": read_modality_contract_turn_id(document),
        "contentId": read_modality_contract_content_id(document),
        "status": read_json_string(
            document,
            &[
                &["status"][..],
                &["record", "status"][..],
            ],
        ),
        "normalizedStatus": normalized_status,
        "contractKey": contract_key,
        "contractMatchedExpected": is_image_generation_contract || is_browser_control_contract || is_pdf_extract_contract || is_voice_generation_contract || is_audio_transcription_contract || is_web_research_contract || is_text_transform_contract,
        "expectedRoutingSlot": if is_image_generation_contract {
            Some(IMAGE_GENERATION_ROUTING_SLOT)
        } else if is_browser_control_contract {
            Some(BROWSER_CONTROL_ROUTING_SLOT)
        } else if is_pdf_extract_contract {
            Some(PDF_EXTRACT_ROUTING_SLOT)
        } else if is_voice_generation_contract {
            Some(VOICE_GENERATION_ROUTING_SLOT)
        } else if is_audio_transcription_contract {
            Some(AUDIO_TRANSCRIPTION_ROUTING_SLOT)
        } else if is_web_research_contract {
            Some(WEB_RESEARCH_ROUTING_SLOT)
        } else if is_text_transform_contract {
            Some(TEXT_TRANSFORM_ROUTING_SLOT)
        } else {
            None
        },
        "entryKey": entry_key,
        "entrySource": entry_source,
        "modality": modality,
        "skillId": skill_id,
        "modelId": model_id,
        "executorKind": executor_kind,
        "executorBindingKey": executor_binding_key,
        "costState": cost_state,
        "limitState": limit_state,
        "estimatedCostClass": estimated_cost_class,
        "limitEventKind": limit_event_kind,
        "quotaLow": quota_low,
        "requiredCapabilities": read_json_string_array(
            document,
            &[
                &["required_capabilities"][..],
                &["requiredCapabilities"][..],
                &["payload", "required_capabilities"][..],
                &["payload", "requiredCapabilities"][..],
                &["record", "payload", "required_capabilities"][..],
                &["record", "payload", "requiredCapabilities"][..],
            ],
        ),
        "routingSlot": read_json_string(
            document,
            &[
                &["routing_slot"][..],
                &["routingSlot"][..],
                &["payload", "routing_slot"][..],
                &["payload", "routingSlot"][..],
                &["record", "payload", "routing_slot"][..],
                &["record", "payload", "routingSlot"][..],
            ],
        ),
        "executionProfileKey": extract_runtime_contract_execution_profile_key(document),
        "executorAdapterKey": extract_runtime_contract_executor_adapter_key(document),
        "limecorePolicyRefs": limecore_policy_refs,
        "limecorePolicySnapshot": limecore_policy_snapshot,
        "providerId": read_json_string(
            document,
            &[
                &["provider_id"][..],
                &["providerId"][..],
                &["preferred_provider_id"][..],
                &["preferredProviderId"][..],
                &["payload", "provider_id"][..],
                &["payload", "providerId"][..],
                &["payload", "preferred_provider_id"][..],
                &["payload", "preferredProviderId"][..],
                &["record", "payload", "provider_id"][..],
                &["record", "payload", "providerId"][..],
                &["record", "payload", "preferred_provider_id"][..],
                &["record", "payload", "preferredProviderId"][..],
            ],
        ),
        "model": model,
        "modelCapabilityAssessment": find_json_value_at_paths(
            document,
            &[
                &["model_capability_assessment"][..],
                &["modelCapabilityAssessment"][..],
                &["payload", "model_capability_assessment"][..],
                &["payload", "modelCapabilityAssessment"][..],
                &["record", "payload", "model_capability_assessment"][..],
                &["record", "payload", "modelCapabilityAssessment"][..],
            ],
        )
        .cloned(),
        "routingEvent": routing_event,
        "routingOutcome": routing_outcome,
        "failureCode": failure_code,
        "failureStage": failure_stage,
        "lastError": last_error,
        "audioOutput": if is_audio_task_artifact {
            extract_audio_output_snapshot(document)
        } else {
            None
        },
        "transcript": if is_transcription_task_artifact {
            extract_transcript_snapshot(document)
        } else {
            None
        },
        "runtimeContract": find_json_value_at_paths(
            document,
            &[
                &["runtime_contract"][..],
                &["runtimeContract"][..],
                &["payload", "runtime_contract"][..],
                &["payload", "runtimeContract"][..],
                &["record", "payload", "runtime_contract"][..],
                &["record", "payload", "runtimeContract"][..],
            ],
        )
        .cloned()
    }))
}

fn read_modality_contract_thread_id(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["thread_id"][..],
            &["threadId"][..],
            &["payload", "thread_id"][..],
            &["payload", "threadId"][..],
            &["record", "payload", "thread_id"][..],
            &["record", "payload", "threadId"][..],
            &["runtime_summary", "thread_id"][..],
            &["runtimeSummary", "threadId"][..],
            &["request_metadata", "harness", "thread_id"][..],
            &["requestMetadata", "harness", "threadId"][..],
        ],
    )
}

fn read_modality_contract_turn_id(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["turn_id"][..],
            &["turnId"][..],
            &["payload", "turn_id"][..],
            &["payload", "turnId"][..],
            &["record", "payload", "turn_id"][..],
            &["record", "payload", "turnId"][..],
            &["runtime_summary", "turn_id"][..],
            &["runtimeSummary", "turnId"][..],
            &["request_metadata", "harness", "turn_id"][..],
            &["requestMetadata", "harness", "turnId"][..],
        ],
    )
}

fn read_modality_contract_content_id(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["content_id"][..],
            &["contentId"][..],
            &["payload", "content_id"][..],
            &["payload", "contentId"][..],
            &["record", "payload", "content_id"][..],
            &["record", "payload", "contentId"][..],
            &["runtime_summary", "content_id"][..],
            &["runtimeSummary", "contentId"][..],
            &["request_metadata", "harness", "content_id"][..],
            &["requestMetadata", "harness", "contentId"][..],
        ],
    )
}

fn read_modality_contract_entry_source(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["entry_source"][..],
            &["entrySource"][..],
            &["payload", "entry_source"][..],
            &["payload", "entrySource"][..],
            &["record", "payload", "entry_source"][..],
            &["record", "payload", "entrySource"][..],
            &["request_metadata", "harness", "entry_source"][..],
            &["requestMetadata", "harness", "entrySource"][..],
        ],
    )
}

fn read_modality_contract_entry_key(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["entry_key"][..],
            &["entryKey"][..],
            &["payload", "entry_key"][..],
            &["payload", "entryKey"][..],
            &["record", "payload", "entry_key"][..],
            &["record", "payload", "entryKey"][..],
            &["request_metadata", "harness", "entry_key"][..],
            &["requestMetadata", "harness", "entryKey"][..],
        ],
    )
}

fn read_modality_contract_skill_id(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["skill_id"][..],
            &["skillId"][..],
            &["service_skill_id"][..],
            &["serviceSkillId"][..],
            &["payload", "skill_id"][..],
            &["payload", "skillId"][..],
            &["payload", "service_skill_id"][..],
            &["payload", "serviceSkillId"][..],
            &["record", "payload", "skill_id"][..],
            &["record", "payload", "skillId"][..],
            &["record", "payload", "service_skill_id"][..],
            &["record", "payload", "serviceSkillId"][..],
        ],
    )
}

fn read_modality_contract_model(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["model"][..],
            &["preferred_model_id"][..],
            &["preferredModelId"][..],
            &["payload", "model"][..],
            &["payload", "preferred_model_id"][..],
            &["payload", "preferredModelId"][..],
            &["record", "payload", "model"][..],
            &["record", "payload", "preferred_model_id"][..],
            &["record", "payload", "preferredModelId"][..],
        ],
    )
}

fn read_modality_contract_model_id(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["model_id"][..],
            &["modelId"][..],
            &["payload", "model_id"][..],
            &["payload", "modelId"][..],
            &["record", "payload", "model_id"][..],
            &["record", "payload", "modelId"][..],
        ],
    )
}

fn extract_runtime_contract_executor_kind(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["executor_kind"][..],
            &["executorKind"][..],
            &["payload", "executor_kind"][..],
            &["payload", "executorKind"][..],
            &["record", "payload", "executor_kind"][..],
            &["record", "payload", "executorKind"][..],
            &["runtime_contract", "executor_binding", "executor_kind"][..],
            &["runtimeContract", "executorBinding", "executorKind"][..],
            &[
                "payload",
                "runtime_contract",
                "executor_binding",
                "executor_kind",
            ][..],
            &[
                "payload",
                "runtimeContract",
                "executorBinding",
                "executorKind",
            ][..],
            &[
                "record",
                "payload",
                "runtime_contract",
                "executor_binding",
                "executor_kind",
            ][..],
            &[
                "record",
                "payload",
                "runtimeContract",
                "executorBinding",
                "executorKind",
            ][..],
        ],
    )
}

fn extract_runtime_contract_executor_binding_key(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["executor_binding_key"][..],
            &["executorBindingKey"][..],
            &["payload", "executor_binding_key"][..],
            &["payload", "executorBindingKey"][..],
            &["record", "payload", "executor_binding_key"][..],
            &["record", "payload", "executorBindingKey"][..],
            &["runtime_contract", "executor_binding", "binding_key"][..],
            &["runtimeContract", "executorBinding", "bindingKey"][..],
            &[
                "payload",
                "runtime_contract",
                "executor_binding",
                "binding_key",
            ][..],
            &[
                "payload",
                "runtimeContract",
                "executorBinding",
                "bindingKey",
            ][..],
            &[
                "record",
                "payload",
                "runtime_contract",
                "executor_binding",
                "binding_key",
            ][..],
            &[
                "record",
                "payload",
                "runtimeContract",
                "executorBinding",
                "bindingKey",
            ][..],
        ],
    )
}

fn read_modality_contract_cost_state(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["cost_state", "status"][..],
            &["costState", "status"][..],
            &["payload", "cost_state", "status"][..],
            &["payload", "costState", "status"][..],
            &["record", "payload", "cost_state", "status"][..],
            &["record", "payload", "costState", "status"][..],
            &["task_profile", "cost_state", "status"][..],
            &["taskProfile", "costState", "status"][..],
            &["payload", "task_profile", "cost_state", "status"][..],
            &["payload", "taskProfile", "costState", "status"][..],
            &["runtime_summary", "costStatus"][..],
            &["runtimeSummary", "costStatus"][..],
            &["cost_state"][..],
            &["costState"][..],
            &["payload", "cost_state"][..],
            &["payload", "costState"][..],
            &["record", "payload", "cost_state"][..],
            &["record", "payload", "costState"][..],
        ],
    )
}

fn read_modality_contract_estimated_cost_class(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["cost_state", "estimatedCostClass"][..],
            &["cost_state", "estimated_cost_class"][..],
            &["costState", "estimatedCostClass"][..],
            &["payload", "cost_state", "estimatedCostClass"][..],
            &["payload", "costState", "estimatedCostClass"][..],
            &["record", "payload", "cost_state", "estimatedCostClass"][..],
            &["record", "payload", "costState", "estimatedCostClass"][..],
            &["task_profile", "cost_state", "estimatedCostClass"][..],
            &["taskProfile", "costState", "estimatedCostClass"][..],
            &[
                "payload",
                "task_profile",
                "cost_state",
                "estimatedCostClass",
            ][..],
            &["payload", "taskProfile", "costState", "estimatedCostClass"][..],
            &["runtime_summary", "estimatedCostClass"][..],
            &["runtime_summary", "estimated_cost_class"][..],
            &["runtimeSummary", "estimatedCostClass"][..],
            &["estimated_cost_class"][..],
            &["estimatedCostClass"][..],
        ],
    )
}

fn read_modality_contract_limit_state(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["limit_state", "status"][..],
            &["limitState", "status"][..],
            &["payload", "limit_state", "status"][..],
            &["payload", "limitState", "status"][..],
            &["record", "payload", "limit_state", "status"][..],
            &["record", "payload", "limitState", "status"][..],
            &["task_profile", "limit_state", "status"][..],
            &["taskProfile", "limitState", "status"][..],
            &["payload", "task_profile", "limit_state", "status"][..],
            &["payload", "taskProfile", "limitState", "status"][..],
            &["runtime_summary", "limitStatus"][..],
            &["runtimeSummary", "limitStatus"][..],
            &["limit_state"][..],
            &["limitState"][..],
            &["payload", "limit_state"][..],
            &["payload", "limitState"][..],
            &["record", "payload", "limit_state"][..],
            &["record", "payload", "limitState"][..],
        ],
    )
}

fn read_modality_contract_limit_event_kind(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["limit_event", "eventKind"][..],
            &["limit_event", "event_kind"][..],
            &["limitEvent", "eventKind"][..],
            &["limit_state", "limit_event", "eventKind"][..],
            &["limitState", "limitEvent", "eventKind"][..],
            &["payload", "limit_event", "eventKind"][..],
            &["payload", "limitEvent", "eventKind"][..],
            &["payload", "limit_state", "limit_event", "eventKind"][..],
            &["payload", "limitState", "limitEvent", "eventKind"][..],
            &["record", "payload", "limit_event", "eventKind"][..],
            &["record", "payload", "limitEvent", "eventKind"][..],
            &["runtime_summary", "limitEventKind"][..],
            &["runtime_summary", "limit_event_kind"][..],
            &["runtimeSummary", "limitEventKind"][..],
        ],
    )
}

fn read_modality_contract_quota_low(
    document: &Value,
    limit_event_kind: Option<&str>,
) -> Option<bool> {
    read_json_bool(
        document,
        &[
            &["limit_event", "quotaLow"][..],
            &["limit_event", "quota_low"][..],
            &["limitEvent", "quotaLow"][..],
            &["payload", "limit_event", "quotaLow"][..],
            &["payload", "limitEvent", "quotaLow"][..],
            &["record", "payload", "limit_event", "quotaLow"][..],
            &["record", "payload", "limitEvent", "quotaLow"][..],
            &["runtime_summary", "quotaLow"][..],
            &["runtime_summary", "quota_low"][..],
            &["runtimeSummary", "quotaLow"][..],
        ],
    )
    .or_else(|| {
        limit_event_kind
            .map(|value| value.trim() == "quota_low")
            .filter(|value| *value)
    })
}

fn default_limecore_policy_refs_for_contract(contract_key: &str) -> &'static [&'static str] {
    match contract_key {
        IMAGE_GENERATION_CONTRACT_KEY => IMAGE_GENERATION_LIMECORE_POLICY_REFS,
        BROWSER_CONTROL_CONTRACT_KEY => BROWSER_CONTROL_LIMECORE_POLICY_REFS,
        PDF_EXTRACT_CONTRACT_KEY => PDF_EXTRACT_LIMECORE_POLICY_REFS,
        VOICE_GENERATION_CONTRACT_KEY => VOICE_GENERATION_LIMECORE_POLICY_REFS,
        AUDIO_TRANSCRIPTION_CONTRACT_KEY => AUDIO_TRANSCRIPTION_LIMECORE_POLICY_REFS,
        WEB_RESEARCH_CONTRACT_KEY => WEB_RESEARCH_LIMECORE_POLICY_REFS,
        TEXT_TRANSFORM_CONTRACT_KEY => TEXT_TRANSFORM_LIMECORE_POLICY_REFS,
        _ => &[],
    }
}

fn push_unique_text(values: &mut Vec<String>, candidates: Vec<String>) {
    for candidate in candidates {
        if values.iter().any(|value| value == &candidate) {
            continue;
        }
        values.push(candidate);
    }
}

fn read_limecore_policy_hit_ref(value: &Value) -> Option<String> {
    read_json_string(value, &[&["ref_key"][..], &["refKey"][..], &["ref"][..]])
}

fn read_limecore_policy_hit_status(value: &Value) -> Option<String> {
    read_json_string(value, &[&["status"][..]])
}

fn read_limecore_policy_hit_value_source(value: &Value) -> Option<String> {
    read_json_string(value, &[&["value_source"][..], &["valueSource"][..]])
}

fn limecore_policy_resolved_hit_refs(policy_value_hits: &Value) -> BTreeSet<String> {
    policy_value_hits
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter(|item| {
                    read_limecore_policy_hit_status(item).as_deref()
                        == Some(LIMECORE_POLICY_VALUE_HIT_STATUS_RESOLVED)
                })
                .filter_map(read_limecore_policy_hit_ref)
                .collect::<BTreeSet<_>>()
        })
        .unwrap_or_default()
}

fn limecore_policy_refs_without_resolved_hits(
    refs: &[String],
    resolved_hit_refs: &BTreeSet<String>,
) -> Vec<String> {
    refs.iter()
        .filter(|ref_key| !resolved_hit_refs.contains(*ref_key))
        .cloned()
        .collect()
}

fn build_limecore_policy_inputs_value(refs: &[String]) -> Value {
    build_limecore_policy_inputs_value_with_hits(refs, &json!([]))
}

fn build_limecore_policy_inputs_value_with_hits(
    refs: &[String],
    policy_value_hits: &Value,
) -> Value {
    let resolved_hit_refs = limecore_policy_resolved_hit_refs(policy_value_hits);
    Value::Array(
        refs.iter()
            .map(|policy_ref| {
                let resolved_hit = policy_value_hits.as_array().and_then(|items| {
                    items.iter().find(|item| {
                        resolved_hit_refs.contains(policy_ref)
                            && read_limecore_policy_hit_ref(item).as_deref()
                                == Some(policy_ref.as_str())
                    })
                });
                json!({
                    "ref_key": policy_ref,
                    "status": resolved_hit
                        .map(|_| LIMECORE_POLICY_INPUT_STATUS_RESOLVED)
                        .unwrap_or(LIMECORE_POLICY_INPUT_STATUS_DECLARED_ONLY),
                    "source": "modality_runtime_contract",
                    "value_source": resolved_hit
                        .and_then(read_limecore_policy_hit_value_source)
                        .unwrap_or_else(|| LIMECORE_POLICY_INPUT_VALUE_SOURCE_LIMECORE_PENDING.to_string()),
                })
            })
            .collect(),
    )
}

pub(crate) fn extract_runtime_contract_limecore_policy_refs(
    document: &Value,
    contract_key: &str,
) -> Vec<String> {
    let mut refs = Vec::new();
    push_unique_text(
        &mut refs,
        read_json_string_array(
            document,
            &[
                &["limecore_policy_refs"][..],
                &["limecorePolicyRefs"][..],
                &["runtime_contract", "limecore_policy_refs"][..],
                &["runtimeContract", "limecorePolicyRefs"][..],
                &["payload", "limecore_policy_refs"][..],
                &["payload", "limecorePolicyRefs"][..],
                &["payload", "runtime_contract", "limecore_policy_refs"][..],
                &["payload", "runtimeContract", "limecorePolicyRefs"][..],
                &["record", "payload", "limecore_policy_refs"][..],
                &["record", "payload", "limecorePolicyRefs"][..],
                &[
                    "record",
                    "payload",
                    "runtime_contract",
                    "limecore_policy_refs",
                ][..],
                &["record", "payload", "runtimeContract", "limecorePolicyRefs"][..],
            ],
        ),
    );
    push_unique_text(
        &mut refs,
        read_json_string_array(
            document,
            &[
                &["limecore_policy_snapshot", "refs"][..],
                &["limecorePolicySnapshot", "refs"][..],
                &["runtime_contract", "limecore_policy_snapshot", "refs"][..],
                &["runtimeContract", "limecorePolicySnapshot", "refs"][..],
                &["payload", "limecore_policy_snapshot", "refs"][..],
                &["payload", "limecorePolicySnapshot", "refs"][..],
                &[
                    "payload",
                    "runtime_contract",
                    "limecore_policy_snapshot",
                    "refs",
                ][..],
                &[
                    "payload",
                    "runtimeContract",
                    "limecorePolicySnapshot",
                    "refs",
                ][..],
                &["record", "payload", "limecore_policy_snapshot", "refs"][..],
                &["record", "payload", "limecorePolicySnapshot", "refs"][..],
                &[
                    "record",
                    "payload",
                    "runtime_contract",
                    "limecore_policy_snapshot",
                    "refs",
                ][..],
                &[
                    "record",
                    "payload",
                    "runtimeContract",
                    "limecorePolicySnapshot",
                    "refs",
                ][..],
            ],
        ),
    );

    if refs.is_empty() {
        refs.extend(
            default_limecore_policy_refs_for_contract(contract_key)
                .iter()
                .map(|value| (*value).to_string()),
        );
    }

    refs
}

pub(crate) fn extract_runtime_contract_limecore_policy_snapshot(
    document: &Value,
    refs: &[String],
) -> Option<Value> {
    if let Some(existing) = find_json_value_at_paths(
        document,
        &[
            &["limecore_policy_snapshot"][..],
            &["limecorePolicySnapshot"][..],
            &["runtime_contract", "limecore_policy_snapshot"][..],
            &["runtimeContract", "limecorePolicySnapshot"][..],
            &["payload", "limecore_policy_snapshot"][..],
            &["payload", "limecorePolicySnapshot"][..],
            &["payload", "runtime_contract", "limecore_policy_snapshot"][..],
            &["payload", "runtimeContract", "limecorePolicySnapshot"][..],
            &["record", "payload", "limecore_policy_snapshot"][..],
            &["record", "payload", "limecorePolicySnapshot"][..],
            &[
                "record",
                "payload",
                "runtime_contract",
                "limecore_policy_snapshot",
            ][..],
            &[
                "record",
                "payload",
                "runtimeContract",
                "limecorePolicySnapshot",
            ][..],
        ],
    )
    .filter(|value| value.is_object())
    {
        let mut snapshot = existing.clone();
        let policy_value_hits = snapshot
            .get("policy_value_hits")
            .or_else(|| snapshot.get("policyValueHits"))
            .filter(|value| value.is_array())
            .cloned()
            .unwrap_or_else(|| json!([]));
        let resolved_hit_refs = limecore_policy_resolved_hit_refs(&policy_value_hits);
        let pending_refs = limecore_policy_refs_without_resolved_hits(refs, &resolved_hit_refs);
        if let Some(object) = snapshot.as_object_mut() {
            object.entry("status".to_string()).or_insert_with(|| {
                Value::String(LIMECORE_POLICY_SNAPSHOT_STATUS_LOCAL_DEFAULTS_EVALUATED.to_string())
            });
            object
                .entry("decision".to_string())
                .or_insert_with(|| Value::String(LIMECORE_POLICY_DECISION_ALLOW.to_string()));
            object
                .entry("source".to_string())
                .or_insert_with(|| Value::String("modality_runtime_contract".to_string()));
            object
                .entry("decision_source".to_string())
                .or_insert_with(|| {
                    Value::String(LIMECORE_POLICY_DECISION_SOURCE_LOCAL_DEFAULT.to_string())
                });
            object
                .entry("decision_scope".to_string())
                .or_insert_with(|| {
                    Value::String(LIMECORE_POLICY_DECISION_SCOPE_LOCAL_DEFAULTS_ONLY.to_string())
                });
            object
                .entry("decision_reason".to_string())
                .or_insert_with(|| {
                    Value::String(LIMECORE_POLICY_DECISION_REASON_NO_LOCAL_DENY.to_string())
                });
            if !object.contains_key("refs") {
                object.insert("refs".to_string(), json!(refs));
            }
            if !object.contains_key("evaluated_refs") {
                object.insert(
                    "evaluated_refs".to_string(),
                    json!(resolved_hit_refs.iter().cloned().collect::<Vec<_>>()),
                );
            }
            if !object.contains_key("unresolved_refs") {
                object.insert("unresolved_refs".to_string(), json!(pending_refs.clone()));
            }
            if !object.contains_key("missing_inputs") {
                object.insert("missing_inputs".to_string(), json!(pending_refs.clone()));
            }
            if !object.contains_key("policy_inputs") {
                object.insert(
                    "policy_inputs".to_string(),
                    build_limecore_policy_inputs_value_with_hits(refs, &policy_value_hits),
                );
            }
            if !object.contains_key("pending_hit_refs") {
                object.insert("pending_hit_refs".to_string(), json!(pending_refs.clone()));
            }
            if !object.contains_key("policy_value_hits") {
                object.insert("policy_value_hits".to_string(), policy_value_hits.clone());
            }
            if !object.contains_key("policy_value_hit_count") {
                object.insert(
                    "policy_value_hit_count".to_string(),
                    json!(policy_value_hits
                        .as_array()
                        .map(Vec::len)
                        .unwrap_or_default()),
                );
            }
        }
        return Some(snapshot);
    }

    if refs.is_empty() {
        return None;
    }

    Some(json!({
        "status": LIMECORE_POLICY_SNAPSHOT_STATUS_LOCAL_DEFAULTS_EVALUATED,
        "decision": LIMECORE_POLICY_DECISION_ALLOW,
        "source": "modality_runtime_contract",
        "decision_source": LIMECORE_POLICY_DECISION_SOURCE_LOCAL_DEFAULT,
        "decision_scope": LIMECORE_POLICY_DECISION_SCOPE_LOCAL_DEFAULTS_ONLY,
        "decision_reason": LIMECORE_POLICY_DECISION_REASON_NO_LOCAL_DENY,
        "refs": refs,
        "evaluated_refs": [],
        "unresolved_refs": refs,
        "missing_inputs": refs,
        "policy_inputs": build_limecore_policy_inputs_value(refs),
        "pending_hit_refs": refs,
        "policy_value_hits": [],
        "policy_value_hit_count": 0,
    }))
}

fn extract_runtime_contract_execution_profile_key(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["execution_profile_key"][..],
            &["executionProfileKey"][..],
            &["execution_profile", "profile_key"][..],
            &["executionProfile", "profileKey"][..],
            &["runtime_contract", "execution_profile", "profile_key"][..],
            &["runtime_contract", "executionProfile", "profileKey"][..],
            &["runtimeContract", "execution_profile", "profile_key"][..],
            &["runtimeContract", "executionProfile", "profileKey"][..],
            &["payload", "execution_profile_key"][..],
            &["payload", "executionProfileKey"][..],
            &[
                "payload",
                "runtime_contract",
                "execution_profile",
                "profile_key",
            ][..],
            &[
                "payload",
                "runtimeContract",
                "execution_profile",
                "profile_key",
            ][..],
            &[
                "payload",
                "runtimeContract",
                "executionProfile",
                "profileKey",
            ][..],
            &["record", "payload", "execution_profile_key"][..],
            &["record", "payload", "executionProfileKey"][..],
            &[
                "record",
                "payload",
                "runtime_contract",
                "execution_profile",
                "profile_key",
            ][..],
            &[
                "record",
                "payload",
                "runtimeContract",
                "execution_profile",
                "profile_key",
            ][..],
            &[
                "record",
                "payload",
                "runtimeContract",
                "executionProfile",
                "profileKey",
            ][..],
        ],
    )
}

fn extract_runtime_contract_executor_adapter_key(document: &Value) -> Option<String> {
    read_json_string(
        document,
        &[
            &["executor_adapter_key"][..],
            &["executorAdapterKey"][..],
            &["executor_adapter", "adapter_key"][..],
            &["executorAdapter", "adapterKey"][..],
            &["runtime_contract", "executor_adapter", "adapter_key"][..],
            &["runtime_contract", "executorAdapter", "adapterKey"][..],
            &["runtimeContract", "executor_adapter", "adapter_key"][..],
            &["runtimeContract", "executorAdapter", "adapterKey"][..],
            &["payload", "executor_adapter_key"][..],
            &["payload", "executorAdapterKey"][..],
            &[
                "payload",
                "runtime_contract",
                "executor_adapter",
                "adapter_key",
            ][..],
            &[
                "payload",
                "runtimeContract",
                "executor_adapter",
                "adapter_key",
            ][..],
            &[
                "payload",
                "runtimeContract",
                "executorAdapter",
                "adapterKey",
            ][..],
            &["record", "payload", "executor_adapter_key"][..],
            &["record", "payload", "executorAdapterKey"][..],
            &[
                "record",
                "payload",
                "runtime_contract",
                "executor_adapter",
                "adapter_key",
            ][..],
            &[
                "record",
                "payload",
                "runtimeContract",
                "executor_adapter",
                "adapter_key",
            ][..],
            &[
                "record",
                "payload",
                "runtimeContract",
                "executorAdapter",
                "adapterKey",
            ][..],
        ],
    )
}

fn is_modality_contract_routing_failure_code(code: &str) -> bool {
    matches!(
        code.trim(),
        "image_generation_contract_mismatch"
            | "image_generation_capability_gap"
            | "image_generation_routing_slot_mismatch"
            | "image_generation_model_capability_gap"
    )
}

fn is_modality_runtime_preflight_failure_code(code: &str) -> bool {
    let normalized = code.trim();
    normalized.ends_with("_execution_profile_missing")
        || normalized.ends_with("_execution_profile_mismatch")
        || normalized.ends_with("_executor_adapter_missing")
        || normalized.ends_with("_executor_adapter_mismatch")
        || normalized.ends_with("_executor_binding_missing")
        || normalized.ends_with("_executor_binding_mismatch")
}
