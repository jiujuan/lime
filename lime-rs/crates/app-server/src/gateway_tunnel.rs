use app_server_protocol::GatewayTunnelCloudflaredDetectResponse;
use app_server_protocol::GatewayTunnelCloudflaredInstallParams;
use app_server_protocol::GatewayTunnelCloudflaredInstallResponse;
use app_server_protocol::GatewayTunnelCreateParams;
use app_server_protocol::GatewayTunnelCreateResponse;
use app_server_protocol::GatewayTunnelCreateResult;
use app_server_protocol::GatewayTunnelProbeResponse;
use app_server_protocol::GatewayTunnelStatusResponse;
use app_server_protocol::GatewayTunnelSyncWebhookUrlParams;
use app_server_protocol::GatewayTunnelSyncWebhookUrlResponse;
use lime_core::config::load_config;
use lime_core::config::save_config;
use lime_core::config::Config;
use lime_core::logger::LogStore;
use lime_gateway::tunnel::{
    create_cloudflare_tunnel, is_manual_stop_error, probe_tunnel, start_tunnel,
    status_tunnel_with_config, stop_tunnel, CloudflareTunnelCreateRequest,
    CloudflareTunnelCreateResult, GatewayTunnelProbeResult, GatewayTunnelState,
    GatewayTunnelStatus,
};
use std::sync::Arc;
use tokio::process::Command;
use tokio::sync::RwLock;

type LogState = Arc<RwLock<LogStore>>;

#[derive(Debug, Clone)]
struct InstallerSpec {
    package_manager: &'static str,
    command: String,
    requires_privilege: bool,
}

pub async fn probe_gateway_tunnel() -> Result<GatewayTunnelProbeResponse, String> {
    let config = load_config().map_err(|error| error.to_string())?;
    Ok(probe_response_from_gateway(probe_tunnel(&config).await))
}

pub async fn detect_gateway_tunnel_cloudflared(
) -> Result<GatewayTunnelCloudflaredDetectResponse, String> {
    let config = load_config().map_err(|error| error.to_string())?;
    detect_cloudflared_status(&config).await
}

pub async fn install_gateway_tunnel_cloudflared(
    params: GatewayTunnelCloudflaredInstallParams,
) -> Result<GatewayTunnelCloudflaredInstallResponse, String> {
    if !params.confirm {
        return Err(
            "请先确认安装：该操作会在系统范围安装 cloudflared。请传入 confirm=true 再执行。"
                .to_string(),
        );
    }
    let config = load_config().map_err(|error| error.to_string())?;
    install_cloudflared(&config).await
}

pub async fn create_gateway_tunnel(
    tunnel_state: &GatewayTunnelState,
    logs: LogState,
    params: GatewayTunnelCreateParams,
) -> Result<GatewayTunnelCreateResponse, String> {
    let config = load_config().map_err(|error| error.to_string())?;
    let tunnel_name = params
        .tunnel_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            config
                .gateway
                .tunnel
                .cloudflare
                .tunnel_name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "lime-gateway".to_string());

    let result = create_cloudflare_tunnel(
        &config,
        logs.clone(),
        CloudflareTunnelCreateRequest {
            tunnel_name: tunnel_name.clone(),
            dns_name: params.dns_name.clone(),
        },
    )
    .await?;

    if params.persist {
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
        save_config(&next).map_err(|error| error.to_string())?;
    }

    let status = status_tunnel_with_config(tunnel_state, Some(load_config().unwrap_or(config)))
        .await
        .unwrap_or_default();

    Ok(GatewayTunnelCreateResponse {
        result: create_result_from_gateway(result),
        status: status_response_from_gateway(status),
    })
}

pub async fn start_gateway_tunnel(
    tunnel_state: &GatewayTunnelState,
    logs: LogState,
) -> Result<GatewayTunnelStatusResponse, String> {
    let config = load_config().map_err(|error| error.to_string())?;
    start_tunnel(tunnel_state, logs, config)
        .await
        .map(status_response_from_gateway)
}

pub async fn stop_gateway_tunnel(
    tunnel_state: &GatewayTunnelState,
    logs: LogState,
) -> Result<GatewayTunnelStatusResponse, String> {
    stop_tunnel(tunnel_state, logs)
        .await
        .map(status_response_from_gateway)
}

pub async fn restart_gateway_tunnel(
    tunnel_state: &GatewayTunnelState,
    logs: LogState,
) -> Result<GatewayTunnelStatusResponse, String> {
    let _ = stop_tunnel(tunnel_state, logs.clone()).await;
    let config = load_config().map_err(|error| error.to_string())?;
    start_tunnel(tunnel_state, logs, config)
        .await
        .map(status_response_from_gateway)
}

pub async fn read_gateway_tunnel_status(
    tunnel_state: &GatewayTunnelState,
    logs: LogState,
) -> Result<GatewayTunnelStatusResponse, String> {
    let config = load_config().map_err(|error| error.to_string())?;
    let mut status = status_tunnel_with_config(tunnel_state, Some(config.clone())).await?;

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
        if let Ok(restarted) = start_tunnel(tunnel_state, logs, config).await {
            status = restarted;
        }
    }

    Ok(status_response_from_gateway(status))
}

pub async fn sync_gateway_tunnel_webhook_url(
    params: GatewayTunnelSyncWebhookUrlParams,
) -> Result<GatewayTunnelSyncWebhookUrlResponse, String> {
    let channel = params.channel.trim().to_ascii_lowercase();
    if channel != "feishu" {
        return Err(format!("暂不支持的 channel: {}", params.channel));
    }

    let config = load_config().map_err(|error| error.to_string())?;
    let base_url = resolve_public_base_url(&config)?;
    let webhook_path = params
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

    if params.persist {
        let mut next = config.clone();
        next.channels.feishu.connection_mode = "webhook".to_string();
        next.channels.feishu.webhook_path = Some(webhook_path.clone());
        next.channels.feishu.webhook_host = Some(next.gateway.tunnel.local_host.clone());
        next.channels.feishu.webhook_port = Some(next.gateway.tunnel.local_port);

        if let Some(account_id) = params
            .account_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            if let Some(account) = next.channels.feishu.accounts.get_mut(account_id) {
                account.connection_mode = Some("webhook".to_string());
                account.webhook_path = Some(webhook_path.clone());
                account.webhook_host = Some(next.gateway.tunnel.local_host.clone());
                account.webhook_port = Some(next.gateway.tunnel.local_port);
            }
        }

        save_config(&next).map_err(|error| error.to_string())?;
    }

    Ok(GatewayTunnelSyncWebhookUrlResponse {
        channel,
        account_id: params.account_id,
        webhook_path,
        public_base_url: base_url,
        webhook_url,
        persisted: params.persist,
    })
}

pub fn spawn_gateway_tunnel_daemon(tunnel_state: GatewayTunnelState, logs: LogState) {
    let _daemon_task = tokio::spawn(async move {
        let mut round: u64 = 0;
        loop {
            let config = match load_config().map_err(|error| error.to_string()) {
                Ok(config) => config,
                Err(message) => {
                    logs.write().await.add(
                        "warn",
                        &format!("[GatewayTunnel] 守护器读取配置失败: {message}"),
                    );
                    tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
                    continue;
                }
            };

            if !config.gateway.tunnel.enabled {
                round = 0;
                tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
                continue;
            }

            let mode = config.gateway.tunnel.mode.trim().to_ascii_lowercase();
            if mode == "managed" {
                run_managed_gateway_tunnel_daemon_round(
                    &tunnel_state,
                    logs.clone(),
                    config.clone(),
                    round,
                )
                .await;
            } else if mode == "external" && round % 6 == 0 {
                run_external_gateway_tunnel_diagnostic_round(&tunnel_state, logs.clone(), config)
                    .await;
            }

            round = round.saturating_add(1);
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        }
    });
}

async fn run_managed_gateway_tunnel_daemon_round(
    tunnel_state: &GatewayTunnelState,
    logs: LogState,
    config: Config,
    round: u64,
) {
    match status_tunnel_with_config(tunnel_state, Some(config.clone())).await {
        Ok(status) => {
            if status.running {
                if round == 0 {
                    logs.write().await.add(
                        "info",
                        &format!(
                            "[GatewayTunnel] managed 隧道运行中: pid={:?} local={} public={:?}",
                            status.pid, status.local_url, status.public_base_url
                        ),
                    );
                }
            } else if is_manual_stop_error(status.last_error.as_deref()) {
                if round % 6 == 0 {
                    logs.write().await.add(
                        "info",
                        "[GatewayTunnel] managed 隧道处于手动停止状态，守护器不自动拉起",
                    );
                }
            } else {
                logs.write().await.add(
                    "warn",
                    &format!(
                        "[GatewayTunnel] managed 隧道未运行，守护器尝试拉起: last_exit={:?} last_error={:?}",
                        status.last_exit, status.last_error
                    ),
                );
                if let Err(error) = start_tunnel(tunnel_state, logs.clone(), config).await {
                    logs.write()
                        .await
                        .add("warn", &format!("[GatewayTunnel] 守护拉起失败: {error}"));
                }
            }
        }
        Err(error) => {
            logs.write().await.add(
                "warn",
                &format!("[GatewayTunnel] 守护状态检查失败: {error}"),
            );
        }
    }
}

async fn run_external_gateway_tunnel_diagnostic_round(
    tunnel_state: &GatewayTunnelState,
    logs: LogState,
    config: Config,
) {
    match status_tunnel_with_config(tunnel_state, Some(config)).await {
        Ok(status) => {
            logs.write().await.add(
                "info",
                &format!(
                    "[GatewayTunnel] external 模式诊断: active={:?} detail={:?}",
                    status.connector_active, status.connector_message
                ),
            );
        }
        Err(error) => {
            logs.write().await.add(
                "warn",
                &format!("[GatewayTunnel] external 模式诊断失败: {error}"),
            );
        }
    }
}

fn probe_response_from_gateway(value: GatewayTunnelProbeResult) -> GatewayTunnelProbeResponse {
    GatewayTunnelProbeResponse {
        ok: value.ok,
        provider: value.provider,
        mode: value.mode,
        binary: value.binary,
        version: value.version,
        config_ready: value.config_ready,
        message: value.message,
    }
}

fn create_result_from_gateway(value: CloudflareTunnelCreateResult) -> GatewayTunnelCreateResult {
    GatewayTunnelCreateResult {
        ok: value.ok,
        tunnel_name: value.tunnel_name,
        tunnel_id: value.tunnel_id,
        credentials_file: value.credentials_file,
        dns_name: value.dns_name,
        public_base_url: value.public_base_url,
        message: value.message,
    }
}

fn status_response_from_gateway(value: GatewayTunnelStatus) -> GatewayTunnelStatusResponse {
    GatewayTunnelStatusResponse {
        running: value.running,
        provider: value.provider,
        mode: value.mode,
        binary: value.binary,
        local_url: value.local_url,
        public_base_url: value.public_base_url,
        pid: value.pid,
        started_at: value.started_at,
        last_error: value.last_error,
        last_exit: value.last_exit,
        command_preview: value.command_preview,
        connector_active: value.connector_active,
        connector_message: value.connector_message,
    }
}

fn resolve_public_base_url(config: &Config) -> Result<String, String> {
    config
        .gateway
        .tunnel
        .public_base_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.trim_end_matches('/').to_string())
        .or_else(|| {
            config
                .gateway
                .tunnel
                .cloudflare
                .dns_name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|host| format!("https://{}", host))
        })
        .ok_or_else(|| "缺少 gateway.tunnel.public_base_url 或 cloudflare.dns_name".to_string())
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
    config: &Config,
) -> Result<GatewayTunnelCloudflaredDetectResponse, String> {
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

    Ok(GatewayTunnelCloudflaredDetectResponse {
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
    config: &Config,
) -> Result<GatewayTunnelCloudflaredInstallResponse, String> {
    let platform = detect_platform();
    let Some(spec) = resolve_installer_spec(&platform).await else {
        return Ok(GatewayTunnelCloudflaredInstallResponse {
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

    Ok(GatewayTunnelCloudflaredInstallResponse {
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
