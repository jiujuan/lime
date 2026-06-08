//! Legacy tray command facade.
//!
//! 托盘同步当前主链已收敛到 Electron Desktop Host；旧 Tauri wrapper
//! 只保留 runner 注册签名，避免继续写 Tauri 托盘状态。

use crate::tray::TrayQuickModelGroup;
use crate::TrayManagerState;
use tauri::State;

const DEPRECATED_TRAY_COMMAND: &str =
    "旧 Tauri 托盘同步命令已下线；托盘壳能力必须经 Electron Desktop Host current 主链。";

fn deprecated_tray_command(command: &str) -> Result<(), String> {
    Err(format!("{DEPRECATED_TRAY_COMMAND} command={command}"))
}

/// 同步托盘中的快速模型切换菜单
///
/// 由前端在模型或 Provider 变化时调用，用于更新系统托盘中的当前模型信息与快捷切换列表。
#[tauri::command]
pub async fn sync_tray_model_shortcuts(
    _tray_state: State<'_, TrayManagerState<tauri::Wry>>,
    _current_model_provider_type: String,
    _current_model_provider_label: String,
    _current_model: String,
    _current_theme_label: String,
    _quick_model_groups: Vec<TrayQuickModelGroup>,
) -> Result<(), String> {
    deprecated_tray_command("sync_tray_model_shortcuts")
}
