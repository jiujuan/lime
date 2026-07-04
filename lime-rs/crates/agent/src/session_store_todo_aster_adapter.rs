//! Aster task board storage adapter for session todo projection.

use aster::session::{resolve_task_board_state, TaskBoardItem, TaskBoardItemStatus};

use super::session_store_todo_projection::{
    project_session_todo_items, SessionTaskBoardItemProjection, SessionTaskBoardStatusProjection,
};
use super::session_store_types::SessionTodoItem;
use crate::aster_session_store::LimeSessionStore;

fn project_aster_task_board_status(
    status: TaskBoardItemStatus,
) -> SessionTaskBoardStatusProjection {
    match status {
        TaskBoardItemStatus::Pending => SessionTaskBoardStatusProjection::Pending,
        TaskBoardItemStatus::InProgress => SessionTaskBoardStatusProjection::InProgress,
        TaskBoardItemStatus::Completed => SessionTaskBoardStatusProjection::Completed,
    }
}

fn project_aster_task_board_item(item: TaskBoardItem) -> SessionTaskBoardItemProjection {
    SessionTaskBoardItemProjection {
        subject: item.subject,
        active_form: item.active_form,
        status: project_aster_task_board_status(item.status),
    }
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
            project_session_todo_items(
                task_board
                    .items
                    .into_iter()
                    .map(project_aster_task_board_item)
                    .collect(),
            )
        })
        .unwrap_or_default()
}
