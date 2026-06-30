use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppLocalPackageInspectParams {
    pub app_dir: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppLocalPackageInspectResponse {
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
pub struct AgentAppFetchCloudPackageParams {
    pub descriptor: AgentAppCloudReleaseDescriptor,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppCloudReleaseDescriptor {
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
pub struct AgentAppPackageCacheEntry {
    pub app_id: String,
    pub identity: AgentAppPackageIdentity,
    pub manifest_snapshot: serde_json::Value,
    pub package_hash: String,
    pub manifest_hash: String,
    pub cache_path: String,
    pub cached_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppPackageIdentity {
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
pub struct AgentAppInstalledSaveParams {
    pub state: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppInstalledDisabledSetParams {
    pub app_id: String,
    pub disabled: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppInstalledListResponse {
    #[serde(default)]
    pub states: Vec<serde_json::Value>,
    #[serde(default)]
    pub issues: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallRehearsalParams {
    pub app_id: String,
    pub mode: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallRehearsalResponse {
    pub app_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package_hash: Option<String>,
    pub mode: String,
    pub generated_at: String,
    pub deleted_target_count: usize,
    pub retained_target_count: usize,
    #[serde(default)]
    pub targets: Vec<AgentAppUninstallRehearsalTarget>,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallRehearsalTarget {
    pub kind: String,
    pub value: String,
    pub safe_to_delete: bool,
    pub action: String,
    pub reason: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallParams {
    pub app_id: String,
    pub mode: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confirmation_phrase: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallResponse {
    pub status: String,
    pub rehearsal: AgentAppUninstallRehearsalResponse,
    pub list: AgentAppInstalledListResponse,
    pub removed_target_count: usize,
    pub missing_target_count: usize,
    #[serde(default)]
    pub blocker_codes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delete_evidence: Option<AgentAppDeleteDataExecutionEvidence>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppHostLifecycleListResponse {
    #[serde(default)]
    pub snapshots: Vec<AgentAppHostLifecycleSnapshot>,
    #[serde(default)]
    pub issues: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppHostLifecycleSnapshot {
    pub app_id: String,
    pub display_name: String,
    #[serde(default)]
    pub profiles: Vec<String>,
    pub app_center_status: String,
    pub readiness_status: String,
    pub right_surface: AgentAppRightSurfaceContract,
    pub task_runtime: AgentAppTaskRuntimeContract,
    #[serde(default)]
    pub functions: Vec<AgentAppHostFunctionState>,
    #[serde(default)]
    pub blockers: Vec<String>,
    #[serde(default)]
    pub follow_ups: Vec<String>,
    pub publish_blocked: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub primary_issue_category: Option<String>,
    #[serde(default)]
    pub issue_categories: Vec<AgentAppReadinessIssueCategorySummary>,
    pub generated_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppReadinessIssueCategorySummary {
    pub category: String,
    pub count: usize,
    #[serde(default)]
    pub codes: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppHostFunctionState {
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
pub struct AgentAppRightSurfaceContract {
    pub dock: String,
    pub physical_dock_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_active_tab: Option<String>,
    #[serde(default)]
    pub supported_tabs: Vec<String>,
    pub article_workspace: AgentAppArticleWorkspaceContract,
    pub history_restore: AgentAppHistoryRestoreContract,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppArticleWorkspaceContract {
    pub enabled: bool,
    #[serde(default)]
    pub objects: Vec<AgentAppArticleWorkspaceObject>,
    #[serde(default)]
    pub panes: Vec<String>,
    #[serde(default)]
    pub renderer_kinds: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppArticleWorkspaceObject {
    pub kind: String,
    pub title: String,
    pub default_pane: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub artifact_kind: Option<String>,
    pub primary: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppHistoryRestoreContract {
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
pub struct AgentAppTaskRuntimeContract {
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
pub struct AgentAppDeleteDataExecutionEvidence {
    pub status: String,
    pub generated_at: String,
    pub data_root: String,
    #[serde(default)]
    pub removed_targets: Vec<AgentAppDeleteDataTargetEvidence>,
    #[serde(default)]
    pub missing_targets: Vec<AgentAppDeleteDataTargetEvidence>,
    #[serde(default)]
    pub retained_targets: Vec<AgentAppDeleteDataTargetEvidence>,
    #[serde(default)]
    pub blocked_targets: Vec<AgentAppDeleteDataTargetEvidence>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failed_target: Option<AgentAppDeleteDataTargetEvidence>,
    #[serde(default)]
    pub blocker_codes: Vec<String>,
    pub post_delete_residual_audit: AgentAppDeleteDataPostDeleteResidualAudit,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppDeleteDataTargetEvidence {
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
pub struct AgentAppDeleteDataPostDeleteResidualAudit {
    pub status: String,
    pub checked_at: String,
    pub checked_target_count: usize,
    pub remaining_target_count: usize,
    #[serde(default)]
    pub remaining_targets: Vec<AgentAppDeleteDataTargetEvidence>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failed_target: Option<AgentAppDeleteDataTargetEvidence>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellPrepareParams {
    pub descriptor: serde_json::Value,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellPackageMount {
    pub kind: String,
    pub path: String,
    pub read_only: bool,
    pub package_hash: String,
    pub manifest_hash: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppShellPrepareResponse {
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
    pub package_mount: Option<AgentAppShellPackageMount>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub window_title: Option<String>,
    pub prepared_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUiRuntimeStartParams {
    pub app_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entry_key: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUiRuntimeStatusParams {
    pub app_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUiRuntimeStopParams {
    pub app_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUiRuntimeStatusResponse {
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
    pub task_runtime: Option<AgentAppTaskRuntimeContract>,
}
