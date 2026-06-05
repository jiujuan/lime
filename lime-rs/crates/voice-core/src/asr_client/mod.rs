//! 云端 ASR 客户端模块
//!
//! 支持讯飞、百度、OpenAI Whisper 等云端语音识别服务。

pub mod baidu;
pub mod openai;
pub mod xunfei;

use async_trait::async_trait;

use crate::error::Result;
use crate::types::{AudioData, TranscribeResult};

/// ASR 客户端 trait
#[async_trait]
pub trait AsrClient: Send + Sync {
    /// 识别音频
    async fn transcribe(&self, audio: &AudioData) -> Result<TranscribeResult>;

    /// 获取服务名称
    fn name(&self) -> &'static str;
}

pub use baidu::BaiduClient;
pub use openai::OpenAIWhisperClient;
pub use xunfei::XunfeiClient;
