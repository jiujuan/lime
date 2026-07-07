//! Aster SessionStore trait 适配实现。
//!
//! 主文件只保留 LimeSessionStore 结构和共享接线；Aster trait 方法集中在这里。

use super::{
    history_search, legacy_conversation, runtime_conversation, session_projection, LimeSessionStore,
};
use crate::session_record_sql::{
    load_all_session_record_rows, load_session_insights_record, load_session_record_row_by_id,
    load_session_record_rows_by_types,
};
use anyhow::{anyhow, Result};
use aster::conversation::message::Message;
use aster::conversation::Conversation;
use aster::model::ModelConfig;
use aster::recipe::Recipe;
use aster::session::extension_data::ExtensionData;
use aster::session::{
    ChatHistoryMatch, Session, SessionInsights, SessionStore, SessionType, TokenStatsUpdate,
};
use async_trait::async_trait;
use chrono::Utc;
use lime_core::database::agent_session_repository::{
    delete_session as delete_session_record,
    touch_session_updated_at as touch_session_updated_at_record,
    update_session_extension_data as update_session_extension_data_record,
    update_session_name as update_session_name_record,
    update_session_provider_config as update_session_provider_config_record,
    update_session_recipe as update_session_recipe_record,
    update_session_token_stats as update_session_token_stats_record,
    update_session_type as update_session_type_record,
    update_session_working_dir_with_updated_at as update_session_working_dir_record,
    SessionProviderConfigUpdate, SessionRecipeUpdate, SessionTokenStatsUpdate,
};
use std::collections::HashMap;
use std::path::PathBuf;
use thread_store::session_record::parse_timestamp_or_now;

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

        let mut session = {
            let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
            Self::ensure_session_row(&conn, id)?;
            tracing::debug!("[SessionStore] get_session 已确保会话存在: {}", id);

            let session_row = load_session_record_row_by_id(&conn, id)?
                .ok_or_else(|| anyhow!("会话不存在: {id}"))?;
            session_projection::build_session_from_listing_row(&conn, session_row)
        };
        let id = session.id.clone();
        let working_dir = session.working_dir.clone();

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

        session.conversation = conversation;
        session.message_count = message_count;
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

        touch_session_updated_at_record(&conn, session_id, &timestamp)
            .map_err(|e: String| anyhow!(e))?;

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
        touch_session_updated_at_record(&conn, session_id, &now).map_err(|e: String| anyhow!(e))?;

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
            load_all_session_record_rows(&conn)?
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
        let mut sessions: Vec<Session> = {
            let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
            load_session_record_rows_by_types(&conn, &type_names)?
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
            delete_session_record(&conn, id).map_err(|e: String| anyhow!(e))?;
        }
        self.invalidate_cached_session_metadata(id);

        Ok(())
    }

    async fn get_insights(&self) -> Result<SessionInsights> {
        let insights = {
            let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
            load_session_insights_record(&conn)?
        };

        Ok(SessionInsights {
            total_sessions: insights.total_sessions,
            total_tokens: insights.total_tokens,
        })
    }

    async fn update_session_name(
        &self,
        session_id: &str,
        name: String,
        user_set: bool,
    ) -> Result<()> {
        let cached_name = name.clone();
        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        let now = Utc::now().to_rfc3339();
        update_session_name_record(&conn, session_id, &name, user_set, &now)
            .map_err(|e: String| anyhow!(e))?;
        let updated_at = parse_timestamp_or_now(&now);
        self.update_cached_session_metadata(session_id, |session| {
            session.name = cached_name;
            session.user_set_name = user_set;
            session.updated_at = updated_at;
        });
        Ok(())
    }

    async fn update_working_dir(&self, session_id: &str, working_dir: PathBuf) -> Result<()> {
        let cached_working_dir = working_dir.clone();
        let working_dir_value = working_dir.to_string_lossy().to_string();
        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        let now = Utc::now().to_rfc3339();
        update_session_working_dir_record(&conn, session_id, &working_dir_value, &now)
            .map_err(|e: String| anyhow!(e))?;
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
        update_session_type_record(&conn, session_id, &session_type.to_string(), &now)
            .map_err(|e: String| anyhow!(e))?;
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
        let cached_extension_data = extension_data.clone();
        let extension_data_json = serde_json::to_string(&extension_data)
            .map_err(|e| anyhow!("序列化 extension_data 失败: {e}"))?;
        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        let now = Utc::now().to_rfc3339();
        update_session_extension_data_record(&conn, session_id, &extension_data_json, &now)
            .map_err(|e: String| anyhow!(e))?;
        let updated_at = parse_timestamp_or_now(&now);
        self.update_cached_session_metadata(session_id, |session| {
            session.extension_data = cached_extension_data;
            session.updated_at = updated_at;
        });
        Ok(())
    }

    async fn update_token_stats(&self, session_id: &str, stats: TokenStatsUpdate) -> Result<()> {
        let update = SessionTokenStatsUpdate {
            schedule_id: stats.schedule_id.clone(),
            total_tokens: stats.total_tokens,
            input_tokens: stats.input_tokens,
            output_tokens: stats.output_tokens,
            cached_input_tokens: stats.cached_input_tokens,
            cache_creation_input_tokens: stats.cache_creation_input_tokens,
            accumulated_total_tokens: stats.accumulated_total,
            accumulated_input_tokens: stats.accumulated_input,
            accumulated_output_tokens: stats.accumulated_output,
        };
        let normalized_schedule_id = update.normalized_schedule_id();
        let now = Utc::now().to_rfc3339();
        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        update_session_token_stats_record(&conn, session_id, &update, &now)
            .map_err(|e| anyhow!(e))?;
        let updated_at = parse_timestamp_or_now(&now);
        self.update_cached_session_metadata(session_id, |session| {
            if let Some(total_tokens) = update.total_tokens {
                session.total_tokens = Some(total_tokens);
            }
            if let Some(input_tokens) = update.input_tokens {
                session.input_tokens = Some(input_tokens);
            }
            if let Some(output_tokens) = update.output_tokens {
                session.output_tokens = Some(output_tokens);
            }
            if let Some(cached_input_tokens) = update.cached_input_tokens {
                session.cached_input_tokens = Some(cached_input_tokens);
            }
            if let Some(cache_creation_input_tokens) = update.cache_creation_input_tokens {
                session.cache_creation_input_tokens = Some(cache_creation_input_tokens);
            }
            if let Some(accumulated_total) = update.accumulated_total_tokens {
                session.accumulated_total_tokens = Some(accumulated_total);
            }
            if let Some(accumulated_input) = update.accumulated_input_tokens {
                session.accumulated_input_tokens = Some(accumulated_input);
            }
            if let Some(accumulated_output) = update.accumulated_output_tokens {
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
        let cached_model_config = model_config.clone();
        let model_config_json = model_config
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|e| anyhow!("序列化 model_config 失败: {e}"))?;
        let update = SessionProviderConfigUpdate::new(
            provider_name,
            model_config
                .as_ref()
                .map(|config| config.model_name.clone()),
            model_config_json,
        );
        let cached_provider_name = update.provider_name.clone();
        let should_update_model_config = update.model_name.is_some();

        if update.is_empty() {
            return Ok(());
        }

        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        let now = Utc::now().to_rfc3339();
        update_session_provider_config_record(&conn, session_id, &update, &now)
            .map_err(|e| anyhow!(e))?;
        let updated_at = parse_timestamp_or_now(&now);
        self.update_cached_session_metadata(session_id, |session| {
            if let Some(provider_name) = cached_provider_name {
                session.provider_name = Some(provider_name);
            }
            if let (true, Some(model_config)) = (should_update_model_config, cached_model_config) {
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
        let update = SessionRecipeUpdate {
            recipe_json,
            user_recipe_values_json,
        };
        let conn = self.db.lock().map_err(|e| anyhow!("数据库锁定失败: {e}"))?;
        let now = Utc::now().to_rfc3339();
        update_session_recipe_record(&conn, session_id, &update, &now)
            .map_err(|e: String| anyhow!(e))?;
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
            let rows = load_all_session_record_rows(&conn)?;
            rows.into_iter()
                .map(|row| session_projection::build_session_from_listing_row(&conn, row))
                .collect()
        };

        history_search::search_chat_history(sessions, query, limit).await
    }
}
