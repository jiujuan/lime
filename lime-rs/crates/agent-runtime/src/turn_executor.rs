use agent_protocol::{
    turn_context::TurnContextOverride, ActionId, AgentTurnInput, RuntimeEvent, SessionId, ThreadId,
    TurnId,
};
use model_provider::ModelRoute;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::AgentRuntimeResult;

/// Turn 执行请求
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ExecuteTurnRequest {
    /// Turn 输入
    pub input: AgentTurnInput,
    /// 模型路由（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<ModelRoute>,
    /// Turn 上下文覆盖配置（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_override: Option<TurnContextOverride>,
    /// 附加元数据
    #[serde(default)]
    pub metadata: Value,
}

/// Turn 执行结果
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ExecuteTurnResult {
    /// Session ID
    pub session_id: SessionId,
    /// Thread ID
    pub thread_id: ThreadId,
    /// Turn ID
    pub turn_id: TurnId,
    /// 执行状态
    pub status: TurnExecutionStatus,
    /// 运行时事件（可选）
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub events: Vec<RuntimeEvent>,
    /// 附加元数据
    #[serde(default)]
    pub metadata: Value,
}

/// Turn 执行状态
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TurnExecutionStatus {
    /// 已接受并开始执行
    Accepted,
    /// 执行中
    Running,
    /// 等待 action 响应
    WaitingForAction,
    /// 已完成
    Completed,
    /// 执行失败
    Failed,
}

/// 子代理排队请求
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct QueueSubagentRequest {
    /// 父 Session ID
    pub parent_session_id: SessionId,
    /// 父 Thread ID
    pub parent_thread_id: ThreadId,
    /// 父 Turn ID（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_turn_id: Option<TurnId>,
    /// 子代理输入文本
    pub input_text: String,
    /// 子代理模型路由（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<ModelRoute>,
    /// 子代理上下文覆盖（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_override: Option<TurnContextOverride>,
    /// 附加元数据
    #[serde(default)]
    pub metadata: Value,
}

/// 子代理排队结果
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct QueueSubagentResult {
    /// 子代理 Session ID
    pub subagent_session_id: SessionId,
    /// 子代理 Thread ID
    pub subagent_thread_id: ThreadId,
    /// 子代理初始 Turn ID（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subagent_turn_id: Option<TurnId>,
    /// 附加元数据
    #[serde(default)]
    pub metadata: Value,
}

/// Action 响应处理请求
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HandleActionRequest {
    /// Session ID
    pub session_id: SessionId,
    /// Thread ID
    pub thread_id: ThreadId,
    /// Turn ID
    pub turn_id: TurnId,
    /// Action ID
    pub action_id: ActionId,
    /// Action 响应数据
    pub response_data: Value,
    /// 附加元数据
    #[serde(default)]
    pub metadata: Value,
}

/// Action 响应处理结果
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HandleActionResult {
    /// Session ID
    pub session_id: SessionId,
    /// Thread ID
    pub thread_id: ThreadId,
    /// Turn ID
    pub turn_id: TurnId,
    /// Action ID
    pub action_id: ActionId,
    /// 处理后的状态
    pub status: ActionHandleStatus,
    /// 附加元数据
    #[serde(default)]
    pub metadata: Value,
}

/// Action 处理状态
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionHandleStatus {
    /// 已接受
    Accepted,
    /// Turn 已恢复执行
    TurnResumed,
    /// 已拒绝
    Rejected,
}

/// Turn 执行器 trait
///
/// 负责执行 AI Agent turn、管理子代理和处理 action 响应
pub trait TurnExecutor: Send + Sync {
    /// 执行一个 turn
    ///
    /// # 参数
    /// - `request`: turn 执行请求
    ///
    /// # 返回
    /// turn 执行结果
    fn execute_turn(&self, request: ExecuteTurnRequest) -> AgentRuntimeResult<ExecuteTurnResult>;

    /// 排队子代理
    ///
    /// # 参数
    /// - `request`: 子代理排队请求
    ///
    /// # 返回
    /// 子代理排队结果
    fn queue_subagent(
        &self,
        request: QueueSubagentRequest,
    ) -> AgentRuntimeResult<QueueSubagentResult>;

    /// 处理 action 响应
    ///
    /// # 参数
    /// - `request`: action 响应处理请求
    ///
    /// # 返回
    /// action 响应处理结果
    fn handle_action_response(
        &self,
        request: HandleActionRequest,
    ) -> AgentRuntimeResult<HandleActionResult>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn execute_turn_request_should_serialize_correctly() {
        let request = ExecuteTurnRequest {
            input: AgentTurnInput {
                session_id: SessionId::new("session-1"),
                thread_id: ThreadId::new("thread-1"),
                turn_id: TurnId::new("turn-1"),
                text: "测试输入".to_string(),
                metadata: Value::Null,
            },
            route: None,
            context_override: None,
            metadata: Value::Null,
        };

        let json = serde_json::to_value(&request).expect("should serialize");
        assert_eq!(json["input"]["session_id"], "session-1");
        assert_eq!(json["input"]["text"], "测试输入");
    }

    #[test]
    fn queue_subagent_request_should_preserve_parent_context() {
        let request = QueueSubagentRequest {
            parent_session_id: SessionId::new("parent-session"),
            parent_thread_id: ThreadId::new("parent-thread"),
            parent_turn_id: Some(TurnId::new("parent-turn")),
            input_text: "子代理任务".to_string(),
            route: None,
            context_override: None,
            metadata: Value::Null,
        };

        assert_eq!(request.parent_session_id.as_str(), "parent-session");
        assert_eq!(request.parent_thread_id.as_str(), "parent-thread");
        assert_eq!(
            request.parent_turn_id.as_ref().map(|id| id.as_str()),
            Some("parent-turn")
        );
    }

    #[test]
    fn handle_action_request_should_carry_full_context() {
        let request = HandleActionRequest {
            session_id: SessionId::new("session-1"),
            thread_id: ThreadId::new("thread-1"),
            turn_id: TurnId::new("turn-1"),
            action_id: ActionId::new("action-1"),
            response_data: serde_json::json!({"approved": true}),
            metadata: Value::Null,
        };

        assert_eq!(request.action_id.as_str(), "action-1");
        assert_eq!(request.response_data["approved"], true);
    }
}
