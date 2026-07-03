use super::*;

#[tokio::test]
async fn execute_image_generation_task_should_support_zhipu_native_executor() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let captured_body = Arc::new(Mutex::new(None::<Value>));
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("智谱配图".to_string()),
        json!({
            "prompt": "生成一个青柠玻璃杯",
            "count": 1,
            "provider_id": "zhipuai",
            "model": "glm-image",
            "executor_mode": "zhipu_images"
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind zhipu api");
    let address = listener.local_addr().expect("resolve address");
    let captured_body_for_server = Arc::clone(&captured_body);
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/api/paas/v4/images/generations",
            post(move |headers: HeaderMap, Json(body): Json<Value>| {
                let captured_body = Arc::clone(&captured_body_for_server);
                async move {
                    assert_eq!(
                        headers
                            .get("authorization")
                            .and_then(|value| value.to_str().ok()),
                        Some("Bearer zhipu-test-key")
                    );
                    *captured_body.lock().expect("lock captured body") = Some(body);
                    (
                        StatusCode::OK,
                        Json(json!({
                            "created": 1_777_000_002i64,
                            "data": [
                                {
                                    "url": "https://cdn.example.test/zhipu.png"
                                }
                            ]
                        })),
                    )
                }
            }),
        );
        axum::serve(listener, app).await.expect("serve zhipu api");
    });

    let result = execute_image_generation_task(
        temp_dir.path(),
        &created.task_id,
        &ImageGenerationRunnerConfig {
            endpoint: format!("http://{address}/api/paas/v4"),
            api_key: "zhipu-test-key".to_string(),
            request_body_format: Default::default(),
        },
    )
    .await
    .expect("execute zhipu image task");

    assert_eq!(result.normalized_status, "succeeded");
    let result_value = result.record.result.as_ref().expect("result value");
    assert_eq!(
        result_value.get("executor_mode").and_then(Value::as_str),
        Some(IMAGE_EXECUTOR_MODE_ZHIPU_IMAGES)
    );
    assert_eq!(
        result_value
            .get("images")
            .and_then(Value::as_array)
            .and_then(|images| images.first())
            .and_then(|image| image.get("url"))
            .and_then(Value::as_str),
        Some("https://cdn.example.test/zhipu.png")
    );
    assert_eq!(
        result_value
            .get("images")
            .and_then(Value::as_array)
            .and_then(|images| images.first())
            .and_then(|image| image.get("source"))
            .and_then(Value::as_str),
        Some(IMAGE_EXECUTOR_MODE_ZHIPU_IMAGES)
    );

    let body = captured_body
        .lock()
        .expect("lock captured body")
        .clone()
        .expect("captured body");
    assert_eq!(body.get("model").and_then(Value::as_str), Some("glm-image"));
    assert_eq!(
        body.get("prompt").and_then(Value::as_str),
        Some("生成一个青柠玻璃杯")
    );
    assert_eq!(body.get("size").and_then(Value::as_str), Some("1280x1280"));
    assert_eq!(body.get("quality").and_then(Value::as_str), Some("hd"));

    server.abort();
}

#[tokio::test]
async fn execute_image_generation_task_should_reject_zhipu_reference_images() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("智谱修图".to_string()),
        json!({
            "prompt": "把背景改成广州夏天",
            "count": 1,
            "provider_id": "zhipuai",
            "model": "glm-image",
            "executor_mode": "zhipu_images",
            "reference_images": ["https://cdn.example.test/source.png"]
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let result = execute_image_generation_task(
        temp_dir.path(),
        &created.task_id,
        &ImageGenerationRunnerConfig {
            endpoint: "http://127.0.0.1:9/api/paas/v4".to_string(),
            api_key: "zhipu-test-key".to_string(),
            request_body_format: Default::default(),
        },
    )
    .await
    .expect("zhipu reference task should settle to failed output");

    assert_eq!(result.normalized_status, "failed");
    assert_eq!(
        result.last_error.as_ref().map(|error| error.code.as_str()),
        Some("zhipu_reference_images_unsupported")
    );
}

#[tokio::test]
async fn execute_image_generation_task_should_classify_zhipu_rate_limit() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("智谱配图".to_string()),
        json!({
            "prompt": "生成一个青柠玻璃杯",
            "count": 1,
            "provider_id": "zhipuai",
            "model": "glm-image",
            "executor_mode": "zhipu_images"
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind zhipu api");
    let address = listener.local_addr().expect("resolve address");
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/api/paas/v4/images/generations",
            post(|| async move {
                (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(json!({
                        "code": "1302",
                        "msg": "请求过于频繁，请稍后重试"
                    })),
                )
            }),
        );
        axum::serve(listener, app).await.expect("serve zhipu api");
    });

    let result = execute_image_generation_task(
        temp_dir.path(),
        &created.task_id,
        &ImageGenerationRunnerConfig {
            endpoint: format!("http://{address}/api/paas/v4"),
            api_key: "zhipu-test-key".to_string(),
            request_body_format: Default::default(),
        },
    )
    .await
    .expect("zhipu image task should settle to failed output");

    assert_eq!(result.normalized_status, "failed");
    assert_eq!(
        result.last_error.as_ref().map(|value| value.code.as_str()),
        Some("rate_limited")
    );
    assert_eq!(
        result
            .last_error
            .as_ref()
            .and_then(|value| value.provider_code.as_deref()),
        Some("1302")
    );
    assert_eq!(
        result.last_error.as_ref().map(|value| value.retryable),
        Some(true)
    );

    server.abort();
}
