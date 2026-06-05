//! 插件钩子步骤

#![allow(dead_code)]

use super::traits::{PipelineStep, StepError};
use async_trait::async_trait;
use lime_core::plugin::PluginManager;
use lime_core::processor::RequestContext;
use lime_core::ProviderType;
use std::sync::Arc;

/// 插件前置钩子步骤
pub struct PluginPreStep {
    plugins: Arc<PluginManager>,
}

impl PluginPreStep {
    pub fn new(plugins: Arc<PluginManager>) -> Self {
        Self { plugins }
    }
}

#[async_trait]
impl PipelineStep for PluginPreStep {
    async fn execute(
        &self,
        ctx: &mut RequestContext,
        payload: &mut serde_json::Value,
    ) -> Result<(), StepError> {
        let provider = ctx.provider.unwrap_or(ProviderType::Kiro);
        ctx.init_plugin_context(provider);

        if let Some(plugin_ctx) = ctx.plugin_context_mut() {
            let results = self.plugins.run_on_request(plugin_ctx, payload).await;
            for result in &results {
                if !result.success {
                    tracing::warn!("[PLUGIN] on_request hook failed: {:?}", result.error);
                }
            }
            ctx.set_metadata(
                "plugin_pre_results",
                serde_json::json!(results
                    .iter()
                    .map(|r| serde_json::json!({
                        "success": r.success, "modified": r.modified, "duration_ms": r.duration_ms
                    }))
                    .collect::<Vec<_>>()),
            );
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "plugin_pre"
    }
}

/// 插件后置钩子步骤
pub struct PluginPostStep {
    plugins: Arc<PluginManager>,
}

impl PluginPostStep {
    pub fn new(plugins: Arc<PluginManager>) -> Self {
        Self { plugins }
    }

    pub async fn run_on_error(&self, ctx: &mut RequestContext, error: &str) {
        if let Some(plugin_ctx) = ctx.plugin_context_mut() {
            let results = self.plugins.run_on_error(plugin_ctx, error).await;
            for result in &results {
                if !result.success {
                    tracing::warn!("[PLUGIN] on_error hook failed: {:?}", result.error);
                }
            }
        }
    }
}

#[async_trait]
impl PipelineStep for PluginPostStep {
    async fn execute(
        &self,
        ctx: &mut RequestContext,
        payload: &mut serde_json::Value,
    ) -> Result<(), StepError> {
        if let Some(plugin_ctx) = ctx.plugin_context_mut() {
            let results = self.plugins.run_on_response(plugin_ctx, payload).await;
            for result in &results {
                if !result.success {
                    tracing::warn!("[PLUGIN] on_response hook failed: {:?}", result.error);
                }
            }
            ctx.set_metadata(
                "plugin_post_results",
                serde_json::json!(results
                    .iter()
                    .map(|r| serde_json::json!({
                        "success": r.success, "modified": r.modified, "duration_ms": r.duration_ms
                    }))
                    .collect::<Vec<_>>()),
            );
        }
        Ok(())
    }

    fn name(&self) -> &str {
        "plugin_post"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_plugin_pre_step_execute() {
        let plugins = Arc::new(PluginManager::with_defaults());
        let step = PluginPreStep::new(plugins);
        let mut ctx = RequestContext::new("model".to_string());
        ctx.set_provider(ProviderType::Kiro);
        let mut payload = serde_json::json!({"model": "model"});
        assert!(step.execute(&mut ctx, &mut payload).await.is_ok());
        assert!(ctx.plugin_ctx.is_some());
    }

    #[tokio::test]
    async fn test_plugin_post_step_execute() {
        let plugins = Arc::new(PluginManager::with_defaults());
        let step = PluginPostStep::new(plugins);
        let mut ctx = RequestContext::new("model".to_string());
        ctx.set_provider(ProviderType::Kiro);
        ctx.init_plugin_context(ProviderType::Kiro);
        let mut payload = serde_json::json!({"response": "test"});
        assert!(step.execute(&mut ctx, &mut payload).await.is_ok());
    }
}
