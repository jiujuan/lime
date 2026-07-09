//! MCP utils compatibility aliases.

pub type ToolError = rmcp::model::ErrorData;
pub type ToolResult<T> = Result<T, ToolError>;
