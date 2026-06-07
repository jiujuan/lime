use crate::services::companion_service::{
    self, CompanionLaunchPetRequest, CompanionLaunchPetResult, CompanionPetCommandRequest,
    CompanionPetSendResult, CompanionPetStatus, CompanionServiceState,
};
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn companion_get_pet_status(
    companion_state: State<'_, CompanionServiceState>,
) -> Result<CompanionPetStatus, String> {
    companion_service::get_pet_status_global(companion_state.inner()).await
}

#[tauri::command]
pub async fn companion_launch_pet(
    app_handle: AppHandle,
    companion_state: State<'_, CompanionServiceState>,
    request: Option<CompanionLaunchPetRequest>,
) -> Result<CompanionLaunchPetResult, String> {
    companion_service::launch_pet_global(
        companion_state.inner(),
        app_handle,
        request.unwrap_or_default(),
    )
    .await
}

#[tauri::command]
pub async fn companion_send_pet_command(
    companion_state: State<'_, CompanionServiceState>,
    request: CompanionPetCommandRequest,
) -> Result<CompanionPetSendResult, String> {
    companion_service::send_pet_command_global(companion_state.inner(), request).await
}
