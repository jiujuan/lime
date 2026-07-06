use std::collections::{HashMap, HashSet};

use crate::protocol::{
    AgentContextBudget, AgentMissingContextFact, AgentRetrievalRef, AgentTeamMemoryRef,
    AgentTurnContextSummary,
};
use crate::turn_context_configuration::AgentTurnContext;

fn read_object_string(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn read_object_u32(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<u32> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_u64)
        .and_then(|value| u32::try_from(value).ok())
}

fn read_object_i64(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<i64> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(|value| {
            value
                .as_i64()
                .or_else(|| value.as_u64().and_then(|value| i64::try_from(value).ok()))
        })
}

fn read_object_bool(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<bool> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_bool)
}

fn read_object_f64(
    object: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<f64> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_f64)
}

fn metadata_object<'a>(
    metadata: &'a HashMap<String, serde_json::Value>,
    keys: &[&str],
) -> Option<&'a serde_json::Map<String, serde_json::Value>> {
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(serde_json::Value::as_object)
}

fn nested_object<'a>(
    object: &'a serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<&'a serde_json::Map<String, serde_json::Value>> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_object)
}

fn nested_array<'a>(
    object: &'a serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<&'a Vec<serde_json::Value>> {
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(serde_json::Value::as_array)
}

fn read_nested_u32(
    object: &serde_json::Map<String, serde_json::Value>,
    object_keys: &[&str],
    value_keys: &[&str],
) -> Option<u32> {
    object_keys
        .iter()
        .filter_map(|key| object.get(*key))
        .filter_map(serde_json::Value::as_object)
        .find_map(|nested| read_object_u32(nested, value_keys))
}

fn build_context_budget_from_object(
    object: &serde_json::Map<String, serde_json::Value>,
) -> Option<AgentContextBudget> {
    let budget = AgentContextBudget {
        used_tokens: read_object_u32(object, &["used_tokens", "usedTokens"]),
        max_tokens: read_object_u32(
            object,
            &["max_tokens", "maxTokens", "token_limit", "tokenLimit"],
        ),
        remaining_tokens: read_object_i64(object, &["remaining_tokens", "remainingTokens"]),
        status: read_object_string(object, &["status"]),
        source: read_object_string(object, &["source"]),
    };

    if budget.used_tokens.is_none()
        && budget.max_tokens.is_none()
        && budget.remaining_tokens.is_none()
        && budget.status.is_none()
        && budget.source.is_none()
    {
        None
    } else {
        Some(budget)
    }
}

fn read_lime_runtime_context_usage_tokens(
    runtime: &serde_json::Map<String, serde_json::Value>,
    policy: Option<&serde_json::Map<String, serde_json::Value>>,
) -> Option<u32> {
    let token_keys = &[
        "active_context_tokens",
        "activeContextTokens",
        "used_tokens",
        "usedTokens",
        "total_tokens",
        "totalTokens",
    ];
    policy
        .and_then(|policy| read_object_u32(policy, token_keys))
        .or_else(|| read_object_u32(runtime, token_keys))
        .or_else(|| {
            read_nested_u32(
                runtime,
                &[
                    "context_usage",
                    "contextUsage",
                    "history_usage",
                    "historyUsage",
                    "token_usage",
                    "tokenUsage",
                ],
                token_keys,
            )
        })
}

fn build_context_budget_from_lime_runtime(
    runtime: &serde_json::Map<String, serde_json::Value>,
    active_context_tokens: Option<u32>,
) -> Option<AgentContextBudget> {
    let policy = nested_object(runtime, &["context_policy", "contextPolicy"]);
    let model_context_window = policy
        .and_then(|policy| read_object_u32(policy, &["model_context_window", "modelContextWindow"]))
        .or_else(|| read_object_u32(runtime, &["model_context_window", "modelContextWindow"]))
        .filter(|value| *value > 0);
    let auto_compact_token_limit = policy
        .and_then(|policy| {
            read_object_u32(
                policy,
                &["auto_compact_token_limit", "autoCompactTokenLimit"],
            )
        })
        .or_else(|| {
            read_object_u32(
                runtime,
                &["auto_compact_token_limit", "autoCompactTokenLimit"],
            )
        })
        .filter(|value| *value > 0);
    let auto_compact_enabled =
        read_object_bool(runtime, &["auto_compact", "autoCompact"]).unwrap_or(true);
    let max_tokens = if auto_compact_enabled {
        match (model_context_window, auto_compact_token_limit) {
            (Some(model_window), Some(compact_limit)) => Some(model_window.min(compact_limit)),
            (Some(model_window), None) => Some(model_window),
            (None, Some(compact_limit)) => Some(compact_limit),
            (None, None) => None,
        }
    } else {
        model_context_window.or(auto_compact_token_limit)
    };
    let used_tokens =
        active_context_tokens.or_else(|| read_lime_runtime_context_usage_tokens(runtime, policy));
    let remaining_tokens = max_tokens
        .zip(used_tokens)
        .map(|(max_tokens, used_tokens)| (i64::from(max_tokens) - i64::from(used_tokens)).max(0));
    let source = policy
        .and_then(|policy| read_object_string(policy, &["source"]))
        .or_else(|| read_object_string(runtime, &["source"]))
        .unwrap_or_else(|| "model_request_policy".to_string());
    let status = match (auto_compact_enabled, max_tokens, used_tokens) {
        (false, _, _) => "auto_compact_disabled",
        (true, Some(max_tokens), Some(used_tokens)) if used_tokens >= max_tokens => {
            "auto_compact_due"
        }
        _ => "ready",
    };

    if max_tokens.is_none() && used_tokens.is_none() && remaining_tokens.is_none() {
        return None;
    }

    Some(AgentContextBudget {
        used_tokens,
        max_tokens,
        remaining_tokens,
        status: Some(status.to_string()),
        source: Some(source),
    })
}

fn extract_lime_runtime_object(
    metadata: &HashMap<String, serde_json::Value>,
) -> Option<&serde_json::Map<String, serde_json::Value>> {
    metadata_object(metadata, &["lime_runtime", "limeRuntime"])
}

pub(crate) fn project_runtime_context_budget_with_active_context_tokens(
    turn_context: Option<&AgentTurnContext>,
    active_context_tokens: Option<u32>,
) -> Option<AgentContextBudget> {
    let metadata = &turn_context?.metadata;
    extract_lime_runtime_object(metadata)
        .and_then(|runtime| build_context_budget_from_lime_runtime(runtime, active_context_tokens))
}

fn build_missing_context_from_object(
    object: &serde_json::Map<String, serde_json::Value>,
    index: usize,
) -> Option<AgentMissingContextFact> {
    let label = read_object_string(object, &["label", "title", "path", "id"])
        .unwrap_or_else(|| format!("missing_context:{index}"));
    Some(AgentMissingContextFact {
        id: read_object_string(object, &["id"]),
        kind: read_object_string(object, &["kind"]).unwrap_or_else(|| "context".to_string()),
        label,
        status: read_object_string(object, &["status"]).unwrap_or_else(|| "unknown".to_string()),
        reason: read_object_string(object, &["reason", "message", "detail"]),
        source: read_object_string(object, &["source"]),
    })
}

fn build_retrieval_ref_from_object(
    object: &serde_json::Map<String, serde_json::Value>,
    index: usize,
) -> Option<AgentRetrievalRef> {
    let source_id = read_object_string(object, &["source_id", "sourceId", "id"])
        .or_else(|| read_object_string(object, &["path", "url"]))
        .unwrap_or_else(|| format!("retrieval_ref:{index}"));
    Some(AgentRetrievalRef {
        source_id,
        kind: read_object_string(object, &["kind"]).unwrap_or_else(|| "context".to_string()),
        title: read_object_string(object, &["title", "label", "name"]),
        path: read_object_string(
            object,
            &[
                "path",
                "file_path",
                "filePath",
                "relative_path",
                "relativePath",
            ],
        ),
        url: read_object_string(object, &["url"]),
        score: read_object_f64(object, &["score"]),
        scope: read_object_string(object, &["scope"]),
        status: read_object_string(object, &["status"]),
        source: read_object_string(object, &["source"]),
    })
}

fn build_team_memory_ref_from_object(
    object: &serde_json::Map<String, serde_json::Value>,
    repo_scope: Option<String>,
    index: usize,
) -> Option<AgentTeamMemoryRef> {
    let key = read_object_string(object, &["key", "id", "label"])?;
    Some(AgentTeamMemoryRef {
        key,
        repo_scope: read_object_string(object, &["repo_scope", "repoScope"]).or(repo_scope),
        updated_at: read_object_i64(object, &["updated_at", "updatedAt"]),
        priority: read_object_u32(object, &["priority"]).or_else(|| u32::try_from(index).ok()),
        source: read_object_string(object, &["source"])
            .or_else(|| Some("team_memory_shadow".to_string())),
    })
}

fn extract_agentui_context_object(
    metadata: &HashMap<String, serde_json::Value>,
) -> Option<&serde_json::Map<String, serde_json::Value>> {
    metadata_object(metadata, &["agentui_context", "agentUiContext"]).or_else(|| {
        metadata_object(metadata, &["harness"])
            .and_then(|harness| nested_object(harness, &["agentui_context", "agentUiContext"]))
    })
}

fn extract_team_memory_shadow_object(
    metadata: &HashMap<String, serde_json::Value>,
) -> Option<&serde_json::Map<String, serde_json::Value>> {
    metadata_object(metadata, &["team_memory_shadow", "teamMemoryShadow"]).or_else(|| {
        metadata_object(metadata, &["harness"])
            .and_then(|harness| nested_object(harness, &["team_memory_shadow", "teamMemoryShadow"]))
    })
}

pub(crate) fn project_turn_context_summary(
    turn_context: Option<&AgentTurnContext>,
) -> Option<AgentTurnContextSummary> {
    project_turn_context_summary_with_active_context_tokens(turn_context, None)
}

pub(crate) fn project_turn_context_summary_with_active_context_tokens(
    turn_context: Option<&AgentTurnContext>,
    active_context_tokens: Option<u32>,
) -> Option<AgentTurnContextSummary> {
    let turn_context = turn_context?;
    let metadata = &turn_context.metadata;
    let agentui_context = extract_agentui_context_object(metadata);
    let mut summary = AgentTurnContextSummary::default();

    if let Some(context) = agentui_context {
        summary.memory_budget = nested_object(
            context,
            &[
                "memory_budget",
                "memoryBudget",
                "context_budget",
                "contextBudget",
            ],
        )
        .and_then(build_context_budget_from_object);
    }

    if summary.memory_budget.is_none() {
        summary.memory_budget = project_runtime_context_budget_with_active_context_tokens(
            Some(turn_context),
            active_context_tokens,
        );
    }

    if let Some(context) = agentui_context {
        if let Some(items) = nested_array(context, &["missing_context", "missingContext"]) {
            summary
                .missing_context
                .extend(items.iter().enumerate().filter_map(|(index, value)| {
                    value
                        .as_object()
                        .and_then(|object| build_missing_context_from_object(object, index))
                }));
        }

        if let Some(items) = nested_array(context, &["retrieval_refs", "retrievalRefs"]) {
            summary
                .retrieval_refs
                .extend(items.iter().enumerate().filter_map(|(index, value)| {
                    value
                        .as_object()
                        .and_then(|object| build_retrieval_ref_from_object(object, index))
                }));
        }

        if let Some(items) = nested_array(context, &["team_memory_refs", "teamMemoryRefs"]) {
            summary
                .team_memory_refs
                .extend(items.iter().enumerate().filter_map(|(index, value)| {
                    value
                        .as_object()
                        .and_then(|object| build_team_memory_ref_from_object(object, None, index))
                }));
        }
    }

    if let Some(shadow) = extract_team_memory_shadow_object(metadata) {
        let repo_scope = read_object_string(shadow, &["repo_scope", "repoScope"]);
        if let Some(entries) = nested_array(shadow, &["entries"]) {
            summary
                .team_memory_refs
                .extend(entries.iter().enumerate().filter_map(|(index, value)| {
                    value.as_object().and_then(|object| {
                        build_team_memory_ref_from_object(object, repo_scope.clone(), index)
                    })
                }));
        }
    }

    let mut seen_retrieval_refs = HashSet::new();
    summary
        .retrieval_refs
        .retain(|item| seen_retrieval_refs.insert(item.source_id.clone()));
    let mut seen_team_memory_refs = HashSet::new();
    summary.team_memory_refs.retain(|item| {
        seen_team_memory_refs.insert(format!(
            "{}:{}",
            item.repo_scope.as_deref().unwrap_or_default(),
            item.key
        ))
    });

    if summary.memory_budget.is_none()
        && summary.missing_context.is_empty()
        && summary.retrieval_refs.is_empty()
        && summary.team_memory_refs.is_empty()
    {
        None
    } else {
        Some(summary)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::turn_context_configuration::AgentTurnContext;
    use serde_json::json;
    use std::collections::HashMap;

    fn turn_context_with_metadata(
        metadata: HashMap<String, serde_json::Value>,
    ) -> AgentTurnContext {
        AgentTurnContext {
            metadata,
            ..AgentTurnContext::default()
        }
    }

    #[test]
    fn lime_runtime_context_policy_projects_context_budget_when_agentui_budget_missing() {
        let summary =
            project_turn_context_summary(Some(&turn_context_with_metadata(HashMap::from([(
                "lime_runtime".to_string(),
                json!({
                    "context_policy": {
                        "source": "model_request_policy",
                        "model_context_window": 50_000,
                        "auto_compact_token_limit": 90_000
                    }
                }),
            )]))))
            .expect("context summary");

        let budget = summary.memory_budget.expect("model context budget");
        assert_eq!(budget.max_tokens, Some(50_000));
        assert_eq!(budget.remaining_tokens, None);
        assert_eq!(budget.status.as_deref(), Some("ready"));
        assert_eq!(budget.source.as_deref(), Some("model_request_policy"));
    }

    #[test]
    fn lime_runtime_context_policy_uses_auto_compact_limit_when_tighter() {
        let summary =
            project_turn_context_summary(Some(&turn_context_with_metadata(HashMap::from([(
                "lime_runtime".to_string(),
                json!({
                    "context_policy": {
                        "model_context_window": 100_000,
                        "auto_compact_token_limit": 90_000,
                        "active_context_tokens": 88_000
                    }
                }),
            )]))))
            .expect("context summary");

        let budget = summary.memory_budget.expect("model context budget");
        assert_eq!(budget.used_tokens, Some(88_000));
        assert_eq!(budget.max_tokens, Some(90_000));
        assert_eq!(budget.remaining_tokens, Some(2_000));
    }

    #[test]
    fn lime_runtime_context_budget_reads_history_usage_from_runtime_usage_owner() {
        let summary =
            project_turn_context_summary(Some(&turn_context_with_metadata(HashMap::from([(
                "lime_runtime".to_string(),
                json!({
                    "context_policy": {
                        "model_context_window": 100_000,
                        "auto_compact_token_limit": 90_000
                    },
                    "context_usage": {
                        "source": "session_token_usage",
                        "total_tokens": 91_000
                    }
                }),
            )]))))
            .expect("context summary");

        let budget = summary.memory_budget.expect("model context budget");
        assert_eq!(budget.used_tokens, Some(91_000));
        assert_eq!(budget.max_tokens, Some(90_000));
        assert_eq!(budget.remaining_tokens, Some(0));
        assert_eq!(budget.status.as_deref(), Some("auto_compact_due"));
        assert_eq!(budget.source.as_deref(), Some("model_request_policy"));
    }

    #[test]
    fn lime_runtime_context_budget_accepts_runtime_usage_handoff_argument() {
        let context = turn_context_with_metadata(HashMap::from([(
            "lime_runtime".to_string(),
            json!({
                "context_policy": {
                    "model_context_window": 100_000,
                    "auto_compact_token_limit": 90_000
                }
            }),
        )]));
        let summary =
            project_turn_context_summary_with_active_context_tokens(Some(&context), Some(91_000))
                .expect("context summary");

        let budget = summary.memory_budget.expect("model context budget");
        assert_eq!(budget.used_tokens, Some(91_000));
        assert_eq!(budget.max_tokens, Some(90_000));
        assert_eq!(budget.remaining_tokens, Some(0));
        assert_eq!(budget.status.as_deref(), Some("auto_compact_due"));
    }

    #[test]
    fn lime_runtime_context_policy_marks_disabled_auto_compact_as_full_context_budget() {
        let summary =
            project_turn_context_summary(Some(&turn_context_with_metadata(HashMap::from([(
                "lime_runtime".to_string(),
                json!({
                    "auto_compact": false,
                    "context_policy": {
                        "model_context_window": 120_000,
                        "auto_compact_token_limit": 90_000
                    }
                }),
            )]))))
            .expect("context summary");

        let budget = summary.memory_budget.expect("model context budget");
        assert_eq!(budget.max_tokens, Some(120_000));
        assert_eq!(budget.status.as_deref(), Some("auto_compact_disabled"));
    }

    #[test]
    fn explicit_agentui_context_budget_wins_over_lime_runtime_context_policy() {
        let summary =
            project_turn_context_summary(Some(&turn_context_with_metadata(HashMap::from([
                (
                    "agentui_context".to_string(),
                    json!({
                        "memory_budget": {
                            "used_tokens": 640,
                            "max_tokens": 1_200,
                            "status": "ready",
                            "source": "knowledge_context_resolver"
                        }
                    }),
                ),
                (
                    "lime_runtime".to_string(),
                    json!({
                        "context_policy": {
                            "model_context_window": 50_000,
                            "auto_compact_token_limit": 45_000
                        }
                    }),
                ),
            ]))))
            .expect("context summary");

        let budget = summary.memory_budget.expect("agentui context budget");
        assert_eq!(budget.used_tokens, Some(640));
        assert_eq!(budget.max_tokens, Some(1_200));
        assert_eq!(budget.source.as_deref(), Some("knowledge_context_resolver"));
    }
}
