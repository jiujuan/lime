//! 配置管理命令
//!
//! 包含配置读取、保存、Provider 设置等命令。

use crate::app::types::{AppState, LogState};
use crate::config::{
    self, observer::ConfigChangeEvent, ConfigChangeSource, GlobalConfigManagerState,
};

/// 获取端点 Provider 配置
#[tauri::command]
pub async fn get_endpoint_providers(
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let s = state.read().await;
    let ep = &s.config.endpoint_providers;
    Ok(serde_json::json!({
        "cursor": ep.cursor.clone(),
        "claude_code": ep.claude_code.clone(),
        "codex": ep.codex.clone(),
        "windsurf": ep.windsurf.clone(),
        "kiro": ep.kiro.clone(),
        "other": ep.other.clone()
    }))
}

/// 设置端点 Provider 配置
#[tauri::command]
pub async fn set_endpoint_provider(
    state: tauri::State<'_, AppState>,
    logs: tauri::State<'_, LogState>,
    config_manager: tauri::State<'_, GlobalConfigManagerState>,
    endpoint: String,
    provider: Option<String>,
) -> Result<String, String> {
    // 允许任意 Provider ID（包括自定义 Provider 的 UUID）
    // 不再强制验证为已知的 ProviderType

    let ep_config = {
        let mut s = state.write().await;

        // 使用 set_provider 方法设置对应的 provider
        if !s
            .config
            .endpoint_providers
            .set_provider(&endpoint, provider.clone())
        {
            return Err(format!("未知的客户端类型: {endpoint}"));
        }

        config::save_config(&s.config).map_err(|e| e.to_string())?;

        s.config.endpoint_providers.clone()
    };

    // 通过 GlobalConfigManager 通知所有观察者
    let event = ConfigChangeEvent::EndpointProvidersChanged(
        config::observer::EndpointProvidersChangeEvent {
            cursor: ep_config.cursor.clone(),
            claude_code: ep_config.claude_code.clone(),
            codex: ep_config.codex.clone(),
            windsurf: ep_config.windsurf.clone(),
            kiro: ep_config.kiro.clone(),
            other: ep_config.other.clone(),
            source: ConfigChangeSource::FrontendUI,
        },
    );
    config_manager.0.subject().notify_event(event).await;

    let provider_display = provider.as_deref().unwrap_or("默认");
    logs.write().await.add(
        "info",
        &format!("客户端 {endpoint} 的 Provider 已设置为: {provider_display}"),
    );

    tracing::info!(
        "[CONFIG] 端点 Provider 已更新: {} -> {}",
        endpoint,
        provider_display
    );
    Ok(provider_display.to_string())
}
