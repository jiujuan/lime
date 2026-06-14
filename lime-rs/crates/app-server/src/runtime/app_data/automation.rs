use super::unavailable;
use super::NoopAppDataSource;
use super::RuntimeCoreError;
use crate::automation_execution::AutomationRunFailure;
use crate::automation_execution::AutomationRunFinish;
use crate::automation_execution::AutomationRunStart;
use app_server_protocol::*;
use async_trait::async_trait;

#[async_trait]
pub trait AutomationOverviewAppDataSource: Send + Sync {
    async fn list_automation_jobs(&self) -> Result<AutomationJobListResponse, RuntimeCoreError> {
        Ok(AutomationJobListResponse::default())
    }
}

#[async_trait]
pub trait AutomationManagementAppDataSource: Send + Sync {
    async fn read_automation_scheduler_config(
        &self,
    ) -> Result<AutomationSchedulerConfigReadResponse, RuntimeCoreError> {
        Err(unavailable("automationScheduler/config/read"))
    }

    async fn update_automation_scheduler_config(
        &self,
        _params: AutomationSchedulerConfigUpdateParams,
    ) -> Result<AutomationSchedulerConfigUpdateResponse, RuntimeCoreError> {
        Err(unavailable("automationScheduler/config/update"))
    }

    async fn read_automation_scheduler_status(
        &self,
    ) -> Result<AutomationSchedulerStatusResponse, RuntimeCoreError> {
        Err(unavailable("automationScheduler/status"))
    }

    async fn read_automation_job(
        &self,
        _params: AutomationJobIdParams,
    ) -> Result<AutomationJobReadResponse, RuntimeCoreError> {
        Err(unavailable("automationJob/read"))
    }

    async fn create_automation_job(
        &self,
        _params: AutomationJobCreateParams,
    ) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
        Err(unavailable("automationJob/create"))
    }

    async fn update_automation_job(
        &self,
        _params: AutomationJobUpdateParams,
    ) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
        Err(unavailable("automationJob/update"))
    }

    async fn delete_automation_job(
        &self,
        _params: AutomationJobIdParams,
    ) -> Result<AutomationJobDeleteResponse, RuntimeCoreError> {
        Err(unavailable("automationJob/delete"))
    }

    async fn start_automation_job_run(
        &self,
        _id: String,
    ) -> Result<AutomationRunStart, RuntimeCoreError> {
        Err(unavailable("automationJob/runNow"))
    }

    async fn finish_automation_job_run(
        &self,
        _finish: AutomationRunFinish,
    ) -> Result<(), RuntimeCoreError> {
        Err(unavailable("automationJob/runNow"))
    }

    async fn fail_automation_job_run(
        &self,
        _failure: AutomationRunFailure,
    ) -> Result<(), RuntimeCoreError> {
        Err(unavailable("automationJob/runNow"))
    }

    async fn read_automation_health(
        &self,
        _params: AutomationJobHealthParams,
    ) -> Result<AutomationJobHealthResponse, RuntimeCoreError> {
        Err(unavailable("automationJob/health"))
    }

    async fn read_automation_run_history(
        &self,
        _params: AutomationJobRunHistoryParams,
    ) -> Result<AutomationJobRunHistoryResponse, RuntimeCoreError> {
        Err(unavailable("automationJob/runHistory"))
    }

    async fn preview_automation_schedule(
        &self,
        _params: AutomationScheduleParams,
    ) -> Result<AutomationSchedulePreviewResponse, RuntimeCoreError> {
        Err(unavailable("automationSchedule/preview"))
    }

    async fn validate_automation_schedule(
        &self,
        _params: AutomationScheduleParams,
    ) -> Result<AutomationScheduleValidateResponse, RuntimeCoreError> {
        Err(unavailable("automationSchedule/validate"))
    }
}

impl AutomationOverviewAppDataSource for NoopAppDataSource {}
impl AutomationManagementAppDataSource for NoopAppDataSource {}
