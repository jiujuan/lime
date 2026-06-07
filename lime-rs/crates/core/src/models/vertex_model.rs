//! Vertex AI 配置模型
//!
//! 定义 Vertex AI 相关的配置类型，供 providers 和 config 模块共享。

use serde::{Deserialize, Serialize};

/// Vertex AI 模型别名映射
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VertexModelAlias {
    /// 上游模型名称
    pub name: String,
    /// 客户端可见的别名
    pub alias: String,
}

/// Vertex AI 凭证条目
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VertexApiKeyEntry {
    /// 凭证 ID
    pub id: String,
    /// API Key
    pub api_key: String,
    /// Base URL
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    /// 模型别名映射
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub models: Vec<VertexModelAlias>,
    /// 单独的代理 URL
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_url: Option<String>,
    /// 是否禁用
    #[serde(default)]
    pub disabled: bool,
}
