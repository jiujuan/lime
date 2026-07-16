use regex::Regex;
use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellCommandRiskLevel {
    Low,
    Medium,
    High,
}

impl ShellCommandRiskLevel {
    pub fn label(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellCommandRuleSource {
    Default,
    Persisted,
    Organization,
    User,
    Runtime,
    Request,
}

impl ShellCommandRuleSource {
    pub fn label(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Persisted => "persisted",
            Self::Organization => "organization",
            Self::User => "user",
            Self::Runtime => "runtime",
            Self::Request => "request",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShellCommandRuleMatchType {
    Regex,
    Prefix,
    Exact,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellCommandRule {
    pub rule_id: String,
    pub match_type: ShellCommandRuleMatchType,
    pub pattern: String,
    pub risk_level: ShellCommandRiskLevel,
    pub reason_code: String,
    pub reason: String,
    pub source: ShellCommandRuleSource,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ShellCommandRuleMatch {
    pub rule_id: String,
    pub risk_level: ShellCommandRiskLevel,
    pub reason_code: String,
    pub reason: String,
    pub source: ShellCommandRuleSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NetworkRuleTarget {
    Url,
    Host,
}

impl NetworkRuleTarget {
    pub fn label(self) -> &'static str {
        match self {
            Self::Url => "url",
            Self::Host => "host",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NetworkRule {
    pub rule_id: String,
    pub match_type: ShellCommandRuleMatchType,
    pub target: NetworkRuleTarget,
    pub pattern: String,
    pub risk_level: ShellCommandRiskLevel,
    pub reason_code: String,
    pub reason: String,
    pub source: ShellCommandRuleSource,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NetworkRuleMatch {
    pub rule_id: String,
    pub risk_level: ShellCommandRiskLevel,
    pub reason_code: String,
    pub reason: String,
    pub source: ShellCommandRuleSource,
    pub target: NetworkRuleTarget,
    pub url: String,
    pub host: Option<String>,
}

pub fn classify_shell_command(command: &str) -> Option<ShellCommandRuleMatch> {
    classify_shell_command_with_rules(command, &[])
}

pub fn classify_shell_command_with_rules(
    command: &str,
    configured_rules: &[ShellCommandRule],
) -> Option<ShellCommandRuleMatch> {
    split_shell_segments(command)
        .into_iter()
        .filter_map(classify_shell_segment)
        .chain(
            configured_rules
                .iter()
                .filter_map(|rule| classify_configured_shell_rule(command, rule)),
        )
        .max_by_key(|rule_match| {
            (
                shell_command_risk_rank(rule_match.risk_level),
                shell_command_source_rank(rule_match.source),
            )
        })
}

pub fn classify_network_access(
    tool_name: &str,
    params: &serde_json::Value,
    command: Option<&str>,
    configured_rules: &[NetworkRule],
) -> Option<NetworkRuleMatch> {
    extract_network_urls(tool_name, params, command)
        .into_iter()
        .flat_map(|url| classify_network_url(&url, configured_rules))
        .max_by_key(|rule_match| {
            (
                shell_command_risk_rank(rule_match.risk_level),
                shell_command_source_rank(rule_match.source),
            )
        })
}

fn split_shell_segments(command: &str) -> Vec<&str> {
    command
        .split(['\n', ';', '|'])
        .flat_map(|segment| segment.split("&&"))
        .flat_map(|segment| segment.split("||"))
        .collect()
}

fn classify_shell_segment(segment: &str) -> Option<ShellCommandRuleMatch> {
    let normalized = segment.trim();
    if normalized.is_empty() {
        return None;
    }

    let mut parts = normalized.split_whitespace();
    let command = parts
        .next()?
        .trim_matches(|value| value == '\'' || value == '"');
    let args = parts.collect::<Vec<_>>();

    match command {
        "sudo" | "su" => Some(shell_rule(
            "privileged_shell",
            ShellCommandRiskLevel::High,
            "privileged_shell_command",
            "命令会尝试提升权限",
        )),
        "rm" if args
            .iter()
            .any(|arg| rm_arg_requests_force_or_recursive(arg)) =>
        {
            Some(shell_rule(
                "destructive_remove",
                ShellCommandRiskLevel::High,
                "destructive_remove_command",
                "命令可能递归或强制删除文件",
            ))
        }
        "git" => classify_git_command(&args),
        "curl" | "wget" => Some(shell_rule(
            "network_download",
            ShellCommandRiskLevel::Medium,
            "network_download_command",
            "命令会访问网络或下载内容",
        )),
        "chmod" | "chown" => Some(shell_rule(
            "permission_mutation",
            ShellCommandRiskLevel::Medium,
            "permission_mutation_command",
            "命令会修改文件权限或所有者",
        )),
        "npm" | "pnpm" | "yarn"
            if args.first().is_some_and(|arg| {
                matches!(*arg, "install" | "add" | "remove" | "uninstall" | "publish")
            }) =>
        {
            Some(shell_rule(
                "package_manager_mutation",
                ShellCommandRiskLevel::Medium,
                "package_manager_mutation_command",
                "命令会修改依赖或发布包",
            ))
        }
        "cargo"
            if args
                .first()
                .is_some_and(|arg| matches!(*arg, "publish" | "install")) =>
        {
            Some(shell_rule(
                "package_manager_mutation",
                ShellCommandRiskLevel::Medium,
                "package_manager_mutation_command",
                "命令会修改工具链状态或发布包",
            ))
        }
        _ => None,
    }
}

fn rm_arg_requests_force_or_recursive(arg: &str) -> bool {
    match arg {
        "-r" | "-R" | "--recursive" | "-f" | "--force" => true,
        value if value.starts_with("--") => false,
        value if value.starts_with('-') => value
            .trim_start_matches('-')
            .chars()
            .any(|flag| matches!(flag, 'r' | 'R' | 'f')),
        _ => false,
    }
}

fn classify_git_command(args: &[&str]) -> Option<ShellCommandRuleMatch> {
    let subcommand = args.first()?;
    match *subcommand {
        "push" | "reset" | "clean" | "checkout" | "switch" | "branch" | "merge" | "rebase"
        | "commit" => Some(shell_rule(
            "git_state_mutation",
            ShellCommandRiskLevel::Medium,
            "git_state_mutation_command",
            "命令会修改 git 工作树、分支或远端状态",
        )),
        _ => None,
    }
}

fn classify_configured_shell_rule(
    command: &str,
    rule: &ShellCommandRule,
) -> Option<ShellCommandRuleMatch> {
    if rule.rule_id.trim().is_empty() || rule.pattern.trim().is_empty() {
        return None;
    }
    if !configured_rule_matches(command, rule) {
        return None;
    }

    Some(ShellCommandRuleMatch {
        rule_id: rule.rule_id.trim().to_string(),
        risk_level: rule.risk_level,
        reason_code: if rule.reason_code.trim().is_empty() {
            rule.rule_id.trim().to_string()
        } else {
            rule.reason_code.trim().to_string()
        },
        reason: if rule.reason.trim().is_empty() {
            "命令匹配自定义策略规则".to_string()
        } else {
            rule.reason.trim().to_string()
        },
        source: rule.source,
    })
}

fn configured_rule_matches(command: &str, rule: &ShellCommandRule) -> bool {
    let pattern = rule.pattern.trim();
    match rule.match_type {
        ShellCommandRuleMatchType::Regex => {
            Regex::new(pattern).is_ok_and(|regex| regex.is_match(command))
        }
        ShellCommandRuleMatchType::Prefix => command.trim_start().starts_with(pattern),
        ShellCommandRuleMatchType::Exact => command.trim() == pattern,
    }
}

fn classify_network_url(url: &str, configured_rules: &[NetworkRule]) -> Vec<NetworkRuleMatch> {
    let parsed = Url::parse(url).ok();
    let host = parsed
        .as_ref()
        .and_then(Url::host_str)
        .map(|value| value.to_ascii_lowercase());
    configured_rules
        .iter()
        .filter_map(|rule| classify_configured_network_rule(url, host.as_deref(), rule))
        .collect()
}

fn classify_configured_network_rule(
    url: &str,
    host: Option<&str>,
    rule: &NetworkRule,
) -> Option<NetworkRuleMatch> {
    if rule.rule_id.trim().is_empty() || rule.pattern.trim().is_empty() {
        return None;
    }

    let target_value = match rule.target {
        NetworkRuleTarget::Url => url,
        NetworkRuleTarget::Host => host?,
    };
    if !configured_network_rule_matches(target_value, rule) {
        return None;
    }

    Some(NetworkRuleMatch {
        rule_id: rule.rule_id.trim().to_string(),
        risk_level: rule.risk_level,
        reason_code: if rule.reason_code.trim().is_empty() {
            rule.rule_id.trim().to_string()
        } else {
            rule.reason_code.trim().to_string()
        },
        reason: if rule.reason.trim().is_empty() {
            "网络请求匹配自定义策略规则".to_string()
        } else {
            rule.reason.trim().to_string()
        },
        source: rule.source,
        target: rule.target,
        url: url.to_string(),
        host: host.map(str::to_string),
    })
}

fn configured_network_rule_matches(value: &str, rule: &NetworkRule) -> bool {
    let pattern = rule.pattern.trim();
    match rule.match_type {
        ShellCommandRuleMatchType::Regex => {
            Regex::new(pattern).is_ok_and(|regex| regex.is_match(value))
        }
        ShellCommandRuleMatchType::Prefix => value.trim_start().starts_with(pattern),
        ShellCommandRuleMatchType::Exact => value.trim() == pattern,
    }
}

fn extract_network_urls(
    tool_name: &str,
    params: &serde_json::Value,
    command: Option<&str>,
) -> Vec<String> {
    let mut urls = Vec::new();
    if is_web_network_tool(tool_name) {
        extract_string_params(
            params,
            &["url", "query", "search_url", "searchUrl"],
            &mut urls,
        );
    }
    if let Some(command) = command {
        urls.extend(extract_urls_from_command(command));
    }
    urls.sort();
    urls.dedup();
    urls
}

fn is_web_network_tool(tool_name: &str) -> bool {
    matches!(
        tool_lookup_key(tool_name).as_str(),
        "webfetch"
            | "webfetchtool"
            | "mcpsystemwebfetch"
            | "websearch"
            | "websearchtool"
            | "mcpsystemwebsearch"
    )
}

fn tool_lookup_key(tool_name: &str) -> String {
    tool_name
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_lowercase())
        .collect()
}

fn extract_string_params(params: &serde_json::Value, keys: &[&str], urls: &mut Vec<String>) {
    let Some(object) = params.as_object() else {
        return;
    };
    keys.iter()
        .filter_map(|key| object.get(*key))
        .filter_map(serde_json::Value::as_str)
        .for_each(|value| {
            urls.extend(extract_urls_from_text(value));
        });
}

fn extract_urls_from_command(command: &str) -> Vec<String> {
    split_shell_segments(command)
        .into_iter()
        .filter(|segment| {
            let command_name = segment
                .split_whitespace()
                .next()
                .map(|value| value.trim_matches(|char| char == '\'' || char == '"'));
            matches!(command_name, Some("curl" | "wget"))
        })
        .flat_map(extract_urls_from_text)
        .collect()
}

fn extract_urls_from_text(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|value| {
            value.trim_matches(|char| {
                matches!(
                    char,
                    '\'' | '"' | ',' | ')' | '(' | '[' | ']' | '{' | '}' | '<' | '>' | ';'
                )
            })
        })
        .filter(|value| value.starts_with("http://") || value.starts_with("https://"))
        .map(str::to_string)
        .collect()
}

fn shell_rule(
    rule_id: &'static str,
    risk_level: ShellCommandRiskLevel,
    reason_code: &'static str,
    reason: &'static str,
) -> ShellCommandRuleMatch {
    ShellCommandRuleMatch {
        rule_id: rule_id.to_string(),
        risk_level,
        reason_code: reason_code.to_string(),
        reason: reason.to_string(),
        source: ShellCommandRuleSource::Default,
    }
}

fn shell_command_risk_rank(risk_level: ShellCommandRiskLevel) -> u8 {
    match risk_level {
        ShellCommandRiskLevel::Low => 0,
        ShellCommandRiskLevel::Medium => 1,
        ShellCommandRiskLevel::High => 2,
    }
}

fn shell_command_source_rank(source: ShellCommandRuleSource) -> u8 {
    match source {
        ShellCommandRuleSource::Default => 0,
        ShellCommandRuleSource::Persisted => 1,
        ShellCommandRuleSource::Organization => 2,
        ShellCommandRuleSource::User => 3,
        ShellCommandRuleSource::Runtime => 4,
        ShellCommandRuleSource::Request => 5,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn shell_command_classifier_reports_highest_risk_segment() {
        let rule_match = classify_shell_command("git status && rm -rf target/tmp")
            .expect("shell command should match a policy rule");

        assert_eq!(rule_match.rule_id, "destructive_remove");
        assert_eq!(rule_match.risk_level.label(), "high");
        assert_eq!(rule_match.reason_code, "destructive_remove_command");
    }

    #[test]
    fn shell_command_classifier_does_not_treat_file_paths_as_rm_flags() {
        assert!(classify_shell_command("rm feature.txt").is_none());

        let rule_match = classify_shell_command("rm -Rf target/tmp")
            .expect("recursive force remove should match policy rule");
        assert_eq!(rule_match.rule_id, "destructive_remove");
    }

    #[test]
    fn runtime_shell_rule_takes_precedence_over_default_when_risk_is_higher() {
        let configured_rules = [ShellCommandRule {
            rule_id: "runtime_git_push".to_string(),
            match_type: ShellCommandRuleMatchType::Regex,
            pattern: "\\bgit\\s+push\\b".to_string(),
            risk_level: ShellCommandRiskLevel::High,
            reason_code: "runtime_blocks_git_push".to_string(),
            reason: "请求级策略要求人工确认 git push".to_string(),
            source: ShellCommandRuleSource::Runtime,
        }];

        let rule_match =
            classify_shell_command_with_rules("git push origin main", &configured_rules)
                .expect("configured shell rule should match");

        assert_eq!(rule_match.rule_id, "runtime_git_push");
        assert_eq!(rule_match.source.label(), "runtime");
        assert_eq!(rule_match.risk_level.label(), "high");
    }

    #[test]
    fn network_classifier_matches_web_tool_host_rule() {
        let configured_rules = [NetworkRule {
            rule_id: "internal_host".to_string(),
            match_type: ShellCommandRuleMatchType::Prefix,
            target: NetworkRuleTarget::Host,
            pattern: "internal.".to_string(),
            risk_level: ShellCommandRiskLevel::High,
            reason_code: "internal_network".to_string(),
            reason: "标记内部域名".to_string(),
            source: ShellCommandRuleSource::Persisted,
        }];

        let rule_match = classify_network_access(
            "web_fetch",
            &json!({ "url": "https://internal.example.test/docs" }),
            None,
            &configured_rules,
        )
        .expect("network rule should match web fetch url");

        assert_eq!(rule_match.rule_id, "internal_host");
        assert_eq!(rule_match.host.as_deref(), Some("internal.example.test"));
        assert_eq!(rule_match.target.label(), "host");
    }

    #[test]
    fn network_classifier_extracts_curl_urls_from_shell_command() {
        let configured_rules = [NetworkRule {
            rule_id: "download_url".to_string(),
            match_type: ShellCommandRuleMatchType::Prefix,
            target: NetworkRuleTarget::Url,
            pattern: "https://downloads.example.test/".to_string(),
            risk_level: ShellCommandRiskLevel::High,
            reason_code: "download_url".to_string(),
            reason: "标记下载 URL".to_string(),
            source: ShellCommandRuleSource::Request,
        }];

        let rule_match = classify_network_access(
            "exec_command",
            &json!({ "command": "curl -L https://downloads.example.test/archive.zip" }),
            Some("curl -L https://downloads.example.test/archive.zip"),
            &configured_rules,
        )
        .expect("network rule should match curl url");

        assert_eq!(rule_match.rule_id, "download_url");
        assert_eq!(rule_match.target.label(), "url");
        assert_eq!(rule_match.source.label(), "request");
    }
}
