use crate::model_request_policy::{
    model_request_policy_from_turn_context, ModelTruncationPolicySnapshot,
};
use crate::turn_context_configuration::AgentTurnContext;
use tool_runtime::tool_io::estimate_tool_io_tokens;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ToolOutputTruncationPolicy {
    Bytes(usize),
    Tokens(usize),
}

impl ToolOutputTruncationPolicy {
    pub(crate) fn drain_max_bytes(self, default_bytes: u64) -> u64 {
        match self {
            Self::Bytes(limit) => u64::try_from(limit).unwrap_or(u64::MAX),
            Self::Tokens(_) => default_bytes,
        }
    }
}

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

pub(crate) fn format_tool_output_for_model(
    output: &str,
    policy: ToolOutputTruncationPolicy,
) -> String {
    match policy {
        ToolOutputTruncationPolicy::Bytes(limit) => formatted_truncate_bytes(output, limit),
        ToolOutputTruncationPolicy::Tokens(limit) => formatted_truncate_tokens(output, limit),
    }
}

fn formatted_truncate_bytes(output: &str, limit: usize) -> String {
    if output.len() <= limit {
        return output.to_string();
    }
    formatted_truncated_output(output, truncate_middle_bytes(output, limit))
}

fn formatted_truncate_tokens(output: &str, limit: usize) -> String {
    let original_tokens = estimate_tool_io_tokens(output);
    if original_tokens <= limit {
        return output.to_string();
    }
    formatted_truncated_output(
        output,
        truncate_middle_tokens(output, limit, original_tokens),
    )
}

fn formatted_truncated_output(output: &str, truncated: String) -> String {
    let original_tokens = estimate_tool_io_tokens(output);
    let total_lines = output.lines().count();
    format!(
        "Warning: truncated output (original token count: {original_tokens})\nTotal output lines: {total_lines}\n\n{truncated}"
    )
}

fn truncate_middle_bytes(output: &str, limit: usize) -> String {
    if limit == 0 {
        return format!("…{} chars truncated…", output.chars().count());
    }

    if output.len() <= limit {
        return output.to_string();
    }

    let prefix_budget = limit / 2;
    let suffix_budget = limit.saturating_sub(prefix_budget);
    let prefix = take_prefix_by_byte_budget(output, prefix_budget);
    let suffix = take_suffix_by_byte_budget(output, suffix_budget);
    let omitted = output
        .chars()
        .count()
        .saturating_sub(prefix.chars().count())
        .saturating_sub(suffix.chars().count());
    format!("{prefix}…{omitted} chars truncated…{suffix}")
}

fn truncate_middle_tokens(output: &str, limit: usize, original_tokens: usize) -> String {
    if limit == 0 {
        return format!("…{original_tokens} tokens truncated…");
    }

    let prefix_budget = limit / 2;
    let suffix_budget = limit.saturating_sub(prefix_budget);
    let prefix = take_prefix_by_token_budget(output, prefix_budget);
    let suffix = take_suffix_by_token_budget(output, suffix_budget);
    let omitted = original_tokens.saturating_sub(limit);
    format!("{prefix}…{omitted} tokens truncated…{suffix}")
}

fn char_boundaries(output: &str) -> Vec<usize> {
    let mut boundaries = output
        .char_indices()
        .map(|(idx, _)| idx)
        .collect::<Vec<_>>();
    if boundaries.first().copied() != Some(0) {
        boundaries.insert(0, 0);
    }
    if boundaries.last().copied() != Some(output.len()) {
        boundaries.push(output.len());
    }
    boundaries
}

fn take_prefix_by_token_budget(output: &str, budget: usize) -> String {
    if budget == 0 || output.is_empty() {
        return String::new();
    }

    let boundaries = char_boundaries(output);
    let mut low = 0usize;
    let mut high = boundaries.len().saturating_sub(1);
    while low < high {
        let mid = (low + high + 1) / 2;
        if estimate_tool_io_tokens(&output[..boundaries[mid]]) <= budget {
            low = mid;
        } else {
            high = mid.saturating_sub(1);
        }
    }
    output[..boundaries[low]].to_string()
}

fn take_suffix_by_token_budget(output: &str, budget: usize) -> String {
    if budget == 0 || output.is_empty() {
        return String::new();
    }

    let boundaries = char_boundaries(output);
    let mut low = 0usize;
    let mut high = boundaries.len().saturating_sub(1);
    while low < high {
        let mid = (low + high) / 2;
        if estimate_tool_io_tokens(&output[boundaries[mid]..]) <= budget {
            high = mid;
        } else {
            low = mid + 1;
        }
    }
    output[boundaries[low]..].to_string()
}

fn take_prefix_by_byte_budget(output: &str, budget: usize) -> String {
    output
        .char_indices()
        .map(|(idx, _)| idx)
        .chain(std::iter::once(output.len()))
        .take_while(|idx| *idx <= budget)
        .last()
        .map(|end| output[..end].to_string())
        .unwrap_or_default()
}

fn take_suffix_by_byte_budget(output: &str, budget: usize) -> String {
    let start_floor = output.len().saturating_sub(budget);
    output
        .char_indices()
        .map(|(idx, _)| idx)
        .chain(std::iter::once(output.len()))
        .find(|idx| *idx >= start_floor)
        .map(|start| output[start..].to_string())
        .unwrap_or_default()
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

    #[test]
    fn token_policy_formats_large_output_with_codex_style_warning() {
        let output = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
        let formatted = format_tool_output_for_model(output, ToolOutputTruncationPolicy::Tokens(4));

        assert!(formatted.starts_with("Warning: truncated output (original token count:"));
        assert!(formatted.contains("Total output lines: 1"));
        assert!(formatted.contains("tokens truncated"));
        assert!(formatted.contains("alpha"));
        assert!(formatted.contains("kappa"));
    }

    #[test]
    fn token_policy_keeps_small_output_unchanged() {
        let output = "small output";

        assert_eq!(
            format_tool_output_for_model(output, ToolOutputTruncationPolicy::Tokens(64)),
            output
        );
    }

    #[test]
    fn byte_policy_preserves_utf8_boundaries() {
        let formatted = format_tool_output_for_model(
            "你好，世界。hello world",
            ToolOutputTruncationPolicy::Bytes(18),
        );

        assert!(formatted.contains("chars truncated"));
        assert!(formatted.contains("你好"));
        assert!(formatted.contains("world"));
    }
}
