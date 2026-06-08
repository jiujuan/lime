use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const DEPRECATED_VOICE_TEST_COMMAND: &str =
    "旧 Tauri TTS 测试命令已下线；生产配音和语音能力必须经 Voice / App Server current 主链。";

fn deprecated_voice_test_command<T>(command: &str) -> Result<T, String> {
    Err(format!("{DEPRECATED_VOICE_TEST_COMMAND} command={command}"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsTestResult {
    pub success: bool,
    pub error: Option<String>,
    pub audio_path: Option<String>,
}

#[tauri::command]
pub async fn test_tts(
    _service: String,
    _voice: String,
    _app: AppHandle,
) -> Result<TtsTestResult, String> {
    deprecated_voice_test_command("test_tts")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceOption {
    pub id: String,
    pub name: String,
    pub language: String,
}

#[tauri::command]
pub async fn get_available_voices(
    _service: String,
    _app: AppHandle,
) -> Result<Vec<VoiceOption>, String> {
    deprecated_voice_test_command("get_available_voices")
}
