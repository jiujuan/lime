use super::super::*;
use async_trait::async_trait;

#[async_trait]
impl AutomationOverviewAppDataSource for LocalAppDataSource {
    async fn list_automation_jobs(&self) -> Result<AutomationJobListResponse, RuntimeCoreError> {
        automation::list_automation_jobs(&self.db)
    }
}
