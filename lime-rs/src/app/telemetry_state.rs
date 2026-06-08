//! 遥测运行期共享状态。
//!
//! 该状态供 server diagnostics、gateway 启动和 media task current 链路共享，
//! 不再放在旧 Tauri command wrapper 目录里。

use crate::telemetry::{RequestLogger, StatsAggregator, TokenTracker};
use parking_lot::RwLock;
use std::sync::Arc;

/// 遥测服务状态
///
/// 支持两种模式：
/// 1. 独立模式：使用自己的 StatsAggregator 和 TokenTracker 实例
/// 2. 共享模式：使用外部传入的共享实例（与 RequestProcessor 共享）
pub struct TelemetryState {
    pub logger: Arc<RequestLogger>,
    /// 统计聚合器（使用 RwLock 以支持与 RequestProcessor 共享）
    pub stats: Arc<RwLock<StatsAggregator>>,
    /// Token 追踪器（使用 RwLock 以支持与 RequestProcessor 共享）
    pub tokens: Arc<RwLock<TokenTracker>>,
}

impl TelemetryState {
    /// 创建独立的遥测状态（使用自己的实例）
    pub fn new() -> Result<Self, String> {
        let logger =
            RequestLogger::with_defaults().map_err(|e| format!("Failed to create logger: {e}"))?;

        Ok(Self {
            logger: Arc::new(logger),
            stats: Arc::new(RwLock::new(StatsAggregator::with_defaults())),
            tokens: Arc::new(RwLock::new(TokenTracker::with_defaults())),
        })
    }

    /// 创建共享的遥测状态（使用外部传入的实例）
    ///
    /// 这允许 TelemetryState 与 RequestProcessor 共享同一个 StatsAggregator、TokenTracker 和 RequestLogger。
    pub fn with_shared(
        stats: Arc<RwLock<StatsAggregator>>,
        tokens: Arc<RwLock<TokenTracker>>,
        logger: Option<Arc<RequestLogger>>,
    ) -> Result<Self, String> {
        let logger = match logger {
            Some(logger) => logger,
            None => Arc::new(
                RequestLogger::with_defaults()
                    .map_err(|e| format!("Failed to create logger: {e}"))?,
            ),
        };

        Ok(Self {
            logger,
            stats,
            tokens,
        })
    }
}

impl Default for TelemetryState {
    fn default() -> Self {
        Self::new().expect("Failed to create TelemetryState")
    }
}
