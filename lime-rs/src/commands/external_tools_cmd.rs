//! 外部 CLI 工具管理命令
//!
//! 管理 Codex CLI 等外部工具的状态检查和配置
//! 这些工具有自己的认证系统，不通过 Lime 凭证池管理

use axum::extract::{Query, State};
use axum::http::{StatusCode, Uri};
use axum::response::{Html, IntoResponse};
use axum::routing::get;
use axum::Router;
use serde::{Deserialize, Serialize};
use std::net::{IpAddr, SocketAddr};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::process::Command;
use tokio::sync::{oneshot, Mutex};

/// Codex CLI 状态
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CodexCliStatus {
    /// CLI 是否已安装
    pub installed: bool,
    /// CLI 版本
    pub version: Option<String>,
    /// 是否已登录
    pub logged_in: bool,
    /// 登录方式（api_key 或 oauth）
    pub auth_type: Option<String>,
    /// API Key 前缀（如果使用 API Key 登录）
    pub api_key_prefix: Option<String>,
    /// 错误信息
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OemCloudOAuthCallbackBridgeStartResponse {
    pub callback_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OemCloudOAuthCallbackBridgePayload {
    pub source_path: String,
    pub tenant_id: Option<String>,
    pub token: Option<String>,
    pub next: Option<String>,
    pub error: Option<String>,
    pub device_code: Option<String>,
    pub status: Option<String>,
}

const OEM_CLOUD_OAUTH_CALLBACK_BRIDGE_EVENT: &str = "oem-cloud-oauth-callback";
const OEM_CLOUD_OAUTH_CALLBACK_PATH: &str = "/oauth/callback";
const OEM_CLOUD_OAUTH_CALLBACK_BRIDGE_TTL: Duration = Duration::from_secs(10 * 60);
const OEM_CLOUD_OAUTH_CALLBACK_HTML: &str = r#"<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lime 登录回调</title>
    <script>
      (function () {
        if (window.location.hash && window.location.hash.length > 1) {
          var params = new URLSearchParams(window.location.hash.slice(1));
          var search = new URLSearchParams(window.location.search);
          params.forEach(function (value, key) {
            if (!search.has(key)) search.set(key, value);
          });
          window.location.replace(window.location.pathname + "?" + search.toString());
        }
      })();
    </script>
  </head>
  <body>
    <p>Lime 登录结果已返回，可以关闭此页面。</p>
  </body>
</html>"#;

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OemCloudOAuthCallbackBridgeQuery {
    #[serde(alias = "tenant_id")]
    tenant_id: Option<String>,
    token: Option<String>,
    next: Option<String>,
    error: Option<String>,
    #[serde(alias = "device_code")]
    device_code: Option<String>,
    status: Option<String>,
}

#[derive(Clone)]
struct OemCloudOAuthCallbackBridgeState {
    app: AppHandle,
    shutdown_tx: Arc<Mutex<Option<oneshot::Sender<()>>>>,
}

/// 检查 Lime CLI 状态
#[tauri::command]
pub async fn check_codex_cli_status() -> Result<CodexCliStatus, String> {
    let mut status = CodexCliStatus::default();

    // 1. 检查 Lime 命令是否存在
    let version_result = Command::new("codex")
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;

    match version_result {
        Ok(output) => {
            if output.status.success() {
                status.installed = true;
                let version_str = String::from_utf8_lossy(&output.stdout);
                // 解析版本号，格式通常是 "codex x.y.z" 或直接 "x.y.z"
                status.version = Some(version_str.trim().to_string());
            } else {
                status.error = Some("Codex CLI 未正确安装".to_string());
                return Ok(status);
            }
        }
        Err(e) => {
            status.error = Some(format!(
                "Codex CLI 未安装。请运行: npm i -g @openai/codex\n错误: {e}"
            ));
            return Ok(status);
        }
    }

    // 2. 检查登录状态
    let login_result = Command::new("codex")
        .args(["login", "status"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;

    match login_result {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{stdout}{stderr}");

            tracing::debug!("[CodexCli] login status output: {}", combined);

            // 解析登录状态
            // 示例输出: "Logged in using an API key - cr_4453c***0b3a7"
            // 或: "Not logged in"
            if combined.contains("Logged in") {
                status.logged_in = true;

                if combined.contains("API key") || combined.contains("api key") {
                    status.auth_type = Some("api_key".to_string());
                    // 提取 API Key 前缀
                    if let Some(key_part) = combined.split('-').next_back() {
                        let key = key_part.trim();
                        if !key.is_empty() {
                            status.api_key_prefix = Some(key.to_string());
                        }
                    }
                } else if combined.contains("OAuth") || combined.contains("oauth") {
                    status.auth_type = Some("oauth".to_string());
                } else {
                    status.auth_type = Some("unknown".to_string());
                }
            } else {
                status.logged_in = false;
            }
        }
        Err(e) => {
            tracing::warn!("[CodexCli] 检查登录状态失败: {}", e);
            // 不设置 error，因为 CLI 已安装，只是无法检查登录状态
        }
    }

    Ok(status)
}

/// 打开 Codex CLI 登录（在终端中执行）
#[tauri::command]
pub async fn open_codex_cli_login() -> Result<String, String> {
    // 返回登录命令，让前端在终端中执行
    Ok("codex login".to_string())
}

/// 打开 Codex CLI 登出
#[tauri::command]
pub async fn open_codex_cli_logout() -> Result<String, String> {
    Ok("codex logout".to_string())
}

fn normalize_external_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("外部链接不能为空".to_string());
    }

    let parsed = url::Url::parse(trimmed).map_err(|error| format!("外部链接格式无效: {error}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.to_string()),
        _ => Err("外部链接只支持 http/https 地址".to_string()),
    }
}

/// 使用系统默认浏览器打开外部链接。
#[tauri::command]
pub async fn open_external_url(url: String) -> Result<(), String> {
    let normalized_url = normalize_external_url(&url)?;
    open::that(&normalized_url).map_err(|error| format!("无法打开系统浏览器: {error}"))?;
    Ok(())
}

fn normalize_callback_bridge_base_url(addr: SocketAddr) -> Result<String, String> {
    if !matches!(addr.ip(), IpAddr::V4(ip) if ip.is_loopback()) {
        return Err("OAuth 本地回调桥必须绑定到 IPv4 loopback 地址".to_string());
    }
    Ok(format!(
        "http://127.0.0.1:{}{}",
        addr.port(),
        OEM_CLOUD_OAUTH_CALLBACK_PATH
    ))
}

fn normalize_callback_bridge_value(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let normalized = value.trim();
        if normalized.is_empty() {
            None
        } else {
            Some(normalized.to_string())
        }
    })
}

fn build_oem_cloud_oauth_callback_payload(
    uri: &Uri,
    query: OemCloudOAuthCallbackBridgeQuery,
) -> OemCloudOAuthCallbackBridgePayload {
    OemCloudOAuthCallbackBridgePayload {
        source_path: uri.path().to_string(),
        tenant_id: normalize_callback_bridge_value(query.tenant_id),
        token: normalize_callback_bridge_value(query.token),
        next: normalize_callback_bridge_value(query.next),
        error: normalize_callback_bridge_value(query.error),
        device_code: normalize_callback_bridge_value(query.device_code),
        status: normalize_callback_bridge_value(query.status),
    }
}

fn should_emit_oem_cloud_oauth_callback(payload: &OemCloudOAuthCallbackBridgePayload) -> bool {
    payload.tenant_id.is_some()
        || payload.token.is_some()
        || payload.error.is_some()
        || payload.device_code.is_some()
        || payload.status.is_some()
}

async fn handle_oem_cloud_oauth_callback_bridge_request(
    State(state): State<OemCloudOAuthCallbackBridgeState>,
    Query(query): Query<OemCloudOAuthCallbackBridgeQuery>,
    uri: Uri,
) -> impl IntoResponse {
    let payload = build_oem_cloud_oauth_callback_payload(&uri, query);
    if should_emit_oem_cloud_oauth_callback(&payload) {
        if let Err(error) = state
            .app
            .emit(OEM_CLOUD_OAUTH_CALLBACK_BRIDGE_EVENT, payload)
        {
            tracing::warn!("[OAuthCallbackBridge] 发送 OAuth 回调事件失败: {}", error);
        }

        if let Some(shutdown_tx) = state.shutdown_tx.lock().await.take() {
            let _ = shutdown_tx.send(());
        }

        return (StatusCode::OK, Html(OEM_CLOUD_OAUTH_CALLBACK_HTML)).into_response();
    }

    (StatusCode::OK, Html(OEM_CLOUD_OAUTH_CALLBACK_HTML)).into_response()
}

/// 启动一次性 OEM Cloud OAuth 本机回调桥。
#[tauri::command]
pub async fn start_oem_cloud_oauth_callback_bridge(
    app: AppHandle,
) -> Result<OemCloudOAuthCallbackBridgeStartResponse, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|error| format!("无法启动 OAuth 本地回调桥: {error}"))?;
    let addr = listener
        .local_addr()
        .map_err(|error| format!("无法读取 OAuth 本地回调地址: {error}"))?;
    let callback_url = normalize_callback_bridge_base_url(addr)?;
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let state = OemCloudOAuthCallbackBridgeState {
        app,
        shutdown_tx: Arc::new(Mutex::new(Some(shutdown_tx))),
    };
    let router = Router::new()
        .route(
            OEM_CLOUD_OAUTH_CALLBACK_PATH,
            get(handle_oem_cloud_oauth_callback_bridge_request),
        )
        .with_state(state);

    tauri::async_runtime::spawn(async move {
        let server = axum::serve(listener, router).with_graceful_shutdown(async move {
            tokio::select! {
                _ = shutdown_rx => {}
                _ = tokio::time::sleep(OEM_CLOUD_OAUTH_CALLBACK_BRIDGE_TTL) => {}
            }
        });
        if let Err(error) = server.await {
            tracing::warn!("[OAuthCallbackBridge] OAuth 本地回调桥运行失败: {}", error);
        }
    });

    Ok(OemCloudOAuthCallbackBridgeStartResponse { callback_url })
}

/// 外部工具列表
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalTool {
    /// 工具 ID
    pub id: String,
    /// 显示名称
    pub name: String,
    /// 描述
    pub description: String,
    /// 是否已安装
    pub installed: bool,
    /// 是否已配置/登录
    pub configured: bool,
    /// 安装命令
    pub install_command: String,
    /// 配置命令
    pub config_command: String,
    /// 文档链接
    pub doc_url: String,
}

/// 获取外部工具列表
#[tauri::command]
pub async fn get_external_tools() -> Result<Vec<ExternalTool>, String> {
    let mut tools = Vec::new();

    // Codex CLI
    let codex_status = check_codex_cli_status().await.unwrap_or_default();
    tools.push(ExternalTool {
        id: "codex-cli".to_string(),
        name: "Codex CLI".to_string(),
        description: "Lime 命令行工具，支持 Agent 模式和工具调用".to_string(),
        installed: codex_status.installed,
        configured: codex_status.logged_in,
        install_command: "npm i -g @openai/codex".to_string(),
        config_command: "codex login".to_string(),
        doc_url: "https://github.com/openai/codex".to_string(),
    });

    // 可以在这里添加更多外部工具...

    Ok(tools)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_external_url_accepts_http_and_https() {
        assert_eq!(
            normalize_external_url(" https://user.limeai.run/login ").unwrap(),
            "https://user.limeai.run/login"
        );
        assert_eq!(
            normalize_external_url("http://127.0.0.1:1420/").unwrap(),
            "http://127.0.0.1:1420/"
        );
    }

    #[test]
    fn normalize_external_url_rejects_non_web_schemes() {
        assert!(normalize_external_url("lime://oauth/callback").is_err());
        assert!(normalize_external_url("file:///tmp/demo.txt").is_err());
        assert!(normalize_external_url("").is_err());
    }

    #[tokio::test]
    async fn test_codex_cli_status() {
        // 这个测试依赖于本地环境
        let status = check_codex_cli_status().await;
        assert!(status.is_ok());
        let status = status.unwrap();
        println!("Codex CLI Status: {:?}", status);
    }
}
