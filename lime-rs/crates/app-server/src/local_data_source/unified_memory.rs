use app_server_protocol::UnifiedMemory;
use app_server_protocol::UnifiedMemoryAnalysisResponse;
use app_server_protocol::UnifiedMemoryAnalyzeParams;
use app_server_protocol::UnifiedMemoryCategory;
use app_server_protocol::UnifiedMemoryCategoryCount;
use app_server_protocol::UnifiedMemoryCreateParams;
use app_server_protocol::UnifiedMemoryDeleteParams;
use app_server_protocol::UnifiedMemoryDeleteResponse;
use app_server_protocol::UnifiedMemoryGetParams;
use app_server_protocol::UnifiedMemoryGetResponse;
use app_server_protocol::UnifiedMemoryHybridSearchParams;
use app_server_protocol::UnifiedMemoryListFilters;
use app_server_protocol::UnifiedMemoryListParams;
use app_server_protocol::UnifiedMemoryListResponse;
use app_server_protocol::UnifiedMemoryMetadata;
use app_server_protocol::UnifiedMemorySearchParams;
use app_server_protocol::UnifiedMemorySemanticSearchParams;
use app_server_protocol::UnifiedMemorySource;
use app_server_protocol::UnifiedMemoryStatsResponse;
use app_server_protocol::UnifiedMemoryType;
use app_server_protocol::UnifiedMemoryUpdateParams;
use app_server_protocol::UnifiedMemoryWriteResponse;
use chrono::Utc;
use lime_core::database;
use lime_core::database::DbConnection;
use rusqlite::params;
use rusqlite::params_from_iter;
use rusqlite::types::Value;
use rusqlite::Connection;
use rusqlite::Row;
use uuid::Uuid;

const DEFAULT_LIST_LIMIT: usize = 120;
const MAX_LIST_LIMIT: usize = 1_000;
const UNIFIED_MEMORY_SCHEMA: &str =
    include_str!("../../../memory/src/migrations/v1_unified_memory.sql");

pub(crate) fn ensure_unified_memory_schema(db: &DbConnection) -> Result<(), String> {
    let conn = database::lock_db(db)?;
    conn.execute_batch(UNIFIED_MEMORY_SCHEMA)
        .map_err(|error| format!("初始化统一记忆表失败: {error}"))
}

pub(crate) fn list_unified_memories(
    db: &DbConnection,
    params: UnifiedMemoryListParams,
) -> Result<UnifiedMemoryListResponse, String> {
    let filters = params.filters.unwrap_or_default();
    let conn = database::lock_db(db)?;
    let memories = query_unified_memories(&conn, filters)?;
    Ok(UnifiedMemoryListResponse { memories })
}

pub(crate) fn get_unified_memory(
    db: &DbConnection,
    params: UnifiedMemoryGetParams,
) -> Result<UnifiedMemoryGetResponse, String> {
    let id = params.id.trim();
    if id.is_empty() {
        return Err("unifiedMemory/get requires id".to_string());
    }

    let conn = database::lock_db(db)?;
    let memory = get_memory_by_id(&conn, id)?;
    if memory.is_some() {
        let now = Utc::now().timestamp_millis();
        conn.execute(
            "UPDATE unified_memory
             SET access_count = access_count + 1,
                 last_accessed_at = ?1
             WHERE id = ?2",
            params![now, id],
        )
        .map_err(|error| format!("更新统一记忆访问统计失败: {error}"))?;
    }
    Ok(UnifiedMemoryGetResponse { memory })
}

pub(crate) fn create_unified_memory(
    db: &DbConnection,
    params: UnifiedMemoryCreateParams,
) -> Result<UnifiedMemoryWriteResponse, String> {
    let request = params.request;
    let title = required_trimmed("title", &request.title)?;
    let content = required_trimmed("content", &request.content)?;
    let summary = trimmed_or_fallback(&request.summary, &content, 120);
    let now = Utc::now().timestamp_millis();
    let memory = UnifiedMemory {
        id: Uuid::new_v4().to_string(),
        session_id: required_trimmed("session_id", &request.session_id)?,
        memory_type: UnifiedMemoryType::Conversation,
        category: request
            .category
            .unwrap_or_else(|| infer_category_from_text(&title, &summary, &content)),
        title,
        content,
        summary,
        tags: normalize_tags(request.tags.unwrap_or_default()),
        metadata: UnifiedMemoryMetadata {
            confidence: request.confidence.unwrap_or(0.7).clamp(0.0, 1.0),
            importance: request.importance.unwrap_or(5).clamp(0, 10),
            access_count: 0,
            last_accessed_at: None,
            source: UnifiedMemorySource::Manual,
            embedding: None,
        },
        created_at: now,
        updated_at: now,
        archived: false,
    };

    let conn = database::lock_db(db)?;
    insert_unified_memory(&conn, &memory)?;
    Ok(UnifiedMemoryWriteResponse { memory })
}

pub(crate) fn update_unified_memory(
    db: &DbConnection,
    params: UnifiedMemoryUpdateParams,
) -> Result<UnifiedMemoryWriteResponse, String> {
    let id = params.id.trim();
    if id.is_empty() {
        return Err("unifiedMemory/update requires id".to_string());
    }

    let conn = database::lock_db(db)?;
    let Some(existing) = get_memory_by_id(&conn, id)? else {
        return Err("统一记忆不存在".to_string());
    };
    let request = params.request;
    let content = request
        .content
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or(existing.content);
    let title = request
        .title
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or(existing.title);
    let summary = request
        .summary
        .map(|value| trimmed_or_fallback(&value, &content, 120))
        .unwrap_or(existing.summary);
    let memory = UnifiedMemory {
        id: existing.id,
        session_id: existing.session_id,
        memory_type: existing.memory_type,
        category: existing.category,
        title,
        content,
        summary,
        tags: request.tags.map(normalize_tags).unwrap_or(existing.tags),
        metadata: UnifiedMemoryMetadata {
            confidence: request
                .confidence
                .unwrap_or(existing.metadata.confidence)
                .clamp(0.0, 1.0),
            importance: request
                .importance
                .unwrap_or(existing.metadata.importance)
                .clamp(0, 10),
            access_count: existing.metadata.access_count,
            last_accessed_at: existing.metadata.last_accessed_at,
            source: existing.metadata.source,
            embedding: existing.metadata.embedding,
        },
        created_at: existing.created_at,
        updated_at: Utc::now().timestamp_millis(),
        archived: existing.archived,
    };

    update_unified_memory_row(&conn, &memory)?;
    Ok(UnifiedMemoryWriteResponse { memory })
}

pub(crate) fn delete_unified_memory(
    db: &DbConnection,
    params: UnifiedMemoryDeleteParams,
) -> Result<UnifiedMemoryDeleteResponse, String> {
    let id = params.id.trim();
    if id.is_empty() {
        return Err("unifiedMemory/delete requires id".to_string());
    }

    let conn = database::lock_db(db)?;
    let rows = conn
        .execute("DELETE FROM unified_memory WHERE id = ?1", params![id])
        .map_err(|error| format!("删除统一记忆失败: {error}"))?;
    Ok(UnifiedMemoryDeleteResponse { deleted: rows > 0 })
}

pub(crate) fn search_unified_memories(
    db: &DbConnection,
    params: UnifiedMemorySearchParams,
) -> Result<UnifiedMemoryListResponse, String> {
    let query = params.query.trim();
    if query.is_empty() {
        return Ok(UnifiedMemoryListResponse {
            memories: Vec::new(),
        });
    }

    let conn = database::lock_db(db)?;
    let mut values = vec![
        Value::from(format!("%{}%", escape_like(query))),
        Value::from(format!("%{}%", escape_like(query))),
        Value::from(format!("%{}%", escape_like(query))),
    ];
    let mut sql = String::from(
        "SELECT id, session_id, memory_type, category, title, content, summary, tags,
                confidence, importance, access_count, last_accessed_at, source,
                created_at, updated_at, archived, embedding
         FROM unified_memory
         WHERE archived = 0
           AND (title LIKE ?1 ESCAPE '\\' OR summary LIKE ?2 ESCAPE '\\' OR content LIKE ?3 ESCAPE '\\')",
    );
    if let Some(category) = params.category {
        sql.push_str(" AND category = ?");
        values.push(Value::from(category_to_db_value(&category)?));
    }
    sql.push_str(" ORDER BY updated_at DESC LIMIT ?");
    values.push(Value::from(
        params
            .limit
            .unwrap_or(DEFAULT_LIST_LIMIT)
            .clamp(1, MAX_LIST_LIMIT) as i64,
    ));

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|error| format!("构建统一记忆搜索失败: {error}"))?;
    let memories = stmt
        .query_map(params_from_iter(values), parse_memory_row)
        .map_err(|error| format!("查询统一记忆失败: {error}"))?
        .collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|error| format!("解析统一记忆搜索结果失败: {error}"))?;
    Ok(UnifiedMemoryListResponse { memories })
}

pub(crate) fn read_unified_memory_stats(
    db: &DbConnection,
) -> Result<UnifiedMemoryStatsResponse, String> {
    let conn = database::lock_db(db)?;
    let (total_entries, memory_count, storage_used): (i64, i64, i64) = conn
        .query_row(
            "SELECT COUNT(*),
                    COUNT(DISTINCT session_id),
                    COALESCE(SUM(length(title) + length(content) + length(summary) + length(tags)), 0)
             FROM unified_memory
             WHERE archived = 0",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|error| format!("统计统一记忆失败: {error}"))?;

    let mut categories = ordered_categories()
        .into_iter()
        .map(|category| UnifiedMemoryCategoryCount { category, count: 0 })
        .collect::<Vec<_>>();
    let mut stmt = conn
        .prepare(
            "SELECT category, COUNT(*) FROM unified_memory WHERE archived = 0 GROUP BY category",
        )
        .map_err(|error| format!("构建统一记忆分类统计失败: {error}"))?;
    let rows = stmt
        .query_map([], |row| {
            let category: String = row.get(0)?;
            let count: i64 = row.get(1)?;
            Ok((category, count))
        })
        .map_err(|error| format!("查询统一记忆分类统计失败: {error}"))?;
    for row in rows.flatten() {
        if let Some(category) = parse_category(&row.0) {
            if let Some(entry) = categories
                .iter_mut()
                .find(|entry| entry.category == category)
            {
                entry.count = row.1.max(0) as u32;
            }
        }
    }

    Ok(UnifiedMemoryStatsResponse {
        total_entries: total_entries.max(0) as u32,
        storage_used: storage_used.max(0) as u64,
        memory_count: memory_count.max(0) as u32,
        categories,
    })
}

pub(crate) fn analyze_unified_memories(
    params: UnifiedMemoryAnalyzeParams,
) -> Result<UnifiedMemoryAnalysisResponse, String> {
    if let (Some(start), Some(end)) = (params.from_timestamp, params.to_timestamp) {
        if start > end {
            return Err("开始时间不能晚于结束时间".to_string());
        }
    }
    Err(
        "unifiedMemory/analyze requires RuntimeCore memory extraction current implementation"
            .to_string(),
    )
}

pub(crate) fn semantic_search_unified_memories(
    params: UnifiedMemorySemanticSearchParams,
) -> Result<UnifiedMemoryListResponse, String> {
    if params.options.query.trim().is_empty() {
        return Ok(UnifiedMemoryListResponse {
            memories: Vec::new(),
        });
    }
    Err("unifiedMemory/semanticSearch requires current embedding provider integration".to_string())
}

pub(crate) fn hybrid_search_unified_memories(
    params: UnifiedMemoryHybridSearchParams,
) -> Result<UnifiedMemoryListResponse, String> {
    if params.options.query.trim().is_empty() {
        return Ok(UnifiedMemoryListResponse {
            memories: Vec::new(),
        });
    }
    Err("unifiedMemory/hybridSearch requires current embedding provider integration".to_string())
}

fn query_unified_memories(
    conn: &Connection,
    filters: UnifiedMemoryListFilters,
) -> Result<Vec<UnifiedMemory>, String> {
    let mut where_parts = vec!["archived = ?".to_string()];
    let mut values = vec![Value::from(if filters.archived.unwrap_or(false) {
        1
    } else {
        0
    })];

    if let Some(session_id) = filters
        .session_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        where_parts.push("session_id = ?".to_string());
        values.push(Value::from(session_id));
    }
    if let Some(memory_type) = filters.memory_type {
        where_parts.push("memory_type = ?".to_string());
        values.push(Value::from(memory_type_to_db_value(&memory_type)?));
    }
    if let Some(category) = filters.category {
        where_parts.push("category = ?".to_string());
        values.push(Value::from(category_to_db_value(&category)?));
    }

    let sort_by = normalize_sort_by(filters.sort_by.as_deref());
    let order = normalize_sort_order(filters.order.as_deref());
    let limit = filters
        .limit
        .unwrap_or(DEFAULT_LIST_LIMIT)
        .clamp(1, MAX_LIST_LIMIT) as i64;
    let offset = filters.offset.unwrap_or(0) as i64;
    let sql = format!(
        "SELECT id, session_id, memory_type, category, title, content, summary, tags,
                confidence, importance, access_count, last_accessed_at, source,
                created_at, updated_at, archived, embedding
         FROM unified_memory
         WHERE {}
         ORDER BY {sort_by} {order}
         LIMIT ? OFFSET ?",
        where_parts.join(" AND "),
    );
    values.push(Value::from(limit));
    values.push(Value::from(offset));

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|error| format!("构建统一记忆查询失败: {error}"))?;
    let memories = stmt
        .query_map(params_from_iter(values), parse_memory_row)
        .map_err(|error| format!("查询统一记忆失败: {error}"))?
        .collect::<Result<Vec<_>, rusqlite::Error>>()
        .map_err(|error| format!("解析统一记忆失败: {error}"))?;
    Ok(memories)
}

fn get_memory_by_id(conn: &Connection, id: &str) -> Result<Option<UnifiedMemory>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, memory_type, category, title, content, summary, tags,
                    confidence, importance, access_count, last_accessed_at, source,
                    created_at, updated_at, archived, embedding
             FROM unified_memory
             WHERE id = ?1",
        )
        .map_err(|error| format!("构建统一记忆详情查询失败: {error}"))?;
    let mut rows = stmt
        .query_map(params![id], parse_memory_row)
        .map_err(|error| format!("查询统一记忆详情失败: {error}"))?;
    match rows.next() {
        Some(row) => row
            .map(Some)
            .map_err(|error| format!("解析统一记忆详情失败: {error}")),
        None => Ok(None),
    }
}

fn insert_unified_memory(conn: &Connection, memory: &UnifiedMemory) -> Result<(), String> {
    let tags_json = serde_json::to_string(&memory.tags)
        .map_err(|error| format!("序列化 tags 失败: {error}"))?;
    let embedding_blob = embedding_to_blob(memory.metadata.embedding.as_ref());
    conn.execute(
        "INSERT INTO unified_memory (
            id, session_id, memory_type, category, title, content, summary, tags,
            confidence, importance, access_count, last_accessed_at, source, embedding,
            created_at, updated_at, archived
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)",
        params![
            &memory.id,
            &memory.session_id,
            memory_type_to_db_value(&memory.memory_type)?,
            category_to_db_value(&memory.category)?,
            &memory.title,
            &memory.content,
            &memory.summary,
            &tags_json,
            memory.metadata.confidence,
            memory.metadata.importance as i64,
            memory.metadata.access_count as i64,
            memory.metadata.last_accessed_at,
            source_to_db_value(&memory.metadata.source)?,
            embedding_blob,
            memory.created_at,
            memory.updated_at,
            if memory.archived { 1 } else { 0 },
        ],
    )
    .map_err(|error| format!("写入统一记忆失败: {error}"))?;
    Ok(())
}

fn update_unified_memory_row(conn: &Connection, memory: &UnifiedMemory) -> Result<(), String> {
    let tags_json = serde_json::to_string(&memory.tags)
        .map_err(|error| format!("序列化 tags 失败: {error}"))?;
    let embedding_blob = embedding_to_blob(memory.metadata.embedding.as_ref());
    conn.execute(
        "UPDATE unified_memory
         SET title = ?1,
             content = ?2,
             summary = ?3,
             tags = ?4,
             confidence = ?5,
             importance = ?6,
             embedding = ?7,
             updated_at = ?8
         WHERE id = ?9",
        params![
            &memory.title,
            &memory.content,
            &memory.summary,
            &tags_json,
            memory.metadata.confidence,
            memory.metadata.importance as i64,
            embedding_blob,
            memory.updated_at,
            &memory.id,
        ],
    )
    .map_err(|error| format!("更新统一记忆失败: {error}"))?;
    Ok(())
}

fn parse_memory_row(row: &Row<'_>) -> rusqlite::Result<UnifiedMemory> {
    let tags_json: String = row.get(7)?;
    let tags = serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default();
    let embedding_blob: Option<Vec<u8>> = row.get(16)?;
    let memory_type_raw: String = row.get(2)?;
    let category_raw: String = row.get(3)?;
    let source_raw: String = row.get(12)?;
    Ok(UnifiedMemory {
        id: row.get(0)?,
        session_id: row.get(1)?,
        memory_type: parse_memory_type_lossy(&memory_type_raw),
        category: parse_category_lossy(&category_raw),
        title: row.get(4)?,
        content: row.get(5)?,
        summary: row.get(6)?,
        tags,
        metadata: UnifiedMemoryMetadata {
            confidence: row.get::<_, f32>(8)?,
            importance: row.get::<_, i64>(9)?.clamp(0, 10) as u8,
            access_count: row.get::<_, i64>(10)?.max(0) as u32,
            last_accessed_at: row.get(11)?,
            source: parse_source_lossy(&source_raw),
            embedding: embedding_blob
                .as_ref()
                .and_then(|blob| blob_to_embedding(blob)),
        },
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
        archived: row.get::<_, i64>(15)? != 0,
    })
}

fn required_trimmed(label: &str, value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} must not be empty"));
    }
    Ok(trimmed.to_string())
}

fn trimmed_or_fallback(value: &str, fallback: &str, max_chars: usize) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        truncate_text(fallback.trim(), max_chars)
    } else {
        truncate_text(trimmed, max_chars)
    }
}

fn truncate_text(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect::<String>()
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut result = Vec::new();
    for tag in tags {
        let normalized = tag.trim();
        if normalized.is_empty() || result.iter().any(|existing| existing == normalized) {
            continue;
        }
        result.push(normalized.to_string());
    }
    result
}

fn normalize_sort_by(value: Option<&str>) -> &'static str {
    match value.unwrap_or("updated_at") {
        "created_at" => "created_at",
        "title" => "title",
        "importance" => "importance",
        "access_count" => "access_count",
        _ => "updated_at",
    }
}

fn normalize_sort_order(value: Option<&str>) -> &'static str {
    match value.unwrap_or("desc").to_ascii_lowercase().as_str() {
        "asc" => "ASC",
        _ => "DESC",
    }
}

fn infer_category_from_text(title: &str, summary: &str, content: &str) -> UnifiedMemoryCategory {
    let text = format!("{title}\n{summary}\n{content}").to_ascii_lowercase();
    if text_contains_any(&text, &["身份", "是谁", "identity", "profile"]) {
        UnifiedMemoryCategory::Identity
    } else if text_contains_any(&text, &["偏好", "喜欢", "习惯", "preference"]) {
        UnifiedMemoryCategory::Preference
    } else if text_contains_any(&text, &["计划", "任务", "活动", "todo", "activity"]) {
        UnifiedMemoryCategory::Activity
    } else if text_contains_any(&text, &["经验", "复盘", "教训", "experience"]) {
        UnifiedMemoryCategory::Experience
    } else {
        UnifiedMemoryCategory::Context
    }
}

fn text_contains_any(text: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| text.contains(needle))
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn ordered_categories() -> Vec<UnifiedMemoryCategory> {
    vec![
        UnifiedMemoryCategory::Identity,
        UnifiedMemoryCategory::Context,
        UnifiedMemoryCategory::Preference,
        UnifiedMemoryCategory::Experience,
        UnifiedMemoryCategory::Activity,
    ]
}

fn parse_memory_type(value: &str) -> Option<UnifiedMemoryType> {
    match unquote_json_string(value).as_str() {
        "conversation" => Some(UnifiedMemoryType::Conversation),
        "project" => Some(UnifiedMemoryType::Project),
        _ => None,
    }
}

fn parse_memory_type_lossy(value: &str) -> UnifiedMemoryType {
    parse_memory_type(value).unwrap_or(UnifiedMemoryType::Conversation)
}

fn parse_category(value: &str) -> Option<UnifiedMemoryCategory> {
    match unquote_json_string(value).as_str() {
        "identity" => Some(UnifiedMemoryCategory::Identity),
        "context" => Some(UnifiedMemoryCategory::Context),
        "preference" => Some(UnifiedMemoryCategory::Preference),
        "experience" => Some(UnifiedMemoryCategory::Experience),
        "activity" => Some(UnifiedMemoryCategory::Activity),
        _ => None,
    }
}

fn parse_category_lossy(value: &str) -> UnifiedMemoryCategory {
    parse_category(value).unwrap_or(UnifiedMemoryCategory::Context)
}

fn parse_source(value: &str) -> Option<UnifiedMemorySource> {
    match unquote_json_string(value).as_str() {
        "auto_extracted" => Some(UnifiedMemorySource::AutoExtracted),
        "manual" => Some(UnifiedMemorySource::Manual),
        "imported" => Some(UnifiedMemorySource::Imported),
        _ => None,
    }
}

fn parse_source_lossy(value: &str) -> UnifiedMemorySource {
    parse_source(value).unwrap_or(UnifiedMemorySource::Manual)
}

fn unquote_json_string(value: &str) -> String {
    serde_json::from_str::<String>(value).unwrap_or_else(|_| value.to_string())
}

fn memory_type_to_db_value(value: &UnifiedMemoryType) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| format!("序列化 memory_type 失败: {error}"))
}

fn category_to_db_value(value: &UnifiedMemoryCategory) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| format!("序列化 category 失败: {error}"))
}

fn source_to_db_value(value: &UnifiedMemorySource) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| format!("序列化 source 失败: {error}"))
}

fn embedding_to_blob(embedding: Option<&Vec<f32>>) -> Option<Vec<u8>> {
    embedding.map(|values| {
        values
            .iter()
            .flat_map(|value| value.to_le_bytes())
            .collect()
    })
}

fn blob_to_embedding(blob: &[u8]) -> Option<Vec<f32>> {
    if blob.len() % 4 != 0 {
        return None;
    }
    let mut values = Vec::with_capacity(blob.len() / 4);
    for chunk in blob.chunks_exact(4) {
        values.push(f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
    }
    Some(values)
}
