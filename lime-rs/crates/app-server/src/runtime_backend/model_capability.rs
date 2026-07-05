use app_server_protocol::CapabilitySnapshot;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[cfg(test)]
use serde_json::Map;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReasoningLevel {
    None,
    Minimal,
    Low,
    Medium,
    High,
    Max,
    #[serde(rename = "xhigh")]
    XHigh,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRef {
    pub provider_id: String,
    pub model_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapability {
    pub model: ModelRef,
    pub supports_tool_calling: bool,
    pub supports_tool_streaming: bool,
    pub supports_reasoning: bool,
    pub supports_reasoning_summary: bool,
    pub supported_reasoning_levels: Vec<ReasoningLevel>,
    pub plan_strategy: PlanStrategy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlanStrategy {
    UpdatePlan,
    ProposedPlan,
    Hybrid,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReasoningPolicy {
    pub supported: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_level: Option<ReasoningLevel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effective_level: Option<ReasoningLevel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downgrade_reason: Option<String>,
}

impl ModelRef {
    pub fn new(provider_id: impl Into<String>, model_id: impl Into<String>) -> Self {
        Self {
            provider_id: provider_id.into(),
            model_id: model_id.into(),
            variant: None,
        }
    }
}

pub fn reasoning_level_from_str(value: &str) -> Option<ReasoningLevel> {
    match value
        .trim()
        .to_lowercase()
        .replace('-', "_")
        .replace(' ', "_")
        .as_str()
    {
        "none" => Some(ReasoningLevel::None),
        "minimal" | "min" => Some(ReasoningLevel::Minimal),
        "low" => Some(ReasoningLevel::Low),
        "medium" => Some(ReasoningLevel::Medium),
        "high" => Some(ReasoningLevel::High),
        "max" => Some(ReasoningLevel::Max),
        "xhigh" | "x_high" => Some(ReasoningLevel::XHigh),
        _ => None,
    }
}

pub fn resolve_basic_model_capability(model: ModelRef) -> ModelCapability {
    let provider = normalized_identifier(&model.provider_id);
    let model_id = normalized_identifier(&model.model_id);
    let supports_reasoning = supports_reasoning_for_model(&provider, &model_id);
    let supported_reasoning_levels = if supports_reasoning {
        standard_reasoning_levels()
    } else {
        Vec::new()
    };
    ModelCapability {
        model,
        supports_tool_calling: true,
        supports_tool_streaming: true,
        supports_reasoning,
        supports_reasoning_summary: supports_reasoning,
        supported_reasoning_levels,
        plan_strategy: PlanStrategy::Hybrid,
    }
}

pub fn resolve_model_capability(
    model: ModelRef,
    capability_snapshot: Option<&CapabilitySnapshot>,
) -> ModelCapability {
    match capability_snapshot {
        Some(snapshot) => resolve_model_capability_from_snapshot(model, snapshot),
        None => resolve_basic_model_capability(model),
    }
}

pub fn resolve_model_capability_from_snapshot(
    model: ModelRef,
    snapshot: &CapabilitySnapshot,
) -> ModelCapability {
    let explicit_reasoning_support =
        reasoning_effort_supported(snapshot.capabilities.reasoning_effort.as_ref());
    let supports_reasoning = explicit_reasoning_support.unwrap_or_else(|| {
        snapshot.capabilities.reasoning
            || has_case_insensitive_value(&snapshot.runtime_features, "reasoning")
            || has_case_insensitive_value(&snapshot.task_families, "reasoning")
    });
    let supported_reasoning_levels = if supports_reasoning {
        reasoning_levels_from_snapshot(snapshot).unwrap_or_else(standard_reasoning_levels)
    } else {
        Vec::new()
    };
    let supports_tool_calling = snapshot.capabilities.tools
        || snapshot.capabilities.function_calling
        || has_case_insensitive_value(&snapshot.runtime_features, "tool_calling")
        || has_case_insensitive_value(&snapshot.runtime_features, "tools");
    let supports_tool_streaming = snapshot.capabilities.streaming
        || has_case_insensitive_value(&snapshot.runtime_features, "streaming");

    ModelCapability {
        model,
        supports_tool_calling,
        supports_tool_streaming,
        supports_reasoning,
        supports_reasoning_summary: supports_reasoning,
        supported_reasoning_levels,
        plan_strategy: PlanStrategy::Hybrid,
    }
}

pub fn resolve_reasoning_policy(
    capability: &ModelCapability,
    requested_level: Option<ReasoningLevel>,
) -> ReasoningPolicy {
    if !capability.supports_reasoning {
        return ReasoningPolicy {
            supported: false,
            requested_level,
            effective_level: None,
            downgrade_reason: requested_level.and_then(|level| {
                (level != ReasoningLevel::None)
                    .then(|| "selected model does not support reasoning".to_string())
            }),
        };
    }

    if requested_level == Some(ReasoningLevel::None) {
        return ReasoningPolicy {
            supported: true,
            requested_level,
            effective_level: Some(ReasoningLevel::None),
            downgrade_reason: None,
        };
    }

    let effective_level = requested_level
        .filter(|level| capability.supported_reasoning_levels.contains(level))
        .or_else(|| {
            (requested_level == Some(ReasoningLevel::Minimal))
                .then(|| {
                    capability
                        .supported_reasoning_levels
                        .iter()
                        .find(|level| **level == ReasoningLevel::Low)
                        .copied()
                })
                .flatten()
        })
        .or_else(|| {
            capability
                .supported_reasoning_levels
                .iter()
                .find(|level| **level == ReasoningLevel::Medium)
                .copied()
        })
        .or_else(|| capability.supported_reasoning_levels.first().copied());
    let downgrade_reason = match (requested_level, effective_level) {
        (Some(requested), Some(effective)) if requested != effective => {
            Some("requested reasoning level is not supported by selected model".to_string())
        }
        _ => None,
    };

    ReasoningPolicy {
        supported: true,
        requested_level,
        effective_level,
        downgrade_reason,
    }
}

pub fn model_effective_payload(capability: &ModelCapability, policy: &ReasoningPolicy) -> Value {
    json!({
        "model": capability.model,
        "modelRef": capability.model,
        "capability": capability,
        "reasoning": policy,
        "toolCalling": {
            "supported": capability.supports_tool_calling,
            "streaming": capability.supports_tool_streaming,
        },
    })
}

fn standard_reasoning_levels() -> Vec<ReasoningLevel> {
    vec![
        ReasoningLevel::Low,
        ReasoningLevel::Medium,
        ReasoningLevel::High,
        ReasoningLevel::Max,
        ReasoningLevel::XHigh,
    ]
}

fn normalized_identifier(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect()
}

fn contains_any(value: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| value.contains(needle))
}

fn has_case_insensitive_value(values: &[String], expected: &str) -> bool {
    values
        .iter()
        .any(|value| value.trim().eq_ignore_ascii_case(expected))
}

fn reasoning_effort_supported(value: Option<&Value>) -> Option<bool> {
    match value? {
        Value::Object(object) => object.get("supported").and_then(Value::as_bool),
        Value::Bool(value) => Some(*value),
        _ => None,
    }
}

fn reasoning_levels_from_snapshot(snapshot: &CapabilitySnapshot) -> Option<Vec<ReasoningLevel>> {
    let value = snapshot.capabilities.reasoning_effort.as_ref()?;
    let levels_value = match value {
        Value::Array(_) => Some(value),
        Value::Object(object) => object
            .get("levels")
            .or_else(|| object.get("supportedLevels"))
            .or_else(|| object.get("supported_levels")),
        _ => None,
    }?;
    let levels = levels_value
        .as_array()?
        .iter()
        .filter_map(|level| level.as_str().and_then(reasoning_level_from_str))
        .collect::<Vec<_>>();

    (!levels.is_empty()).then_some(levels)
}

fn has_token_prefix(value: &str, prefixes: &[&str]) -> bool {
    value
        .split('-')
        .any(|token| prefixes.iter().any(|prefix| token.starts_with(prefix)))
}

fn has_reasoning_hint(value: &str) -> bool {
    contains_any(value, &["codex", "reasoning", "thinking"])
}

fn supports_reasoning_for_model(provider: &str, model_id: &str) -> bool {
    if contains_any(provider, &["anthropic"]) {
        return has_reasoning_hint(model_id)
            || contains_any(
                model_id,
                &["claude-3-7", "claude-4", "sonnet-4", "opus-4", "haiku-4"],
            );
    }

    if contains_any(provider, &["gemini", "google", "vertex"]) {
        return has_reasoning_hint(model_id) || contains_any(model_id, &["gemini-2-5", "gemini-3"]);
    }

    if contains_any(provider, &["openai"]) {
        return has_reasoning_hint(model_id)
            || contains_any(model_id, &["gpt-5", "gpt-6"])
            || has_token_prefix(model_id, &["o1", "o3", "o4"]);
    }

    has_reasoning_hint(model_id)
}

#[cfg(test)]
fn provider_request_options_skeleton(policy: &ReasoningPolicy) -> Value {
    let mut options = Map::new();
    if let Some(level) = policy.effective_level {
        options.insert("reasoningLevel".to_string(), json!(level));
    }
    if let Some(reason) = policy.downgrade_reason.as_ref() {
        options.insert("downgradeReason".to_string(), json!(reason));
    }
    Value::Object(options)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_reasoning_model_does_not_forge_effective_level() {
        let capability = resolve_basic_model_capability(ModelRef::new("local", "plain-chat"));
        let policy = resolve_reasoning_policy(&capability, Some(ReasoningLevel::High));

        assert!(!policy.supported);
        assert_eq!(policy.effective_level, None);
        assert_eq!(
            policy.downgrade_reason.as_deref(),
            Some("selected model does not support reasoning")
        );
    }

    #[test]
    fn reasoning_model_keeps_supported_level() {
        let capability = resolve_basic_model_capability(ModelRef::new("openai", "gpt-codex"));
        let policy = resolve_reasoning_policy(&capability, Some(ReasoningLevel::High));

        assert!(policy.supported);
        assert_eq!(policy.effective_level, Some(ReasoningLevel::High));
        assert_eq!(policy.downgrade_reason, None);
    }

    #[test]
    fn multi_model_reasoning_fixtures_have_explicit_capabilities() {
        let cases = [
            ("Codex/OpenAI", "openai", "gpt-codex", ReasoningLevel::High),
            (
                "Anthropic",
                "anthropic",
                "claude-sonnet-4-5",
                ReasoningLevel::High,
            ),
            ("Gemini", "google", "gemini-2.5-pro", ReasoningLevel::Medium),
            (
                "OpenAI-compatible",
                "openai-compatible",
                "o3-mini",
                ReasoningLevel::High,
            ),
        ];

        for (label, provider, model_id, requested_level) in cases {
            let capability = resolve_basic_model_capability(ModelRef::new(provider, model_id));
            let policy = resolve_reasoning_policy(&capability, Some(requested_level));

            assert!(capability.supports_reasoning, "{label}");
            assert!(capability.supports_reasoning_summary, "{label}");
            assert!(policy.supported, "{label}");
            assert_eq!(policy.effective_level, Some(requested_level), "{label}");
            assert_eq!(capability.plan_strategy, PlanStrategy::Hybrid, "{label}");
        }
    }

    #[test]
    fn openai_compatible_plain_chat_does_not_infer_reasoning_from_provider_name() {
        let capability =
            resolve_basic_model_capability(ModelRef::new("openai-compatible", "gpt-4o-mini"));
        let policy = resolve_reasoning_policy(&capability, Some(ReasoningLevel::High));

        assert!(!capability.supports_reasoning);
        assert!(!policy.supported);
        assert_eq!(policy.effective_level, None);
        assert_eq!(
            policy.downgrade_reason.as_deref(),
            Some("selected model does not support reasoning")
        );
    }

    #[test]
    fn capability_snapshot_declares_reasoning_for_plain_custom_model() {
        let snapshot = CapabilitySnapshot {
            runtime_features: vec!["reasoning".to_string(), "streaming".to_string()],
            capabilities: app_server_protocol::ModelCapabilitiesInfo {
                tools: true,
                streaming: true,
                reasoning: true,
                reasoning_effort: Some(json!({
                    "supported": true,
                    "levels": ["low", "high"],
                })),
                ..Default::default()
            },
            ..Default::default()
        };
        let capability = resolve_model_capability(
            ModelRef::new("custom-provider", "plain-chat"),
            Some(&snapshot),
        );
        let policy = resolve_reasoning_policy(&capability, Some(ReasoningLevel::High));

        assert!(capability.supports_reasoning);
        assert_eq!(
            capability.supported_reasoning_levels,
            vec![ReasoningLevel::Low, ReasoningLevel::High]
        );
        assert!(policy.supported);
        assert_eq!(policy.effective_level, Some(ReasoningLevel::High));
    }

    #[test]
    fn capability_snapshot_can_disable_reasoning_for_reasoning_named_model() {
        let snapshot = CapabilitySnapshot {
            runtime_features: vec!["streaming".to_string()],
            capabilities: app_server_protocol::ModelCapabilitiesInfo {
                tools: true,
                streaming: true,
                reasoning: false,
                reasoning_effort: Some(json!({
                    "supported": false,
                    "levels": [],
                })),
                ..Default::default()
            },
            ..Default::default()
        };
        let capability =
            resolve_model_capability(ModelRef::new("openai", "gpt-codex"), Some(&snapshot));
        let policy = resolve_reasoning_policy(&capability, Some(ReasoningLevel::High));

        assert!(!capability.supports_reasoning);
        assert!(!policy.supported);
        assert_eq!(policy.effective_level, None);
    }

    #[test]
    fn requested_none_keeps_reasoning_disabled_for_reasoning_models() {
        let capability = resolve_basic_model_capability(ModelRef::new("openai", "gpt-codex"));
        let policy = resolve_reasoning_policy(&capability, Some(ReasoningLevel::None));

        assert!(policy.supported);
        assert_eq!(policy.effective_level, Some(ReasoningLevel::None));
        assert_eq!(policy.downgrade_reason, None);
    }

    #[test]
    fn default_reasoning_level_is_medium_when_not_requested() {
        let capability = resolve_basic_model_capability(ModelRef::new("google", "gemini-2.5-pro"));
        let policy = resolve_reasoning_policy(&capability, None);

        assert!(policy.supported);
        assert_eq!(policy.effective_level, Some(ReasoningLevel::Medium));
    }

    #[test]
    fn provider_options_keep_xhigh_name_stable() {
        let policy = ReasoningPolicy {
            supported: true,
            requested_level: Some(ReasoningLevel::XHigh),
            effective_level: Some(ReasoningLevel::XHigh),
            downgrade_reason: None,
        };

        assert_eq!(
            provider_request_options_skeleton(&policy)["reasoningLevel"],
            "xhigh"
        );
    }

    #[test]
    fn parses_reasoning_level_aliases() {
        assert_eq!(
            reasoning_level_from_str("x-high"),
            Some(ReasoningLevel::XHigh)
        );
        assert_eq!(
            reasoning_level_from_str("x high"),
            Some(ReasoningLevel::XHigh)
        );
        assert_eq!(
            reasoning_level_from_str("minimal"),
            Some(ReasoningLevel::Minimal)
        );
        assert_eq!(reasoning_level_from_str("MAX"), Some(ReasoningLevel::Max));
        assert_eq!(reasoning_level_from_str("unknown"), None);
    }
}
