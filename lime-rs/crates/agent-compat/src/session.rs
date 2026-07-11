//! Session 模块
//!
//! 该模块只作为 Aster reply/session 未迁完前的 staging boundary。
//! 新 session/read-model 能力必须进入 Lime current owner。

#[path = "session_bootstrap.rs"]
mod bootstrap;
#[path = "session_data.rs"]
mod extension_data;
#[path = "turn_queue.rs"]
mod runtime_queue;
#[path = "thread_runtime.rs"]
mod runtime_store;
#[path = "session_record.rs"]
mod session_record;
#[path = "session_store.rs"]
mod store;
#[path = "subagent_session.rs"]
mod subagent;
#[path = "team_session.rs"]
mod team;

// 导出存储抽象
pub use bootstrap::{
    initialize_shared_session_runtime_with_root, require_shared_session_runtime_store,
};
pub use store::{ChatHistoryMatch, SessionStore, TokenStatsUpdate};

// 导出现有功能（向后兼容）
pub use extension_data::{
    resolve_task_board_state, EnabledExtensionsState, ExtensionData, ExtensionState, TaskBoardItem,
    TaskBoardItemStatus,
};
pub use runtime_queue::{require_shared_session_runtime_queue_service, SessionRuntimeQueueService};
pub use runtime_store::{
    initialize_session_runtime_store, InMemoryThreadRuntimeStore, ItemRuntime, ItemRuntimePayload,
    ItemStatus, QueuedTurnRuntime, ThreadRuntime, ThreadRuntimeStore, TurnContextOverride,
    TurnOutputSchemaRuntime, TurnOutputSchemaSource, TurnOutputSchemaStrategy, TurnRuntime,
    TurnStatus,
};
pub use session_record::{Session, SessionType};
pub use subagent::resolve_named_subagent_child_session;
pub use team::{
    resolve_team_context, save_team_membership, save_team_state, TeamMember, TeamMembershipState,
    TeamSessionState, TEAM_LEAD_NAME,
};
