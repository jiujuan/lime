use super::*;
use crate::runtime::SidecarStore;
use app_server_protocol::{
    AgentSessionReadParams, ConversationImportThreadRuntimeEventsReadParams,
};
use std::fs;
use std::sync::Arc;

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
            response_function_call(
                "call_read_file",
                "read_file",
                serde_json::json!({"path": "/workspace/app/docs/imported-preview.md"}),
            ),
            response_function_call_output("call_read_file", "imported preview"),
            response_function_call(
                "call_read_html",
                "read_file",
                serde_json::json!({"path": "/workspace/app/docs/imported-preview.html"}),
            ),
            response_function_call_output("call_read_html", "imported html preview"),
            response_function_call(
                "call_read_docx",
                "read_file",
                serde_json::json!({"path": "/workspace/app/docs/imported-preview.docx"}),
            ),
            response_function_call_output("call_read_docx", "imported docx preview"),
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
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let sidecar_store = Arc::new(SidecarStore::new(sidecar_root.path()).expect("sidecar store"));
    let core = RuntimeCore::default().with_sidecar_store(sidecar_store.clone());

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
        item["type"] == "tool_call"
            && item["turn_id"] == first_turn_id
            && item["id"] == "call_read_file"
            && item["tool_name"] == "read_file"
            && item["arguments"]["path"] == "/workspace/app/docs/imported-preview.md"
            && item["output"] == "imported preview"
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "tool_call"
            && item["turn_id"] == first_turn_id
            && item["id"] == "call_read_html"
            && item["tool_name"] == "read_file"
            && item["arguments"]["path"] == "/workspace/app/docs/imported-preview.html"
            && item["output"] == "imported html preview"
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "tool_call"
            && item["turn_id"] == first_turn_id
            && item["id"] == "call_read_docx"
            && item["tool_name"] == "read_file"
            && item["arguments"]["path"] == "/workspace/app/docs/imported-preview.docx"
            && item["output"] == "imported docx preview"
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

#[tokio::test]
async fn commit_preserves_high_volume_codex_tool_events_with_bounded_default_projection() {
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
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let sidecar_store = Arc::new(SidecarStore::new(sidecar_root.path()).expect("sidecar store"));
    let core = RuntimeCore::default().with_sidecar_store(sidecar_store.clone());

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
    assert!(!response
        .warnings
        .iter()
        .any(|warning| warning.contains("high-volume local history runtime events")));
    assert_eq!(response.summary.fidelity.budget_dropped, 0);
    assert_eq!(response.summary.fidelity.commands, 90);
    assert_eq!(response.summary.fidelity.patches, 1);
    let projection = response
        .session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
        .and_then(|metadata| metadata.get("importedRuntimeProjection"))
        .expect("imported runtime projection metadata");
    assert_eq!(projection["mode"], "default_window");
    assert_eq!(projection["sourceRuntimeEvents"], 454);
    assert_eq!(projection["materializedCommandToolCalls"], 80);
    assert_eq!(projection["skippedCommandToolCalls"], 10);
    assert_eq!(projection["fullFidelity"], "source_rollout_or_sidecar");
    let sidecar_relative_path = projection["sidecar"]["relativePath"]
        .as_str()
        .expect("sidecar relative path");
    let sidecar_content = sidecar_store
        .read_text(sidecar_relative_path)
        .expect("sidecar content");
    assert_eq!(sidecar_content.lines().count(), 454);
    assert!(sidecar_content.contains("\"eventType\":\"command.started\""));
    let session_id = response.session.session_id.clone();

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session_id.clone(),
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
    let items = detail["items"].as_array().expect("timeline items");
    assert_eq!(
        items
            .iter()
            .filter(|item| item["type"] == "command_execution")
            .count(),
        80
    );

    let first_page = core
        .read_conversation_import_runtime_events(ConversationImportThreadRuntimeEventsReadParams {
            session_id: session_id.clone(),
            offset: Some(0),
            limit: Some(5),
            turn_index: None,
            event_type: None,
        })
        .await
        .expect("read imported event detail");
    assert_eq!(first_page.total_events, 454);
    assert_eq!(first_page.events.len(), 5);
    assert_eq!(first_page.next_offset, Some(5));
    assert_eq!(first_page.source_runtime_events, 454);
    assert_eq!(first_page.materialized_runtime_events, 404);
    assert_eq!(first_page.sidecar_runtime_events, 50);
    assert_eq!(first_page.events[0].source_event_index, 0);
    assert_eq!(first_page.events[0].turn_index, 0);
    assert_eq!(first_page.events[0].event_index, 0);

    let command_output_page = core
        .read_conversation_import_runtime_events(ConversationImportThreadRuntimeEventsReadParams {
            session_id,
            offset: Some(80),
            limit: Some(20),
            turn_index: Some(0),
            event_type: Some("command.started".to_string()),
        })
        .await
        .expect("read filtered imported event detail");
    assert_eq!(command_output_page.total_events, 90);
    assert_eq!(command_output_page.events.len(), 10);
    assert!(command_output_page.next_offset.is_none());
    assert!(command_output_page
        .events
        .iter()
        .all(|event| event.event_type == "command.started"));
}

#[tokio::test]
async fn commit_applies_import_runtime_projection_budget_per_thread() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp
        .path()
        .join("rollout-runtime-event-thread-budget.jsonl");
    let mut lines = vec![
        session_meta("thread-runtime-event-thread-budget"),
        event_user_message("first big run"),
    ];
    for index in 0..60 {
        let call_id = format!("call_exec_first_{index}");
        lines.push(response_function_call(
            &call_id,
            "exec_command",
            serde_json::json!({"cmd": format!("echo first {index}")}),
        ));
        lines.push(response_function_call_output(
            &call_id,
            "Exit code: 0\nWall time: 0 seconds\nOutput:\nok",
        ));
    }
    lines.push(event_agent_message("first done"));
    lines.push(event_user_message("second big run"));
    for index in 0..60 {
        let call_id = format!("call_exec_second_{index}");
        lines.push(response_function_call(
            &call_id,
            "exec_command",
            serde_json::json!({"cmd": format!("echo second {index}")}),
        ));
        lines.push(response_function_call_output(
            &call_id,
            "Exit code: 0\nWall time: 0 seconds\nOutput:\nok",
        ));
    }
    lines.push(event_agent_message("second done"));
    fs::write(&rollout_path, lines.join("\n")).expect("write rollout");
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let sidecar_store = Arc::new(SidecarStore::new(sidecar_root.path()).expect("sidecar store"));
    let core = RuntimeCore::default().with_sidecar_store(sidecar_store.clone());

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
    assert_eq!(response.summary.fidelity.commands, 120);
    let projection = response
        .session
        .business_object_ref
        .as_ref()
        .and_then(|reference| reference.metadata.as_ref())
        .and_then(|metadata| metadata.get("importedRuntimeProjection"))
        .expect("imported runtime projection metadata");
    // 每个 exec_command 会规范化为 tool start/result + command start/output/exited。
    assert_eq!(projection["sourceRuntimeEvents"], 604);
    assert_eq!(projection["materializedCommandToolCalls"], 80);
    assert_eq!(projection["skippedCommandToolCalls"], 40);

    let session_id = response.session.session_id.clone();
    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session_id.clone(),
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
    assert!(thread_read["commands"]
        .as_array()
        .expect("commands")
        .iter()
        .any(|command| command["command_id"] == "call_exec_second_19"));
    assert!(!thread_read["commands"]
        .as_array()
        .expect("commands")
        .iter()
        .any(|command| command["command_id"] == "call_exec_second_20"));

    let second_turn_page = core
        .read_conversation_import_runtime_events(ConversationImportThreadRuntimeEventsReadParams {
            session_id,
            offset: Some(0),
            limit: Some(200),
            turn_index: Some(1),
            event_type: Some("command.started".to_string()),
        })
        .await
        .expect("read second turn full imported event detail");
    assert_eq!(second_turn_page.total_events, 60);
    assert!(second_turn_page
        .events
        .iter()
        .any(|event| event.payload["commandId"] == "call_exec_second_59"));
}

#[test]
fn commit_preserves_imported_assistant_message_order_between_runtime_events() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-runtime-event-order.jsonl");
    fs::write(
        &rollout_path,
        [
            session_meta("thread-runtime-event-order"),
            event_user_message("inspect first"),
            event_agent_message("我先说明第一步。"),
            response_reasoning("Need to inspect the project."),
            response_function_call(
                "call_exec_order",
                "exec_command",
                serde_json::json!({"cmd": "ls", "workdir": "/workspace/app"}),
            ),
            response_function_call_output(
                "call_exec_order",
                "Exit code: 0\nWall time: 0 seconds\nOutput:\nCargo.toml",
            ),
            event_agent_message("命令执行完成。"),
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

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: response.session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read imported session");
    let detail = read.detail.expect("detail");
    let items = detail["items"].as_array().expect("timeline items");

    let ordered_types_and_text = items
        .iter()
        .map(|item| {
            (
                item["type"].as_str().unwrap_or_default().to_string(),
                item["text"]
                    .as_str()
                    .or_else(|| item["command"].as_str())
                    .unwrap_or_default()
                    .to_string(),
            )
        })
        .collect::<Vec<_>>();
    let first_assistant_index = ordered_types_and_text
        .iter()
        .position(|(kind, text)| kind == "agent_message" && text == "我先说明第一步。")
        .expect("first assistant message item");
    let reasoning_index = ordered_types_and_text
        .iter()
        .position(|(kind, text)| kind == "reasoning" && text == "Need to inspect the project.")
        .expect("reasoning item");
    let command_index = ordered_types_and_text
        .iter()
        .position(|(kind, text)| kind == "command_execution" && text == "ls")
        .expect("command item");
    let second_assistant_index = ordered_types_and_text
        .iter()
        .position(|(kind, text)| kind == "agent_message" && text == "命令执行完成。")
        .expect("second assistant message item");

    assert!(first_assistant_index < reasoning_index);
    assert!(reasoning_index < command_index);
    assert!(command_index < second_assistant_index);
    assert!(items.iter().any(|item| {
        item["type"] == "command_execution"
            && item["id"] == "call_exec_order"
            && item["status"] == "completed"
            && item["exit_code"] == 0
    }));
    assert!(!items.iter().any(|item| {
        item["type"] == "command_execution"
            && item["id"] == "call_exec_order"
            && item["status"] == "failed"
    }));
}

#[tokio::test]
async fn commit_delays_imported_turn_terminal_until_after_late_runtime_events() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp
        .path()
        .join("rollout-late-runtime-after-terminal.jsonl");
    fs::write(
        &rollout_path,
        [
            session_meta("thread-late-runtime-after-terminal"),
            event_user_message("run after terminal"),
            event_turn_complete("turn-source-1"),
            response_function_call(
                "call_late_exec",
                "exec_command",
                serde_json::json!({"cmd": "echo late", "workdir": "/workspace/app"}),
            ),
            response_function_call_output(
                "call_late_exec",
                "Exit code: 0\nWall time: 0 seconds\nOutput:\nlate",
            ),
            event_agent_message("late answer"),
        ]
        .join("\n"),
    )
    .expect("write rollout");
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let sidecar_store = Arc::new(SidecarStore::new(sidecar_root.path()).expect("sidecar store"));
    let core = RuntimeCore::default().with_sidecar_store(sidecar_store.clone());

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
    let session_id = response.session.session_id.clone();
    let read = core
        .read_session(AgentSessionReadParams {
            session_id: session_id.clone(),
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read imported session");
    let detail = read.detail.expect("detail");
    let items = detail["items"].as_array().expect("timeline items");
    assert!(items.iter().any(|item| {
        item["type"] == "command_execution"
            && item["id"] == "call_late_exec"
            && item["status"] == "completed"
            && item["aggregated_output"]
                .as_str()
                .is_some_and(|output| output.contains("late"))
    }));
    assert!(items
        .iter()
        .any(|item| { item["type"] == "agent_message" && item["text"] == "late answer" }));

    let detail_page = core
        .read_conversation_import_runtime_events(ConversationImportThreadRuntimeEventsReadParams {
            session_id,
            offset: Some(0),
            limit: Some(32),
            turn_index: Some(0),
            event_type: None,
        })
        .await
        .expect("read imported event detail");
    let event_types = detail_page
        .events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    let terminal_index = event_types
        .iter()
        .rposition(|event_type| *event_type == "turn.completed")
        .expect("turn completed event");
    let command_index = event_types
        .iter()
        .position(|event_type| *event_type == "command.started")
        .expect("command started event");
    let message_index = event_types
        .iter()
        .rposition(|event_type| *event_type == "message.delta")
        .expect("assistant message event");
    assert!(command_index < terminal_index);
    assert!(message_index < terminal_index);
    assert_eq!(terminal_index, event_types.len() - 1);
}

#[test]
fn commit_preserves_imported_update_plan_timeline_item() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-update-plan.jsonl");
    fs::write(
        &rollout_path,
        [
            session_meta("thread-update-plan"),
            event_user_message("plan the work"),
            response_reasoning("Need to create a concise checklist."),
            response_function_call(
                "call_update_plan",
                "update_plan",
                serde_json::json!({
                    "explanation": "Imported planning checkpoint",
                    "plan": [
                        {"step": "Inspect imported timeline", "status": "completed"},
                        {"step": "Project plan item", "status": "in_progress"},
                        {"step": "Verify rendering order", "status": "pending"}
                    ]
                }),
            ),
            event_agent_message("Plan captured."),
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

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: response.session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read imported session");
    let detail = read.detail.expect("detail");
    let items = detail["items"].as_array().expect("timeline items");
    let plan = items
        .iter()
        .find(|item| item["type"] == "plan")
        .expect("plan item");

    assert_eq!(plan["status"], "completed");
    assert!(plan["text"]
        .as_str()
        .is_some_and(|text| text.contains("Project plan item")));
    assert_eq!(plan["metadata"]["source_client"], "codex");
    assert_eq!(plan["metadata"]["tool_call_id"], "call_update_plan");
    assert_eq!(
        plan["metadata"]["explanation"],
        "Imported planning checkpoint"
    );
    assert_eq!(
        plan["metadata"]["plan"][0]["step"],
        "Inspect imported timeline"
    );
    assert_eq!(plan["metadata"]["plan"][1]["status"], "in_progress");

    let ordered_types = items
        .iter()
        .map(|item| item["type"].as_str().unwrap_or_default())
        .collect::<Vec<_>>();
    let reasoning_index = ordered_types
        .iter()
        .position(|kind| *kind == "reasoning")
        .expect("reasoning item");
    let plan_index = ordered_types
        .iter()
        .position(|kind| *kind == "plan")
        .expect("plan item");
    assert!(!items
        .iter()
        .any(|item| item["type"] == "tool_call" && item["id"] == "call_update_plan"));
    assert!(reasoning_index < plan_index);
}

#[test]
fn commit_preserves_imported_completed_plan_item() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-completed-plan-item.jsonl");
    fs::write(
        &rollout_path,
        [
            session_meta("thread-completed-plan-item"),
            event_user_message("draft a plan"),
            event_completed_plan_item(
                "turn-plan-item",
                "item-plan-1",
                "# Final plan\n- first\n- second\n",
            ),
            event_agent_message("Plan ready."),
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

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: response.session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read imported session");
    let detail = read.detail.expect("detail");
    let items = detail["items"].as_array().expect("timeline items");
    let plan = items
        .iter()
        .find(|item| item["type"] == "plan")
        .expect("plan item");

    assert_eq!(plan["status"], "completed");
    assert_eq!(plan["text"], "# Final plan\n- first\n- second");
    assert_eq!(plan["metadata"]["source_client"], "codex");
    assert_eq!(plan["metadata"]["source_item_id"], "item-plan-1");
    assert_eq!(
        plan["metadata"]["source_provenance"]["sourcePayloadType"],
        "item_completed"
    );
    assert!(items
        .iter()
        .any(|item| item["type"] == "agent_message" && item["text"] == "Plan ready."));
}

#[test]
fn commit_projects_codex_runtime_specialized_items_into_existing_timeline_types() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-specialized-runtime-items.jsonl");
    fs::write(
        &rollout_path,
        [
            session_meta("thread-specialized-runtime-items"),
            event_user_message("import specialized runtime items"),
            event_mcp_tool_call_begin("call_mcp"),
            event_mcp_tool_call_end("call_mcp"),
            event_dynamic_tool_call_request("call_dynamic"),
            event_dynamic_tool_call_response("call_dynamic"),
            event_view_image_tool_call("call_image_view"),
            event_image_generation_begin("call_image_gen"),
            event_image_generation_end("call_image_gen"),
            event_context_compacted(),
            event_entered_review_mode("Review current changes."),
            event_exited_review_mode("Review findings:\n- src/lib.rs: looks good"),
            event_subagent_activity("subagent-event-1"),
            event_collab_agent_spawn_begin("call_collab"),
            event_collab_agent_spawn_end("call_collab"),
            event_agent_message("Specialized items imported."),
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

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: response.session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read imported session");
    let detail = read.detail.expect("detail");
    let items = detail["items"].as_array().expect("timeline items");

    assert!(items.iter().any(|item| {
        item["type"] == "tool_call"
            && item["id"] == "call_mcp"
            && item["tool_name"] == "mcp__filesystem__read_file"
            && item["status"] == "completed"
            && item["arguments"]["path"] == "src/lib.rs"
            && item["metadata"]["source_client"] == "codex"
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "tool_call"
            && item["id"] == "call_dynamic"
            && item["tool_name"] == "docs.lookup"
            && item["output"] == "dynamic result"
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "tool_call"
            && item["id"] == "call_image_view"
            && item["tool_name"] == "view_image"
            && item["arguments"]["path"] == "/workspace/app/assets/input.png"
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "tool_call"
            && item["id"] == "call_image_gen"
            && item["tool_name"] == "image_generation"
            && item["output"] == "/workspace/app/assets/result.png"
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "context_compaction"
            && item["status"] == "completed"
            && item["stage"] == "completed"
            && item["metadata"]["source_client"] == "codex"
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "reasoning"
            && item["text"] == "Review current changes."
            && item["metadata"]["source_client"] == "codex"
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "agent_message"
            && item["text"]
                .as_str()
                .is_some_and(|text| text.contains("Review findings"))
            && item["metadata"]["source_client"] == "codex"
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "subagent_activity"
            && item["id"] == "subagent-event-1"
            && item["status_label"] == "running"
            && item["session_id"] == "subagent-thread-1"
    }));
    assert!(items.iter().any(|item| {
        item["type"] == "tool_call"
            && item["id"] == "call_collab"
            && item["tool_name"] == "agent"
            && item["status"] == "completed"
            && item["output"] == "subagent-thread-2"
    }));
}

#[test]
fn commit_merges_duplicate_user_messages_when_response_item_precedes_event_msg() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-duplicate-user-reversed.jsonl");
    fs::write(
        &rollout_path,
        [
            session_meta("thread-duplicate-user-reversed"),
            response_user_message("first user message"),
            event_user_message("first user message"),
            event_agent_message("first answer"),
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

    assert_eq!(response.imported_turns, 1);

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: response.session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read imported session");
    let detail = read.detail.expect("detail");
    let messages = detail["messages"].as_array().expect("messages");
    assert_eq!(
        messages
            .iter()
            .filter(|message| message["role"] == "user")
            .count(),
        1
    );
    assert_eq!(messages[0]["content"][0]["text"], "first user message");
    assert_eq!(messages[0]["timestamp"], 1781568001);
    assert_eq!(messages[1]["content"][0]["text"], "first answer");
}

#[test]
fn commit_closes_incomplete_imported_lifecycles_without_failed_timeline_items() {
    let temp = tempfile::tempdir().expect("tempdir");
    let rollout_path = temp.path().join("rollout-incomplete-lifecycle.jsonl");
    fs::write(
        &rollout_path,
        [
            session_meta("thread-incomplete-lifecycle"),
            event_user_message("run incomplete tool"),
            response_function_call(
                "call_incomplete",
                "exec_command",
                serde_json::json!({"cmd": "npm test", "workdir": "/workspace/app"}),
            ),
            response_function_call(
                "call_tool_incomplete",
                "read_file",
                serde_json::json!({"path": "src/lib.rs"}),
            ),
            event_patch_started("patch_incomplete"),
            event_agent_message("imported answer"),
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

    let read = core
        .read_session(AgentSessionReadParams {
            session_id: response.session.session_id,
            history_limit: None,
            history_offset: None,
            history_before_message_id: None,
        })
        .expect("read imported session");
    let detail = read.detail.expect("detail");
    let items = detail["items"].as_array().expect("timeline items");
    let command = items
        .iter()
        .find(|item| item["type"] == "command_execution" && item["id"] == "call_incomplete")
        .expect("command item");
    assert_eq!(command["status"], "completed");
    assert_eq!(command["metadata"]["imported_incomplete"], true);
    let tool = items
        .iter()
        .find(|item| item["type"] == "tool_call" && item["id"] == "call_tool_incomplete")
        .expect("tool item");
    assert_eq!(tool["status"], "completed");
    assert_eq!(tool["metadata"]["imported_incomplete"], true);
    let patch = items
        .iter()
        .find(|item| item["type"] == "patch" && item["id"] == "patch_incomplete")
        .expect("patch item");
    assert_eq!(patch["status"], "completed");
    assert_eq!(patch["metadata"]["imported_incomplete"], true);
    assert!(!items.iter().any(|item| item["status"] == "failed"));
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

fn event_turn_complete(turn_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.375Z",
        "type": "event_msg",
        "payload": {
            "type": "turn_complete",
            "turn_id": turn_id,
            "completed_at": "2026-06-16T00:00:01.375Z",
            "duration_ms": 10
        }
    })
    .to_string()
}

fn event_completed_plan_item(turn_id: &str, item_id: &str, text: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.380Z",
        "type": "event_msg",
        "payload": {
            "type": "item_completed",
            "thread_id": "thread-completed-plan-item",
            "turn_id": turn_id,
            "completed_at_ms": 1781568001380_i64,
            "item": {
                "type": "Plan",
                "id": item_id,
                "text": text
            }
        }
    })
    .to_string()
}

fn event_mcp_tool_call_begin(call_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.381Z",
        "type": "event_msg",
        "payload": {
            "type": "mcp_tool_call_begin",
            "call_id": call_id,
            "invocation": {
                "server": "filesystem",
                "tool": "read_file",
                "arguments": {"path": "src/lib.rs"}
            }
        }
    })
    .to_string()
}

fn event_mcp_tool_call_end(call_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.382Z",
        "type": "event_msg",
        "payload": {
            "type": "mcp_tool_call_end",
            "call_id": call_id,
            "invocation": {
                "server": "filesystem",
                "tool": "read_file",
                "arguments": {"path": "src/lib.rs"}
            },
            "result": {
                "Ok": {
                    "isError": false,
                    "content": [{"type": "text", "text": "file content"}]
                }
            }
        }
    })
    .to_string()
}

fn event_dynamic_tool_call_request(call_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.383Z",
        "type": "event_msg",
        "payload": {
            "type": "dynamic_tool_call_request",
            "call_id": call_id,
            "namespace": "docs",
            "tool": "lookup",
            "arguments": {"query": "timeline"}
        }
    })
    .to_string()
}

fn event_dynamic_tool_call_response(call_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.384Z",
        "type": "event_msg",
        "payload": {
            "type": "dynamic_tool_call_response",
            "call_id": call_id,
            "namespace": "docs",
            "tool": "lookup",
            "arguments": {"query": "timeline"},
            "success": true,
            "content_items": [{"type": "input_text", "text": "dynamic result"}]
        }
    })
    .to_string()
}

fn event_view_image_tool_call(call_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.385Z",
        "type": "event_msg",
        "payload": {
            "type": "view_image_tool_call",
            "call_id": call_id,
            "path": "/workspace/app/assets/input.png"
        }
    })
    .to_string()
}

fn event_image_generation_begin(call_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.386Z",
        "type": "event_msg",
        "payload": {
            "type": "image_generation_begin",
            "call_id": call_id,
            "prompt": "draw a timeline"
        }
    })
    .to_string()
}

fn event_image_generation_end(call_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.387Z",
        "type": "event_msg",
        "payload": {
            "type": "image_generation_end",
            "call_id": call_id,
            "status": "completed",
            "result": "/workspace/app/assets/result.png",
            "saved_path": "/workspace/app/assets/result.png"
        }
    })
    .to_string()
}

fn event_context_compacted() -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.388Z",
        "type": "event_msg",
        "payload": {
            "type": "context_compacted"
        }
    })
    .to_string()
}

fn event_entered_review_mode(review: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.389Z",
        "type": "event_msg",
        "payload": {
            "type": "entered_review_mode",
            "user_facing_hint": review
        }
    })
    .to_string()
}

fn event_exited_review_mode(review: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.391Z",
        "type": "event_msg",
        "payload": {
            "type": "exited_review_mode",
            "review": review
        }
    })
    .to_string()
}

fn event_subagent_activity(event_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.392Z",
        "type": "event_msg",
        "payload": {
            "type": "sub_agent_activity",
            "event_id": event_id,
            "kind": "started",
            "agent_thread_id": "subagent-thread-1",
            "agent_path": "agents/reviewer.md"
        }
    })
    .to_string()
}

fn event_collab_agent_spawn_begin(call_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.393Z",
        "type": "event_msg",
        "payload": {
            "type": "collab_agent_spawn_begin",
            "call_id": call_id,
            "sender_thread_id": "main-thread",
            "prompt": "review imported timeline",
            "model": "gpt-5.5"
        }
    })
    .to_string()
}

fn event_collab_agent_spawn_end(call_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.394Z",
        "type": "event_msg",
        "payload": {
            "type": "collab_agent_spawn_end",
            "call_id": call_id,
            "sender_thread_id": "main-thread",
            "prompt": "review imported timeline",
            "model": "gpt-5.5",
            "new_thread_id": "subagent-thread-2",
            "status": "running"
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

fn event_patch_started(call_id: &str) -> String {
    serde_json::json!({
        "timestamp": "2026-06-16T00:00:01.390Z",
        "type": "event_msg",
        "payload": {
            "type": "patch_apply_begin",
            "call_id": call_id,
            "changes": {
                "/workspace/app/src/lib.rs": {"type": "modify"}
            }
        }
    })
    .to_string()
}
