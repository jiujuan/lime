//! Aster - AI Agent Framework
//!
//! This crate provides the core functionality for the Aster AI agent.

// Allow dead code for now as some code is reserved for future use
#![allow(dead_code)]

mod action_required_manager;
mod agents;
mod config;
mod conversation;
mod model;
mod reply_provider;
mod sandbox;
mod session;
mod session_context;
mod tool;
mod tool_inspection;

pub use action_required_manager::ActionRequiredManager;
pub use agents::mcp_client::{Error as McpClientError, McpClientTrait};
pub use agents::{
    Agent, AgentEvent, AgentIdentity, ContextTraceStep, ExtensionConfig, FrontendTool,
    NativeToolExecutionHook, NativeToolExecutionRequest, PermissionRequestHookContext,
    PermissionRequestHookDecision, PermissionRequestHookHandler, ProviderTraceEvent, SessionConfig,
    SuccessCheck, ToolCallResult,
};
pub use config::paths::initialized_path_root;
pub use conversation::{
    fix_conversation, ActionRequired, ActionRequiredData, ActionRequiredScope, Conversation,
    FrontendToolRequest, InvalidConversation, Message, MessageContent, MessageMetadata,
    RedactedThinkingContent, SystemNotificationContent, SystemNotificationType, ThinkingContent,
    TokenState, ToolConfirmationRequest, ToolInputDeltaContent, ToolRequest, ToolResponse,
};
pub use model::{ConfigError, ModelConfig, ModelLimitConfig};
pub use reply_provider::{
    create as create_provider, provider_stream_event_notification_payload_from_message,
    LeadWorkerProviderTrait, MessageStream, Provider, ProviderError, ProviderMetadata,
    ProviderUsage, RetryConfig, SessionNameGenerationExecutionStrategy, Usage,
};
pub use session::{
    initialize_session_runtime_store, initialize_shared_session_runtime_with_root,
    require_shared_session_runtime_store, resolve_task_board_state, ChatHistoryMatch,
    ExtensionData, InMemoryThreadRuntimeStore, ItemRuntime, ItemRuntimePayload, ItemStatus,
    QueuedTurnRuntime, Session, SessionStore, SessionType, TaskBoardItem, TaskBoardItemStatus,
    ThreadRuntime, ThreadRuntimeStore, TokenStatsUpdate, TurnContextOverride,
    TurnOutputSchemaRuntime, TurnOutputSchemaSource, TurnOutputSchemaStrategy, TurnRuntime,
    TurnStatus,
};
pub use session_context::{
    current_action_scope, current_session_id, current_turn_context, with_action_scope,
    with_session_id, with_turn_context, SESSION_ID_HEADER,
};
pub use tool::{
    Permission, PermissionBehavior, PermissionCheckResult, PermissionConfirmation, PrincipalType,
    Tool, ToolContext, ToolError, ToolOptions, ToolRegistrationConfig, ToolRegistry, ToolResult,
};
pub use tool_inspection::{
    get_security_finding_id_from_results, InspectionAction, InspectionResult,
    ToolInspectionManager, ToolInspector,
};
