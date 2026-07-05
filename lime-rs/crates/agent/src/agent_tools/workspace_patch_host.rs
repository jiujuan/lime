use crate::agent_tools::tool_orchestrator::{PlannedToolExecution, ToolExecutionOutcome};
use crate::agent_tools::workspace_patch_runtime_adapter::{
    execute_workspace_patch_runtime_tool_batch, WorkspacePatchRuntimeToolBatchInput,
};
use crate::AgentRuntimeState;
use crate::AgentTurnContext;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;

pub const WORKSPACE_PATCH_HOST_TOOL_EVENT_SOURCE: &str = "workspace_patch_host_tool_requests";

const LEGACY_ARTICLE_WORKFLOW_KEY: &str = "content_article_workflow";
const WEB_SEARCH_TOOL_NAME: &str = "WebSearch";

#[derive(Debug, Clone)]
pub struct WorkspacePatchHostToolPlan {
    pub requests: Vec<WorkspacePatchHostToolRequest>,
}

#[derive(Debug, Clone)]
pub struct WorkspacePatchHostToolRequest {
    pub id: String,
    pub round_id: Option<String>,
    pub connector_ref: Option<String>,
    pub purpose: Option<String>,
    pub query: Option<String>,
    pub tool_name: String,
    pub tool_id: String,
    pub arguments: String,
    pub params: Value,
    pub workflow_key: Option<String>,
}

#[derive(Debug, Clone)]
pub struct WorkspacePatchHostToolExecutionInput {
    pub session_id: String,
    pub working_directory: PathBuf,
    pub turn_context: Option<AgentTurnContext>,
    pub parallelism: usize,
}

#[derive(Debug, Clone)]
pub struct WorkspacePatchHostToolExecutionResult {
    pub events: Vec<crate::protocol::AgentEvent>,
    pub host_tool_evidence: Vec<Value>,
}

impl WorkspacePatchHostToolPlan {
    pub fn from_patch(patch: &Value) -> Option<Self> {
        let requests = workspace_patch_host_tool_request_candidates(patch)
            .into_iter()
            .enumerate()
            .filter_map(|(index, candidate)| {
                WorkspacePatchHostToolRequest::from_candidate(index, candidate)
            })
            .collect::<Vec<_>>();
        (!requests.is_empty()).then_some(Self { requests })
    }

    pub fn planned_tools(&self) -> Vec<PlannedToolExecution> {
        self.requests
            .iter()
            .map(WorkspacePatchHostToolRequest::to_planned_tool_execution)
            .collect()
    }
}

pub async fn execute_workspace_patch_host_tool_plan(
    agent_state: &AgentRuntimeState,
    plan: &WorkspacePatchHostToolPlan,
    input: WorkspacePatchHostToolExecutionInput,
) -> Result<WorkspacePatchHostToolExecutionResult, String> {
    let batch = execute_workspace_patch_runtime_tool_batch(
        agent_state,
        WorkspacePatchRuntimeToolBatchInput {
            session_id: input.session_id,
            working_directory: input.working_directory,
            turn_context: input.turn_context,
            parallelism: input.parallelism,
        },
        plan.planned_tools(),
    )
    .await?;
    let host_tool_evidence =
        build_workspace_patch_host_tool_evidence(&plan.requests, batch.outcomes.as_slice());

    Ok(WorkspacePatchHostToolExecutionResult {
        events: batch.events,
        host_tool_evidence,
    })
}

impl WorkspacePatchHostToolRequest {
    pub fn to_planned_tool_execution(&self) -> PlannedToolExecution {
        PlannedToolExecution {
            tool_name: self.tool_name.clone(),
            tool_id: self.tool_id.clone(),
            arguments: Some(self.arguments.clone()),
            params: self.params.clone(),
        }
    }

    fn from_candidate(
        index: usize,
        candidate: WorkspacePatchHostToolRequestCandidate,
    ) -> Option<Self> {
        let value = candidate.value;
        let request_query = value_string(&value, &["query"]).map(ToString::to_string);
        let tool_name = value_string(&value, &["toolName", "tool_name", "tool"])
            .map(ToString::to_string)
            .unwrap_or_else(|| WEB_SEARCH_TOOL_NAME.to_string());
        if tool_name != WEB_SEARCH_TOOL_NAME {
            return None;
        }
        let mut params = host_tool_params_from_value(&value, request_query.as_deref())?;
        let query = value_string(&params, &["query"]).map(ToString::to_string);
        if query.is_none() {
            return None;
        }
        if let (Some(params_object), Some(query)) = (params.as_object_mut(), query.as_deref()) {
            params_object
                .entry("query".to_string())
                .or_insert_with(|| Value::String(query.to_string()));
        }
        let arguments = serde_json::to_string(&params).ok()?;
        let id = value_string(&value, &["id"])
            .map(ToString::to_string)
            .unwrap_or_else(|| format!("host-tool-request-{}", index + 1));
        let round_id = value_string(&value, &["roundId", "round_id"]).map(ToString::to_string);
        let connector_ref =
            value_string(&value, &["connectorRef", "connector_ref"]).map(ToString::to_string);
        let purpose = value_string(&value, &["purpose"]).map(ToString::to_string);
        let workflow_key = value_string(&value, &["workflowKey", "workflow_key"])
            .map(ToString::to_string)
            .or(candidate.workflow_key);
        let tool_id = format!(
            "workspace-patch-host-tool-{}-{}",
            sanitize_tool_id(&tool_name.to_ascii_lowercase()),
            sanitize_tool_id(&id)
        );
        Some(Self {
            id,
            round_id,
            connector_ref,
            purpose,
            query,
            tool_name: tool_name.clone(),
            tool_id,
            arguments,
            params,
            workflow_key,
        })
    }
}

pub fn enrich_workspace_patch_host_tool_payload(
    payload: &mut Value,
    requests: &[WorkspacePatchHostToolRequest],
) {
    let workflow_key = payload_tool_call_id(payload)
        .and_then(|tool_call_id| {
            requests
                .iter()
                .find(|request| request.tool_id == tool_call_id)
        })
        .and_then(|request| request.workflow_key.as_deref())
        .map(ToString::to_string);
    let Some(payload) = payload.as_object_mut() else {
        return;
    };
    payload.insert(
        "source".to_string(),
        Value::String(WORKSPACE_PATCH_HOST_TOOL_EVENT_SOURCE.to_string()),
    );
    if let Some(workflow_key) = workflow_key.as_deref() {
        payload.insert(
            "workflowKey".to_string(),
            Value::String(workflow_key.to_string()),
        );
        payload.insert(
            "workflow_key".to_string(),
            Value::String(workflow_key.to_string()),
        );
    }
    let metadata = payload
        .entry("metadata".to_string())
        .or_insert_with(|| json!({}))
        .as_object_mut();
    let Some(metadata) = metadata else {
        return;
    };
    metadata.insert(
        "source".to_string(),
        Value::String(WORKSPACE_PATCH_HOST_TOOL_EVENT_SOURCE.to_string()),
    );
    if let Some(workflow_key) = workflow_key {
        metadata.insert(
            "workflowKey".to_string(),
            Value::String(workflow_key.clone()),
        );
        metadata.insert("workflow_key".to_string(), Value::String(workflow_key));
    }
}

pub fn build_workspace_patch_host_tool_evidence(
    requests: &[WorkspacePatchHostToolRequest],
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
                "id": format!("host-tool-evidence-{}", sanitize_tool_id(&request.id)),
                "requestId": request.id,
                "roundId": request.round_id,
                "connectorRef": request.connector_ref,
                "tool": request.tool_name,
                "toolName": request.tool_name,
                "toolCallId": outcome.tool_id,
                "source": WORKSPACE_PATCH_HOST_TOOL_EVENT_SOURCE,
                "workflowKey": request.workflow_key,
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

pub fn update_workspace_patch_with_host_tool_evidence(
    patch: &mut Value,
    host_tool_evidence: &[Value],
) {
    let evidence = Value::Array(host_tool_evidence.to_vec());
    let host_tool_status = if host_tool_evidence
        .iter()
        .all(|evidence| evidence.get("status").and_then(Value::as_str) == Some("completed"))
    {
        "completed"
    } else if host_tool_evidence
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
    let only_web_search_evidence = host_tool_evidence
        .iter()
        .all(|evidence| evidence.get("tool").and_then(Value::as_str) == Some(WEB_SEARCH_TOOL_NAME));
    for object in objects {
        let Some(kind) = article_object_kind(object) else {
            continue;
        };
        let has_host_tool_request = object
            .get("source")
            .is_some_and(source_has_host_tool_request);
        if !has_host_tool_request && kind != "articleDraft" && kind != "imageGenerationSet" {
            continue;
        }
        {
            let Some(source) = object.get_mut("source").and_then(Value::as_object_mut) else {
                continue;
            };
            source.insert("hostToolEvidence".to_string(), evidence.clone());
            source.insert("hostToolStatus".to_string(), json!(host_tool_status));
            if only_web_search_evidence {
                source.insert("searchEvidence".to_string(), evidence.clone());
                source.insert("hostSearchEvidence".to_string(), evidence.clone());
                source.insert("hostSearchStatus".to_string(), json!(host_tool_status));
            }
        }
        if kind == "articleDraft" && host_tool_status == "failed" {
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

#[derive(Debug, Clone)]
struct WorkspacePatchHostToolRequestCandidate {
    value: Value,
    workflow_key: Option<String>,
}

fn workspace_patch_host_tool_request_candidates(
    patch: &Value,
) -> Vec<WorkspacePatchHostToolRequestCandidate> {
    let patch_workflow_key = workflow_key_from_value(patch);
    let mut candidates = Vec::new();
    push_host_tool_request_candidates(&mut candidates, patch, patch_workflow_key.clone(), false);

    for object in patch
        .get("objects")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let object_workflow_key = workflow_key_from_value(object).or_else(|| {
            object
                .get("source")
                .and_then(workflow_key_from_value)
                .or_else(|| patch_workflow_key.clone())
        });
        if let Some(source) = object.get("source") {
            push_host_tool_request_candidates(
                &mut candidates,
                source,
                object_workflow_key.clone(),
                false,
            );
            if article_object_kind(object).as_deref() == Some("articleDraft") {
                push_host_tool_request_candidates(
                    &mut candidates,
                    source,
                    object_workflow_key
                        .clone()
                        .or_else(|| Some(LEGACY_ARTICLE_WORKFLOW_KEY.to_string())),
                    true,
                );
            }
        }
    }
    candidates
}

fn push_host_tool_request_candidates(
    candidates: &mut Vec<WorkspacePatchHostToolRequestCandidate>,
    value: &Value,
    workflow_key: Option<String>,
    legacy_search_requests: bool,
) {
    let request_keys = if legacy_search_requests {
        &["searchRequests"][..]
    } else {
        &["hostToolRequests", "host_tool_requests"][..]
    };
    for request in request_keys
        .iter()
        .filter_map(|key| value.get(*key))
        .filter_map(Value::as_array)
        .flat_map(|requests| requests.iter().cloned())
    {
        candidates.push(WorkspacePatchHostToolRequestCandidate {
            value: request,
            workflow_key: workflow_key.clone(),
        });
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

fn host_tool_params_from_value(value: &Value, request_query: Option<&str>) -> Option<Value> {
    let mut params = value
        .get("params")
        .or_else(|| value.get("arguments"))
        .or_else(|| value.get("args"))
        .cloned()
        .unwrap_or_else(|| json!({}));
    if let Some(params_string) = params.as_str() {
        params = serde_json::from_str(params_string)
            .unwrap_or_else(|_| json!({ "query": params_string }));
    }
    if !params.is_object() {
        params = json!({});
    }
    if let Some(query) = request_query {
        if let Some(params_object) = params.as_object_mut() {
            params_object
                .entry("query".to_string())
                .or_insert_with(|| Value::String(query.to_string()));
        }
    }
    params
        .as_object()
        .is_some_and(|object| object.contains_key("query"))
        .then_some(params)
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

fn workflow_key_from_value(value: &Value) -> Option<String> {
    value_string(value, &["workflowKey", "workflow_key", "workflow"]).map(ToString::to_string)
}

fn source_has_host_tool_request(source: &Value) -> bool {
    ["hostToolRequests", "host_tool_requests", "searchRequests"]
        .iter()
        .any(|key| {
            source
                .get(*key)
                .and_then(Value::as_array)
                .is_some_and(|items| !items.is_empty())
        })
}

fn payload_tool_call_id(payload: &Value) -> Option<&str> {
    payload
        .get("toolCallId")
        .or_else(|| payload.get("tool_id"))
        .and_then(Value::as_str)
        .or_else(|| {
            payload
                .get("runtimeEvent")
                .and_then(|runtime_event| {
                    runtime_event
                        .get("tool_id")
                        .or_else(|| runtime_event.get("toolCallId"))
                })
                .and_then(Value::as_str)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_tools::tool_orchestrator::ToolExecutionOutcome;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn reads_host_tool_requests_from_workspace_patch_source() {
        let patch = json!({
            "objects": [
                {
                    "ref": { "kind": "articleDraft" },
                    "source": {
                        "workflowKey": "content_article_workflow",
                        "hostToolRequests": [
                            {
                                "id": "research-query-1",
                                "toolName": "WebSearch",
                                "params": { "query": "Lime 写文章" },
                                "purpose": "验证依据"
                            }
                        ]
                    }
                }
            ]
        });

        let plan = WorkspacePatchHostToolPlan::from_patch(&patch).expect("host tool plan");

        assert_eq!(plan.requests.len(), 1);
        assert_eq!(plan.requests[0].tool_name, WEB_SEARCH_TOOL_NAME);
        assert_eq!(plan.requests[0].query.as_deref(), Some("Lime 写文章"));
        assert_eq!(
            plan.requests[0].workflow_key.as_deref(),
            Some("content_article_workflow")
        );
        assert_eq!(plan.requests[0].params["query"], "Lime 写文章");
    }

    #[test]
    fn reads_legacy_article_search_requests_as_host_tool_requests() {
        let patch = json!({
            "objects": [
                {
                    "ref": { "kind": "articleDraft" },
                    "source": {
                        "searchRequests": [
                            {
                                "id": "search-request-1",
                                "query": "Lime 写文章",
                                "purpose": "历史检索请求"
                            }
                        ]
                    }
                }
            ]
        });

        let plan = WorkspacePatchHostToolPlan::from_patch(&patch).expect("host tool plan");

        assert_eq!(plan.requests.len(), 1);
        assert_eq!(plan.requests[0].tool_name, WEB_SEARCH_TOOL_NAME);
        assert_eq!(plan.requests[0].query.as_deref(), Some("Lime 写文章"));
        assert_eq!(
            plan.requests[0].workflow_key.as_deref(),
            Some(LEGACY_ARTICLE_WORKFLOW_KEY)
        );
    }

    #[test]
    fn workspace_patch_host_evidence_updates_article_search_fields_on_success() {
        let mut patch = article_workspace_patch_with_host_search_request();
        let plan = WorkspacePatchHostToolPlan::from_patch(&patch).expect("host tool plan");
        let evidence = build_workspace_patch_host_tool_evidence(
            &plan.requests,
            &[tool_outcome(
                &plan.requests[0],
                true,
                "session=session-1 query=Lime 写文章 result=found",
                None,
            )],
        );

        update_workspace_patch_with_host_tool_evidence(&mut patch, &evidence);

        let source = &patch["objects"][0]["source"];
        let search_evidence = source["searchEvidence"]
            .as_array()
            .expect("search evidence");
        assert_eq!(search_evidence.len(), 1);
        assert_eq!(search_evidence[0]["tool"], "WebSearch");
        assert_eq!(search_evidence[0]["status"], "completed");
        assert_eq!(
            search_evidence[0]["summary"],
            "session=session-1 query=Lime 写文章 result=found"
        );
        assert_eq!(source["hostSearchStatus"], "completed");
        assert_eq!(source["hostToolStatus"], "completed");
        assert_eq!(
            source["hostSearchEvidence"],
            Value::Array(search_evidence.clone())
        );
        assert_eq!(
            source["hostToolEvidence"],
            Value::Array(search_evidence.clone())
        );
    }

    #[test]
    fn workspace_patch_host_evidence_marks_article_failed_on_tool_failure() {
        let mut patch = article_workspace_patch_with_host_search_request();
        let plan = WorkspacePatchHostToolPlan::from_patch(&patch).expect("host tool plan");
        let evidence = build_workspace_patch_host_tool_evidence(
            &plan.requests,
            &[tool_outcome(
                &plan.requests[0],
                false,
                "",
                Some("web search unavailable"),
            )],
        );

        update_workspace_patch_with_host_tool_evidence(&mut patch, &evidence);

        let source = &patch["objects"][0]["source"];
        let search_evidence = source["searchEvidence"]
            .as_array()
            .expect("search evidence");
        assert_eq!(search_evidence.len(), 1);
        assert_eq!(search_evidence[0]["tool"], "WebSearch");
        assert_eq!(search_evidence[0]["status"], "failed");
        assert_eq!(search_evidence[0]["summary"], "");
        assert_eq!(source["hostSearchStatus"], "failed");
        assert_eq!(source["hostToolStatus"], "failed");
        assert_eq!(
            source["hostSearchEvidence"],
            Value::Array(search_evidence.clone())
        );
        assert_eq!(
            source["hostToolEvidence"],
            Value::Array(search_evidence.clone())
        );
        assert_eq!(patch["objects"][0]["status"], "failed");
        assert_eq!(
            patch["objects"][0]["summary"],
            "检索失败，文章草稿未达到可交付状态"
        );
    }

    fn article_workspace_patch_with_host_search_request() -> Value {
        json!({
            "schemaVersion": 1,
            "appId": "content-factory-app",
            "sessionId": "session-1",
            "objects": [
                {
                    "ref": {
                        "appId": "content-factory-app",
                        "kind": "articleDraft",
                        "id": "article-draft-1",
                        "sessionId": "session-1"
                    },
                    "title": "公众号文章草稿",
                    "status": "ready",
                    "source": {
                        "taskKind": "content.article.generate",
                        "taskId": "task-article-draft-1",
                        "documentText": "# 草稿\n\n正文。",
                        "finalMarkdown": "# 草稿\n\n正文。",
                        "workflowKey": "content_article_workflow",
                        "hostToolRequests": [
                            {
                                "id": "host-tool-request-1",
                                "toolName": "WebSearch",
                                "query": "Lime 写文章",
                                "params": {
                                    "query": "Lime 写文章"
                                },
                                "purpose": "验证宿主真实检索回填"
                            }
                        ]
                    }
                }
            ]
        })
    }

    fn tool_outcome(
        request: &WorkspacePatchHostToolRequest,
        success: bool,
        output: &str,
        error: Option<&str>,
    ) -> ToolExecutionOutcome {
        ToolExecutionOutcome {
            tool_name: request.tool_name.clone(),
            tool_id: request.tool_id.clone(),
            success,
            output: output.to_string(),
            error: error.map(ToString::to_string),
            metadata: Some(HashMap::from([(
                "source".to_string(),
                json!("fixed_web_search"),
            )])),
            stream_events: Vec::new(),
        }
    }
}
