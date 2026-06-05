//! Gateway 公共隧道命令
//!
//! 提供 Cloudflare Tunnel 的探测、创建、启停与回调 URL 同步能力。

use crate::app::{AppState, LogState};
use crate::config::GlobalConfigManagerState;
use lime_gateway::tunnel::{
    create_cloudflare_tunnel, probe_tunnel, start_tunnel, status_tunnel_with_config, stop_tunnel,
    CloudflareTunnelCreateRequest, CloudflareTunnelCreateResult, GatewayTunnelProbeResult,
    GatewayTunnelState, GatewayTunnelStatus,
};
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio::process::Command;

#[derive(Debug, Clone, Deserialize)]
pub struct GatewayTunnelCreateRequestPayload {
    #[serde(default)]
    pub tunnel_name: Option<String>,
    #[serde(default)]
    pub dns_name: Option<String>,
    #[serde(default = "default_true")]
    pub persist: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct GatewayTunnelCreateResponse {
    pub result: CloudflareTunnelCreateResult,
    pub status: GatewayTunnelStatus,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GatewayTunnelSyncWebhookRequest {
    pub channel: String,
    #[serde(default)]
    pub account_id: Option<String>,
    #[serde(default)]
    pub webhook_path: Option<String>,
    #[serde(default = "default_true")]
    pub persist: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct GatewayTunnelSyncWebhookResponse {
    pub channel: String,
    pub account_id: Option<String>,
    pub webhook_path: String,
    pub public_base_url: String,
    pub webhook_url: String,
    pub persisted: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CloudflaredInstallStatus {
    pub installed: bool,
    pub binary: String,
    pub version: Option<String>,
    pub platform: String,
    pub package_manager: Option<String>,
    pub install_supported: bool,
    pub install_command: Option<String>,
    pub requires_privilege: bool,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CloudflaredInstallRequest {
    #[serde(default)]
    pub confirm: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CloudflaredInstallResult {
    pub ok: bool,
    pub attempted: bool,
    pub platform: String,
    pub package_manager: Option<String>,
    pub command: Option<String>,
    pub exit_code: Option<i32>,
    pub installed: bool,
    pub version: Option<String>,
    pub stdout: String,
    pub stderr: String,
    pub message: String,
}

fn default_true() -> bool {
    true
}

#[tauri::command]
pub async fn gateway_tunnel_probe(
    config_manager: State<'_, GlobalConfigManagerState>,
) -> Result<GatewayTunnelProbeResult, String> {
    let config = config_manager.config();
    Ok(probe_tunnel(&config).await)
}

#[tauri::command]
pub async fn gateway_tunnel_detect_cloudflared(
    config_manager: State<'_, GlobalConfigManagerState>,
) -> Result<CloudflaredInstallStatus, String> {
    detect_cloudflared_status(&config_manager.config()).await
}

#[tauri::command]
pub async fn gateway_tunnel_install_cloudflared(
    config_manager: State<'_, GlobalConfigManagerState>,
    request: CloudflaredInstallRequest,
) -> Result<CloudflaredInstallResult, String> {
    if !request.confirm {
        return Err(
            "请先确认安装：该操作会在系统范围安装 cloudflared。请传入 confirm=true 再执行。"
                .to_string(),
        );
    }
    install_cloudflared(&config_manager.config()).await
}

#[tauri::command]
pub async fn gateway_tunnel_create(
    tunnel_state: State<'_, GatewayTunnelState>,
    state: State<'_, AppState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    request: GatewayTunnelCreateRequestPayload,
) -> Result<GatewayTunnelCreateResponse, String> {
    let config = config_manager.config();
    let tunnel_name = request
        .tunnel_name
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
        .or_else(|| {
            config
                .gateway
                .tunnel
                .cloudflare
                .tunnel_name
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "lime-gateway".to_string());

    let result = create_cloudflare_tunnel(
        &config,
        logs.inner().clone(),
        CloudflareTunnelCreateRequest {
            tunnel_name: tunnel_name.clone(),
            dns_name: request.dns_name.clone(),
        },
    )
    .await?;

    if request.persist {
        let mut next = config.clone();
        let tunnel = &mut next.gateway.tunnel;
        tunnel.enabled = true;
        tunnel.provider = "cloudflare".to_string();
        tunnel.mode = "managed".to_string();
        tunnel.cloudflare.tunnel_name = Some(tunnel_name);
        if let Some(tunnel_id) = result.tunnel_id.clone() {
            tunnel.cloudflare.tunnel_id = Some(tunnel_id);
        }
        if let Some(credentials_file) = result.credentials_file.clone() {
            tunnel.cloudflare.credentials_file = Some(credentials_file);
        }
        if let Some(dns_name) = result.dns_name.clone() {
            tunnel.cloudflare.dns_name = Some(dns_name);
        }
        if let Some(public_base_url) = result.public_base_url.clone() {
            tunnel.public_base_url = Some(public_base_url);
        }
        persist_full_config(state, config_manager.clone(), next).await?;
    }

    let status = status_tunnel_with_config(&tunnel_state, Some(config_manager.config()))
        .await
        .unwrap_or_default();
    Ok(GatewayTunnelCreateResponse { result, status })
}

#[tauri::command]
pub async fn gateway_tunnel_start(
    tunnel_state: State<'_, GatewayTunnelState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
) -> Result<GatewayTunnelStatus, String> {
    let config = config_manager.config();
    start_tunnel(&tunnel_state, logs.inner().clone(), config).await
}

#[tauri::command]
pub async fn gateway_tunnel_stop(
    tunnel_state: State<'_, GatewayTunnelState>,
    logs: State<'_, LogState>,
) -> Result<GatewayTunnelStatus, String> {
    stop_tunnel(&tunnel_state, logs.inner().clone()).await
}

#[tauri::command]
pub async fn gateway_tunnel_restart(
    tunnel_state: State<'_, GatewayTunnelState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
) -> Result<GatewayTunnelStatus, String> {
    let _ = stop_tunnel(&tunnel_state, logs.inner().clone()).await;
    let config = config_manager.config();
    start_tunnel(&tunnel_state, logs.inner().clone(), config).await
}

#[tauri::command]
pub async fn gateway_tunnel_status(
    tunnel_state: State<'_, GatewayTunnelState>,
    logs: State<'_, LogState>,
    config_manager: State<'_, GlobalConfigManagerState>,
) -> Result<GatewayTunnelStatus, String> {
    let config = config_manager.config();
    let mut status = status_tunnel_with_config(&tunnel_state, Some(config.clone())).await?;

    let is_managed = config.gateway.tunnel.enabled
        && config
            .gateway
            .tunnel
            .provider
            .trim()
            .eq_ignore_ascii_case("cloudflare")
        && config
            .gateway
            .tunnel
            .mode
            .trim()
            .eq_ignore_ascii_case("managed");
    if is_managed && !status.running && status.last_exit.is_some() {
        logs.write().await.add(
            "warn",
            "[GatewayTunnel] 检测到 managed 隧道已退出，尝试自动重启一次",
        );
        if let Ok(restarted) = start_tunnel(&tunnel_state, logs.inner().clone(), config).await {
            status = restarted;
        }
    }

    Ok(status)
}

#[tauri::command]
pub async fn gateway_tunnel_sync_webhook_url(
    state: State<'_, AppState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    request: GatewayTunnelSyncWebhookRequest,
) -> Result<GatewayTunnelSyncWebhookResponse, String> {
    let channel = request.channel.trim().to_ascii_lowercase();
    if channel != "feishu" {
        return Err(format!("暂不支持的 channel: {}", request.channel));
    }

    let config = config_manager.config();
    let base_url = resolve_public_base_url(&config)?;
    let webhook_path = request
        .webhook_path
        .as_deref()
        .map(normalize_webhook_path)
        .unwrap_or_else(|| {
            normalize_webhook_path(
                config
                    .channels
                    .feishu
                    .webhook_path
                    .as_deref()
                    .unwrap_or("/feishu/default"),
            )
        });
    let webhook_url = format!("{}{}", base_url, webhook_path);

    if request.persist {
        let mut next = config.clone();
        next.channels.feishu.connection_mode = "webhook".to_string();
        next.channels.feishu.webhook_path = Some(webhook_path.clone());
        next.channels.feishu.webhook_host = Some(next.gateway.tunnel.local_host.clone());
        next.channels.feishu.webhook_port = Some(next.gateway.tunnel.local_port);

        if let Some(account_id) = request
            .account_id
            .as_deref()
            .map(str::trim)
            .filter(|v| !v.is_empty())
        {
            if let Some(account) = next.channels.feishu.accounts.get_mut(account_id) {
                account.connection_mode = Some("webhook".to_string());
                account.webhook_path = Some(webhook_path.clone());
                account.webhook_host = Some(next.gateway.tunnel.local_host.clone());
                account.webhook_port = Some(next.gateway.tunnel.local_port);
            }
        }

        persist_full_config(state, config_manager, next).await?;
    }

    Ok(GatewayTunnelSyncWebhookResponse {
        channel,
        account_id: request.account_id,
        webhook_path,
        public_base_url: base_url,
        webhook_url,
        persisted: request.persist,
    })
}

async fn persist_full_config(
    state: State<'_, AppState>,
    config_manager: State<'_, GlobalConfigManagerState>,
    config: lime_core::config::Config,
) -> Result<(), String> {
    {
        let mut app_state = state.write().await;
        app_state.config = config.clone();
    }
    config_manager.0.save_config(&config).await
}

fn resolve_public_base_url(config: &lime_core::config::Config) -> Result<String, String> {
    let value = config
        .gateway
        .tunnel
        .public_base_url
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.trim_end_matches('/').to_string())
        .or_else(|| {
            config
                .gateway
                .tunnel
                .cloudflare
                .dns_name
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(|host| format!("https://{}", host))
        });
    value.ok_or_else(|| "缺少 gateway.tunnel.public_base_url 或 cloudflare.dns_name".to_string())
}

fn normalize_webhook_path(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "/feishu/default".to_string();
    }
    if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{}", trimmed)
    }
}

#[derive(Debug, Clone)]
struct InstallerSpec {
    package_manager: &'static str,
    command: String,
    requires_privilege: bool,
}

fn detect_platform() -> String {
    if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else if cfg!(target_os = "linux") {
        "linux".to_string()
    } else {
        std::env::consts::OS.to_string()
    }
}

async fn command_exists(name: &str) -> bool {
    match Command::new(name).arg("--version").output().await {
        Ok(_) => true,
        Err(error) => error.kind() != std::io::ErrorKind::NotFound,
    }
}

async fn cloudflared_version(binary: &str) -> Option<String> {
    let output = Command::new(binary).arg("--version").output().await.ok()?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let merged = if !stdout.is_empty() { stdout } else { stderr };
    if merged.is_empty() {
        None
    } else {
        Some(merged)
    }
}

async fn resolve_installer_spec(platform: &str) -> Option<InstallerSpec> {
    match platform {
        "macos" => {
            if command_exists("brew").await {
                Some(InstallerSpec {
                    package_manager: "brew",
                    command: "brew install cloudflared".to_string(),
                    requires_privilege: false,
                })
            } else {
                None
            }
        }
        "windows" => {
            if command_exists("winget").await {
                Some(InstallerSpec {
                    package_manager: "winget",
                    command: "winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements".to_string(),
                    requires_privilege: true,
                })
            } else if command_exists("choco").await {
                Some(InstallerSpec {
                    package_manager: "choco",
                    command: "choco install cloudflared -y".to_string(),
                    requires_privilege: true,
                })
            } else if command_exists("scoop").await {
                Some(InstallerSpec {
                    package_manager: "scoop",
                    command: "scoop install cloudflared".to_string(),
                    requires_privilege: false,
                })
            } else {
                None
            }
        }
        "linux" => {
            if command_exists("apt-get").await {
                Some(InstallerSpec {
                    package_manager: "apt-get",
                    command: "sudo apt-get update && sudo apt-get install -y cloudflared"
                        .to_string(),
                    requires_privilege: true,
                })
            } else if command_exists("dnf").await {
                Some(InstallerSpec {
                    package_manager: "dnf",
                    command: "sudo dnf install -y cloudflared".to_string(),
                    requires_privilege: true,
                })
            } else if command_exists("yum").await {
                Some(InstallerSpec {
                    package_manager: "yum",
                    command: "sudo yum install -y cloudflared".to_string(),
                    requires_privilege: true,
                })
            } else {
                None
            }
        }
        _ => None,
    }
}

async fn detect_cloudflared_status(
    config: &lime_core::config::Config,
) -> Result<CloudflaredInstallStatus, String> {
    let binary = config
        .gateway
        .tunnel
        .binary_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("cloudflared")
        .to_string();
    let version = cloudflared_version(&binary).await;
    let platform = detect_platform();
    let installer = resolve_installer_spec(&platform).await;
    let installed = version.is_some();

    Ok(CloudflaredInstallStatus {
        installed,
        binary,
        version,
        platform,
        package_manager: installer
            .as_ref()
            .map(|value| value.package_manager.to_string()),
        install_supported: installer.is_some(),
        install_command: installer.as_ref().map(|value| value.command.clone()),
        requires_privilege: installer
            .as_ref()
            .map(|value| value.requires_privilege)
            .unwrap_or(false),
        message: if installed {
            "检测到 cloudflared 已安装".to_string()
        } else if let Some(spec) = installer {
            format!("检测到可用安装器：{}，可执行一键安装", spec.package_manager)
        } else {
            "未检测到可用包管理器，请手动安装 cloudflared".to_string()
        },
    })
}

async fn install_cloudflared(
    config: &lime_core::config::Config,
) -> Result<CloudflaredInstallResult, String> {
    let platform = detect_platform();
    let Some(spec) = resolve_installer_spec(&platform).await else {
        return Ok(CloudflaredInstallResult {
            ok: false,
            attempted: false,
            platform,
            package_manager: None,
            command: None,
            exit_code: None,
            installed: cloudflared_version("cloudflared").await.is_some(),
            version: cloudflared_version("cloudflared").await,
            stdout: String::new(),
            stderr: String::new(),
            message: "当前系统未检测到可用包管理器，请手动安装 cloudflared".to_string(),
        });
    };

    let output = if cfg!(target_os = "windows") {
        Command::new("cmd")
            .args(["/C", &spec.command])
            .output()
            .await
            .map_err(|error| format!("执行安装命令失败: {error}"))?
    } else {
        Command::new("sh")
            .arg("-lc")
            .arg(&spec.command)
            .output()
            .await
            .map_err(|error| format!("执行安装命令失败: {error}"))?
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let exit_code = output.status.code();

    let binary = config
        .gateway
        .tunnel
        .binary_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("cloudflared");
    let version = cloudflared_version(binary).await;
    let installed = version.is_some();
    let ok = output.status.success() && installed;

    Ok(CloudflaredInstallResult {
        ok,
        attempted: true,
        platform,
        package_manager: Some(spec.package_manager.to_string()),
        command: Some(spec.command),
        exit_code,
        installed,
        version,
        stdout,
        stderr,
        message: if ok {
            "cloudflared 安装成功".to_string()
        } else {
            "cloudflared 安装命令执行完成，但未检测到可用二进制，请根据输出排查权限或网络问题"
                .to_string()
        },
    })
}
