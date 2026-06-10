//! Model Registry 共享状态。
//!
//! 该状态仍服务旧主 crate 的启动接线与内部只读调用，但不再归属于
//! `lime-rs/src/commands/**` Tauri wrapper。

use lime_services::model_registry_service::ModelRegistryService;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Model Registry 服务状态。
pub type ModelRegistryState = Arc<RwLock<Option<ModelRegistryService>>>;
