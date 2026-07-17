use super::output_refs::SIDECAR_REF_FIELD;
use super::sidecar_store::{
    session_scoped_relative_path, SidecarBytesWriteRequest, SidecarRef, SidecarStore,
};
use app_server_protocol::{AgentAttachment, AgentInput};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

const MAX_INPUT_MEDIA_BYTES: usize = 32 * 1024 * 1024;

pub(super) fn persist_inline_input_media(
    input: &mut AgentInput,
    sidecar_store: Option<&SidecarStore>,
    session_id: &str,
) -> Result<(), String> {
    for attachment in &mut input.attachments {
        let Some(source) = attachment.uri.as_deref().map(str::trim) else {
            continue;
        };
        if !source.to_ascii_lowercase().starts_with("data:") {
            continue;
        }
        if !attachment.kind.eq_ignore_ascii_case("image") {
            return Err(format!(
                "inline attachment kind '{}' is not supported by the current provider input boundary",
                attachment.kind
            ));
        }
        let store = sidecar_store.ok_or_else(|| {
            "inline provider media requires an initialized App Server sidecar store".to_string()
        })?;
        let (bytes, media_type) = decode_image_data_url(source)?;
        let digest = hex::encode(Sha256::digest(&bytes));
        let relative_path = session_scoped_relative_path(
            session_id,
            &format!(
                "media/input-{digest}.{}",
                extension_for_media_type(&media_type)
            ),
        );
        let sidecar_ref = store.write_bytes(&SidecarBytesWriteRequest {
            session_id: session_id.to_string(),
            kind: "media".to_string(),
            logical_id: format!("input-{digest}"),
            relative_path,
            content: bytes,
        })?;
        attachment.uri = Some(sidecar_ref.ref_id.clone());
        let metadata = attachment
            .metadata
            .get_or_insert_with(|| Value::Object(Map::new()));
        let metadata = metadata
            .as_object_mut()
            .ok_or_else(|| "provider media attachment metadata must be an object".to_string())?;
        remove_inline_reference(metadata, "sourceUri");
        remove_inline_reference(metadata, "source_uri");
        remove_inline_reference(metadata, "previewUrl");
        remove_inline_reference(metadata, "preview_url");
        metadata.insert("mediaType".to_string(), Value::String(media_type));
        metadata.insert("byteSize".to_string(), Value::from(sidecar_ref.bytes));
        metadata.insert(
            "sha256".to_string(),
            Value::String(sidecar_ref.sha256.clone()),
        );
        metadata.insert(
            SIDECAR_REF_FIELD.to_string(),
            serde_json::to_value(sidecar_ref)
                .map_err(|error| format!("serialize input media sidecar ref failed: {error}"))?,
        );
    }
    Ok(())
}

pub(super) fn provider_input_from_references(
    input: &AgentInput,
    sidecar_store: Option<&SidecarStore>,
) -> Result<AgentInput, String> {
    let mut provider_input = input.clone();
    for attachment in &mut provider_input.attachments {
        if !attachment.kind.eq_ignore_ascii_case("image") {
            continue;
        }
        let Some(uri) = attachment.uri.as_deref().map(str::trim) else {
            continue;
        };
        if uri.to_ascii_lowercase().starts_with("data:image/")
            || uri.starts_with("http://")
            || uri.starts_with("https://")
        {
            continue;
        }
        let Some(sidecar_ref) = attachment_sidecar_ref(attachment) else {
            continue;
        };
        let store = sidecar_store.ok_or_else(|| {
            "provider media reference requires an initialized App Server sidecar store".to_string()
        })?;
        let content = store
            .read_bytes_verified(
                &sidecar_ref.relative_path,
                Some(&sidecar_ref.sha256),
                MAX_INPUT_MEDIA_BYTES as u64,
            )?
            .ok_or_else(|| format!("provider media reference {uri} is unavailable"))?;
        let media_type = attachment_media_type(attachment)
            .ok_or_else(|| format!("provider media reference {uri} is missing media type"))?;
        attachment.uri = Some(format!(
            "data:{media_type};base64,{}",
            BASE64_STANDARD.encode(content.bytes)
        ));
    }
    Ok(provider_input)
}

pub(super) fn attachment_reference_uri(attachment: &AgentAttachment) -> Option<String> {
    attachment_sidecar_ref(attachment)
        .map(|reference| reference.ref_id)
        .or_else(|| attachment.uri.clone())
}

pub(super) fn attachment_media_type(attachment: &AgentAttachment) -> Option<String> {
    attachment
        .metadata
        .as_ref()
        .and_then(Value::as_object)
        .and_then(|metadata| {
            ["mediaType", "media_type", "mimeType", "mime_type"]
                .iter()
                .filter_map(|key| metadata.get(*key))
                .find_map(Value::as_str)
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn attachment_sidecar_ref(attachment: &AgentAttachment) -> Option<SidecarRef> {
    let metadata = attachment.metadata.as_ref()?.as_object()?;
    [SIDECAR_REF_FIELD, "sidecar_ref"]
        .iter()
        .find_map(|key| metadata.get(*key))
        .and_then(|value| serde_json::from_value(value.clone()).ok())
}

fn decode_image_data_url(source: &str) -> Result<(Vec<u8>, String), String> {
    let (metadata, encoded) = source
        .strip_prefix("data:")
        .and_then(|value| value.split_once(','))
        .ok_or_else(|| "image data URL is malformed".to_string())?;
    if !metadata
        .split(';')
        .any(|part| part.eq_ignore_ascii_case("base64"))
    {
        return Err("image data URL must use base64 encoding".to_string());
    }
    let media_type = metadata
        .split(';')
        .next()
        .map(str::trim)
        .filter(|value| {
            matches!(
                *value,
                "image/png" | "image/jpeg" | "image/gif" | "image/webp"
            )
        })
        .ok_or_else(|| "provider image input uses an unsupported media type".to_string())?
        .to_string();
    let bytes = BASE64_STANDARD
        .decode(encoded.trim())
        .map_err(|error| format!("image data URL base64 decode failed: {error}"))?;
    if bytes.is_empty() {
        return Err("provider image input is empty".to_string());
    }
    if bytes.len() > MAX_INPUT_MEDIA_BYTES {
        return Err(format!(
            "provider image input exceeds {} bytes",
            MAX_INPUT_MEDIA_BYTES
        ));
    }
    Ok((bytes, media_type))
}

fn extension_for_media_type(media_type: &str) -> &'static str {
    match media_type {
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "png",
    }
}

fn remove_inline_reference(metadata: &mut Map<String, Value>, key: &str) {
    if metadata
        .get(key)
        .and_then(Value::as_str)
        .is_some_and(|value| value.trim_start().to_ascii_lowercase().starts_with("data:"))
    {
        metadata.remove(key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const PNG_DATA_URL: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";

    #[test]
    fn inline_image_is_persisted_as_reference_and_hydrated_only_for_provider() {
        let root = tempfile::tempdir().expect("sidecar root");
        let store = SidecarStore::new(root.path()).expect("sidecar store");
        let mut input = AgentInput {
            text: "describe".to_string(),
            attachments: vec![AgentAttachment {
                kind: "image".to_string(),
                uri: Some(PNG_DATA_URL.to_string()),
                metadata: Some(json!({
                    "mediaType": "image/png",
                    "previewUrl": PNG_DATA_URL
                })),
            }],
        };

        persist_inline_input_media(&mut input, Some(&store), "session-1")
            .expect("persist inline image");

        let persisted = serde_json::to_string(&input).expect("serialize persisted input");
        assert!(!persisted.contains("base64,"));
        assert!(input.attachments[0]
            .uri
            .as_deref()
            .is_some_and(|uri| uri.starts_with("sidecar://media/")));
        assert!(input.attachments[0]
            .metadata
            .as_ref()
            .is_some_and(|metadata| {
                metadata[SIDECAR_REF_FIELD]["relativePath"]
                    .as_str()
                    .is_some_and(|path| path.contains("/media/input-"))
            }));

        let hydrated =
            provider_input_from_references(&input, Some(&store)).expect("hydrate provider image");
        assert_eq!(hydrated.attachments[0].uri.as_deref(), Some(PNG_DATA_URL));
        assert_eq!(
            attachment_reference_uri(&hydrated.attachments[0]),
            input.attachments[0].uri
        );
    }

    #[test]
    fn inline_image_fails_closed_without_sidecar_or_with_invalid_payload() {
        let mut without_store = AgentInput {
            text: String::new(),
            attachments: vec![AgentAttachment {
                kind: "image".to_string(),
                uri: Some(PNG_DATA_URL.to_string()),
                metadata: None,
            }],
        };
        assert!(
            persist_inline_input_media(&mut without_store, None, "session-1")
                .expect_err("sidecar is required")
                .contains("sidecar store")
        );

        let root = tempfile::tempdir().expect("sidecar root");
        let store = SidecarStore::new(root.path()).expect("sidecar store");
        let mut invalid = AgentInput {
            text: String::new(),
            attachments: vec![AgentAttachment {
                kind: "image".to_string(),
                uri: Some("data:image/png;base64,%%%".to_string()),
                metadata: None,
            }],
        };
        assert!(
            persist_inline_input_media(&mut invalid, Some(&store), "session-1")
                .expect_err("invalid base64 must fail")
                .contains("base64 decode failed")
        );
    }
}
