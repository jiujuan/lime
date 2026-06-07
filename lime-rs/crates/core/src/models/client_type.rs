//! 客户端类型检测模块
//!
//! 通过解析 HTTP 请求的 User-Agent 头来识别客户端类型。

#![allow(dead_code)]

use serde::{Deserialize, Serialize};

/// 客户端类型枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClientType {
    /// Cursor 编辑器
    Cursor,
    /// Claude Code 客户端
    ClaudeCode,
    /// OpenAI Codex CLI
    Codex,
    /// Windsurf 编辑器
    Windsurf,
    /// Kiro IDE
    Kiro,
    /// 未识别的客户端
    Other,
}

impl ClientType {
    /// 从 User-Agent 字符串检测客户端类型
    pub fn from_user_agent(user_agent: &str) -> Self {
        let ua_lower = user_agent.to_lowercase();

        if ua_lower.contains("cursor") {
            ClientType::Cursor
        } else if ua_lower.contains("claude-code") || ua_lower.contains("claude_code") {
            ClientType::ClaudeCode
        } else if ua_lower.contains("codex") {
            ClientType::Codex
        } else if ua_lower.contains("windsurf") {
            ClientType::Windsurf
        } else if ua_lower.contains("kiro") {
            ClientType::Kiro
        } else {
            ClientType::Other
        }
    }

    /// 获取配置键名
    pub fn config_key(&self) -> &'static str {
        match self {
            ClientType::Cursor => "cursor",
            ClientType::ClaudeCode => "claude_code",
            ClientType::Codex => "codex",
            ClientType::Windsurf => "windsurf",
            ClientType::Kiro => "kiro",
            ClientType::Other => "other",
        }
    }

    /// 获取所有客户端类型
    pub fn all() -> &'static [ClientType] {
        &[
            ClientType::Cursor,
            ClientType::ClaudeCode,
            ClientType::Codex,
            ClientType::Windsurf,
            ClientType::Kiro,
            ClientType::Other,
        ]
    }

    /// 从配置键名解析客户端类型
    pub fn from_config_key(key: &str) -> Option<Self> {
        match key {
            "cursor" => Some(ClientType::Cursor),
            "claude_code" => Some(ClientType::ClaudeCode),
            "codex" => Some(ClientType::Codex),
            "windsurf" => Some(ClientType::Windsurf),
            "kiro" => Some(ClientType::Kiro),
            "other" => Some(ClientType::Other),
            _ => None,
        }
    }
}

impl std::fmt::Display for ClientType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.config_key())
    }
}

/// 根据客户端类型和端点配置选择 Provider
pub fn select_provider(
    _client_type: ClientType,
    endpoint_provider: Option<&String>,
    default_provider: &str,
) -> String {
    match endpoint_provider {
        Some(provider) => provider.clone(),
        None => default_provider.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_user_agent_cursor() {
        assert_eq!(
            ClientType::from_user_agent("Cursor/1.0"),
            ClientType::Cursor
        );
        assert_eq!(ClientType::from_user_agent("cursor"), ClientType::Cursor);
        assert_eq!(ClientType::from_user_agent("CURSOR"), ClientType::Cursor);
    }

    #[test]
    fn test_from_user_agent_claude_code() {
        assert_eq!(
            ClientType::from_user_agent("Claude-Code/2.0"),
            ClientType::ClaudeCode
        );
        assert_eq!(
            ClientType::from_user_agent("claude-code"),
            ClientType::ClaudeCode
        );
        assert_eq!(
            ClientType::from_user_agent("claude_code"),
            ClientType::ClaudeCode
        );
    }

    #[test]
    fn test_from_user_agent_other() {
        assert_eq!(ClientType::from_user_agent("Unknown"), ClientType::Other);
        assert_eq!(ClientType::from_user_agent(""), ClientType::Other);
    }

    #[test]
    fn test_config_key() {
        assert_eq!(ClientType::Cursor.config_key(), "cursor");
        assert_eq!(ClientType::ClaudeCode.config_key(), "claude_code");
    }

    #[test]
    fn test_from_config_key() {
        assert_eq!(
            ClientType::from_config_key("cursor"),
            Some(ClientType::Cursor)
        );
        assert_eq!(ClientType::from_config_key("invalid"), None);
    }

    #[test]
    fn test_all_client_types() {
        assert_eq!(ClientType::all().len(), 6);
    }

    #[test]
    fn test_serialization() {
        let json = serde_json::to_string(&ClientType::Cursor).unwrap();
        assert_eq!(json, "\"cursor\"");
    }
}
