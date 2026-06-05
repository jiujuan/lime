//! 流式处理层
//!
//! 提供统一的流式数据处理能力，包括：
//! - 事件类型定义 (events)
//! - 后端流格式解析 (parsers)
//! - 前端流格式生成 (generators)
//!
//! # 架构设计
//!
//! ```text
//! 后端响应流 ──> [Parser] ──> StreamEvent ──> [Generator] ──> 前端 SSE
//!
//! 例如：
//! AWS Event Stream ──> [AwsEventStreamParser] ──> StreamEvent ──> [AnthropicSseGenerator] ──> Anthropic SSE
//! AWS Event Stream ──> [AwsEventStreamParser] ──> StreamEvent ──> [OpenAiSseGenerator] ──> OpenAI SSE
//! ```
//!
//! # 模块结构
//!
//! - `events`: 统一的流事件类型定义 (`StreamEvent`)
//! - `parsers`: 后端流格式解析器
//!   - `aws_event_stream`: AWS Event Stream 解析器 (Kiro/CodeWhisperer)
//! - `generators`: 前端流格式生成器
//!   - `openai_sse`: OpenAI SSE 格式生成器
//!   - `anthropic_sse`: Anthropic SSE 格式生成器

pub mod events;
pub mod generators;
pub mod parsers;
pub mod pipeline;

// 重新导出核心类型
pub use events::{ContentBlockType, StopReason, StreamContext, StreamEvent};
pub use generators::{AnthropicSseGenerator, OpenAiSseGenerator};
pub use parsers::{AwsEventStreamParser, ParserState};
pub use pipeline::{create_sse_stream, BackendType, FrontendType, PipelineConfig, StreamPipeline};
