//! 浏览器运行时调试窗口管理
//!
//! 提供独立的浏览器运行时调试窗口，与主应用窗口分离显示。

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, thiserror::Error)]
pub enum BrowserRuntimeWindowError {
    #[error("窗口创建失败: {0}")]
    CreateFailed(String),
    #[error("窗口操作失败: {0}")]
    OperationFailed(String),
}

const BROWSER_RUNTIME_WINDOW_LABEL: &str = "browser-runtime-debugger";
const WINDOW_WIDTH: f64 = 1440.0;
const WINDOW_HEIGHT: f64 = 920.0;
const WINDOW_TITLE: &str = "浏览器运行时调试";
const WINDOW_ROUTE: &str = "/browser-runtime-debugger";

fn build_browser_runtime_route(session_id: Option<&str>, profile_key: Option<&str>) -> String {
    let mut query_parts = Vec::new();
    if let Some(session_id) = session_id.filter(|value| !value.trim().is_empty()) {
        query_parts.push(format!("session_id={}", urlencoding::encode(session_id)));
    }
    if let Some(profile_key) = profile_key.filter(|value| !value.trim().is_empty()) {
        query_parts.push(format!("profile_key={}", urlencoding::encode(profile_key)));
    }
    if query_parts.is_empty() {
        WINDOW_ROUTE.to_string()
    } else {
        format!("{WINDOW_ROUTE}?{}", query_parts.join("&"))
    }
}

pub fn open_browser_runtime_window(
    app: &AppHandle,
    session_id: Option<&str>,
    profile_key: Option<&str>,
) -> Result<(), BrowserRuntimeWindowError> {
    let route = build_browser_runtime_route(session_id, profile_key);
    if let Some(window) = app.get_webview_window(BROWSER_RUNTIME_WINDOW_LABEL) {
        let route_literal = serde_json::to_string(&route).map_err(|e| {
            BrowserRuntimeWindowError::OperationFailed(format!("窗口路由编码失败: {e}"))
        })?;
        let js = format!("window.location.replace({route_literal});");
        window
            .eval(&js)
            .map_err(|e| BrowserRuntimeWindowError::OperationFailed(format!("导航失败: {e}")))?;
        let _ = window.unminimize();
        window.show().map_err(|e| {
            BrowserRuntimeWindowError::OperationFailed(format!("显示窗口失败: {e}"))
        })?;
        window.set_focus().map_err(|e| {
            BrowserRuntimeWindowError::OperationFailed(format!("聚焦窗口失败: {e}"))
        })?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        BROWSER_RUNTIME_WINDOW_LABEL,
        WebviewUrl::App(route.into()),
    )
    .title(WINDOW_TITLE)
    .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
    .min_inner_size(960.0, 640.0)
    .resizable(true)
    .visible(true)
    .focused(true)
    .center()
    .build()
    .map_err(|e| BrowserRuntimeWindowError::CreateFailed(format!("{e}")))?;

    Ok(())
}

pub fn close_browser_runtime_window(app: &AppHandle) -> Result<(), BrowserRuntimeWindowError> {
    if let Some(window) = app.get_webview_window(BROWSER_RUNTIME_WINDOW_LABEL) {
        window.close().map_err(|e| {
            BrowserRuntimeWindowError::OperationFailed(format!("关闭窗口失败: {e}"))
        })?;
    }
    Ok(())
}

pub fn is_browser_runtime_window_open(app: &AppHandle) -> bool {
    app.get_webview_window(BROWSER_RUNTIME_WINDOW_LABEL)
        .map(|window| window.is_visible().unwrap_or(false))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_runtime_window_label_is_stable() {
        assert_eq!(BROWSER_RUNTIME_WINDOW_LABEL, "browser-runtime-debugger");
        assert_eq!(WINDOW_ROUTE, "/browser-runtime-debugger");
    }

    #[test]
    fn browser_runtime_route_includes_context_when_present() {
        let route = build_browser_runtime_route(Some("session-1"), Some("search_google"));
        assert!(route.contains("session_id=session-1"));
        assert!(route.contains("profile_key=search_google"));
    }
}
