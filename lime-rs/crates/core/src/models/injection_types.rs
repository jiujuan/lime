//! 参数注入类型定义
//!
//! 定义注入规则和注入模式的基础类型

use serde::{Deserialize, Serialize};

/// 注入模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum InjectionMode {
    /// 合并模式：不覆盖已有参数
    #[default]
    Merge,
    /// 覆盖模式：覆盖已有参数
    Override,
}

/// 注入规则
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InjectionRule {
    /// 规则 ID
    pub id: String,
    /// 模型匹配模式（支持通配符）
    pub pattern: String,
    /// 要注入的参数
    pub parameters: serde_json::Value,
    /// 注入模式
    #[serde(default)]
    pub mode: InjectionMode,
    /// 优先级（数字越小优先级越高）
    #[serde(default = "default_priority")]
    pub priority: i32,
    /// 是否启用
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_priority() -> i32 {
    100
}

fn default_enabled() -> bool {
    true
}

impl InjectionRule {
    /// 创建新的注入规则
    pub fn new(id: &str, pattern: &str, parameters: serde_json::Value) -> Self {
        Self {
            id: id.to_string(),
            pattern: pattern.to_string(),
            parameters,
            mode: InjectionMode::Merge,
            priority: default_priority(),
            enabled: true,
        }
    }

    /// 设置注入模式
    pub fn with_mode(mut self, mode: InjectionMode) -> Self {
        self.mode = mode;
        self
    }

    /// 设置优先级
    pub fn with_priority(mut self, priority: i32) -> Self {
        self.priority = priority;
        self
    }

    /// 检查是否为精确匹配规则
    pub fn is_exact(&self) -> bool {
        !self.pattern.contains('*')
    }

    /// 检查模型是否匹配此规则
    ///
    /// 支持的通配符模式：
    /// - 精确匹配: `claude-sonnet-4-5`
    /// - 前缀匹配: `claude-*`
    /// - 后缀匹配: `*-preview`
    /// - 包含匹配: `*flash*`
    pub fn matches(&self, model: &str) -> bool {
        if !self.enabled {
            return false;
        }
        pattern_matches(&self.pattern, model)
    }
}

/// 检查模式是否匹配模型名
///
/// 支持的通配符模式：
/// - 精确匹配: `claude-sonnet-4-5`
/// - 前缀匹配: `claude-*`
/// - 后缀匹配: `*-preview`
/// - 包含匹配: `*flash*`
pub fn pattern_matches(pattern: &str, model: &str) -> bool {
    if !pattern.contains('*') {
        return pattern == model;
    }

    let parts: Vec<&str> = pattern.split('*').collect();

    match parts.as_slice() {
        [prefix, ""] => model.starts_with(prefix),
        ["", suffix] => model.ends_with(suffix),
        ["", middle, ""] => model.contains(middle),
        [prefix, suffix] => model.starts_with(prefix) && model.ends_with(suffix),
        _ => false,
    }
}

/// 规则排序：精确匹配优先，然后按优先级
impl Ord for InjectionRule {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        match (self.is_exact(), other.is_exact()) {
            (true, false) => return std::cmp::Ordering::Less,
            (false, true) => return std::cmp::Ordering::Greater,
            _ => {}
        }
        self.priority.cmp(&other.priority)
    }
}

impl PartialOrd for InjectionRule {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Eq for InjectionRule {}
