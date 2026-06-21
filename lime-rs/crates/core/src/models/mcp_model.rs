use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// MCP 服务器配置（类型化）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfigTyped {
    /// 启动命令
    pub command: String,
    /// 命令参数
    #[serde(default)]
    pub args: Vec<String>,
    /// 环境变量
    #[serde(default)]
    pub env: HashMap<String, String>,
    /// 工作目录
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    /// 超时时间（秒）
    #[serde(default = "default_timeout")]
    pub timeout: u64,
}

fn default_timeout() -> u64 {
    30
}

impl Default for McpServerConfigTyped {
    fn default() -> Self {
        Self {
            command: String::new(),
            args: Vec::new(),
            env: HashMap::new(),
            cwd: None,
            timeout: 30,
        }
    }
}

/// 配置验证错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigValidationError {
    pub field: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServer {
    pub id: String,
    pub name: String,
    pub server_config: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub enabled_lime: bool,
    #[serde(default)]
    pub enabled_claude: bool,
    #[serde(default)]
    pub enabled_codex: bool,
    #[serde(default)]
    pub enabled_gemini: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<i64>,
}

impl McpServer {
    #[allow(dead_code)]
    pub fn new(id: String, name: String, server_config: Value) -> Self {
        Self {
            id,
            name,
            server_config,
            description: None,
            enabled_lime: false,
            enabled_claude: false,
            enabled_codex: false,
            enabled_gemini: false,
            created_at: Some(chrono::Utc::now().timestamp()),
        }
    }

    /// 解析 server_config 为类型化配置
    ///
    /// 将 JSON Value 解析为 McpServerConfigTyped 结构。
    /// 如果解析失败，返回默认配置并尝试提取基本字段。
    pub fn parse_config(&self) -> McpServerConfigTyped {
        serde_json::from_value(self.server_config.clone()).unwrap_or_else(|_| {
            // 尝试手动提取字段
            McpServerConfigTyped {
                command: self
                    .server_config
                    .get("command")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
                args: self
                    .server_config
                    .get("args")
                    .and_then(|v| v.as_array())
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default(),
                env: self
                    .server_config
                    .get("env")
                    .and_then(|v| v.as_object())
                    .map(|obj| {
                        obj.iter()
                            .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                            .collect()
                    })
                    .unwrap_or_default(),
                cwd: self
                    .server_config
                    .get("cwd")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                timeout: self
                    .server_config
                    .get("timeout")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(30),
            }
        })
    }

    /// 验证服务器配置
    ///
    /// 检查配置是否有效，返回验证错误列表。
    /// 空列表表示配置有效。
    pub fn validate_config(&self) -> Vec<ConfigValidationError> {
        let mut errors = Vec::new();
        let config = self.server_config.as_object();

        match config {
            Some(config) if is_streamable_http_config(config) => {
                let url = string_field(config, "url").unwrap_or_default();
                if !(url.starts_with("http://") || url.starts_with("https://")) {
                    errors.push(ConfigValidationError {
                        field: "url".to_string(),
                        message: "streamable HTTP MCP URL 必须以 http:// 或 https:// 开头"
                            .to_string(),
                    });
                }
                if config.contains_key("bearer_token") || config.contains_key("bearerToken") {
                    errors.push(ConfigValidationError {
                        field: "bearer_token".to_string(),
                        message: "streamable HTTP MCP 不支持内联 bearer_token，请使用 bearer_token_env_var"
                            .to_string(),
                    });
                }
                validate_oauth_config(config, &mut errors);
            }
            Some(config) => {
                if string_field(config, "command")
                    .unwrap_or_default()
                    .trim()
                    .is_empty()
                {
                    errors.push(ConfigValidationError {
                        field: "command".to_string(),
                        message: "启动命令不能为空".to_string(),
                    });
                }
                if config.contains_key("oauth")
                    || config.contains_key("oauth_resource")
                    || config.contains_key("oauthResource")
                    || config.contains_key("scopes")
                {
                    errors.push(ConfigValidationError {
                        field: "oauth".to_string(),
                        message: "OAuth MCP 配置只支持 streamable HTTP transport".to_string(),
                    });
                }
            }
            None => errors.push(ConfigValidationError {
                field: "server_config".to_string(),
                message: "MCP 配置必须是对象".to_string(),
            }),
        }

        // 验证 name 不为空
        if self.name.trim().is_empty() {
            errors.push(ConfigValidationError {
                field: "name".to_string(),
                message: "服务器名称不能为空".to_string(),
            });
        }

        // 验证 name 不包含特殊字符（用于工具名称前缀）
        if !self
            .name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
        {
            errors.push(ConfigValidationError {
                field: "name".to_string(),
                message: "服务器名称只能包含字母、数字、连字符和下划线".to_string(),
            });
        }

        // 验证 timeout 在合理范围内
        if let Some(config) = config {
            for field in [
                "timeout",
                "startup_timeout",
                "startupTimeout",
                "startup_timeout_sec",
                "startupTimeoutSec",
                "tool_timeout",
                "toolTimeout",
                "tool_timeout_sec",
                "toolTimeoutSec",
            ] {
                if let Some(timeout) = u64_field(config, field) {
                    if timeout == 0 || timeout > 300 {
                        errors.push(ConfigValidationError {
                            field: field.to_string(),
                            message: "超时时间必须在 1-300 秒之间".to_string(),
                        });
                    }
                }
            }
        }

        errors
    }

    /// 检查配置是否有效
    pub fn is_valid(&self) -> bool {
        self.validate_config().is_empty()
    }
}

fn is_streamable_http_config(config: &serde_json::Map<String, Value>) -> bool {
    matches!(
        string_field(config, "transport")
            .or_else(|| string_field(config, "type"))
            .as_deref(),
        Some("streamable_http" | "streamable-http" | "http")
    ) || (config.contains_key("url") && !config.contains_key("command"))
}

fn string_field(config: &serde_json::Map<String, Value>, field: &str) -> Option<String> {
    config
        .get(field)
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
}

fn u64_field(config: &serde_json::Map<String, Value>, field: &str) -> Option<u64> {
    config.get(field).and_then(|value| {
        value.as_u64().or_else(|| {
            value
                .as_f64()
                .and_then(|value| (value >= 0.0).then_some(value as u64))
        })
    })
}

fn validate_oauth_config(
    config: &serde_json::Map<String, Value>,
    errors: &mut Vec<ConfigValidationError>,
) {
    if let Some(scopes) = config.get("scopes") {
        let valid_scopes = scopes
            .as_array()
            .is_some_and(|values| values.iter().all(|value| value.as_str().is_some()));
        if !valid_scopes {
            errors.push(ConfigValidationError {
                field: "scopes".to_string(),
                message: "OAuth scopes 必须是字符串数组".to_string(),
            });
        }
    }

    if let Some(oauth) = config.get("oauth") {
        let Some(oauth) = oauth.as_object() else {
            errors.push(ConfigValidationError {
                field: "oauth".to_string(),
                message: "OAuth 配置必须是对象".to_string(),
            });
            return;
        };
        for key in oauth.keys() {
            if key != "client_id" && key != "clientId" {
                errors.push(ConfigValidationError {
                    field: format!("oauth.{key}"),
                    message: "OAuth 配置当前只支持 client_id".to_string(),
                });
            }
        }
    }

    for field in ["oauth_resource", "oauthResource"] {
        if config
            .get(field)
            .is_some_and(|value| value.as_str().is_none())
        {
            errors.push(ConfigValidationError {
                field: field.to_string(),
                message: "OAuth resource 必须是字符串".to_string(),
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server(name: &str, server_config: Value) -> McpServer {
        McpServer {
            id: format!("{name}-id"),
            name: name.to_string(),
            server_config,
            description: None,
            enabled_lime: true,
            enabled_claude: false,
            enabled_codex: false,
            enabled_gemini: false,
            created_at: None,
        }
    }

    #[test]
    fn streamable_http_config_does_not_require_stdio_command() {
        let server = server(
            "remote-docs",
            serde_json::json!({
                "transport": "streamable_http",
                "url": "https://example.com/mcp",
                "tool_timeout": 15
            }),
        );

        assert!(server.validate_config().is_empty());
    }

    #[test]
    fn invalid_streamable_http_url_is_rejected() {
        let server = server(
            "remote-docs",
            serde_json::json!({
                "transport": "streamable_http",
                "url": "file:///tmp/mcp"
            }),
        );

        let errors = server.validate_config();
        assert!(errors.iter().any(|error| error.field == "url"));
    }

    #[test]
    fn streamable_http_oauth_shape_is_allowed_for_save() {
        let server = server(
            "remote-docs",
            serde_json::json!({
                "transport": "streamable_http",
                "url": "https://example.com/mcp",
                "scopes": ["search.read"],
                "oauth": { "client_id": "lime-client" },
                "oauth_resource": "https://example.com"
            }),
        );

        assert!(server.validate_config().is_empty());
    }

    #[test]
    fn stdio_oauth_shape_is_rejected() {
        let server = server(
            "local-docs",
            serde_json::json!({
                "transport": "stdio",
                "command": "node",
                "oauth": { "client_id": "lime-client" }
            }),
        );

        let errors = server.validate_config();
        assert!(errors.iter().any(|error| error.field == "oauth"));
    }

    #[test]
    fn inline_bearer_token_is_rejected() {
        let server = server(
            "remote-docs",
            serde_json::json!({
                "transport": "streamable_http",
                "url": "https://example.com/mcp",
                "bearer_token": "secret"
            }),
        );

        let errors = server.validate_config();
        assert!(errors.iter().any(|error| error.field == "bearer_token"));
    }
}
