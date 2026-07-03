//! 运行时协议投影边界
//!
//! 这里是业务层消费的 current 入口。
//! 旧 `event_converter` 仅保留 compat converter 语义，不再作为生产调用入口暴露。

use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentThreadTurn};

use crate::protocol::AgentTurnContextSummary as RuntimeTurnContextSummary;
use crate::turn_context_configuration::AgentTurnContext;

pub type RuntimeTurnProjection = AgentThreadTurn;
pub type RuntimeItemProjection = AgentThreadItem;

pub fn project_turn_runtime(turn: RuntimeTurnProjection) -> AgentThreadTurn {
    turn
}

pub fn project_item_runtime(item: RuntimeItemProjection) -> AgentThreadItem {
    item
}

pub fn project_turn_context_summary(
    turn_context: Option<&AgentTurnContext>,
) -> Option<RuntimeTurnContextSummary> {
    crate::protocol_context_projection::project_turn_context_summary(turn_context)
}
