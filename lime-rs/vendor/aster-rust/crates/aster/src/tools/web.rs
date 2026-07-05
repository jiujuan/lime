//! Web 工具 Aster compat adapter。
//!
//! WebFetch / WebSearch 的执行事实源已经迁入 `tool-runtime`。
//! 本文件只保留 Aster `Tool` trait 注册面，避免 Aster reply loop 尚未迁出前断开工具调用。

use super::base::{PermissionCheckResult, Tool};
use super::context::{ToolContext, ToolResult};
use super::error::ToolError;
use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;
#[cfg(test)]
use tool_runtime::tool_definition::RuntimeToolDefinition;
use tool_runtime::tool_executor::{
    RuntimeToolExecutionContext, RuntimeToolExecutionContextInput, RuntimeToolExecutionError,
    RuntimeToolExecutionRequest, RuntimeToolExecutionResult, RuntimeToolExecutorHandle,
    RuntimeToolPolicyErrorKind,
};
use tool_runtime::web_fetch::{
    is_preapproved_web_fetch_host, runtime_web_fetch_executor_handle, web_fetch_tool_definition,
    WebFetchInput, WEB_FETCH_TOOL_NAME,
};
use tool_runtime::web_search::{
    runtime_web_search_executor_handle, web_search_tool_definition, WEB_SEARCH_TOOL_NAME,
};
use url::Url;

fn current_turn_metadata_bool(keys: &[&str]) -> bool {
    crate::session_context::current_turn_context()
        .as_ref()
        .and_then(|turn_context| {
            keys.iter()
                .find_map(|key| turn_context.metadata.get(*key))
                .and_then(serde_json::Value::as_bool)
        })
        .unwrap_or(false)
}

fn current_turn_approval_policy_is_never() -> bool {
    crate::session_context::current_turn_context()
        .as_ref()
        .and_then(|turn_context| turn_context.approval_policy.as_deref())
        .map(str::trim)
        .is_some_and(|policy| policy.eq_ignore_ascii_case("never"))
}

fn current_turn_allows_web_tools_without_confirmation() -> bool {
    current_turn_metadata_bool(&["web_search_enabled", "webSearchEnabled"])
        || current_turn_approval_policy_is_never()
}

/// 迁移期兼容对象；真实缓存位于 `tool-runtime` executor。
#[derive(Debug, Default)]
pub struct WebCache {
    _private: (),
}

impl WebCache {
    pub fn new() -> Self {
        Self { _private: () }
    }
}

pub fn get_web_cache_stats(_cache: &WebCache) -> Value {
    json!({
        "fetch": {
            "owner": "tool-runtime",
            "adapter": "aster-web-tool"
        },
        "search": {
            "owner": "tool-runtime",
            "adapter": "aster-web-tool"
        }
    })
}

pub fn clear_web_caches(_cache: &WebCache) {}

pub struct WebFetchTool {
    _cache: Arc<WebCache>,
}

impl Default for WebFetchTool {
    fn default() -> Self {
        Self::new()
    }
}

impl WebFetchTool {
    pub fn new() -> Self {
        Self {
            _cache: Arc::new(WebCache::new()),
        }
    }

    pub fn with_cache(cache: Arc<WebCache>) -> Self {
        Self { _cache: cache }
    }
}

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
        execute_current_tool(
            WEB_FETCH_TOOL_NAME,
            params,
            context,
            runtime_web_fetch_executor_handle(),
        )
        .await
    }
}

pub struct WebSearchTool {
    _cache: Arc<WebCache>,
}

impl Default for WebSearchTool {
    fn default() -> Self {
        Self::new()
    }
}

impl WebSearchTool {
    pub fn new() -> Self {
        Self {
            _cache: Arc::new(WebCache::new()),
        }
    }

    pub fn with_cache(cache: Arc<WebCache>) -> Self {
        Self { _cache: cache }
    }
}

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
        execute_current_tool(
            WEB_SEARCH_TOOL_NAME,
            params,
            context,
            runtime_web_search_executor_handle(),
        )
        .await
    }
}

async fn execute_current_tool(
    tool_name: &'static str,
    params: Value,
    context: &ToolContext,
    executor: RuntimeToolExecutorHandle,
) -> Result<ToolResult, ToolError> {
    let runtime_context = RuntimeToolExecutionContext::new(RuntimeToolExecutionContextInput {
        working_directory: context.working_directory.clone(),
        session_id: context.session_id.clone(),
        cancel_token: context.cancellation_token.clone(),
        workspace_sandbox: None,
    });
    let result = executor
        .execute(RuntimeToolExecutionRequest {
            tool_name,
            params: &params,
            context: &runtime_context,
            turn_context: None,
        })
        .await
        .map_err(runtime_error_to_tool_error)?;

    Ok(tool_result_from_runtime(result))
}

fn tool_result_from_runtime(result: RuntimeToolExecutionResult) -> ToolResult {
    if result.success {
        ToolResult::success(result.output).with_metadata_map(result.metadata)
    } else {
        ToolResult::error(result.error.unwrap_or(result.output)).with_metadata_map(result.metadata)
    }
}

fn runtime_error_to_tool_error(error: RuntimeToolExecutionError) -> ToolError {
    match error.policy_kind() {
        Some(RuntimeToolPolicyErrorKind::PermissionDenied(_)) => {
            ToolError::permission_denied(error.message().to_string())
        }
        Some(RuntimeToolPolicyErrorKind::SafetyCheckFailed(_)) => {
            ToolError::safety_check_failed(error.message().to_string())
        }
        Some(RuntimeToolPolicyErrorKind::ExecutionFailed(_)) | None => {
            ToolError::execution_failed(error.message().to_string())
        }
    }
}

#[cfg(test)]
fn runtime_tool_definition_has_required_input(
    definition: RuntimeToolDefinition,
    key: &str,
) -> bool {
    definition
        .input_schema
        .get("required")
        .and_then(Value::as_array)
        .is_some_and(|required| required.iter().any(|value| value.as_str() == Some(key)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::TurnContextOverride;
    use crate::tools::base::PermissionBehavior;
    use tool_runtime::web_search::WebSearchInput;

    fn turn_context_with_metadata(
        entries: impl IntoIterator<Item = (&'static str, Value)>,
    ) -> TurnContextOverride {
        TurnContextOverride {
            metadata: entries
                .into_iter()
                .map(|(key, value)| (key.to_string(), value))
                .collect(),
            ..TurnContextOverride::default()
        }
    }

    #[tokio::test]
    async fn web_fetch_tool_keeps_aster_registration_surface() {
        let tool = WebFetchTool::new();
        assert_eq!(tool.name(), "WebFetch");
        assert!(runtime_tool_definition_has_required_input(
            web_fetch_tool_definition(),
            "url"
        ));
        assert!(tool.input_schema().get("properties").is_some());
    }

    #[tokio::test]
    async fn web_search_tool_keeps_aster_registration_surface() {
        let tool = WebSearchTool::new();
        assert_eq!(tool.name(), "WebSearch");
        assert!(runtime_tool_definition_has_required_input(
            web_search_tool_definition(),
            "query"
        ));
        assert!(tool.input_schema().get("properties").is_some());
    }

    #[test]
    fn web_cache_is_only_compat_marker() {
        let cache = WebCache::new();
        let stats = get_web_cache_stats(&cache);
        assert_eq!(stats["fetch"]["owner"], "tool-runtime");
        assert_eq!(stats["search"]["owner"], "tool-runtime");
        clear_web_caches(&cache);
    }

    #[tokio::test]
    async fn web_fetch_permissions_require_confirmation() {
        let tool = WebFetchTool::new();
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
        let tool = WebFetchTool::new();
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
        let fetch_tool = WebFetchTool::new();
        let search_tool = WebSearchTool::new();

        let (fetch_result, search_result) = crate::session_context::with_turn_context(
            Some(turn_context_with_metadata([(
                "web_search_enabled",
                json!(true),
            )])),
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
        let tool = WebSearchTool::new();

        let result = crate::session_context::with_turn_context(
            Some(TurnContextOverride {
                approval_policy: Some("never".to_string()),
                ..TurnContextOverride::default()
            }),
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

    #[test]
    fn current_web_inputs_remain_deserializable_for_aster_tool_calls() {
        let fetch: WebFetchInput = serde_json::from_value(json!({
            "url": "https://example.com",
            "prompt": "summary"
        }))
        .unwrap();
        let search: WebSearchInput = serde_json::from_value(json!({
            "query": "rust news"
        }))
        .unwrap();

        assert_eq!(fetch.url, "https://example.com");
        assert_eq!(search.query, "rust news");
    }
}
