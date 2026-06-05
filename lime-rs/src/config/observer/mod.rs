//! 配置观察者模块
//!
//! 核心逻辑已迁移到 lime-config crate。
//! 本模块保留 Tauri 相关实现和必要的重新导出。

mod tauri_emitter;
mod tauri_observer;

// 从 lime-config crate 重新导出被使用的类型
pub use lime_config::observer::events::{
    ConfigChangeEvent, ConfigChangeSource, EndpointProvidersChangeEvent, RoutingChangeEvent,
};

// Tauri 相关实现
pub use tauri_emitter::TauriConfigEmitter;
