use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use super::*;

pub const RUNTIME_RESUME_CONTRACT_SCHEMA_VERSION: &str = "lime-runtime-resume-contract/v0.1";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(untagged)]
pub enum AgentSessionCwdFilter {
    One(String),
    Many(Vec<String>),
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionListParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_archived: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_only: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<AgentSessionCwdFilter>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionOverview {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub business_object_ref_metadata: Option<serde_json::Value>,
    pub model: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution_strategy: Option<String>,
    pub messages_count: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionListResponse {
    #[serde(default)]
    pub sessions: Vec<AgentSessionOverview>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionUpdateParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_selector: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub execution_strategy: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recent_access_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recent_preferences: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recent_team_selection: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub article_workspace_selected_object_ref: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub article_workspace_edited_draft: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionUpdateResponse {
    pub session: AgentSessionOverview,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionArchiveManyParams {
    #[serde(default)]
    pub session_ids: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionArchiveManyResponse {
    #[serde(default)]
    pub sessions: Vec<AgentSessionOverview>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionDeleteParams {
    pub session_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionDeleteResponse {
    pub session_id: String,
    pub deleted: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ManagedObjectiveStatus {
    Active,
    Verifying,
    NeedsInput,
    Blocked,
    BudgetLimited,
    Paused,
    Completed,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ManagedObjective {
    pub objective_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    pub owner_kind: String,
    pub owner_id: String,
    pub objective_text: String,
    #[serde(default)]
    pub success_criteria: Vec<String>,
    pub status: ManagedObjectiveStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub budget_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub risk_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub continuation_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_audit_summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_evidence_pack_ref: Option<String>,
    #[serde(default)]
    pub last_artifact_refs: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blocker_reason: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveReadParams {
    pub session_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveReadResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub objective: Option<ManagedObjective>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveSetParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    pub objective_text: String,
    #[serde(default)]
    pub success_criteria: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub budget_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub risk_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub continuation_policy: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveSetResponse {
    pub objective: ManagedObjective,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveStatusUpdateParams {
    pub session_id: String,
    pub status: ManagedObjectiveStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blocker_reason: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveStatusUpdateResponse {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub objective: Option<ManagedObjective>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveClearParams {
    pub session_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveClearResponse {
    pub cleared: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveContinueParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveContinueResponse {
    pub submitted: bool,
    pub queued_turn_id: String,
    pub objective: ManagedObjective,
    pub turn: AgentTurn,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveAuditParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub owner_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionObjectiveAuditResponse {
    pub objective: ManagedObjective,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionCompactParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionCompactResponse {
    pub session: AgentSession,
    #[serde(default)]
    pub turns: Vec<AgentTurn>,
    pub compacted: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionThreadResumeParams {
    pub session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resume_contract: Option<RuntimeResumeContract>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeResumeContract {
    pub schema_version: String,
    pub runtime_id: String,
    pub session_id: String,
    pub turn_id: String,
    pub resume_mode: String,
    #[serde(default)]
    pub open_action_ids: Vec<String>,
    #[serde(default)]
    pub decisions: Vec<RuntimeResumeActionDecision>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeResumeActionDecision {
    pub action_id: String,
    pub decision: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionThreadResumeResponse {
    pub session: AgentSession,
    #[serde(default)]
    pub turns: Vec<AgentTurn>,
    pub resumed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionQueuedTurnRemoveParams {
    pub session_id: String,
    pub queued_turn_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionQueuedTurnRemoveResponse {
    pub session: AgentSession,
    #[serde(default)]
    pub turns: Vec<AgentTurn>,
    pub queued_turn_id: String,
    pub removed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionQueuedTurnPromoteParams {
    pub session_id: String,
    pub queued_turn_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionQueuedTurnPromoteResponse {
    pub session: AgentSession,
    #[serde(default)]
    pub turns: Vec<AgentTurn>,
    pub queued_turn_id: String,
    pub promoted: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointListParams {
    pub session_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointGetParams {
    pub session_id: String,
    pub checkpoint_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointDiffParams {
    pub session_id: String,
    pub checkpoint_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointRestoreParams {
    pub session_id: String,
    pub checkpoint_id: String,
    #[serde(default)]
    pub confirm_restore: bool,
    #[serde(default = "default_file_checkpoint_restore_backup")]
    pub create_backup: bool,
}

fn default_file_checkpoint_restore_backup() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointSummary {
    pub checkpoint_id: String,
    pub turn_id: String,
    pub path: String,
    pub source: String,
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version_no: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub version_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snapshot_path: Option<String>,
    pub validation_issue_count: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointThreadSummary {
    pub count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub latest_checkpoint: Option<AgentSessionFileCheckpointSummary>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointListResponse {
    pub session_id: String,
    pub thread_id: String,
    pub checkpoint_count: usize,
    #[serde(default)]
    pub checkpoints: Vec<AgentSessionFileCheckpointSummary>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointDetail {
    pub session_id: String,
    pub thread_id: String,
    pub checkpoint: AgentSessionFileCheckpointSummary,
    pub live_path: String,
    pub snapshot_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checkpoint_document: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub live_document: Option<serde_json::Value>,
    #[serde(default)]
    pub version_history: Vec<serde_json::Value>,
    #[serde(default)]
    pub validation_issues: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointDiffResponse {
    pub session_id: String,
    pub thread_id: String,
    pub checkpoint: AgentSessionFileCheckpointSummary,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_version_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub previous_version_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diff: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct AgentSessionFileCheckpointRestoreResponse {
    pub session_id: String,
    pub thread_id: String,
    pub checkpoint: AgentSessionFileCheckpointSummary,
    pub live_path: String,
    pub snapshot_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backup_path: Option<String>,
    pub restored_at: String,
}
