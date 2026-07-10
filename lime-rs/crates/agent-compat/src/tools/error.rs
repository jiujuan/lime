//! Tool Error Types
//!
//! This module defines the error types for the tool system.
//! All tool operations return `Result<T, ToolError>` for consistent error handling.

use std::time::Duration;
use thiserror::Error;

/// Tool execution error types
///
/// Represents all possible errors that can occur during tool operations.
#[derive(Debug, Error)]
pub enum ToolError {
    /// Tool not found in registry
    #[error("Tool not found: {0}")]
    NotFound(String),

    /// Permission denied for tool execution
    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    /// Tool execution failed
    #[error("Execution failed: {0}")]
    ExecutionFailed(String),

    /// Tool execution timed out
    #[error("Timeout after {0:?}")]
    Timeout(Duration),

    /// Safety check failed (e.g., dangerous command detected)
    #[error("Safety check failed: {0}")]
    SafetyCheckFailed(String),

    /// Invalid parameters provided to tool
    #[error("Invalid parameters: {0}")]
    InvalidParams(String),

    /// I/O error during tool execution
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Tool execution was cancelled
    #[error("Cancelled")]
    Cancelled,
}

impl ToolError {
    /// Create a NotFound error
    pub fn not_found(name: impl Into<String>) -> Self {
        Self::NotFound(name.into())
    }

    /// Create a PermissionDenied error
    pub fn permission_denied(reason: impl Into<String>) -> Self {
        Self::PermissionDenied(reason.into())
    }

    /// Create an ExecutionFailed error
    pub fn execution_failed(reason: impl Into<String>) -> Self {
        Self::ExecutionFailed(reason.into())
    }

    /// Create a Timeout error
    pub fn timeout(duration: Duration) -> Self {
        Self::Timeout(duration)
    }

    /// Create a SafetyCheckFailed error
    pub fn safety_check_failed(reason: impl Into<String>) -> Self {
        Self::SafetyCheckFailed(reason.into())
    }

    /// Create an InvalidParams error
    pub fn invalid_params(reason: impl Into<String>) -> Self {
        Self::InvalidParams(reason.into())
    }

    /// Check if this error is retryable
    pub fn is_retryable(&self) -> bool {
        matches!(self, Self::Timeout(_) | Self::Io(_))
    }

    /// Check if this error is a permission error
    pub fn is_permission_error(&self) -> bool {
        matches!(self, Self::PermissionDenied(_))
    }

    /// Check if this error is a safety error
    pub fn is_safety_error(&self) -> bool {
        matches!(self, Self::SafetyCheckFailed(_))
    }
}
