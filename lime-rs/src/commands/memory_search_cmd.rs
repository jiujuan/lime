//! Memory embedding helpers for legacy runtime memory internals.

use crate::database::DbConnection;
use lime_core::config::{MemoryEmbeddingConfig, MemoryEmbeddingProvider};
use lime_memory::models::{
    MemoryCategory, MemoryMetadata, MemorySource, MemoryType, UnifiedMemory,
};
use lime_services::api_key_provider_service::ApiKeyProviderService;
use serde_json;

const BUILTIN_EMBEDDING_PROVIDER_ID: &str = "lime-hub";
const OPENAI_EMBEDDING_PROVIDER_ID: &str = "openai";
const DEFAULT_EMBEDDING_MODEL: &str = "text-embedding-3-small";

// ==================== Helper Functions ====================

/// Parse memory from database row
fn parse_memory_row(row: &rusqlite::Row) -> Result<UnifiedMemory, rusqlite::Error> {
    let id: String = row.get(0)?;
    let session_id: String = row.get(1)?;
    let memory_type_json: String = row.get(2)?;
    let category_json: String = row.get(3)?;
    let title: String = row.get(4)?;
    let content: String = row.get(5)?;
    let summary: String = row.get(6)?;
    let tags_json: String = row.get(7)?;
    let confidence: f32 = row.get(8)?;
    let importance: i64 = row.get(9)?;
    let access_count: i64 = row.get(10)?;
    let last_accessed_at: Option<i64> = row.get(11)?;
    let source_json: String = row.get(12)?;
    let created_at: i64 = row.get(13)?;
    let updated_at: i64 = row.get(14)?;
    let archived: i64 = row.get(15)?;

    // Parse JSON fields
    let memory_type: MemoryType = serde_json::from_str(&memory_type_json)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let category: MemoryCategory = serde_json::from_str(&category_json)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let tags: Vec<String> = serde_json::from_str(&tags_json)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let source: MemorySource = serde_json::from_str(&source_json)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    // Build metadata
    let metadata = MemoryMetadata {
        confidence,
        importance: importance as u8,
        access_count: access_count as u32,
        last_accessed_at,
        source,
        embedding: None,
    };

    Ok(UnifiedMemory {
        id,
        session_id,
        memory_type,
        category,
        title,
        content,
        summary,
        tags,
        metadata,
        created_at,
        updated_at,
        archived: archived != 0,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct EmbeddingProviderAttempt {
    provider_id: String,
    model: String,
}

fn normalize_embedding_model(model: &str) -> String {
    let trimmed = model.trim();
    if trimmed.is_empty() {
        DEFAULT_EMBEDDING_MODEL.to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
fn embedding_blob_matches_dimension(blob: Option<&[u8]>, dimension: usize) -> bool {
    let Some(blob) = blob else {
        return false;
    };

    blob.len() == dimension.saturating_mul(std::mem::size_of::<f32>())
}

fn resolve_embedding_provider_attempts(
    embedding: &MemoryEmbeddingConfig,
) -> Result<Vec<EmbeddingProviderAttempt>, String> {
    let model = normalize_embedding_model(&embedding.model);
    match embedding.provider {
        MemoryEmbeddingProvider::Disabled => {
            Err("Memory vector search is disabled. Use full-text search instead.".to_string())
        }
        MemoryEmbeddingProvider::Auto => Ok(vec![
            EmbeddingProviderAttempt {
                provider_id: BUILTIN_EMBEDDING_PROVIDER_ID.to_string(),
                model: model.clone(),
            },
            EmbeddingProviderAttempt {
                provider_id: OPENAI_EMBEDDING_PROVIDER_ID.to_string(),
                model,
            },
        ]),
        MemoryEmbeddingProvider::LocalOnnx => Err(
            "Local ONNX memory embedding uses the local runtime, not API Provider attempts."
                .to_string(),
        ),
        MemoryEmbeddingProvider::Builtin => Ok(vec![EmbeddingProviderAttempt {
            provider_id: embedding
                .provider_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or(BUILTIN_EMBEDDING_PROVIDER_ID)
                .to_string(),
            model,
        }]),
        MemoryEmbeddingProvider::OpenaiApi => Ok(vec![EmbeddingProviderAttempt {
            provider_id: OPENAI_EMBEDDING_PROVIDER_ID.to_string(),
            model,
        }]),
        MemoryEmbeddingProvider::Provider => {
            let Some(provider_id) = embedding
                .provider_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            else {
                return Err("Memory embedding provider_id is required.".to_string());
            };
            Ok(vec![EmbeddingProviderAttempt {
                provider_id: provider_id.to_string(),
                model,
            }])
        }
    }
}

pub(crate) async fn embed_text_with_config(
    db: &DbConnection,
    text: &str,
    embedding_config: &MemoryEmbeddingConfig,
) -> Result<Vec<f32>, String> {
    if embedding_config.provider == MemoryEmbeddingProvider::LocalOnnx {
        let model = lime_embedding::normalize_local_onnx_model_name(Some(&embedding_config.model))?;
        return lime_embedding::get_local_onnx_embedding(text, Some(model)).await;
    }

    let api_key_service = ApiKeyProviderService::new();
    let attempts = resolve_embedding_provider_attempts(embedding_config)?;
    api_key_service
        .initialize_system_providers(db)
        .map_err(|e| format!("Failed to initialize memory embedding providers: {e}"))?;
    let mut errors = Vec::new();

    for attempt in attempts {
        let credential =
            api_key_service.get_next_api_key_with_provider_info(db, &attempt.provider_id);
        let (api_key, provider) = match credential {
            Ok(Some(value)) => value,
            Ok(None) => {
                errors.push(format!("{}: no enabled credential", attempt.provider_id));
                continue;
            }
            Err(error) => {
                errors.push(format!("{}: {error}", attempt.provider_id));
                continue;
            }
        };

        let base_url = provider.api_host.trim();
        if base_url.is_empty() {
            errors.push(format!("{}: empty API host", attempt.provider_id));
            continue;
        }

        match lime_embedding::get_embedding_with_base_url(
            text,
            &api_key,
            Some(base_url),
            Some(&attempt.model),
        )
        .await
        {
            Ok(embedding) => return Ok(embedding),
            Err(error) => errors.push(format!("{}: {error}", attempt.provider_id)),
        }
    }

    Err(format!(
        "Failed to get memory embedding from configured providers: {}",
        errors.join("; ")
    ))
}

#[cfg(test)]
fn load_embedding_backfill_candidates(
    conn: &rusqlite::Connection,
    category: Option<&MemoryCategory>,
    dimension: usize,
) -> Result<Vec<UnifiedMemory>, String> {
    let expected_bytes = dimension
        .checked_mul(std::mem::size_of::<f32>())
        .ok_or_else(|| "Embedding dimension is too large.".to_string())?
        as i64;

    let base_sql = "SELECT id, session_id, memory_type, category, title, content, summary, tags, confidence, importance, access_count, last_accessed_at, source, created_at, updated_at, archived, embedding FROM unified_memory WHERE archived = 0 AND (embedding IS NULL OR length(embedding) != ?1)";
    let sql = if category.is_some() {
        format!("{base_sql} AND category = ?2 ORDER BY updated_at DESC")
    } else {
        format!("{base_sql} ORDER BY updated_at DESC")
    };

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare memory embedding backfill query: {e}"))?;

    let map_row = |row: &rusqlite::Row| parse_memory_row(row);

    let rows = if let Some(category) = category {
        let category_json = serde_json::to_string(category).unwrap_or_default();
        stmt.query_map(params![expected_bytes, category_json], map_row)
            .map_err(|e| format!("Failed to query memory embedding backfill candidates: {e}"))?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
    } else {
        stmt.query_map(params![expected_bytes], map_row)
            .map_err(|e| format!("Failed to query memory embedding backfill candidates: {e}"))?
            .collect::<Result<Vec<_>, rusqlite::Error>>()
    };

    rows.map_err(|e| format!("Failed to read memory embedding backfill candidates: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_core::database::{migration, schema};
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};

    fn init_test_database() -> DbConnection {
        let conn = Connection::open_in_memory().unwrap();
        schema::create_tables(&conn).unwrap();
        migration::migrate_from_json(&conn).unwrap();
        Arc::new(Mutex::new(conn))
    }

    #[test]
    fn auto_embedding_prefers_builtin_then_openai() {
        let config = MemoryEmbeddingConfig::default();

        let attempts = resolve_embedding_provider_attempts(&config).unwrap();

        assert_eq!(
            attempts,
            vec![
                EmbeddingProviderAttempt {
                    provider_id: "lime-hub".to_string(),
                    model: "text-embedding-3-small".to_string(),
                },
                EmbeddingProviderAttempt {
                    provider_id: "openai".to_string(),
                    model: "text-embedding-3-small".to_string(),
                },
            ]
        );
    }

    #[test]
    fn provider_embedding_requires_provider_id() {
        let config = MemoryEmbeddingConfig {
            provider: MemoryEmbeddingProvider::Provider,
            provider_id: None,
            model: "custom-embedding".to_string(),
        };

        assert!(resolve_embedding_provider_attempts(&config).is_err());
    }

    #[test]
    fn local_onnx_embedding_model_supports_all_minilm() {
        let config = MemoryEmbeddingConfig {
            provider: MemoryEmbeddingProvider::LocalOnnx,
            provider_id: None,
            model: "all-MiniLM-L6-v2".to_string(),
        };

        let model = lime_embedding::normalize_local_onnx_model_name(Some(&config.model)).unwrap();

        assert_eq!(model, lime_embedding::DEFAULT_LOCAL_ONNX_EMBEDDING_MODEL);
    }

    #[test]
    fn builtin_embedding_can_override_provider_id() {
        let config = MemoryEmbeddingConfig {
            provider: MemoryEmbeddingProvider::Builtin,
            provider_id: Some("lime-hub-cn".to_string()),
            model: " ".to_string(),
        };

        let attempts = resolve_embedding_provider_attempts(&config).unwrap();

        assert_eq!(
            attempts,
            vec![EmbeddingProviderAttempt {
                provider_id: "lime-hub-cn".to_string(),
                model: "text-embedding-3-small".to_string(),
            }]
        );
    }

    #[test]
    fn embedding_blob_dimension_match_uses_f32_byte_width() {
        assert!(!embedding_blob_matches_dimension(None, 2));
        assert!(!embedding_blob_matches_dimension(Some(&[0; 4]), 2));
        assert!(embedding_blob_matches_dimension(Some(&[0; 8]), 2));
    }

    #[test]
    fn load_backfill_candidates_returns_missing_and_wrong_dimension_only() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE unified_memory (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                memory_type TEXT NOT NULL,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                summary TEXT NOT NULL,
                tags TEXT NOT NULL,
                confidence REAL NOT NULL,
                importance INTEGER NOT NULL,
                access_count INTEGER NOT NULL,
                last_accessed_at INTEGER,
                source TEXT NOT NULL,
                embedding BLOB,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                archived INTEGER NOT NULL DEFAULT 0
            );",
        )
        .unwrap();

        let memory_type = serde_json::to_string(&MemoryType::Conversation).unwrap();
        let category = serde_json::to_string(&MemoryCategory::Context).unwrap();
        let source = serde_json::to_string(&MemorySource::Manual).unwrap();
        let tags = "[]";
        let matching_embedding = vec![0_u8; 8];
        let stale_embedding = vec![0_u8; 4];

        for (id, embedding) in [
            ("missing", None),
            ("stale", Some(stale_embedding.as_slice())),
            ("current", Some(matching_embedding.as_slice())),
        ] {
            conn.execute(
                "INSERT INTO unified_memory (
                    id, session_id, memory_type, category, title, content, summary, tags,
                    confidence, importance, access_count, last_accessed_at, source, embedding,
                    created_at, updated_at, archived
                ) VALUES (?1, 'session', ?2, ?3, ?4, ?4, ?4, ?5, 0.8, 5, 0, NULL, ?6, ?7, 1, 1, 0)",
                params![id, &memory_type, &category, id, tags, &source, embedding],
            )
            .unwrap();
        }

        let candidates =
            load_embedding_backfill_candidates(&conn, Some(&MemoryCategory::Context), 2).unwrap();
        let ids = candidates
            .into_iter()
            .map(|memory| memory.id)
            .collect::<Vec<_>>();

        assert_eq!(ids, vec!["missing".to_string(), "stale".to_string()]);
    }

    #[tokio::test]
    async fn api_embedding_initializes_system_providers_before_credential_lookup() {
        let db = init_test_database();
        let config = MemoryEmbeddingConfig::default();

        let err = embed_text_with_config(&db, "hello", &config)
            .await
            .expect_err("missing credentials should still fail");

        assert!(err.contains("lime-hub: no enabled credential"));
        assert!(err.contains("openai: no enabled credential"));

        let conn = db.lock().unwrap();
        for provider_id in ["lime-hub", "openai"] {
            let exists: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM api_key_providers WHERE id = ?1",
                    [provider_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(exists, 1, "{provider_id} should be initialized");
        }
    }
}
