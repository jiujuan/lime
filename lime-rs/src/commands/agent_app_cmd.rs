//! Agent App UI runtime 与桌面壳命令。
//!
//! package / installed lifecycle 已迁到 App Server JSON-RPC；本模块只保留
//! 目录选择与 UI runtime 旧壳能力。shell launch 已迁到 Electron Host
//! + App Server `agentAppShell/prepare` current 主链。

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
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::net::TcpListener;
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri_plugin_dialog::DialogExt;
use tokio::time::{sleep, Duration, Instant};

const AGENT_APP_DATA_DIR: &str = "agent-apps";
const INSTALLED_STATE_SCHEMA_VERSION: u32 = 1;
const AGENT_APP_UI_RUNTIME_STARTUP_TIMEOUT_SECS: u64 = 120;
const AGENT_APP_UI_RUNTIME_TOKEN_TTL_SECS: u64 = 12 * 60 * 60;
const AGENT_APP_ARRAY_LAYER_FILES: &[(&str, &str)] = &[
    ("app.entries.yaml", "entries"),
    ("app.permissions.yaml", "permissions"),
];
const AGENT_APP_VALUE_LAYER_FILES: &[(&str, &str, &str)] = &[
    ("app.capabilities.yaml", "capabilities", "capabilityConfig"),
    ("app.errors.yaml", "errors", "errors"),
    ("app.i18n.yaml", "i18n", "i18n"),
    ("app.signature.yaml", "signature", "signature"),
    ("app.runtime.yaml", "agentRuntime", "agentRuntime"),
    ("app.install.yaml", "install", "install"),
    ("evals/readiness.yaml", "readiness", "readiness"),
    ("evals/health.yaml", "health", "health"),
];

static AGENT_APP_UI_RUNTIMES: Lazy<Mutex<HashMap<String, AgentAppUiRuntimeProcess>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppSelectDirectoryRequest {
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAppSelectDirectoryResult {
    pub path: Option<String>,
    pub cancelled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstalledAgentAppStateEnvelope {
    schema_version: u32,
    saved_at: String,
    state: Value,
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

    if let Some(status) = running_runtime_status(&request.app_id, Some(&entry)).await? {
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
    if let Some(status) = running_runtime_status(&request.app_id, None).await? {
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
    terminate_agent_app_ui_process(&mut process.child);

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

#[tauri::command]
pub async fn agent_app_select_directory(
    request: Option<AgentAppSelectDirectoryRequest>,
    window: tauri::WebviewWindow,
) -> Result<AgentAppSelectDirectoryResult, String> {
    Ok(agent_app_select_directory_from_window(request, &window))
}

pub fn agent_app_select_directory_from_window(
    request: Option<AgentAppSelectDirectoryRequest>,
    window: &tauri::WebviewWindow,
) -> AgentAppSelectDirectoryResult {
    let title = request
        .and_then(|request| non_empty_string(request.title.as_deref()))
        .unwrap_or_else(|| "选择 Agent App 目录".to_string());
    let selected = window
        .dialog()
        .file()
        .set_title(title)
        .set_parent(window)
        .blocking_pick_folder();
    agent_app_select_directory_result(selected)
}

fn read_installed_agent_app_state(app_id: &str) -> Result<Value, String> {
    let path = installed_state_path(app_id)?;
    read_installed_state_path(&path)?.ok_or_else(|| format!("Agent App 未安装: {app_id}"))
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
    let manifest = resolve_agent_app_manifest(&app_dir, &app_markdown)?;
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

fn agent_app_select_directory_result(
    selected: Option<tauri_plugin_dialog::FilePath>,
) -> AgentAppSelectDirectoryResult {
    let path = selected.and_then(|file_path| {
        file_path
            .into_path()
            .ok()
            .map(|path| path.to_string_lossy().to_string())
            .and_then(|path| non_empty_string(Some(path.as_str())))
    });
    AgentAppSelectDirectoryResult {
        cancelled: path.is_none(),
        path,
        message: None,
    }
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
    let mut last_error = None;
    for candidate in agent_app_npm_launch_candidates() {
        let mut command = Command::new(&candidate.binary);
        command
            .args(["run", "dev", "--silent"])
            .current_dir(app_dir)
            .env("PORT", port.to_string());
        if let Some(path_env) = candidate.path_env.as_deref() {
            command.env("PATH", path_env);
        }
        #[cfg(unix)]
        {
            command.process_group(0);
        }
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
            Err(error) => last_error = Some(format!("{}: {error}", candidate.binary)),
        }
    }
    Err(format!(
        "启动 Agent App UI runtime 失败，请确认已安装 Node.js/npm: {}",
        last_error.unwrap_or_else(|| "npm 不可用".to_string())
    ))
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AgentAppNpmLaunchCandidate {
    binary: String,
    path_env: Option<String>,
}

fn agent_app_npm_launch_candidates() -> Vec<AgentAppNpmLaunchCandidate> {
    let mut candidates = Vec::new();

    #[cfg(not(windows))]
    {
        if let Some(candidate) = resolve_agent_app_npm_from_login_shell() {
            push_agent_app_npm_candidate(&mut candidates, candidate);
        }
    }

    #[cfg(windows)]
    {
        for binary in ["npm.cmd", "npm"] {
            push_agent_app_npm_candidate(
                &mut candidates,
                AgentAppNpmLaunchCandidate {
                    binary: binary.to_string(),
                    path_env: std::env::var("PATH").ok(),
                },
            );
        }
    }

    #[cfg(not(windows))]
    {
        push_agent_app_npm_candidate(
            &mut candidates,
            AgentAppNpmLaunchCandidate {
                binary: "npm".to_string(),
                path_env: std::env::var("PATH").ok(),
            },
        );
    }

    candidates
}

fn push_agent_app_npm_candidate(
    candidates: &mut Vec<AgentAppNpmLaunchCandidate>,
    candidate: AgentAppNpmLaunchCandidate,
) {
    if candidate.binary.trim().is_empty() {
        return;
    }
    if candidates
        .iter()
        .any(|current| current.binary == candidate.binary && current.path_env == candidate.path_env)
    {
        return;
    }
    candidates.push(candidate);
}

#[cfg(not(windows))]
fn resolve_agent_app_npm_from_login_shell() -> Option<AgentAppNpmLaunchCandidate> {
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "/bin/zsh".to_string());
    let script = "npm_path=$(command -v npm 2>/dev/null) || exit 127; printf '__LIME_AGENT_APP_NPM__%s\\n__LIME_AGENT_APP_PATH__%s\\n' \"$npm_path\" \"$PATH\"";

    for args in [vec!["-lic", script], vec!["-lc", script]] {
        let output = Command::new(&shell).args(args).output();
        let Ok(output) = output else {
            continue;
        };
        if !output.status.success() {
            continue;
        }
        if let Some(candidate) = parse_agent_app_npm_shell_output(&output.stdout) {
            return Some(candidate);
        }
    }
    None
}

#[cfg(not(windows))]
fn parse_agent_app_npm_shell_output(raw: &[u8]) -> Option<AgentAppNpmLaunchCandidate> {
    let text = String::from_utf8_lossy(raw);
    let mut binary = None;
    let mut path_env = None;
    for line in text.lines() {
        if let Some(value) = line.strip_prefix("__LIME_AGENT_APP_NPM__") {
            binary = Some(value.trim());
            continue;
        }
        if let Some(value) = line.strip_prefix("__LIME_AGENT_APP_PATH__") {
            path_env = Some(value.trim());
        }
    }
    let binary = binary?;
    let binary = if !binary.is_empty() && Path::new(binary).is_absolute() {
        binary.to_string()
    } else {
        find_agent_app_npm_in_path(path_env?)?
    };
    Some(AgentAppNpmLaunchCandidate {
        binary,
        path_env: path_env
            .filter(|value| !value.is_empty())
            .map(ToString::to_string),
    })
}

#[cfg(not(windows))]
fn find_agent_app_npm_in_path(path_env: &str) -> Option<String> {
    std::env::split_paths(path_env).find_map(|dir| {
        let candidate = dir.join("npm");
        if candidate.is_file() {
            Some(candidate.to_string_lossy().to_string())
        } else {
            None
        }
    })
}

fn terminate_agent_app_ui_process(child: &mut Child) {
    terminate_agent_app_process_tree(child.id(), AgentAppProcessSignal::Terminate);
    let deadline = Instant::now() + Duration::from_millis(900);
    while Instant::now() < deadline {
        if matches!(child.try_wait(), Ok(Some(_))) {
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    terminate_agent_app_process_tree(child.id(), AgentAppProcessSignal::Kill);
    let _ = child.kill();
    let _ = child.wait();
}

enum AgentAppProcessSignal {
    Terminate,
    Kill,
}

#[cfg(unix)]
fn terminate_agent_app_process_tree(pid: u32, signal: AgentAppProcessSignal) {
    let signal_name = match signal {
        AgentAppProcessSignal::Terminate => "-TERM",
        AgentAppProcessSignal::Kill => "-KILL",
    };
    let process_group = format!("-{pid}");
    let _ = Command::new("kill")
        .arg(signal_name)
        .arg(process_group)
        .status();
}

#[cfg(windows)]
fn terminate_agent_app_process_tree(pid: u32, _signal: AgentAppProcessSignal) {
    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .status();
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
    let health_url = agent_app_ui_runtime_health_url(base_url);
    let client = build_agent_app_ui_runtime_probe_client();
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

        if probe_agent_app_ui_runtime_ready_with_client(&client, &health_url).await {
            return Ok(());
        }

        if Instant::now() >= deadline {
            terminate_agent_app_ui_process(child);
            return Err(format!(
                "Agent App UI runtime 未在 {} 秒内就绪: {health_url}",
                AGENT_APP_UI_RUNTIME_STARTUP_TIMEOUT_SECS
            ));
        }
        sleep(Duration::from_millis(250)).await;
    }
}

fn build_agent_app_ui_runtime_probe_client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_millis(800))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn agent_app_ui_runtime_health_url(base_url: &str) -> String {
    format!("{base_url}/api/bootstrap")
}

async fn probe_agent_app_ui_runtime_ready_with_client(
    client: &reqwest::Client,
    health_url: &str,
) -> bool {
    match client.get(health_url).send().await {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

async fn running_runtime_status(
    app_id: &str,
    entry: Option<&AgentAppUiRuntimeEntry>,
) -> Result<Option<AgentAppUiRuntimeStatus>, String> {
    let Some(status) = running_runtime_status_by_process(app_id, entry)? else {
        return Ok(None);
    };
    if status.status != "running" {
        return Ok(Some(status));
    }
    let Some(base_url) = status.base_url.as_deref() else {
        return Ok(Some(status));
    };
    let health_url = agent_app_ui_runtime_health_url(base_url);
    let client = build_agent_app_ui_runtime_probe_client();
    if probe_agent_app_ui_runtime_ready_with_client(&client, &health_url).await {
        return Ok(Some(status));
    }

    remove_unready_agent_app_ui_runtime(app_id, status.pid);
    Ok(None)
}

fn running_runtime_status_by_process(
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

fn remove_unready_agent_app_ui_runtime(app_id: &str, expected_pid: Option<u32>) {
    let Ok(mut registry) = runtime_registry() else {
        return;
    };
    let Some(process) = registry.get(app_id) else {
        return;
    };
    if expected_pid.is_some_and(|pid| pid != process.child.id()) {
        return;
    }
    let Some(mut process) = registry.remove(app_id) else {
        return;
    };
    drop(registry);
    terminate_agent_app_ui_process(&mut process.child);
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

fn resolve_agent_app_manifest(app_dir: &Path, markdown: &str) -> Result<Value, String> {
    let mut manifest = parse_app_markdown_frontmatter(markdown)?;
    apply_layered_manifest_files(app_dir, &mut manifest)?;
    Ok(manifest)
}

fn apply_layered_manifest_files(app_dir: &Path, manifest: &mut Value) -> Result<(), String> {
    for (relative_path, field) in AGENT_APP_ARRAY_LAYER_FILES {
        apply_named_array_layer(app_dir, manifest, relative_path, field)?;
    }
    for (relative_path, source_field, target_field) in AGENT_APP_VALUE_LAYER_FILES {
        apply_value_layer(app_dir, manifest, relative_path, source_field, target_field)?;
    }
    Ok(())
}

fn read_layered_yaml(app_dir: &Path, relative_path: &str) -> Result<Option<Value>, String> {
    let path = app_dir.join(relative_path);
    if !path.is_file() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|error| {
        format!(
            "读取 Agent App 分层 manifest 文件失败 {}: {error}",
            path.display()
        )
    })?;
    let yaml_value: serde_yaml::Value = serde_yaml::from_str(&content).map_err(|error| {
        format!(
            "解析 Agent App 分层 manifest 文件失败 {}: {error}",
            path.display()
        )
    })?;
    serde_json::to_value(yaml_value)
        .map(Some)
        .map_err(|error| format!("转换 Agent App 分层 manifest 文件失败: {error}"))
}

fn apply_value_layer(
    app_dir: &Path,
    manifest: &mut Value,
    relative_path: &str,
    source_field: &str,
    target_field: &str,
) -> Result<(), String> {
    let Some(layer) = read_layered_yaml(app_dir, relative_path)? else {
        return Ok(());
    };
    let Some(value) = layer.get(source_field).cloned() else {
        return Ok(());
    };
    manifest_object_mut(manifest)?.insert(target_field.to_string(), value);
    Ok(())
}

fn apply_named_array_layer(
    app_dir: &Path,
    manifest: &mut Value,
    relative_path: &str,
    field: &str,
) -> Result<(), String> {
    let Some(layer) = read_layered_yaml(app_dir, relative_path)? else {
        return Ok(());
    };
    let Some(layer_items) = layer.get(field).and_then(Value::as_array) else {
        return Ok(());
    };
    let mut merged = manifest
        .get(field)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for layer_item in layer_items {
        let Some(layer_key) = layered_item_key(layer_item) else {
            merged.push(layer_item.clone());
            continue;
        };
        if let Some(existing) = merged
            .iter_mut()
            .find(|item| layered_item_key(item).as_deref() == Some(layer_key.as_str()))
        {
            merge_json_object(existing, layer_item.clone())?;
        } else {
            merged.push(layer_item.clone());
        }
    }

    manifest_object_mut(manifest)?.insert(field.to_string(), Value::Array(merged));
    Ok(())
}

fn layered_item_key(value: &Value) -> Option<String> {
    value
        .get("key")
        .or_else(|| value.get("id"))
        .and_then(Value::as_str)
        .map(ToString::to_string)
}

fn merge_json_object(target: &mut Value, overlay: Value) -> Result<(), String> {
    match (target.as_object_mut(), overlay) {
        (Some(target_object), Value::Object(overlay_object)) => {
            for (key, value) in overlay_object {
                target_object.insert(key, value);
            }
        }
        (_, value) => {
            *target = value;
        }
    }
    Ok(())
}

fn manifest_object_mut(manifest: &mut Value) -> Result<&mut Map<String, Value>, String> {
    manifest
        .as_object_mut()
        .ok_or_else(|| "Agent App manifest 必须是对象。".to_string())
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
    for file in list_agent_app_package_files(app_dir)? {
        let relative = file.strip_prefix(app_dir).map_err(|error| {
            format!(
                "计算 Agent App package hash 时无法生成相对路径 {}: {error}",
                file.display()
            )
        })?;
        hasher.update(relative.to_string_lossy().as_bytes());
        hasher.update([0]);
        hasher.update(fs::read(&file).map_err(|error| {
            format!(
                "读取 Agent App package 文件失败 {}: {error}",
                file.display()
            )
        })?);
        hasher.update([0]);
    }
    Ok(format!("sha256:{}", hex::encode(hasher.finalize())))
}

fn list_agent_app_package_files(app_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut result = Vec::new();
    collect_agent_app_package_files(app_dir, &mut result)?;
    result.sort();
    Ok(result)
}

fn collect_agent_app_package_files(path: &Path, result: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries =
        fs::read_dir(path).map_err(|error| format!("读取 Agent App package 目录失败: {error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("读取 Agent App package 条目失败: {error}"))?;
        let entry_path = entry.path();
        let file_name = entry.file_name();
        let file_name = file_name.to_string_lossy();
        if matches!(
            file_name.as_ref(),
            ".git" | "node_modules" | ".local" | ".lime"
        ) {
            continue;
        }
        let metadata = entry
            .metadata()
            .map_err(|error| format!("读取 Agent App package 元数据失败: {error}"))?;
        if metadata.is_dir() {
            collect_agent_app_package_files(&entry_path, result)?;
        } else if metadata.is_file() {
            result.push(entry_path);
        }
    }
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn agent_app_data_dir() -> Result<PathBuf, String> {
    Ok(lime_core::app_paths::preferred_data_dir()?.join(AGENT_APP_DATA_DIR))
}

fn installed_dir() -> Result<PathBuf, String> {
    Ok(agent_app_data_dir()?.join("installed"))
}

fn installed_state_path(app_id: &str) -> Result<PathBuf, String> {
    validate_safe_app_id(app_id)?;
    Ok(installed_dir()?.join(format!("{app_id}.json")))
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

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_core::agent_app_runtime_token::{
        verify_agent_app_runtime_token, AGENT_APP_RUNTIME_SCOPE_MODEL_GENERATION,
    };
    use tempfile::tempdir;

    fn sample_app_markdown() -> &'static str {
        "---\nmanifestVersion: 0.3.0\nname: content-factory-app\nversion: 0.3.0\nentries:\n  - key: dashboard\n    kind: page\n---\n# 内容工厂\n"
    }

    #[test]
    fn select_directory_result_projects_path_and_cancel_state() {
        let result = agent_app_select_directory_result(Some(tauri_plugin_dialog::FilePath::Path(
            PathBuf::from("/tmp/lime-agent-app"),
        )));
        assert_eq!(result.path.as_deref(), Some("/tmp/lime-agent-app"));
        assert!(!result.cancelled);

        let cancelled = agent_app_select_directory_result(None);
        assert!(cancelled.path.is_none());
        assert!(cancelled.cancelled);
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

    #[cfg(not(windows))]
    #[test]
    fn parses_login_shell_npm_path_and_runtime_path() {
        let candidate = parse_agent_app_npm_shell_output(
            b"shell noise\n__LIME_AGENT_APP_NPM__/opt/homebrew/bin/npm\n__LIME_AGENT_APP_PATH__/opt/homebrew/bin:/usr/bin\n",
        )
        .unwrap();

        assert_eq!(candidate.binary, "/opt/homebrew/bin/npm");
        assert_eq!(
            candidate.path_env.as_deref(),
            Some("/opt/homebrew/bin:/usr/bin")
        );
    }

    #[cfg(not(windows))]
    #[test]
    fn rejects_relative_login_shell_npm_path() {
        assert!(parse_agent_app_npm_shell_output(
            b"__LIME_AGENT_APP_NPM__npm\n__LIME_AGENT_APP_PATH__\n"
        )
        .is_none());
        assert!(parse_agent_app_npm_shell_output(b"__LIME_AGENT_APP_PATH__/usr/bin\n").is_none());
    }

    #[cfg(not(windows))]
    #[test]
    fn resolves_lazy_shell_function_npm_from_path() {
        let temp = tempdir().unwrap();
        let npm_path = temp.path().join("npm");
        fs::write(&npm_path, "#!/bin/sh\n").unwrap();
        let output = format!(
            "__LIME_AGENT_APP_NPM__npm\n__LIME_AGENT_APP_PATH__{}\n",
            temp.path().display()
        );

        let candidate = parse_agent_app_npm_shell_output(output.as_bytes()).unwrap();

        assert_eq!(candidate.binary, npm_path.to_string_lossy());
        assert_eq!(
            candidate.path_env.as_deref(),
            Some(temp.path().to_string_lossy().as_ref())
        );
    }

    #[test]
    fn npm_launch_candidate_dedupes_binary_and_path() {
        let mut candidates = Vec::new();
        let candidate = AgentAppNpmLaunchCandidate {
            binary: "npm".to_string(),
            path_env: Some("/usr/bin".to_string()),
        };

        push_agent_app_npm_candidate(&mut candidates, candidate.clone());
        push_agent_app_npm_candidate(&mut candidates, candidate);
        push_agent_app_npm_candidate(
            &mut candidates,
            AgentAppNpmLaunchCandidate {
                binary: "npm".to_string(),
                path_env: Some("/opt/homebrew/bin:/usr/bin".to_string()),
            },
        );

        assert_eq!(candidates.len(), 2);
    }

    #[test]
    fn resolves_layered_manifest_files() {
        let temp = tempdir().unwrap();
        let app_dir = temp.path();
        fs::write(app_dir.join("APP.md"), sample_app_markdown()).unwrap();
        fs::write(
            app_dir.join("app.entries.yaml"),
            "entries:\n  - key: dashboard\n    title: 项目组合\n    route: /dashboard\n  - key: settings\n    kind: settings\n    title: 设置\n    route: /settings\n",
        )
        .unwrap();
        fs::write(
            app_dir.join("app.permissions.yaml"),
            "permissions:\n  - key: read_selected_files\n    scope: filesystem\n    access: read\n    required: true\n",
        )
        .unwrap();
        fs::write(
            app_dir.join("app.i18n.yaml"),
            "i18n:\n  defaultLocale: zh-CN\n  supportedLocales:\n    - zh-CN\n    - en-US\n",
        )
        .unwrap();
        fs::write(
            app_dir.join("app.runtime.yaml"),
            "agentRuntime:\n  agentTask:\n    eventSchema: lime.agent-task-event.v1\n",
        )
        .unwrap();
        fs::write(
            app_dir.join("app.install.yaml"),
            "install:\n  contractVersion: 0.8.0\n  modes:\n    - mode: in_lime\n      default: true\n    - mode: standalone\n      shell:\n        kind: app_shell\n  runtime:\n    minVersion: 0.8.0\n",
        )
        .unwrap();
        fs::create_dir_all(app_dir.join("evals")).unwrap();
        fs::write(
            app_dir.join("evals/readiness.yaml"),
            "readiness:\n  required:\n    - check: sdk_version\n      expect: \">=0.6.0\"\n",
        )
        .unwrap();

        let manifest = resolve_agent_app_manifest(app_dir, sample_app_markdown()).unwrap();
        let entries = manifest["entries"].as_array().unwrap();

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0]["key"], "dashboard");
        assert_eq!(entries[0]["title"], "项目组合");
        assert_eq!(entries[0]["route"], "/dashboard");
        assert_eq!(entries[1]["key"], "settings");
        assert_eq!(manifest["permissions"][0]["key"], "read_selected_files");
        assert_eq!(manifest["i18n"]["defaultLocale"], "zh-CN");
        assert_eq!(
            manifest["agentRuntime"]["agentTask"]["eventSchema"],
            "lime.agent-task-event.v1"
        );
        assert_eq!(manifest["install"]["modes"][1]["mode"], "standalone");
        assert_eq!(manifest["install"]["runtime"]["minVersion"], "0.8.0");
        assert_eq!(manifest["readiness"]["required"][0]["check"], "sdk_version");
    }

    #[test]
    fn local_package_hash_includes_layered_files_but_ignores_local_state() {
        let temp = tempdir().unwrap();
        let app_dir = temp.path();
        fs::write(app_dir.join("APP.md"), sample_app_markdown()).unwrap();
        fs::write(app_dir.join("app.entries.yaml"), "entries: []\n").unwrap();
        fs::create_dir_all(app_dir.join(".local")).unwrap();
        fs::write(app_dir.join(".local/runtime.json"), "{}").unwrap();

        let manifest = resolve_agent_app_manifest(app_dir, sample_app_markdown()).unwrap();
        let first_hash = sha256_package(app_dir, &manifest).unwrap();
        fs::write(app_dir.join(".local/runtime.json"), "{\"changed\":true}").unwrap();
        let ignored_local_hash = sha256_package(app_dir, &manifest).unwrap();
        fs::write(
            app_dir.join("app.entries.yaml"),
            "entries:\n  - key: dashboard\n    title: 新标题\n",
        )
        .unwrap();
        let changed_package_hash = sha256_package(app_dir, &manifest).unwrap();

        assert_eq!(first_hash, ignored_local_hash);
        assert_ne!(first_hash, changed_package_hash);
    }

}
