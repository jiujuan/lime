use crate::ExecutionRequest;
use crate::RuntimeEvent;
use lime_agent::agent_tools::tool_orchestrator::ToolExecutionOutcome;
use serde_json::{json, Value};
use std::collections::HashMap;

use super::request_context::{
    self, AsterChatRequestSnapshot, RuntimeModelSelection, RuntimeSessionScope,
};

const WORKSPACE_PATCH_HOST_SEARCH_EVENT_SOURCE: &str = "content_factory_search_requests";
const ARTICLE_WORKFLOW_KEY: &str = "content_article_workflow";

#[derive(Debug, Clone)]
pub(super) struct WorkspacePatchHostSearchPlan {
    pub(super) requests: Vec<WorkspacePatchHostSearchRequest>,
}

#[derive(Debug, Clone)]
pub(super) struct WorkspacePatchHostSearchRequest {
    pub(super) id: String,
    pub(super) round_id: Option<String>,
    pub(super) connector_ref: Option<String>,
    pub(super) purpose: Option<String>,
    pub(super) query: String,
    pub(super) tool_id: String,
}

impl WorkspacePatchHostSearchPlan {
    pub(super) fn from_events(events: &[RuntimeEvent]) -> Option<Self> {
        let patch = workspace_patch_from_events(events)?;
        let requests = workspace_patch_article_search_requests(&patch)
            .into_iter()
            .enumerate()
            .filter_map(|(index, value)| WorkspacePatchHostSearchRequest::from_value(index, value))
            .collect::<Vec<_>>();
        (!requests.is_empty()).then_some(Self { requests })
    }
}

impl WorkspacePatchHostSearchRequest {
    fn from_value(index: usize, value: Value) -> Option<Self> {
        let query = value_string(&value, &["query"])?.to_string();
        let id = value_string(&value, &["id"])
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("search-request-{}", index + 1));
        let round_id = value_string(&value, &["roundId", "round_id"]).map(ToString::to_string);
        let connector_ref =
            value_string(&value, &["connectorRef", "connector_ref"]).map(ToString::to_string);
        let purpose = value_string(&value, &["purpose"]).map(ToString::to_string);
        Some(Self {
            tool_id: format!("content-factory-web-search-{}", sanitize_tool_id(&id)),
            id,
            round_id,
            connector_ref,
            purpose,
            query,
        })
    }
}

pub(super) fn workspace_patch_host_search_turn_context(
    request: &ExecutionRequest,
    host_request: Option<&AsterChatRequestSnapshot>,
    scope: &RuntimeSessionScope,
    selection: &RuntimeModelSelection,
    config_metadata: Option<Value>,
) -> aster::session::TurnContextOverride {
    let mut context = request_context::turn_context_from_request(
        request,
        host_request,
        scope,
        selection,
        config_metadata,
    )
    .unwrap_or_default();
    context
        .metadata
        .insert("web_search_enabled".to_string(), json!(true));
    context
        .metadata
        .insert("webSearchEnabled".to_string(), json!(true));
    context.user_visible_input_text = Some(request.input.text.clone());
    context
}

pub(super) fn enrich_workspace_patch_host_search_tool_event(event: &mut RuntimeEvent) {
    if !matches!(
        event.event_type.as_str(),
        "tool.started" | "tool.args" | "tool.result" | "tool.failed"
    ) {
        return;
    }
    let Some(payload) = event.payload.as_object_mut() else {
        return;
    };
    payload.insert(
        "source".to_string(),
        Value::String(WORKSPACE_PATCH_HOST_SEARCH_EVENT_SOURCE.to_string()),
    );
    payload.insert(
        "workflowKey".to_string(),
        Value::String(ARTICLE_WORKFLOW_KEY.to_string()),
    );
    payload.insert(
        "workflow_key".to_string(),
        Value::String(ARTICLE_WORKFLOW_KEY.to_string()),
    );
    let metadata = payload
        .entry("metadata")
        .or_insert_with(|| json!({}))
        .as_object_mut();
    let Some(metadata) = metadata else {
        return;
    };
    metadata.insert(
        "source".to_string(),
        Value::String(WORKSPACE_PATCH_HOST_SEARCH_EVENT_SOURCE.to_string()),
    );
    metadata.insert(
        "workflowKey".to_string(),
        Value::String(ARTICLE_WORKFLOW_KEY.to_string()),
    );
    metadata.insert(
        "workflow_key".to_string(),
        Value::String(ARTICLE_WORKFLOW_KEY.to_string()),
    );
}

pub(super) fn build_workspace_patch_host_search_evidence(
    requests: &[WorkspacePatchHostSearchRequest],
    outcomes: &[ToolExecutionOutcome],
) -> Vec<Value> {
    let outcomes_by_tool_id = outcomes
        .iter()
        .map(|outcome| (outcome.tool_id.as_str(), outcome))
        .collect::<HashMap<_, _>>();
    requests
        .iter()
        .filter_map(|request| {
            let outcome = outcomes_by_tool_id.get(request.tool_id.as_str())?;
            Some(json!({
                "id": format!("host-search-evidence-{}", sanitize_tool_id(&request.id)),
                "requestId": request.id,
                "roundId": request.round_id,
                "connectorRef": request.connector_ref,
                "tool": "WebSearch",
                "toolCallId": outcome.tool_id,
                "status": if outcome.success { "completed" } else { "failed" },
                "query": request.query,
                "purpose": request.purpose,
                "summary": workspace_patch_search_output_summary(&outcome.output),
                "output": outcome.output,
                "error": outcome.error,
                "metadata": outcome.metadata,
                "confidence": if outcome.success { "host_verified" } else { "needs_review" },
            }))
        })
        .collect()
}

pub(super) fn update_workspace_patch_host_search_artifact_events(
    events: &mut [RuntimeEvent],
    search_evidence: &[Value],
) {
    for event in events {
        if event.event_type != "artifact.snapshot" {
            continue;
        }
        let Some(artifact) = event.payload.get_mut("artifact") else {
            continue;
        };
        let Some(metadata) = artifact.get_mut("metadata").and_then(Value::as_object_mut) else {
            continue;
        };
        let patch = if let Some(patch) = metadata.get_mut("contentFactoryWorkspacePatch") {
            patch
        } else if let Some(patch) = metadata.get_mut("workspace_patch") {
            patch
        } else {
            continue;
        };
        update_workspace_patch_search_evidence(patch, search_evidence);
        if let Some(content) = serde_json::to_string(patch).ok() {
            artifact
                .as_object_mut()
                .map(|object| object.insert("content".to_string(), Value::String(content)));
        }
    }
}

fn workspace_patch_from_events(events: &[RuntimeEvent]) -> Option<Value> {
    events.iter().find_map(|event| {
        if event.event_type != "artifact.snapshot" {
            return None;
        }
        let artifact = event.payload.get("artifact")?;
        artifact
            .get("metadata")
            .and_then(|metadata| metadata.get("contentFactoryWorkspacePatch"))
            .cloned()
            .or_else(|| artifact.get("contentFactoryWorkspacePatch").cloned())
            .or_else(|| {
                artifact
                    .get("metadata")
                    .and_then(|metadata| metadata.get("workspace_patch"))
                    .cloned()
            })
    })
}

fn workspace_patch_article_search_requests(patch: &Value) -> Vec<Value> {
    patch
        .get("objects")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|object| value_string(object, &["kind"]).is_none_or(|kind| kind == "articleDraft"))
        .filter(|object| article_object_kind(object).as_deref() == Some("articleDraft"))
        .filter_map(|object| object.get("source"))
        .filter_map(|source| source.get("searchRequests").and_then(Value::as_array))
        .flat_map(|requests| requests.iter().cloned())
        .collect()
}

fn update_workspace_patch_search_evidence(patch: &mut Value, search_evidence: &[Value]) {
    let evidence = Value::Array(search_evidence.to_vec());
    let host_search_status = if search_evidence
        .iter()
        .all(|evidence| evidence.get("status").and_then(Value::as_str) == Some("completed"))
    {
        "completed"
    } else if search_evidence
        .iter()
        .all(|evidence| evidence.get("status").and_then(Value::as_str) == Some("failed"))
    {
        "failed"
    } else {
        "partial"
    };
    let Some(objects) = patch.get_mut("objects").and_then(Value::as_array_mut) else {
        return;
    };
    for object in objects {
        let Some(kind) = article_object_kind(object) else {
            continue;
        };
        if kind != "articleDraft" && kind != "imageGenerationSet" {
            continue;
        }
        {
            let Some(source) = object.get_mut("source").and_then(Value::as_object_mut) else {
                continue;
            };
            source.insert("searchEvidence".to_string(), evidence.clone());
            source.insert("hostSearchEvidence".to_string(), evidence.clone());
            source.insert("hostSearchStatus".to_string(), json!(host_search_status));
        }
        if kind == "articleDraft" && host_search_status == "failed" {
            if let Some(object_map) = object.as_object_mut() {
                object_map.insert("status".to_string(), json!("failed"));
                object_map.insert(
                    "summary".to_string(),
                    json!("检索失败，文章草稿未达到可交付状态"),
                );
            }
        }
    }
}

fn workspace_patch_search_output_summary(output: &str) -> String {
    let normalized = output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(8)
        .collect::<Vec<_>>()
        .join("\n");
    if normalized.chars().count() <= 1_200 {
        normalized
    } else {
        normalized.chars().take(1_200).collect::<String>()
    }
}

fn article_object_kind(object: &Value) -> Option<String> {
    value_string(object, &["kind"])
        .map(ToString::to_string)
        .or_else(|| {
            object
                .get("ref")
                .or_else(|| object.get("objectRef"))
                .and_then(|reference| value_string(reference, &["kind"]))
                .map(ToString::to_string)
        })
}

fn value_string<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| value.get(*key))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn sanitize_tool_id(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect::<String>();
    sanitized.trim_matches('-').to_string()
}
