use async_trait::async_trait;
use serde_json::{Map, Value};
use std::collections::HashSet;

use super::{
    build_cross_session_message, build_cross_session_sender_address,
    build_shutdown_request_delivery_message, build_shutdown_response_delivery_message,
    build_teammate_message, format_team_agent_id, generate_team_name_slug,
    is_cross_session_local_peer_address, list_peers_metadata, message_value_to_delivery_text,
    normalize_optional_text, normalize_peer_address_target, normalize_required_text,
    parse_peer_address, pretty_json, project_send_message_result,
    project_send_message_unsupported_bridge_peer, project_spawn_agent_result,
    send_message_requires_team_lead, serialize_structured_message, spawn_agent_request_from_input,
    team_create_metadata, team_delete_metadata, validate_plan_approval_sender,
    validate_send_message_payload, validate_shutdown_response_target, AgentInput,
    CollabAgentSurfaceError, CollabAgentSurfaceResult, ListPeersInput, ListPeersOutput,
    MessageRouting, ParsedPeerAddress, PeerAddressScheme, PeerDescriptor, SendInputRequest,
    SendInputResponse, SendMessageDelivery, SendMessageInput, SpawnAgentRequest,
    SpawnAgentResponse, StructuredMessage, TeamCreateInput, TeamCreateOutput, TeamDeleteInput,
    TeamDeleteOutput, TEAM_LEAD_NAME,
};

#[derive(Debug, Clone, PartialEq)]
pub struct RuntimeCollabToolOutput {
    pub output: String,
    pub metadata_key: &'static str,
    pub metadata: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedCollabSendTarget {
    pub display_name: String,
    pub agent_id: String,
    pub routing_target: String,
    pub delivery_kind: ResolvedCollabSendTargetKind,
    pub wrap_as_teammate_message: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResolvedCollabSendTargetKind {
    Agent,
    CrossSessionLocal,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeTeamMember {
    pub agent_id: String,
    pub name: String,
    pub agent_type: Option<String>,
    pub is_lead: bool,
    pub joined_at_ms: i64,
}

impl RuntimeTeamMember {
    pub fn lead(agent_id: impl Into<String>, agent_type: Option<String>) -> Self {
        Self {
            agent_id: agent_id.into(),
            name: TEAM_LEAD_NAME.to_string(),
            agent_type,
            is_lead: true,
            joined_at_ms: chrono::Utc::now().timestamp_millis(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeTeamState {
    pub team_name: String,
    pub description: Option<String>,
    pub lead_session_id: String,
    pub members: Vec<RuntimeTeamMember>,
}

impl RuntimeTeamState {
    pub fn new(
        team_name: impl Into<String>,
        lead_session_id: impl Into<String>,
        description: Option<String>,
        lead_agent_type: Option<String>,
    ) -> Self {
        let lead_session_id = lead_session_id.into();
        Self {
            team_name: team_name.into(),
            description,
            members: vec![RuntimeTeamMember::lead(
                lead_session_id.clone(),
                lead_agent_type,
            )],
            lead_session_id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeTeamContext {
    pub lead_session_id: String,
    pub current_agent_id: String,
    pub current_member_name: String,
    pub is_lead: bool,
    pub team_state: RuntimeTeamState,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeTeamMemberState {
    pub member: RuntimeTeamMember,
    pub is_active: bool,
}

#[async_trait]
pub trait CollabAgentExecutionBackend: Send + Sync {
    async fn spawn_agent(
        &self,
        request: SpawnAgentRequest,
    ) -> CollabAgentSurfaceResult<SpawnAgentResponse>;

    async fn send_input(
        &self,
        request: SendInputRequest,
    ) -> CollabAgentSurfaceResult<SendInputResponse>;

    /// Verifies that `agent_id` belongs to the caller's agent graph and restores its persisted
    /// runtime state when the agent is known but no longer loaded.
    async fn ensure_agent_loaded(
        &self,
        current_session_id: &str,
        agent_id: &str,
    ) -> CollabAgentSurfaceResult<()>;

    async fn normalize_send_target(
        &self,
        session_id: &str,
        target: &str,
    ) -> CollabAgentSurfaceResult<String>;

    async fn resolve_send_targets(
        &self,
        session_id: &str,
        canonical_target: &str,
    ) -> CollabAgentSurfaceResult<Vec<ResolvedCollabSendTarget>>;

    async fn resolve_local_peer_target(
        &self,
        current_session_id: &str,
        address: &ParsedPeerAddress,
    ) -> CollabAgentSurfaceResult<ResolvedCollabSendTarget>;

    async fn resolve_sender_name(&self, session_id: &str) -> CollabAgentSurfaceResult<String>;

    async fn current_session_is_team_lead(
        &self,
        session_id: &str,
    ) -> CollabAgentSurfaceResult<bool>;
}

#[async_trait]
pub trait CollabAgentTeamExecutionBackend: Send + Sync {
    async fn current_session_has_team(&self, session_id: &str) -> CollabAgentSurfaceResult<bool>;

    async fn existing_team_names_except(
        &self,
        session_id: &str,
    ) -> CollabAgentSurfaceResult<Vec<String>>;

    async fn save_team_state(
        &self,
        lead_session_id: &str,
        team_state: Option<RuntimeTeamState>,
    ) -> CollabAgentSurfaceResult<()>;

    async fn resolve_team_context(
        &self,
        session_id: &str,
    ) -> CollabAgentSurfaceResult<Option<RuntimeTeamContext>>;

    async fn resolve_reachable_team_members(
        &self,
        team_state: &RuntimeTeamState,
    ) -> CollabAgentSurfaceResult<Vec<RuntimeTeamMemberState>>;

    async fn clear_team_membership(&self, agent_id: &str) -> CollabAgentSurfaceResult<()>;

    async fn resolve_local_session_peers(
        &self,
        current_session_id: &str,
    ) -> CollabAgentSurfaceResult<Vec<PeerDescriptor>>;

    async fn team_config_file_path(&self, team_name: &str) -> CollabAgentSurfaceResult<String>;
}

pub async fn execute_collab_spawn_agent(
    params: Value,
    session_id: &str,
    backend: &dyn CollabAgentExecutionBackend,
) -> CollabAgentSurfaceResult<RuntimeCollabToolOutput> {
    let input: AgentInput = serde_json::from_value(params).map_err(|error| {
        CollabAgentSurfaceError::invalid_params(format!("Agent 参数无效: {error}"))
    })?;
    let parent_session_id = normalize_required_text(session_id, "session_id")?;
    let request = spawn_agent_request_from_input(input, parent_session_id)?;
    let response = backend.spawn_agent(request.request).await?;
    let projection = project_spawn_agent_result(&request.description, &request.prompt, &response)?;

    Ok(RuntimeCollabToolOutput {
        output: projection.output,
        metadata_key: "agent",
        metadata: projection.metadata,
    })
}

pub async fn execute_collab_send_message(
    params: Value,
    session_id: &str,
    backend: &dyn CollabAgentExecutionBackend,
) -> CollabAgentSurfaceResult<RuntimeCollabToolOutput> {
    let input: SendMessageInput = serde_json::from_value(params).map_err(|error| {
        CollabAgentSurfaceError::invalid_params(format!("SendMessage 参数无效: {error}"))
    })?;
    let target = normalize_required_text(&input.to, "to")?;
    let summary = normalize_optional_text(input.summary.clone());
    let parsed_peer_address = parse_peer_address(&target);
    if parsed_peer_address
        .as_ref()
        .is_some_and(|address| address.scheme == PeerAddressScheme::Bridge)
    {
        return unsupported_bridge_peer_output(&target, summary.as_deref());
    }

    let canonical_target = if let Some(address) = parsed_peer_address.as_ref() {
        format!("uds:{}", normalize_peer_address_target(address)?)
    } else {
        backend.normalize_send_target(session_id, &target).await?
    };
    let is_local_peer_target = parsed_peer_address
        .as_ref()
        .is_some_and(is_cross_session_local_peer_address);
    let structured_message =
        serde_json::from_value::<StructuredMessage>(input.message.clone()).ok();
    validate_send_message_payload(
        &target,
        summary.as_deref(),
        input.message.is_string(),
        structured_message.as_ref(),
        is_local_peer_target,
    )?;

    let sender = backend.resolve_sender_name(session_id).await?;
    validate_shutdown_response_target(&canonical_target, structured_message.as_ref())?;
    if send_message_requires_team_lead(structured_message.as_ref()) {
        validate_plan_approval_sender(
            structured_message.as_ref(),
            backend.current_session_is_team_lead(session_id).await?,
        )?;
    }

    let message = delivery_message(
        &canonical_target,
        &sender,
        input.message,
        structured_message.as_ref(),
    )?;
    if message.is_empty() {
        return Err(CollabAgentSurfaceError::invalid_params("message 不能为空"));
    }

    let resolved_targets = if let Some(address) = parsed_peer_address.as_ref() {
        vec![
            backend
                .resolve_local_peer_target(session_id, address)
                .await?,
        ]
    } else {
        backend
            .resolve_send_targets(session_id, &canonical_target)
            .await?
    };
    let cross_session_sender = resolved_targets
        .iter()
        .any(|target| target.delivery_kind == ResolvedCollabSendTargetKind::CrossSessionLocal)
        .then(|| build_cross_session_sender_address(session_id));

    prepare_agent_mailboxes(backend, session_id, &resolved_targets).await?;

    let deliveries = deliver_messages(
        backend,
        &resolved_targets,
        &message,
        &sender,
        summary.as_deref(),
        structured_message.as_ref(),
        cross_session_sender.as_deref(),
    )
    .await?;
    let routing = message_routing(
        &target,
        &sender,
        summary.clone(),
        &message,
        &resolved_targets,
    );
    let projection = project_send_message_result(
        &target,
        &message,
        summary.as_deref(),
        structured_message.as_ref(),
        routing,
        &deliveries,
    )?;

    Ok(RuntimeCollabToolOutput {
        output: pretty_json(&projection.output)?,
        metadata_key: "send_message",
        metadata: projection.metadata,
    })
}

pub async fn execute_collab_team_create(
    params: Value,
    session_id: &str,
    backend: &dyn CollabAgentTeamExecutionBackend,
) -> CollabAgentSurfaceResult<RuntimeCollabToolOutput> {
    let input: TeamCreateInput = serde_json::from_value(params).map_err(|error| {
        CollabAgentSurfaceError::invalid_params(format!("TeamCreate 参数无效: {error}"))
    })?;
    let session_id = normalize_required_text(session_id, "session_id")?;
    let team_name = normalize_required_text(&input.team_name, "team_name")?;

    if backend.current_session_has_team(&session_id).await? {
        return Err(CollabAgentSurfaceError::execution_failed(
            "当前 session 已经属于一个 team；请先退出或删除现有 team",
        ));
    }

    let team_name = resolve_available_team_name(backend, &team_name, &session_id).await?;
    let lead_agent_type =
        normalize_optional_text(input.agent_type).or_else(|| Some(TEAM_LEAD_NAME.to_string()));
    let team_state = RuntimeTeamState::new(
        team_name.clone(),
        session_id.clone(),
        normalize_optional_text(input.description),
        lead_agent_type,
    );
    backend
        .save_team_state(&session_id, Some(team_state))
        .await?;

    let output = TeamCreateOutput {
        team_name: team_name.clone(),
        team_file_path: backend.team_config_file_path(&team_name).await?,
        lead_agent_id: format_team_agent_id(TEAM_LEAD_NAME, &team_name),
    };

    Ok(RuntimeCollabToolOutput {
        output: pretty_json(&output)?,
        metadata_key: "team_create",
        metadata: team_create_metadata(&output).into_iter().collect(),
    })
}

pub async fn execute_collab_team_delete(
    params: Value,
    session_id: &str,
    backend: &dyn CollabAgentTeamExecutionBackend,
) -> CollabAgentSurfaceResult<RuntimeCollabToolOutput> {
    let _: TeamDeleteInput = serde_json::from_value(params).map_err(|error| {
        CollabAgentSurfaceError::invalid_params(format!("TeamDelete 参数无效: {error}"))
    })?;
    let session_id = normalize_required_text(session_id, "session_id")?;
    let Some(team_context) = backend.resolve_team_context(&session_id).await? else {
        let output = TeamDeleteOutput {
            success: true,
            message: "No team name found, nothing to clean up".to_string(),
            team_name: None,
        };
        return Ok(RuntimeCollabToolOutput {
            output: pretty_json(&output)?,
            metadata_key: "team_delete",
            metadata: team_delete_metadata(&output, &[]).into_iter().collect(),
        });
    };

    if !team_context.is_lead {
        return Err(CollabAgentSurfaceError::execution_failed(
            "只有 team lead 可以执行 TeamDelete",
        ));
    }

    let reachable_members = backend
        .resolve_reachable_team_members(&team_context.team_state)
        .await?;
    let active_member_names = reachable_members
        .iter()
        .filter(|member| !member.member.is_lead && member.is_active)
        .map(|member| member.member.name.clone())
        .collect::<Vec<_>>();
    if !active_member_names.is_empty() {
        let output = TeamDeleteOutput {
            success: false,
            message: format!(
                "Cannot cleanup team with {} active member(s): {}. Use requestShutdown to gracefully terminate teammates first.",
                active_member_names.len(),
                active_member_names.join(", ")
            ),
            team_name: Some(team_context.team_state.team_name.clone()),
        };
        return Ok(RuntimeCollabToolOutput {
            output: pretty_json(&output)?,
            metadata_key: "team_delete",
            metadata: team_delete_metadata(&output, &active_member_names)
                .into_iter()
                .collect(),
        });
    }

    for member in reachable_members
        .iter()
        .filter(|member| !member.member.is_lead && !member.is_active)
    {
        backend
            .clear_team_membership(&member.member.agent_id)
            .await?;
    }

    backend
        .save_team_state(&team_context.lead_session_id, None)
        .await?;
    let output = TeamDeleteOutput {
        success: true,
        message: format!(
            "Cleaned up directories and worktrees for team \"{}\"",
            team_context.team_state.team_name
        ),
        team_name: Some(team_context.team_state.team_name),
    };

    Ok(RuntimeCollabToolOutput {
        output: pretty_json(&output)?,
        metadata_key: "team_delete",
        metadata: team_delete_metadata(&output, &[]).into_iter().collect(),
    })
}

pub async fn execute_collab_list_peers(
    params: Value,
    session_id: &str,
    backend: &dyn CollabAgentTeamExecutionBackend,
) -> CollabAgentSurfaceResult<RuntimeCollabToolOutput> {
    let _: ListPeersInput = serde_json::from_value(params).map_err(|error| {
        CollabAgentSurfaceError::invalid_params(format!("ListPeers 参数无效: {error}"))
    })?;
    let session_id = normalize_required_text(session_id, "session_id")?;
    let local_peers = backend.resolve_local_session_peers(&session_id).await?;
    let output = if let Some(team_context) = backend.resolve_team_context(&session_id).await? {
        let team_name = team_context.team_state.team_name.clone();
        let reachable_members = backend
            .resolve_reachable_team_members(&team_context.team_state)
            .await?;
        ListPeersOutput {
            team_name: Some(team_name.clone()),
            peers: reachable_members
                .into_iter()
                .filter(|member| member.member.agent_id != team_context.current_agent_id)
                .map(|member| {
                    let name = member.member.name;
                    PeerDescriptor {
                        send_to: name.clone(),
                        agent_id: format_team_agent_id(&name, &team_name),
                        name,
                        agent_type: member.member.agent_type,
                        is_lead: member.member.is_lead,
                    }
                })
                .chain(local_peers.into_iter())
                .collect(),
        }
    } else {
        ListPeersOutput {
            team_name: None,
            peers: local_peers,
        }
    };

    Ok(RuntimeCollabToolOutput {
        output: pretty_json(&output)?,
        metadata_key: "list_peers",
        metadata: list_peers_metadata(&output).into_iter().collect(),
    })
}

async fn resolve_available_team_name(
    backend: &dyn CollabAgentTeamExecutionBackend,
    team_name: &str,
    current_session_id: &str,
) -> CollabAgentSurfaceResult<String> {
    let existing_names = backend
        .existing_team_names_except(current_session_id)
        .await?
        .into_iter()
        .collect::<HashSet<_>>();

    if !existing_names.contains(team_name) {
        return Ok(team_name.to_string());
    }

    for _ in 0..1000 {
        let candidate = generate_team_name_slug();
        if !existing_names.contains(&candidate) {
            return Ok(candidate);
        }
    }

    Err(CollabAgentSurfaceError::execution_failed(format!(
        "team_name \"{team_name}\" 已存在，且未能生成可用别名"
    )))
}

fn unsupported_bridge_peer_output(
    target: &str,
    summary: Option<&str>,
) -> CollabAgentSurfaceResult<RuntimeCollabToolOutput> {
    let projection = project_send_message_unsupported_bridge_peer(target, summary)?;

    Ok(RuntimeCollabToolOutput {
        output: pretty_json(&projection.output)?,
        metadata_key: "send_message",
        metadata: projection.metadata,
    })
}

async fn prepare_agent_mailboxes(
    backend: &dyn CollabAgentExecutionBackend,
    current_session_id: &str,
    resolved_targets: &[ResolvedCollabSendTarget],
) -> CollabAgentSurfaceResult<()> {
    for target in resolved_targets {
        if target.delivery_kind == ResolvedCollabSendTargetKind::Agent {
            backend
                .ensure_agent_loaded(current_session_id, &target.agent_id)
                .await?;
        }
    }

    Ok(())
}

fn delivery_message(
    canonical_target: &str,
    sender: &str,
    message_value: Value,
    structured_message: Option<&StructuredMessage>,
) -> CollabAgentSurfaceResult<String> {
    match structured_message {
        Some(StructuredMessage::ShutdownRequest { reason }) => {
            let (message, _) =
                build_shutdown_request_delivery_message(canonical_target, reason.clone())?;
            Ok(message)
        }
        Some(StructuredMessage::ShutdownResponse {
            request_id,
            approve,
            reason,
        }) => build_shutdown_response_delivery_message(
            sender,
            request_id,
            *approve,
            reason.as_deref(),
        ),
        Some(_) => serialize_structured_message(&message_value),
        None => message_value_to_delivery_text(message_value),
    }
}

async fn deliver_messages(
    backend: &dyn CollabAgentExecutionBackend,
    resolved_targets: &[ResolvedCollabSendTarget],
    message: &str,
    sender: &str,
    summary: Option<&str>,
    structured_message: Option<&StructuredMessage>,
    cross_session_sender: Option<&str>,
) -> CollabAgentSurfaceResult<Vec<SendMessageDelivery>> {
    let mut deliveries = Vec::with_capacity(resolved_targets.len());
    for resolved_target in resolved_targets {
        let delivery_message = match resolved_target.delivery_kind {
            ResolvedCollabSendTargetKind::Agent => message.to_string(),
            ResolvedCollabSendTargetKind::CrossSessionLocal => build_cross_session_message(
                cross_session_sender.ok_or_else(|| {
                    CollabAgentSurfaceError::execution_failed(
                        "cross-session sender should exist for uds targets",
                    )
                })?,
                message,
            ),
        };
        let delivery_message =
            if resolved_target.wrap_as_teammate_message && structured_message.is_none() {
                build_teammate_message(sender, summary, &delivery_message)
            } else {
                delivery_message
            };
        let response = backend
            .send_input(SendInputRequest {
                id: resolved_target.agent_id.clone(),
                message: delivery_message,
                interrupt: false,
            })
            .await?;
        deliveries.push(SendMessageDelivery {
            target: resolved_target.display_name.clone(),
            agent_id: resolved_target.agent_id.clone(),
            submission_id: response.submission_id,
            extra: response.extra,
        });
    }

    Ok(deliveries)
}

fn message_routing(
    target: &str,
    sender: &str,
    summary: Option<String>,
    message: &str,
    resolved_targets: &[ResolvedCollabSendTarget],
) -> Option<MessageRouting> {
    if target == "*" {
        return Some(MessageRouting {
            sender: sender.to_string(),
            sender_color: None,
            target: "@team".to_string(),
            target_color: None,
            summary,
            content: Some(message.to_string()),
        });
    }

    resolved_targets
        .first()
        .map(|resolved_target| MessageRouting {
            sender: sender.to_string(),
            sender_color: None,
            target: resolved_target.routing_target.clone(),
            target_color: None,
            summary,
            content: Some(message.to_string()),
        })
}

#[cfg(test)]
#[path = "execution_tests.rs"]
mod tests;
