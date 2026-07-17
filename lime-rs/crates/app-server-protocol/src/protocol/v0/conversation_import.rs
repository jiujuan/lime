use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{AgentAttachment, AgentSession};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConversationImportSourceClient {
    #[default]
    Codex,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConversationImportSourceStatus {
    Ready,
    Missing,
}

impl Default for ConversationImportSourceStatus {
    fn default() -> Self {
        Self::Missing
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConversationImportThreadStatus {
    #[default]
    NotImported,
    Importing,
    Imported,
    Conflict,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConversationImportJobStatus {
    #[default]
    Queued,
    Running,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ConversationImportJobPhase {
    #[default]
    Queued,
    ReadingSource,
    BuildingHistory,
    PersistingHistory,
    Finalizing,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportSourceScanParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_client: Option<ConversationImportSourceClient>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_root: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_archived: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cursor: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportThreadPreviewParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_client: Option<ConversationImportSourceClient>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_root: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportThreadCommitParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_client: Option<ConversationImportSourceClient>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_root: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    #[serde(default)]
    pub confirmed: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replace_existing: Option<bool>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportJobReadParams {
    pub job_id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportSourceSummary {
    pub source_client: ConversationImportSourceClient,
    pub status: ConversationImportSourceStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_root: Option<String>,
    pub readable: bool,
    #[serde(default)]
    pub thread_count: usize,
    #[serde(default)]
    pub source_home_exists: bool,
    #[serde(default)]
    pub state_db_readable: bool,
    #[serde(default)]
    pub rollout_file_count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub indexed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportedThreadSummary {
    pub source_client: ConversationImportSourceClient,
    pub source_thread_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_provider: Option<String>,
    #[serde(default)]
    pub archived: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub import_job_id: Option<String>,
    pub import_status: ConversationImportThreadStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportSourceScanResponse {
    pub source: ConversationImportSourceSummary,
    #[serde(default)]
    pub threads: Vec<ImportedThreadSummary>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportSourceProvenance {
    pub source_client: ConversationImportSourceClient,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_thread_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_event_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_event_seq: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_payload_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_channel: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportFidelitySummary {
    pub messages: usize,
    pub reasoning: usize,
    pub tools: usize,
    pub commands: usize,
    pub patches: usize,
    pub approvals: usize,
    pub mcp: usize,
    pub web_search: usize,
    pub attachments: usize,
    pub unsupported: usize,
    pub provenance_only: usize,
    pub budget_dropped: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportPreviewMessage {
    pub role: String,
    pub text: String,
    #[serde(default)]
    pub attachments: Vec<AgentAttachment>,
    #[serde(default)]
    pub truncated: bool,
    #[serde(default)]
    pub omitted_bytes: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<ConversationImportSourceProvenance>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportPreviewEvent {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provenance: Option<ConversationImportSourceProvenance>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportPreviewDryRun {
    pub will_create_session: bool,
    pub will_append_to_existing_session: bool,
    pub will_import_messages: usize,
    pub will_import_turns: usize,
    pub will_import_timeline_items: usize,
    pub will_import_attachments: usize,
    pub unsupported_items: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportPreviewSummary {
    pub line_count: usize,
    pub message_count: usize,
    pub rollout_event_items: usize,
    pub unsupported_count: usize,
    pub dry_run: ConversationImportPreviewDryRun,
    #[serde(default)]
    pub fidelity: ConversationImportFidelitySummary,
    pub truncated: bool,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportThreadPreviewResponse {
    pub source: ConversationImportSourceSummary,
    pub thread: ImportedThreadSummary,
    pub summary: ConversationImportPreviewSummary,
    #[serde(default)]
    pub messages: Vec<ConversationImportPreviewMessage>,
    #[serde(default)]
    pub events: Vec<ConversationImportPreviewEvent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportThreadCommitResponse {
    pub session: AgentSession,
    pub thread: ImportedThreadSummary,
    pub summary: ConversationImportPreviewSummary,
    pub imported_messages: usize,
    pub imported_turns: usize,
    pub can_continue: bool,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportJobProgress {
    pub phase: ConversationImportJobPhase,
    #[serde(default)]
    pub completed_items: usize,
    #[serde(default)]
    pub total_items: usize,
    #[serde(default)]
    pub completed_turns: usize,
    #[serde(default)]
    pub total_turns: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportJob {
    pub job_id: String,
    pub source_client: ConversationImportSourceClient,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_thread_id: Option<String>,
    pub status: ConversationImportJobStatus,
    pub progress: ConversationImportJobProgress,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<ConversationImportThreadCommitResponse>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportThreadCommitStartResponse {
    pub job: ConversationImportJob,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ConversationImportJobReadResponse {
    pub job: ConversationImportJob,
}
