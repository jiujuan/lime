//! 错误类型定义
//!
//! 定义语音输入相关的错误类型。

use thiserror::Error;

/// 语音输入错误
#[derive(Debug, Error)]
pub enum VoiceError {
    /// 录音错误
    #[error("录音错误: {0}")]
    RecorderError(String),

    /// 麦克风权限错误
    #[error("麦克风权限不足，请在系统设置中授权")]
    MicrophonePermissionDenied,

    /// 没有可用的麦克风
    #[error("没有找到可用的麦克风设备")]
    NoMicrophoneFound,

    /// 识别错误
    #[error("语音识别错误: {0}")]
    TranscriberError(String),

    /// Whisper 模型加载错误
    #[error("Whisper 模型加载失败: {0}")]
    WhisperModelError(String),

    /// ASR 服务错误
    #[error("ASR 服务错误: {0}")]
    AsrError(String),

    /// ASR 认证错误
    #[error("ASR 认证失败: {0}")]
    AsrAuthError(String),

    /// 输出错误
    #[error("文字输出错误: {0}")]
    OutputError(String),

    /// 剪贴板错误
    #[error("剪贴板操作失败: {0}")]
    ClipboardError(String),

    /// 键盘模拟错误
    #[error("键盘模拟失败: {0}")]
    KeyboardError(String),

    /// 音频格式错误
    #[error("音频格式错误: {0}")]
    AudioFormatError(String),

    /// 录音时间过短
    #[error("录音时间过短（需要至少 0.5 秒）")]
    RecordingTooShort,

    /// 网络错误
    #[error("网络请求失败: {0}")]
    NetworkError(String),

    /// IO 错误
    #[error("IO 错误: {0}")]
    IoError(#[from] std::io::Error),
}

/// Result 类型别名
pub type Result<T> = std::result::Result<T, VoiceError>;
