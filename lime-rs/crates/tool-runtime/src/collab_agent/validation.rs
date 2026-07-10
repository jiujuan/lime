use super::{
    CollabAgentSurfaceError, CollabAgentSurfaceResult, ParsedPeerAddress, StructuredMessage,
};

pub fn normalize_peer_address_target(
    address: &ParsedPeerAddress,
) -> CollabAgentSurfaceResult<String> {
    let target = address.target.trim();
    if target.is_empty() {
        return Err(CollabAgentSurfaceError::invalid_params(
            "address target must not be empty",
        ));
    }

    Ok(target.to_string())
}

pub fn validate_send_message_payload(
    target: &str,
    summary: Option<&str>,
    message_is_string: bool,
    structured_message: Option<&StructuredMessage>,
    is_local_peer_target: bool,
) -> CollabAgentSurfaceResult<()> {
    if message_is_string && summary.is_none() && !is_local_peer_target {
        return Err(CollabAgentSurfaceError::invalid_params(
            "summary is required when message is a string",
        ));
    }

    if structured_message.is_some() && is_local_peer_target {
        return Err(CollabAgentSurfaceError::invalid_params(
            "structured messages cannot be sent cross-session — only plain text",
        ));
    }

    if target == "*" && structured_message.is_some() {
        return Err(CollabAgentSurfaceError::invalid_params(
            "structured messages cannot be broadcast (to: \"*\")",
        ));
    }

    Ok(())
}

pub fn validate_shutdown_response_target(
    canonical_target: &str,
    structured_message: Option<&StructuredMessage>,
) -> CollabAgentSurfaceResult<()> {
    let Some(StructuredMessage::ShutdownResponse {
        approve, reason, ..
    }) = structured_message
    else {
        return Ok(());
    };

    if canonical_target != "team-lead" {
        return Err(CollabAgentSurfaceError::invalid_params(
            "shutdown_response must be sent to \"team-lead\"",
        ));
    }

    if !approve && reason.as_deref().unwrap_or("").trim().is_empty() {
        return Err(CollabAgentSurfaceError::invalid_params(
            "reason is required when rejecting a shutdown request",
        ));
    }

    Ok(())
}

pub fn send_message_requires_team_lead(structured_message: Option<&StructuredMessage>) -> bool {
    matches!(
        structured_message,
        Some(StructuredMessage::PlanApprovalResponse { .. })
    )
}

pub fn validate_plan_approval_sender(
    structured_message: Option<&StructuredMessage>,
    is_team_lead: bool,
) -> CollabAgentSurfaceResult<()> {
    let Some(StructuredMessage::PlanApprovalResponse { approve, .. }) = structured_message else {
        return Ok(());
    };

    if is_team_lead {
        return Ok(());
    }

    Err(CollabAgentSurfaceError::invalid_params(if *approve {
        "Only the team lead can approve plans. Teammates cannot approve their own or other plans."
    } else {
        "Only the team lead can reject plans. Teammates cannot reject their own or other plans."
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan_approval(approve: bool) -> StructuredMessage {
        StructuredMessage::PlanApprovalResponse {
            request_id: "plan-1".to_string(),
            approve,
            feedback: None,
        }
    }

    #[test]
    fn normalizes_peer_address_target() {
        let address = ParsedPeerAddress {
            scheme: super::super::PeerAddressScheme::Uds,
            target: " session-1 ".to_string(),
        };

        assert_eq!(
            normalize_peer_address_target(&address).expect("peer target"),
            "session-1"
        );
    }

    #[test]
    fn rejects_string_message_without_summary_for_agent_target() {
        let error = validate_send_message_payload("worker", None, true, None, false)
            .expect_err("summary required");

        assert_eq!(
            error.message(),
            "summary is required when message is a string"
        );
    }

    #[test]
    fn allows_string_message_without_summary_for_local_peer_target() {
        validate_send_message_payload("uds:session-2", None, true, None, true)
            .expect("local peer plain text");
    }

    #[test]
    fn rejects_structured_cross_session_and_broadcast_messages() {
        let message = StructuredMessage::ShutdownRequest { reason: None };
        let cross_session_error =
            validate_send_message_payload("uds:session-2", None, false, Some(&message), true)
                .expect_err("structured local peer message");
        let broadcast_error =
            validate_send_message_payload("*", Some("plan"), false, Some(&message), false)
                .expect_err("structured broadcast");

        assert_eq!(
            cross_session_error.message(),
            "structured messages cannot be sent cross-session — only plain text"
        );
        assert_eq!(
            broadcast_error.message(),
            "structured messages cannot be broadcast (to: \"*\")"
        );
    }

    #[test]
    fn validates_shutdown_response_target_and_reason() {
        let message = StructuredMessage::ShutdownResponse {
            request_id: "shutdown-1".to_string(),
            approve: false,
            reason: None,
        };

        let wrong_target =
            validate_shutdown_response_target("worker", Some(&message)).expect_err("target");
        let missing_reason = validate_shutdown_response_target("team-lead", Some(&message))
            .expect_err("reject reason");

        assert_eq!(
            wrong_target.message(),
            "shutdown_response must be sent to \"team-lead\""
        );
        assert_eq!(
            missing_reason.message(),
            "reason is required when rejecting a shutdown request"
        );
    }

    #[test]
    fn validates_plan_approval_sender() {
        let approved = plan_approval(true);
        let rejected = plan_approval(false);

        assert!(send_message_requires_team_lead(Some(&approved)));
        assert_eq!(
            validate_plan_approval_sender(Some(&approved), false)
                .expect_err("approve must be lead")
                .message(),
            "Only the team lead can approve plans. Teammates cannot approve their own or other plans."
        );
        assert_eq!(
            validate_plan_approval_sender(Some(&rejected), false)
                .expect_err("reject must be lead")
                .message(),
            "Only the team lead can reject plans. Teammates cannot reject their own or other plans."
        );
        validate_plan_approval_sender(Some(&approved), true).expect("team lead");
    }
}
