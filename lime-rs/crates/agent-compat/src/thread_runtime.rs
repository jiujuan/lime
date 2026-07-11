use anyhow::{anyhow, Result};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tokio::sync::{OnceCell, RwLock};
use utoipa::ToSchema;

use super::runtime_queue::initialize_session_runtime_queue_service;
use crate::config::paths::Paths;
use crate::conversation::message::{MessageContent, MessageMetadata};
use crate::session::session_record::SESSIONS_FOLDER;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqliteRow};
use sqlx::{Pool, Row, Sqlite};

pub const RUNTIME_DB_NAME: &str = "runtime.db";
static SHARED_THREAD_RUNTIME_STORE: OnceLock<Arc<dyn ThreadRuntimeStore>> = OnceLock::new();
const SHARED_THREAD_RUNTIME_STORE_INIT_ERROR: &str =
    "shared thread runtime store is not initialized; call initialize_session_runtime_store first";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TurnContextOverride {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = String)]
    pub cwd: Option<PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approval_policy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sandbox_policy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collaboration_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_visible_input_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(value_type = Object)]
    pub output_schema: Option<Value>,
    #[serde(skip, default)]
    #[schema(skip)]
    pub output_schema_source: Option<TurnOutputSchemaSource>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    #[schema(value_type = Object)]
    pub metadata: HashMap<String, Value>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ThreadStatus {
    #[default]
    Active,
    Archived,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum TurnStatus {
    Queued,
    #[default]
    Running,
    Completed,
    Failed,
    Aborted,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ItemStatus {
    #[default]
    InProgress,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum TurnOutputSchemaSource {
    Session,
    Turn,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum TurnOutputSchemaStrategy {
    Native,
    FinalOutputTool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TurnOutputSchemaRuntime {
    pub source: TurnOutputSchemaSource,
    pub strategy: TurnOutputSchemaStrategy,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ItemRuntimePayload {
    TranscriptMessage {
        role: String,
        content: Vec<MessageContent>,
        metadata: MessageMetadata,
        created_timestamp: i64,
    },
    UserMessage {
        content: String,
    },
    AgentMessage {
        text: String,
    },
    Plan {
        text: String,
    },
    RuntimeStatus {
        phase: String,
        title: String,
        detail: String,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        checkpoints: Vec<String>,
    },
    FileArtifact {
        path: String,
        source: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schema(value_type = String)]
        content: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schema(value_type = Object)]
        metadata: Option<Value>,
    },
    Reasoning {
        text: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        summary: Option<Vec<String>>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        #[schema(value_type = Object)]
        metadata: Option<Value>,
    },
    ToolCall {
        tool_name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schema(value_type = Object)]
        arguments: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schema(value_type = Object)]
        output: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        success: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        error: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schema(value_type = Object)]
        metadata: Option<Value>,
    },
    ApprovalRequest {
        request_id: String,
        action_type: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        prompt: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_name: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schema(value_type = Object)]
        arguments: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schema(value_type = Object)]
        response: Option<Value>,
    },
    RequestUserInput {
        request_id: String,
        action_type: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        prompt: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schema(value_type = Object)]
        requested_schema: Option<Value>,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[schema(value_type = Object)]
        response: Option<Value>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ItemRuntime {
    pub id: String,
    pub thread_id: String,
    pub turn_id: String,
    pub sequence: i64,
    pub status: ItemStatus,
    pub started_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
    #[serde(flatten)]
    pub payload: ItemRuntimePayload,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ThreadRuntime {
    pub id: String,
    pub session_id: String,
    #[schema(value_type = String)]
    pub working_dir: PathBuf,
    pub status: ThreadStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    #[schema(value_type = Object)]
    pub metadata: HashMap<String, Value>,
}

impl ThreadRuntime {
    pub fn new(id: impl Into<String>, session_id: impl Into<String>, working_dir: PathBuf) -> Self {
        let now = Utc::now();
        Self {
            id: id.into(),
            session_id: session_id.into(),
            working_dir,
            status: ThreadStatus::Active,
            created_at: now,
            updated_at: now,
            metadata: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TurnRuntime {
    pub id: String,
    pub session_id: String,
    pub thread_id: String,
    pub status: TurnStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_override: Option<TurnContextOverride>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_schema_runtime: Option<TurnOutputSchemaRuntime>,
    pub created_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}

impl TurnRuntime {
    pub fn new(
        id: impl Into<String>,
        session_id: impl Into<String>,
        thread_id: impl Into<String>,
        input_text: Option<String>,
        context_override: Option<TurnContextOverride>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: id.into(),
            session_id: session_id.into(),
            thread_id: thread_id.into(),
            status: TurnStatus::Running,
            input_text,
            error_message: None,
            context_override,
            output_schema_runtime: None,
            created_at: now,
            started_at: Some(now),
            completed_at: None,
            updated_at: now,
        }
    }

    pub fn with_output_schema_runtime(
        mut self,
        output_schema_runtime: Option<TurnOutputSchemaRuntime>,
    ) -> Self {
        self.output_schema_runtime = output_schema_runtime;
        self
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct QueuedTurnRuntime {
    pub queued_turn_id: String,
    pub session_id: String,
    pub message_preview: String,
    pub message_text: String,
    pub created_at: i64,
    pub image_count: usize,
    #[schema(value_type = Object)]
    pub payload: Value,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    #[schema(value_type = Object)]
    pub metadata: HashMap<String, Value>,
}

#[derive(Debug, Clone)]
pub struct SessionExecutionGate {
    inner: Arc<Mutex<HashMap<String, String>>>,
}

impl Default for SessionExecutionGate {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl SessionExecutionGate {
    pub fn try_start(&self, session_id: &str) -> bool {
        self.try_start_turn(session_id, "")
    }

    pub fn try_start_turn(&self, session_id: &str, turn_id: &str) -> bool {
        let mut sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        if sessions.contains_key(session_id) {
            return false;
        }
        sessions.insert(session_id.to_string(), turn_id.to_string());
        true
    }

    pub fn set_active_turn_id(&self, session_id: &str, turn_id: &str) -> bool {
        let mut sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        let Some(active_turn_id) = sessions.get_mut(session_id) else {
            return false;
        };
        *active_turn_id = turn_id.to_string();
        true
    }

    pub fn finish(&self, session_id: &str) -> bool {
        let mut sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        sessions.remove(session_id).is_some()
    }

    pub fn finish_if_matches(&self, session_id: &str, turn_id: &str) -> bool {
        let mut sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        if sessions
            .get(session_id)
            .is_some_and(|active_turn_id| active_turn_id == turn_id)
        {
            sessions.remove(session_id);
            return true;
        }
        false
    }

    pub fn active_turn_id(&self, session_id: &str) -> Option<String> {
        let sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        sessions
            .get(session_id)
            .filter(|turn_id| !turn_id.is_empty())
            .cloned()
    }

    pub fn active_turn_matches(&self, session_id: &str, turn_id: &str) -> bool {
        let sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        sessions
            .get(session_id)
            .is_some_and(|active_turn_id| active_turn_id == turn_id)
    }

    pub fn is_active(&self, session_id: &str) -> bool {
        let sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        sessions.contains_key(session_id)
    }

    pub fn active_session_ids(&self) -> HashSet<String> {
        let sessions = match self.inner.lock() {
            Ok(guard) => guard,
            Err(error) => error.into_inner(),
        };
        sessions.keys().cloned().collect()
    }
}

#[async_trait]
pub trait ThreadRuntimeStore: Send + Sync {
    async fn upsert_thread(&self, thread: ThreadRuntime) -> Result<ThreadRuntime>;
    async fn list_threads(&self, session_id: &str) -> Result<Vec<ThreadRuntime>>;
    async fn get_thread(&self, thread_id: &str) -> Result<Option<ThreadRuntime>>;
    async fn delete_session(&self, session_id: &str) -> Result<()>;
    async fn create_turn(&self, turn: TurnRuntime) -> Result<TurnRuntime>;
    async fn update_turn(&self, turn: TurnRuntime) -> Result<TurnRuntime>;
    async fn get_turn(&self, turn_id: &str) -> Result<Option<TurnRuntime>>;
    async fn list_turns(&self, thread_id: &str) -> Result<Vec<TurnRuntime>>;
    async fn create_item(&self, item: ItemRuntime) -> Result<ItemRuntime>;
    async fn update_item(&self, item: ItemRuntime) -> Result<ItemRuntime>;
    async fn get_item(&self, item_id: &str) -> Result<Option<ItemRuntime>>;
    async fn delete_item(&self, item_id: &str) -> Result<Option<ItemRuntime>>;
    async fn list_items(&self, thread_id: &str) -> Result<Vec<ItemRuntime>>;
    async fn enqueue_turn(&self, queued_turn: QueuedTurnRuntime) -> Result<QueuedTurnRuntime>;
    async fn list_queued_turns(&self, session_id: &str) -> Result<Vec<QueuedTurnRuntime>>;
    async fn list_queued_turn_session_ids(&self) -> Result<Vec<String>>;
    async fn remove_queued_turn(&self, queued_turn_id: &str) -> Result<Option<QueuedTurnRuntime>>;
    async fn take_next_queued_turn(&self, session_id: &str) -> Result<Option<QueuedTurnRuntime>>;
    async fn clear_queued_turns(&self, session_id: &str) -> Result<Vec<QueuedTurnRuntime>>;
}

fn default_runtime_db_path() -> PathBuf {
    Paths::data_dir()
        .join(SESSIONS_FOLDER)
        .join(RUNTIME_DB_NAME)
}

pub fn initialize_session_runtime_store(
    store: Arc<dyn ThreadRuntimeStore>,
) -> Arc<dyn ThreadRuntimeStore> {
    let _ = SHARED_THREAD_RUNTIME_STORE.set(store);
    let store = SHARED_THREAD_RUNTIME_STORE
        .get()
        .expect("shared thread runtime store should be initialized")
        .clone();
    initialize_session_runtime_queue_service(store.clone());
    store
}

pub fn initialize_sqlite_session_runtime_store(db_path: PathBuf) -> Arc<dyn ThreadRuntimeStore> {
    initialize_session_runtime_store(Arc::new(SqliteThreadRuntimeStore::new(db_path)))
}

pub fn initialize_default_sqlite_session_runtime_store() -> Arc<dyn ThreadRuntimeStore> {
    initialize_sqlite_session_runtime_store(default_runtime_db_path())
}

pub fn require_session_runtime_store() -> Result<Arc<dyn ThreadRuntimeStore>> {
    SHARED_THREAD_RUNTIME_STORE
        .get()
        .cloned()
        .ok_or_else(|| anyhow!(SHARED_THREAD_RUNTIME_STORE_INIT_ERROR))
}

pub struct SqliteThreadRuntimeStore {
    db_path: PathBuf,
    pool: OnceCell<Pool<Sqlite>>,
}

impl SqliteThreadRuntimeStore {
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db_path,
            pool: OnceCell::const_new(),
        }
    }

    async fn pool(&self) -> Result<&Pool<Sqlite>> {
        let db_path = self.db_path.clone();
        self.pool
            .get_or_try_init(|| async move { Self::open_pool(&db_path).await })
            .await
    }

    async fn open_pool(db_path: &std::path::Path) -> Result<Pool<Sqlite>> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let options = SqliteConnectOptions::new()
            .filename(db_path)
            .create_if_missing(true)
            .busy_timeout(Duration::from_secs(5))
            .journal_mode(SqliteJournalMode::Wal);

        let pool = sqlx::SqlitePool::connect_with(options).await?;
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await?;
        Self::ensure_schema(&pool).await?;
        Ok(pool)
    }

    async fn ensure_schema(pool: &Pool<Sqlite>) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS thread_runtimes (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                working_dir TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}'
            )
        "#,
        )
        .execute(pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS turn_runtimes (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                thread_id TEXT NOT NULL REFERENCES thread_runtimes(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                input_text TEXT,
                error_message TEXT,
                context_override_json TEXT,
                output_schema_runtime_json TEXT,
                created_at TIMESTAMP NOT NULL,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                updated_at TIMESTAMP NOT NULL
            )
        "#,
        )
        .execute(pool)
        .await?;

        Self::ensure_optional_text_column(pool, "turn_runtimes", "output_schema_runtime_json")
            .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS item_runtimes (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL REFERENCES thread_runtimes(id) ON DELETE CASCADE,
                turn_id TEXT NOT NULL REFERENCES turn_runtimes(id) ON DELETE CASCADE,
                sequence INTEGER NOT NULL,
                status TEXT NOT NULL,
                started_at TIMESTAMP NOT NULL,
                completed_at TIMESTAMP,
                updated_at TIMESTAMP NOT NULL,
                payload_json TEXT NOT NULL
            )
        "#,
        )
        .execute(pool)
        .await?;

        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS queued_turn_runtimes (
                queued_turn_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                message_preview TEXT NOT NULL,
                message_text TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                image_count INTEGER NOT NULL DEFAULT 0,
                payload_json TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}'
            )
        "#,
        )
        .execute(pool)
        .await?;

        Self::ensure_indexes(pool).await?;

        Ok(())
    }

    async fn ensure_indexes(pool: &Pool<Sqlite>) -> Result<()> {
        for statement in [
            "CREATE INDEX IF NOT EXISTS idx_thread_runtimes_session ON thread_runtimes(session_id, created_at ASC)",
            "CREATE INDEX IF NOT EXISTS idx_turn_runtimes_thread ON turn_runtimes(thread_id, created_at ASC)",
            "CREATE INDEX IF NOT EXISTS idx_turn_runtimes_session ON turn_runtimes(session_id, created_at ASC)",
            "CREATE INDEX IF NOT EXISTS idx_item_runtimes_thread ON item_runtimes(thread_id, sequence ASC, started_at ASC)",
            "CREATE INDEX IF NOT EXISTS idx_item_runtimes_turn ON item_runtimes(turn_id, sequence ASC)",
            "CREATE INDEX IF NOT EXISTS idx_queued_turn_runtimes_session ON queued_turn_runtimes(session_id, created_at ASC, queued_turn_id ASC)",
        ] {
            sqlx::query(statement).execute(pool).await?;
        }

        Ok(())
    }

    async fn ensure_optional_text_column(
        pool: &Pool<Sqlite>,
        table: &str,
        column: &str,
    ) -> Result<()> {
        let pragma = format!("PRAGMA table_info({table})");
        let rows = sqlx::query(&pragma).fetch_all(pool).await?;
        let exists = rows
            .iter()
            .filter_map(|row| row.try_get::<String, _>("name").ok())
            .any(|name| name == column);
        if !exists {
            let alter = format!("ALTER TABLE {table} ADD COLUMN {column} TEXT");
            sqlx::query(&alter).execute(pool).await?;
        }
        Ok(())
    }

    async fn write_thread(&self, mut thread: ThreadRuntime) -> Result<ThreadRuntime> {
        thread.updated_at = Utc::now();
        let pool = self.pool().await?;
        sqlx::query(
            r#"
            INSERT INTO thread_runtimes (
                id, session_id, working_dir, status, created_at, updated_at, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                session_id = excluded.session_id,
                working_dir = excluded.working_dir,
                status = excluded.status,
                updated_at = excluded.updated_at,
                metadata_json = excluded.metadata_json
        "#,
        )
        .bind(&thread.id)
        .bind(&thread.session_id)
        .bind(thread.working_dir.to_string_lossy().to_string())
        .bind(thread_status_as_str(thread.status))
        .bind(thread.created_at)
        .bind(thread.updated_at)
        .bind(serde_json::to_string(&thread.metadata)?)
        .execute(pool)
        .await?;
        Ok(thread)
    }

    async fn write_turn(&self, mut turn: TurnRuntime) -> Result<TurnRuntime> {
        turn.updated_at = Utc::now();
        let pool = self.pool().await?;
        sqlx::query(
            r#"
            INSERT INTO turn_runtimes (
                id, session_id, thread_id, status, input_text, error_message,
                context_override_json, output_schema_runtime_json, created_at, started_at,
                completed_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                session_id = excluded.session_id,
                thread_id = excluded.thread_id,
                status = excluded.status,
                input_text = excluded.input_text,
                error_message = excluded.error_message,
                context_override_json = excluded.context_override_json,
                output_schema_runtime_json = excluded.output_schema_runtime_json,
                started_at = excluded.started_at,
                completed_at = excluded.completed_at,
                updated_at = excluded.updated_at
        "#,
        )
        .bind(&turn.id)
        .bind(&turn.session_id)
        .bind(&turn.thread_id)
        .bind(turn_status_as_str(turn.status))
        .bind(&turn.input_text)
        .bind(&turn.error_message)
        .bind(
            turn.context_override
                .as_ref()
                .map(serde_json::to_string)
                .transpose()?,
        )
        .bind(
            turn.output_schema_runtime
                .as_ref()
                .map(serde_json::to_string)
                .transpose()?,
        )
        .bind(turn.created_at)
        .bind(turn.started_at)
        .bind(turn.completed_at)
        .bind(turn.updated_at)
        .execute(pool)
        .await?;
        Ok(turn)
    }

    async fn write_item(&self, mut item: ItemRuntime) -> Result<ItemRuntime> {
        item.updated_at = Utc::now();
        let pool = self.pool().await?;
        sqlx::query(
            r#"
            INSERT INTO item_runtimes (
                id, thread_id, turn_id, sequence, status, started_at, completed_at, updated_at, payload_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                thread_id = excluded.thread_id,
                turn_id = excluded.turn_id,
                sequence = excluded.sequence,
                status = excluded.status,
                started_at = excluded.started_at,
                completed_at = excluded.completed_at,
                updated_at = excluded.updated_at,
                payload_json = excluded.payload_json
        "#,
        )
        .bind(&item.id)
        .bind(&item.thread_id)
        .bind(&item.turn_id)
        .bind(item.sequence)
        .bind(item_status_as_str(item.status))
        .bind(item.started_at)
        .bind(item.completed_at)
        .bind(item.updated_at)
        .bind(serde_json::to_string(&item.payload)?)
        .execute(pool)
        .await?;
        Ok(item)
    }

    async fn write_queued_turn(&self, queued_turn: QueuedTurnRuntime) -> Result<QueuedTurnRuntime> {
        let pool = self.pool().await?;
        sqlx::query(
            r#"
            INSERT INTO queued_turn_runtimes (
                queued_turn_id, session_id, message_preview, message_text,
                created_at, image_count, payload_json, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(queued_turn_id) DO UPDATE SET
                session_id = excluded.session_id,
                message_preview = excluded.message_preview,
                message_text = excluded.message_text,
                created_at = excluded.created_at,
                image_count = excluded.image_count,
                payload_json = excluded.payload_json,
                metadata_json = excluded.metadata_json
        "#,
        )
        .bind(&queued_turn.queued_turn_id)
        .bind(&queued_turn.session_id)
        .bind(&queued_turn.message_preview)
        .bind(&queued_turn.message_text)
        .bind(queued_turn.created_at)
        .bind(queued_turn.image_count as i64)
        .bind(serde_json::to_string(&queued_turn.payload)?)
        .bind(serde_json::to_string(&queued_turn.metadata)?)
        .execute(pool)
        .await?;
        Ok(queued_turn)
    }

    fn decode_thread_row(row: SqliteRow) -> Result<ThreadRuntime> {
        let status_raw: String = row.try_get("status")?;
        let metadata_json: String = row.try_get("metadata_json")?;
        Ok(ThreadRuntime {
            id: row.try_get("id")?,
            session_id: row.try_get("session_id")?,
            working_dir: PathBuf::from(row.try_get::<String, _>("working_dir")?),
            status: parse_thread_status(&status_raw)?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
            metadata: serde_json::from_str(&metadata_json)?,
        })
    }

    fn decode_turn_row(row: SqliteRow) -> Result<TurnRuntime> {
        let status_raw: String = row.try_get("status")?;
        let context_override_json: Option<String> = row.try_get("context_override_json")?;
        let output_schema_runtime_json: Option<String> =
            row.try_get("output_schema_runtime_json")?;
        Ok(TurnRuntime {
            id: row.try_get("id")?,
            session_id: row.try_get("session_id")?,
            thread_id: row.try_get("thread_id")?,
            status: parse_turn_status(&status_raw)?,
            input_text: row.try_get("input_text")?,
            error_message: row.try_get("error_message")?,
            context_override: context_override_json
                .map(|json| serde_json::from_str(&json))
                .transpose()?,
            output_schema_runtime: output_schema_runtime_json
                .map(|json| serde_json::from_str(&json))
                .transpose()?,
            created_at: row.try_get("created_at")?,
            started_at: row.try_get("started_at")?,
            completed_at: row.try_get("completed_at")?,
            updated_at: row.try_get("updated_at")?,
        })
    }

    fn decode_item_row(row: SqliteRow) -> Result<ItemRuntime> {
        let status_raw: String = row.try_get("status")?;
        let payload_json: String = row.try_get("payload_json")?;
        Ok(ItemRuntime {
            id: row.try_get("id")?,
            thread_id: row.try_get("thread_id")?,
            turn_id: row.try_get("turn_id")?,
            sequence: row.try_get("sequence")?,
            status: parse_item_status(&status_raw)?,
            started_at: row.try_get("started_at")?,
            completed_at: row.try_get("completed_at")?,
            updated_at: row.try_get("updated_at")?,
            payload: serde_json::from_str(&payload_json)?,
        })
    }

    fn decode_queued_turn_row(row: SqliteRow) -> Result<QueuedTurnRuntime> {
        let payload_json: String = row.try_get("payload_json")?;
        let metadata_json: String = row.try_get("metadata_json")?;
        Ok(QueuedTurnRuntime {
            queued_turn_id: row.try_get("queued_turn_id")?,
            session_id: row.try_get("session_id")?,
            message_preview: row.try_get("message_preview")?,
            message_text: row.try_get("message_text")?,
            created_at: row.try_get("created_at")?,
            image_count: row.try_get::<i64, _>("image_count")? as usize,
            payload: serde_json::from_str(&payload_json)?,
            metadata: serde_json::from_str(&metadata_json)?,
        })
    }
}

fn thread_status_as_str(status: ThreadStatus) -> &'static str {
    match status {
        ThreadStatus::Active => "active",
        ThreadStatus::Archived => "archived",
    }
}

fn parse_thread_status(value: &str) -> Result<ThreadStatus> {
    match value {
        "active" => Ok(ThreadStatus::Active),
        "archived" => Ok(ThreadStatus::Archived),
        other => anyhow::bail!("Unknown thread status: {other}"),
    }
}

fn turn_status_as_str(status: TurnStatus) -> &'static str {
    match status {
        TurnStatus::Queued => "queued",
        TurnStatus::Running => "running",
        TurnStatus::Completed => "completed",
        TurnStatus::Failed => "failed",
        TurnStatus::Aborted => "aborted",
    }
}

fn parse_turn_status(value: &str) -> Result<TurnStatus> {
    match value {
        "queued" => Ok(TurnStatus::Queued),
        "running" => Ok(TurnStatus::Running),
        "completed" => Ok(TurnStatus::Completed),
        "failed" => Ok(TurnStatus::Failed),
        "aborted" => Ok(TurnStatus::Aborted),
        other => anyhow::bail!("Unknown turn status: {other}"),
    }
}

fn item_status_as_str(status: ItemStatus) -> &'static str {
    match status {
        ItemStatus::InProgress => "in_progress",
        ItemStatus::Completed => "completed",
        ItemStatus::Failed => "failed",
    }
}

fn parse_item_status(value: &str) -> Result<ItemStatus> {
    match value {
        "in_progress" => Ok(ItemStatus::InProgress),
        "completed" => Ok(ItemStatus::Completed),
        "failed" => Ok(ItemStatus::Failed),
        other => anyhow::bail!("Unknown item status: {other}"),
    }
}

#[async_trait]
impl ThreadRuntimeStore for SqliteThreadRuntimeStore {
    async fn upsert_thread(&self, thread: ThreadRuntime) -> Result<ThreadRuntime> {
        self.write_thread(thread).await
    }

    async fn list_threads(&self, session_id: &str) -> Result<Vec<ThreadRuntime>> {
        let pool = self.pool().await?;
        let rows = sqlx::query(
            r#"
            SELECT id, session_id, working_dir, status, created_at, updated_at, metadata_json
            FROM thread_runtimes
            WHERE session_id = ?
            ORDER BY created_at ASC, id ASC
        "#,
        )
        .bind(session_id)
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::decode_thread_row).collect()
    }

    async fn get_thread(&self, thread_id: &str) -> Result<Option<ThreadRuntime>> {
        let pool = self.pool().await?;
        let row = sqlx::query(
            r#"
            SELECT id, session_id, working_dir, status, created_at, updated_at, metadata_json
            FROM thread_runtimes
            WHERE id = ?
        "#,
        )
        .bind(thread_id)
        .fetch_optional(pool)
        .await?;

        row.map(Self::decode_thread_row).transpose()
    }

    async fn delete_session(&self, session_id: &str) -> Result<()> {
        let pool = self.pool().await?;
        sqlx::query("DELETE FROM queued_turn_runtimes WHERE session_id = ?")
            .bind(session_id)
            .execute(pool)
            .await?;
        sqlx::query("DELETE FROM thread_runtimes WHERE session_id = ?")
            .bind(session_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    async fn create_turn(&self, turn: TurnRuntime) -> Result<TurnRuntime> {
        self.write_turn(turn).await
    }

    async fn update_turn(&self, turn: TurnRuntime) -> Result<TurnRuntime> {
        self.write_turn(turn).await
    }

    async fn get_turn(&self, turn_id: &str) -> Result<Option<TurnRuntime>> {
        let pool = self.pool().await?;
        let row = sqlx::query(
            r#"
            SELECT
                id, session_id, thread_id, status, input_text, error_message,
                context_override_json, output_schema_runtime_json, created_at, started_at,
                completed_at, updated_at
            FROM turn_runtimes
            WHERE id = ?
        "#,
        )
        .bind(turn_id)
        .fetch_optional(pool)
        .await?;

        row.map(Self::decode_turn_row).transpose()
    }

    async fn list_turns(&self, thread_id: &str) -> Result<Vec<TurnRuntime>> {
        let pool = self.pool().await?;
        let rows = sqlx::query(
            r#"
            SELECT
                id, session_id, thread_id, status, input_text, error_message,
                context_override_json, output_schema_runtime_json, created_at, started_at,
                completed_at, updated_at
            FROM turn_runtimes
            WHERE thread_id = ?
            ORDER BY created_at ASC, id ASC
        "#,
        )
        .bind(thread_id)
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::decode_turn_row).collect()
    }

    async fn create_item(&self, item: ItemRuntime) -> Result<ItemRuntime> {
        self.write_item(item).await
    }

    async fn update_item(&self, item: ItemRuntime) -> Result<ItemRuntime> {
        self.write_item(item).await
    }

    async fn get_item(&self, item_id: &str) -> Result<Option<ItemRuntime>> {
        let pool = self.pool().await?;
        let row = sqlx::query(
            r#"
            SELECT
                id, thread_id, turn_id, sequence, status, started_at,
                completed_at, updated_at, payload_json
            FROM item_runtimes
            WHERE id = ?
        "#,
        )
        .bind(item_id)
        .fetch_optional(pool)
        .await?;

        row.map(Self::decode_item_row).transpose()
    }

    async fn delete_item(&self, item_id: &str) -> Result<Option<ItemRuntime>> {
        let pool = self.pool().await?;
        let mut tx = pool.begin().await?;
        let row = sqlx::query(
            r#"
            SELECT
                id, thread_id, turn_id, sequence, status, started_at,
                completed_at, updated_at, payload_json
            FROM item_runtimes
            WHERE id = ?
        "#,
        )
        .bind(item_id)
        .fetch_optional(&mut *tx)
        .await?;

        let Some(row) = row else {
            tx.commit().await?;
            return Ok(None);
        };
        sqlx::query("DELETE FROM item_runtimes WHERE id = ?")
            .bind(item_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;

        Ok(Some(Self::decode_item_row(row)?))
    }

    async fn list_items(&self, thread_id: &str) -> Result<Vec<ItemRuntime>> {
        let pool = self.pool().await?;
        let rows = sqlx::query(
            r#"
            SELECT
                i.id, i.thread_id, i.turn_id, i.sequence, i.status, i.started_at,
                i.completed_at, i.updated_at, i.payload_json
            FROM item_runtimes i
            LEFT JOIN turn_runtimes t ON t.id = i.turn_id
            WHERE i.thread_id = ?
            ORDER BY
                COALESCE(t.started_at, t.created_at, i.started_at) ASC,
                i.sequence ASC,
                i.turn_id ASC,
                i.started_at ASC,
                i.id ASC
        "#,
        )
        .bind(thread_id)
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::decode_item_row).collect()
    }

    async fn enqueue_turn(&self, queued_turn: QueuedTurnRuntime) -> Result<QueuedTurnRuntime> {
        self.write_queued_turn(queued_turn).await
    }

    async fn list_queued_turns(&self, session_id: &str) -> Result<Vec<QueuedTurnRuntime>> {
        let pool = self.pool().await?;
        let rows = sqlx::query(
            r#"
            SELECT
                queued_turn_id, session_id, message_preview, message_text,
                created_at, image_count, payload_json, metadata_json
            FROM queued_turn_runtimes
            WHERE session_id = ?
            ORDER BY created_at ASC, queued_turn_id ASC
        "#,
        )
        .bind(session_id)
        .fetch_all(pool)
        .await?;

        rows.into_iter().map(Self::decode_queued_turn_row).collect()
    }

    async fn list_queued_turn_session_ids(&self) -> Result<Vec<String>> {
        let pool = self.pool().await?;
        let rows = sqlx::query_scalar::<_, String>(
            r#"
            SELECT DISTINCT session_id
            FROM queued_turn_runtimes
            ORDER BY session_id ASC
        "#,
        )
        .fetch_all(pool)
        .await?;
        Ok(rows)
    }

    async fn remove_queued_turn(&self, queued_turn_id: &str) -> Result<Option<QueuedTurnRuntime>> {
        let pool = self.pool().await?;
        let mut tx = pool.begin().await?;
        let row = sqlx::query(
            r#"
            SELECT
                queued_turn_id, session_id, message_preview, message_text,
                created_at, image_count, payload_json, metadata_json
            FROM queued_turn_runtimes
            WHERE queued_turn_id = ?
        "#,
        )
        .bind(queued_turn_id)
        .fetch_optional(&mut *tx)
        .await?;

        let Some(row) = row else {
            tx.commit().await?;
            return Ok(None);
        };

        sqlx::query("DELETE FROM queued_turn_runtimes WHERE queued_turn_id = ?")
            .bind(queued_turn_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;

        Ok(Some(Self::decode_queued_turn_row(row)?))
    }

    async fn take_next_queued_turn(&self, session_id: &str) -> Result<Option<QueuedTurnRuntime>> {
        let pool = self.pool().await?;
        let mut tx = pool.begin().await?;
        let row = sqlx::query(
            r#"
            SELECT
                queued_turn_id, session_id, message_preview, message_text,
                created_at, image_count, payload_json, metadata_json
            FROM queued_turn_runtimes
            WHERE session_id = ?
            ORDER BY created_at ASC, queued_turn_id ASC
            LIMIT 1
        "#,
        )
        .bind(session_id)
        .fetch_optional(&mut *tx)
        .await?;

        let Some(row) = row else {
            tx.commit().await?;
            return Ok(None);
        };

        let queued_turn = Self::decode_queued_turn_row(row)?;
        sqlx::query("DELETE FROM queued_turn_runtimes WHERE queued_turn_id = ?")
            .bind(&queued_turn.queued_turn_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;

        Ok(Some(queued_turn))
    }

    async fn clear_queued_turns(&self, session_id: &str) -> Result<Vec<QueuedTurnRuntime>> {
        let pool = self.pool().await?;
        let mut tx = pool.begin().await?;
        let rows = sqlx::query(
            r#"
            SELECT
                queued_turn_id, session_id, message_preview, message_text,
                created_at, image_count, payload_json, metadata_json
            FROM queued_turn_runtimes
            WHERE session_id = ?
            ORDER BY created_at ASC, queued_turn_id ASC
        "#,
        )
        .bind(session_id)
        .fetch_all(&mut *tx)
        .await?;

        if rows.is_empty() {
            tx.commit().await?;
            return Ok(Vec::new());
        }

        sqlx::query("DELETE FROM queued_turn_runtimes WHERE session_id = ?")
            .bind(session_id)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;

        rows.into_iter().map(Self::decode_queued_turn_row).collect()
    }
}

#[derive(Default)]
pub struct InMemoryThreadRuntimeStore {
    threads: RwLock<HashMap<String, ThreadRuntime>>,
    turns: RwLock<HashMap<String, TurnRuntime>>,
    items: RwLock<HashMap<String, ItemRuntime>>,
    queued_turns: RwLock<HashMap<String, Vec<QueuedTurnRuntime>>>,
}

#[async_trait]
impl ThreadRuntimeStore for InMemoryThreadRuntimeStore {
    async fn upsert_thread(&self, mut thread: ThreadRuntime) -> Result<ThreadRuntime> {
        thread.updated_at = Utc::now();
        self.threads
            .write()
            .await
            .insert(thread.id.clone(), thread.clone());
        Ok(thread)
    }

    async fn list_threads(&self, session_id: &str) -> Result<Vec<ThreadRuntime>> {
        let mut threads = self
            .threads
            .read()
            .await
            .values()
            .filter(|thread| thread.session_id == session_id)
            .cloned()
            .collect::<Vec<_>>();
        threads.sort_by_key(|thread| thread.created_at);
        Ok(threads)
    }

    async fn get_thread(&self, thread_id: &str) -> Result<Option<ThreadRuntime>> {
        Ok(self.threads.read().await.get(thread_id).cloned())
    }

    async fn delete_session(&self, session_id: &str) -> Result<()> {
        let thread_ids = self
            .threads
            .read()
            .await
            .values()
            .filter(|thread| thread.session_id == session_id)
            .map(|thread| thread.id.clone())
            .collect::<Vec<_>>();

        if thread_ids.is_empty() {
            return Ok(());
        }

        self.threads
            .write()
            .await
            .retain(|_, thread| thread.session_id != session_id);
        self.turns
            .write()
            .await
            .retain(|_, turn| !thread_ids.contains(&turn.thread_id));
        self.items
            .write()
            .await
            .retain(|_, item| !thread_ids.contains(&item.thread_id));
        self.queued_turns.write().await.remove(session_id);
        Ok(())
    }

    async fn create_turn(&self, mut turn: TurnRuntime) -> Result<TurnRuntime> {
        turn.updated_at = Utc::now();
        self.turns
            .write()
            .await
            .insert(turn.id.clone(), turn.clone());
        Ok(turn)
    }

    async fn update_turn(&self, mut turn: TurnRuntime) -> Result<TurnRuntime> {
        turn.updated_at = Utc::now();
        self.turns
            .write()
            .await
            .insert(turn.id.clone(), turn.clone());
        Ok(turn)
    }

    async fn get_turn(&self, turn_id: &str) -> Result<Option<TurnRuntime>> {
        Ok(self.turns.read().await.get(turn_id).cloned())
    }

    async fn list_turns(&self, thread_id: &str) -> Result<Vec<TurnRuntime>> {
        let mut turns = self
            .turns
            .read()
            .await
            .values()
            .filter(|turn| turn.thread_id == thread_id)
            .cloned()
            .collect::<Vec<_>>();
        turns.sort_by_key(|turn| turn.created_at);
        Ok(turns)
    }

    async fn create_item(&self, mut item: ItemRuntime) -> Result<ItemRuntime> {
        item.updated_at = Utc::now();
        self.items
            .write()
            .await
            .insert(item.id.clone(), item.clone());
        Ok(item)
    }

    async fn update_item(&self, mut item: ItemRuntime) -> Result<ItemRuntime> {
        item.updated_at = Utc::now();
        self.items
            .write()
            .await
            .insert(item.id.clone(), item.clone());
        Ok(item)
    }

    async fn get_item(&self, item_id: &str) -> Result<Option<ItemRuntime>> {
        Ok(self.items.read().await.get(item_id).cloned())
    }

    async fn delete_item(&self, item_id: &str) -> Result<Option<ItemRuntime>> {
        Ok(self.items.write().await.remove(item_id))
    }

    async fn list_items(&self, thread_id: &str) -> Result<Vec<ItemRuntime>> {
        let turn_started_at = self
            .turns
            .read()
            .await
            .values()
            .filter(|turn| turn.thread_id == thread_id)
            .map(|turn| (turn.id.clone(), turn.started_at.unwrap_or(turn.created_at)))
            .collect::<HashMap<_, _>>();
        let mut items = self
            .items
            .read()
            .await
            .values()
            .filter(|item| item.thread_id == thread_id)
            .cloned()
            .collect::<Vec<_>>();
        items.sort_by(|left, right| {
            turn_started_at
                .get(&left.turn_id)
                .copied()
                .unwrap_or(left.started_at)
                .cmp(
                    &turn_started_at
                        .get(&right.turn_id)
                        .copied()
                        .unwrap_or(right.started_at),
                )
                .then(left.sequence.cmp(&right.sequence))
                .then(left.turn_id.cmp(&right.turn_id))
                .then(left.id.cmp(&right.id))
        });
        Ok(items)
    }

    async fn enqueue_turn(&self, queued_turn: QueuedTurnRuntime) -> Result<QueuedTurnRuntime> {
        let mut queues = self.queued_turns.write().await;
        let entry = queues.entry(queued_turn.session_id.clone()).or_default();
        if let Some(existing) = entry
            .iter_mut()
            .find(|item| item.queued_turn_id == queued_turn.queued_turn_id)
        {
            *existing = queued_turn.clone();
        } else {
            entry.push(queued_turn.clone());
            entry.sort_by(|left, right| {
                left.created_at
                    .cmp(&right.created_at)
                    .then(left.queued_turn_id.cmp(&right.queued_turn_id))
            });
        }
        Ok(queued_turn)
    }

    async fn list_queued_turns(&self, session_id: &str) -> Result<Vec<QueuedTurnRuntime>> {
        Ok(self
            .queued_turns
            .read()
            .await
            .get(session_id)
            .cloned()
            .unwrap_or_default())
    }

    async fn list_queued_turn_session_ids(&self) -> Result<Vec<String>> {
        let mut session_ids = self
            .queued_turns
            .read()
            .await
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        session_ids.sort();
        Ok(session_ids)
    }

    async fn remove_queued_turn(&self, queued_turn_id: &str) -> Result<Option<QueuedTurnRuntime>> {
        let mut queues = self.queued_turns.write().await;
        let session_ids = queues.keys().cloned().collect::<Vec<_>>();
        for session_id in session_ids {
            let (removed, should_remove_session) = {
                let Some(queue) = queues.get_mut(&session_id) else {
                    continue;
                };
                let removed = queue
                    .iter()
                    .position(|item| item.queued_turn_id == queued_turn_id)
                    .map(|index| queue.remove(index));
                (removed, queue.is_empty())
            };
            if should_remove_session {
                queues.remove(&session_id);
            }
            if removed.is_some() {
                return Ok(removed);
            }
        }
        Ok(None)
    }

    async fn take_next_queued_turn(&self, session_id: &str) -> Result<Option<QueuedTurnRuntime>> {
        let mut queues = self.queued_turns.write().await;
        let (next, should_remove_session) = {
            let Some(queue) = queues.get_mut(session_id) else {
                return Ok(None);
            };
            let next = if queue.is_empty() {
                None
            } else {
                Some(queue.remove(0))
            };
            (next, queue.is_empty())
        };
        if should_remove_session {
            queues.remove(session_id);
        }
        Ok(next)
    }

    async fn clear_queued_turns(&self, session_id: &str) -> Result<Vec<QueuedTurnRuntime>> {
        Ok(self
            .queued_turns
            .write()
            .await
            .remove(session_id)
            .unwrap_or_default())
    }
}
