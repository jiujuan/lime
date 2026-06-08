//! External Tools legacy Tauri commands.
//!
//! 外链 / OAuth 本机回调桥已归 Electron Desktop Host current 壳能力承接。
//! Codex CLI 状态探测 / 工具列表旧设置面已无前端生产入口；本文件只在
//! `runner.rs` 共享注册释放前保留 fail-closed command symbol。

const CURRENT_EXTERNAL_TOOLS_PATH: &str =
    "Electron Desktop Host current 壳能力；Codex CLI 旧设置面已退场";

fn deprecated_external_tools_command_error(command: &str) -> String {
    tracing::warn!(
        "[ExternalTools] legacy Tauri command `{}` 已退场；请改走 {}",
        command,
        CURRENT_EXTERNAL_TOOLS_PATH
    );
    format!("{command} 已退场；External tools 壳命令只能走 {CURRENT_EXTERNAL_TOOLS_PATH}")
}

#[tauri::command]
pub async fn check_codex_cli_status() -> Result<(), String> {
    Err(deprecated_external_tools_command_error(
        "check_codex_cli_status",
    ))
}

#[tauri::command]
pub async fn open_codex_cli_login() -> Result<String, String> {
    Err(deprecated_external_tools_command_error(
        "open_codex_cli_login",
    ))
}

#[tauri::command]
pub async fn open_codex_cli_logout() -> Result<String, String> {
    Err(deprecated_external_tools_command_error(
        "open_codex_cli_logout",
    ))
}

#[tauri::command]
pub async fn open_external_url() -> Result<(), String> {
    Err(deprecated_external_tools_command_error("open_external_url"))
}

#[tauri::command]
pub async fn start_oem_cloud_oauth_callback_bridge() -> Result<(), String> {
    Err(deprecated_external_tools_command_error(
        "start_oem_cloud_oauth_callback_bridge",
    ))
}

#[tauri::command]
pub async fn get_external_tools() -> Result<(), String> {
    Err(deprecated_external_tools_command_error(
        "get_external_tools",
    ))
}
