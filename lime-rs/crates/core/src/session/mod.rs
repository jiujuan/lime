//! 会话管理核心模块
//!
//! 提供以下功能：
//! - 增强的限流处理（Duration 解析、指数退避）
//! - 会话粘性管理（会话与账号映射）
//! - 调度模式配置

pub mod rate_limit;
pub mod sticky_config;
pub mod sticky_manager;

pub use rate_limit::{
    extract_retry_delay, parse_duration_string, RateLimitReason, RateLimitRecord, RateLimitTracker,
};
pub use sticky_config::{SchedulingMode, StickySessionConfig};
pub use sticky_manager::{AccountInfo, StickySessionManager};
