use serde_json::Value;
use std::path::{Path, PathBuf};

const PLUGIN_DATA_DIR: &str = "plugins";

pub(crate) fn plugin_data_dir_for_agent_root(agent_root: &Path) -> PathBuf {
    agent_root.join(PLUGIN_DATA_DIR)
}

pub(crate) fn safe_hash_path_segment(hash: &str) -> String {
    hash.replace(':', "_")
}

pub(crate) fn validate_plugin_id_for_storage(app_id: &str) -> Result<(), String> {
    if app_id
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
        && !app_id.is_empty()
    {
        return Ok(());
    }
    Err(format!("Plugin id 不安全: {app_id}"))
}

pub(crate) fn read_json_string(value: &Value, path: &[&str]) -> Option<String> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str().map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plugin_data_dir_is_scoped_to_agent_root() {
        let agent_root = Path::new("agent-root");

        assert_eq!(
            plugin_data_dir_for_agent_root(agent_root),
            agent_root.join("plugins")
        );
    }
}
