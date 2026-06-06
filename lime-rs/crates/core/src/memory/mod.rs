//! Memory 模块
//!
//! 提供项目记忆系统管理功能（角色、世界观、大纲）。

pub mod manager;
pub mod types;

use crate::database::DbConnection;

pub use manager::MemoryManager;
pub use types::*;

pub fn read_project_memory(db: DbConnection, project_id: &str) -> Result<ProjectMemory, String> {
    MemoryManager::new(db).get_project_memory(project_id)
}
