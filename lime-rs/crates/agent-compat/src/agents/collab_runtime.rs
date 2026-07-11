//! Collaboration runtime adapter.
//!
//! Aster reply loop 未迁完前，这里只把 session/team source adapter 接到
//! `tool-runtime::collab_agent` current 执行面；协作工具语义不属于
//! `agent-compat/src/tools`。

use async_trait::async_trait;
use serde_json::Value;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use tool_runtime::collab_agent::{
    execute_collab_send_message, execute_collab_spawn_agent, normalize_peer_address_target,
    split_team_display_id, CollabAgentExecutionBackend, CollabAgentSurfaceError, ParsedPeerAddress,
    ResolvedCollabSendTarget, ResolvedCollabSendTargetKind, RuntimeCollabToolOutput,
    SendInputRequest, SendInputResponse, SpawnAgentRequest, SpawnAgentResponse, AGENT_TOOL_NAME,
    SEND_MESSAGE_TOOL_NAME,
};

use crate::session::{
    resolve_named_subagent_child_session, resolve_team_context, SessionStore, TEAM_LEAD_NAME,
};

type CallbackFuture<T> = Pin<Box<dyn Future<Output = Result<T, String>> + Send>>;

pub type SpawnAgentCallback =
    Arc<dyn Fn(SpawnAgentRequest) -> CallbackFuture<SpawnAgentResponse> + Send + Sync>;
pub type SendInputCallback =
    Arc<dyn Fn(SendInputRequest) -> CallbackFuture<SendInputResponse> + Send + Sync>;

#[derive(Clone, Default)]
pub struct AgentControlToolConfig {
    pub spawn_agent: Option<SpawnAgentCallback>,
    pub send_input: Option<SendInputCallback>,
}

impl AgentControlToolConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_spawn_agent_callback(mut self, callback: SpawnAgentCallback) -> Self {
        self.spawn_agent = Some(callback);
        self
    }

    pub fn with_send_input_callback(mut self, callback: SendInputCallback) -> Self {
        self.send_input = Some(callback);
        self
    }

    pub fn is_empty(&self) -> bool {
        self.spawn_agent.is_none() && self.send_input.is_none()
    }
}

pub(crate) async fn execute_agent_control_runtime_tool(
    tool_name: &str,
    params: Value,
    session_id: &str,
    config: Option<&AgentControlToolConfig>,
    session_store: Option<Arc<dyn SessionStore>>,
) -> Option<Result<RuntimeCollabToolOutput, CollabAgentSurfaceError>> {
    let config = config?;
    match tool_name {
        AGENT_TOOL_NAME if config.spawn_agent.is_some() => {
            let backend = AgentControlExecutionBackendAdapter {
                spawn_agent: config.spawn_agent.clone(),
                send_input: None,
                session_store,
            };
            Some(execute_collab_spawn_agent(params, session_id, &backend).await)
        }
        SEND_MESSAGE_TOOL_NAME if config.send_input.is_some() => {
            let backend = AgentControlExecutionBackendAdapter {
                spawn_agent: None,
                send_input: config.send_input.clone(),
                session_store,
            };
            Some(execute_collab_send_message(params, session_id, &backend).await)
        }
        _ => None,
    }
}

struct AgentControlExecutionBackendAdapter {
    spawn_agent: Option<SpawnAgentCallback>,
    send_input: Option<SendInputCallback>,
    session_store: Option<Arc<dyn SessionStore>>,
}

impl AgentControlExecutionBackendAdapter {
    fn session_store(&self) -> Result<&dyn SessionStore, CollabAgentSurfaceError> {
        self.session_store.as_deref().ok_or_else(|| {
            CollabAgentSurfaceError::execution_failed(
                "Agent control requires injected session_store; global SessionManager fallback disabled",
            )
        })
    }
}

#[async_trait]
impl CollabAgentExecutionBackend for AgentControlExecutionBackendAdapter {
    async fn spawn_agent(
        &self,
        request: SpawnAgentRequest,
    ) -> Result<SpawnAgentResponse, CollabAgentSurfaceError> {
        let Some(callback) = self.spawn_agent.as_ref() else {
            return Err(CollabAgentSurfaceError::execution_failed(
                "Agent runtime spawn callback is not configured",
            ));
        };

        callback(request)
            .await
            .map_err(CollabAgentSurfaceError::execution_failed)
    }

    async fn send_input(
        &self,
        request: SendInputRequest,
    ) -> Result<SendInputResponse, CollabAgentSurfaceError> {
        let Some(callback) = self.send_input.as_ref() else {
            return Err(CollabAgentSurfaceError::execution_failed(
                "Agent runtime send callback is not configured",
            ));
        };

        callback(request)
            .await
            .map_err(CollabAgentSurfaceError::execution_failed)
    }

    async fn normalize_send_target(
        &self,
        session_id: &str,
        target: &str,
    ) -> Result<String, CollabAgentSurfaceError> {
        normalize_send_target(self.session_store()?, session_id, target).await
    }

    async fn resolve_send_targets(
        &self,
        session_id: &str,
        canonical_target: &str,
    ) -> Result<Vec<ResolvedCollabSendTarget>, CollabAgentSurfaceError> {
        resolve_send_targets(self.session_store()?, session_id, canonical_target).await
    }

    async fn resolve_local_peer_target(
        &self,
        current_session_id: &str,
        address: &ParsedPeerAddress,
    ) -> Result<ResolvedCollabSendTarget, CollabAgentSurfaceError> {
        resolve_local_peer_target(self.session_store()?, current_session_id, address).await
    }

    async fn resolve_sender_name(
        &self,
        session_id: &str,
    ) -> Result<String, CollabAgentSurfaceError> {
        Ok(resolve_sender_name(self.session_store()?, session_id).await)
    }

    async fn current_session_is_team_lead(
        &self,
        session_id: &str,
    ) -> Result<bool, CollabAgentSurfaceError> {
        Ok(resolve_team_context(self.session_store()?, session_id)
            .await
            .map_err(|error| {
                CollabAgentSurfaceError::execution_failed(format!("读取 team 状态失败: {error}"))
            })?
            .is_some_and(|team_context| team_context.is_lead))
    }
}

async fn normalize_send_target(
    session_store: &dyn SessionStore,
    session_id: &str,
    target: &str,
) -> Result<String, CollabAgentSurfaceError> {
    let Some((name, team_name)) = split_team_display_id(target) else {
        return Ok(target.to_string());
    };

    let Some(team_context) = resolve_team_context(session_store, session_id)
        .await
        .map_err(|error| {
            CollabAgentSurfaceError::execution_failed(format!("读取 team 状态失败: {error}"))
        })?
    else {
        return Err(CollabAgentSurfaceError::invalid_params(
            "to 必须是裸 teammate 名称、agent id，或当前活跃 team 的 `name@team` 标识",
        ));
    };

    if team_context.team_state.team_name != team_name {
        return Err(CollabAgentSurfaceError::invalid_params(format!(
            "目标 team 不匹配：当前 team 为 {}，但收到 {}",
            team_context.team_state.team_name, team_name
        )));
    }

    if team_context.team_state.find_member_by_name(name).is_none() {
        return Err(CollabAgentSurfaceError::invalid_params(format!(
            "team {} 中不存在名为 {} 的成员",
            team_name, name
        )));
    }

    Ok(name.to_string())
}

async fn resolve_send_targets(
    session_store: &dyn SessionStore,
    session_id: &str,
    target: &str,
) -> Result<Vec<ResolvedCollabSendTarget>, CollabAgentSurfaceError> {
    if target == "*" {
        let Some(team_context) = resolve_team_context(session_store, session_id)
            .await
            .map_err(|error| {
                CollabAgentSurfaceError::execution_failed(format!("读取 team 状态失败: {error}"))
            })?
        else {
            return Err(CollabAgentSurfaceError::execution_failed(
                "当前 session 不在活跃 team 中，无法使用 `*` 广播",
            ));
        };
        let recipients = team_context
            .team_state
            .members
            .into_iter()
            .filter(|member| member.agent_id != team_context.current_agent_id)
            .map(|member| {
                let display_name = member.name.clone();
                let routing_target = format!("@{}", display_name);
                ResolvedCollabSendTarget {
                    display_name,
                    agent_id: member.agent_id,
                    routing_target,
                    delivery_kind: ResolvedCollabSendTargetKind::Agent,
                    wrap_as_teammate_message: !team_context.is_lead
                        && member.name == TEAM_LEAD_NAME,
                }
            })
            .collect::<Vec<_>>();
        return Ok(recipients);
    }

    if let Some(team_context) = resolve_team_context(session_store, session_id)
        .await
        .map_err(|error| {
            CollabAgentSurfaceError::execution_failed(format!("读取 team 状态失败: {error}"))
        })?
    {
        if let Some(member) = team_context.team_state.find_member_by_name(target) {
            if member.agent_id == team_context.current_agent_id {
                return Err(CollabAgentSurfaceError::execution_failed(
                    "不能把消息发送给当前 session 自己",
                ));
            }

            return Ok(vec![ResolvedCollabSendTarget {
                display_name: member.name.clone(),
                agent_id: member.agent_id.clone(),
                routing_target: format!("@{}", member.name),
                delivery_kind: ResolvedCollabSendTargetKind::Agent,
                wrap_as_teammate_message: !team_context.is_lead && member.name == TEAM_LEAD_NAME,
            }]);
        }
    }

    if let Some(child_session) =
        resolve_named_subagent_child_session(session_store, session_id, target)
            .await
            .map_err(|error| {
                CollabAgentSurfaceError::execution_failed(format!(
                    "读取命名子 agent 路由失败: {error}"
                ))
            })?
    {
        return Ok(vec![ResolvedCollabSendTarget {
            display_name: target.to_string(),
            agent_id: child_session.id,
            routing_target: target.to_string(),
            delivery_kind: ResolvedCollabSendTargetKind::Agent,
            wrap_as_teammate_message: false,
        }]);
    }

    Ok(vec![ResolvedCollabSendTarget {
        display_name: target.to_string(),
        agent_id: target.to_string(),
        routing_target: target.to_string(),
        delivery_kind: ResolvedCollabSendTargetKind::Agent,
        wrap_as_teammate_message: false,
    }])
}

async fn resolve_local_peer_target(
    session_store: &dyn SessionStore,
    current_session_id: &str,
    address: &ParsedPeerAddress,
) -> Result<ResolvedCollabSendTarget, CollabAgentSurfaceError> {
    let target_session_id = normalize_peer_address_target(address)?;
    if target_session_id == current_session_id {
        return Err(CollabAgentSurfaceError::execution_failed(
            "不能把消息发送给当前 session 自己",
        ));
    }

    let session = session_store
        .get_session(&target_session_id, false)
        .await
        .map_err(|error| {
            CollabAgentSurfaceError::execution_failed(format!("本机会话 peer 不存在: {error}"))
        })?;
    let session_id = session.id.clone();
    let display_name = if session.name.trim().is_empty() {
        session_id.clone()
    } else {
        session.name.clone()
    };

    Ok(ResolvedCollabSendTarget {
        display_name,
        agent_id: session_id.clone(),
        routing_target: format!("uds:{session_id}"),
        delivery_kind: ResolvedCollabSendTargetKind::CrossSessionLocal,
        wrap_as_teammate_message: false,
    })
}

async fn resolve_sender_name(session_store: &dyn SessionStore, session_id: &str) -> String {
    resolve_team_context(session_store, session_id)
        .await
        .ok()
        .flatten()
        .map(|team_context| team_context.current_member_name)
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| {
            if session_id.trim().is_empty() {
                "current-session".to_string()
            } else {
                session_id.to_string()
            }
        })
}
