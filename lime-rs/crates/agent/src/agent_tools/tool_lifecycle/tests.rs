use super::*;
use serde_json::json;
use tool_runtime::execution_process::ExecutionOutputKind;

#[test]
fn builds_tool_start_from_planned_execution() {
    let event = tool_start_event_from_planned(&PlannedToolExecution {
        tool_name: "Bash".to_string(),
        tool_id: "tool-1".to_string(),
        arguments: Some(r#"{"command":"echo ok"}"#.to_string()),
        params: json!({ "command": "echo ok" }),
    });

    assert!(matches!(
        event,
        RuntimeAgentEvent::ToolStart { tool_name, tool_id, arguments }
            if tool_name == "Bash"
                && tool_id == "tool-1"
                && arguments.as_deref() == Some(r#"{"command":"echo ok"}"#)
    ));
}

#[test]
fn builds_action_required_from_policy_metadata() {
    let outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-approval".to_string(),
        success: false,
        output: String::new(),
        error: Some("approval required".to_string()),
        metadata: Some(HashMap::from([
            ("eventClass".to_string(), json!("action.required")),
            (
                "reasonCode".to_string(),
                json!("shell_command_requires_approval"),
            ),
            ("command".to_string(), json!("cargo test")),
            ("cwd".to_string(), json!("/Users/coso/project")),
            ("approvalPolicy".to_string(), json!("on_request")),
            (
                "requestedSandboxPolicy".to_string(),
                json!("workspace-write"),
            ),
        ])),
        stream_events: Vec::new(),
    };

    let event = ToolApprovalActionSnapshot::from_outcome(&outcome)
        .expect("action event")
        .into_action_required_event();

    let RuntimeAgentEvent::ActionRequired {
        request_id,
        action_type,
        data,
        ..
    } = event
    else {
        panic!("expected action required event");
    };
    assert_eq!(request_id, "tool-approval");
    assert_eq!(action_type, "tool_confirmation");
    assert_eq!(data.get("toolCallId"), Some(&json!("tool-approval")));
    assert_eq!(data.get("toolName"), Some(&json!("Bash")));
    assert_eq!(data.get("toolFamily"), Some(&json!("shell_command")));
    assert_eq!(data.get("tool_family"), Some(&json!("shell_command")));
    assert_eq!(
        data.get("actionKind"),
        Some(&json!("tool_execution_policy"))
    );
    assert_eq!(
        data.get("action_kind"),
        Some(&json!("tool_execution_policy"))
    );
    assert_eq!(
        data.get("availableDecisions"),
        Some(&json!(["allow_once", "decline", "cancel"]))
    );
    assert_eq!(
        data.get("runtime_contract")
            .and_then(|value| value.get("contract_key")),
        Some(&json!("shell_command"))
    );
    assert_eq!(data.get("contractKey"), Some(&json!("shell_command")));
    assert_eq!(data.get("command"), Some(&json!("cargo test")));
    assert_eq!(data.get("approvalPolicy"), Some(&json!("on_request")));
    assert_eq!(
        data.get("requestedSandboxPolicy"),
        Some(&json!("workspace-write"))
    );
    let approval_scope = data
        .get("approvalScope")
        .expect("approval scope should be present");
    assert_eq!(
        approval_scope.get("contractKey"),
        Some(&json!("shell_command"))
    );
    assert_eq!(
        approval_scope.get("toolFamily"),
        Some(&json!("shell_command"))
    );
    assert_eq!(
        approval_scope.get("riskClass"),
        Some(&json!("shell_command_requires_approval"))
    );
    assert!(approval_scope.get("cwd").is_none());
    assert!(
        approval_scope
            .get("workingDirHash")
            .and_then(|value| value.as_str())
            .is_some_and(|value| value.starts_with("fnv1a64:")),
        "approval scope should contain a non-raw working directory hash"
    );
    assert!(
        !approval_scope.to_string().contains("/Users/coso/project"),
        "approval scope must not leak raw cwd"
    );
}

#[test]
fn builds_action_required_with_distinct_action_and_tool_ids() {
    let outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-call-approval".to_string(),
        success: false,
        output: String::new(),
        error: Some("approval required".to_string()),
        metadata: Some(HashMap::from([
            ("eventClass".to_string(), json!("action.required")),
            ("actionId".to_string(), json!("action-approval")),
            ("toolCallId".to_string(), json!("tool-call-approval")),
            ("command".to_string(), json!("cargo test")),
        ])),
        stream_events: Vec::new(),
    };

    let event = ToolApprovalActionSnapshot::from_outcome(&outcome)
        .expect("action event")
        .into_action_required_event();

    assert!(matches!(
        event,
        RuntimeAgentEvent::ActionRequired { request_id, action_type, data, .. }
            if request_id == "action-approval"
                && action_type == "tool_confirmation"
                && data.get("toolCallId") == Some(&json!("tool-call-approval"))
                && data.get("toolName") == Some(&json!("Bash"))
                && data.get("command") == Some(&json!("cargo test"))
    ));
}

#[test]
fn action_required_preserves_explicit_decision_contract_without_enabling_session_by_default() {
    let outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-explicit-approval".to_string(),
        success: false,
        output: String::new(),
        error: Some("approval required".to_string()),
        metadata: Some(HashMap::from([
            ("eventClass".to_string(), json!("action.required")),
            ("toolFamily".to_string(), json!("shell_command")),
            ("actionKind".to_string(), json!("tool_execution_policy")),
            (
                "availableDecisions".to_string(),
                json!(["allow_once", "allow_for_session", "decline", "cancel"]),
            ),
            (
                "runtime_contract".to_string(),
                json!({
                    "contract_key": "custom_shell_contract",
                    "tool_family": "shell_command",
                    "session_cache_supported": true
                }),
            ),
            (
                "approvalScope".to_string(),
                json!({
                    "contractKey": "custom_shell_contract",
                    "workingDirHash": "sha256:abc",
                }),
            ),
        ])),
        stream_events: Vec::new(),
    };

    let event = ToolApprovalActionSnapshot::from_outcome(&outcome)
        .expect("action event")
        .into_action_required_event();
    let RuntimeAgentEvent::ActionRequired { data, .. } = event else {
        panic!("expected action required event");
    };

    assert_eq!(
        data.get("availableDecisions"),
        Some(&json!([
            "allow_once",
            "allow_for_session",
            "decline",
            "cancel"
        ]))
    );
    assert_eq!(
        data.get("runtime_contract")
            .and_then(|value| value.get("contract_key")),
        Some(&json!("custom_shell_contract"))
    );
    assert_eq!(
        data.get("approvalScope")
            .and_then(|value| value.get("workingDirHash")),
        Some(&json!("sha256:abc"))
    );

    let default_outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-default-approval".to_string(),
        success: false,
        output: String::new(),
        error: Some("approval required".to_string()),
        metadata: Some(HashMap::from([(
            "eventClass".to_string(),
            json!("action.required"),
        )])),
        stream_events: Vec::new(),
    };
    let default_event = ToolApprovalActionSnapshot::from_outcome(&default_outcome)
        .expect("action event")
        .into_action_required_event();
    let RuntimeAgentEvent::ActionRequired { data, .. } = default_event else {
        panic!("expected action required event");
    };
    assert_eq!(
        data.get("availableDecisions"),
        Some(&json!(["allow_once", "decline", "cancel"])),
        "shell approval must not advertise allow_for_session before a scoped cache owner exists"
    );
}

#[test]
fn terminal_snapshot_marks_sandbox_blocked_decision() {
    let outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-sandbox".to_string(),
        success: false,
        output: String::new(),
        error: Some("blocked".to_string()),
        metadata: Some(HashMap::from([
            ("eventClass".to_string(), json!("sandbox.blocked")),
            (
                "reasonCode".to_string(),
                json!("read_only_sandbox_blocks_shell_command"),
            ),
            (
                "reason".to_string(),
                json!("read-only sandbox blocks shell command"),
            ),
        ])),
        stream_events: Vec::new(),
    };

    let snapshot = ToolExecutionTerminalSnapshot::from_outcome(&outcome);

    assert_eq!(
        snapshot.block_decision,
        Some(ToolSandboxDecisionSnapshot {
            kind: ToolBlockDecisionKind::SandboxBlocked,
            reason_code: Some("read_only_sandbox_blocks_shell_command".to_string()),
            reason: Some("read-only sandbox blocks shell command".to_string()),
        })
    );
    assert!(matches!(
        snapshot.into_tool_end_event(),
        RuntimeAgentEvent::ToolEnd { tool_id, result }
            if tool_id == "tool-sandbox"
                && !result.success
                && result.metadata.as_ref().and_then(|metadata| metadata.get("eventClass"))
                    == Some(&json!("sandbox.blocked"))
    ));
}

#[test]
fn terminal_snapshot_adds_tool_correlation_metadata() {
    let outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-terminal".to_string(),
        success: true,
        output: "ok".to_string(),
        error: None,
        metadata: None,
        stream_events: Vec::new(),
    };

    let event = ToolExecutionTerminalSnapshot::from_outcome(&outcome).into_tool_end_event();

    assert!(matches!(
        event,
        RuntimeAgentEvent::ToolEnd { tool_id, result }
            if tool_id == "tool-terminal"
                && result.metadata.as_ref().and_then(|metadata| metadata.get("toolCallId"))
                    == Some(&json!("tool-terminal"))
                && result.metadata.as_ref().and_then(|metadata| metadata.get("toolId"))
                    == Some(&json!("tool-terminal"))
                && result.metadata.as_ref().and_then(|metadata| metadata.get("tool_id"))
                    == Some(&json!("tool-terminal"))
    ));
}

#[test]
fn terminal_snapshot_preserves_existing_tool_correlation_metadata() {
    let outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-terminal".to_string(),
        success: true,
        output: "ok".to_string(),
        error: None,
        metadata: Some(HashMap::from([
            ("toolCallId".to_string(), json!("upstream-call")),
            ("toolId".to_string(), json!("upstream-tool-id")),
            ("tool_id".to_string(), json!("upstream_tool_id")),
            ("source".to_string(), json!("existing")),
        ])),
        stream_events: Vec::new(),
    };

    let event = ToolExecutionTerminalSnapshot::from_outcome(&outcome).into_tool_end_event();

    assert!(matches!(
        event,
        RuntimeAgentEvent::ToolEnd { result, .. }
            if result.metadata.as_ref().and_then(|metadata| metadata.get("toolCallId"))
                == Some(&json!("upstream-call"))
                && result.metadata.as_ref().and_then(|metadata| metadata.get("toolId"))
                    == Some(&json!("upstream-tool-id"))
                && result.metadata.as_ref().and_then(|metadata| metadata.get("tool_id"))
                    == Some(&json!("upstream_tool_id"))
                && result.metadata.as_ref().and_then(|metadata| metadata.get("source"))
                    == Some(&json!("existing"))
    ));
}

#[test]
fn lifecycle_events_filter_output_after_sandbox_block() {
    let planned = PlannedToolExecution {
        tool_name: "Bash".to_string(),
        tool_id: "tool-sandbox".to_string(),
        arguments: Some(r#"{"command":"cargo test"}"#.to_string()),
        params: json!({ "command": "cargo test" }),
    };
    let mut lifecycle = ToolExecutionLifecycleEvents::default();
    let start = lifecycle.start_event(&planned);
    assert!(matches!(
        start,
        RuntimeAgentEvent::ToolStart { tool_id, .. } if tool_id == "tool-sandbox"
    ));

    let outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-sandbox".to_string(),
        success: false,
        output: String::new(),
        error: Some("blocked".to_string()),
        metadata: Some(HashMap::from([
            ("eventClass".to_string(), json!("sandbox.blocked")),
            (
                "reasonCode".to_string(),
                json!("read_only_sandbox_blocks_shell_command"),
            ),
        ])),
        stream_events: vec![RuntimeAgentEvent::ToolOutputDelta {
            tool_id: "tool-sandbox".to_string(),
            delta: "must-not-leak".to_string(),
            output_kind: Some("stdout".to_string()),
            metadata: None,
        }],
    };

    let events = lifecycle.outcome_events(&outcome);

    assert!(
        !events.iter().any(|event| matches!(
            event,
            RuntimeAgentEvent::ToolOutputDelta { tool_id, .. } if tool_id == "tool-sandbox"
        )),
        "blocked tool output delta must not leak after sandbox decision"
    );
    assert!(matches!(
        events.last(),
        Some(RuntimeAgentEvent::ToolEnd { tool_id, result })
            if tool_id == "tool-sandbox"
                && !result.success
                && result.metadata.as_ref().and_then(|metadata| metadata.get("eventClass"))
                    == Some(&json!("sandbox.blocked"))
    ));
}

#[test]
fn lifecycle_events_keep_approval_required_tool_pending() {
    let planned = PlannedToolExecution {
        tool_name: "Bash".to_string(),
        tool_id: "tool-approval".to_string(),
        arguments: Some(r#"{"command":"cargo test"}"#.to_string()),
        params: json!({ "command": "cargo test" }),
    };
    let mut lifecycle = ToolExecutionLifecycleEvents::default();
    lifecycle.start_event(&planned);

    let outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-approval".to_string(),
        success: false,
        output: String::new(),
        error: Some("approval required".to_string()),
        metadata: Some(HashMap::from([
            ("eventClass".to_string(), json!("action.required")),
            (
                "reasonCode".to_string(),
                json!("shell_command_requires_approval"),
            ),
            ("command".to_string(), json!("cargo test")),
        ])),
        stream_events: vec![RuntimeAgentEvent::ToolOutputDelta {
            tool_id: "tool-approval".to_string(),
            delta: "must-not-leak".to_string(),
            output_kind: Some("stdout".to_string()),
            metadata: None,
        }],
    };

    let events = lifecycle.outcome_events(&outcome);

    assert!(
        !events.iter().any(|event| matches!(
            event,
            RuntimeAgentEvent::ToolOutputDelta { tool_id, .. } if tool_id == "tool-approval"
        )),
        "approval-required tool output delta must not leak before approval"
    );
    assert!(events
        .iter()
        .any(|event| matches!(event, RuntimeAgentEvent::ActionRequired { .. })));
    assert!(
        !events.iter().any(|event| matches!(
            event,
            RuntimeAgentEvent::ToolEnd { tool_id, .. } if tool_id == "tool-approval"
        )),
        "approval-required tool must stay pending until the action is resolved"
    );
    assert!(
        lifecycle.outcome_events(&outcome).is_empty(),
        "pending approval must not emit duplicate action-required events"
    );
}

#[test]
fn lifecycle_events_require_action_resolution_before_success_terminal() {
    let planned = PlannedToolExecution {
        tool_name: "Bash".to_string(),
        tool_id: "tool-approval".to_string(),
        arguments: Some(r#"{"command":"cargo test"}"#.to_string()),
        params: json!({ "command": "cargo test" }),
    };
    let mut lifecycle = ToolExecutionLifecycleEvents::default();
    lifecycle.start_event(&planned);

    let approval_outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-approval".to_string(),
        success: false,
        output: String::new(),
        error: Some("approval required".to_string()),
        metadata: Some(HashMap::from([
            ("eventClass".to_string(), json!("action.required")),
            (
                "reasonCode".to_string(),
                json!("shell_command_requires_approval"),
            ),
            ("command".to_string(), json!("cargo test")),
        ])),
        stream_events: Vec::new(),
    };
    let pending_events = lifecycle.outcome_events(&approval_outcome);
    assert!(pending_events
        .iter()
        .any(|event| matches!(event, RuntimeAgentEvent::ActionRequired { .. })));

    let terminal_outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-approval".to_string(),
        success: true,
        output: "ok".to_string(),
        error: None,
        metadata: None,
        stream_events: vec![RuntimeAgentEvent::ToolOutputDelta {
            tool_id: "tool-approval".to_string(),
            delta: "running".to_string(),
            output_kind: Some("stdout".to_string()),
            metadata: None,
        }],
    };
    assert!(
        lifecycle.outcome_events(&terminal_outcome).is_empty(),
        "pending approval must not emit a terminal result before action.resolved"
    );

    let resolved_terminal_outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        metadata: Some(HashMap::from([
            ("actionEventClass".to_string(), json!("action.resolved")),
            ("requestId".to_string(), json!("tool-approval")),
            ("confirmed".to_string(), json!(true)),
        ])),
        ..terminal_outcome
    };
    let terminal_events = lifecycle.outcome_events(&resolved_terminal_outcome);
    let resolved = terminal_events
        .first()
        .expect("approval resolved event should be emitted");
    assert!(matches!(
        resolved,
        RuntimeAgentEvent::ActionResolved {
            request_id,
            action_type,
            data,
            ..
        } if request_id == "tool-approval"
            && action_type == "tool_confirmation"
            && data.get("toolCallId") == Some(&json!("tool-approval"))
            && data.get("toolId") == Some(&json!("tool-approval"))
            && data.get("tool_id") == Some(&json!("tool-approval"))
            && data.get("decision") == Some(&json!("approve"))
    ));
    assert!(terminal_events.iter().any(|event| matches!(
        event,
        RuntimeAgentEvent::ToolOutputDelta { tool_id, delta, .. }
            if tool_id == "tool-approval" && delta == "running"
    )));
    assert!(matches!(
        terminal_events.last(),
        Some(RuntimeAgentEvent::ToolEnd { tool_id, result })
            if tool_id == "tool-approval"
                && result.success
                && result.metadata.as_ref().and_then(|metadata| metadata.get("toolCallId"))
                    == Some(&json!("tool-approval"))
    ));
}

#[test]
fn lifecycle_events_resolve_pending_tool_with_distinct_action_and_tool_ids() {
    let planned = PlannedToolExecution {
        tool_name: "Bash".to_string(),
        tool_id: "tool-call-approval".to_string(),
        arguments: Some(r#"{"command":"cargo test"}"#.to_string()),
        params: json!({ "command": "cargo test" }),
    };
    let mut lifecycle = ToolExecutionLifecycleEvents::default();
    lifecycle.start_event(&planned);

    let approval_outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-call-approval".to_string(),
        success: false,
        output: String::new(),
        error: Some("approval required".to_string()),
        metadata: Some(HashMap::from([
            ("eventClass".to_string(), json!("action.required")),
            ("actionId".to_string(), json!("action-approval")),
            ("toolCallId".to_string(), json!("tool-call-approval")),
        ])),
        stream_events: Vec::new(),
    };
    let pending_events = lifecycle.outcome_events(&approval_outcome);
    assert!(matches!(
        pending_events.first(),
        Some(RuntimeAgentEvent::ActionRequired { request_id, data, .. })
            if request_id == "action-approval"
                && data.get("toolCallId") == Some(&json!("tool-call-approval"))
    ));

    let resolved_terminal_outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "action-approval".to_string(),
        success: true,
        output: "ok".to_string(),
        error: None,
        metadata: Some(HashMap::from([
            ("actionEventClass".to_string(), json!("action.resolved")),
            ("actionId".to_string(), json!("action-approval")),
            ("toolCallId".to_string(), json!("tool-call-approval")),
            ("confirmed".to_string(), json!(true)),
        ])),
        stream_events: vec![RuntimeAgentEvent::ToolOutputDelta {
            tool_id: "tool-call-approval".to_string(),
            delta: "running".to_string(),
            output_kind: Some("stdout".to_string()),
            metadata: None,
        }],
    };

    let terminal_events = lifecycle.outcome_events(&resolved_terminal_outcome);
    assert!(matches!(
        terminal_events.first(),
        Some(RuntimeAgentEvent::ActionResolved { request_id, data, .. })
            if request_id == "action-approval"
                && data.get("toolCallId") == Some(&json!("tool-call-approval"))
                && data.get("toolId") == Some(&json!("tool-call-approval"))
                && data.get("tool_id") == Some(&json!("tool-call-approval"))
    ));
    assert!(terminal_events.iter().any(|event| matches!(
        event,
        RuntimeAgentEvent::ToolOutputDelta { tool_id, delta, .. }
            if tool_id == "tool-call-approval" && delta == "running"
    )));
    assert!(matches!(
        terminal_events.last(),
        Some(RuntimeAgentEvent::ToolEnd { tool_id, result })
            if tool_id == "tool-call-approval"
                && result.success
                && result.metadata.as_ref().and_then(|metadata| metadata.get("toolCallId"))
                    == Some(&json!("tool-call-approval"))
    ));
}

#[test]
fn lifecycle_events_block_success_terminal_after_denied_approval() {
    let planned = PlannedToolExecution {
        tool_name: "Bash".to_string(),
        tool_id: "tool-denied".to_string(),
        arguments: Some(r#"{"command":"cargo test"}"#.to_string()),
        params: json!({ "command": "cargo test" }),
    };
    let mut lifecycle = ToolExecutionLifecycleEvents::default();
    lifecycle.start_event(&planned);

    let approval_outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-denied".to_string(),
        success: false,
        output: String::new(),
        error: Some("approval required".to_string()),
        metadata: Some(HashMap::from([(
            "eventClass".to_string(),
            json!("action.required"),
        )])),
        stream_events: Vec::new(),
    };
    lifecycle.outcome_events(&approval_outcome);

    let success_outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-denied".to_string(),
        success: true,
        output: "should not run".to_string(),
        error: None,
        metadata: Some(HashMap::from([
            ("actionEventClass".to_string(), json!("action.resolved")),
            ("requestId".to_string(), json!("tool-denied")),
            ("confirmed".to_string(), json!(false)),
        ])),
        stream_events: Vec::new(),
    };
    let denied_events = lifecycle.outcome_events(&success_outcome);
    let resolved = denied_events
        .first()
        .expect("approval denied event should be emitted");
    assert!(matches!(
        resolved,
        RuntimeAgentEvent::ActionResolved { data, .. }
            if data.get("decision") == Some(&json!("deny"))
                && data.get("confirmed") == Some(&json!(false))
                && data.get("toolCallId") == Some(&json!("tool-denied"))
    ));
    assert!(
        !denied_events.iter().any(|event| matches!(
            event,
            RuntimeAgentEvent::ToolEnd { tool_id, .. } if tool_id == "tool-denied"
        )),
        "denied approval must not emit a successful terminal result"
    );

    let failed_outcome = ToolExecutionOutcome::<RuntimeAgentEvent> {
        tool_name: "Bash".to_string(),
        tool_id: "tool-denied".to_string(),
        success: false,
        output: String::new(),
        error: Some("approval denied".to_string()),
        metadata: None,
        stream_events: vec![RuntimeAgentEvent::ToolOutputDelta {
            tool_id: "tool-denied".to_string(),
            delta: "must-not-leak".to_string(),
            output_kind: Some("stdout".to_string()),
            metadata: None,
        }],
    };
    let failed_events = lifecycle.outcome_events(&failed_outcome);
    assert!(
        !failed_events.iter().any(|event| matches!(
            event,
            RuntimeAgentEvent::ToolOutputDelta { tool_id, .. } if tool_id == "tool-denied"
        )),
        "denied approval must not leak output deltas"
    );
    assert!(matches!(
        failed_events.last(),
        Some(RuntimeAgentEvent::ToolEnd { tool_id, result })
            if tool_id == "tool-denied"
                && !result.success
                && result.error.as_deref() == Some("approval denied")
                && result.metadata.as_ref().and_then(|metadata| metadata.get("toolCallId"))
                    == Some(&json!("tool-denied"))
    ));
}

#[test]
fn process_lifecycle_event_adds_tool_correlation_metadata() {
    let event = tool_process_lifecycle_event_from_metadata(
        "tool-process",
        HashMap::from([
            ("processId".to_string(), json!("process-tool-process")),
            ("executionProcessStatus".to_string(), json!("running")),
        ]),
    );

    assert!(matches!(
        event,
        RuntimeAgentEvent::ToolOutputDelta {
            tool_id,
            delta,
            output_kind,
            metadata,
        } if tool_id == "tool-process"
            && delta.is_empty()
            && output_kind.as_deref() == Some("process")
            && metadata.as_ref().and_then(|metadata| metadata.get("processId"))
                == Some(&json!("process-tool-process"))
            && metadata.as_ref().and_then(|metadata| metadata.get("executionSurface"))
                == Some(&json!("live_process"))
            && metadata.as_ref().and_then(|metadata| metadata.get("toolCallId"))
                == Some(&json!("tool-process"))
            && metadata.as_ref().and_then(|metadata| metadata.get("toolId"))
                == Some(&json!("tool-process"))
            && metadata.as_ref().and_then(|metadata| metadata.get("tool_id"))
                == Some(&json!("tool-process"))
    ));
}

#[test]
fn process_output_delta_event_adds_tool_correlation_metadata() {
    let event = tool_output_delta_event_from_process_delta(ExecutionOutputDelta {
        process_id: "process-tool-output".to_string(),
        tool_id: "tool-output".to_string(),
        sequence: 7,
        kind: ExecutionOutputKind::Stdout,
        delta: "hello".to_string(),
        bytes: 5,
        omitted_bytes: 0,
        truncated: false,
    });

    assert!(matches!(
        event,
        RuntimeAgentEvent::ToolOutputDelta {
            tool_id,
            delta,
            output_kind,
            metadata,
        } if tool_id == "tool-output"
            && delta == "hello"
            && output_kind.as_deref() == Some("stdout")
            && metadata.as_ref().and_then(|metadata| metadata.get("processId"))
                == Some(&json!("process-tool-output"))
            && metadata.as_ref().and_then(|metadata| metadata.get("outputSequence"))
                == Some(&json!(7))
            && metadata.as_ref().and_then(|metadata| metadata.get("executionSurface"))
                == Some(&json!("live_process"))
            && metadata.as_ref().and_then(|metadata| metadata.get("toolCallId"))
                == Some(&json!("tool-output"))
            && metadata.as_ref().and_then(|metadata| metadata.get("toolId"))
                == Some(&json!("tool-output"))
            && metadata.as_ref().and_then(|metadata| metadata.get("tool_id"))
                == Some(&json!("tool-output"))
    ));
}
