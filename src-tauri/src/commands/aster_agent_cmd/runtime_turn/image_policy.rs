use super::*;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct RuntimeImageInputPolicy {
    pub(super) submitted_image_count: usize,
    pub(super) forwarded_image_count: usize,
    pub(super) dropped_image_count: usize,
    pub(super) provider_supports_vision: bool,
}

pub(super) fn count_valid_runtime_images(images: Option<&[ImageInput]>) -> usize {
    images
        .unwrap_or_default()
        .iter()
        .filter(|image| !image.data.trim().is_empty() && !image.media_type.trim().is_empty())
        .count()
}

pub(super) fn normalize_runtime_provider_text(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

pub(super) fn runtime_provider_is_official_deepseek(config: &ConfigureProviderRequest) -> bool {
    let provider_id = config
        .provider_id
        .as_deref()
        .map(normalize_runtime_provider_text);
    let provider_name = normalize_runtime_provider_text(&config.provider_name);
    let base_url = config
        .base_url
        .as_deref()
        .map(normalize_runtime_provider_text)
        .unwrap_or_default();

    provider_id.as_deref() == Some("deepseek")
        || provider_name == "deepseek"
        || base_url.contains("api.deepseek.com")
}

pub(super) fn runtime_provider_supports_image_input(
    config: Option<&ConfigureProviderRequest>,
) -> bool {
    let Some(config) = config else {
        return false;
    };

    if runtime_provider_is_official_deepseek(config) {
        return false;
    }

    config
        .model_capabilities
        .as_ref()
        .is_some_and(|capabilities| capabilities.vision)
}

pub(super) fn resolve_runtime_image_input_policy(
    request: &AsterChatRequest,
) -> Option<RuntimeImageInputPolicy> {
    let submitted_image_count = count_valid_runtime_images(request.images.as_deref());
    if submitted_image_count == 0 {
        return None;
    }

    let provider_supports_vision =
        runtime_provider_supports_image_input(request.provider_config.as_ref());
    let forwarded_image_count = if provider_supports_vision {
        submitted_image_count
    } else {
        0
    };

    Some(RuntimeImageInputPolicy {
        submitted_image_count,
        forwarded_image_count,
        dropped_image_count: submitted_image_count.saturating_sub(forwarded_image_count),
        provider_supports_vision,
    })
}

pub(super) fn merge_runtime_image_input_policy_metadata(
    request_metadata: Option<serde_json::Value>,
    policy: Option<&RuntimeImageInputPolicy>,
) -> Option<serde_json::Value> {
    let Some(policy) = policy else {
        return request_metadata;
    };

    let mut root = match request_metadata {
        Some(serde_json::Value::Object(object)) => object,
        Some(_) | None => serde_json::Map::new(),
    };
    let runtime_entry = root
        .entry(LIME_RUNTIME_METADATA_KEY.to_string())
        .or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
    let runtime_object = runtime_entry
        .as_object_mut()
        .expect("lime_runtime metadata should be an object");
    runtime_object.insert(
        LIME_RUNTIME_IMAGE_INPUT_POLICY_KEY.to_string(),
        serde_json::json!({
            "submittedImageCount": policy.submitted_image_count,
            "forwardedImageCount": policy.forwarded_image_count,
            "droppedImageCount": policy.dropped_image_count,
            "providerSupportsVision": policy.provider_supports_vision,
        }),
    );

    Some(serde_json::Value::Object(root))
}

pub(super) fn build_runtime_image_input_unsupported_warning(
    request: &AsterChatRequest,
) -> Option<RuntimeAgentEvent> {
    let policy = resolve_runtime_image_input_policy(request)?;
    if policy.dropped_image_count == 0 {
        return None;
    }

    let model_name = request
        .provider_config
        .as_ref()
        .map(|config| config.model_name.trim())
        .filter(|value| !value.is_empty())
        .unwrap_or("当前模型");

    Some(RuntimeAgentEvent::Warning {
        code: Some(RUNTIME_IMAGE_INPUT_UNSUPPORTED_WARNING_CODE.to_string()),
        message: format!(
            "本轮包含 {} 张图片，但 {} 不支持图片输入；已在发送给模型前省略图片，仅保留文本和图片占位说明。请切换支持图片理解的模型后再分析图片内容。",
            policy.dropped_image_count, model_name
        ),
    })
}

pub(super) fn resolve_runtime_forwarded_images(
    request: &AsterChatRequest,
) -> Option<&[ImageInput]> {
    let policy = resolve_runtime_image_input_policy(request)?;
    if policy.forwarded_image_count == 0 {
        return None;
    }

    request.images.as_deref()
}

pub(super) fn merge_runtime_image_input_unsupported_system_prompt(
    base_prompt: Option<String>,
    request: &AsterChatRequest,
) -> Option<String> {
    let policy = resolve_runtime_image_input_policy(request)?;
    if policy.dropped_image_count == 0 {
        return base_prompt;
    }

    let model_name = request
        .provider_config
        .as_ref()
        .map(|config| config.model_name.trim())
        .filter(|value| !value.is_empty())
        .unwrap_or("当前模型");
    let notice = format!(
        "【图片输入降级】本轮用户上传了 {} 张图片，但 {} 不支持图片输入；图片不会发送给模型，也不能被模型看到。不要声称已经看到了图片；如果用户要求识别或分析图片，请直接说明需要切换到支持多模态/视觉输入的模型。",
        policy.dropped_image_count, model_name
    );

    match base_prompt {
        Some(prompt) if prompt.trim().is_empty() => Some(notice),
        Some(prompt) => Some(format!("{prompt}\n\n{notice}")),
        None => Some(notice),
    }
}
