use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeTaskProfile {
    pub kind: String,
    pub source: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub traits: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modality_contract_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub routing_slot: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_profile_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executor_adapter_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executor_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executor_binding_key: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub permission_profile_keys: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_lock_policy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_model_slot: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_skill_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry_source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeRoutingDecision {
    pub routing_mode: String,
    pub decision_source: String,
    pub decision_reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_model: Option<String>,
    #[serde(default)]
    pub candidate_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_cost_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capability_gap: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fallback_chain: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub settings_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub service_model_slot: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeLimitState {
    pub status: String,
    #[serde(default)]
    pub single_candidate_only: bool,
    #[serde(default)]
    pub provider_locked: bool,
    #[serde(default)]
    pub settings_locked: bool,
    #[serde(default)]
    pub oem_locked: bool,
    #[serde(default)]
    pub candidate_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capability_gap: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub notes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeCostState {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_cost_class: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_per_million: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_per_million: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_per_million: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_write_per_million: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_total_cost: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached_input_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SessionExecutionRuntimeLimitEvent {
    pub event_kind: String,
    pub message: String,
    #[serde(default)]
    pub retryable: bool,
}
