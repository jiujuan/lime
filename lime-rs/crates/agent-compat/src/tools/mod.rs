// =============================================================================
// Tool System Module
// =============================================================================
//
// This module provides a unified tool system for aster-rust, aligned with
// - Tool trait and base types
// - Tool registry for managing native and MCP tools
// - Core tool implementations (Bash, File, Search, etc.)
// - Permission integration

use std::sync::{Arc, Weak};

use crate::agents::ExtensionManager;
use tool_runtime::turn_tool_surface::{
    runtime_tool_surface_gates, runtime_tool_surface_should_register_name,
};

// Core modules
pub(crate) mod base;
pub(crate) mod context;
pub(crate) mod error;
pub(crate) mod registry;
pub(crate) mod task;

// Tool implementations
mod agent_control;
pub(crate) mod ask;
pub(crate) mod bash;
pub(crate) mod file;
pub(crate) mod powershell_tool;
pub(crate) mod search;
pub(crate) mod team_tools;

// Skills integration

// =============================================================================
// Core Type Exports
// =============================================================================

// Error types
pub use error::ToolError;

// Context and configuration types
pub use context::{ToolContext, ToolOptions, ToolResult};

// Base trait and permission types
pub use base::{PermissionBehavior, PermissionCheckResult, Tool};

// Registry types
pub use registry::{McpToolWrapper, PermissionRequestCallback, ToolRegistry};

// Task management types
pub use task::TaskManager;

// Tool implementation adapters are crate-private staging only.
pub(crate) use bash::BashTool;

// File tools
pub(crate) use file::{create_shared_history, ReadTool, SharedFileReadHistory};

// Search tools
pub(crate) use search::{GlobTool, GrepTool};

// Ask tool
pub(crate) use agent_control::{execute_agent_control_runtime_tool, AgentControlToolConfig};
pub use ask::AskCallback;
pub(crate) use ask::{execute_request_user_input_runtime_tool, AskTool, DEFAULT_ASK_TIMEOUT_SECS};

// Task tools
pub(crate) use powershell_tool::PowerShellTool;
pub(crate) use team_tools::execute_team_runtime_tool;
pub const UPDATE_PLAN_TOOL_NAME: &str = "update_plan";
pub const VIEW_IMAGE_TOOL_NAME: &str = "view_image";

// =============================================================================
// Tool Registration (Requirements: 11.3)
// =============================================================================

/// Configuration for tool registration
#[derive(Default)]
pub struct ToolRegistrationConfig {
    /// Callback for request_user_input user interaction
    pub ask_callback: Option<AskCallback>,
    /// Whether to enable PDF reading in ReadTool
    pub pdf_enabled: bool,
    /// Optional extension manager for current MCP resource / tool search surface
    pub extension_manager: Option<Weak<ExtensionManager>>,
    /// Optional modern delegation / agent runtime tools
    pub agent_control_tools: Option<AgentControlToolConfig>,
    /// Optional native tool allowlist used by downstream runtimes that no longer
    /// expose the whole vendored Aster tool surface.
    pub allowed_tool_names: Option<Vec<String>>,
}

impl std::fmt::Debug for ToolRegistrationConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ToolRegistrationConfig")
            .field(
                "ask_callback",
                &self.ask_callback.as_ref().map(|_| "<callback>"),
            )
            .field("pdf_enabled", &self.pdf_enabled)
            .field(
                "extension_manager",
                &self.extension_manager.as_ref().map(|_| "<manager>"),
            )
            .field(
                "agent_control_tools",
                &self.agent_control_tools.as_ref().map(|_| "<callbacks>"),
            )
            .field("allowed_tool_names", &self.allowed_tool_names)
            .finish()
    }
}

impl Clone for ToolRegistrationConfig {
    fn clone(&self) -> Self {
        Self {
            ask_callback: self.ask_callback.clone(),
            pdf_enabled: self.pdf_enabled,
            extension_manager: self.extension_manager.clone(),
            agent_control_tools: self.agent_control_tools.clone(),
            allowed_tool_names: self.allowed_tool_names.clone(),
        }
    }
}

impl ToolRegistrationConfig {
    /// Create a new configuration with default settings
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the request_user_input callback
    pub fn with_ask_callback(mut self, callback: AskCallback) -> Self {
        self.ask_callback = Some(callback);
        self
    }

    /// Enable PDF reading
    pub fn with_pdf_enabled(mut self, enabled: bool) -> Self {
        self.pdf_enabled = enabled;
        self
    }

    /// Attach the extension manager so current MCP resource surfaces are registered
    /// from the same tool entrypoint as the rest of the tool pool.
    pub fn with_extension_manager(mut self, extension_manager: Weak<ExtensionManager>) -> Self {
        self.extension_manager = Some(extension_manager);
        self
    }

    /// Register modern delegation / agent runtime tools using callbacks
    pub fn with_agent_control_tools(mut self, config: AgentControlToolConfig) -> Self {
        self.agent_control_tools = Some(config);
        self
    }

    /// Restrict native tool registration to the provided canonical tool names.
    pub fn with_allowed_tool_names<I, S>(mut self, tool_names: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.allowed_tool_names = Some(tool_names.into_iter().map(Into::into).collect());
        self
    }

    fn allows_tool(&self, tool_name: &str) -> bool {
        match &self.allowed_tool_names {
            Some(allowed_tool_names) => allowed_tool_names
                .iter()
                .any(|allowed| allowed.eq_ignore_ascii_case(tool_name)),
            None => true,
        }
    }
}

/// Register all native tools with the registry
///
/// This function registers all built-in tools:
/// - BashTool: Shell command execution
/// - ReadTool: File reading (text, images, PDF, notebooks)
/// - view_image: Local image viewing is owned by Lime tool-runtime overlay
/// - GlobTool: File search with glob patterns
/// - GrepTool: Content search with regex
/// - request_user_input: User interaction (if callback provided)
/// - Skill execution is owned by Lime `tool-runtime` and is not registered by
///   vendored Aster defaults.
///
/// # Arguments
/// * `registry` - The ToolRegistry to register tools with
/// * `config` - Configuration for tool registration
///
/// # Returns
/// Shared file read history for the registered file tools.
///
/// Requirements: 11.3
pub(crate) fn register_all_tools(
    registry: &mut ToolRegistry,
    config: ToolRegistrationConfig,
) -> SharedFileReadHistory {
    let tool_gates = runtime_tool_surface_gates();

    // Create shared file read history for file tools
    let shared_history = create_shared_history();

    let shared_task_manager = Arc::new(TaskManager::new());

    if config.allows_tool("Bash") {
        registry.register(Box::new(BashTool::with_task_manager(
            shared_task_manager.clone(),
        )));
    }

    if config.allows_tool("Read") {
        let read_tool = ReadTool::new(shared_history.clone()).with_pdf_enabled(config.pdf_enabled);
        registry.register(Box::new(read_tool));
    }
    if config.allows_tool("Glob") {
        registry.register(Box::new(GlobTool::new()));
    }
    if config.allows_tool("Grep") {
        registry.register(Box::new(GrepTool::new()));
    }
    let powershell_tool = PowerShellTool::with_task_manager(shared_task_manager.clone());
    if config.allows_tool("PowerShell")
        && runtime_tool_surface_should_register_name("PowerShell", tool_gates)
        && powershell_tool.is_available()
    {
        registry.register(Box::new(powershell_tool));
    }

    // Register request_user_input if callback is provided
    if config.allows_tool("Ask") {
        if let Some(callback) = config.ask_callback.clone() {
            let ask_tool = AskTool::new().with_callback(callback);
            registry.register(Box::new(ask_tool));
        }
    }

    shared_history
}

/// Register all native tools with default configuration
///
/// This is a convenience function that registers all tools with default settings.
/// request_user_input is not registered since it requires a callback.
///
/// # Arguments
/// * `registry` - The ToolRegistry to register tools with
///
/// # Returns
/// Shared file read history for the registered file tools.
///
/// Requirements: 11.3
pub(crate) fn register_default_tools(registry: &mut ToolRegistry) -> SharedFileReadHistory {
    register_all_tools(registry, ToolRegistrationConfig::default())
}
