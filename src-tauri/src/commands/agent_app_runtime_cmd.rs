//! Agent App Runtime surface 命令。
//!
//! 本模块只保留 Agent App Runtime 的命令门面与共享边界；
//! 具体用例按 handler 拆分到子模块，避免在 Agent App 下创建第二套模型、工具、证据或队列运行时。

pub(crate) mod cancel_task;
mod common;
mod events;
pub(crate) mod host_response;
mod metadata;
mod model_preference;
pub(crate) mod start_task;
pub(crate) mod task_snapshot;
#[cfg(test)]
mod tests;
mod tool_execution;
mod types;

#[allow(unused_imports)]
pub use types::{
    AgentAppRuntimeCancelTaskRequest, AgentAppRuntimeCancelTaskResult,
    AgentAppRuntimeGetTaskRequest, AgentAppRuntimeStartTaskRequest, AgentAppRuntimeStartTaskResult,
    AgentAppRuntimeSubmitHostResponseRequest, AgentAppRuntimeSubmitHostResponseResult,
    AgentAppRuntimeTaskEvent, AgentAppRuntimeTaskSnapshot,
};
