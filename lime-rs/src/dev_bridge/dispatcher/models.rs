use crate::dev_bridge::DevBridgeState;
use serde_json::Value as JsonValue;

type DynError = Box<dyn std::error::Error>;

pub(super) async fn try_handle(
    state: &DevBridgeState,
    cmd: &str,
    args: Option<&JsonValue>,
) -> Result<Option<JsonValue>, DynError> {
    let result: JsonValue = match cmd {
        "get_models" => serde_json::json!({
            "data": [
                {"id": "claude-sonnet-4-20250514", "object": "model", "owned_by": "anthropic"},
                {"id": "claude-opus-4-20250514", "object": "model", "owned_by": "anthropic"},
                {"id": "claude-haiku-4-20250514", "object": "model", "owned_by": "anthropic"},
                {"id": "gpt-4o", "object": "model", "owned_by": "openai"},
                {"id": "gpt-4o-mini", "object": "model", "owned_by": "openai"},
            ]
        }),
        "refresh_model_registry" => {
            let guard = state.model_registry.read().await;
            let service = guard
                .as_ref()
                .ok_or_else(|| "模型注册服务未初始化".to_string())?;
            serde_json::json!(service.force_reload().await?)
        }
        "get_model_registry_provider_ids" => serde_json::to_value(Vec::<String>::new())?,
        _ => return Ok(None),
    };

    Ok(Some(result))
}
