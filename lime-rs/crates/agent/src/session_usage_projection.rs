use crate::protocol::AgentTokenUsage;

pub(crate) fn project_token_usage(
    input_tokens: Option<i32>,
    output_tokens: Option<i32>,
    cached_input_tokens: Option<i32>,
    cache_creation_input_tokens: Option<i32>,
) -> Option<AgentTokenUsage> {
    match (input_tokens, output_tokens) {
        (Some(input_tokens), Some(output_tokens)) if input_tokens >= 0 && output_tokens >= 0 => {
            Some(AgentTokenUsage {
                input_tokens: input_tokens as u32,
                output_tokens: output_tokens as u32,
                cached_input_tokens: cached_input_tokens
                    .filter(|value| *value >= 0)
                    .map(|value| value as u32),
                cache_creation_input_tokens: cache_creation_input_tokens
                    .filter(|value| *value >= 0)
                    .map(|value| value as u32),
            })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::project_token_usage;
    use crate::AgentTokenUsage;

    #[test]
    fn project_token_usage_ignores_negative_optional_cache_values() {
        assert_eq!(
            project_token_usage(Some(31_000), Some(0), Some(-1), Some(512)),
            Some(AgentTokenUsage {
                input_tokens: 31_000,
                output_tokens: 0,
                cached_input_tokens: None,
                cache_creation_input_tokens: Some(512),
            })
        );
    }

    #[test]
    fn project_token_usage_requires_non_negative_input_and_output() {
        assert_eq!(project_token_usage(Some(31_000), None, None, None), None);
        assert_eq!(project_token_usage(Some(-1), Some(0), None, None), None);
    }
}
