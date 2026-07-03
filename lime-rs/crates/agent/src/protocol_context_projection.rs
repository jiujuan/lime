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
    let metadata = &turn_context?.metadata;
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
