//! Runtime evidence 投影辅助服务。
//!
//! 这里只提取运行时事件 / timeline metadata 中已经存在的 evidence 引用，
//! 不负责导出 Evidence Pack，也不伪造新的 evidence 事实。

use serde_json::{json, Value};
use std::collections::HashSet;

const LIME_TOOL_METADATA_BEGIN: &str = "[Lime 工具元数据开始]";
const LIME_TOOL_METADATA_END: &str = "[Lime 工具元数据结束]";

#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct RuntimeEvidenceProjectionSummary {
    pub(crate) evidence_refs: Vec<String>,
    pub(crate) verification_outcomes: Vec<Value>,
}

impl RuntimeEvidenceProjectionSummary {
    pub(crate) fn push_evidence_ref(&mut self, value: impl Into<String>) {
        let value = value.into();
        let normalized = value.trim();
        if normalized.is_empty()
            || is_redacted_placeholder(normalized)
            || self.evidence_refs.iter().any(|item| item == normalized)
        {
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

fn is_redacted_placeholder(value: &str) -> bool {
    value.starts_with("[redacted:") && value.ends_with(']')
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

pub(crate) fn collect_runtime_evidence_projection_summary_from_tool_output(
    output: Option<&str>,
) -> RuntimeEvidenceProjectionSummary {
    let Some(output) = output else {
        return RuntimeEvidenceProjectionSummary::default();
    };

    let mut summary = RuntimeEvidenceProjectionSummary::default();
    let mut rest = output;
    while let Some(begin_index) = rest.find(LIME_TOOL_METADATA_BEGIN) {
        let after_begin = &rest[begin_index + LIME_TOOL_METADATA_BEGIN.len()..];
        let Some(end_index) = after_begin.find(LIME_TOOL_METADATA_END) else {
            break;
        };
        let metadata_block = after_begin[..end_index].trim();
        if let Ok(value) = serde_json::from_str::<Value>(metadata_block) {
            let block_summary = collect_runtime_evidence_projection_summary_from_value(&value);
            merge_summary(&mut summary, block_summary);
        }
        rest = &after_begin[end_index + LIME_TOOL_METADATA_END.len()..];
    }
    summary
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
            if let Some(reference) = object.get("ref").and_then(Value::as_str) {
                summary.push_evidence_ref(reference.to_string());
            }
            for (key, value) in object {
                if is_single_evidence_ref_key(key) || is_many_evidence_refs_key(key) {
                    collect_evidence_refs(value, summary);
                }
            }
        }
        _ => {}
    }
}

fn merge_summary(
    target: &mut RuntimeEvidenceProjectionSummary,
    source: RuntimeEvidenceProjectionSummary,
) {
    for evidence_ref in source.evidence_refs {
        target.push_evidence_ref(evidence_ref);
    }
    target
        .verification_outcomes
        .extend(source.verification_outcomes);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collects_structured_connector_evidence_refs() {
        let summary = collect_runtime_evidence_projection_summary_from_value(&json!({
            "result": {
                "evidenceRef": "[redacted:host_owned_evidence]",
                "evidenceRefs": [
                    {
                        "kind": "connector_fixture_mutation_log",
                        "ref": "fixture://connector/lime_fixture/recordMutation/mutation-1",
                        "storage": "workspace_local",
                        "relativePath": ".lime/agent-app-connectors/fixture/mutations.jsonl"
                    }
                ]
            }
        }));

        assert_eq!(
            summary.evidence_refs,
            vec!["fixture://connector/lime_fixture/recordMutation/mutation-1"]
        );
    }

    #[test]
    fn collects_evidence_refs_from_bounded_tool_output_metadata() {
        let output = format!(
            "工具输出正文\n{begin}\n{{\"result\":{{\"evidenceRefs\":[\"[redacted:host_owned_evidence]\",{{\"ref\":\"outbox://connector/notion/createPage/live-1\",\"storage\":\"workspace_local\"}}],\"verificationOutcomes\":[{{\"status\":\"passed\"}}]}}}}\n{end}\nignore\n{begin}\nnot json\n{end}\n{begin}\n{{\"evidenceRef\":\"fixture://connector/lime_fixture/recordMutation/mutation-2\"}}\n{end}",
            begin = LIME_TOOL_METADATA_BEGIN,
            end = LIME_TOOL_METADATA_END
        );

        let summary =
            collect_runtime_evidence_projection_summary_from_tool_output(Some(output.as_str()));

        assert_eq!(
            summary.evidence_refs,
            vec![
                "outbox://connector/notion/createPage/live-1".to_string(),
                "fixture://connector/lime_fixture/recordMutation/mutation-2".to_string()
            ]
        );
        assert_eq!(
            summary
                .verification_outcomes
                .first()
                .and_then(|outcome| outcome.get("status"))
                .and_then(Value::as_str),
            Some("passed")
        );
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
