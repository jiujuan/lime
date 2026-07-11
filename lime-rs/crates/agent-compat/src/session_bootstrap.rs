use super::runtime_store::{
    initialize_default_sqlite_session_runtime_store, require_session_runtime_store,
    ThreadRuntimeStore,
};
use crate::config::paths::{initialize_path_root, Paths};
use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;

pub async fn initialize_shared_session_runtime_with_root(root: PathBuf) -> Result<()> {
    initialize_path_root(root).map_err(anyhow::Error::msg)?;
    ensure_shared_session_runtime_dirs()?;

    if require_session_runtime_store().is_err() {
        initialize_default_sqlite_session_runtime_store();
    }

    Ok(())
}

pub fn require_shared_session_runtime_store() -> Result<Arc<dyn ThreadRuntimeStore>> {
    require_session_runtime_store()
}

fn ensure_shared_session_runtime_dirs() -> Result<()> {
    for dir in [
        Paths::config_dir(),
        Paths::data_dir(),
        Paths::state_dir(),
        Paths::in_state_dir("logs"),
    ] {
        fs::create_dir_all(&dir)?;
    }

    Ok(())
}
