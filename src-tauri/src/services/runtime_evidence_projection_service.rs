//! Runtime evidence 投影辅助服务。
//!
//! 这里只提取运行时事件 / timeline metadata 中已经存在的 evidence 引用，
//! 不负责导出 Evidence Pack，也不伪造新的 evidence 事实。

use serde_json::{json, Value};
use std::collections::HashSet;

#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct RuntimeEvidenceProjectionSummary {
    pub(crate) evidence_refs: Vec<String>,
    pub(crate) verification_outcomes: Vec<Value>,
}

impl RuntimeEvidenceProjectionSummary {
    pub(crate) fn push_evidence_ref(&mut self, value: impl Into<String>) {
        let value = value.into();
        let normalized = value.trim();
        if normalized.is_empty() || self.evidence_refs.iter().any(|item| item == normalized) {
            return;
        }
        self.evidence_refs.push(normalized.to_string());
    }

    fn push_verification_outcome(&mut self, value: Value) {
        if value.is_null() {
            return;
        }
        self.verification_outcomes.push(value);
    }
}

pub(crate) fn collect_runtime_evidence_projection_summary_from_value(
    value: &Value,
) -> RuntimeEvidenceProjectionSummary {
    let mut summary = RuntimeEvidenceProjectionSummary::default();
    let mut visited = HashSet::new();
    collect_from_value(value, &mut summary, &mut visited);
    summary
}

pub(crate) fn collect_runtime_evidence_projection_summary_from_metadata(
    metadata: Option<&Value>,
) -> RuntimeEvidenceProjectionSummary {
    metadata
        .map(collect_runtime_evidence_projection_summary_from_value)
        .unwrap_or_default()
}

pub(crate) fn evidence_ref_from_artifact_path(path: &str) -> Option<String> {
    let normalized = path.trim();
    if normalized.is_empty() {
        return None;
    }
    let normalized_path = normalized.replace('\\', "/");
    if normalized_path.contains("/evidence/")
        || normalized_path.contains("/controlled-get-evidence/")
        || normalized_path.contains("/controlled_get_evidence/")
    {
        return Some(normalized.to_string());
    }
    None
}

fn normalize_key(key: &str) -> String {
    key.chars()
        .filter(|character| *character != '_' && *character != '-')
        .flat_map(char::to_lowercase)
        .collect()
}

fn is_single_evidence_ref_key(key: &str) -> bool {
    matches!(
        normalize_key(key).as_str(),
        "evidenceref" | "evidencepackref" | "packref"
    )
}

fn is_many_evidence_refs_key(key: &str) -> bool {
    matches!(
        normalize_key(key).as_str(),
        "evidencerefs" | "evidencepackrefs" | "packrefs"
    )
}

fn is_single_verification_outcome_key(key: &str) -> bool {
    matches!(
        normalize_key(key).as_str(),
        "verificationoutcome" | "evidenceverificationoutcome"
    )
}

fn is_many_verification_outcomes_key(key: &str) -> bool {
    matches!(
        normalize_key(key).as_str(),
        "verificationoutcomes" | "evidenceverificationoutcomes"
    )
}

fn collect_evidence_refs(value: &Value, summary: &mut RuntimeEvidenceProjectionSummary) {
    match value {
        Value::String(value) => summary.push_evidence_ref(value.clone()),
        Value::Array(items) => {
            for item in items {
                collect_evidence_refs(item, summary);
            }
        }
        Value::Object(object) => {
            for (key, value) in object {
                if is_single_evidence_ref_key(key) || is_many_evidence_refs_key(key) {
                    collect_evidence_refs(value, summary);
                }
            }
        }
        _ => {}
    }
}

fn collect_verification_outcomes(value: &Value, summary: &mut RuntimeEvidenceProjectionSummary) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_verification_outcomes(item, summary);
            }
        }
        Value::String(value) => {
            let normalized = value.trim();
            if !normalized.is_empty() {
                summary.push_verification_outcome(json!({ "status": normalized }));
            }
        }
        Value::Object(_) => summary.push_verification_outcome(value.clone()),
        _ => {}
    }
}

fn collect_from_value(
    value: &Value,
    summary: &mut RuntimeEvidenceProjectionSummary,
    visited: &mut HashSet<usize>,
) {
    let address = value as *const Value as usize;
    if !visited.insert(address) {
        return;
    }

    match value {
        Value::Object(object) => {
            for (key, item) in object {
                if is_single_evidence_ref_key(key) || is_many_evidence_refs_key(key) {
                    collect_evidence_refs(item, summary);
                }
                if is_single_verification_outcome_key(key) || is_many_verification_outcomes_key(key)
                {
                    collect_verification_outcomes(item, summary);
                }
                collect_from_value(item, summary, visited);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_from_value(item, summary, visited);
            }
        }
        _ => {}
    }
}
