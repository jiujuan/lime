use super::*;
use serde_json::json;
use std::collections::HashMap;

#[test]
fn model_request_policy_from_metadata_reads_snake_case_harness_policy() {
    let metadata = json!({
        "harness": {
            "model_request_policy": {
                "source": "model_registry",
                "provider_id": "openai",
                "model_id": "gpt-5-codex",
                "responses_policy": {
                    "use_responses_lite": true
                },
                "tool_call_policy": {
                    "supports_parallel_tool_calls": true
                },
                "truncation_policy": {
                    "truncation_policy": {
                        "mode": "tokens",
                        "limit": 4096
                    }
                },
                "native_tool_policy": {
                    "shell_type": "unified-exec",
                    "apply_patch_tool_type": "freeform",
                    "experimental_supported_tools": ["Beta", "beta", "alpha"]
                }
            }
        }
    });

    let policy = model_request_policy_from_metadata(&metadata).expect("policy");

    assert_eq!(policy.source.as_deref(), Some("model_registry"));
    assert_eq!(policy.provider_id.as_deref(), Some("openai"));
    assert_eq!(policy.model_id.as_deref(), Some("gpt-5-codex"));
    assert_eq!(
        policy.responses_policy,
        Some(ModelResponsesPolicySnapshot {
            use_responses_lite: true,
            request_mode: "responses_lite".into(),
            instructions_location: "input_prefix".into(),
            tools_location: "input_prefix".into(),
            reasoning_context: "all_turns".into(),
            parallel_tool_calls_allowed: false,
            requires_responses_lite_header: true,
        })
    );
    assert_eq!(
        policy.tool_call_policy,
        Some(ModelToolCallPolicySnapshot {
            supports_parallel_tool_calls: true,
            parallel_tool_calls: true,
        })
    );
    assert_eq!(
        policy.truncation_policy,
        Some(ModelTruncationPolicySnapshot {
            mode: "tokens".into(),
            limit: 4096,
        })
    );
    assert_eq!(
        policy.native_tool_policy,
        Some(ModelNativeToolPolicySnapshot {
            shell_type: Some("unified_exec".into()),
            shell_tool_enabled: true,
            preferred_shell_surface: Some("unified_exec".into()),
            apply_patch_tool_type: Some("freeform".into()),
            apply_patch_tool_enabled: true,
            experimental_supported_tools: vec!["alpha".into(), "beta".into()],
        })
    );
}

#[test]
fn model_request_policy_from_metadata_accepts_camel_case_aliases() {
    let metadata = json!({
        "harness": {
            "modelRequestPolicy": {
                "providerId": "provider",
                "modelId": "model",
                "responsesPolicy": {
                    "useResponsesLite": false,
                    "parallelToolCallsAllowed": true
                },
                "toolCallPolicy": {
                    "supportsParallelToolCalls": true,
                    "parallelToolCalls": false
                },
                "truncationPolicy": {
                    "mode": "bytes",
                    "limit": 1234
                },
                "nativeToolPolicy": {
                    "shellType": "shell-command",
                    "applyPatchToolEnabled": false
                }
            }
        }
    });

    let policy = model_request_policy_from_metadata(&metadata).expect("policy");

    assert_eq!(policy.provider_id.as_deref(), Some("provider"));
    assert_eq!(policy.model_id.as_deref(), Some("model"));
    assert_eq!(
        policy.tool_call_policy,
        Some(ModelToolCallPolicySnapshot {
            supports_parallel_tool_calls: true,
            parallel_tool_calls: false,
        })
    );
    assert_eq!(
        policy.truncation_policy,
        Some(ModelTruncationPolicySnapshot {
            mode: "bytes".into(),
            limit: 1234,
        })
    );
    assert_eq!(
        policy
            .native_tool_policy
            .as_ref()
            .and_then(|policy| policy.preferred_shell_surface.as_deref()),
        Some("shell_command")
    );
    assert_eq!(
        policy
            .native_tool_policy
            .as_ref()
            .map(|policy| policy.apply_patch_tool_enabled),
        Some(false)
    );
}

#[test]
fn model_request_policy_from_turn_context_reads_runtime_options_first() {
    let context = AgentTurnContext {
        metadata: HashMap::from([
            (
                "aster_chat_request".to_string(),
                json!({
                    "harness": {
                        "model_request_policy": {
                            "provider_id": "older",
                            "tool_call_policy": { "supports_parallel_tool_calls": false }
                        }
                    }
                }),
            ),
            (
                "runtime_options".to_string(),
                json!({
                    "harness": {
                        "model_request_policy": {
                            "provider_id": "newer",
                            "tool_call_policy": { "supports_parallel_tool_calls": true }
                        }
                    }
                }),
            ),
        ]),
        ..AgentTurnContext::default()
    };

    let policy = model_request_policy_from_turn_context(Some(&context)).expect("policy");

    assert_eq!(policy.provider_id.as_deref(), Some("newer"));
    assert_eq!(
        policy
            .tool_call_policy
            .as_ref()
            .map(|policy| policy.parallel_tool_calls),
        Some(true)
    );
}

#[test]
fn invalid_truncation_policy_falls_back_to_codex_default_bytes() {
    let metadata = json!({
        "model_request_policy": {
            "truncation_policy": {
                "truncation_policy": {
                    "mode": "words",
                    "limit": 0
                }
            }
        }
    });

    let policy = model_request_policy_from_metadata(&metadata).expect("policy");

    assert_eq!(
        policy.truncation_policy,
        Some(ModelTruncationPolicySnapshot {
            mode: "bytes".into(),
            limit: DEFAULT_TOOL_OUTPUT_TRUNCATION_BYTES,
        })
    );
}

#[test]
fn runtime_reply_policy_disables_parallel_tool_calls_for_responses_lite() {
    let metadata = json!({
        "model_request_policy": {
            "responses_policy": {
                "use_responses_lite": true
            },
            "tool_call_policy": {
                "supports_parallel_tool_calls": true,
                "parallel_tool_calls": true
            }
        }
    });

    let policy = runtime_reply_model_request_policy_from_metadata(&metadata).expect("policy");

    let responses = policy.responses.as_ref().expect("responses policy");
    assert!(responses.use_responses_lite);
    assert_eq!(responses.request_mode, "responses_lite");
    assert_eq!(responses.instructions_location, "input_prefix");
    assert_eq!(responses.tools_location, "input_prefix");
    assert_eq!(responses.reasoning_context, "all_turns");
    assert!(!responses.parallel_tool_calls_allowed);
    assert!(responses.requires_responses_lite_header);
    assert_eq!(policy.parallel_tool_calls(), Some(false));
}

#[test]
fn runtime_reply_policy_keeps_parallel_tool_calls_when_responses_allows_it() {
    let metadata = json!({
        "model_request_policy": {
            "responses_policy": {
                "use_responses_lite": false,
                "parallel_tool_calls_allowed": true
            },
            "tool_call_policy": {
                "supports_parallel_tool_calls": true,
                "parallel_tool_calls": true
            }
        }
    });

    let policy = runtime_reply_model_request_policy_from_metadata(&metadata).expect("policy");

    let responses = policy.responses.as_ref().expect("responses policy");
    assert!(!responses.use_responses_lite);
    assert_eq!(responses.request_mode, "responses");
    assert_eq!(responses.reasoning_context, "default");
    assert_eq!(policy.parallel_tool_calls(), Some(true));
}

#[test]
fn missing_policy_returns_none() {
    let context = AgentTurnContext {
        metadata: HashMap::from([(
            "runtime_options".to_string(),
            json!({ "harness": { "theme": "draft" } }),
        )]),
        ..AgentTurnContext::default()
    };

    assert!(model_request_policy_from_turn_context(Some(&context)).is_none());
    assert!(model_request_policy_from_metadata(&json!({ "harness": {} })).is_none());
}
