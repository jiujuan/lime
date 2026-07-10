use super::*;
use serde_json::Value;

#[test]
fn normalizes_optional_vec_with_trim_and_dedup() {
    let values = vec![
        " Bash ".to_string(),
        "".to_string(),
        "Bash".to_string(),
        "Read".to_string(),
    ];

    assert_eq!(normalize_optional_vec(&values), vec!["Bash", "Read"]);
}

#[test]
fn parses_peer_address_surface() {
    let address = parse_peer_address("uds: session-1").expect("uds peer address");

    assert_eq!(address.scheme, PeerAddressScheme::Uds);
    assert_eq!(address.target, "session-1");
    assert!(is_cross_session_local_peer_address(&address));
}

#[test]
fn resolves_collab_tool_canonical_names_and_definitions() {
    assert_eq!(
        collab_agent_canonical_tool_name("functions.SendInputTool"),
        Some(SEND_MESSAGE_TOOL_NAME)
    );
    assert_eq!(
        collab_agent_canonical_tool_name("tools__TeamCreateTool"),
        Some(TEAM_CREATE_TOOL_NAME)
    );
    assert_eq!(collab_agent_canonical_tool_name("unknown"), None);

    let definitions = collab_agent_tool_definitions();
    let names = definitions
        .iter()
        .map(|definition| definition.name.as_str())
        .collect::<Vec<_>>();
    assert_eq!(
        names,
        vec![
            AGENT_TOOL_NAME,
            SEND_MESSAGE_TOOL_NAME,
            TEAM_CREATE_TOOL_NAME,
            TEAM_DELETE_TOOL_NAME,
            LIST_PEERS_TOOL_NAME,
        ]
    );
    assert_eq!(
        collab_agent_tool_definition("TeamDeleteTool")
            .expect("team delete definition")
            .name,
        TEAM_DELETE_TOOL_NAME
    );
}

#[test]
fn builds_shutdown_response_message() {
    let message = build_shutdown_response_delivery_message("worker", "req-1", false, Some("busy"))
        .expect("shutdown response message");
    let value: Value = serde_json::from_str(&message).expect("json message");

    assert_eq!(value["type"], "shutdown_rejected");
    assert_eq!(value["from"], "worker");
    assert_eq!(value["request_id"], "req-1");
    assert_eq!(value["reason"], "busy");
}

#[test]
fn builds_team_config_relative_path_from_sanitized_name() {
    assert_eq!(
        team_config_relative_path("My Team!"),
        "teams/my-team-/config.json"
    );
}

#[test]
fn builds_spawn_agent_request_from_input() {
    let request = spawn_agent_request_from_input(
        AgentInput {
            description: " Review ".to_string(),
            prompt: " Read files ".to_string(),
            subagent_type: Some(" explorer ".to_string()),
            model: None,
            run_in_background: true,
            name: Some(" Scout ".to_string()),
            team_name: Some(" Core ".to_string()),
            mode: Some("auto".to_string()),
            isolation: Some("worktree".to_string()),
            reasoning_effort: None,
            fork_context: true,
            allowed_tools: vec![" Bash ".to_string(), "Bash".to_string()],
            disallowed_tools: vec![" Read ".to_string()],
            cwd: Some(" /tmp/project ".to_string()),
        },
        "session-1".to_string(),
    )
    .expect("spawn request");

    assert_eq!(request.description, "Review");
    assert_eq!(request.prompt, "Read files");
    assert_eq!(request.request.parent_session_id, "session-1");
    assert_eq!(request.request.message, "Read files");
    assert_eq!(request.request.name.as_deref(), Some("Scout"));
    assert_eq!(request.request.team_name.as_deref(), Some("Core"));
    assert_eq!(request.request.agent_type.as_deref(), Some("explorer"));
    assert_eq!(request.request.allowed_tools, vec!["Bash"]);
    assert_eq!(request.request.disallowed_tools, vec!["Read"]);
    assert_eq!(request.request.cwd.as_deref(), Some("/tmp/project"));
    assert!(request.request.run_in_background);
    assert!(request.request.fork_context);
}
