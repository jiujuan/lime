use super::sidecar_store::{
    session_scoped_relative_path, SidecarBytesWriteRequest, SidecarRef, SidecarStore,
};
use agent_runtime::reply_input::{RuntimeReplyInputImage, RuntimeReplyInputMedia};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use sha2::{Digest, Sha256};
use std::path::Path;

const MAX_INPUT_MEDIA_BYTES: usize = 32 * 1024 * 1024;

pub(super) fn resolve_runtime_input_media(
    media: RuntimeReplyInputMedia,
    sidecar_store: Option<&SidecarStore>,
    session_id: &str,
) -> Result<RuntimeReplyInputImage, String> {
    match media {
        RuntimeReplyInputMedia::Image { uri, detail } => {
            let uri = uri.trim();
            if uri.to_ascii_lowercase().starts_with("data:") {
                let store = sidecar_store.ok_or_else(|| {
                    "inline provider media requires an initialized App Server sidecar store"
                        .to_string()
                })?;
                let (bytes, media_type) = decode_image_data_url(uri)?;
                validate_image_bytes(&bytes, Some(&media_type))?;
                let sidecar_ref = persist_image_bytes(&bytes, &media_type, store, session_id)?;
                return Ok(RuntimeReplyInputImage {
                    uri: sidecar_ref.ref_id,
                    media_type: media_type.clone(),
                    provider_data: Some(format!(
                        "data:{media_type};base64,{}",
                        BASE64_STANDARD.encode(bytes)
                    )),
                    detail,
                });
            }
            if uri.to_ascii_lowercase().starts_with("sidecar://") {
                return Ok(RuntimeReplyInputImage {
                    uri: uri.to_string(),
                    media_type: "image/*".to_string(),
                    provider_data: None,
                    detail,
                });
            }
            let parsed = url::Url::parse(uri)
                .map_err(|error| format!("remote provider image URL is invalid: {error}"))?;
            if !matches!(parsed.scheme(), "http" | "https") {
                return Err("remote provider image must use http or https".to_string());
            }
            Ok(RuntimeReplyInputImage {
                uri: parsed.to_string(),
                media_type: remote_image_media_type(&parsed).to_string(),
                provider_data: None,
                detail,
            })
        }
        RuntimeReplyInputMedia::LocalImage { path, detail } => {
            let path = Path::new(path.trim());
            if path.as_os_str().is_empty() {
                return Err("local image path must not be empty".to_string());
            }
            let store = sidecar_store.ok_or_else(|| {
                "local provider image requires an initialized App Server sidecar store".to_string()
            })?;
            let metadata = std::fs::metadata(path)
                .map_err(|error| format!("read local image metadata failed: {error}"))?;
            if !metadata.is_file() {
                return Err("local image path must reference a regular file".to_string());
            }
            if metadata.len() > MAX_INPUT_MEDIA_BYTES as u64 {
                return Err(format!(
                    "provider image input exceeds {} bytes",
                    MAX_INPUT_MEDIA_BYTES
                ));
            }
            let bytes =
                std::fs::read(path).map_err(|error| format!("read local image failed: {error}"))?;
            let media_type = validate_image_bytes(&bytes, None)?.to_string();
            let sidecar_ref = persist_image_bytes(&bytes, &media_type, store, session_id)?;
            Ok(RuntimeReplyInputImage {
                uri: sidecar_ref.ref_id,
                media_type: media_type.clone(),
                provider_data: Some(format!(
                    "data:{media_type};base64,{}",
                    BASE64_STANDARD.encode(bytes)
                )),
                detail,
            })
        }
    }
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

fn persist_image_bytes(
    bytes: &[u8],
    media_type: &str,
    store: &SidecarStore,
    session_id: &str,
) -> Result<SidecarRef, String> {
    let digest = hex::encode(Sha256::digest(bytes));
    let relative_path = session_scoped_relative_path(
        session_id,
        &format!(
            "media/input-{digest}.{}",
            extension_for_media_type(media_type)
        ),
    );
    store.write_bytes(&SidecarBytesWriteRequest {
        session_id: session_id.to_string(),
        kind: "media".to_string(),
        logical_id: format!("input-{digest}"),
        relative_path,
        content: bytes.to_vec(),
    })
}

fn validate_image_bytes<'a>(
    bytes: &[u8],
    declared_media_type: Option<&'a str>,
) -> Result<&'a str, String> {
    let detected = detected_image_media_type(bytes)
        .ok_or_else(|| "provider image input is not a supported image".to_string())?;
    if let Some(declared) = declared_media_type {
        if declared != detected {
            return Err(format!(
                "provider image media type mismatch: declared {declared}, detected {detected}"
            ));
        }
        return Ok(declared);
    }
    Ok(detected)
}

fn detected_image_media_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    None
}

fn remote_image_media_type(url: &url::Url) -> &'static str {
    let path = url.path().to_ascii_lowercase();
    if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        "image/jpeg"
    } else if path.ends_with(".gif") {
        "image/gif"
    } else if path.ends_with(".webp") {
        "image/webp"
    } else {
        "image/*"
    }
}

fn extension_for_media_type(media_type: &str) -> &'static str {
    match media_type {
        "image/jpeg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        _ => "png",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_protocol::ImageDetail;

    const PNG_DATA_URL: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";

    #[test]
    fn typed_local_image_is_validated_and_sidecarized_for_provider() {
        let root = tempfile::tempdir().expect("sidecar root");
        let store = SidecarStore::new(root.path()).expect("sidecar store");
        let image_path = root.path().join("input.png");
        let (_, encoded) = PNG_DATA_URL.split_once(',').expect("png data URL");
        let bytes = BASE64_STANDARD.decode(encoded).expect("decode fixture");
        std::fs::write(&image_path, bytes).expect("write local image");

        let image = resolve_runtime_input_media(
            RuntimeReplyInputMedia::LocalImage {
                path: image_path.display().to_string(),
                detail: Some(ImageDetail::Original),
            },
            Some(&store),
            "session-1",
        )
        .expect("resolve local image");

        assert!(image.uri.starts_with("sidecar://media/"));
        assert_eq!(image.media_type, "image/png");
        assert_eq!(image.provider_data.as_deref(), Some(PNG_DATA_URL));
        assert_eq!(image.detail, Some(ImageDetail::Original));
        assert!(!image
            .provider_data
            .as_deref()
            .is_some_and(|value| value.contains(&image_path.display().to_string())));
    }

    #[test]
    fn typed_remote_and_inline_images_keep_native_provider_shapes() {
        let remote = resolve_runtime_input_media(
            RuntimeReplyInputMedia::Image {
                uri: "https://example.com/assets/image.webp?version=1".to_string(),
                detail: Some(ImageDetail::High),
            },
            None,
            "session-1",
        )
        .expect("resolve remote image");
        assert_eq!(
            remote.uri,
            "https://example.com/assets/image.webp?version=1"
        );
        assert_eq!(remote.media_type, "image/webp");
        assert_eq!(remote.provider_data, None);
        assert_eq!(remote.detail, Some(ImageDetail::High));

        let root = tempfile::tempdir().expect("sidecar root");
        let store = SidecarStore::new(root.path()).expect("sidecar store");
        let inline = resolve_runtime_input_media(
            RuntimeReplyInputMedia::Image {
                uri: PNG_DATA_URL.to_string(),
                detail: Some(ImageDetail::Low),
            },
            Some(&store),
            "session-1",
        )
        .expect("resolve inline image");
        assert!(inline.uri.starts_with("sidecar://media/"));
        assert_eq!(inline.provider_data.as_deref(), Some(PNG_DATA_URL));
        assert_eq!(inline.detail, Some(ImageDetail::Low));
    }

    #[test]
    fn typed_media_rejects_local_leaks_and_mismatched_payloads() {
        let without_store = resolve_runtime_input_media(
            RuntimeReplyInputMedia::LocalImage {
                path: "/workspace/image.png".to_string(),
                detail: None,
            },
            None,
            "session-1",
        )
        .expect_err("local image requires sidecar");
        assert!(without_store.contains("sidecar store"));

        let root = tempfile::tempdir().expect("sidecar root");
        let store = SidecarStore::new(root.path()).expect("sidecar store");
        let mismatched = resolve_runtime_input_media(
            RuntimeReplyInputMedia::Image {
                uri: PNG_DATA_URL.replacen("image/png", "image/jpeg", 1),
                detail: None,
            },
            Some(&store),
            "session-1",
        )
        .expect_err("declared MIME must match image signature");
        assert!(mismatched.contains("media type mismatch"));

        assert!(resolve_runtime_input_media(
            RuntimeReplyInputMedia::Image {
                uri: "file:///workspace/image.png".to_string(),
                detail: None,
            },
            Some(&store),
            "session-1",
        )
        .expect_err("remote image cannot use file scheme")
        .contains("http or https"));
    }
}
