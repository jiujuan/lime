use super::*;

const AGENT_APP_TOOL_EXECUTION_DEFAULT_DENY_PRIORITY: i32 = 1378;
const AGENT_APP_TOOL_EXECUTION_ALLOW_PRIORITY: i32 = 1379;

fn value_at_path<'a>(
    root: Option<&'a serde_json::Value>,
    path: &[&str],
) -> Option<&'a serde_json::Value> {
    let mut current = root?;
    for key in path {
        current = current.get(*key)?;
    }
    Some(current)
}

fn non_empty_tool_text(value: Option<&serde_json::Value>) -> Option<String> {
    value
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn agent_app_tool_execution_request(
    request_metadata: Option<&serde_json::Value>,
) -> Option<&serde_json::Value> {
    [
        &["agent_app_tool_execution", "request"][..],
        &["agentAppToolExecution", "request"][..],
        &["harness", "agent_app_tool_execution", "request"][..],
        &["harness", "agentAppToolExecution", "request"][..],
    ]
    .iter()
    .find_map(|path| value_at_path(request_metadata, path))
    .filter(|value| value.is_object())
}

fn agent_app_tool_execution_request_text(
    request: &serde_json::Value,
    keys: &[&str],
) -> Option<String> {
    keys.iter()
        .find_map(|key| non_empty_tool_text(request.get(*key)))
}

fn agent_app_tool_execution_input_text(
    request: &serde_json::Value,
    keys: &[&str],
) -> Option<String> {
    let input = request.get("input")?;
    keys.iter()
        .find_map(|key| non_empty_tool_text(input.get(*key)))
}

fn push_agent_app_tool_name(tools: &mut Vec<String>, seen: &mut HashSet<String>, tool_name: &str) {
    let tool_name = tool_name.trim();
    if tool_name.is_empty() {
        return;
    }
    if seen.insert(tool_name.to_string()) {
        tools.push(tool_name.to_string());
    }
}

fn push_agent_app_tool_alias(
    tools: &mut Vec<String>,
    seen: &mut HashSet<String>,
    candidate: Option<&str>,
) {
    let Some(candidate) = candidate.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    let normalized = candidate.to_ascii_lowercase();
    match normalized.as_str() {
        "web_search" | "websearch" | "search" | "lime.capability.research.search" => {
            push_agent_app_tool_name(tools, seen, "WebSearch");
            push_agent_app_tool_name(tools, seen, "web_search");
        }
        "web_fetch" | "webfetch" => {
            push_agent_app_tool_name(tools, seen, "WebFetch");
            push_agent_app_tool_name(tools, seen, "web_fetch");
        }
        "terminal.run" | "terminal" | "shell" | "bash" => {
            push_agent_app_tool_name(tools, seen, "Bash");
        }
        "powershell" => {
            push_agent_app_tool_name(tools, seen, "PowerShell");
        }
        "browser" | "mcp__lime-browser__*" => {
            push_agent_app_tool_name(tools, seen, "mcp__lime-browser__*");
        }
        "open" | "browser.open" => {
            push_agent_app_tool_name(tools, seen, "mcp__lime-browser__tabs_create_mcp");
            push_agent_app_tool_name(tools, seen, "mcp__lime-browser__navigate");
        }
        "navigate" | "browser.navigate" => {
            push_agent_app_tool_name(tools, seen, "mcp__lime-browser__navigate");
        }
        "extract" | "read_page" | "browser.extract" => {
            push_agent_app_tool_name(tools, seen, "mcp__lime-browser__read_page");
            push_agent_app_tool_name(tools, seen, "mcp__lime-browser__get_page_text");
        }
        "screenshot" | "browser.screenshot" => {
            push_agent_app_tool_name(tools, seen, "mcp__lime-browser__computer");
        }
        "close" | "browser.close" => {
            push_agent_app_tool_name(tools, seen, "mcp__lime-browser__tabs_context_mcp");
        }
        "image_generation" | "image.generate" | "generateimage" => {
            push_agent_app_tool_name(tools, seen, "lime_create_image_generation_task");
        }
        "audio_transcription" | "transcribe" => {
            push_agent_app_tool_name(tools, seen, "lime_create_transcription_task");
        }
        "voice_synthesis" | "synthesizevoice" | "tts" => {
            push_agent_app_tool_name(tools, seen, "lime_create_audio_generation_task");
        }
        _ => {
            if candidate.starts_with("mcp__")
                || candidate.starts_with("connector__")
                || matches!(
                    candidate,
                    "WebSearch" | "WebFetch" | "Bash" | "PowerShell" | "Skill"
                )
                || candidate.starts_with("lime_create_")
            {
                push_agent_app_tool_name(tools, seen, candidate);
            }
        }
    }
}

fn agent_app_connector_tool_name(request: &serde_json::Value) -> Option<String> {
    let connector_id = agent_app_tool_execution_input_text(
        request,
        &["connectorId", "connector_id", "connector"],
    )?;
    let action = agent_app_tool_execution_input_text(request, &["action", "actionId", "action_id"])
        .or_else(|| agent_app_tool_execution_request_text(request, &["action"]))?;
    Some(format!("connector__{connector_id}__{action}"))
}

pub(crate) fn resolve_agent_app_tool_execution_allowed_tools(
    request_metadata: Option<&serde_json::Value>,
) -> Vec<String> {
    let Some(request) = agent_app_tool_execution_request(request_metadata) else {
        return Vec::new();
    };
    let mut tools = Vec::new();
    let mut seen = HashSet::new();
    let tool_name = agent_app_tool_execution_request_text(request, &["toolName", "tool_name"])
        .or_else(|| agent_app_tool_execution_input_text(request, &["tool", "toolName"]));
    let action = agent_app_tool_execution_request_text(request, &["action"])
        .or_else(|| agent_app_tool_execution_input_text(request, &["action"]));
    let method = agent_app_tool_execution_request_text(request, &["method"]);
    let capability = agent_app_tool_execution_request_text(request, &["capability"]);

    push_agent_app_tool_alias(&mut tools, &mut seen, tool_name.as_deref());
    push_agent_app_tool_alias(&mut tools, &mut seen, action.as_deref());
    push_agent_app_tool_alias(&mut tools, &mut seen, method.as_deref());

    match capability.as_deref() {
        Some("lime.search") => {
            push_agent_app_tool_alias(&mut tools, &mut seen, Some("web_search"));
        }
        Some("lime.browser") => {
            push_agent_app_tool_alias(&mut tools, &mut seen, Some("browser"));
        }
        Some("lime.terminal") => {
            push_agent_app_tool_alias(&mut tools, &mut seen, Some("terminal.run"));
        }
        Some("lime.mcp") => {
            let input_tool = agent_app_tool_execution_input_text(request, &["tool"]);
            push_agent_app_tool_alias(&mut tools, &mut seen, input_tool.as_deref());
        }
        Some("lime.connectors") => {
            if let Some(connector_tool) = agent_app_connector_tool_name(request) {
                push_agent_app_tool_name(&mut tools, &mut seen, &connector_tool);
            }
        }
        Some("lime.media") => match method.as_deref().or(action.as_deref()) {
            Some("generateImage") | Some("editImage") => {
                push_agent_app_tool_alias(&mut tools, &mut seen, Some("image_generation"))
            }
            Some("transcribe") => {
                push_agent_app_tool_alias(&mut tools, &mut seen, Some("transcribe"))
            }
            Some("synthesizeVoice") => {
                push_agent_app_tool_alias(&mut tools, &mut seen, Some("synthesizeVoice"))
            }
            _ => {}
        },
        _ => {}
    }

    tools
}

pub(crate) fn append_agent_app_tool_execution_session_permissions(
    permissions: &mut Vec<ToolPermission>,
    session_id: &str,
    request_metadata: Option<&serde_json::Value>,
) {
    let allowed_tools = resolve_agent_app_tool_execution_allowed_tools(request_metadata);
    if allowed_tools.is_empty() {
        return;
    }
    let Some(request) = agent_app_tool_execution_request(request_metadata) else {
        return;
    };
    let conditions = build_tool_runtime_session_scoped_permission_conditions(session_id);
    let capability = agent_app_tool_execution_request_text(request, &["capability"]);
    let method = agent_app_tool_execution_request_text(request, &["method"]);
    let action = agent_app_tool_execution_request_text(request, &["action"]);
    let secret_binding = value_at_path(Some(request), &["policy", "secretBinding"])
        .and_then(serde_json::Value::as_str)
        .map(str::to_string);

    permissions.push(ToolPermission {
        tool: "*".to_string(),
        allowed: false,
        priority: AGENT_APP_TOOL_EXECUTION_DEFAULT_DENY_PRIORITY,
        conditions: conditions.clone(),
        parameter_restrictions: Vec::new(),
        scope: PermissionScope::Session,
        reason: Some(
            "Agent App 工具执行请求进入 ToolRuntime owner binding：默认拒绝未请求工具".to_string(),
        ),
        expires_at: None,
        metadata: HashMap::from([(
            "source".to_string(),
            serde_json::json!("agent_app_tool_execution"),
        )]),
    });

    for tool in allowed_tools {
        let mut metadata = HashMap::from([(
            "source".to_string(),
            serde_json::json!("agent_app_tool_execution"),
        )]);
        if let Some(capability) = capability.as_ref() {
            metadata.insert("capability".to_string(), serde_json::json!(capability));
        }
        if let Some(method) = method.as_ref() {
            metadata.insert("method".to_string(), serde_json::json!(method));
        }
        if let Some(action) = action.as_ref() {
            metadata.insert("action".to_string(), serde_json::json!(action));
        }
        if let Some(secret_binding) = secret_binding.as_ref() {
            metadata.insert(
                "secret_binding".to_string(),
                serde_json::json!(secret_binding),
            );
        }
        permissions.push(ToolPermission {
            tool,
            allowed: true,
            priority: AGENT_APP_TOOL_EXECUTION_ALLOW_PRIORITY,
            conditions: conditions.clone(),
            parameter_restrictions: Vec::new(),
            scope: PermissionScope::Session,
            reason: Some("Agent App 工具执行请求显式允许 ToolRuntime owner 调用该工具".to_string()),
            expires_at: None,
            metadata,
        });
    }
}
