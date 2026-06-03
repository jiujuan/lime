use super::*;

#[tokio::test]
async fn enforce_runtime_turn_user_prompt_submit_hooks_should_allow_without_project_hooks() {
    let temp_dir = tempfile::TempDir::new().expect("create temp dir");

    enforce_runtime_turn_user_prompt_submit_hooks(
        "继续执行",
        "session-runtime-hook-allow",
        temp_dir
            .path()
            .to_str()
            .expect("temp dir path should be utf-8"),
    )
    .await
    .expect("没有项目 hooks 时不应阻止提交");
}

#[tokio::test]
async fn enforce_runtime_turn_user_prompt_submit_hooks_should_block_when_project_hook_blocks() {
    let temp_dir = tempfile::TempDir::new().expect("create temp dir");
    write_blocking_user_prompt_submit_hook(temp_dir.path(), "runtime project hook blocked");

    let error = enforce_runtime_turn_user_prompt_submit_hooks(
        "继续执行",
        "session-runtime-hook-blocked",
        temp_dir
            .path()
            .to_str()
            .expect("temp dir path should be utf-8"),
    )
    .await
    .expect_err("阻塞型项目 hook 应阻止提交");

    assert!(error.contains("UserPromptSubmit hook 已阻止本次提交"));
    assert!(error.contains("runtime project hook blocked"));
}

#[test]
fn merge_runtime_turn_tool_surface_metadata_should_inject_runtime_hint() {
    let metadata = merge_runtime_turn_tool_surface_metadata(None, Some("direct_answer"))
        .expect("should inject metadata");

    assert_eq!(
        metadata
            .get(LIME_RUNTIME_METADATA_KEY)
            .and_then(|value| value.get(LIME_RUNTIME_TOOL_SURFACE_KEY))
            .and_then(serde_json::Value::as_str),
        Some("direct_answer")
    );
}

#[test]
fn merge_runtime_turn_default_tool_surface_metadata_should_preserve_explicit_surface() {
    let metadata = merge_runtime_turn_default_tool_surface_metadata(
        Some(json!({
            LIME_RUNTIME_METADATA_KEY: {
                LIME_RUNTIME_TOOL_SURFACE_KEY: FAST_CHAT_TOOL_SURFACE_DIRECT_ANSWER
            }
        })),
        DEFAULT_NATIVE_TOOL_SURFACE_COMPACT,
    )
    .expect("should preserve metadata");

    assert_eq!(
        metadata
            .get(LIME_RUNTIME_METADATA_KEY)
            .and_then(|value| value.get(LIME_RUNTIME_TOOL_SURFACE_KEY))
            .and_then(serde_json::Value::as_str),
        Some(FAST_CHAT_TOOL_SURFACE_DIRECT_ANSWER)
    );
}

#[test]
fn compact_native_tool_surface_should_apply_to_native_tool_capable_providers() {
    let provider_config = ConfigureProviderRequest {
        provider_id: Some("openai".to_string()),
        provider_name: "openai".to_string(),
        model_name: "gpt-4.1".to_string(),
        api_key: None,
        base_url: None,
        model_capabilities: Some(lime_core::models::model_registry::ModelCapabilities {
            vision: false,
            tools: true,
            streaming: true,
            json_mode: true,
            function_calling: false,
            reasoning: false,
            reasoning_effort: None,
        }),
        tool_call_strategy: Some(RuntimeToolCallStrategy::Native),
        toolshim_model: None,
    };

    assert!(should_use_compact_native_tool_surface(&provider_config));
}

#[test]
fn compact_native_tool_surface_should_apply_to_function_calling_providers() {
    let provider_config = ConfigureProviderRequest {
        provider_id: Some("google".to_string()),
        provider_name: "google".to_string(),
        model_name: "gemini-2.5-pro".to_string(),
        api_key: None,
        base_url: None,
        model_capabilities: Some(lime_core::models::model_registry::ModelCapabilities {
            vision: true,
            tools: false,
            streaming: true,
            json_mode: true,
            function_calling: true,
            reasoning: true,
            reasoning_effort: None,
        }),
        tool_call_strategy: Some(RuntimeToolCallStrategy::Native),
        toolshim_model: None,
    };

    assert!(should_use_compact_native_tool_surface(&provider_config));
}

#[test]
fn compact_native_tool_surface_should_skip_toolshim_strategy() {
    let provider_config = ConfigureProviderRequest {
        provider_id: Some("ollama".to_string()),
        provider_name: "ollama".to_string(),
        model_name: "llama".to_string(),
        api_key: None,
        base_url: None,
        model_capabilities: Some(lime_core::models::model_registry::ModelCapabilities {
            vision: false,
            tools: false,
            streaming: true,
            json_mode: false,
            function_calling: false,
            reasoning: false,
            reasoning_effort: None,
        }),
        tool_call_strategy: Some(RuntimeToolCallStrategy::ToolShim),
        toolshim_model: Some("gpt-4o-mini".to_string()),
    };

    assert!(!should_use_compact_native_tool_surface(&provider_config));
}
