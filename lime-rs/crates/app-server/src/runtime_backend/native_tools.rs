use super::image_tools;
use super::memory_tools;
use crate::AppDataSource;
use crate::RuntimeCoreError;
use lime_agent::AsterAgentState;
use std::sync::{Arc, RwLock};

pub(crate) async fn register_current_native_tools_if_available(
    agent_state: &AsterAgentState,
    app_data_source: &RwLock<Option<Arc<dyn AppDataSource>>>,
) -> Result<(), RuntimeCoreError> {
    let app_data_source = app_data_source
        .read()
        .map_err(|_| {
            RuntimeCoreError::Backend("native tool app data source lock poisoned".to_string())
        })?
        .clone();
    let Some(app_data_source) = app_data_source else {
        return Ok(());
    };
    if !agent_state.is_initialized().await {
        return Ok(());
    }
    let tools = memory_tools::create_memory_tools(app_data_source.clone())
        .into_iter()
        .chain(image_tools::create_image_tools(app_data_source.clone()));
    for tool in tools {
        agent_state
            .register_native_tool(tool)
            .await
            .map_err(|error| RuntimeCoreError::Backend(error.to_string()))?;
    }
    Ok(())
}
