//! 数据库迁移脚本
//!
//! 包含所有数据库表结构的定义和版本管理

pub mod v1_unified_memory;

// 导出迁移脚本，供外部使用
pub use v1_unified_memory::SQL_SCHEMA;
