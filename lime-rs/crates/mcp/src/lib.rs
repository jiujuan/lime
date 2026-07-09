//! Lime MCP Crate
//!
//! MCP（Model Context Protocol）集成模块，提供 MCP 协议的客户端实现。
//! 使用 DynEmitter 进行事件发射，与具体桌面宿主解耦。

pub mod auth_status;
pub mod bridge_client;
pub mod client;
pub mod events;
pub mod manager;
pub mod naming;
pub mod oauth;
pub mod oauth_store;
mod streamable_http;
pub mod tool_converter;
pub mod tool_policy;
pub mod types;

pub use auth_status::{McpServerAuthActionPlan, McpServerAuthStatus};
pub use bridge_client::McpBridgeClient;
pub use client::{LimeMcpClient, McpClientWrapper};
pub use events::{
    McpOAuthCompletedPayload, McpResourceUpdatedPayload, McpResourcesUpdatedPayload,
    McpServerErrorPayload, McpServerStartedPayload, McpServerStoppedPayload,
    McpToolsUpdatedPayload,
};
pub use manager::{McpBridgeSnapshot, McpClientManager};
pub use oauth::{McpOAuthLoginParams, McpOAuthLoginResponse, McpOAuthRegistry};
pub use tool_converter::ToolConverter;
pub use types::{
    McpContent, McpError, McpManagerState, McpPromptArgument, McpPromptDefinition,
    McpPromptMessage, McpPromptResult, McpResourceContent, McpResourceDefinition,
    McpServerCapabilities, McpServerConfig, McpServerInfo, McpServerRuntimeStatus,
    McpServerTransport, McpToolCall, McpToolDefinition, McpToolResult,
};
