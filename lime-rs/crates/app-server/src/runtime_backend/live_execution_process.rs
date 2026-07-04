use crate::execution_process::ExecutionProcessServer;
use app_server_protocol::{
    ExecutionProcessDrainOutputParams, ExecutionProcessDrainOutputResponse,
    ExecutionProcessIdParams, ExecutionProcessStartParams, ExecutionProcessStartResponse,
    ExecutionProcessStatusResponse,
};
use async_trait::async_trait;
use lime_agent::LiveExecutionProcessGateway;

#[async_trait]
impl LiveExecutionProcessGateway for ExecutionProcessServer {
    async fn start_process(
        &self,
        params: ExecutionProcessStartParams,
    ) -> Result<ExecutionProcessStartResponse, String> {
        self.start_process(params)
            .await
            .map_err(|error| error.to_string())
    }

    fn terminate(
        &self,
        params: ExecutionProcessIdParams,
    ) -> Result<ExecutionProcessStatusResponse, String> {
        self.terminate(params).map_err(|error| error.to_string())
    }

    fn status(
        &self,
        params: ExecutionProcessIdParams,
    ) -> Result<ExecutionProcessStatusResponse, String> {
        self.status(params).map_err(|error| error.to_string())
    }

    fn drain_output(
        &self,
        params: ExecutionProcessDrainOutputParams,
    ) -> Result<ExecutionProcessDrainOutputResponse, String> {
        self.drain_output(params).map_err(|error| error.to_string())
    }
}
