use crate::session::{
    require_shared_session_runtime_queue_service, resolve_team_context, save_team_membership,
    save_team_state, ExtensionState, Session, SessionRuntimeQueueService, SessionStore,
    SessionType, TeamMember as AsterTeamMember, TeamMembershipState as AsterTeamMembershipState,
    TeamSessionState as AsterTeamSessionState,
};
use async_trait::async_trait;
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Arc;
use tool_runtime::collab_agent::{
    execute_collab_list_peers, execute_collab_team_create, execute_collab_team_delete,
    team_config_relative_path, CollabAgentSurfaceError, CollabAgentTeamExecutionBackend,
    PeerDescriptor, RuntimeCollabToolOutput, RuntimeTeamContext, RuntimeTeamMember,
    RuntimeTeamMemberState, RuntimeTeamState, LIST_PEERS_TOOL_NAME, MAX_LOCAL_SESSION_PEERS,
    TEAM_CREATE_TOOL_NAME, TEAM_DELETE_TOOL_NAME,
};

use crate::config::paths::Paths;

#[derive(Debug, Clone)]
struct LocalSessionPeerState {
    session: Session,
    is_live: bool,
}

fn team_config_file_path(team_name: &str) -> String {
    Paths::in_config_dir(&team_config_relative_path(team_name))
        .to_string_lossy()
        .to_string()
}

pub(crate) async fn execute_team_runtime_tool(
    tool_name: &str,
    params: Value,
    session_id: &str,
    session_store: Option<Arc<dyn SessionStore>>,
) -> Option<Result<RuntimeCollabToolOutput, CollabAgentSurfaceError>> {
    let Some(session_store) = session_store else {
        return match tool_name {
            TEAM_CREATE_TOOL_NAME | TEAM_DELETE_TOOL_NAME | LIST_PEERS_TOOL_NAME => Some(Err(
                CollabAgentSurfaceError::execution_failed(
                    "Team tools require injected session_store; global SessionManager fallback disabled",
                ),
            )),
            _ => None,
        };
    };
    let backend = TeamExecutionBackendAdapter { session_store };
    match tool_name {
        TEAM_CREATE_TOOL_NAME => {
            Some(execute_collab_team_create(params, session_id, &backend).await)
        }
        TEAM_DELETE_TOOL_NAME => {
            Some(execute_collab_team_delete(params, session_id, &backend).await)
        }
        LIST_PEERS_TOOL_NAME => Some(execute_collab_list_peers(params, session_id, &backend).await),
        _ => None,
    }
}

struct TeamExecutionBackendAdapter {
    session_store: Arc<dyn SessionStore>,
}

#[async_trait]
impl CollabAgentTeamExecutionBackend for TeamExecutionBackendAdapter {
    async fn current_session_has_team(
        &self,
        session_id: &str,
    ) -> Result<bool, CollabAgentSurfaceError> {
        let session = self
            .session_store
            .get_session(session_id, false)
            .await
            .map_err(|error| {
                CollabAgentSurfaceError::execution_failed(format!("读取 session 失败: {error}"))
            })?;

        Ok(
            AsterTeamSessionState::from_extension_data(&session.extension_data).is_some()
                || AsterTeamMembershipState::from_extension_data(&session.extension_data).is_some(),
        )
    }

    async fn existing_team_names_except(
        &self,
        session_id: &str,
    ) -> Result<Vec<String>, CollabAgentSurfaceError> {
        existing_team_names_except(self.session_store.as_ref(), session_id).await
    }

    async fn save_team_state(
        &self,
        lead_session_id: &str,
        team_state: Option<RuntimeTeamState>,
    ) -> Result<(), CollabAgentSurfaceError> {
        save_team_state(
            self.session_store.as_ref(),
            lead_session_id,
            team_state.map(aster_team_state_from_runtime),
        )
        .await
        .map_err(|error| {
            CollabAgentSurfaceError::execution_failed(format!("保存 team 状态失败: {error}"))
        })
    }

    async fn resolve_team_context(
        &self,
        session_id: &str,
    ) -> Result<Option<RuntimeTeamContext>, CollabAgentSurfaceError> {
        resolve_team_context(self.session_store.as_ref(), session_id)
            .await
            .map(|context| {
                context.map(|context| RuntimeTeamContext {
                    lead_session_id: context.lead_session_id,
                    current_agent_id: context.current_agent_id,
                    current_member_name: context.current_member_name,
                    is_lead: context.is_lead,
                    team_state: runtime_team_state_from_aster(context.team_state),
                })
            })
            .map_err(|error| {
                CollabAgentSurfaceError::execution_failed(format!("读取 team 状态失败: {error}"))
            })
    }

    async fn resolve_reachable_team_members(
        &self,
        team_state: &RuntimeTeamState,
    ) -> Result<Vec<RuntimeTeamMemberState>, CollabAgentSurfaceError> {
        resolve_reachable_team_members(self.session_store.as_ref(), team_state).await
    }

    async fn clear_team_membership(&self, agent_id: &str) -> Result<(), CollabAgentSurfaceError> {
        save_team_membership(self.session_store.as_ref(), agent_id, None)
            .await
            .map_err(|error| {
                CollabAgentSurfaceError::execution_failed(format!(
                    "清理 team 成员 {agent_id} 的 membership 失败: {error}"
                ))
            })
    }

    async fn resolve_local_session_peers(
        &self,
        current_session_id: &str,
    ) -> Result<Vec<PeerDescriptor>, CollabAgentSurfaceError> {
        resolve_local_session_peers(self.session_store.as_ref(), current_session_id).await
    }

    async fn team_config_file_path(
        &self,
        team_name: &str,
    ) -> Result<String, CollabAgentSurfaceError> {
        Ok(team_config_file_path(team_name))
    }
}

async fn existing_team_names_except(
    session_store: &dyn SessionStore,
    current_session_id: &str,
) -> Result<Vec<String>, CollabAgentSurfaceError> {
    let sessions = session_store
        .list_sessions_by_types(&[
            SessionType::User,
            SessionType::Scheduled,
            SessionType::SubAgent,
            SessionType::Hidden,
            SessionType::Terminal,
        ])
        .await
        .map_err(|error| {
            CollabAgentSurfaceError::execution_failed(format!("列出 sessions 失败: {error}"))
        })?;

    Ok(sessions
        .into_iter()
        .filter(|session| session.id != current_session_id)
        .filter_map(|session| {
            AsterTeamSessionState::from_extension_data(&session.extension_data)
                .map(|state| state.team_name)
        })
        .collect())
}

async fn resolve_reachable_team_members(
    session_store: &dyn SessionStore,
    team_state: &RuntimeTeamState,
) -> Result<Vec<RuntimeTeamMemberState>, CollabAgentSurfaceError> {
    let runtime_queue_service = require_shared_session_runtime_queue_service().ok();
    let mut resolved_members = Vec::new();

    for member in &team_state.members {
        if let Some(resolved) = resolve_team_member_state(
            session_store,
            member,
            team_state,
            runtime_queue_service.as_deref(),
        )
        .await?
        {
            resolved_members.push(resolved);
        }
    }

    Ok(resolved_members)
}

async fn resolve_team_member_state(
    session_store: &dyn SessionStore,
    member: &RuntimeTeamMember,
    team_state: &RuntimeTeamState,
    runtime_queue_service: Option<&SessionRuntimeQueueService>,
) -> Result<Option<RuntimeTeamMemberState>, CollabAgentSurfaceError> {
    let session = match session_store.get_session(&member.agent_id, false).await {
        Ok(session) => session,
        Err(_) => return Ok(None),
    };

    if member.is_lead {
        let Some(lead_state) = AsterTeamSessionState::from_extension_data(&session.extension_data)
        else {
            return Ok(None);
        };
        if session.id != team_state.lead_session_id
            || member.agent_id != team_state.lead_session_id
            || lead_state.team_name != team_state.team_name
            || lead_state.lead_session_id != team_state.lead_session_id
        {
            return Ok(None);
        }

        return Ok(Some(RuntimeTeamMemberState {
            member: member.clone(),
            is_active: false,
        }));
    }

    let Some(membership) = AsterTeamMembershipState::from_extension_data(&session.extension_data)
    else {
        return Ok(None);
    };
    if membership.team_name != team_state.team_name
        || membership.lead_session_id != team_state.lead_session_id
        || membership.agent_id != member.agent_id
        || membership.name != member.name
    {
        return Ok(None);
    }

    let is_active = match runtime_queue_service {
        Some(runtime_queue_service) => {
            runtime_queue_service.has_active_turn(&member.agent_id)
                || !runtime_queue_service
                    .list_queued_turns(&member.agent_id)
                    .await
                    .map_err(|error| {
                        CollabAgentSurfaceError::execution_failed(format!(
                            "读取 team 成员 {} 的运行队列失败: {error}",
                            member.name
                        ))
                    })?
                    .is_empty()
        }
        None => true,
    };

    Ok(Some(RuntimeTeamMemberState {
        member: member.clone(),
        is_active,
    }))
}

async fn resolve_local_session_peers(
    session_store: &dyn SessionStore,
    current_session_id: &str,
) -> Result<Vec<PeerDescriptor>, CollabAgentSurfaceError> {
    let current_session = session_store
        .get_session(current_session_id, false)
        .await
        .map_err(|error| {
            CollabAgentSurfaceError::execution_failed(format!("读取当前 session 失败: {error}"))
        })?;
    let live_session_ids = resolve_live_local_session_ids().await?;
    let sessions = session_store
        .list_sessions_by_types(&[
            SessionType::User,
            SessionType::Scheduled,
            SessionType::Terminal,
        ])
        .await
        .map_err(|error| {
            CollabAgentSurfaceError::execution_failed(format!("列出本机会话 peers 失败: {error}"))
        })?;

    let mut peers = sessions
        .into_iter()
        .filter(|session| session.id != current_session_id)
        .filter(|session| session.working_dir == current_session.working_dir)
        .map(|session| LocalSessionPeerState {
            is_live: live_session_ids.contains(&session.id),
            session,
        })
        .collect::<Vec<_>>();
    peers.sort_by(|left, right| {
        right
            .is_live
            .cmp(&left.is_live)
            .then_with(|| right.session.updated_at.cmp(&left.session.updated_at))
    });

    Ok(peers
        .into_iter()
        .take(MAX_LOCAL_SESSION_PEERS)
        .map(|peer| local_session_peer_descriptor(peer.session))
        .collect())
}

async fn resolve_live_local_session_ids() -> Result<HashSet<String>, CollabAgentSurfaceError> {
    let Some(runtime_queue_service) = require_shared_session_runtime_queue_service().ok() else {
        return Ok(HashSet::new());
    };

    runtime_queue_service
        .list_live_session_ids()
        .await
        .map_err(|error| {
            CollabAgentSurfaceError::execution_failed(format!(
                "读取 live 本机会话 peers 失败: {error}"
            ))
        })
}

fn local_session_peer_descriptor(session: Session) -> PeerDescriptor {
    PeerDescriptor {
        name: session.name,
        agent_id: session.id.clone(),
        agent_type: None,
        is_lead: false,
        send_to: format!("uds:{}", session.id),
    }
}

fn runtime_team_state_from_aster(state: AsterTeamSessionState) -> RuntimeTeamState {
    RuntimeTeamState {
        team_name: state.team_name,
        description: state.description,
        lead_session_id: state.lead_session_id,
        members: state
            .members
            .into_iter()
            .map(runtime_team_member_from_aster)
            .collect(),
    }
}

fn runtime_team_member_from_aster(member: AsterTeamMember) -> RuntimeTeamMember {
    RuntimeTeamMember {
        agent_id: member.agent_id,
        name: member.name,
        agent_type: member.agent_type,
        is_lead: member.is_lead,
        joined_at_ms: member.joined_at_ms,
    }
}

fn aster_team_state_from_runtime(state: RuntimeTeamState) -> AsterTeamSessionState {
    AsterTeamSessionState {
        team_name: state.team_name,
        description: state.description,
        lead_session_id: state.lead_session_id,
        members: state
            .members
            .into_iter()
            .map(aster_team_member_from_runtime)
            .collect(),
    }
}

fn aster_team_member_from_runtime(member: RuntimeTeamMember) -> AsterTeamMember {
    AsterTeamMember {
        agent_id: member.agent_id,
        name: member.name,
        agent_type: member.agent_type,
        is_lead: member.is_lead,
        joined_at_ms: member.joined_at_ms,
    }
}
