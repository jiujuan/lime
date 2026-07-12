use super::support::*;
use super::*;
use crate::runtime::context_media::MEDIA_PROMPT_CONTEXT_KEY;
use crate::runtime::memory_prompt::CONTEXT_PACKET_TELEMETRY_KEY;
use std::sync::Arc;

async fn start_media_context_turn(attachments: Vec<AgentAttachment>) -> Arc<RecordingBackend> {
    let backend = Arc::new(RecordingBackend::default());
    let core = RuntimeCore::with_backend(backend.clone());
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_media_context".to_string()),
            thread_id: Some("thread_media_context".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session.session_id,
            turn_id: Some("turn_media_context".to_string()),
            input: AgentInput {
                text: "请结合附件继续".to_string(),
                attachments,
            },
            runtime_options: None,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("turn");

    backend
}

#[tokio::test]
async fn start_turn_projects_media_attachment_reference_into_context_telemetry() {
    let backend = start_media_context_turn(vec![AgentAttachment {
        kind: "image".to_string(),
        uri: Some("sidecar://media/input-1".to_string()),
        metadata: Some(json!({
            "mediaType": "image/png",
            "title": "设计稿截图",
            "byteSize": 4096,
            "sha256": "sha256:media-input-1"
        })),
    }])
    .await;

    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    let metadata = requests[0]
        .runtime_options
        .as_ref()
        .and_then(app_server_protocol::RuntimeOptions::runtime_metadata)
        .expect("runtime metadata");
    let context = metadata
        .get(MEDIA_PROMPT_CONTEXT_KEY)
        .expect("media prompt context");

    assert_eq!(context["schema"], "media_prompt_context.v1");
    assert_eq!(context["attachmentCount"], 1);
    assert_eq!(context["attachments"][0]["kind"], "image");
    assert_eq!(context["attachments"][0]["mimeType"], "image/png");
    assert_eq!(
        context["attachments"][0]["referenceUri"],
        "sidecar://media/input-1"
    );
    assert_eq!(
        metadata[CONTEXT_PACKET_TELEMETRY_KEY]["packets"][0]["source"],
        "media.input"
    );
    assert_eq!(
        metadata[CONTEXT_PACKET_TELEMETRY_KEY]["packets"][0]["kind"],
        "media_reference"
    );
    assert_eq!(
        metadata[CONTEXT_PACKET_TELEMETRY_KEY]["packets"][0]["fragmentEnvelope"]
            ["sidecar_reference"]["kind"],
        "media_input_reference"
    );
    assert_eq!(
        metadata[CONTEXT_PACKET_TELEMETRY_KEY]["packets"][0]["fragmentEnvelope"]
            ["sidecar_reference"]["uri"],
        "sidecar://media/input-1"
    );
    assert_eq!(
        metadata[CONTEXT_PACKET_TELEMETRY_KEY]["packets"][0]["fragmentEnvelope"]
            ["sidecar_reference"]["sha256"],
        "sha256:media-input-1"
    );
}

#[tokio::test]
async fn start_turn_does_not_project_inline_data_uri_media_context() {
    let backend = start_media_context_turn(vec![AgentAttachment {
        kind: "image".to_string(),
        uri: Some("data:image/png;base64,abcd".to_string()),
        metadata: Some(json!({
            "mediaType": "image/png",
        })),
    }])
    .await;

    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    let metadata = requests[0]
        .runtime_options
        .as_ref()
        .and_then(app_server_protocol::RuntimeOptions::runtime_metadata);

    assert!(metadata
        .and_then(|metadata| metadata.get(MEDIA_PROMPT_CONTEXT_KEY))
        .is_none());
    assert!(metadata
        .and_then(|metadata| metadata.get(CONTEXT_PACKET_TELEMETRY_KEY))
        .is_none());
    assert_eq!(
        requests[0].input.attachments[0].uri.as_deref(),
        Some("data:image/png;base64,abcd")
    );
}
