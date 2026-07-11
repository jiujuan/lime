use crate::runtime_store_aster_adapter::{
    runtime_item_record_from_aster, runtime_item_store_from_aster, AsterThreadRuntimeStore,
};
use aster::AgentEvent as AsterAgentEvent;
use std::sync::Arc;
use thread_store::runtime_store::upsert_runtime_item_record;

pub(super) async fn persist_aster_item_event(
    runtime_store: Arc<AsterThreadRuntimeStore>,
    event: &AsterAgentEvent,
) -> Result<(), String> {
    let item = match event {
        AsterAgentEvent::ItemStarted { item }
        | AsterAgentEvent::ItemUpdated { item }
        | AsterAgentEvent::ItemCompleted { item } => item,
        _ => return Ok(()),
    };

    let item_store = runtime_item_store_from_aster(runtime_store);
    upsert_runtime_item_record(item_store.as_ref(), runtime_item_record_from_aster(item))
        .await
        .map(|_| ())
        .map_err(|error| error.to_string())
}
