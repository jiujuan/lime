use serde::Serialize;
use std::fmt;
use std::path::Path;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum BackendKind {
    Sidecar,
    Pid,
}

impl BackendKind {
    pub fn is_supported(self) -> bool {
        matches!(self, Self::Sidecar)
    }

    pub fn unsupported_reason(self) -> Option<&'static str> {
        match self {
            Self::Sidecar => None,
            Self::Pid => {
                Some("pid backend is not supported until local socket lifecycle is enabled")
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SidecarBackendMode {
    External,
    Mock,
    Unavailable,
}

impl SidecarBackendMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::External => "external",
            Self::Mock => "mock",
            Self::Unavailable => "unavailable",
        }
    }

    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "external" => Ok(Self::External),
            "mock" => Ok(Self::Mock),
            "unavailable" => Ok(Self::Unavailable),
            other => Err(format!("unsupported app-server backend mode: {other}")),
        }
    }
}

impl Default for SidecarBackendMode {
    fn default() -> Self {
        Self::Unavailable
    }
}

impl fmt::Display for SidecarBackendMode {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendPaths {
    pub binary_path: PathBuf,
    pub pid_file: PathBuf,
    pub update_pid_file: PathBuf,
    pub stderr_log_file: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackendStartDecision {
    Start,
    AlreadyRunning,
    Restart,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendReadinessProbe {
    pub listen_url: String,
    pub client_name: String,
}

impl BackendPaths {
    pub fn new(state_dir: &Path, binary_path: impl Into<PathBuf>) -> Self {
        Self {
            binary_path: binary_path.into(),
            pid_file: state_dir.join(crate::PID_FILE_NAME),
            update_pid_file: state_dir.join(crate::UPDATE_PID_FILE_NAME),
            stderr_log_file: state_dir.join(crate::STDERR_LOG_FILE_NAME),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backend_paths_use_state_dir_layout() {
        let paths = BackendPaths::new(Path::new("/state"), "/bin/app-server");

        assert_eq!(paths.binary_path, PathBuf::from("/bin/app-server"));
        assert_eq!(
            paths.pid_file,
            PathBuf::from("/state").join("app-server.pid")
        );
        assert_eq!(
            paths.update_pid_file,
            PathBuf::from("/state").join("app-server-updater.pid")
        );
        assert_eq!(
            paths.stderr_log_file,
            PathBuf::from("/state").join("app-server.stderr.log")
        );
    }

    #[test]
    fn pid_backend_is_explicitly_unsupported_until_local_socket_lifecycle_exists() {
        assert!(BackendKind::Sidecar.is_supported());
        assert_eq!(BackendKind::Sidecar.unsupported_reason(), None);
        assert!(!BackendKind::Pid.is_supported());
        assert_eq!(
            BackendKind::Pid.unsupported_reason(),
            Some("pid backend is not supported until local socket lifecycle is enabled")
        );
    }

    #[test]
    fn sidecar_backend_mode_matches_standalone_cli_values() {
        assert_eq!(
            SidecarBackendMode::default(),
            SidecarBackendMode::Unavailable
        );
        assert_eq!(SidecarBackendMode::External.as_str(), "external");
        assert_eq!(SidecarBackendMode::Mock.as_str(), "mock");
        assert_eq!(SidecarBackendMode::Unavailable.as_str(), "unavailable");
        assert_eq!(
            SidecarBackendMode::parse("external").expect("mode"),
            SidecarBackendMode::External
        );
        assert!(SidecarBackendMode::parse("agent").is_err());
    }
}
