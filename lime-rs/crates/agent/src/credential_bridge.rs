//! API Key Provider 桥接模块
//!
//! 将 Lime API Key Provider 主路径与迁移期 runtime provider factory 连接。
//!
//! ## 功能
//! - 从 API Key Provider 选择可用凭证
//! - 将凭证转换为 runtime provider 配置
//! - 智能拆分 base_url 为 host + path，避免路径重复（如智谱 /v4/v1 问题）

use lime_core::database::dao::api_key_provider::ApiProviderType;
use lime_core::database::DbConnection;
use lime_core::models::provider_type::is_custom_provider_id;
use lime_core::models::{runtime_api_key_id_from_credential_uuid, RuntimeProviderCredential};
use lime_services::api_key_provider_service::ApiKeyProviderService;
use model_provider::runtime_provider::RuntimeProviderConfig;

mod provider_env;
mod provider_mapping;
mod runtime_config_projection;
mod runtime_provider_adapter;

#[cfg(test)]
use provider_env::{
    set_provider_env_vars, should_disable_provider_default_fast_model, split_url_host_and_path,
    OPENAI_CUSTOM_HEADERS_ENV,
};
use runtime_config_projection::runtime_provider_config_from_credential;
pub(crate) use runtime_provider_adapter::{
    create_configured_reply_provider, CompatReplyProvider, ConfiguredReplyProvider,
};

/// 凭证桥接错误
#[derive(Debug, Clone)]
pub(crate) enum CredentialBridgeError {
    /// 没有可用凭证
    NoCredentials(String),
    /// Provider 创建失败
    ProviderCreationFailed(String),
    /// 数据库错误
    DatabaseError(String),
}

impl std::fmt::Display for CredentialBridgeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoCredentials(msg) => write!(f, "没有可用凭证: {msg}"),
            Self::ProviderCreationFailed(msg) => write!(f, "Provider 创建失败: {msg}"),
            Self::DatabaseError(msg) => write!(f, "数据库错误: {msg}"),
        }
    }
}

impl std::error::Error for CredentialBridgeError {}

/// Provider 凭证桥接器
///
/// 负责从 Lime API Key Provider 选择凭证并转换为 runtime provider 配置。
///
/// runtime provider 创建仅保留在 `runtime_provider_adapter` compat adapter 内。
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
    use model_provider::runtime_provider::RuntimeProviderProtocol;
    use std::sync::{Mutex, MutexGuard, OnceLock};

    fn env_lock() -> MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

    #[test]
    fn test_set_provider_env_vars_openai_codex_responses_splits_prefixed_base_url() {
        let _env_guard = env_lock();
        std::env::remove_var("OPENAI_HOST");
        std::env::remove_var("OPENAI_BASE_PATH");
        std::env::remove_var("OPENAI_FORCE_RESPONSES_API");

        let config = RuntimeProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("codex".to_string()),
            model_name: "gpt-5.3-codex".to_string(),
            api_key: Some("test-key".to_string()),
            base_url: Some("https://example.com/openai".to_string()),
            credential_uuid: "test-uuid".to_string(),
            reasoning_effort: None,
            protocol: Some(RuntimeProviderProtocol::Responses),
            toolshim: false,
            toolshim_model: None,
        };

        set_provider_env_vars(&config);

        assert_eq!(
            std::env::var("OPENAI_HOST").ok(),
            Some("https://example.com".to_string())
        );
        assert_eq!(
            std::env::var("OPENAI_BASE_PATH").ok(),
            Some("openai/chat/completions".to_string())
        );
        assert_eq!(
            std::env::var("OPENAI_FORCE_RESPONSES_API").ok().as_deref(),
            Some("1")
        );
    }

    #[test]
    fn test_set_provider_env_vars_openai_codex_responses_normalizes_v1_base_url() {
        let _env_guard = env_lock();
        std::env::remove_var("OPENAI_HOST");
        std::env::remove_var("OPENAI_BASE_PATH");
        std::env::remove_var("OPENAI_FORCE_RESPONSES_API");

        let config = RuntimeProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("codex".to_string()),
            model_name: "gpt-5.4".to_string(),
            api_key: Some("test-key".to_string()),
            base_url: Some("https://api.openai.com/v1".to_string()),
            credential_uuid: "test-uuid".to_string(),
            reasoning_effort: None,
            protocol: Some(RuntimeProviderProtocol::Responses),
            toolshim: false,
            toolshim_model: None,
        };

        set_provider_env_vars(&config);

        assert_eq!(
            std::env::var("OPENAI_HOST").ok(),
            Some("https://api.openai.com".to_string())
        );
        assert_eq!(
            std::env::var("OPENAI_BASE_PATH").ok(),
            Some("v1/chat/completions".to_string())
        );
        assert_eq!(
            std::env::var("OPENAI_FORCE_RESPONSES_API").ok().as_deref(),
            Some("1")
        );
    }

    #[test]
    fn test_set_provider_env_vars_openai_without_base_url_clears_previous_endpoint() {
        let _env_guard = env_lock();
        std::env::set_var("OPENAI_HOST", "https://api.deepseek.com");
        std::env::set_var("OPENAI_BASE_PATH", "v1/chat/completions");
        std::env::set_var("OPENAI_FORCE_RESPONSES_API", "1");

        let config = RuntimeProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("openai".to_string()),
            model_name: "gpt-5.4".to_string(),
            api_key: Some("test-key".to_string()),
            base_url: None,
            credential_uuid: "test-uuid".to_string(),
            reasoning_effort: None,
            protocol: None,
            toolshim: false,
            toolshim_model: None,
        };

        set_provider_env_vars(&config);

        assert_eq!(std::env::var("OPENAI_HOST").ok(), None);
        assert_eq!(std::env::var("OPENAI_BASE_PATH").ok(), None);
        assert_eq!(std::env::var("OPENAI_FORCE_RESPONSES_API").ok(), None);
    }

    #[test]
    fn test_credential_bridge_error_display() {
        let err = CredentialBridgeError::NoCredentials("test".to_string());
        assert!(err.to_string().contains("没有可用凭证"));
    }

    #[test]
    fn test_should_disable_provider_default_fast_model_for_openai_compatible_provider() {
        let config = RuntimeProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("zhipuai".to_string()),
            model_name: "glm-5".to_string(),
            api_key: Some("test-key".to_string()),
            base_url: Some("https://open.bigmodel.cn/api/paas/v4".to_string()),
            credential_uuid: "test-uuid".to_string(),
            reasoning_effort: None,
            protocol: None,
            toolshim: false,
            toolshim_model: None,
        };

        assert!(should_disable_provider_default_fast_model(&config));
    }

    #[test]
    fn test_should_keep_provider_default_fast_model_for_first_party_openai() {
        let config = RuntimeProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("openai".to_string()),
            model_name: "gpt-4o".to_string(),
            api_key: Some("test-key".to_string()),
            base_url: Some("https://api.openai.com/v1".to_string()),
            credential_uuid: "test-uuid".to_string(),
            reasoning_effort: None,
            protocol: Some(RuntimeProviderProtocol::ChatCompletions),
            toolshim: false,
            toolshim_model: None,
        };

        assert!(!should_disable_provider_default_fast_model(&config));
    }

    #[test]
    fn test_should_keep_provider_default_fast_model_for_responses_route() {
        let config = RuntimeProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("custom-responses".to_string()),
            model_name: "gpt-5.3".to_string(),
            api_key: Some("test-key".to_string()),
            base_url: Some("https://example.com/openai".to_string()),
            credential_uuid: "test-uuid".to_string(),
            reasoning_effort: None,
            protocol: Some(RuntimeProviderProtocol::Responses),
            toolshim: false,
            toolshim_model: None,
        };

        assert!(!should_disable_provider_default_fast_model(&config));
    }

    #[test]
    fn test_should_disable_provider_default_fast_model_for_anthropic_compatible_proxy() {
        let config = RuntimeProviderConfig {
            provider_name: "anthropic".to_string(),
            provider_selector: Some("custom-cae6e762-fb45-4f71-878c-3106510ade78".to_string()),
            model_name: "mimo-v2-pro".to_string(),
            api_key: Some("test-key".to_string()),
            base_url: Some("https://token-plan-cn.xiaomimimo.com/anthropic".to_string()),
            credential_uuid: "test-uuid".to_string(),
            reasoning_effort: None,
            protocol: None,
            toolshim: false,
            toolshim_model: None,
        };

        assert!(should_disable_provider_default_fast_model(&config));
    }

    #[test]
    fn test_should_keep_provider_default_fast_model_for_first_party_anthropic() {
        let config = RuntimeProviderConfig {
            provider_name: "anthropic".to_string(),
            provider_selector: Some("anthropic".to_string()),
            model_name: "claude-sonnet-4-5-20250929".to_string(),
            api_key: Some("test-key".to_string()),
            base_url: Some("https://api.anthropic.com".to_string()),
            credential_uuid: "test-uuid".to_string(),
            reasoning_effort: None,
            protocol: None,
            toolshim: false,
            toolshim_model: None,
        };

        assert!(!should_disable_provider_default_fast_model(&config));
    }

    #[test]
    fn test_split_url_host_and_path() {
        // 无路径
        let (host, path) = split_url_host_and_path("https://api.openai.com");
        assert_eq!(host, "https://api.openai.com");
        assert_eq!(path, "");

        // 带路径（智谱）
        let (host, path) = split_url_host_and_path("https://open.bigmodel.cn/api/paas/v4");
        assert_eq!(host, "https://open.bigmodel.cn");
        assert_eq!(path, "api/paas/v4");

        // 带端口
        let (host, path) = split_url_host_and_path("https://localhost:8080/v1");
        assert_eq!(host, "https://localhost:8080");
        assert_eq!(path, "v1");

        // 尾部斜杠
        let (host, path) = split_url_host_and_path("https://api.deepseek.com/v1/");
        assert_eq!(host, "https://api.deepseek.com");
        assert_eq!(path, "v1");

        // 仅根路径
        let (host, path) = split_url_host_and_path("https://api.openai.com/");
        assert_eq!(host, "https://api.openai.com");
        assert_eq!(path, "");

        // 查询参数和 fragment 只用于附加元数据，不应进入真实请求 URL
        let (host, path) =
            split_url_host_and_path("https://llm.limeai.run/openai?lime_tenant_id=tenant-0001#x=1");
        assert_eq!(host, "https://llm.limeai.run");
        assert_eq!(path, "openai");
    }

    #[test]
    fn test_set_provider_env_vars_openai_lime_hub_adds_tenant_header_from_fragment() {
        let _env_guard = env_lock();
        std::env::remove_var("OPENAI_HOST");
        std::env::remove_var("OPENAI_BASE_PATH");
        std::env::set_var(
            OPENAI_CUSTOM_HEADERS_ENV,
            "X-Other=1,X-Lime-Tenant-ID=stale",
        );

        let config = RuntimeProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("lime-hub".to_string()),
            model_name: "gpt-5.5".to_string(),
            api_key: Some("test-key".to_string()),
            base_url: Some("https://llm.limeai.run#lime_tenant_id=tenant-0001".to_string()),
            credential_uuid: "test-uuid".to_string(),
            reasoning_effort: None,
            protocol: None,
            toolshim: false,
            toolshim_model: None,
        };

        set_provider_env_vars(&config);

        assert_eq!(
            std::env::var("OPENAI_HOST").ok().as_deref(),
            Some("https://llm.limeai.run")
        );
        assert!(std::env::var("OPENAI_BASE_PATH").is_err());
        assert_eq!(
            std::env::var(OPENAI_CUSTOM_HEADERS_ENV).ok().as_deref(),
            Some("X-Other=1,X-Lime-Tenant-ID=tenant-0001")
        );

        std::env::remove_var(OPENAI_CUSTOM_HEADERS_ENV);
    }

    #[test]
    fn test_set_provider_env_vars_openai_without_lime_tenant_clears_stale_header() {
        let _env_guard = env_lock();
        std::env::set_var(
            OPENAI_CUSTOM_HEADERS_ENV,
            "X-Lime-Tenant-ID=stale,X-Other=1",
        );

        let config = RuntimeProviderConfig {
            provider_name: "openai".to_string(),
            provider_selector: Some("openai".to_string()),
            model_name: "gpt-4o".to_string(),
            api_key: Some("test-key".to_string()),
            base_url: Some("https://api.openai.com/v1".to_string()),
            credential_uuid: "test-uuid".to_string(),
            reasoning_effort: None,
            protocol: None,
            toolshim: false,
            toolshim_model: None,
        };

        set_provider_env_vars(&config);

        assert_eq!(
            std::env::var(OPENAI_CUSTOM_HEADERS_ENV).ok().as_deref(),
            Some("X-Other=1")
        );

        std::env::remove_var(OPENAI_CUSTOM_HEADERS_ENV);
    }

    #[test]
    fn test_set_provider_env_vars_anthropic_sets_host_and_base_url() {
        let _env_guard = env_lock();
        std::env::remove_var("ANTHROPIC_API_KEY");
        std::env::remove_var("ANTHROPIC_AUTH_TOKEN");

        let config = RuntimeProviderConfig {
            provider_name: "anthropic".to_string(),
            provider_selector: Some("anthropic".to_string()),
            model_name: "glm-4.7".to_string(),
            api_key: Some("test-key".to_string()),
            base_url: Some("https://open.bigmodel.cn/api/anthropic".to_string()),
            credential_uuid: "test-uuid".to_string(),
            reasoning_effort: None,
            protocol: None,
            toolshim: false,
            toolshim_model: None,
        };

        set_provider_env_vars(&config);

        assert_eq!(
            std::env::var("ANTHROPIC_HOST").ok().as_deref(),
            Some("https://open.bigmodel.cn/api/anthropic")
        );
        assert_eq!(
            std::env::var("ANTHROPIC_BASE_URL").ok().as_deref(),
            Some("https://open.bigmodel.cn/api/anthropic")
        );
        assert_eq!(
            std::env::var("ANTHROPIC_AUTH_TOKEN").ok().as_deref(),
            Some("test-key")
        );
        assert!(std::env::var("ANTHROPIC_API_KEY").is_err());
    }

    #[test]
    fn test_set_provider_env_vars_official_anthropic_keeps_api_key_env() {
        let _env_guard = env_lock();
        std::env::remove_var("ANTHROPIC_API_KEY");
        std::env::remove_var("ANTHROPIC_AUTH_TOKEN");

        let config = RuntimeProviderConfig {
            provider_name: "anthropic".to_string(),
            provider_selector: Some("anthropic".to_string()),
            model_name: "claude-sonnet-4-5".to_string(),
            api_key: Some("official-key".to_string()),
            base_url: Some("https://api.anthropic.com".to_string()),
            credential_uuid: "test-uuid".to_string(),
            reasoning_effort: None,
            protocol: None,
            toolshim: false,
            toolshim_model: None,
        };

        set_provider_env_vars(&config);

        assert_eq!(
            std::env::var("ANTHROPIC_API_KEY").ok().as_deref(),
            Some("official-key")
        );
        assert!(std::env::var("ANTHROPIC_AUTH_TOKEN").is_err());
    }
}
