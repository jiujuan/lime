//! Aster SessionStore trait 适配实现。
//!
//! 主文件只保留 LimeSessionStore 结构和共享接线；Aster trait 方法集中在这里。

use super::{
    history_search, legacy_conversation, memory_stub, runtime_conversation, session_projection,
    LimeSessionStore,
};
use anyhow::{anyhow, Result};
use aster::conversation::message::Message;
use aster::conversation::Conversation;
use aster::model::ModelConfig;
use aster::recipe::Recipe;
use aster::session::extension_data::ExtensionData;
use aster::session::{
    ChatHistoryMatch, CommitOptions, CommitReport, MemoryCategory, MemoryHealth, MemoryRecord,
    MemorySearchResult, MemoryStats, Session, SessionInsights, SessionStore, SessionType,
    TokenStatsUpdate,
};
use async_trait::async_trait;
use chrono::Utc;
use std::collections::HashMap;
use std::path::PathBuf;
use thread_store::session_record::{
    normalize_optional_text, parse_optional_json, parse_timestamp_or_now, resolve_session_type_name,
};

#[async_trait]
impl SessionStore for LimeSessionStore {
    async fn create_session(
        &self,
        working_dir: PathBuf,
        name: String,
        session_type: SessionType,
    ) -> Result<Session> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now();
        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        Self::insert_session_row(&conn, &id, &name, &working_dir, session_type)?;

        let session = Session {
            id,
            working_dir,
            name,
            user_set_name: false,
            session_type,
            created_at: now,
            updated_at: now,
            extension_data: ExtensionData::default(),
            total_tokens: None,
            input_tokens: None,
            output_tokens: None,
            cached_input_tokens: None,
            cache_creation_input_tokens: None,
            accumulated_total_tokens: None,
            accumulated_input_tokens: None,
            accumulated_output_tokens: None,
            schedule_id: None,
            recipe: None,
            user_recipe_values: None,
            conversation: Some(Conversation::default()),
            message_count: 0,
            provider_name: None,
            model_config: None,
        };
        self.cache_session_metadata(&session);

        Ok(session)
    }

    async fn get_session(&self, id: &str, include_messages: bool) -> Result<Session> {
        if !include_messages {
            if let Some(cached) = self.cached_session_metadata(id) {
                tracing::debug!(
                    "[SessionStore] get_session 命中 metadata cache: id={}, include_messages={}",
                    id,
                    include_messages
                );
                return Ok(cached);
            }
        }

        tracing::debug!(
            "[SessionStore] get_session 读取数据库: id={}, include_messages={}",
            id,
            include_messages
        );

        let (
            id,
            model,
            title,
            created_at,
            updated_at,
            working_dir,
            session_type,
            user_set_name,
            extension_data_json,
            total_tokens,
            input_tokens,
            output_tokens,
            cached_input_tokens,
            cache_creation_input_tokens,
            accumulated_total_tokens,
            accumulated_input_tokens,
            accumulated_output_tokens,
            schedule_id,
            recipe_json,
            user_recipe_values_json,
            provider_name,
            model_config_json,
        ) = {
            let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
            Self::ensure_session_row(&conn, id)?;
            tracing::debug!("[SessionStore] get_session 已确保会话存在: {}", id);

            let mut stmt = conn
                .prepare(
                    "SELECT id, model, system_prompt, title, created_at, updated_at, working_dir,
                            session_type, user_set_name, extension_data_json,
                            total_tokens, input_tokens, output_tokens, cached_input_tokens, cache_creation_input_tokens,
                            accumulated_total_tokens, accumulated_input_tokens, accumulated_output_tokens,
                            schedule_id, recipe_json, user_recipe_values_json,
                            provider_name, model_config_json
                     FROM agent_sessions WHERE id = ?",
                )
                .map_err(|e| anyhow!("准备查询失败: {e}"))?;

            let session_row = stmt
                .query_row([id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<String>>(7)?,
                        row.get::<_, bool>(8)?,
                        row.get::<_, String>(9)?,
                        row.get::<_, Option<i32>>(10)?,
                        row.get::<_, Option<i32>>(11)?,
                        row.get::<_, Option<i32>>(12)?,
                        row.get::<_, Option<i32>>(13)?,
                        row.get::<_, Option<i32>>(14)?,
                        row.get::<_, Option<i32>>(15)?,
                        row.get::<_, Option<i32>>(16)?,
                        row.get::<_, Option<i32>>(17)?,
                        row.get::<_, Option<String>>(18)?,
                        row.get::<_, Option<String>>(19)?,
                        row.get::<_, Option<String>>(20)?,
                        row.get::<_, Option<String>>(21)?,
                        row.get::<_, Option<String>>(22)?,
                    ))
                })
                .map_err(|e| anyhow!("会话不存在: {e}"))?;

            let (
                id,
                model,
                _system_prompt,
                title,
                created_at,
                updated_at,
                db_working_dir,
                session_type_raw,
                user_set_name,
                extension_data_json,
                total_tokens,
                input_tokens,
                output_tokens,
                cached_input_tokens,
                cache_creation_input_tokens,
                accumulated_total_tokens,
                accumulated_input_tokens,
                accumulated_output_tokens,
                schedule_id,
                recipe_json,
                user_recipe_values_json,
                provider_name,
                model_config_json,
            ) = session_row;
            let created_at = parse_timestamp_or_now(&created_at);
            let updated_at = parse_timestamp_or_now(&updated_at);
            let session_type = resolve_session_type_name(session_type_raw, &model)
                .parse::<SessionType>()
                .unwrap_or(SessionType::User);
            let working_dir = session_projection::parse_session_working_dir(&conn, db_working_dir);

            (
                id,
                model,
                title,
                created_at,
                updated_at,
                working_dir,
                session_type,
                user_set_name,
                extension_data_json,
                total_tokens,
                input_tokens,
                output_tokens,
                cached_input_tokens,
                cache_creation_input_tokens,
                accumulated_total_tokens,
                accumulated_input_tokens,
                accumulated_output_tokens,
                schedule_id,
                recipe_json,
                user_recipe_values_json,
                provider_name,
                model_config_json,
            )
        };

        let mut runtime_message_count = match runtime_conversation::count_runtime_messages(&id)
            .await
        {
            Ok(count) => count,
            Err(error) => {
                tracing::warn!(
                    "[SessionStore] current runtime message count 读取失败，返回 metadata legacy count: session_id={}, error={}",
                    id,
                    error
                );
                None
            }
        };

        let conversation = if include_messages {
            let mut runtime_conversation = match runtime_conversation::load_runtime_conversation(
                &id,
            )
            .await
            {
                Ok(conversation) => conversation,
                Err(error) => {
                    tracing::warn!(
                        "[SessionStore] current runtime conversation 读取失败，不再回退 agent_messages 产品读路径: session_id={}, error={}",
                        id,
                        error
                    );
                    None
                }
            };

            if runtime_conversation.is_none() {
                let legacy_conversation = {
                    let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
                    legacy_conversation::load_for_migration(&conn, &id)?
                };
                if !legacy_conversation.is_empty() {
                    match runtime_conversation::import_legacy_conversation_if_runtime_empty(
                        &id,
                        &working_dir,
                        &legacy_conversation,
                    )
                    .await
                    {
                        Ok(Some(count)) => {
                            runtime_message_count = Some(count);
                            runtime_conversation =
                                runtime_conversation::load_runtime_conversation(&id).await?;
                        }
                        Ok(None) => {
                            runtime_conversation =
                                runtime_conversation::load_runtime_conversation(&id).await?;
                            runtime_message_count =
                                runtime_conversation.as_ref().map(Conversation::len);
                        }
                        Err(error) => {
                            tracing::warn!(
                                "[SessionStore] legacy agent_messages 迁入 current runtime 失败，不作为产品读回 fallback: session_id={}, error={}",
                                id,
                                error
                            );
                        }
                    }
                }
            }

            runtime_conversation
        } else {
            None
        };

        let message_count = conversation
            .as_ref()
            .map(Conversation::len)
            .or(runtime_message_count)
            .unwrap_or(0);

        let session = Session {
            id: id.to_string(),
            working_dir,
            name: title.unwrap_or_else(|| "未命名会话".to_string()),
            user_set_name,
            session_type,
            created_at,
            updated_at,
            extension_data: serde_json::from_str(&extension_data_json).unwrap_or_default(),
            total_tokens,
            input_tokens,
            output_tokens,
            cached_input_tokens,
            cache_creation_input_tokens,
            accumulated_total_tokens,
            accumulated_input_tokens,
            accumulated_output_tokens,
            schedule_id,
            recipe: parse_optional_json(recipe_json),
            user_recipe_values: parse_optional_json(user_recipe_values_json),
            conversation,
            message_count,
            provider_name,
            model_config: parse_optional_json(model_config_json).or_else(|| match model.trim() {
                "" | "agent:default" => None,
                normalized => ModelConfig::new(normalized).ok(),
            }),
        };
        self.cache_session_metadata(&session);

        Ok(session)
    }

    async fn add_message(&self, session_id: &str, message: &Message) -> Result<()> {
        tracing::debug!(
            "[SessionStore] add_message 被调用: session_id={}",
            session_id
        );

        let timestamp = Utc::now().to_rfc3339();
        let working_dir = {
            let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
            Self::ensure_session_row(&conn, session_id)?;
            Self::load_session_working_dir(&conn, session_id)?
        };
        let updated_count =
            runtime_conversation::append_runtime_message(session_id, &working_dir, message).await?;

        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        Self::ensure_session_row(&conn, session_id)?;

        conn.execute(
            "UPDATE agent_sessions SET updated_at = ? WHERE id = ?",
            rusqlite::params![timestamp, session_id],
        )
        .map_err(|e| anyhow!("更新会话时间失败: {e}"))?;

        let updated_at = parse_timestamp_or_now(&timestamp);
        self.update_cached_session_metadata(session_id, |session| {
            session.updated_at = updated_at;
            session.working_dir = working_dir;
            session.message_count = updated_count;
        });

        Ok(())
    }

    async fn replace_conversation(
        &self,
        session_id: &str,
        conversation: &Conversation,
    ) -> Result<()> {
        let now = Utc::now().to_rfc3339();
        let working_dir = {
            let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
            Self::ensure_session_row(&conn, session_id)?;
            Self::load_session_working_dir(&conn, session_id)?
        };
        let message_count = runtime_conversation::replace_runtime_conversation(
            session_id,
            &working_dir,
            conversation,
        )
        .await?;

        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        conn.execute(
            "UPDATE agent_sessions SET updated_at = ? WHERE id = ?",
            rusqlite::params![now, session_id],
        )?;

        let updated_at = parse_timestamp_or_now(&now);
        self.update_cached_session_metadata(session_id, |session| {
            session.updated_at = updated_at;
            session.working_dir = working_dir;
            session.message_count = message_count;
        });

        Ok(())
    }

    async fn list_sessions(&self) -> Result<Vec<Session>> {
        let mut sessions: Vec<Session> = {
            let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
            session_projection::load_listed_sessions(
                &conn,
                "SELECT id, model, title, created_at, updated_at, working_dir,
                    session_type, user_set_name, extension_data_json,
                    total_tokens, input_tokens, output_tokens, cached_input_tokens, cache_creation_input_tokens,
                    accumulated_total_tokens, accumulated_input_tokens, accumulated_output_tokens,
                    schedule_id, recipe_json, user_recipe_values_json,
                    provider_name, model_config_json,
                    0 AS message_count
             FROM agent_sessions
             ORDER BY updated_at DESC",
                [],
            )?
            .into_iter()
            .map(|row| session_projection::build_session_from_listing_row(&conn, row))
            .collect()
        };
        self.apply_runtime_message_counts(&mut sessions).await;
        Ok(sessions)
    }

    async fn list_sessions_by_types(&self, types: &[SessionType]) -> Result<Vec<Session>> {
        if types.is_empty() {
            return Ok(Vec::new());
        }

        let type_names = types.iter().map(ToString::to_string).collect::<Vec<_>>();
        let placeholders = std::iter::repeat_n("?", type_names.len())
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
                "SELECT id, model, title, created_at, updated_at, working_dir,
                    session_type, user_set_name, extension_data_json,
                    total_tokens, input_tokens, output_tokens, cached_input_tokens, cache_creation_input_tokens,
                    accumulated_total_tokens, accumulated_input_tokens, accumulated_output_tokens,
                    schedule_id, recipe_json, user_recipe_values_json,
                    provider_name, model_config_json,
                    0 AS message_count
             FROM agent_sessions
             WHERE session_type IN ({placeholders})
             ORDER BY updated_at DESC"
        );
        let mut sessions: Vec<Session> = {
            let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
            session_projection::load_listed_sessions(
                &conn,
                &sql,
                rusqlite::params_from_iter(type_names.iter()),
            )?
            .into_iter()
            .map(|row| session_projection::build_session_from_listing_row(&conn, row))
            .collect::<Vec<_>>()
        };
        self.apply_runtime_message_counts(&mut sessions).await;
        Ok(sessions)
    }

    async fn delete_session(&self, id: &str) -> Result<()> {
        {
            let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
            conn.execute("DELETE FROM agent_sessions WHERE id = ?", [id])?;
        }
        self.invalidate_cached_session_metadata(id);

        Ok(())
    }

    async fn get_insights(&self) -> Result<SessionInsights> {
        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;

        let total_sessions: i64 =
            conn.query_row("SELECT COUNT(*) FROM agent_sessions", [], |row| row.get(0))?;
        let total_tokens: i64 = conn.query_row(
            "SELECT COALESCE(SUM(COALESCE(accumulated_total_tokens, total_tokens, 0)), 0)
             FROM agent_sessions",
            [],
            |row| row.get(0),
        )?;

        Ok(SessionInsights {
            total_sessions: total_sessions as usize,
            total_tokens,
        })
    }

    async fn export_session(&self, id: &str) -> Result<String> {
        let session = self.get_session(id, true).await?;
        serde_json::to_string_pretty(&session).map_err(|e| anyhow!("导出会话失败: {e}"))
    }

    async fn import_session(&self, json: &str) -> Result<Session> {
        let session: Session =
            serde_json::from_str(json).map_err(|e| anyhow!("解析会话 JSON 失败: {e}"))?;

        let new_session = self
            .create_session(
                session.working_dir.clone(),
                session.name.clone(),
                session.session_type,
            )
            .await?;

        self.update_session_name(&new_session.id, session.name.clone(), session.user_set_name)
            .await?;
        self.update_extension_data(&new_session.id, session.extension_data.clone())
            .await?;
        self.update_token_stats(
            &new_session.id,
            TokenStatsUpdate {
                schedule_id: session.schedule_id.clone(),
                total_tokens: session.total_tokens,
                input_tokens: session.input_tokens,
                output_tokens: session.output_tokens,
                cached_input_tokens: session.cached_input_tokens,
                cache_creation_input_tokens: session.cache_creation_input_tokens,
                accumulated_total: session.accumulated_total_tokens,
                accumulated_input: session.accumulated_input_tokens,
                accumulated_output: session.accumulated_output_tokens,
            },
        )
        .await?;
        self.update_provider_config(
            &new_session.id,
            session.provider_name.clone(),
            session.model_config.clone(),
        )
        .await?;
        self.update_recipe(
            &new_session.id,
            session.recipe.clone(),
            session.user_recipe_values.clone(),
        )
        .await?;

        if let Some(conversation) = &session.conversation {
            self.replace_conversation(&new_session.id, conversation)
                .await?;
        }

        Ok(new_session)
    }

    async fn copy_session(&self, session_id: &str, new_name: String) -> Result<Session> {
        let original = self.get_session(session_id, true).await?;
        let created_session_name = new_name.clone();
        let persisted_session_name = new_name.clone();

        let new_session = self
            .create_session(
                original.working_dir.clone(),
                created_session_name,
                original.session_type,
            )
            .await?;

        self.update_session_name(&new_session.id, persisted_session_name, true)
            .await?;
        self.update_extension_data(&new_session.id, original.extension_data.clone())
            .await?;
        self.update_token_stats(
            &new_session.id,
            TokenStatsUpdate {
                schedule_id: original.schedule_id.clone(),
                total_tokens: original.total_tokens,
                input_tokens: original.input_tokens,
                output_tokens: original.output_tokens,
                cached_input_tokens: original.cached_input_tokens,
                cache_creation_input_tokens: original.cache_creation_input_tokens,
                accumulated_total: original.accumulated_total_tokens,
                accumulated_input: original.accumulated_input_tokens,
                accumulated_output: original.accumulated_output_tokens,
            },
        )
        .await?;
        self.update_provider_config(
            &new_session.id,
            original.provider_name.clone(),
            original.model_config.clone(),
        )
        .await?;
        self.update_recipe(
            &new_session.id,
            original.recipe.clone(),
            original.user_recipe_values.clone(),
        )
        .await?;

        if let Some(conversation) = &original.conversation {
            self.replace_conversation(&new_session.id, conversation)
                .await?;
        }

        Ok(new_session)
    }

    async fn truncate_conversation(&self, session_id: &str, timestamp: i64) -> Result<()> {
        let working_dir = {
            let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
            Self::ensure_session_row(&conn, session_id)?;
            Self::load_session_working_dir(&conn, session_id)?
        };
        let message_count = runtime_conversation::truncate_runtime_conversation(
            session_id,
            &working_dir,
            timestamp,
        )
        .await?;
        self.update_cached_session_metadata(session_id, |session| {
            session.message_count = message_count;
            session.working_dir = working_dir;
        });

        Ok(())
    }

    async fn update_session_name(
        &self,
        session_id: &str,
        name: String,
        user_set: bool,
    ) -> Result<()> {
        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        let now = Utc::now().to_rfc3339();
        let cached_name = name.clone();
        conn.execute(
            "UPDATE agent_sessions SET title = ?1, user_set_name = ?2, updated_at = ?3 WHERE id = ?4",
            rusqlite::params![name, user_set, now, session_id],
        )?;
        let updated_at = parse_timestamp_or_now(&now);
        self.update_cached_session_metadata(session_id, |session| {
            session.name = cached_name;
            session.user_set_name = user_set;
            session.updated_at = updated_at;
        });
        Ok(())
    }

    async fn update_working_dir(&self, session_id: &str, working_dir: PathBuf) -> Result<()> {
        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        let now = Utc::now().to_rfc3339();
        let cached_working_dir = working_dir.clone();
        conn.execute(
            "UPDATE agent_sessions SET working_dir = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![working_dir.to_string_lossy().to_string(), now, session_id],
        )?;
        let updated_at = parse_timestamp_or_now(&now);
        self.update_cached_session_metadata(session_id, |session| {
            session.working_dir = cached_working_dir;
            session.updated_at = updated_at;
        });
        Ok(())
    }

    async fn update_session_type(&self, session_id: &str, session_type: SessionType) -> Result<()> {
        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE agent_sessions SET session_type = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![session_type.to_string(), now, session_id],
        )?;
        let updated_at = parse_timestamp_or_now(&now);
        self.update_cached_session_metadata(session_id, |session| {
            session.session_type = session_type;
            session.updated_at = updated_at;
        });
        Ok(())
    }

    async fn update_extension_data(
        &self,
        session_id: &str,
        extension_data: ExtensionData,
    ) -> Result<()> {
        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        let now = Utc::now().to_rfc3339();
        let cached_extension_data = extension_data.clone();
        let extension_data_json = serde_json::to_string(&extension_data)
            .map_err(|e| anyhow!("序列化 extension_data 失败: {e}"))?;
        conn.execute(
            "UPDATE agent_sessions SET extension_data_json = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![extension_data_json, now, session_id],
        )?;
        let updated_at = parse_timestamp_or_now(&now);
        self.update_cached_session_metadata(session_id, |session| {
            session.extension_data = cached_extension_data;
            session.updated_at = updated_at;
        });
        Ok(())
    }

    async fn update_token_stats(&self, session_id: &str, stats: TokenStatsUpdate) -> Result<()> {
        let normalized_schedule_id = normalize_optional_text(stats.schedule_id.clone());
        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        let now = Utc::now().to_rfc3339();
        // 当前 store 边界把 None 视为“跳过更新”，不是“清空字段”。
        // 调用方若要重置当前窗口 token，必须显式写 Some(0)；schedule_id 也不能靠 None/空串清空。
        conn.execute(
            "UPDATE agent_sessions SET
                total_tokens = COALESCE(?1, total_tokens),
                input_tokens = COALESCE(?2, input_tokens),
                output_tokens = COALESCE(?3, output_tokens),
                cached_input_tokens = COALESCE(?4, cached_input_tokens),
                cache_creation_input_tokens = COALESCE(?5, cache_creation_input_tokens),
                accumulated_total_tokens = COALESCE(?6, accumulated_total_tokens),
                accumulated_input_tokens = COALESCE(?7, accumulated_input_tokens),
                accumulated_output_tokens = COALESCE(?8, accumulated_output_tokens),
                schedule_id = COALESCE(?9, schedule_id),
                updated_at = ?10
             WHERE id = ?11",
            rusqlite::params![
                stats.total_tokens,
                stats.input_tokens,
                stats.output_tokens,
                stats.cached_input_tokens,
                stats.cache_creation_input_tokens,
                stats.accumulated_total,
                stats.accumulated_input,
                stats.accumulated_output,
                normalized_schedule_id.clone(),
                now,
                session_id,
            ],
        )?;
        let updated_at = parse_timestamp_or_now(&now);
        self.update_cached_session_metadata(session_id, |session| {
            if let Some(total_tokens) = stats.total_tokens {
                session.total_tokens = Some(total_tokens);
            }
            if let Some(input_tokens) = stats.input_tokens {
                session.input_tokens = Some(input_tokens);
            }
            if let Some(output_tokens) = stats.output_tokens {
                session.output_tokens = Some(output_tokens);
            }
            if let Some(cached_input_tokens) = stats.cached_input_tokens {
                session.cached_input_tokens = Some(cached_input_tokens);
            }
            if let Some(cache_creation_input_tokens) = stats.cache_creation_input_tokens {
                session.cache_creation_input_tokens = Some(cache_creation_input_tokens);
            }
            if let Some(accumulated_total) = stats.accumulated_total {
                session.accumulated_total_tokens = Some(accumulated_total);
            }
            if let Some(accumulated_input) = stats.accumulated_input {
                session.accumulated_input_tokens = Some(accumulated_input);
            }
            if let Some(accumulated_output) = stats.accumulated_output {
                session.accumulated_output_tokens = Some(accumulated_output);
            }
            if let Some(schedule_id) = normalized_schedule_id {
                session.schedule_id = Some(schedule_id);
            }
            session.updated_at = updated_at;
        });
        Ok(())
    }

    async fn update_provider_config(
        &self,
        session_id: &str,
        provider_name: Option<String>,
        model_config: Option<ModelConfig>,
    ) -> Result<()> {
        let normalized_provider_name = normalize_optional_text(provider_name);
        let normalized_model_name = model_config
            .as_ref()
            .map(|config| config.model_name.trim().to_string())
            .filter(|value| !value.is_empty());
        let cached_provider_name = normalized_provider_name.clone();
        let cached_model_config = model_config.clone();
        let model_config_json = model_config
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| anyhow!("序列化 model_config 失败: {e}"))?;

        if normalized_provider_name.is_none() && normalized_model_name.is_none() {
            return Ok(());
        }

        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        let now = Utc::now().to_rfc3339();
        // provider/model_config 走“保留旧值”语义，None 不会清空已持久化的 provider 配置。
        conn.execute(
            "UPDATE agent_sessions SET
                provider_name = COALESCE(?1, provider_name),
                model = COALESCE(?2, model),
                model_config_json = CASE WHEN ?3 IS NULL THEN model_config_json ELSE ?3 END,
                updated_at = ?4
             WHERE id = ?5",
            rusqlite::params![
                normalized_provider_name.clone(),
                normalized_model_name,
                model_config_json,
                now,
                session_id,
            ],
        )?;
        let updated_at = parse_timestamp_or_now(&now);
        self.update_cached_session_metadata(session_id, |session| {
            if let Some(provider_name) = cached_provider_name {
                session.provider_name = Some(provider_name);
            }
            if let Some(model_config) = cached_model_config {
                session.model_config = Some(model_config);
            }
            session.updated_at = updated_at;
        });
        Ok(())
    }

    async fn update_recipe(
        &self,
        session_id: &str,
        recipe: Option<Recipe>,
        user_recipe_values: Option<HashMap<String, String>>,
    ) -> Result<()> {
        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        let now = Utc::now().to_rfc3339();
        let cached_recipe = recipe.clone();
        let cached_user_recipe_values = user_recipe_values.clone();
        let recipe_json = recipe
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| anyhow!("序列化 recipe 失败: {e}"))?;
        let user_recipe_values_json = user_recipe_values
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| anyhow!("序列化 user_recipe_values 失败: {e}"))?;
        // recipe 走“直接覆盖”语义，None 会落库为 NULL，用于显式清空旧 recipe。
        conn.execute(
            "UPDATE agent_sessions SET
                recipe_json = ?1,
                user_recipe_values_json = ?2,
                updated_at = ?3
             WHERE id = ?4",
            rusqlite::params![recipe_json, user_recipe_values_json, now, session_id],
        )?;
        let updated_at = parse_timestamp_or_now(&now);
        self.update_cached_session_metadata(session_id, |session| {
            session.recipe = cached_recipe;
            session.user_recipe_values = cached_user_recipe_values;
            session.updated_at = updated_at;
        });
        Ok(())
    }

    async fn search_chat_history(
        &self,
        query: &str,
        limit: Option<usize>,
        _after_date: Option<chrono::DateTime<chrono::Utc>>,
        _before_date: Option<chrono::DateTime<chrono::Utc>>,
        _exclude_session_id: Option<String>,
    ) -> Result<Vec<ChatHistoryMatch>> {
        let limit = limit.unwrap_or(50);
        let sessions = {
            let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
            let rows = session_projection::load_listed_sessions(
                &conn,
                "SELECT id, model, title, created_at, updated_at, working_dir,
                    session_type, user_set_name, extension_data_json,
                    total_tokens, input_tokens, output_tokens, cached_input_tokens, cache_creation_input_tokens,
                    accumulated_total_tokens, accumulated_input_tokens, accumulated_output_tokens,
                    schedule_id, recipe_json, user_recipe_values_json,
                    provider_name, model_config_json,
                    0 AS message_count
             FROM agent_sessions
             ORDER BY updated_at DESC",
                [],
            )?;
            rows.into_iter()
                .map(|row| session_projection::build_session_from_listing_row(&conn, row))
                .collect()
        };

        history_search::search_chat_history(sessions, query, limit).await
    }

    async fn commit_session(&self, id: &str, _options: CommitOptions) -> Result<CommitReport> {
        Ok(memory_stub::commit_session_report(id))
    }

    async fn search_memories(
        &self,
        query: &str,
        limit: Option<usize>,
        session_scope: Option<&str>,
        categories: Option<Vec<MemoryCategory>>,
    ) -> Result<Vec<MemorySearchResult>> {
        Ok(memory_stub::empty_memory_search_results(
            query,
            limit,
            session_scope,
            categories,
        ))
    }

    async fn retrieve_context_memories(
        &self,
        session_id: &str,
        query: &str,
        limit: usize,
    ) -> Result<Vec<MemoryRecord>> {
        Ok(memory_stub::empty_context_memories(
            session_id, query, limit,
        ))
    }

    async fn memory_stats(&self) -> Result<MemoryStats> {
        Ok(memory_stub::memory_stats())
    }

    async fn memory_health(&self) -> Result<MemoryHealth> {
        memory_stub::memory_health()
    }
}
