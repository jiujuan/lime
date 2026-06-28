use super::*;
use crate::request_tool_policy::{resolve_request_tool_policy_with_mode, RequestToolPolicyMode};
use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolResult};
use async_trait::async_trait;
use std::collections::HashMap;

struct TurnContextGatedWebSearchTool;

#[async_trait]
impl Tool for TurnContextGatedWebSearchTool {
    fn name(&self) -> &str {
        "WebSearch"
    }

    fn description(&self) -> &str {
        "测试用 WebSearch 工具"
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "query": { "type": "string" }
            },
            "required": ["query"]
        })
    }

    async fn check_permissions(
        &self,
        _params: &serde_json::Value,
        _context: &ToolContext,
    ) -> PermissionCheckResult {
        let allowed = aster::session_context::current_turn_context()
            .as_ref()
            .is_some_and(|turn_context| {
                ["web_search_enabled", "webSearchEnabled"]
                    .iter()
                    .any(|key| {
                        turn_context
                            .metadata
                            .get(*key)
                            .and_then(serde_json::Value::as_bool)
                            .unwrap_or(false)
                    })
            });

        if allowed {
            PermissionCheckResult::allow()
        } else {
            PermissionCheckResult::ask("WebSearch 需要联网确认。")
        }
    }

    async fn execute(
        &self,
        params: serde_json::Value,
        _context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        let query = params
            .get("query")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        Ok(ToolResult::success(format!(
            "预检索测试结果：https://example.com/search?q={query}"
        )))
    }
}

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
async fn web_search_preflight_uses_turn_context_for_permission_check() {
    let agent = Agent::new();
    {
        let registry_arc = agent.tool_registry().clone();
        let mut registry = registry_arc.write().await;
        registry.register(Box::new(TurnContextGatedWebSearchTool));
    }

    let policy =
        resolve_request_tool_policy_with_mode(Some(true), Some(RequestToolPolicyMode::Required));
    let mut metadata = HashMap::new();
    metadata.insert("webSearchEnabled".to_string(), serde_json::json!(true));
    let turn_context = aster::session::TurnContextOverride {
        metadata,
        ..aster::session::TurnContextOverride::default()
    };
    let mut tracker = WebSearchExecutionTracker::default();

    let execution = execute_web_search_preflight_if_needed_with_enabled(
        WebSearchPreflightRequest {
            agent: &agent,
            session_id: "session-web-preflight-permission",
            message_text: "继续",
            working_directory: None,
            cancel_token: None,
            turn_context: Some(turn_context),
            policy: &policy,
        },
        &mut tracker,
        true,
    )
    .await
    .expect("预调用应继承 turn context 并免确认执行");

    assert!(execution
        .system_prompt_appendix
        .as_deref()
        .unwrap_or_default()
        .contains("预检索测试结果"));
    assert!(execution.events.iter().any(|event| matches!(
        event,
        RuntimeAgentEvent::ToolEnd { result, .. } if result.success
    )));
    assert!(tracker.validate_web_search_requirement(&policy).is_ok());
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
