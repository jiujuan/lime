use aster::session::extension_data::ExtensionData;
use aster::session::persist_session_extension_data as persist_aster_session_extension_data;
use chrono::Utc;
use lime_core::database::{
    agent_session_repository::{self, SessionTokenStatsUpdate},
    lock_db, DbConnection,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompactionSessionMetricsUpdate {
    pub schedule_id: Option<String>,
    pub current_window_tokens: i32,
    pub cached_input_tokens: Option<i32>,
    pub cache_creation_input_tokens: Option<i32>,
    pub accumulated_total_tokens: Option<i32>,
    pub accumulated_input_tokens: Option<i32>,
    pub accumulated_output_tokens: Option<i32>,
}

/// 收口 session extension_data 的持久化边界，避免散落 direct builder 调用。
pub(crate) async fn persist_session_extension_data(
    session_id: &str,
    extension_data: ExtensionData,
    action_label: &str,
) -> Result<(), String> {
    persist_aster_session_extension_data(session_id, extension_data)
        .await
        .map_err(|error| format!("{action_label}失败: {error}"))
}

/// 收口 compaction 后 session token 指标写回边界，避免业务层直接持有 builder 链。
pub async fn persist_compaction_session_metrics_update(
    db: &DbConnection,
    session_id: &str,
    update: &CompactionSessionMetricsUpdate,
) -> Result<(), String> {
    let conn = lock_db(db)?;
    agent_session_repository::update_session_token_stats(
        &conn,
        session_id,
        &SessionTokenStatsUpdate {
            schedule_id: update.schedule_id.clone(),
            total_tokens: Some(update.current_window_tokens),
            input_tokens: Some(update.current_window_tokens),
            output_tokens: Some(0),
            cached_input_tokens: update.cached_input_tokens,
            cache_creation_input_tokens: update.cache_creation_input_tokens,
            accumulated_total_tokens: update.accumulated_total_tokens,
            accumulated_input_tokens: update.accumulated_input_tokens,
            accumulated_output_tokens: update.accumulated_output_tokens,
        },
        &Utc::now().to_rfc3339(),
    )
    .map_err(|error| format!("更新压缩后的 token 统计失败: {error}"))
}
