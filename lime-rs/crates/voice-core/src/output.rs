//! 文字输出模块
//!
//! 支持模拟键盘输入和剪贴板两种输出方式。

use arboard::Clipboard;
use enigo::{Enigo, Keyboard, Settings};

use crate::error::{Result, VoiceError};
use crate::types::OutputMode;

/// 文字输出处理器
pub struct OutputHandler {
    /// 键盘模拟器
    enigo: Enigo,
}

impl OutputHandler {
    /// 创建新的输出处理器
    pub fn new() -> Result<Self> {
        let enigo = Enigo::new(&Settings::default())
            .map_err(|e| VoiceError::KeyboardError(e.to_string()))?;

        Ok(Self { enigo })
    }

    /// 输出文字
    pub fn output(&mut self, text: &str, mode: OutputMode) -> Result<()> {
        match mode {
            OutputMode::Type => self.type_text(text),
            OutputMode::Clipboard => self.copy_to_clipboard(text),
            OutputMode::Both => {
                self.copy_to_clipboard(text)?;
                self.type_text(text)
            }
        }
    }

    /// 模拟键盘输入文字
    pub fn type_text(&mut self, text: &str) -> Result<()> {
        self.enigo
            .text(text)
            .map_err(|e| VoiceError::KeyboardError(e.to_string()))?;

        tracing::info!("键盘输入完成: {} 字符", text.chars().count());
        Ok(())
    }

    /// 复制到剪贴板
    pub fn copy_to_clipboard(&self, text: &str) -> Result<()> {
        let mut clipboard =
            Clipboard::new().map_err(|e| VoiceError::ClipboardError(e.to_string()))?;

        clipboard
            .set_text(text)
            .map_err(|e| VoiceError::ClipboardError(e.to_string()))?;

        tracing::info!("已复制到剪贴板: {} 字符", text.chars().count());
        Ok(())
    }
}

impl Default for OutputHandler {
    fn default() -> Self {
        Self::new().expect("创建输出处理器失败")
    }
}
