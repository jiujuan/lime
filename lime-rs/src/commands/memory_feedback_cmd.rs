//! Memory feedback commands

use crate::database::DbConnection;
use lime_core::database::lock_db;
use lime_memory::feedback::{
    current_timestamp, generate_feedback_id, record_feedback, FeedbackAction, UserFeedback,
};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedbackRequest {
    pub memory_id: String,
    pub action: FeedbackAction,
    pub session_id: String,
}

#[tauri::command]
pub async fn unified_memory_feedback(
    db: State<'_, DbConnection>,
    request: FeedbackRequest,
) -> Result<(), String> {
    let feedback = UserFeedback {
        id: generate_feedback_id(),
        memory_id: request.memory_id,
        action: request.action,
        session_id: request.session_id,
        created_at: current_timestamp(),
    };

    let conn = lock_db(&db)?;
    record_feedback(&conn, &feedback)?;

    Ok(())
}
