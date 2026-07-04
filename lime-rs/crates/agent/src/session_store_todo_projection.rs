//! Task board 到 Session todo 展示结构的投影。

use super::session_store_types::{
    normalize_optional_nonempty_body, SessionTodoItem, SessionTodoStatus,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SessionTaskBoardStatusProjection {
    Pending,
    InProgress,
    Completed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct SessionTaskBoardItemProjection {
    pub subject: String,
    pub active_form: Option<String>,
    pub status: SessionTaskBoardStatusProjection,
}

fn map_session_todo_status(status: SessionTaskBoardStatusProjection) -> SessionTodoStatus {
    match status {
        SessionTaskBoardStatusProjection::Pending => SessionTodoStatus::Pending,
        SessionTaskBoardStatusProjection::InProgress => SessionTodoStatus::InProgress,
        SessionTaskBoardStatusProjection::Completed => SessionTodoStatus::Completed,
    }
}

fn map_session_todo_item(item: SessionTaskBoardItemProjection) -> Option<SessionTodoItem> {
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

pub(super) fn project_session_todo_items(
    items: Vec<SessionTaskBoardItemProjection>,
) -> Vec<SessionTodoItem> {
    items
        .into_iter()
        .filter_map(map_session_todo_item)
        .collect()
}
