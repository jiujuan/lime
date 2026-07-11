use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;
use tool_runtime::request_user_input::RequestUserInputCallback;
use tool_runtime::tool_definition::RuntimeToolDefinition;

use crate::agents::collab_runtime::AgentControlToolConfig;
use crate::reply_provider::Provider;
use crate::sandbox::SandboxConfig;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Permission {
    AlwaysAllow,
    AllowOnce,
    Cancel,
    DenyOnce,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PrincipalType {
    Extension,
    Tool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PermissionConfirmation {
    pub principal_type: PrincipalType,
    pub permission: Permission,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PermissionBehavior {
    Allow,
    Deny,
    Ask,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionCheckResult {
    pub behavior: PermissionBehavior,
    pub message: Option<String>,
    pub updated_params: Option<serde_json::Value>,
}

impl PermissionCheckResult {
    pub fn allow() -> Self {
        Self {
            behavior: PermissionBehavior::Allow,
            message: None,
            updated_params: None,
        }
    }

    pub fn deny(reason: impl Into<String>) -> Self {
        Self {
            behavior: PermissionBehavior::Deny,
            message: Some(reason.into()),
            updated_params: None,
        }
    }

    pub fn ask(message: impl Into<String>) -> Self {
        Self {
            behavior: PermissionBehavior::Ask,
            message: Some(message.into()),
            updated_params: None,
        }
    }

    pub fn with_updated_params(mut self, params: serde_json::Value) -> Self {
        self.updated_params = Some(params);
        self
    }

    pub fn is_allowed(&self) -> bool {
        self.behavior == PermissionBehavior::Allow
    }

    pub fn is_denied(&self) -> bool {
        self.behavior == PermissionBehavior::Deny
    }
}

impl Default for PermissionCheckResult {
    fn default() -> Self {
        Self::allow()
    }
}

#[derive(Clone)]
pub struct ToolContext {
    pub working_directory: PathBuf,
    pub session_id: String,
    pub user: Option<String>,
    pub environment: HashMap<String, String>,
    pub cancellation_token: Option<CancellationToken>,
    pub provider: Option<Arc<dyn Provider>>,
    pub workspace_sandbox: Option<SandboxConfig>,
}

impl std::fmt::Debug for ToolContext {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let provider_name = self.provider.as_ref().map(|provider| provider.get_name());
        f.debug_struct("ToolContext")
            .field("working_directory", &self.working_directory)
            .field("session_id", &self.session_id)
            .field("user", &self.user)
            .field("environment", &self.environment)
            .field("has_cancellation_token", &self.cancellation_token.is_some())
            .field("provider", &provider_name)
            .field("has_workspace_sandbox", &self.workspace_sandbox.is_some())
            .finish()
    }
}

impl Default for ToolContext {
    fn default() -> Self {
        Self {
            working_directory: std::env::current_dir().unwrap_or_default(),
            session_id: String::new(),
            user: None,
            environment: HashMap::new(),
            cancellation_token: None,
            provider: None,
            workspace_sandbox: None,
        }
    }
}

impl ToolContext {
    pub fn new(working_directory: PathBuf) -> Self {
        Self {
            working_directory,
            ..Self::default()
        }
    }

    pub fn with_session_id(mut self, session_id: impl Into<String>) -> Self {
        self.session_id = session_id.into();
        self
    }

    pub fn with_user(mut self, user: impl Into<String>) -> Self {
        self.user = Some(user.into());
        self
    }

    pub fn with_environment(mut self, environment: HashMap<String, String>) -> Self {
        self.environment = environment;
        self
    }

    pub fn with_env_var(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.environment.insert(key.into(), value.into());
        self
    }

    pub fn with_cancellation_token(mut self, token: CancellationToken) -> Self {
        self.cancellation_token = Some(token);
        self
    }

    pub fn with_provider(mut self, provider: Arc<dyn Provider>) -> Self {
        self.provider = Some(provider);
        self
    }

    pub fn with_workspace_sandbox(mut self, config: SandboxConfig) -> Self {
        self.workspace_sandbox = Some(config);
        self
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancellation_token
            .as_ref()
            .is_some_and(CancellationToken::is_cancelled)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOptions {
    pub max_retries: u32,
    #[serde(with = "duration_serde")]
    pub base_timeout: Duration,
    pub enable_dynamic_timeout: bool,
    pub retryable_errors: Vec<String>,
}

impl Default for ToolOptions {
    fn default() -> Self {
        Self {
            max_retries: 3,
            base_timeout: Duration::from_secs(30),
            enable_dynamic_timeout: true,
            retryable_errors: vec![
                "timeout".to_string(),
                "connection refused".to_string(),
                "temporary failure".to_string(),
            ],
        }
    }
}

impl ToolOptions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }

    pub fn with_base_timeout(mut self, timeout: Duration) -> Self {
        self.base_timeout = timeout;
        self
    }

    pub fn with_dynamic_timeout(mut self, enabled: bool) -> Self {
        self.enable_dynamic_timeout = enabled;
        self
    }

    pub fn with_retryable_errors(mut self, errors: Vec<String>) -> Self {
        self.retryable_errors = errors;
        self
    }
}

pub type ToolDefinition = RuntimeToolDefinition;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolResult {
    pub success: bool,
    pub output: Option<String>,
    pub error: Option<String>,
    pub metadata: HashMap<String, serde_json::Value>,
}

impl Default for ToolResult {
    fn default() -> Self {
        Self {
            success: true,
            output: None,
            error: None,
            metadata: HashMap::new(),
        }
    }
}

impl ToolResult {
    pub fn success(output: impl Into<String>) -> Self {
        Self {
            success: true,
            output: Some(output.into()),
            error: None,
            metadata: HashMap::new(),
        }
    }

    pub fn success_empty() -> Self {
        Self {
            success: true,
            output: None,
            error: None,
            metadata: HashMap::new(),
        }
    }

    pub fn error(error: impl Into<String>) -> Self {
        Self {
            success: false,
            output: None,
            error: Some(error.into()),
            metadata: HashMap::new(),
        }
    }

    pub fn with_metadata(mut self, key: impl Into<String>, value: serde_json::Value) -> Self {
        self.metadata.insert(key.into(), value);
        self
    }

    pub fn with_metadata_map(mut self, metadata: HashMap<String, serde_json::Value>) -> Self {
        self.metadata.extend(metadata);
        self
    }

    pub fn message(&self) -> Option<&str> {
        if self.success {
            self.output.as_deref()
        } else {
            self.error.as_deref()
        }
    }

    pub fn content(&self) -> &str {
        self.message().unwrap_or("")
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ToolError {
    #[error("Tool not found: {0}")]
    NotFound(String),
    #[error("Permission denied: {0}")]
    PermissionDenied(String),
    #[error("Execution failed: {0}")]
    ExecutionFailed(String),
    #[error("Timeout after {0:?}")]
    Timeout(Duration),
    #[error("Safety check failed: {0}")]
    SafetyCheckFailed(String),
    #[error("Invalid parameters: {0}")]
    InvalidParams(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Cancelled")]
    Cancelled,
}

impl ToolError {
    pub fn not_found(name: impl Into<String>) -> Self {
        Self::NotFound(name.into())
    }

    pub fn permission_denied(reason: impl Into<String>) -> Self {
        Self::PermissionDenied(reason.into())
    }

    pub fn execution_failed(reason: impl Into<String>) -> Self {
        Self::ExecutionFailed(reason.into())
    }

    pub fn timeout(duration: Duration) -> Self {
        Self::Timeout(duration)
    }

    pub fn safety_check_failed(reason: impl Into<String>) -> Self {
        Self::SafetyCheckFailed(reason.into())
    }

    pub fn invalid_params(reason: impl Into<String>) -> Self {
        Self::InvalidParams(reason.into())
    }
}

#[async_trait]
pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn input_schema(&self) -> serde_json::Value;

    fn dynamic_description(&self) -> Option<String> {
        None
    }

    fn aliases(&self) -> &'static [&'static str] {
        &[]
    }

    async fn execute(
        &self,
        params: serde_json::Value,
        context: &ToolContext,
    ) -> Result<ToolResult, ToolError>;

    async fn check_permissions(
        &self,
        _params: &serde_json::Value,
        _context: &ToolContext,
    ) -> PermissionCheckResult {
        PermissionCheckResult::allow()
    }

    fn get_definition(&self) -> ToolDefinition {
        RuntimeToolDefinition::new(
            self.name(),
            self.dynamic_description()
                .unwrap_or_else(|| self.description().to_string()),
            self.input_schema(),
        )
    }

    fn options(&self) -> ToolOptions {
        ToolOptions::default()
    }
}

#[derive(Default)]
pub struct ToolRegistry {
    native_tools: HashMap<String, Box<dyn Tool>>,
    native_aliases: HashMap<String, String>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&mut self, tool: Box<dyn Tool>) {
        let name = tool.name().to_string();
        self.remove_native_aliases_for(&name);
        self.native_tools.insert(name.clone(), tool);

        let aliases = self
            .native_tools
            .get(&name)
            .map(|tool| tool.aliases().to_vec())
            .unwrap_or_default();
        for alias in aliases {
            let alias = alias.trim();
            if alias.is_empty() || alias.eq_ignore_ascii_case(&name) {
                continue;
            }
            self.native_aliases.insert(alias.to_string(), name.clone());
        }
    }

    pub fn contains(&self, name: &str) -> bool {
        self.resolve_native_key(name).is_some()
    }

    pub fn canonical_name(&self, name: &str) -> Option<String> {
        self.resolve_native_key(name).cloned()
    }

    pub fn canonical_native_name(&self, name: &str) -> Option<String> {
        self.canonical_name(name)
    }

    pub fn get_definitions(&self) -> Vec<ToolDefinition> {
        self.native_tools
            .values()
            .map(|tool| tool.get_definition())
            .collect()
    }

    pub async fn execute(
        &self,
        name: &str,
        params: serde_json::Value,
        context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        let tool = self
            .resolve_native_key(name)
            .and_then(|registered| self.native_tools.get(registered))
            .ok_or_else(|| ToolError::not_found(name))?;
        let permission = tool.check_permissions(&params, context).await;
        let params = match permission.behavior {
            PermissionBehavior::Allow => permission.updated_params.unwrap_or(params),
            PermissionBehavior::Deny => {
                return Err(ToolError::permission_denied(
                    permission
                        .message
                        .unwrap_or_else(|| format!("Permission denied for tool '{name}'")),
                ));
            }
            PermissionBehavior::Ask => {
                return Err(ToolError::permission_denied(
                    permission.message.unwrap_or_else(|| {
                        format!("Tool '{name}' requires permission through current runtime")
                    }),
                ));
            }
        };
        tool.execute(params, context).await
    }

    fn resolve_native_key(&self, name: &str) -> Option<&String> {
        self.native_tools
            .keys()
            .find(|registered| registered.eq_ignore_ascii_case(name))
            .or_else(|| {
                self.native_aliases
                    .iter()
                    .find(|(alias, _)| alias.eq_ignore_ascii_case(name))
                    .map(|(_, registered)| registered)
            })
    }

    fn remove_native_aliases_for(&mut self, name: &str) {
        self.native_aliases
            .retain(|_, registered| !registered.eq_ignore_ascii_case(name));
    }
}

#[derive(Default, Clone)]
pub struct ToolRegistrationConfig {
    pub request_user_input_callback: Option<RequestUserInputCallback>,
    pub agent_control_tools: Option<AgentControlToolConfig>,
    pub allowed_tool_names: Option<Vec<String>>,
}

impl std::fmt::Debug for ToolRegistrationConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ToolRegistrationConfig")
            .field(
                "request_user_input_callback",
                &self
                    .request_user_input_callback
                    .as_ref()
                    .map(|_| "<callback>"),
            )
            .field(
                "agent_control_tools",
                &self.agent_control_tools.as_ref().map(|_| "<callbacks>"),
            )
            .field("allowed_tool_names", &self.allowed_tool_names)
            .finish()
    }
}

impl ToolRegistrationConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_request_user_input_callback(mut self, callback: RequestUserInputCallback) -> Self {
        self.request_user_input_callback = Some(callback);
        self
    }

    pub fn with_agent_control_tools(mut self, config: AgentControlToolConfig) -> Self {
        self.agent_control_tools = Some(config);
        self
    }

    pub fn with_allowed_tool_names<I, S>(mut self, tool_names: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.allowed_tool_names = Some(tool_names.into_iter().map(Into::into).collect());
        self
    }
}

mod duration_serde {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};
    use std::time::Duration;

    pub fn serialize<S>(duration: &Duration, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        duration.as_secs().serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Duration, D::Error>
    where
        D: Deserializer<'de>,
    {
        let secs = u64::deserialize(deserializer)?;
        Ok(Duration::from_secs(secs))
    }
}
