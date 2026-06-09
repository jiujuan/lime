use app_server_protocol::UsageStatsDailyTrendsListResponse;
use app_server_protocol::UsageStatsDailyUsage;
use app_server_protocol::UsageStatsModelRankingListResponse;
use app_server_protocol::UsageStatsModelUsage;
use app_server_protocol::UsageStatsRangeParams;
use app_server_protocol::UsageStatsReadResponse;
use app_server_protocol::UsageStatsSummary;
use lime_core::database;
use lime_core::database::DbConnection;
use lime_services::usage_statistics_service;

pub(crate) fn read_usage_stats(
    db: &DbConnection,
    params: UsageStatsRangeParams,
) -> Result<UsageStatsReadResponse, String> {
    let conn = database::lock_db(db).map_err(|error| error.to_string())?;
    let stats = usage_statistics_service::get_usage_stats_from_db(&params.time_range, &conn)
        .map_err(|error| error.to_string())?;
    Ok(UsageStatsReadResponse {
        stats: UsageStatsSummary {
            total_conversations: stats.total_conversations,
            total_messages: stats.total_messages,
            total_tokens: stats.total_tokens,
            total_time_minutes: stats.total_time_minutes,
            monthly_conversations: stats.monthly_conversations,
            monthly_messages: stats.monthly_messages,
            monthly_tokens: stats.monthly_tokens,
            today_conversations: stats.today_conversations,
            today_messages: stats.today_messages,
            today_tokens: stats.today_tokens,
        },
    })
}

pub(crate) fn list_usage_stats_model_ranking(
    db: &DbConnection,
    params: UsageStatsRangeParams,
) -> Result<UsageStatsModelRankingListResponse, String> {
    let conn = database::lock_db(db).map_err(|error| error.to_string())?;
    let ranking =
        usage_statistics_service::get_model_usage_ranking_from_db(&params.time_range, &conn)
            .map_err(|error| error.to_string())?
            .into_iter()
            .map(|item| UsageStatsModelUsage {
                model: item.model,
                conversations: item.conversations,
                tokens: item.tokens,
                percentage: item.percentage,
            })
            .collect();
    Ok(UsageStatsModelRankingListResponse { ranking })
}

pub(crate) fn list_usage_stats_daily_trends(
    db: &DbConnection,
    params: UsageStatsRangeParams,
) -> Result<UsageStatsDailyTrendsListResponse, String> {
    let conn = database::lock_db(db).map_err(|error| error.to_string())?;
    let trends =
        usage_statistics_service::get_daily_usage_trends_from_db(&params.time_range, &conn)
            .map_err(|error| error.to_string())?
            .into_iter()
            .map(|item| UsageStatsDailyUsage {
                date: item.date,
                conversations: item.conversations,
                tokens: item.tokens,
            })
            .collect();
    Ok(UsageStatsDailyTrendsListResponse { trends })
}
