use std::collections::BTreeMap;

use async_trait::async_trait;
use serde_json::Value;

use super::*;

struct FakeBackend;

#[async_trait]
impl CollabAgentExecutionBackend for FakeBackend {
    async fn spawn_agent(
        &self,
        request: SpawnAgentRequest,
    ) -> CollabAgentSurfaceResult<SpawnAgentResponse> {
        Ok(SpawnAgentResponse {
            agent_id: format!("agent-for-{}", request.parent_session_id),
            nickname: request.name,
            extra: BTreeMap::new(),
        })
    }

    async fn send_input(
        &self,
        request: SendInputRequest,
    ) -> CollabAgentSurfaceResult<SendInputResponse> {
        Ok(SendInputResponse {
            submission_id: format!("submitted-{}", request.id),
            extra: BTreeMap::new(),
        })
    }

    async fn normalize_send_target(
        &self,
        _session_id: &str,
        target: &str,
    ) -> CollabAgentSurfaceResult<String> {
        Ok(target.to_string())
    }

    async fn resolve_send_targets(
        &self,
        _session_id: &str,
        canonical_target: &str,
    ) -> CollabAgentSurfaceResult<Vec<ResolvedCollabSendTarget>> {
        Ok(vec![ResolvedCollabSendTarget {
            display_name: canonical_target.to_string(),
            agent_id: canonical_target.to_string(),
            routing_target: canonical_target.to_string(),
            delivery_kind: ResolvedCollabSendTargetKind::Agent,
            wrap_as_teammate_message: false,
        }])
    }

    async fn resolve_local_peer_target(
        &self,
        _current_session_id: &str,
        address: &ParsedPeerAddress,
    ) -> CollabAgentSurfaceResult<ResolvedCollabSendTarget> {
        Ok(ResolvedCollabSendTarget {
            display_name: address.target.clone(),
            agent_id: address.target.clone(),
            routing_target: format!("uds:{}", address.target),
            delivery_kind: ResolvedCollabSendTargetKind::CrossSessionLocal,
            wrap_as_teammate_message: false,
        })
    }

    async fn resolve_sender_name(&self, session_id: &str) -> CollabAgentSurfaceResult<String> {
        Ok(session_id.to_string())
    }

    async fn current_session_is_team_lead(
        &self,
        _session_id: &str,
    ) -> CollabAgentSurfaceResult<bool> {
        Ok(true)
    }
}

struct FakeTeamBackend;

#[async_trait]
impl CollabAgentTeamExecutionBackend for FakeTeamBackend {
    async fn current_session_has_team(&self, _session_id: &str) -> CollabAgentSurfaceResult<bool> {
        Ok(false)
    }

    async fn existing_team_names_except(
        &self,
        _session_id: &str,
    ) -> CollabAgentSurfaceResult<Vec<String>> {
        Ok(Vec::new())
    }

    async fn save_team_state(
        &self,
        _lead_session_id: &str,
        _team_state: Option<RuntimeTeamState>,
    ) -> CollabAgentSurfaceResult<()> {
        Ok(())
    }

    async fn resolve_team_context(
        &self,
        _session_id: &str,
    ) -> CollabAgentSurfaceResult<Option<RuntimeTeamContext>> {
        Ok(None)
    }

    async fn resolve_reachable_team_members(
        &self,
        _team_state: &RuntimeTeamState,
    ) -> CollabAgentSurfaceResult<Vec<RuntimeTeamMemberState>> {
        Ok(Vec::new())
    }

    async fn clear_team_membership(&self, _agent_id: &str) -> CollabAgentSurfaceResult<()> {
        Ok(())
    }

    async fn resolve_local_session_peers(
        &self,
        _current_session_id: &str,
    ) -> CollabAgentSurfaceResult<Vec<PeerDescriptor>> {
        Ok(vec![PeerDescriptor {
            name: "Peer".to_string(),
            agent_id: "peer-1".to_string(),
            agent_type: None,
            is_lead: false,
            send_to: "uds:peer-1".to_string(),
        }])
    }

    async fn team_config_file_path(&self, team_name: &str) -> CollabAgentSurfaceResult<String> {
        Ok(format!("/config/teams/{team_name}.json"))
    }
}

#[tokio::test]
async fn executes_spawn_agent_with_current_projection() {
    let output = execute_collab_spawn_agent(
        serde_json::json!({
            "description": "Review",
            "prompt": "Read files",
            "name": "Scout"
        }),
        "session-1",
        &FakeBackend,
    )
    .await
    .expect("spawn output");

    assert_eq!(output.output, "Agent launched: agent-for-session-1");
    assert_eq!(output.metadata_key, "agent");
    assert_eq!(output.metadata["name"], Value::String("Scout".to_string()));
}

#[tokio::test]
async fn executes_send_message_with_current_projection() {
    let output = execute_collab_send_message(
        serde_json::json!({
            "to": "worker",
            "summary": "quick note",
            "message": "hello"
        }),
        "lead",
        &FakeBackend,
    )
    .await
    .expect("send output");

    assert_eq!(output.metadata_key, "send_message");
    assert!(output.output.contains("Message sent to worker"));
    assert_eq!(
        output.metadata["target"],
        Value::String("worker".to_string())
    );
}

#[tokio::test]
async fn executes_team_create_with_current_projection() {
    let output = execute_collab_team_create(
        serde_json::json!({
            "team_name": " Core ",
            "description": " Build together "
        }),
        "lead",
        &FakeTeamBackend,
    )
    .await
    .expect("team create output");

    assert_eq!(output.metadata_key, "team_create");
    assert!(output.output.contains("\"team_name\": \"Core\""));
    assert_eq!(
        output.metadata["teamName"],
        Value::String("Core".to_string())
    );
}

#[tokio::test]
async fn executes_list_peers_with_current_projection() {
    let output = execute_collab_list_peers(serde_json::json!({}), "lead", &FakeTeamBackend)
        .await
        .expect("list peers output");

    assert_eq!(output.metadata_key, "list_peers");
    assert!(output.output.contains("uds:peer-1"));
    assert!(output.metadata["peers"].is_array());
}
