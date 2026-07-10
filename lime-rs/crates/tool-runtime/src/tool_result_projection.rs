use rmcp::model::{CallToolResult, Content};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Default)]
pub struct RuntimeToolResultParts {
    pub success: bool,
    pub output: Option<String>,
    pub error: Option<String>,
    pub metadata: HashMap<String, Value>,
}

fn runtime_tool_metadata_to_value(metadata: HashMap<String, Value>) -> Option<Value> {
    if metadata.is_empty() {
        None
    } else {
        Some(Value::Object(metadata.into_iter().collect()))
    }
}

fn parse_model_visible_image_data_url(data_url: &str) -> Option<(String, String)> {
    let normalized = data_url.trim();
    if !normalized.starts_with("data:image/") {
        return None;
    }

    let (meta, data) = normalized.split_once(',')?;
    if !meta.to_ascii_lowercase().contains(";base64") {
        return None;
    }

    let mime_type = meta.strip_prefix("data:")?.split(';').next()?.trim();
    let data = data.trim();
    if mime_type.starts_with("image/") && !data.is_empty() {
        Some((mime_type.to_string(), data.to_string()))
    } else {
        None
    }
}

fn runtime_tool_model_visible_image_content(metadata: &HashMap<String, Value>) -> Option<Content> {
    let model_visible_image = metadata
        .get("model_visible_image")
        .or_else(|| metadata.get("modelVisibleImage"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !model_visible_image {
        return None;
    }

    let image_url = metadata
        .get("image_url")
        .or_else(|| metadata.get("imageUrl"))
        .and_then(Value::as_str)?;
    let (mime_type, data) = parse_model_visible_image_data_url(image_url)?;
    Some(Content::image(data, mime_type))
}

fn remove_model_visible_image_transport_metadata(metadata: &mut HashMap<String, Value>) {
    for key in [
        "image_url",
        "imageUrl",
        "model_visible_image",
        "modelVisibleImage",
    ] {
        metadata.remove(key);
    }
}

pub fn runtime_tool_result_to_call_tool_result(result: RuntimeToolResultParts) -> CallToolResult {
    let RuntimeToolResultParts {
        success,
        output,
        error,
        mut metadata,
    } = result;
    let image_content = if success {
        runtime_tool_model_visible_image_content(&metadata)
    } else {
        None
    };
    if image_content.is_some() {
        remove_model_visible_image_transport_metadata(&mut metadata);
    }

    let structured_content = runtime_tool_metadata_to_value(metadata);
    let fallback_text = structured_content
        .as_ref()
        .and_then(|value| serde_json::to_string_pretty(value).ok());
    let text = if success {
        output
            .filter(|value| !value.is_empty())
            .or_else(|| fallback_text.clone())
            .unwrap_or_default()
    } else {
        error
            .or(output)
            .filter(|value| !value.is_empty())
            .or(fallback_text)
            .unwrap_or_default()
    };

    let mut content = vec![Content::text(text)];
    if let Some(image_content) = image_content {
        content.push(image_content);
    }

    CallToolResult {
        content,
        structured_content,
        is_error: Some(!success),
        meta: None,
    }
}

pub fn runtime_tool_result_surface_updated(result: &CallToolResult) -> bool {
    result
        .structured_content
        .as_ref()
        .and_then(|value| value.get("tool_surface_updated"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_tool_result_projection_uses_output_and_metadata() {
        let mut metadata = HashMap::new();
        metadata.insert("tool_surface_updated".to_string(), serde_json::json!(true));
        let result = runtime_tool_result_to_call_tool_result(RuntimeToolResultParts {
            success: true,
            output: Some("done".to_string()),
            error: None,
            metadata,
        });

        assert_eq!(result.is_error, Some(false));
        assert_eq!(result.content.len(), 1);
        assert_eq!(
            result.structured_content,
            Some(serde_json::json!({ "tool_surface_updated": true }))
        );
        assert!(runtime_tool_result_surface_updated(&result));
    }

    #[test]
    fn runtime_tool_result_projection_falls_back_to_error_or_metadata() {
        let failed = runtime_tool_result_to_call_tool_result(RuntimeToolResultParts {
            success: false,
            output: Some("stdout".to_string()),
            error: Some("failed".to_string()),
            metadata: HashMap::new(),
        });

        assert_eq!(failed.is_error, Some(true));
        assert_eq!(failed.content.len(), 1);

        let mut metadata = HashMap::new();
        metadata.insert("answer".to_string(), serde_json::json!("ok"));
        let fallback = runtime_tool_result_to_call_tool_result(RuntimeToolResultParts {
            success: true,
            output: None,
            error: None,
            metadata,
        });

        assert_eq!(fallback.is_error, Some(false));
        assert!(fallback.structured_content.is_some());
    }

    #[test]
    fn runtime_tool_result_projection_attaches_model_visible_image() {
        let mut metadata = HashMap::new();
        metadata.insert("model_visible_image".to_string(), serde_json::json!(true));
        metadata.insert(
            "image_url".to_string(),
            serde_json::json!("data:image/png;base64,aGVsbG8="),
        );
        metadata.insert("path".to_string(), serde_json::json!("sample.png"));

        let result = runtime_tool_result_to_call_tool_result(RuntimeToolResultParts {
            success: true,
            output: Some("viewed".to_string()),
            error: None,
            metadata,
        });

        assert_eq!(result.is_error, Some(false));
        assert_eq!(result.content.len(), 2);
        assert_eq!(
            result.structured_content.as_ref().unwrap().get("path"),
            Some(&serde_json::json!("sample.png"))
        );
        assert!(result
            .structured_content
            .as_ref()
            .unwrap()
            .get("image_url")
            .is_none());
    }
}
