//! 音频录制模块
//!
//! 使用 cpal 进行跨平台音频采集。

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::error::{Result, VoiceError};
use crate::types::AudioData;

/// 默认采样率（ASR 标准）
pub const DEFAULT_SAMPLE_RATE: u32 = 16000;
/// 默认声道数
pub const DEFAULT_CHANNELS: u16 = 1;
/// 最大录音时长（秒）
pub const MAX_RECORDING_DURATION: f32 = 60.0;

/// 音频录制器
pub struct AudioRecorder {
    /// 录音数据缓冲区
    samples: Arc<Mutex<Vec<i16>>>,
    /// 当前音量级别（0-100）
    volume_level: Arc<AtomicU32>,
    /// 是否正在录音
    is_recording: Arc<AtomicBool>,
    /// 录音开始时间
    start_time: Option<Instant>,
    /// 音频流（录音时持有）
    stream: Option<cpal::Stream>,
    /// 采样率
    sample_rate: u32,
}

impl AudioRecorder {
    /// 创建新的录音器
    pub fn new() -> Result<Self> {
        Ok(Self {
            samples: Arc::new(Mutex::new(Vec::new())),
            volume_level: Arc::new(AtomicU32::new(0)),
            is_recording: Arc::new(AtomicBool::new(false)),
            start_time: None,
            stream: None,
            sample_rate: DEFAULT_SAMPLE_RATE,
        })
    }

    /// 开始录音
    pub fn start(&mut self) -> Result<()> {
        if self.is_recording.load(Ordering::SeqCst) {
            return Ok(());
        }

        // 清空缓冲区
        if let Ok(mut samples) = self.samples.lock() {
            samples.clear();
        }

        // 获取默认输入设备
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or(VoiceError::NoMicrophoneFound)?;

        tracing::info!("使用麦克风: {:?}", device.name());

        // 配置音频格式
        let config = cpal::StreamConfig {
            channels: DEFAULT_CHANNELS,
            sample_rate: cpal::SampleRate(DEFAULT_SAMPLE_RATE),
            buffer_size: cpal::BufferSize::Default,
        };

        self.sample_rate = DEFAULT_SAMPLE_RATE;

        // 创建共享状态
        let samples = Arc::clone(&self.samples);
        let volume_level = Arc::clone(&self.volume_level);
        let is_recording = Arc::clone(&self.is_recording);

        // 创建输入流
        let stream = device
            .build_input_stream(
                &config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    if !is_recording.load(Ordering::SeqCst) {
                        return;
                    }

                    // 计算音量级别
                    let sum: f32 = data.iter().map(|s| s.abs()).sum();
                    let avg = sum / data.len() as f32;
                    let level = (avg * 100.0).min(100.0) as u32;
                    volume_level.store(level, Ordering::SeqCst);

                    // 转换为 i16 并存储
                    let i16_samples: Vec<i16> =
                        data.iter().map(|&s| (s * i16::MAX as f32) as i16).collect();

                    if let Ok(mut buffer) = samples.lock() {
                        buffer.extend(i16_samples);
                    }
                },
                |err| {
                    tracing::error!("录音流错误: {}", err);
                },
                None,
            )
            .map_err(|e| VoiceError::RecorderError(e.to_string()))?;

        // 开始录音
        stream
            .play()
            .map_err(|e| VoiceError::RecorderError(e.to_string()))?;

        self.stream = Some(stream);
        self.is_recording.store(true, Ordering::SeqCst);
        self.start_time = Some(Instant::now());

        tracing::info!("开始录音");
        Ok(())
    }

    /// 停止录音并返回音频数据
    pub fn stop(&mut self) -> Result<AudioData> {
        if !self.is_recording.load(Ordering::SeqCst) {
            return Err(VoiceError::RecorderError("未在录音中".to_string()));
        }

        // 停止录音
        self.is_recording.store(false, Ordering::SeqCst);

        // 停止流
        if let Some(stream) = self.stream.take() {
            drop(stream);
        }

        // 获取录音数据
        let samples = self
            .samples
            .lock()
            .map_err(|e| VoiceError::RecorderError(e.to_string()))?
            .clone();

        let audio = AudioData::new(samples, self.sample_rate, DEFAULT_CHANNELS);

        tracing::info!("停止录音，时长: {:.2}s", audio.duration_secs);

        // 检查录音时长
        if !audio.is_valid() {
            return Err(VoiceError::RecordingTooShort);
        }

        Ok(audio)
    }

    /// 获取当前音量级别（0-100）
    pub fn get_volume(&self) -> u32 {
        self.volume_level.load(Ordering::SeqCst)
    }

    /// 获取录音时长（秒）
    pub fn get_duration(&self) -> f32 {
        self.start_time
            .map(|t| t.elapsed().as_secs_f32())
            .unwrap_or(0.0)
    }

    /// 是否正在录音
    pub fn is_recording(&self) -> bool {
        self.is_recording.load(Ordering::SeqCst)
    }

    /// 取消录音
    pub fn cancel(&mut self) {
        self.is_recording.store(false, Ordering::SeqCst);
        if let Some(stream) = self.stream.take() {
            drop(stream);
        }
        if let Ok(mut samples) = self.samples.lock() {
            samples.clear();
        }
        tracing::info!("取消录音");
    }
}

impl Default for AudioRecorder {
    fn default() -> Self {
        Self::new().expect("创建录音器失败")
    }
}

impl Drop for AudioRecorder {
    fn drop(&mut self) {
        self.cancel();
    }
}
