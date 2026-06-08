use crate::services::companion_service::{
    CompanionLaunchPetRequest, CompanionLaunchPetResult, CompanionPetCommandRequest,
    CompanionPetSendResult, CompanionPetStatus, CompanionServiceState,
};
use tauri::{AppHandle, State};

const DEPRECATED_COMPANION_COMMAND: &str =
    "Companion Tauri 命令已退场；请接入 Electron Desktop Host current 桌宠壳能力。";

fn deprecated_companion_command() -> String {
    DEPRECATED_COMPANION_COMMAND.to_string()
}

#[tauri::command]
pub async fn companion_get_pet_status(
    companion_state: State<'_, CompanionServiceState>,
) -> Result<CompanionPetStatus, String> {
    let _ = companion_state;
    Err(deprecated_companion_command())
}

#[tauri::command]
pub async fn companion_launch_pet(
    app_handle: AppHandle,
    companion_state: State<'_, CompanionServiceState>,
    request: Option<CompanionLaunchPetRequest>,
) -> Result<CompanionLaunchPetResult, String> {
    let _ = (app_handle, companion_state, request);
    Err(deprecated_companion_command())
}

#[tauri::command]
pub async fn companion_send_pet_command(
    companion_state: State<'_, CompanionServiceState>,
    request: CompanionPetCommandRequest,
) -> Result<CompanionPetSendResult, String> {
    let _ = (companion_state, request);
    Err(deprecated_companion_command())
}
