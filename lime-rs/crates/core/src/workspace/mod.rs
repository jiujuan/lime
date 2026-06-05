//! Workspace 管理模块
//!
//! Workspace 是 Lime 应用层的概念，用于组织和管理 AI Agent 的工作上下文。
//! 它是对 Aster 框架 `Session.working_dir` 的命名和配置包装。
//!
//! ## 核心功能
//! - Workspace CRUD 操作
//! - 与 Aster Session 通过 working_dir 关联
//! - Workspace 级别的配置管理
//!
//! ## 设计原则
//! - 读共享，写隔离
//! - 最小有效 context
//! - Workspace = 边界（文件系统 + context + 配置）

mod manager;
mod types;

pub use manager::WorkspaceManager;
pub use types::{Workspace, WorkspaceId, WorkspaceSettings, WorkspaceType, WorkspaceUpdate};
