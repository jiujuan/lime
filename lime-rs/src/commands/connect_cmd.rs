//! Connect legacy Tauri 命令模块
//!
//! Connect 生产路径已迁移到 Electron deep link bridge 与 App Server JSON-RPC。
//! 本模块仅保留启动期仍引用的状态 / DTO，以及旧 Tauri 命令的 fail-closed 退场面。
//!
//! ## Current 主链
//!
//! `Electron protocol/open-url -> frontend connect API -> App Server JSON-RPC`
//!
//! ## Deprecated Tauri 命令
//!
//! 旧命令只返回 `DEPRECATED_CONNECT_COMMAND`，不得继续承接 registry / API Key / webhook 业务事实。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::connect::{ConnectPayload, OpenDeepLinkPayload, RelayInfo, RelayRegistry};

const CURRENT_CONNECT_PATH: &str = "Electron deep link bridge -> App Server JSON-RPC current 主链";

/// Connect 模块状态
///
/// 管理 RelayRegistry 的共享状态
pub struct ConnectState {
    /// 中转商注册表
    pub registry: Arc<RelayRegistry>,
}

/// Connect 状态包装器（用于 Tauri 状态管理）
pub struct ConnectStateWrapper(pub Arc<RwLock<Option<ConnectState>>>);

/// Deep Link 处理结果
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeepLinkResult {
    /// 解析后的 payload
    pub payload: ConnectPayload,
    /// 中转商信息（如果在注册表中找到）
    pub relay_info: Option<RelayInfo>,
    /// 是否为已验证的中转商
    pub is_verified: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OpenDeepLinkResult {
    pub payload: OpenDeepLinkPayload,
}

/// 命令错误类型
#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectError {
    pub code: String,
    pub message: String,
}

fn deprecated_connect_command_error(command: &str) -> ConnectError {
    tracing::warn!(
        "[Connect] legacy Tauri command `{}` 已退场；请改走 {}",
        command,
        CURRENT_CONNECT_PATH
    );
    ConnectError {
        code: "DEPRECATED_CONNECT_COMMAND".to_string(),
        message: format!("{command} 已退场；Connect 只能走 {CURRENT_CONNECT_PATH}"),
    }
}

/// 初始化 Connect 状态
///
/// 在应用启动时调用，初始化 RelayRegistry
pub async fn init_connect_state(app_data_dir: PathBuf) -> Result<ConnectState, ConnectError> {
    // 初始化 Registry
    let cache_path = app_data_dir.join("connect").join("registry.json");
    let registry = Arc::new(RelayRegistry::new(cache_path));

    // 尝试从缓存加载，如果失败则从远程加载
    if registry.load_from_cache().is_err() {
        tracing::info!("[Connect] 缓存不存在，尝试从远程加载注册表");
        if let Err(e) = registry.load_from_remote().await {
            tracing::warn!("[Connect] 从远程加载注册表失败: {}", e);
            // 不返回错误，允许应用继续运行
        }
    }

    Ok(ConnectState { registry })
}

/// 旧 Tauri deep link 命令已退场。
#[tauri::command]
pub async fn handle_deep_link(_url: String) -> Result<DeepLinkResult, ConnectError> {
    Err(deprecated_connect_command_error("handle_deep_link"))
}

/// 旧 Tauri open deep link 命令已退场。
#[tauri::command]
pub async fn handle_open_deep_link(_url: String) -> Result<OpenDeepLinkResult, ConnectError> {
    Err(deprecated_connect_command_error("handle_open_deep_link"))
}

/// 旧 Tauri registry 查询命令已退场。
#[tauri::command]
pub async fn get_relay_info(_relay_id: String) -> Result<Option<RelayInfo>, ConnectError> {
    Err(deprecated_connect_command_error("get_relay_info"))
}

/// 保存 API Key 的返回结果
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SaveApiKeyResult {
    /// Provider ID
    pub provider_id: String,
    /// API Key ID
    pub key_id: String,
    /// Provider 名称
    pub provider_name: String,
    /// 是否为新创建的 Provider
    pub is_new_provider: bool,
}

/// 旧 Tauri API Key 保存命令已退场。
#[tauri::command]
pub async fn save_relay_api_key(
    _relay_id: String,
    _api_key: String,
    _name: Option<String>,
) -> Result<SaveApiKeyResult, ConnectError> {
    Err(deprecated_connect_command_error("save_relay_api_key"))
}

/// 旧 Tauri registry 刷新命令已退场。
#[tauri::command]
pub async fn refresh_relay_registry() -> Result<usize, ConnectError> {
    Err(deprecated_connect_command_error("refresh_relay_registry"))
}

/// 旧 Tauri registry 列表命令已退场。
#[tauri::command]
pub async fn list_relay_providers() -> Result<Vec<RelayInfo>, ConnectError> {
    Err(deprecated_connect_command_error("list_relay_providers"))
}

/// 回调状态类型
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CallbackStatusType {
    /// 配置成功
    Success,
    /// 用户取消
    Cancelled,
    /// 配置失败
    Error,
}

/// 旧 Tauri webhook 回调命令已退场。
#[tauri::command]
pub async fn send_connect_callback(
    _relay_id: String,
    _api_key: String,
    _status: CallbackStatusType,
    _ref_code: Option<String>,
    _error_code: Option<String>,
    _error_message: Option<String>,
) -> Result<bool, ConnectError> {
    Err(deprecated_connect_command_error("send_connect_callback"))
}
