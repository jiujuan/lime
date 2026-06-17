use super::*;
use app_server_protocol::AgentSessionReadParams;
use std::fs;

#[test]
fn commit_preserves_codex_tool_command_and_patch_timeline() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-runtime-events.jsonl");
    fs::write(
        &rollout_path,
        [
            session_meta("thread-runtime-events"),
            event_user_message("run it"),
            response_user_message("run it"),
            response_reasoning("I need to run the project tests first."),
            response_function_call(
                "call_exec",
                "exec_command",
                serde_json::json!({"cmd": "npm test", "workdir": "/workspace/app"}),
            ),
            event_exec_approval_request("call_exec"),
            response_function_call_output(
                "call_exec",
                "Exit code: 0\nWall time: 0 seconds\nOutput:\nok",
            ),
            response_web_search_call("call_search", "search_query"),
            event_web_search_end("call_search", "search_query"),
            event_patch_apply_end("call_patch", true),
            event_agent_message("done"),
            event_user_message("run it"),
            event_agent_message("done again"),
        ]
        .join("\n"),
    )
    .expect("write rollout");
    let core = RuntimeCore::default();

    let response = commit::commit_conversation_import_thread(
        &core,
        ConversationImportThreadCommitParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_path: Some(rollout_path.to_string_lossy().into_owned()),
            confirmed: true,
            ..Default::default()
        },
    )
    .expect("commit");

    assert_eq!(response.imported_turns, 2);

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: response.session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read imported session");
    assert_eq!(read.turns.len(), 2);
    let detail = read.detail.expect("detail");
    let messages = detail["messages"].as_array().expect("messages");
    assert_eq!(
        messages
            .iter()
            .filter(|message| message["role"] == "user")
            .count(),
        2
    );

    let thread_read = &detail["thread_read"];
    let tool_calls = thread_read["tool_calls"].as_array().expect("tool calls");
    assert!(tool_calls.iter().any(|tool| {
        tool["id"] == "call_exec"
            && tool["tool_name"] == "exec_command"
            && tool["status"] == "completed"
    }));
    let commands = thread_read["commands"].as_array().expect("commands");
    assert!(commands.iter().any(|command| {
        command["command_id"] == "call_exec"
            && command["canonical_command"] == "npm test"
            && command["status"] == "completed"
    }));
    assert_eq!(thread_read["change_summary"]["applied_patch_count"], 1);
    assert_eq!(
        thread_read["change_summary"]["changed_files"][0],
        "/workspace/app/src/lib.rs"
    );

    let items = detail["items"].as_array().expect("timeline items");
    let first_turn_id = messages[1]["runtimeTurnId"]
        .as_str()
        .expect("first assistant runtime turn id");
    assert_eq!(
        items
            .iter()
            .filter(|item| { item["type"] == "command_execution" && item["id"] == "call_exec" })
            .count(),
        1
    );
    assert!(items.iter().any(|item| {
        item["type"] == "reasoning"
            && item["turn_id"] == first_turn_id
            && item["text"] == "I need to run the project tests first."
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "command_execution"
            && item["turn_id"] == first_turn_id
            && item["command"] == "npm test"
            && item["aggregated_output"]
                .as_str()
                .is_some_and(|output| output.contains("ok"))
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "patch"
            && item["turn_id"] == first_turn_id
            && item["text"]
                .as_str()
                .is_some_and(|text| text.contains("/workspace/app/src/lib.rs"))
            && item["paths"][0] == "/workspace/app/src/lib.rs"
            && item["success"] == true
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "web_search"
            && item["turn_id"] == first_turn_id
            && item["id"] == "call_search"
            && item["action"] == "search_query"
            && item["status"] == "completed"
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "approval_request"
            && item["turn_id"] == first_turn_id
            && item["request_id"] == "call_exec"
            && item["status"] == "completed"
            && item["response"]["decision"] == "imported_read_only"
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "agent_message"
            && item["turn_id"] == first_turn_id
            && item["text"] == "done"
    }));
    assert!(read.turns.iter().any(|turn| turn.turn_id == first_turn_id));
}

#[test]
fn commit_limits_high_volume_codex_tool_events_without_dropping_messages_or_patches() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-runtime-event-budget.jsonl");
    let mut lines = vec![
        session_meta("thread-runtime-event-budget"),
        event_user_message("big run"),
    ];
    for index in 0..90 {
        let call_id = format!("call_exec_{index}");
        lines.push(response_function_call(
            &call_id,
            "exec_command",
            serde_json::json!({"cmd": format!("echo {index}")}),
        ));
        lines.push(response_function_call_output(
            &call_id,
            "Exit code: 0\nWall time: 0 seconds\nOutput:\nok",
        ));
    }
    lines.push(event_patch_apply_end("call_patch_budget", true));
    lines.push(event_agent_message("done"));
    fs::write(&rollout_path, lines.join("\n")).expect("write rollout");
    let core = RuntimeCore::default();

    let response = commit::commit_conversation_import_thread(
        &core,
        ConversationImportThreadCommitParams {
            source_root: Some(temp.path().to_string_lossy().into_owned()),
            source_path: Some(rollout_path.to_string_lossy().into_owned()),
            confirmed: true,
            ..Default::default()
        },
    )
    .expect("commit");

    assert_eq!(response.imported_turns, 1);
    assert!(response
        .warnings
        .iter()
        .any(|warning| warning.contains("high-volume Codex runtime events")));
    assert!(response.summary.fidelity.budget_dropped > 0);
    assert_eq!(response.summary.fidelity.commands, 90);
    assert_eq!(response.summary.fidelity.patches, 1);

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: response.session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read imported session");
    let detail = read.detail.expect("detail");
    let thread_read = &detail["thread_read"];
    assert_eq!(
        thread_read["commands"].as_array().expect("commands").len(),
        80
    );
    assert_eq!(thread_read["change_summary"]["applied_patch_count"], 1);
}

fn session_meta(thread_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:00.000Z",
        "type": "session_meta",
        "payload": {
            "id": thread_id,
            "timestamp": "2026-06-16T00:00:00.000Z",
            "cwd": "/workspace/app",
            "source": "cli",
            "model_provider": "openai"
        }
    })
    .to_string()
}

fn event_user_message(message: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.000Z",
        "type": "event_msg",
        "payload": {
            "type": "user_message",
            "message": format!("## My request for Codex: {message}")
        }
    })
    .to_string()
}

fn event_agent_message(message: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:02.000Z",
        "type": "event_msg",
        "payload": {
            "type": "agent_message",
            "message": message
        }
    })
    .to_string()
}

fn response_user_message(message: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.100Z",
        "type": "response_item",
        "payload": {
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": message}]
        }
    })
    .to_string()
}

fn response_function_call(call_id: &str, name: &str, arguments: serde_json::Value) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.200Z",
        "type": "response_item",
        "payload": {
            "type": "function_call",
            "call_id": call_id,
            "name": name,
            "arguments": arguments.to_string()
        }
    })
    .to_string()
}

fn response_reasoning(text: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.150Z",
        "type": "response_item",
        "payload": {
            "type": "reasoning",
            "content": [{"type": "reasoning_text", "text": text}],
            "summary": [{"type": "summary_text", "text": text}]
        }
    })
    .to_string()
}

fn response_function_call_output(call_id: &str, output: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.300Z",
        "type": "response_item",
        "payload": {
            "type": "function_call_output",
            "call_id": call_id,
            "output": output
        }
    })
    .to_string()
}

fn response_web_search_call(call_id: &str, action: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.350Z",
        "type": "response_item",
        "payload": {
            "type": "web_search_call",
            "id": call_id,
            "status": "completed",
            "action": action
        }
    })
    .to_string()
}

fn event_web_search_end(call_id: &str, action: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.360Z",
        "type": "event_msg",
        "payload": {
            "type": "web_search_end",
            "call_id": call_id,
            "action": action
        }
    })
    .to_string()
}

fn event_exec_approval_request(call_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.370Z",
        "type": "event_msg",
        "payload": {
            "type": "exec_approval_request",
            "call_id": call_id,
            "command": ["npm", "test"],
            "reason": "Codex needs approval to run tests"
        }
    })
    .to_string()
}

fn event_patch_apply_end(call_id: &str, success: bool) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.400Z",
        "type": "event_msg",
        "payload": {
            "type": "patch_apply_end",
            "call_id": call_id,
            "stdout": "Success. Updated files",
            "stderr": "",
            "success": success,
            "changes": {
                "/workspace/app/src/lib.rs": {"type": "modify"}
            }
        }
    })
    .to_string()
}
