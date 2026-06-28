use lime_core::app_paths;
use serde_json::Value;
use std::path::PathBuf;

const AGENT_APP_DATA_DIR: &str = "agent-apps";

pub(crate) fn agent_app_data_dir() -> Result<PathBuf, String> {
    Ok(app_paths::preferred_data_dir()?.join(AGENT_APP_DATA_DIR))
}

pub(crate) fn safe_hash_path_segment(hash: &str) -> String {
    hash.replace(':', "_")
}

pub(crate) fn validate_agent_app_id_for_storage(app_id: &str) -> Result<(), String> {
    if app_id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
        && !app_id.is_empty()
    {
        return Ok(());
    }
    Err(format!("Agent App id 不安全: {app_id}"))
}

pub(crate) fn read_json_string(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str().map(str::to_string)
}
