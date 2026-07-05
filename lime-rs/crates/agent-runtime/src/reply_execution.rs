//! Reply execution 的 current result contract。
//!
//! 具体后端的错误类型留在 adapter 边界转换；这里仅描述 Lime runtime 主链
//! 对外可传递的执行结果和可恢复错误状态。

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeReplyAttemptError {
    pub message: String,
    pub emitted_any: bool,
}

impl RuntimeReplyAttemptError {
    pub fn new(message: impl Into<String>, emitted_any: bool) -> Self {
        Self {
            message: message.into(),
            emitted_any,
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RuntimeReplyExecution {
    pub text_output: String,
    pub event_errors: Vec<String>,
    pub emitted_any: bool,
    pub attempts_summary: String,
    pub cancelled: bool,
}

impl RuntimeReplyExecution {
    pub fn new(
        text_output: String,
        event_errors: Vec<String>,
        emitted_any: bool,
        attempts_summary: String,
        cancelled: bool,
    ) -> Self {
        Self {
            text_output,
            event_errors,
            emitted_any,
            attempts_summary,
            cancelled,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reply_attempt_error_carries_emission_state() {
        let error = RuntimeReplyAttemptError::new("provider failed", true);

        assert_eq!(error.message, "provider failed");
        assert!(error.emitted_any);
    }

    #[test]
    fn reply_execution_preserves_attempt_summary_and_cancel_state() {
        let execution = RuntimeReplyExecution::new(
            "done".to_string(),
            vec!["tool warning".to_string()],
            true,
            "attempts=1".to_string(),
            false,
        );

        assert_eq!(execution.text_output, "done");
        assert_eq!(execution.event_errors, vec!["tool warning"]);
        assert!(execution.emitted_any);
        assert_eq!(execution.attempts_summary, "attempts=1");
        assert!(!execution.cancelled);
    }
}
