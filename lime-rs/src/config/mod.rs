//! 配置管理模块
//!
//! 核心配置类型、YAML 支持、热重载和导入导出功能已迁移到 lime-core crate。
//! 本模块保留 observer（依赖 Tauri）和集成测试。

// observer 模块保留在主 crate（依赖 Tauri）
pub mod observer;

// 兼容导出：配置核心能力已迁移到 lime-core crate
pub use lime_core::config::*;

// 重新导出观察者模块的核心类型
pub use lime_config::observer::manager::GlobalConfigManager;
pub use lime_config::GlobalConfigManagerState;
pub use observer::ConfigChangeSource;

#[cfg(test)]
mod tests;
