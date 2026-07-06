//! Task board projection read model.
//!
//! This module owns the pure task-board to session todo projection rules.
//! Runtime-specific adapters should only translate their DTOs into these
//! records.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TaskBoardStatusRecord {
    Pending,
    InProgress,
    Completed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TaskBoardItemRecord {
    pub subject: String,
    pub active_form: Option<String>,
    pub status: TaskBoardStatusRecord,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SessionTodoStatusRecord {
    Pending,
    InProgress,
    Completed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SessionTodoItemRecord {
    pub content: String,
    pub status: SessionTodoStatusRecord,
    pub active_form: Option<String>,
}

pub fn project_session_todo_records(items: Vec<TaskBoardItemRecord>) -> Vec<SessionTodoItemRecord> {
    items.into_iter().filter_map(map_task_board_item).collect()
}

fn map_task_board_item(item: TaskBoardItemRecord) -> Option<SessionTodoItemRecord> {
    let content = item.subject.trim().to_string();
    if content.is_empty() {
        return None;
    }

    Some(SessionTodoItemRecord {
        content,
        status: map_task_board_status(item.status),
        active_form: normalize_optional_nonempty_body(item.active_form),
    })
}

fn map_task_board_status(status: TaskBoardStatusRecord) -> SessionTodoStatusRecord {
    match status {
        TaskBoardStatusRecord::Pending => SessionTodoStatusRecord::Pending,
        TaskBoardStatusRecord::InProgress => SessionTodoStatusRecord::InProgress,
        TaskBoardStatusRecord::Completed => SessionTodoStatusRecord::Completed,
    }
}

fn normalize_optional_nonempty_body(value: Option<String>) -> Option<String> {
    let text = value?;
    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        project_session_todo_records, SessionTodoStatusRecord, TaskBoardItemRecord,
        TaskBoardStatusRecord,
    };

    #[test]
    fn project_session_todo_records_should_trim_subject_and_preserve_active_form() {
        let projected = project_session_todo_records(vec![
            TaskBoardItemRecord {
                subject: "  收集事实源  ".to_string(),
                active_form: Some("  正在读取仓库  ".to_string()),
                status: TaskBoardStatusRecord::InProgress,
            },
            TaskBoardItemRecord {
                subject: " ".to_string(),
                active_form: Some("忽略".to_string()),
                status: TaskBoardStatusRecord::Pending,
            },
            TaskBoardItemRecord {
                subject: "输出结论".to_string(),
                active_form: None,
                status: TaskBoardStatusRecord::Completed,
            },
        ]);

        assert_eq!(projected.len(), 2);
        assert_eq!(projected[0].content, "收集事实源");
        assert_eq!(
            projected[0].active_form.as_deref(),
            Some("  正在读取仓库  ")
        );
        assert_eq!(projected[0].status, SessionTodoStatusRecord::InProgress);
        assert_eq!(projected[1].content, "输出结论");
        assert_eq!(projected[1].active_form, None);
        assert_eq!(projected[1].status, SessionTodoStatusRecord::Completed);
    }

    #[test]
    fn project_session_todo_records_should_drop_empty_active_form() {
        let projected = project_session_todo_records(vec![TaskBoardItemRecord {
            subject: "任务".to_string(),
            active_form: Some("   ".to_string()),
            status: TaskBoardStatusRecord::Pending,
        }]);

        assert_eq!(projected[0].active_form, None);
    }
}
