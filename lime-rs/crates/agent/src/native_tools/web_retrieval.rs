use crate::native_tools::runtime_tool_bridge::RuntimeNativeToolAdapter;
use crate::runtime_facade::current_agent_turn_context;
use aster::tools::{PermissionCheckResult, Tool, ToolContext};
use serde_json::Value;
use tool_runtime::native_overlay::RuntimeNativeToolOverlay;
use tool_runtime::web_fetch::{is_preapproved_web_fetch_host, WebFetchInput, WEB_FETCH_TOOL_NAME};
use tool_runtime::web_search::WEB_SEARCH_TOOL_NAME;
use url::Url;

pub(crate) fn create_web_fetch_tool() -> Box<dyn Tool> {
    debug_assert_eq!(
        RuntimeNativeToolOverlay::WebFetch.name(),
        WEB_FETCH_TOOL_NAME
    );
    Box::new(
        RuntimeNativeToolAdapter::new(
            RuntimeNativeToolOverlay::WebFetch,
            check_web_fetch_permissions,
        )
        .with_turn_context_provider(current_agent_turn_context),
    )
}

pub(crate) fn create_web_search_tool() -> Box<dyn Tool> {
    debug_assert_eq!(
        RuntimeNativeToolOverlay::WebSearch.name(),
        WEB_SEARCH_TOOL_NAME
    );
    Box::new(
        RuntimeNativeToolAdapter::new(
            RuntimeNativeToolOverlay::WebSearch,
            check_web_search_permissions,
        )
        .with_turn_context_provider(current_agent_turn_context),
    )
}

fn check_web_fetch_permissions(params: &Value, _context: &ToolContext) -> PermissionCheckResult {
    if current_turn_allows_web_tools_without_confirmation() {
        return PermissionCheckResult::allow();
    }

    let parsed_url = serde_json::from_value::<WebFetchInput>(params.clone())
        .ok()
        .and_then(|input| Url::parse(&input.url).ok());

    if let Some(url) = parsed_url.as_ref() {
        if let Some(hostname) = url.host_str() {
            if is_preapproved_web_fetch_host(hostname, url.path()) {
                return PermissionCheckResult::allow();
            }
        }
    }

    match parsed_url.and_then(|url| url.host_str().map(str::to_string)) {
        Some(hostname) => PermissionCheckResult::ask(format!(
            "WebFetch 将访问远程站点 {hostname}，请确认后继续。"
        )),
        None => PermissionCheckResult::ask("WebFetch 将访问远程 URL，请确认后继续。"),
    }
}

fn check_web_search_permissions(_params: &Value, _context: &ToolContext) -> PermissionCheckResult {
    if current_turn_allows_web_tools_without_confirmation() {
        return PermissionCheckResult::allow();
    }

    PermissionCheckResult::ask("WebSearch 将联网搜索最新信息，请确认后继续。")
}

fn current_turn_metadata_bool(keys: &[&str]) -> bool {
    current_agent_turn_context()
        .as_ref()
        .and_then(|turn_context| {
            keys.iter()
                .find_map(|key| turn_context.metadata.get(*key))
                .and_then(serde_json::Value::as_bool)
        })
        .unwrap_or(false)
}

fn current_turn_approval_policy_is_never() -> bool {
    current_agent_turn_context()
        .as_ref()
        .and_then(|turn_context| turn_context.approval_policy.as_deref())
        .map(str::trim)
        .is_some_and(|policy| policy.eq_ignore_ascii_case("never"))
}

fn current_turn_allows_web_tools_without_confirmation() -> bool {
    current_turn_metadata_bool(&["web_search_enabled", "webSearchEnabled"])
        || current_turn_approval_policy_is_never()
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::tools::PermissionBehavior;
    use serde_json::json;
    use tool_runtime::tool_definition::RuntimeToolDefinition;
    use tool_runtime::web_fetch::web_fetch_tool_definition;
    use tool_runtime::web_search::web_search_tool_definition;

    fn runtime_tool_definition_has_required_input(
        definition: RuntimeToolDefinition,
        property: &str,
    ) -> bool {
        definition
            .input_schema
            .get("required")
            .and_then(Value::as_array)
            .is_some_and(|required| required.iter().any(|item| item.as_str() == Some(property)))
    }

    #[tokio::test]
    async fn web_fetch_tool_uses_current_registration_surface() {
        let tool = create_web_fetch_tool();
        assert_eq!(tool.name(), "WebFetch");
        assert!(runtime_tool_definition_has_required_input(
            web_fetch_tool_definition(),
            "url"
        ));
        assert!(tool.input_schema().get("properties").is_some());
    }

    #[tokio::test]
    async fn web_search_tool_uses_current_registration_surface() {
        let tool = create_web_search_tool();
        assert_eq!(tool.name(), "WebSearch");
        assert!(runtime_tool_definition_has_required_input(
            web_search_tool_definition(),
            "query"
        ));
        assert!(tool.input_schema().get("properties").is_some());
    }

    #[tokio::test]
    async fn web_fetch_permissions_require_confirmation() {
        let tool = create_web_fetch_tool();
        let result = tool
            .check_permissions(
                &json!({
                    "url": "https://example.com/docs",
                    "prompt": "总结内容"
                }),
                &ToolContext::default(),
            )
            .await;

        assert_eq!(result.behavior, PermissionBehavior::Ask);
        assert_eq!(
            result.message,
            Some("WebFetch 将访问远程站点 example.com，请确认后继续。".to_string())
        );
    }

    #[tokio::test]
    async fn web_fetch_permissions_allow_preapproved_host() {
        let tool = create_web_fetch_tool();
        let result = tool
            .check_permissions(
                &json!({
                    "url": "https://react.dev/reference/react/useEffect",
                    "prompt": "总结内容"
                }),
                &ToolContext::default(),
            )
            .await;

        assert_eq!(result.behavior, PermissionBehavior::Allow);
        assert!(result.message.is_none());
    }

    #[tokio::test]
    async fn web_tools_allow_when_turn_web_search_enabled() {
        let fetch_tool = create_web_fetch_tool();
        let search_tool = create_web_search_tool();

        let (fetch_result, search_result) = crate::runtime_facade::with_agent_turn_context(
            Some(
                crate::turn_context_configuration::AgentTurnContextOverride {
                    metadata: [("web_search_enabled".to_string(), json!(true))]
                        .into_iter()
                        .collect(),
                    ..Default::default()
                },
            ),
            async {
                let fetch = fetch_tool
                    .check_permissions(
                        &json!({
                            "url": "https://example.com/docs",
                            "prompt": "总结内容"
                        }),
                        &ToolContext::default(),
                    )
                    .await;
                let search = search_tool
                    .check_permissions(
                        &json!({
                            "query": "latest ai news"
                        }),
                        &ToolContext::default(),
                    )
                    .await;
                (fetch, search)
            },
        )
        .await;

        assert_eq!(fetch_result.behavior, PermissionBehavior::Allow);
        assert_eq!(search_result.behavior, PermissionBehavior::Allow);
    }

    #[tokio::test]
    async fn web_search_permissions_allow_when_turn_approval_policy_is_never() {
        let tool = create_web_search_tool();

        let result = crate::runtime_facade::with_agent_turn_context(
            Some(
                crate::turn_context_configuration::AgentTurnContextOverride {
                    approval_policy: Some("never".to_string()),
                    ..Default::default()
                },
            ),
            async {
                tool.check_permissions(
                    &json!({
                        "query": "latest ai news"
                    }),
                    &ToolContext::default(),
                )
                .await
            },
        )
        .await;

        assert_eq!(result.behavior, PermissionBehavior::Allow);
        assert!(result.message.is_none());
    }
}
