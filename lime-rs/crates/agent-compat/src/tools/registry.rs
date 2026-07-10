//! Tool Registry Module
//!
//! This module implements the `ToolRegistry` that manages all available tools
//! in the system. It supports:
//! - Native tool registration (high priority)
//! - MCP tool registration (low priority)
//! - Tool lookup and execution
//! - Permission checking integration
//! - Audit logging integration
//!
//! Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 8.1, 8.2, 11.3, 11.4

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use async_trait::async_trait;

use super::base::{PermissionBehavior, Tool};
use super::context::{ToolContext, ToolDefinition, ToolResult};
use super::error::ToolError;

/// Callback type for permission requests that require user confirmation
///
/// When a tool's permission check returns `Ask`, this callback is invoked
/// to get user confirmation before proceeding with execution.
pub type PermissionRequestCallback =
    Box<dyn Fn(String, String) -> Pin<Box<dyn Future<Output = bool> + Send>> + Send + Sync>;

pub(crate) const DEFAULT_NATIVE_ALIAS_PAIRS: &[(&str, &[&str])] = &[
    ("Agent", &["AgentTool"]),
    (
        "Bash",
        &[
            "BashTool",
            "Shell",
            "developer__shell",
            "mcp__system__shell",
            "shell_command",
            "exec_command",
            "local_shell_call",
        ],
    ),
    (
        "Read",
        &[
            "FileReadTool",
            "read_file",
            "developer__read",
            "mcp__system__read_file",
        ],
    ),
    ("Glob", &["GlobTool", "mcp__system__glob"]),
    ("Grep", &["GrepTool", "mcp__system__grep"]),
    ("PowerShell", &["PowerShellTool"]),
    (
        "update_plan",
        &["UpdatePlan", "UpdatePlanTool", "update_plan_tool"],
    ),
    (
        "WebFetch",
        &["WebFetchTool", "web_fetch", "mcp__system__web_fetch"],
    ),
    (
        "WebSearch",
        &[
            "WebSearchTool",
            "web_search",
            "search_query",
            "mcp__system__web_search",
        ],
    ),
];

/// MCP Tool Wrapper
///
/// Wraps an MCP tool to implement the `Tool` trait, allowing MCP tools
/// to be registered alongside native tools in the registry.
///
/// Requirements: 11.1, 11.2
#[derive(Clone)]
pub struct McpToolWrapper {
    /// Tool name
    name: String,
    /// Tool description
    description: String,
    /// Input schema
    input_schema: serde_json::Value,
    /// MCP server name
    server_name: String,
}

impl McpToolWrapper {
    /// Create a new MCP tool wrapper
    pub fn new(
        name: impl Into<String>,
        description: impl Into<String>,
        input_schema: serde_json::Value,
        server_name: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            description: description.into(),
            input_schema,
            server_name: server_name.into(),
        }
    }

    /// Get the MCP server name
    pub fn server_name(&self) -> &str {
        &self.server_name
    }
}

#[async_trait]
impl Tool for McpToolWrapper {
    fn name(&self) -> &str {
        &self.name
    }

    fn description(&self) -> &str {
        &self.description
    }

    fn input_schema(&self) -> serde_json::Value {
        self.input_schema.clone()
    }

    async fn execute(
        &self,
        _params: serde_json::Value,
        _context: &ToolContext,
    ) -> Result<ToolResult, ToolError> {
        // MCP tool execution is handled externally
        // This is a placeholder that should be overridden by the actual MCP execution logic
        Err(ToolError::execution_failed(
            "MCP tool execution must be handled by the MCP client",
        ))
    }
}

/// Tool Registry
///
/// Manages all available tools in the system, including both native tools
/// and MCP tools. Native tools have higher priority than MCP tools with
/// the same name.
///
/// Requirements: 2.1, 2.2, 2.3
pub struct ToolRegistry {
    /// Native tools (high priority)
    native_tools: HashMap<String, Box<dyn Tool>>,
    /// Compatibility aliases that resolve to canonical native tool names
    native_aliases: HashMap<String, String>,
    /// MCP tools (low priority)
    mcp_tools: HashMap<String, McpToolWrapper>,
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ToolRegistry {
    /// Create a new empty tool registry
    pub fn new() -> Self {
        Self {
            native_tools: HashMap::new(),
            native_aliases: HashMap::new(),
            mcp_tools: HashMap::new(),
        }
    }
}

// =============================================================================
// Registration Methods (Requirements: 2.1, 11.4)
// =============================================================================

impl ToolRegistry {
    fn default_native_aliases(name: &str) -> &'static [&'static str] {
        DEFAULT_NATIVE_ALIAS_PAIRS
            .iter()
            .find_map(|(canonical, aliases)| {
                canonical.eq_ignore_ascii_case(name).then_some(*aliases)
            })
            .unwrap_or(&[])
    }

    fn find_native_key(&self, name: &str) -> Option<&String> {
        self.native_tools
            .keys()
            .find(|registered| registered.eq_ignore_ascii_case(name))
    }

    fn find_native_alias_key(&self, name: &str) -> Option<&String> {
        self.native_aliases
            .keys()
            .find(|registered| registered.eq_ignore_ascii_case(name))
    }

    fn model_visible_namespace_tail(name: &str) -> Option<&str> {
        let trimmed = name.trim();
        for prefix in [
            "functions.",
            "functions__",
            "function.",
            "function__",
            "tools.",
            "tools__",
            "tool.",
            "tool__",
            "native.",
            "native__",
            "builtin.",
            "builtin__",
        ] {
            if trimmed
                .get(..prefix.len())
                .is_some_and(|head| head.eq_ignore_ascii_case(prefix))
            {
                let tail = trimmed[prefix.len()..].trim();
                if !tail.is_empty() {
                    return Some(tail);
                }
            }
        }
        None
    }

    fn resolve_native_key_direct(&self, name: &str) -> Option<&String> {
        if let Some(registered) = self.find_native_key(name) {
            return Some(registered);
        }

        let canonical_name = self
            .find_native_alias_key(name)
            .and_then(|alias| self.native_aliases.get(alias))?;
        self.find_native_key(canonical_name)
    }

    fn resolve_native_key(&self, name: &str) -> Option<&String> {
        let name = name.trim();
        self.resolve_native_key_direct(name).or_else(|| {
            Self::model_visible_namespace_tail(name)
                .and_then(|tail| self.resolve_native_key_direct(tail))
        })
    }

    /// Resolve a native tool name or compatibility alias to its canonical native name.
    pub fn canonical_native_name(&self, name: &str) -> Option<String> {
        self.resolve_native_key(name).cloned()
    }

    /// Resolve a tool name to the canonical registered name.
    ///
    /// Native tools and their aliases take priority over MCP tools, matching
    /// normal registry lookup and execution semantics.
    pub fn canonical_name(&self, name: &str) -> Option<String> {
        self.canonical_native_name(name)
            .or_else(|| self.find_mcp_key(name).cloned())
    }

    fn remove_native_aliases_for(&mut self, canonical_name: &str) {
        self.native_aliases
            .retain(|_, target| !target.eq_ignore_ascii_case(canonical_name));
    }

    fn find_mcp_key(&self, name: &str) -> Option<&String> {
        self.mcp_tools
            .keys()
            .find(|registered| registered.eq_ignore_ascii_case(name))
    }

    /// Register a native tool
    ///
    /// Native tools have higher priority than MCP tools with the same name.
    /// If a native tool with the same name already exists, it will be replaced.
    ///
    /// # Arguments
    /// * `tool` - The tool to register
    ///
    /// Requirements: 2.1
    pub fn register(&mut self, tool: Box<dyn Tool>) {
        let name = tool.name().to_string();
        let aliases = tool
            .aliases()
            .iter()
            .copied()
            .chain(Self::default_native_aliases(&name).iter().copied())
            .collect::<Vec<_>>();
        if let Some(existing_name) = self.find_native_key(&name).cloned() {
            self.remove_native_aliases_for(&existing_name);
            self.native_tools.remove(&existing_name);
        }
        if let Some(existing_alias_name) = self.find_native_alias_key(&name).cloned() {
            self.native_aliases.remove(&existing_alias_name);
        }

        self.native_tools.insert(name.clone(), tool);
        self.remove_native_aliases_for(&name);

        for alias in aliases {
            let alias = alias.trim();
            if alias.is_empty() || alias.eq_ignore_ascii_case(&name) {
                continue;
            }
            if self.find_native_key(alias).is_some() {
                continue;
            }
            if let Some(existing_alias_name) = self.find_native_alias_key(alias).cloned() {
                self.native_aliases.remove(&existing_alias_name);
            }
            self.native_aliases.insert(alias.to_string(), name.clone());
        }
    }

    /// Register an MCP tool
    ///
    /// MCP tools have lower priority than native tools. If a native tool
    /// with the same name exists, the MCP tool will be shadowed.
    ///
    /// # Arguments
    /// * `name` - The tool name
    /// * `tool` - The MCP tool wrapper
    ///
    /// Requirements: 11.4
    pub fn register_mcp(&mut self, name: String, tool: McpToolWrapper) {
        if let Some(existing_name) = self.find_mcp_key(&name).cloned() {
            self.mcp_tools.remove(&existing_name);
        }
        self.mcp_tools.insert(name, tool);
    }

    /// Unregister a native tool
    ///
    /// # Arguments
    /// * `name` - The name of the tool to unregister
    ///
    /// # Returns
    /// The unregistered tool if it existed
    pub fn unregister(&mut self, name: &str) -> Option<Box<dyn Tool>> {
        let key = self.find_native_key(name).cloned()?;
        self.remove_native_aliases_for(&key);
        self.native_tools.remove(&key)
    }

    /// Unregister an MCP tool
    ///
    /// # Arguments
    /// * `name` - The name of the tool to unregister
    ///
    /// # Returns
    /// The unregistered MCP tool wrapper if it existed
    pub fn unregister_mcp(&mut self, name: &str) -> Option<McpToolWrapper> {
        let key = self.find_mcp_key(name).cloned()?;
        self.mcp_tools.remove(&key)
    }

    /// Check if a tool is registered (native or MCP)
    ///
    /// # Arguments
    /// * `name` - The tool name to check
    ///
    /// # Returns
    /// `true` if the tool is registered
    pub fn contains(&self, name: &str) -> bool {
        self.resolve_native_key(name).is_some() || self.find_mcp_key(name).is_some()
    }

    /// Check if a native tool is registered
    pub fn contains_native(&self, name: &str) -> bool {
        self.resolve_native_key(name).is_some()
    }

    /// Check if an MCP tool is registered
    pub fn contains_mcp(&self, name: &str) -> bool {
        self.find_mcp_key(name).is_some()
    }

    /// Get the number of registered native tools
    pub fn native_tool_count(&self) -> usize {
        self.native_tools.len()
    }

    /// Get the number of registered MCP tools
    pub fn mcp_tool_count(&self) -> usize {
        self.mcp_tools.len()
    }

    /// Get the total number of registered tools
    pub fn tool_count(&self) -> usize {
        // Count unique tool names (native tools shadow MCP tools)
        let mut names: std::collections::HashSet<&str> =
            self.native_tools.keys().map(|s| s.as_str()).collect();
        for name in self.mcp_tools.keys() {
            names.insert(name.as_str());
        }
        names.len()
    }
}

// =============================================================================
// Query Methods (Requirements: 2.2, 2.3, 2.4)
// =============================================================================

impl ToolRegistry {
    /// Get a tool by name (native tools have priority)
    ///
    /// # Arguments
    /// * `name` - The tool name to look up
    ///
    /// # Returns
    /// A reference to the tool if found, with native tools taking priority
    ///
    /// Requirements: 2.2
    pub fn get(&self, name: &str) -> Option<&dyn Tool> {
        // Native tools have priority over MCP tools
        if let Some(tool) = self
            .resolve_native_key(name)
            .and_then(|registered| self.native_tools.get(registered))
        {
            return Some(tool.as_ref());
        }
        if let Some(tool) = self
            .find_mcp_key(name)
            .and_then(|registered| self.mcp_tools.get(registered))
        {
            return Some(tool as &dyn Tool);
        }
        None
    }

    /// Get all registered tools
    ///
    /// Returns all tools with native tools taking priority over MCP tools
    /// with the same name.
    ///
    /// # Returns
    /// A vector of references to all registered tools
    ///
    /// Requirements: 2.3
    pub fn get_all(&self) -> Vec<&dyn Tool> {
        let mut tools: Vec<&dyn Tool> = Vec::new();
        let mut seen_names: std::collections::HashSet<&str> = std::collections::HashSet::new();

        // Add native tools first (higher priority)
        for (name, tool) in &self.native_tools {
            tools.push(tool.as_ref());
            seen_names.insert(name.as_str());
        }

        // Add MCP tools that aren't shadowed by native tools
        for (name, tool) in &self.mcp_tools {
            if !seen_names.contains(name.as_str()) {
                tools.push(tool as &dyn Tool);
            }
        }

        tools
    }

    /// Get all tool definitions for LLM consumption
    ///
    /// Returns definitions for all tools, with native tools taking priority
    /// over MCP tools with the same name.
    ///
    /// # Returns
    /// A vector of tool definitions
    ///
    /// Requirements: 2.4
    pub fn get_definitions(&self) -> Vec<ToolDefinition> {
        self.get_all()
            .iter()
            .map(|tool| tool.get_definition())
            .collect()
    }

    /// Get all native tool names
    pub fn native_tool_names(&self) -> Vec<&str> {
        self.native_tools.keys().map(|s| s.as_str()).collect()
    }

    /// Get all MCP tool names
    pub fn mcp_tool_names(&self) -> Vec<&str> {
        self.mcp_tools.keys().map(|s| s.as_str()).collect()
    }

    /// Get all tool names (unique, native tools shadow MCP tools)
    pub fn tool_names(&self) -> Vec<&str> {
        let mut names: std::collections::HashSet<&str> =
            self.native_tools.keys().map(|s| s.as_str()).collect();
        for name in self.mcp_tools.keys() {
            names.insert(name.as_str());
        }
        names.into_iter().collect()
    }

    /// Check if a tool is a native tool
    pub fn is_native(&self, name: &str) -> bool {
        self.resolve_native_key(name).is_some()
    }

    /// Check if a tool is an MCP tool (and not shadowed by a native tool)
    pub fn is_mcp(&self, name: &str) -> bool {
        self.find_native_key(name).is_none() && self.find_mcp_key(name).is_some()
    }
}

// =============================================================================
// Execution Methods (Requirements: 2.5, 2.6, 8.1, 8.2)
// =============================================================================

impl ToolRegistry {
    /// Check tool permissions and return the params that should be used for execution.
    ///
    /// This is used by external process owners that need to keep the registry
    /// permission model but own the process lifecycle themselves.
    pub async fn check_tool_permissions(
        &self,
        name: &str,
        params: serde_json::Value,
        context: &ToolContext,
        on_permission_request: Option<PermissionRequestCallback>,
    ) -> Result<serde_json::Value, ToolError> {
        let tool = self.get(name).ok_or_else(|| ToolError::not_found(name))?;
        let permission_result = tool.check_permissions(&params, context).await;

        match permission_result.behavior {
            PermissionBehavior::Deny => {
                let reason = permission_result
                    .message
                    .unwrap_or_else(|| format!("Permission denied for tool '{}'", name));
                return Err(ToolError::permission_denied(reason));
            }
            PermissionBehavior::Ask => {
                if let Some(callback) = on_permission_request {
                    let message = permission_result.message.unwrap_or_else(|| {
                        format!("Tool '{}' requires permission to execute", name)
                    });
                    let approved = callback(name.to_string(), message.clone()).await;
                    if !approved {
                        return Err(ToolError::permission_denied("User denied permission"));
                    }
                } else {
                    let reason =
                        "Permission request requires user confirmation but no callback provided";
                    return Err(ToolError::permission_denied(reason));
                }
            }
            PermissionBehavior::Allow => {}
        }

        Ok(permission_result.updated_params.unwrap_or(params))
    }

    /// Execute a tool by name with permission checking and audit logging
    ///
    /// This method:
    /// 1. Looks up the tool by name
    /// 2. Performs permission check (if permission manager is configured)
    /// 3. Handles permission request callback for 'Ask' behavior
    /// 4. Executes the tool
    /// 5. Records audit log (if audit logger is configured)
    ///
    /// # Arguments
    /// * `name` - The tool name to execute
    /// * `params` - The tool parameters
    /// * `context` - The execution context
    /// * `on_permission_request` - Optional callback for permission requests
    ///
    /// # Returns
    /// * `Ok(ToolResult)` - The execution result
    /// * `Err(ToolError)` - If the tool is not found, permission denied, or execution fails
    ///
    /// Requirements: 2.5, 2.6, 8.1, 8.2
    pub async fn execute(
        &self,
        name: &str,
        params: serde_json::Value,
        context: &ToolContext,
        on_permission_request: Option<PermissionRequestCallback>,
    ) -> Result<ToolResult, ToolError> {
        let params_to_use = self
            .check_tool_permissions(name, params.clone(), context, on_permission_request)
            .await?;
        let tool = self.get(name).ok_or_else(|| ToolError::not_found(name))?;
        tool.execute(params_to_use, context).await
    }
}
