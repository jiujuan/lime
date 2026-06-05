//! 上下文记忆运行时共享状态。

use lime_services::context_memory_service::ContextMemoryService;
use std::sync::Arc;

pub struct ContextMemoryServiceState(pub Arc<ContextMemoryService>);
