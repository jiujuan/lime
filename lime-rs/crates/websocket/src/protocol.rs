//! WebSocket RPC 协议定义
//!
//! 定义 JSON-RPC 风格的请求/响应结构，支持 Agent 和 Scheduler 操作

use serde::{Deserialize, Serialize};

/// Gateway RPC 请求
///
/// JSON-RPC 2.0 风格的请求结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayRpcRequest {
    /// JSON-RPC 版本（固定为 "2.0"）
    pub jsonrpc: String,
    /// 请求 ID（用于关联响应）
    pub id: String,
    /// 方法名
    pub method: RpcMethod,
    /// 参数（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
}

/// RPC 方法名
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RpcMethod {
    /// Agent 运行
    #[serde(rename = "agent.run")]
    AgentRun,
    /// Agent 等待完成
    #[serde(rename = "agent.wait")]
    AgentWait,
    /// Agent 停止
    #[serde(rename = "agent.stop")]
    AgentStop,
    /// 列出会话
    #[serde(rename = "sessions.list")]
    SessionsList,
    /// 获取会话详情
    #[serde(rename = "sessions.get")]
    SessionsGet,
    /// 列出定时任务
    #[serde(rename = "cron.list")]
    CronList,
    /// 运行定时任务
    #[serde(rename = "cron.run")]
    CronRun,
    /// 获取定时任务健康摘要
    #[serde(rename = "cron.health")]
    CronHealth,
}

/// Gateway RPC 响应
///
/// JSON-RPC 2.0 风格的响应结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayRpcResponse {
    /// JSON-RPC 版本（固定为 "2.0"）
    pub jsonrpc: String,
    /// 请求 ID（关联请求）
    pub id: String,
    /// 结果（如果成功）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    /// 错误（如果失败）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

/// RPC 错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcError {
    /// 错误码
    pub code: i32,
    /// 错误消息
    pub message: String,
    /// 错误数据（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl RpcError {
    /// 创建解析错误
    pub fn parse_error(message: impl Into<String>) -> Self {
        Self {
            code: -32700,
            message: message.into(),
            data: None,
        }
    }

    /// 创建无效请求错误
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self {
            code: -32600,
            message: message.into(),
            data: None,
        }
    }

    /// 创建方法未找到错误
    pub fn method_not_found(method: impl Into<String>) -> Self {
        Self {
            code: -32601,
            message: format!("Method not found: {}", method.into()),
            data: None,
        }
    }

    /// 创建无效参数错误
    pub fn invalid_params(message: impl Into<String>) -> Self {
        Self {
            code: -32602,
            message: message.into(),
            data: None,
        }
    }

    /// 创建内部错误
    pub fn internal_error(message: impl Into<String>) -> Self {
        Self {
            code: -32603,
            message: message.into(),
            data: None,
        }
    }
}

/// Agent 运行参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRunParams {
    /// 会话 ID（可选，用于连续对话）
    #[serde(default, alias = "sessionId")]
    pub session_id: Option<String>,
    /// 逻辑线程 ID（可选）
    #[serde(default, alias = "threadId", skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    /// 逻辑回合 ID（可选）
    #[serde(default, alias = "turnId", skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    /// 触发调度 ID（可选）
    #[serde(default, alias = "scheduleId", skip_serializing_if = "Option::is_none")]
    pub schedule_id: Option<String>,
    /// 用户消息
    #[serde(default)]
    pub message: String,
    /// 结构化输入块（可选）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inputs: Option<Vec<AgentInputBlock>>,
    /// 模型名称（可选）
    pub model: Option<String>,
    /// 系统提示词（可选）
    #[serde(default, alias = "systemPrompt")]
    pub system_prompt: Option<String>,
    /// 是否以本次系统提示词覆盖默认分层提示词
    #[serde(
        default,
        alias = "systemPromptOverride",
        skip_serializing_if = "Option::is_none"
    )]
    pub system_prompt_override: Option<bool>,
    /// 温度参数（可选）
    pub temperature: Option<f32>,
    /// 最大 token 数（可选）
    #[serde(default, alias = "maxTokens")]
    pub max_tokens: Option<u32>,
    /// 最大自动回合数（可选）
    #[serde(default, alias = "maxTurns", skip_serializing_if = "Option::is_none")]
    pub max_turns: Option<u32>,
    /// 是否开启联网搜索策略（可选）
    #[serde(default, alias = "webSearch")]
    pub web_search: Option<bool>,
    /// 联网搜索模式（disabled/allowed/required）
    #[serde(default, alias = "searchMode", skip_serializing_if = "Option::is_none")]
    pub search_mode: Option<String>,
    /// 工作目录（可选，必须由执行器校验为绝对路径后使用）
    #[serde(default, alias = "workingDir", skip_serializing_if = "Option::is_none")]
    pub working_dir: Option<String>,
    /// 推理强度（可选）
    #[serde(
        default,
        alias = "reasoningEffort",
        skip_serializing_if = "Option::is_none"
    )]
    pub reasoning_effort: Option<String>,
    /// 工具审批策略（可选）
    #[serde(
        default,
        alias = "approvalPolicy",
        skip_serializing_if = "Option::is_none"
    )]
    pub approval_policy: Option<String>,
    /// 沙箱策略（可选）
    #[serde(
        default,
        alias = "sandboxPolicy",
        skip_serializing_if = "Option::is_none"
    )]
    pub sandbox_policy: Option<String>,
    /// 协作模式（可选）
    #[serde(
        default,
        alias = "collaborationMode",
        skip_serializing_if = "Option::is_none"
    )]
    pub collaboration_mode: Option<String>,
    /// 结构化输出 schema（可选）
    #[serde(
        default,
        alias = "outputSchema",
        skip_serializing_if = "Option::is_none"
    )]
    pub output_schema: Option<serde_json::Value>,
    /// 是否流式响应
    #[serde(default)]
    pub stream: bool,
    /// 调用方结构化来源元数据（例如 gateway channel provenance）
    #[serde(
        default,
        alias = "sourceMetadata",
        skip_serializing_if = "Option::is_none"
    )]
    pub source_metadata: Option<serde_json::Value>,
}

/// Agent 输入块
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AgentInputBlock {
    Text { text: String },
    Media(AgentInputMedia),
}

/// Agent 媒体输入
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentInputMedia {
    pub media_type: String,
    pub source_type: AgentInputSourceType,
    pub path_or_data: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

/// Agent 输入源类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentInputSourceType {
    LocalPath,
    DataUrl,
}

/// Agent 等待参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentWaitParams {
    /// 运行 ID
    pub run_id: String,
    /// 超时时间（毫秒）
    #[serde(default = "default_timeout")]
    pub timeout: u64,
}

fn default_timeout() -> u64 {
    30000 // 30 秒
}

/// Agent 停止参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStopParams {
    /// 运行 ID
    pub run_id: String,
}

/// 会话获取参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionGetParams {
    /// 会话 ID
    pub session_id: String,
}

/// Cron 运行参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronRunParams {
    /// 任务 ID
    pub task_id: String,
}

/// Cron 健康查询参数
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CronHealthParams {
    /// 运行中任务判定为悬挂的阈值（分钟）
    pub running_timeout_minutes: Option<u64>,
    /// 高风险任务返回数量上限
    pub top_limit: Option<usize>,
    /// 冷却任务告警阈值
    pub cooldown_alert_threshold: Option<usize>,
    /// 悬挂运行告警阈值
    pub stale_running_alert_threshold: Option<usize>,
    /// 24h 失败告警阈值
    pub failed_24h_alert_threshold: Option<usize>,
}

/// Agent 运行结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRunResult {
    /// 运行 ID
    pub run_id: String,
    /// 会话 ID
    pub session_id: String,
    /// 是否完成
    pub completed: bool,
    /// 响应内容（如果已完成）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// Token 使用量（如果已完成）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
}

/// Agent 等待结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentWaitResult {
    /// 运行 ID
    pub run_id: String,
    /// 是否完成
    pub completed: bool,
    /// 响应内容（如果已完成）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// Token 使用量（如果已完成）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
}

/// Agent 停止结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStopResult {
    /// 运行 ID
    pub run_id: String,
    /// 是否成功停止
    pub stopped: bool,
}

/// 会话列表结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionsListResult {
    /// 会话列表
    pub sessions: Vec<SessionInfo>,
}

/// 会话详情结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionGetResult {
    /// 会话 ID
    pub session_id: String,
    /// 模型
    pub model: String,
    /// 系统提示词
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_prompt: Option<String>,
    /// 消息数量
    pub message_count: usize,
    /// 创建时间
    pub created_at: String,
    /// 更新时间
    pub updated_at: String,
}

/// 会话信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    /// 会话 ID
    pub session_id: String,
    /// 模型
    pub model: String,
    /// 消息数量
    pub message_count: usize,
    /// 创建时间
    pub created_at: String,
    /// 更新时间
    pub updated_at: String,
}

/// Token 使用量
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    /// 输入 token 数
    pub input_tokens: u32,
    /// 输出 token 数
    pub output_tokens: u32,
}

impl TokenUsage {
    /// 创建新的 TokenUsage
    pub fn new(input_tokens: u32, output_tokens: u32) -> Self {
        Self {
            input_tokens,
            output_tokens,
        }
    }

    /// 计算总 token 数
    pub fn total(&self) -> u32 {
        self.input_tokens + self.output_tokens
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialize_agent_run_request() {
        let request = GatewayRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: "test-123".to_string(),
            method: RpcMethod::AgentRun,
            params: Some(serde_json::json!({
                "message": "Hello, world!",
                "model": "claude-sonnet-4-5",
                "stream": false
            })),
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("agent.run"));
    }

    #[test]
    fn test_deserialize_agent_run_request() {
        let json = r#"{
            "jsonrpc": "2.0",
            "id": "test-123",
            "method": "agent.run",
            "params": {
                "message": "Hello, world!",
                "stream": false
            }
        }"#;

        let request: GatewayRpcRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.method, RpcMethod::AgentRun);
        assert!(request.params.is_some());
    }

    #[test]
    fn test_deserialize_agent_run_runtime_context_aliases() {
        let json = r#"{
            "sessionId": "session-1",
            "threadId": "thread-1",
            "turnId": "turn-1",
            "scheduleId": "schedule-1",
            "message": "Hello",
            "systemPrompt": "保持简洁",
            "systemPromptOverride": true,
            "maxTokens": 1024,
            "maxTurns": 3,
            "webSearch": true,
            "searchMode": "required",
            "workingDir": "/tmp/workspace",
            "reasoningEffort": "high",
            "approvalPolicy": "on-request",
            "sandboxPolicy": "workspace-write",
            "collaborationMode": "solo",
            "outputSchema": {"type": "object"},
            "sourceMetadata": {"origin": "test"}
        }"#;

        let params: AgentRunParams = serde_json::from_str(json).unwrap();

        assert_eq!(params.session_id.as_deref(), Some("session-1"));
        assert_eq!(params.thread_id.as_deref(), Some("thread-1"));
        assert_eq!(params.turn_id.as_deref(), Some("turn-1"));
        assert_eq!(params.schedule_id.as_deref(), Some("schedule-1"));
        assert_eq!(params.system_prompt.as_deref(), Some("保持简洁"));
        assert_eq!(params.system_prompt_override, Some(true));
        assert_eq!(params.max_tokens, Some(1024));
        assert_eq!(params.max_turns, Some(3));
        assert_eq!(params.web_search, Some(true));
        assert_eq!(params.search_mode.as_deref(), Some("required"));
        assert_eq!(params.working_dir.as_deref(), Some("/tmp/workspace"));
        assert_eq!(params.reasoning_effort.as_deref(), Some("high"));
        assert_eq!(params.approval_policy.as_deref(), Some("on-request"));
        assert_eq!(params.sandbox_policy.as_deref(), Some("workspace-write"));
        assert_eq!(params.collaboration_mode.as_deref(), Some("solo"));
        assert_eq!(
            params
                .output_schema
                .as_ref()
                .and_then(|value| value.get("type"))
                .and_then(serde_json::Value::as_str),
            Some("object")
        );
        assert_eq!(
            params
                .source_metadata
                .as_ref()
                .and_then(|value| value.get("origin"))
                .and_then(serde_json::Value::as_str),
            Some("test")
        );
    }

    #[test]
    fn test_deserialize_cron_health_request() {
        let json = r#"{
            "jsonrpc": "2.0",
            "id": "test-health",
            "method": "cron.health",
            "params": {
                "running_timeout_minutes": 15,
                "top_limit": 5
            }
        }"#;

        let request: GatewayRpcRequest = serde_json::from_str(json).unwrap();
        assert_eq!(request.method, RpcMethod::CronHealth);
        let params: CronHealthParams = serde_json::from_value(request.params.unwrap()).unwrap();
        assert_eq!(params.running_timeout_minutes, Some(15));
        assert_eq!(params.top_limit, Some(5));
    }

    #[test]
    fn test_serialize_error_response() {
        let response = GatewayRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: "test-123".to_string(),
            result: None,
            error: Some(RpcError::method_not_found("unknown.method")),
        };

        let json = serde_json::to_string(&response).unwrap();
        assert!(json.contains("-32601"));
    }
}
