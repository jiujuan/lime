use aster::providers::base::Provider;
use lime_core::workspace::WorkspaceSettings;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

pub(super) const MAX_AUTO_COMPACTION_FAILURES: u32 = 3;
const MAX_OUTPUT_TOKENS_FOR_COMPACTION_SUMMARY: usize = 20_000;
const AUTO_COMPACTION_BUFFER_TOKENS: usize = 13_000;

static AUTO_COMPACTION_FAILURES: OnceLock<Mutex<HashMap<String, u32>>> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct AutoCompactionThresholdBudget {
    pub(super) context_limit: usize,
    pub(super) reserved_summary_output_tokens: usize,
    pub(super) continuation_buffer_tokens: usize,
    pub(super) threshold_tokens: usize,
}

impl AutoCompactionThresholdBudget {
    fn threshold_ratio(self) -> f64 {
        if self.context_limit == 0 {
            return 0.1;
        }
        (self.threshold_tokens as f64 / self.context_limit as f64).clamp(0.1, 0.95)
    }
}

fn with_auto_compaction_failure_counts<T>(
    update: impl FnOnce(&mut HashMap<String, u32>) -> T,
) -> T {
    let failures = AUTO_COMPACTION_FAILURES.get_or_init(|| Mutex::new(HashMap::new()));
    let mut guard = match failures.lock() {
        Ok(guard) => guard,
        Err(error) => error.into_inner(),
    };
    update(&mut guard)
}

pub(super) fn auto_compaction_failure_count(session_id: &str) -> u32 {
    with_auto_compaction_failure_counts(|failures| failures.get(session_id).copied().unwrap_or(0))
}

pub(super) fn record_auto_compaction_failure(session_id: &str) -> u32 {
    with_auto_compaction_failure_counts(|failures| {
        let next = failures
            .get(session_id)
            .copied()
            .unwrap_or(0)
            .saturating_add(1);
        failures.insert(session_id.to_string(), next);
        next
    })
}

pub(super) fn reset_auto_compaction_failure(session_id: &str) {
    with_auto_compaction_failure_counts(|failures| {
        failures.remove(session_id);
    });
}

pub(super) fn should_skip_auto_compaction_for_failures(session_id: &str) -> bool {
    auto_compaction_failure_count(session_id) >= MAX_AUTO_COMPACTION_FAILURES
}

pub(super) async fn should_auto_compact_runtime_session(
    provider: &dyn Provider,
    session: &aster::session::Session,
    workspace_settings: &WorkspaceSettings,
    threshold_override: Option<f64>,
) -> Result<bool, String> {
    if !workspace_settings.auto_compact {
        return Ok(false);
    }

    let Some(conversation) = session.conversation.as_ref() else {
        return Ok(false);
    };
    if session.message_count < 2 || conversation.messages().len() < 2 {
        return Ok(false);
    }

    aster::context_mgmt::check_if_compaction_needed(
        provider,
        conversation,
        threshold_override,
        session,
    )
    .await
    .map_err(|error| format!("检查自动压缩阈值失败: {error}"))
}

pub(super) fn resolve_auto_compaction_threshold_budget(
    provider: &dyn Provider,
) -> AutoCompactionThresholdBudget {
    let model_config = provider.get_model_config();
    let context_limit = model_config.context_limit();
    let requested_summary_output_tokens = model_config
        .max_tokens
        .and_then(|value| usize::try_from(value).ok())
        .filter(|value| *value > 0)
        .unwrap_or(MAX_OUTPUT_TOKENS_FOR_COMPACTION_SUMMARY);
    let max_reasonable_reserve = context_limit.saturating_div(2).max(1);
    let reserved_summary_output_tokens = requested_summary_output_tokens
        .min(MAX_OUTPUT_TOKENS_FOR_COMPACTION_SUMMARY)
        .min(max_reasonable_reserve)
        .min(context_limit.saturating_sub(1));
    let effective_context_window = context_limit
        .saturating_sub(reserved_summary_output_tokens)
        .max(1);
    let max_reasonable_buffer = effective_context_window.saturating_div(4).max(1);
    let continuation_buffer_tokens = AUTO_COMPACTION_BUFFER_TOKENS
        .min(max_reasonable_buffer)
        .min(effective_context_window.saturating_sub(1));
    let threshold_tokens = effective_context_window
        .saturating_sub(continuation_buffer_tokens)
        .max(1)
        .min(context_limit.saturating_sub(1).max(1));

    AutoCompactionThresholdBudget {
        context_limit,
        reserved_summary_output_tokens,
        continuation_buffer_tokens,
        threshold_tokens,
    }
}

pub(super) fn resolve_auto_compact_threshold_override(
    threshold_budget: AutoCompactionThresholdBudget,
) -> f64 {
    threshold_budget.threshold_ratio()
}

#[cfg(test)]
mod tests {
    use super::*;
    use aster::conversation::message::Message;
    use aster::model::ModelConfig;
    use aster::providers::base::{ProviderMetadata, ProviderUsage};
    use aster::providers::errors::ProviderError;
    use async_trait::async_trait;
    use lime_core::workspace::WorkspaceSettings;
    use rmcp::model::Tool;
    use uuid::Uuid;

    #[derive(Clone)]
    struct AutoCompactThresholdTestProvider {
        context_limit: Option<usize>,
        max_tokens: Option<i32>,
    }

    impl AutoCompactThresholdTestProvider {
        fn new(context_limit: Option<usize>) -> Self {
            Self {
                context_limit,
                max_tokens: None,
            }
        }

        fn with_max_tokens(context_limit: Option<usize>, max_tokens: Option<i32>) -> Self {
            Self {
                context_limit,
                max_tokens,
            }
        }
    }

    #[async_trait]
    impl Provider for AutoCompactThresholdTestProvider {
        fn metadata() -> ProviderMetadata {
            ProviderMetadata::new(
                "auto-compact-threshold-test",
                "Auto Compact Threshold Test",
                "用于测试自动压缩阈值判断的 provider",
                "auto-compact-threshold-test-model",
                vec!["auto-compact-threshold-test-model"],
                "",
                vec![],
            )
        }

        fn get_name(&self) -> &str {
            "auto-compact-threshold-test"
        }

        async fn complete_with_model(
            &self,
            _model_config: &ModelConfig,
            _system: &str,
            _messages: &[Message],
            _tools: &[Tool],
        ) -> Result<(Message, ProviderUsage), ProviderError> {
            Err(ProviderError::ExecutionError(
                "测试不应调用 complete_with_model".to_string(),
            ))
        }

        fn get_model_config(&self) -> ModelConfig {
            ModelConfig {
                model_name: "auto-compact-threshold-test-model".to_string(),
                context_limit: self.context_limit,
                temperature: None,
                max_tokens: self.max_tokens,
                toolshim: false,
                toolshim_model: None,
                fast_model: None,
            }
        }
    }

    fn build_auto_compaction_test_session(total_tokens: Option<i32>) -> aster::session::Session {
        let conversation = aster::conversation::Conversation::new_unvalidated(vec![
            Message::user().with_text("第一条用户消息"),
            Message::assistant().with_text("第一条助手回复"),
        ]);

        aster::session::Session {
            conversation: Some(conversation),
            message_count: 2,
            total_tokens,
            ..aster::session::Session::default()
        }
    }

    #[test]
    fn auto_compaction_failure_circuit_breaker_should_trip_after_three_failures() {
        let session_id = format!("auto-compaction-failure-{}", Uuid::new_v4());

        reset_auto_compaction_failure(&session_id);
        assert_eq!(auto_compaction_failure_count(&session_id), 0);
        assert!(!should_skip_auto_compaction_for_failures(&session_id));

        assert_eq!(record_auto_compaction_failure(&session_id), 1);
        assert!(!should_skip_auto_compaction_for_failures(&session_id));
        assert_eq!(record_auto_compaction_failure(&session_id), 2);
        assert!(!should_skip_auto_compaction_for_failures(&session_id));
        assert_eq!(
            record_auto_compaction_failure(&session_id),
            MAX_AUTO_COMPACTION_FAILURES
        );
        assert!(should_skip_auto_compaction_for_failures(&session_id));

        reset_auto_compaction_failure(&session_id);
        assert_eq!(auto_compaction_failure_count(&session_id), 0);
        assert!(!should_skip_auto_compaction_for_failures(&session_id));
    }

    #[test]
    fn resolve_auto_compact_threshold_should_reserve_summary_output_and_buffer_tokens() {
        let provider = AutoCompactThresholdTestProvider::new(Some(100_000));

        let budget = resolve_auto_compaction_threshold_budget(&provider);
        assert_eq!(budget.context_limit, 100_000);
        assert_eq!(budget.reserved_summary_output_tokens, 20_000);
        assert_eq!(budget.continuation_buffer_tokens, 13_000);
        assert_eq!(budget.threshold_tokens, 67_000);
        assert!(
            (resolve_auto_compact_threshold_override(budget) - 0.67).abs() < 0.000_001,
            "自动压缩阈值应基于有效窗口而不是完整上下文窗口"
        );
    }

    #[test]
    fn resolve_auto_compact_threshold_should_respect_lower_provider_output_limit() {
        let provider =
            AutoCompactThresholdTestProvider::with_max_tokens(Some(100_000), Some(8_192));

        let budget = resolve_auto_compaction_threshold_budget(&provider);
        assert_eq!(budget.reserved_summary_output_tokens, 8_192);
        assert_eq!(budget.continuation_buffer_tokens, 13_000);
        assert_eq!(budget.threshold_tokens, 78_808);
        assert!((resolve_auto_compact_threshold_override(budget) - 0.78808).abs() < 0.000_001);
    }

    #[tokio::test]
    async fn should_auto_compact_runtime_session_when_effective_window_threshold_exceeded() {
        let provider = AutoCompactThresholdTestProvider::new(Some(100_000));
        let session = build_auto_compaction_test_session(Some(70_000));
        let threshold_budget = resolve_auto_compaction_threshold_budget(&provider);

        assert!(should_auto_compact_runtime_session(
            &provider,
            &session,
            &WorkspaceSettings::default(),
            Some(resolve_auto_compact_threshold_override(threshold_budget)),
        )
        .await
        .expect("检查自动压缩阈值失败"));
    }

    #[tokio::test]
    async fn should_auto_compact_runtime_session_when_workspace_pref_enabled_and_context_threshold_exceeded(
    ) {
        let provider = AutoCompactThresholdTestProvider::new(Some(1_000));
        let session = build_auto_compaction_test_session(Some(900));

        assert!(should_auto_compact_runtime_session(
            &provider,
            &session,
            &WorkspaceSettings::default(),
            Some(0.8),
        )
        .await
        .expect("检查自动压缩阈值失败"));
    }

    #[tokio::test]
    async fn should_not_auto_compact_runtime_session_when_workspace_pref_disabled() {
        let provider = AutoCompactThresholdTestProvider::new(Some(1_000));
        let session = build_auto_compaction_test_session(Some(900));
        let workspace_settings = WorkspaceSettings {
            auto_compact: false,
            ..WorkspaceSettings::default()
        };

        assert!(!should_auto_compact_runtime_session(
            &provider,
            &session,
            &workspace_settings,
            Some(0.8),
        )
        .await
        .expect("检查自动压缩阈值失败"));
    }

    #[tokio::test]
    async fn should_not_auto_compact_runtime_session_when_context_threshold_not_exceeded() {
        let provider = AutoCompactThresholdTestProvider::new(Some(1_000));
        let session = build_auto_compaction_test_session(Some(700));

        assert!(!should_auto_compact_runtime_session(
            &provider,
            &session,
            &WorkspaceSettings::default(),
            Some(0.8),
        )
        .await
        .expect("检查自动压缩阈值失败"));
    }
}
