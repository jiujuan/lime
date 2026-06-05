use super::*;

#[test]
fn runtime_image_input_policy_should_mark_non_vision_model_drops() {
    let mut request = build_runtime_turn_test_request("看一下这张图", None);
    request.images = Some(vec![ImageInput {
        data: "aGVsbG8=".to_string(),
        media_type: "image/png".to_string(),
    }]);
    request.provider_config = Some(ConfigureProviderRequest {
        provider_id: Some("deepseek".to_string()),
        provider_name: "openai".to_string(),
        model_name: "deepseek-reasoner".to_string(),
        api_key: None,
        base_url: None,
        model_capabilities: Some(runtime_test_model_capabilities(false)),
        tool_call_strategy: None,
        toolshim_model: None,
    });

    let policy = resolve_runtime_image_input_policy(&request).expect("image policy");

    assert_eq!(
        policy,
        RuntimeImageInputPolicy {
            submitted_image_count: 1,
            forwarded_image_count: 0,
            dropped_image_count: 1,
            provider_supports_vision: false,
        }
    );

    let metadata =
        merge_runtime_image_input_policy_metadata(None, Some(&policy)).expect("policy metadata");
    assert_eq!(
        metadata.pointer("/lime_runtime/image_input_policy/providerSupportsVision"),
        Some(&Value::Bool(false))
    );
    assert_eq!(
        metadata.pointer("/lime_runtime/image_input_policy/droppedImageCount"),
        Some(&json!(1))
    );

    let warning = build_runtime_image_input_unsupported_warning(&request)
        .expect("non-vision image input should warn");
    let warning_value = serde_json::to_value(warning).expect("serialize warning");
    assert_eq!(
        warning_value.get("type").and_then(Value::as_str),
        Some("warning")
    );
    assert_eq!(
        warning_value.get("code").and_then(Value::as_str),
        Some(RUNTIME_IMAGE_INPUT_UNSUPPORTED_WARNING_CODE)
    );
}

#[test]
fn runtime_image_input_policy_should_treat_official_deepseek_as_text_only() {
    let mut request = build_runtime_turn_test_request("看一下这张图", None);
    request.images = Some(vec![ImageInput {
        data: "aGVsbG8=".to_string(),
        media_type: "image/png".to_string(),
    }]);
    request.provider_config = Some(ConfigureProviderRequest {
        provider_id: Some("deepseek".to_string()),
        provider_name: "deepseek".to_string(),
        model_name: "deepseek-v4-flash".to_string(),
        api_key: None,
        base_url: Some("https://api.deepseek.com".to_string()),
        model_capabilities: Some(runtime_test_model_capabilities(true)),
        tool_call_strategy: None,
        toolshim_model: None,
    });

    let policy = resolve_runtime_image_input_policy(&request).expect("image policy");

    assert_eq!(policy.forwarded_image_count, 0);
    assert_eq!(policy.dropped_image_count, 1);
    assert!(!policy.provider_supports_vision);
}

#[test]
fn runtime_image_input_policy_should_record_text_only_provider_without_current_images() {
    let mut request = build_runtime_turn_test_request("继续上一轮", None);
    request.provider_config = Some(ConfigureProviderRequest {
        provider_id: Some("deepseek".to_string()),
        provider_name: "deepseek".to_string(),
        model_name: "deepseek-v4-flash".to_string(),
        api_key: None,
        base_url: Some("https://api.deepseek.com".to_string()),
        model_capabilities: Some(runtime_test_model_capabilities(true)),
        tool_call_strategy: None,
        toolshim_model: None,
    });

    let policy = resolve_runtime_image_input_policy(&request).expect("image policy");

    assert_eq!(
        policy,
        RuntimeImageInputPolicy {
            submitted_image_count: 0,
            forwarded_image_count: 0,
            dropped_image_count: 0,
            provider_supports_vision: false,
        }
    );

    let metadata =
        merge_runtime_image_input_policy_metadata(None, Some(&policy)).expect("policy metadata");
    assert_eq!(
        metadata.pointer("/lime_runtime/image_input_policy/providerSupportsVision"),
        Some(&Value::Bool(false))
    );
    assert_eq!(
        metadata.pointer("/lime_runtime/image_input_policy/droppedImageCount"),
        Some(&json!(0))
    );
    assert!(build_runtime_image_input_unsupported_warning(&request).is_none());
}

#[test]
fn runtime_forwarded_images_should_drop_text_only_provider_images_before_agent_turn() {
    let mut request = build_runtime_turn_test_request("看一下这张图", None);
    request.images = Some(vec![ImageInput {
        data: "aGVsbG8=".to_string(),
        media_type: "image/png".to_string(),
    }]);
    request.provider_config = Some(ConfigureProviderRequest {
        provider_id: Some("deepseek".to_string()),
        provider_name: "deepseek".to_string(),
        model_name: "deepseek-v4-flash".to_string(),
        api_key: None,
        base_url: Some("https://api.deepseek.com".to_string()),
        model_capabilities: Some(runtime_test_model_capabilities(true)),
        tool_call_strategy: None,
        toolshim_model: None,
    });

    let message =
        build_runtime_user_message(&request.message, resolve_runtime_forwarded_images(&request));

    assert_eq!(message.as_concat_text(), "看一下这张图");
    assert!(
        message
            .content
            .iter()
            .all(|content| !matches!(content, MessageContent::Image(_))),
        "text-only provider 的图片应在进入 Agent turn 前被剥离"
    );
}

#[test]
fn runtime_image_input_policy_should_append_agent_only_system_notice() {
    let mut request = build_runtime_turn_test_request("看一下这张图", None);
    request.images = Some(vec![ImageInput {
        data: "aGVsbG8=".to_string(),
        media_type: "image/png".to_string(),
    }]);
    request.provider_config = Some(ConfigureProviderRequest {
        provider_id: Some("deepseek".to_string()),
        provider_name: "deepseek".to_string(),
        model_name: "deepseek-v4-flash".to_string(),
        api_key: None,
        base_url: Some("https://api.deepseek.com".to_string()),
        model_capabilities: Some(runtime_test_model_capabilities(true)),
        tool_call_strategy: None,
        toolshim_model: None,
    });

    let prompt =
        merge_runtime_image_input_unsupported_system_prompt(Some("基础提示".to_string()), &request)
            .expect("system prompt");

    assert!(prompt.contains("基础提示"));
    assert!(prompt.contains("图片输入降级"));
    assert!(prompt.contains("deepseek-v4-flash"));
    assert!(prompt.contains("不要声称已经看到了图片"));
}

#[test]
fn runtime_image_input_policy_should_keep_vision_model_images() {
    let mut request = build_runtime_turn_test_request("看一下这张图", None);
    request.images = Some(vec![ImageInput {
        data: "aGVsbG8=".to_string(),
        media_type: "image/png".to_string(),
    }]);
    request.provider_config = Some(ConfigureProviderRequest {
        provider_id: Some("openai".to_string()),
        provider_name: "openai".to_string(),
        model_name: "gpt-4o".to_string(),
        api_key: None,
        base_url: None,
        model_capabilities: Some(runtime_test_model_capabilities(true)),
        tool_call_strategy: None,
        toolshim_model: None,
    });

    let policy = resolve_runtime_image_input_policy(&request).expect("image policy");

    assert_eq!(policy.forwarded_image_count, 1);
    assert_eq!(policy.dropped_image_count, 0);
    assert!(build_runtime_image_input_unsupported_warning(&request).is_none());
}

#[test]
fn runtime_vision_image_turn_should_keep_prompt_text_for_provider() {
    let mut request = build_runtime_turn_test_request("请识别这张图里的文字", None);
    request.images = Some(vec![ImageInput {
        data: "aGVsbG8=".to_string(),
        media_type: "image/png".to_string(),
    }]);
    request.provider_config = Some(ConfigureProviderRequest {
        provider_id: Some("openai".to_string()),
        provider_name: "openai".to_string(),
        model_name: "gpt-4o".to_string(),
        api_key: None,
        base_url: None,
        model_capabilities: Some(runtime_test_model_capabilities(true)),
        tool_call_strategy: None,
        toolshim_model: None,
    });

    let message =
        build_runtime_user_message(&request.message, resolve_runtime_forwarded_images(&request));
    let spec = format_openai_messages(&[message], &ImageFormat::OpenAi);

    let content = spec[0]["content"].as_array().expect("content parts");
    assert_eq!(content.len(), 2);
    assert_eq!(content[0]["type"], "text");
    assert_eq!(content[0]["text"], "请识别这张图里的文字");
    assert_eq!(content[1]["type"], "image_url");
    assert_eq!(
        content[1]["image_url"]["url"],
        "data:image/png;base64,aGVsbG8="
    );
}
