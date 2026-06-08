//! Experimental config legacy Tauri 命令模块
//!
//! 生产事实源已迁到 Electron Host `config.json` current 实现；旧 Tauri wrapper 只保留
//! fail-closed 退场面，防止继续读写 `GlobalConfigManagerState`。

use crate::config::ExperimentalFeatures;
use tauri::command;

const CURRENT_EXPERIMENTAL_CONFIG_PATH: &str = "Electron Host config.json current 主链";

fn deprecated_experimental_command_error(command: &str) -> String {
    tracing::warn!(
        "[Experimental] legacy Tauri command `{}` 已退场；请改走 {}",
        command,
        CURRENT_EXPERIMENTAL_CONFIG_PATH
    );
    format!("{command} 已退场；Experimental config 只能走 {CURRENT_EXPERIMENTAL_CONFIG_PATH}")
}

#[command]
pub async fn get_experimental_config() -> Result<ExperimentalFeatures, String> {
    Err(deprecated_experimental_command_error(
        "get_experimental_config",
    ))
}

#[command]
pub async fn save_experimental_config(
    _experimental_config: ExperimentalFeatures,
) -> Result<(), String> {
    Err(deprecated_experimental_command_error(
        "save_experimental_config",
    ))
}
