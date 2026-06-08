//! 文件浏览器服务（Tauri 命令桥接层）
//!
//! 纯逻辑已迁移到 `lime-services` crate，
//! 本模块仅保留 Tauri 命令封装。

/// Tauri 命令：复制文件名到剪贴板（返回文件名供前端处理）
#[tauri::command]
pub async fn get_file_name(path: String) -> Result<String, String> {
    lime_services::file_browser_service::get_file_name(path).await
}
