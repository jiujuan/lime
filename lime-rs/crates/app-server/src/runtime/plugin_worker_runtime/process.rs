use super::RuntimeCoreError;
use super::RuntimeEvent;
use crate::runtime::plugin_worker_workflow::runtime_event_from_worker_progress_envelope;
use serde_json::Value;
use std::io::BufRead;
use std::io::BufReader;
use std::io::Read;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::process::Command;
use std::process::Stdio;
use std::sync::mpsc;
use std::sync::mpsc::Receiver;
use std::thread::JoinHandle;
use std::time::Duration;
use std::time::Instant;

const MAX_WORKER_STDOUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_WORKER_PROGRESS_STDOUT_BYTES: usize = 64 * 1024 * 1024;
const MAX_WORKER_STDERR_BYTES: usize = 512 * 1024;

#[derive(Debug, Default)]
struct WorkerStdoutBudget {
    final_response_bytes: usize,
    progress_bytes: usize,
}

pub(super) fn resolve_package_entrypoint(
    package_root: &Path,
    entrypoint: Option<&str>,
    label: &str,
) -> Result<PathBuf, RuntimeCoreError> {
    let entrypoint = entrypoint
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| RuntimeCoreError::Backend(format!("{label} entrypoint is missing.")))?;
    if entrypoint.starts_with("http://")
        || entrypoint.starts_with("https://")
        || entrypoint.contains("..")
    {
        return Err(RuntimeCoreError::Backend(format!(
            "{label} entrypoint must be a package-relative file path."
        )));
    }
    let path = package_root.join(entrypoint.trim_start_matches("./"));
    if !path.is_file() {
        return Err(RuntimeCoreError::Backend(format!(
            "{label} entrypoint was not found: {}",
            path.display()
        )));
    }
    Ok(path)
}

pub(super) fn resolve_worker_entrypoint(
    package_root: &Path,
    entrypoint: Option<&str>,
) -> Result<PathBuf, RuntimeCoreError> {
    resolve_package_entrypoint(package_root, entrypoint, "Plugin worker")
}

pub(super) fn node_binary() -> String {
    std::env::var("NODE").unwrap_or_else(|_| {
        if cfg!(windows) {
            "node.exe".to_string()
        } else {
            "node".to_string()
        }
    })
}

pub(super) fn invoke_worker_process(
    node: &str,
    package_root: &Path,
    entrypoint: &Path,
    request: &Value,
    timeout_ms: u64,
    on_progress_event: &mut dyn FnMut(RuntimeEvent) -> Result<(), RuntimeCoreError>,
) -> Result<Value, RuntimeCoreError> {
    invoke_worker_json_process(
        "Plugin worker",
        node,
        package_root,
        entrypoint,
        request,
        timeout_ms,
        on_progress_event,
    )
}

fn invoke_worker_json_process(
    label: &str,
    node: &str,
    package_root: &Path,
    entrypoint: &Path,
    request: &Value,
    timeout_ms: u64,
    on_progress_event: &mut dyn FnMut(RuntimeEvent) -> Result<(), RuntimeCoreError>,
) -> Result<Value, RuntimeCoreError> {
    let mut command = Command::new(node);
    command
        .arg(entrypoint)
        .current_dir(package_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for key in inherited_plugin_secret_env_keys() {
        command.env_remove(key);
    }

    let mut child = command
        .spawn()
        .map_err(|error| RuntimeCoreError::Backend(format!("failed to spawn {label}: {error}")))?;
    let (stdout_reader, stdout_rx) = child
        .stdout
        .take()
        .map(spawn_worker_stdout_line_reader)
        .map(|(reader, rx)| (Some(reader), Some(rx)))
        .unwrap_or((None, None));
    let stderr_reader = child
        .stderr
        .take()
        .map(|stderr| spawn_worker_output_reader(stderr, "stderr"));
    write_worker_request(child.stdin.take(), request)?;
    let started = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);
    let mut stdout_budget = WorkerStdoutBudget::default();
    let mut response: Option<Value> = None;

    loop {
        if started.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            drain_worker_stdout_lines(
                label,
                stdout_rx.as_ref(),
                &mut stdout_budget,
                &mut response,
                on_progress_event,
            )?;
            let _ = join_worker_stdout_line_reader(stdout_reader, "stdout");
            let _ = join_worker_output_reader(stderr_reader, "stderr", MAX_WORKER_STDERR_BYTES);
            return Err(RuntimeCoreError::Backend(format!(
                "{label} timed out after {timeout_ms}ms"
            )));
        }

        drain_worker_stdout_lines(
            label,
            stdout_rx.as_ref(),
            &mut stdout_budget,
            &mut response,
            on_progress_event,
        )?;

        match child.try_wait() {
            Ok(Some(status)) => {
                drain_worker_stdout_lines(
                    label,
                    stdout_rx.as_ref(),
                    &mut stdout_budget,
                    &mut response,
                    on_progress_event,
                )?;
                join_worker_stdout_line_reader(stdout_reader, "stdout")?;
                drain_worker_stdout_lines(
                    label,
                    stdout_rx.as_ref(),
                    &mut stdout_budget,
                    &mut response,
                    on_progress_event,
                )?;
                let stderr =
                    join_worker_output_reader(stderr_reader, "stderr", MAX_WORKER_STDERR_BYTES)?;
                if let Some(response) = response {
                    return Ok(response);
                }
                if !status.success() {
                    return Err(RuntimeCoreError::Backend(format!(
                        "{label} exited with {}: {}",
                        status,
                        String::from_utf8_lossy(&stderr).trim()
                    )));
                }
                return Err(RuntimeCoreError::Backend(format!(
                    "{label} returned empty stdout."
                )));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(error) => {
                return Err(RuntimeCoreError::Backend(format!(
                    "failed to poll {label}: {error}"
                )));
            }
        }
    }
}

pub(super) fn invoke_node_json_process(
    label: &str,
    node: &str,
    package_root: &Path,
    entrypoint: &Path,
    request: &Value,
    timeout_ms: u64,
) -> Result<Value, RuntimeCoreError> {
    let mut command = Command::new(node);
    command
        .arg(entrypoint)
        .current_dir(package_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for key in inherited_plugin_secret_env_keys() {
        command.env_remove(key);
    }

    let mut child = command
        .spawn()
        .map_err(|error| RuntimeCoreError::Backend(format!("failed to spawn {label}: {error}")))?;
    let stdout_reader = child
        .stdout
        .take()
        .map(|stdout| spawn_worker_output_reader(stdout, "stdout"));
    let stderr_reader = child
        .stderr
        .take()
        .map(|stderr| spawn_worker_output_reader(stderr, "stderr"));
    write_worker_request(child.stdin.take(), request)?;
    let started = Instant::now();
    let timeout = Duration::from_millis(timeout_ms);
    loop {
        if started.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = join_worker_output_reader(stdout_reader, "stdout", MAX_WORKER_STDOUT_BYTES);
            let _ = join_worker_output_reader(stderr_reader, "stderr", MAX_WORKER_STDERR_BYTES);
            return Err(RuntimeCoreError::Backend(format!(
                "{label} timed out after {timeout_ms}ms"
            )));
        }
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout =
                    join_worker_output_reader(stdout_reader, "stdout", MAX_WORKER_STDOUT_BYTES)?;
                let stderr =
                    join_worker_output_reader(stderr_reader, "stderr", MAX_WORKER_STDERR_BYTES)?;
                if !status.success() {
                    return Err(RuntimeCoreError::Backend(format!(
                        "{label} exited with {}: {}",
                        status,
                        String::from_utf8_lossy(&stderr).trim()
                    )));
                }
                return decode_node_stdout(label, &stdout);
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(error) => {
                return Err(RuntimeCoreError::Backend(format!(
                    "failed to poll {label}: {error}"
                )));
            }
        }
    }
}

fn spawn_worker_output_reader<R>(
    mut reader: R,
    label: &'static str,
) -> JoinHandle<Result<Vec<u8>, String>>
where
    R: Read + Send + 'static,
{
    std::thread::spawn(move || {
        let mut output = Vec::new();
        reader
            .read_to_end(&mut output)
            .map_err(|error| format!("failed to collect Plugin worker {label}: {error}"))?;
        Ok(output)
    })
}

fn spawn_worker_stdout_line_reader<R>(
    reader: R,
) -> (
    JoinHandle<Result<(), String>>,
    Receiver<Result<String, String>>,
)
where
    R: Read + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    let handle = std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut line = String::new();
        loop {
            line.clear();
            let bytes = reader
                .read_line(&mut line)
                .map_err(|error| format!("failed to collect Plugin worker stdout: {error}"))?;
            if bytes == 0 {
                return Ok(());
            }
            let text = line.trim_end_matches(['\r', '\n']).to_string();
            if tx.send(Ok(text)).is_err() {
                return Ok(());
            }
        }
    });
    (handle, rx)
}

fn drain_worker_stdout_lines(
    label: &str,
    rx: Option<&Receiver<Result<String, String>>>,
    stdout_budget: &mut WorkerStdoutBudget,
    response: &mut Option<Value>,
    on_progress_event: &mut dyn FnMut(RuntimeEvent) -> Result<(), RuntimeCoreError>,
) -> Result<(), RuntimeCoreError> {
    let Some(rx) = rx else {
        return Ok(());
    };
    loop {
        match rx.try_recv() {
            Ok(Ok(line)) => handle_worker_stdout_line(
                label,
                line.as_str(),
                stdout_budget,
                response,
                on_progress_event,
            )?,
            Ok(Err(error)) => return Err(RuntimeCoreError::Backend(error)),
            Err(mpsc::TryRecvError::Empty) | Err(mpsc::TryRecvError::Disconnected) => return Ok(()),
        }
    }
}

fn handle_worker_stdout_line(
    label: &str,
    line: &str,
    stdout_budget: &mut WorkerStdoutBudget,
    response: &mut Option<Value>,
    on_progress_event: &mut dyn FnMut(RuntimeEvent) -> Result<(), RuntimeCoreError>,
) -> Result<(), RuntimeCoreError> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    let line_bytes = trimmed.len();
    if line_bytes > MAX_WORKER_STDOUT_BYTES {
        return Err(RuntimeCoreError::Backend(format!(
            "{label} stdout line exceeded the size limit."
        )));
    }
    let value = serde_json::from_str::<Value>(trimmed).map_err(|error| {
        RuntimeCoreError::Backend(format!("failed to decode {label} stdout line: {error}"))
    })?;
    if let Some(event) = runtime_event_from_worker_progress_envelope(&value)
        .map_err(|error| RuntimeCoreError::Backend(format!("{label} {error}")))?
    {
        stdout_budget.progress_bytes = stdout_budget.progress_bytes.saturating_add(line_bytes);
        if stdout_budget.progress_bytes > MAX_WORKER_PROGRESS_STDOUT_BYTES {
            return Err(RuntimeCoreError::Backend(format!(
                "{label} progress stdout exceeded the size limit."
            )));
        }
        on_progress_event(event)?;
        return Ok(());
    }
    stdout_budget.final_response_bytes = stdout_budget
        .final_response_bytes
        .saturating_add(line_bytes);
    if stdout_budget.final_response_bytes > MAX_WORKER_STDOUT_BYTES {
        return Err(RuntimeCoreError::Backend(format!(
            "{label} stdout exceeded the size limit."
        )));
    }
    if response.is_some() {
        return Err(RuntimeCoreError::Backend(format!(
            "{label} returned multiple final JSON responses."
        )));
    }
    *response = Some(value);
    Ok(())
}

fn join_worker_stdout_line_reader(
    reader: Option<JoinHandle<Result<(), String>>>,
    label: &'static str,
) -> Result<(), RuntimeCoreError> {
    let Some(reader) = reader else {
        return Ok(());
    };
    reader
        .join()
        .map_err(|_| {
            RuntimeCoreError::Backend(format!("failed to collect Plugin worker {label}: panicked"))
        })?
        .map_err(RuntimeCoreError::Backend)
}

fn join_worker_output_reader(
    reader: Option<JoinHandle<Result<Vec<u8>, String>>>,
    label: &'static str,
    max_bytes: usize,
) -> Result<Vec<u8>, RuntimeCoreError> {
    let Some(reader) = reader else {
        return Ok(Vec::new());
    };
    let output = reader.join().map_err(|_| {
        RuntimeCoreError::Backend(format!("failed to collect Plugin worker {label}: panicked"))
    })?;
    let output = output.map_err(RuntimeCoreError::Backend)?;
    if output.len() > max_bytes {
        return Err(RuntimeCoreError::Backend(format!(
            "Plugin worker {label} exceeded the size limit."
        )));
    }
    Ok(output)
}

fn write_worker_request(
    stdin: Option<std::process::ChildStdin>,
    request: &Value,
) -> Result<(), RuntimeCoreError> {
    let mut stdin = stdin.ok_or_else(|| {
        RuntimeCoreError::Backend("Plugin worker stdin is unavailable.".to_string())
    })?;
    let input = serde_json::to_vec(request).map_err(|error| {
        RuntimeCoreError::Backend(format!("failed to encode Plugin worker request: {error}"))
    })?;
    stdin.write_all(&input).map_err(|error| {
        RuntimeCoreError::Backend(format!("failed to write Plugin worker request: {error}"))
    })?;
    stdin.write_all(b"\n").map_err(|error| {
        RuntimeCoreError::Backend(format!("failed to finish Plugin worker request: {error}"))
    })?;
    stdin.flush().map_err(|error| {
        RuntimeCoreError::Backend(format!("failed to flush Plugin worker request: {error}"))
    })?;
    drop(stdin);
    Ok(())
}

fn decode_node_stdout(label: &str, stdout: &[u8]) -> Result<Value, RuntimeCoreError> {
    let text = std::str::from_utf8(stdout).map_err(|error| {
        RuntimeCoreError::Backend(format!("{label} stdout must be UTF-8: {error}"))
    })?;
    let line = text
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or_else(|| RuntimeCoreError::Backend(format!("{label} returned empty stdout.")))?;
    serde_json::from_str(line).map_err(|error| {
        RuntimeCoreError::Backend(format!("failed to decode {label} response: {error}"))
    })
}

fn inherited_plugin_secret_env_keys() -> &'static [&'static str] {
    &[
        "LIME_ACCESS_TOKEN",
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_AUTH_TOKEN",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "DEEPSEEK_API_KEY",
        "OPENROUTER_API_KEY",
        "MISTRAL_API_KEY",
        "XAI_API_KEY",
        "DASHSCOPE_API_KEY",
        "MOONSHOT_API_KEY",
        "ZHIPUAI_API_KEY",
        "GROQ_API_KEY",
        "FAL_KEY",
    ]
}
