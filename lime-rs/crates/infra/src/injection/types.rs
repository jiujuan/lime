//! 参数注入类型定义
//!
//! 基础类型（InjectionMode, InjectionRule）从 lime-core 重新导出。
//! 本模块定义注入器（Injector）和注入结果等 infra 层特有类型。

use serde::{Deserialize, Serialize};

// 从 core 重新导出基础类型
pub use lime_core::models::injection_types::{InjectionMode, InjectionRule};

/// 允许注入的参数白名单
/// 这些参数是安全的，不会影响请求的核心行为
const ALLOWED_INJECTION_PARAMS: &[&str] = &[
    "temperature",
    "max_tokens",
    "top_p",
    "top_k",
    "frequency_penalty",
    "presence_penalty",
    "stop",
    "seed",
    "n",
];

/// 禁止注入的参数黑名单（即使在白名单中也不允许 Override 模式）
const BLOCKED_OVERRIDE_PARAMS: &[&str] = &[
    "model",
    "messages",
    "tools",
    "tool_choice",
    "stream",
    "response_format",
];

/// 注入结果
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct InjectionResult {
    /// 应用的规则 ID 列表
    pub applied_rules: Vec<String>,
    /// 注入的参数名列表
    pub injected_params: Vec<String>,
}

impl InjectionResult {
    /// 创建空的注入结果
    pub fn new() -> Self {
        Self::default()
    }

    /// 检查是否有注入
    pub fn has_injections(&self) -> bool {
        !self.injected_params.is_empty()
    }
}

/// 注入配置
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
pub struct InjectionConfig {
    /// 是否启用注入
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    /// 注入规则列表
    #[serde(default)]
    pub rules: Vec<InjectionRule>,
}

fn default_enabled() -> bool {
    true
}

/// 参数注入器
#[derive(Debug, Clone, Default)]
pub struct Injector {
    /// 注入规则列表（已排序）
    rules: Vec<InjectionRule>,
}

impl Injector {
    /// 创建新的注入器
    pub fn new() -> Self {
        Self { rules: Vec::new() }
    }

    /// 从规则列表创建注入器
    pub fn with_rules(mut rules: Vec<InjectionRule>) -> Self {
        rules.sort();
        Self { rules }
    }

    /// 添加规则
    pub fn add_rule(&mut self, rule: InjectionRule) {
        self.rules.push(rule);
        self.rules.sort();
    }

    /// 移除规则
    pub fn remove_rule(&mut self, id: &str) -> Option<InjectionRule> {
        if let Some(pos) = self.rules.iter().position(|r| r.id == id) {
            Some(self.rules.remove(pos))
        } else {
            None
        }
    }

    /// 获取所有规则
    pub fn rules(&self) -> &[InjectionRule] {
        &self.rules
    }

    /// 获取匹配的规则
    pub fn matching_rules(&self, model: &str) -> Vec<&InjectionRule> {
        self.rules.iter().filter(|r| r.matches(model)).collect()
    }

    /// 清空所有规则
    pub fn clear(&mut self) {
        self.rules.clear();
    }

    /// 注入参数到请求
    ///
    /// 按规则优先级顺序应用注入：
    /// - Merge 模式：不覆盖已有参数
    /// - Override 模式：覆盖已有参数
    pub fn inject(&self, model: &str, payload: &mut serde_json::Value) -> InjectionResult {
        let mut result = InjectionResult::new();

        // 确保 payload 是对象
        let obj = match payload.as_object_mut() {
            Some(obj) => obj,
            None => return result,
        };

        // 按优先级顺序应用匹配的规则
        for rule in self.matching_rules(model) {
            let params = match rule.parameters.as_object() {
                Some(params) => params,
                None => continue,
            };

            let mut rule_applied = false;

            for (key, value) in params {
                // 安全修复：检查参数是否在白名单中
                if !ALLOWED_INJECTION_PARAMS.contains(&key.as_str()) {
                    tracing::warn!("[INJECTION] 参数 {} 不在白名单中，跳过注入", key);
                    continue;
                }

                // 安全修复：Override 模式下检查黑名单
                if rule.mode == InjectionMode::Override
                    && BLOCKED_OVERRIDE_PARAMS.contains(&key.as_str())
                {
                    tracing::warn!("[INJECTION] 参数 {} 禁止使用 Override 模式", key);
                    continue;
                }

                let should_inject = match rule.mode {
                    InjectionMode::Merge => !obj.contains_key(key),
                    InjectionMode::Override => true,
                };

                if should_inject {
                    obj.insert(key.clone(), value.clone());
                    if !result.injected_params.contains(key) {
                        result.injected_params.push(key.clone());
                    }
                    rule_applied = true;
                }
            }

            if rule_applied {
                result.applied_rules.push(rule.id.clone());
            }
        }

        result
    }
}
