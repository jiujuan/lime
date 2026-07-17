use app_server_protocol::{
    ProjectShellEmptyResponse, ProjectShellSessionDrainEventsParams,
    ProjectShellSessionDrainEventsResponse, ProjectShellSessionEvent,
    ProjectShellSessionKillParams, ProjectShellSessionResizeParams, ProjectShellSessionStartParams,
    ProjectShellSessionStartResponse, ProjectShellSessionStream, ProjectShellSessionWriteParams,
};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::{HashMap, VecDeque};
use std::env;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

const DEFAULT_COLS: u16 = 120;
const DEFAULT_ROWS: u16 = 16;
const MAX_COLS: u16 = 500;
const MAX_ROWS: u16 = 200;
const MAX_EVENT_QUEUE: usize = 4_000;
const DEFAULT_DRAIN_LIMIT: usize = 100;
const MAX_DRAIN_LIMIT: usize = 500;

#[derive(Debug, Error)]
pub enum ProjectShellError {
    #[error("项目 Shell 根目录不存在: {0}")]
    InvalidRootPath(String),
    #[error("项目 Shell 会话不存在: {0}")]
    SessionNotFound(String),
    #[error("项目 Shell 启动失败: {0}")]
    Spawn(String),
    #[error("项目 Shell 写入失败: {0}")]
    Write(String),
    #[error("项目 Shell 调整尺寸失败: {0}")]
    Resize(String),
    #[error("项目 Shell 结束失败: {0}")]
    Kill(String),
    #[error("项目 Shell 状态锁失败")]
    Lock,
}

#[derive(Clone, Default)]
pub struct ProjectShellManager {
    inner: Arc<ProjectShellInner>,
}

#[derive(Default)]
struct ProjectShellInner {
    sessions: Mutex<HashMap<String, ProjectShellSession>>,
    events: Mutex<VecDeque<ProjectShellSessionEvent>>,
    next_id: AtomicU64,
}

struct ProjectShellSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

impl ProjectShellManager {
    pub fn start_session(
        &self,
        params: ProjectShellSessionStartParams,
    ) -> Result<ProjectShellSessionStartResponse, ProjectShellError> {
        self.start_session_with_shell(params, resolve_shell_command())
    }

    fn start_session_with_shell(
        &self,
        params: ProjectShellSessionStartParams,
        shell: ResolvedShellCommand,
    ) -> Result<ProjectShellSessionStartResponse, ProjectShellError> {
        let cwd = validate_root_path(&params.root_path)?;
        let cols = normalize_dimension(params.cols, DEFAULT_COLS, MAX_COLS);
        let rows = normalize_dimension(params.rows, DEFAULT_ROWS, MAX_ROWS);
        let session_id = self.next_session_id();
        let mut command = CommandBuilder::new(&shell.executable);
        for arg in &shell.args {
            command.arg(arg);
        }
        command.cwd(&cwd);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", env_or_default("COLORTERM", "truecolor"));
        command.env("CLICOLOR", env_or_default("CLICOLOR", "1"));
        command.env("FORCE_COLOR", env_or_default("FORCE_COLOR", "1"));
        command.env(
            "LSCOLORS",
            env_or_default("LSCOLORS", "ExFxBxDxCxegedabagacad"),
        );
        command.env("COLUMNS", cols.to_string());
        command.env("LINES", rows.to_string());

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| ProjectShellError::Spawn(error.to_string()))?;
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| ProjectShellError::Spawn(error.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| ProjectShellError::Spawn(error.to_string()))?;
        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|error| ProjectShellError::Spawn(error.to_string()))?;
        drop(pair.slave);

        let cwd_string = cwd.to_string_lossy().to_string();
        let response = ProjectShellSessionStartResponse {
            session_id: session_id.clone(),
            cwd: cwd_string.clone(),
            shell: shell.executable.clone(),
            title: build_title(&cwd),
            local_echo: false,
            tty: true,
            pid: child.process_id(),
        };
        let session = ProjectShellSession {
            master: pair.master,
            writer,
            child,
        };
        self.inner
            .sessions
            .lock()
            .map_err(|_| ProjectShellError::Lock)?
            .insert(session_id.clone(), session);
        self.spawn_reader(session_id, reader);
        Ok(response)
    }

    pub fn write_session(
        &self,
        params: ProjectShellSessionWriteParams,
    ) -> Result<ProjectShellEmptyResponse, ProjectShellError> {
        let mut sessions = self
            .inner
            .sessions
            .lock()
            .map_err(|_| ProjectShellError::Lock)?;
        let session = sessions
            .get_mut(&params.session_id)
            .ok_or_else(|| ProjectShellError::SessionNotFound(params.session_id.clone()))?;
        session
            .writer
            .write_all(params.data.as_bytes())
            .map_err(|error| ProjectShellError::Write(error.to_string()))?;
        session
            .writer
            .flush()
            .map_err(|error| ProjectShellError::Write(error.to_string()))?;
        Ok(ProjectShellEmptyResponse {})
    }

    pub fn resize_session(
        &self,
        params: ProjectShellSessionResizeParams,
    ) -> Result<ProjectShellEmptyResponse, ProjectShellError> {
        let sessions = self
            .inner
            .sessions
            .lock()
            .map_err(|_| ProjectShellError::Lock)?;
        let session = sessions
            .get(&params.session_id)
            .ok_or_else(|| ProjectShellError::SessionNotFound(params.session_id.clone()))?;
        session
            .master
            .resize(PtySize {
                rows: normalize_dimension(Some(params.rows), DEFAULT_ROWS, MAX_ROWS),
                cols: normalize_dimension(Some(params.cols), DEFAULT_COLS, MAX_COLS),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| ProjectShellError::Resize(error.to_string()))?;
        Ok(ProjectShellEmptyResponse {})
    }

    pub fn kill_session(
        &self,
        params: ProjectShellSessionKillParams,
    ) -> Result<ProjectShellEmptyResponse, ProjectShellError> {
        let mut sessions = self
            .inner
            .sessions
            .lock()
            .map_err(|_| ProjectShellError::Lock)?;
        let mut session = sessions
            .remove(&params.session_id)
            .ok_or_else(|| ProjectShellError::SessionNotFound(params.session_id.clone()))?;
        session
            .child
            .kill()
            .map_err(|error| ProjectShellError::Kill(error.to_string()))?;
        Ok(ProjectShellEmptyResponse {})
    }

    pub fn drain_events(
        &self,
        params: ProjectShellSessionDrainEventsParams,
    ) -> Result<ProjectShellSessionDrainEventsResponse, ProjectShellError> {
        let limit = params
            .limit
            .map(usize::from)
            .unwrap_or(DEFAULT_DRAIN_LIMIT)
            .clamp(1, MAX_DRAIN_LIMIT);
        let mut events = self
            .inner
            .events
            .lock()
            .map_err(|_| ProjectShellError::Lock)?;
        let mut drained = Vec::new();
        let session_filter = params.session_id.as_deref();

        let mut retained = VecDeque::new();
        while let Some(event) = events.pop_front() {
            let matched = match session_filter {
                Some(session_id) => event_session_id(&event) == session_id,
                None => true,
            };
            if matched && drained.len() < limit {
                drained.push(event);
            } else {
                retained.push_back(event);
            }
        }
        *events = retained;

        Ok(ProjectShellSessionDrainEventsResponse { events: drained })
    }

    fn next_session_id(&self) -> String {
        let sequence = self.inner.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or(0);
        format!("project-shell-{now:x}-{sequence}")
    }

    fn spawn_reader(&self, session_id: String, mut reader: Box<dyn Read + Send>) {
        let inner = Arc::clone(&self.inner);
        thread::spawn(move || {
            let mut buffer = [0_u8; 8192];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => {
                        push_event(
                            &inner,
                            ProjectShellSessionEvent::Exit {
                                session_id: session_id.clone(),
                                exit_code: None,
                                signal: None,
                            },
                        );
                        remove_session(&inner, &session_id);
                        break;
                    }
                    Ok(size) => {
                        push_event(
                            &inner,
                            ProjectShellSessionEvent::Data {
                                session_id: session_id.clone(),
                                stream: ProjectShellSessionStream::Stdout,
                                data: String::from_utf8_lossy(&buffer[..size]).to_string(),
                            },
                        );
                    }
                    Err(error) => {
                        push_event(
                            &inner,
                            ProjectShellSessionEvent::Error {
                                session_id: session_id.clone(),
                                message: error.to_string(),
                            },
                        );
                        remove_session(&inner, &session_id);
                        break;
                    }
                }
            }
        });
    }
}

#[derive(Debug)]
struct ResolvedShellCommand {
    executable: String,
    args: Vec<String>,
}

fn resolve_shell_command() -> ResolvedShellCommand {
    if cfg!(windows) {
        return ResolvedShellCommand {
            executable: env::var("COMSPEC")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .or_else(|| {
                    env::var("ComSpec")
                        .ok()
                        .filter(|value| !value.trim().is_empty())
                })
                .unwrap_or_else(|| "cmd.exe".to_string()),
            args: vec!["/d".to_string()],
        };
    }

    let executable = env::var("SHELL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "/bin/sh".to_string());
    // 嵌入式 Shell 优先快速进入可交互态，避免 login profile 拖慢底部面板启动。
    let args = vec!["-i".to_string()];
    ResolvedShellCommand { executable, args }
}

fn env_or_default(name: &str, fallback: &str) -> String {
    env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn validate_root_path(root_path: &str) -> Result<std::path::PathBuf, ProjectShellError> {
    let path = Path::new(root_path);
    if !path.is_absolute() || !path.is_dir() {
        return Err(ProjectShellError::InvalidRootPath(root_path.to_string()));
    }
    Ok(path.to_path_buf())
}

fn normalize_dimension(value: Option<u16>, fallback: u16, max: u16) -> u16 {
    value.unwrap_or(fallback).clamp(2, max)
}

fn push_event(inner: &ProjectShellInner, event: ProjectShellSessionEvent) {
    let Ok(mut events) = inner.events.lock() else {
        return;
    };
    events.push_back(event);
    while events.len() > MAX_EVENT_QUEUE {
        events.pop_front();
    }
}

fn remove_session(inner: &ProjectShellInner, session_id: &str) {
    let Ok(mut sessions) = inner.sessions.lock() else {
        return;
    };
    sessions.remove(session_id);
}

fn event_session_id(event: &ProjectShellSessionEvent) -> &str {
    match event {
        ProjectShellSessionEvent::Data { session_id, .. }
        | ProjectShellSessionEvent::Exit { session_id, .. }
        | ProjectShellSessionEvent::Error { session_id, .. } => session_id,
    }
}

fn build_title(cwd: &Path) -> String {
    let folder = cwd
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| cwd.to_str().unwrap_or("project"));
    let user = env::var("USER")
        .or_else(|_| env::var("USERNAME"))
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "shell".to_string());
    let host = env::var("HOSTNAME")
        .or_else(|_| env::var("COMPUTERNAME"))
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "local".to_string());
    format!("{user}@{host}: {folder}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn start_test_session(
        manager: &ProjectShellManager,
        cwd: &Path,
    ) -> ProjectShellSessionStartResponse {
        let shell = if cfg!(windows) {
            resolve_shell_command()
        } else {
            ResolvedShellCommand {
                executable: "/bin/sh".to_string(),
                args: vec!["-i".to_string()],
            }
        };
        manager
            .start_session_with_shell(
                ProjectShellSessionStartParams {
                    root_path: cwd.to_string_lossy().to_string(),
                    cols: Some(100),
                    rows: Some(10),
                },
                shell,
            )
            .expect("start shell session")
    }

    fn marker_command() -> &'static str {
        if cfg!(windows) {
            "echo __project_shell_marker__\r"
        } else {
            "printf '__project_shell_marker__\\n'\r"
        }
    }

    fn color_environment_command() -> String {
        if cfg!(windows) {
            return concat!(
                "echo TERM=%TERM% COLORTERM=%COLORTERM% CLICOLOR=%CLICOLOR% ",
                "FORCE_COLOR=%FORCE_COLOR% LSCOLORS=%LSCOLORS%\r"
            )
            .to_string();
        }
        concat!(
            "printf \"TERM=%s COLORTERM=%s CLICOLOR=%s FORCE_COLOR=%s LSCOLORS=%s\\n\" ",
            "\"$TERM\" \"$COLORTERM\" \"$CLICOLOR\" \"$FORCE_COLOR\" \"$LSCOLORS\"\r"
        )
        .to_string()
    }

    #[cfg(windows)]
    #[test]
    fn windows_shell_skips_cmd_autorun() {
        let shell = resolve_shell_command();

        assert_eq!(shell.args, vec!["/d".to_string()]);
    }

    #[cfg(not(windows))]
    #[test]
    fn unix_shell_uses_interactive_non_login_mode() {
        let shell = resolve_shell_command();

        assert_eq!(shell.args, vec!["-i".to_string()]);
    }

    #[test]
    fn interactive_session_writes_and_drains_output() {
        let manager = ProjectShellManager::default();
        let cwd = env::current_dir().expect("current dir");
        let session = start_test_session(&manager, &cwd);

        manager
            .write_session(ProjectShellSessionWriteParams {
                session_id: session.session_id.clone(),
                data: marker_command().to_string(),
            })
            .expect("write shell command");

        let deadline = Instant::now() + Duration::from_secs(5);
        let mut output = String::new();
        while Instant::now() < deadline {
            let drained = manager
                .drain_events(ProjectShellSessionDrainEventsParams {
                    session_id: Some(session.session_id.clone()),
                    limit: Some(200),
                })
                .expect("drain shell events");
            for event in drained.events {
                if let ProjectShellSessionEvent::Data { data, .. } = event {
                    output.push_str(&data);
                }
            }
            if output.matches("__project_shell_marker__").count() >= 2 {
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }

        let _ = manager.kill_session(ProjectShellSessionKillParams {
            session_id: session.session_id,
        });

        assert!(
            output.matches("__project_shell_marker__").count() >= 2,
            "expected shell output, got: {output:?}"
        );
    }

    #[test]
    fn interactive_session_sets_color_terminal_environment() {
        let manager = ProjectShellManager::default();
        let cwd = env::current_dir().expect("current dir");
        let session = start_test_session(&manager, &cwd);

        let _ = drain_session_output_until(
            &manager,
            &session.session_id,
            Duration::from_millis(300),
            |_| false,
        );

        manager
            .write_session(ProjectShellSessionWriteParams {
                session_id: session.session_id.clone(),
                data: color_environment_command(),
            })
            .expect("write shell command");

        let output = drain_session_output_until(
            &manager,
            &session.session_id,
            Duration::from_secs(15),
            |output| {
                output.contains("TERM=xterm-256color")
                    && output.contains("COLORTERM=truecolor")
                    && output.contains("CLICOLOR=1")
                    && output.contains("FORCE_COLOR=1")
                    && output.contains("LSCOLORS=")
            },
        );

        let _ = manager.kill_session(ProjectShellSessionKillParams {
            session_id: session.session_id,
        });

        assert!(
            output.contains("TERM=xterm-256color")
                && output.contains("COLORTERM=truecolor")
                && output.contains("CLICOLOR=1")
                && output.contains("FORCE_COLOR=1")
                && output.contains("LSCOLORS="),
            "expected color shell env, got: {output:?}"
        );
    }

    fn drain_session_output_until(
        manager: &ProjectShellManager,
        session_id: &str,
        timeout: Duration,
        done: impl Fn(&str) -> bool,
    ) -> String {
        let deadline = Instant::now() + timeout;
        let mut output = String::new();
        while Instant::now() < deadline {
            let drained = manager
                .drain_events(ProjectShellSessionDrainEventsParams {
                    session_id: Some(session_id.to_string()),
                    limit: Some(200),
                })
                .expect("drain shell events");
            for event in drained.events {
                if let ProjectShellSessionEvent::Data { data, .. } = event {
                    output.push_str(&data);
                }
            }
            if done(&output) {
                break;
            }
            thread::sleep(Duration::from_millis(50));
        }
        output
    }
}
