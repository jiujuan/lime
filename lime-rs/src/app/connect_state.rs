//! Connect 启动期状态与 deep link 投影。
//!
//! Connect 生产路径已迁移到 Electron deep link bridge 与 App Server JSON-RPC；
//! 本模块只保留桌面启动期仍需要共享的 registry 状态和事件 DTO。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use lime_core::connect::{ConnectPayload, OpenDeepLinkPayload, RelayInfo, RelayRegistry};

/// Connect 模块状态。
pub struct ConnectState {
    /// 中转商注册表。
    pub registry: Arc<RelayRegistry>,
}

/// Connect 状态包装器。
pub struct ConnectStateWrapper(pub Arc<RwLock<Option<ConnectState>>>);

/// Deep Link 处理结果。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeepLinkResult {
    /// 解析后的 payload。
    pub payload: ConnectPayload,
    /// 中转商信息。
    pub relay_info: Option<RelayInfo>,
    /// 是否为已验证的中转商。
    pub is_verified: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OpenDeepLinkResult {
    pub payload: OpenDeepLinkPayload,
}

/// Connect 初始化错误。
#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectError {
    pub code: String,
    pub message: String,
}

/// 初始化 Connect 状态。
pub async fn init_connect_state(app_data_dir: PathBuf) -> Result<ConnectState, ConnectError> {
    let cache_path = app_data_dir.join("connect").join("registry.json");
    let registry = Arc::new(RelayRegistry::new(cache_path));

    if registry.load_from_cache().is_err() {
        tracing::info!("[Connect] 缓存不存在，尝试从远程加载注册表");
        if let Err(error) = registry.load_from_remote().await {
            tracing::warn!("[Connect] 从远程加载注册表失败: {}", error);
        }
    }

    Ok(ConnectState { registry })
}
