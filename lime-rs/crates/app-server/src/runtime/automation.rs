use super::{RuntimeCore, RuntimeCoreError, RuntimeHostContext};
use crate::automation_execution::{AutomationRunFailure, AutomationRunFinish, AutomationRunStart};
use app_server_protocol::*;

impl RuntimeCore {
    pub(crate) async fn start_automation_job_run(
        &self,
        id: String,
    ) -> Result<AutomationRunStart, RuntimeCoreError> {
        self.app_data_source.start_automation_job_run(id).await
    }

    pub(crate) async fn finish_automation_job_run(
        &self,
        finish: AutomationRunFinish,
    ) -> Result<(), RuntimeCoreError> {
        self.app_data_source.finish_automation_job_run(finish).await
    }

    pub(crate) async fn fail_automation_job_run(
        &self,
        failure: AutomationRunFailure,
    ) -> Result<(), RuntimeCoreError> {
        self.app_data_source.fail_automation_job_run(failure).await
    }

    pub async fn list_automation_jobs(
        &self,
    ) -> Result<AutomationJobListResponse, RuntimeCoreError> {
        self.app_data_source.list_automation_jobs().await
    }

    pub async fn read_automation_scheduler_config(
        &self,
    ) -> Result<AutomationSchedulerConfigReadResponse, RuntimeCoreError> {
        self.app_data_source
            .read_automation_scheduler_config()
            .await
    }

    pub async fn update_automation_scheduler_config(
        &self,
        params: AutomationSchedulerConfigUpdateParams,
    ) -> Result<AutomationSchedulerConfigUpdateResponse, RuntimeCoreError> {
        self.app_data_source
            .update_automation_scheduler_config(params)
            .await
    }

    pub async fn read_automation_scheduler_status(
        &self,
    ) -> Result<AutomationSchedulerStatusResponse, RuntimeCoreError> {
        self.app_data_source
            .read_automation_scheduler_status()
            .await
    }

    pub async fn read_automation_job(
        &self,
        params: AutomationJobIdParams,
    ) -> Result<AutomationJobReadResponse, RuntimeCoreError> {
        self.app_data_source.read_automation_job(params).await
    }

    pub async fn create_automation_job(
        &self,
        params: AutomationJobCreateParams,
    ) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
        self.app_data_source.create_automation_job(params).await
    }

    pub async fn update_automation_job(
        &self,
        params: AutomationJobUpdateParams,
    ) -> Result<AutomationJobWriteResponse, RuntimeCoreError> {
        self.app_data_source.update_automation_job(params).await
    }

    pub async fn delete_automation_job(
        &self,
        params: AutomationJobIdParams,
    ) -> Result<AutomationJobDeleteResponse, RuntimeCoreError> {
        self.app_data_source.delete_automation_job(params).await
    }

    pub async fn run_automation_job_now(
        &self,
        params: AutomationJobIdParams,
        host: RuntimeHostContext,
    ) -> Result<AutomationJobRunNowResponse, RuntimeCoreError> {
        self.execute_automation_job_now(params, host).await
    }

    pub async fn read_automation_health(
        &self,
        params: AutomationJobHealthParams,
    ) -> Result<AutomationJobHealthResponse, RuntimeCoreError> {
        self.app_data_source.read_automation_health(params).await
    }

    pub async fn read_automation_run_history(
        &self,
        params: AutomationJobRunHistoryParams,
    ) -> Result<AutomationJobRunHistoryResponse, RuntimeCoreError> {
        self.app_data_source
            .read_automation_run_history(params)
            .await
    }

    pub async fn preview_automation_schedule(
        &self,
        params: AutomationScheduleParams,
    ) -> Result<AutomationSchedulePreviewResponse, RuntimeCoreError> {
        self.app_data_source
            .preview_automation_schedule(params)
            .await
    }

    pub async fn validate_automation_schedule(
        &self,
        params: AutomationScheduleParams,
    ) -> Result<AutomationScheduleValidateResponse, RuntimeCoreError> {
        self.app_data_source
            .validate_automation_schedule(params)
            .await
    }
}
