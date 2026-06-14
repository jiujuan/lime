use super::NoopAppDataSource;
use super::RuntimeCoreError;
use app_server_protocol::*;
use async_trait::async_trait;

#[async_trait]
pub trait UsageStatsAppDataSource: Send + Sync {
    async fn read_usage_stats(
        &self,
        _params: UsageStatsRangeParams,
    ) -> Result<UsageStatsReadResponse, RuntimeCoreError> {
        Ok(UsageStatsReadResponse::default())
    }

    async fn list_usage_stats_model_ranking(
        &self,
        _params: UsageStatsRangeParams,
    ) -> Result<UsageStatsModelRankingListResponse, RuntimeCoreError> {
        Ok(UsageStatsModelRankingListResponse::default())
    }

    async fn list_usage_stats_daily_trends(
        &self,
        _params: UsageStatsRangeParams,
    ) -> Result<UsageStatsDailyTrendsListResponse, RuntimeCoreError> {
        Ok(UsageStatsDailyTrendsListResponse::default())
    }
}

impl UsageStatsAppDataSource for NoopAppDataSource {}
