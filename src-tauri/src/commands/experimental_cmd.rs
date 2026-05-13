use crate::config::{ExperimentalFeatures, GlobalConfigManagerState};
use tauri::{command, State};

#[command]
pub async fn get_experimental_config(
    config_manager: State<'_, GlobalConfigManagerState>,
) -> Result<ExperimentalFeatures, String> {
    Ok(config_manager.config().experimental.clone())
}

#[command]
pub async fn save_experimental_config(
    config_manager: State<'_, GlobalConfigManagerState>,
    experimental_config: ExperimentalFeatures,
) -> Result<(), String> {
    let mut config = config_manager.config();
    config.experimental = experimental_config;

    config_manager
        .save_config(&config)
        .await
        .map_err(|error| format!("保存实验室配置失败: {error}"))
}
