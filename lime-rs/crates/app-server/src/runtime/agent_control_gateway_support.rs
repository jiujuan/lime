//! Pure parsing, identity, and status helpers for the per-turn control gateway.

use super::*;
use agent_protocol::ThreadId;
use app_server_protocol::AgentTurnStatus;

pub(super) const ROOT_AGENT_PATH: &str = "/root";

pub(super) fn required_agent_control_id(
    value: String,
    message: &str,
) -> Result<String, RuntimeCoreError> {
    let value = value.trim().to_string();
    (!value.is_empty())
        .then_some(value)
        .ok_or_else(|| RuntimeCoreError::Backend(message.to_string()))
}

pub(super) fn validate_agent_control_task_name(
    task_name: String,
) -> Result<String, RuntimeCoreError> {
    let task_name = required_agent_control_id(task_name, "agent task_name is required")?;
    if task_name == "root"
        || !task_name
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return Err(RuntimeCoreError::Backend(
            "agent task_name must use lowercase letters, digits, and underscores".to_string(),
        ));
    }
    Ok(task_name)
}

pub(super) fn resolve_agent_control_path(
    current_path: &str,
    reference: &str,
) -> Result<String, RuntimeCoreError> {
    let reference = required_agent_control_id(reference.to_string(), "agent path is required")?;
    if reference == ROOT_AGENT_PATH {
        return Ok(ROOT_AGENT_PATH.to_string());
    }
    if reference.starts_with('/') {
        validate_agent_control_path(&reference)?;
        return Ok(reference);
    }
    for segment in reference.split('/') {
        validate_agent_control_task_name(segment.to_string())?;
    }
    let path = format!("{current_path}/{reference}");
    validate_agent_control_path(&path)?;
    Ok(path)
}

pub(super) fn agent_control_path_matches(path: &str, prefix: &str) -> bool {
    prefix == ROOT_AGENT_PATH || path == prefix || path.starts_with(&format!("{prefix}/"))
}

pub(super) fn agent_control_turn_created_at_ms(
    turn: &app_server_protocol::AgentTurn,
) -> Result<i64, RuntimeCoreError> {
    turn.started_at
        .as_deref()
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.timestamp_millis())
        .ok_or_else(|| {
            RuntimeCoreError::Backend(
                "agent control requires a canonical turn start timestamp for durable delivery"
                    .to_string(),
            )
        })
}

pub(super) fn stable_agent_control_digest(parts: &[&str]) -> String {
    use sha2::{Digest, Sha256};

    hex::encode(Sha256::digest(parts.join("\u{1f}").as_bytes()))
}

pub(super) fn stable_agent_control_message_id(
    root_thread_id: &ThreadId,
    sender_thread_id: &ThreadId,
    turn_id: &str,
    call_id: &str,
    operation: &str,
    recipient_thread_id: &ThreadId,
) -> String {
    format!(
        "agent-control-message-{}",
        stable_agent_control_digest(&[
            root_thread_id.as_str(),
            sender_thread_id.as_str(),
            turn_id,
            call_id,
            operation,
            recipient_thread_id.as_str(),
        ])
    )
}

pub(super) fn agent_control_status_from_turn(status: AgentTurnStatus) -> &'static str {
    match status {
        AgentTurnStatus::Accepted | AgentTurnStatus::Queued => "pending_init",
        AgentTurnStatus::Running | AgentTurnStatus::WaitingAction => "running",
        AgentTurnStatus::Completed => "completed",
        AgentTurnStatus::Failed => "errored",
        AgentTurnStatus::Canceled => "interrupted",
    }
}

fn validate_agent_control_path(path: &str) -> Result<(), RuntimeCoreError> {
    if path == ROOT_AGENT_PATH {
        return Ok(());
    }
    let Some(remainder) = path.strip_prefix("/root/") else {
        return Err(RuntimeCoreError::Backend(
            "absolute agent paths must start with /root".to_string(),
        ));
    };
    if remainder.is_empty() || remainder.ends_with('/') {
        return Err(RuntimeCoreError::Backend(
            "agent path must be canonical".to_string(),
        ));
    }
    for segment in remainder.split('/') {
        validate_agent_control_task_name(segment.to_string())?;
    }
    Ok(())
}
