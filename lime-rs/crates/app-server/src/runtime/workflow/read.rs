use crate::runtime::read_model;
use crate::RuntimeCore;
use crate::RuntimeCoreError;
use app_server_protocol::AgentSessionReadParams;
use app_server_protocol::WorkflowReadParams;
use app_server_protocol::WorkflowReadResponse;
use serde_json::Value;

impl RuntimeCore {
    pub async fn read_workflow_current(
        &self,
        params: WorkflowReadParams,
    ) -> Result<WorkflowReadResponse, RuntimeCoreError> {
        let session_id = params.session_id.trim().to_string();
        if session_id.is_empty() {
            return Err(RuntimeCoreError::Backend(
                "sessionId is required for workflow/read".to_string(),
            ));
        }

        let context = self
            .load_session_current(AgentSessionReadParams {
                session_id,
                history_limit: None,
                history_offset: None,
                history_before_message_id: None,
            })
            .await?;
        let workflow_read_model = read_model::workflow_read_model_from_stored_session(
            &context.stored,
            &context.workflow_audit_events,
        );
        let workflow = serde_json::to_value(&workflow_read_model).map_err(|error| {
            RuntimeCoreError::Backend(format!("failed to serialize workflow read model: {error}"))
        })?;
        let workflow_runs = array_field(&workflow, "workflowRuns");
        let workflow_steps = array_field(&workflow, "workflowSteps");

        Ok(WorkflowReadResponse {
            session_id: context.stored.session.session_id,
            workflow,
            workflow_runs,
            workflow_steps,
        })
    }
}

fn array_field(value: &Value, key: &str) -> Vec<Value> {
    value
        .get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}
