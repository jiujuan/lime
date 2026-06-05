//! SSE 流生成器
//!
//! 将统一的 `StreamEvent` 转换为不同前端协议的 SSE 格式。
//!
//! # 支持的格式
//!
//! - OpenAI SSE (data: {...})
//! - Anthropic SSE (event: xxx\ndata: {...})
//! - Gemini SSE (待实现)

pub mod anthropic_sse;
pub mod openai_sse;

pub use anthropic_sse::AnthropicSseGenerator;
pub use openai_sse::OpenAiSseGenerator;
