//! OpenAI API 数据模型
//!
//! Chat Completion types re-exported from `aster-models` crate (single source of truth).
//! Image generation types are Lime-specific and defined locally.
pub use aster_models::openai::*;

use serde::{Deserialize, Serialize};

// ============================================================================
// 图像生成 API 数据模型 (Lime 特有)
// ============================================================================

/// OpenAI 图像生成请求
///
/// 兼容 OpenAI Images API，支持通过 Antigravity 生成图像。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageGenerationRequest {
    /// 图像生成提示词
    pub prompt: String,

    /// 模型名称 (默认: gemini-3-pro-image-preview)
    #[serde(default = "default_image_model")]
    pub model: String,

    /// 生成图像数量 (默认: 1)
    #[serde(default = "default_n")]
    pub n: u32,

    /// 图像尺寸 (可选，Antigravity 可能忽略)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,

    /// 响应格式: "url" 或 "b64_json" (默认: "url")
    #[serde(default = "default_response_format")]
    pub response_format: String,

    /// 图像质量 (可选，Antigravity 可能忽略)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub quality: Option<String>,

    /// 图像风格 (可选，Antigravity 可能忽略)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style: Option<String>,

    /// 用户标识 (可选)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
}

fn default_image_model() -> String {
    "gemini-3-pro-image-preview".to_string()
}

fn default_n() -> u32 {
    1
}

fn default_response_format() -> String {
    "url".to_string()
}

/// OpenAI 图像生成响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageGenerationResponse {
    /// 创建时间戳 (Unix epoch seconds)
    pub created: i64,

    /// 生成的图像数组
    pub data: Vec<ImageData>,
}

/// 单个图像数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageData {
    /// Base64 编码的图像数据 (当 response_format="b64_json")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub b64_json: Option<String>,

    /// 图像 URL (当 response_format="url"，返回 data URL)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,

    /// 修订后的提示词 (如果 Antigravity 返回了文本)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revised_prompt: Option<String>,
}
