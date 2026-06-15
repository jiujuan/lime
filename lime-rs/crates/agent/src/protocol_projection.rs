//! 运行时协议投影边界
//!
//! 这里是业务层消费的 current 入口。
//! 旧 `event_converter` 仅保留 compat converter 语义，不再作为生产调用入口暴露。

use aster::agents::AgentEvent as AsterAgentEvent;
use aster::session::{ItemRuntime, TurnContextOverride, TurnRuntime};
use lime_core::database::dao::agent_timeline::{AgentThreadItem, AgentThreadTurn};

use crate::protocol::{
    AgentEvent as RuntimeAgentEvent, AgentTurnContextSummary as RuntimeTurnContextSummary,
};

pub fn project_runtime_event(event: AsterAgentEvent) -> Vec<RuntimeAgentEvent> {
    crate::event_converter::convert_agent_event(event)
}

pub fn project_turn_runtime(turn: TurnRuntime) -> AgentThreadTurn {
    crate::event_converter::convert_turn_runtime(turn)
}

pub fn project_item_runtime(item: ItemRuntime) -> Option<AgentThreadItem> {
    crate::event_converter::convert_item_runtime(item)
}

pub fn project_turn_context_summary(
    turn_context: Option<&TurnContextOverride>,
) -> Option<RuntimeTurnContextSummary> {
    crate::event_converter::build_turn_context_summary(turn_context)
}
