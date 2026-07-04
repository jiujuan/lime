use super::WORKER_PACKAGE_SIGNATURE_UNVERIFIED;

#[derive(Debug, Clone)]
pub(super) struct WorkerFailureProjection {
    pub(super) error_code: &'static str,
    pub(super) error_message: String,
    pub(super) category: &'static str,
    pub(super) retryable: bool,
    pub(super) retry_advice: &'static str,
    pub(super) retry_attempt: u64,
    pub(super) retry_max_attempts: u64,
}

impl WorkerFailureProjection {
    pub(super) fn with_retry_attempt(mut self, retry_attempt: u64) -> Self {
        self.retry_attempt = retry_attempt;
        self
    }

    pub(super) fn should_retry(&self) -> bool {
        self.retryable && self.retry_attempt < self.retry_max_attempts
    }
}

pub(super) fn classify_worker_failure(error_message: &str) -> WorkerFailureProjection {
    let lower = error_message.to_ascii_lowercase();
    let (error_code, category, retryable, retry_advice) =
        if lower.contains("已禁用") || lower.contains("disabled") {
            (
                "PLUGIN_WORKER_DISABLED",
                "configuration",
                false,
                "enable_app",
            )
        } else if lower.contains("package_signature_unverified")
            || lower.contains("package signature gate")
        {
            (
                WORKER_PACKAGE_SIGNATURE_UNVERIFIED,
                "configuration",
                false,
                "reinstall_verified_package",
            )
        } else if lower.contains("blocker") {
            (
                "PLUGIN_WORKER_BLOCKED",
                "configuration",
                false,
                "resolve_runtime_blocker",
            )
        } else if lower.contains("unsupported")
            || lower.contains("direct provider")
            || lower.contains("direct filesystem")
        {
            (
                "PLUGIN_WORKER_CONTRACT_UNSUPPORTED",
                "configuration",
                false,
                "fix_runtime_contract",
            )
        } else if lower.contains("timed out") || lower.contains("timeout") {
            (
                "PLUGIN_WORKER_TIMEOUT",
                "timeout",
                true,
                "retry_same_action",
            )
        } else if lower.contains("worker_retryable") {
            (
                "PLUGIN_WORKER_RETRYABLE_FAILURE",
                "worker_retryable",
                true,
                "retry_same_action",
            )
        } else if lower.contains("missing artifacts")
            || lower.contains("artifact.snapshot")
            || lower.contains("did not complete")
            || lower.contains("decode")
            || lower.contains("json")
            || lower.contains("stdout")
        {
            (
                "PLUGIN_WORKER_OUTPUT_INVALID",
                "worker_output",
                false,
                "inspect_worker_output",
            )
        } else if lower.contains("spawn")
            || lower.contains("exited")
            || lower.contains("entrypoint")
            || lower.contains("not found")
        {
            (
                "PLUGIN_WORKER_RUNTIME_UNAVAILABLE",
                "runtime_unavailable",
                false,
                "fix_runtime_package",
            )
        } else {
            (
                "PLUGIN_WORKER_FAILED",
                "unknown",
                false,
                "inspect_worker_log",
            )
        };
    WorkerFailureProjection {
        error_code,
        error_message: error_message.to_string(),
        category,
        retryable,
        retry_advice,
        retry_attempt: 0,
        retry_max_attempts: if retryable { 1 } else { 0 },
    }
}
