use super::*;

#[test]
fn natural_language_news_turn_exposes_search_tool_surface_by_default() {
    let request = request_for_test("整理今天的国际新闻", None, None);
    let host_request = runtime_request_from_request(&request);

    let policy = request_tool_policy_from_request(host_request.as_ref());

    assert!(policy.effective_web_search);
    assert_eq!(policy.search_mode, RequestToolPolicyMode::Auto);
    assert!(!policy.requires_web_search());
    assert!(!should_defer_tool_surface_for_fast_response(
        &request, &policy
    ));
}

#[test]
fn explicit_web_search_false_keeps_search_disabled() {
    let request = request_for_test(
        "整理今天的国际新闻",
        Some(app_server_protocol::RuntimeRequest {
            web_search: Some(false),
            ..app_server_protocol::RuntimeRequest::default()
        }),
        None,
    );
    let host_request = runtime_request_from_request(&request);

    let policy = request_tool_policy_from_request(host_request.as_ref());

    assert!(!policy.effective_web_search);
    assert_eq!(policy.search_mode, RequestToolPolicyMode::Disabled);
}

#[test]
fn explicit_auto_search_mode_uses_model_tool_choice() {
    let request = request_for_test(
        "整理今天的国际新闻",
        Some(app_server_protocol::RuntimeRequest {
            search_mode: Some(app_server_protocol::RuntimeSearchMode::Auto),
            ..app_server_protocol::RuntimeRequest::default()
        }),
        None,
    );
    let host_request = runtime_request_from_request(&request);

    let policy = request_tool_policy_from_request(host_request.as_ref());

    assert!(policy.effective_web_search);
    assert_eq!(policy.search_mode, RequestToolPolicyMode::Auto);
    assert!(!policy.requires_web_search());
}

#[test]
fn runtime_request_search_mode_is_typed() {
    let request = request_for_test(
        "整理今天的国际新闻",
        Some(app_server_protocol::RuntimeRequest {
            search_mode: Some(app_server_protocol::RuntimeSearchMode::Required),
            ..app_server_protocol::RuntimeRequest::default()
        }),
        None,
    );

    assert_eq!(
        runtime_request_from_request(&request).and_then(|request| request.search_mode),
        Some(app_server_protocol::RuntimeSearchMode::Required)
    );
}

#[test]
fn required_web_search_marks_turn_context_for_tool_permission() {
    let request = request_for_test(
        "整理今天的国际新闻",
        Some(app_server_protocol::RuntimeRequest {
            web_search: Some(true),
            search_mode: Some(app_server_protocol::RuntimeSearchMode::Required),
            ..app_server_protocol::RuntimeRequest::default()
        }),
        None,
    );
    let host_request = runtime_request_from_request(&request);
    let scope = session_scope_from_request(&request).expect("scope");
    let selection = RuntimeModelSelection {
        provider: "openai".to_string(),
        model: "gpt-4.1-mini".to_string(),
        source: "test",
        reasoning_effort: None,
    };

    let turn_context =
        turn_context_from_request(&request, host_request.as_ref(), &scope, &selection, None)
            .expect("turn context");

    assert_eq!(
        turn_context
            .metadata
            .get("web_search_enabled")
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        turn_context
            .metadata
            .get("webSearchEnabled")
            .and_then(Value::as_bool),
        Some(true)
    );
}

#[test]
fn research_skill_launch_requires_web_fetch_for_page_confirmation() {
    let request = request_for_test(
        "@搜索 关键词:联网工具验证",
        Some(app_server_protocol::RuntimeRequest {
            web_search: Some(true),
            search_mode: Some(app_server_protocol::RuntimeSearchMode::Required),
            metadata: Some(json!({
                "harness": {
                    "research_skill_launch": {
                        "kind": "research_request",
                        "research_request": {
                            "query": "联网工具验证",
                            "entry_source": "at_search_command"
                        }
                    }
                }
            })),
            ..app_server_protocol::RuntimeRequest::default()
        }),
        None,
    );
    let host_request = runtime_request_from_request(&request);

    let policy = request_tool_policy_from_request(host_request.as_ref());

    assert_eq!(policy.search_mode, RequestToolPolicyMode::Required);
    assert!(policy.matches_any_required_tool("WebSearch"));
    assert!(policy.matches_any_required_tool("WebFetch"));
    assert!(policy.matches_any_allowed_tool("WebFetch"));
}
