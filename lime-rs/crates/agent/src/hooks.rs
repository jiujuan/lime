//! Agent Hook 系统
//!
//! 提供轻量级事件钩子，允许在工具调用、提交等操作前后执行自定义 shell 命令。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tokio::process::Command;

/// Hook 事件类型
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum HookEvent {
    BeforeToolCall,
    AfterToolCall,
    BeforePromptSubmit,
    AfterPromptSubmit,
    AfterCommit,
    OnError,
    SessionStart,
    SessionEnd,
    SubagentStart,
    SubagentStop,
    PreCompact,
    PermissionRequest,
}

/// Hook 匹配条件
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HookMatcher {
    /// 匹配特定工具名（支持正则：/pattern/）
    pub tool: Option<String>,
    /// 匹配特定模式的内容
    pub content_pattern: Option<String>,
}

/// 单个 Hook 定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookDefinition {
    pub event: HookEvent,
    #[serde(default)]
    pub matcher: HookMatcher,
    /// 要执行的 shell 命令
    pub command: String,
    /// 超时时间（秒）
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    /// Hook 失败是否阻止原操作
    #[serde(default)]
    pub blocking: bool,
    /// 是否异步后台执行（不等待结果）
    #[serde(default)]
    pub async_exec: bool,
}

fn default_timeout() -> u64 {
    10
}

fn shell_command_flag(shell: &str) -> &'static str {
    let executable = std::path::Path::new(shell)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(shell)
        .to_ascii_lowercase();

    if executable == "cmd" || executable == "cmd.exe" {
        "/C"
    } else if executable.contains("powershell") || executable == "pwsh" || executable == "pwsh.exe"
    {
        "-Command"
    } else {
        "-c"
    }
}

fn resolve_command_shell() -> String {
    let shell_from_env = std::env::var("SHELL").ok().and_then(|value| {
        let cleaned = value
            .split('\0')
            .next()
            .unwrap_or_default()
            .trim()
            .to_string();
        (!cleaned.is_empty()).then_some(cleaned)
    });

    #[cfg(target_os = "windows")]
    {
        if let Some(shell) = shell_from_env {
            let path = std::path::Path::new(&shell);
            if path.is_absolute() && path.exists() {
                return shell;
            }
        }

        if let Ok(comspec) = std::env::var("COMSPEC") {
            let cleaned = comspec
                .split('\0')
                .next()
                .unwrap_or_default()
                .trim()
                .to_string();
            if !cleaned.is_empty() && std::path::Path::new(&cleaned).exists() {
                return cleaned;
            }
        }

        "cmd.exe".to_string()
    }

    #[cfg(not(target_os = "windows"))]
    {
        if let Some(shell) = shell_from_env {
            if std::path::Path::new(&shell).exists() {
                return shell;
            }
        }

        if std::path::Path::new("/bin/sh").exists() {
            "/bin/sh".to_string()
        } else {
            "sh".to_string()
        }
    }
}

/// Hook 执行结果
#[derive(Debug)]
pub struct HookResult {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub blocked: bool,
    /// 注入到对话上下文的额外信息
    pub additional_context: Option<String>,
}

/// Hook 执行上下文
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookContext {
    pub tool_name: Option<String>,
    pub content: Option<String>,
    pub metadata: HashMap<String, String>,
}

/// Hook 配置文件结构（旧格式）
#[derive(Debug, Deserialize)]
struct HookConfig {
    hooks: Vec<HookDefinition>,
}

/// 新格式：按事件分组
#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum HookConfigFormat {
    /// 旧格式：{ "hooks": [...] }
    Legacy(HookConfig),
    /// 新格式：{ "hooks": { "BeforeToolCall": [...], ... } }
    Grouped(GroupedHookConfig),
}

#[derive(Debug, Deserialize)]
struct GroupedHookConfig {
    hooks: HashMap<HookEvent, Vec<GroupedHookEntry>>,
}

#[derive(Debug, Deserialize)]
struct GroupedHookEntry {
    command: String,
    #[serde(default)]
    matcher: HookMatcher,
    #[serde(default = "default_timeout")]
    timeout_secs: u64,
    #[serde(default)]
    blocking: bool,
    #[serde(default)]
    async_exec: bool,
}

/// Hook 管理器
pub struct HookManager {
    hooks: Vec<HookDefinition>,
}

impl HookManager {
    pub fn new() -> Self {
        Self { hooks: Vec::new() }
    }

    /// 从配置文件加载 hooks
    pub fn load_from_config(config_path: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        let content = std::fs::read_to_string(config_path)?;
        let format: HookConfigFormat = serde_json::from_str(&content)?;
        let hooks = match format {
            HookConfigFormat::Legacy(config) => config.hooks,
            HookConfigFormat::Grouped(grouped) => {
                let mut hooks = Vec::new();
                for (event, entries) in grouped.hooks {
                    for entry in entries {
                        hooks.push(HookDefinition {
                            event: event.clone(),
                            matcher: entry.matcher,
                            command: entry.command,
                            timeout_secs: entry.timeout_secs,
                            blocking: entry.blocking,
                            async_exec: entry.async_exec,
                        });
                    }
                }
                hooks
            }
        };
        Ok(Self { hooks })
    }

    /// 注册一个 hook
    pub fn register(&mut self, hook: HookDefinition) {
        self.hooks.push(hook);
    }

    /// 触发指定事件的所有匹配 hooks
    pub async fn trigger(&self, event: HookEvent, context: &HookContext) -> Vec<HookResult> {
        let matching: Vec<&HookDefinition> = self
            .hooks
            .iter()
            .filter(|h| h.event == event && Self::matches(h, context))
            .collect();

        let mut results = Vec::with_capacity(matching.len());
        for hook in matching {
            results.push(Self::execute_hook(hook, context).await);
        }
        results
    }

    /// 检查是否有任何 hook 阻止了操作
    pub fn is_blocked(results: &[HookResult]) -> bool {
        results.iter().any(|r| r.blocked)
    }

    fn matches(hook: &HookDefinition, context: &HookContext) -> bool {
        if let Some(ref tool_pattern) = hook.matcher.tool {
            match &context.tool_name {
                Some(name) => {
                    if tool_pattern.starts_with('/')
                        && tool_pattern.ends_with('/')
                        && tool_pattern.len() > 2
                    {
                        let pattern = &tool_pattern[1..tool_pattern.len() - 1];
                        match regex::Regex::new(pattern) {
                            Ok(re) => {
                                if !re.is_match(name) {
                                    return false;
                                }
                            }
                            Err(_) => return false,
                        }
                    } else if name != tool_pattern {
                        return false;
                    }
                }
                None => return false,
            }
        }
        if let Some(ref content_pattern) = hook.matcher.content_pattern {
            match &context.content {
                Some(content) => {
                    if !content.contains(content_pattern) {
                        return false;
                    }
                }
                None => return false,
            }
        }
        true
    }

    async fn execute_hook(hook: &HookDefinition, context: &HookContext) -> HookResult {
        let context_json = serde_json::to_string(context).unwrap_or_default();
        let shell = resolve_command_shell();
        let shell_flag = shell_command_flag(&shell);

        let child = Command::new(&shell)
            .arg(shell_flag)
            .arg(&hook.command)
            .env(
                "HOOK_EVENT",
                serde_json::to_string(&hook.event).unwrap_or_default(),
            )
            .env("HOOK_TOOL_NAME", context.tool_name.as_deref().unwrap_or(""))
            .env("HOOK_CONTEXT", &context_json)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn();

        let mut child = match child {
            Ok(c) => c,
            Err(e) => {
                return HookResult {
                    success: false,
                    stdout: String::new(),
                    stderr: format!("执行失败: {e}"),
                    blocked: hook.blocking,
                    additional_context: None,
                };
            }
        };

        // 通过 stdin 写入完整上下文 JSON
        if let Some(mut stdin) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            let _ = stdin.write_all(context_json.as_bytes()).await;
            drop(stdin);
        }

        // 异步后台执行，不等待结果
        if hook.async_exec {
            tokio::spawn(async move {
                let _ = child.wait().await;
            });
            return HookResult {
                success: true,
                stdout: String::new(),
                stderr: String::new(),
                blocked: false,
                additional_context: None,
            };
        }

        let result = tokio::time::timeout(
            std::time::Duration::from_secs(hook.timeout_secs),
            child.wait_with_output(),
        )
        .await;

        match result {
            Ok(Ok(output)) => {
                let success = output.status.success();
                let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
                let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
                let additional_context = if success {
                    serde_json::from_str::<serde_json::Value>(&stdout)
                        .ok()
                        .and_then(|v| {
                            v.get("additional_context")
                                .and_then(|c| c.as_str().map(String::from))
                        })
                } else {
                    None
                };
                HookResult {
                    success,
                    stdout,
                    stderr,
                    blocked: hook.blocking && !success,
                    additional_context,
                }
            }
            Ok(Err(e)) => HookResult {
                success: false,
                stdout: String::new(),
                stderr: format!("执行失败: {e}"),
                blocked: hook.blocking,
                additional_context: None,
            },
            Err(_) => HookResult {
                success: false,
                stdout: String::new(),
                stderr: format!("超时 ({}s)", hook.timeout_secs),
                blocked: hook.blocking,
                additional_context: None,
            },
        }
    }
}

impl Default for HookManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_context(tool: Option<&str>, content: Option<&str>) -> HookContext {
        HookContext {
            tool_name: tool.map(String::from),
            content: content.map(String::from),
            metadata: HashMap::new(),
        }
    }

    fn make_hook(event: HookEvent, command: &str, blocking: bool) -> HookDefinition {
        HookDefinition {
            event,
            matcher: HookMatcher::default(),
            command: command.to_string(),
            timeout_secs: 5,
            blocking,
            async_exec: false,
        }
    }

    #[test]
    fn test_new_manager_is_empty() {
        let mgr = HookManager::new();
        assert!(mgr.hooks.is_empty());
    }

    #[test]
    fn test_register_hook() {
        let mut mgr = HookManager::new();
        mgr.register(make_hook(HookEvent::BeforeToolCall, "echo hi", false));
        assert_eq!(mgr.hooks.len(), 1);
    }

    #[test]
    fn test_matcher_no_constraints() {
        let hook = make_hook(HookEvent::BeforeToolCall, "echo hi", false);
        let ctx = make_context(None, None);
        assert!(HookManager::matches(&hook, &ctx));
    }

    #[test]
    fn test_matcher_tool_match() {
        let mut hook = make_hook(HookEvent::BeforeToolCall, "echo hi", false);
        hook.matcher.tool = Some("read_file".to_string());

        let ctx_match = make_context(Some("read_file"), None);
        assert!(HookManager::matches(&hook, &ctx_match));

        let ctx_no_match = make_context(Some("write_file"), None);
        assert!(!HookManager::matches(&hook, &ctx_no_match));

        let ctx_none = make_context(None, None);
        assert!(!HookManager::matches(&hook, &ctx_none));
    }

    #[test]
    fn test_matcher_content_pattern() {
        let mut hook = make_hook(HookEvent::BeforeToolCall, "echo hi", false);
        hook.matcher.content_pattern = Some("secret".to_string());

        let ctx_match = make_context(None, Some("this has secret inside"));
        assert!(HookManager::matches(&hook, &ctx_match));

        let ctx_no_match = make_context(None, Some("nothing here"));
        assert!(!HookManager::matches(&hook, &ctx_no_match));
    }

    #[test]
    fn test_is_blocked() {
        let results = vec![
            HookResult {
                success: true,
                stdout: String::new(),
                stderr: String::new(),
                blocked: false,
                additional_context: None,
            },
            HookResult {
                success: false,
                stdout: String::new(),
                stderr: String::new(),
                blocked: true,
                additional_context: None,
            },
        ];
        assert!(HookManager::is_blocked(&results));

        let results_ok = vec![HookResult {
            success: true,
            stdout: String::new(),
            stderr: String::new(),
            blocked: false,
            additional_context: None,
        }];
        assert!(!HookManager::is_blocked(&results_ok));
    }

    #[test]
    fn test_shell_command_flag_for_common_shells() {
        assert_eq!(shell_command_flag("cmd.exe"), "/C");
        assert_eq!(shell_command_flag("pwsh"), "-Command");
        assert_eq!(shell_command_flag("/bin/sh"), "-c");
    }

    #[test]
    fn test_resolve_command_shell_not_empty() {
        let shell = resolve_command_shell();
        assert!(!shell.trim().is_empty());
    }

    #[tokio::test]
    async fn test_trigger_executes_matching_hooks() {
        let mut mgr = HookManager::new();
        mgr.register(make_hook(HookEvent::BeforeToolCall, "echo hello", false));
        mgr.register(make_hook(HookEvent::AfterToolCall, "echo world", false));

        let ctx = make_context(None, None);
        let results = mgr.trigger(HookEvent::BeforeToolCall, &ctx).await;
        assert_eq!(results.len(), 1);
        assert!(results[0].success);
        assert!(results[0].stdout.contains("hello"));
    }

    #[tokio::test]
    async fn test_trigger_blocking_hook_failure() {
        let mut mgr = HookManager::new();
        mgr.register(make_hook(HookEvent::OnError, "exit 1", true));

        let ctx = make_context(None, None);
        let results = mgr.trigger(HookEvent::OnError, &ctx).await;
        assert_eq!(results.len(), 1);
        assert!(!results[0].success);
        assert!(results[0].blocked);
        assert!(HookManager::is_blocked(&results));
    }

    #[tokio::test]
    async fn test_trigger_timeout() {
        let mut mgr = HookManager::new();
        let mut hook = make_hook(HookEvent::BeforeToolCall, "sleep 30", true);
        hook.timeout_secs = 1;
        mgr.register(hook);

        let ctx = make_context(None, None);
        let results = mgr.trigger(HookEvent::BeforeToolCall, &ctx).await;
        assert_eq!(results.len(), 1);
        assert!(!results[0].success);
        assert!(results[0].blocked);
        assert!(results[0].stderr.contains("超时"));
    }

    #[test]
    fn test_load_from_config() {
        let dir = tempfile::tempdir().unwrap();
        let config_path = dir.path().join("hooks.json");
        let config = r#"{
            "hooks": [
                {
                    "event": "BeforeToolCall",
                    "command": "echo test",
                    "blocking": false
                }
            ]
        }"#;
        std::fs::write(&config_path, config).unwrap();

        let mgr = HookManager::load_from_config(&config_path).unwrap();
        assert_eq!(mgr.hooks.len(), 1);
        assert_eq!(mgr.hooks[0].event, HookEvent::BeforeToolCall);
        assert_eq!(mgr.hooks[0].timeout_secs, 10); // default
    }

    #[test]
    fn test_load_from_config_invalid_path() {
        let result = HookManager::load_from_config(Path::new("/nonexistent/hooks.json"));
        assert!(result.is_err());
    }

    // --- 新增测试 ---

    #[test]
    fn test_regex_tool_matching() {
        let mut hook = make_hook(HookEvent::BeforeToolCall, "echo hi", false);
        hook.matcher.tool = Some("/^read_.*/".to_string());

        let ctx_match = make_context(Some("read_file"), None);
        assert!(HookManager::matches(&hook, &ctx_match));

        let ctx_match2 = make_context(Some("read_dir"), None);
        assert!(HookManager::matches(&hook, &ctx_match2));

        let ctx_no_match = make_context(Some("write_file"), None);
        assert!(!HookManager::matches(&hook, &ctx_no_match));

        let ctx_none = make_context(None, None);
        assert!(!HookManager::matches(&hook, &ctx_none));
    }

    #[test]
    fn test_regex_invalid_pattern() {
        let mut hook = make_hook(HookEvent::BeforeToolCall, "echo hi", false);
        hook.matcher.tool = Some("/[invalid/".to_string());

        let ctx = make_context(Some("anything"), None);
        assert!(!HookManager::matches(&hook, &ctx));
    }

    #[tokio::test]
    async fn test_async_exec_hook() {
        let mut mgr = HookManager::new();
        let mut hook = make_hook(HookEvent::BeforeToolCall, "sleep 10", false);
        hook.async_exec = true;
        mgr.register(hook);

        let ctx = make_context(None, None);
        let start = std::time::Instant::now();
        let results = mgr.trigger(HookEvent::BeforeToolCall, &ctx).await;
        let elapsed = start.elapsed();

        assert_eq!(results.len(), 1);
        assert!(results[0].success);
        assert!(results[0].stdout.is_empty());
        assert!(results[0].additional_context.is_none());
        // 异步执行应该立即返回，不会等待 sleep 10
        assert!(elapsed.as_secs() < 2);
    }

    #[test]
    fn test_new_hook_events() {
        // 验证新事件类型可以正确序列化/反序列化
        let events = vec![
            HookEvent::SessionStart,
            HookEvent::SessionEnd,
            HookEvent::SubagentStart,
            HookEvent::SubagentStop,
            HookEvent::PreCompact,
            HookEvent::PermissionRequest,
        ];
        for event in &events {
            let json = serde_json::to_string(event).unwrap();
            let deserialized: HookEvent = serde_json::from_str(&json).unwrap();
            assert_eq!(&deserialized, event);
        }
    }

    #[test]
    fn test_grouped_config_format() {
        let dir = tempfile::tempdir().unwrap();
        let config_path = dir.path().join("hooks.json");
        let config = r#"{
            "hooks": {
                "BeforeToolCall": [
                    {
                        "command": "echo before",
                        "blocking": true
                    }
                ],
                "AfterToolCall": [
                    {
                        "command": "echo after1"
                    },
                    {
                        "command": "echo after2",
                        "matcher": { "tool": "read_file" }
                    }
                ]
            }
        }"#;
        std::fs::write(&config_path, config).unwrap();

        let mgr = HookManager::load_from_config(&config_path).unwrap();
        assert_eq!(mgr.hooks.len(), 3);

        let before_hooks: Vec<_> = mgr
            .hooks
            .iter()
            .filter(|h| h.event == HookEvent::BeforeToolCall)
            .collect();
        assert_eq!(before_hooks.len(), 1);
        assert!(before_hooks[0].blocking);
        assert_eq!(before_hooks[0].command, "echo before");

        let after_hooks: Vec<_> = mgr
            .hooks
            .iter()
            .filter(|h| h.event == HookEvent::AfterToolCall)
            .collect();
        assert_eq!(after_hooks.len(), 2);
    }
}
