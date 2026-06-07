//! automation-owned Managed Objective 的 completion audit 策略解析。
//!
//! 这里只解析自动化任务 payload 中已经声明的审计策略，不创建新的调度器或证据实体。

use serde_json::{Map, Value};

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(super) struct AutomationObjectiveCompletionPolicy {
    required_successes: Option<u32>,
    failure_block_after: Option<u32>,
    evidence_pack_ref: Option<String>,
    artifact_refs: Vec<String>,
    blocked_user_prompt: Option<String>,
}

impl AutomationObjectiveCompletionPolicy {
    pub(super) fn from_job_payload(payload: &Value) -> Self {
        let Some(managed_objective) = managed_objective_object(payload) else {
            return Self::default();
        };
        let Some(audit) = completion_audit_object(managed_objective) else {
            return Self::default();
        };

        Self {
            required_successes: positive_u32_field(
                audit,
                &[
                    "required_successes",
                    "requiredSuccesses",
                    "consecutive_successes",
                    "consecutiveSuccesses",
                ],
            ),
            failure_block_after: positive_u32_field(
                audit,
                &["failure_block_after", "failureBlockAfter"],
            ),
            evidence_pack_ref: string_field(audit, &["evidence_pack_ref", "evidencePackRef"]),
            artifact_refs: string_array_field(audit, &["artifact_refs", "artifactRefs"]),
            blocked_user_prompt: string_field(
                audit,
                &[
                    "blocked_user_prompt",
                    "blockedUserPrompt",
                    "blocker_reason",
                    "blockerReason",
                ],
            ),
        }
    }

    pub(super) fn required_successes(&self) -> Option<u32> {
        self.required_successes
    }

    pub(super) fn failure_block_after(&self) -> Option<u32> {
        self.failure_block_after
    }

    pub(super) fn evidence_pack_ref(&self) -> Option<&str> {
        self.evidence_pack_ref.as_deref()
    }

    pub(super) fn artifact_refs(&self) -> Vec<String> {
        self.artifact_refs.clone()
    }

    pub(super) fn blocked_user_prompt(&self) -> Option<&str> {
        self.blocked_user_prompt.as_deref()
    }

    pub(super) fn has_completion_evidence_refs(&self) -> bool {
        self.evidence_pack_ref.is_some() || !self.artifact_refs.is_empty()
    }
}

fn managed_objective_object(payload: &Value) -> Option<&Map<String, Value>> {
    payload
        .get("request_metadata")
        .or_else(|| payload.get("requestMetadata"))?
        .as_object()?
        .get("harness")?
        .as_object()?
        .get("managed_objective")
        .or_else(|| {
            payload
                .get("request_metadata")
                .or_else(|| payload.get("requestMetadata"))
                .and_then(Value::as_object)
                .and_then(|metadata| metadata.get("harness"))
                .and_then(Value::as_object)
                .and_then(|harness| harness.get("managedObjective"))
        })?
        .as_object()
}

fn completion_audit_object(managed_objective: &Map<String, Value>) -> Option<&Map<String, Value>> {
    managed_objective
        .get("completion_audit_detail")
        .or_else(|| managed_objective.get("completionAuditDetail"))
        .or_else(|| managed_objective.get("completion_audit"))
        .or_else(|| managed_objective.get("completionAudit"))
        .and_then(Value::as_object)
}

fn positive_u32_field(object: &Map<String, Value>, keys: &[&str]) -> Option<u32> {
    keys.iter()
        .find_map(|key| object.get(*key))
        .and_then(|value| {
            value
                .as_u64()
                .or_else(|| {
                    value
                        .as_str()
                        .and_then(|text| text.trim().parse::<u64>().ok())
                })
                .and_then(|number| u32::try_from(number).ok())
        })
        .filter(|value| *value > 0)
}

fn string_field(object: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| object.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn string_array_field(object: &Map<String, Value>, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .find_map(|key| object.get(*key).and_then(Value::as_array))
        .map(|values| {
            values
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_completion_audit_detail_policy() {
        let policy = AutomationObjectiveCompletionPolicy::from_job_payload(&json!({
            "kind": "agent_turn",
            "request_metadata": {
                "harness": {
                    "managed_objective": {
                        "completion_audit_detail": {
                            "required_successes": 7,
                            "failure_block_after": "2",
                            "evidence_pack_ref": ".lime/harness/daily-report/evidence-pack",
                            "artifact_refs": ["reports/daily-trends.md", " "],
                            "blocked_user_prompt": "请检查自动化配置后重试"
                        }
                    }
                }
            }
        }));

        assert_eq!(policy.required_successes(), Some(7));
        assert_eq!(policy.failure_block_after(), Some(2));
        assert_eq!(
            policy.evidence_pack_ref(),
            Some(".lime/harness/daily-report/evidence-pack")
        );
        assert_eq!(policy.artifact_refs(), vec!["reports/daily-trends.md"]);
        assert_eq!(policy.blocked_user_prompt(), Some("请检查自动化配置后重试"));
    }

    #[test]
    fn parses_object_completion_audit_before_projection_preserves_detail() {
        let policy = AutomationObjectiveCompletionPolicy::from_job_payload(&json!({
            "kind": "agent_turn",
            "request_metadata": {
                "harness": {
                    "managed_objective": {
                        "completion_audit": {
                            "requiredSuccesses": 3,
                            "artifactRefs": ["reports/current.md"]
                        }
                    }
                }
            }
        }));

        assert_eq!(policy.required_successes(), Some(3));
        assert_eq!(policy.artifact_refs(), vec!["reports/current.md"]);
    }
}
