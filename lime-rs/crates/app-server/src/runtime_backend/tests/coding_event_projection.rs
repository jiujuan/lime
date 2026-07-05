use super::*;

#[test]
fn runtime_agent_tool_events_are_mirrored_to_coding_facts() {
    let mut sink = TestRuntimeEventSink::default();
    let mut mirror = coding_events::CodingEventMirror::default();

    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolStart {
            tool_name: "Bash".to_string(),
            tool_id: "tool-test".to_string(),
            arguments: Some(
                json!({ "command": "cargo test -p app-server coding_events" }).to_string(),
            ),
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool start should emit");
    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolOutputDelta {
            tool_id: "tool-test".to_string(),
            delta: "running tests".to_string(),
            output_kind: Some("stdout".to_string()),
            metadata: None,
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool output should emit");
    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-test".to_string(),
            result: AgentToolResult {
                success: true,
                output: "ok".to_string(),
                error: None,
                structured_content: None,
                images: None,
                metadata: Some(HashMap::from([
                    ("exit_code".to_string(), json!(0)),
                    (
                        "command".to_string(),
                        json!("cargo test -p app-server coding_events"),
                    ),
                ])),
            },
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool end should emit");

    let event_types = sink
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "tool.started",
            "tool.args",
            "command.started",
            "test.started",
            "tool.output.delta",
            "command.output",
            "tool.result",
            "command.exited",
            "test.completed"
        ]
    );
    let args_event = sink
        .events
        .iter()
        .find(|event| event.event_type == "tool.args")
        .expect("tool args event");
    assert_eq!(args_event.payload["toolCallId"].as_str(), Some("tool-test"));
    assert_eq!(
        args_event.payload["args"]["command"].as_str(),
        Some("cargo test -p app-server coding_events")
    );
    assert_eq!(
        args_event.payload["source"].as_str(),
        Some("runtime_tool_start")
    );
    let command_started = sink
        .events
        .iter()
        .find(|event| event.event_type == "command.started")
        .expect("command started event");
    assert_eq!(
        command_started.payload["canonicalCommand"].as_str(),
        Some("cargo test -p app-server coding_events")
    );
    assert_eq!(
        command_started.payload["commandSummary"].as_str(),
        Some("cargo test -p app-server")
    );
    assert_eq!(
        command_started.payload["commandArgv"]
            .as_array()
            .expect("argv"),
        &vec![
            json!("cargo"),
            json!("test"),
            json!("-p"),
            json!("app-server"),
            json!("coding_events")
        ]
    );
    let command_exited = sink
        .events
        .iter()
        .find(|event| event.event_type == "command.exited")
        .expect("command exited event");
    assert_eq!(
        command_exited.payload["canonicalCommand"].as_str(),
        Some("cargo test -p app-server coding_events")
    );
}

#[test]
fn model_effective_event_records_selected_model_and_reasoning_policy() {
    let selection = RuntimeModelSelection {
        provider: "openai".to_string(),
        model: "gpt-codex".to_string(),
        source: "runtime_options",
        reasoning_effort: Some("high".to_string()),
    };
    let provider_config = SessionProviderConfig {
        provider_name: "openai".to_string(),
        provider_selector: Some("openai-main".to_string()),
        model_name: "gpt-codex".to_string(),
        api_key: Some("sk-test".to_string()),
        base_url: Some("https://api.example.test/v1".to_string()),
        credential_uuid: None,
        reasoning_effort: Some("high".to_string()),
        route_protocol: None,
        toolshim: false,
        toolshim_model: None,
        model_capabilities: None,
    };

    let snapshot = reasoning_capability_snapshot(&["low", "medium", "high", "max", "xhigh"]);
    let event = model_effective_event_from_runtime(
        &selection,
        &selection,
        &provider_config,
        "coding",
        &snapshot,
    );

    assert_eq!(event.event_type, "model.effective");
    assert_eq!(event.payload["model"]["providerId"], "openai-main");
    assert_eq!(event.payload["model"]["modelId"], "gpt-codex");
    assert_eq!(event.payload["modelRef"]["providerId"], "openai-main");
    assert_eq!(event.payload["reasoning"]["supported"], true);
    assert_eq!(event.payload["reasoning"]["requestedLevel"], "high");
    assert_eq!(event.payload["reasoning"]["effectiveLevel"], "high");
    assert_eq!(event.payload["toolCalling"]["supported"], true);
    assert_eq!(event.payload["requestedReasoningEffort"], "high");
    assert_eq!(event.payload["effectiveReasoningEffort"], "high");
    assert_eq!(event.payload["serviceModelSlot"], "coding");
    assert_eq!(event.payload["source"], "runtime_options");
}

#[test]
fn model_effective_event_records_requested_and_effective_reasoning_separately() {
    let requested_selection = RuntimeModelSelection {
        provider: "openai".to_string(),
        model: "gpt-codex".to_string(),
        source: "profile_model_slot",
        reasoning_effort: Some("minimal".to_string()),
    };
    let effective_selection = selection_with_effective_reasoning(&requested_selection);
    let provider_config = SessionProviderConfig {
        provider_name: "openai".to_string(),
        provider_selector: Some("openai-main".to_string()),
        model_name: "gpt-codex".to_string(),
        api_key: Some("sk-test".to_string()),
        base_url: Some("https://api.example.test/v1".to_string()),
        credential_uuid: None,
        reasoning_effort: effective_selection.reasoning_effort.clone(),
        route_protocol: None,
        toolshim: false,
        toolshim_model: None,
        model_capabilities: None,
    };

    let snapshot = reasoning_capability_snapshot(&["low", "medium", "high", "max", "xhigh"]);
    let event = model_effective_event_from_runtime(
        &requested_selection,
        &effective_selection,
        &provider_config,
        "fast",
        &snapshot,
    );

    assert_eq!(event.payload["reasoning"]["requestedLevel"], "minimal");
    assert_eq!(event.payload["reasoning"]["effectiveLevel"], "low");
    assert_eq!(
        event.payload["reasoning"]["downgradeReason"],
        "requested reasoning level is not supported by selected model"
    );
    assert_eq!(event.payload["requestedReasoningEffort"], "minimal");
    assert_eq!(event.payload["effectiveReasoningEffort"], "low");
}

#[test]
fn model_effective_event_uses_route_capability_snapshot_over_model_slug() {
    let selection = RuntimeModelSelection {
        provider: "openai".to_string(),
        model: "gpt-codex".to_string(),
        source: "runtime_options",
        reasoning_effort: Some("high".to_string()),
    };
    let provider_config = SessionProviderConfig {
        provider_name: "openai".to_string(),
        provider_selector: Some("relay-openai".to_string()),
        model_name: "gpt-codex".to_string(),
        api_key: Some("sk-test".to_string()),
        base_url: Some("https://api.example.test/v1".to_string()),
        credential_uuid: None,
        reasoning_effort: Some("high".to_string()),
        route_protocol: None,
        toolshim: false,
        toolshim_model: None,
        model_capabilities: None,
    };
    let snapshot = no_reasoning_capability_snapshot();

    let event = model_effective_event_from_runtime(
        &selection,
        &selection,
        &provider_config,
        "coding",
        &snapshot,
    );

    assert_eq!(event.payload["reasoning"]["supported"], false);
    assert_eq!(event.payload["reasoning"]["requestedLevel"], "high");
    assert!(event.payload["reasoning"].get("effectiveLevel").is_none());
    assert_eq!(
        event.payload["reasoning"]["downgradeReason"],
        "selected model does not support reasoning"
    );
}

fn reasoning_capability_snapshot(levels: &[&str]) -> app_server_protocol::CapabilitySnapshot {
    app_server_protocol::CapabilitySnapshot {
        runtime_features: vec!["streaming".to_string(), "reasoning".to_string()],
        capabilities: app_server_protocol::ModelCapabilitiesInfo {
            tools: true,
            streaming: true,
            reasoning: true,
            reasoning_effort: Some(json!({
                "supported": true,
                "levels": levels,
            })),
            ..Default::default()
        },
        ..Default::default()
    }
}

fn no_reasoning_capability_snapshot() -> app_server_protocol::CapabilitySnapshot {
    app_server_protocol::CapabilitySnapshot {
        runtime_features: vec!["streaming".to_string()],
        capabilities: app_server_protocol::ModelCapabilitiesInfo {
            tools: true,
            streaming: true,
            reasoning: false,
            reasoning_effort: Some(json!({
                "supported": false,
                "levels": [],
            })),
            ..Default::default()
        },
        ..Default::default()
    }
}

#[test]
fn runtime_thinking_delta_emits_reasoning_lifecycle_events() {
    let mut sink = TestRuntimeEventSink::default();
    let mut mirror = coding_events::CodingEventMirror::default();
    let mut proposed_plan_parser = proposed_plan_parser::ProposedPlanParser::default();
    let mut reasoning_state = reasoning_events::ReasoningEventState::default();

    emit_runtime_agent_event_with_coding_mirror_and_plan_parser(
        &RuntimeAgentEvent::ThinkingDelta {
            text: "先理解目标".to_string(),
        },
        &mut sink,
        &mut mirror,
        &mut proposed_plan_parser,
        &mut reasoning_state,
    )
    .expect("thinking delta should emit");
    emit_reasoning_finish(&mut reasoning_state, "completed", &mut sink)
        .expect("reasoning finish should emit");

    let event_types = sink
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "reasoning.started",
            "reasoning.delta",
            "reasoning.final",
            "reasoning.ended",
        ]
    );
    assert_eq!(sink.events[0].payload["reasoningId"], "runtime-thinking");
    assert_eq!(sink.events[1].payload["delta"], "先理解目标");
    assert_eq!(sink.events[2].payload["text"], "先理解目标");
    assert_eq!(sink.events[3].payload["status"], "completed");
}

#[test]
fn runtime_agent_failed_shell_tool_is_mirrored_to_coding_facts() {
    let mut sink = TestRuntimeEventSink::default();
    let mut mirror = coding_events::CodingEventMirror::default();

    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolStart {
            tool_name: "Bash".to_string(),
            tool_id: "tool-failed".to_string(),
            arguments: Some(json!({ "command": "cargo test -p app-server missing" }).to_string()),
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool start should emit");
    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-failed".to_string(),
            result: AgentToolResult {
                success: false,
                output: "test failed".to_string(),
                error: Some("exit code 101".to_string()),
                structured_content: None,
                images: None,
                metadata: Some(HashMap::from([
                    ("exit_code".to_string(), json!(101)),
                    ("failureCategory".to_string(), json!("test_failed")),
                    (
                        "command".to_string(),
                        json!("cargo test -p app-server missing"),
                    ),
                ])),
            },
        },
        &mut sink,
        &mut mirror,
    )
    .expect("failed tool end should emit");

    let event_types = sink
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "tool.started",
            "tool.args",
            "command.started",
            "test.started",
            "tool.failed",
            "command.output",
            "command.exited",
            "test.completed"
        ]
    );
    let failed_event = sink
        .events
        .iter()
        .find(|event| event.event_type == "tool.failed")
        .expect("tool failed event");
    assert_eq!(
        failed_event.payload["toolCallId"].as_str(),
        Some("tool-failed")
    );
    assert_eq!(failed_event.payload["status"].as_str(), Some("failed"));
    assert_eq!(
        failed_event.payload["failureCategory"].as_str(),
        Some("test_failed")
    );
    assert_eq!(
        failed_event.payload["error"].as_str(),
        Some("exit code 101")
    );
    assert_eq!(failed_event.payload["output"].as_str(), Some("test failed"));
}

#[test]
fn runtime_agent_permission_denied_fact_precedes_tool_failed_terminal() {
    let mut sink = TestRuntimeEventSink::default();
    let mut mirror = coding_events::CodingEventMirror::default();

    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolStart {
            tool_name: "Bash".to_string(),
            tool_id: "tool-denied".to_string(),
            arguments: Some(json!({ "command": "rm -rf important" }).to_string()),
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool start should emit");
    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-denied".to_string(),
            result: AgentToolResult {
                success: false,
                output: String::new(),
                error: Some("policy denied this command".to_string()),
                structured_content: None,
                images: None,
                metadata: Some(HashMap::from([(
                    "reasonCode".to_string(),
                    json!("dangerous_command"),
                )])),
            },
        },
        &mut sink,
        &mut mirror,
    )
    .expect("failed tool end should emit");

    let event_types = sink
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "tool.started",
            "tool.args",
            "command.started",
            "permission.denied",
            "tool.failed",
            "command.exited"
        ]
    );
    let denied = sink
        .events
        .iter()
        .find(|event| event.event_type == "permission.denied")
        .expect("permission denied event");
    assert_eq!(denied.payload["toolCallId"].as_str(), Some("tool-denied"));
    assert_eq!(
        denied.payload["reasonCode"].as_str(),
        Some("dangerous_command")
    );
}

#[test]
fn runtime_agent_read_tool_result_is_mirrored_to_file_read() {
    let mut sink = TestRuntimeEventSink::default();
    let mut mirror = coding_events::CodingEventMirror::default();

    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolStart {
            tool_name: "Read".to_string(),
            tool_id: "tool-read".to_string(),
            arguments: Some(json!({ "path": "src/App.tsx" }).to_string()),
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool start should emit");
    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-read".to_string(),
            result: AgentToolResult {
                success: true,
                output: "1 | export {}".to_string(),
                error: None,
                structured_content: None,
                images: None,
                metadata: Some(HashMap::from([("file_type".to_string(), json!("text"))])),
            },
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool end should emit");

    let event_types = sink
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec!["tool.started", "tool.args", "tool.result", "file.read"]
    );
    assert_eq!(
        sink.events.last().expect("file read event").payload["path"].as_str(),
        Some("src/App.tsx")
    );
}

#[test]
fn runtime_agent_shell_apply_patch_is_mirrored_to_patch_lifecycle() {
    let mut sink = TestRuntimeEventSink::default();
    let mut mirror = coding_events::CodingEventMirror::default();

    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolStart {
            tool_name: "Bash".to_string(),
            tool_id: "tool-patch-shell".to_string(),
            arguments: Some(
                json!({
                    "command": "apply_patch <<'PATCH'\n*** Begin Patch\n*** Add File: notes/live.md\n+hello\n*** End Patch\nPATCH"
                })
                .to_string(),
            ),
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool start should emit");
    emit_runtime_agent_event_with_coding_mirror(
        &RuntimeAgentEvent::ToolEnd {
            tool_id: "tool-patch-shell".to_string(),
            result: AgentToolResult {
                success: true,
                output: "ok".to_string(),
                error: None,
                structured_content: None,
                images: None,
                metadata: Some(HashMap::from([
                    ("exit_code".to_string(), json!(0)),
                    ("command".to_string(), json!("apply_patch <<'PATCH'")),
                ])),
            },
        },
        &mut sink,
        &mut mirror,
    )
    .expect("tool end should emit");

    let event_types = sink
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        event_types,
        vec![
            "tool.started",
            "tool.args",
            "patch.started",
            "command.started",
            "tool.result",
            "command.output",
            "command.exited",
            "patch.applied",
        ]
    );
}
