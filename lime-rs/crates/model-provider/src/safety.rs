use std::collections::HashSet;

use crate::ModelProviderProtocol;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProviderToolMessageRole {
    Assistant,
    User,
    Other,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProviderToolContentProjection {
    Other,
    ToolRequest { id: String, valid: bool },
    FrontendToolRequest { id: String, valid: bool },
    ToolResponse { id: String },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProviderToolMessageProjection {
    pub role: ProviderToolMessageRole,
    pub contents: Vec<ProviderToolContentProjection>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProviderToolMessageNormalization {
    pub retained_content_indices: Vec<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProviderToolNormalization {
    pub messages: Vec<ProviderToolMessageNormalization>,
    pub removed_invalid_requests: usize,
    pub removed_invalid_responses: usize,
}

pub fn normalize_provider_tool_messages(
    messages: &[ProviderToolMessageProjection],
) -> ProviderToolNormalization {
    let mut retained_content_indices: Vec<Vec<usize>> = vec![Vec::new(); messages.len()];
    let mut valid_request_ids = HashSet::new();
    let mut matched_request_ids = HashSet::new();
    let mut removed_invalid_requests = 0_usize;
    let mut removed_invalid_responses = 0_usize;

    for (message_index, message) in messages.iter().enumerate() {
        for (content_index, content) in message.contents.iter().enumerate() {
            match content {
                ProviderToolContentProjection::ToolRequest { id, valid }
                | ProviderToolContentProjection::FrontendToolRequest { id, valid } => {
                    if message.role != ProviderToolMessageRole::Assistant || !valid {
                        removed_invalid_requests += 1;
                        continue;
                    }
                    valid_request_ids.insert(id.clone());
                    retained_content_indices[message_index].push(content_index);
                }
                ProviderToolContentProjection::ToolResponse { id } => {
                    if message.role != ProviderToolMessageRole::User
                        || !valid_request_ids.contains(id)
                        || matched_request_ids.contains(id)
                    {
                        removed_invalid_responses += 1;
                        continue;
                    }
                    matched_request_ids.insert(id.clone());
                    retained_content_indices[message_index].push(content_index);
                }
                ProviderToolContentProjection::Other => {
                    retained_content_indices[message_index].push(content_index);
                }
            }
        }
    }

    let messages = retained_content_indices
        .into_iter()
        .enumerate()
        .map(|(message_index, indices)| {
            let retained_content_indices = indices
                .into_iter()
                .filter(
                    |content_index| match &messages[message_index].contents[*content_index] {
                        ProviderToolContentProjection::ToolRequest { id, .. }
                        | ProviderToolContentProjection::FrontendToolRequest { id, .. }
                        | ProviderToolContentProjection::ToolResponse { id } => {
                            matched_request_ids.contains(id)
                        }
                        ProviderToolContentProjection::Other => true,
                    },
                )
                .collect();
            ProviderToolMessageNormalization {
                retained_content_indices,
            }
        })
        .collect();

    ProviderToolNormalization {
        messages,
        removed_invalid_requests,
        removed_invalid_responses,
    }
}

pub fn normalize_fast_model(
    fast_model: Option<String>,
    disable_default_fast_model: bool,
) -> Option<String> {
    if disable_default_fast_model {
        None
    } else {
        fast_model
    }
}

fn normalize_provider_identifier(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase)
}

fn is_first_party_openai_selector(selector: &str) -> bool {
    matches!(selector, "openai" | "codex")
}

fn is_first_party_openai_base_url(base_url: &str) -> bool {
    base_url.trim().to_ascii_lowercase().contains("openai.com")
}

fn is_first_party_anthropic_selector(selector: &str) -> bool {
    matches!(selector, "anthropic" | "claude")
}

fn is_first_party_anthropic_base_url(base_url: &str) -> bool {
    base_url
        .trim()
        .to_ascii_lowercase()
        .contains("api.anthropic.com")
}

pub fn should_disable_provider_default_fast_model(
    provider_name: &str,
    provider_selector: Option<&str>,
    base_url: Option<&str>,
    protocol: Option<&ModelProviderProtocol>,
) -> bool {
    if protocol.is_some_and(ModelProviderProtocol::uses_responses_api) {
        return false;
    }

    match provider_name {
        "openai" => {
            if let Some(base_url) = base_url {
                if !is_first_party_openai_base_url(base_url) {
                    return true;
                }
            }

            match normalize_provider_identifier(provider_selector) {
                Some(selector) => !is_first_party_openai_selector(&selector),
                None => false,
            }
        }
        "anthropic" => {
            if let Some(base_url) = base_url {
                if !is_first_party_anthropic_base_url(base_url) {
                    return true;
                }
            }

            match normalize_provider_identifier(provider_selector) {
                Some(selector) if base_url.is_none() => {
                    !is_first_party_anthropic_selector(&selector)
                }
                _ => false,
            }
        }
        _ => false,
    }
}

pub fn truncate_provider_text(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        text.to_string()
    } else {
        let truncated: String = text.chars().take(max_chars.saturating_sub(3)).collect();
        format!("{truncated}...")
    }
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_fast_model, normalize_provider_tool_messages,
        should_disable_provider_default_fast_model, truncate_provider_text,
        ProviderToolContentProjection, ProviderToolMessageProjection, ProviderToolMessageRole,
    };
    use crate::ModelProviderProtocol;

    fn assistant(contents: Vec<ProviderToolContentProjection>) -> ProviderToolMessageProjection {
        ProviderToolMessageProjection {
            role: ProviderToolMessageRole::Assistant,
            contents,
        }
    }

    fn user(contents: Vec<ProviderToolContentProjection>) -> ProviderToolMessageProjection {
        ProviderToolMessageProjection {
            role: ProviderToolMessageRole::User,
            contents,
        }
    }

    fn text() -> ProviderToolContentProjection {
        ProviderToolContentProjection::Other
    }

    #[test]
    fn provider_default_fast_model_policy_should_keep_first_party_openai() {
        assert!(!should_disable_provider_default_fast_model(
            "openai",
            Some("openai"),
            Some("https://api.openai.com/v1"),
            None,
        ));
    }

    #[test]
    fn provider_default_fast_model_policy_should_disable_openai_compatible_proxy() {
        assert!(should_disable_provider_default_fast_model(
            "openai",
            Some("ollama"),
            Some("http://localhost:11434/v1"),
            None,
        ));
    }

    #[test]
    fn provider_default_fast_model_policy_should_keep_responses_route() {
        assert!(!should_disable_provider_default_fast_model(
            "openai",
            Some("ollama"),
            Some("http://localhost:11434/v1"),
            Some(&ModelProviderProtocol::Responses),
        ));
    }

    #[test]
    fn provider_default_fast_model_policy_should_disable_anthropic_compatible_proxy() {
        assert!(should_disable_provider_default_fast_model(
            "anthropic",
            Some("anthropic-compatible"),
            Some("https://proxy.example.com"),
            None,
        ));
    }

    fn tool_request(id: &str) -> ProviderToolContentProjection {
        ProviderToolContentProjection::ToolRequest {
            id: id.to_string(),
            valid: true,
        }
    }

    fn invalid_tool_request(id: &str) -> ProviderToolContentProjection {
        ProviderToolContentProjection::ToolRequest {
            id: id.to_string(),
            valid: false,
        }
    }

    fn invalid_frontend_tool_request(id: &str) -> ProviderToolContentProjection {
        ProviderToolContentProjection::FrontendToolRequest {
            id: id.to_string(),
            valid: false,
        }
    }

    fn tool_response(id: &str) -> ProviderToolContentProjection {
        ProviderToolContentProjection::ToolResponse { id: id.to_string() }
    }

    #[test]
    fn normalize_provider_tool_messages_should_preserve_valid_tool_chain() {
        let messages = vec![
            user(vec![text()]),
            assistant(vec![text(), tool_request("tool-1")]),
            user(vec![tool_response("tool-1")]),
            assistant(vec![text()]),
        ];

        let normalized = normalize_provider_tool_messages(&messages);

        assert_eq!(
            normalized
                .messages
                .iter()
                .map(|message| message.retained_content_indices.as_slice())
                .collect::<Vec<_>>(),
            vec![&[0][..], &[0, 1][..], &[0][..], &[0][..]]
        );
        assert_eq!(normalized.removed_invalid_requests, 0);
        assert_eq!(normalized.removed_invalid_responses, 0);
    }

    #[test]
    fn normalize_provider_tool_messages_should_remove_orphan_response() {
        let messages = vec![
            user(vec![text()]),
            user(vec![tool_response("orphan-tool")]),
            assistant(vec![text()]),
        ];

        let normalized = normalize_provider_tool_messages(&messages);

        assert_eq!(
            normalized
                .messages
                .iter()
                .map(|message| message.retained_content_indices.as_slice())
                .collect::<Vec<_>>(),
            vec![&[0][..], &[][..], &[0][..]]
        );
        assert_eq!(normalized.removed_invalid_responses, 1);
    }

    #[test]
    fn normalize_provider_tool_messages_should_drop_invalid_request_and_response() {
        let messages = vec![
            assistant(vec![text(), invalid_tool_request("broken-tool")]),
            user(vec![tool_response("broken-tool")]),
            assistant(vec![text()]),
        ];

        let normalized = normalize_provider_tool_messages(&messages);

        assert_eq!(
            normalized
                .messages
                .iter()
                .map(|message| message.retained_content_indices.as_slice())
                .collect::<Vec<_>>(),
            vec![&[0][..], &[][..], &[0][..]]
        );
        assert_eq!(normalized.removed_invalid_requests, 1);
        assert_eq!(normalized.removed_invalid_responses, 1);
    }

    #[test]
    fn normalize_provider_tool_messages_should_drop_invalid_frontend_request_and_response() {
        let messages = vec![
            assistant(vec![text(), invalid_frontend_tool_request("frontend-tool")]),
            user(vec![tool_response("frontend-tool")]),
            assistant(vec![text()]),
        ];

        let normalized = normalize_provider_tool_messages(&messages);

        assert_eq!(
            normalized
                .messages
                .iter()
                .map(|message| message.retained_content_indices.as_slice())
                .collect::<Vec<_>>(),
            vec![&[0][..], &[][..], &[0][..]]
        );
        assert_eq!(normalized.removed_invalid_requests, 1);
        assert_eq!(normalized.removed_invalid_responses, 1);
    }

    #[test]
    fn normalize_provider_tool_messages_should_drop_duplicate_response() {
        let messages = vec![
            assistant(vec![tool_request("tool-1")]),
            user(vec![tool_response("tool-1")]),
            user(vec![tool_response("tool-1")]),
        ];

        let normalized = normalize_provider_tool_messages(&messages);

        assert_eq!(
            normalized
                .messages
                .iter()
                .map(|message| message.retained_content_indices.as_slice())
                .collect::<Vec<_>>(),
            vec![&[0][..], &[0][..], &[][..]]
        );
        assert_eq!(normalized.removed_invalid_responses, 1);
    }

    #[test]
    fn normalize_fast_model_should_strip_when_disabled() {
        let normalized = normalize_fast_model(Some("gpt-4o-mini".to_string()), true);

        assert_eq!(normalized, None);
    }

    #[test]
    fn normalize_fast_model_should_preserve_when_allowed() {
        let normalized = normalize_fast_model(Some("gpt-4o-mini".to_string()), false);

        assert_eq!(normalized.as_deref(), Some("gpt-4o-mini"));
    }

    #[test]
    fn truncate_provider_text_should_preserve_utf8_boundary_and_ellipsis() {
        assert_eq!(truncate_provider_text("hello world", 8), "hello...");
        assert_eq!(truncate_provider_text("こんにちは世界", 5), "こん...");
        assert_eq!(truncate_provider_text("hello", 5), "hello");
    }
}
