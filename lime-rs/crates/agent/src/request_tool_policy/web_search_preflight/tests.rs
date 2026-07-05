use super::*;
use crate::request_tool_policy::{resolve_request_tool_policy_with_mode, RequestToolPolicyMode};

#[test]
fn auto_web_search_should_not_run_preflight_from_message_keywords() {
    let policy =
        resolve_request_tool_policy_with_mode(Some(true), Some(RequestToolPolicyMode::Auto));

    assert!(!should_run_web_search_preflight(
        &policy,
        "请搜索今天最新 AI 新闻"
    ));
    assert_eq!(
        build_preflight_queries("请搜索今天最新 AI 新闻", &policy),
        vec!["请搜索今天最新 AI 新闻".to_string()]
    );
}

#[test]
fn required_web_search_should_not_preflight_by_default() {
    let policy =
        resolve_request_tool_policy_with_mode(Some(true), Some(RequestToolPolicyMode::Required));

    assert!(!should_run_web_search_preflight(&policy, "继续"));
}

#[test]
fn required_web_search_preflight_can_be_enabled_for_diagnostics() {
    let policy =
        resolve_request_tool_policy_with_mode(Some(true), Some(RequestToolPolicyMode::Required));

    assert!(should_run_web_search_preflight_with_enabled(&policy, true));
    let queries = build_preflight_queries("继续", &policy);
    assert_eq!(queries.len(), NEWS_PREFLIGHT_QUERY_PARALLELISM);
    assert_eq!(queries[0], "继续");
    assert!(queries.iter().any(|query| query.contains("latest updates")));
}

#[test]
fn required_web_search_should_expand_generic_parallel_preflight_queries() {
    let policy =
        resolve_request_tool_policy_with_mode(Some(true), Some(RequestToolPolicyMode::Required));

    let queries = build_preflight_queries("学习机 权威评测对比", &policy);
    assert_eq!(queries.len(), NEWS_PREFLIGHT_QUERY_PARALLELISM);
    assert_eq!(queries[0], "学习机 权威评测对比");
    assert!(queries
        .iter()
        .any(|query| query.contains("authoritative sources")));
    assert!(queries.iter().any(|query| query.contains("latest updates")));
}

#[test]
fn preflight_search_outcome_should_require_usable_link() {
    let no_link = PreflightSearchOutcome {
        index: 0,
        query: "新闻".to_string(),
        tool_id: "tool-no-link".to_string(),
        success: true,
        output: "WebSearch 工具可用于联网搜索。".to_string(),
        error: None,
    };
    assert!(!preflight_search_outcome_has_usable_result(&no_link));

    let markdown_link = PreflightSearchOutcome {
        index: 0,
        query: "新闻".to_string(),
        tool_id: "tool-markdown-link".to_string(),
        success: true,
        output: "1. [Example](https://example.com/news)".to_string(),
        error: None,
    };
    assert!(preflight_search_outcome_has_usable_result(&markdown_link));

    let structured_link = PreflightSearchOutcome {
        index: 0,
        query: "新闻".to_string(),
        tool_id: "tool-structured-link".to_string(),
        success: true,
        output: serde_json::json!({
            "query": "新闻",
            "results": [
                {
                    "toolUseId": "web_search",
                    "content": [
                        {
                            "title": "Example",
                            "url": "https://example.com/news"
                        }
                    ]
                }
            ],
            "durationSeconds": 0.1
        })
        .to_string(),
        error: None,
    };
    assert!(preflight_search_outcome_has_usable_result(&structured_link));

    let failed_with_link = PreflightSearchOutcome {
        index: 0,
        query: "新闻".to_string(),
        tool_id: "tool-failed-link".to_string(),
        success: false,
        output: "https://example.com/news".to_string(),
        error: Some("failed".to_string()),
    };
    assert!(!preflight_search_outcome_has_usable_result(
        &failed_with_link
    ));
}

#[tokio::test]
async fn web_search_preflight_fails_before_network_when_current_tool_is_not_required() {
    let mut policy =
        resolve_request_tool_policy_with_mode(Some(true), Some(RequestToolPolicyMode::Required));
    policy.required_tools = vec!["WebFetch".to_string()];
    let mut tracker = WebSearchExecutionTracker::default();

    let error = execute_web_search_preflight_if_needed_with_enabled(
        WebSearchPreflightRequest {
            session_id: "session-web-preflight-permission",
            message_text: "继续",
            working_directory: None,
            cancel_token: None,
            turn_context: None,
            policy: &policy,
        },
        &mut tracker,
        true,
    )
    .await
    .expect_err("preflight should require current WebSearch tool");

    assert!(error.contains("current WebSearch"));
}

#[test]
fn merges_web_search_preflight_context_without_duplication() {
    let merged = merge_system_prompt_with_web_search_preflight_context(
        Some("base".to_string()),
        Some(format!("{WEB_SEARCH_PREFETCH_CONTEXT_MARKER}\ncontext")),
    )
    .expect("merged prompt should exist");
    assert!(merged.contains(WEB_SEARCH_PREFETCH_CONTEXT_MARKER));

    let preserved = merge_system_prompt_with_web_search_preflight_context(
        Some(merged.clone()),
        Some(format!("{WEB_SEARCH_PREFETCH_CONTEXT_MARKER}\nother")),
    )
    .expect("prompt should be preserved");
    assert_eq!(preserved, merged);
}
