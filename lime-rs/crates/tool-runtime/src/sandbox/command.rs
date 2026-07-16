use super::{parse_requested_sandbox_policy, RequestedSandboxPolicy, SandboxBackend};
use std::fmt;
use std::path::Path;

const MACOS_SANDBOX_EXEC: &str = "/usr/bin/sandbox-exec";
const PROTECTED_METADATA_NAMES: [&str; 3] = [".git", ".codex", ".agents"];

const SEATBELT_BASE_POLICY: &str = r#"
(version 1)
(deny default)
(allow process-exec)
(allow process-fork)
(allow signal (target same-sandbox))
(allow process-info* (target same-sandbox))
(allow file-read*)
(allow file-map-executable)
(allow file-write-data (literal "/dev/null"))
(allow file-read* file-write* (literal "/dev/null"))
(allow file-read* file-write* (subpath "/dev/fd"))
(allow file-read* file-write* (subpath "/tmp"))
(allow file-read* file-write* (subpath "/private/tmp"))
(allow file-read* file-write* (subpath "/var/tmp"))
(allow file-read* file-write* (subpath "/private/var/tmp"))
(allow sysctl-read)
(allow mach-lookup)
(allow ipc-posix-sem)
(allow ipc-posix-shm-read*)
(allow ipc-posix-shm-write-create)
(allow ipc-posix-shm-write-data)
(allow ipc-posix-shm-write-unlink)
(allow user-preference-read)
(allow pseudo-tty)
(allow file-read* file-write* file-ioctl (literal "/dev/ptmx"))
(allow file-read* file-write* file-ioctl (regex #"^/dev/ttys[0-9]+"))
(allow network-outbound (literal "/private/var/run/syslog"))
"#;

#[derive(Debug)]
pub struct SandboxCommandRequest<'a> {
    pub backend: SandboxBackend,
    pub requested_policy: Option<&'a str>,
    pub command: Vec<String>,
    pub working_directory: &'a Path,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SandboxCommandError {
    EmptyCommand,
    UnsupportedBackend(SandboxBackend),
    UnsupportedPolicy(String),
}

impl fmt::Display for SandboxCommandError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyCommand => formatter.write_str("sandbox command must not be empty"),
            Self::UnsupportedBackend(backend) => {
                write!(
                    formatter,
                    "sandbox backend '{}' is unavailable",
                    backend.label()
                )
            }
            Self::UnsupportedPolicy(policy) => {
                write!(formatter, "sandbox policy '{policy}' is unsupported")
            }
        }
    }
}

impl std::error::Error for SandboxCommandError {}

pub fn prepare_sandbox_command(
    request: SandboxCommandRequest<'_>,
) -> Result<Vec<String>, SandboxCommandError> {
    if request.command.is_empty() {
        return Err(SandboxCommandError::EmptyCommand);
    }
    let policy = parse_requested_sandbox_policy(request.requested_policy)
        .unwrap_or(RequestedSandboxPolicy::WorkspaceWrite);
    if policy == RequestedSandboxPolicy::DangerFullAccess {
        return Err(SandboxCommandError::UnsupportedPolicy(
            policy.label().to_string(),
        ));
    }

    match request.backend {
        SandboxBackend::Seatbelt => Ok(prepare_seatbelt_command(
            request.command,
            request.working_directory,
            policy,
        )),
        SandboxBackend::LinuxSandbox => Ok(prepare_bubblewrap_command(
            request.command,
            request.working_directory,
            policy,
        )),
        SandboxBackend::None | SandboxBackend::RestrictedToken => {
            Err(SandboxCommandError::UnsupportedBackend(request.backend))
        }
    }
}

fn prepare_seatbelt_command(
    command: Vec<String>,
    working_directory: &Path,
    policy: RequestedSandboxPolicy,
) -> Vec<String> {
    let mut profile = SEATBELT_BASE_POLICY.to_string();
    if policy == RequestedSandboxPolicy::WorkspaceWrite {
        profile.push_str("\n(allow file-write* (subpath (param \"WORKSPACE\")))\n");
        for name in PROTECTED_METADATA_NAMES {
            profile.push_str(&format!(
                "(deny file-write* (regex #\"{}/{}(/.*)?$\"))\n",
                regex::escape(&working_directory.to_string_lossy()),
                regex::escape(name),
            ));
        }
    }

    let mut wrapped = vec![
        MACOS_SANDBOX_EXEC.to_string(),
        "-p".to_string(),
        profile,
        format!("-DWORKSPACE={}", working_directory.to_string_lossy()),
        "--".to_string(),
    ];
    wrapped.extend(command);
    wrapped
}

fn prepare_bubblewrap_command(
    command: Vec<String>,
    working_directory: &Path,
    policy: RequestedSandboxPolicy,
) -> Vec<String> {
    let cwd = working_directory.to_string_lossy().to_string();
    let mut wrapped = vec![
        "bwrap".to_string(),
        "--die-with-parent".to_string(),
        "--new-session".to_string(),
        "--unshare-user".to_string(),
        "--unshare-pid".to_string(),
        "--unshare-uts".to_string(),
        "--unshare-ipc".to_string(),
        "--unshare-net".to_string(),
        "--ro-bind".to_string(),
        "/".to_string(),
        "/".to_string(),
        "--dev-bind".to_string(),
        "/dev".to_string(),
        "/dev".to_string(),
        "--proc".to_string(),
        "/proc".to_string(),
    ];
    for temporary_root in ["/tmp", "/var/tmp"] {
        if Path::new(temporary_root).is_dir() {
            wrapped.extend([
                "--bind".to_string(),
                temporary_root.to_string(),
                temporary_root.to_string(),
            ]);
        }
    }
    if policy == RequestedSandboxPolicy::WorkspaceWrite {
        wrapped.extend(["--bind".to_string(), cwd.clone(), cwd.clone()]);
        for name in PROTECTED_METADATA_NAMES {
            let path = working_directory.join(name);
            if path.exists() {
                let path = path.to_string_lossy().to_string();
                wrapped.extend(["--ro-bind".to_string(), path.clone(), path]);
            }
        }
    }
    wrapped.extend(["--chdir".to_string(), cwd, "--".to_string()]);
    wrapped.extend(command);
    wrapped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seatbelt_workspace_write_wraps_command_and_protects_metadata() {
        let command = prepare_sandbox_command(SandboxCommandRequest {
            backend: SandboxBackend::Seatbelt,
            requested_policy: Some("workspace-write"),
            command: vec!["sh".to_string(), "-c".to_string(), "pwd".to_string()],
            working_directory: Path::new("/tmp/workspace"),
        })
        .expect("seatbelt command");

        assert_eq!(command[0], MACOS_SANDBOX_EXEC);
        assert!(command[2].contains("(allow file-write* (subpath (param \"WORKSPACE\")))"));
        assert!(command[2].contains(r"/\.git(/.*)?$"));
        assert_eq!(command[3], "-DWORKSPACE=/tmp/workspace");
        assert_eq!(&command[5..], ["sh", "-c", "pwd"]);
    }

    #[test]
    fn bubblewrap_read_only_does_not_bind_workspace_writable() {
        let command = prepare_sandbox_command(SandboxCommandRequest {
            backend: SandboxBackend::LinuxSandbox,
            requested_policy: Some("read-only"),
            command: vec!["pwd".to_string()],
            working_directory: Path::new("/workspace"),
        })
        .expect("bubblewrap command");

        assert_eq!(command[0], "bwrap");
        assert!(command
            .windows(2)
            .any(|args| args == ["--chdir", "/workspace"]));
        assert!(!command
            .windows(3)
            .any(|args| args == ["--bind", "/workspace", "/workspace"]));
    }

    #[test]
    fn restricted_token_backend_fails_closed_without_runner() {
        let error = prepare_sandbox_command(SandboxCommandRequest {
            backend: SandboxBackend::RestrictedToken,
            requested_policy: Some("workspace-write"),
            command: vec!["cmd.exe".to_string()],
            working_directory: Path::new("C:/workspace"),
        })
        .expect_err("restricted token must not fall back to unsandboxed execution");

        assert_eq!(
            error,
            SandboxCommandError::UnsupportedBackend(SandboxBackend::RestrictedToken)
        );
    }
}
