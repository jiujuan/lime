use crate::database::DbConnection;
use crate::services::site_adapter_import_service::{
    import_imported_yaml_adapter_bundle_to_default_dir, ImportedYamlCompileOptions,
    PersistImportedCatalogResult,
};
use crate::services::site_adapter_registry::{
    apply_site_adapter_catalog_bootstrap, clear_site_adapter_catalog_cache,
    get_site_adapter_catalog_status, SiteAdapterCatalogStatus,
};
use crate::services::site_capability_service::{
    get_site_adapter, get_site_adapter_launch_readiness, list_site_adapters,
    recommend_site_adapters, run_site_adapter, run_site_adapter_with_optional_save,
    save_existing_site_result_to_project, search_site_adapters, RunSiteAdapterRequest,
    SaveSiteAdapterResultRequest, SavedSiteAdapterContent, SiteAdapterDefinition,
    SiteAdapterLaunchReadinessRequest, SiteAdapterLaunchReadinessResult, SiteAdapterRecommendation,
    SiteAdapterRunResult,
};
use serde::Deserialize;
use serde_json::Value;
use tauri::State;

#[derive(Debug, Deserialize)]
pub struct SiteAdapterNameRequest {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct SiteAdapterSearchRequest {
    pub query: String,
}

#[derive(Debug, Deserialize)]
pub struct SiteAdapterCatalogBootstrapRequest {
    pub payload: Value,
}

#[derive(Debug, Deserialize)]
pub struct SiteAdapterRecommendRequest {
    #[serde(default)]
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
pub struct SiteAdapterImportYamlBundleRequest {
    pub yaml_bundle: String,
    #[serde(default)]
    pub catalog_version: Option<String>,
    #[serde(default)]
    pub source_version: Option<String>,
    #[serde(default = "default_site_adapter_import_read_only")]
    pub read_only: bool,
}

fn default_site_adapter_import_read_only() -> bool {
    true
}

#[tauri::command]
pub fn site_list_adapters() -> Result<Vec<SiteAdapterDefinition>, String> {
    Ok(list_site_adapters())
}

#[tauri::command]
pub async fn site_recommend_adapters(
    db: State<'_, DbConnection>,
    request: SiteAdapterRecommendRequest,
) -> Result<Vec<SiteAdapterRecommendation>, String> {
    recommend_site_adapters(db.inner(), request.limit).await
}

#[tauri::command]
pub fn site_search_adapters(
    request: SiteAdapterSearchRequest,
) -> Result<Vec<SiteAdapterDefinition>, String> {
    Ok(search_site_adapters(&request.query))
}

#[tauri::command]
pub fn site_get_adapter_info(
    request: SiteAdapterNameRequest,
) -> Result<SiteAdapterDefinition, String> {
    get_site_adapter(&request.name).ok_or_else(|| "未找到对应的站点适配器".to_string())
}

#[tauri::command]
pub async fn site_get_adapter_launch_readiness(
    db: State<'_, DbConnection>,
    request: SiteAdapterLaunchReadinessRequest,
) -> Result<SiteAdapterLaunchReadinessResult, String> {
    get_site_adapter_launch_readiness(db.inner(), request).await
}

#[tauri::command]
pub fn site_get_adapter_catalog_status() -> Result<SiteAdapterCatalogStatus, String> {
    get_site_adapter_catalog_status()
}

#[tauri::command]
pub fn site_apply_adapter_catalog_bootstrap(
    request: SiteAdapterCatalogBootstrapRequest,
) -> Result<SiteAdapterCatalogStatus, String> {
    apply_site_adapter_catalog_bootstrap(&request.payload)
}

#[tauri::command]
pub fn site_clear_adapter_catalog_cache() -> Result<SiteAdapterCatalogStatus, String> {
    clear_site_adapter_catalog_cache()
}

#[tauri::command]
pub fn site_import_adapter_yaml_bundle(
    request: SiteAdapterImportYamlBundleRequest,
) -> Result<PersistImportedCatalogResult, String> {
    import_imported_yaml_adapter_bundle_to_default_dir(
        &request.yaml_bundle,
        &ImportedYamlCompileOptions {
            read_only: request.read_only,
            source_version: request.source_version,
        },
        request.catalog_version,
    )
}

#[tauri::command]
pub async fn site_run_adapter(
    db: State<'_, DbConnection>,
    request: RunSiteAdapterRequest,
) -> Result<SiteAdapterRunResult, String> {
    Ok(run_site_adapter_with_optional_save(db.inner(), request).await)
}

#[tauri::command]
pub async fn site_debug_run_adapter(
    db: State<'_, DbConnection>,
    request: RunSiteAdapterRequest,
) -> Result<SiteAdapterRunResult, String> {
    Ok(run_site_adapter(db.inner(), request).await)
}

#[tauri::command]
pub fn site_save_adapter_result(
    db: State<'_, DbConnection>,
    request: SaveSiteAdapterResultRequest,
) -> Result<SavedSiteAdapterContent, String> {
    save_existing_site_result_to_project(db.inner(), request)
}
