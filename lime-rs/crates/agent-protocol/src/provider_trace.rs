use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderTraceStage {
    RequestStarted,
    FirstEventReceived,
    FirstTextDeltaReceived,
    Failed,
    Canceled,
}

#[cfg(test)]
mod tests {
    use super::ProviderTraceStage;

    #[test]
    fn provider_trace_stage_uses_snake_case_wire_values() {
        let value = serde_json::to_value(ProviderTraceStage::FirstTextDeltaReceived)
            .expect("serialize provider trace stage");

        assert_eq!(value, serde_json::json!("first_text_delta_received"));
    }
}
