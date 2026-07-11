use anyhow::Result;
use axum::http::{HeaderMap, HeaderName};
use chrono::{DateTime, Utc};
use futures::stream::{FuturesUnordered, StreamExt};
use futures::{future, FutureExt};
use rand::{distributions::Alphanumeric, Rng};
use rmcp::service::{ClientInitializeError, ServiceError};
use rmcp::transport::streamable_http_client::{
    AuthRequiredError, StreamableHttpClientTransportConfig, StreamableHttpError,
};
use rmcp::transport::{
    ConfigureCommandExt, DynamicTransportError, StreamableHttpClientTransport, TokioChildProcess,
};
use std::collections::{HashMap, HashSet};
use std::option::Option;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tempfile::TempDir;
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::Mutex;
use tokio::task;
use tokio_stream::wrappers::ReceiverStream;
use tokio_util::sync::CancellationToken;
use tracing::{error, warn};

use super::extension::{
    ExtensionConfig, ExtensionError, ExtensionInfo, ExtensionResult, PlatformExtensionContext,
    ToolInfo, PLATFORM_EXTENSIONS,
};
use super::tool_execution::ToolCallResult;
use super::types::SharedProvider;
use crate::agents::extension::{Envs, ProcessExit};
use crate::agents::extension_malware_check;
use crate::agents::mcp_client::{McpClient, McpClientTrait};
use crate::config::search_path::SearchPaths;
use crate::config::{get_all_extensions, Config};
use rmcp::model::{
    CallToolRequestParam, Content, ErrorCode, ErrorData, GetPromptResult, Prompt, Resource,
    ResourceContents, ServerInfo, Tool,
};
use schemars::_private::NoSerialize;
use serde_json::Value;
use tool_runtime::subprocess::configure_command_no_window;

type McpClientBox = Arc<Mutex<Box<dyn McpClientTrait>>>;

struct Extension {
    pub config: ExtensionConfig,

    client: McpClientBox,
    server_info: Option<ServerInfo>,
    _temp_dir: Option<tempfile::TempDir>,
}

impl Extension {
    fn new(
        config: ExtensionConfig,
        client: McpClientBox,
        server_info: Option<ServerInfo>,
        temp_dir: Option<tempfile::TempDir>,
    ) -> Self {
        Self {
            client,
            config,
            server_info,
            _temp_dir: temp_dir,
        }
    }

    fn supports_resources(&self) -> bool {
        self.server_info
            .as_ref()
            .and_then(|info| info.capabilities.resources.as_ref())
            .is_some()
    }

    fn get_instructions(&self) -> Option<String> {
        self.server_info
            .as_ref()
            .and_then(|info| info.instructions.clone())
    }

    fn get_client(&self) -> McpClientBox {
        self.client.clone()
    }
}

/// Manages aster extensions / MCP clients and their interactions
pub struct ExtensionManager {
    extensions: Mutex<HashMap<String, Extension>>,
    loaded_deferred_tools: Mutex<HashSet<String>>,
    pending_extensions: Mutex<HashSet<String>>,
    context: Mutex<PlatformExtensionContext>,
    provider: SharedProvider,
}

/// A flattened representation of a resource used by the agent to prepare inference
#[derive(Debug, Clone)]
pub struct ResourceItem {
    pub client_name: String,      // The name of the client that owns the resource
    pub uri: String,              // The URI of the resource
    pub name: String,             // The name of the resource
    pub content: String,          // The content of the resource
    pub timestamp: DateTime<Utc>, // The timestamp of the resource
    pub priority: f32,            // The priority of the resource
    pub token_count: Option<u32>, // The token count of the resource (filled in by the agent)
}

impl ResourceItem {
    pub fn new(
        client_name: String,
        uri: String,
        name: String,
        content: String,
        timestamp: DateTime<Utc>,
        priority: f32,
    ) -> Self {
        Self {
            client_name,
            uri,
            name,
            content,
            timestamp,
            priority,
            token_count: None,
        }
    }
}

/// Sanitizes a string by replacing invalid characters with underscores.
/// Valid characters match [a-zA-Z0-9_-]
fn normalize(input: String) -> String {
    let mut result = String::with_capacity(input.len());
    for c in input.chars() {
        result.push(match c {
            c if c.is_ascii_alphanumeric() || c == '_' || c == '-' => c,
            c if c.is_whitespace() => continue, // effectively "strip" whitespace
            _ => '_',                           // Replace any other non-ASCII character with '_'
        });
    }
    result.to_lowercase()
}

/// Generates extension name from server info; adds random suffix on collision.
fn generate_extension_name(
    server_info: Option<&ServerInfo>,
    name_exists: impl Fn(&str) -> bool,
) -> String {
    let base = server_info
        .and_then(|info| {
            let name = info.server_info.name.as_str();
            (!name.is_empty()).then(|| normalize(name.to_string()))
        })
        .unwrap_or_else(|| "unnamed".to_string());

    if !name_exists(&base) {
        return base;
    }

    let suffix: String = rand::thread_rng()
        .sample_iter(Alphanumeric)
        .take(6)
        .map(char::from)
        .collect();

    format!("{base}_{suffix}")
}

fn resolve_command(cmd: &str) -> PathBuf {
    SearchPaths::builder()
        .with_npm()
        .resolve(cmd)
        .unwrap_or_else(|_| {
            // let the OS raise the error
            PathBuf::from(cmd)
        })
}

fn require_str_parameter<'a>(v: &'a serde_json::Value, name: &str) -> Result<&'a str, ErrorData> {
    let v = v.get(name).ok_or_else(|| {
        ErrorData::new(
            ErrorCode::INVALID_PARAMS,
            format!("The parameter {name} is required"),
            None,
        )
    })?;
    match v.as_str() {
        Some(r) => Ok(r),
        None => Err(ErrorData::new(
            ErrorCode::INVALID_PARAMS,
            format!("The parameter {name} must be a string"),
            None,
        )),
    }
}

pub fn get_parameter_names(tool: &Tool) -> Vec<String> {
    let mut names: Vec<String> = tool
        .input_schema
        .get("properties")
        .and_then(|props| props.as_object())
        .map(|props| props.keys().cloned().collect())
        .unwrap_or_default();
    names.sort();
    names
}

impl Default for ExtensionManager {
    fn default() -> Self {
        Self::new(Arc::new(Mutex::new(None)))
    }
}

async fn child_process_client(
    mut command: Command,
    timeout: &Option<u64>,
    provider: SharedProvider,
) -> ExtensionResult<McpClient> {
    #[cfg(unix)]
    command.process_group(0);
    configure_command_no_window(&mut command);

    if let Ok(path) = SearchPaths::builder().path() {
        command.env("PATH", path);
    }

    let (transport, mut stderr) = TokioChildProcess::builder(command)
        .stderr(Stdio::piped())
        .spawn()?;
    let mut stderr = stderr.take().ok_or_else(|| {
        ExtensionError::SetupError("failed to attach child process stderr".to_owned())
    })?;

    let stderr_task = tokio::spawn(async move {
        let mut all_stderr = Vec::new();
        stderr.read_to_end(&mut all_stderr).await?;
        Ok::<String, std::io::Error>(String::from_utf8_lossy(&all_stderr).into())
    });

    let client_result = McpClient::connect(
        transport,
        Duration::from_secs(timeout.unwrap_or(crate::config::DEFAULT_EXTENSION_TIMEOUT)),
        provider,
    )
    .await;

    match client_result {
        Ok(client) => Ok(client),
        Err(error) => {
            let error_task_out = stderr_task.await?;
            Err::<McpClient, ExtensionError>(match error_task_out {
                Ok(stderr_content) => ProcessExit::new(stderr_content, error).into(),
                Err(e) => e.into(),
            })
        }
    }
}

fn extract_auth_error(
    res: &Result<McpClient, ClientInitializeError>,
) -> Option<&AuthRequiredError> {
    match res {
        Ok(_) => None,
        Err(err) => match err {
            ClientInitializeError::TransportError {
                error: DynamicTransportError { error, .. },
                ..
            } => error
                .downcast_ref::<StreamableHttpError<reqwest::Error>>()
                .and_then(|auth_error| match auth_error {
                    StreamableHttpError::AuthRequired(auth_required_error) => {
                        Some(auth_required_error)
                    }
                    _ => None,
                }),
            _ => None,
        },
    }
}

/// Merge environment variables from direct envs and keychain-stored env_keys
async fn merge_environments(
    envs: &Envs,
    env_keys: &[String],
    ext_name: &str,
) -> Result<HashMap<String, String>, ExtensionError> {
    let mut all_envs = envs.get_env();
    let config_instance = Config::global();

    for key in env_keys {
        if all_envs.contains_key(key) {
            continue;
        }

        match config_instance.get_secret::<Value>(key) {
            Ok(value) => {
                if value.is_null() {
                    warn!(
                        key = %key,
                        ext_name = %ext_name,
                        "Secret key not found in config (returned null)."
                    );
                    continue;
                }

                if let Some(str_val) = value.as_str() {
                    all_envs.insert(key.clone(), str_val.to_string());
                } else {
                    warn!(
                        key = %key,
                        ext_name = %ext_name,
                        value_type = %value.get("type").and_then(|t| t.as_str()).unwrap_or("unknown"),
                        "Secret value is not a string; skipping."
                    );
                }
            }
            Err(e) => {
                error!(
                    key = %key,
                    ext_name = %ext_name,
                    error = %e,
                    "Failed to fetch secret from config."
                );
                return Err(ExtensionError::ConfigError(format!(
                    "Failed to fetch secret '{}' from config: {}",
                    key, e
                )));
            }
        }
    }

    Ok(all_envs)
}

/// Substitute environment variables in a string. Supports both ${VAR} and $VAR syntax.
fn substitute_env_vars(value: &str, env_map: &HashMap<String, String>) -> String {
    let mut result = value.to_string();

    let re_braces =
        regex::Regex::new(r"\$\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}").expect("valid regex");
    for cap in re_braces.captures_iter(value) {
        if let Some(var_name) = cap.get(1) {
            if let Some(env_value) = env_map.get(var_name.as_str()) {
                result = result.replace(&cap[0], env_value);
            }
        }
    }

    let re_simple = regex::Regex::new(r"\$([A-Za-z_][A-Za-z0-9_]*)").expect("valid regex");
    for cap in re_simple.captures_iter(&result.clone()) {
        if let Some(var_name) = cap.get(1) {
            if !value.contains(&format!("${{{}}}", var_name.as_str())) {
                if let Some(env_value) = env_map.get(var_name.as_str()) {
                    result = result.replace(&cap[0], env_value);
                }
            }
        }
    }

    result
}

async fn create_streamable_http_client(
    uri: &str,
    timeout: Option<u64>,
    headers: &HashMap<String, String>,
    _name: &str,
    all_envs: &HashMap<String, String>,
    provider: SharedProvider,
) -> ExtensionResult<Box<dyn McpClientTrait>> {
    let mut default_headers = HeaderMap::new();
    for (key, value) in headers {
        let substituted_value = substitute_env_vars(value, all_envs);
        default_headers.insert(
            HeaderName::try_from(key)
                .map_err(|_| ExtensionError::ConfigError(format!("invalid header: {}", key)))?,
            substituted_value.parse().map_err(|_| {
                ExtensionError::ConfigError(format!("invalid header value: {}", key))
            })?,
        );
    }

    let http_client = reqwest::Client::builder()
        .default_headers(default_headers)
        .build()
        .map_err(|_| ExtensionError::ConfigError("could not construct http client".to_string()))?;

    let transport = StreamableHttpClientTransport::with_client(
        http_client,
        StreamableHttpClientTransportConfig {
            uri: uri.into(),
            ..Default::default()
        },
    );

    let timeout_duration =
        Duration::from_secs(timeout.unwrap_or(crate::config::DEFAULT_EXTENSION_TIMEOUT));

    let client_res = McpClient::connect(transport, timeout_duration, provider.clone()).await;

    if extract_auth_error(&client_res).is_some() {
        Err(ExtensionError::SetupError(
            "OAuth flow has been retired from agent-compat".to_string(),
        ))
    } else {
        Ok(Box::new(client_res?))
    }
}

async fn create_stdio_client(
    cmd: &str,
    args: &[String],
    all_envs: HashMap<String, String>,
    timeout: &Option<u64>,
    provider: SharedProvider,
) -> ExtensionResult<Box<dyn McpClientTrait>> {
    extension_malware_check::deny_if_malicious_cmd_args(cmd, args).await?;

    let resolved_cmd = resolve_command(cmd);
    let command = Command::new(resolved_cmd).configure(|command| {
        command.args(args).envs(all_envs);
    });

    Ok(Box::new(
        child_process_client(command, timeout, provider).await?,
    ))
}

impl ExtensionManager {
    pub fn new(provider: SharedProvider) -> Self {
        Self {
            extensions: Mutex::new(HashMap::new()),
            loaded_deferred_tools: Mutex::new(HashSet::new()),
            pending_extensions: Mutex::new(HashSet::new()),
            context: Mutex::new(PlatformExtensionContext {
                session_id: None,
                session_store: None,
                extension_manager: None,
            }),
            provider,
        }
    }

    /// Create a new ExtensionManager with no provider (useful for tests)
    pub fn new_without_provider() -> Self {
        Self::new(Arc::new(Mutex::new(None)))
    }

    pub async fn set_context(&self, context: PlatformExtensionContext) {
        *self.context.lock().await = context;
    }

    pub async fn get_context(&self) -> PlatformExtensionContext {
        self.context.lock().await.clone()
    }

    pub async fn supports_resources(&self) -> bool {
        self.extensions
            .lock()
            .await
            .values()
            .any(|ext| ext.supports_resources())
    }

    pub async fn add_extension(&self, config: ExtensionConfig) -> ExtensionResult<()> {
        let config_name = config.key().to_string();
        let sanitized_name = normalize(config_name.clone());
        let pending_name = pending_extension_display_name(&config);

        if self.extensions.lock().await.contains_key(&sanitized_name) {
            return Ok(());
        }

        {
            let mut pending_extensions = self.pending_extensions.lock().await;
            if pending_extensions.contains(&pending_name) {
                return Ok(());
            }
            pending_extensions.insert(pending_name.clone());
        }

        let result = async {
            let temp_dir = None;

            let client: Box<dyn McpClientTrait> = match &config {
                ExtensionConfig::StreamableHttp {
                    uri,
                    timeout,
                    headers,
                    name,
                    envs,
                    env_keys,
                    ..
                } => {
                    let all_envs = merge_environments(envs, env_keys, &sanitized_name).await?;
                    create_streamable_http_client(
                        uri,
                        *timeout,
                        headers,
                        name,
                        &all_envs,
                        self.provider.clone(),
                    )
                    .await?
                }
                ExtensionConfig::Stdio {
                    cmd,
                    args,
                    envs,
                    env_keys,
                    timeout,
                    ..
                } => {
                    let all_envs = merge_environments(envs, env_keys, &sanitized_name).await?;
                    create_stdio_client(cmd, args, all_envs, timeout, self.provider.clone())
                        .await?
                }
                ExtensionConfig::Builtin { name, timeout, .. } => {
                    let cmd = std::env::current_exe()
                        .and_then(|path| {
                            path.to_str().map(|s| s.to_string()).ok_or_else(|| {
                                std::io::Error::new(
                                    std::io::ErrorKind::InvalidData,
                                    "Invalid UTF-8 in executable path",
                                )
                            })
                        })
                        .map_err(|e| {
                            ExtensionError::ConfigError(format!(
                                "Failed to resolve executable path: {}",
                                e
                            ))
                        })?;
                    let command = Command::new(cmd).configure(|command| {
                        command.arg("mcp").arg(name);
                    });
                    Box::new(child_process_client(command, timeout, self.provider.clone()).await?)
                }
                ExtensionConfig::Platform { name, .. } => {
                    let normalized_key = normalize(name.clone());
                    let def = PLATFORM_EXTENSIONS
                        .get(normalized_key.as_str())
                        .ok_or_else(|| {
                            ExtensionError::ConfigError(format!(
                                "Unknown platform extension: {}",
                                name
                            ))
                        })?;
                    let context = self.get_context().await;
                    (def.client_factory)(context)
                }
                ExtensionConfig::Frontend { .. } => {
                    return Err(ExtensionError::ConfigError(
                        "Invalid extension type: Frontend extensions cannot be added as server extensions".to_string()
                    ));
                }
            };

            let server_info = client.get_info().cloned();

            // Only generate name from server info when config has no name (e.g., CLI --with-*-extension args)
            let mut extensions = self.extensions.lock().await;
            let final_name = if sanitized_name.is_empty() {
                generate_extension_name(server_info.as_ref(), |n| extensions.contains_key(n))
            } else {
                sanitized_name
            };
            extensions.insert(
                final_name,
                Extension::new(config, Arc::new(Mutex::new(client)), server_info, temp_dir),
            );

            Ok(())
        }
        .await;

        self.pending_extensions.lock().await.remove(&pending_name);
        result
    }

    pub async fn add_client(
        &self,
        name: String,
        config: ExtensionConfig,
        client: McpClientBox,
        info: Option<ServerInfo>,
        temp_dir: Option<TempDir>,
    ) {
        self.extensions
            .lock()
            .await
            .insert(name, Extension::new(config, client, info, temp_dir));
    }

    /// Get extensions info for building the system prompt
    pub async fn get_extensions_info(&self) -> Vec<ExtensionInfo> {
        self.extensions
            .lock()
            .await
            .iter()
            .map(|(name, ext)| {
                ExtensionInfo::new(
                    name,
                    ext.get_instructions().unwrap_or_default().as_str(),
                    ext.supports_resources(),
                )
            })
            .collect()
    }

    /// Get aggregated usage statistics
    pub async fn remove_extension(&self, name: &str) -> ExtensionResult<()> {
        let mut extensions = self.extensions.lock().await;
        if extensions.remove(name).is_some() {
            return Ok(());
        }
        let sanitized_name = normalize(name.to_string());
        if sanitized_name != name {
            extensions.remove(&sanitized_name);
        }
        Ok(())
    }

    pub async fn get_extension_and_tool_counts(&self) -> (usize, usize) {
        let enabled_extensions_count = self.extensions.lock().await.len();

        let total_tools = self
            .get_prefixed_tools(None)
            .await
            .map(|tools| tools.len())
            .unwrap_or(0);

        (enabled_extensions_count, total_tools)
    }

    pub async fn list_extensions(&self) -> ExtensionResult<Vec<String>> {
        Ok(self.extensions.lock().await.keys().cloned().collect())
    }

    pub async fn list_pending_extensions(&self) -> Vec<String> {
        let mut pending = self
            .pending_extensions
            .lock()
            .await
            .iter()
            .cloned()
            .collect::<Vec<_>>();
        pending.sort();
        pending
    }

    pub async fn is_extension_enabled(&self, name: &str) -> bool {
        self.extensions.lock().await.contains_key(name)
    }

    pub async fn get_extension_configs(&self) -> Vec<ExtensionConfig> {
        self.extensions
            .lock()
            .await
            .values()
            .map(|ext| ext.config.clone())
            .collect()
    }

    /// Get all tools from all clients with proper prefixing
    pub async fn get_prefixed_tools(
        &self,
        extension_name: Option<String>,
    ) -> ExtensionResult<Vec<Tool>> {
        self.get_prefixed_tools_impl(extension_name, None, false)
            .await
    }

    pub async fn get_prefixed_tools_for_search(
        &self,
        extension_name: Option<String>,
    ) -> ExtensionResult<Vec<Tool>> {
        self.get_prefixed_tools_impl(extension_name, None, true)
            .await
    }

    async fn get_prefixed_tools_impl(
        &self,
        extension_name: Option<String>,
        exclude: Option<&str>,
        include_deferred_hidden: bool,
    ) -> ExtensionResult<Vec<Tool>> {
        let loaded_deferred_tools = self.loaded_deferred_tools.lock().await.clone();

        // Filter clients based on the provided extension_name or include all if None
        let filtered_clients: Vec<_> = self
            .extensions
            .lock()
            .await
            .iter()
            .filter(|(name, _ext)| {
                if let Some(excluded) = exclude {
                    if name.as_str() == excluded {
                        return false;
                    }
                }

                if let Some(ref name_filter) = extension_name {
                    *name == name_filter
                } else {
                    true
                }
            })
            .map(|(name, ext)| (name.clone(), ext.config.clone(), ext.get_client()))
            .collect();

        let cancel_token = CancellationToken::default();
        let client_futures = filtered_clients.into_iter().map(|(name, config, client)| {
            let cancel_token = cancel_token.clone();
            let loaded_deferred_tools = loaded_deferred_tools.clone();
            task::spawn(async move {
                let mut tools = Vec::new();
                let client_guard = client.lock().await;
                let mut client_tools = client_guard.list_tools(None, cancel_token).await?;

                loop {
                    for tool in client_tools.tools {
                        let is_available = config.is_tool_available(&tool.name);
                        let prefixed_name = format!("{}__{}", name, tool.name);
                        let is_visible = include_deferred_hidden
                            || config.is_tool_exposed_by_default(&tool.name)
                            || loaded_deferred_tools.contains(&prefixed_name);

                        if is_available && is_visible {
                            tools.push(Tool {
                                name: prefixed_name.into(),
                                description: tool.description,
                                input_schema: tool.input_schema,
                                annotations: tool.annotations,
                                output_schema: tool.output_schema,
                                icons: tool.icons,
                                title: tool.title,
                                meta: tool.meta,
                            });
                        }
                    }

                    if client_tools.next_cursor.is_none() {
                        break;
                    }

                    client_tools = client_guard
                        .list_tools(client_tools.next_cursor, CancellationToken::default())
                        .await?;
                }

                Ok::<Vec<Tool>, ExtensionError>(tools)
            })
        });

        // Collect all results concurrently
        let results = future::join_all(client_futures).await;

        // Aggregate tools and handle errors
        let mut tools = Vec::new();
        for result in results {
            match result {
                Ok(Ok(client_tools)) => tools.extend(client_tools),
                Ok(Err(err)) => return Err(err),
                Err(join_err) => return Err(ExtensionError::from(join_err)),
            }
        }

        Ok(tools)
    }

    pub async fn get_prefixed_tools_excluding(&self, exclude: &str) -> ExtensionResult<Vec<Tool>> {
        self.get_prefixed_tools_impl(None, Some(exclude), false)
            .await
    }

    pub async fn search_tools(&self, query: &str, limit: usize) -> Result<Vec<Content>, ErrorData> {
        let terms: Vec<String> = query
            .split_whitespace()
            .filter(|term| !term.is_empty())
            .map(|term| term.to_lowercase())
            .collect();

        let mut tools = self
            .get_prefixed_tools_for_search(None)
            .await
            .map_err(|e| ErrorData::new(ErrorCode::INTERNAL_ERROR, e.to_string(), None))?;

        // Stable ordering for deterministic output before scoring.
        tools.sort_by(|a, b| a.name.cmp(&b.name));

        let loaded_deferred_tools = self.loaded_deferred_tools.lock().await.clone();
        let extensions = self.extensions.lock().await;

        let mut scored = Vec::new();
        for tool in tools {
            let name = tool.name.to_string();
            let lower_name = name.to_lowercase();
            let description = tool.description.as_deref().unwrap_or("").to_string();
            let lower_desc = description.to_lowercase();

            let score = if terms.is_empty() {
                1
            } else {
                terms.iter().fold(0_i32, |acc, term| {
                    let mut next = acc;
                    if lower_name.contains(term) {
                        next += 3;
                    }
                    if lower_desc.contains(term) {
                        next += 1;
                    }
                    next
                })
            };

            if score == 0 {
                continue;
            }

            let status = if let Some((_, ext, tool_name)) = extensions
                .iter()
                .filter_map(|(ext_name, ext)| {
                    name.strip_prefix(ext_name.as_str())
                        .and_then(|rest| rest.strip_prefix("__"))
                        .map(|tool_name| (ext_name, ext, tool_name))
                })
                .max_by_key(|(ext_name, _, _)| ext_name.len())
            {
                if ext.config.deferred_loading()
                    && !ext.config.is_tool_exposed_by_default(tool_name)
                    && !loaded_deferred_tools.contains(&name)
                {
                    "deferred"
                } else if ext.config.deferred_loading() {
                    "loaded"
                } else {
                    "visible"
                }
            } else {
                "visible"
            };

            scored.push((score, name, status.to_string(), description));
        }

        scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        scored.truncate(limit.max(1));

        if scored.is_empty() {
            return Ok(vec![Content::text(format!(
                "未找到匹配工具。query='{}'",
                query
            ))]);
        }

        let mut output = format!("找到 {} 个匹配工具（query='{}'）：\n", scored.len(), query);
        for (_, name, status, description) in scored {
            output.push_str(&format!("- {} [{}] {}\n", name, status, description));
        }

        Ok(vec![Content::text(output)])
    }

    pub async fn load_deferred_tools(
        &self,
        prefixed_tool_names: &[String],
    ) -> Result<Vec<Content>, ErrorData> {
        if prefixed_tool_names.is_empty() {
            return Err(ErrorData::new(
                ErrorCode::INVALID_PARAMS,
                "tool_names 不能为空".to_string(),
                None,
            ));
        }

        let all_tools = self
            .get_prefixed_tools_for_search(None)
            .await
            .map_err(|e| ErrorData::new(ErrorCode::INTERNAL_ERROR, e.to_string(), None))?;
        let all_tool_names: HashSet<String> =
            all_tools.into_iter().map(|t| t.name.to_string()).collect();

        let extensions = self.extensions.lock().await;
        let mut loaded = self.loaded_deferred_tools.lock().await;
        let mut activated = Vec::new();
        let mut skipped = Vec::new();
        let mut missing = Vec::new();

        for prefixed_tool in prefixed_tool_names {
            if !all_tool_names.contains(prefixed_tool) {
                missing.push(prefixed_tool.clone());
                continue;
            }

            let matched = extensions
                .iter()
                .filter_map(|(ext_name, ext)| {
                    prefixed_tool
                        .strip_prefix(ext_name.as_str())
                        .and_then(|rest| rest.strip_prefix("__"))
                        .map(|tool_name| (ext_name, ext, tool_name))
                })
                .max_by_key(|(ext_name, _, _)| ext_name.len());

            let Some((_, ext, tool_name)) = matched else {
                missing.push(prefixed_tool.clone());
                continue;
            };

            if !ext.config.deferred_loading() || ext.config.is_tool_exposed_by_default(tool_name) {
                skipped.push(prefixed_tool.clone());
                continue;
            }

            if loaded.insert(prefixed_tool.clone()) {
                activated.push(prefixed_tool.clone());
            } else {
                skipped.push(prefixed_tool.clone());
            }
        }

        let mut output = String::new();
        if !activated.is_empty() {
            output.push_str("已加载工具：\n");
            for tool in &activated {
                output.push_str(&format!("- {}\n", tool));
            }
        }
        if !skipped.is_empty() {
            output.push_str("已跳过（可能已可见或已加载）：\n");
            for tool in &skipped {
                output.push_str(&format!("- {}\n", tool));
            }
        }
        if !missing.is_empty() {
            output.push_str("未找到：\n");
            for tool in &missing {
                output.push_str(&format!("- {}\n", tool));
            }
        }

        Ok(vec![Content::text(output)])
    }

    /// Get the extension prompt including client instructions
    pub async fn get_planning_prompt(&self, tools_info: Vec<ToolInfo>) -> String {
        if tools_info.is_empty() {
            return String::new();
        }

        let mut prompt = String::from("Available extension tools:\n");
        for tool in tools_info {
            prompt.push_str(&format!("- {}: {}", tool.name, tool.description));
            if !tool.parameters.is_empty() {
                prompt.push_str(&format!(" Parameters: {}.", tool.parameters.join(", ")));
            }
            if let Some(permission) = tool.permission {
                prompt.push_str(&format!(" Permission: {:?}.", permission));
            }
            prompt.push('\n');
        }
        prompt
    }

    /// Find and return extension, extracted tool name and client for a prefixed tool call.
    async fn get_client_for_tool(
        &self,
        prefixed_name: &str,
    ) -> Option<(String, String, ExtensionConfig, McpClientBox)> {
        self.extensions
            .lock()
            .await
            .iter()
            .filter_map(|(name, extension)| {
                prefixed_name
                    .strip_prefix(name.as_str())
                    .and_then(|rest| rest.strip_prefix("__"))
                    .map(|tool_name| {
                        (
                            name.clone(),
                            tool_name.to_string(),
                            extension.config.clone(),
                            extension.get_client(),
                        )
                    })
            })
            .max_by_key(|(name, _, _, _)| name.len())
    }

    // Function that gets executed for read_resource tool
    pub async fn read_resource_tool(
        &self,
        params: Value,
        cancellation_token: CancellationToken,
    ) -> Result<Vec<Content>, ErrorData> {
        let uri = require_str_parameter(&params, "uri")?;

        let extension_name = params.get("extension_name").and_then(|v| v.as_str());

        // If extension name is provided, we can just look it up
        if let Some(ext_name) = extension_name {
            let read_result = self
                .read_resource(uri, ext_name, cancellation_token.clone())
                .await?;

            let mut result = Vec::new();
            for content in read_result.contents {
                if let ResourceContents::TextResourceContents { text, .. } = content {
                    let content_str = format!("{}\n\n{}", uri, text);
                    result.push(Content::text(content_str));
                }
            }
            return Ok(result);
        }

        // If extension name is not provided, we need to search for the resource across all extensions
        // Loop through each extension and try to read the resource, don't raise an error if the resource is not found
        // TODO: do we want to find if a provided uri is in multiple extensions?
        // currently it will return the first match and skip any others

        // Collect extension names first to avoid holding the lock during iteration
        let extension_names: Vec<String> = self.extensions.lock().await.keys().cloned().collect();

        for extension_name in extension_names {
            let read_result = self
                .read_resource(uri, &extension_name, cancellation_token.clone())
                .await;
            match read_result {
                Ok(read_result) => {
                    let mut result = Vec::new();
                    for content in read_result.contents {
                        if let ResourceContents::TextResourceContents { text, .. } = content {
                            let content_str = format!("{}\n\n{}", uri, text);
                            result.push(Content::text(content_str));
                        }
                    }
                    return Ok(result);
                }
                Err(_) => continue,
            }
        }

        // None of the extensions had the resource so we raise an error
        let available_extensions = self
            .extensions
            .lock()
            .await
            .keys()
            .map(|s| s.as_str())
            .collect::<Vec<&str>>()
            .join(", ");
        let error_msg = format!(
            "Resource with uri '{}' not found. Here are the available extensions: {}",
            uri, available_extensions
        );

        Err(ErrorData::new(
            ErrorCode::RESOURCE_NOT_FOUND,
            error_msg,
            None,
        ))
    }

    pub async fn read_resource(
        &self,
        uri: &str,
        extension_name: &str,
        cancellation_token: CancellationToken,
    ) -> Result<rmcp::model::ReadResourceResult, ErrorData> {
        let available_extensions = self
            .extensions
            .lock()
            .await
            .keys()
            .map(|s| s.as_str())
            .collect::<Vec<&str>>()
            .join(", ");
        let error_msg = format!(
            "Extension '{}' not found. Here are the available extensions: {}",
            extension_name, available_extensions
        );

        let client = self
            .get_server_client(extension_name)
            .await
            .ok_or(ErrorData::new(ErrorCode::INVALID_PARAMS, error_msg, None))?;

        let client_guard = client.lock().await;
        client_guard
            .read_resource(uri, cancellation_token)
            .await
            .map_err(|_| {
                ErrorData::new(
                    ErrorCode::INTERNAL_ERROR,
                    format!("Could not read resource with uri: {}", uri),
                    None,
                )
            })
    }

    pub async fn get_ui_resources(&self) -> Result<Vec<(String, Resource)>, ErrorData> {
        let mut ui_resources = Vec::new();

        let extensions_to_check: Vec<(String, McpClientBox)> = {
            let extensions = self.extensions.lock().await;
            extensions
                .iter()
                .map(|(name, ext)| (name.clone(), ext.get_client()))
                .collect()
        };

        for (extension_name, client) in extensions_to_check {
            let client_guard = client.lock().await;

            match client_guard
                .list_resources(None, CancellationToken::default())
                .await
            {
                Ok(list_response) => {
                    for resource in list_response.resources {
                        if resource.uri.starts_with("ui://") {
                            ui_resources.push((extension_name.clone(), resource));
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to list resources for {}: {:?}", extension_name, e);
                }
            }
        }

        Ok(ui_resources)
    }

    async fn list_resources_from_extension(
        &self,
        extension_name: &str,
        cancellation_token: CancellationToken,
    ) -> Result<Vec<Content>, ErrorData> {
        let resources = self
            .list_resources_from_extension_structured(extension_name, cancellation_token)
            .await?;
        let resource_list = resources
            .into_iter()
            .map(|(server, resource)| {
                format!("{} - {}, uri: ({})", server, resource.name, resource.uri)
            })
            .collect::<Vec<String>>()
            .join("\n");

        Ok(vec![Content::text(resource_list)])
    }

    async fn list_resources_from_extension_structured(
        &self,
        extension_name: &str,
        cancellation_token: CancellationToken,
    ) -> Result<Vec<(String, Resource)>, ErrorData> {
        let client = self
            .get_server_client(extension_name)
            .await
            .ok_or_else(|| {
                ErrorData::new(
                    ErrorCode::INVALID_PARAMS,
                    format!("Extension {} is not valid", extension_name),
                    None,
                )
            })?;

        let client_guard = client.lock().await;
        client_guard
            .list_resources(None, cancellation_token)
            .await
            .map_err(|e| {
                ErrorData::new(
                    ErrorCode::INTERNAL_ERROR,
                    format!("Unable to list resources for {}, {:?}", extension_name, e),
                    None,
                )
            })
            .map(|lr| {
                lr.resources
                    .into_iter()
                    .map(|resource| (extension_name.to_string(), resource))
                    .collect::<Vec<_>>()
            })
    }

    pub async fn list_resources_structured(
        &self,
        extension_name: Option<&str>,
        cancellation_token: CancellationToken,
    ) -> Result<Vec<(String, Resource)>, ErrorData> {
        match extension_name {
            Some(extension_name) => {
                self.list_resources_from_extension_structured(extension_name, cancellation_token)
                    .await
            }
            None => {
                let mut futures = FuturesUnordered::new();

                self.extensions
                    .lock()
                    .await
                    .iter()
                    .filter(|(_name, ext)| ext.supports_resources())
                    .map(|(name, _ext)| name.clone())
                    .for_each(|name| {
                        let token = cancellation_token.clone();
                        futures.push(async move {
                            self.list_resources_from_extension_structured(&name.clone(), token)
                                .await
                        });
                    });

                let mut all_resources = Vec::new();
                let mut errors = Vec::new();

                while let Some(result) = futures.next().await {
                    match result {
                        Ok(resources) => all_resources.extend(resources),
                        Err(tool_error) => errors.push(tool_error),
                    }
                }

                if !errors.is_empty() {
                    tracing::error!(
                        errors = ?errors
                            .into_iter()
                            .map(|e| format!("{:?}", e))
                            .collect::<Vec<_>>(),
                        "errors from listing resources"
                    );
                }

                Ok(all_resources)
            }
        }
    }

    pub async fn list_resources(
        &self,
        params: Value,
        cancellation_token: CancellationToken,
    ) -> Result<Vec<Content>, ErrorData> {
        let extension = params.get("extension").and_then(|v| v.as_str());
        let resources = self
            .list_resources_structured(extension, cancellation_token)
            .await?;

        if extension.is_some() {
            let resource_list = resources
                .into_iter()
                .map(|(server, resource)| {
                    format!("{} - {}, uri: ({})", server, resource.name, resource.uri)
                })
                .collect::<Vec<String>>()
                .join("\n");
            return Ok(vec![Content::text(resource_list)]);
        }

        let mut grouped_resources: HashMap<String, Vec<String>> = HashMap::new();
        for (server, resource) in resources {
            grouped_resources
                .entry(server.clone())
                .or_default()
                .push(format!(
                    "{} - {}, uri: ({})",
                    server, resource.name, resource.uri
                ));
        }

        Ok(grouped_resources
            .into_values()
            .map(|resource_lines| Content::text(resource_lines.join("\n")))
            .collect())
    }

    pub async fn dispatch_tool_call(
        &self,
        tool_call: CallToolRequestParam,
        cancellation_token: CancellationToken,
    ) -> Result<ToolCallResult> {
        self.dispatch_tool_call_from_caller(tool_call, cancellation_token, None)
            .await
    }

    pub async fn dispatch_tool_call_from_caller(
        &self,
        tool_call: CallToolRequestParam,
        cancellation_token: CancellationToken,
        caller: Option<&str>,
    ) -> Result<ToolCallResult> {
        // Dispatch tool call based on the prefix naming convention
        let (client_name, tool_name, config, client) = self
            .get_client_for_tool(&tool_call.name)
            .await
            .ok_or_else(|| {
                ErrorData::new(ErrorCode::RESOURCE_NOT_FOUND, tool_call.name.clone(), None)
            })?;

        if !config.is_tool_available(&tool_name) {
            return Err(ErrorData::new(
                ErrorCode::RESOURCE_NOT_FOUND,
                format!(
                    "Tool '{}' is not available for extension '{}'",
                    tool_name, client_name
                ),
                None,
            )
            .into());
        }

        if config.deferred_loading()
            && !config.is_tool_exposed_by_default(&tool_name)
            && !self
                .loaded_deferred_tools
                .lock()
                .await
                .contains(tool_call.name.as_ref())
        {
            return Err(ErrorData::new(
                ErrorCode::RESOURCE_NOT_FOUND,
                format!(
                    "Tool '{}' is deferred. Use ToolSearch with select:{} first.",
                    tool_call.name, tool_call.name
                ),
                None,
            )
            .into());
        }

        if let Some(caller_name) = caller {
            if !config.is_caller_allowed(caller_name) {
                return Err(ErrorData::new(
                    ErrorCode::INVALID_REQUEST,
                    format!(
                        "Tool '{}' only allows caller '{}'",
                        tool_call.name,
                        config.allowed_caller().unwrap_or_default()
                    ),
                    None,
                )
                .into());
            }
        }

        let arguments = tool_call.arguments.clone();
        let client = client.clone();
        let notifications_receiver = client.lock().await.subscribe().await;

        let fut = async move {
            let client_guard = client.lock().await;
            client_guard
                .call_tool(&tool_name, arguments, cancellation_token)
                .await
                .map_err(|e| match e {
                    ServiceError::McpError(error_data) => error_data,
                    _ => {
                        ErrorData::new(ErrorCode::INTERNAL_ERROR, e.to_string(), e.maybe_to_value())
                    }
                })
        };

        Ok(ToolCallResult {
            result: Box::new(fut.boxed()),
            notification_stream: Some(Box::new(ReceiverStream::new(notifications_receiver))),
        })
    }

    pub async fn list_prompts_from_extension(
        &self,
        extension_name: &str,
        cancellation_token: CancellationToken,
    ) -> Result<Vec<Prompt>, ErrorData> {
        let client = self
            .get_server_client(extension_name)
            .await
            .ok_or_else(|| {
                ErrorData::new(
                    ErrorCode::INVALID_PARAMS,
                    format!("Extension {} is not valid", extension_name),
                    None,
                )
            })?;

        let client_guard = client.lock().await;
        client_guard
            .list_prompts(None, cancellation_token)
            .await
            .map_err(|e| {
                ErrorData::new(
                    ErrorCode::INTERNAL_ERROR,
                    format!("Unable to list prompts for {}, {:?}", extension_name, e),
                    None,
                )
            })
            .map(|lp| lp.prompts)
    }

    pub async fn list_prompts(
        &self,
        cancellation_token: CancellationToken,
    ) -> Result<HashMap<String, Vec<Prompt>>, ErrorData> {
        let mut futures = FuturesUnordered::new();

        let names: Vec<_> = self.extensions.lock().await.keys().cloned().collect();
        for extension_name in names {
            let token = cancellation_token.clone();
            futures.push(async move {
                (
                    extension_name.clone(),
                    self.list_prompts_from_extension(extension_name.as_str(), token)
                        .await,
                )
            });
        }

        let mut all_prompts = HashMap::new();
        let mut errors = Vec::new();

        // Process results as they complete
        while let Some(result) = futures.next().await {
            let (name, prompts) = result;
            match prompts {
                Ok(content) => {
                    all_prompts.insert(name.to_string(), content);
                }
                Err(tool_error) => {
                    errors.push(tool_error);
                }
            }
        }

        if !errors.is_empty() {
            tracing::debug!(
                errors = ?errors
                    .into_iter()
                    .map(|e| format!("{:?}", e))
                    .collect::<Vec<_>>(),
                "errors from listing prompts"
            );
        }

        Ok(all_prompts)
    }

    pub async fn get_prompt(
        &self,
        extension_name: &str,
        name: &str,
        arguments: Value,
        cancellation_token: CancellationToken,
    ) -> Result<GetPromptResult> {
        let client = self
            .get_server_client(extension_name)
            .await
            .ok_or_else(|| anyhow::anyhow!("Extension {} not found", extension_name))?;

        let client_guard = client.lock().await;
        client_guard
            .get_prompt(name, arguments, cancellation_token)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to get prompt: {}", e))
    }

    pub async fn search_available_extensions(&self) -> Result<Vec<Content>, ErrorData> {
        let mut output_parts = vec![];

        // First get disabled extensions from current config
        let mut disabled_extensions: Vec<String> = vec![];
        for extension in get_all_extensions() {
            if !extension.enabled {
                let config = extension.config.clone();
                let description = match &config {
                    ExtensionConfig::Builtin {
                        description,
                        display_name,
                        ..
                    } => {
                        if description.is_empty() {
                            display_name.as_deref().unwrap_or("Built-in extension")
                        } else {
                            description
                        }
                    }
                    ExtensionConfig::Platform { description, .. }
                    | ExtensionConfig::StreamableHttp { description, .. }
                    | ExtensionConfig::Stdio { description, .. }
                    | ExtensionConfig::Frontend { description, .. } => description,
                };
                disabled_extensions.push(format!("- {} - {}", config.name(), description));
            }
        }

        // Get currently enabled extensions that can be disabled
        let enabled_extensions: Vec<String> =
            self.extensions.lock().await.keys().cloned().collect();

        // Build output string
        if !disabled_extensions.is_empty() {
            output_parts.push(format!(
                "Extensions available to enable:\n{}\n",
                disabled_extensions.join("\n")
            ));
        } else {
            output_parts.push("No extensions available to enable.\n".to_string());
        }

        if !enabled_extensions.is_empty() {
            output_parts.push(format!(
                "\n\nExtensions available to disable:\n{}\n",
                enabled_extensions
                    .iter()
                    .map(|name| format!("- {}", name))
                    .collect::<Vec<_>>()
                    .join("\n")
            ));
        } else {
            output_parts.push("No extensions that can be disabled.\n".to_string());
        }

        Ok(vec![Content::text(output_parts.join("\n"))])
    }

    async fn get_server_client(&self, name: impl Into<String>) -> Option<McpClientBox> {
        self.extensions
            .lock()
            .await
            .get(&name.into())
            .map(|ext| ext.get_client())
    }

    pub async fn collect_moim(&self) -> Option<String> {
        // Use minute-level granularity to prevent conversation changes every second
        let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:00").to_string();
        let mut content = format!("<info-msg>\nIt is currently {}\n", timestamp);

        let platform_clients: Vec<(String, McpClientBox)> = {
            let extensions = self.extensions.lock().await;
            extensions
                .iter()
                .filter_map(|(name, extension)| {
                    if let ExtensionConfig::Platform { .. } = &extension.config {
                        Some((name.clone(), extension.get_client()))
                    } else {
                        None
                    }
                })
                .collect()
        };

        for (name, client) in platform_clients {
            let client_guard = client.lock().await;
            if let Some(moim_content) = client_guard.get_moim().await {
                tracing::debug!("MOIM content from {}: {} chars", name, moim_content.len());
                content.push('\n');
                content.push_str(&moim_content);
            }
        }

        content.push_str("\n</info-msg>");

        Some(content)
    }
}

fn pending_extension_display_name(config: &ExtensionConfig) -> String {
    let name = config.name();
    let trimmed = name.trim();
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }

    let key = config.key();
    let trimmed_key = key.trim();
    if !trimmed_key.is_empty() {
        return trimmed_key.to_string();
    }

    "unnamed".to_string()
}
