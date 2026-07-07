// =============================================================================
// Tool System Module
// =============================================================================
//
// This module provides a unified tool system for aster-rust, aligned with
// - Tool trait and base types
// - Tool registry for managing native and MCP tools
// - Core tool implementations (Bash, File, Search, etc.)
// - Permission integration
// - Audit logging

use std::collections::HashMap;
use std::sync::{Arc, Weak};

use crate::agents::ExtensionManager;

// Core modules
pub mod base;
pub mod context;
pub mod error;
pub mod hooks;
pub mod registry;
pub mod task;

// Tool implementations
mod agent_control;
mod analyze_image;
pub mod ask;
pub mod bash;
pub mod file;
pub mod lsp;
pub mod mcp_resource_tools;
mod peer_address_surface;
pub mod plan_mode_tool;
pub mod powershell_tool;
pub mod search;
pub mod send_user_message_tool;
pub mod team_tools;
pub mod tool_search_tool;

// Skills integration

// =============================================================================
// Core Type Exports
// =============================================================================

// Error types
pub use error::ToolError;

// Context and configuration types
pub use context::{ToolContext, ToolDefinition, ToolOptions, ToolResult};

// Base trait and permission types
pub use base::{PermissionBehavior, PermissionCheckResult, Tool};

// Registry types
pub use registry::{McpToolWrapper, PermissionRequestCallback, ToolRegistry};

// Hook system types
pub use hooks::{
    ErrorTrackingHook, FileOperationHook, HookContext, HookTrigger, LoggingHook, ToolHook,
    ToolHookManager,
};

// Task management types
pub use task::{
    TaskManager, TaskState, TaskStatus, DEFAULT_MAX_CONCURRENT, DEFAULT_MAX_RUNTIME_SECS,
};

// Tool implementations
pub use bash::{BashTool, SandboxConfig, MAX_OUTPUT_LENGTH};

// File tools
pub use file::{
    compute_content_hash, create_shared_history, EditTool, FileReadHistory, FileReadRecord,
    ReadTool, SharedFileReadHistory, WriteTool,
};

// Search tools
pub use search::{
    GlobTool, GrepOutputMode, GrepTool, SearchResult, DEFAULT_MAX_CONTEXT_LINES,
    DEFAULT_MAX_RESULTS, MAX_OUTPUT_SIZE,
};

// Ask tool
pub use agent_control::{
    register_agent_control_tools, AgentControlToolConfig, SendInputCallback, SendInputRequest,
    SendInputResponse, SpawnAgentCallback, SpawnAgentRequest, SpawnAgentResponse,
};
pub use ask::{AskCallback, AskOption, AskResult, AskTool, DEFAULT_ASK_TIMEOUT_SECS};

// LSP tool
pub use lsp::{
    CompletionItem, CompletionItemKind, Diagnostic, DiagnosticSeverity, HoverInfo, Location,
    LspCallback, LspOperation, LspResult, LspTool, Position, Range,
};
pub use mcp_resource_tools::{
    register_extension_resource_tools, ListMcpResourcesTool, ReadMcpResourceTool,
};
pub use tool_search_tool::{register_tool_search_tool, ToolSearchTool};

// Skill tool
pub use crate::skills::SkillTool;

// Task tools
pub use plan_mode_tool::{EnterPlanModeTool, ExitPlanModeTool, PlanModeState, SavedPlan};
pub use powershell_tool::PowerShellTool;
pub use send_user_message_tool::{SendUserMessageTool, SEND_USER_MESSAGE_TOOL_NAME};
pub use team_tools::{ListPeersTool, TeamCreateTool, TeamDeleteTool};
pub const UPDATE_PLAN_TOOL_NAME: &str = "update_plan";
pub const VIEW_IMAGE_TOOL_NAME: &str = "view_image";

pub(crate) const CURRENT_SURFACE_POWERSHELL_ENV: &str = "ASTER_USE_POWERSHELL_TOOL";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CurrentSurfaceToolGates {
    pub powershell: bool,
}

fn env_defined_falsy(value: Option<&String>) -> bool {
    value.is_some_and(|raw| {
        matches!(
            raw.trim().to_ascii_lowercase().as_str(),
            "0" | "false" | "no" | "off"
        )
    })
}

pub(crate) fn current_surface_tool_gates() -> CurrentSurfaceToolGates {
    let env = std::env::vars().collect::<HashMap<_, _>>();
    current_surface_tool_gates_from_env_map(&env, cfg!(target_os = "windows"))
}

pub(crate) fn current_surface_tool_gates_from_env_map(
    env: &HashMap<String, String>,
    is_windows: bool,
) -> CurrentSurfaceToolGates {
    let powershell_env = env.get(CURRENT_SURFACE_POWERSHELL_ENV);

    CurrentSurfaceToolGates {
        powershell: is_windows && !env_defined_falsy(powershell_env),
    }
}

pub(crate) fn should_register_current_surface_tool(
    name: &str,
    tool_gates: CurrentSurfaceToolGates,
) -> bool {
    match name {
        "PowerShell" => tool_gates.powershell,
        _ => true,
    }
}

// =============================================================================
// Tool Registration (Requirements: 11.3)
// =============================================================================

/// Configuration for tool registration
#[derive(Default)]
pub struct ToolRegistrationConfig {
    /// Callback for request_user_input user interaction
    pub ask_callback: Option<AskCallback>,
    /// Callback for LSPTool operations
    pub lsp_callback: Option<LspCallback>,
    /// Whether to enable PDF reading in ReadTool
    pub pdf_enabled: bool,
    /// Whether to enable hook system
    pub hooks_enabled: bool,
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
            .field(
                "lsp_callback",
                &self.lsp_callback.as_ref().map(|_| "<callback>"),
            )
            .field("pdf_enabled", &self.pdf_enabled)
            .field("hooks_enabled", &self.hooks_enabled)
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
            lsp_callback: self.lsp_callback.clone(),
            pdf_enabled: self.pdf_enabled,
            hooks_enabled: self.hooks_enabled,
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

    /// Set the LSPTool callback
    pub fn with_lsp_callback(mut self, callback: LspCallback) -> Self {
        self.lsp_callback = Some(callback);
        self
    }

    /// Enable PDF reading
    pub fn with_pdf_enabled(mut self, enabled: bool) -> Self {
        self.pdf_enabled = enabled;
        self
    }

    /// Enable hook system
    pub fn with_hooks_enabled(mut self, enabled: bool) -> Self {
        self.hooks_enabled = enabled;
        self
    }

    /// Attach the extension manager so current MCP resource and ToolSearch surfaces
    /// are registered from the same tool entrypoint as the rest of the tool pool.
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

    fn allows_any_tool(&self, tool_names: &[&str]) -> bool {
        tool_names
            .iter()
            .any(|tool_name| self.allows_tool(tool_name))
    }
}

/// Register all native tools with the registry
///
/// This function registers all built-in tools:
/// - BashTool: Shell command execution
/// - ReadTool: File reading (text, images, PDF, notebooks)
/// - view_image: Local image viewing is owned by Lime tool-runtime overlay
/// - WriteTool: File writing with validation
/// - EditTool: Smart file editing
/// - GlobTool: File search with glob patterns
/// - GrepTool: Content search with regex
/// - request_user_input: User interaction (if callback provided)
/// - LSPTool: Code intelligence (if callback provided)
/// - SkillTool: Skill execution and management
///
/// # Arguments
/// * `registry` - The ToolRegistry to register tools with
/// * `config` - Configuration for tool registration
///
/// # Returns
/// A tuple containing (shared file read history, hook manager)
///
/// Requirements: 11.3
pub fn register_all_tools(
    registry: &mut ToolRegistry,
    config: ToolRegistrationConfig,
) -> (SharedFileReadHistory, Option<ToolHookManager>) {
    let tool_gates = current_surface_tool_gates();

    // Create shared file read history for file tools
    let shared_history = create_shared_history();

    // Initialize hook manager if enabled
    let hook_manager = if config.hooks_enabled {
        let manager = ToolHookManager::new(true);
        // Register default hooks in a blocking context
        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                manager.register_default_hooks().await;
            })
        });
        Some(manager)
    } else {
        None
    };

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
    if config.allows_tool("Write") {
        let write_tool = WriteTool::new(shared_history.clone());
        registry.register(Box::new(write_tool));
    }

    if config.allows_tool("Edit") {
        let edit_tool = EditTool::new(shared_history.clone());
        registry.register(Box::new(edit_tool));
    }

    if config.allows_tool("Glob") {
        registry.register(Box::new(GlobTool::new()));
    }
    if config.allows_tool("Grep") {
        registry.register(Box::new(GrepTool::new()));
    }
    if config.allows_tool("SendUserMessage") {
        registry.register(Box::new(SendUserMessageTool::new()));
    }
    let powershell_tool = PowerShellTool::with_task_manager(shared_task_manager.clone());
    if config.allows_tool("PowerShell")
        && should_register_current_surface_tool("PowerShell", tool_gates)
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

    // Register LSPTool if callback is provided
    if config.allows_tool("LSP") {
        if let Some(callback) = config.lsp_callback.clone() {
            let lsp_tool = LspTool::new().with_callback(callback);
            registry.register(Box::new(lsp_tool));
        }
    }

    if config.allows_tool("Skill") {
        registry.register(Box::new(SkillTool::new()));
    }

    if config.allows_tool("EnterPlanMode") {
        registry.register(Box::new(EnterPlanModeTool::new()));
    }
    if config.allows_tool("ExitPlanMode") {
        let mut exit_plan_mode_tool = ExitPlanModeTool::new();
        if let Some(send_input_callback) = config
            .agent_control_tools
            .as_ref()
            .and_then(|agent_control_tools| agent_control_tools.send_input.clone())
        {
            exit_plan_mode_tool = exit_plan_mode_tool.with_send_input_callback(send_input_callback);
        }
        registry.register(Box::new(exit_plan_mode_tool));
    }

    if let Some(agent_control_tools) = config.agent_control_tools.as_ref() {
        if config.allows_any_tool(&["Agent", "SendMessage"]) {
            register_agent_control_tools(registry, agent_control_tools);
        }
        if agent_control_tools.spawn_agent.is_some() && agent_control_tools.send_input.is_some() {
            if config.allows_tool("TeamCreate") {
                registry.register(Box::new(TeamCreateTool::new()));
            }
            if config.allows_tool("TeamDelete") {
                registry.register(Box::new(TeamDeleteTool::new()));
            }
            if config.allows_tool("ListPeers") {
                registry.register(Box::new(ListPeersTool::new()));
            }
        }
    }

    if let Some(extension_manager) = config.extension_manager.clone() {
        if config.allows_any_tool(&["ListMcpResources", "ReadMcpResource"]) {
            register_extension_resource_tools(registry, extension_manager.clone());
        }
        if config.allows_tool("ToolSearch") {
            register_tool_search_tool(registry, extension_manager);
        }
    }

    (shared_history, hook_manager)
}

/// Register all native tools with default configuration
///
/// This is a convenience function that registers all tools with default settings.
/// request_user_input and LSPTool are not registered since they require callbacks.
///
/// # Arguments
/// * `registry` - The ToolRegistry to register tools with
///
/// # Returns
/// A tuple containing (shared file read history, hook manager)
///
/// Requirements: 11.3
pub fn register_default_tools(
    registry: &mut ToolRegistry,
) -> (SharedFileReadHistory, Option<ToolHookManager>) {
    register_all_tools(registry, ToolRegistrationConfig::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;
    use std::path::PathBuf;

    #[test]
    #[serial]
    fn test_register_default_tools() {
        temp_env::with_var(CURRENT_SURFACE_POWERSHELL_ENV, None::<&str>, || {
            let mut registry = ToolRegistry::new();
            let (_history, _hook_manager) = register_default_tools(&mut registry);
            let tool_gates = current_surface_tool_gates();

            // Verify core tools are registered
            assert!(registry.contains("Bash"));
            assert!(registry.contains("BashTool"));
            assert!(registry.contains("Read"));
            assert!(registry.contains("FileReadTool"));
            assert!(!registry.contains(VIEW_IMAGE_TOOL_NAME));
            assert!(!registry.contains("ViewImageTool"));
            assert!(registry.contains("Write"));
            assert!(registry.contains("FileWriteTool"));
            assert!(registry.contains("Edit"));
            assert!(registry.contains("FileEditTool"));
            assert!(registry.contains("Glob"));
            assert!(registry.contains("GlobTool"));
            assert!(registry.contains("Grep"));
            assert!(registry.contains("GrepTool"));
            assert!(!registry.contains("Config"));
            assert!(!registry.contains("ConfigTool"));
            assert!(registry.contains("SendUserMessage"));
            assert!(registry.contains("BriefTool"));
            assert!(!registry.contains("Sleep"));
            assert!(!registry.contains("SleepTool"));
            assert_eq!(
                registry.contains("PowerShell"),
                should_register_current_surface_tool("PowerShell", tool_gates)
                    && PowerShellTool::is_runtime_available()
            );
            assert_eq!(
                registry.contains("PowerShellTool"),
                should_register_current_surface_tool("PowerShell", tool_gates)
                    && PowerShellTool::is_runtime_available()
            );
            assert!(registry.contains("Skill"));
            assert!(registry.contains("SkillTool"));
            assert!(!registry.contains("Workflow"));
            assert!(!registry.contains("WorkflowTool"));
            assert!(!registry.contains("TaskCreate"));
            assert!(!registry.contains("TaskList"));
            assert!(!registry.contains("TaskGet"));
            assert!(!registry.contains("TaskUpdate"));
            assert!(!registry.contains("TaskOutput"));
            assert!(!registry.contains("TaskStop"));
            assert!(!registry.contains("TaskCreateTool"));
            assert!(!registry.contains("TaskListTool"));
            assert!(!registry.contains("TaskGetTool"));
            assert!(!registry.contains("TaskUpdateTool"));
            assert!(!registry.contains("TaskOutputTool"));
            assert!(!registry.contains("AgentOutputTool"));
            assert!(!registry.contains("BashOutputTool"));
            assert!(!registry.contains("TaskStopTool"));
            assert!(!registry.contains("KillShell"));
            assert!(!registry.contains("NotebookEdit"));
            assert!(!registry.contains("NotebookEditTool"));
            assert!(!registry.contains("update_plan"));
            assert!(!registry.contains("UpdatePlan"));
            assert!(!registry.contains("UpdatePlanTool"));
            assert!(!registry.contains("CronCreate"));
            assert!(!registry.contains("CronList"));
            assert!(!registry.contains("CronDelete"));
            assert!(!registry.contains("RemoteTrigger"));
            assert!(!registry.contains("RemoteTriggerTool"));
            assert!(!registry.contains("EnterWorktree"));
            assert!(!registry.contains("EnterWorktreeTool"));
            assert!(!registry.contains("ExitWorktree"));
            assert!(!registry.contains("ExitWorktreeTool"));
            assert!(registry.contains("EnterPlanMode"));
            assert!(registry.contains("EnterPlanModeTool"));
            assert!(registry.contains("ExitPlanMode"));
            assert!(registry.contains("ExitPlanModeTool"));
            assert!(!registry.contains("WebFetch"));
            assert!(!registry.contains("WebFetchTool"));
            assert!(!registry.contains("WebSearch"));
            assert!(!registry.contains("WebSearchTool"));
            assert!(!registry.contains("ToolSearch"));
            assert!(!registry.contains("spawn_agent"));
            assert!(!registry.contains("Agent"));
            assert!(!registry.contains("SendMessage"));
            assert!(!registry.contains("wait_agent"));
            assert!(!registry.contains("resume_agent"));
            assert!(!registry.contains("close_agent"));
            assert!(!registry.contains("TeamCreate"));
            assert!(!registry.contains("TeamDelete"));
            assert!(!registry.contains("ListPeers"));
            // request_user_input and LSPTool should not be registered without callbacks
            assert!(!registry.contains("request_user_input"));
            assert!(!registry.contains("LSP"));
        });
    }

    #[test]
    #[serial]
    fn test_register_all_tools_with_config() {
        use std::future::Future;
        use std::pin::Pin;
        use std::sync::Arc;

        temp_env::with_var(CURRENT_SURFACE_POWERSHELL_ENV, None::<&str>, || {
            let mut registry = ToolRegistry::new();

            // Create mock callbacks
            let ask_callback: AskCallback = Arc::new(|_request| {
                Box::pin(async { Some(serde_json::json!("test response")) })
                    as Pin<Box<dyn Future<Output = Option<serde_json::Value>> + Send>>
            });
            let spawn_agent_callback: SpawnAgentCallback = Arc::new(|request| {
                Box::pin(async move {
                    Ok(SpawnAgentResponse {
                        agent_id: request.parent_session_id,
                        nickname: Some("delegate".to_string()),
                        extra: std::collections::BTreeMap::new(),
                    })
                })
            });

            let lsp_callback: LspCallback = Arc::new(|_operation, _path: PathBuf, _position| {
                Box::pin(async { Ok(LspResult::Definition { locations: vec![] }) })
                    as Pin<Box<dyn Future<Output = Result<LspResult, String>> + Send>>
            });

            let config = ToolRegistrationConfig::new()
                .with_ask_callback(ask_callback)
                .with_lsp_callback(lsp_callback)
                .with_pdf_enabled(true)
                .with_agent_control_tools(
                    AgentControlToolConfig::new().with_spawn_agent_callback(spawn_agent_callback),
                );

            let (_history, _hook_manager) = register_all_tools(&mut registry, config);
            let tool_gates = current_surface_tool_gates();

            // Verify all tools are registered
            assert!(registry.contains("Bash"));
            assert!(registry.contains("BashTool"));
            assert!(registry.contains("Read"));
            assert!(registry.contains("FileReadTool"));
            assert!(!registry.contains(VIEW_IMAGE_TOOL_NAME));
            assert!(!registry.contains("ViewImageTool"));
            assert!(registry.contains("Write"));
            assert!(registry.contains("FileWriteTool"));
            assert!(registry.contains("Edit"));
            assert!(registry.contains("FileEditTool"));
            assert!(registry.contains("Glob"));
            assert!(registry.contains("GlobTool"));
            assert!(registry.contains("Grep"));
            assert!(registry.contains("GrepTool"));
            assert!(!registry.contains("Config"));
            assert!(!registry.contains("ConfigTool"));
            assert!(!registry.contains("Sleep"));
            assert!(!registry.contains("SleepTool"));
            assert!(registry.contains("SendUserMessage"));
            assert!(registry.contains("BriefTool"));
            assert_eq!(
                registry.contains("PowerShell"),
                should_register_current_surface_tool("PowerShell", tool_gates)
                    && PowerShellTool::is_runtime_available()
            );
            assert_eq!(
                registry.contains("PowerShellTool"),
                should_register_current_surface_tool("PowerShell", tool_gates)
                    && PowerShellTool::is_runtime_available()
            );
            assert!(registry.contains("request_user_input"));
            assert!(!registry.contains("AskUserQuestion"));
            assert!(!registry.contains("AskUserQuestionTool"));
            assert!(registry.contains("LSP"));
            assert!(registry.contains("LSPTool"));
            assert!(registry.contains("Skill"));
            assert!(registry.contains("SkillTool"));
            assert!(!registry.contains("Workflow"));
            assert!(!registry.contains("WorkflowTool"));
            assert!(!registry.contains("TaskCreate"));
            assert!(!registry.contains("TaskList"));
            assert!(!registry.contains("TaskGet"));
            assert!(!registry.contains("TaskUpdate"));
            assert!(!registry.contains("TaskOutput"));
            assert!(!registry.contains("TaskStop"));
            assert!(!registry.contains("NotebookEdit"));
            assert!(!registry.contains("NotebookEditTool"));
            assert!(!registry.contains("update_plan"));
            assert!(!registry.contains("UpdatePlan"));
            assert!(!registry.contains("UpdatePlanTool"));
            assert!(!registry.contains("CronCreate"));
            assert!(!registry.contains("CronList"));
            assert!(!registry.contains("CronDelete"));
            assert!(!registry.contains("RemoteTrigger"));
            assert!(!registry.contains("RemoteTriggerTool"));
            assert!(!registry.contains("EnterWorktree"));
            assert!(!registry.contains("EnterWorktreeTool"));
            assert!(!registry.contains("ExitWorktree"));
            assert!(!registry.contains("ExitWorktreeTool"));
            assert!(registry.contains("EnterPlanMode"));
            assert!(registry.contains("EnterPlanModeTool"));
            assert!(registry.contains("ExitPlanMode"));
            assert!(registry.contains("ExitPlanModeTool"));
            assert!(!registry.contains("WebFetch"));
            assert!(!registry.contains("WebFetchTool"));
            assert!(!registry.contains("WebSearch"));
            assert!(!registry.contains("WebSearchTool"));
            assert!(!registry.contains("spawn_agent"));
            assert!(registry.contains("Agent"));
            assert!(registry.contains("AgentTool"));
            assert!(!registry.contains("SendMessage"));
            assert!(!registry.contains("TeamCreate"));
            assert!(!registry.contains("TeamDelete"));
            assert!(!registry.contains("ListPeers"));
        });
    }

    #[test]
    #[serial]
    fn test_register_all_tools_honors_allowed_tool_names() {
        temp_env::with_var(CURRENT_SURFACE_POWERSHELL_ENV, Some("true"), || {
            let mut registry = ToolRegistry::new();
            let config = ToolRegistrationConfig::new().with_allowed_tool_names([
                "Bash",
                "Read",
                "update_plan",
                "Ask",
            ]);

            let (_history, _hook_manager) = register_all_tools(&mut registry, config);

            assert!(registry.contains("Bash"));
            assert!(registry.contains("Read"));
            assert!(!registry.contains("TaskList"));
            assert!(!registry.contains("update_plan"));
            assert!(!registry.contains("Write"));
            assert!(!registry.contains("Edit"));
            assert!(!registry.contains("Grep"));
            assert!(!registry.contains("NotebookEdit"));
            assert!(!registry.contains("EnterWorktree"));
            assert!(!registry.contains("ExitWorktree"));
            assert!(!registry.contains("RemoteTrigger"));
            assert!(!registry.contains("Config"));
            assert!(!registry.contains("Sleep"));
            assert!(!registry.contains("request_user_input"));
        });
    }

    #[test]
    fn test_register_all_tools_does_not_restore_deleted_aster_tools() {
        let mut registry = ToolRegistry::new();
        let (_history, _hook_manager) =
            register_all_tools(&mut registry, ToolRegistrationConfig::new());

        for deleted_tool in [
            "Config",
            "ConfigTool",
            "Sleep",
            "SleepTool",
            "Workflow",
            "WorkflowTool",
            "NotebookEdit",
            "NotebookEditTool",
            "CronCreate",
            "CronList",
            "CronDelete",
            "RemoteTrigger",
            "RemoteTriggerTool",
            "EnterWorktree",
            "EnterWorktreeTool",
            "ExitWorktree",
            "ExitWorktreeTool",
        ] {
            assert!(
                !registry.contains(deleted_tool),
                "deleted Aster vendor tool should not be registered: {deleted_tool}"
            );
        }
    }

    #[test]
    fn test_current_surface_tool_gates_only_keep_powershell_gate() {
        let default_env = HashMap::new();
        let default_gates = current_surface_tool_gates_from_env_map(&default_env, false);
        assert!(!default_gates.powershell);

        let enabled_env = HashMap::from([(
            CURRENT_SURFACE_POWERSHELL_ENV.to_string(),
            "true".to_string(),
        )]);
        let enabled_gates = current_surface_tool_gates_from_env_map(&enabled_env, false);
        assert!(!enabled_gates.powershell);
    }

    #[test]
    fn test_current_surface_tool_gates_cover_remaining_gated_runtime_tools() {
        let default_env = HashMap::new();
        assert_eq!(
            current_surface_tool_gates_from_env_map(&default_env, false),
            CurrentSurfaceToolGates { powershell: false }
        );

        let enabled_env = HashMap::from([(
            CURRENT_SURFACE_POWERSHELL_ENV.to_string(),
            "true".to_string(),
        )]);
        assert_eq!(
            current_surface_tool_gates_from_env_map(&enabled_env, false),
            CurrentSurfaceToolGates { powershell: false }
        );
    }

    #[test]
    fn test_current_surface_powershell_gate_is_windows_only_and_honors_falsy_override() {
        let default_env = HashMap::new();
        assert!(current_surface_tool_gates_from_env_map(&default_env, true).powershell);
        assert!(!current_surface_tool_gates_from_env_map(&default_env, false).powershell);

        for value in ["0", "false", "no", "off"] {
            let env = HashMap::from([(CURRENT_SURFACE_POWERSHELL_ENV.to_string(), value.into())]);
            assert!(
                !current_surface_tool_gates_from_env_map(&env, true).powershell,
                "PowerShell gate should be disabled for {value}"
            );
        }

        let explicit_truthy_env = HashMap::from([(
            CURRENT_SURFACE_POWERSHELL_ENV.to_string(),
            "true".to_string(),
        )]);
        assert!(current_surface_tool_gates_from_env_map(&explicit_truthy_env, true).powershell);
        assert!(!current_surface_tool_gates_from_env_map(&explicit_truthy_env, false).powershell);
    }

    #[test]
    fn test_should_register_current_surface_tool_hides_cron_without_gate() {
        let tool_gates = current_surface_tool_gates_from_env_map(&HashMap::new(), false);

        assert!(should_register_current_surface_tool("Cron", tool_gates));
        assert!(should_register_current_surface_tool(
            "RemoteTrigger",
            tool_gates
        ));
        assert!(should_register_current_surface_tool("Bash", tool_gates));
    }

    #[test]
    fn test_shared_history_is_shared() {
        let mut registry = ToolRegistry::new();
        let (history, _hook_manager) = register_default_tools(&mut registry);

        // The history should be empty initially
        assert!(history.read().unwrap().is_empty());

        // We can write to it
        {
            let mut write_guard = history.write().unwrap();
            write_guard.record_read(FileReadRecord::new(
                std::path::PathBuf::from("/tmp/test.txt"),
                "hash123".to_string(),
                100,
            ));
        }

        // And read from it
        assert!(history
            .read()
            .unwrap()
            .has_read(&std::path::PathBuf::from("/tmp/test.txt")));
    }

    #[test]
    fn test_tool_registration_config_builder() {
        let config = ToolRegistrationConfig::new().with_pdf_enabled(true);

        assert!(config.pdf_enabled);
        assert!(config.ask_callback.is_none());
        assert!(config.lsp_callback.is_none());
        assert!(config.extension_manager.is_none());
        assert!(config.agent_control_tools.is_none());
        assert!(config.allowed_tool_names.is_none());
    }

    #[test]
    fn test_register_all_tools_with_extension_manager_registers_current_extension_tools() {
        let extension_manager = Arc::new(ExtensionManager::default());
        let mut registry = ToolRegistry::new();
        let config = ToolRegistrationConfig::new()
            .with_extension_manager(Arc::downgrade(&extension_manager));

        let (_history, _hook_manager) = register_all_tools(&mut registry, config);

        assert!(registry.contains("ListMcpResourcesTool"));
        assert!(registry.contains("ReadMcpResourceTool"));
        assert!(registry.contains("ToolSearch"));
    }

    #[test]
    fn test_registers_team_tools_when_spawn_and_send_callbacks_exist() {
        use std::future::Future;
        use std::pin::Pin;
        use std::sync::Arc;

        let spawn_agent_callback: SpawnAgentCallback = Arc::new(|request| {
            Box::pin(async move {
                Ok(SpawnAgentResponse {
                    agent_id: request.parent_session_id,
                    nickname: Some("delegate".to_string()),
                    extra: std::collections::BTreeMap::new(),
                })
            })
        });
        let send_input_callback: SendInputCallback = Arc::new(|request| {
            Box::pin(async move {
                Ok(SendInputResponse {
                    submission_id: request.id,
                    extra: std::collections::BTreeMap::new(),
                })
            })
                as Pin<Box<dyn Future<Output = Result<SendInputResponse, String>> + Send>>
        });

        let mut registry = ToolRegistry::new();
        let config = ToolRegistrationConfig::new().with_agent_control_tools(
            AgentControlToolConfig::new()
                .with_spawn_agent_callback(spawn_agent_callback)
                .with_send_input_callback(send_input_callback),
        );

        let (_history, _hook_manager) = register_all_tools(&mut registry, config);

        assert!(!registry.contains("spawn_agent"));
        assert!(registry.contains("Agent"));
        assert!(registry.contains("SendMessage"));
        assert!(registry.contains("TeamCreate"));
        assert!(registry.contains("TeamDelete"));
        assert!(registry.contains("ListPeers"));
        assert!(registry.contains("SendMessageTool"));
        assert!(registry.contains("SendInput"));
        assert!(registry.contains("SendInputTool"));
        assert!(registry.contains("TeamCreateTool"));
        assert!(registry.contains("TeamDeleteTool"));
        assert!(registry.contains("ListPeersTool"));
    }
}
