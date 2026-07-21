use super::context_packet::{assemble_context_packets, ContextPacket};
use super::memory_prompt::{merge_context_packet_telemetry, merge_runtime_options_metadata};
use super::output_refs::SIDECAR_REF_FIELD;
use super::{RuntimeCore, TurnStartRequest};
use agent_protocol::AgentInput;
use agent_runtime::reply_input::RuntimeReplyInput;
use serde_json::{json, Map, Value};

pub(crate) const MEDIA_PROMPT_CONTEXT_KEY: &str = "media_prompt_context";

const MEDIA_PROMPT_CONTEXT_VERSION: &str = "media_prompt_context.v1";
const MEDIA_PACKET_MAX_TOKENS: usize = 400;
const MAX_MEDIA_CONTEXT_PACKETS: usize = 8;

impl RuntimeCore {
    pub(in crate::runtime) fn prepare_media_prompt_context_from_provider_input(
        &self,
        params: &mut TurnStartRequest,
        input: &RuntimeReplyInput,
    ) {
        let inputs = input
            .images()
            .map(|image| AgentInput::Image {
                uri: image.uri.clone(),
                detail: image.detail,
            })
            .collect::<Vec<_>>();
        self.prepare_media_prompt_context_for_inputs(params, &inputs);
    }

    fn prepare_media_prompt_context_for_inputs(
        &self,
        params: &mut TurnStartRequest,
        inputs: &[AgentInput],
    ) {
        let media_contexts = inputs
            .iter()
            .enumerate()
            .filter_map(|(index, input)| media_context_from_input(index, input))
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

fn media_context_from_input(index: usize, input: &AgentInput) -> Option<MediaPromptContext> {
    let (uri, mime_type, source) = match input {
        AgentInput::Image { uri, .. } => {
            let uri = uri.trim();
            if uri.is_empty() || is_inline_media_payload_uri(uri) {
                return None;
            }
            (Some(uri), image_media_type(uri), "image")
        }
        AgentInput::LocalImage { .. } => (None, None, "local_image"),
        AgentInput::Text { .. } | AgentInput::Skill { .. } | AgentInput::Mention { .. } => {
            return None;
        }
    };
    let attachment_kind = "image";
    let mut packet_metadata = Map::new();
    packet_metadata.insert("attachmentIndex".to_string(), json!(index));
    packet_metadata.insert("attachmentKind".to_string(), json!(attachment_kind));
    packet_metadata.insert("source".to_string(), json!(source));
    if let Some(mime_type) = mime_type {
        packet_metadata.insert("mimeType".to_string(), json!(mime_type));
    }
    let sidecar_ref = uri.map(|uri| media_sidecar_reference(uri, None));
    if let Some(sidecar_ref) = sidecar_ref.as_ref() {
        packet_metadata.insert(SIDECAR_REF_FIELD.to_string(), sidecar_ref.clone());
    }

    let content = media_context_content(index, attachment_kind, mime_type, None, None, None);
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
        "source": source,
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

fn image_media_type(uri: &str) -> Option<&'static str> {
    let path = uri
        .split_once('?')
        .map(|(path, _)| path)
        .unwrap_or(uri)
        .to_ascii_lowercase();
    if path.ends_with(".png") {
        Some("image/png")
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        Some("image/jpeg")
    } else if path.ends_with(".gif") {
        Some("image/gif")
    } else if path.ends_with(".webp") {
        Some("image/webp")
    } else {
        None
    }
}

fn is_inline_media_payload_uri(uri: &str) -> bool {
    uri.trim_start()
        .get(..5)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("data:"))
}
