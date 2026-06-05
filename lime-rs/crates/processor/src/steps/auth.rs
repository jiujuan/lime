//! 认证步骤

#![allow(dead_code)]

use super::traits::{PipelineStep, StepError};
use async_trait::async_trait;
use lime_core::processor::RequestContext;
use subtle::ConstantTimeEq;

/// 认证步骤 - 验证请求中的 API Key
pub struct AuthStep {
    expected_key: String,
    enabled: bool,
}

impl AuthStep {
    pub fn new(expected_key: String) -> Self {
        Self {
            expected_key,
            enabled: true,
        }
    }

    pub fn with_enabled(mut self, enabled: bool) -> Self {
        self.enabled = enabled;
        self
    }

    pub fn verify(&self, provided_key: Option<&str>) -> Result<(), StepError> {
        match provided_key {
            Some(key) if key.as_bytes().ct_eq(self.expected_key.as_bytes()).into() => Ok(()),
            Some(_) => Err(StepError::Auth("Invalid API key".to_string())),
            None => Err(StepError::Auth("No API key provided".to_string())),
        }
    }
}

#[async_trait]
impl PipelineStep for AuthStep {
    async fn execute(
        &self,
        ctx: &mut RequestContext,
        _payload: &mut serde_json::Value,
    ) -> Result<(), StepError> {
        let api_key = ctx
            .get_metadata("api_key")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        self.verify(api_key.as_deref())
    }

    fn name(&self) -> &str {
        "auth"
    }
    fn is_enabled(&self) -> bool {
        self.enabled
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auth_step_verify_success() {
        let step = AuthStep::new("test-key".to_string());
        assert!(step.verify(Some("test-key")).is_ok());
    }

    #[test]
    fn test_auth_step_verify_invalid_key() {
        let step = AuthStep::new("test-key".to_string());
        assert!(matches!(
            step.verify(Some("wrong-key")),
            Err(StepError::Auth(_))
        ));
    }

    #[test]
    fn test_auth_step_verify_no_key() {
        let step = AuthStep::new("test-key".to_string());
        assert!(matches!(step.verify(None), Err(StepError::Auth(_))));
    }

    #[tokio::test]
    async fn test_auth_step_execute() {
        let step = AuthStep::new("test-key".to_string());
        let mut ctx = RequestContext::new("model".to_string());
        ctx.set_metadata("api_key", serde_json::json!("test-key"));
        let mut payload = serde_json::json!({});
        assert!(step.execute(&mut ctx, &mut payload).await.is_ok());
    }
}
