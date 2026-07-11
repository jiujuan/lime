use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::runtime_store_aster_adapter::{runtime_item_store_from_aster, AsterThreadRuntimeStore};
use serde_json::Value;
use std::sync::Arc;
use thread_store::runtime_store::complete_runtime_request_item_record;

pub(super) async fn complete_runtime_request_item(
    runtime_store: Arc<AsterThreadRuntimeStore>,
    request_id: &str,
    response: Option<Value>,
) -> Result<Option<RuntimeAgentEvent>, String> {
    let item_store = runtime_item_store_from_aster(runtime_store);
    let Some(item) =
        complete_runtime_request_item_record(item_store.as_ref(), request_id, response)
            .await
            .map_err(|error| error.to_string())?
    else {
        return Ok(None);
    };
    let Some(item) = crate::runtime_timeline_adapter::project_runtime_timeline_item_record(&item)
    else {
        return Ok(None);
    };
    let item = crate::protocol_projection::project_item_runtime(item);
    Ok(Some(RuntimeAgentEvent::ItemCompleted { item }))
}
