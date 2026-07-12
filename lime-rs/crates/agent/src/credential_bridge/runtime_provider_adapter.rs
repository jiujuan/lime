use model_provider::current_client::{CurrentProviderClient, CurrentProviderError};
use model_provider::provider_stream::RuntimeReplyProviderHandle;
use model_provider::runtime_provider::RuntimeProviderConfig;
use std::sync::Arc;

#[derive(Clone)]
pub(crate) struct ConfiguredReplyProvider {
    client: Arc<CurrentProviderClient>,
    runtime_handle: RuntimeReplyProviderHandle,
}

impl ConfiguredReplyProvider {
    pub(crate) fn client(&self) -> Arc<CurrentProviderClient> {
        Arc::clone(&self.client)
    }

    pub(crate) fn runtime_handle(&self) -> &RuntimeReplyProviderHandle {
        &self.runtime_handle
    }
}

pub(crate) async fn create_configured_reply_provider(
    config: &RuntimeProviderConfig,
) -> Result<ConfiguredReplyProvider, CurrentProviderError> {
    let client = CurrentProviderClient::new(config.clone())?;
    let runtime_handle = client.runtime_handle();
    Ok(ConfiguredReplyProvider {
        client: Arc::new(client),
        runtime_handle,
    })
}
