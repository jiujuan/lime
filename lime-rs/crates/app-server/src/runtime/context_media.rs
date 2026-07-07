use super::context_packet::{assemble_context_packets, ContextPacket};
use super::memory_prompt::{merge_context_packet_telemetry, merge_runtime_options_metadata};
use super::output_refs::SIDECAR_REF_FIELD;
use super::RuntimeCore;
use app_server_protocol::{AgentAttachment, AgentSessionTurnStartParams};
use serde_json::{json, Map, Value};

pub(crate) const MEDIA_PROMPT_CONTEXT_KEY: &str = "media_prompt_context";

const MEDIA_PROMPT_CONTEXT_VERSION: &str = "media_prompt_context.v1";
const MEDIA_PACKET_MAX_TOKENS: usize = 400;
const MAX_MEDIA_CONTEXT_PACKETS: usize = 8;

impl RuntimeCore {
    pub(in crate::runtime) fn prepare_media_prompt_context(
        &self,
        params: &mut AgentSessionTurnStartParams,
    ) {
        let media_contexts = params
            .input
            .attachments
            .iter()
            .enumerate()
            .filter_map(|(index, attachment)| media_context_from_attachment(index, attachment))
            .take(MAX_MEDIA_CONTEXT_PACKETS)
            .collect::<Vec<_>>();
        if media_contexts.is_empty() {
            return;
        }

        let packets = media_contexts
            .iter()
            .map(|context| context.packet.clone())
            .collect::<Vec<_>>();
        let assembly = assemble_context_packets(packets);
        let context = json!({
            "schema": MEDIA_PROMPT_CONTEXT_VERSION,
            "attachmentCount": media_contexts.len(),
            "attachments": media_contexts
                .iter()
                .map(|context| context.metadata.clone())
                .collect::<Vec<_>>(),
            "contextPacketTelemetry": assembly.telemetry.clone(),
        });
        merge_context_packet_telemetry(params, assembly.telemetry);
        merge_runtime_options_metadata(params, MEDIA_PROMPT_CONTEXT_KEY, context);
    }
}

#[derive(Debug, Clone)]
struct MediaPromptContext {
    packet: ContextPacket,
    metadata: Value,
}

fn media_context_from_attachment(
    index: usize,
    attachment: &AgentAttachment,
) -> Option<MediaPromptContext> {
    let uri = attachment
        .uri
        .as_deref()
        .map(str::trim)
        .filter(|uri| !uri.is_empty())?;
    if is_inline_media_payload_uri(uri) {
        return None;
    }

    let metadata = attachment.metadata.as_ref();
    let attachment_kind = normalize_attachment_kind(&attachment.kind);
    let mime_type = metadata_string(
        metadata,
        &["mediaType", "media_type", "mimeType", "mime_type"],
    );
    let title = metadata_string(
        metadata,
        &["title", "name", "fileName", "file_name", "filename"],
    );
    let caption = metadata_string(metadata, &["caption", "description", "alt", "altText"]);
    let sha256 = metadata_string(metadata, &["sha256", "sha"]);
    let byte_size = metadata_u64(metadata, &["byteSize", "byte_size", "size", "fileSize"]);

    let mut packet_metadata = Map::new();
    packet_metadata.insert("attachmentIndex".to_string(), json!(index));
    packet_metadata.insert("attachmentKind".to_string(), json!(attachment_kind));
    if let Some(mime_type) = mime_type.as_deref() {
        packet_metadata.insert("mimeType".to_string(), json!(mime_type));
    }
    if let Some(title) = title.as_deref() {
        packet_metadata.insert("title".to_string(), json!(title));
    }
    if let Some(caption) = caption.as_deref() {
        packet_metadata.insert("caption".to_string(), json!(caption));
    }
    if let Some(byte_size) = byte_size {
        packet_metadata.insert("byteSize".to_string(), json!(byte_size));
    }

    let sidecar_ref = media_sidecar_reference(uri, sha256.as_deref());
    packet_metadata.insert(SIDECAR_REF_FIELD.to_string(), sidecar_ref.clone());

    let content = media_context_content(
        index,
        &attachment_kind,
        mime_type.as_deref(),
        title.as_deref(),
        caption.as_deref(),
        byte_size,
    );
    let packet = ContextPacket::media_reference(
        format!("media.reference.{index}"),
        content,
        MEDIA_PACKET_MAX_TOKENS,
        packet_metadata,
    );
    let metadata = json!({
        "index": index,
        "kind": attachment_kind,
        "mimeType": mime_type,
        "title": title,
        "caption": caption,
        "byteSize": byte_size,
        "referenceUri": uri,
        "sidecarRef": sidecar_ref,
    });

    Some(MediaPromptContext { packet, metadata })
}

fn media_context_content(
    index: usize,
    attachment_kind: &str,
    mime_type: Option<&str>,
    title: Option<&str>,
    caption: Option<&str>,
    byte_size: Option<u64>,
) -> String {
    let mut lines = vec![
        format!("- Attachment index: {index}"),
        format!("- Kind: {attachment_kind}"),
    ];
    if let Some(mime_type) = mime_type {
        lines.push(format!("- MIME: {mime_type}"));
    }
    if let Some(title) = title {
        lines.push(format!("- Title: {title}"));
    }
    if let Some(caption) = caption {
        lines.push(format!("- Caption: {caption}"));
    }
    if let Some(byte_size) = byte_size {
        lines.push(format!("- Bytes: {byte_size}"));
    }
    lines.push("- Binary/media payload is reference-only; inspect runtime media input or explicit user text before describing contents.".to_string());
    lines.join("\n")
}

fn media_sidecar_reference(uri: &str, sha256: Option<&str>) -> Value {
    let mut sidecar_ref = Map::new();
    sidecar_ref.insert("kind".to_string(), json!("media_input_reference"));
    sidecar_ref.insert("ref".to_string(), json!(uri));
    sidecar_ref.insert("uri".to_string(), json!(uri));
    if let Some(sha256) = sha256 {
        sidecar_ref.insert("sha256".to_string(), json!(sha256));
    }
    Value::Object(sidecar_ref)
}

fn normalize_attachment_kind(kind: &str) -> String {
    let kind = kind.trim();
    if kind.is_empty() {
        "media".to_string()
    } else {
        kind.to_ascii_lowercase()
    }
}

fn metadata_string(metadata: Option<&Value>, keys: &[&str]) -> Option<String> {
    let metadata = metadata?.as_object()?;
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn metadata_u64(metadata: Option<&Value>, keys: &[&str]) -> Option<u64> {
    let metadata = metadata?.as_object()?;
    keys.iter()
        .filter_map(|key| metadata.get(*key))
        .find_map(|value| {
            value.as_u64().or_else(|| {
                value
                    .as_i64()
                    .filter(|value| *value >= 0)
                    .and_then(|value| u64::try_from(value).ok())
            })
        })
}

fn is_inline_media_payload_uri(uri: &str) -> bool {
    uri.trim_start()
        .get(..5)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("data:"))
}
