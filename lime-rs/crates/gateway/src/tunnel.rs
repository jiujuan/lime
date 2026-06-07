//! Gateway 全局隧道运行时
//!
//! 目标：为 webhook 渠道提供公网入口（优先 Cloudflare Tunnel）。

use chrono::Utc;
use lime_core::config::{Config, GatewayTunnelConfig};
use lime_core::logger::LogStore;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::{ffi::OsStr, process::Stdio};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tokio::time::{timeout, Duration};

type LogState = Arc<RwLock<LogStore>>;
const MANUAL_STOP_REASON: &str = "tunnel 已手动停止";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GatewayTunnelStatus {
    pub running: bool,
    pub provider: String,
    pub mode: String,
    pub binary: String,
    pub local_url: String,
    pub public_base_url: Option<String>,
    pub pid: Option<u32>,
    pub started_at: Option<String>,
    pub last_error: Option<String>,
    pub last_exit: Option<String>,
    pub command_preview: Option<String>,
    pub connector_active: Option<bool>,
    pub connector_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GatewayTunnelProbeResult {
    pub ok: bool,
    pub provider: String,
    pub mode: String,
    pub binary: String,
    pub version: Option<String>,
    pub config_ready: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CloudflareTunnelCreateResult {
    pub ok: bool,
    pub tunnel_name: String,
    pub tunnel_id: Option<String>,
    pub credentials_file: Option<String>,
    pub dns_name: Option<String>,
    pub public_base_url: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CloudflareTunnelCreateRequest {
    pub tunnel_name: String,
    pub dns_name: Option<String>,
}

#[derive(Default, Clone)]
pub struct GatewayTunnelState {
    inner: Arc<RwLock<GatewayTunnelRuntime>>,
}

#[derive(Default)]
struct GatewayTunnelRuntime {
    process: Option<RunningProcess>,
    status: GatewayTunnelStatus,
}

struct RunningProcess {
    child: Child,
    stdout_task: Option<JoinHandle<()>>,
    stderr_task: Option<JoinHandle<()>>,
}

pub async fn probe_tunnel(config: &Config) -> GatewayTunnelProbeResult {
    let tunnel = &config.gateway.tunnel;
    let provider = normalize_provider(&tunnel.provider);
    let mode = normalize_mode(&tunnel.mode);
    let binary = resolve_binary(tunnel).to_string();

    if provider != "cloudflare" {
        return GatewayTunnelProbeResult {
            ok: false,
            provider,
            mode,
            binary,
            version: None,
            config_ready: false,
            message: "当前仅支持 cloudflare provider".to_string(),
        };
    }

    let version_output = Command::new(&binary).arg("--version").output().await;
    let version = version_output
        .ok()
        .and_then(|out| {
            String::from_utf8(out.stdout)
                .ok()
                .or_else(|| String::from_utf8(out.stderr).ok())
        })
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty());

    let has_runtime_auth = tunnel
        .cloudflare
        .run_token
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some()
        || tunnel
            .cloudflare
            .tunnel_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .is_some();

    GatewayTunnelProbeResult {
        ok: version.is_some(),
        provider,
        mode,
        binary,
        version,
        config_ready: has_runtime_auth,
        message: if has_runtime_auth {
            "探测成功，可尝试启动隧道".to_string()
        } else {
            "探测成功，但缺少 run_token 或 tunnel_id".to_string()
        },
    }
}

pub async fn create_cloudflare_tunnel(
    config: &Config,
    logs: LogState,
    request: CloudflareTunnelCreateRequest,
) -> Result<CloudflareTunnelCreateResult, String> {
    let tunnel = &config.gateway.tunnel;
    let binary = resolve_binary(tunnel);
    let tunnel_name = request.tunnel_name.trim();
    if tunnel_name.is_empty() {
        return Err("tunnel_name 不能为空".to_string());
    }

    logs.write().await.add(
        "info",
        &format!(
            "[GatewayTunnel] 开始创建 Cloudflare Tunnel: name={}",
            tunnel_name
        ),
    );

    let create_output = Command::new(binary)
        .args(["tunnel", "create", tunnel_name])
        .output()
        .await
        .map_err(|e| format!("执行 cloudflared tunnel create 失败: {e}"))?;

    let merged_output = merge_output(&create_output.stdout, &create_output.stderr);
    if !create_output.status.success() {
        return Err(format!(
            "cloudflared tunnel create 失败: {}",
            trim_output_for_error(&merged_output)
        ));
    }

    let tunnel_id = extract_uuid(&merged_output);
    let credentials_file = extract_json_path(&merged_output);
    let dns_name = request
        .dns_name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let public_base_url = dns_name.as_ref().map(|host| format!("https://{}", host));

    if let (Some(id), Some(host)) = (tunnel_id.as_deref(), dns_name.as_deref()) {
        let dns_output = Command::new(binary)
            .args(["tunnel", "route", "dns", id, host])
            .output()
            .await
            .map_err(|e| format!("执行 cloudflared tunnel route dns 失败: {e}"))?;
        let dns_text = merge_output(&dns_output.stdout, &dns_output.stderr);
        if !dns_output.status.success() {
            return Err(format!(
                "cloudflared tunnel route dns 失败: {}",
                trim_output_for_error(&dns_text)
            ));
        }
    }

    Ok(CloudflareTunnelCreateResult {
        ok: true,
        tunnel_name: tunnel_name.to_string(),
        tunnel_id,
        credentials_file,
        dns_name,
        public_base_url,
        message: "Cloudflare Tunnel 创建成功".to_string(),
    })
}

pub async fn start_tunnel(
    state: &GatewayTunnelState,
    logs: LogState,
    config: Config,
) -> Result<GatewayTunnelStatus, String> {
    {
        let mut runtime = state.inner.write().await;
        poll_runtime_process(&mut runtime)?;
        if runtime.status.running {
            return Ok(runtime.status.clone());
        }
    }

    let tunnel = &config.gateway.tunnel;
    if !tunnel.enabled {
        return Err("gateway.tunnel.enabled=false，请先启用隧道".to_string());
    }

    let provider = normalize_provider(&tunnel.provider);
    if provider != "cloudflare" {
        return Err(format!("暂不支持的 tunnel provider: {}", tunnel.provider));
    }

    let mode = normalize_mode(&tunnel.mode);
    if mode == "external" {
        return Err(
            "external 模式不支持应用内启动，请手动启动后仅填写 public_base_url".to_string(),
        );
    }

    let binary = resolve_binary(tunnel).to_string();
    let local_url = build_local_url(tunnel);
    let public_base_url = resolve_public_base_url(tunnel);
    let (args, preview) = build_cloudflare_run_args(tunnel, &local_url)?;

    let mut command = Command::new(&binary);
    command
        .args(args.iter().map(String::as_str))
        .kill_on_drop(true)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|e| format!("启动 tunnel 进程失败: {e}"))?;

    let pid = child.id();
    let stdout_task = child.stdout.take().map(|stdout| {
        let logs = logs.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                logs.write()
                    .await
                    .add("info", &format!("[GatewayTunnel][stdout] {}", line));
            }
        })
    });
    let stderr_task = child.stderr.take().map(|stderr| {
        let logs = logs.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                logs.write()
                    .await
                    .add("warn", &format!("[GatewayTunnel][stderr] {}", line));
            }
        })
    });

    logs.write().await.add(
        "info",
        &format!(
            "[GatewayTunnel] 已启动: provider={} mode={} local={} public={:?}",
            provider, mode, local_url, public_base_url
        ),
    );

    let mut runtime = state.inner.write().await;
    runtime.process = Some(RunningProcess {
        child,
        stdout_task,
        stderr_task,
    });
    runtime.status = GatewayTunnelStatus {
        running: true,
        provider,
        mode,
        binary,
        local_url,
        public_base_url,
        pid,
        started_at: Some(Utc::now().to_rfc3339()),
        last_error: None,
        last_exit: None,
        command_preview: Some(preview),
        connector_active: None,
        connector_message: None,
    };
    Ok(runtime.status.clone())
}

pub async fn stop_tunnel(
    state: &GatewayTunnelState,
    logs: LogState,
) -> Result<GatewayTunnelStatus, String> {
    let process = {
        let mut runtime = state.inner.write().await;
        runtime.status.running = false;
        runtime.process.take()
    };

    if let Some(mut process) = process {
        let _ = process.child.start_kill();
        let _ = timeout(Duration::from_secs(3), process.child.wait()).await;
        if let Some(task) = process.stdout_task {
            task.abort();
        }
        if let Some(task) = process.stderr_task {
            task.abort();
        }
        logs.write()
            .await
            .add("info", "[GatewayTunnel] 隧道进程已停止");
    }

    let mut runtime = state.inner.write().await;
    runtime.status.running = false;
    runtime.status.pid = None;
    runtime.status.started_at = None;
    runtime.status.last_exit = None;
    runtime.status.last_error = Some(MANUAL_STOP_REASON.to_string());
    Ok(runtime.status.clone())
}

pub async fn status_tunnel(state: &GatewayTunnelState) -> Result<GatewayTunnelStatus, String> {
    let mut runtime = state.inner.write().await;
    poll_runtime_process(&mut runtime)?;
    Ok(runtime.status.clone())
}

pub async fn status_tunnel_with_config(
    state: &GatewayTunnelState,
    config: Option<Config>,
) -> Result<GatewayTunnelStatus, String> {
    let mut status = status_tunnel(state).await?;
    if let Some(cfg) = config.as_ref() {
        apply_connector_diagnostics(cfg, &mut status).await;

        if normalize_mode(&cfg.gateway.tunnel.mode) == "external" {
            status.running = status.connector_active.unwrap_or(false);
            if !status.running && status.last_error.is_none() {
                status.last_error = Some(
                    "external 模式未检测到活跃 cloudflared 连接，请先在系统服务中启动 tunnel"
                        .to_string(),
                );
            }
        }
    }
    Ok(status)
}

fn poll_runtime_process(runtime: &mut GatewayTunnelRuntime) -> Result<(), String> {
    let mut exited = None;
    if let Some(process) = runtime.process.as_mut() {
        match process.child.try_wait() {
            Ok(Some(status)) => {
                exited = Some(status.to_string());
            }
            Ok(None) => {}
            Err(e) => {
                runtime.status.last_error = Some(format!("查询 tunnel 进程状态失败: {e}"));
            }
        }
    }
    if let Some(exit_status) = exited {
        runtime.process = None;
        runtime.status.running = false;
        runtime.status.pid = None;
        runtime.status.started_at = None;
        runtime.status.last_exit = Some(exit_status.clone());
        runtime.status.last_error = Some(format!("tunnel 进程已退出: {}", exit_status));
    }
    Ok(())
}

fn resolve_binary(tunnel: &GatewayTunnelConfig) -> &str {
    tunnel
        .binary_path
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("cloudflared")
}

fn build_local_url(tunnel: &GatewayTunnelConfig) -> String {
    format!(
        "http://{}:{}",
        tunnel.local_host.trim(),
        tunnel.local_port.max(1)
    )
}

fn resolve_public_base_url(tunnel: &GatewayTunnelConfig) -> Option<String> {
    tunnel
        .public_base_url
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(strip_trailing_slash)
        .or_else(|| {
            tunnel
                .cloudflare
                .dns_name
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(|host| format!("https://{}", host))
        })
}

fn strip_trailing_slash(value: &str) -> String {
    value.trim_end_matches('/').to_string()
}

async fn apply_connector_diagnostics(config: &Config, status: &mut GatewayTunnelStatus) {
    let tunnel = &config.gateway.tunnel;
    if !tunnel.enabled {
        status.connector_active = None;
        status.connector_message = None;
        return;
    }
    if normalize_provider(&tunnel.provider) != "cloudflare" {
        status.connector_active = None;
        status.connector_message = None;
        return;
    }
    let Some(tunnel_id) = tunnel
        .cloudflare
        .tunnel_id
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    else {
        status.connector_active = None;
        status.connector_message =
            Some("缺少 cloudflare.tunnel_id，无法诊断连接器状态".to_string());
        return;
    };

    let binary = resolve_binary(tunnel).to_string();
    let output_result = timeout(
        Duration::from_secs(8),
        Command::new(binary)
            .args(["tunnel", "info", tunnel_id])
            .output(),
    )
    .await;

    let output = match output_result {
        Ok(Ok(out)) => out,
        Ok(Err(e)) => {
            status.connector_active = None;
            status.connector_message = Some(format!("查询 cloudflared tunnel info 失败: {e}"));
            return;
        }
        Err(_) => {
            status.connector_active = None;
            status.connector_message = Some("查询 cloudflared tunnel info 超时".to_string());
            return;
        }
    };

    let merged = merge_output(&output.stdout, &output.stderr);
    let (active, message) = parse_cloudflare_tunnel_info(&merged);
    status.connector_active = Some(active);
    status.connector_message = Some(message.clone());
    if !active {
        status.last_error = Some(format!(
            "Cloudflare Tunnel 无活跃连接器（可能导致 1033/回调不可达）: {}",
            message
        ));
    }
}

fn parse_cloudflare_tunnel_info(raw: &str) -> (bool, String) {
    let text = raw.trim();
    if text.is_empty() {
        return (false, "cloudflared tunnel info 返回为空".to_string());
    }
    let normalized = text.to_ascii_lowercase();
    if normalized.contains("does not have any active connection")
        || normalized.contains("no active connectors")
    {
        return (false, "无活跃连接器".to_string());
    }
    if normalized.contains("error")
        && !normalized.contains("0 errors")
        && !normalized.contains("0 error")
    {
        return (false, trim_output_for_error(text));
    }
    if normalized.contains("registered tunnel connection")
        || normalized.contains("connector id")
        || normalized.contains("connections")
    {
        return (true, "检测到活跃连接器".to_string());
    }
    (false, trim_output_for_error(text))
}

fn build_cloudflare_run_args(
    tunnel: &GatewayTunnelConfig,
    local_url: &str,
) -> Result<(Vec<String>, String), String> {
    if let Some(token) = tunnel
        .cloudflare
        .run_token
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        let args = vec![
            "tunnel".to_string(),
            "--no-autoupdate".to_string(),
            "run".to_string(),
            "--token".to_string(),
            token.to_string(),
        ];
        let preview = "cloudflared tunnel --no-autoupdate run --token ****".to_string();
        return Ok((args, preview));
    }

    let tunnel_id = tunnel
        .cloudflare
        .tunnel_id
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "缺少 cloudflare.tunnel_id（或 cloudflare.run_token）".to_string())?;

    let mut args = vec![
        "tunnel".to_string(),
        "--no-autoupdate".to_string(),
        "--url".to_string(),
        local_url.to_string(),
    ];
    let mut preview = format!("cloudflared tunnel --no-autoupdate --url {} ", local_url);

    if let Some(credentials_file) = tunnel
        .cloudflare
        .credentials_file
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        args.push("--credentials-file".to_string());
        args.push(credentials_file.to_string());
        preview.push_str("--credentials-file ");
        preview.push_str(credentials_file);
        preview.push(' ');
    }

    args.push("run".to_string());
    args.push(tunnel_id.to_string());
    preview.push_str("run ");
    preview.push_str(tunnel_id);
    Ok((args, preview))
}

fn normalize_provider(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "ngrok" => "ngrok".to_string(),
        "none" => "none".to_string(),
        _ => "cloudflare".to_string(),
    }
}

fn normalize_mode(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        "external" => "external".to_string(),
        _ => "managed".to_string(),
    }
}

pub fn is_manual_stop_error(error: Option<&str>) -> bool {
    error
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.contains(MANUAL_STOP_REASON))
        .unwrap_or(false)
}

fn merge_output(stdout: &[u8], stderr: &[u8]) -> String {
    let mut text = String::new();
    if let Ok(s) = String::from_utf8(stdout.to_vec()) {
        text.push_str(&s);
    }
    if let Ok(s) = String::from_utf8(stderr.to_vec()) {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&s);
    }
    text
}

fn trim_output_for_error(output: &str) -> String {
    let trimmed = output.trim();
    if trimmed.len() > 500 {
        format!("{}...", &trimmed[..500])
    } else {
        trimmed.to_string()
    }
}

fn extract_uuid(text: &str) -> Option<String> {
    text.split_whitespace()
        .map(clean_token)
        .find(|token| looks_like_uuid(token))
        .map(str::to_string)
}

fn extract_json_path(text: &str) -> Option<String> {
    text.split_whitespace()
        .map(clean_token)
        .find(|token| token.ends_with(".json") && token.contains(std::path::MAIN_SEPARATOR))
        .map(str::to_string)
}

fn clean_token(token: &str) -> &str {
    token.trim_matches(|c: char| c == '\'' || c == '"' || c == '(' || c == ')' || c == ',')
}

fn looks_like_uuid(token: &str) -> bool {
    let parts = token.split('-').collect::<Vec<_>>();
    if parts.len() != 5 {
        return false;
    }
    let lens = [8_usize, 4, 4, 4, 12];
    for (idx, part) in parts.iter().enumerate() {
        if part.len() != lens[idx] || !part.chars().all(|ch| ch.is_ascii_hexdigit()) {
            return false;
        }
    }
    true
}

#[allow(dead_code)]
fn as_str_lossy<T: AsRef<OsStr>>(value: T) -> String {
    value.as_ref().to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::is_manual_stop_error;

    #[test]
    fn manual_stop_error_marker_detected() {
        assert!(is_manual_stop_error(Some("tunnel 已手动停止")));
        assert!(is_manual_stop_error(Some("xxx tunnel 已手动停止 yyy")));
    }

    #[test]
    fn manual_stop_error_marker_not_detected() {
        assert!(!is_manual_stop_error(None));
        assert!(!is_manual_stop_error(Some("")));
        assert!(!is_manual_stop_error(Some(
            "tunnel 进程已退出: exit status: 1"
        )));
    }
}
