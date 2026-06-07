//! 流式数据解析器
//!
//! 解析不同后端的流式响应格式，输出统一的 `StreamEvent`。
//!
//! # 支持的格式
//!
//! - AWS Event Stream (Kiro/CodeWhisperer)
//! - OpenAI SSE (待实现)
//! - Anthropic SSE (待实现)

pub mod aws_event_stream;

pub use aws_event_stream::{AwsEventStreamParser, ParserState};
