//! Legacy parameter injection Tauri commands.
//!
//! 前端旧注入设置面已退场；不要恢复这组 Tauri 命令作为生产配置入口。

const DEPRECATED_INJECTION_COMMAND_MESSAGE: &str =
    "参数注入 Tauri 命令已退场；生产运行时注入只允许走 Agent / Skill current 主链";

fn deprecated_injection_command_error(command: &str) -> String {
    tracing::warn!("[Injection] legacy Tauri command `{}` 已退场", command);
    format!("{command} 已退场；{DEPRECATED_INJECTION_COMMAND_MESSAGE}")
}

/// 获取注入配置
#[tauri::command]
pub async fn get_injection_config() -> Result<(), String> {
    Err(deprecated_injection_command_error("get_injection_config"))
}

/// 设置注入启用状态
#[tauri::command]
pub async fn set_injection_enabled() -> Result<(), String> {
    Err(deprecated_injection_command_error("set_injection_enabled"))
}

/// 获取所有注入规则
#[tauri::command]
pub async fn get_injection_rules() -> Result<(), String> {
    Err(deprecated_injection_command_error("get_injection_rules"))
}

/// 添加注入规则
#[tauri::command]
pub async fn add_injection_rule() -> Result<(), String> {
    Err(deprecated_injection_command_error("add_injection_rule"))
}

/// 移除注入规则
#[tauri::command]
pub async fn remove_injection_rule() -> Result<(), String> {
    Err(deprecated_injection_command_error("remove_injection_rule"))
}

/// 更新注入规则
#[tauri::command]
pub async fn update_injection_rule() -> Result<(), String> {
    Err(deprecated_injection_command_error("update_injection_rule"))
}
