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
