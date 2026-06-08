//! 模型配置 legacy Tauri 命令模块
//!
//! Provider / Model 生产事实源已迁移到 App Server JSON-RPC `model*` / `modelProvider*`
//! / `modelProviderKey*` 方法。旧 Tauri helper 仅保留 fail-closed 退场面，防止继续读取
//! 或写入旧 `state.config.models`。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const CURRENT_MODEL_PROVIDER_PATH: &str = "App Server JSON-RPC model/modelProvider current 主链";

fn deprecated_model_provider_command_error(command: &str) -> String {
    tracing::warn!(
        "[Models] legacy Tauri command `{}` 已退场；请改走 {}",
        command,
        CURRENT_MODEL_PROVIDER_PATH
    );
    format!("{command} 已退场；Provider / Model 只能走 {CURRENT_MODEL_PROVIDER_PATH}")
}

/// 旧 Tauri 模型配置读取命令已退场。
#[tauri::command]
pub async fn get_models_config() -> Result<(), String> {
    Err(deprecated_model_provider_command_error("get_models_config"))
}

/// 旧 Tauri 模型配置写入命令已退场。
#[tauri::command]
pub async fn save_models_config(_config: serde_json::Value) -> Result<(), String> {
    Err(deprecated_model_provider_command_error(
        "save_models_config",
    ))
}

/// 旧 Tauri Provider 模型列表命令已退场。
#[tauri::command]
pub async fn get_provider_models(_provider: String) -> Result<Vec<String>, String> {
    Err(deprecated_model_provider_command_error(
        "get_provider_models",
    ))
}

/// 简化的 Provider 配置（用于前端）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimpleProviderConfig {
    pub label: String,
    pub models: Vec<String>,
}

/// 旧 Tauri Provider 简化配置命令已退场。
#[tauri::command]
pub async fn get_all_provider_models() -> Result<HashMap<String, SimpleProviderConfig>, String> {
    Err(deprecated_model_provider_command_error(
        "get_all_provider_models",
    ))
}

/// 旧 Tauri Provider 模型写入命令已退场。
#[tauri::command]
pub async fn add_model_to_provider(
    _provider: String,
    _model_id: String,
    _model_name: Option<String>,
) -> Result<(), String> {
    Err(deprecated_model_provider_command_error(
        "add_model_to_provider",
    ))
}

/// 旧 Tauri Provider 模型移除命令已退场。
#[tauri::command]
pub async fn remove_model_from_provider(
    _provider: String,
    _model_id: String,
) -> Result<(), String> {
    Err(deprecated_model_provider_command_error(
        "remove_model_from_provider",
    ))
}

/// 旧 Tauri Provider 模型启用状态命令已退场。
#[tauri::command]
pub async fn toggle_model_enabled(
    _provider: String,
    _model_id: String,
    _enabled: bool,
) -> Result<(), String> {
    Err(deprecated_model_provider_command_error(
        "toggle_model_enabled",
    ))
}

/// 旧 Tauri Provider 创建命令已退场。
#[tauri::command]
pub async fn add_provider(_provider_id: String, _label: String) -> Result<(), String> {
    Err(deprecated_model_provider_command_error("add_provider"))
}

/// 旧 Tauri Provider 删除命令已退场。
#[tauri::command]
pub async fn remove_provider(_provider_id: String) -> Result<(), String> {
    Err(deprecated_model_provider_command_error("remove_provider"))
}
