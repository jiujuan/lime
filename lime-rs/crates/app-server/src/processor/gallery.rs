//! gallery domain handlers for the App Server processor.

use super::{dispatch_result, parse_params, to_jsonrpc_error, RequestProcessor, RpcDispatch};
use app_server_protocol::{
    GalleryMaterialFilterParams, GalleryMaterialLookupParams,
    GalleryMaterialMetadataCreateParams, GalleryMaterialMetadataUpdateParams,
    JsonRpcError,
};

impl RequestProcessor {
    pub(super) async fn handle_gallery_material_get_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .get_gallery_material(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gallery_material_metadata_create_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialMetadataCreateParams = parse_params(params)?;
        let response = self
            .runtime
            .create_gallery_material_metadata(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gallery_material_metadata_get_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .get_gallery_material_metadata(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gallery_material_metadata_update_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialMetadataUpdateParams = parse_params(params)?;
        let response = self
            .runtime
            .update_gallery_material_metadata(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gallery_material_metadata_delete_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialLookupParams = parse_params(params)?;
        let response = self
            .runtime
            .delete_gallery_material_metadata(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gallery_material_list_by_image_category_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialFilterParams = parse_params(params)?;
        let response = self
            .runtime
            .list_gallery_materials_by_image_category(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gallery_material_list_by_layout_category_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialFilterParams = parse_params(params)?;
        let response = self
            .runtime
            .list_gallery_materials_by_layout_category(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }

    pub(super) async fn handle_gallery_material_list_by_mood_impl(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<RpcDispatch, JsonRpcError> {
        self.ensure_initialized()?;
        let params: GalleryMaterialFilterParams = parse_params(params)?;
        let response = self
            .runtime
            .list_gallery_materials_by_mood(params)
            .await
            .map_err(to_jsonrpc_error)?;
        dispatch_result(response)
    }
}
