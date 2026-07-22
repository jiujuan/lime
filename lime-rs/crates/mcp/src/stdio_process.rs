use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
#[cfg(unix)]
use std::time::Duration;
use tracing::warn;

#[cfg(unix)]
const PROCESS_GROUP_TERM_GRACE_PERIOD: Duration = Duration::from_secs(2);

#[derive(Clone)]
pub(crate) struct StdioProcessHandle {
    inner: Arc<StdioProcessHandleInner>,
}

struct StdioProcessHandleInner {
    server_name: String,
    pid: Option<u32>,
    terminated: AtomicBool,
}

impl StdioProcessHandle {
    pub(crate) fn local(server_name: impl Into<String>, pid: Option<u32>) -> Self {
        Self {
            inner: Arc::new(StdioProcessHandleInner {
                server_name: server_name.into(),
                pid,
                terminated: AtomicBool::new(false),
            }),
        }
    }

    pub(crate) fn terminate(&self) {
        self.inner.terminate();
    }
}

impl StdioProcessHandleInner {
    fn terminate(&self) {
        if self.terminated.swap(true, Ordering::AcqRel) {
            return;
        }

        let Some(pid) = self.pid else {
            return;
        };
        terminate_process_tree(&self.server_name, pid);
    }
}

impl Drop for StdioProcessHandleInner {
    fn drop(&mut self) {
        self.terminate();
    }
}

#[cfg(unix)]
fn terminate_process_tree(server_name: &str, process_group_id: u32) {
    let Ok(process_group_id) = i32::try_from(process_group_id) else {
        warn!(
            server_name,
            process_group_id, "MCP process group id exceeds i32"
        );
        return;
    };

    let result = unsafe { libc::kill(-process_group_id, libc::SIGTERM) };
    if result != 0 {
        let error = std::io::Error::last_os_error();
        if error.kind() != std::io::ErrorKind::NotFound {
            warn!(server_name, process_group_id, error = %error, "Failed to terminate MCP process group");
        }
        return;
    }

    let server_name = server_name.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(PROCESS_GROUP_TERM_GRACE_PERIOD);
        let result = unsafe { libc::kill(-process_group_id, libc::SIGKILL) };
        if result != 0 {
            let error = std::io::Error::last_os_error();
            if error.kind() != std::io::ErrorKind::NotFound {
                warn!(server_name, process_group_id, error = %error, "Failed to kill MCP process group");
            }
        }
    });
}

#[cfg(windows)]
fn terminate_process_tree(server_name: &str, pid: u32) {
    let pid = pid.to_string();
    let result = std::process::Command::new("taskkill")
        .args(["/PID", &pid, "/T", "/F"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
    if let Err(error) = result {
        warn!(server_name, pid, error = %error, "Failed to terminate MCP process tree");
    }
}

#[cfg(not(any(unix, windows)))]
fn terminate_process_tree(server_name: &str, pid: u32) {
    warn!(
        server_name,
        pid, "MCP process-tree termination is unsupported on this platform"
    );
}
