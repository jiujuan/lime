mod agent;
pub(crate) mod chatrecall_extension;
pub(crate) mod code_execution_extension;
pub mod execute_commands;
pub mod extension;
pub mod extension_malware_check;
pub mod extension_manager;
pub mod extension_manager_extension;
pub mod final_output_tool;
pub mod identity;
mod large_response_handler;
pub mod mcp_client;
pub mod moim;
mod prompt_input_modalities;
pub mod prompt_manager;
mod provider_trace;
mod reply_parts;
pub mod retry;
pub mod subagent_handler;
mod subagent_task_config;
pub mod subagent_tool;
mod tool_argument_coercion;
mod tool_execution;
pub mod types;

/// SubAgent 调度器模块
///
/// 基于 Anthropic 最佳实践实现的 SubAgent 调度系统，提供：
/// - Orchestrator-Worker 模式的任务分发
/// - 上下文继承、压缩和隔离
/// - 结果聚合和摘要生成
// pub mod subagent_scheduler; // deleted - 0 references

// ============================================================================
// ============================================================================

/// Agent context management module
///
/// Provides context creation, inheritance, compression, filtering,
/// persistence, and isolation capabilities for agents.
pub mod context;

// pub mod communication; // deleted - 0 references

/// Parallel execution module
///
/// Provides parallel agent execution with dependency management,
/// retry logic, and agent resource pooling.
pub mod parallel;

// pub mod monitor; // deleted - 0 references

/// Agent resume module
///
/// Provides state persistence, checkpoint management,
/// and agent resume capabilities.
pub mod resume;

// pub mod specialized; // deleted - 0 references

/// Unified error handling module
///
/// Provides comprehensive error handling including error recording,
/// timeout handling, and retry mechanisms.
// pub mod error_handling; // deleted - 0 references

// ============================================================================
// Core Agent Exports
// ============================================================================
pub use agent::{Agent, AgentEvent, NativeToolExecutionHook, NativeToolExecutionRequest};
pub use execute_commands::COMPACT_TRIGGERS;
pub use extension::ExtensionConfig;
pub use extension_manager::ExtensionManager;
pub use identity::AgentIdentity;
pub use prompt_manager::PromptManager;
pub use provider_trace::{ProviderTraceEvent, ProviderTraceStage};
pub use subagent_task_config::TaskConfig;
pub use tool_execution::ToolCallResult;
pub use types::{
    FrontendTool, PermissionRequestHookContext, PermissionRequestHookDecision,
    PermissionRequestHookHandler, RetryConfig, SessionConfig, SuccessCheck,
};

// ============================================================================
// Context Module Re-exports
// ============================================================================

pub use context::{
    // Core context types
    AgentContext,
    AgentContextError,
    // Context manager
    AgentContextManager,
    AgentContextResult,
    // Context operations
    CompressionResult,
    ContextFilter,
    // Context inheritance
    ContextInheritanceConfig,
    ContextInheritanceType,
    // Context isolation
    ContextIsolation,
    ContextMetadata,
    ContextUpdate,
    FileContext,
    ResourceUsage,
    SandboxRestrictions,
    SandboxState,
    SandboxedContext,
    ToolExecutionResult,
};

// ============================================================================
// Communication Module Re-exports
// ============================================================================

// ============================================================================
// Parallel Module Re-exports
// ============================================================================

pub use parallel::{
    // Pool
    AgentPool,
    // Executor
    AgentResult,
    AgentTask,
    AgentWorker,
    DependencyGraph,
    ExecutionProgress,
    ExecutorError,
    ExecutorResult,
    MergedResult,
    ParallelAgentConfig,
    ParallelAgentExecutor,
    ParallelExecutionResult,
    PoolError,
    PoolResult,
    PoolStatus,
    TaskExecutionInfo,
    TaskStatus as ExecutorTaskStatus,
};

// ============================================================================
// Monitor Module Re-exports
// ============================================================================

// ============================================================================
// Resume Module Re-exports
// ============================================================================

pub use resume::{
    // Resumer
    AgentResumer,
    // State manager
    AgentState,
    AgentStateManager,
    AgentStateStatus,
    Checkpoint,
    ResumeOptions,
    ResumePoint,
    ResumePointInfo,
    ResumerError,
    ResumerResult,
    StateManagerError,
    StateManagerResult,
    ToolCallRecord,
};

// ============================================================================
// Specialized Module Re-exports
// ============================================================================
