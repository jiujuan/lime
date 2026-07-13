use std::collections::BTreeMap;
use std::sync::Mutex;

use async_trait::async_trait;
use serde_json::Value;

use super::*;

#[derive(Default)]
struct FakeBackend {
    events: Mutex<Vec<String>>,
    fail_preparation_for: Option<String>,
    resolved_agent_ids: Option<Vec<String>>,
}

impl FakeBackend {
    fn failing_preparation(agent_id: &str) -> Self {
        Self {
            events: Mutex::new(Vec::new()),
            fail_preparation_for: Some(agent_id.to_string()),
            resolved_agent_ids: None,
        }
    }

    fn broadcasting(agent_ids: &[&str]) -> Self {
        Self {
            events: Mutex::new(Vec::new()),
            fail_preparation_for: None,
            resolved_agent_ids: Some(
                agent_ids
                    .iter()
                    .map(|agent_id| (*agent_id).to_string())
                    .collect(),
            ),
        }
    }

    fn events(&self) -> Vec<String> {
        self.events.lock().expect("events lock").clone()
    }
}

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
        self.events
            .lock()
            .expect("events lock")
            .push(format!("send:{}", request.id));
        Ok(SendInputResponse {
            submission_id: format!("submitted-{}", request.id),
            extra: BTreeMap::new(),
        })
    }

    async fn ensure_agent_loaded(
        &self,
        current_session_id: &str,
        agent_id: &str,
    ) -> CollabAgentSurfaceResult<()> {
        self.events
            .lock()
            .expect("events lock")
            .push(format!("prepare:{current_session_id}:{agent_id}"));
        if self.fail_preparation_for.as_deref() == Some(agent_id) {
            return Err(CollabAgentSurfaceError::execution_failed(format!(
                "failed to restore agent {agent_id}"
            )));
        }
        Ok(())
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
        Ok(self
            .resolved_agent_ids
            .clone()
            .unwrap_or_else(|| vec![canonical_target.to_string()])
            .into_iter()
            .map(|agent_id| ResolvedCollabSendTarget {
                display_name: agent_id.clone(),
                routing_target: agent_id.clone(),
                agent_id,
                delivery_kind: ResolvedCollabSendTargetKind::Agent,
                wrap_as_teammate_message: false,
            })
            .collect())
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
        &FakeBackend::default(),
    )
    .await
    .expect("spawn output");

    assert_eq!(output.output, "Agent launched: agent-for-session-1");
    assert_eq!(output.metadata_key, "agent");
    assert_eq!(output.metadata["name"], Value::String("Scout".to_string()));
}

#[tokio::test]
async fn executes_send_message_with_current_projection() {
    let backend = FakeBackend::default();
    let output = execute_collab_send_message(
        serde_json::json!({
            "to": "worker",
            "summary": "quick note",
            "message": "hello"
        }),
        "lead",
        &backend,
    )
    .await
    .expect("send output");

    assert_eq!(output.metadata_key, "send_message");
    assert!(output.output.contains("Message sent to worker"));
    assert_eq!(
        output.metadata["target"],
        Value::String("worker".to_string())
    );
    assert_eq!(backend.events(), vec!["prepare:lead:worker", "send:worker"]);
}

#[tokio::test]
async fn prepares_all_graph_recipients_before_delivering_mailbox_messages() {
    let backend = FakeBackend::broadcasting(&["worker-a", "worker-b"]);
    execute_collab_send_message(
        serde_json::json!({
            "to": "*",
            "summary": "status",
            "message": "report"
        }),
        "lead",
        &backend,
    )
    .await
    .expect("broadcast output");

    assert_eq!(
        backend.events(),
        vec![
            "prepare:lead:worker-a",
            "prepare:lead:worker-b",
            "send:worker-a",
            "send:worker-b",
        ]
    );
}

#[tokio::test]
async fn recovery_failure_prevents_partial_mailbox_delivery() {
    let backend = FakeBackend::failing_preparation("worker");
    let error = execute_collab_send_message(
        serde_json::json!({
            "to": "worker",
            "summary": "retry",
            "message": "continue"
        }),
        "lead",
        &backend,
    )
    .await
    .expect_err("recovery failure");

    assert_eq!(error.message(), "failed to restore agent worker");
    assert_eq!(backend.events(), vec!["prepare:lead:worker"]);
}

#[tokio::test]
async fn cross_session_local_peer_bypasses_agent_graph_recovery() {
    let backend = FakeBackend::default();
    execute_collab_send_message(
        serde_json::json!({
            "to": "uds:peer-1",
            "message": "hello"
        }),
        "lead",
        &backend,
    )
    .await
    .expect("local peer output");

    assert_eq!(backend.events(), vec!["send:peer-1"]);
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
