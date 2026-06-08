//! WebSocket legacy Tauri commands.
//!
//! WebSocket RPC / channel 能力不再由这组本地内存状态命令控制；后续需要
//! WebSocket 运行时事实时，应回到 App Server / channel current 主链。

use lime_websocket::{WsConnection, WsStatsSnapshot};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

const DEPRECATED_WEBSOCKET_COMMAND_MESSAGE: &str =
    "WebSocket Tauri 控制命令已退场；请使用 App Server / channel current 主链";

fn deprecated_websocket_command_error(command: &str) -> String {
    tracing::warn!("[WebSocket] legacy Tauri command `{}` 已退场", command);
    format!("{command} 已退场；{DEPRECATED_WEBSOCKET_COMMAND_MESSAGE}")
}

/// WebSocket 服务状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsServiceStatus {
    /// 是否启用
    pub enabled: bool,
    /// 活跃连接数
    pub active_connections: u64,
    /// 总连接数
    pub total_connections: u64,
    /// 总消息数
    pub total_messages: u64,
    /// 总错误数
    pub total_errors: u64,
}

/// WebSocket 连接详情
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WsConnectionInfo {
    /// 连接 ID
    pub id: String,
    /// 连接时间
    pub connected_at: String,
    /// 客户端信息
    pub client_info: Option<String>,
    /// 请求计数
    pub request_count: u64,
}

impl From<WsConnection> for WsConnectionInfo {
    fn from(conn: WsConnection) -> Self {
        Self {
            id: conn.id,
            connected_at: conn.connected_at.to_rfc3339(),
            client_info: conn.client_info,
            request_count: conn.request_count,
        }
    }
}

/// WebSocket 状态封装（用于 Tauri State）
#[allow(dead_code)]
pub struct WsServiceState {
    pub enabled: Arc<RwLock<bool>>,
    pub stats: Arc<RwLock<WsStatsSnapshot>>,
    pub connections: Arc<RwLock<Vec<WsConnectionInfo>>>,
}

impl WsServiceState {
    pub fn new() -> Self {
        Self {
            enabled: Arc::new(RwLock::new(false)),
            stats: Arc::new(RwLock::new(WsStatsSnapshot {
                total_connections: 0,
                active_connections: 0,
                total_messages: 0,
                total_errors: 0,
            })),
            connections: Arc::new(RwLock::new(Vec::new())),
        }
    }
}

impl Default for WsServiceState {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
pub async fn get_websocket_status(
    _state: tauri::State<'_, WsServiceState>,
) -> Result<WsServiceStatus, String> {
    Err(deprecated_websocket_command_error("get_websocket_status"))
}

#[tauri::command]
pub async fn get_websocket_connections(
    _state: tauri::State<'_, WsServiceState>,
) -> Result<Vec<WsConnectionInfo>, String> {
    Err(deprecated_websocket_command_error(
        "get_websocket_connections",
    ))
}

#[tauri::command]
pub async fn set_websocket_enabled(
    _state: tauri::State<'_, WsServiceState>,
    _enabled: bool,
) -> Result<(), String> {
    Err(deprecated_websocket_command_error("set_websocket_enabled"))
}
