//! API Key Provider 桥接模块
//!
//! 将 Lime API Key Provider 主路径与 current provider 配置连接。
//!
//! ## 功能
//! - 从 API Key Provider 选择可用凭证
//! - 将凭证转换为 runtime provider 配置
//! - 将 provider 配置交给 `model-provider` 的请求级 client

use lime_core::database::dao::api_key_provider::ApiProviderType;
use lime_core::database::DbConnection;
use lime_core::models::provider_type::is_custom_provider_id;
use lime_core::models::{runtime_api_key_id_from_credential_uuid, RuntimeProviderCredential};
use lime_services::api_key_provider_service::ApiKeyProviderService;
use model_provider::runtime_provider::RuntimeProviderConfig;

mod provider_mapping;
mod runtime_config_projection;
mod runtime_provider_adapter;

use runtime_config_projection::runtime_provider_config_from_credential;
pub(crate) use runtime_provider_adapter::{
    create_configured_reply_provider, ConfiguredReplyProvider,
};

/// 凭证桥接错误
#[derive(Debug, Clone)]
pub(crate) enum CredentialBridgeError {
    /// 没有可用凭证
    NoCredentials(String),
    /// 数据库错误
    DatabaseError(String),
}

impl std::fmt::Display for CredentialBridgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoCredentials(msg) => write!(f, "没有可用凭证: {msg}"),
            Self::DatabaseError(msg) => write!(f, "数据库错误: {msg}"),
        }
    }
}

impl std::error::Error for CredentialBridgeError {}

/// Provider 凭证桥接器
///
/// 负责从 Lime API Key Provider 选择凭证并转换为 runtime provider 配置。
///
/// provider client 创建委托给 `runtime_provider_adapter`。
pub(crate) struct CredentialBridge {
    api_key_service: ApiKeyProviderService,
}

impl Default for CredentialBridge {
    fn default() -> Self {
        Self::new()
    }
}

impl CredentialBridge {
    pub(crate) fn new() -> Self {
        Self {
            api_key_service: ApiKeyProviderService::new(),
        }
    }

    fn resolve_runtime_api_key_id<'a>(&self, uuid: &'a str) -> Option<&'a str> {
        runtime_api_key_id_from_credential_uuid(uuid)
    }

    /// 从 API Key Provider 选择凭证并创建 runtime provider 配置
    ///
    /// # 参数
    /// - `db`: 数据库连接
    /// - `provider_type`: Provider 类型 (openai, anthropic, kiro, deepseek 等)
    /// - `model`: 模型名称
    ///
    /// # 返回
    /// 成功时返回 RuntimeProviderConfig，失败时返回错误
    pub(crate) async fn select_and_configure(
        &self,
        db: &DbConnection,
        provider_type: &str,
        model: &str,
    ) -> Result<RuntimeProviderConfig, CredentialBridgeError> {
        let credential = self
            .api_key_service
            .select_credential_for_provider(db, provider_type, Some(provider_type), None)
            .await
            .map_err(CredentialBridgeError::DatabaseError)?
            .ok_or_else(|| {
                CredentialBridgeError::NoCredentials(format!(
                    "没有找到 {provider_type} 类型的可用凭证"
                ))
            })?;

        // 2. 转换为 runtime provider 配置，传递 provider_type 以便正确识别 Provider
        self.credential_to_config(&credential, model, provider_type, db)
            .await
    }

    fn resolve_api_provider_type_hint(
        &self,
        db: &DbConnection,
        provider_type_hint: &str,
    ) -> Option<ApiProviderType> {
        if let Ok(api_type) = provider_type_hint.parse::<ApiProviderType>() {
            return Some(api_type);
        }

        if !is_custom_provider_id(provider_type_hint) {
            return None;
        }

        match self.api_key_service.get_provider(db, provider_type_hint) {
            Ok(Some(provider_with_keys)) => Some(provider_with_keys.provider.provider_type),
            Ok(None) => {
                tracing::warn!(
                    "[CredentialBridge] custom provider 不存在: {}, 使用默认映射",
                    provider_type_hint
                );
                None
            }
            Err(error) => {
                tracing::warn!(
                    "[CredentialBridge] 读取 custom provider 失败: {} ({})，使用默认映射",
                    provider_type_hint,
                    error
                );
                None
            }
        }
    }

    /// 将 Lime 凭证转换为 runtime provider 配置
    async fn credential_to_config(
        &self,
        credential: &RuntimeProviderCredential,
        model: &str,
        provider_type_hint: &str,
        db: &DbConnection,
    ) -> Result<RuntimeProviderConfig, CredentialBridgeError> {
        tracing::info!(
            "[CredentialBridge] credential_to_config: provider_type_hint={}, credential_type={:?}",
            provider_type_hint,
            credential.provider_type
        );

        let resolved_api_type = self.resolve_api_provider_type_hint(db, provider_type_hint);
        Ok(runtime_provider_config_from_credential(
            credential,
            model,
            provider_type_hint,
            resolved_api_type,
        ))
    }

    /// 记录凭证使用
    pub(crate) fn record_usage(
        &self,
        db: &DbConnection,
        uuid: &str,
    ) -> Result<(), CredentialBridgeError> {
        if let Some(api_key_id) = self.resolve_runtime_api_key_id(uuid) {
            return self
                .api_key_service
                .record_usage(db, api_key_id)
                .map_err(CredentialBridgeError::DatabaseError);
        }

        tracing::debug!(
            "[CredentialBridge] 忽略已退役的旧 credential 使用记录: {}",
            uuid
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credential_bridge_error_display() {
        let err = CredentialBridgeError::NoCredentials("test".to_string());
        assert!(err.to_string().contains("没有可用凭证"));
    }
}
