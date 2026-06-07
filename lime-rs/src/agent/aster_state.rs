//! Aster Agent 状态管理（桥接层）
//!
//! 纯逻辑已迁移到 `lime-agent` crate，
//! 本模块保留兼容导出。

pub use lime_agent::aster_state::{AsterAgentState, ProviderConfig};
pub use lime_agent::aster_state_support::{message_helpers, SessionConfigBuilder};
