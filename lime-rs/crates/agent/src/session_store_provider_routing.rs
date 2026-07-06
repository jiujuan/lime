//! Session provider routing metadata helpers.

use lime_core::database::{agent_session_repository, DbConnection};
use serde_json::Value;

use super::session_store_types::normalize_optional_text;

const PROVIDER_SELECTOR_POINTERS: &[&str] = &[
    "/providerSelector",
    "/provider_selector",
    "/executionRuntime/providerSelector",
    "/executionRuntime/provider_selector",
    "/execution_runtime/providerSelector",
    "/execution_runtime/provider_selector",
    "/extensionData/lime_provider_routing.v0/providerSelector",
    "/extensionData/lime_provider_routing.v0/provider_selector",
    "/extension_data/lime_provider_routing.v0/providerSelector",
    "/extension_data/lime_provider_routing.v0/provider_selector",
    "/lime_provider_routing.v0/providerSelector",
    "/lime_provider_routing.v0/provider_selector",
];

pub(super) fn read_session_provider_selector(
    db: &DbConnection,
    session_id: &str,
) -> Result<Option<String>, String> {
    let conn = db.lock().map_err(|e| format!("数据库锁定失败: {e}"))?;
    let extension_data_json =
        agent_session_repository::get_session_extension_data_json(&conn, session_id)?;
    Ok(resolve_session_provider_selector_from_extension_data(
        extension_data_json.as_deref(),
    ))
}

fn resolve_session_provider_selector_from_extension_data(raw: Option<&str>) -> Option<String> {
    let raw = raw?.trim();
    if raw.is_empty() {
        return None;
    }

    let metadata = serde_json::from_str::<Value>(raw).ok()?;
    json_pointer_string(&metadata, PROVIDER_SELECTOR_POINTERS)
}

fn json_pointer_string(value: &Value, pointers: &[&str]) -> Option<String> {
    pointers.iter().find_map(|pointer| {
        value
            .pointer(pointer)
            .and_then(Value::as_str)
            .and_then(|value| normalize_optional_text(Some(value.to_string())))
    })
}

#[cfg(test)]
mod tests {
    use super::resolve_session_provider_selector_from_extension_data;

    #[test]
    fn resolves_snake_case_extension_data_provider_selector() {
        let selector = resolve_session_provider_selector_from_extension_data(Some(
            r#"{"lime_provider_routing.v0":{"provider_selector":"  openai  "}}"#,
        ));

        assert_eq!(selector.as_deref(), Some("openai"));
    }

    #[test]
    fn resolves_camel_case_metadata_provider_selector() {
        let selector = resolve_session_provider_selector_from_extension_data(Some(
            r#"{"extensionData":{"lime_provider_routing.v0":{"providerSelector":"anthropic"}}}"#,
        ));

        assert_eq!(selector.as_deref(), Some("anthropic"));
    }

    #[test]
    fn ignores_empty_or_invalid_provider_selector_metadata() {
        assert_eq!(
            resolve_session_provider_selector_from_extension_data(None),
            None
        );
        assert_eq!(
            resolve_session_provider_selector_from_extension_data(Some("{")),
            None
        );
        assert_eq!(
            resolve_session_provider_selector_from_extension_data(Some(
                r#"{"lime_provider_routing.v0":{"provider_selector":" "}}"#
            )),
            None
        );
    }
}
