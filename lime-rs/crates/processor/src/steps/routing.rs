//! 路由解析步骤

#![allow(dead_code)]

use super::traits::{PipelineStep, StepError};
use async_trait::async_trait;
use lime_core::processor::RequestContext;
use lime_core::router::{ModelMapper, Router};
use lime_core::ProviderType;
use std::sync::Arc;
use tokio::sync::RwLock;

/// 路由解析步骤
pub struct RoutingStep {
    router: Arc<RwLock<Router>>,
    mapper: Arc<RwLock<ModelMapper>>,
    default_provider: Arc<RwLock<String>>,
}

impl RoutingStep {
    pub fn new(
        router: Arc<RwLock<Router>>,
        mapper: Arc<RwLock<ModelMapper>>,
        default_provider: Arc<RwLock<String>>,
    ) -> Self {
        Self {
            router,
            mapper,
            default_provider,
        }
    }

    pub async fn resolve_model(&self, model: &str) -> String {
        let mapper = self.mapper.read().await;
        mapper.resolve(model)
    }

    pub async fn select_provider(&self, model: &str) -> Result<ProviderType, StepError> {
        let router = self.router.read().await;
        let result = router.route(model);
        result.provider.ok_or_else(|| {
            StepError::Routing("未设置默认 Provider，请先在设置中选择一个默认 Provider".to_string())
        })
    }
}

#[async_trait]
impl PipelineStep for RoutingStep {
    async fn execute(
        &self,
        ctx: &mut RequestContext,
        payload: &mut serde_json::Value,
    ) -> Result<(), StepError> {
        let resolved_model = self.resolve_model(&ctx.original_model).await;
        ctx.set_resolved_model(resolved_model.clone());

        if let Some(obj) = payload.as_object_mut() {
            obj.insert("model".to_string(), serde_json::json!(resolved_model));
        }

        let provider = self.select_provider(&ctx.resolved_model).await?;
        ctx.set_provider(provider);

        tracing::info!(
            "[ROUTE] request_id={} original_model={} resolved_model={} provider={}",
            ctx.request_id,
            ctx.original_model,
            ctx.resolved_model,
            provider
        );

        Ok(())
    }

    fn name(&self) -> &str {
        "routing"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_routing_step_resolve_model() {
        let mut mapper = ModelMapper::new();
        mapper.add_alias("gpt-4", "claude-sonnet-4-5");
        let step = RoutingStep::new(
            Arc::new(RwLock::new(Router::new(ProviderType::Kiro))),
            Arc::new(RwLock::new(mapper)),
            Arc::new(RwLock::new("kiro".to_string())),
        );
        assert_eq!(step.resolve_model("gpt-4").await, "claude-sonnet-4-5");
        assert_eq!(step.resolve_model("unknown-model").await, "unknown-model");
    }

    #[tokio::test]
    async fn test_routing_step_select_provider() {
        let router = Router::new(ProviderType::Kiro);
        let step = RoutingStep::new(
            Arc::new(RwLock::new(router)),
            Arc::new(RwLock::new(ModelMapper::new())),
            Arc::new(RwLock::new("kiro".to_string())),
        );
        assert_eq!(
            step.select_provider("gemini-2.5-flash").await.unwrap(),
            ProviderType::Kiro
        );
    }

    #[tokio::test]
    async fn test_routing_step_execute() {
        let mut mapper = ModelMapper::new();
        mapper.add_alias("gpt-4", "claude-sonnet-4-5");
        let step = RoutingStep::new(
            Arc::new(RwLock::new(Router::new(ProviderType::Kiro))),
            Arc::new(RwLock::new(mapper)),
            Arc::new(RwLock::new("kiro".to_string())),
        );
        let mut ctx = RequestContext::new("gpt-4".to_string());
        let mut payload = serde_json::json!({"model": "gpt-4"});
        assert!(step.execute(&mut ctx, &mut payload).await.is_ok());
        assert_eq!(ctx.resolved_model, "claude-sonnet-4-5");
        assert_eq!(ctx.provider, Some(ProviderType::Kiro));
        assert_eq!(payload["model"], "claude-sonnet-4-5");
    }
}
