use super::policy_config::normalize_tool_name;
use super::AsterReplyRuntimeHost;
use super::{RequestToolPolicy, WebSearchExecutionTracker, WEB_SEARCH_PREFETCH_CONTEXT_MARKER};
use crate::agent_tools::tool_orchestrator::{
    execute_planned_tool_batch, rewrite_tool_terminal_event, PlannedToolExecution,
    ToolExecutionBatchInput, ToolTerminalEventUpdate,
};
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::turn_context_configuration::AgentTurnContext;
use lime_core::env_compat;
use regex::Regex;
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

const WEB_SEARCH_PREFLIGHT_ENABLED_ENV_KEYS: &[&str] = &[
    "LIME_WEB_SEARCH_PREFLIGHT_ENABLED",
    "PROXYCAST_WEB_SEARCH_PREFLIGHT_ENABLED",
];
pub(crate) const NEWS_PREFLIGHT_QUERY_PARALLELISM: usize = 4;
const NEWS_PREFLIGHT_QUERY_OUTPUT_CHAR_LIMIT: usize = 1_600;
const NEWS_PREFLIGHT_CONTEXT_CHAR_LIMIT: usize = 6_000;
const NEWS_PREFLIGHT_RESULT_LINES: usize = 18;

#[derive(Debug, Clone)]
pub(crate) struct PreflightToolExecution {
    pub(crate) events: Vec<RuntimeAgentEvent>,
    pub(crate) system_prompt_appendix: Option<String>,
    pub(crate) coverage_summary: Option<String>,
}

pub(crate) struct WebSearchPreflightRequest<'request, 'agent> {
    pub(crate) host: &'request AsterReplyRuntimeHost<'agent>,
    pub(crate) session_id: &'request str,
    pub(crate) message_text: &'request str,
    pub(crate) working_directory: Option<&'request Path>,
    pub(crate) cancel_token: Option<CancellationToken>,
    pub(crate) turn_context: Option<AgentTurnContext>,
    pub(crate) policy: &'request RequestToolPolicy,
}

impl PreflightToolExecution {
    pub(crate) fn none() -> Self {
        Self {
            events: Vec::new(),
            system_prompt_appendix: None,
            coverage_summary: None,
        }
    }
}

#[derive(Debug, Clone)]
struct PreflightSearchPlan {
    index: usize,
    query: String,
    tool_id: String,
    arguments: Option<String>,
    params: Value,
}

#[derive(Debug, Clone)]
pub(crate) struct PreflightSearchOutcome {
    index: usize,
    query: String,
    tool_id: String,
    success: bool,
    output: String,
    error: Option<String>,
}

pub(crate) fn merge_system_prompt_with_web_search_preflight_context(
    base_prompt: Option<String>,
    appendix: Option<String>,
) -> Option<String> {
    match (base_prompt, appendix) {
        (Some(base), Some(extra)) => {
            if base.contains(WEB_SEARCH_PREFETCH_CONTEXT_MARKER) {
                Some(base)
            } else if base.trim().is_empty() {
                Some(extra)
            } else {
                Some(format!("{base}\n\n{extra}"))
            }
        }
        (Some(base), None) => Some(base),
        (None, Some(extra)) => Some(extra),
        (None, None) => None,
    }
}

#[cfg(test)]
pub(crate) fn should_run_web_search_preflight(
    policy: &RequestToolPolicy,
    _message_text: &str,
) -> bool {
    should_run_web_search_preflight_with_enabled(policy, is_web_search_preflight_enabled())
}

pub(crate) fn should_run_web_search_preflight_with_enabled(
    policy: &RequestToolPolicy,
    preflight_enabled: bool,
) -> bool {
    if !preflight_enabled {
        return false;
    }

    policy.requires_web_search()
}

pub(crate) fn build_preflight_queries(
    message_text: &str,
    policy: &RequestToolPolicy,
) -> Vec<String> {
    let base_query = derive_preflight_query(message_text);
    if !policy.requires_web_search() || NEWS_PREFLIGHT_QUERY_PARALLELISM <= 1 {
        return vec![base_query];
    }

    let current_date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut queries = Vec::new();
    push_unique_preflight_query(&mut queries, base_query.clone());
    push_unique_preflight_query(&mut queries, format!("{base_query} {current_date}"));
    push_unique_preflight_query(
        &mut queries,
        format!("{base_query} authoritative sources {current_date}"),
    );
    push_unique_preflight_query(
        &mut queries,
        format!("{base_query} latest updates {current_date}"),
    );
    queries.truncate(NEWS_PREFLIGHT_QUERY_PARALLELISM);
    queries
}

fn push_unique_preflight_query(queries: &mut Vec<String>, query: String) {
    let normalized = query.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return;
    }
    if !queries
        .iter()
        .any(|existing| existing.eq_ignore_ascii_case(&normalized))
    {
        queries.push(normalized);
    }
}

fn normalize_url_candidate(raw_url: &str) -> String {
    raw_url
        .trim()
        .trim_end_matches([',', '.', ';', ')', ']', '>'])
        .to_string()
}

fn extract_urls_from_output(output: &str) -> Vec<String> {
    let mut urls = Vec::new();
    let mut seen = HashSet::new();
    if let Ok(re) = Regex::new(r#"https?://[^\s<>"')\]]+"#) {
        for capture in re.find_iter(output) {
            let url = normalize_url_candidate(capture.as_str());
            if !url.is_empty() && seen.insert(url.clone()) {
                urls.push(url);
            }
        }
    }
    urls
}

fn output_contains_web_search_result_block(output: &str) -> bool {
    let Ok(value) = serde_json::from_str::<Value>(output) else {
        return false;
    };
    let Some(results) = value.get("results").and_then(Value::as_array) else {
        return false;
    };

    results.iter().any(|entry| {
        entry
            .get("content")
            .and_then(Value::as_array)
            .is_some_and(|content| {
                content.iter().any(|item| {
                    item.get("url").and_then(Value::as_str).is_some_and(|url| {
                        url.starts_with("http://") || url.starts_with("https://")
                    })
                })
            })
    })
}

pub(crate) fn preflight_search_outcome_has_usable_result(outcome: &PreflightSearchOutcome) -> bool {
    outcome.success
        && (output_contains_web_search_result_block(&outcome.output)
            || !extract_urls_from_output(&outcome.output).is_empty())
}

fn extract_domain(url: &str) -> String {
    let without_protocol = url
        .trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    without_protocol
        .split(['/', '?', '#'])
        .next()
        .unwrap_or(without_protocol)
        .trim_start_matches("www.")
        .to_string()
}

fn truncate_output_for_context(output: &str, max_chars: usize) -> String {
    let normalized = output
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.trim().is_empty())
        .take(NEWS_PREFLIGHT_RESULT_LINES)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();
    if normalized.chars().count() <= max_chars {
        normalized
    } else {
        normalized.chars().take(max_chars).collect::<String>() + "…"
    }
}

fn build_coverage_summary(
    planned_queries: &[String],
    outcomes: &[PreflightSearchOutcome],
) -> Option<String> {
    if planned_queries.is_empty() {
        return None;
    }

    let successful = outcomes
        .iter()
        .filter(|item| preflight_search_outcome_has_usable_result(item))
        .count();
    let mut unique_urls = HashSet::new();
    let mut unique_domains = HashSet::new();
    for outcome in outcomes {
        for url in extract_urls_from_output(&outcome.output) {
            unique_domains.insert(extract_domain(&url));
            unique_urls.insert(url);
        }
    }

    Some(format!(
        "已并发预检索 {} 组查询，成功 {} 组，提取 {} 条去重链接，覆盖 {} 个站点。",
        planned_queries.len(),
        successful,
        unique_urls.len(),
        unique_domains.len()
    ))
}

fn build_preflight_prompt_appendix(
    planned_queries: &[String],
    outcomes: &[PreflightSearchOutcome],
) -> Option<String> {
    let successful = outcomes
        .iter()
        .filter(|item| preflight_search_outcome_has_usable_result(item))
        .collect::<Vec<_>>();
    if successful.is_empty() {
        return None;
    }

    let mut sections = vec![
        WEB_SEARCH_PREFETCH_CONTEXT_MARKER.to_string(),
        "本回合已先使用统一的 WebSearch 工具完成预检索。请优先基于以下结果做主题聚类、交叉验证和来源整合，不要退回到一次浅层搜索。".to_string(),
        "除非这些结果明显不足以回答用户问题，否则不要再次调用 WebSearch 或 WebFetch，也不要重复同一组查询；下一步应直接输出最终总结，而不是停留在工具轨迹。".to_string(),
    ];
    if let Some(summary) = build_coverage_summary(planned_queries, outcomes) {
        sections.push(summary);
    }
    sections
        .push("整理要求：先归纳主题，再写结论；优先采用多来源一致信息；若只来自单一来源，要在回答里显式说明。".to_string());

    let mut remaining_chars = NEWS_PREFLIGHT_CONTEXT_CHAR_LIMIT;
    for outcome in successful {
        if remaining_chars == 0 {
            break;
        }
        let excerpt_limit = remaining_chars.min(NEWS_PREFLIGHT_QUERY_OUTPUT_CHAR_LIMIT);
        let excerpt = truncate_output_for_context(&outcome.output, excerpt_limit);
        if excerpt.trim().is_empty() {
            continue;
        }
        remaining_chars = remaining_chars.saturating_sub(excerpt.chars().count());
        sections.push(format!(
            "### Query {}: {}\n{}",
            outcome.index + 1,
            outcome.query,
            excerpt
        ));
    }

    Some(sections.join("\n\n"))
}

/// 诊断开关开启时，在正式回复前执行 WebSearch 预检索。
///
/// 目标：
/// - 默认不阻塞正式模型流，避免 `@搜索` 首字长时间无输出。
/// - 仅在 `LIME_WEB_SEARCH_PREFLIGHT_ENABLED=1` 且显式 `required` 时预检索。
/// - 统一生成 tool_start/tool_end 事件，供前端 harness 展示。
/// - 将预检索结果压缩注入 system prompt，帮助模型做更深的事实整合。
/// - 若本回合被明确要求必须先搜索，且预检索全部失败，则由上层中断本次回答。
pub(crate) async fn execute_web_search_preflight_if_needed(
    request: WebSearchPreflightRequest<'_, '_>,
    tracker: &mut WebSearchExecutionTracker,
) -> Result<PreflightToolExecution, String> {
    execute_web_search_preflight_if_needed_with_enabled(
        request,
        tracker,
        is_web_search_preflight_enabled(),
    )
    .await
}

pub(crate) async fn execute_web_search_preflight_if_needed_with_enabled(
    request: WebSearchPreflightRequest<'_, '_>,
    tracker: &mut WebSearchExecutionTracker,
    preflight_enabled: bool,
) -> Result<PreflightToolExecution, String> {
    let WebSearchPreflightRequest {
        host,
        session_id,
        message_text,
        working_directory,
        cancel_token,
        turn_context,
        policy,
    } = request;

    if !should_run_web_search_preflight_with_enabled(policy, preflight_enabled) {
        return Ok(PreflightToolExecution::none());
    }

    let registry_arc = host.tool_registry();
    let registry = registry_arc.read().await;
    let available_tools = registry.get_definitions();
    let preflight_tool = available_tools
        .iter()
        .find(|definition| {
            policy.matches_any_required_tool(&definition.name)
                && normalize_tool_name(&definition.name).contains("websearch")
        })
        .ok_or_else(|| {
            format!(
                "联网搜索已开启，但未找到可执行的必需工具定义。required_tools={}, available_tools={}",
                policy.required_tools.join(", "),
                available_tools
                    .iter()
                    .map(|definition| definition.name.clone())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })?;
    let preflight_tool_name = preflight_tool.name.clone();
    drop(registry);

    let planned_queries = build_preflight_queries(message_text, policy)
        .into_iter()
        .enumerate()
        .map(|(index, query)| {
            let params = serde_json::json!({ "query": query });
            PreflightSearchPlan {
                index,
                query,
                tool_id: format!("preflight-websearch-{}-{}", index + 1, Uuid::new_v4()),
                arguments: serde_json::to_string(&params).ok(),
                params,
            }
        })
        .collect::<Vec<_>>();
    let working_directory = working_directory
        .map(Path::to_path_buf)
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_default();
    for planned in &planned_queries {
        tracker.record_tool_start(policy, &planned.tool_id, &preflight_tool_name);
    }

    let execution_batch = execute_planned_tool_batch(
        ToolExecutionBatchInput {
            registry: registry_arc,
            session_id: session_id.to_string(),
            working_directory,
            cancel_token,
            turn_context,
            persisted_execution_policy: None,
            parallelism: NEWS_PREFLIGHT_QUERY_PARALLELISM,
            auto_mode: false,
            bypass_restrictions: false,
            live_process_registry: None,
        },
        planned_queries
            .iter()
            .map(|planned| PlannedToolExecution {
                tool_name: preflight_tool_name.clone(),
                tool_id: planned.tool_id.clone(),
                arguments: planned.arguments.clone(),
                params: planned.params.clone(),
            })
            .collect(),
    )
    .await;

    let mut outcomes = planned_queries
        .iter()
        .zip(execution_batch.outcomes.iter())
        .map(|(planned, outcome)| {
            let mut preflight_outcome = PreflightSearchOutcome {
                index: planned.index,
                query: planned.query.clone(),
                tool_id: outcome.tool_id.clone(),
                success: outcome.success,
                output: outcome.output.clone(),
                error: outcome.error.clone().map(|error| {
                    if error.starts_with("执行工具失败:") {
                        error.replacen("执行工具失败:", "执行 WebSearch 预调用失败:", 1)
                    } else {
                        error
                    }
                }),
            };
            if preflight_outcome.success
                && !preflight_search_outcome_has_usable_result(&preflight_outcome)
            {
                preflight_outcome.success = false;
                preflight_outcome.error = Some("WebSearch 未返回可用搜索结果链接".to_string());
            }
            preflight_outcome
        })
        .collect::<Vec<_>>();
    outcomes.sort_by_key(|item| item.index);

    let mut events = execution_batch.events;
    for outcome in &outcomes {
        tracker.record_tool_end(
            policy,
            &outcome.tool_id,
            outcome.success,
            outcome.error.as_deref(),
        );
        rewrite_tool_terminal_event(
            &mut events,
            &ToolTerminalEventUpdate {
                tool_id: outcome.tool_id.clone(),
                success: outcome.success,
                output: outcome.output.clone(),
                error: outcome.error.clone(),
                metadata: None,
            },
        );
    }

    let planned_query_texts = planned_queries
        .iter()
        .map(|item| item.query.clone())
        .collect::<Vec<_>>();
    let successful_required = outcomes
        .iter()
        .any(preflight_search_outcome_has_usable_result);
    let coverage_summary = build_coverage_summary(&planned_query_texts, &outcomes);
    let system_prompt_appendix = build_preflight_prompt_appendix(&planned_query_texts, &outcomes);

    if policy.requires_web_search() && !successful_required {
        let failure_details = outcomes
            .iter()
            .map(|item| {
                format!(
                    "{} => {}",
                    item.query,
                    item.error.clone().unwrap_or_else(|| "unknown".to_string())
                )
            })
            .collect::<Vec<_>>()
            .join(" | ");
        Err(format!("联网搜索预调用失败: {failure_details}"))
    } else {
        Ok(PreflightToolExecution {
            events,
            system_prompt_appendix,
            coverage_summary,
        })
    }
}

fn is_web_search_preflight_enabled() -> bool {
    match env_compat::var(WEB_SEARCH_PREFLIGHT_ENABLED_ENV_KEYS) {
        Some(raw) => !matches!(
            raw.trim().to_ascii_lowercase().as_str(),
            "0" | "false" | "no" | "off"
        ),
        None => false,
    }
}

fn derive_preflight_query(message_text: &str) -> String {
    let trimmed = message_text.trim();
    if trimmed.chars().count() >= 2 {
        return trimmed.to_string();
    }
    if trimmed.is_empty() {
        return "最新信息".to_string();
    }

    let mut fallback = trimmed.to_string();
    while fallback.chars().count() < 2 {
        fallback.push_str(" 信息");
    }
    fallback
}

#[cfg(test)]
mod tests;
