use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GalleryMaterialMetadata {
    pub material_id: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "image_category"
    )]
    pub image_category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
    #[serde(default)]
    pub colors: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "icon_style")]
    pub icon_style: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "icon_category"
    )]
    pub icon_category: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "color_scheme_json"
    )]
    pub color_scheme_json: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mood: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "layout_category"
    )]
    pub layout_category: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "element_count"
    )]
    pub element_count: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "fabric_json"
    )]
    pub fabric_json: Option<String>,
    #[serde(alias = "created_at")]
    pub created_at: i64,
    #[serde(alias = "updated_at")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GalleryMaterial {
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<GalleryMaterialMetadata>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GalleryMaterialMetadataCreateParams {
    pub material_id: String,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "image_category"
    )]
    pub image_category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub colors: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none", alias = "icon_style")]
    pub icon_style: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "icon_category"
    )]
    pub icon_category: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "color_scheme_json"
    )]
    pub color_scheme_json: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mood: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "layout_category"
    )]
    pub layout_category: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "element_count"
    )]
    pub element_count: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        alias = "fabric_json"
    )]
    pub fabric_json: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GalleryMaterialLookupParams {
    pub material_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GalleryMaterialMetadataUpdateParams {
    pub material_id: String,
    pub metadata: GalleryMaterialMetadataCreateParams,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GalleryMaterialFilterParams {
    pub project_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mood: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GalleryMaterialResponse {
    #[serde(default)]
    pub material: Option<GalleryMaterial>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GalleryMaterialMetadataResponse {
    #[serde(default)]
    pub metadata: Option<GalleryMaterialMetadata>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GalleryMaterialListResponse {
    #[serde(default)]
    pub materials: Vec<GalleryMaterial>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GalleryMaterialDeleteResponse {}
