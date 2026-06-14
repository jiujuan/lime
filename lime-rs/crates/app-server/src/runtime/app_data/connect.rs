use super::unavailable;
use super::NoopAppDataSource;
use super::RuntimeCoreError;
use app_server_protocol::*;
use async_trait::async_trait;

#[async_trait]
pub trait ConnectAppDataSource: Send + Sync {
    async fn resolve_connect_deep_link(
        &self,
        _params: ConnectDeepLinkResolveParams,
    ) -> Result<ConnectDeepLinkResolveResponse, RuntimeCoreError> {
        Err(unavailable("connectDeepLink/resolve"))
    }

    async fn resolve_connect_open_deep_link(
        &self,
        _params: ConnectOpenDeepLinkResolveParams,
    ) -> Result<ConnectOpenDeepLinkResolveResponse, RuntimeCoreError> {
        Err(unavailable("connectOpenDeepLink/resolve"))
    }

    async fn save_connect_relay_api_key(
        &self,
        _params: ConnectRelayApiKeySaveParams,
    ) -> Result<ConnectRelayApiKeySaveResponse, RuntimeCoreError> {
        Err(unavailable("connectRelayApiKey/save"))
    }

    async fn deliver_connect_callback(
        &self,
        _params: ConnectCallbackSendParams,
    ) -> Result<ConnectCallbackSendResponse, RuntimeCoreError> {
        Err(unavailable("connectCallback/send"))
    }
}

impl ConnectAppDataSource for NoopAppDataSource {}
