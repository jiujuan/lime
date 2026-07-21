use super::super::*;
use async_trait::async_trait;

#[async_trait]
impl ConnectAppDataSource for LocalAppDataSource {
    async fn resolve_connect_deep_link(
        &self,
        params: ConnectDeepLinkResolveParams,
    ) -> Result<ConnectDeepLinkResolveResponse, RuntimeCoreError> {
        connect::resolve_deep_link(&self.connect_registry_cache_path, params).await
    }

    async fn resolve_connect_open_deep_link(
        &self,
        params: ConnectOpenDeepLinkResolveParams,
    ) -> Result<ConnectOpenDeepLinkResolveResponse, RuntimeCoreError> {
        connect::resolve_open_deep_link(params)
    }

    async fn save_connect_relay_api_key(
        &self,
        params: ConnectRelayApiKeySaveParams,
    ) -> Result<ConnectRelayApiKeySaveResponse, RuntimeCoreError> {
        connect::save_relay_api_key(
            &self.db,
            &self.api_key_provider_service,
            &self.connect_registry_cache_path,
            params,
        )
        .await
    }

    async fn deliver_connect_callback(
        &self,
        params: ConnectCallbackSendParams,
    ) -> Result<ConnectCallbackSendResponse, RuntimeCoreError> {
        connect::deliver_callback(&self.connect_registry_cache_path, params).await
    }
}
