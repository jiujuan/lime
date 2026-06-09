//! 内置 Tauri 命令模块
//!
//! 包含 lib.rs 中定义的所有 Tauri 命令，按功能分类。
//!
//! ## 模块结构
//! - `config` - 配置管理命令
//! - `custom_providers` - 自定义 Provider 命令 (OpenAI/Claude Custom)
//! - `api_test` - API 测试和兼容性检查命令

mod api_test;
mod config;
mod custom_providers;

// 重新导出所有命令
pub use api_test::*;
pub use config::*;
pub use custom_providers::*;
