//! Agent App 安装、package cache 与生命周期命令。
//!
//! 这里不实现 Agent App 规范投影；投影和 readiness 继续由前端 current
//! Agent App 主链负责。本模块只提供受控文件读取、package fetch / staging
//! 与 installed state 持久化。

use crate::app::AppState;
use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::database::DbConnection;
use chrono::Utc;
use lime_core::agent_app_runtime_token::issue_agent_app_runtime_token;
use lime_core::config::Config;
use lime_core::database::dao::api_key_provider::{
    ApiKeyProvider, ApiProviderType, ProviderWithKeys,
};
use lime_services::api_key_provider_service::ApiKeyProviderService;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{self, Cursor};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tokio::time::{sleep, Duration, Instant};
use url::Url;
use zip::ZipArchive;

const AGENT_APP_DATA_DIR: &str = "agent-apps";
const INSTALLED_STATE_SCHEMA_VERSION: u32 = 1;
const AGENT_APP_UI_RUNTIME_STARTUP_TIMEOUT_SECS: u64 = 10;
const AGENT_APP_UI_RUNTIME_TOKEN_TTL_SECS: u64 = 12 * 60 * 60;

static AGENT_APP_UI_RUNTIMES: Lazy<Mutex<HashMap<String, AgentAppUiRuntimeProcess>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppLocalPackageInspection {
    pub source_kind: String,
    pub source_uri: String,
    pub app_dir: String,
    pub app_markdown: String,
    pub manifest: Value,
    pub manifest_hash: String,
    pub package_hash: String,
    pub inspected_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppFetchCloudPackageRequest {
    pub descriptor: AgentAppCloudReleaseDescriptor,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppCloudReleaseDescriptor {
    pub source_uri: String,
    pub app_id: String,
    pub version: String,
    pub release_id: Option<String>,
    pub tenant_id: Option<String>,
    pub tenant_enablement_ref: Option<String>,
    pub channel: Option<String>,
    pub package_url: String,
    pub package_hash: String,
    pub manifest_hash: String,
    pub signature_ref: Option<String>,
    pub loaded_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppPackageCacheEntry {
    pub app_id: String,
    pub identity: AgentAppPackageIdentity,
    pub manifest_snapshot: Value,
    pub package_hash: String,
    pub manifest_hash: String,
    pub cache_path: String,
    pub cached_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppPackageIdentity {
    pub source_kind: String,
    pub source_uri: String,
    pub app_id: String,
    pub app_version: String,
    pub package_hash: String,
    pub manifest_hash: String,
    pub loaded_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tenant_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tenant_enablement_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature_ref: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveInstalledAgentAppStateRequest {
    pub state: Value,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetAgentAppDisabledRequest {
    pub app_id: String,
    pub disabled: bool,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallRehearsalRequest {
    pub app_id: String,
    pub mode: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallRequest {
    pub app_id: String,
    pub mode: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUiRuntimeStartRequest {
    pub app_id: String,
    pub entry_key: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUiRuntimeStatusRequest {
    pub app_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUiRuntimeStopRequest {
    pub app_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUiRuntimeStatus {
    pub app_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entry_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<String>,
}

#[derive(Debug, Clone)]
struct AgentAppUiRuntimeEntry {
    entry_key: String,
    route: String,
}

#[derive(Debug)]
struct AgentAppUiRuntimeProcess {
    child: Child,
    app_dir: PathBuf,
    port: u16,
    base_url: String,
    entry_key: String,
    route: String,
    started_at: String,
}

#[derive(Debug, Clone, Default)]
struct AgentAppUiRuntimeEnv {
    values: HashMap<String, String>,
}

#[derive(Debug, Clone)]
struct AgentAppModelBinding {
    provider_id: String,
    api_host: String,
    protocol: String,
    model: Option<String>,
    access_token: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAgentAppStateListResult {
    pub states: Vec<Value>,
    pub issues: Vec<InstalledAgentAppStatePersistenceIssue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAgentAppStatePersistenceIssue {
    pub code: String,
    pub path: String,
    pub message: String,
    pub app_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstalledAgentAppStateEnvelope {
    schema_version: u32,
    saved_at: String,
    state: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallRehearsalResult {
    pub app_id: String,
    pub mode: String,
    pub generated_at: String,
    pub deleted_target_count: usize,
    pub retained_target_count: usize,
    pub targets: Vec<AgentAppUninstallRehearsalTarget>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallResult {
    pub rehearsal: AgentAppUninstallRehearsalResult,
    pub list: InstalledAgentAppStateListResult,
    pub removed_target_count: usize,
    pub missing_target_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppUninstallRehearsalTarget {
    pub kind: String,
    pub value: String,
    pub safe_to_delete: bool,
    pub action: String,
    pub reason: String,
}

#[tauri::command]
pub async fn agent_app_inspect_local_package(
    app_dir: String,
) -> Result<AgentAppLocalPackageInspection, String> {
    let app_dir_path = canonicalize_existing_dir(&app_dir)?;
    let app_markdown_path = app_dir_path.join("APP.md");
    let app_markdown = fs::read_to_string(&app_markdown_path)
        .map_err(|error| format!("读取 Agent App APP.md 失败: {error}"))?;
    let manifest = parse_app_markdown_frontmatter(&app_markdown)?;
    let inspected_at = now_iso();
    let manifest_hash = sha256_json_value(&manifest)?;
    let package_hash = sha256_package(&app_dir_path, &manifest)?;

    Ok(AgentAppLocalPackageInspection {
        source_kind: "local_folder".to_string(),
        source_uri: app_dir_path.to_string_lossy().to_string(),
        app_dir: app_dir_path.to_string_lossy().to_string(),
        app_markdown,
        manifest,
        manifest_hash,
        package_hash,
        inspected_at,
    })
}

#[tauri::command]
pub async fn agent_app_fetch_cloud_package(
    request: AgentAppFetchCloudPackageRequest,
) -> Result<AgentAppPackageCacheEntry, String> {
    let descriptor = request.descriptor;
    validate_cloud_release_descriptor(&descriptor)?;
    let bytes = download_agent_app_package(&descriptor.package_url).await?;
    let actual_package_hash = sha256_prefixed(&bytes);
    if actual_package_hash != descriptor.package_hash {
        return Err(format!(
            "Agent App package hash mismatch for {}@{}: expected {}, got {}",
            descriptor.app_id, descriptor.version, descriptor.package_hash, actual_package_hash
        ));
    }

    let data_root = agent_app_data_dir()?;
    let cache_dir = package_cache_dir(&descriptor.package_hash)?;
    let staging_dir = data_root.join("staging").join(format!(
        "{}-{}",
        descriptor.app_id,
        safe_hash_path_segment(&descriptor.package_hash)
    ));
    if staging_dir.exists() {
        fs::remove_dir_all(&staging_dir).map_err(|error| {
            format!(
                "清理 Agent App package staging 目录失败 {}: {error}",
                staging_dir.display()
            )
        })?;
    }
    fs::create_dir_all(&staging_dir)
        .map_err(|error| format!("创建 Agent App package staging 目录失败: {error}"))?;
    let staging_cleanup_dir = staging_dir.clone();
    scopeguard::defer! {
        if staging_cleanup_dir.exists() {
            let _ = fs::remove_dir_all(&staging_cleanup_dir);
        }
    }

    extract_agent_app_package_archive(&bytes, &staging_dir)?;
    let extracted_root = find_agent_app_package_root(&staging_dir)?;
    let app_markdown_path = extracted_root.join("APP.md");
    let app_markdown_bytes = fs::read(&app_markdown_path).map_err(|error| {
        format!(
            "读取 Agent App package APP.md 失败 {}: {error}",
            app_markdown_path.display()
        )
    })?;
    let actual_manifest_hash = sha256_prefixed(&app_markdown_bytes);
    if actual_manifest_hash != descriptor.manifest_hash {
        return Err(format!(
            "Agent App manifest hash mismatch for {}@{}: expected {}, got {}",
            descriptor.app_id, descriptor.version, descriptor.manifest_hash, actual_manifest_hash
        ));
    }
    let app_markdown = String::from_utf8(app_markdown_bytes)
        .map_err(|error| format!("Agent App APP.md 必须是 UTF-8: {error}"))?;
    let manifest = parse_app_markdown_frontmatter(&app_markdown)?;
    ensure_manifest_matches_cloud_release(&manifest, &descriptor)?;

    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir).map_err(|error| {
            format!(
                "清理旧 Agent App package cache 目录失败 {}: {error}",
                cache_dir.display()
            )
        })?;
    }
    if let Some(parent) = cache_dir.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "创建 Agent App package cache 目录失败 {}: {error}",
                parent.display()
            )
        })?;
    }
    fs::rename(&extracted_root, &cache_dir).map_err(|error| {
        format!(
            "写入 Agent App package cache 失败 {} -> {}: {error}",
            extracted_root.display(),
            cache_dir.display()
        )
    })?;

    let cached_at = now_iso();
    Ok(AgentAppPackageCacheEntry {
        app_id: descriptor.app_id.clone(),
        identity: AgentAppPackageIdentity {
            source_kind: "cloud_release".to_string(),
            source_uri: descriptor.source_uri.clone(),
            app_id: descriptor.app_id.clone(),
            app_version: descriptor.version.clone(),
            package_hash: descriptor.package_hash.clone(),
            manifest_hash: descriptor.manifest_hash.clone(),
            loaded_at: descriptor.loaded_at.clone(),
            release_id: descriptor.release_id.clone(),
            tenant_id: descriptor.tenant_id.clone(),
            tenant_enablement_ref: descriptor.tenant_enablement_ref.clone(),
            channel: descriptor.channel.clone(),
            signature_ref: descriptor.signature_ref.clone(),
        },
        manifest_snapshot: manifest,
        package_hash: descriptor.package_hash,
        manifest_hash: descriptor.manifest_hash,
        cache_path: cache_dir.to_string_lossy().to_string(),
        cached_at,
    })
}

#[tauri::command]
pub async fn agent_app_save_installed_state(
    request: SaveInstalledAgentAppStateRequest,
) -> Result<Value, String> {
    let app_id = read_state_app_id(&request.state)?;
    validate_safe_app_id(&app_id)?;
    let saved_at = now_iso();
    write_installed_state(&app_id, &request.state, &saved_at)?;
    Ok(request.state)
}

#[tauri::command]
pub async fn agent_app_list_installed() -> Result<InstalledAgentAppStateListResult, String> {
    let installed_dir = installed_dir()?;
    fs::create_dir_all(&installed_dir)
        .map_err(|error| format!("创建 Agent App installed 目录失败: {error}"))?;

    let mut states = Vec::new();
    let mut issues = Vec::new();
    let entries = fs::read_dir(&installed_dir)
        .map_err(|error| format!("读取 Agent App installed 目录失败: {error}"))?;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                issues.push(issue(
                    "READ_FAILED",
                    installed_dir.to_string_lossy(),
                    format!("读取 installed 条目失败: {error}"),
                    None,
                ));
                continue;
            }
        };
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        match read_installed_state_path(&path) {
            Ok(Some(state)) => states.push(state),
            Ok(None) => {}
            Err(error) => issues.push(issue("PARSE_FAILED", path.to_string_lossy(), error, None)),
        }
    }
    states.sort_by(|left, right| {
        read_string(left, &["appId"])
            .unwrap_or_default()
            .cmp(&read_string(right, &["appId"]).unwrap_or_default())
    });

    Ok(InstalledAgentAppStateListResult { states, issues })
}

#[tauri::command]
pub async fn agent_app_set_disabled(
    request: SetAgentAppDisabledRequest,
) -> Result<InstalledAgentAppStateListResult, String> {
    validate_safe_app_id(&request.app_id)?;
    let path = installed_state_path(&request.app_id)?;
    let Some(mut state) = read_installed_state_path(&path)? else {
        return Err(format!("Agent App 未安装: {}", request.app_id));
    };
    let updated_at = request.updated_at.unwrap_or_else(now_iso);
    set_object_field(&mut state, "disabled", Value::Bool(request.disabled))?;
    set_object_field(&mut state, "updatedAt", Value::String(updated_at.clone()))?;
    write_installed_state(&request.app_id, &state, &updated_at)?;
    agent_app_list_installed().await
}

#[tauri::command]
pub async fn agent_app_uninstall_rehearsal(
    request: AgentAppUninstallRehearsalRequest,
) -> Result<AgentAppUninstallRehearsalResult, String> {
    build_agent_app_uninstall_rehearsal(request.app_id, request.mode)
}

#[tauri::command]
pub async fn agent_app_uninstall(
    request: AgentAppUninstallRequest,
) -> Result<AgentAppUninstallResult, String> {
    let rehearsal = build_agent_app_uninstall_rehearsal(request.app_id, request.mode)?;

    // P17.3 只允许卸载演练；真实 delete-data 需要后续路线图单独打开。
    Ok(AgentAppUninstallResult {
        rehearsal,
        list: agent_app_list_installed().await?,
        removed_target_count: 0,
        missing_target_count: 0,
    })
}

#[tauri::command]
pub async fn agent_app_start_ui_runtime(
    request: AgentAppUiRuntimeStartRequest,
    state: tauri::State<'_, AppState>,
    db: tauri::State<'_, DbConnection>,
    api_key_provider_service: tauri::State<'_, ApiKeyProviderServiceState>,
) -> Result<AgentAppUiRuntimeStatus, String> {
    let config = { state.read().await.config.clone() };
    let runtime_env = build_agent_app_ui_runtime_env(
        &request.app_id,
        &config,
        Some(&db),
        Some(api_key_provider_service.0.as_ref()),
    );
    start_agent_app_ui_runtime_with_env(request, runtime_env).await
}

#[cfg(debug_assertions)]
pub async fn agent_app_start_ui_runtime_for_dev_bridge(
    request: AgentAppUiRuntimeStartRequest,
    config: &Config,
    db: Option<&DbConnection>,
    api_key_provider_service: Option<&ApiKeyProviderService>,
) -> Result<AgentAppUiRuntimeStatus, String> {
    let runtime_env =
        build_agent_app_ui_runtime_env(&request.app_id, config, db, api_key_provider_service);
    start_agent_app_ui_runtime_with_env(request, runtime_env).await
}

async fn start_agent_app_ui_runtime_with_env(
    request: AgentAppUiRuntimeStartRequest,
    runtime_env: AgentAppUiRuntimeEnv,
) -> Result<AgentAppUiRuntimeStatus, String> {
    validate_safe_app_id(&request.app_id)?;
    let state = read_installed_agent_app_state(&request.app_id)?;
    let app_dir = resolve_agent_app_runtime_dir(&state)?;
    ensure_agent_app_runtime_folder(&app_dir)?;
    let entry = resolve_ui_runtime_entry(&state, request.entry_key.as_deref())?;

    if let Some(status) = running_runtime_status(&request.app_id, Some(&entry))? {
        return Ok(status);
    }

    let port = reserve_local_port()?;
    let base_url = format!("http://127.0.0.1:{port}");
    let mut child = spawn_agent_app_ui_process(&app_dir, port, &runtime_env)?;
    wait_for_agent_app_ui_runtime_ready(&mut child, &base_url).await?;
    let pid = child.id();
    let process = AgentAppUiRuntimeProcess {
        child,
        app_dir,
        port,
        base_url: base_url.clone(),
        entry_key: entry.entry_key.clone(),
        route: entry.route.clone(),
        started_at: now_iso(),
    };
    let mut registry = runtime_registry()?;
    registry.insert(request.app_id.clone(), process);

    Ok(AgentAppUiRuntimeStatus {
        app_id: request.app_id,
        status: "running".to_string(),
        base_url: Some(base_url.clone()),
        entry_url: Some(join_runtime_url(&base_url, &entry.route)),
        port: Some(port),
        pid: Some(pid),
        message: None,
        entry_key: Some(entry.entry_key),
        route: Some(entry.route),
    })
}

#[tauri::command]
pub async fn agent_app_get_ui_runtime_status(
    request: AgentAppUiRuntimeStatusRequest,
) -> Result<AgentAppUiRuntimeStatus, String> {
    validate_safe_app_id(&request.app_id)?;
    if let Some(status) = running_runtime_status(&request.app_id, None)? {
        return Ok(status);
    }
    Ok(AgentAppUiRuntimeStatus {
        app_id: request.app_id,
        status: "stopped".to_string(),
        base_url: None,
        entry_url: None,
        port: None,
        pid: None,
        message: Some("Agent App UI runtime 未启动。".to_string()),
        entry_key: None,
        route: None,
    })
}

#[tauri::command]
pub async fn agent_app_stop_ui_runtime(
    request: AgentAppUiRuntimeStopRequest,
) -> Result<AgentAppUiRuntimeStatus, String> {
    validate_safe_app_id(&request.app_id)?;
    let mut registry = runtime_registry()?;
    let Some(mut process) = registry.remove(&request.app_id) else {
        return Ok(AgentAppUiRuntimeStatus {
            app_id: request.app_id,
            status: "stopped".to_string(),
            base_url: None,
            entry_url: None,
            port: None,
            pid: None,
            message: Some("Agent App UI runtime 未启动。".to_string()),
            entry_key: None,
            route: None,
        });
    };
    drop(registry);

    let pid = process.child.id();
    let _ = process.child.kill();
    let _ = process.child.wait();

    Ok(AgentAppUiRuntimeStatus {
        app_id: request.app_id,
        status: "stopped".to_string(),
        base_url: Some(process.base_url),
        entry_url: None,
        port: Some(process.port),
        pid: Some(pid),
        message: Some("Agent App UI runtime 已停止。".to_string()),
        entry_key: Some(process.entry_key),
        route: Some(process.route),
    })
}

fn build_agent_app_uninstall_rehearsal(
    app_id: String,
    mode: String,
) -> Result<AgentAppUninstallRehearsalResult, String> {
    validate_safe_app_id(&app_id)?;
    let mode = match mode.as_str() {
        "keep-data" | "delete-data" => mode,
        other => return Err(format!("不支持的 Agent App 卸载演练模式: {other}")),
    };
    let path = installed_state_path(&app_id)?;
    let Some(state) = read_installed_state_path(&path)? else {
        return Err(format!("Agent App 未安装: {}", app_id));
    };

    let package_hash = read_string(&state, &["identity", "packageHash"])
        .unwrap_or_else(|| "unknown-package".to_string());
    let storage_namespace = read_string(&state, &["projection", "storage", "namespace"])
        .unwrap_or_else(|| app_id.clone());
    let base = agent_app_data_dir()?.to_string_lossy().to_string();

    let mut targets = vec![
        target(
            "path",
            format!("{base}/installed/{app_id}.json"),
            true,
            "delete",
            "Installed Agent App state snapshot.",
        ),
        target(
            "path",
            format!("{base}/setup/{app_id}.json"),
            true,
            "delete",
            "Installed setup binding state.",
        ),
        target(
            "path",
            format!("{base}/packages/{package_hash}"),
            true,
            "delete",
            "Cached runtime package for this Agent App.",
        ),
        target(
            "path",
            format!("{base}/package-index/{app_id}.json"),
            true,
            "delete",
            "Package cache index.",
        ),
        target(
            "path",
            format!("{base}/projections/{app_id}.json"),
            true,
            "delete",
            "Generated projection snapshot.",
        ),
        target(
            "path",
            format!("{base}/readiness/{app_id}.json"),
            true,
            "delete",
            "Readiness snapshot.",
        ),
        target(
            "path",
            format!("{base}/logs/{app_id}"),
            true,
            "delete",
            "Agent App host logs.",
        ),
    ];
    let data_action = if mode == "delete-data" {
        "delete"
    } else {
        "retain"
    };
    targets.push(target(
        "namespace",
        format!("{base}/storage/{storage_namespace}"),
        true,
        data_action,
        "App storage namespace declared by manifest.",
    ));
    targets.push(target(
        "path",
        format!("{base}/exports/{app_id}"),
        true,
        data_action,
        "Optional user exports for this Agent App.",
    ));

    let deleted_target_count = targets
        .iter()
        .filter(|target| target.action == "delete")
        .count();
    let retained_target_count = targets
        .iter()
        .filter(|target| target.action == "retain")
        .count();

    Ok(AgentAppUninstallRehearsalResult {
        app_id,
        mode,
        generated_at: now_iso(),
        deleted_target_count,
        retained_target_count,
        targets,
        warnings: vec!["DRY_RUN_ONLY".to_string()],
    })
}

fn read_installed_agent_app_state(app_id: &str) -> Result<Value, String> {
    let path = installed_state_path(app_id)?;
    read_installed_state_path(&path)?.ok_or_else(|| format!("Agent App 未安装: {app_id}"))
}

fn validate_cloud_release_descriptor(
    descriptor: &AgentAppCloudReleaseDescriptor,
) -> Result<(), String> {
    validate_safe_app_id(&descriptor.app_id)?;
    let url = Url::parse(&descriptor.package_url)
        .map_err(|error| format!("Agent App packageUrl 非法: {error}"))?;
    if url.scheme() != "https" {
        return Err("Agent App packageUrl 必须使用 https。".to_string());
    }
    if descriptor.source_uri != descriptor.package_url {
        return Err("Agent App release descriptor sourceUri 必须等于 packageUrl。".to_string());
    }
    validate_sha256_hash("packageHash", &descriptor.package_hash)?;
    validate_sha256_hash("manifestHash", &descriptor.manifest_hash)?;
    Ok(())
}

fn validate_sha256_hash(field: &str, value: &str) -> Result<(), String> {
    let Some(hex) = value.strip_prefix("sha256:") else {
        return Err(format!("Agent App {field} 必须使用 sha256:<64 hex> 格式。"));
    };
    if hex.len() == 64 && hex.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Ok(());
    }
    Err(format!("Agent App {field} 必须使用 sha256:<64 hex> 格式。"))
}

async fn download_agent_app_package(package_url: &str) -> Result<Vec<u8>, String> {
    let response = reqwest::get(package_url)
        .await
        .map_err(|error| format!("下载 Agent App package 失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "下载 Agent App package 失败，HTTP 状态: {}",
            response.status()
        ));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取 Agent App package 响应失败: {error}"))?;
    Ok(bytes.to_vec())
}

fn extract_agent_app_package_archive(bytes: &[u8], staging_dir: &Path) -> Result<(), String> {
    let reader = Cursor::new(bytes);
    let mut archive = ZipArchive::new(reader)
        .map_err(|error| format!("Agent App package 必须是 zip/lapp 格式: {error}"))?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("读取 Agent App package 条目失败: {error}"))?;
        let enclosed = file
            .enclosed_name()
            .map(PathBuf::from)
            .ok_or_else(|| format!("Agent App package 包含不安全路径: {}", file.name()))?;
        let out_path = staging_dir.join(enclosed);
        if file.name().ends_with('/') {
            fs::create_dir_all(&out_path).map_err(|error| {
                format!(
                    "创建 Agent App package 目录失败 {}: {error}",
                    out_path.display()
                )
            })?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "创建 Agent App package 父目录失败 {}: {error}",
                    parent.display()
                )
            })?;
        }
        let mut output = fs::File::create(&out_path).map_err(|error| {
            format!(
                "写入 Agent App package 文件失败 {}: {error}",
                out_path.display()
            )
        })?;
        io::copy(&mut file, &mut output).map_err(|error| {
            format!(
                "解压 Agent App package 文件失败 {}: {error}",
                out_path.display()
            )
        })?;
    }
    Ok(())
}

fn find_agent_app_package_root(staging_dir: &Path) -> Result<PathBuf, String> {
    if staging_dir.join("APP.md").is_file() {
        return Ok(staging_dir.to_path_buf());
    }
    let mut matches = Vec::new();
    collect_agent_app_roots(staging_dir, &mut matches)?;
    matches.sort();
    matches.dedup();
    match matches.len() {
        0 => Err("Agent App package 缺少 APP.md。".to_string()),
        1 => Ok(matches.remove(0)),
        _ => Err("Agent App package 包含多个 APP.md，无法确定 package root。".to_string()),
    }
}

fn collect_agent_app_roots(dir: &Path, matches: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(dir)
        .map_err(|error| format!("读取 Agent App package 目录失败 {}: {error}", dir.display()))?
    {
        let entry = entry.map_err(|error| format!("读取 Agent App package 条目失败: {error}"))?;
        let path = entry.path();
        if path.is_dir() {
            if path.join("APP.md").is_file() {
                matches.push(path.clone());
            }
            collect_agent_app_roots(&path, matches)?;
        }
    }
    Ok(())
}

fn ensure_manifest_matches_cloud_release(
    manifest: &Value,
    descriptor: &AgentAppCloudReleaseDescriptor,
) -> Result<(), String> {
    let manifest_app_id =
        read_string(manifest, &["name"]).or_else(|| read_string(manifest, &["appId"]));
    if manifest_app_id.as_deref() != Some(descriptor.app_id.as_str()) {
        return Err(format!(
            "Agent App package manifest appId 与 release descriptor 不一致: expected {}",
            descriptor.app_id
        ));
    }
    let manifest_version = read_string(manifest, &["version"]);
    if manifest_version.as_deref() != Some(descriptor.version.as_str()) {
        return Err(format!(
            "Agent App package manifest version 与 release descriptor 不一致: expected {}",
            descriptor.version
        ));
    }
    Ok(())
}

fn resolve_agent_app_runtime_dir(state: &Value) -> Result<PathBuf, String> {
    let source_kind = read_string(state, &["identity", "sourceKind"])
        .ok_or_else(|| "Installed Agent App state 缺少 identity.sourceKind。".to_string())?;
    let app_id = read_state_app_id(state)?;
    if source_kind == "local_folder" {
        let source_uri = read_string(state, &["identity", "sourceUri"])
            .ok_or_else(|| "Installed Agent App state 缺少 identity.sourceUri。".to_string())?;
        let app_dir = canonicalize_existing_dir(&source_uri)?;
        ensure_agent_app_dir_matches_state(&app_dir, state)?;
        return Ok(app_dir);
    }

    if let Some(app_dir) = resolve_cached_agent_app_runtime_dir(state)? {
        return Ok(app_dir);
    }
    if let Some(app_dir) = resolve_configured_agent_app_runtime_dir(state)? {
        return Ok(app_dir);
    }
    if let Some(app_dir) = resolve_dev_agent_app_runtime_dir(state)? {
        return Ok(app_dir);
    }

    Err(format!(
        "Agent App UI runtime 未找到 {app_id} 的本地 runtime package；当前来源是 {source_kind}。请先完成云端包下载/解包，或从本地 APP.md 目录重新安装该 App。"
    ))
}

fn resolve_cached_agent_app_runtime_dir(state: &Value) -> Result<Option<PathBuf>, String> {
    let app_id = read_state_app_id(state)?;
    let mut candidates = Vec::new();
    let data_root = agent_app_data_dir()?;
    candidates.push(data_root.join("packages").join(&app_id));
    candidates.push(data_root.join("staging").join(&app_id));
    if let Some(package_hash) = read_string(state, &["identity", "packageHash"]) {
        candidates.push(data_root.join("packages").join(&package_hash));
        candidates.push(
            data_root
                .join("packages")
                .join(package_hash.replace(':', "_")),
        );
    }
    find_matching_agent_app_dir(candidates, state)
}

fn resolve_configured_agent_app_runtime_dir(state: &Value) -> Result<Option<PathBuf>, String> {
    let app_id = read_state_app_id(state)?;
    let Some(raw_roots) = std::env::var_os("LIME_AGENT_APP_LOCAL_ROOTS") else {
        return Ok(None);
    };
    let mut candidates = Vec::new();
    for root in std::env::split_paths(&raw_roots) {
        candidates.push(root.clone());
        candidates.push(root.join(&app_id));
    }
    find_matching_agent_app_dir(candidates, state)
}

fn resolve_dev_agent_app_runtime_dir(state: &Value) -> Result<Option<PathBuf>, String> {
    let app_id = read_state_app_id(state)?;
    let mut candidates = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        push_dev_agent_app_candidates(&mut candidates, &current_dir, &app_id);
    }
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            push_dev_agent_app_candidates(&mut candidates, parent, &app_id);
        }
    }
    find_matching_agent_app_dir(candidates, state)
}

fn push_dev_agent_app_candidates(candidates: &mut Vec<PathBuf>, start: &Path, app_id: &str) {
    for ancestor in start.ancestors().take(8) {
        candidates.push(ancestor.join("limecloud").join(app_id));
        candidates.push(ancestor.join("limecloud").join("apps").join(app_id));
        candidates.push(ancestor.join(app_id));
    }
}

fn find_matching_agent_app_dir(
    candidates: Vec<PathBuf>,
    state: &Value,
) -> Result<Option<PathBuf>, String> {
    for candidate in candidates {
        let Ok(canonical) = fs::canonicalize(&candidate) else {
            continue;
        };
        if !canonical.is_dir() {
            continue;
        }
        if ensure_agent_app_dir_matches_state(&canonical, state).is_ok() {
            return Ok(Some(canonical));
        }
    }
    Ok(None)
}

fn ensure_agent_app_dir_matches_state(app_dir: &Path, state: &Value) -> Result<(), String> {
    ensure_agent_app_runtime_folder(app_dir)?;
    let app_id = read_state_app_id(state)?;
    let manifest_path = app_dir.join("APP.md");
    let app_markdown = fs::read_to_string(&manifest_path).map_err(|error| {
        format!(
            "读取 Agent App APP.md 失败 {}: {error}",
            manifest_path.display()
        )
    })?;
    let manifest = parse_app_markdown_frontmatter(&app_markdown)?;
    let manifest_app_id =
        read_string(&manifest, &["name"]).or_else(|| read_string(&manifest, &["appId"]));
    if manifest_app_id.as_deref() != Some(app_id.as_str()) {
        return Err(format!(
            "Agent App 本地目录 {} 的 manifest name 与已安装 appId 不一致。",
            app_dir.display()
        ));
    }
    Ok(())
}

fn ensure_agent_app_runtime_folder(app_dir: &Path) -> Result<(), String> {
    let app_markdown = app_dir.join("APP.md");
    if !app_markdown.is_file() {
        return Err(format!(
            "Agent App 本地目录缺少 APP.md: {}",
            app_markdown.display()
        ));
    }
    let package_json = app_dir.join("package.json");
    if !package_json.is_file() {
        return Err(format!(
            "Agent App 本地 UI runtime 缺少 package.json: {}",
            package_json.display()
        ));
    }
    Ok(())
}

fn resolve_ui_runtime_entry(
    state: &Value,
    requested_entry_key: Option<&str>,
) -> Result<AgentAppUiRuntimeEntry, String> {
    let entries = state
        .get("projection")
        .and_then(|value| value.get("entries"))
        .and_then(|value| value.as_array())
        .ok_or_else(|| "Installed Agent App state 缺少 projection.entries。".to_string())?;

    let selected = if let Some(entry_key) = requested_entry_key {
        entries
            .iter()
            .find(|entry| read_string(entry, &["key"]).as_deref() == Some(entry_key))
            .ok_or_else(|| format!("Agent App UI entry 不存在: {entry_key}"))?
    } else {
        entries
            .iter()
            .find(|entry| read_string(entry, &["key"]).as_deref() == Some("dashboard"))
            .or_else(|| entries.iter().find(|entry| is_ui_runtime_entry(entry)))
            .or_else(|| entries.first())
            .ok_or_else(|| "Agent App manifest 没有声明可打开入口。".to_string())?
    };

    if !is_ui_runtime_entry(selected) {
        let entry_key = read_string(selected, &["key"]).unwrap_or_else(|| "unknown".to_string());
        return Err(format!(
            "Agent App entry 不是可嵌入 UI 页面入口: {entry_key}"
        ));
    }

    let entry_key =
        read_string(selected, &["key"]).ok_or_else(|| "Agent App entry 缺少 key。".to_string())?;
    let route = normalize_runtime_route(
        read_string(selected, &["route"])
            .unwrap_or_else(|| format!("/{entry_key}"))
            .as_str(),
    )?;
    Ok(AgentAppUiRuntimeEntry { entry_key, route })
}

fn is_ui_runtime_entry(entry: &Value) -> bool {
    matches!(
        read_string(entry, &["kind"]).as_deref(),
        Some("page" | "panel" | "settings")
    )
}

fn normalize_runtime_route(route: &str) -> Result<String, String> {
    let trimmed = route.trim();
    if trimmed.is_empty() {
        return Ok("/".to_string());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Err("Agent App UI entry route 必须是本地 runtime 相对路径。".to_string());
    }
    if trimmed.starts_with('/') {
        return Ok(trimmed.to_string());
    }
    Ok(format!("/{trimmed}"))
}

fn reserve_local_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("分配 Agent App UI runtime 端口失败: {error}"))?;
    listener
        .local_addr()
        .map(|addr| addr.port())
        .map_err(|error| format!("读取 Agent App UI runtime 端口失败: {error}"))
}

fn build_agent_app_ui_runtime_env(
    app_id: &str,
    config: &Config,
    db: Option<&DbConnection>,
    api_key_provider_service: Option<&ApiKeyProviderService>,
) -> AgentAppUiRuntimeEnv {
    let mut env = AgentAppUiRuntimeEnv::default();
    let Some(binding) =
        resolve_agent_app_model_binding(config, db, api_key_provider_service, app_id)
    else {
        return env;
    };

    insert_runtime_env(&mut env, "LIME_GATEWAY_PROVIDER", &binding.provider_id);
    insert_runtime_env(&mut env, "LIME_GATEWAY_BASE", &binding.api_host);
    insert_runtime_env(&mut env, "LIME_GATEWAY_PROTOCOL", &binding.protocol);
    if let Some(model) = binding.model.as_deref() {
        insert_runtime_env(&mut env, "LIME_MODEL", model);
    }
    if let Some(access_token) = binding.access_token.as_deref() {
        insert_runtime_env(&mut env, "LIME_ACCESS_TOKEN", access_token);
        insert_runtime_env(&mut env, "OPENAI_API_KEY", access_token);
    }
    insert_runtime_env(&mut env, "OPENAI_BASE_URL", &binding.api_host);

    env
}

fn insert_runtime_env(env: &mut AgentAppUiRuntimeEnv, key: &str, value: &str) {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return;
    }
    env.values.insert(key.to_string(), trimmed.to_string());
}

fn process_env_has_value(key: &str) -> bool {
    std::env::var(key)
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
}

fn resolve_agent_app_model_binding(
    config: &Config,
    db: Option<&DbConnection>,
    api_key_provider_service: Option<&ApiKeyProviderService>,
    app_id: &str,
) -> Option<AgentAppModelBinding> {
    let service = api_key_provider_service?;
    let db = db?;
    let providers = match service.get_all_providers(db) {
        Ok(providers) => providers,
        Err(error) => {
            tracing::warn!(
                "[AgentAppRuntime] 读取 Provider 配置失败，Agent App 将不注入 Lime Gateway 生成能力: {error}"
            );
            return None;
        }
    };
    let preferred_provider_id = preferred_generation_provider_id(config);
    let preferred_model = preferred_generation_model_id(config);

    let provider = preferred_provider_id
        .as_deref()
        .and_then(|provider_id| {
            providers.iter().find(|candidate| {
                candidate.provider.enabled
                    && (candidate.provider.id == provider_id
                        || candidate.provider.provider_type.to_string() == provider_id)
                    && provider_can_supply_agent_app_runtime(candidate, preferred_model.as_deref())
            })
        })
        .or_else(|| {
            providers.iter().find(|candidate| {
                provider_can_supply_agent_app_runtime(candidate, preferred_model.as_deref())
            })
        })?;

    Some(build_agent_app_model_binding(
        &provider.provider,
        local_gateway_base_url(config),
        issue_agent_app_model_generation_access_token(config, app_id),
        preferred_model.or_else(|| first_provider_model(&provider.provider)),
    ))
}

fn issue_agent_app_model_generation_access_token(config: &Config, app_id: &str) -> Option<String> {
    let secret = non_empty_string(Some(config.server.api_key.as_str()))?;
    match issue_agent_app_runtime_token(&secret, app_id, AGENT_APP_UI_RUNTIME_TOKEN_TTL_SECS) {
        Ok(token) => Some(token),
        Err(error) => {
            tracing::warn!(
                "[AgentAppRuntime] 生成 Agent App scoped model-generation token 失败，app_id={app_id}: {error}"
            );
            None
        }
    }
}

fn preferred_generation_provider_id(config: &Config) -> Option<String> {
    let generation = &config.workspace_preferences.service_models.generation_topic;
    non_empty_string(generation.preferred_provider_id.as_deref())
}

fn preferred_generation_model_id(config: &Config) -> Option<String> {
    let generation = &config.workspace_preferences.service_models.generation_topic;
    if !generation.enabled {
        return None;
    }
    non_empty_string(generation.preferred_model_id.as_deref())
}

fn provider_can_supply_agent_app_runtime(
    provider: &ProviderWithKeys,
    preferred_model: Option<&str>,
) -> bool {
    if !provider.provider.enabled {
        return false;
    }
    let has_model = preferred_model
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false)
        || first_provider_model(&provider.provider).is_some()
        || process_env_has_value("LIME_MODEL");
    let has_credential = provider.provider.provider_type == ApiProviderType::Ollama
        || provider.api_keys.iter().any(|key| key.enabled);
    has_model && has_credential
}

fn build_agent_app_model_binding(
    provider: &ApiKeyProvider,
    gateway_base: String,
    access_token: Option<String>,
    model: Option<String>,
) -> AgentAppModelBinding {
    AgentAppModelBinding {
        provider_id: provider.id.clone(),
        api_host: gateway_base,
        protocol: agent_app_protocol_for_provider(provider),
        model: model.and_then(|value| non_empty_string(Some(value.as_str()))),
        access_token: access_token.and_then(|value| non_empty_string(Some(value.as_str()))),
    }
}

fn local_gateway_base_url(config: &Config) -> String {
    let scheme = if config.server.tls.enable {
        "https"
    } else {
        "http"
    };
    let host = match config.server.host.trim() {
        "" | "0.0.0.0" | "::" | "[::]" => "127.0.0.1",
        value => value,
    };
    format!("{scheme}://{host}:{}", config.server.port)
}

fn agent_app_protocol_for_provider(_provider: &ApiKeyProvider) -> String {
    // Agent App 只拿到 Lime 本机 Gateway 的 scoped API key；上游 Provider 协议由 Lime Gateway 继续负责。
    "openai_chat".to_string()
}

fn first_provider_model(provider: &ApiKeyProvider) -> Option<String> {
    provider
        .custom_models
        .iter()
        .find_map(|model| non_empty_string(Some(model.as_str())))
}

fn non_empty_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn spawn_agent_app_ui_process(
    app_dir: &Path,
    port: u16,
    runtime_env: &AgentAppUiRuntimeEnv,
) -> Result<Child, String> {
    let binaries: &[&str] = if cfg!(windows) {
        &["npm.cmd", "npm"]
    } else {
        &["npm"]
    };
    let mut last_error = None;
    for binary in binaries {
        let mut command = Command::new(binary);
        command
            .args(["run", "dev", "--silent"])
            .current_dir(app_dir)
            .env("PORT", port.to_string());
        for key in inherited_agent_app_secret_env_keys() {
            command.env_remove(key);
        }
        command.envs(&runtime_env.values);
        match command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(child) => return Ok(child),
            Err(error) => last_error = Some(format!("{binary}: {error}")),
        }
    }
    Err(format!(
        "启动 Agent App UI runtime 失败，请确认已安装 Node.js/npm: {}",
        last_error.unwrap_or_else(|| "npm 不可用".to_string())
    ))
}

fn inherited_agent_app_secret_env_keys() -> &'static [&'static str] {
    &[
        "LIME_ACCESS_TOKEN",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "DEEPSEEK_API_KEY",
        "OPENROUTER_API_KEY",
        "MISTRAL_API_KEY",
        "XAI_API_KEY",
        "DASHSCOPE_API_KEY",
        "MOONSHOT_API_KEY",
        "ZHIPUAI_API_KEY",
        "GROQ_API_KEY",
        "FAL_KEY",
    ]
}

async fn wait_for_agent_app_ui_runtime_ready(
    child: &mut Child,
    base_url: &str,
) -> Result<(), String> {
    let health_url = format!("{base_url}/api/bootstrap");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(800))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let deadline = Instant::now() + Duration::from_secs(AGENT_APP_UI_RUNTIME_STARTUP_TIMEOUT_SECS);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return Err(format!("Agent App UI runtime 启动后退出: {status}"));
            }
            Ok(None) => {}
            Err(error) => {
                return Err(format!("检查 Agent App UI runtime 进程状态失败: {error}"));
            }
        }

        if let Ok(response) = client.get(&health_url).send().await {
            if response.status().is_success() {
                return Ok(());
            }
        }

        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!(
                "Agent App UI runtime 未在 {} 秒内就绪: {health_url}",
                AGENT_APP_UI_RUNTIME_STARTUP_TIMEOUT_SECS
            ));
        }
        sleep(Duration::from_millis(250)).await;
    }
}

fn running_runtime_status(
    app_id: &str,
    entry: Option<&AgentAppUiRuntimeEntry>,
) -> Result<Option<AgentAppUiRuntimeStatus>, String> {
    let mut registry = runtime_registry()?;
    let Some(process) = registry.get_mut(app_id) else {
        return Ok(None);
    };
    let pid = process.child.id();
    let mut remove_runtime = false;
    let status = match process.child.try_wait() {
        Ok(None) => {
            if let Some(entry) = entry {
                process.entry_key = entry.entry_key.clone();
                process.route = entry.route.clone();
            }
            let route = process.route.clone();
            let base_url = process.base_url.clone();
            AgentAppUiRuntimeStatus {
                app_id: app_id.to_string(),
                status: "running".to_string(),
                base_url: Some(base_url.clone()),
                entry_url: Some(join_runtime_url(&base_url, &route)),
                port: Some(process.port),
                pid: Some(pid),
                message: Some(format!(
                    "Agent App UI runtime 已运行，启动时间 {}，目录 {}。",
                    process.started_at,
                    process.app_dir.display()
                )),
                entry_key: Some(process.entry_key.clone()),
                route: Some(route),
            }
        }
        Ok(Some(status)) => {
            remove_runtime = true;
            AgentAppUiRuntimeStatus {
                app_id: app_id.to_string(),
                status: "failed".to_string(),
                base_url: None,
                entry_url: None,
                port: None,
                pid: Some(pid),
                message: Some(format!("Agent App UI runtime 已退出: {status}")),
                entry_key: None,
                route: None,
            }
        }
        Err(error) => {
            remove_runtime = true;
            AgentAppUiRuntimeStatus {
                app_id: app_id.to_string(),
                status: "failed".to_string(),
                base_url: None,
                entry_url: None,
                port: None,
                pid: Some(pid),
                message: Some(format!("读取 Agent App UI runtime 状态失败: {error}")),
                entry_key: None,
                route: None,
            }
        }
    };
    if remove_runtime {
        registry.remove(app_id);
    }
    Ok(Some(status))
}

fn runtime_registry(
) -> Result<std::sync::MutexGuard<'static, HashMap<String, AgentAppUiRuntimeProcess>>, String> {
    AGENT_APP_UI_RUNTIMES
        .lock()
        .map_err(|_| "Agent App UI runtime 状态锁已损坏。".to_string())
}

fn join_runtime_url(base_url: &str, route: &str) -> String {
    if route == "/" {
        return format!("{base_url}/");
    }
    format!("{base_url}{route}")
}

fn canonicalize_existing_dir(value: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    let canonical = fs::canonicalize(&path)
        .map_err(|error| format!("无法解析 Agent App 目录 {}: {error}", path.display()))?;
    if !canonical.is_dir() {
        return Err(format!("Agent App 路径不是目录: {}", canonical.display()));
    }
    Ok(canonical)
}

fn parse_app_markdown_frontmatter(markdown: &str) -> Result<Value, String> {
    let normalized = markdown.strip_prefix('\u{feff}').unwrap_or(markdown);
    let Some(rest) = normalized.strip_prefix("---") else {
        return Err("Agent App APP.md 缺少 YAML frontmatter。".to_string());
    };
    let rest = rest
        .strip_prefix('\n')
        .or_else(|| rest.strip_prefix("\r\n"))
        .unwrap_or(rest);
    let Some(end_index) = rest.find("\n---") else {
        return Err("Agent App APP.md frontmatter 未正确结束。".to_string());
    };
    let frontmatter = &rest[..end_index];
    let yaml_value: serde_yaml::Value = serde_yaml::from_str(frontmatter)
        .map_err(|error| format!("解析 Agent App frontmatter 失败: {error}"))?;
    serde_json::to_value(yaml_value)
        .map_err(|error| format!("转换 Agent App manifest 失败: {error}"))
}

fn sha256_json_value(value: &Value) -> Result<String, String> {
    let bytes =
        serde_json::to_vec(value).map_err(|error| format!("序列化 manifest 失败: {error}"))?;
    Ok(format!("sha256:{}", sha256_hex(&bytes)))
}

fn sha256_package(app_dir: &Path, manifest: &Value) -> Result<String, String> {
    let mut hasher = Sha256::new();
    hasher.update(
        serde_json::to_vec(manifest).map_err(|error| format!("序列化 manifest 失败: {error}"))?,
    );
    let app_markdown_path = app_dir.join("APP.md");
    if let Ok(bytes) = fs::read(&app_markdown_path) {
        hasher.update(bytes);
    }
    let package_json_path = app_dir.join("package.json");
    if let Ok(bytes) = fs::read(&package_json_path) {
        hasher.update(bytes);
    }
    Ok(format!("sha256:{}", hex::encode(hasher.finalize())))
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn sha256_prefixed(bytes: &[u8]) -> String {
    format!("sha256:{}", sha256_hex(bytes))
}

fn agent_app_data_dir() -> Result<PathBuf, String> {
    Ok(lime_core::app_paths::preferred_data_dir()?.join(AGENT_APP_DATA_DIR))
}

fn safe_hash_path_segment(hash: &str) -> String {
    hash.replace(':', "_")
}

fn package_cache_dir(package_hash: &str) -> Result<PathBuf, String> {
    validate_sha256_hash("packageHash", package_hash)?;
    Ok(agent_app_data_dir()?
        .join("packages")
        .join(safe_hash_path_segment(package_hash)))
}

fn installed_dir() -> Result<PathBuf, String> {
    Ok(agent_app_data_dir()?.join("installed"))
}

fn setup_dir() -> Result<PathBuf, String> {
    Ok(agent_app_data_dir()?.join("setup"))
}

fn installed_state_path(app_id: &str) -> Result<PathBuf, String> {
    validate_safe_app_id(app_id)?;
    Ok(installed_dir()?.join(format!("{app_id}.json")))
}

fn setup_state_path(app_id: &str) -> Result<PathBuf, String> {
    validate_safe_app_id(app_id)?;
    Ok(setup_dir()?.join(format!("{app_id}.json")))
}

fn validate_safe_app_id(app_id: &str) -> Result<(), String> {
    if app_id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
        && !app_id.is_empty()
    {
        return Ok(());
    }
    Err(format!("Agent App id 不安全: {app_id}"))
}

fn read_state_app_id(state: &Value) -> Result<String, String> {
    read_string(state, &["appId"])
        .ok_or_else(|| "Installed Agent App state 缺少 appId。".to_string())
}

fn read_string(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str().map(ToString::to_string)
}

fn write_installed_state(app_id: &str, state: &Value, saved_at: &str) -> Result<(), String> {
    fs::create_dir_all(installed_dir()?)
        .map_err(|error| format!("创建 Agent App installed 目录失败: {error}"))?;
    fs::create_dir_all(setup_dir()?)
        .map_err(|error| format!("创建 Agent App setup 目录失败: {error}"))?;

    let envelope = InstalledAgentAppStateEnvelope {
        schema_version: INSTALLED_STATE_SCHEMA_VERSION,
        saved_at: saved_at.to_string(),
        state: state.clone(),
    };
    let content = serde_json::to_string_pretty(&envelope)
        .map_err(|error| format!("序列化 installed state 失败: {error}"))?;
    fs::write(installed_state_path(app_id)?, content)
        .map_err(|error| format!("写入 installed state 失败: {error}"))?;

    let setup_content = serde_json::json!({
        "schemaVersion": INSTALLED_STATE_SCHEMA_VERSION,
        "appId": app_id,
        "savedAt": saved_at,
        "setup": state.get("setup").cloned().unwrap_or_else(|| serde_json::json!({})),
    });
    fs::write(
        setup_state_path(app_id)?,
        serde_json::to_string_pretty(&setup_content)
            .map_err(|error| format!("序列化 setup state 失败: {error}"))?,
    )
    .map_err(|error| format!("写入 setup state 失败: {error}"))?;
    Ok(())
}

fn read_installed_state_path(path: &Path) -> Result<Option<Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let content =
        fs::read_to_string(path).map_err(|error| format!("读取 installed state 失败: {error}"))?;
    let envelope: InstalledAgentAppStateEnvelope = serde_json::from_str(&content)
        .map_err(|error| format!("解析 installed state 失败: {error}"))?;
    if envelope.schema_version != INSTALLED_STATE_SCHEMA_VERSION {
        return Err(format!(
            "不支持的 Agent App installed state schemaVersion: {}",
            envelope.schema_version
        ));
    }
    Ok(Some(envelope.state))
}

fn set_object_field(value: &mut Value, key: &str, next: Value) -> Result<(), String> {
    let Some(object) = value.as_object_mut() else {
        return Err("Installed Agent App state 必须是对象。".to_string());
    };
    object.insert(key.to_string(), next);
    Ok(())
}

fn issue(
    code: impl Into<String>,
    path: impl ToString,
    message: impl Into<String>,
    app_id: Option<String>,
) -> InstalledAgentAppStatePersistenceIssue {
    InstalledAgentAppStatePersistenceIssue {
        code: code.into(),
        path: path.to_string(),
        message: message.into(),
        app_id,
    }
}

fn target(
    kind: impl Into<String>,
    value: impl Into<String>,
    safe_to_delete: bool,
    action: impl Into<String>,
    reason: impl Into<String>,
) -> AgentAppUninstallRehearsalTarget {
    AgentAppUninstallRehearsalTarget {
        kind: kind.into(),
        value: value.into(),
        safe_to_delete,
        action: action.into(),
        reason: reason.into(),
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_core::agent_app_runtime_token::{
        verify_agent_app_runtime_token, AGENT_APP_RUNTIME_SCOPE_MODEL_GENERATION,
    };
    use std::io::Write;
    use tempfile::tempdir;
    use zip::write::FileOptions;

    fn sample_app_markdown() -> &'static str {
        "---\nmanifestVersion: 0.3.0\nname: content-factory-app\nversion: 0.3.0\nentries:\n  - key: dashboard\n    kind: page\n---\n# 内容工厂\n"
    }

    fn sample_descriptor(
        package_hash: String,
        manifest_hash: String,
    ) -> AgentAppCloudReleaseDescriptor {
        AgentAppCloudReleaseDescriptor {
            source_uri: "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp"
                .to_string(),
            app_id: "content-factory-app".to_string(),
            version: "0.3.0".to_string(),
            release_id: Some("release-001".to_string()),
            tenant_id: Some("tenant-0001".to_string()),
            tenant_enablement_ref: Some("enablement-001".to_string()),
            channel: Some("stable".to_string()),
            package_url: "https://packages.limecloud.example/apps/content-factory-app-0.3.0.lapp"
                .to_string(),
            package_hash,
            manifest_hash,
            signature_ref: None,
            loaded_at: "2026-05-15T00:00:00.000Z".to_string(),
        }
    }

    fn build_sample_zip() -> Vec<u8> {
        let mut buffer = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut buffer);
            let options = FileOptions::default();
            zip.add_directory("content-factory-app/", options).unwrap();
            zip.start_file("content-factory-app/APP.md", options)
                .unwrap();
            zip.write_all(sample_app_markdown().as_bytes()).unwrap();
            zip.start_file("content-factory-app/package.json", options)
                .unwrap();
            zip.write_all(br#"{"scripts":{"dev":"vite"}}"#).unwrap();
            zip.finish().unwrap();
        }
        buffer.into_inner()
    }

    fn sample_provider(
        id: &str,
        provider_type: ApiProviderType,
        api_host: &str,
        custom_models: Vec<&str>,
    ) -> ApiKeyProvider {
        ApiKeyProvider {
            id: id.to_string(),
            name: id.to_string(),
            provider_type,
            api_host: api_host.to_string(),
            is_system: false,
            group: lime_core::database::dao::api_key_provider::ProviderGroup::Custom,
            enabled: true,
            sort_order: 0,
            api_version: None,
            project: None,
            location: None,
            region: None,
            custom_models: custom_models.into_iter().map(ToString::to_string).collect(),
            prompt_cache_mode: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn agent_app_protocol_uses_lime_gateway_openai_chat_surface() {
        let anthropic = sample_provider(
            "anthropic-compatible",
            ApiProviderType::AnthropicCompatible,
            "https://anthropic.example.com",
            vec!["claude-test"],
        );
        let openai = sample_provider(
            "new-api",
            ApiProviderType::NewApi,
            "https://relay.example.com/v1",
            vec!["gpt-test"],
        );
        let responses = sample_provider(
            "codex",
            ApiProviderType::Codex,
            "https://api.openai.com",
            vec!["gpt-5"],
        );

        assert_eq!(agent_app_protocol_for_provider(&anthropic), "openai_chat");
        assert_eq!(agent_app_protocol_for_provider(&openai), "openai_chat");
        assert_eq!(agent_app_protocol_for_provider(&responses), "openai_chat");
    }

    #[test]
    fn agent_app_model_binding_uses_provider_model_without_secret_in_message() {
        let provider = sample_provider(
            "content-provider",
            ApiProviderType::NewApi,
            "https://relay.example.com/v1",
            vec!["", "gpt-5.4-mini"],
        );
        let binding = build_agent_app_model_binding(
            &provider,
            "http://127.0.0.1:8999".to_string(),
            Some("local-gateway-token".to_string()),
            first_provider_model(&provider),
        );

        assert_eq!(binding.provider_id, "content-provider");
        assert_eq!(binding.api_host, "http://127.0.0.1:8999");
        assert_eq!(binding.protocol, "openai_chat");
        assert_eq!(binding.model.as_deref(), Some("gpt-5.4-mini"));
        assert_eq!(binding.access_token.as_deref(), Some("local-gateway-token"));
    }

    #[test]
    fn agent_app_model_generation_access_token_is_scoped_and_verifiable() {
        let mut config = Config::default();
        config.server.api_key = "server-gateway-secret".to_string();

        let token =
            issue_agent_app_model_generation_access_token(&config, "content-factory-app").unwrap();

        assert_ne!(token, config.server.api_key);
        let claims = verify_agent_app_runtime_token(&config.server.api_key, &token).unwrap();
        assert_eq!(claims.app_id, "content-factory-app");
        assert_eq!(claims.scope, AGENT_APP_RUNTIME_SCOPE_MODEL_GENERATION);
    }

    #[test]
    fn cloud_release_descriptor_requires_https_and_sha256_hashes() {
        let descriptor = sample_descriptor(
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb".to_string(),
        );
        validate_cloud_release_descriptor(&descriptor).unwrap();

        let mut bad_url = descriptor.clone();
        bad_url.package_url = "http://packages.example/app.lapp".to_string();
        bad_url.source_uri = bad_url.package_url.clone();
        assert!(validate_cloud_release_descriptor(&bad_url)
            .unwrap_err()
            .contains("https"));

        let mut bad_hash = descriptor;
        bad_hash.package_hash = "package-fnv1a-deadbeef".to_string();
        assert!(validate_cloud_release_descriptor(&bad_hash)
            .unwrap_err()
            .contains("sha256"));
    }

    #[test]
    fn extracts_zip_package_and_verifies_manifest_hash() {
        let zip_bytes = build_sample_zip();
        let package_hash = sha256_prefixed(&zip_bytes);
        let manifest_hash = sha256_prefixed(sample_app_markdown().as_bytes());
        let descriptor = sample_descriptor(package_hash, manifest_hash.clone());
        let temp = tempdir().unwrap();

        extract_agent_app_package_archive(&zip_bytes, temp.path()).unwrap();
        let root = find_agent_app_package_root(temp.path()).unwrap();
        let app_markdown = fs::read_to_string(root.join("APP.md")).unwrap();
        let manifest = parse_app_markdown_frontmatter(&app_markdown).unwrap();

        assert_eq!(sha256_prefixed(app_markdown.as_bytes()), manifest_hash);
        ensure_manifest_matches_cloud_release(&manifest, &descriptor).unwrap();
    }
}
