use super::super::request_context::{
    request_tool_policy_from_request, runtime_request_from_request,
    selection_from_explicit_preferences, session_config_from_request, session_scope_from_request,
    turn_context_from_request,
};
use super::request_for_test;
use app_server_protocol::{RuntimeRequest, RuntimeSearchMode};
use lime_agent::RequestToolPolicyMode;
use serde_json::json;
use tempfile::TempDir;

fn contains_tool(tools: &[String], expected: &str) -> bool {
    tools.iter().any(|tool| tool.eq_ignore_ascii_case(expected))
}

#[test]
fn required_research_search_keeps_agent_web_tools_visible_in_turn_scope() {
    let workspace = TempDir::new().expect("workspace");
    let skill_dir = workspace.path().join(".agents/skills/research");
    std::fs::create_dir_all(&skill_dir).expect("skill dir");
    std::fs::write(
        skill_dir.join("SKILL.md"),
        r#"---
name: research
description: Source-backed research.
allowed-tools: search_query
---

# Research
"#,
    )
    .expect("skill file");

    let research_launch = json!({
        "skill_name": "research",
        "kind": "research_request",
        "research_request": {
            "query": "联网工具验证 今天 AI 行业公开新闻",
            "focus": "WebSearch 后选择一个公开来源 URL 并用 WebFetch 打开"
        }
    });
    let metadata = json!({
        "harness": {
            "workspace_root": workspace.path().to_string_lossy(),
            "cwd": workspace.path().to_string_lossy(),
            "fast_response_routing": {
                "mode": "auto",
                "service_model_slot": "responsive_chat"
            },
            "research_skill_launch": research_launch.clone()
        }
    });
    let mut request = request_for_test(
        "@搜索 关键词:联网工具验证 今天 AI 行业公开新闻",
        Some(RuntimeRequest {
            web_search: Some(true),
            search_mode: Some(RuntimeSearchMode::Required),
            metadata: Some(json!({
                "harness": {
                    "research_skill_launch": research_launch
                }
            })),
            ..RuntimeRequest::default()
        }),
        Some(metadata),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.runtime_request_mut().provider_preference = Some("openai".to_string());
    options.runtime_request_mut().model_preference = Some("gpt-4.1".to_string());

    let host_request = runtime_request_from_request(&request).expect("host request");
    let policy = request_tool_policy_from_request(Some(&host_request));
    assert_eq!(policy.search_mode, RequestToolPolicyMode::Required);
    assert!(contains_tool(&policy.required_tools, "WebSearch"));
    assert!(contains_tool(&policy.required_tools, "WebFetch"));

    let scope = session_scope_from_request(&request).expect("session scope");
    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let context =
        turn_context_from_request(&request, Some(&host_request), &scope, &selection, None)
            .expect("turn context");

    assert!(
        context.metadata.get("lime_runtime").is_none(),
        "required web search must not be downgraded to fast-response tool surface"
    );
    assert!(
        context.metadata.get("tool_scope").is_none(),
        "App Server must not duplicate Agent Skill allowed-tools as main-turn tool_scope"
    );

    let config = session_config_from_request(
        &request,
        Some(&host_request),
        &scope,
        &selection,
        &policy,
        None,
    );
    let prompt = config.system_prompt.expect("system prompt");
    assert!(prompt.contains("WebSearch"));
    assert!(prompt.contains("WebFetch"));
}
