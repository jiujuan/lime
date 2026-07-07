use crate::native_tools::runtime_tool_bridge::execute_runtime_tool;
use crate::runtime_facade::current_agent_turn_context;
use aster::tools::{PermissionCheckResult, Tool, ToolContext, ToolError, ToolOptions, ToolResult};
use async_trait::async_trait;
use serde_json::Value;
use tool_runtime::native_dispatch::runtime_native_dispatch_handle;
use tool_runtime::web_fetch::{
    is_preapproved_web_fetch_host, web_fetch_tool_definition, WebFetchInput, WEB_FETCH_TOOL_NAME,
};
use tool_runtime::web_search::{web_search_tool_definition, WEB_SEARCH_TOOL_NAME};
use url::Url;

pub(crate) fn create_web_fetch_tool() -> Box<dyn Tool> {
    Box::new(WebFetchTool)
}

pub(crate) fn create_web_search_tool() -> Box<dyn Tool> {
    Box::new(WebSearchTool)
}

#[derive(Debug, Default)]
struct WebFetchTool;

#[async_trait]
impl Tool for WebFetchTool {
    fn name(&self) -> &str {
        WEB_FETCH_TOOL_NAME
    }

    fn description(&self) -> &str {
        "获取指定 URL 的内容，将 HTML 转换为 Markdown，并按提示返回相关片段。"
    }

    fn input_schema(&self) -> Value {
        web_fetch_tool_definition().input_schema
    }

    async fn check_permissions(
        &self,
        params: &Value,
        _context: &ToolContext,
    ) -> PermissionCheckResult {
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

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        execute_current_tool(WEB_FETCH_TOOL_NAME, params, context).await
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new().with_max_retries(0)
    }
}

#[derive(Debug, Default)]
struct WebSearchTool;

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str {
        WEB_SEARCH_TOOL_NAME
    }

    fn description(&self) -> &str {
        "允许当前代理搜索网络并使用结果来提供响应。"
    }

    fn input_schema(&self) -> Value {
        web_search_tool_definition().input_schema
    }

    async fn check_permissions(
        &self,
        _params: &Value,
        _context: &ToolContext,
    ) -> PermissionCheckResult {
        if current_turn_allows_web_tools_without_confirmation() {
            return PermissionCheckResult::allow();
        }

        PermissionCheckResult::ask("WebSearch 将联网搜索最新信息，请确认后继续。")
    }

    async fn execute(&self, params: Value, context: &ToolContext) -> Result<ToolResult, ToolError> {
        execute_current_tool(WEB_SEARCH_TOOL_NAME, params, context).await
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::new().with_max_retries(0)
    }
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

async fn execute_current_tool(
    tool_name: &'static str,
    params: Value,
    context: &ToolContext,
) -> Result<ToolResult, ToolError> {
    if context.is_cancelled() {
        return Err(ToolError::Cancelled);
    }

    let turn_context = current_agent_turn_context();
    execute_runtime_tool(
        runtime_native_dispatch_handle(),
        tool_name,
        &params,
        context,
        turn_context.as_ref(),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::tools::PermissionBehavior;
    use serde_json::json;
    use tool_runtime::tool_definition::RuntimeToolDefinition;

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
    async fn web_fetch_tool_keeps_aster_registration_surface() {
        let tool = WebFetchTool;
        assert_eq!(tool.name(), "WebFetch");
        assert!(runtime_tool_definition_has_required_input(
            web_fetch_tool_definition(),
            "url"
        ));
        assert!(tool.input_schema().get("properties").is_some());
    }

    #[tokio::test]
    async fn web_search_tool_keeps_aster_registration_surface() {
        let tool = WebSearchTool;
        assert_eq!(tool.name(), "WebSearch");
        assert!(runtime_tool_definition_has_required_input(
            web_search_tool_definition(),
            "query"
        ));
        assert!(tool.input_schema().get("properties").is_some());
    }

    #[tokio::test]
    async fn web_fetch_permissions_require_confirmation() {
        let tool = WebFetchTool;
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
        let tool = WebFetchTool;
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
        let fetch_tool = WebFetchTool;
        let search_tool = WebSearchTool;

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
        let tool = WebSearchTool;

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
