use super::{complete_image_generation_task_artifact, create_image_generation_task_artifact};
use app_server_protocol::{
    MediaTaskArtifactCompletedImageInput, MediaTaskArtifactImageCompleteParams,
    MediaTaskArtifactImageCreateParams,
};
use serde_json::json;

#[test]
fn image_complete_generates_preview_slot_id_when_image_has_no_slot_id() {
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

    let completed = complete_image_generation_task_artifact(MediaTaskArtifactImageCompleteParams {
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
    })
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

#[test]
fn image_complete_accepts_failed_status_with_failures_without_images() {
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

    let completed = complete_image_generation_task_artifact(MediaTaskArtifactImageCompleteParams {
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
    })
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
