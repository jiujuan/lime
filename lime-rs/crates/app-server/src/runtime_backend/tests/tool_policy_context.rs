use super::*;

#[test]
fn natural_language_news_turn_exposes_search_tool_surface_by_default() {
    let request = request_for_test("整理今天的国际新闻", None, None);
    let host_request = aster_chat_request_from_request(&request);

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
        Some(json!({
            "asterChatRequest": {
                "web_search": false
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);

    let policy = request_tool_policy_from_request(host_request.as_ref());

    assert!(!policy.effective_web_search);
    assert_eq!(policy.search_mode, RequestToolPolicyMode::Disabled);
}

#[test]
fn explicit_auto_search_mode_uses_model_tool_choice() {
    let request = request_for_test(
        "整理今天的国际新闻",
        Some(json!({
            "asterChatRequest": {
                "search_mode": "auto"
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);

    let policy = request_tool_policy_from_request(host_request.as_ref());

    assert!(policy.effective_web_search);
    assert_eq!(policy.search_mode, RequestToolPolicyMode::Auto);
    assert!(!policy.requires_web_search());
}

#[test]
fn legacy_allowed_search_mode_is_rejected() {
    let request = request_for_test(
        "整理今天的国际新闻",
        Some(json!({
            "asterChatRequest": {
                "search_mode": "allowed"
            }
        })),
        None,
    );

    assert!(aster_chat_request_from_request(&request).is_none());
}

#[test]
fn required_web_search_marks_turn_context_for_tool_permission() {
    let request = request_for_test(
        "整理今天的国际新闻",
        Some(json!({
            "asterChatRequest": {
                "web_search": true,
                "search_mode": "required",
                "turn_config": {
                    "web_search": true,
                    "search_mode": "required"
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);
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
        Some(json!({
            "asterChatRequest": {
                "web_search": true,
                "search_mode": "required",
                "turn_config": {
                    "web_search": true,
                    "search_mode": "required",
                    "metadata": {
                        "harness": {
                            "research_skill_launch": {
                                "kind": "research_request",
                                "research_request": {
                                    "query": "联网工具验证",
                                    "entry_source": "at_search_command"
                                }
                            }
                        }
                    }
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);

    let policy = request_tool_policy_from_request(host_request.as_ref());

    assert_eq!(policy.search_mode, RequestToolPolicyMode::Required);
    assert!(policy.matches_any_required_tool("WebSearch"));
    assert!(policy.matches_any_required_tool("WebFetch"));
    assert!(policy.matches_any_allowed_tool("WebFetch"));
}
