use super::*;

#[test]
fn explicit_runtime_preferences_win() {
    let mut request = request_for_test("hello", None, None);
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("deepseek".to_string());
    options.model_preference = Some("deepseek-chat".to_string());
    request.provider_preference = options.provider_preference.clone();
    request.model_preference = options.model_preference.clone();

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    assert_eq!(
        selection,
        RuntimeModelSelection {
            provider: "deepseek".to_string(),
            model: "deepseek-chat".to_string(),
            source: "runtime_options",
            reasoning_effort: None,
        }
    );
}

#[test]
fn fast_response_fast_slot_can_override_default_runtime_preferences() {
    let mut request = request_for_test(
        "只回答一个字：好",
        None,
        Some(json!({
            "harness": {
                "fast_response_routing": {
                    "mode": "auto",
                    "service_model_slot": "responsive_chat"
                },
                "model_slots": {
                    "fast": {
                        "provider": "responsive-provider",
                        "model": "fast-chat",
                        "source": "service_models.responsive_chat",
                        "reason": "fast_response_routing"
                    }
                }
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("deepseek".to_string());
    options.model_preference = Some("deepseek-chat".to_string());

    let selection =
        fast_response_selection_from_profile_model_slot(&request).expect("fast selection");

    assert_eq!(
        selection,
        RuntimeModelSelection {
            provider: "responsive-provider".to_string(),
            model: "fast-chat".to_string(),
            source: "profile_model_slot",
            reasoning_effort: None,
        }
    );
}

#[test]
fn runtime_model_selection_prefers_fast_slot_for_fast_response_turn() {
    let mut request = request_for_test(
        "只回答一个字：好",
        None,
        Some(json!({
            "harness": {
                "modelReasoningEffort": "minimal",
                "fast_response_routing": {
                    "mode": "auto",
                    "service_model_slot": "responsive_chat"
                },
                "model_slots": {
                    "fast": {
                        "provider": "responsive-provider",
                        "model": "fast-chat",
                        "source": "service_models.responsive_chat",
                        "reason": "fast_response_routing"
                    }
                }
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("deepseek".to_string());
    options.model_preference = Some("deepseek-chat".to_string());

    let selection = resolve_runtime_model_selection(&request).expect("selection");

    assert_eq!(selection.provider, "responsive-provider");
    assert_eq!(selection.model, "fast-chat");
    assert_eq!(selection.source, "profile_model_slot");
    assert_eq!(selection.reasoning_effort.as_deref(), Some("minimal"));
    let effective_selection = selection_with_effective_reasoning(&selection);
    assert_eq!(effective_selection.reasoning_effort, None);

    let scope = session_scope_from_request(&request).expect("scope");
    let turn_context =
        turn_context_from_request(&request, None, &scope, &effective_selection, None)
            .expect("turn context");
    assert_eq!(turn_context.effort, None);
}

#[test]
fn effective_reasoning_selection_drops_unsupported_plain_chat_reasoning() {
    let selection = RuntimeModelSelection {
        provider: "openai-compatible".to_string(),
        model: "gpt-4o-mini".to_string(),
        source: "runtime_options",
        reasoning_effort: Some("minimal".to_string()),
    };

    let effective_selection = selection_with_effective_reasoning(&selection);

    assert_eq!(effective_selection.reasoning_effort, None);
}

#[test]
fn effective_reasoning_selection_maps_minimal_for_reasoning_models() {
    let selection = RuntimeModelSelection {
        provider: "openai".to_string(),
        model: "gpt-codex".to_string(),
        source: "runtime_options",
        reasoning_effort: Some("minimal".to_string()),
    };

    let effective_selection = selection_with_effective_reasoning(&selection);

    assert_eq!(effective_selection.reasoning_effort.as_deref(), Some("low"));
}

#[test]
fn fast_response_without_complete_fast_slot_keeps_explicit_preferences() {
    let mut request = request_for_test(
        "只回答一个字：好",
        None,
        Some(json!({
            "harness": {
                "fast_response_routing": {
                    "mode": "auto",
                    "service_model_slot": "responsive_chat"
                }
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("deepseek".to_string());
    options.model_preference = Some("deepseek-chat".to_string());

    assert!(fast_response_selection_from_profile_model_slot(&request).is_none());

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    assert_eq!(selection.provider, "deepseek");
    assert_eq!(selection.model, "deepseek-chat");
}

#[test]
fn host_provider_config_without_direct_credentials_stays_database_backed() {
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "provider_config": {
                    "provider_id": "database-openai",
                    "provider_name": "openai",
                    "model_name": "gpt-4.1"
                },
                "provider_preference": "database-openai",
                "model_preference": "gpt-4.1"
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);
    let selection = selection_from_host_provider_config(&request).expect("selection");

    let direct_config = direct_provider_config_from_request(
        host_request.as_ref(),
        &selection,
        selection.reasoning_effort.clone(),
    );

    assert!(direct_config.is_none());
    assert_eq!(selection.provider, "database-openai");
    assert_eq!(selection.model, "gpt-4.1");
    assert_eq!(selection.source, "host_options_provider_config");
}

#[test]
fn imported_session_source_model_is_not_session_default_route() {
    let request = imported_request_with_session_metadata(json!({
        "providerName": "openai",
        "modelName": "gpt-5.5",
        "sourceClient": "codex",
        "importedContinuation": {
            "modelProvider": "openai",
            "model": "gpt-5.5"
        }
    }));

    assert!(selection_from_session_default(&request).is_none());
}

#[test]
fn imported_session_current_provider_selector_remains_session_default_route() {
    let request = imported_request_with_session_metadata(json!({
        "providerSelector": "custom-current-provider",
        "providerName": "openai",
        "modelName": "gpt-5.5",
        "sourceClient": "codex",
        "importedContinuation": {
            "modelProvider": "openai",
            "model": "gpt-5.5"
        }
    }));

    let selection = selection_from_session_default(&request).expect("selection");

    assert_eq!(selection.provider, "custom-current-provider");
    assert_eq!(selection.model, "gpt-5.5");
    assert_eq!(selection.source, "session_default");
}

#[test]
fn direct_host_provider_config_allows_localhost_fixture_without_database_provider() {
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "provider_config": {
                    "provider_id": "fixture-openai",
                    "provider_name": "openai",
                    "model_name": "lime-fixture-chat",
                    "api_key": "fixture-key",
                    "base_url": "http://127.0.0.1:56599",
                    "tool_call_strategy": "native"
                },
                "provider_preference": "fixture-openai",
                "model_preference": "lime-fixture-chat",
                "reasoning_effort": "high"
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);
    let selection = selection_from_host_provider_config(&request).expect("selection");

    let direct_config = direct_provider_config_from_request(
        host_request.as_ref(),
        &selection,
        selection.reasoning_effort.clone(),
    )
    .expect("direct provider config");

    assert_eq!(direct_config.provider_name, "openai");
    assert_eq!(
        direct_config.provider_selector.as_deref(),
        Some("fixture-openai")
    );
    assert_eq!(direct_config.model_name, "lime-fixture-chat");
    assert_eq!(direct_config.api_key.as_deref(), Some("fixture-key"));
    assert_eq!(
        direct_config.base_url.as_deref(),
        Some("http://127.0.0.1:56599")
    );
    assert_eq!(direct_config.reasoning_effort.as_deref(), Some("high"));
    assert!(!direct_config.toolshim);
}

#[test]
fn runtime_options_metadata_reasoning_flows_to_selection_and_turn_context() {
    let mut request = request_for_test(
        "hello",
        None,
        Some(json!({
            "turn_config": {
                "reasoning_effort": "medium"
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    assert_eq!(selection.reasoning_effort.as_deref(), Some("medium"));

    let scope = session_scope_from_request(&request).expect("scope");
    let turn_context =
        turn_context_from_request(&request, None, &scope, &selection, None).expect("turn context");

    assert_eq!(turn_context.effort.as_deref(), Some("medium"));
}

#[test]
fn model_request_policy_reasoning_default_flows_to_selection_and_turn_context() {
    let mut request = request_for_test(
        "hello",
        None,
        Some(json!({
            "harness": {
                "model_request_policy": {
                    "reasoning_policy": {
                        "supports_reasoning_summary_parameter": false,
                        "default_reasoning_level": "high"
                    }
                }
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    assert_eq!(selection.reasoning_effort.as_deref(), Some("high"));

    let scope = session_scope_from_request(&request).expect("scope");
    let turn_context =
        turn_context_from_request(&request, None, &scope, &selection, None).expect("turn context");

    assert_eq!(turn_context.effort.as_deref(), Some("high"));
}

#[test]
fn explicit_reasoning_effort_wins_over_model_request_policy_default() {
    let mut request = request_for_test(
        "hello",
        None,
        Some(json!({
            "harness": {
                "reasoning_effort": "low",
                "model_request_policy": {
                    "reasoning_policy": {
                        "supports_reasoning_summary_parameter": false,
                        "default_reasoning_level": "high"
                    }
                }
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());

    let selection = selection_from_explicit_preferences(&request).expect("selection");

    assert_eq!(selection.reasoning_effort.as_deref(), Some("low"));
}

#[test]
fn model_request_policy_context_flows_to_lime_runtime_metadata() {
    let mut request = request_for_test(
        "hello",
        None,
        Some(json!({
            "harness": {
                "model_request_policy": {
                    "context_policy": {
                        "context_window": 100000,
                        "max_context_window": 400000,
                        "auto_compact_token_limit": 95000,
                        "effective_context_window_percent": 50
                    }
                }
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let scope = session_scope_from_request(&request).expect("scope");
    let turn_context =
        turn_context_from_request(&request, None, &scope, &selection, None).expect("turn context");
    let runtime = turn_context
        .metadata
        .get("lime_runtime")
        .expect("lime_runtime metadata");

    assert_eq!(
        runtime
            .pointer("/context_policy/source")
            .and_then(Value::as_str),
        Some("model_request_policy")
    );
    assert_eq!(
        runtime
            .pointer("/context_policy/resolved_context_window")
            .and_then(Value::as_i64),
        Some(100_000)
    );
    assert_eq!(
        runtime
            .pointer("/context_policy/model_context_window")
            .and_then(Value::as_i64),
        Some(50_000)
    );
    assert_eq!(
        runtime
            .pointer("/context_policy/auto_compact_token_limit")
            .and_then(Value::as_i64),
        Some(90_000)
    );
    assert_eq!(
        runtime.get("model_context_window").and_then(Value::as_i64),
        Some(50_000)
    );
    assert_eq!(
        runtime
            .get("auto_compact_token_limit")
            .and_then(Value::as_i64),
        Some(90_000)
    );
}

#[test]
fn fast_response_lime_runtime_keeps_context_policy_and_auto_compact_override() {
    let mut request = request_for_test(
        "只回答一个字：好",
        None,
        Some(json!({
            "harness": {
                "fast_response_routing": {
                    "mode": "auto",
                    "service_model_slot": "responsive_chat"
                },
                "model_request_policy": {
                    "context_policy": {
                        "resolved_context_window": 200000,
                        "model_context_window": 120000,
                        "auto_compact_token_limit": 150000
                    }
                }
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let scope = session_scope_from_request(&request).expect("scope");
    let turn_context =
        turn_context_from_request(&request, None, &scope, &selection, None).expect("turn context");
    let runtime = turn_context
        .metadata
        .get("lime_runtime")
        .expect("lime_runtime metadata");

    assert_eq!(
        runtime.get("auto_compact").and_then(Value::as_bool),
        Some(false)
    );
    assert_eq!(
        runtime.get("tool_surface").and_then(Value::as_str),
        Some("compact_tools")
    );
    assert_eq!(
        runtime
            .pointer("/context_policy/source")
            .and_then(Value::as_str),
        Some("model_request_policy")
    );
    assert_eq!(
        runtime.get("model_context_window").and_then(Value::as_i64),
        Some(120_000)
    );
    assert_eq!(
        runtime
            .get("auto_compact_token_limit")
            .and_then(Value::as_i64),
        Some(150_000)
    );
}

#[test]
fn valid_w3c_trace_context_flows_to_turn_context_metadata() {
    let mut request = request_for_test(
        "hello",
        None,
        Some(json!({
            "agentUiPerformanceTrace": {
                "traceId": "trace-local",
                "w3cTraceContext": {
                    "traceparent": "00-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA-BBBBBBBBBBBBBBBB-01",
                    "tracestate": " vendor=value "
                }
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let scope = session_scope_from_request(&request).expect("scope");
    let turn_context =
        turn_context_from_request(&request, None, &scope, &selection, None).expect("turn context");
    let w3c = turn_context
        .metadata
        .get("w3c_trace_context")
        .expect("w3c trace context");

    assert_eq!(
        w3c["traceparent"],
        "00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01"
    );
    assert_eq!(w3c["tracestate"], "vendor=value");
}

#[test]
fn invalid_w3c_trace_context_is_not_forwarded_to_turn_context() {
    let mut request = request_for_test(
        "hello",
        None,
        Some(json!({
            "agentUiPerformanceTrace": {
                "traceId": "trace-local",
                "w3cTraceContext": {
                    "traceparent": "not-a-traceparent",
                    "tracestate": "vendor=value"
                }
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let scope = session_scope_from_request(&request).expect("scope");
    let turn_context =
        turn_context_from_request(&request, None, &scope, &selection, None).expect("turn context");

    assert!(!turn_context.metadata.contains_key("w3c_trace_context"));
}

#[test]
fn runtime_options_expected_output_schema_flows_to_turn_context() {
    let output_schema = json!({
        "type": "object",
        "properties": {
            "items": {
                "type": "array"
            }
        },
        "required": ["items"]
    });
    let mut request = request_for_test("hello", None, None);
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());
    options.expected_output = Some(json!({
        "artifactKind": "content_batch",
        "outputFormat": {
            "type": "json_schema",
            "schema": output_schema.clone()
        }
    }));
    request.expected_output = options.expected_output.clone();

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let scope = session_scope_from_request(&request).expect("scope");
    let turn_context =
        turn_context_from_request(&request, None, &scope, &selection, None).expect("turn context");

    assert_eq!(turn_context.output_schema, Some(output_schema));
    assert_eq!(
        turn_context.output_schema_source,
        Some(TurnOutputSchemaSource::Turn)
    );
}

#[test]
fn metadata_reasoning_aliases_flow_to_selection_and_turn_context() {
    let mut request = request_for_test(
        "hello",
        None,
        Some(json!({
            "turnConfig": {
                "modelReasoningEffort": "low"
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1-mini".to_string());

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    assert_eq!(selection.reasoning_effort.as_deref(), Some("low"));

    let scope = session_scope_from_request(&request).expect("scope");
    let turn_context =
        turn_context_from_request(&request, None, &scope, &selection, None).expect("turn context");
    assert_eq!(turn_context.effort.as_deref(), Some("low"));
}

#[test]
fn inputbar_plan_mode_metadata_flows_to_turn_context_collaboration_mode() {
    let mut request = request_for_test(
        "先给我一个修复计划，不要直接改代码",
        None,
        Some(json!({
            "harness": {
                "task_mode_enabled": true,
                "collaboration_mode": {
                    "mode": "plan",
                    "source": "inputbar"
                }
            }
        })),
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());

    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let scope = session_scope_from_request(&request).expect("scope");
    let turn_context =
        turn_context_from_request(&request, None, &scope, &selection, None).expect("turn context");

    assert_eq!(turn_context.collaboration_mode.as_deref(), Some("plan"));
}

#[test]
fn planning_collaboration_mode_alias_is_normalized_to_plan() {
    let mut request = request_for_test(
        "先规划",
        Some(json!({
            "asterChatRequest": {
                "provider_preference": "openai",
                "model_preference": "gpt-4.1",
                "turn_config": {
                    "metadata": {
                        "harness": {
                            "collaborationMode": {
                                "mode": "planning"
                            }
                        }
                    }
                }
            }
        })),
        None,
    );
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());

    let host_request = aster_chat_request_from_request(&request);
    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let scope = session_scope_from_request(&request).expect("scope");
    let turn_context =
        turn_context_from_request(&request, host_request.as_ref(), &scope, &selection, None)
            .expect("turn context");

    assert_eq!(turn_context.collaboration_mode.as_deref(), Some("plan"));
}

#[test]
fn injected_tool_execution_config_flows_to_turn_context_metadata() {
    let mut request = request_for_test("hello", None, None);
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1-mini".to_string());
    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let scope = session_scope_from_request(&request).expect("scope");

    let turn_context = turn_context_from_request(
        &request,
        None,
        &scope,
        &selection,
        Some(json!({
            "agent": {
                "toolExecution": {
                    "toolOverrides": {
                        "bash": {
                            "warningPolicy": "none"
                        }
                    }
                }
            }
        })),
    )
    .expect("turn context");

    assert_eq!(
        turn_context
            .metadata
            .get("config")
            .and_then(|value| value.pointer("/agent/toolExecution/toolOverrides/bash/warningPolicy"))
            .and_then(Value::as_str),
        Some("none")
    );
}

#[test]
fn injected_workspace_sandbox_config_flows_to_turn_context_metadata() {
    let mut request = request_for_test("hello", None, None);
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1-mini".to_string());
    let selection = selection_from_explicit_preferences(&request).expect("selection");
    let scope = session_scope_from_request(&request).expect("scope");

    let turn_context = turn_context_from_request(
        &request,
        None,
        &scope,
        &selection,
        Some(json!({
            "agent": {
                "workspaceSandbox": {
                    "enabled": true,
                    "strict": true,
                    "notifyOnFallback": false
                }
            }
        })),
    )
    .expect("turn context");

    assert_eq!(
        turn_context
            .metadata
            .get("config")
            .and_then(|value| value.pointer("/agent/workspaceSandbox/enabled"))
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        turn_context
            .metadata
            .get("config")
            .and_then(|value| value.pointer("/agent/workspaceSandbox/strict"))
            .and_then(Value::as_bool),
        Some(true)
    );
}

#[test]
fn top_level_request_metadata_reasoning_is_used_when_runtime_metadata_omits_it() {
    let mut request = request_for_test("hello", None, Some(json!({ "trace": "runtime-only" })));
    request.metadata = Some(json!({
        "harness": {
            "modelReasoningEffort": "high"
        }
    }));
    let options = request.runtime_options.as_mut().expect("runtime options");
    options.provider_preference = Some("openai".to_string());
    options.model_preference = Some("gpt-4.1".to_string());

    let selection = selection_from_explicit_preferences(&request).expect("selection");

    assert_eq!(selection.reasoning_effort.as_deref(), Some("high"));
}

#[test]
fn turn_config_provider_config_and_reasoning_override_host_top_level() {
    let request = request_for_test(
        "hello",
        Some(json!({
            "asterChatRequest": {
                "reasoning_effort": "low",
                "provider_config": {
                    "provider_id": "top-openai",
                    "provider_name": "openai",
                    "model_name": "top-model",
                    "api_key": "top-key",
                    "base_url": "http://127.0.0.1:56598"
                },
                "turn_config": {
                    "reasoning_effort": "high",
                    "provider_config": {
                        "provider_id": "turn-openai",
                        "provider_name": "openai",
                        "model_name": "turn-model",
                        "api_key": "turn-key",
                        "base_url": "http://127.0.0.1:56599",
                        "tool_call_strategy": "tool_shim",
                        "toolshim_model": "turn-toolshim-model"
                    }
                }
            }
        })),
        None,
    );
    let host_request = aster_chat_request_from_request(&request);
    let selection = selection_from_host_provider_config(&request).expect("selection");
    let direct_config = direct_provider_config_from_request(
        host_request.as_ref(),
        &selection,
        selection.reasoning_effort.clone(),
    )
    .expect("direct provider config");

    assert_eq!(selection.provider, "turn-openai");
    assert_eq!(selection.model, "turn-model");
    assert_eq!(selection.reasoning_effort.as_deref(), Some("high"));
    assert_eq!(
        direct_config.provider_selector.as_deref(),
        Some("turn-openai")
    );
    assert_eq!(direct_config.model_name, "turn-model");
    assert_eq!(direct_config.api_key.as_deref(), Some("turn-key"));
    assert_eq!(
        direct_config.base_url.as_deref(),
        Some("http://127.0.0.1:56599")
    );
    assert_eq!(direct_config.reasoning_effort.as_deref(), Some("high"));
    assert!(direct_config.toolshim);
    assert_eq!(
        direct_config.toolshim_model.as_deref(),
        Some("turn-toolshim-model")
    );
}

#[test]
fn session_default_provider_model_is_used_after_frontend_compaction() {
    let request = request_with_session_metadata(json!({
        "providerSelector": "openai-compatible",
        "modelName": "gpt-4.1-mini"
    }));

    let selection = selection_from_session_default(&request).expect("selection");

    assert_eq!(selection.provider, "openai-compatible");
    assert_eq!(selection.model, "gpt-4.1-mini");
    assert_eq!(selection.source, "session_default");
}

#[test]
fn incomplete_session_default_is_not_a_runtime_selection() {
    let missing_model = request_with_session_metadata(json!({
        "providerSelector": "openai-compatible"
    }));
    let missing_provider = request_with_session_metadata(json!({
        "modelName": "gpt-4.1-mini"
    }));

    assert!(selection_from_session_default(&missing_model).is_none());
    assert!(selection_from_session_default(&missing_provider).is_none());
}

#[test]
fn session_extension_data_provider_routing_is_used_as_session_default() {
    let request = request_with_session_metadata(json!({
        "model": "claude-sonnet-4",
        "extensionData": {
            "lime_provider_routing.v0": {
                "providerSelector": "lime-hub"
            }
        }
    }));

    let selection = selection_from_session_default(&request).expect("selection");

    assert_eq!(selection.provider, "lime-hub");
    assert_eq!(selection.model, "claude-sonnet-4");
    assert_eq!(selection.source, "session_default");
}
