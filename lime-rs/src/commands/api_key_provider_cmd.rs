//! API Key Provider service state.
//!
//! Provider 管理命令已迁入 App Server `modelProvider/*` current 主链。

use lime_services::api_key_provider_service::ApiKeyProviderService;
use std::sync::Arc;

/// API Key Provider 服务状态封装。
pub struct ApiKeyProviderServiceState(pub Arc<ApiKeyProviderService>);
