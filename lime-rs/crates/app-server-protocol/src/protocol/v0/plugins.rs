use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginLocalPackageInspectParams {
    pub app_dir: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginLocalPackageInspectResponse {
    pub source_kind: String,
    pub source_uri: String,
    pub app_dir: String,
    pub manifest_source: String,
    pub plugin_manifest: serde_json::Value,
    pub manifest: serde_json::Value,
    pub manifest_hash: String,
    pub package_hash: String,
    pub inspected_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginLocalPackageExportParams {
    pub app_dir: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginLocalPackageExportResponse {
    pub source_kind: String,
    pub source_uri: String,
    pub app_dir: String,
    pub manifest_source: String,
    pub plugin_manifest: serde_json::Value,
    pub manifest: serde_json::Value,
    pub manifest_hash: String,
    pub package_hash: String,
    pub size_bytes: u64,
    pub file_count: usize,
    pub content_type: String,
    pub package_base64: String,
    pub exported_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginFetchCloudPackageParams {
    pub descriptor: PluginCloudReleaseDescriptor,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginCloudReleaseDescriptor {
    pub source_uri: String,
    pub app_id: String,
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant_enablement_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
    pub package_url: String,
    pub package_hash: String,
    pub manifest_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature_ref: Option<String>,
    pub loaded_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginPackageCacheEntry {
    pub app_id: String,
    pub identity: PluginPackageIdentity,
    pub manifest_snapshot: serde_json::Value,
    pub package_hash: String,
    pub manifest_hash: String,
    pub cache_path: String,
    pub cached_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginPackageIdentity {
    pub source_kind: String,
    pub source_uri: String,
    pub app_id: String,
    pub app_version: String,
    pub package_hash: String,
    pub manifest_hash: String,
    pub loaded_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub release_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tenant_enablement_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature_ref: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstalledSaveParams {
    pub state: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstalledDisabledSetParams {
    pub app_id: String,
    pub disabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstalledListResponse {
    #[serde(default)]
    pub states: Vec<serde_json::Value>,
    #[serde(default)]
    pub issues: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginUninstallRehearsalParams {
    pub app_id: String,
    pub mode: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginUninstallRehearsalResponse {
    pub app_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_hash: Option<String>,
    pub mode: String,
    pub generated_at: String,
    pub deleted_target_count: usize,
    pub retained_target_count: usize,
    #[serde(default)]
    pub targets: Vec<PluginUninstallRehearsalTarget>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginUninstallRehearsalTarget {
    pub kind: String,
    pub value: String,
    pub safe_to_delete: bool,
    pub action: String,
    pub reason: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginUninstallParams {
    pub app_id: String,
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmation_phrase: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginUninstallResponse {
    pub status: String,
    pub rehearsal: PluginUninstallRehearsalResponse,
    pub list: PluginInstalledListResponse,
    pub removed_target_count: usize,
    pub missing_target_count: usize,
    #[serde(default)]
    pub blocker_codes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delete_evidence: Option<PluginDeleteDataExecutionEvidence>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginHostLifecycleListResponse {
    #[serde(default)]
    pub snapshots: Vec<PluginHostLifecycleSnapshot>,
    #[serde(default)]
    pub issues: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginHostLifecycleSnapshot {
    pub app_id: String,
    pub display_name: String,
    #[serde(default)]
    pub profiles: Vec<String>,
    pub app_center_status: String,
    pub readiness_status: String,
    pub right_surface: PluginRightSurfaceContract,
    pub task_runtime: PluginTaskRuntimeContract,
    #[serde(default)]
    pub functions: Vec<PluginHostFunctionState>,
    #[serde(default)]
    pub blockers: Vec<String>,
    #[serde(default)]
    pub follow_ups: Vec<String>,
    pub publish_blocked: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub primary_issue_category: Option<String>,
    #[serde(default)]
    pub issue_categories: Vec<PluginReadinessIssueCategorySummary>,
    pub generated_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginReadinessIssueCategorySummary {
    pub category: String,
    pub count: usize,
    #[serde(default)]
    pub codes: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginHostFunctionState {
    pub key: String,
    pub status: String,
    pub current_owner: String,
    #[serde(default)]
    pub blockers: Vec<String>,
    #[serde(default)]
    pub follow_ups: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginRightSurfaceContract {
    pub dock: String,
    pub physical_dock_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_active_tab: Option<String>,
    #[serde(default)]
    pub supported_tabs: Vec<String>,
    pub article_workspace: PluginArticleWorkspaceContract,
    pub history_restore: PluginHistoryRestoreContract,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginArticleWorkspaceContract {
    pub enabled: bool,
    #[serde(default)]
    pub objects: Vec<PluginArticleWorkspaceObject>,
    #[serde(default)]
    pub panes: Vec<String>,
    #[serde(default)]
    pub renderer_kinds: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginArticleWorkspaceObject {
    pub kind: String,
    pub title: String,
    pub default_pane: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artifact_kind: Option<String>,
    pub primary: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginHistoryRestoreContract {
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_tab: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_pane: Option<String>,
    pub restore_selection: bool,
    pub restore_layout: bool,
    pub fallback: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginTaskRuntimeContract {
    pub enabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_root_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worker_entrypoint: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub contract_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sample_request_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub output_artifact_kind: Option<String>,
    #[serde(default)]
    pub task_kinds: Vec<String>,
    pub direct_provider_access: bool,
    pub direct_filesystem_access: bool,
    #[serde(default)]
    pub blockers: Vec<String>,
    #[serde(default)]
    pub follow_ups: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginDeleteDataExecutionEvidence {
    pub status: String,
    pub generated_at: String,
    pub data_root: String,
    #[serde(default)]
    pub removed_targets: Vec<PluginDeleteDataTargetEvidence>,
    #[serde(default)]
    pub missing_targets: Vec<PluginDeleteDataTargetEvidence>,
    #[serde(default)]
    pub retained_targets: Vec<PluginDeleteDataTargetEvidence>,
    #[serde(default)]
    pub blocked_targets: Vec<PluginDeleteDataTargetEvidence>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failed_target: Option<PluginDeleteDataTargetEvidence>,
    #[serde(default)]
    pub blocker_codes: Vec<String>,
    pub post_delete_residual_audit: PluginDeleteDataPostDeleteResidualAudit,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginDeleteDataTargetEvidence {
    pub kind: String,
    pub value: String,
    pub action: String,
    pub reason: String,
    pub status: String,
    #[serde(default)]
    pub blocker_codes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginDeleteDataPostDeleteResidualAudit {
    pub status: String,
    pub checked_at: String,
    pub checked_target_count: usize,
    pub remaining_target_count: usize,
    #[serde(default)]
    pub remaining_targets: Vec<PluginDeleteDataTargetEvidence>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failed_target: Option<PluginDeleteDataTargetEvidence>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginShellPrepareParams {
    pub descriptor: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginShellPackageMount {
    pub kind: String,
    pub path: String,
    pub read_only: bool,
    pub package_hash: String,
    pub manifest_hash: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginShellPrepareResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub install_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shell_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub descriptor_version: Option<u64>,
    pub dev_shell: bool,
    #[serde(default)]
    pub blocker_codes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_mount: Option<PluginShellPackageMount>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub window_title: Option<String>,
    pub prepared_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginUiRuntimeStartParams {
    pub app_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_key: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginUiRuntimeStatusParams {
    pub app_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginUiRuntimeStopParams {
    pub app_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PluginUiRuntimeStatusResponse {
    pub app_id: String,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub route: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_runtime: Option<PluginTaskRuntimeContract>,
}
