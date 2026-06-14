//! RPC 处理器
//!
//! 处理 Gateway RPC 请求；旧 agent/cron 执行入口只保留 fail-closed 守卫

use super::super::{protocol::*, WsError};
use lime_core::database::dao::chat::{ChatDao, ChatMode};
use std::sync::Arc;
use tokio::sync::RwLock;

const CRON_DEPRECATED_MESSAGE: &str =
    "cron.* 已下线旧 scheduled_tasks 查询/执行入口；请使用 App Server automationJob/*";
const AGENT_RUN_DEPRECATED_MESSAGE: &str =
    "agent.run 已下线旧 WebSocket scheduler 执行入口；请使用 App Server agentSession/turn/start 或 automationJob/runNow";

/// RPC 处理器状态
#[derive(Clone)]
pub struct RpcHandlerState {
    /// 数据库连接
    pub db: Arc<RwLock<Option<lime_core::database::DbConnection>>>,
    /// 日志存储
    pub logs: Arc<RwLock<lime_core::LogStore>>,
}

impl RpcHandlerState {
    /// 创建新的 RPC 处理器状态
    pub fn new(
        db: Option<lime_core::database::DbConnection>,
        logs: Arc<RwLock<lime_core::LogStore>>,
    ) -> Self {
        Self {
            db: Arc::new(RwLock::new(db)),
            logs,
        }
    }
}

/// RPC 处理器
pub struct RpcHandler {
    state: RpcHandlerState,
}

impl RpcHandler {
    /// 创建新的 RPC 处理器
    pub fn new(state: RpcHandlerState) -> Self {
        Self { state }
    }

    /// 处理 RPC 请求
    pub async fn handle_request(&self, request: GatewayRpcRequest) -> GatewayRpcResponse {
        let method = request.method;
        let request_id = request.id.clone();
        let params = request.params;

        // 记录请求
        self.state.logs.write().await.add(
            "info",
            &format!("[RPC] Request: id={} method={:?}", request_id, method),
        );

        // 路由到具体的处理方法
        let result = match method {
            RpcMethod::AgentRun => self.handle_agent_run(params).await,
            RpcMethod::AgentWait => self.handle_agent_wait(params).await,
            RpcMethod::AgentStop => self.handle_agent_stop(params).await,
            RpcMethod::SessionsList => self.handle_sessions_list().await,
            RpcMethod::SessionsGet => self.handle_sessions_get(params).await,
            RpcMethod::CronList => self.handle_cron_list().await,
            RpcMethod::CronRun => self.handle_cron_run(params).await,
            RpcMethod::CronHealth => self.handle_cron_health(params).await,
        };

        match result {
            Ok(data) => GatewayRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: request_id,
                result: Some(data),
                error: None,
            },
            Err(err) => {
                self.state.logs.write().await.add(
                    "error",
                    &format!("[RPC] Error: id={} error={}", request_id, err.message),
                );
                GatewayRpcResponse {
                    jsonrpc: "2.0".to_string(),
                    id: request_id,
                    result: None,
                    error: Some(err),
                }
            }
        }
    }

    /// 处理 agent.run
    async fn handle_agent_run(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, RpcError> {
        params
            .and_then(|v| serde_json::from_value::<serde_json::Value>(v).ok())
            .ok_or_else(|| {
                RpcError::invalid_params("Missing or invalid parameters for agent.run")
            })?;
        Err(RpcError::invalid_params(format!(
            "{AGENT_RUN_DEPRECATED_MESSAGE}，agent.run 未执行"
        )))
    }

    /// 处理 agent.wait
    async fn handle_agent_wait(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, RpcError> {
        params
            .and_then(|v| serde_json::from_value::<serde_json::Value>(v).ok())
            .ok_or_else(|| {
                RpcError::invalid_params("Missing or invalid parameters for agent.wait")
            })?;
        Err(RpcError::invalid_params(format!(
            "{AGENT_RUN_DEPRECATED_MESSAGE}，agent.wait 未执行"
        )))
    }

    /// 处理 agent.stop
    async fn handle_agent_stop(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, RpcError> {
        params
            .and_then(|v| serde_json::from_value::<serde_json::Value>(v).ok())
            .ok_or_else(|| {
                RpcError::invalid_params("Missing or invalid parameters for agent.stop")
            })?;
        Err(RpcError::invalid_params(format!(
            "{AGENT_RUN_DEPRECATED_MESSAGE}，agent.stop 未执行"
        )))
    }

    /// 处理 sessions.list
    async fn handle_sessions_list(&self) -> Result<serde_json::Value, RpcError> {
        let db = self
            .require_db()
            .await
            .map_err(|e| RpcError::internal_error(e.message))?;
        let conn = lime_core::database::lock_db(&db)
            .map_err(|e| RpcError::internal_error(format!("DB lock failed: {e}")))?;
        let raw_sessions = ChatDao::list_sessions(&conn, Some(ChatMode::Agent))
            .map_err(|e| RpcError::internal_error(format!("load sessions failed: {e}")))?;

        let sessions: Vec<SessionInfo> = raw_sessions
            .into_iter()
            .map(|item| {
                let message_count = ChatDao::get_message_count(&conn, &item.id).unwrap_or(0);
                SessionInfo {
                    session_id: item.id,
                    model: item.model.unwrap_or_else(|| "default".to_string()),
                    message_count,
                    created_at: item.created_at,
                    updated_at: item.updated_at,
                }
            })
            .collect();

        let result = SessionsListResult { sessions };

        Ok(serde_json::to_value(result).map_err(|e| RpcError::internal_error(e.to_string()))?)
    }

    /// 处理 sessions.get
    async fn handle_sessions_get(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, RpcError> {
        let params: SessionGetParams = params
            .and_then(|v| serde_json::from_value(v).ok())
            .ok_or_else(|| {
                RpcError::invalid_params("Missing or invalid parameters for sessions.get")
            })?;
        let db = self
            .require_db()
            .await
            .map_err(|e| RpcError::internal_error(e.message))?;
        let conn = lime_core::database::lock_db(&db)
            .map_err(|e| RpcError::internal_error(format!("DB lock failed: {e}")))?;
        let detail = ChatDao::get_session_detail(&conn, &params.session_id, None)
            .map_err(|e| RpcError::internal_error(format!("load session detail failed: {e}")))?;
        let detail = detail.ok_or_else(|| {
            RpcError::invalid_params(format!("session not found: {}", params.session_id))
        })?;

        let result = SessionGetResult {
            session_id: detail.session.id,
            model: detail
                .session
                .model
                .unwrap_or_else(|| "default".to_string()),
            system_prompt: detail.session.system_prompt,
            message_count: detail.message_count,
            created_at: detail.session.created_at,
            updated_at: detail.session.updated_at,
        };

        Ok(serde_json::to_value(result).map_err(|e| RpcError::internal_error(e.to_string()))?)
    }

    /// 处理 cron.list
    async fn handle_cron_list(&self) -> Result<serde_json::Value, RpcError> {
        Err(RpcError::invalid_params(format!(
            "{CRON_DEPRECATED_MESSAGE}，cron.list 未执行"
        )))
    }

    /// 处理 cron.run
    async fn handle_cron_run(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, RpcError> {
        let params: CronRunParams = params
            .and_then(|v| serde_json::from_value(v).ok())
            .ok_or_else(|| {
                RpcError::invalid_params("Missing or invalid parameters for cron.run")
            })?;
        Err(RpcError::invalid_params(format!(
            "cron.run 已下线旧 scheduled_tasks 执行器，任务 {} 未执行；请使用 App Server automationJob/runNow",
            params.task_id
        )))
    }

    /// 处理 cron.health
    async fn handle_cron_health(
        &self,
        params: Option<serde_json::Value>,
    ) -> Result<serde_json::Value, RpcError> {
        if let Some(value) = params {
            serde_json::from_value::<CronHealthParams>(value).map_err(|_| {
                RpcError::invalid_params("Missing or invalid parameters for cron.health")
            })?;
        }
        Err(RpcError::invalid_params(format!(
            "{CRON_DEPRECATED_MESSAGE}，cron.health 未执行"
        )))
    }

    async fn require_db(&self) -> Result<lime_core::database::DbConnection, RpcError> {
        self.state
            .db
            .read()
            .await
            .clone()
            .ok_or_else(|| RpcError::internal_error("database not initialized"))
    }
}

/// 从 WsMessage 解析 RPC 请求
pub fn parse_rpc_request(msg: &str) -> Result<GatewayRpcRequest, RpcError> {
    serde_json::from_str(msg).map_err(|e| RpcError::parse_error(format!("Invalid JSON: {}", e)))
}

/// 序列化 RPC 响应
pub fn serialize_rpc_response(resp: &GatewayRpcResponse) -> Result<String, WsError> {
    serde_json::to_string(resp)
        .map_err(|e| WsError::internal(None, format!("Failed to serialize response: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use lime_core::database::dao::chat::ChatSession;
    use lime_core::database::{self, schema};
    use rusqlite::Connection;
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    #[test]
    fn test_parse_rpc_request() {
        let json = r#"{
            "jsonrpc": "2.0",
            "id": "test-123",
            "method": "agent.run",
            "params": {
                "message": "Hello",
                "stream": false
            }
        }"#;

        let request = parse_rpc_request(json).unwrap();
        assert_eq!(request.method, RpcMethod::AgentRun);
        assert_eq!(request.id, "test-123");
    }

    #[test]
    fn test_serialize_rpc_response() {
        let response = GatewayRpcResponse {
            jsonrpc: "2.0".to_string(),
            id: "test-123".to_string(),
            result: Some(serde_json::json!({"success": true})),
            error: None,
        };

        let json = serialize_rpc_response(&response).unwrap();
        assert!(json.contains("2.0"));
        assert!(json.contains("test-123"));
    }

    fn create_test_handler() -> RpcHandler {
        let conn = Connection::open_in_memory().expect("创建内存数据库失败");
        schema::create_tables(&conn).expect("创建核心表失败");
        let db: database::DbConnection = Arc::new(Mutex::new(conn));
        let state =
            RpcHandlerState::new(Some(db), Arc::new(RwLock::new(lime_core::LogStore::new())));
        RpcHandler::new(state)
    }

    #[tokio::test]
    async fn test_sessions_list_should_return_created_session() {
        let handler = create_test_handler();
        let db = handler.state.db.read().await.clone().expect("db 未初始化");
        let conn = database::lock_db(&db).expect("DB lock 失败");
        ChatDao::create_session(
            &conn,
            &ChatSession {
                id: "session-current".to_string(),
                mode: ChatMode::Agent,
                title: Some("当前会话".to_string()),
                system_prompt: None,
                model: Some("model-current".to_string()),
                provider_type: None,
                credential_uuid: None,
                metadata: None,
                created_at: "2026-06-13T00:00:00Z".to_string(),
                updated_at: "2026-06-13T00:00:00Z".to_string(),
            },
        )
        .expect("创建会话失败");
        drop(conn);

        let list_request = GatewayRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: "list-1".to_string(),
            method: RpcMethod::SessionsList,
            params: None,
        };
        let list_response = handler.handle_request(list_request).await;
        assert!(list_response.error.is_none());
        let result: SessionsListResult =
            serde_json::from_value(list_response.result.expect("缺少 sessions.list result"))
                .expect("解析 sessions.list 返回失败");
        assert!(!result.sessions.is_empty());
        assert!(result
            .sessions
            .iter()
            .any(|session| session.session_id == "session-current"));
    }

    #[tokio::test]
    async fn test_agent_methods_should_fail_closed() {
        let handler = create_test_handler();
        let run_request = GatewayRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: "agent-run".to_string(),
            method: RpcMethod::AgentRun,
            params: Some(json!({
                "message": "旧 WebSocket 执行入口不应运行",
                "stream": false
            })),
        };
        let run_response = handler.handle_request(run_request).await;
        let run_err = run_response.error.expect("agent.run 应返回错误");
        assert!(run_err
            .message
            .contains("agent.run 已下线旧 WebSocket scheduler 执行入口"));
        assert!(run_err.message.contains("agentSession/turn/start"));

        let wait_request = GatewayRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: "agent-wait".to_string(),
            method: RpcMethod::AgentWait,
            params: Some(json!({
                "run_id": "legacy-run",
                "timeout": 200
            })),
        };
        let wait_response = handler.handle_request(wait_request).await;
        let wait_err = wait_response.error.expect("agent.wait 应返回错误");
        assert!(wait_err.message.contains("agent.wait 未执行"));

        let stop_request = GatewayRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: "agent-stop".to_string(),
            method: RpcMethod::AgentStop,
            params: Some(json!({
                "run_id": "legacy-run"
            })),
        };
        let stop_response = handler.handle_request(stop_request).await;
        let stop_err = stop_response.error.expect("agent.stop 应返回错误");
        assert!(stop_err.message.contains("agent.stop 未执行"));
    }

    #[tokio::test]
    async fn test_cron_methods_should_fail_closed() {
        let handler = create_test_handler();

        let list_request = GatewayRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: "cron-list".to_string(),
            method: RpcMethod::CronList,
            params: None,
        };
        let list_response = handler.handle_request(list_request).await;
        let list_err = list_response.error.expect("cron.list 应返回错误");
        assert!(list_err.message.contains("cron.* 已下线旧 scheduled_tasks"));
        assert!(list_err.message.contains("automationJob/*"));

        let run_request = GatewayRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: "cron-run".to_string(),
            method: RpcMethod::CronRun,
            params: Some(json!({
                "task_id": "legacy-task"
            })),
        };
        let run_response = handler.handle_request(run_request).await;
        let err = run_response.error.expect("应返回错误");
        assert!(err
            .message
            .contains("cron.run 已下线旧 scheduled_tasks 执行器"));
        assert!(err.message.contains("automationJob/runNow"));

        let health_request = GatewayRpcRequest {
            jsonrpc: "2.0".to_string(),
            id: "cron-health".to_string(),
            method: RpcMethod::CronHealth,
            params: Some(json!({
                "running_timeout_minutes": 10,
                "top_limit": 5
            })),
        };
        let health_response = handler.handle_request(health_request).await;
        let health_err = health_response.error.expect("cron.health 应返回错误");
        assert!(health_err
            .message
            .contains("cron.* 已下线旧 scheduled_tasks"));
        assert!(health_err.message.contains("automationJob/*"));
    }
}
