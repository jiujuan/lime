use std::sync::atomic::Ordering;

use crate::credential_bridge::{
    create_aster_runtime_provider, RuntimeProviderConfig, RuntimeProviderProtocol,
};
use crate::provider_continuation_state::{
    resolve_provider_continuation_capability, ProviderContinuationCapability,
    ProviderContinuationCapable, ProviderContinuationState,
};
use lime_core::database::DbConnection;

use super::AsterAgentState;

/// Provider 配置信息
#[derive(Debug, Clone)]
pub struct ProviderConfig {
    /// Provider 名称 (openai, anthropic, google, ollama 等)
    pub provider_name: String,
    /// Provider 选择器（优先保留前端 provider_id / API Key Provider 类型）
    pub provider_selector: Option<String>,
    /// 模型名称
    pub model_name: String,
    /// API Key (可选，某些 provider 从环境变量读取)
    pub api_key: Option<String>,
    /// Base URL (可选，用于自定义端点)
    pub base_url: Option<String>,
    /// 凭证 UUID（来自 API Key Provider，用于记录使用和健康状态）
    pub credential_uuid: Option<String>,
    /// 当前回合显式推理强度（仅在上游 /models 接口声明支持时由前端传入）
    pub reasoning_effort: Option<String>,
    /// App Server RouteResolver 派生出的 runtime provider 执行协议
    pub protocol: Option<RuntimeProviderProtocol>,
    /// 当前回合是否需要用 toolshim 兼容无原生 tools 的模型
    pub toolshim: bool,
    /// toolshim 解释器模型（可与实际回复模型不同）
    pub toolshim_model: Option<String>,
}

impl ProviderContinuationCapable for ProviderConfig {
    fn provider_continuation_capability(&self) -> ProviderContinuationCapability {
        resolve_provider_continuation_capability(self.protocol)
    }

    fn provider_continuation_state(&self) -> ProviderContinuationState {
        ProviderContinuationState::history_replay_only()
    }
}

impl AsterAgentState {
    /// 配置 Provider
    ///
    /// 根据配置创建并设置 Provider。该方法仍是 Aster Agent 兼容注入面，
    /// current provider 请求执行应走 model-provider::RuntimeProvider。
    pub async fn configure_provider(
        &self,
        config: ProviderConfig,
        session_id: &str,
        db: &DbConnection,
    ) -> Result<(), String> {
        self.init_agent_with_db(db).await?;

        let provider = create_aster_runtime_provider(&RuntimeProviderConfig {
            provider_name: config.provider_name.clone(),
            provider_selector: config.provider_selector.clone(),
            model_name: config.model_name.clone(),
            api_key: config.api_key.clone(),
            base_url: config.base_url.clone(),
            credential_uuid: config
                .credential_uuid
                .clone()
                .unwrap_or_else(|| format!("manual:{session_id}")),
            reasoning_effort: config.reasoning_effort.clone(),
            protocol: config.protocol,
            toolshim: config.toolshim,
            toolshim_model: config.toolshim_model.clone(),
        })
        .await
        .map_err(|e| format!("创建 Provider 失败: {e}"))?;

        let agent_guard = self.agent.read().await;
        if let Some(agent) = agent_guard.as_ref() {
            agent
                .update_provider(provider, session_id)
                .await
                .map_err(|e| format!("更新 Provider 失败: {e}"))?;
        }

        let mut config_guard = self.current_provider_config.write().await;
        *config_guard = Some(config.clone());

        self.provider_configured_cache
            .store(true, Ordering::Relaxed);

        tracing::info!(
            "[AsterAgent] Provider 配置成功: {} / {}",
            config.provider_name,
            config.model_name
        );

        Ok(())
    }

    /// 从 API Key Provider 配置 Provider
    ///
    /// 自动从 Lime API Key Provider 选择可用凭证并配置 runtime provider。
    pub async fn configure_provider_from_pool(
        &self,
        db: &DbConnection,
        provider_type: &str,
        model: &str,
        session_id: &str,
        reasoning_effort: Option<String>,
        protocol: Option<RuntimeProviderProtocol>,
    ) -> Result<RuntimeProviderConfig, String> {
        self.init_agent_with_db(db).await?;

        let mut aster_config = self
            .credential_bridge
            .select_and_configure(db, provider_type, model)
            .await
            .map_err(|e| format!("从 API Key Provider 选择凭证失败: {e}"))?;
        aster_config.reasoning_effort = reasoning_effort;
        aster_config.protocol = protocol;

        let provider = create_aster_runtime_provider(&aster_config)
            .await
            .map_err(|e| format!("创建 Provider 失败: {e}"))?;

        let agent_guard = self.agent.read().await;
        if let Some(agent) = agent_guard.as_ref() {
            agent
                .update_provider(provider, session_id)
                .await
                .map_err(|e| format!("更新 Provider 失败: {e}"))?;
        }

        let config = ProviderConfig {
            provider_name: aster_config.provider_name.clone(),
            provider_selector: Some(provider_type.trim().to_string()),
            model_name: aster_config.model_name.clone(),
            api_key: aster_config.api_key.clone(),
            base_url: aster_config.base_url.clone(),
            credential_uuid: Some(aster_config.credential_uuid.clone()),
            reasoning_effort: aster_config.reasoning_effort.clone(),
            protocol: aster_config.protocol,
            toolshim: aster_config.toolshim,
            toolshim_model: aster_config.toolshim_model.clone(),
        };
        let mut config_guard = self.current_provider_config.write().await;
        *config_guard = Some(config);

        self.provider_configured_cache
            .store(true, Ordering::Relaxed);

        if let Err(e) = self
            .credential_bridge
            .record_usage(db, &aster_config.credential_uuid)
        {
            tracing::warn!("[AsterAgent] 记录凭证使用失败: {}", e);
        }

        tracing::info!(
            "[AsterAgent] 从 API Key Provider 配置 Provider 成功: {} / {} (凭证: {})",
            aster_config.provider_name,
            aster_config.model_name,
            aster_config.credential_uuid
        );

        Ok(aster_config)
    }

    /// 标记当前凭证为健康
    pub fn mark_current_healthy(&self, db: &DbConnection, model: Option<&str>) {
        if let Ok(config_guard) = self.current_provider_config.try_read() {
            if let Some(config) = config_guard.as_ref() {
                if let Some(uuid) = &config.credential_uuid {
                    if let Err(e) = self.credential_bridge.mark_healthy(db, uuid, model) {
                        tracing::warn!("[AsterAgent] 标记凭证健康失败: {}", e);
                    }
                }
            }
        }
    }

    /// 标记当前凭证为不健康
    pub fn mark_current_unhealthy(&self, db: &DbConnection, error: Option<&str>) {
        if let Ok(config_guard) = self.current_provider_config.try_read() {
            if let Some(config) = config_guard.as_ref() {
                if let Some(uuid) = &config.credential_uuid {
                    if let Err(e) = self.credential_bridge.mark_unhealthy(db, uuid, error) {
                        tracing::warn!("[AsterAgent] 标记凭证不健康失败: {}", e);
                    }
                }
            }
        }
    }

    /// 获取当前 Provider 配置
    pub async fn get_provider_config(&self) -> Option<ProviderConfig> {
        self.current_provider_config.read().await.clone()
    }

    /// 清除当前 Provider 配置
    ///
    /// 用于切换凭证后重置状态，下次对话时会重新从 API Key Provider 选择凭证。
    pub async fn clear_provider_config(&self) {
        let mut config_guard = self.current_provider_config.write().await;
        *config_guard = None;

        self.provider_configured_cache
            .store(false, Ordering::Relaxed);

        tracing::info!("[AsterAgent] Provider 配置已清除");
    }

    /// 检查 Provider 是否已配置
    pub async fn is_provider_configured(&self) -> bool {
        if self.provider_configured_cache.load(Ordering::Relaxed) {
            return true;
        }

        let result = self.current_provider_config.read().await.is_some();
        self.provider_configured_cache
            .store(result, Ordering::Relaxed);
        result
    }
}
