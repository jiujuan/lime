//! Prompt 管理 legacy Tauri 命令模块
//!
//! Prompt 管理生产入口已下线；旧 Tauri wrapper 只保留 fail-closed 退场面，防止继续
//! 读写数据库或 live prompt file。

use crate::models::prompt_model::Prompt;
use std::collections::HashMap;

const DEPRECATED_PROMPT_COMMAND_MESSAGE: &str =
    "Prompt 管理 Tauri 命令已退场；当前生产路径不再支持旧 Prompt 管理面";

fn deprecated_prompt_command_error(command: &str) -> String {
    tracing::warn!("[Prompt] legacy Tauri command `{}` 已退场", command);
    format!("{command} 已退场；{DEPRECATED_PROMPT_COMMAND_MESSAGE}")
}

/// Get all prompts for an app type (as HashMap for frontend)
#[tauri::command]
pub fn get_prompts(_app: String) -> Result<HashMap<String, Prompt>, String> {
    Err(deprecated_prompt_command_error("get_prompts"))
}

/// Upsert a prompt (insert or update)
#[tauri::command]
pub fn upsert_prompt(_app: String, _id: String, _prompt: Prompt) -> Result<(), String> {
    Err(deprecated_prompt_command_error("upsert_prompt"))
}

/// Add a new prompt
#[tauri::command]
pub fn add_prompt(_prompt: Prompt) -> Result<(), String> {
    Err(deprecated_prompt_command_error("add_prompt"))
}

/// Update an existing prompt
#[tauri::command]
pub fn update_prompt(_prompt: Prompt) -> Result<(), String> {
    Err(deprecated_prompt_command_error("update_prompt"))
}

/// Delete a prompt
#[tauri::command]
pub fn delete_prompt(_app: String, _id: String) -> Result<(), String> {
    Err(deprecated_prompt_command_error("delete_prompt"))
}

/// Enable a prompt and sync to live file
#[tauri::command]
pub fn enable_prompt(_app: String, _id: String) -> Result<(), String> {
    Err(deprecated_prompt_command_error("enable_prompt"))
}

/// Import prompt from live file
#[tauri::command]
pub fn import_prompt_from_file(_app: String) -> Result<String, String> {
    Err(deprecated_prompt_command_error("import_prompt_from_file"))
}

/// Get current live prompt file content
#[tauri::command]
pub fn get_current_prompt_file_content(_app: String) -> Result<Option<String>, String> {
    Err(deprecated_prompt_command_error(
        "get_current_prompt_file_content",
    ))
}

/// Auto-import prompt from live file on first launch (if no prompts exist)
#[tauri::command]
pub fn auto_import_prompt(_app: String) -> Result<usize, String> {
    Err(deprecated_prompt_command_error("auto_import_prompt"))
}
