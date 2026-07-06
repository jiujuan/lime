use super::*;
use agent_protocol::turn_context::TurnContextOverride;
use agent_runtime::reply_input::RuntimeReplyInputImage;
use serde_json::json;
use std::collections::HashMap;

fn empty_session_config(turn_context: Option<TurnContextOverride>) -> AgentSessionConfig {
    AgentSessionConfig {
        id: "session_native_policy".to_string(),
        thread_id: None,
        turn_id: None,
        schedule_id: None,
        max_turns: None,
        system_prompt: None,
        system_prompt_override: None,
        include_context_trace: None,
        turn_context,
    }
}

#[test]
fn build_reply_message_rejects_image_when_selected_model_is_text_only() {
    let turn_context = TurnContextOverride {
        metadata: HashMap::from([(
            "runtime_options".to_string(),
            json!({
                "harness": {
                    "model_request_policy": {
                        "input_modality_policy": {
                            "input_modalities": ["text"],
                            "supports_image_input": false
                        }
                    }
                }
            }),
        )]),
        ..TurnContextOverride::default()
    };
    let mut input = ReplyInput::text("解释这张图");
    input.images.push(RuntimeReplyInputImage {
        data: "aGVsbG8=".to_string(),
        media_type: "image/png".to_string(),
    });

    let result =
        build_aster_reply_attempt_message(ReplyAttemptInput::from(input), Some(&turn_context));

    assert!(result.is_err());
    assert!(result
        .err()
        .unwrap()
        .contains("input_modality_policy 不支持图片输入"));
}

#[test]
fn build_reply_message_allows_image_when_selected_model_supports_image() {
    let turn_context = TurnContextOverride {
        metadata: HashMap::from([(
            "runtime_options".to_string(),
            json!({
                "harness": {
                    "model_request_policy": {
                        "input_modality_policy": {
                            "input_modalities": ["text", "image"],
                            "supports_image_input": true
                        }
                    }
                }
            }),
        )]),
        ..TurnContextOverride::default()
    };
    let mut input = ReplyInput::text("解释这张图");
    input.images.push(RuntimeReplyInputImage {
        data: "aGVsbG8=".to_string(),
        media_type: "image/png".to_string(),
    });

    let result =
        build_aster_reply_attempt_message(ReplyAttemptInput::from(input), Some(&turn_context));

    assert!(result.is_ok());
}

#[test]
fn attach_native_tool_policy_scope_disallows_unsupported_native_tools() {
    let mut config = empty_session_config(Some(TurnContextOverride {
        metadata: HashMap::from([
            (
                "runtime_options".to_string(),
                json!({
                    "harness": {
                        "model_request_policy": {
                            "native_tool_policy": {
                                "shell_type": "unified_exec",
                                "apply_patch_tool_enabled": true
                            }
                        }
                    }
                }),
            ),
            (
                "tool_scope".to_string(),
                json!({ "disallowed_tools": ["Read", "Bash"] }),
            ),
        ]),
        ..TurnContextOverride::default()
    }));

    attach_native_tool_policy_scope(&mut config);

    let turn_context = config.turn_context.expect("turn context");
    let disallowed_tools = turn_context
        .metadata
        .get("tool_scope")
        .and_then(|value| value.get("disallowed_tools"))
        .and_then(serde_json::Value::as_array)
        .expect("disallowed tools");
    let names = disallowed_tools
        .iter()
        .filter_map(serde_json::Value::as_str)
        .collect::<Vec<_>>();

    assert_eq!(names, vec!["Read", "Bash", "PowerShell", "apply_patch"]);
}
