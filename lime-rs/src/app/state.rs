//! 状态初始化模块
//!
//! 包含应用状态的初始化逻辑。

use std::sync::Arc;
use tokio::sync::RwLock;

use crate::commands::api_key_provider_cmd::ApiKeyProviderServiceState;
use crate::commands::context_memory::ContextMemoryServiceState;
use crate::commands::machine_id_cmd::MachineIdState;
use crate::commands::skill_cmd::SkillServiceState;
use crate::config::{GlobalConfigManager, GlobalConfigManagerState};
use crate::telemetry;
use lime_core::config::{self, Config, ConfigManager};
use lime_services::api_key_provider_service::ApiKeyProviderService;
use lime_services::context_memory_service::{ContextMemoryConfig, ContextMemoryService};
use lime_services::skill_service::SkillService;

use super::types::{AppState, LogState};
use crate::logger;
use lime_server as server;

/// 初始化核心应用状态
pub fn init_core_state(config: Config) -> (AppState, LogState) {
    let state: AppState = Arc::new(RwLock::new(server::ServerState::new(config.clone())));
    let logs: LogState = Arc::new(RwLock::new(logger::create_log_store_from_config(
        &config.logging,
    )));
    (state, logs)
}

/// 初始化全局配置管理器
pub fn init_global_config_manager(config: &Config) -> GlobalConfigManagerState {
    let config_path = ConfigManager::default_config_path();
    let manager = GlobalConfigManager::new(config.clone(), config_path);
    GlobalConfigManagerState::new(manager)
}

/// 初始化服务状态
pub struct ServiceStates {
    pub skill_service: SkillServiceState,
    pub api_key_provider_service: ApiKeyProviderServiceState,
    pub machine_id_service: MachineIdState,
    pub context_memory_service: ContextMemoryServiceState,
}

/// 初始化所有服务状态
pub fn init_service_states() -> ServiceStates {
    // Initialize SkillService
    let skill_service = SkillService::new().expect("Failed to initialize SkillService");
    let skill_service_state = SkillServiceState(Arc::new(skill_service));

    // Initialize ApiKeyProviderService
    let api_key_provider_service = ApiKeyProviderService::new();
    let api_key_provider_service_state =
        ApiKeyProviderServiceState(Arc::new(api_key_provider_service));

    // Initialize MachineIdService
    let machine_id_service = lime_services::machine_id_service::MachineIdService::new()
        .expect("Failed to initialize MachineIdService");
    let machine_id_service_state: MachineIdState = Arc::new(RwLock::new(machine_id_service));

    // Initialize ContextMemoryService
    let app_config = config::load_config().unwrap_or_default();
    let context_memory_config = build_context_memory_config(&app_config);
    let context_memory_service = ContextMemoryService::new(context_memory_config)
        .expect("Failed to initialize ContextMemoryService");
    let context_memory_service_state = ContextMemoryServiceState(Arc::new(context_memory_service));

    ServiceStates {
        skill_service: skill_service_state,
        api_key_provider_service: api_key_provider_service_state,
        machine_id_service: machine_id_service_state,
        context_memory_service: context_memory_service_state,
    }
}

fn build_context_memory_config(config: &Config) -> ContextMemoryConfig {
    let mut context_config = ContextMemoryConfig::default();
    let memory_config = &config.memory;

    if let Some(max_entries) = memory_config.max_entries {
        context_config.max_entries_per_session = max_entries.clamp(1, 20_000) as usize;
    }

    if let Some(retention_days) = memory_config.retention_days {
        context_config.auto_archive_days = retention_days.clamp(1, 3650);
    }

    if let Some(auto_cleanup) = memory_config.auto_cleanup {
        context_config.auto_cleanup_enabled = auto_cleanup;
    }

    context_config
}

/// 遥测状态
pub struct TelemetryStates {
    pub stats: Arc<parking_lot::RwLock<telemetry::StatsAggregator>>,
    pub tokens: Arc<parking_lot::RwLock<telemetry::TokenTracker>>,
    pub logger: Arc<telemetry::RequestLogger>,
    pub telemetry_state: crate::commands::telemetry_cmd::TelemetryState,
}

/// 初始化遥测状态
pub fn init_telemetry_states(config: &Config) -> TelemetryStates {
    let shared_stats = Arc::new(parking_lot::RwLock::new(
        telemetry::StatsAggregator::with_defaults(),
    ));
    let shared_tokens = Arc::new(parking_lot::RwLock::new(
        telemetry::TokenTracker::with_defaults(),
    ));
    let log_rotation = telemetry::LogRotationConfig {
        max_memory_logs: 10000,
        retention_days: config.logging.retention_days,
        max_file_size: 10 * 1024 * 1024,
        enable_file_logging: config.logging.enabled,
    };
    let shared_logger = Arc::new(
        telemetry::RequestLogger::new(log_rotation).expect("Failed to create RequestLogger"),
    );

    let telemetry_state = crate::commands::telemetry_cmd::TelemetryState::with_shared(
        shared_stats.clone(),
        shared_tokens.clone(),
        Some(shared_logger.clone()),
    )
    .expect("Failed to create TelemetryState");

    TelemetryStates {
        stats: shared_stats,
        tokens: shared_tokens,
        logger: shared_logger,
        telemetry_state,
    }
}
