use std::collections::HashSet;

use crate::ModelProviderProtocol;
use serde::Serialize;

pub const SAFETY_BUFFERING_ENABLED_HEADER: &str = "x-codex-safety-buffering-enabled";
pub const SAFETY_BUFFERING_FASTER_MODEL_HEADER: &str = "x-codex-safety-buffering-faster-model";
pub const SAFETY_BUFFERING_RESPONSE_EVENT_FIELD: &str = "safety_buffering";
pub const SAFETY_BUFFERING_RUNTIME_EVENT_KIND: &str = "provider_safety_buffering";

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

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderSafetyBufferingRetryModelSource {
    PayloadRetryModel,
    ExplicitNull,
    LegacyHeader,
    Missing,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProviderSafetyBufferingRetryModel {
    pub retry_model: Option<String>,
    pub fallback_header_model: Option<String>,
    pub source: ProviderSafetyBufferingRetryModelSource,
}

impl ProviderSafetyBufferingRetryModelSource {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::PayloadRetryModel => "payload_retry_model",
            Self::ExplicitNull => "explicit_null",
            Self::LegacyHeader => "legacy_header",
            Self::Missing => "missing",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProviderSafetyBufferingUpdate {
    pub use_cases: Vec<String>,
    pub reasons: Vec<String>,
    pub show_buffering_ui: bool,
    pub retry_model: ProviderSafetyBufferingRetryModel,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSafetyBufferingRuntimeEventPayload {
    pub kind: &'static str,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub use_cases: Vec<String>,
    pub reasons: Vec<String>,
    pub show_buffering_ui: bool,
    pub retry_model: Option<String>,
    pub fallback_header_model: Option<String>,
    pub source: ProviderSafetyBufferingRetryModelSource,
}

impl ProviderSafetyBufferingRuntimeEventPayload {
    pub fn to_json_value(&self) -> serde_json::Value {
        serde_json::to_value(self).expect("provider safety buffering runtime payload serializes")
    }
}

impl ProviderSafetyBufferingUpdate {
    pub fn runtime_event_payload(
        &self,
        provider: Option<&str>,
        model: Option<&str>,
    ) -> ProviderSafetyBufferingRuntimeEventPayload {
        ProviderSafetyBufferingRuntimeEventPayload {
            kind: SAFETY_BUFFERING_RUNTIME_EVENT_KIND,
            provider: provider.map(ToOwned::to_owned),
            model: model.map(ToOwned::to_owned),
            use_cases: self.use_cases.clone(),
            reasons: self.reasons.clone(),
            show_buffering_ui: self.show_buffering_ui,
            retry_model: self.retry_model.retry_model.clone(),
            fallback_header_model: self.retry_model.fallback_header_model.clone(),
            source: self.retry_model.source,
        }
    }

    pub fn to_runtime_event_payload(
        &self,
        provider: Option<&str>,
        model: Option<&str>,
    ) -> serde_json::Value {
        self.runtime_event_payload(provider, model).to_json_value()
    }
}

pub fn parse_safety_buffering_update<'a>(
    payload: Option<&serde_json::Value>,
    headers: impl IntoIterator<Item = (&'a str, &'a str)>,
) -> Option<ProviderSafetyBufferingUpdate> {
    let payload = payload?;
    if !payload.is_object() {
        return None;
    }
    let headers = headers.into_iter().collect::<Vec<_>>();
    Some(ProviderSafetyBufferingUpdate {
        use_cases: string_array_field(payload, "use_cases"),
        reasons: string_array_field(payload, "reasons"),
        show_buffering_ui: safety_buffering_enabled_header(headers.iter().copied()),
        retry_model: parse_safety_buffering_retry_model(Some(payload), headers.iter().copied()),
    })
}

pub fn parse_safety_buffering_response_event<'a>(
    response_event: &serde_json::Value,
    headers: impl IntoIterator<Item = (&'a str, &'a str)>,
) -> Option<ProviderSafetyBufferingUpdate> {
    parse_safety_buffering_update(
        response_event.get(SAFETY_BUFFERING_RESPONSE_EVENT_FIELD),
        headers,
    )
}

pub fn parse_safety_buffering_runtime_event_payload<'a>(
    response_event: &serde_json::Value,
    headers: impl IntoIterator<Item = (&'a str, &'a str)>,
    provider: Option<&str>,
    model: Option<&str>,
) -> Option<ProviderSafetyBufferingRuntimeEventPayload> {
    parse_safety_buffering_response_event(response_event, headers)
        .map(|update| update.runtime_event_payload(provider, model))
}

pub fn parse_safety_buffering_retry_model<'a>(
    payload: Option<&serde_json::Value>,
    headers: impl IntoIterator<Item = (&'a str, &'a str)>,
) -> ProviderSafetyBufferingRetryModel {
    if let Some(retry_model) = payload.and_then(|payload| payload.get("retry_model")) {
        let retry_model = retry_model
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned);
        let source = if retry_model.is_some() {
            ProviderSafetyBufferingRetryModelSource::PayloadRetryModel
        } else {
            ProviderSafetyBufferingRetryModelSource::ExplicitNull
        };
        return ProviderSafetyBufferingRetryModel {
            retry_model,
            fallback_header_model: None,
            source,
        };
    }

    let fallback_header_model = safety_buffering_legacy_faster_model_header(headers);
    let source = if fallback_header_model.is_some() {
        ProviderSafetyBufferingRetryModelSource::LegacyHeader
    } else {
        ProviderSafetyBufferingRetryModelSource::Missing
    };

    ProviderSafetyBufferingRetryModel {
        retry_model: fallback_header_model.clone(),
        fallback_header_model,
        source,
    }
}

pub fn safety_buffering_enabled_header<'a>(
    headers: impl IntoIterator<Item = (&'a str, &'a str)>,
) -> bool {
    headers.into_iter().any(|(name, value)| {
        name.eq_ignore_ascii_case(SAFETY_BUFFERING_ENABLED_HEADER)
            && value.trim().eq_ignore_ascii_case("true")
    })
}

pub fn safety_buffering_legacy_faster_model_header<'a>(
    headers: impl IntoIterator<Item = (&'a str, &'a str)>,
) -> Option<String> {
    headers.into_iter().find_map(|(name, value)| {
        if name.eq_ignore_ascii_case(SAFETY_BUFFERING_FASTER_MODEL_HEADER) {
            let value = value.trim();
            (!value.is_empty()).then(|| value.to_string())
        } else {
            None
        }
    })
}

fn string_array_field(payload: &serde_json::Value, field: &str) -> Vec<String> {
    payload
        .get(field)
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect()
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
mod tests;
