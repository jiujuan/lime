//! 对话与模型使用统计服务。

use chrono::{DateTime, Datelike, Duration, Local, TimeZone, Timelike};
use lime_core::database::dao::agent::{AgentDao, AgentModelPatternMatch};
use lime_core::database::dao::orchestrator::OrchestratorDao;
use lime_core::database::ConversationWindowSummary;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

const GENERAL_MODE_PATTERN: &str = "general:%";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageStatsResponse {
    pub total_conversations: u32,
    pub total_messages: u32,
    pub total_tokens: u64,
    pub total_time_minutes: u32,
    pub monthly_conversations: u32,
    pub monthly_messages: u32,
    pub monthly_tokens: u64,
    pub today_conversations: u32,
    pub today_messages: u32,
    pub today_tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelUsage {
    pub model: String,
    pub conversations: u32,
    pub tokens: u64,
    pub percentage: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyUsage {
    pub date: String,
    pub conversations: u32,
    pub tokens: u64,
}

#[derive(Debug, Clone, Copy, Default)]
struct ConversationStats {
    total_conversations: u32,
    total_messages: u32,
    monthly_conversations: u32,
    monthly_messages: u32,
    today_conversations: u32,
    today_messages: u32,
}

#[derive(Debug, Clone, Copy, Default)]
struct ConversationWindowTriplet {
    total: ConversationWindowSummary,
    monthly: ConversationWindowSummary,
    today: ConversationWindowSummary,
}

#[derive(Debug, Clone, Copy, Default)]
struct TokenStats {
    total_tokens: u64,
    monthly_tokens: u64,
    today_tokens: u64,
}

#[derive(Debug, Clone)]
struct RawModelUsage {
    model: String,
    conversations: u64,
    tokens: u64,
}

pub fn get_usage_stats_from_db(
    time_range: &str,
    conn: &Connection,
) -> Result<UsageStatsResponse, String> {
    validate_time_range(time_range)?;

    let now = Local::now();
    let today_start = start_of_day(now);
    let month_start = start_of_month(now);

    let general_windows =
        build_window_triplet(conn, summarize_general_window, &today_start, &month_start)?;
    let agent_windows =
        build_window_triplet(conn, summarize_agent_window, &today_start, &month_start)?;
    let general_stats = build_conversation_stats(general_windows);
    let agent_stats = build_conversation_stats(agent_windows);

    let token_stats = query_token_stats(
        conn,
        &today_start,
        &month_start,
        general_windows,
        agent_windows,
    )?;

    Ok(UsageStatsResponse {
        total_conversations: general_stats.total_conversations + agent_stats.total_conversations,
        total_messages: general_stats.total_messages + agent_stats.total_messages,
        total_tokens: token_stats.total_tokens,
        total_time_minutes: (token_stats.total_tokens / 600) as u32,
        monthly_conversations: general_stats.monthly_conversations
            + agent_stats.monthly_conversations,
        monthly_messages: general_stats.monthly_messages + agent_stats.monthly_messages,
        monthly_tokens: token_stats.monthly_tokens,
        today_conversations: general_stats.today_conversations + agent_stats.today_conversations,
        today_messages: general_stats.today_messages + agent_stats.today_messages,
        today_tokens: token_stats.today_tokens,
    })
}

pub fn get_model_usage_ranking_from_db(
    time_range: &str,
    conn: &Connection,
) -> Result<Vec<ModelUsage>, String> {
    let range_start = resolve_range_start(time_range)?;
    let usages = query_model_usage_from_stats_table(conn, range_start)?;
    Ok(build_model_usage_response(usages))
}

pub fn get_daily_usage_trends_from_db(
    time_range: &str,
    conn: &Connection,
) -> Result<Vec<DailyUsage>, String> {
    let days = resolve_range_days(time_range)?;
    let use_actual_tokens = OrchestratorDao::has_model_usage_stats(conn)
        .map_err(|e| format!("检查 model_usage_stats 失败: {e}"))?;

    let mut daily_usage = Vec::new();
    for i in (0..days).rev() {
        let date = Local::now() - Duration::days(i);
        let day_start = start_of_day(date);
        let day_end = day_start + Duration::days(1);
        let day_start_ts = day_start.timestamp_millis();
        let day_end_ts = day_end.timestamp_millis();
        let day_key = day_start.format("%Y-%m-%d").to_string();
        let general_window = summarize_general_window(conn, Some(day_start_ts), Some(day_end_ts))
            .map_err(|e| format!("查询通用日摘要失败: {e}"))?;
        let agent_window = summarize_agent_window(conn, Some(day_start_ts), Some(day_end_ts))
            .map_err(|e| format!("查询 Agent 日摘要失败: {e}"))?;

        let tokens = if use_actual_tokens {
            let day_tokens = OrchestratorDao::get_model_usage_tokens_on(conn, &day_key)
                .map_err(|e| format!("查询模型日 Token 失败: {e}"))?;
            clamp_i64_to_u64(day_tokens)
        } else {
            chars_to_estimated_tokens(general_window.content_chars + agent_window.content_chars)
        };

        daily_usage.push(DailyUsage {
            date: day_key,
            conversations: clamp_i64_to_u32(
                general_window.session_count + agent_window.session_count,
            ),
            tokens,
        });
    }

    Ok(daily_usage)
}

fn validate_time_range(time_range: &str) -> Result<(), String> {
    match time_range {
        "week" | "month" | "all" => Ok(()),
        _ => Err("无效的时间范围".to_string()),
    }
}

fn resolve_range_days(time_range: &str) -> Result<i64, String> {
    match time_range {
        "week" => Ok(7),
        "month" => Ok(30),
        "all" => Ok(90),
        _ => Err("无效的时间范围".to_string()),
    }
}

fn resolve_range_start(time_range: &str) -> Result<Option<DateTime<Local>>, String> {
    let now = Local::now();
    match time_range {
        "week" => Ok(Some(now - Duration::days(7))),
        "month" => Ok(Some(now - Duration::days(30))),
        "all" => Ok(None),
        _ => Err("无效的时间范围".to_string()),
    }
}

fn start_of_day(now: DateTime<Local>) -> DateTime<Local> {
    now.with_hour(0)
        .and_then(|dt| dt.with_minute(0))
        .and_then(|dt| dt.with_second(0))
        .and_then(|dt| dt.with_nanosecond(0))
        .unwrap_or(now)
}

fn start_of_month(now: DateTime<Local>) -> DateTime<Local> {
    now.with_day(1)
        .and_then(|dt| dt.with_hour(0))
        .and_then(|dt| dt.with_minute(0))
        .and_then(|dt| dt.with_second(0))
        .and_then(|dt| dt.with_nanosecond(0))
        .unwrap_or_else(|| start_of_day(now))
}

fn clamp_i64_to_u32(value: i64) -> u32 {
    value.clamp(0, u32::MAX as i64) as u32
}

fn clamp_i64_to_u64(value: i64) -> u64 {
    value.max(0) as u64
}

fn chars_to_estimated_tokens(chars: i64) -> u64 {
    if chars <= 0 {
        return 0;
    }
    ((chars as f64) / 4.0).ceil() as u64
}

fn format_sqlite_datetime(timestamp_ms: i64) -> String {
    Local
        .timestamp_millis_opt(timestamp_ms)
        .single()
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| Local::now().format("%Y-%m-%d %H:%M:%S").to_string())
}

fn summarize_unified_window(
    conn: &Connection,
    match_mode: AgentModelPatternMatch,
    from_timestamp_ms: Option<i64>,
    to_timestamp_ms: Option<i64>,
) -> Result<ConversationWindowSummary, String> {
    let from_text = from_timestamp_ms.map(format_sqlite_datetime);
    let to_text = to_timestamp_ms.map(format_sqlite_datetime);

    let session_count = AgentDao::count_sessions_by_model_pattern(
        conn,
        GENERAL_MODE_PATTERN,
        match_mode,
        from_text.as_deref(),
        to_text.as_deref(),
    )
    .map_err(|e| match match_mode {
        AgentModelPatternMatch::Like => format!("查询 unified general 会话摘要失败: {e}"),
        AgentModelPatternMatch::NotLike => format!("查询非通用 unified 会话摘要失败: {e}"),
    })?;

    Ok(ConversationWindowSummary {
        session_count,
        message_count: 0,
        content_chars: 0,
    })
}

fn summarize_general_window(
    conn: &Connection,
    from_timestamp_ms: Option<i64>,
    to_timestamp_ms: Option<i64>,
) -> Result<ConversationWindowSummary, String> {
    summarize_unified_window(
        conn,
        AgentModelPatternMatch::Like,
        from_timestamp_ms,
        to_timestamp_ms,
    )
}

fn summarize_agent_window(
    conn: &Connection,
    from_timestamp_ms: Option<i64>,
    to_timestamp_ms: Option<i64>,
) -> Result<ConversationWindowSummary, String> {
    summarize_unified_window(
        conn,
        AgentModelPatternMatch::NotLike,
        from_timestamp_ms,
        to_timestamp_ms,
    )
}

fn build_window_triplet(
    conn: &Connection,
    summarize_window: impl Fn(
        &Connection,
        Option<i64>,
        Option<i64>,
    ) -> Result<ConversationWindowSummary, String>,
    today_start: &DateTime<Local>,
    month_start: &DateTime<Local>,
) -> Result<ConversationWindowTriplet, String> {
    let today_ts = today_start.timestamp_millis();
    let month_ts = month_start.timestamp_millis();

    Ok(ConversationWindowTriplet {
        total: summarize_window(conn, None, None)?,
        monthly: summarize_window(conn, Some(month_ts), None)?,
        today: summarize_window(conn, Some(today_ts), None)?,
    })
}

fn build_conversation_stats(windows: ConversationWindowTriplet) -> ConversationStats {
    ConversationStats {
        total_conversations: clamp_i64_to_u32(windows.total.session_count),
        total_messages: clamp_i64_to_u32(windows.total.message_count),
        monthly_conversations: clamp_i64_to_u32(windows.monthly.session_count),
        monthly_messages: clamp_i64_to_u32(windows.monthly.message_count),
        today_conversations: clamp_i64_to_u32(windows.today.session_count),
        today_messages: clamp_i64_to_u32(windows.today.message_count),
    }
}

fn query_token_stats(
    conn: &Connection,
    today_start: &DateTime<Local>,
    month_start: &DateTime<Local>,
    general_windows: ConversationWindowTriplet,
    agent_windows: ConversationWindowTriplet,
) -> Result<TokenStats, String> {
    if let Some(actual_tokens) = query_model_usage_table_tokens(conn, today_start, month_start)? {
        return Ok(actual_tokens);
    }

    Ok(TokenStats {
        total_tokens: chars_to_estimated_tokens(
            general_windows.total.content_chars + agent_windows.total.content_chars,
        ),
        monthly_tokens: chars_to_estimated_tokens(
            general_windows.monthly.content_chars + agent_windows.monthly.content_chars,
        ),
        today_tokens: chars_to_estimated_tokens(
            general_windows.today.content_chars + agent_windows.today.content_chars,
        ),
    })
}

fn query_model_usage_table_tokens(
    conn: &Connection,
    today_start: &DateTime<Local>,
    month_start: &DateTime<Local>,
) -> Result<Option<TokenStats>, String> {
    if !OrchestratorDao::has_model_usage_stats(conn)
        .map_err(|e| format!("查询 model_usage_stats 行数失败: {e}"))?
    {
        return Ok(None);
    }

    let month_key = month_start.format("%Y-%m-%d").to_string();
    let today_key = today_start.format("%Y-%m-%d").to_string();
    let total_tokens = OrchestratorDao::get_total_model_usage_tokens(conn)
        .map_err(|e| format!("查询总 Token 统计失败: {e}"))?;
    let monthly_tokens = OrchestratorDao::get_model_usage_tokens_since(conn, &month_key)
        .map_err(|e| format!("查询本月 Token 统计失败: {e}"))?;
    let today_tokens = OrchestratorDao::get_model_usage_tokens_on(conn, &today_key)
        .map_err(|e| format!("查询今日 Token 统计失败: {e}"))?;

    Ok(Some(TokenStats {
        total_tokens: clamp_i64_to_u64(total_tokens),
        monthly_tokens: clamp_i64_to_u64(monthly_tokens),
        today_tokens: clamp_i64_to_u64(today_tokens),
    }))
}

fn query_model_usage_from_stats_table(
    conn: &Connection,
    range_start: Option<DateTime<Local>>,
) -> Result<Vec<RawModelUsage>, String> {
    if !OrchestratorDao::has_model_usage_stats(conn)
        .map_err(|e| format!("检查模型统计表失败: {e}"))?
    {
        return Ok(Vec::new());
    }

    let start_key = range_start.map(|start| start.format("%Y-%m-%d").to_string());
    let rows = OrchestratorDao::list_model_usage_aggregates(conn, start_key.as_deref(), 20)
        .map_err(|e| format!("执行模型统计查询失败: {e}"))?;

    Ok(rows
        .into_iter()
        .map(|row| RawModelUsage {
            model: row.model_id,
            conversations: clamp_i64_to_u64(row.request_count),
            tokens: clamp_i64_to_u64(row.total_tokens),
        })
        .collect())
}

fn build_model_usage_response(usages: Vec<RawModelUsage>) -> Vec<ModelUsage> {
    if usages.is_empty() {
        return Vec::new();
    }

    let total_tokens: u64 = usages.iter().map(|item| item.tokens).sum();
    let total_conversations: u64 = usages.iter().map(|item| item.conversations).sum();

    usages
        .into_iter()
        .map(|item| {
            let denominator = if total_tokens > 0 {
                total_tokens
            } else {
                total_conversations.max(1)
            };
            let numerator = if total_tokens > 0 {
                item.tokens
            } else {
                item.conversations
            };
            ModelUsage {
                model: item.model,
                conversations: item.conversations.min(u32::MAX as u64) as u32,
                tokens: item.tokens,
                percentage: ((numerator as f64 / denominator as f64) * 100.0) as f32,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_core::database::schema::create_tables;
    use rusqlite::params;

    fn setup_usage_db() -> Connection {
        let conn = Connection::open_in_memory().expect("open db");
        create_tables(&conn).expect("create schema");
        conn
    }

    fn create_test_legacy_agent_messages_table(conn: &Connection) {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS agent_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content_json TEXT NOT NULL,
                timestamp TEXT NOT NULL
            )",
            [],
        )
        .expect("create legacy agent_messages test table");
    }

    fn insert_agent_session(conn: &Connection, id: &str, model: &str, created_at: &str) {
        conn.execute(
            "INSERT INTO agent_sessions (
                id, model, system_prompt, title, created_at, updated_at, working_dir,
                execution_strategy
             ) VALUES (?1, ?2, NULL, ?3, ?4, ?4, NULL, 'react')",
            params![id, model, id, created_at],
        )
        .expect("insert session");
    }

    fn insert_agent_message(conn: &Connection, session_id: &str, content: &str, timestamp: &str) {
        create_test_legacy_agent_messages_table(conn);
        conn.execute(
            "INSERT INTO agent_messages (session_id, role, content_json, timestamp)
             VALUES (?1, 'assistant', ?2, ?3)",
            params![session_id, content, timestamp],
        )
        .expect("insert legacy message");
    }

    #[test]
    fn model_usage_ranking_does_not_fallback_to_agent_messages() {
        let conn = setup_usage_db();
        insert_agent_session(&conn, "legacy-agent", "gpt-4.1", "2026-03-14T09:00:00Z");
        insert_agent_message(
            &conn,
            "legacy-agent",
            r#"[{"type":"text","text":"旧消息不再作为模型统计来源"}]"#,
            "2026-03-14T09:01:00Z",
        );

        let ranking = get_model_usage_ranking_from_db("all", &conn).expect("ranking");

        assert!(ranking.is_empty());
    }

    #[test]
    fn model_usage_ranking_uses_model_usage_stats() {
        let conn = setup_usage_db();
        OrchestratorDao::record_model_usage(&conn, "gpt-5", "cred-1", true, 120, 30)
            .expect("record gpt-5");
        OrchestratorDao::record_model_usage(&conn, "gpt-4.1", "cred-2", true, 30, 10)
            .expect("record gpt-4.1");

        let ranking = get_model_usage_ranking_from_db("all", &conn).expect("ranking");

        assert_eq!(ranking.len(), 2);
        assert_eq!(ranking[0].model, "gpt-5");
        assert_eq!(ranking[0].tokens, 120);
        assert_eq!(ranking[1].model, "gpt-4.1");
        assert_eq!(ranking[1].tokens, 30);
    }

    #[test]
    fn usage_stats_keep_session_counts_but_do_not_estimate_tokens_from_legacy_messages() {
        let conn = setup_usage_db();
        insert_agent_session(&conn, "general", "general:gpt-4.1", "2026-03-14T09:00:00Z");
        insert_agent_session(&conn, "agent", "gpt-4.1", "2026-03-14T10:00:00Z");
        insert_agent_message(
            &conn,
            "general",
            r#"[{"type":"text","text":"general legacy content"}]"#,
            "2026-03-14T09:01:00Z",
        );
        insert_agent_message(
            &conn,
            "agent",
            r#"[{"type":"text","text":"agent legacy content"}]"#,
            "2026-03-14T10:01:00Z",
        );

        let stats = get_usage_stats_from_db("all", &conn).expect("usage stats");

        assert_eq!(stats.total_conversations, 2);
        assert_eq!(stats.total_messages, 0);
        assert_eq!(stats.total_tokens, 0);
    }
}
