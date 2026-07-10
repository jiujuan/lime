//! Aster task board storage adapter for session todo projection.

use super::session_store_types::{SessionTodoItem, SessionTodoStatus};
use crate::aster_session_store::LimeSessionStore;
use aster::{resolve_task_board_state, TaskBoardItem, TaskBoardItemStatus};
use thread_store::task_board::{
    project_session_todo_records, SessionTodoItemRecord, SessionTodoStatusRecord,
    TaskBoardItemRecord, TaskBoardStatusRecord,
};

fn task_board_status_record_from_aster(status: TaskBoardItemStatus) -> TaskBoardStatusRecord {
    match status {
        TaskBoardItemStatus::Pending => TaskBoardStatusRecord::Pending,
        TaskBoardItemStatus::InProgress => TaskBoardStatusRecord::InProgress,
        TaskBoardItemStatus::Completed => TaskBoardStatusRecord::Completed,
    }
}

fn task_board_item_record_from_aster(item: TaskBoardItem) -> TaskBoardItemRecord {
    TaskBoardItemRecord {
        subject: item.subject,
        active_form: item.active_form,
        status: task_board_status_record_from_aster(item.status),
    }
}

fn session_todo_status_from_record(status: SessionTodoStatusRecord) -> SessionTodoStatus {
    match status {
        SessionTodoStatusRecord::Pending => SessionTodoStatus::Pending,
        SessionTodoStatusRecord::InProgress => SessionTodoStatus::InProgress,
        SessionTodoStatusRecord::Completed => SessionTodoStatus::Completed,
    }
}

fn session_todo_item_from_record(record: SessionTodoItemRecord) -> SessionTodoItem {
    SessionTodoItem {
        content: record.content,
        status: session_todo_status_from_record(record.status),
        active_form: record.active_form,
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
            project_session_todo_records(
                task_board
                    .items
                    .into_iter()
                    .map(task_board_item_record_from_aster)
                    .collect(),
            )
            .into_iter()
            .map(session_todo_item_from_record)
            .collect()
        })
        .unwrap_or_default()
}
