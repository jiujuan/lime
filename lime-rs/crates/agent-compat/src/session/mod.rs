//! Session 模块
//!
//! 提供 session 管理功能，包括：
//! - `SessionStore` trait: 可插拔的存储抽象
//! - `SessionManager`: 向后兼容的静态方法（使用全局 store）
//! - SQLite 默认实现
//!
//! ## 使用方式
//!
//! ### 方式 1: 使用默认 SQLite 存储（向后兼容）
//! ```ignore
//! use aster::create_managed_session;
//! let session = create_managed_session(dir, name, session_type).await?;
//! ```
//!
//! ### 方式 2: 注入自定义存储（推荐）
//! ```ignore
//! use aster::{Agent, NoopSessionStore, SessionStore};
//!
//! let store = Arc::new(MyCustomStore::new());
//! let agent = Agent::new().with_session_store(store);
//! ```

mod bootstrap;
mod chat_history_search;
mod extension_data;
mod legacy;
mod query;
mod runtime_queue;
mod runtime_store;
mod session_manager;
mod store;
mod subagent;
mod team;
mod update;

// 导出存储抽象
pub use bootstrap::{
    initialize_shared_session_runtime_with_root, load_managed_session_runtime_snapshot,
    load_shared_session_runtime_snapshot, require_shared_session_runtime_store,
};
pub use store::{
    get_global_session_store, install_global_session_store, is_global_session_store_set,
    ChatHistoryMatch, SessionStore, TokenStatsUpdate,
};

// 导出现有功能（向后兼容）
pub use extension_data::{
    resolve_task_board_state, EnabledExtensionsState, ExtensionData, ExtensionState, TaskBoardItem,
    TaskBoardItemStatus,
};
pub use query::query_session;
pub use runtime_queue::{require_shared_session_runtime_queue_service, SessionRuntimeQueueService};
pub use runtime_store::{
    delete_session_runtime_state, initialize_default_sqlite_session_runtime_store,
    initialize_session_runtime_store, load_runtime_snapshot_from_store,
    require_session_runtime_store, InMemoryThreadRuntimeStore, ItemRuntime, ItemRuntimePayload,
    ItemStatus, QueuedTurnRuntime, SessionRuntimeSnapshot, ThreadRuntime, ThreadRuntimeSnapshot,
    ThreadRuntimeStore, TurnContextOverride, TurnOutputSchemaRuntime, TurnOutputSchemaSource,
    TurnOutputSchemaStrategy, TurnRuntime, TurnStatus,
};
pub use session_manager::{
    Session, SessionInsights, SessionManager, SessionType, SessionUpdateBuilder,
};
pub use subagent::{resolve_named_subagent_child_session, SubagentSessionMetadata};
pub use team::{
    resolve_team_context, save_team_membership, save_team_state, TeamMember, TeamMembershipState,
    TeamSessionState, TEAM_LEAD_NAME,
};
pub use update::{
    apply_session_update, create_managed_session, create_subagent_session,
    persist_session_extension_data, replace_session_conversation,
};
