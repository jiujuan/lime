use super::data_error;
use crate::RuntimeCoreError;
use app_server_protocol::VoiceInstruction;
use app_server_protocol::VoiceInstructionIdParams;
use app_server_protocol::VoiceInstructionListResponse;
use app_server_protocol::VoiceInstructionMutationResponse;
use app_server_protocol::VoiceInstructionSaveParams;
use lime_core::config::VoiceInstruction as CoreVoiceInstruction;
use lime_services::voice_config_service;

pub(crate) fn list_voice_instructions() -> Result<VoiceInstructionListResponse, RuntimeCoreError> {
    let instructions = voice_config_service::get_instructions()
        .map_err(data_error)?
        .into_iter()
        .map(protocol_voice_instruction_from_core)
        .collect();
    Ok(VoiceInstructionListResponse { instructions })
}

pub(crate) fn save_voice_instruction(
    params: VoiceInstructionSaveParams,
) -> Result<VoiceInstructionMutationResponse, RuntimeCoreError> {
    voice_config_service::save_voice_instruction(core_voice_instruction_from_protocol(
        params.instruction,
    ))
    .map_err(data_error)?;
    Ok(VoiceInstructionMutationResponse {})
}

pub(crate) fn delete_voice_instruction(
    params: VoiceInstructionIdParams,
) -> Result<VoiceInstructionMutationResponse, RuntimeCoreError> {
    voice_config_service::delete_voice_instruction(&params.id).map_err(data_error)?;
    Ok(VoiceInstructionMutationResponse {})
}

fn protocol_voice_instruction_from_core(instruction: CoreVoiceInstruction) -> VoiceInstruction {
    VoiceInstruction {
        id: instruction.id,
        name: instruction.name,
        description: instruction.description,
        prompt: instruction.prompt,
        shortcut: instruction.shortcut,
        is_preset: instruction.is_preset,
        icon: instruction.icon,
    }
}

fn core_voice_instruction_from_protocol(instruction: VoiceInstruction) -> CoreVoiceInstruction {
    CoreVoiceInstruction {
        id: instruction.id,
        name: instruction.name,
        description: instruction.description,
        prompt: instruction.prompt,
        shortcut: instruction.shortcut,
        is_preset: instruction.is_preset,
        icon: instruction.icon,
    }
}
