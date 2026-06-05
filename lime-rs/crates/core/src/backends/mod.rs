//! 后端调用层
//!
//! 提供与各种 AI 后端服务的 HTTP 通信能力。
//! 后端层只负责 HTTP 请求/响应，不包含任何协议转换逻辑。
//!
//! # 架构设计
//!
//! ```text
//! backends/
//! ├── traits.rs          # Backend trait 定义
//! ├── kiro.rs            # Kiro/CodeWhisperer 后端 (待迁移)
//! ├── codex.rs           # Codex 后端 (待迁移)
//! └── claude.rs          # Claude API 后端 (待迁移)
//! ```
//!
//! # 职责说明
//!
//! - **只做 HTTP 调用**: 构建 HTTP 请求，发送，接收响应
//! - **不做协议转换**: 协议转换在 translator 层完成
//! - **处理认证**: 管理 access token，刷新过期凭证
//! - **处理重试**: 可选的重试逻辑
//!
//! # 使用示例
//!
//! ```ignore
//! use lime::backends::KiroBackend;
//! use lime::backends::traits::Backend;
//!
//! let backend = KiroBackend::new(credentials);
//! let response = backend.call_stream(&cw_request).await?;
//! ```

pub mod traits;

// 重新导出核心类型
pub use traits::{
    AuthenticatedBackend, Backend, BackendError, BackendErrorKind, BackendResult, ByteStream,
};

// TODO: 后续阶段迁移以下后端
// pub mod kiro;
// pub mod codex;
// pub mod claude;
