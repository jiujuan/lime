use super::*;
use aster::conversation::message::Message;
use aster::conversation::Conversation;
use aster::model::ModelConfig;
use aster::recipe::Recipe;
use aster::session::{
    initialize_session_runtime_store, require_shared_session_runtime_store,
    InMemoryThreadRuntimeStore, ItemRuntime, ItemRuntimePayload, ItemStatus, ThreadRuntime,
    TokenStatsUpdate, TurnRuntime,
};
use aster::session::{SessionStore, SessionType};
use chrono::Utc;
use lime_core::database::schema::create_tables;
use rusqlite::Connection;
use std::ffi::OsString;
use std::sync::{Arc, Mutex};
use tempfile::tempdir;

fn env_lock() -> &'static Mutex<()> {
    static LOCK: std::sync::OnceLock<Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

struct EnvGuard {
    values: Vec<(&'static str, Option<OsString>)>,
}

impl EnvGuard {
    fn set(entries: &[(&'static str, OsString)]) -> Self {
        let mut values = Vec::new();
        for (key, value) in entries {
            values.push((*key, std::env::var_os(key)));
            std::env::set_var(key, value);
        }
        Self { values }
    }
}

impl Drop for EnvGuard {
    fn drop(&mut self) {
        for (key, previous) in self.values.drain(..) {
            if let Some(value) = previous {
                std::env::set_var(key, value);
            } else {
                std::env::remove_var(key);
            }
        }
    }
}

fn setup_test_store() -> LimeSessionStore {
    initialize_session_runtime_store(Arc::new(InMemoryThreadRuntimeStore::default()));
    let conn = Connection::open_in_memory().expect("创建内存数据库失败");
    create_tables(&conn).expect("初始化表结构失败");
    LimeSessionStore::new(Arc::new(Mutex::new(conn)))
}

fn create_test_legacy_agent_messages_table(conn: &Connection) {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS agent_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content_json TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            tool_calls_json TEXT,
            tool_call_id TEXT,
            reasoning_content TEXT
        )",
        [],
    )
    .expect("创建 legacy agent_messages 测试表失败");
}

fn insert_legacy_agent_message_fixture(
    conn: &Connection,
    session_id: &str,
    role: &str,
    message: &Message,
) {
    create_test_legacy_agent_messages_table(conn);
    let legacy_table = "agent_messages";
    let insert_legacy_message_sql = format!(
        "INSERT INTO {legacy_table} (session_id, role, content_json, timestamp)
         VALUES (?1, ?2, ?3, ?4)"
    );
    conn.execute(
        &insert_legacy_message_sql,
        rusqlite::params![
            session_id,
            role,
            legacy_conversation::serialize_persisted_message_content(message)
                .expect("序列化旧消息"),
            Utc::now().to_rfc3339(),
        ],
    )
    .expect("插入 legacy 消息失败");
}

#[tokio::test]
async fn update_provider_config_should_persist_model_name_first() {
    let store = setup_test_store();
    let session = store
        .create_session(
            PathBuf::from("."),
            "测试会话".to_string(),
            SessionType::User,
        )
        .await
        .expect("创建会话失败");

    store
        .update_provider_config(
            &session.id,
            Some("openai".to_string()),
            Some(ModelConfig::new("gpt-4.1").expect("model config")),
        )
        .await
        .expect("更新 provider 配置失败");

    let conn = store.db.lock().expect("锁数据库");
    let persisted_model: String = conn
        .query_row(
            "SELECT model FROM agent_sessions WHERE id = ?",
            [session.id.as_str()],
            |row| row.get(0),
        )
        .expect("查询 model 失败");

    assert_eq!(persisted_model, "gpt-4.1");
}

#[tokio::test]
async fn get_session_should_prefer_default_workspace_root_when_missing_row() {
    let store = setup_test_store();
    let workspace_root = std::env::temp_dir().join("lime-aster-default-workspace");
    let conn = store.db.lock().expect("锁数据库");
    conn.execute(
        "INSERT INTO workspaces (id, name, workspace_type, root_path, is_default, settings_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 1, '{}', 0, 0)",
        rusqlite::params![
            "workspace-default",
            "默认工作区",
            "general",
            workspace_root.to_string_lossy().to_string(),
        ],
    )
    .expect("插入默认 workspace 失败");
    drop(conn);

    let session = store
        .get_session("missing-default-workspace-session", false)
        .await
        .expect("读取缺失会话失败");

    assert_eq!(session.working_dir, workspace_root);
}

#[tokio::test]
async fn get_session_should_fallback_to_app_paths_default_project_dir() {
    let _env_guard = env_lock().lock().expect("锁环境变量");
    let temp = tempdir().expect("创建临时目录失败");
    let home = temp.path().join("home");
    let app_data = temp.path().join("appdata");
    std::fs::create_dir_all(&home).expect("创建 home 目录失败");
    std::fs::create_dir_all(&app_data).expect("创建 appdata 目录失败");
    let _guard = EnvGuard::set(&[
        ("HOME", home.as_os_str().to_os_string()),
        ("XDG_DATA_HOME", app_data.as_os_str().to_os_string()),
        ("APPDATA", app_data.as_os_str().to_os_string()),
        ("LOCALAPPDATA", app_data.as_os_str().to_os_string()),
    ]);

    let store = setup_test_store();
    let session = store
        .get_session("missing-fallback-session", false)
        .await
        .expect("读取缺失会话失败");
    let expected = app_paths::resolve_default_project_dir().expect("解析默认项目目录失败");

    assert_eq!(session.working_dir, expected);
    assert!(session.working_dir.is_absolute());
    assert!(session
        .working_dir
        .ends_with(PathBuf::from("projects").join("default")));
    assert!(!session
        .working_dir
        .to_string_lossy()
        .contains(".lime/projects/default"));
}

#[tokio::test]
async fn update_session_metadata_should_roundtrip() {
    let store = setup_test_store();
    let session = store
        .create_session(
            PathBuf::from("."),
            "元数据测试".to_string(),
            SessionType::SubAgent,
        )
        .await
        .expect("创建会话失败");

    let mut extension_data = ExtensionData::new();
    extension_data.set_extension_state("todo", "v0", serde_json::json!({"items":["a"]}));

    store
        .update_session_name(&session.id, "已命名会话".to_string(), true)
        .await
        .expect("更新名称失败");
    store
        .update_working_dir(&session.id, PathBuf::from("/tmp/lime-worktree-child"))
        .await
        .expect("更新 working_dir 失败");
    store
        .update_session_type(&session.id, SessionType::Hidden)
        .await
        .expect("更新 session_type 失败");
    store
        .update_extension_data(&session.id, extension_data.clone())
        .await
        .expect("更新 extension_data 失败");
    store
        .update_token_stats(
            &session.id,
            TokenStatsUpdate {
                schedule_id: Some("job-1".to_string()),
                total_tokens: Some(100),
                input_tokens: Some(60),
                output_tokens: Some(40),
                cached_input_tokens: Some(24),
                cache_creation_input_tokens: Some(12),
                accumulated_total: Some(300),
                accumulated_input: Some(180),
                accumulated_output: Some(120),
            },
        )
        .await
        .expect("更新 token 统计失败");
    store
        .update_provider_config(
            &session.id,
            Some("openai".to_string()),
            Some(ModelConfig::new("gpt-4.1").expect("model config")),
        )
        .await
        .expect("更新 provider 配置失败");
    store
        .update_recipe(
            &session.id,
            Some(Recipe {
                version: "1.0.0".to_string(),
                title: "demo".to_string(),
                description: "demo recipe".to_string(),
                instructions: None,
                prompt: None,
                extensions: None,
                settings: None,
                activities: None,
                author: None,
                parameters: None,
                response: None,
                sub_recipes: None,
                retry: None,
            }),
            Some(HashMap::from([(
                "temperature".to_string(),
                "0.2".to_string(),
            )])),
        )
        .await
        .expect("更新 recipe 失败");

    let loaded = store
        .get_session(&session.id, false)
        .await
        .expect("读取会话失败");

    assert_eq!(loaded.name, "已命名会话");
    assert!(loaded.user_set_name);
    assert_eq!(
        loaded.working_dir,
        PathBuf::from("/tmp/lime-worktree-child")
    );
    assert_eq!(loaded.session_type, SessionType::Hidden);
    assert_eq!(loaded.total_tokens, Some(100));
    assert_eq!(loaded.cached_input_tokens, Some(24));
    assert_eq!(loaded.cache_creation_input_tokens, Some(12));
    assert_eq!(loaded.accumulated_total_tokens, Some(300));
    assert_eq!(loaded.schedule_id.as_deref(), Some("job-1"));
    assert_eq!(loaded.provider_name.as_deref(), Some("openai"));
    assert_eq!(
        loaded
            .model_config
            .as_ref()
            .map(|config| config.model_name.as_str()),
        Some("gpt-4.1")
    );
    assert_eq!(
        loaded
            .extension_data
            .get_extension_state("todo", "v0")
            .cloned(),
        extension_data.get_extension_state("todo", "v0").cloned()
    );
    assert_eq!(
        loaded.recipe.as_ref().map(|recipe| recipe.title.as_str()),
        Some("demo")
    );
    assert_eq!(
        loaded
            .user_recipe_values
            .as_ref()
            .and_then(|values| values.get("temperature"))
            .map(String::as_str),
        Some("0.2")
    );
}

#[tokio::test]
async fn update_provider_config_should_keep_existing_values_when_input_is_none() {
    let store = setup_test_store();
    let session = store
        .create_session(
            PathBuf::from("."),
            "provider 守卫测试".to_string(),
            SessionType::User,
        )
        .await
        .expect("创建会话失败");

    store
        .update_provider_config(
            &session.id,
            Some("openai".to_string()),
            Some(ModelConfig::new("gpt-4.1").expect("model config")),
        )
        .await
        .expect("初始化 provider 配置失败");

    store
        .update_provider_config(&session.id, None, None)
        .await
        .expect("更新空 provider 配置失败");

    let loaded = store
        .get_session(&session.id, false)
        .await
        .expect("读取会话失败");

    assert_eq!(loaded.provider_name.as_deref(), Some("openai"));
    assert_eq!(
        loaded
            .model_config
            .as_ref()
            .map(|config| config.model_name.as_str()),
        Some("gpt-4.1")
    );
}

#[tokio::test]
async fn get_session_should_prefer_current_runtime_conversation_over_agent_messages() {
    let _guard = env_lock().lock().expect("锁测试环境");
    let store = setup_test_store();
    let runtime_store = require_shared_session_runtime_store().expect("读取 runtime store 失败");
    let session_id = format!("runtime-conversation-{}", uuid::Uuid::new_v4());
    let session = store
        .create_session(
            PathBuf::from("."),
            "runtime conversation 优先测试".to_string(),
            SessionType::User,
        )
        .await
        .expect("创建会话失败");
    {
        let conn = store.db.lock().expect("锁数据库");
        conn.execute(
            "UPDATE agent_sessions SET id = ?1 WHERE id = ?2",
            rusqlite::params![session_id, session.id],
        )
        .expect("更新测试 session id 失败");
        insert_legacy_agent_message_fixture(
            &conn,
            &session_id,
            "user",
            &Message::user().with_text("旧表消息"),
        );
    }

    let thread = runtime_store
        .upsert_thread(ThreadRuntime::new(
            format!("thread-{session_id}"),
            session_id.clone(),
            PathBuf::from("."),
        ))
        .await
        .expect("写入 thread runtime 失败");
    let turn = runtime_store
        .create_turn(TurnRuntime::new(
            format!("turn-{session_id}"),
            session_id.clone(),
            thread.id.clone(),
            Some("current 用户消息".to_string()),
            None,
        ))
        .await
        .expect("写入 turn runtime 失败");
    let now = Utc::now();
    runtime_store
        .create_item(ItemRuntime {
            id: format!("item-user-{session_id}"),
            thread_id: thread.id.clone(),
            turn_id: turn.id.clone(),
            sequence: 1,
            status: ItemStatus::Completed,
            started_at: now,
            completed_at: Some(now),
            updated_at: now,
            payload: ItemRuntimePayload::UserMessage {
                content: "current 用户消息".to_string(),
            },
        })
        .await
        .expect("写入 user item 失败");
    runtime_store
        .create_item(ItemRuntime {
            id: format!("item-agent-{session_id}"),
            thread_id: thread.id,
            turn_id: turn.id,
            sequence: 2,
            status: ItemStatus::Completed,
            started_at: now,
            completed_at: Some(now),
            updated_at: now,
            payload: ItemRuntimePayload::AgentMessage {
                text: "current 助手回复".to_string(),
            },
        })
        .await
        .expect("写入 agent item 失败");

    let loaded = store
        .get_session(&session_id, true)
        .await
        .expect("读取会话失败");
    let conversation = loaded.conversation.expect("应包含 conversation");
    let texts = conversation
        .messages()
        .iter()
        .map(Message::as_concat_text)
        .collect::<Vec<_>>();

    assert_eq!(texts, vec!["current 用户消息", "current 助手回复"]);
    assert_eq!(loaded.message_count, 2);
}

#[tokio::test]
async fn get_session_should_import_legacy_agent_messages_into_runtime_store() {
    let _guard = env_lock().lock().expect("锁测试环境");
    let store = setup_test_store();
    let runtime_store = require_shared_session_runtime_store().expect("读取 runtime store 失败");
    let session_id = format!("legacy-import-{}", uuid::Uuid::new_v4());
    let session = store
        .create_session(
            PathBuf::from("."),
            "legacy import 测试".to_string(),
            SessionType::User,
        )
        .await
        .expect("创建会话失败");
    {
        let conn = store.db.lock().expect("锁数据库");
        conn.execute(
            "UPDATE agent_sessions SET id = ?1 WHERE id = ?2",
            rusqlite::params![session_id, session.id],
        )
        .expect("更新测试 session id 失败");
        insert_legacy_agent_message_fixture(
            &conn,
            &session_id,
            "user",
            &Message::user().with_text("旧用户消息"),
        );
        insert_legacy_agent_message_fixture(
            &conn,
            &session_id,
            "assistant",
            &Message::assistant().with_text("旧助手回复"),
        );
    }

    let loaded = store
        .get_session(&session_id, true)
        .await
        .expect("读取会话失败");
    let conversation = loaded.conversation.expect("应包含迁移后 conversation");
    let texts = conversation
        .messages()
        .iter()
        .map(Message::as_concat_text)
        .collect::<Vec<_>>();

    assert_eq!(texts, vec!["旧用户消息", "旧助手回复"]);
    assert_eq!(loaded.message_count, 2);

    let threads = runtime_store
        .list_threads(&session_id)
        .await
        .expect("读取 runtime threads 失败");
    let mut transcript_items = 0usize;
    for thread in threads {
        for item in runtime_store
            .list_items(&thread.id)
            .await
            .expect("读取 runtime items 失败")
        {
            if matches!(item.payload, ItemRuntimePayload::TranscriptMessage { .. }) {
                transcript_items += 1;
            }
        }
    }
    assert_eq!(transcript_items, 2);
}

#[tokio::test]
async fn metadata_cache_should_refresh_after_add_message() {
    let store = setup_test_store();
    let session = store
        .create_session(
            PathBuf::from("."),
            "缓存消息计数测试".to_string(),
            SessionType::User,
        )
        .await
        .expect("创建会话失败");

    let cached = store
        .get_session(&session.id, false)
        .await
        .expect("预热缓存失败");
    assert_eq!(cached.message_count, 0);

    store
        .add_message(&session.id, &Message::user().with_text("hello"))
        .await
        .expect("追加消息失败");

    let refreshed = store
        .get_session(&session.id, false)
        .await
        .expect("读取缓存会话失败");
    assert_eq!(refreshed.message_count, 1);

    let loaded = store
        .get_session(&session.id, true)
        .await
        .expect("读取 runtime 对话失败");
    let conversation = loaded.conversation.expect("应包含对话");
    assert_eq!(conversation.messages()[0].as_concat_text(), "hello");

    let conn = store.db.lock().expect("锁数据库");
    let legacy_count: i64 = if conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'agent_messages'",
            [],
            |_| Ok(()),
        )
        .is_ok()
    {
        conn.query_row(
            "SELECT COUNT(*) FROM agent_messages WHERE session_id = ?",
            [session.id.as_str()],
            |row| row.get(0),
        )
        .expect("查询旧消息数失败")
    } else {
        0
    };
    assert_eq!(legacy_count, 0);
}

#[tokio::test]
async fn list_sessions_by_types_should_query_only_requested_types() {
    let store = setup_test_store();
    let user_session = store
        .create_session(
            PathBuf::from("."),
            "用户会话".to_string(),
            SessionType::User,
        )
        .await
        .expect("创建用户会话失败");
    let subagent_session = store
        .create_session(
            PathBuf::from("."),
            "子代理会话".to_string(),
            SessionType::SubAgent,
        )
        .await
        .expect("创建子代理会话失败");

    store
        .add_message(&user_session.id, &Message::user().with_text("user only"))
        .await
        .expect("追加用户消息失败");
    store
        .add_message(
            &subagent_session.id,
            &Message::assistant().with_text("subagent only"),
        )
        .await
        .expect("追加子代理消息失败");

    let sessions = store
        .list_sessions_by_types(&[SessionType::SubAgent])
        .await
        .expect("按类型列出会话失败");

    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].id, subagent_session.id);
    assert_eq!(sessions[0].session_type, SessionType::SubAgent);
    assert_eq!(sessions[0].message_count, 1);
}

#[tokio::test]
async fn persisted_conversation_should_roundtrip_agent_only_visibility() {
    let store = setup_test_store();
    let session = store
        .create_session(
            PathBuf::from("."),
            "可见性回写测试".to_string(),
            SessionType::User,
        )
        .await
        .expect("创建会话失败");

    store
        .replace_conversation(
            &session.id,
            &Conversation::new_unvalidated(vec![
                Message::user().with_text("用户可见"),
                Message::user().with_text("仅供智能体续跑").agent_only(),
            ]),
        )
        .await
        .expect("替换对话失败");

    let loaded = store
        .get_session(&session.id, true)
        .await
        .expect("读取会话失败");
    let conversation = loaded.conversation.expect("应包含对话");
    let messages = conversation.messages();

    assert_eq!(messages.len(), 2);
    assert!(messages[0].is_user_visible());
    assert!(!messages[1].is_user_visible());
    assert!(messages[1].is_agent_visible());
    assert_eq!(messages[1].as_concat_text(), "仅供智能体续跑");
}

#[tokio::test]
async fn metadata_cache_should_refresh_after_provider_update() {
    let store = setup_test_store();
    let session = store
        .create_session(
            PathBuf::from("."),
            "缓存 provider 测试".to_string(),
            SessionType::User,
        )
        .await
        .expect("创建会话失败");

    store
        .get_session(&session.id, false)
        .await
        .expect("预热缓存失败");

    store
        .update_provider_config(
            &session.id,
            Some("openai".to_string()),
            Some(ModelConfig::new("gpt-4.1").expect("model config")),
        )
        .await
        .expect("更新 provider 配置失败");

    let refreshed = store
        .get_session(&session.id, false)
        .await
        .expect("读取缓存会话失败");
    assert_eq!(refreshed.provider_name.as_deref(), Some("openai"));
    assert_eq!(
        refreshed
            .model_config
            .as_ref()
            .map(|config| config.model_name.as_str()),
        Some("gpt-4.1")
    );
}

#[tokio::test]
async fn update_recipe_should_clear_existing_values_when_input_is_none() {
    let store = setup_test_store();
    let session = store
        .create_session(
            PathBuf::from("."),
            "recipe 清空测试".to_string(),
            SessionType::User,
        )
        .await
        .expect("创建会话失败");

    store
        .update_recipe(
            &session.id,
            Some(Recipe {
                version: "1.0.0".to_string(),
                title: "demo".to_string(),
                description: "demo recipe".to_string(),
                instructions: None,
                prompt: None,
                extensions: None,
                settings: None,
                activities: None,
                author: None,
                parameters: None,
                response: None,
                sub_recipes: None,
                retry: None,
            }),
            Some(HashMap::from([(
                "temperature".to_string(),
                "0.2".to_string(),
            )])),
        )
        .await
        .expect("初始化 recipe 失败");

    store
        .update_recipe(&session.id, None, None)
        .await
        .expect("清空 recipe 失败");

    let loaded = store
        .get_session(&session.id, false)
        .await
        .expect("读取会话失败");

    assert!(loaded.recipe.is_none());
    assert!(loaded.user_recipe_values.is_none());
}

#[tokio::test]
async fn update_token_stats_should_keep_existing_values_when_fields_are_none() {
    let store = setup_test_store();
    let session = store
        .create_session(
            PathBuf::from("."),
            "token 守卫测试".to_string(),
            SessionType::User,
        )
        .await
        .expect("创建会话失败");

    store
        .update_token_stats(
            &session.id,
            TokenStatsUpdate {
                schedule_id: Some("job-1".to_string()),
                total_tokens: Some(100),
                input_tokens: Some(60),
                output_tokens: Some(40),
                cached_input_tokens: Some(24),
                cache_creation_input_tokens: Some(12),
                accumulated_total: Some(300),
                accumulated_input: Some(180),
                accumulated_output: Some(120),
            },
        )
        .await
        .expect("初始化 token 统计失败");

    store
        .update_token_stats(
            &session.id,
            TokenStatsUpdate {
                schedule_id: None,
                total_tokens: None,
                input_tokens: None,
                output_tokens: None,
                cached_input_tokens: None,
                cache_creation_input_tokens: None,
                accumulated_total: None,
                accumulated_input: None,
                accumulated_output: None,
            },
        )
        .await
        .expect("更新空 token 统计失败");

    let loaded = store
        .get_session(&session.id, false)
        .await
        .expect("读取会话失败");

    assert_eq!(loaded.schedule_id.as_deref(), Some("job-1"));
    assert_eq!(loaded.total_tokens, Some(100));
    assert_eq!(loaded.input_tokens, Some(60));
    assert_eq!(loaded.output_tokens, Some(40));
    assert_eq!(loaded.cached_input_tokens, Some(24));
    assert_eq!(loaded.cache_creation_input_tokens, Some(12));
    assert_eq!(loaded.accumulated_total_tokens, Some(300));
    assert_eq!(loaded.accumulated_input_tokens, Some(180));
    assert_eq!(loaded.accumulated_output_tokens, Some(120));
}

#[tokio::test]
async fn update_token_stats_should_overwrite_current_window_with_explicit_zero() {
    let store = setup_test_store();
    let session = store
        .create_session(
            PathBuf::from("."),
            "token 清零测试".to_string(),
            SessionType::User,
        )
        .await
        .expect("创建会话失败");

    store
        .update_token_stats(
            &session.id,
            TokenStatsUpdate {
                schedule_id: Some("job-1".to_string()),
                total_tokens: Some(100),
                input_tokens: Some(60),
                output_tokens: Some(40),
                cached_input_tokens: Some(24),
                cache_creation_input_tokens: Some(12),
                accumulated_total: Some(300),
                accumulated_input: Some(180),
                accumulated_output: Some(120),
            },
        )
        .await
        .expect("初始化 token 统计失败");

    store
        .update_token_stats(
            &session.id,
            TokenStatsUpdate {
                schedule_id: None,
                total_tokens: Some(0),
                input_tokens: Some(0),
                output_tokens: Some(0),
                cached_input_tokens: Some(0),
                cache_creation_input_tokens: Some(0),
                accumulated_total: None,
                accumulated_input: None,
                accumulated_output: None,
            },
        )
        .await
        .expect("清零当前窗口 token 失败");

    let loaded = store
        .get_session(&session.id, false)
        .await
        .expect("读取会话失败");

    assert_eq!(loaded.schedule_id.as_deref(), Some("job-1"));
    assert_eq!(loaded.total_tokens, Some(0));
    assert_eq!(loaded.input_tokens, Some(0));
    assert_eq!(loaded.output_tokens, Some(0));
    assert_eq!(loaded.cached_input_tokens, Some(0));
    assert_eq!(loaded.cache_creation_input_tokens, Some(0));
    assert_eq!(loaded.accumulated_total_tokens, Some(300));
    assert_eq!(loaded.accumulated_input_tokens, Some(180));
    assert_eq!(loaded.accumulated_output_tokens, Some(120));
}
