//! Runtime provider 执行边界。
//!
//! 这里只定义 Lime-owned provider 执行 trait，具体 provider / vendor
//! adapter 由调用方 crate 实现。

use async_trait::async_trait;

use crate::router::{ProviderRequest, ProviderResponse};
use crate::ModelProviderResult;

/// 已选 runtime provider 的一次补全执行能力。
#[async_trait]
pub trait RuntimeProvider: Send + Sync {
    async fn complete(&self, request: &ProviderRequest) -> ModelProviderResult<ProviderResponse>;
}
