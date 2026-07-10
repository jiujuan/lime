use std::collections::{BTreeMap, HashMap};

use serde_json::{json, Map, Value};

use super::{
    peer_address_scheme_key, BroadcastOutput, CollabAgentSurfaceError, CollabAgentSurfaceResult,
    ListPeersOutput, MessageOutput, MessageRouting, PeerAddressScheme, RequestOutput,
    ResponseOutput, SpawnAgentResponse, StructuredMessage, TeamCreateOutput, TeamDeleteOutput,
    BRIDGE_PEER_UNSUPPORTED_MESSAGE,
};

#[derive(Debug, Clone, PartialEq)]
pub struct SendMessageDelivery {
    pub target: String,
    pub agent_id: String,
    pub submission_id: String,
    pub extra: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SendMessageToolProjection {
    pub output: Value,
    pub metadata: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SpawnAgentToolProjection {
    pub output: String,
    pub metadata: Map<String, Value>,
}

pub fn project_spawn_agent_result(
    description: &str,
    prompt: &str,
    response: &SpawnAgentResponse,
) -> CollabAgentSurfaceResult<SpawnAgentToolProjection> {
    let mut metadata = Map::new();
    metadata.insert(
        "agentId".to_string(),
        Value::String(response.agent_id.clone()),
    );
    metadata.insert(
        "description".to_string(),
        Value::String(description.to_string()),
    );
    metadata.insert("prompt".to_string(), Value::String(prompt.to_string()));
    metadata.insert(
        "name".to_string(),
        Value::String(
            response
                .nickname
                .clone()
                .unwrap_or_else(|| description.to_string()),
        ),
    );
    if !response.extra.is_empty() {
        metadata.insert("extra".to_string(), to_value(&response.extra)?);
    }

    Ok(SpawnAgentToolProjection {
        output: format!("Agent launched: {}", response.agent_id),
        metadata,
    })
}

pub fn project_send_message_unsupported_bridge_peer(
    target: &str,
    summary: Option<&str>,
) -> CollabAgentSurfaceResult<SendMessageToolProjection> {
    let output = to_value(MessageOutput {
        success: false,
        message: BRIDGE_PEER_UNSUPPORTED_MESSAGE.to_string(),
        routing: None,
    })?;
    let mut metadata = output_metadata_map(&output);
    if let Some(summary) = normalize_summary(summary) {
        metadata.insert("summary".to_string(), Value::String(summary));
    }
    metadata.insert("deliveries".to_string(), Value::Array(Vec::new()));
    metadata.insert("target".to_string(), Value::String(target.to_string()));
    metadata.insert(
        "unsupportedTargetScheme".to_string(),
        Value::String(peer_address_scheme_key(PeerAddressScheme::Bridge).to_string()),
    );

    Ok(SendMessageToolProjection { output, metadata })
}

pub fn project_send_message_result(
    target: &str,
    message: &str,
    summary: Option<&str>,
    structured_message: Option<&StructuredMessage>,
    routing: Option<MessageRouting>,
    deliveries: &[SendMessageDelivery],
) -> CollabAgentSurfaceResult<SendMessageToolProjection> {
    let output = match structured_message {
        Some(StructuredMessage::ShutdownRequest { .. }) => {
            let request_id = serde_json::from_str::<Value>(message)
                .ok()
                .and_then(|value| value.get("request_id").cloned())
                .and_then(|value| value.as_str().map(ToString::to_string))
                .ok_or_else(|| {
                    CollabAgentSurfaceError::execution_failed(
                        "shutdown_request 缺少 request_id".to_string(),
                    )
                })?;
            to_value(RequestOutput {
                success: true,
                message: format!("Shutdown request sent to {target}. Request ID: {request_id}"),
                request_id,
                target: target.to_string(),
            })?
        }
        Some(StructuredMessage::ShutdownResponse {
            request_id,
            approve,
            reason,
        }) => to_value(ResponseOutput {
            success: true,
            message: if *approve {
                format!("Shutdown approved. Request ID: {request_id}")
            } else {
                format!(
                    "Shutdown rejected. Reason: \"{}\". Continuing to work.",
                    reason.clone().unwrap_or_default()
                )
            },
            request_id: Some(request_id.clone()),
        })?,
        Some(StructuredMessage::PlanApprovalResponse {
            request_id,
            approve,
            feedback,
        }) => to_value(ResponseOutput {
            success: true,
            message: if *approve {
                format!("Plan approved for {target}. Request ID: {request_id}")
            } else {
                format!(
                    "Plan rejected for {target} with feedback: \"{}\"",
                    feedback
                        .clone()
                        .unwrap_or_else(|| "Plan needs revision".to_string())
                )
            },
            request_id: Some(request_id.clone()),
        })?,
        None if target == "*" => {
            let recipients = deliveries
                .iter()
                .map(|delivery| delivery.target.clone())
                .collect::<Vec<_>>();
            to_value(BroadcastOutput {
                success: true,
                message: if recipients.is_empty() {
                    "No teammates to broadcast to (you are the only team member)".to_string()
                } else {
                    format!(
                        "Message broadcast to {} teammate(s): {}",
                        recipients.len(),
                        recipients.join(", ")
                    )
                },
                recipients,
                routing,
            })?
        }
        None => {
            let label = deliveries
                .first()
                .map(|delivery| delivery.target.as_str())
                .unwrap_or(target)
                .to_string();
            to_value(MessageOutput {
                success: true,
                message: format!("Message sent to {label}"),
                routing,
            })?
        }
    };

    let mut metadata = output_metadata_map(&output);
    if let Some(summary) = normalize_summary(summary) {
        metadata.insert("summary".to_string(), Value::String(summary));
    }
    metadata.insert(
        "deliveries".to_string(),
        Value::Array(deliveries.iter().map(delivery_value).collect()),
    );
    metadata.insert("target".to_string(), Value::String(target.to_string()));
    if let Some(plan_metadata) =
        plan_approval_response_metadata(structured_message, deliveries.first())
    {
        metadata.insert("plan_approval_response".to_string(), plan_metadata);
    }

    Ok(SendMessageToolProjection { output, metadata })
}

pub fn team_create_metadata(output: &TeamCreateOutput) -> HashMap<String, Value> {
    HashMap::from([
        ("teamName".to_string(), json!(output.team_name)),
        ("leadAgentId".to_string(), json!(output.lead_agent_id)),
        ("taskListId".to_string(), json!(output.team_name)),
    ])
}

pub fn team_delete_metadata(
    output: &TeamDeleteOutput,
    active_members: &[String],
) -> HashMap<String, Value> {
    let mut metadata = HashMap::from([
        ("success".to_string(), json!(output.success)),
        ("teamName".to_string(), json!(output.team_name)),
    ]);
    if !active_members.is_empty() {
        metadata.insert("activeMembers".to_string(), json!(active_members));
    }
    metadata
}

pub fn list_peers_metadata(output: &ListPeersOutput) -> HashMap<String, Value> {
    let peers = output
        .peers
        .iter()
        .map(|peer| {
            json!({
                "name": peer.name,
                "agentId": peer.agent_id,
                "agentType": peer.agent_type,
                "isLead": peer.is_lead,
                "sendTo": peer.send_to,
            })
        })
        .collect::<Vec<_>>();

    HashMap::from([
        ("teamName".to_string(), json!(output.team_name)),
        ("peers".to_string(), json!(peers)),
    ])
}

fn to_value<T: serde::Serialize>(value: T) -> CollabAgentSurfaceResult<Value> {
    serde_json::to_value(value).map_err(|error| {
        CollabAgentSurfaceError::execution_failed(format!("序列化 SendMessage 结果失败: {error}"))
    })
}

fn output_metadata_map(output: &Value) -> Map<String, Value> {
    match output {
        Value::Object(map) => map.clone(),
        _ => Map::new(),
    }
}

fn normalize_summary(summary: Option<&str>) -> Option<String> {
    summary
        .map(str::trim)
        .filter(|summary| !summary.is_empty())
        .map(ToString::to_string)
}

fn delivery_value(delivery: &SendMessageDelivery) -> Value {
    json!({
        "target": delivery.target,
        "agentId": delivery.agent_id,
        "submissionId": delivery.submission_id,
        "extra": delivery.extra,
    })
}

fn plan_approval_response_metadata(
    structured_message: Option<&StructuredMessage>,
    first_delivery: Option<&SendMessageDelivery>,
) -> Option<Value> {
    let Some(StructuredMessage::PlanApprovalResponse {
        request_id,
        approve,
        feedback,
    }) = structured_message
    else {
        return None;
    };

    Some(json!({
        "type": "plan_approval_response",
        "request_id": request_id,
        "approved": approve,
        "feedback": feedback,
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "delivery_target": first_delivery.map(|delivery| delivery.target.as_str()),
        "target_session_id": first_delivery.map(|delivery| delivery.agent_id.as_str()),
        "delivery_submission_id": first_delivery.map(|delivery| delivery.submission_id.as_str()),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projects_plain_broadcast_without_recipients() {
        let projection = project_send_message_result(
            "*",
            "hello",
            Some(" status "),
            None,
            Some(MessageRouting {
                sender: "lead".to_string(),
                sender_color: None,
                target: "@team".to_string(),
                target_color: None,
                summary: Some("status".to_string()),
                content: Some("hello".to_string()),
            }),
            &[],
        )
        .expect("projection");

        assert_eq!(projection.output["success"], true);
        assert_eq!(
            projection.output["message"],
            "No teammates to broadcast to (you are the only team member)"
        );
        assert_eq!(projection.metadata["summary"], "status");
        assert_eq!(projection.metadata["deliveries"], json!([]));
    }

    #[test]
    fn projects_plan_approval_metadata_from_first_delivery() {
        let delivery = SendMessageDelivery {
            target: "worker".to_string(),
            agent_id: "session-2".to_string(),
            submission_id: "submission-1".to_string(),
            extra: BTreeMap::new(),
        };

        let projection = project_send_message_result(
            "worker",
            "{}",
            None,
            Some(&StructuredMessage::PlanApprovalResponse {
                request_id: "plan-1".to_string(),
                approve: true,
                feedback: None,
            }),
            None,
            &[delivery],
        )
        .expect("projection");

        assert_eq!(
            projection.metadata["plan_approval_response"]["target_session_id"],
            "session-2"
        );
        assert_eq!(projection.output["request_id"], "plan-1");
    }

    #[test]
    fn projects_team_metadata() {
        let output = TeamDeleteOutput {
            success: false,
            message: "blocked".to_string(),
            team_name: Some("core".to_string()),
        };
        let metadata = team_delete_metadata(&output, &["worker".to_string()]);

        assert_eq!(metadata["success"], false);
        assert_eq!(metadata["teamName"], "core");
        assert_eq!(metadata["activeMembers"], json!(["worker"]));
    }

    #[test]
    fn projects_spawn_agent_metadata() {
        let mut extra = BTreeMap::new();
        extra.insert("team".to_string(), json!("core"));
        let projection = project_spawn_agent_result(
            "Review",
            "Read files",
            &SpawnAgentResponse {
                agent_id: "agent-1".to_string(),
                nickname: None,
                extra,
            },
        )
        .expect("projection");

        assert_eq!(projection.output, "Agent launched: agent-1");
        assert_eq!(projection.metadata["agentId"], "agent-1");
        assert_eq!(projection.metadata["name"], "Review");
        assert_eq!(projection.metadata["extra"]["team"], "core");
    }
}
