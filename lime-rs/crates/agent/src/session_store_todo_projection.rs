//! Session todo snapshot projection.
//!
//! `update_plan` is emitted and projected through the App Server current path.
//! This module only reads pre-existing local `extension_data_json` snapshots until
//! the legacy session-detail todo field is removed. It must not depend on Agent
//! runtime types or write another compatibility snapshot.

use super::session_store_types::{SessionTodoItem, SessionTodoStatus};
use lime_core::database::agent_session_repository::get_session_extension_data_json;
use serde_json::Value;
use thread_store::task_board::{
    project_session_todo_records, SessionTodoItemRecord, SessionTodoStatusRecord,
    TaskBoardItemRecord, TaskBoardStatusRecord,
};

const TASK_LIST_STATE_KEY: &str = "task_list.v1";
const TODO_LIST_STATE_KEY: &str = "todo.v1";
const TODO_MARKDOWN_STATE_KEY: &str = "todo.v0";

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

fn task_board_status(value: Option<&str>) -> TaskBoardStatusRecord {
    match value.map(str::trim) {
        Some("in_progress") | Some("in-progress") => TaskBoardStatusRecord::InProgress,
        Some("completed") => TaskBoardStatusRecord::Completed,
        _ => TaskBoardStatusRecord::Pending,
    }
}

fn optional_text(item: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .filter_map(|key| item.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .find(|value| !value.is_empty())
        .map(str::to_string)
}

fn task_board_records(state: &Value) -> Option<Vec<TaskBoardItemRecord>> {
    let items = state.get("items")?.as_array()?;
    Some(
        items
            .iter()
            .filter_map(|item| {
                let subject = optional_text(item, &["subject"])?;
                Some(TaskBoardItemRecord {
                    subject,
                    active_form: optional_text(item, &["activeForm", "active_form"]),
                    status: task_board_status(item.get("status").and_then(Value::as_str)),
                })
            })
            .collect(),
    )
}

fn todo_list_records(state: &Value) -> Option<Vec<TaskBoardItemRecord>> {
    let items = state.get("items")?.as_array()?;
    Some(
        items
            .iter()
            .filter_map(|item| {
                let content = optional_text(item, &["content"])?;
                let active_form = optional_text(item, &["active_form", "activeForm"])
                    .filter(|value| value != &content);
                Some(TaskBoardItemRecord {
                    active_form,
                    subject: content,
                    status: task_board_status(item.get("status").and_then(Value::as_str)),
                })
            })
            .collect(),
    )
}

fn markdown_todo_records(state: &Value) -> Option<Vec<TaskBoardItemRecord>> {
    let content = state.get("content")?.as_str()?;
    Some(content.lines().filter_map(markdown_todo_record).collect())
}

fn markdown_todo_record(line: &str) -> Option<TaskBoardItemRecord> {
    let item = line
        .trim_start()
        .strip_prefix("- ")
        .or_else(|| line.trim_start().strip_prefix("* "))
        .or_else(|| line.trim_start().strip_prefix("+ "))?;
    let (status, subject) = if let Some(subject) = item.strip_prefix("[ ] ") {
        (TaskBoardStatusRecord::Pending, subject)
    } else if let Some(subject) = item
        .strip_prefix("[-] ")
        .or_else(|| item.strip_prefix("[~] "))
    {
        (TaskBoardStatusRecord::InProgress, subject)
    } else if let Some(subject) = item
        .strip_prefix("[x] ")
        .or_else(|| item.strip_prefix("[X] "))
    {
        (TaskBoardStatusRecord::Completed, subject)
    } else {
        return None;
    };
    let subject = subject.trim();
    (!subject.is_empty()).then(|| TaskBoardItemRecord {
        subject: subject.to_string(),
        active_form: None,
        status,
    })
}

fn resolve_task_board_state_records(extension_data: &Value) -> Vec<TaskBoardItemRecord> {
    extension_data
        .get(TASK_LIST_STATE_KEY)
        .and_then(task_board_records)
        .or_else(|| {
            extension_data
                .get(TODO_LIST_STATE_KEY)
                .and_then(todo_list_records)
        })
        .or_else(|| {
            extension_data
                .get(TODO_MARKDOWN_STATE_KEY)
                .and_then(markdown_todo_records)
        })
        .unwrap_or_default()
}

fn project_session_todo_items(extension_data: &Value) -> Vec<SessionTodoItem> {
    project_session_todo_records(resolve_task_board_state_records(extension_data))
        .into_iter()
        .map(session_todo_item_from_record)
        .collect()
}

pub(super) fn load_session_todo_items_from_conn(
    conn: &rusqlite::Connection,
    session_id: &str,
) -> Vec<SessionTodoItem> {
    let extension_data_json = match get_session_extension_data_json(conn, session_id) {
        Ok(Some(value)) => value,
        Ok(None) => return Vec::new(),
        Err(error) => {
            tracing::warn!(
                "[SessionStore] 读取 legacy session todo 快照失败: session_id={}, error={}",
                session_id,
                error
            );
            return Vec::new();
        }
    };
    let extension_data = match serde_json::from_str::<Value>(&extension_data_json) {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(
                "[SessionStore] 解析 legacy session todo 快照失败: session_id={}, error={}",
                session_id,
                error
            );
            return Vec::new();
        }
    };

    project_session_todo_items(&extension_data)
}

#[cfg(test)]
mod tests {
    use super::project_session_todo_items;
    use crate::session_store::SessionTodoStatus;
    use serde_json::json;

    #[test]
    fn projects_legacy_task_list_snapshot_with_current_types() {
        let items = project_session_todo_items(&json!({
            "task_list.v1": {
                "items": [
                    {
                        "subject": "迁移 reply backend",
                        "activeForm": "正在迁移 reply backend",
                        "status": "in_progress"
                    },
                    { "subject": "删除 compat", "status": "completed" }
                ]
            }
        }));

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].status, SessionTodoStatus::InProgress);
        assert_eq!(
            items[0].active_form.as_deref(),
            Some("正在迁移 reply backend")
        );
        assert_eq!(items[1].status, SessionTodoStatus::Completed);
    }

    #[test]
    fn falls_back_to_markdown_snapshot() {
        let items = project_session_todo_items(&json!({
            "todo.v0": { "content": "- [x] 已完成\n- [-] 进行中\n- [ ] 等待" }
        }));

        assert_eq!(items.len(), 3);
        assert_eq!(items[0].status, SessionTodoStatus::Completed);
        assert_eq!(items[0].active_form, None);
        assert_eq!(items[1].status, SessionTodoStatus::InProgress);
        assert_eq!(items[2].status, SessionTodoStatus::Pending);
    }
}
