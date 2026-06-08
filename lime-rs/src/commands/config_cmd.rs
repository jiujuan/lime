use crate::config::{Config, ValidationResult};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const DEPRECATED_CONFIG_COMMAND: &str = "旧 Tauri 配置/CLI/autostart 命令已下线；生产配置、实验开关和桌面壳能力必须经 Electron Desktop Host / App Server current 主链。";

fn deprecated_config_command<T>(command: &str) -> Result<T, String> {
    Err(format!("{DEPRECATED_CONFIG_COMMAND} command={command}"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigStatus {
    pub exists: bool,
    pub path: String,
    pub has_env: bool,
}

#[tauri::command]
pub fn get_config_status(_app_type: String) -> Result<ConfigStatus, String> {
    deprecated_config_command("get_config_status")
}

#[tauri::command]
pub fn get_config_dir_path(_app_type: String) -> Result<String, String> {
    deprecated_config_command("get_config_dir_path")
}

#[tauri::command]
pub async fn open_config_folder(_handle: AppHandle, _app_type: String) -> Result<bool, String> {
    deprecated_config_command("open_config_folder")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolVersion {
    pub name: String,
    pub version: Option<String>,
    pub installed: bool,
}

#[tauri::command]
pub async fn get_tool_versions() -> Result<Vec<ToolVersion>, String> {
    deprecated_config_command("get_tool_versions")
}

#[tauri::command]
pub async fn get_auto_launch_status(_app: AppHandle) -> Result<bool, String> {
    deprecated_config_command("get_auto_launch_status")
}

#[tauri::command]
pub async fn set_auto_launch(_app: AppHandle, _enabled: bool) -> Result<bool, String> {
    deprecated_config_command("set_auto_launch")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct ExportOptions {
    pub redact_secrets: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResult {
    pub content: String,
    pub suggested_filename: String,
}

#[tauri::command]
pub fn export_config(_config: Config, _redact_secrets: bool) -> Result<ExportResult, String> {
    deprecated_config_command("export_config")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct ImportOptions {
    pub merge: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportResult {
    pub success: bool,
    pub config: Config,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub fn validate_config_yaml(_yaml_content: String) -> Result<Config, String> {
    deprecated_config_command("validate_config_yaml")
}

#[tauri::command]
pub fn import_config(
    _current_config: Config,
    _yaml_content: String,
    _merge: bool,
) -> Result<ImportResult, String> {
    deprecated_config_command("import_config")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigPathInfo {
    pub yaml_path: String,
    pub json_path: String,
    pub yaml_exists: bool,
    pub json_exists: bool,
}

#[tauri::command]
pub fn get_config_paths() -> Result<ConfigPathInfo, String> {
    deprecated_config_command("get_config_paths")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedExportOptions {
    pub include_config: bool,
    pub include_credentials: bool,
    pub redact_secrets: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedExportResult {
    pub content: String,
    pub suggested_filename: String,
    pub redacted: bool,
    pub has_config: bool,
    pub has_credentials: bool,
}

#[tauri::command]
pub fn export_bundle(
    _config: Config,
    _options: UnifiedExportOptions,
) -> Result<UnifiedExportResult, String> {
    deprecated_config_command("export_bundle")
}

#[tauri::command]
pub fn export_config_yaml(_config: Config, _redact_secrets: bool) -> Result<ExportResult, String> {
    deprecated_config_command("export_config_yaml")
}

#[tauri::command]
pub fn validate_import(_content: String) -> Result<ValidationResult, String> {
    deprecated_config_command("validate_import")
}

#[tauri::command]
pub fn import_bundle(
    _current_config: Config,
    _content: String,
    _merge: bool,
) -> Result<ImportResult, String> {
    deprecated_config_command("import_bundle")
}

#[tauri::command]
pub fn expand_path(_path: String) -> Result<String, String> {
    deprecated_config_command("expand_path")
}

#[tauri::command]
pub async fn open_auth_dir(_path: String) -> Result<bool, String> {
    deprecated_config_command("open_auth_dir")
}
