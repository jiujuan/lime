use super::*;

#[tokio::test]
async fn execute_video_generation_task_should_advance_task_file_to_succeeded() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let captured_auth = Arc::new(Mutex::new(None::<String>));
    let captured_provider_id = Arc::new(Mutex::new(None::<String>));
    let captured_body = Arc::new(Mutex::new(None::<Value>));
    let captured_updates = Arc::new(Mutex::new(Vec::<String>::new()));
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::VideoGenerate,
        Some("短视频".to_string()),
        json!({
            "prompt": "生成一段青柠实验室短视频",
            "provider_id": "veo-provider",
            "model": "veo-3",
            "aspect_ratio": "16:9",
            "resolution": "1080p",
            "duration": 8,
            "image_url": "https://example.test/start.png",
            "end_image_url": "https://example.test/end.png",
            "seed": 42,
            "generate_audio": true,
            "camera_fixed": false
        }),
        TaskWriteOptions {
            status: Some("pending_submit".to_string()),
            ..TaskWriteOptions::default()
        },
    )
    .expect("create video task");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind video api");
    let address = listener.local_addr().expect("resolve address");
    let captured_auth_for_server = Arc::clone(&captured_auth);
    let captured_provider_id_for_server = Arc::clone(&captured_provider_id);
    let captured_body_for_server = Arc::clone(&captured_body);
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/v1/videos/generations",
            post(move |headers: HeaderMap, Json(body): Json<Value>| {
                let captured_auth = Arc::clone(&captured_auth_for_server);
                let captured_provider_id = Arc::clone(&captured_provider_id_for_server);
                let captured_body = Arc::clone(&captured_body_for_server);
                async move {
                    *captured_auth.lock().expect("lock auth") = headers
                        .get("authorization")
                        .and_then(|value| value.to_str().ok())
                        .map(ToOwned::to_owned);
                    *captured_provider_id.lock().expect("lock provider id") = headers
                        .get("x-provider-id")
                        .and_then(|value| value.to_str().ok())
                        .map(ToOwned::to_owned);
                    *captured_body.lock().expect("lock body") = Some(body);
                    (
                        StatusCode::OK,
                        Json(json!({
                            "id": "video-job-1",
                            "data": [
                                {
                                    "id": "generated-video-1",
                                    "url": "https://cdn.example.test/generated.mp4",
                                    "mime_type": "video/mp4",
                                    "duration": 8
                                }
                            ]
                        })),
                    )
                }
            }),
        );
        axum::serve(listener, app).await.expect("serve video api");
    });

    let updates_for_hook = Arc::clone(&captured_updates);
    let result = execute_video_generation_task_with_hook(
        temp_dir.path(),
        &created.task_id,
        &VideoGenerationRunnerConfig {
            endpoint: format!("http://{address}/v1/videos/generations"),
            api_key: "test-key".to_string(),
        },
        move |output| {
            updates_for_hook
                .lock()
                .expect("lock updates")
                .push(output.normalized_status.clone());
        },
    )
    .await
    .expect("execute video task");

    assert_eq!(result.normalized_status, "succeeded");
    assert_eq!(
        result
            .record
            .result
            .as_ref()
            .and_then(|value| value.pointer("/video/url"))
            .and_then(Value::as_str),
        Some("https://cdn.example.test/generated.mp4")
    );
    assert_eq!(
        result
            .record
            .attempts
            .last()
            .and_then(|attempt| attempt.worker_id.as_deref()),
        Some(VIDEO_TASK_RUNNER_WORKER_ID)
    );
    assert_eq!(
        captured_auth.lock().expect("lock auth").as_deref(),
        Some("Bearer test-key")
    );
    assert_eq!(
        captured_provider_id
            .lock()
            .expect("lock provider id")
            .as_deref(),
        Some("veo-provider")
    );
    let body = captured_body
        .lock()
        .expect("lock body")
        .clone()
        .expect("captured body");
    assert_eq!(
        body.pointer("/prompt"),
        Some(&json!("生成一段青柠实验室短视频"))
    );
    assert_eq!(body.pointer("/model"), Some(&json!("veo-3")));
    assert_eq!(body.pointer("/aspect_ratio"), Some(&json!("16:9")));
    assert_eq!(body.pointer("/duration"), Some(&json!(8)));
    assert_eq!(body.pointer("/generate_audio"), Some(&json!(true)));
    assert_eq!(body.pointer("/camera_fixed"), Some(&json!(false)));
    assert_eq!(body.pointer("/user"), Some(&json!(created.task_id.clone())));
    assert_eq!(
        captured_updates.lock().expect("lock updates").as_slice(),
        ["queued", "running", "succeeded"]
    );
    assert_eq!(
        result
            .record
            .payload
            .pointer("/llm_events/1/type")
            .and_then(Value::as_str),
        Some("turn.completed")
    );
    assert_eq!(
        result
            .record
            .payload
            .pointer("/provider_diagnostics/taskFamily")
            .and_then(Value::as_str),
        Some("video_generation")
    );
    assert_eq!(
        result
            .record
            .payload
            .pointer("/provider_diagnostics/modelId")
            .and_then(Value::as_str),
        None
    );
    assert_eq!(
        result
            .record
            .payload
            .pointer("/provider_diagnostics/transport")
            .and_then(Value::as_str),
        Some("local_lime_service")
    );

    server.abort();
}
