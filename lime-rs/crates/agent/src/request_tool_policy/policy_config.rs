use lime_core::env_compat;
use serde::{Deserialize, Serialize};

pub const REQUEST_TOOL_POLICY_MARKER: &str = "【请求级工具策略】";

const DEFAULT_REQUIRED_TOOLS: &[&str] = &["WebSearch"];
const DEFAULT_ALLOWED_TOOLS: &[&str] = &["WebSearch", "WebFetch"];
const WEB_SEARCH_REQUIRED_TOOLS_ENV_KEYS: &[&str] = &[
    "LIME_WEB_SEARCH_REQUIRED_TOOLS",
    "PROXYCAST_WEB_SEARCH_REQUIRED_TOOLS",
];
const WEB_SEARCH_ALLOWED_TOOLS_ENV_KEYS: &[&str] = &[
    "LIME_WEB_SEARCH_ALLOWED_TOOLS",
    "PROXYCAST_WEB_SEARCH_ALLOWED_TOOLS",
];
const WEB_SEARCH_DISALLOWED_TOOLS_ENV_KEYS: &[&str] = &[
    "LIME_WEB_SEARCH_DISALLOWED_TOOLS",
    "PROXYCAST_WEB_SEARCH_DISALLOWED_TOOLS",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum RequestToolPolicyMode {
    #[default]
    Disabled,
    Allowed,
    Required,
}

impl RequestToolPolicyMode {
    pub fn enables_web_search(self) -> bool {
        !matches!(self, Self::Disabled)
    }

    pub fn requires_web_search(self) -> bool {
        matches!(self, Self::Required)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::Allowed => "allowed",
            Self::Required => "required",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestToolPolicy {
    /// 本次请求的联网搜索语义
    pub search_mode: RequestToolPolicyMode,
    /// 本次请求是否开启联网搜索策略
    pub effective_web_search: bool,
    /// 必须至少成功一次的工具（默认 WebSearch）
    pub required_tools: Vec<String>,
    /// 允许的联网工具集合（默认 WebSearch/WebFetch）
    pub allowed_tools: Vec<String>,
    /// 禁止工具集合（可配置）
    pub disallowed_tools: Vec<String>,
}

impl RequestToolPolicy {
    pub fn allows_web_search(&self) -> bool {
        self.search_mode.enables_web_search()
    }

    pub fn requires_web_search(&self) -> bool {
        self.search_mode.requires_web_search()
    }

    pub fn matches_any_required_tool(&self, tool_name: &str) -> bool {
        matches_tool_list(tool_name, &self.required_tools)
    }

    pub fn matches_any_allowed_tool(&self, tool_name: &str) -> bool {
        matches_tool_list(tool_name, &self.allowed_tools)
    }
}

pub fn request_tool_policy_with_additional_required_tools(
    mut policy: RequestToolPolicy,
    additional_required_tools: &[&str],
) -> RequestToolPolicy {
    if !policy.effective_web_search {
        return policy;
    }

    for tool in additional_required_tools {
        let tool = tool.trim();
        if tool.is_empty() {
            continue;
        }
        if !policy
            .required_tools
            .iter()
            .any(|candidate| is_same_tool(candidate, tool))
        {
            policy.required_tools.push(tool.to_string());
        }
        if !policy
            .allowed_tools
            .iter()
            .any(|candidate| is_same_tool(candidate, tool))
        {
            policy.allowed_tools.push(tool.to_string());
        }
    }

    policy
}

/// 解析请求级工具策略
///
/// 规则：
/// - 只有显式 `web_search=true` 或 `search_mode=allowed|required` 才开启联网工具面
/// - 白/黑名单支持环境变量覆盖：
///   - `LIME_WEB_SEARCH_REQUIRED_TOOLS`（兼容 `PROXYCAST_WEB_SEARCH_REQUIRED_TOOLS`）
///   - `LIME_WEB_SEARCH_ALLOWED_TOOLS`（兼容 `PROXYCAST_WEB_SEARCH_ALLOWED_TOOLS`）
///   - `LIME_WEB_SEARCH_DISALLOWED_TOOLS`（兼容 `PROXYCAST_WEB_SEARCH_DISALLOWED_TOOLS`）
pub fn resolve_request_tool_policy(request_web_search: Option<bool>) -> RequestToolPolicy {
    resolve_request_tool_policy_with_mode(request_web_search, None)
}

pub fn resolve_request_tool_policy_with_mode(
    request_web_search: Option<bool>,
    request_search_mode: Option<RequestToolPolicyMode>,
) -> RequestToolPolicy {
    let search_mode = match (request_web_search, request_search_mode) {
        (Some(false), _) => RequestToolPolicyMode::Disabled,
        (_, Some(mode)) => mode,
        (Some(true), None) => RequestToolPolicyMode::Allowed,
        _ => RequestToolPolicyMode::Disabled,
    };
    let effective_web_search = search_mode.enables_web_search();
    let disallowed_tools = parse_tool_list_env(WEB_SEARCH_DISALLOWED_TOOLS_ENV_KEYS, &[]);
    let (required_tools, allowed_tools) = if effective_web_search {
        let required_tools =
            parse_tool_list_env(WEB_SEARCH_REQUIRED_TOOLS_ENV_KEYS, DEFAULT_REQUIRED_TOOLS);
        let mut allowed_tools =
            parse_tool_list_env(WEB_SEARCH_ALLOWED_TOOLS_ENV_KEYS, DEFAULT_ALLOWED_TOOLS);

        for required in &required_tools {
            if !allowed_tools
                .iter()
                .any(|candidate| is_same_tool(candidate, required))
            {
                allowed_tools.push(required.clone());
            }
        }

        (required_tools, allowed_tools)
    } else {
        (Vec::new(), Vec::new())
    };

    RequestToolPolicy {
        search_mode,
        effective_web_search,
        required_tools,
        allowed_tools,
        disallowed_tools,
    }
}

/// 合并请求级工具策略到系统提示词
///
/// - `effective_web_search=false`：保持原始 system prompt 不变
/// - 已包含 marker 时：不重复追加
pub fn merge_system_prompt_with_request_tool_policy(
    base_prompt: Option<String>,
    policy: &RequestToolPolicy,
) -> Option<String> {
    if !policy.allows_web_search() {
        return base_prompt;
    }

    let disallowed_line = if policy.disallowed_tools.is_empty() {
        "无".to_string()
    } else {
        policy.disallowed_tools.join(", ")
    };

    let policy_prompt = match policy.search_mode {
        RequestToolPolicyMode::Disabled => return base_prompt,
        RequestToolPolicyMode::Allowed => format!(
            "{REQUEST_TOOL_POLICY_MARKER}\n\
- 用户在本次请求中允许你使用联网搜索，但这不代表本回合必须联网。\n\
- 你必须先理解用户意图，优先判断应该直接回答、深度思考、规划、后台任务、多代理，还是联网核实。\n\
- 只有在用户明确要求搜索，或问题涉及最新、实时、价格、政策、规则、版本、新闻、日期敏感信息，或高风险信息需要核实时，才调用 {}（必要时再调用 WebFetch）。\n\
- 若无需联网即可可靠完成，就直接回答，不要为了展示工具能力而搜索。\n\
- 允许工具: {}\n\
- 禁止工具: {}",
            policy.required_tools.join(", "),
            policy.allowed_tools.join(", "),
            disallowed_line
        ),
        RequestToolPolicyMode::Required => format!(
            "{REQUEST_TOOL_POLICY_MARKER}\n\
- 用户在本次请求中已明确要求联网搜索。\n\
- 必须先调用 {} 至少一次（必要时再调用 WebFetch），再输出最终答复。\n\
- 若工具调用失败，必须返回失败原因与尝试记录；不要在未完成必需工具调用前直接给最终结论。\n\
- 允许工具: {}\n\
- 禁止工具: {}",
            policy.required_tools.join(", "),
            policy.allowed_tools.join(", "),
            disallowed_line
        ),
    };

    match base_prompt {
        Some(base) => {
            if base.contains(REQUEST_TOOL_POLICY_MARKER) {
                Some(base)
            } else if base.trim().is_empty() {
                Some(policy_prompt)
            } else {
                Some(format!("{base}\n\n{policy_prompt}"))
            }
        }
        None => Some(policy_prompt),
    }
}

fn parse_tool_list_env(keys: &[&str], default_values: &[&str]) -> Vec<String> {
    let from_env = env_compat::var(keys)
        .map(|raw| parse_tool_list(&raw))
        .filter(|tools| !tools.is_empty());

    let values =
        from_env.unwrap_or_else(|| default_values.iter().map(|item| item.to_string()).collect());
    dedup_tools(values)
}

fn parse_tool_list(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(|item| item.to_string())
        .collect()
}

fn dedup_tools(values: Vec<String>) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    for value in values {
        if !result.iter().any(|existing| is_same_tool(existing, &value)) {
            result.push(value);
        }
    }
    result
}

pub(crate) fn matches_tool_list(tool_name: &str, list: &[String]) -> bool {
    list.iter()
        .any(|candidate| is_same_tool(tool_name, candidate))
}

pub(crate) fn is_same_tool(a: &str, b: &str) -> bool {
    let normalized_a = normalize_tool_name(a);
    let normalized_b = normalize_tool_name(b);
    if normalized_a.is_empty() || normalized_b.is_empty() {
        return false;
    }
    normalized_a == normalized_b
        || normalized_a.contains(&normalized_b)
        || normalized_b.contains(&normalized_a)
}

pub(crate) fn normalize_tool_name(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect::<String>()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_effective_web_search_with_request_override() {
        let policy = resolve_request_tool_policy(Some(false));
        assert!(!policy.effective_web_search);
        assert_eq!(policy.search_mode, RequestToolPolicyMode::Disabled);
        assert!(policy.required_tools.is_empty());
        assert!(policy.allowed_tools.is_empty());

        let policy = resolve_request_tool_policy(Some(true));
        assert!(policy.effective_web_search);
        assert_eq!(policy.search_mode, RequestToolPolicyMode::Allowed);
    }

    #[test]
    fn disables_web_search_without_explicit_request() {
        let policy = resolve_request_tool_policy(None);
        assert!(!policy.effective_web_search);
        assert_eq!(policy.search_mode, RequestToolPolicyMode::Disabled);
    }

    #[test]
    fn enables_allowed_mode_when_explicitly_requested() {
        let policy =
            resolve_request_tool_policy_with_mode(None, Some(RequestToolPolicyMode::Allowed));
        assert!(policy.effective_web_search);
        assert_eq!(policy.search_mode, RequestToolPolicyMode::Allowed);
        assert!(!policy.requires_web_search());
    }

    #[test]
    fn resolves_required_mode_when_explicitly_requested() {
        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Required),
        );
        assert!(policy.effective_web_search);
        assert!(policy.requires_web_search());
        assert!(policy.matches_any_required_tool("WebSearch"));
        assert!(policy.matches_any_allowed_tool("WebFetch"));
    }

    #[test]
    fn disabled_mode_should_not_expose_web_search_tool_surface() {
        let policy =
            resolve_request_tool_policy_with_mode(None, Some(RequestToolPolicyMode::Disabled));

        assert_eq!(policy.search_mode, RequestToolPolicyMode::Disabled);
        assert!(!policy.effective_web_search);
        assert!(policy.required_tools.is_empty());
        assert!(policy.allowed_tools.is_empty());
        assert!(!policy.matches_any_required_tool("WebSearch"));
        assert!(!policy.matches_any_allowed_tool("WebFetch"));
    }

    #[test]
    fn keeps_original_prompt_when_disabled() {
        let base = Some("base".to_string());
        let policy = resolve_request_tool_policy(Some(false));
        assert_eq!(
            merge_system_prompt_with_request_tool_policy(base.clone(), &policy),
            base
        );
    }

    #[test]
    fn appends_policy_prompt_when_enabled() {
        let policy = resolve_request_tool_policy(Some(true));
        let merged =
            merge_system_prompt_with_request_tool_policy(Some("base".to_string()), &policy)
                .expect("merged prompt should exist");
        assert!(merged.contains(REQUEST_TOOL_POLICY_MARKER));
        assert!(merged.contains("不代表本回合必须联网"));
        assert!(merged.contains("先理解用户意图"));
        assert!(merged.contains("WebSearch"));
    }

    #[test]
    fn appends_required_policy_prompt_when_required() {
        let policy = resolve_request_tool_policy_with_mode(
            Some(true),
            Some(RequestToolPolicyMode::Required),
        );
        let merged =
            merge_system_prompt_with_request_tool_policy(Some("base".to_string()), &policy)
                .expect("merged prompt should exist");
        assert!(merged.contains("必须先调用"));
    }

    #[test]
    fn no_duplicate_when_marker_exists() {
        let base = Some(format!("{REQUEST_TOOL_POLICY_MARKER}\nexists"));
        let policy = resolve_request_tool_policy(Some(true));
        assert_eq!(
            merge_system_prompt_with_request_tool_policy(base.clone(), &policy),
            base
        );
    }
}
