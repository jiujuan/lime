use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeListPacksParams {
    pub working_dir: String,
    #[serde(default)]
    pub include_archived: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeListPacksResponse {
    pub working_dir: String,
    pub root_path: String,
    #[serde(default)]
    pub packs: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeReadPackParams {
    pub working_dir: String,
    pub name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeReadPackResponse {
    pub pack: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeImportSourceParams {
    pub working_dir: String,
    pub pack_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pack_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_file_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_text: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeImportSourceResponse {
    pub pack: serde_json::Value,
    pub source: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCompilePackParams {
    pub working_dir: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub builder_runtime: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeCompilePackResponse {
    pub pack: serde_json::Value,
    pub selected_source_count: u32,
    pub compiled_view: serde_json::Value,
    pub run: serde_json::Value,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSetDefaultPackParams {
    pub working_dir: String,
    pub name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSetDefaultPackResponse {
    pub default_pack_name: String,
    pub default_marker_path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeUpdatePackStatusParams {
    pub working_dir: String,
    pub name: String,
    pub status: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeUpdatePackStatusResponse {
    pub pack: serde_json::Value,
    pub previous_status: String,
    pub cleared_default: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeResolveContextPackParams {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activation: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeResolveContextParams {
    pub working_dir: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub packs: Vec<KnowledgeResolveContextPackParams>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_chars: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub activation: Option<String>,
    #[serde(default)]
    pub write_run: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_reason: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeContextResolutionResponse {
    pub pack_name: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grounding: Option<String>,
    #[serde(default)]
    pub selected_views: Vec<serde_json::Value>,
    #[serde(default)]
    pub selected_files: Vec<String>,
    #[serde(default)]
    pub source_anchors: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<serde_json::Value>,
    #[serde(default)]
    pub missing: Vec<String>,
    pub token_estimate: u32,
    pub fenced_context: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_path: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeValidateContextRunParams {
    pub working_dir: String,
    pub name: String,
    pub run_path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeValidateContextRunResponse {
    pub valid: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default)]
    pub errors: Vec<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
}
