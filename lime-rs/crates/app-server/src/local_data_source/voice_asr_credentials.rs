use super::data_error;
use crate::RuntimeCoreError;
use app_server_protocol::VoiceAsrBaiduConfig;
use app_server_protocol::VoiceAsrCredential;
use app_server_protocol::VoiceAsrCredentialCreateParams;
use app_server_protocol::VoiceAsrCredentialIdParams;
use app_server_protocol::VoiceAsrCredentialListResponse;
use app_server_protocol::VoiceAsrCredentialMutationResponse;
use app_server_protocol::VoiceAsrCredentialTestResponse;
use app_server_protocol::VoiceAsrCredentialUpdateParams;
use app_server_protocol::VoiceAsrCredentialWriteResponse;
use app_server_protocol::VoiceAsrOpenAiConfig;
use app_server_protocol::VoiceAsrProviderType;
use app_server_protocol::VoiceAsrSenseVoiceLocalConfig;
use app_server_protocol::VoiceAsrWhisperLocalConfig;
use app_server_protocol::VoiceAsrWhisperModelSize;
use app_server_protocol::VoiceAsrXunfeiConfig;
use app_server_protocol::VoiceModelDefaultSetParams;
use app_server_protocol::VoiceModelDefaultSetResponse;
use app_server_protocol::VoiceModelTestTranscribeFileParams;
use app_server_protocol::VoiceModelTestTranscribeFileResponse;
use app_server_protocol::VoiceTranscriptionTranscribeAudioParams;
use app_server_protocol::VoiceTranscriptionTranscribeAudioResponse;
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use lime_core::config::AsrCredentialEntry as CoreAsrCredentialEntry;
use lime_core::config::AsrProviderType as CoreAsrProviderType;
use lime_core::config::BaiduConfig as CoreBaiduConfig;
use lime_core::config::OpenAIAsrConfig as CoreOpenAIAsrConfig;
use lime_core::config::SenseVoiceLocalConfig as CoreSenseVoiceLocalConfig;
use lime_core::config::WhisperLocalConfig as CoreWhisperLocalConfig;
use lime_core::config::WhisperModelSize as CoreWhisperModelSize;
use lime_core::config::XunfeiConfig as CoreXunfeiConfig;
use lime_services::voice_asr_service::AsrService;
use lime_services::voice_config_service;
use std::fs;
use std::path::Path;

const SENSEVOICE_MODEL_ID: &str = "sensevoice-small-int8-2024-07-17";
const SILERO_VAD_MODEL_ID: &str = "silero-vad-onnx";
const SENSEVOICE_MODEL_FILE: &str = "model.int8.onnx";
const SENSEVOICE_TOKENS_FILE: &str = "tokens.txt";
const SENSEVOICE_VAD_FILE: &str = "silero_vad.onnx";

pub(crate) fn list_voice_asr_credentials(
) -> Result<VoiceAsrCredentialListResponse, RuntimeCoreError> {
    let credentials = voice_config_service::list_asr_credentials()
        .map_err(data_error)?
        .into_iter()
        .map(protocol_voice_asr_credential_from_core)
        .collect();
    Ok(VoiceAsrCredentialListResponse { credentials })
}

pub(crate) fn create_voice_asr_credential(
    params: VoiceAsrCredentialCreateParams,
) -> Result<VoiceAsrCredentialWriteResponse, RuntimeCoreError> {
    let credential = voice_config_service::add_asr_credential(
        core_voice_asr_credential_create_params_from_protocol(params),
    )
    .map_err(data_error)?;
    Ok(VoiceAsrCredentialWriteResponse {
        credential: protocol_voice_asr_credential_from_core(credential),
    })
}

pub(crate) fn update_voice_asr_credential(
    params: VoiceAsrCredentialUpdateParams,
) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
    voice_config_service::update_asr_credential(core_voice_asr_credential_from_protocol(
        params.credential,
    ))
    .map_err(data_error)?;
    Ok(VoiceAsrCredentialMutationResponse {})
}

pub(crate) fn delete_voice_asr_credential(
    params: VoiceAsrCredentialIdParams,
) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
    voice_config_service::delete_asr_credential(&params.id).map_err(data_error)?;
    Ok(VoiceAsrCredentialMutationResponse {})
}

pub(crate) fn set_default_voice_asr_credential(
    params: VoiceAsrCredentialIdParams,
) -> Result<VoiceAsrCredentialMutationResponse, RuntimeCoreError> {
    voice_config_service::set_default_asr_credential(&params.id).map_err(data_error)?;
    Ok(VoiceAsrCredentialMutationResponse {})
}

pub(crate) fn test_voice_asr_credential(
    params: VoiceAsrCredentialIdParams,
) -> Result<VoiceAsrCredentialTestResponse, RuntimeCoreError> {
    let result = voice_config_service::test_asr_credential(&params.id).map_err(data_error)?;
    Ok(VoiceAsrCredentialTestResponse {
        success: result.success,
        message: result.message,
    })
}

pub(crate) fn set_default_voice_model(
    params: VoiceModelDefaultSetParams,
) -> Result<VoiceModelDefaultSetResponse, RuntimeCoreError> {
    if params.model_id != SENSEVOICE_MODEL_ID {
        return Err(data_error(format!("不支持的语音模型: {}", params.model_id)));
    }
    let install_dir = validate_voice_model_install_dir(&params.install_dir)?;
    let missing_files = required_sensevoice_files(install_dir);
    if !missing_files.is_empty() {
        return Err(data_error(format!(
            "SenseVoice Small 尚未安装，缺失文件: {}",
            missing_files.join(", ")
        )));
    }

    let credential = voice_config_service::upsert_sensevoice_local_default(
        &params.model_id,
        &install_dir.to_string_lossy(),
        SILERO_VAD_MODEL_ID,
    )
    .map_err(data_error)?;
    Ok(VoiceModelDefaultSetResponse {
        credential: protocol_voice_asr_credential_from_core(credential),
    })
}

pub(crate) async fn test_transcribe_voice_model_file(
    params: VoiceModelTestTranscribeFileParams,
) -> Result<VoiceModelTestTranscribeFileResponse, RuntimeCoreError> {
    if params.model_id != SENSEVOICE_MODEL_ID {
        return Err(data_error(format!("不支持的语音模型: {}", params.model_id)));
    }

    let file_path = params.file_path.trim();
    if file_path.is_empty() {
        return Err(data_error("请提供本机 WAV 文件路径"));
    }

    let install_dir_path = validate_voice_model_install_dir(&params.install_dir)?;
    let missing_files = required_sensevoice_files(install_dir_path);
    if !missing_files.is_empty() {
        return Err(data_error(format!(
            "请先在设置 -> 语音模型中下载 SenseVoice Small；缺失文件: {}",
            missing_files.join(", ")
        )));
    }

    let audio = read_pcm16_wav(Path::new(file_path)).map_err(data_error)?;
    let credential = CoreAsrCredentialEntry {
        id: format!("sensevoice-local-test-{}", params.model_id),
        provider: CoreAsrProviderType::SenseVoiceLocal,
        name: Some("SenseVoice Small 本地测试".to_string()),
        is_default: false,
        disabled: false,
        language: "auto".to_string(),
        whisper_config: None,
        sensevoice_config: Some(CoreSenseVoiceLocalConfig {
            model_id: params.model_id,
            model_dir: Some(install_dir_path.to_string_lossy().to_string()),
            use_itn: true,
            num_threads: 4,
            vad_model_id: Some(SILERO_VAD_MODEL_ID.to_string()),
        }),
        xunfei_config: None,
        baidu_config: None,
        openai_config: None,
    };
    let text = AsrService::transcribe(&credential, &audio.pcm16le, audio.sample_rate)
        .await
        .map_err(data_error)?;

    Ok(VoiceModelTestTranscribeFileResponse {
        text,
        duration_secs: audio.duration_secs,
        sample_rate: audio.sample_rate,
        language: Some("auto".to_string()),
    })
}

pub(crate) async fn transcribe_voice_audio(
    params: VoiceTranscriptionTranscribeAudioParams,
) -> Result<VoiceTranscriptionTranscribeAudioResponse, RuntimeCoreError> {
    let mime_type = params.mime_type.trim();
    if !is_supported_voice_transcription_mime(mime_type) {
        return Err(data_error(format!(
            "当前录音转写仅支持 16-bit PCM WAV，收到的音频类型为: {}",
            if mime_type.is_empty() {
                "空"
            } else {
                mime_type
            }
        )));
    }

    let audio_bytes = BASE64_STANDARD
        .decode(params.audio_base64.trim())
        .map_err(|error| data_error(format!("解析录音音频失败: {error}")))?;
    if audio_bytes.is_empty() {
        return Err(data_error("录音音频为空，请确认麦克风权限和输入设备"));
    }

    let audio = parse_pcm16_wav_bytes(&audio_bytes).map_err(data_error)?;
    let credential = resolve_voice_transcription_credential(params.credential_id.as_deref())?;
    let text = AsrService::transcribe(&credential, &audio.pcm16le, audio.sample_rate)
        .await
        .map_err(data_error)?;

    Ok(VoiceTranscriptionTranscribeAudioResponse {
        text,
        duration_secs: audio.duration_secs,
        sample_rate: audio.sample_rate,
        language: Some(credential.language.clone()),
        provider: protocol_voice_asr_provider_from_core(credential.provider),
    })
}

fn is_supported_voice_transcription_mime(mime_type: &str) -> bool {
    let normalized = mime_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    matches!(
        normalized.as_str(),
        "audio/wav" | "audio/wave" | "audio/x-wav" | "audio/vnd.wave"
    )
}

fn resolve_voice_transcription_credential(
    credential_id: Option<&str>,
) -> Result<CoreAsrCredentialEntry, RuntimeCoreError> {
    if let Some(id) = credential_id.map(str::trim).filter(|id| !id.is_empty()) {
        let credential = voice_config_service::get_asr_credential(id)
            .map_err(data_error)?
            .ok_or_else(|| data_error(format!("ASR 凭证不存在: {id}")))?;
        if credential.disabled {
            return Err(data_error(format!("ASR 凭证已禁用: {id}")));
        }
        return Ok(credential);
    }

    voice_config_service::get_default_asr_credential()
        .map_err(data_error)?
        .ok_or_else(|| {
            data_error("未配置默认语音识别服务，请先在设置 > Agent > 语音中添加并启用 ASR 凭证")
        })
}

fn required_sensevoice_files(install_dir: &Path) -> Vec<String> {
    [
        SENSEVOICE_MODEL_FILE,
        SENSEVOICE_TOKENS_FILE,
        SENSEVOICE_VAD_FILE,
    ]
    .into_iter()
    .filter(|file| !install_dir.join(file).is_file())
    .map(ToString::to_string)
    .collect()
}

fn validate_voice_model_install_dir(install_dir: &str) -> Result<&Path, RuntimeCoreError> {
    let install_dir = Path::new(install_dir.trim());
    if !install_dir.is_absolute() {
        return Err(data_error("语音模型安装目录必须是绝对路径"));
    }
    Ok(install_dir)
}

#[derive(Debug)]
struct PcmWavAudio {
    pcm16le: Vec<u8>,
    sample_rate: u32,
    duration_secs: f32,
}

#[derive(Debug, Clone, Copy)]
struct WavFormat {
    audio_format: u16,
    channels: u16,
    sample_rate: u32,
    bits_per_sample: u16,
}

fn read_pcm16_wav(path: &Path) -> Result<PcmWavAudio, String> {
    if path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| !extension.eq_ignore_ascii_case("wav"))
        .unwrap_or(true)
    {
        return Err("当前测试转写仅支持 .wav 文件".to_string());
    }

    let bytes =
        fs::read(path).map_err(|error| format!("读取 WAV 文件失败 {}: {error}", path.display()))?;
    parse_pcm16_wav_bytes(&bytes)
}

fn parse_pcm16_wav_bytes(bytes: &[u8]) -> Result<PcmWavAudio, String> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("不是有效的 RIFF/WAVE 文件".to_string());
    }

    let mut offset = 12_usize;
    let mut wav_format = None;
    let mut data_chunk = None;

    while offset + 8 <= bytes.len() {
        let chunk_id = &bytes[offset..offset + 4];
        let chunk_size = u32::from_le_bytes([
            bytes[offset + 4],
            bytes[offset + 5],
            bytes[offset + 6],
            bytes[offset + 7],
        ]) as usize;
        let chunk_start = offset + 8;
        let chunk_end = chunk_start
            .checked_add(chunk_size)
            .ok_or_else(|| "WAV chunk 长度溢出".to_string())?;
        if chunk_end > bytes.len() {
            return Err("WAV chunk 长度异常".to_string());
        }

        match chunk_id {
            b"fmt " => {
                if chunk_size < 16 {
                    return Err("WAV fmt chunk 不完整".to_string());
                }
                wav_format = Some(WavFormat {
                    audio_format: read_le_u16(bytes, chunk_start)?,
                    channels: read_le_u16(bytes, chunk_start + 2)?,
                    sample_rate: read_le_u32(bytes, chunk_start + 4)?,
                    bits_per_sample: read_le_u16(bytes, chunk_start + 14)?,
                });
            }
            b"data" => {
                data_chunk = Some(&bytes[chunk_start..chunk_end]);
            }
            _ => {}
        }

        offset = chunk_end + (chunk_size % 2);
    }

    let wav_format = wav_format.ok_or_else(|| "WAV 文件缺少 fmt chunk".to_string())?;
    if wav_format.audio_format != 1 {
        return Err("当前测试转写仅支持 16-bit PCM WAV（audio_format=1）".to_string());
    }
    if wav_format.channels == 0 {
        return Err("WAV 声道数无效".to_string());
    }
    if wav_format.sample_rate == 0 {
        return Err("WAV 采样率无效".to_string());
    }
    if wav_format.bits_per_sample != 16 {
        return Err("当前测试转写仅支持 16-bit PCM WAV".to_string());
    }

    let data = data_chunk.ok_or_else(|| "WAV 文件缺少 data chunk".to_string())?;
    let frame_bytes = usize::from(wav_format.channels) * 2;
    if frame_bytes == 0 || data.len() < frame_bytes {
        return Err("WAV 音频数据为空".to_string());
    }

    let frame_count = data.len() / frame_bytes;
    let mut pcm16le = Vec::with_capacity(frame_count * 2);
    for frame_index in 0..frame_count {
        let sample_offset = frame_index * frame_bytes;
        pcm16le.extend_from_slice(&data[sample_offset..sample_offset + 2]);
    }

    Ok(PcmWavAudio {
        pcm16le,
        sample_rate: wav_format.sample_rate,
        duration_secs: frame_count as f32 / wav_format.sample_rate as f32,
    })
}

fn read_le_u16(bytes: &[u8], offset: usize) -> Result<u16, String> {
    let slice = bytes
        .get(offset..offset + 2)
        .ok_or_else(|| "WAV 字段长度异常".to_string())?;
    Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

fn read_le_u32(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| "WAV 字段长度异常".to_string())?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}

fn protocol_voice_asr_credential_from_core(
    credential: CoreAsrCredentialEntry,
) -> VoiceAsrCredential {
    VoiceAsrCredential {
        id: credential.id,
        provider: protocol_voice_asr_provider_from_core(credential.provider),
        name: credential.name,
        is_default: credential.is_default,
        disabled: credential.disabled,
        language: credential.language,
        whisper_config: credential
            .whisper_config
            .map(protocol_voice_asr_whisper_config_from_core),
        sensevoice_config: credential
            .sensevoice_config
            .map(protocol_voice_asr_sensevoice_config_from_core),
        xunfei_config: credential
            .xunfei_config
            .map(protocol_voice_asr_xunfei_config_from_core),
        baidu_config: credential
            .baidu_config
            .map(protocol_voice_asr_baidu_config_from_core),
        openai_config: credential
            .openai_config
            .map(protocol_voice_asr_openai_config_from_core),
    }
}

fn core_voice_asr_credential_from_protocol(
    credential: VoiceAsrCredential,
) -> CoreAsrCredentialEntry {
    CoreAsrCredentialEntry {
        id: credential.id,
        provider: core_voice_asr_provider_from_protocol(credential.provider),
        name: credential.name,
        is_default: credential.is_default,
        disabled: credential.disabled,
        language: credential.language,
        whisper_config: credential
            .whisper_config
            .map(core_voice_asr_whisper_config_from_protocol),
        sensevoice_config: credential
            .sensevoice_config
            .map(core_voice_asr_sensevoice_config_from_protocol),
        xunfei_config: credential
            .xunfei_config
            .map(core_voice_asr_xunfei_config_from_protocol),
        baidu_config: credential
            .baidu_config
            .map(core_voice_asr_baidu_config_from_protocol),
        openai_config: credential
            .openai_config
            .map(core_voice_asr_openai_config_from_protocol),
    }
}

fn core_voice_asr_credential_create_params_from_protocol(
    params: VoiceAsrCredentialCreateParams,
) -> voice_config_service::AddAsrCredentialRequest {
    voice_config_service::AddAsrCredentialRequest {
        provider: core_voice_asr_provider_from_protocol(params.provider),
        name: params.name,
        is_default: params.is_default,
        disabled: params.disabled,
        language: params.language,
        whisper_config: params
            .whisper_config
            .map(core_voice_asr_whisper_config_from_protocol),
        sensevoice_config: params
            .sensevoice_config
            .map(core_voice_asr_sensevoice_config_from_protocol),
        xunfei_config: params
            .xunfei_config
            .map(core_voice_asr_xunfei_config_from_protocol),
        baidu_config: params
            .baidu_config
            .map(core_voice_asr_baidu_config_from_protocol),
        openai_config: params
            .openai_config
            .map(core_voice_asr_openai_config_from_protocol),
    }
}

fn protocol_voice_asr_provider_from_core(provider: CoreAsrProviderType) -> VoiceAsrProviderType {
    match provider {
        CoreAsrProviderType::WhisperLocal => VoiceAsrProviderType::WhisperLocal,
        CoreAsrProviderType::SenseVoiceLocal => VoiceAsrProviderType::SenseVoiceLocal,
        CoreAsrProviderType::Xunfei => VoiceAsrProviderType::Xunfei,
        CoreAsrProviderType::Baidu => VoiceAsrProviderType::Baidu,
        CoreAsrProviderType::OpenAI => VoiceAsrProviderType::OpenAI,
    }
}

fn core_voice_asr_provider_from_protocol(provider: VoiceAsrProviderType) -> CoreAsrProviderType {
    match provider {
        VoiceAsrProviderType::WhisperLocal => CoreAsrProviderType::WhisperLocal,
        VoiceAsrProviderType::SenseVoiceLocal => CoreAsrProviderType::SenseVoiceLocal,
        VoiceAsrProviderType::Xunfei => CoreAsrProviderType::Xunfei,
        VoiceAsrProviderType::Baidu => CoreAsrProviderType::Baidu,
        VoiceAsrProviderType::OpenAI => CoreAsrProviderType::OpenAI,
    }
}

fn protocol_voice_asr_whisper_config_from_core(
    config: CoreWhisperLocalConfig,
) -> VoiceAsrWhisperLocalConfig {
    VoiceAsrWhisperLocalConfig {
        model: match config.model {
            CoreWhisperModelSize::Tiny => VoiceAsrWhisperModelSize::Tiny,
            CoreWhisperModelSize::Base => VoiceAsrWhisperModelSize::Base,
            CoreWhisperModelSize::Small => VoiceAsrWhisperModelSize::Small,
            CoreWhisperModelSize::Medium => VoiceAsrWhisperModelSize::Medium,
        },
        model_path: config.model_path,
    }
}

fn core_voice_asr_whisper_config_from_protocol(
    config: VoiceAsrWhisperLocalConfig,
) -> CoreWhisperLocalConfig {
    CoreWhisperLocalConfig {
        model: match config.model {
            VoiceAsrWhisperModelSize::Tiny => CoreWhisperModelSize::Tiny,
            VoiceAsrWhisperModelSize::Base => CoreWhisperModelSize::Base,
            VoiceAsrWhisperModelSize::Small => CoreWhisperModelSize::Small,
            VoiceAsrWhisperModelSize::Medium => CoreWhisperModelSize::Medium,
        },
        model_path: config.model_path,
    }
}

fn protocol_voice_asr_sensevoice_config_from_core(
    config: CoreSenseVoiceLocalConfig,
) -> VoiceAsrSenseVoiceLocalConfig {
    VoiceAsrSenseVoiceLocalConfig {
        model_id: config.model_id,
        model_dir: config.model_dir,
        use_itn: config.use_itn,
        num_threads: config.num_threads,
        vad_model_id: config.vad_model_id,
    }
}

fn core_voice_asr_sensevoice_config_from_protocol(
    config: VoiceAsrSenseVoiceLocalConfig,
) -> CoreSenseVoiceLocalConfig {
    CoreSenseVoiceLocalConfig {
        model_id: config.model_id,
        model_dir: config.model_dir,
        use_itn: config.use_itn,
        num_threads: config.num_threads,
        vad_model_id: config.vad_model_id,
    }
}

fn protocol_voice_asr_xunfei_config_from_core(config: CoreXunfeiConfig) -> VoiceAsrXunfeiConfig {
    VoiceAsrXunfeiConfig {
        app_id: config.app_id,
        api_key: config.api_key,
        api_secret: config.api_secret,
    }
}

fn core_voice_asr_xunfei_config_from_protocol(config: VoiceAsrXunfeiConfig) -> CoreXunfeiConfig {
    CoreXunfeiConfig {
        app_id: config.app_id,
        api_key: config.api_key,
        api_secret: config.api_secret,
    }
}

fn protocol_voice_asr_baidu_config_from_core(config: CoreBaiduConfig) -> VoiceAsrBaiduConfig {
    VoiceAsrBaiduConfig {
        api_key: config.api_key,
        secret_key: config.secret_key,
    }
}

fn core_voice_asr_baidu_config_from_protocol(config: VoiceAsrBaiduConfig) -> CoreBaiduConfig {
    CoreBaiduConfig {
        api_key: config.api_key,
        secret_key: config.secret_key,
    }
}

fn protocol_voice_asr_openai_config_from_core(config: CoreOpenAIAsrConfig) -> VoiceAsrOpenAiConfig {
    VoiceAsrOpenAiConfig {
        api_key: config.api_key,
        base_url: config.base_url,
        proxy_url: config.proxy_url,
    }
}

fn core_voice_asr_openai_config_from_protocol(config: VoiceAsrOpenAiConfig) -> CoreOpenAIAsrConfig {
    CoreOpenAIAsrConfig {
        api_key: config.api_key,
        base_url: config.base_url,
        proxy_url: config.proxy_url,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn voice_model_install_dir_requires_explicit_absolute_path() {
        for invalid in ["", "models/voice/sensevoice"] {
            assert!(validate_voice_model_install_dir(invalid)
                .expect_err("missing or relative install_dir must fail")
                .to_string()
                .contains("必须是绝对路径"));
        }

        let temp = tempfile::tempdir().expect("tempdir");
        let install_dir = temp.path().join(SENSEVOICE_MODEL_ID);
        assert_eq!(
            validate_voice_model_install_dir(&install_dir.to_string_lossy())
                .expect("absolute install_dir"),
            install_dir
        );
    }
}
