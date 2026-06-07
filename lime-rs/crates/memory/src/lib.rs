//! Lime 统一记忆模块
//!
//! 提供统一的记忆存储、检索和管理功能，支持：
//! - 对话历史自动提取的记忆
//! - 项目相关的角色、世界观等记忆
//! - 统一的数据模型和存储接口

pub mod extractor;
pub mod feedback;
pub mod gatekeeper;
pub mod migrations;
pub mod models;
pub mod search;
// pub mod migration; // TEMP: Disabled until compilation errors are fixed
pub use models::unified::{
    MemoryCategory, MemoryMetadata, MemorySource, MemoryType, UnifiedMemory,
};
