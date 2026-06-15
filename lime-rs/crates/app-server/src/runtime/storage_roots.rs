use std::fs;
use std::path::{Path, PathBuf};

const PRODUCT_DB_FILE_NAME: &str = "lime.db";
const RUNTIME_DIR_NAME: &str = "runtime";
const EVENT_LOG_DIR_NAME: &str = "events";
const SIDECAR_DIR_NAME: &str = "sidecar";
const PROJECTION_DB_FILE_NAME: &str = "projection_1.sqlite";
const TELEMETRY_DB_FILE_NAME: &str = "telemetry_1.sqlite";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageRoots {
    pub data_root: PathBuf,
    pub product_db_path: PathBuf,
    pub runtime_root: PathBuf,
    pub event_log_root: PathBuf,
    pub sidecar_root: PathBuf,
    pub projection_db_path: PathBuf,
    pub telemetry_db_path: PathBuf,
}

impl StorageRoots {
    pub fn initialize(data_root: impl AsRef<Path>) -> Result<Self, String> {
        let data_root = data_root.as_ref().to_path_buf();
        let runtime_root = data_root.join(RUNTIME_DIR_NAME);
        let event_log_root = runtime_root.join(EVENT_LOG_DIR_NAME);
        let sidecar_root = runtime_root.join(SIDECAR_DIR_NAME);
        fs::create_dir_all(&event_log_root).map_err(|error| {
            format!(
                "无法创建 App Server runtime 事件目录 {}: {error}",
                event_log_root.display()
            )
        })?;
        fs::create_dir_all(&sidecar_root).map_err(|error| {
            format!(
                "无法创建 App Server runtime sidecar 目录 {}: {error}",
                sidecar_root.display()
            )
        })?;
        fs::create_dir_all(&runtime_root).map_err(|error| {
            format!(
                "无法创建 App Server runtime 目录 {}: {error}",
                runtime_root.display()
            )
        })?;

        Ok(Self {
            product_db_path: data_root.join(PRODUCT_DB_FILE_NAME),
            projection_db_path: runtime_root.join(PROJECTION_DB_FILE_NAME),
            telemetry_db_path: runtime_root.join(TELEMETRY_DB_FILE_NAME),
            data_root,
            runtime_root,
            event_log_root,
            sidecar_root,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initialize_derives_runtime_paths_from_data_root() {
        let temp = tempfile::tempdir().expect("tempdir");
        let roots = StorageRoots::initialize(temp.path().join("app-server")).expect("roots");

        assert_eq!(roots.product_db_path, roots.data_root.join("lime.db"));
        assert_eq!(roots.runtime_root, roots.data_root.join("runtime"));
        assert_eq!(roots.event_log_root, roots.runtime_root.join("events"));
        assert_eq!(roots.sidecar_root, roots.runtime_root.join("sidecar"));
        assert_eq!(
            roots.projection_db_path,
            roots.runtime_root.join("projection_1.sqlite")
        );
        assert_eq!(
            roots.telemetry_db_path,
            roots.runtime_root.join("telemetry_1.sqlite")
        );
        assert!(roots.event_log_root.is_dir());
        assert!(roots.sidecar_root.is_dir());
    }
}
