use super::common::{
    non_empty, AGENT_APP_RUNTIME_CAPABILITY_SOURCE, LIME_RUNTIME_METADATA_KEY,
    LIME_RUNTIME_TOOL_SURFACE_KEY,
};
use serde_json::{json, Map, Value};

fn read_agent_app_tool_execution_request(metadata: &Value) -> Option<Value> {
    metadata
        .get("agent_app_tool_execution")
        .or_else(|| metadata.get("agentAppToolExecution"))
        .and_then(|value| value.get("request"))
        .filter(|value| value.is_object())
        .cloned()
}

fn read_agent_app_tool_execution_text(request: &Value, key: &str) -> Option<String> {
    request
        .get(key)
        .and_then(Value::as_str)
        .and_then(|value| non_empty(Some(value)))
}

fn agent_app_tool_execution_requires_browser_assist(request: &Value) -> bool {
    read_agent_app_tool_execution_text(request, "capability").as_deref() == Some("lime.browser")
        || read_agent_app_tool_execution_text(request, "toolName")
            .as_deref()
            .is_some_and(|tool| tool.trim().starts_with("mcp__lime-browser__"))
}

pub(super) fn render_agent_app_tool_execution_contract_lines(
    metadata: Option<&Value>,
) -> Vec<String> {
    let Some(request) = metadata.and_then(read_agent_app_tool_execution_request) else {
        return Vec::new();
    };
    let capability = read_agent_app_tool_execution_text(&request, "capability")
        .unwrap_or_else(|| "unknown".to_string());
    let method =
        read_agent_app_tool_execution_text(&request, "method").unwrap_or_else(|| "unknown".into());
    let tool_name =
        read_agent_app_tool_execution_text(&request, "toolName").unwrap_or_else(|| "n/a".into());
    let action =
        read_agent_app_tool_execution_text(&request, "action").unwrap_or_else(|| "n/a".into());
    let policy = request.get("policy").cloned().unwrap_or_else(|| json!({}));
    let input = request
        .get("input")
        .map(|value| serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string()))
        .unwrap_or_else(|| "{}".to_string());

    vec![
        "".to_string(),
        "Agent App Tool Execution Owner Contract:".to_string(),
        "- 本任务是 Agent App 提交的工具执行请求；Agent App 只提交 intent，不拥有工具、MCP、终端、浏览器或 connector 执行权。".to_string(),
        "- 必须由 Lime AgentRuntime / ToolRuntime policy owner 审核并执行；不得把 Host secret/token 暴露给 App。".to_string(),
        format!("- Capability: {capability}"),
        format!("- Method: {method}"),
        format!("- Requested Tool: {tool_name}"),
        format!("- Action: {action}"),
        format!("- Policy: {}", policy),
        "- 执行开始、结果、失败或取消必须回写为 AgentRuntime tool call / evidence / task event；最终回答不要伪造 App-side evidence。".to_string(),
        "- 如果请求缺少 Host 侧授权、connector secret binding、sandbox 或用户确认，请通过 AgentRuntime action / request 机制阻塞，不要直接失败成普通聊天回答。".to_string(),
        "Tool Input JSON:".to_string(),
        input,
    ]
}

pub(super) fn insert_agent_app_tool_execution_runtime_hints(root: &mut Map<String, Value>) {
    let request = read_agent_app_tool_execution_request(&Value::Object(root.clone()));
    let Some(request) = request else {
        return;
    };

    let harness = root
        .entry("harness".to_string())
        .or_insert_with(|| json!({}));
    if let Some(harness) = harness.as_object_mut() {
        harness.insert("task_mode_enabled".to_string(), json!(true));
        harness.insert(
            "agent_app_tool_execution".to_string(),
            json!({
                "source": AGENT_APP_RUNTIME_CAPABILITY_SOURCE,
                "request": request.clone(),
            }),
        );
        if agent_app_tool_execution_requires_browser_assist(&request) {
            harness.insert(
                "browser_requirement".to_string(),
                json!("required_with_user_step"),
            );
            harness.insert(
                "browser_assist".to_string(),
                json!({
                    "enabled": true,
                    "profile_key": "general_browser_assist",
                    "source": "agent_app_tool_execution",
                }),
            );
        }
    }

    let lime_runtime = root
        .entry(LIME_RUNTIME_METADATA_KEY.to_string())
        .or_insert_with(|| json!({}));
    if let Some(lime_runtime) = lime_runtime.as_object_mut() {
        lime_runtime.insert(
            LIME_RUNTIME_TOOL_SURFACE_KEY.to_string(),
            json!("agent_app_tool_execution"),
        );
    }

    root.entry("tool_scope".to_string()).or_insert_with(|| {
        json!({
            "source": AGENT_APP_RUNTIME_CAPABILITY_SOURCE,
            "reason": "agent_app_tool_execution_request",
            "mode": "tool_runtime_owner_binding",
        })
    });
}
