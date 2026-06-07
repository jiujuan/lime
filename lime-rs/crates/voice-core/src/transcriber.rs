//! Whisper 本地语音识别模块
//!
//! 使用 whisper-rs 进行本地语音识别。

use std::path::PathBuf;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::error::{Result, VoiceError};
use crate::types::{AudioData, Segment, TranscribeResult, WhisperModel};

/// Whisper 识别器
pub struct WhisperTranscriber {
    /// Whisper 上下文
    ctx: WhisperContext,
    /// 模型大小
    model: WhisperModel,
    /// 语言（如 "zh", "en", "auto"）
    language: String,
}

impl WhisperTranscriber {
    /// 创建新的 Whisper 识别器
    ///
    /// # 参数
    /// - `model_path`: 模型文件路径
    /// - `model`: 模型大小
    /// - `language`: 语言代码（"zh", "en", "auto"）
    pub fn new(model_path: PathBuf, model: WhisperModel, language: &str) -> Result<Self> {
        let ctx = WhisperContext::new_with_params(
            model_path.to_str().unwrap_or_default(),
            WhisperContextParameters::default(),
        )
        .map_err(|e| VoiceError::WhisperModelError(e.to_string()))?;

        Ok(Self {
            ctx,
            model,
            language: language.to_string(),
        })
    }

    /// 识别音频
    pub fn transcribe(&self, audio: &AudioData) -> Result<TranscribeResult> {
        // 转换为 f32 采样
        let samples: Vec<f32> = audio
            .samples
            .iter()
            .map(|&s| s as f32 / i16::MAX as f32)
            .collect();

        // 创建识别参数
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

        // 设置语言
        if self.language != "auto" {
            params.set_language(Some(&self.language));
        }

        // 其他参数
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_translate(false);
        params.set_no_context(true);
        params.set_single_segment(false);

        // 创建状态并识别
        let mut state = self
            .ctx
            .create_state()
            .map_err(|e| VoiceError::TranscriberError(e.to_string()))?;

        state
            .full(params, &samples)
            .map_err(|e| VoiceError::TranscriberError(e.to_string()))?;

        // 获取结果
        let num_segments = state.full_n_segments().unwrap_or(0);
        let mut text = String::new();
        let mut segments = Vec::new();

        for i in 0..num_segments {
            if let Ok(segment_text) = state.full_get_segment_text(i) {
                let start = state.full_get_segment_t0(i).unwrap_or(0) as f32 / 100.0;
                let end = state.full_get_segment_t1(i).unwrap_or(0) as f32 / 100.0;

                text.push_str(&segment_text);
                segments.push(Segment {
                    start,
                    end,
                    text: segment_text,
                });
            }
        }

        // 检测语言
        let detected_language = if self.language == "auto" {
            state
                .full_lang_id_from_state()
                .ok()
                .and_then(|id| whisper_rs::get_lang_str(id).map(|s| s.to_string()))
        } else {
            Some(self.language.clone())
        };

        Ok(TranscribeResult {
            text: text.trim().to_string(),
            language: detected_language,
            confidence: None,
            segments,
        })
    }

    /// 获取模型大小
    pub fn model(&self) -> WhisperModel {
        self.model
    }

    /// 获取语言设置
    pub fn language(&self) -> &str {
        &self.language
    }
}
