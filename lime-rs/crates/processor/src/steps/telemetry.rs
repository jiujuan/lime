//! 统计记录步骤

#![allow(dead_code)]

use super::traits::{PipelineStep, StepError};
use async_trait::async_trait;
use lime_core::processor::RequestContext;
use lime_core::ProviderType;
use lime_infra::{
    RequestLog, RequestStatus, StatsAggregator, TokenSource, TokenTracker, TokenUsageRecord,
};
use parking_lot::RwLock;
use std::sync::Arc;

/// 统计记录步骤
pub struct TelemetryStep {
    stats: Arc<RwLock<StatsAggregator>>,
    tokens: Arc<RwLock<TokenTracker>>,
}

impl TelemetryStep {
    pub fn new(stats: Arc<RwLock<StatsAggregator>>, tokens: Arc<RwLock<TokenTracker>>) -> Self {
        Self { stats, tokens }
    }

    /// 记录请求日志
    pub fn record_request(
        &self,
        ctx: &RequestContext,
        status: RequestStatus,
        error_message: Option<String>,
    ) {
        let provider = ctx.provider.unwrap_or(ProviderType::Kiro);
        let mut log = RequestLog::new(
            ctx.request_id.clone(),
            provider,
            ctx.resolved_model.clone(),
            ctx.is_stream,
        );
        match status {
            RequestStatus::Success => log.mark_success(ctx.elapsed_ms(), 200),
            RequestStatus::Failed => {
                log.mark_failed(ctx.elapsed_ms(), None, error_message.unwrap_or_default())
            }
            RequestStatus::Timeout => log.mark_timeout(ctx.elapsed_ms()),
            RequestStatus::Cancelled => log.mark_cancelled(ctx.elapsed_ms()),
            RequestStatus::Retrying => {
                log.duration_ms = ctx.elapsed_ms();
            }
        }
        if let Some(cred_id) = &ctx.credential_id {
            log.set_credential_id(cred_id.clone());
        }
        log.retry_count = ctx.retry_count;
        let stats = self.stats.write();
        stats.record(log);
    }

    /// 记录 Token 使用
    pub fn record_tokens(
        &self,
        ctx: &RequestContext,
        input_tokens: Option<u32>,
        output_tokens: Option<u32>,
        source: TokenSource,
    ) {
        let provider = ctx.provider.unwrap_or(ProviderType::Kiro);
        if input_tokens.is_some() || output_tokens.is_some() {
            let record = TokenUsageRecord::new(
                uuid::Uuid::new_v4().to_string(),
                provider,
                ctx.resolved_model.clone(),
                input_tokens.unwrap_or(0),
                output_tokens.unwrap_or(0),
                source,
            )
            .with_request_id(ctx.request_id.clone());
            let tokens = self.tokens.write();
            tokens.record(record);
        }
    }

    /// 从响应中提取并记录 Token 使用
    pub fn record_tokens_from_response(&self, ctx: &RequestContext, response: &serde_json::Value) {
        if let Some(usage) = response.get("usage") {
            // OpenAI 格式
            let input = usage
                .get("prompt_tokens")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            let output = usage
                .get("completion_tokens")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            if input.is_some() || output.is_some() {
                self.record_tokens(ctx, input, output, TokenSource::Actual);
                return;
            }
            // Anthropic 格式
            let input = usage
                .get("input_tokens")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            let output = usage
                .get("output_tokens")
                .and_then(|v| v.as_u64())
                .map(|v| v as u32);
            if input.is_some() || output.is_some() {
                self.record_tokens(ctx, input, output, TokenSource::Actual);
            }
        }
    }
}

#[async_trait]
impl PipelineStep for TelemetryStep {
    async fn execute(
        &self,
        ctx: &mut RequestContext,
        payload: &mut serde_json::Value,
    ) -> Result<(), StepError> {
        self.record_request(ctx, RequestStatus::Success, None);
        self.record_tokens_from_response(ctx, payload);
        tracing::info!(
            "[TELEMETRY] request_id={} provider={:?} model={} duration_ms={}",
            ctx.request_id,
            ctx.provider,
            ctx.resolved_model,
            ctx.elapsed_ms()
        );
        Ok(())
    }

    fn name(&self) -> &str {
        "telemetry"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_telemetry_step_record_request() {
        let stats = Arc::new(RwLock::new(StatsAggregator::with_defaults()));
        let tokens = Arc::new(RwLock::new(TokenTracker::with_defaults()));
        let step = TelemetryStep::new(stats.clone(), tokens);
        let ctx = RequestContext::new("claude-sonnet-4-5".to_string());
        step.record_request(&ctx, RequestStatus::Success, None);
        assert_eq!(stats.read().len(), 1);
    }

    #[test]
    fn test_telemetry_step_record_tokens() {
        let stats = Arc::new(RwLock::new(StatsAggregator::with_defaults()));
        let tokens = Arc::new(RwLock::new(TokenTracker::with_defaults()));
        let step = TelemetryStep::new(stats, tokens.clone());
        let ctx = RequestContext::new("claude-sonnet-4-5".to_string());
        step.record_tokens(&ctx, Some(100), Some(50), TokenSource::Actual);
        assert_eq!(tokens.read().len(), 1);
    }

    #[test]
    fn test_telemetry_step_record_tokens_from_response() {
        let stats = Arc::new(RwLock::new(StatsAggregator::with_defaults()));
        let tokens = Arc::new(RwLock::new(TokenTracker::with_defaults()));
        let step = TelemetryStep::new(stats, tokens.clone());
        let ctx = RequestContext::new("claude-sonnet-4-5".to_string());
        let response =
            serde_json::json!({"usage": {"prompt_tokens": 100, "completion_tokens": 50}});
        step.record_tokens_from_response(&ctx, &response);
        assert_eq!(tokens.read().len(), 1);
    }

    #[tokio::test]
    async fn test_telemetry_step_execute() {
        let stats = Arc::new(RwLock::new(StatsAggregator::with_defaults()));
        let tokens = Arc::new(RwLock::new(TokenTracker::with_defaults()));
        let step = TelemetryStep::new(stats.clone(), tokens.clone());
        let mut ctx = RequestContext::new("claude-sonnet-4-5".to_string());
        let mut payload =
            serde_json::json!({"usage": {"prompt_tokens": 100, "completion_tokens": 50}});
        assert!(step.execute(&mut ctx, &mut payload).await.is_ok());
        assert_eq!(stats.read().len(), 1);
        assert_eq!(tokens.read().len(), 1);
    }
}
