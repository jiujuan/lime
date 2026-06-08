//! Legacy A2UI form Tauri commands.
//!
//! A2UI 表单交互已收敛到 Agent Chat current action-request / workspace runtime；
//! 不要恢复这组旧 Tauri DB wrapper 作为生产表单事实源。

use tauri::State;

use crate::database::dao::a2ui_form_dao::A2UIForm;
use crate::database::DbConnection;

// ============================================================================
// 响应类型
// ============================================================================

/// 命令结果类型
type CmdResult<T> = Result<T, String>;

const DEPRECATED_A2UI_FORM_COMMAND_MESSAGE: &str =
    "A2UI 表单 Tauri DB 命令已退场；请使用 Agent Chat current action-request / workspace runtime 主链";

fn deprecated_a2ui_form_command_error(command: &str) -> String {
    tracing::warn!("[A2UIForm] legacy Tauri command `{}` 已退场", command);
    format!("{command} 已退场；{DEPRECATED_A2UI_FORM_COMMAND_MESSAGE}")
}

// ============================================================================
// Tauri 命令
// ============================================================================

/// 创建 A2UI 表单记录
#[tauri::command]
pub async fn create_a2ui_form(
    _db: State<'_, DbConnection>,
    _message_id: i64,
    _session_id: String,
    _a2ui_response_json: String,
    _form_data_json: Option<String>,
) -> CmdResult<A2UIForm> {
    Err(deprecated_a2ui_form_command_error("create_a2ui_form"))
}

/// 获取单个表单
#[tauri::command]
pub async fn get_a2ui_form(
    _db: State<'_, DbConnection>,
    _id: String,
) -> CmdResult<Option<A2UIForm>> {
    Err(deprecated_a2ui_form_command_error("get_a2ui_form"))
}

/// 根据消息 ID 获取表单列表
#[tauri::command]
pub async fn get_a2ui_forms_by_message(
    _db: State<'_, DbConnection>,
    _message_id: i64,
) -> CmdResult<Vec<A2UIForm>> {
    Err(deprecated_a2ui_form_command_error(
        "get_a2ui_forms_by_message",
    ))
}

/// 根据会话 ID 获取所有表单
#[tauri::command]
pub async fn get_a2ui_forms_by_session(
    _db: State<'_, DbConnection>,
    _session_id: String,
) -> CmdResult<Vec<A2UIForm>> {
    Err(deprecated_a2ui_form_command_error(
        "get_a2ui_forms_by_session",
    ))
}

/// 更新表单数据（用户填写的内容）
#[tauri::command]
pub async fn save_a2ui_form_data(
    _db: State<'_, DbConnection>,
    _id: String,
    _form_data_json: String,
) -> CmdResult<A2UIForm> {
    Err(deprecated_a2ui_form_command_error("save_a2ui_form_data"))
}

/// 提交表单
#[tauri::command]
pub async fn submit_a2ui_form(
    _db: State<'_, DbConnection>,
    _id: String,
    _form_data_json: String,
) -> CmdResult<A2UIForm> {
    Err(deprecated_a2ui_form_command_error("submit_a2ui_form"))
}

/// 删除表单
#[tauri::command]
pub async fn delete_a2ui_form(_db: State<'_, DbConnection>, _id: String) -> CmdResult<()> {
    Err(deprecated_a2ui_form_command_error("delete_a2ui_form"))
}
