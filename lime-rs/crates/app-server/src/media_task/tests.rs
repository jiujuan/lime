use super::{complete_image_generation_task_artifact, create_image_generation_task_artifact};
use crate::runtime::sidecar_store::SidecarStore;
use app_server_protocol::{
    MediaTaskArtifactCompletedImageInput, MediaTaskArtifactImageCompleteParams,
    MediaTaskArtifactImageCreateParams,
};
use serde_json::json;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;

#[test]
fn image_create_persists_inline_slot_relationship() {
    let workspace = tempfile::tempdir().expect("workspace");
    let created = create_image_generation_task_artifact(
        MediaTaskArtifactImageCreateParams {
            project_root_path: workspace.path().to_string_lossy().to_string(),
            prompt: "生成正文里的广州夏日街景配图".to_string(),
            count: Some(1),
            provider_id: Some("fal".to_string()),
            model: Some("fal-ai/nano-banana-pro".to_string()),
            executor_mode: Some("images_api".to_string()),
            usage: Some("document-inline".to_string()),
            slot_id: Some("article-image-slot-1".to_string()),
            ..MediaTaskArtifactImageCreateParams::default()
        },
        None,
    )
    .expect("create inline image task");

    assert_eq!(
        created.record["payload"]["usage"].as_str(),
        Some("document-inline")
    );
    assert_eq!(
        created.record["payload"]["slot_id"].as_str(),
        Some("article-image-slot-1")
    );
    assert_eq!(
        created.record["relationships"]["slot_id"].as_str(),
        Some("article-image-slot-1")
    );
}

#[tokio::test]
async fn image_complete_writes_data_url_output_to_media_sidecar() {
    let workspace = tempfile::tempdir().expect("workspace");
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let sidecar_store = SidecarStore::new(sidecar_root.path()).expect("sidecar store");
    let created = create_image_generation_task_artifact(
        MediaTaskArtifactImageCreateParams {
            project_root_path: workspace.path().to_string_lossy().to_string(),
            prompt: "生成可读取 sidecar 的青柠主视觉".to_string(),
            count: Some(1),
            provider_id: Some("fal".to_string()),
            model: Some("fal-ai/nano-banana-pro".to_string()),
            executor_mode: Some("images_api".to_string()),
            session_id: Some("session-media-sidecar".to_string()),
            ..MediaTaskArtifactImageCreateParams::default()
        },
        None,
    )
    .expect("create image task");

    let completed = complete_image_generation_task_artifact(
        MediaTaskArtifactImageCompleteParams {
            project_root_path: workspace.path().to_string_lossy().to_string(),
            task_ref: created.artifact_path.clone(),
            images: vec![MediaTaskArtifactCompletedImageInput {
                url: "data:image/png;base64,AAECAw==".to_string(),
                prompt: Some("生成可读取 sidecar 的青柠主视觉".to_string()),
                provider_id: Some("fal".to_string()),
                model: Some("fal-ai/nano-banana-pro".to_string()),
                slot_index: Some(1),
                ..MediaTaskArtifactCompletedImageInput::default()
            }],
            provider_id: Some("fal".to_string()),
            model: Some("fal-ai/nano-banana-pro".to_string()),
            executor_mode: Some("images_api".to_string()),
            ..MediaTaskArtifactImageCompleteParams::default()
        },
        Some(&sidecar_store),
    )
    .await
    .expect("complete image task with sidecar");

    let sidecar_ref = &completed.record["result"]["images"][0]["sidecarRef"];
    assert_eq!(sidecar_ref["kind"].as_str(), Some("media"));
    assert_eq!(sidecar_ref["mimeType"].as_str(), Some("image/png"));
    assert!(sidecar_ref["ref"]
        .as_str()
        .is_some_and(|value| value.starts_with("sidecar://media/")));
    assert_eq!(
        completed.record["payload"]["image_output"]["status"].as_str(),
        Some("succeeded")
    );
    let relative_path = sidecar_ref["relativePath"].as_str().expect("relative path");
    let sha256 = sidecar_ref["sha256"].as_str();
    let bytes = sidecar_store
        .read_bytes_verified(relative_path, sha256, 16)
        .expect("read sidecar bytes")
        .expect("sidecar bytes");
    assert_eq!(bytes.bytes, vec![0, 1, 2, 3]);
}

#[tokio::test]
async fn image_complete_caches_loopback_remote_url_to_media_sidecar() {
    let workspace = tempfile::tempdir().expect("workspace");
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let sidecar_store = SidecarStore::new(sidecar_root.path()).expect("sidecar store");
    let media_server = SingleRemoteMediaServer::start("image/png", b"remote-lime-image");
    let image_url = format!("http://{}/generated.png", media_server.address);
    let created = create_image_generation_task_artifact(
        MediaTaskArtifactImageCreateParams {
            project_root_path: workspace.path().to_string_lossy().to_string(),
            prompt: "生成需要后端缓存远程 URL 的青柠主视觉".to_string(),
            count: Some(1),
            provider_id: Some("fal".to_string()),
            model: Some("fal-ai/nano-banana-pro".to_string()),
            executor_mode: Some("images_api".to_string()),
            session_id: Some("session-remote-media-sidecar".to_string()),
            ..MediaTaskArtifactImageCreateParams::default()
        },
        None,
    )
    .expect("create image task");

    let completed = complete_image_generation_task_artifact(
        MediaTaskArtifactImageCompleteParams {
            project_root_path: workspace.path().to_string_lossy().to_string(),
            task_ref: created.artifact_path.clone(),
            images: vec![MediaTaskArtifactCompletedImageInput {
                url: image_url,
                prompt: Some("生成需要后端缓存远程 URL 的青柠主视觉".to_string()),
                provider_id: Some("fal".to_string()),
                model: Some("fal-ai/nano-banana-pro".to_string()),
                slot_index: Some(1),
                ..MediaTaskArtifactCompletedImageInput::default()
            }],
            provider_id: Some("fal".to_string()),
            model: Some("fal-ai/nano-banana-pro".to_string()),
            executor_mode: Some("images_api".to_string()),
            ..MediaTaskArtifactImageCompleteParams::default()
        },
        Some(&sidecar_store),
    )
    .await
    .expect("complete image task with remote sidecar");

    let sidecar_ref = &completed.record["result"]["images"][0]["sidecarRef"];
    assert_eq!(sidecar_ref["kind"].as_str(), Some("media"));
    assert_eq!(sidecar_ref["mimeType"].as_str(), Some("image/png"));
    let relative_path = sidecar_ref["relativePath"].as_str().expect("relative path");
    let sha256 = sidecar_ref["sha256"].as_str();
    let bytes = sidecar_store
        .read_bytes_verified(relative_path, sha256, 64)
        .expect("read sidecar bytes")
        .expect("sidecar bytes");
    assert_eq!(bytes.bytes, b"remote-lime-image".to_vec());
    assert_eq!(media_server.join(), 1);
}

#[tokio::test]
async fn image_complete_rejects_remote_url_without_image_content_type() {
    let workspace = tempfile::tempdir().expect("workspace");
    let sidecar_root = tempfile::tempdir().expect("sidecar root");
    let sidecar_store = SidecarStore::new(sidecar_root.path()).expect("sidecar store");
    let media_server = SingleRemoteMediaServer::start("text/plain", b"not an image");
    let image_url = format!("http://{}/generated.txt", media_server.address);
    let created = create_image_generation_task_artifact(
        MediaTaskArtifactImageCreateParams {
            project_root_path: workspace.path().to_string_lossy().to_string(),
            prompt: "生成一个非图片响应，后端必须 fail closed".to_string(),
            count: Some(1),
            provider_id: Some("fal".to_string()),
            model: Some("fal-ai/nano-banana-pro".to_string()),
            executor_mode: Some("images_api".to_string()),
            session_id: Some("session-remote-media-sidecar-non-image".to_string()),
            ..MediaTaskArtifactImageCreateParams::default()
        },
        None,
    )
    .expect("create image task");

    let completed = complete_image_generation_task_artifact(
        MediaTaskArtifactImageCompleteParams {
            project_root_path: workspace.path().to_string_lossy().to_string(),
            task_ref: created.artifact_path.clone(),
            images: vec![MediaTaskArtifactCompletedImageInput {
                url: image_url,
                prompt: Some("生成一个非图片响应，后端必须 fail closed".to_string()),
                provider_id: Some("fal".to_string()),
                model: Some("fal-ai/nano-banana-pro".to_string()),
                slot_index: Some(1),
                ..MediaTaskArtifactCompletedImageInput::default()
            }],
            provider_id: Some("fal".to_string()),
            model: Some("fal-ai/nano-banana-pro".to_string()),
            executor_mode: Some("images_api".to_string()),
            ..MediaTaskArtifactImageCompleteParams::default()
        },
        Some(&sidecar_store),
    )
    .await
    .expect("complete image task without remote sidecar");

    assert_eq!(completed.normalized_status, "succeeded");
    assert!(completed.record["result"]["images"][0]
        .get("sidecarRef")
        .is_none());
    assert_eq!(media_server.join(), 1);
}

#[tokio::test]
async fn image_complete_generates_preview_slot_id_when_image_has_no_slot_id() {
    let workspace = tempfile::tempdir().expect("workspace");
    let created = create_image_generation_task_artifact(
        MediaTaskArtifactImageCreateParams {
            project_root_path: workspace.path().to_string_lossy().to_string(),
            prompt: "生成青柠科技主视觉".to_string(),
            count: Some(1),
            provider_id: Some("fal".to_string()),
            model: Some("fal-ai/nano-banana-pro".to_string()),
            executor_mode: Some("images_api".to_string()),
            ..MediaTaskArtifactImageCreateParams::default()
        },
        None,
    )
    .expect("create image task");

    let completed = complete_image_generation_task_artifact(
        MediaTaskArtifactImageCompleteParams {
            project_root_path: workspace.path().to_string_lossy().to_string(),
            task_ref: created.artifact_path.clone(),
            images: vec![MediaTaskArtifactCompletedImageInput {
                url: "data:image/png;base64,AAAA".to_string(),
                prompt: Some("生成青柠科技主视觉".to_string()),
                provider_id: Some("fal".to_string()),
                model: Some("fal-ai/nano-banana-pro".to_string()),
                slot_index: Some(1),
                ..MediaTaskArtifactCompletedImageInput::default()
            }],
            provider_id: Some("fal".to_string()),
            model: Some("fal-ai/nano-banana-pro".to_string()),
            executor_mode: Some("images_api".to_string()),
            ..MediaTaskArtifactImageCompleteParams::default()
        },
        None,
    )
    .await
    .expect("complete image task without slot id");

    assert_eq!(completed.status, "succeeded");
    assert_eq!(completed.normalized_status, "succeeded");
    assert_eq!(
        completed.record["progress"]["preview_slots"][0]["slot_id"].as_str(),
        Some("image-slot-1")
    );
    assert_eq!(
        completed.record["progress"]["preview_slots"][0]["status"].as_str(),
        Some("complete")
    );
}

#[tokio::test]
async fn image_complete_accepts_failed_status_with_failures_without_images() {
    let workspace = tempfile::tempdir().expect("workspace");
    let created = create_image_generation_task_artifact(
        MediaTaskArtifactImageCreateParams {
            project_root_path: workspace.path().to_string_lossy().to_string(),
            prompt: "生成青柠科技主视觉".to_string(),
            count: Some(1),
            provider_id: Some("fal".to_string()),
            model: Some("fal-ai/nano-banana-pro".to_string()),
            executor_mode: Some("images_api".to_string()),
            ..MediaTaskArtifactImageCreateParams::default()
        },
        None,
    )
    .expect("create image task");

    let completed = complete_image_generation_task_artifact(
        MediaTaskArtifactImageCompleteParams {
            project_root_path: workspace.path().to_string_lossy().to_string(),
            task_ref: created.artifact_path.clone(),
            status: Some("failed".to_string()),
            failures: vec![json!({
                "code": "local_image_server_unavailable",
                "message": "本地图片服务不可用",
                "retryable": true,
                "stage": "execute",
                "provider_code": "ECONNREFUSED",
            })],
            provider_id: Some("fal".to_string()),
            model: Some("fal-ai/nano-banana-pro".to_string()),
            executor_mode: Some("images_api".to_string()),
            ..MediaTaskArtifactImageCompleteParams::default()
        },
        None,
    )
    .await
    .expect("complete failed image task");

    assert_eq!(completed.status, "failed");
    assert_eq!(completed.normalized_status, "failed");
    assert_eq!(
        completed.record["result"]["kind"].as_str(),
        Some("image_generation_result")
    );
    assert_eq!(
        completed.record["result"]["status"].as_str(),
        Some("failed")
    );
    assert_eq!(
        completed.record["result"]["received_count"].as_u64(),
        Some(0)
    );
    assert_eq!(
        completed.record["last_error"]["code"].as_str(),
        Some("local_image_server_unavailable")
    );
    assert_eq!(
        completed.record["last_error"]["message"].as_str(),
        Some("本地图片服务不可用")
    );
    assert_eq!(
        completed.record["last_error"]["retryable"].as_bool(),
        Some(true)
    );
    assert_eq!(
        completed.record["progress"]["phase"].as_str(),
        Some("failed")
    );
    assert_eq!(completed.record["progress"]["percent"].as_u64(), Some(100));
}

struct SingleRemoteMediaServer {
    address: std::net::SocketAddr,
    handle: thread::JoinHandle<usize>,
}

impl SingleRemoteMediaServer {
    fn start(content_type: &'static str, body: &'static [u8]) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind media fixture");
        let address = listener.local_addr().expect("media fixture address");
        let body = body.to_vec();
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept media request");
            let mut buffer = [0_u8; 1024];
            let bytes_read = stream.read(&mut buffer).expect("read media request");
            let request = String::from_utf8_lossy(&buffer[..bytes_read]);
            assert!(request.starts_with("GET /generated."));
            let response_header = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: {content_type}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                body.len()
            );
            stream
                .write_all(response_header.as_bytes())
                .expect("write media response header");
            stream.write_all(&body).expect("write media response body");
            1
        });

        Self { address, handle }
    }

    fn join(self) -> usize {
        self.handle.join().expect("media fixture join")
    }
}
