use crate::canonical::maybe_get_canonical_model;
use serde_json::Value;

pub const PROVIDER_IMAGE_INPUT_POLICY_METADATA_KEY: &str = "image_input_policy";
pub const PROVIDER_IMAGE_INPUT_POLICY_METADATA_CAMEL_KEY: &str = "imageInputPolicy";
const MODEL_REQUEST_POLICY_METADATA_KEYS: [&str; 5] = [
    "runtime_options",
    "runtimeOptions",
    "runtime_request",
    "runtimeRequest",
    "config",
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeReplyProviderImageInputPolicy {
    pub provider_supports_vision: Option<bool>,
    pub dropped_image_count: u64,
}

impl RuntimeReplyProviderImageInputPolicy {
    pub fn from_runtime_metadata(runtime_metadata: &Value) -> Option<Self> {
        let policy = runtime_metadata
            .get(PROVIDER_IMAGE_INPUT_POLICY_METADATA_KEY)
            .or_else(|| runtime_metadata.get(PROVIDER_IMAGE_INPUT_POLICY_METADATA_CAMEL_KEY))?;

        Self::from_policy_value(policy)
    }

    pub fn from_policy_value(policy: &Value) -> Option<Self> {
        let Value::Object(policy) = policy else {
            return None;
        };

        let provider_supports_vision = policy
            .get("providerSupportsVision")
            .or_else(|| policy.get("provider_supports_vision"))
            .and_then(Value::as_bool);
        let dropped_image_count = policy
            .get("droppedImageCount")
            .or_else(|| policy.get("dropped_image_count"))
            .and_then(Value::as_u64)
            .unwrap_or(0);

        Some(Self {
            provider_supports_vision,
            dropped_image_count,
        })
    }

    pub fn disables_provider_images(&self) -> bool {
        self.provider_supports_vision == Some(false) || self.dropped_image_count > 0
    }
}

pub fn provider_stream_image_input_policy_disables_provider_images(
    runtime_metadata: Option<&Value>,
) -> bool {
    runtime_metadata
        .and_then(RuntimeReplyProviderImageInputPolicy::from_runtime_metadata)
        .is_some_and(|policy| policy.disables_provider_images())
}

pub fn provider_stream_model_supports_image_input(
    provider_name: &str,
    model_name: &str,
) -> Option<bool> {
    maybe_get_canonical_model(provider_name, model_name).map(|model| {
        model
            .input_modalities
            .iter()
            .any(|modality| modality.eq_ignore_ascii_case("image"))
    })
}

pub fn provider_stream_should_omit_image_input(
    model_supports_image_input: Option<bool>,
    runtime_metadata: Option<&Value>,
) -> bool {
    model_supports_image_input == Some(false)
        || provider_stream_image_input_policy_disables_provider_images(runtime_metadata)
}

pub fn provider_stream_omitted_message_images_notice(removed_images: usize) -> Option<String> {
    if removed_images == 0 {
        return None;
    }

    Some(format!(
        "[系统提示] 这条历史消息包含 {} 张图片，但当前模型不支持图片输入；图片已在发送给模型前省略。",
        removed_images
    ))
}

pub fn provider_stream_omitted_tool_result_images_notice(removed_images: usize) -> Option<String> {
    if removed_images == 0 {
        return None;
    }

    Some(format!(
        "[系统提示] 这个工具结果包含 {} 张图片，但当前模型不支持图片输入；图片已在发送给模型前省略。",
        removed_images
    ))
}

pub fn provider_stream_should_warn_omitted_provider_images(removed_images: usize) -> bool {
    removed_images > 0
}

pub fn provider_stream_input_modality_policy_from_metadata(metadata: &Value) -> Option<&Value> {
    MODEL_REQUEST_POLICY_METADATA_KEYS
        .into_iter()
        .filter_map(|key| metadata.get(key))
        .find_map(input_modality_policy_from_value)
        .or_else(|| {
            metadata
                .get("harness")
                .and_then(model_request_policy_from_harness)
        })
        .or_else(|| {
            metadata
                .get("model_request_policy")
                .or_else(|| metadata.get("modelRequestPolicy"))
                .and_then(input_modality_policy_from_policy_value)
        })
        .or_else(|| {
            metadata
                .get("input_modality_policy")
                .or_else(|| metadata.get("inputModalityPolicy"))
                .filter(|value| value.is_object())
        })
}

pub fn provider_stream_input_modality_policy_allows_image_input(policy: Option<&Value>) -> bool {
    policy
        .map(input_modality_policy_allows_image_input)
        .unwrap_or(true)
}

pub fn provider_stream_metadata_allows_image_input(metadata: Option<&Value>) -> bool {
    let policy = metadata.and_then(provider_stream_input_modality_policy_from_metadata);
    provider_stream_input_modality_policy_allows_image_input(policy)
}

fn input_modality_policy_from_value(value: &Value) -> Option<&Value> {
    direct_model_request_policy_value(value)
        .and_then(input_modality_policy_from_policy_value)
        .or_else(|| nested_metadata_value(value).and_then(input_modality_policy_from_value))
        .or_else(|| {
            MODEL_REQUEST_POLICY_METADATA_KEYS
                .into_iter()
                .filter_map(|key| value.get(key))
                .find_map(input_modality_policy_from_value)
        })
        .or_else(|| input_modality_policy_from_policy_value(value))
        .or_else(|| looks_like_input_modality_policy_value(value).then_some(value))
}

fn direct_model_request_policy_value(value: &Value) -> Option<&Value> {
    value
        .pointer("/harness/model_request_policy")
        .or_else(|| value.pointer("/harness/modelRequestPolicy"))
        .or_else(|| value.get("model_request_policy"))
        .or_else(|| value.get("modelRequestPolicy"))
}

fn model_request_policy_from_harness(value: &Value) -> Option<&Value> {
    value
        .get("model_request_policy")
        .or_else(|| value.get("modelRequestPolicy"))
        .and_then(input_modality_policy_from_policy_value)
}

fn nested_metadata_value(value: &Value) -> Option<&Value> {
    value
        .get("metadata")
        .or_else(|| value.get("request_metadata"))
        .or_else(|| value.get("requestMetadata"))
}

fn input_modality_policy_from_policy_value(value: &Value) -> Option<&Value> {
    value
        .get("input_modality_policy")
        .or_else(|| value.get("inputModalityPolicy"))
        .filter(|value| value.is_object())
}

fn looks_like_input_modality_policy_value(value: &Value) -> bool {
    value.as_object().is_some_and(|object| {
        [
            "input_modalities",
            "inputModalities",
            "supports_image_input",
            "supportsImageInput",
        ]
        .iter()
        .any(|key| object.contains_key(*key))
    })
}

fn input_modality_policy_allows_image_input(value: &Value) -> bool {
    bool_field(value, &["supports_image_input", "supportsImageInput"]).unwrap_or_else(|| {
        string_array_field(value, &["input_modalities", "inputModalities"])
            .iter()
            .any(|modality| modality.eq_ignore_ascii_case("image"))
    })
}

fn bool_field(value: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter().find_map(|key| value.get(*key)?.as_bool())
}

fn string_array_field(value: &Value, keys: &[&str]) -> Vec<String> {
    keys.iter()
        .find_map(|key| value.get(*key)?.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}
