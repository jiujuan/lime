//! Window control legacy Tauri commands.
//!
//! 窗口控制生产面已退场；后续需要窗口壳能力时，应走 Electron Desktop Host current
//! bridge，而不是恢复旧 Tauri wrapper。

const DEPRECATED_WINDOW_COMMAND_MESSAGE: &str =
    "窗口控制 Tauri 命令已退场；请使用 Electron Desktop Host current 壳能力";

fn deprecated_window_command_error(command: &str) -> String {
    tracing::warn!("[Window] legacy Tauri command `{}` 已退场", command);
    format!("{command} 已退场；{DEPRECATED_WINDOW_COMMAND_MESSAGE}")
}

/// 获取当前窗口大小
#[tauri::command]
pub fn get_window_size() -> Result<(u32, u32), String> {
    Err(deprecated_window_command_error("get_window_size"))
}

/// 设置窗口大小
#[tauri::command]
pub fn set_window_size(_width: u32, _height: u32) -> Result<(), String> {
    Err(deprecated_window_command_error("set_window_size"))
}

/// 居中窗口
#[tauri::command]
pub fn center_window() -> Result<(), String> {
    Err(deprecated_window_command_error("center_window"))
}

/// 切换全屏模式
#[tauri::command]
pub fn toggle_fullscreen() -> Result<(), String> {
    Err(deprecated_window_command_error("toggle_fullscreen"))
}

/// 检查是否全屏
#[tauri::command]
pub fn is_fullscreen() -> Result<bool, String> {
    Err(deprecated_window_command_error("is_fullscreen"))
}
