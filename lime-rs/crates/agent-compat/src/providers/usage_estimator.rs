use crate::conversation::message::Message;
use crate::providers::base::ProviderUsage;
use anyhow::Result;
use rmcp::model::Tool;
use tool_runtime::tool_io::estimate_tool_io_tokens;

fn usize_to_i32_saturating(value: usize) -> i32 {
    value.min(i32::MAX as usize) as i32
}

fn estimate_messages_tokens(messages: &[Message]) -> usize {
    messages
        .iter()
        .flat_map(|message| message.content.iter())
        .map(|content| estimate_tool_io_tokens(&content.to_string()))
        .sum()
}

fn estimate_tools_tokens(tools: &[Tool]) -> usize {
    tools
        .iter()
        .map(|tool| {
            serde_json::to_string(tool)
                .map(|serialized| estimate_tool_io_tokens(&serialized))
                .unwrap_or_else(|_| estimate_tool_io_tokens(tool.name.as_ref()))
        })
        .sum()
}

/// Ensures that ProviderUsage has token counts, estimating them if necessary.
/// This provides a single place to handle the fallback logic for providers that don't return usage data.
pub async fn ensure_usage_tokens(
    provider_usage: &mut ProviderUsage,
    system_prompt: &str,
    request_messages: &[Message],
    response: &Message,
    tools: &[Tool],
) -> Result<()> {
    if provider_usage.usage.input_tokens.is_some() && provider_usage.usage.output_tokens.is_some() {
        return Ok(());
    }

    if provider_usage.usage.input_tokens.is_none() {
        let input_count = estimate_tool_io_tokens(system_prompt)
            + estimate_messages_tokens(request_messages)
            + estimate_tools_tokens(tools);
        provider_usage.usage.input_tokens = Some(usize_to_i32_saturating(input_count));
    }

    if provider_usage.usage.output_tokens.is_none() {
        let response_text = response
            .content
            .iter()
            .map(|c| format!("{}", c))
            .collect::<Vec<_>>()
            .join(" ");
        let output_count = estimate_tool_io_tokens(&response_text);
        provider_usage.usage.output_tokens = Some(usize_to_i32_saturating(output_count));
    }

    if let (Some(input), Some(output)) = (
        provider_usage.usage.input_tokens,
        provider_usage.usage.output_tokens,
    ) {
        provider_usage.usage.total_tokens = Some(input + output);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::conversation::message::Message;
    use crate::providers::base::Usage;

    #[tokio::test]
    async fn test_ensure_usage_tokens_already_complete() {
        let mut usage = ProviderUsage::new(
            "test-model".to_string(),
            Usage::new(Some(100), Some(50), Some(150)),
        );

        let response = Message::assistant().with_text("Test response");

        ensure_usage_tokens(&mut usage, "system", &[], &response, &[])
            .await
            .unwrap();

        // Should remain unchanged
        assert_eq!(usage.usage.input_tokens, Some(100));
        assert_eq!(usage.usage.output_tokens, Some(50));
        assert_eq!(usage.usage.total_tokens, Some(150));
    }

    #[tokio::test]
    async fn test_ensure_usage_tokens_missing_all() {
        let mut usage = ProviderUsage::new("test-model".to_string(), Usage::default());

        let response = Message::assistant().with_text("Test response");
        let messages = vec![Message::user().with_text("Hello")];

        ensure_usage_tokens(
            &mut usage,
            "You are a helpful assistant",
            &messages,
            &response,
            &[],
        )
        .await
        .unwrap();

        // Should have estimated values
        assert!(usage.usage.input_tokens.is_some());
        assert!(usage.usage.output_tokens.is_some());
        assert!(usage.usage.total_tokens.is_some());

        // Basic sanity checks
        assert!(usage.usage.input_tokens.unwrap() > 0);
        assert!(usage.usage.output_tokens.unwrap() > 0);
        assert_eq!(
            usage.usage.total_tokens.unwrap(),
            usage.usage.input_tokens.unwrap() + usage.usage.output_tokens.unwrap()
        );
    }

    #[tokio::test]
    async fn test_ensure_usage_tokens_partial() {
        let mut usage =
            ProviderUsage::new("test-model".to_string(), Usage::new(Some(100), None, None));

        let response = Message::assistant().with_text("Test response");

        ensure_usage_tokens(&mut usage, "system", &[], &response, &[])
            .await
            .unwrap();

        // Input should remain unchanged
        assert_eq!(usage.usage.input_tokens, Some(100));
        // Output should be estimated
        assert!(usage.usage.output_tokens.is_some());
        assert!(usage.usage.output_tokens.unwrap() > 0);
        // Total should be calculated
        assert_eq!(
            usage.usage.total_tokens.unwrap(),
            usage.usage.input_tokens.unwrap() + usage.usage.output_tokens.unwrap()
        );
    }
}
