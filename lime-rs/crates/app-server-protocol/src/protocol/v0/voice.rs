use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum VoiceAsrProviderType {
    #[default]
    WhisperLocal,
    SenseVoiceLocal,
    Xunfei,
    Baidu,
    #[serde(rename = "openai", alias = "open_ai")]
    OpenAI,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum VoiceAsrWhisperModelSize {
    Tiny,
    #[default]
    Base,
    Small,
    Medium,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceAsrWhisperLocalConfig {
    #[serde(default)]
    pub model: VoiceAsrWhisperModelSize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_path: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceAsrSenseVoiceLocalConfig {
    #[serde(default = "default_sensevoice_model_id")]
    pub model_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model_dir: Option<String>,
    #[serde(default = "default_sensevoice_use_itn")]
    pub use_itn: bool,
    #[serde(default = "default_sensevoice_num_threads")]
    pub num_threads: u16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vad_model_id: Option<String>,
}

fn default_sensevoice_model_id() -> String {
    "sensevoice-small-int8-2024-07-17".to_string()
}

fn default_sensevoice_use_itn() -> bool {
    true
}

fn default_sensevoice_num_threads() -> u16 {
    4
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceAsrXunfeiConfig {
    pub app_id: String,
    pub api_key: String,
    pub api_secret: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceAsrBaiduConfig {
    pub api_key: String,
    pub secret_key: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceAsrOpenAiConfig {
    pub api_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_url: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceAsrCredential {
    pub id: String,
    pub provider: VoiceAsrProviderType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub disabled: bool,
    #[serde(default = "default_voice_asr_language")]
    pub language: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub whisper_config: Option<VoiceAsrWhisperLocalConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sensevoice_config: Option<VoiceAsrSenseVoiceLocalConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub xunfei_config: Option<VoiceAsrXunfeiConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub baidu_config: Option<VoiceAsrBaiduConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub openai_config: Option<VoiceAsrOpenAiConfig>,
}

fn default_voice_asr_language() -> String {
    "zh".to_string()
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceAsrCredentialCreateParams {
    pub provider: VoiceAsrProviderType,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub disabled: bool,
    #[serde(default = "default_voice_asr_language")]
    pub language: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub whisper_config: Option<VoiceAsrWhisperLocalConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sensevoice_config: Option<VoiceAsrSenseVoiceLocalConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub xunfei_config: Option<VoiceAsrXunfeiConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub baidu_config: Option<VoiceAsrBaiduConfig>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub openai_config: Option<VoiceAsrOpenAiConfig>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceAsrCredentialUpdateParams {
    pub credential: VoiceAsrCredential,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceAsrCredentialIdParams {
    pub id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceAsrCredentialListResponse {
    #[serde(default)]
    pub credentials: Vec<VoiceAsrCredential>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceAsrCredentialWriteResponse {
    pub credential: VoiceAsrCredential,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceAsrCredentialMutationResponse {}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceAsrCredentialTestResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceInstruction {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shortcut: Option<String>,
    #[serde(default)]
    pub is_preset: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceInstructionSaveParams {
    pub instruction: VoiceInstruction,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceInstructionIdParams {
    pub id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceInstructionListResponse {
    #[serde(default)]
    pub instructions: Vec<VoiceInstruction>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceInstructionMutationResponse {}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceModelDefaultSetParams {
    pub model_id: String,
    pub install_dir: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceModelDefaultSetResponse {
    pub credential: VoiceAsrCredential,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceModelTestTranscribeFileParams {
    pub model_id: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, JsonSchema)]
pub struct VoiceModelTestTranscribeFileResponse {
    pub text: String,
    pub duration_secs: f32,
    pub sample_rate: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
}
