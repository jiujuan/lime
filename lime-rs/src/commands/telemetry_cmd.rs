//! 遥测命令模块
//!
//! `TelemetryState` 仍是 server diagnostics、gateway 启动和 media task current 运行期的共享状态。
//! 旧 request log / stats / token stats Tauri 命令已从前端生产面和默认 mock 中退场，只保留
//! fail-closed wrapper，防止继续暴露第二套遥测读取面。

use crate::telemetry::{
    ModelStats, ModelTokenStats, PeriodTokenStats, ProviderStats, ProviderTokenStats, RequestLog,
    RequestLogger, StatsAggregator, StatsSummary, TokenStatsSummary, TokenTracker,
};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

const DEPRECATED_TELEMETRY_COMMAND_MESSAGE: &str =
    "Telemetry Tauri 命令已退场；请使用 App Server current 统计 / 诊断主链";

fn deprecated_telemetry_command_error(command: &str) -> String {
    tracing::warn!("[Telemetry] legacy Tauri command `{}` 已退场", command);
    format!("{command} 已退场；{DEPRECATED_TELEMETRY_COMMAND_MESSAGE}")
}

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
    /// 这允许 TelemetryState 与 RequestProcessor 共享同一个 StatsAggregator、TokenTracker 和 RequestLogger，
    /// 使得请求处理过程中记录的统计数据能够在前端监控页面中显示。
    pub fn with_shared(
        stats: Arc<RwLock<StatsAggregator>>,
        tokens: Arc<RwLock<TokenTracker>>,
        logger: Option<Arc<RequestLogger>>,
    ) -> Result<Self, String> {
        let logger = match logger {
            Some(l) => l,
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

// ========== 请求日志命令 ==========

/// 获取请求日志列表。
///
/// 这里只返回原始 `RequestLog` 浏览结果，便于排查 provider / model / status / token 等底层事实；
/// 不应把它当成 session / thread current 状态的唯一读取入口。
#[tauri::command]
pub async fn get_request_logs(
    _state: tauri::State<'_, TelemetryState>,
    _provider: Option<String>,
    _model: Option<String>,
    _status: Option<String>,
    _limit: Option<usize>,
) -> Result<Vec<RequestLog>, String> {
    Err(deprecated_telemetry_command_error("get_request_logs"))
}

/// 获取单个请求日志详情。
///
/// 该命令只返回单条原始 request 记录，不承担 thread read、incident 或 evidence 事实源职责。
#[tauri::command]
pub async fn get_request_log_detail(
    _state: tauri::State<'_, TelemetryState>,
    _id: String,
) -> Result<Option<RequestLog>, String> {
    Err(deprecated_telemetry_command_error("get_request_log_detail"))
}

/// 清空请求日志。
///
/// 这只影响原始 request log 浏览面，不应被解释为会话、线程或 evidence 历史被删除。
#[tauri::command]
pub async fn clear_request_logs(_state: tauri::State<'_, TelemetryState>) -> Result<(), String> {
    Err(deprecated_telemetry_command_error("clear_request_logs"))
}

// ========== 统计命令 ==========

/// 时间范围参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeRangeParam {
    /// 开始时间 (ISO 8601 格式)
    pub start: Option<String>,
    /// 结束时间 (ISO 8601 格式)
    pub end: Option<String>,
    /// 或者使用预设范围: "1h", "24h", "7d", "30d"
    pub preset: Option<String>,
}

/// 获取统计摘要
#[tauri::command]
pub async fn get_stats_summary(
    _state: tauri::State<'_, TelemetryState>,
    _time_range: Option<TimeRangeParam>,
) -> Result<StatsSummary, String> {
    Err(deprecated_telemetry_command_error("get_stats_summary"))
}

/// 按 Provider 分组统计
#[tauri::command]
pub async fn get_stats_by_provider(
    _state: tauri::State<'_, TelemetryState>,
    _time_range: Option<TimeRangeParam>,
) -> Result<HashMap<String, ProviderStats>, String> {
    Err(deprecated_telemetry_command_error("get_stats_by_provider"))
}

/// 按模型分组统计
#[tauri::command]
pub async fn get_stats_by_model(
    _state: tauri::State<'_, TelemetryState>,
    _time_range: Option<TimeRangeParam>,
) -> Result<HashMap<String, ModelStats>, String> {
    Err(deprecated_telemetry_command_error("get_stats_by_model"))
}

// ========== Token 统计命令 ==========

/// 获取 Token 统计摘要
#[tauri::command]
pub async fn get_token_summary(
    _state: tauri::State<'_, TelemetryState>,
    _time_range: Option<TimeRangeParam>,
) -> Result<TokenStatsSummary, String> {
    Err(deprecated_telemetry_command_error("get_token_summary"))
}

/// 按 Provider 分组 Token 统计
#[tauri::command]
pub async fn get_token_stats_by_provider(
    _state: tauri::State<'_, TelemetryState>,
    _time_range: Option<TimeRangeParam>,
) -> Result<HashMap<String, ProviderTokenStats>, String> {
    Err(deprecated_telemetry_command_error(
        "get_token_stats_by_provider",
    ))
}

/// 按模型分组 Token 统计
#[tauri::command]
pub async fn get_token_stats_by_model(
    _state: tauri::State<'_, TelemetryState>,
    _time_range: Option<TimeRangeParam>,
) -> Result<HashMap<String, ModelTokenStats>, String> {
    Err(deprecated_telemetry_command_error(
        "get_token_stats_by_model",
    ))
}

/// 按天汇总 Token 统计
#[tauri::command]
pub async fn get_token_stats_by_day(
    _state: tauri::State<'_, TelemetryState>,
    _days: Option<i64>,
) -> Result<Vec<PeriodTokenStats>, String> {
    Err(deprecated_telemetry_command_error("get_token_stats_by_day"))
}
