use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowReadParams {
    pub session_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowReadResponse {
    pub session_id: String,
    pub workflow: serde_json::Value,
    #[serde(default)]
    pub workflow_runs: Vec<serde_json::Value>,
    #[serde(default)]
    pub workflow_steps: Vec<serde_json::Value>,
}
