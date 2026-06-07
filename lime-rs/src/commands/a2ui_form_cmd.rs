//! A2UI 表单 Tauri 命令
//!
//! 提供 A2UI 表单的前端 API，包括：
//! - 创建表单记录
//! - 保存表单数据
//! - 提交表单
//! - 查询表单

use tauri::State;

use crate::database::dao::a2ui_form_dao::{
    A2UIForm, A2UIFormDao, A2UIFormError, CreateA2UIFormRequest,
};
use crate::database::DbConnection;

// ============================================================================
// 响应类型
// ============================================================================

/// 命令结果类型
type CmdResult<T> = Result<T, String>;

/// 将 A2UIFormError 转换为字符串
fn map_err(e: A2UIFormError) -> String {
    e.to_string()
}

// ============================================================================
// Tauri 命令
// ============================================================================

/// 创建 A2UI 表单记录
#[tauri::command]
pub async fn create_a2ui_form(
    db: State<'_, DbConnection>,
    message_id: i64,
    session_id: String,
    a2ui_response_json: String,
    form_data_json: Option<String>,
) -> CmdResult<A2UIForm> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;

    let req = CreateA2UIFormRequest {
        message_id,
        session_id,
        a2ui_response_json,
        form_data_json,
    };

    A2UIFormDao::create(&conn, &req).map_err(map_err)
}

/// 获取单个表单
#[tauri::command]
pub async fn get_a2ui_form(db: State<'_, DbConnection>, id: String) -> CmdResult<Option<A2UIForm>> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    A2UIFormDao::get(&conn, &id).map_err(map_err)
}

/// 根据消息 ID 获取表单列表
#[tauri::command]
pub async fn get_a2ui_forms_by_message(
    db: State<'_, DbConnection>,
    message_id: i64,
) -> CmdResult<Vec<A2UIForm>> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    A2UIFormDao::get_by_message(&conn, message_id).map_err(map_err)
}

/// 根据会话 ID 获取所有表单
#[tauri::command]
pub async fn get_a2ui_forms_by_session(
    db: State<'_, DbConnection>,
    session_id: String,
) -> CmdResult<Vec<A2UIForm>> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    A2UIFormDao::get_by_session(&conn, &session_id).map_err(map_err)
}

/// 更新表单数据（用户填写的内容）
#[tauri::command]
pub async fn save_a2ui_form_data(
    db: State<'_, DbConnection>,
    id: String,
    form_data_json: String,
) -> CmdResult<A2UIForm> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    A2UIFormDao::update_form_data(&conn, &id, &form_data_json).map_err(map_err)
}

/// 提交表单
#[tauri::command]
pub async fn submit_a2ui_form(
    db: State<'_, DbConnection>,
    id: String,
    form_data_json: String,
) -> CmdResult<A2UIForm> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    A2UIFormDao::submit(&conn, &id, &form_data_json).map_err(map_err)
}

/// 删除表单
#[tauri::command]
pub async fn delete_a2ui_form(db: State<'_, DbConnection>, id: String) -> CmdResult<()> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    A2UIFormDao::delete(&conn, &id).map_err(map_err)
}
