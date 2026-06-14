use super::super::*;
use async_trait::async_trait;

#[async_trait]
impl UsageStatsAppDataSource for LocalAppDataSource {
    async fn read_usage_stats(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsReadResponse, RuntimeCoreError> {
        usage_stats::read_usage_stats(&self.db, params).map_err(data_error)
    }

    async fn list_usage_stats_model_ranking(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsModelRankingListResponse, RuntimeCoreError> {
        usage_stats::list_usage_stats_model_ranking(&self.db, params).map_err(data_error)
    }

    async fn list_usage_stats_daily_trends(
        &self,
        params: UsageStatsRangeParams,
    ) -> Result<UsageStatsDailyTrendsListResponse, RuntimeCoreError> {
        usage_stats::list_usage_stats_daily_trends(&self.db, params).map_err(data_error)
    }
}
