use super::McpClientManager;
use crate::streamable_http::{
    build_oauth_streamable_http_transport, build_streamable_http_transport,
};
use crate::types::{McpError, McpServerCapabilities, McpServerConfig, McpServerTransport};
use rmcp::transport::TokioChildProcess;
use rmcp::ServiceExt;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tracing::{debug, error, info, warn};

impl McpClientManager {
    // ========================================================================
    // 服务器生命周期管理方法
    // ========================================================================

    /// 启动 MCP 服务器
    ///
    /// # Arguments
    ///
    /// * `name` - 服务器名称
    /// * `config` - 服务器配置
    ///
    /// # Returns
    ///
    /// 成功返回 Ok(())，失败返回错误。
    ///
    /// # 实现步骤（Task 4.2）
    ///
    /// 1. 检查服务器是否已运行
    /// 2. 按配置启动 stdio 或 streamable HTTP transport
    /// 3. 建立 MCP 连接
    /// 4. 初始化 MCP 客户端
    /// 5. 失效工具缓存
    /// 6. 发送 mcp:server_started 事件
    pub async fn start_server(&self, name: &str, config: &McpServerConfig) -> Result<(), McpError> {
        config.validate().map_err(McpError::ConfigError)?;
        if !config.enabled {
            return Err(McpError::ConfigError(format!("MCP 服务器 '{name}' 已禁用")));
        }
        info!(server_name = %name, transport = %config.transport_kind(), "启动 MCP 服务器");

        // 1. 检查服务器是否已运行
        if self.is_server_running(name).await {
            return Err(McpError::ServerAlreadyRunning(name.to_string()));
        }

        match &config.transport {
            McpServerTransport::Stdio { .. } => self.start_stdio_server(name, config).await,
            McpServerTransport::StreamableHttp { .. } => {
                self.start_streamable_http_server(name, config).await
            }
        }
    }

    async fn start_stdio_server(
        &self,
        name: &str,
        config: &McpServerConfig,
    ) -> Result<(), McpError> {
        debug!(server_name = %name, command = %config.command(), "启动 stdio MCP transport");

        // 2. 构建命令
        let mut command = Command::new(config.command());
        command.args(config.args()).kill_on_drop(true);

        // 设置环境变量
        for (key, value) in config.env() {
            command.env(key, value);
        }

        // macOS GUI 应用的 PATH 通常不完整，需要补充常见的命令路径
        // 确保 npx/node/uvx 等命令可被找到
        if !config.env().contains_key("PATH") {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/unknown".to_string());
            let extra_paths = [
                format!("{home}/.nvm/versions/node/*/bin"),
                format!("{home}/.local/bin"),
                format!("{home}/.cargo/bin"),
                format!("{home}/Library/pnpm"),
                format!("{home}/.bun/bin"),
                "/usr/local/bin".to_string(),
                "/opt/homebrew/bin".to_string(),
                "/opt/homebrew/sbin".to_string(),
            ];
            // 用 glob 展开 nvm 路径，取最新版本
            let mut resolved_paths: Vec<String> = Vec::new();
            for p in &extra_paths {
                if p.contains('*') {
                    if let Ok(entries) = glob::glob(p) {
                        let mut matched: Vec<String> = entries
                            .filter_map(|e| e.ok())
                            .map(|e| e.to_string_lossy().to_string())
                            .collect();
                        matched.sort();
                        if let Some(last) = matched.last() {
                            resolved_paths.push(last.clone());
                        }
                    }
                } else if std::path::Path::new(p).exists() {
                    resolved_paths.push(p.clone());
                }
            }
            if !resolved_paths.is_empty() {
                let merged = if current_path.is_empty() {
                    resolved_paths.join(":")
                } else {
                    format!("{}:{}", resolved_paths.join(":"), current_path)
                };
                command.env("PATH", &merged);
                debug!(server_name = %name, "补充 PATH: {}", merged);
            }
        }

        // 设置工作目录（清洗 `\0` 和无效空白）
        if let Some(cwd) = config.sanitized_cwd() {
            command.current_dir(cwd);
        }

        // Unix 系统设置进程组（使子进程独立于父进程组）
        #[cfg(unix)]
        command.process_group(0);

        // 3. 启动子进程并建立 stdio 连接
        let spawn_result = TokioChildProcess::builder(command)
            .stderr(Stdio::piped())
            .spawn();

        let (transport, mut stderr_opt) = match spawn_result {
            Ok(result) => result,
            Err(e) => {
                let error_msg = format!("无法启动服务器进程: {e}");
                error!(server_name = %name, error = %e, "启动 MCP 服务器进程失败");
                self.emit_server_error(name, &error_msg);
                return Err(McpError::ProcessSpawnFailed(error_msg));
            }
        };

        // 启动 stderr 读取任务（用于错误诊断）
        let stderr_task = stderr_opt.take().map(|mut stderr| {
            tokio::spawn(async move {
                let mut all_stderr = Vec::new();
                let _ = stderr.read_to_end(&mut all_stderr).await;
                String::from_utf8_lossy(&all_stderr).into_owned()
            })
        });

        // 4. 初始化 MCP 客户端
        let client_service = self.client_service(name);

        // 连接超时：至少 60 秒，避免 npx 首次下载时超时
        let timeout_secs = std::cmp::max(config.startup_timeout_secs(), 60);
        let connect_result = tokio::time::timeout(
            Duration::from_secs(timeout_secs),
            client_service.serve(transport),
        )
        .await;

        let running_service = match connect_result {
            Ok(Ok(service)) => service,
            Ok(Err(e)) => {
                // 获取 stderr 内容用于诊断
                let stderr_content = if let Some(task) = stderr_task {
                    task.await.unwrap_or_default()
                } else {
                    String::new()
                };

                let error_msg = if stderr_content.is_empty() {
                    format!("MCP 连接失败: {e}")
                } else {
                    format!("MCP 连接失败: {e}. Stderr: {stderr_content}")
                };

                error!(
                    server_name = %name,
                    error = %e,
                    stderr = %stderr_content,
                    "MCP 客户端初始化失败"
                );
                self.emit_server_error(name, &error_msg);
                return Err(McpError::ConnectionFailed(error_msg));
            }
            Err(_) => {
                let error_msg = format!("MCP 连接超时（{timeout_secs}秒）");
                error!(server_name = %name, timeout = timeout_secs, "MCP 连接超时");
                self.emit_server_error(name, &error_msg);
                return Err(McpError::Timeout);
            }
        };

        // 获取服务器信息
        let server_info = running_service
            .peer_info()
            .map(Self::server_capabilities_from_peer_info);

        // 创建客户端包装器
        let mut wrapper = crate::client::McpClientWrapper::new(
            name.to_string(),
            config.clone(),
            self.emitter.clone(),
        );
        if let Some(ref info) = server_info {
            wrapper.set_server_info(info.clone());
        }
        wrapper.set_running_service(running_service);

        // 添加到连接池
        self.add_client(name.to_string(), wrapper).await?;

        // 5. 失效工具缓存
        self.invalidate_tool_cache().await;

        // 6. 发送 mcp:server_started 事件
        self.emit_server_started(name, server_info);

        info!(server_name = %name, "MCP 服务器启动成功");
        Ok(())
    }

    async fn start_streamable_http_server(
        &self,
        name: &str,
        config: &McpServerConfig,
    ) -> Result<(), McpError> {
        let McpServerTransport::StreamableHttp { url, .. } = &config.transport else {
            return Err(McpError::ConfigError(
                "streamable HTTP 启动收到非 HTTP 配置".to_string(),
            ));
        };

        if config.has_oauth_settings() {
            let auth_manager = self
                .oauth_registry
                .authorized_manager_for(name, config)
                .await?
                .ok_or_else(|| {
                    McpError::ConfigError(
                        "MCP OAuth credentials are missing; run mcpServer/oauth/login first"
                            .to_string(),
                    )
                })?;
            let transport = build_oauth_streamable_http_transport(config, auth_manager).await?;
            return self
                .start_streamable_http_transport(name, config, url, transport)
                .await;
        }

        let transport = build_streamable_http_transport(config)?;
        self.start_streamable_http_transport(name, config, url, transport)
            .await
    }

    async fn start_streamable_http_transport<T, E, A>(
        &self,
        name: &str,
        config: &McpServerConfig,
        url: &str,
        transport: T,
    ) -> Result<(), McpError>
    where
        T: rmcp::transport::IntoTransport<rmcp::RoleClient, E, A>,
        E: std::error::Error + Send + Sync + 'static,
    {
        let client_service = self.client_service(name);
        let timeout_secs = config.startup_timeout_secs();
        let connect_result = tokio::time::timeout(
            Duration::from_secs(timeout_secs),
            client_service.serve(transport),
        )
        .await;

        let running_service = match connect_result {
            Ok(Ok(service)) => service,
            Ok(Err(error)) => {
                let error_msg = format!("MCP streamable HTTP 连接失败: {error}");
                error!(server_name = %name, url = %url, error = %error, "MCP HTTP 客户端初始化失败");
                self.emit_server_error(name, &error_msg);
                return Err(McpError::ConnectionFailed(error_msg));
            }
            Err(_) => {
                let error_msg = format!("MCP streamable HTTP 连接超时（{timeout_secs}秒）");
                error!(server_name = %name, url = %url, timeout = timeout_secs, "MCP HTTP 连接超时");
                self.emit_server_error(name, &error_msg);
                return Err(McpError::Timeout);
            }
        };

        let server_info = running_service
            .peer_info()
            .map(Self::server_capabilities_from_peer_info);
        let mut wrapper = crate::client::McpClientWrapper::new(
            name.to_string(),
            config.clone(),
            self.emitter.clone(),
        );
        if let Some(ref info) = server_info {
            wrapper.set_server_info(info.clone());
        }
        wrapper.set_running_service(running_service);
        self.add_client(name.to_string(), wrapper).await?;
        self.invalidate_tool_cache().await;
        self.emit_server_started(name, server_info);

        info!(server_name = %name, url = %url, "MCP streamable HTTP 服务器启动成功");
        Ok(())
    }

    fn server_capabilities_from_peer_info(
        info: &rmcp::model::InitializeResult,
    ) -> McpServerCapabilities {
        McpServerCapabilities {
            name: info.server_info.name.clone(),
            version: info.server_info.version.clone(),
            supports_tools: info
                .capabilities
                .tools
                .as_ref()
                .map(|_| true)
                .unwrap_or(false),
            supports_prompts: info
                .capabilities
                .prompts
                .as_ref()
                .map(|_| true)
                .unwrap_or(false),
            supports_resources: info
                .capabilities
                .resources
                .as_ref()
                .map(|_| true)
                .unwrap_or(false),
        }
    }

    /// 停止 MCP 服务器
    ///
    /// # Arguments
    ///
    /// * `name` - 服务器名称
    ///
    /// # Returns
    ///
    /// 成功返回 Ok(())，失败返回错误。
    /// 如果服务器未运行，也返回 Ok()（幂等操作）。
    ///
    /// # 实现步骤（Task 4.2）
    ///
    /// 1. 检查服务器是否在运行
    /// 2. 终止子进程
    /// 3. 清理客户端连接
    /// 4. 失效工具缓存
    /// 5. 发送 mcp:server_stopped 事件
    pub async fn stop_server(&self, name: &str) -> Result<(), McpError> {
        info!(server_name = %name, "停止 MCP 服务器");

        // 1. 检查服务器是否在运行
        if !self.is_server_running(name).await {
            debug!(server_name = %name, "服务器未运行，跳过停止操作");
            return Ok(()); // 幂等操作
        }

        // 2. 从连接池移除客户端
        let mut wrapper = match self.remove_client(name).await {
            Some(w) => w,
            None => {
                debug!(server_name = %name, "客户端已被移除");
                return Ok(());
            }
        };

        // 3. 取消 rmcp 服务（如果存在）
        if let Some(ref service) = wrapper.running_service {
            let cancellation_token = service.cancellation_token();
            cancellation_token.cancel();
            debug!(server_name = %name, "已取消 MCP 服务");
        }

        // 4. 终止子进程
        if let Err(e) = wrapper.kill_process().await {
            warn!(
                server_name = %name,
                error = %e,
                "终止子进程时出错（可能已退出）"
            );
            // 不返回错误，因为进程可能已经退出
        }

        // 5. 失效工具缓存
        self.invalidate_tool_cache().await;

        // 6. 发送 mcp:server_stopped 事件
        self.emit_server_stopped(name);

        info!(server_name = %name, "MCP 服务器已停止");
        Ok(())
    }

    /// 检查服务器是否在运行
    ///
    /// # Arguments
    ///
    /// * `name` - 服务器名称
    ///
    /// # Returns
    ///
    /// 如果服务器正在运行返回 true，否则返回 false。
    pub async fn is_server_running(&self, name: &str) -> bool {
        let clients = self.clients.read().await;
        clients.contains_key(name)
    }

    /// 重启 MCP 服务器
    ///
    /// 先停止服务器，然后重新启动。
    ///
    /// # Arguments
    ///
    /// * `name` - 服务器名称
    /// * `config` - 服务器配置
    ///
    /// # Returns
    ///
    /// 成功返回 Ok(())，失败返回错误。
    pub async fn restart_server(
        &self,
        name: &str,
        config: &McpServerConfig,
    ) -> Result<(), McpError> {
        // 先停止（忽略未运行的错误）
        let _ = self.stop_server(name).await;
        // 再启动
        self.start_server(name, config).await
    }
}

impl McpClientManager {
    fn client_service(&self, name: &str) -> crate::client_service::LimeMcpClientService {
        match (&self.elicitation_router, &self.runtime_owner) {
            (Some(router), Some(owner)) => {
                crate::client_service::LimeMcpClientService::with_runtime_elicitation_router(
                    name.to_string(),
                    self.emitter.clone(),
                    router.clone(),
                    owner.session_id.clone(),
                    owner.thread_id.clone(),
                )
            }
            _ => crate::client_service::LimeMcpClientService::new(
                name.to_string(),
                self.emitter.clone(),
            ),
        }
    }
}
