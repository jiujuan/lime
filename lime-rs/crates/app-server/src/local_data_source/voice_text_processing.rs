use super::data_error;
use crate::RuntimeCoreError;
use app_server_protocol::{
    VoiceTranscriptionPolishTextParams, VoiceTranscriptionPolishTextResponse,
};
use lime_services::{voice_config_service, voice_processor_service};

pub(crate) async fn polish_voice_text(
    params: VoiceTranscriptionPolishTextParams,
) -> Result<VoiceTranscriptionPolishTextResponse, RuntimeCoreError> {
    let text = params.text.trim();
    let voice_config = voice_config_service::load_voice_config().map_err(data_error)?;
    let instruction_id = params
        .instruction_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&voice_config.processor.default_instruction_id);
    let instruction = voice_config
        .instructions
        .iter()
        .find(|item| item.id == instruction_id)
        .ok_or_else(|| data_error(format!("语音润色指令不存在: {instruction_id}")))?;

    if text.is_empty() || instruction.id == "raw" || !voice_config.processor.polish_enabled {
        return Ok(VoiceTranscriptionPolishTextResponse {
            text: text.to_string(),
            instruction_name: instruction.name.clone(),
            polished: false,
        });
    }

    let polished_text = voice_processor_service::polish_text(
        text,
        instruction,
        voice_config.processor.polish_provider.as_deref(),
        voice_config.processor.polish_model.as_deref(),
    )
    .await
    .map_err(data_error)?;

    Ok(VoiceTranscriptionPolishTextResponse {
        text: polished_text,
        instruction_name: instruction.name.clone(),
        polished: true,
    })
}
