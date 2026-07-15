use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
pub struct MessageContentReference {
    pub uri: String,
    pub mime_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_uri: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_url: Option<String>,
    #[serde(default, alias = "sidecarRef", skip_serializing_if = "Option::is_none")]
    pub sidecar_ref: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub byte_size: Option<u64>,
}

impl MessageContentReference {
    pub fn is_safe(&self) -> bool {
        !self.uri.trim().is_empty()
            && !self.mime_type.trim().is_empty()
            && !is_inline_payload_uri(&self.uri)
            && self
                .source_uri
                .as_deref()
                .is_none_or(|uri| !is_inline_payload_uri(uri))
            && self
                .preview_url
                .as_deref()
                .is_none_or(|uri| !is_inline_payload_uri(uri))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MessageContentPart {
    Text {
        text: String,
    },
    Media {
        kind: String,
        reference: MessageContentReference,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        caption: Option<String>,
    },
}

impl MessageContentPart {
    pub fn is_safe(&self) -> bool {
        match self {
            Self::Text { .. } => true,
            Self::Media {
                kind, reference, ..
            } => !kind.trim().is_empty() && reference.is_safe(),
        }
    }
}

fn is_inline_payload_uri(uri: &str) -> bool {
    uri.trim_start().to_ascii_lowercase().starts_with("data:")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn media_reference(uri: &str) -> MessageContentReference {
        MessageContentReference {
            uri: uri.to_string(),
            mime_type: "image/png".to_string(),
            title: Some("result".to_string()),
            source_uri: Some("sidecar://media/source".to_string()),
            source_path: Some("/tmp/media/result.png".to_string()),
            preview_url: Some("asset:///tmp/media/result.png".to_string()),
            sidecar_ref: None,
            sha256: Some("abc123".to_string()),
            byte_size: Some(4),
        }
    }

    #[test]
    fn content_parts_use_tagged_typed_wire_shape_and_roundtrip() {
        let parts = vec![
            MessageContentPart::Text {
                text: "result".to_string(),
            },
            MessageContentPart::Media {
                kind: "image".to_string(),
                reference: media_reference("sidecar://media/result"),
                caption: Some("result image".to_string()),
            },
        ];

        let encoded = serde_json::to_value(&parts).expect("serialize content parts");
        assert_eq!(encoded[0], json!({"type": "text", "text": "result"}));
        assert_eq!(encoded[1]["type"], "media");
        assert_eq!(encoded[1]["reference"]["mime_type"], "image/png");
        assert_eq!(
            encoded[1]["reference"]["source_path"],
            "/tmp/media/result.png"
        );
        assert_eq!(
            serde_json::from_value::<Vec<MessageContentPart>>(encoded)
                .expect("deserialize content parts"),
            parts
        );
    }

    #[test]
    fn media_reference_rejects_inline_data_owners() {
        assert!(!media_reference("data:image/png;base64,AAAA").is_safe());

        let mut source = media_reference("sidecar://media/result");
        source.source_uri = Some(" DATA:image/png;base64,AAAA".to_string());
        assert!(!source.is_safe());

        let mut preview = media_reference("sidecar://media/result");
        preview.preview_url = Some("data:image/png;base64,BBBB".to_string());
        assert!(!preview.is_safe());
    }
}
