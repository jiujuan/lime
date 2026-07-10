#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RuntimeReplyProviderModelChangeMode {
    Lead,
    Worker,
    Unknown,
}

impl RuntimeReplyProviderModelChangeMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Lead => "lead",
            Self::Worker => "worker",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeReplyProviderModelChange {
    pub model: String,
    pub mode: RuntimeReplyProviderModelChangeMode,
}

pub fn provider_stream_model_change(
    active_model: impl Into<String>,
    lead_model: &str,
    worker_model: &str,
) -> RuntimeReplyProviderModelChange {
    let active_model = active_model.into();
    let mode = if active_model == lead_model {
        RuntimeReplyProviderModelChangeMode::Lead
    } else if active_model == worker_model {
        RuntimeReplyProviderModelChangeMode::Worker
    } else {
        RuntimeReplyProviderModelChangeMode::Unknown
    };

    RuntimeReplyProviderModelChange {
        model: active_model,
        mode,
    }
}
