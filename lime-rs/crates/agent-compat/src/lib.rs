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
mod permission;
mod providers;
mod recipe;
mod sandbox;
mod session;
mod session_context;
mod tool_inspection;
mod tools;

pub use action_required_manager::ActionRequiredManager;
pub use agents::mcp_client::{Error as McpClientError, McpClientTrait};
pub use agents::{
    Agent, AgentEvent, AgentIdentity, ContextTraceStep, ExtensionConfig, ExtensionManager,
    FrontendTool, NativeToolExecutionHook, NativeToolExecutionRequest,
    PermissionRequestHookContext, PermissionRequestHookDecision, PermissionRequestHookHandler,
    ProviderTraceEvent, SessionConfig, SuccessCheck, ToolCallResult,
};
pub use config::paths::initialized_path_root;
pub use conversation::{
    fix_conversation, ActionRequired, ActionRequiredData, ActionRequiredScope, Conversation,
    FrontendToolRequest, InvalidConversation, Message, MessageContent, MessageMetadata,
    RedactedThinkingContent, SystemNotificationContent, SystemNotificationType, ThinkingContent,
    TokenState, ToolConfirmationRequest, ToolInputDeltaContent, ToolRequest, ToolResponse,
    ToolResult as ConversationToolResult,
};
pub use model::{ConfigError, ModelConfig, ModelLimitConfig};
pub use permission::{Permission, PermissionConfirmation, PrincipalType};
pub use providers::base::{
    LeadWorkerProviderTrait, MessageStream, Provider, ProviderMetadata, ProviderUsage,
    SessionNameGenerationExecutionStrategy, Usage,
};
pub use providers::errors::ProviderError;
pub use providers::formats::openai_responses::provider_stream_event_notification_payload_from_message;
pub use providers::{create as create_provider, RetryConfig};
pub use recipe::{Recipe, RecipeBuilder, Response, SubRecipe};
pub use session::{
    create_managed_session, initialize_session_runtime_store,
    initialize_shared_session_runtime_with_root, load_shared_session_runtime_snapshot,
    require_shared_session_runtime_store, resolve_task_board_state, ChatHistoryMatch,
    ExtensionData, InMemoryThreadRuntimeStore, ItemRuntime, ItemRuntimePayload, ItemStatus,
    QueuedTurnRuntime, Session, SessionInsights, SessionManager, SessionRuntimeSnapshot,
    SessionStore, SessionType, TaskBoardItem, TaskBoardItemStatus, ThreadRuntime,
    ThreadRuntimeSnapshot, ThreadRuntimeStore, TokenStatsUpdate, TurnContextOverride,
    TurnOutputSchemaRuntime, TurnOutputSchemaSource, TurnOutputSchemaStrategy, TurnRuntime,
    TurnStatus,
};
pub use session_context::{
    current_action_scope, current_session_id, current_turn_context, with_action_scope,
    with_session_id, with_turn_context, SESSION_ID_HEADER,
};
pub use tool_inspection::{
    apply_inspection_results_to_permissions, get_security_finding_id_from_results,
    InspectionAction, InspectionResult, ToolInspectionManager, ToolInspector,
};
pub use tools::{
    AskCallback, PermissionBehavior, PermissionCheckResult, Tool, ToolContext, ToolError,
    ToolOptions, ToolRegistrationConfig, ToolRegistry, ToolResult,
};
