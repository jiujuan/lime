/**
 * 窗口控制命令
 *
 * 提供基本的窗口操作功能
 */
use tauri::{AppHandle, Manager};

/// 获取当前窗口大小
#[tauri::command]
pub fn get_window_size(app: AppHandle) -> Result<(u32, u32), String> {
    let window = app.get_webview_window("main").ok_or("找不到主窗口")?;

    let size = window.inner_size().map_err(|e| e.to_string())?;
    Ok((size.width, size.height))
}

/// 设置窗口大小
#[tauri::command]
pub fn set_window_size(app: AppHandle, width: u32, height: u32) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("找不到主窗口")?;

    window
        .set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }))
        .map_err(|e| e.to_string())
}

/// 居中窗口
#[tauri::command]
pub fn center_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("找不到主窗口")?;

    window.center().map_err(|e| e.to_string())
}

/// 切换全屏模式
#[tauri::command]
pub fn toggle_fullscreen(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("找不到主窗口")?;

    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    window
        .set_fullscreen(!is_fullscreen)
        .map_err(|e| e.to_string())
}

/// 检查是否全屏
#[tauri::command]
pub fn is_fullscreen(app: AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main").ok_or("找不到主窗口")?;

    window.is_fullscreen().map_err(|e| e.to_string())
}
