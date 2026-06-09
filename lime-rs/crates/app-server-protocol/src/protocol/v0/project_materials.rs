use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMaterial {
    pub id: String,
    #[serde(alias = "project_id")]
    pub project_id: String,
    pub name: String,
    #[serde(rename = "type", alias = "material_type")]
    pub material_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "file_path")]
    pub file_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "file_size")]
    pub file_size: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "mime_type")]
    pub mime_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(alias = "created_at")]
    pub created_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMaterialFilter {
    #[serde(
        default,
        rename = "type",
        alias = "material_type",
        skip_serializing_if = "Option::is_none"
    )]
    pub material_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "search_query"
    )]
    pub search_query: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMaterialListParams {
    #[serde(alias = "project_id")]
    pub project_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter: Option<ProjectMaterialFilter>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMaterialLookupParams {
    pub id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMaterialUploadParams {
    #[serde(alias = "project_id")]
    pub project_id: String,
    pub name: String,
    #[serde(rename = "type", alias = "material_type")]
    pub material_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "file_path")]
    pub file_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMaterialImportFromUrlParams {
    #[serde(alias = "project_id")]
    pub project_id: String,
    pub name: String,
    #[serde(rename = "type", alias = "material_type")]
    pub material_type: String,
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMaterialUpdate {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMaterialUpdateParams {
    pub id: String,
    pub update: ProjectMaterialUpdate,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMaterialListResponse {
    #[serde(default)]
    pub materials: Vec<ProjectMaterial>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMaterialResponse {
    #[serde(default)]
    pub material: Option<ProjectMaterial>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMaterialCountResponse {
    pub count: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMaterialContentResponse {
    pub content: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMaterialDeleteResponse {}
