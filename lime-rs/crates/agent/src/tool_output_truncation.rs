use crate::model_request_policy::{
    model_request_policy_from_turn_context, ModelTruncationPolicySnapshot,
};
use crate::turn_context_configuration::AgentTurnContext;
pub(crate) use tool_runtime::tool_io::{format_tool_output_for_model, ToolOutputTruncationPolicy};

pub(crate) fn tool_output_truncation_policy_from_turn_context(
    turn_context: Option<&AgentTurnContext>,
    default_bytes: u64,
) -> ToolOutputTruncationPolicy {
    model_request_policy_from_turn_context(turn_context)
        .and_then(|policy| policy.truncation_policy)
        .as_ref()
        .map(truncation_policy_from_snapshot)
        .unwrap_or_else(|| {
            ToolOutputTruncationPolicy::Bytes(usize::try_from(default_bytes).unwrap_or(usize::MAX))
        })
}

fn truncation_policy_from_snapshot(
    policy: &ModelTruncationPolicySnapshot,
) -> ToolOutputTruncationPolicy {
    let limit = usize::try_from(policy.limit).unwrap_or(usize::MAX);
    if policy.mode == "tokens" {
        ToolOutputTruncationPolicy::Tokens(limit)
    } else {
        ToolOutputTruncationPolicy::Bytes(limit)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    #[test]
    fn reads_token_truncation_policy_from_turn_context() {
        let context = AgentTurnContext {
            metadata: HashMap::from([(
                "runtime_options".to_string(),
                json!({
                    "harness": {
                        "model_request_policy": {
                            "truncation_policy": {
                                "mode": "tokens",
                                "limit": 8
                            }
                        }
                    }
                }),
            )]),
            ..AgentTurnContext::default()
        };

        assert_eq!(
            tool_output_truncation_policy_from_turn_context(Some(&context), 64 * 1024),
            ToolOutputTruncationPolicy::Tokens(8)
        );
    }
}
