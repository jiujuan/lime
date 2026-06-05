//! 参数注入步骤

#![allow(dead_code)]

use super::traits::{PipelineStep, StepError};
use async_trait::async_trait;
use lime_core::processor::RequestContext;
use lime_infra::Injector;
use std::sync::Arc;
use tokio::sync::RwLock;

/// 参数注入步骤
pub struct InjectionStep {
    injector: Arc<RwLock<Injector>>,
    enabled: Arc<RwLock<bool>>,
}

impl InjectionStep {
    pub fn new(injector: Arc<RwLock<Injector>>) -> Self {
        Self {
            injector,
            enabled: Arc::new(RwLock::new(true)),
        }
    }

    pub fn with_enabled(self, enabled: Arc<RwLock<bool>>) -> Self {
        Self { enabled, ..self }
    }

    pub async fn is_injection_enabled(&self) -> bool {
        *self.enabled.read().await
    }
}

#[async_trait]
impl PipelineStep for InjectionStep {
    async fn execute(
        &self,
        ctx: &mut RequestContext,
        payload: &mut serde_json::Value,
    ) -> Result<(), StepError> {
        if !self.is_injection_enabled().await {
            return Ok(());
        }

        let injector = self.injector.read().await;
        let result = injector.inject(&ctx.resolved_model, payload);

        if result.has_injections() {
            tracing::info!(
                "[INJECT] request_id={} applied_rules={:?} injected_params={:?}",
                ctx.request_id,
                result.applied_rules,
                result.injected_params
            );
            ctx.set_metadata(
                "injection_result",
                serde_json::json!({
                    "applied_rules": result.applied_rules,
                    "injected_params": result.injected_params
                }),
            );
        }

        Ok(())
    }

    fn name(&self) -> &str {
        "injection"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_infra::InjectionRule;

    #[tokio::test]
    async fn test_injection_step_execute() {
        let mut injector = Injector::new();
        injector.add_rule(InjectionRule::new(
            "test-rule",
            "claude-*",
            serde_json::json!({"temperature": 0.7}),
        ));
        let step = InjectionStep::new(Arc::new(RwLock::new(injector)));
        let mut ctx = RequestContext::new("claude-sonnet-4-5".to_string());
        let mut payload = serde_json::json!({"model": "claude-sonnet-4-5"});
        assert!(step.execute(&mut ctx, &mut payload).await.is_ok());
        assert_eq!(payload["temperature"], 0.7);
    }

    #[tokio::test]
    async fn test_injection_step_disabled() {
        let mut injector = Injector::new();
        injector.add_rule(InjectionRule::new(
            "test-rule",
            "claude-*",
            serde_json::json!({"temperature": 0.7}),
        ));
        let step = InjectionStep::new(Arc::new(RwLock::new(injector)))
            .with_enabled(Arc::new(RwLock::new(false)));
        let mut ctx = RequestContext::new("claude-sonnet-4-5".to_string());
        let mut payload = serde_json::json!({"model": "claude-sonnet-4-5"});
        assert!(step.execute(&mut ctx, &mut payload).await.is_ok());
        assert!(payload.get("temperature").is_none());
    }
}
