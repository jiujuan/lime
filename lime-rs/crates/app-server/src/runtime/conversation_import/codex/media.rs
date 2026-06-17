use app_server_protocol::AgentAttachment;
use serde_json::Value;

pub(super) fn response_item_attachments(content: &Value) -> Vec<AgentAttachment> {
    let Some(parts) = content.as_array() else {
        return Vec::new();
    };
    parts
        .iter()
        .filter(|part| part.get("type").and_then(Value::as_str) == Some("input_image"))
        .filter_map(|part| {
            part.get("image_url")
                .and_then(Value::as_str)
                .map(|uri| (uri, part))
        })
        .enumerate()
        .map(|(index, (uri, part))| {
            image_attachment(
                uri,
                json_object_metadata(vec![
                    (
                        "sourceType",
                        Some(Value::String("response_item".to_string())),
                    ),
                    (
                        "codexContentType",
                        Some(Value::String("input_image".to_string())),
                    ),
                    ("index", Some(Value::from(index as u64))),
                    ("detail", optional_string_value(part.get("detail"))),
                    ("mediaType", media_type_from_uri(uri).map(Value::String)),
                ]),
            )
        })
        .collect()
}

pub(super) fn event_user_attachments(payload: &Value) -> Vec<AgentAttachment> {
    let mut attachments = Vec::new();
    attachments.extend(
        payload
            .get("images")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .enumerate()
            .map(|(index, uri)| {
                image_attachment(
                    uri,
                    json_object_metadata(vec![
                        ("sourceType", Some(Value::String("event_msg".to_string()))),
                        ("codexField", Some(Value::String("images".to_string()))),
                        ("index", Some(Value::from(index as u64))),
                        (
                            "detail",
                            indexed_optional_string_value(payload.get("image_details"), index),
                        ),
                        ("mediaType", media_type_from_uri(uri).map(Value::String)),
                    ]),
                )
            }),
    );
    attachments.extend(
        payload
            .get("local_images")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .enumerate()
            .map(|(index, path)| {
                image_attachment(
                    path,
                    json_object_metadata(vec![
                        ("sourceType", Some(Value::String("event_msg".to_string()))),
                        (
                            "codexField",
                            Some(Value::String("local_images".to_string())),
                        ),
                        ("index", Some(Value::from(index as u64))),
                        (
                            "detail",
                            indexed_optional_string_value(
                                payload.get("local_image_details"),
                                index,
                            ),
                        ),
                        ("localPath", Some(Value::String(path.to_string()))),
                    ]),
                )
            }),
    );
    attachments
}

fn image_attachment(uri: &str, metadata: serde_json::Map<String, Value>) -> AgentAttachment {
    AgentAttachment {
        kind: "image".to_string(),
        uri: Some(uri.to_string()),
        metadata: Some(Value::Object(metadata)),
    }
}

fn json_object_metadata(entries: Vec<(&str, Option<Value>)>) -> serde_json::Map<String, Value> {
    entries
        .into_iter()
        .filter_map(|(key, value)| value.map(|value| (key.to_string(), value)))
        .collect()
}

fn optional_string_value(value: Option<&Value>) -> Option<Value> {
    value
        .and_then(Value::as_str)
        .map(|value| Value::String(value.to_string()))
}

fn indexed_optional_string_value(value: Option<&Value>, index: usize) -> Option<Value> {
    value
        .and_then(Value::as_array)
        .and_then(|values| values.get(index))
        .and_then(Value::as_str)
        .map(|value| Value::String(value.to_string()))
}

fn media_type_from_uri(uri: &str) -> Option<String> {
    uri.strip_prefix("data:")
        .and_then(|rest| rest.split_once(';').map(|(media_type, _)| media_type))
        .filter(|media_type| !media_type.trim().is_empty())
        .map(ToOwned::to_owned)
}
