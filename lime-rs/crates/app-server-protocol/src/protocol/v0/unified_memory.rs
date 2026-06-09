use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum UnifiedMemoryType {
    Conversation,
    Project,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum UnifiedMemoryCategory {
    Identity,
    Context,
    Preference,
    Experience,
    Activity,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum UnifiedMemorySource {
    AutoExtracted,
    Manual,
    Imported,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryMetadata {
    pub confidence: f32,
    pub importance: u8,
    pub access_count: u32,
    #[serde(default)]
    pub last_accessed_at: Option<i64>,
    pub source: UnifiedMemorySource,
    #[serde(default)]
    pub embedding: Option<Vec<f32>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemory {
    pub id: String,
    pub session_id: String,
    pub memory_type: UnifiedMemoryType,
    pub category: UnifiedMemoryCategory,
    pub title: String,
    pub content: String,
    pub summary: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub metadata: UnifiedMemoryMetadata,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryListParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filters: Option<UnifiedMemoryListFilters>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryListFilters {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub memory_type: Option<UnifiedMemoryType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<UnifiedMemoryCategory>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sort_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub order: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub offset: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryListResponse {
    #[serde(default)]
    pub memories: Vec<UnifiedMemory>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryGetParams {
    pub id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryGetResponse {
    #[serde(default)]
    pub memory: Option<UnifiedMemory>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryCreateParams {
    pub request: UnifiedMemoryCreateRequest,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryCreateRequest {
    pub session_id: String,
    pub title: String,
    pub content: String,
    pub summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<UnifiedMemoryCategory>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub importance: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryUpdateParams {
    pub id: String,
    pub request: UnifiedMemoryUpdateRequest,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryUpdateRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub importance: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryWriteResponse {
    pub memory: UnifiedMemory,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryDeleteParams {
    pub id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryDeleteResponse {
    pub deleted: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemorySearchParams {
    pub query: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<UnifiedMemoryCategory>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryAnalyzeParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_timestamp: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to_timestamp: Option<i64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryAnalysisResponse {
    pub analyzed_sessions: u32,
    pub analyzed_messages: u32,
    pub generated_entries: u32,
    pub deduplicated_entries: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemorySemanticSearchParams {
    pub options: UnifiedMemorySemanticSearchOptions,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemorySemanticSearchOptions {
    pub query: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<UnifiedMemoryCategory>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_similarity: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryHybridSearchParams {
    pub options: UnifiedMemoryHybridSearchOptions,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryHybridSearchOptions {
    pub query: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<UnifiedMemoryCategory>,
    pub semantic_weight: f32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keyword_weight: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_similarity: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryStatsResponse {
    pub total_entries: u32,
    pub storage_used: u64,
    pub memory_count: u32,
    #[serde(default)]
    pub categories: Vec<UnifiedMemoryCategoryCount>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct UnifiedMemoryCategoryCount {
    pub category: UnifiedMemoryCategory,
    pub count: u32,
}
