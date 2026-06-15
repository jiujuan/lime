//! Aster task board 到 Session todo 展示结构的投影。

use aster::session::{TaskBoardItem, TaskBoardItemStatus, resolve_task_board_state};
use lime_services::aster_session_store::LimeSessionStore;

use super::session_store_types::{
    SessionTodoItem, SessionTodoStatus, normalize_optional_nonempty_body,
};

fn map_session_todo_status(status: TaskBoardItemStatus) -> SessionTodoStatus {
    match status {
        TaskBoardItemStatus::Pending => SessionTodoStatus::Pending,
        TaskBoardItemStatus::InProgress => SessionTodoStatus::InProgress,
        TaskBoardItemStatus::Completed => SessionTodoStatus::Completed,
    }
}

fn map_session_todo_item(item: TaskBoardItem) -> Option<SessionTodoItem> {
    let content = item.subject.trim().to_string();
    if content.is_empty() {
        return None;
    }

    let active_form = normalize_optional_nonempty_body(item.active_form);
    Some(SessionTodoItem {
        content,
        status: map_session_todo_status(item.status),
        active_form,
    })
}

pub(super) fn load_session_todo_items_from_conn(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Vec<SessionTodoItem> {
    let extension_data = match LimeSessionStore::load_extension_data_from_conn(conn, session_id) {
        Ok(extension_data) => extension_data,
        Err(error) => {
            tracing::warn!(
                "[SessionStore] 读取 session todo 状态失败: session_id={}, error={}",
                session_id,
                error
            );
            return Vec::new();
        }
    };

    resolve_task_board_state(&extension_data)
        .map(|task_board| {
            task_board
                .items
                .into_iter()
                .filter_map(map_session_todo_item)
                .collect()
        })
        .unwrap_or_default()
}
