use app_server_protocol::ModelCapabilitiesInfo;
use app_server_protocol::ModelInfo;
use app_server_protocol::ProviderInfo;
use app_server_protocol::ProviderKeyInfo;
use serde_json::Value;

pub(super) fn model_info_from_value(value: &Value) -> ModelInfo {
    let capabilities = value.get("capabilities");
    ModelInfo {
        id: string_field(value, "id").unwrap_or_default(),
        provider_id: string_field(value, "provider_id").unwrap_or_default(),
        display_name: string_field(value, "display_name")
            .or_else(|| string_field(value, "id"))
            .unwrap_or_default(),
        provider_name: string_field(value, "provider_name").unwrap_or_default(),
        family: string_field(value, "family"),
        tier: string_field(value, "tier").unwrap_or_else(|| "pro".to_string()),
        capabilities: ModelCapabilitiesInfo {
            vision: bool_field(capabilities, "vision").unwrap_or(false),
            tools: bool_field(capabilities, "tools").unwrap_or(false),
            streaming: bool_field(capabilities, "streaming").unwrap_or(false),
            json_mode: bool_field(capabilities, "json_mode").unwrap_or(false),
            function_calling: bool_field(capabilities, "function_calling").unwrap_or(false),
            reasoning: bool_field(capabilities, "reasoning").unwrap_or(false),
            reasoning_effort: capabilities
                .and_then(|capabilities| field_value(capabilities, "reasoning_effort").cloned()),
        },
        task_families: string_vec_field(value, "task_families"),
        input_modalities: string_vec_field(value, "input_modalities"),
        output_modalities: string_vec_field(value, "output_modalities"),
        runtime_features: string_vec_field(value, "runtime_features"),
        deployment_source: string_field(value, "deployment_source")
            .unwrap_or_else(|| "user_cloud".to_string()),
        management_plane: string_field(value, "management_plane")
            .unwrap_or_else(|| "local_settings".to_string()),
        canonical_model_id: string_field(value, "canonical_model_id"),
        provider_model_id: string_field(value, "provider_model_id"),
        alias_source: string_field(value, "alias_source"),
        status: string_field(value, "status").unwrap_or_else(|| "active".to_string()),
        source: string_field(value, "source").unwrap_or_else(|| "local".to_string()),
        release_date: string_field(value, "release_date"),
        is_latest: bool_field(Some(value), "is_latest").unwrap_or(false),
        description: string_field(value, "description"),
        pricing: field_value(value, "pricing")
            .cloned()
            .unwrap_or(Value::Null),
        limits: field_value(value, "limits")
            .cloned()
            .unwrap_or_else(|| serde_json::json!({})),
        created_at: i64_field(value, "created_at").unwrap_or_default(),
        updated_at: i64_field(value, "updated_at").unwrap_or_default(),
    }
}

pub(super) fn provider_info_from_value(value: &Value) -> ProviderInfo {
    ProviderInfo {
        id: string_field(value, "id").unwrap_or_default(),
        name: string_field(value, "name")
            .or_else(|| string_field(value, "id"))
            .unwrap_or_default(),
        provider_type: string_field(value, "type")
            .or_else(|| string_field(value, "provider_type"))
            .unwrap_or_default(),
        api_host: string_field(value, "api_host").unwrap_or_default(),
        group: string_field(value, "group").unwrap_or_default(),
        enabled: bool_field(Some(value), "enabled").unwrap_or(true),
        is_system: bool_field(Some(value), "is_system").unwrap_or(false),
        sort_order: i32_field(value, "sort_order").unwrap_or_default(),
        api_version: string_field(value, "api_version"),
        project: string_field(value, "project"),
        location: string_field(value, "location"),
        region: string_field(value, "region"),
        custom_models: string_vec_field(value, "custom_models"),
        prompt_cache_mode: string_field(value, "prompt_cache_mode"),
        api_key_count: usize_field(value, "api_key_count").unwrap_or_default(),
        api_keys: field_value(value, "api_keys")
            .and_then(Value::as_array)
            .map(|items| items.iter().map(provider_key_info_from_value).collect())
            .unwrap_or_default(),
        legacy_ids: string_vec_field(value, "legacy_ids"),
        created_at: string_field(value, "created_at"),
        updated_at: string_field(value, "updated_at"),
    }
}

pub(super) fn provider_key_info_from_value(value: &Value) -> ProviderKeyInfo {
    ProviderKeyInfo {
        id: string_field(value, "id").unwrap_or_default(),
        provider_id: string_field(value, "provider_id").unwrap_or_default(),
        api_key_masked: string_field(value, "api_key_masked").unwrap_or_default(),
        alias: string_field(value, "alias"),
        enabled: bool_field(Some(value), "enabled").unwrap_or(true),
        usage_count: i64_field(value, "usage_count").unwrap_or_default(),
        error_count: i64_field(value, "error_count").unwrap_or_default(),
        last_used_at: string_field(value, "last_used_at"),
        created_at: string_field(value, "created_at").unwrap_or_default(),
    }
}

fn field_value<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    value
        .get(key)
        .or_else(|| value.get(to_camel_case(key).as_str()))
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    field_value(value, key)
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn bool_field(value: Option<&Value>, key: &str) -> Option<bool> {
    value
        .and_then(|value| field_value(value, key))
        .and_then(Value::as_bool)
}

fn i32_field(value: &Value, key: &str) -> Option<i32> {
    field_value(value, key)
        .and_then(Value::as_i64)
        .and_then(|number| i32::try_from(number).ok())
}

fn i64_field(value: &Value, key: &str) -> Option<i64> {
    field_value(value, key).and_then(Value::as_i64)
}

fn usize_field(value: &Value, key: &str) -> Option<usize> {
    field_value(value, key)
        .and_then(Value::as_u64)
        .and_then(|number| usize::try_from(number).ok())
}

fn string_vec_field(value: &Value, key: &str) -> Vec<String> {
    field_value(value, key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn to_camel_case(key: &str) -> String {
    let mut result = String::new();
    let mut uppercase_next = false;
    for ch in key.chars() {
        if ch == '_' {
            uppercase_next = true;
        } else if uppercase_next {
            result.extend(ch.to_uppercase());
            uppercase_next = false;
        } else {
            result.push(ch);
        }
    }
    result
}
