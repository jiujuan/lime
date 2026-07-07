use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SoulStylePackInstallStatus {
    Discovered,
    Downloading,
    Validating,
    Installing,
    Installed,
    Enabled,
    Disabled,
    Failed,
    Uninstalled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SoulStylePackMutableStatus {
    Enabled,
    Disabled,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SoulStylePackInstallParams {
    pub manifest_source: String,
    #[serde(default)]
    pub locale_sources: BTreeMap<String, String>,
    #[serde(default)]
    pub enable_after_install: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SoulStylePackListParams {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SoulStylePackListEntry {
    pub pack_id: String,
    pub source: String,
    pub status: SoulStylePackInstallStatus,
    #[serde(default)]
    pub profile_ids: Vec<String>,
    pub manifest_source: String,
    #[serde(default)]
    pub locale_sources: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub integrity_digest: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SoulStylePackListResponse {
    #[serde(default)]
    pub packs: Vec<SoulStylePackListEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SoulStylePackInstallResponse {
    pub pack_id: String,
    #[serde(default)]
    pub profile_ids: Vec<String>,
    pub status: SoulStylePackInstallStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SoulStylePackStatusSetParams {
    pub pack_id: String,
    pub status: SoulStylePackMutableStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SoulStylePackStatusSetResponse {
    pub pack_id: String,
    pub status: SoulStylePackInstallStatus,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SoulStylePackUninstallParams {
    pub pack_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SoulStylePackUninstallResponse {
    pub pack_id: String,
    pub status: SoulStylePackInstallStatus,
}
