use super::sidecar_store::{normalize_sidecar_relative_path, session_scoped_relative_path};
use super::{RuntimeCore, RuntimeCoreError, StoredSession};
use app_server_protocol::{AgentSessionMediaReadParams, AgentSessionMediaReadResponse};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde_json::Value;
use std::collections::HashSet;

const DEFAULT_MAX_MEDIA_SIDECAR_BYTES: u64 = 8 * 1024 * 1024;
const MAX_MEDIA_SIDECAR_BYTES: u64 = 32 * 1024 * 1024;

impl RuntimeCore {
    pub fn read_agent_session_media(
        &self,
        params: AgentSessionMediaReadParams,
    ) -> Result<AgentSessionMediaReadResponse, RuntimeCoreError> {
        self.read_agent_session_media_with_cancel(params, || false)
    }

    pub(crate) fn read_agent_session_media_with_cancel(
        &self,
        params: AgentSessionMediaReadParams,
        is_canceled: impl Fn() -> bool,
    ) -> Result<AgentSessionMediaReadResponse, RuntimeCoreError> {
        let requested = RequestedMediaSidecar::from_params(&params)?;
        let sidecar_store = self.sidecar_store.as_ref().ok_or_else(|| {
            RuntimeCoreError::Backend(
                "agentSession/media/read requires an initialized sidecar store".to_string(),
            )
        })?;
        fail_if_canceled(&is_canceled)?;
        let known_ref = {
            let state = self
                .state
                .lock()
                .expect("runtime core state mutex poisoned");
            let stored = state
                .sessions
                .get(&params.session_id)
                .ok_or_else(|| RuntimeCoreError::SessionNotFound(params.session_id.clone()))?;
            known_media_sidecar_refs(stored)
                .into_iter()
                .find(|candidate| candidate.matches(&requested))
        }
        .ok_or_else(|| {
            RuntimeCoreError::Backend(
                "agent session media sidecar reference is not available".to_string(),
            )
        })?;

        let relative_path = session_scoped_media_relative_path(
            params.session_id.as_str(),
            known_ref.relative_path.as_str(),
        )?;
        let max_bytes = params
            .max_bytes
            .unwrap_or(DEFAULT_MAX_MEDIA_SIDECAR_BYTES)
            .min(MAX_MEDIA_SIDECAR_BYTES);
        let offset = params.offset.unwrap_or(0);
        let length = params.length.unwrap_or(max_bytes);
        fail_if_canceled(&is_canceled)?;
        let content = sidecar_store
            .read_bytes_range_verified_with_cancel(
                relative_path.as_str(),
                known_ref.sha256.as_deref(),
                offset,
                length,
                max_bytes,
                &is_canceled,
            )
            .map_err(sidecar_read_error)?
            .ok_or_else(|| {
                RuntimeCoreError::Backend(
                    "agent session media sidecar content is not available".to_string(),
                )
            })?;
        fail_if_canceled(&is_canceled)?;
        if let Some(expected_bytes) = known_ref.bytes {
            let actual_bytes = content.total_bytes;
            if expected_bytes != actual_bytes {
                return Err(RuntimeCoreError::Backend(format!(
                    "agent session media sidecar size mismatch: expected {expected_bytes}, actual {actual_bytes}"
                )));
            }
        }

        Ok(AgentSessionMediaReadResponse {
            session_id: params.session_id,
            uri: known_ref
                .uri
                .or(known_ref.ref_id)
                .unwrap_or_else(|| requested.display_uri()),
            mime_type: known_ref.mime_type,
            bytes: content.bytes.len() as u64,
            total_bytes: content.total_bytes,
            offset: content.offset,
            length: content.length,
            content_range: format_content_range(
                content.offset,
                content.length,
                content.total_bytes,
            ),
            has_more: content.has_more,
            sha256: content.sha256,
            content_base64: BASE64_STANDARD.encode(content.bytes),
            sidecar_ref: Some(known_ref.sidecar_ref),
        })
    }
}

fn fail_if_canceled(is_canceled: &impl Fn() -> bool) -> Result<(), RuntimeCoreError> {
    if is_canceled() {
        Err(RuntimeCoreError::RequestCanceled)
    } else {
        Ok(())
    }
}

fn sidecar_read_error(error: String) -> RuntimeCoreError {
    if error == super::sidecar_store::SIDECAR_READ_CANCELED {
        RuntimeCoreError::RequestCanceled
    } else {
        RuntimeCoreError::Backend(error)
    }
}

#[derive(Debug, Clone)]
struct RequestedMediaSidecar {
    keys: HashSet<String>,
    relative_path: Option<String>,
}

impl RequestedMediaSidecar {
    fn from_params(params: &AgentSessionMediaReadParams) -> Result<Self, RuntimeCoreError> {
        let mut keys = HashSet::new();
        push_key(&mut keys, params.uri.as_deref());
        push_key(&mut keys, params.ref_id.as_deref());
        if let Some(sidecar_ref) = params.sidecar_ref.as_ref() {
            push_key(&mut keys, string_value(sidecar_ref, &["ref"]).as_deref());
            push_key(&mut keys, string_value(sidecar_ref, &["uri"]).as_deref());
        }
        let relative_path = params
            .sidecar_ref
            .as_ref()
            .and_then(|sidecar_ref| string_value(sidecar_ref, &["relativePath", "relative_path"]))
            .and_then(|path| normalize_sidecar_relative_path(path.as_str()).ok());

        if keys.is_empty() && relative_path.is_none() {
            return Err(RuntimeCoreError::Backend(
                "agentSession/media/read requires uri, ref, or sidecarRef".to_string(),
            ));
        }
        Ok(Self {
            keys,
            relative_path,
        })
    }

    fn display_uri(&self) -> String {
        self.keys
            .iter()
            .next()
            .cloned()
            .or_else(|| self.relative_path.clone())
            .unwrap_or_else(|| "sidecar://media/unknown".to_string())
    }
}

#[derive(Debug, Clone)]
struct KnownMediaSidecarRef {
    ref_id: Option<String>,
    uri: Option<String>,
    relative_path: String,
    sha256: Option<String>,
    bytes: Option<u64>,
    mime_type: Option<String>,
    sidecar_ref: Value,
}

impl KnownMediaSidecarRef {
    fn matches(&self, requested: &RequestedMediaSidecar) -> bool {
        self.ref_id
            .as_deref()
            .is_some_and(|value| requested.keys.contains(value))
            || self
                .uri
                .as_deref()
                .is_some_and(|value| requested.keys.contains(value))
            || requested
                .relative_path
                .as_deref()
                .is_some_and(|value| value == self.relative_path)
    }
}

fn known_media_sidecar_refs(stored: &StoredSession) -> Vec<KnownMediaSidecarRef> {
    let mut refs = Vec::new();
    for event in &stored.events {
        collect_media_sidecar_refs_from_value(&event.payload, &mut refs);
    }
    for input in stored.turn_inputs.values() {
        for attachment in &input.attachments {
            if let Some(metadata) = attachment.metadata.as_ref() {
                collect_media_sidecar_refs_from_value(metadata, &mut refs);
            }
        }
    }
    refs
}

fn collect_media_sidecar_refs_from_value(value: &Value, refs: &mut Vec<KnownMediaSidecarRef>) {
    match value {
        Value::Object(object) => {
            for key in ["sidecarRef", "sidecar_ref"] {
                if let Some(sidecar_ref) = object.get(key) {
                    if let Some(known_ref) = known_media_sidecar_ref(sidecar_ref, value) {
                        refs.push(known_ref);
                    }
                }
            }
            for child in object.values() {
                collect_media_sidecar_refs_from_value(child, refs);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_media_sidecar_refs_from_value(item, refs);
            }
        }
        _ => {}
    }
}

fn known_media_sidecar_ref(sidecar_ref: &Value, context: &Value) -> Option<KnownMediaSidecarRef> {
    if !looks_like_media_sidecar_ref(sidecar_ref, context) {
        return None;
    }
    let relative_path = string_value(sidecar_ref, &["relativePath", "relative_path"])
        .and_then(|path| normalize_sidecar_relative_path(path.as_str()).ok())?;
    Some(KnownMediaSidecarRef {
        ref_id: string_value(sidecar_ref, &["ref"]),
        uri: string_value(sidecar_ref, &["uri"]).or_else(|| string_value(context, &["uri"])),
        relative_path,
        sha256: string_value(sidecar_ref, &["sha256", "sha"])
            .or_else(|| string_value(context, &["sha256", "sha"])),
        bytes: u64_value(sidecar_ref, &["bytes", "byteSize", "byte_size"])
            .or_else(|| u64_value(context, &["bytes", "byteSize", "byte_size"])),
        mime_type: string_value(
            sidecar_ref,
            &["mimeType", "mime_type", "mediaType", "media_type"],
        )
        .or_else(|| {
            string_value(
                context,
                &["mimeType", "mime_type", "mediaType", "media_type"],
            )
        }),
        sidecar_ref: sidecar_ref.clone(),
    })
}

fn looks_like_media_sidecar_ref(sidecar_ref: &Value, context: &Value) -> bool {
    string_value(sidecar_ref, &["kind"])
        .or_else(|| string_value(context, &["kind", "type"]))
        .is_some_and(|value| value.to_ascii_lowercase().contains("media"))
        || string_value(sidecar_ref, &["ref", "uri"])
            .or_else(|| string_value(context, &["uri", "sourceUri", "source_uri"]))
            .is_some_and(|value| media_sidecar_uri(value.as_str()))
}

fn media_sidecar_uri(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    normalized.starts_with("sidecar://media/") || normalized.contains("/media/")
}

fn session_scoped_media_relative_path(
    session_id: &str,
    relative_path: &str,
) -> Result<String, RuntimeCoreError> {
    let relative_path =
        normalize_sidecar_relative_path(relative_path).map_err(RuntimeCoreError::Backend)?;
    let session_prefix = session_scoped_relative_path(session_id, "");
    if !relative_path.starts_with(session_prefix.as_str()) {
        return Err(RuntimeCoreError::Backend(
            "agent session media sidecar path is outside the requested session".to_string(),
        ));
    }
    Ok(relative_path)
}

fn format_content_range(offset: u64, length: u64, total_bytes: u64) -> String {
    if length == 0 {
        return format!("bytes */{total_bytes}");
    }
    let end = offset.saturating_add(length).saturating_sub(1);
    format!("bytes {offset}-{end}/{total_bytes}")
}

fn push_key(keys: &mut HashSet<String>, value: Option<&str>) {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };
    keys.insert(value.to_string());
}

fn string_value(value: &Value, keys: &[&str]) -> Option<String> {
    let object = value.as_object()?;
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn u64_value(value: &Value, keys: &[&str]) -> Option<u64> {
    let object = value.as_object()?;
    keys.iter()
        .filter_map(|key| object.get(*key))
        .find_map(|value| {
            value.as_u64().or_else(|| {
                value
                    .as_i64()
                    .filter(|value| *value >= 0)
                    .and_then(|value| u64::try_from(value).ok())
            })
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::sidecar_store::{SidecarBytesWriteRequest, SidecarStore};
    use crate::RuntimeEvent;
    use app_server_protocol::AgentSessionStartParams;
    use serde_json::json;
    use std::sync::Arc;

    fn prepared_core_with_media_ref(
        sidecar_ref_override: Option<Value>,
    ) -> (RuntimeCore, tempfile::TempDir, String) {
        let temp = tempfile::tempdir().expect("tempdir");
        let sidecar_store = Arc::new(SidecarStore::new(temp.path()).expect("sidecar store"));
        let core = RuntimeCore::default().with_sidecar_store(sidecar_store.clone());
        core.start_session(AgentSessionStartParams {
            session_id: Some("sess-media-read".to_string()),
            thread_id: Some("thread-media-read".to_string()),
            app_id: "agent-chat".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session");
        let sidecar_ref = sidecar_store
            .write_bytes(&SidecarBytesWriteRequest {
                session_id: "sess-media-read".to_string(),
                kind: "media".to_string(),
                logical_id: "fixture-image".to_string(),
                relative_path: "sessions/sess-media-read/media/fixture-image.png".to_string(),
                content: vec![0x89, b'P', b'N', b'G'],
            })
            .expect("write media sidecar");
        let sidecar_ref_value =
            sidecar_ref_override.unwrap_or_else(|| serde_json::to_value(&sidecar_ref).unwrap());
        let ref_id = sidecar_ref.ref_id.clone();
        core.append_runtime_events(
            "sess-media-read",
            "thread-media-read",
            Some("turn-media-read"),
            vec![RuntimeEvent::new(
                "message.delta",
                json!({
                    "itemId": "agent-media-1",
                    "contentPart": {
                        "type": "media",
                        "kind": "image",
                        "reference": {
                            "uri": ref_id,
                            "mime_type": "image/png",
                            "sidecar_ref": sidecar_ref_value
                        }
                    }
                }),
            )],
        )
        .expect("append media event");
        (core, temp, ref_id)
    }

    #[test]
    fn reads_known_media_sidecar_bytes_with_digest_check() {
        let (core, _temp, ref_id) = prepared_core_with_media_ref(None);

        let response = core
            .read_agent_session_media(AgentSessionMediaReadParams {
                session_id: "sess-media-read".to_string(),
                uri: Some(ref_id.clone()),
                ref_id: None,
                sidecar_ref: None,
                max_bytes: Some(1024),
                offset: None,
                length: None,
            })
            .expect("read media");

        assert_eq!(response.session_id, "sess-media-read");
        assert_eq!(response.uri, ref_id);
        assert_eq!(response.mime_type.as_deref(), Some("image/png"));
        assert_eq!(response.bytes, 4);
        assert_eq!(response.total_bytes, 4);
        assert_eq!(response.offset, 0);
        assert_eq!(response.length, 4);
        assert_eq!(response.content_range, "bytes 0-3/4");
        assert!(!response.has_more);
        assert_eq!(response.content_base64, "iVBORw==");
        assert!(response.sha256.starts_with("sha256:"));
        assert!(response.sidecar_ref.is_some());
    }

    #[test]
    fn reads_known_media_sidecar_range_with_full_digest_check() {
        let (core, _temp, ref_id) = prepared_core_with_media_ref(None);

        let response = core
            .read_agent_session_media(AgentSessionMediaReadParams {
                session_id: "sess-media-read".to_string(),
                uri: Some(ref_id.clone()),
                ref_id: None,
                sidecar_ref: None,
                max_bytes: Some(2),
                offset: Some(1),
                length: Some(2),
            })
            .expect("read media range");

        assert_eq!(response.session_id, "sess-media-read");
        assert_eq!(response.uri, ref_id);
        assert_eq!(response.bytes, 2);
        assert_eq!(response.total_bytes, 4);
        assert_eq!(response.offset, 1);
        assert_eq!(response.length, 2);
        assert_eq!(response.content_range, "bytes 1-2/4");
        assert!(response.has_more);
        assert_eq!(response.content_base64, "UE4=");
        assert!(response.sha256.starts_with("sha256:"));
    }

    #[test]
    fn rejects_unknown_media_sidecar_ref() {
        let (core, _temp, _ref_id) = prepared_core_with_media_ref(None);

        let error = core
            .read_agent_session_media(AgentSessionMediaReadParams {
                session_id: "sess-media-read".to_string(),
                uri: Some("sidecar://media/missing".to_string()),
                ref_id: None,
                sidecar_ref: None,
                max_bytes: Some(1024),
                offset: None,
                length: None,
            })
            .expect_err("unknown ref");

        assert!(error.to_string().contains("reference is not available"));
    }

    #[test]
    fn rejects_media_sidecar_digest_mismatch() {
        let bad_ref = json!({
            "ref": "sidecar://media/bad",
            "kind": "media",
            "relativePath": "sessions/sess-media-read/media/fixture-image.png",
            "bytes": 4,
            "sha256": "sha256:bad"
        });
        let (core, _temp, _ref_id) = prepared_core_with_media_ref(Some(bad_ref.clone()));
        let ref_id = bad_ref
            .get("ref")
            .and_then(Value::as_str)
            .unwrap()
            .to_string();

        let error = core
            .read_agent_session_media(AgentSessionMediaReadParams {
                session_id: "sess-media-read".to_string(),
                uri: Some(ref_id),
                ref_id: None,
                sidecar_ref: None,
                max_bytes: Some(1024),
                offset: None,
                length: None,
            })
            .expect_err("digest mismatch");

        assert!(error.to_string().contains("校验失败"));
    }
}
