use crate::aster_state::AsterAgentState;
use crate::direct_text_generation::{run_direct_text_generation, DirectTextGenerationRequest};
use serde_json::{json, Map, Value};

pub const HOST_MANAGED_GENERATION_SCHEMA: &str = "lime.plugin.host_managed_generation.v1";
pub const HOST_MANAGED_GENERATION_SOURCE: &str = "app_server_runtime_backend";

const MAX_GENERATION_REQUESTS: usize = 3;
const MAX_GENERATED_CHARS: usize = 24_000;

#[derive(Debug, Clone)]
pub struct HostManagedGenerationPlan {
    pub requests: Vec<HostManagedGenerationItem>,
    pub system_prompt: Option<String>,
}

#[derive(Debug, Clone)]
pub struct HostManagedGenerationItem {
    pub id: String,
    pub kind: Option<String>,
    pub target_object_kind: Option<String>,
    pub output_field: Option<String>,
    pub instructions: Option<String>,
}

pub struct HostManagedGenerationRunRequest<'a> {
    pub generation_session_id: String,
    pub worker_request: &'a Value,
    pub plan: &'a HostManagedGenerationPlan,
}

#[derive(Debug, Clone)]
pub struct HostManagedGenerationRunResult {
    pub outputs: Vec<Value>,
}

impl HostManagedGenerationPlan {
    pub fn from_worker_request(worker_request: &Value) -> Option<Self> {
        let declaration = worker_request
            .pointer("/runtime/hostManagedGeneration")
            .filter(|value| value.is_object())?;
        if declaration
            .get("enabled")
            .and_then(Value::as_bool)
            .unwrap_or(false)
            != true
        {
            return None;
        }
        let requests = declaration
            .get("requests")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(HostManagedGenerationItem::from_value)
            .collect::<Vec<_>>();
        Some(Self {
            requests,
            system_prompt: string_field(declaration, &["systemPrompt", "system_prompt"]),
        })
    }
}

impl HostManagedGenerationItem {
    fn from_value(value: &Value) -> Option<Self> {
        Some(Self {
            id: string_field(value, &["id", "key"])?,
            kind: string_field(value, &["kind"]),
            target_object_kind: string_field(value, &["targetObjectKind", "target_object_kind"]),
            output_field: string_field(value, &["outputField", "output_field"]),
            instructions: string_field(value, &["instructions", "prompt", "promptTemplate"]),
        })
    }
}

pub async fn run_host_managed_generation(
    agent_state: &AsterAgentState,
    request: HostManagedGenerationRunRequest<'_>,
) -> Result<HostManagedGenerationRunResult, String> {
    let mut outputs = Vec::new();
    for generation_request in request.plan.requests.iter().take(MAX_GENERATION_REQUESTS) {
        let generated = run_direct_text_generation(
            agent_state,
            DirectTextGenerationRequest {
                session_id: format!(
                    "{}:{}",
                    request.generation_session_id, generation_request.id
                ),
                thread_id: format!(
                    "{}:host-managed-generation",
                    string_field(request.worker_request, &["sessionId", "session_id"])
                        .unwrap_or_else(|| "plugin-worker".to_string())
                ),
                turn_id: format!(
                    "{}:host-managed-generation:{}",
                    string_field(request.worker_request, &["turnId", "turn_id"])
                        .unwrap_or_else(|| "turn".to_string()),
                    generation_request.id
                ),
                system_prompt: generation_system_prompt(request.plan, generation_request),
                user_prompt: generation_user_prompt(request.worker_request, generation_request),
                turn_context: None,
            },
        )
        .await?;
        let content = truncate_chars(generated.text.trim(), MAX_GENERATED_CHARS);
        if content.is_empty() {
            continue;
        }
        outputs.push(json!({
            "id": generation_request.id,
            "kind": generation_request.kind,
            "targetObjectKind": generation_request.target_object_kind,
            "outputField": generation_request.output_field,
            "contentType": "text/markdown",
            "content": content,
        }));
    }

    Ok(HostManagedGenerationRunResult { outputs })
}

pub fn write_host_managed_generation_status(worker_request: &mut Value, payload: Value) {
    let mut envelope = Map::new();
    envelope.insert(
        "schemaVersion".to_string(),
        json!(HOST_MANAGED_GENERATION_SCHEMA),
    );
    envelope.insert("source".to_string(), json!(HOST_MANAGED_GENERATION_SOURCE));
    if let Some(object) = payload.as_object() {
        for (key, value) in object {
            envelope.insert(key.clone(), value.clone());
        }
    }
    let request_object = ensure_object(worker_request);
    request_object.insert(
        "hostManagedGeneration".to_string(),
        Value::Object(envelope.clone()),
    );
    let runtime = request_object
        .entry("runtime".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let runtime_object = ensure_object(runtime);
    runtime_object.insert(
        "hostManagedGenerationResult".to_string(),
        Value::Object(envelope),
    );
}

pub fn host_managed_generation_session_id(worker_request: &Value) -> String {
    format!(
        "{}:plugin-worker-generation:{}",
        string_field(worker_request, &["sessionId", "session_id"])
            .unwrap_or_else(|| "session".to_string()),
        string_field(worker_request, &["taskId", "task_id"]).unwrap_or_else(|| "task".to_string())
    )
}

fn generation_system_prompt(
    plan: &HostManagedGenerationPlan,
    request: &HostManagedGenerationItem,
) -> String {
    let mut prompt = String::from(
        "你是 Lime App Server 托管的 Plugin 文本生成器。你只为插件 worker 生成受控文本内容，不解释流程，不输出审计说明，不调用工具。",
    );
    if let Some(system_prompt) = plan.system_prompt.as_deref() {
        prompt.push_str("\n\n插件声明的生成边界：\n");
        prompt.push_str(system_prompt);
    }
    if let Some(instructions) = request.instructions.as_deref() {
        prompt.push_str("\n\n本次生成指令：\n");
        prompt.push_str(instructions);
    }
    prompt.push_str("\n\n输出必须是 Markdown 正文。不要输出 JSON、代码围栏或额外说明。");
    prompt
}

fn generation_user_prompt(worker_request: &Value, request: &HostManagedGenerationItem) -> String {
    let mut prompt = String::new();
    prompt.push_str("用户原始请求：\n");
    prompt.push_str(
        string_field(worker_request, &["prompt"])
            .as_deref()
            .unwrap_or(""),
    );
    prompt.push_str("\n\n生成目标：\n");
    prompt.push_str(&format!(
        "- id: {}\n- kind: {}\n- targetObjectKind: {}\n- outputField: {}\n",
        request.id,
        request.kind.as_deref().unwrap_or("text"),
        request.target_object_kind.as_deref().unwrap_or(""),
        request.output_field.as_deref().unwrap_or("")
    ));
    if let Some(source_object_ref) = worker_request.get("sourceObjectRef") {
        prompt.push_str("\n来源对象引用：\n");
        prompt.push_str(&source_object_ref.to_string());
    }
    prompt
}

fn ensure_object(value: &mut Value) -> &mut Map<String, Value> {
    if !value.is_object() {
        *value = Value::Object(Map::new());
    }
    value.as_object_mut().expect("value is object")
}

fn string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| value.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut result = String::new();
    for (index, ch) in value.chars().enumerate() {
        if index >= max_chars {
            result.push_str("...");
            break;
        }
        result.push(ch);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn generation_plan_reads_host_managed_generation_requests() {
        let worker_request = json!({
            "runtime": {
                "hostManagedGeneration": {
                    "enabled": true,
                    "systemPrompt": "生成中文 Markdown",
                    "requests": [
                        {
                            "id": "article-draft-document",
                            "kind": "markdown_document",
                            "targetObjectKind": "articleDraft",
                            "outputField": "documentText",
                            "instructions": "写一篇文章"
                        }
                    ]
                }
            }
        });

        let plan = HostManagedGenerationPlan::from_worker_request(&worker_request).expect("plan");
        assert_eq!(plan.system_prompt.as_deref(), Some("生成中文 Markdown"));
        assert_eq!(plan.requests.len(), 1);
        assert_eq!(plan.requests[0].id, "article-draft-document");
        assert_eq!(plan.requests[0].kind.as_deref(), Some("markdown_document"));
        assert_eq!(
            plan.requests[0].target_object_kind.as_deref(),
            Some("articleDraft")
        );
        assert_eq!(
            plan.requests[0].output_field.as_deref(),
            Some("documentText")
        );
    }

    #[test]
    fn write_generation_status_mirrors_payload_into_runtime_result() {
        let mut worker_request = json!({
            "runtime": {
                "hostManagedGeneration": {
                    "enabled": true
                }
            }
        });

        write_host_managed_generation_status(
            &mut worker_request,
            json!({
                "status": "unavailable",
                "reasonCode": "host_generation_unavailable",
                "message": "no configured provider"
            }),
        );

        assert_eq!(
            worker_request["hostManagedGeneration"]["schemaVersion"],
            HOST_MANAGED_GENERATION_SCHEMA
        );
        assert_eq!(
            worker_request["hostManagedGeneration"]["source"],
            HOST_MANAGED_GENERATION_SOURCE
        );
        assert_eq!(
            worker_request["hostManagedGeneration"]["status"],
            "unavailable"
        );
        assert_eq!(
            worker_request["runtime"]["hostManagedGenerationResult"],
            worker_request["hostManagedGeneration"]
        );
    }
}
