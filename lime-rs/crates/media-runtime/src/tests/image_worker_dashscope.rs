use super::*;

#[tokio::test]
async fn execute_image_generation_task_should_support_dashscope_native_executor() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let captured_body = Arc::new(Mutex::new(None::<Value>));
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("通义配图".to_string()),
        json!({
            "prompt": "生成一个青柠玻璃杯",
            "count": 1,
            "provider_id": "alibaba",
            "model": "qwen-image-plus",
            "size": "1328x1328",
            "executor_mode": "dashscope_images"
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind dashscope api");
    let address = listener.local_addr().expect("resolve address");
    let captured_body_for_server = Arc::clone(&captured_body);
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/api/v1/services/aigc/multimodal-generation/generation",
            post(move |headers: HeaderMap, Json(body): Json<Value>| {
                let captured_body = Arc::clone(&captured_body_for_server);
                async move {
                    assert_eq!(
                        headers
                            .get("authorization")
                            .and_then(|value| value.to_str().ok()),
                        Some("Bearer dashscope-test-key")
                    );
                    *captured_body.lock().expect("lock captured body") = Some(body);
                    (
                        StatusCode::OK,
                        Json(json!({
                            "request_id": "dashscope-request-1",
                            "output": {
                                "choices": [
                                    {
                                        "message": {
                                            "content": [
                                                { "text": "done" },
                                                { "image": "https://cdn.example.test/qwen.png" }
                                            ]
                                        }
                                    }
                                ]
                            }
                        })),
                    )
                }
            }),
        );
        axum::serve(listener, app)
            .await
            .expect("serve dashscope api");
    });

    let result = execute_image_generation_task(
        temp_dir.path(),
        &created.task_id,
        &ImageGenerationRunnerConfig {
            endpoint: format!("http://{address}/compatible-mode/v1"),
            api_key: "dashscope-test-key".to_string(),
        },
    )
    .await
    .expect("execute dashscope image task");

    assert_eq!(result.normalized_status, "succeeded");
    let result_value = result.record.result.as_ref().expect("result value");
    assert_eq!(
        result_value.get("executor_mode").and_then(Value::as_str),
        Some(IMAGE_EXECUTOR_MODE_DASHSCOPE_IMAGES)
    );
    assert_eq!(
        result_value
            .get("images")
            .and_then(Value::as_array)
            .and_then(|images| images.first())
            .and_then(|image| image.get("url"))
            .and_then(Value::as_str),
        Some("https://cdn.example.test/qwen.png")
    );
    assert_eq!(
        result_value
            .get("images")
            .and_then(Value::as_array)
            .and_then(|images| images.first())
            .and_then(|image| image.get("source"))
            .and_then(Value::as_str),
        Some(IMAGE_EXECUTOR_MODE_DASHSCOPE_IMAGES)
    );

    let body = captured_body
        .lock()
        .expect("lock captured body")
        .clone()
        .expect("captured body");
    assert_eq!(
        body.get("model").and_then(Value::as_str),
        Some("qwen-image-plus")
    );
    assert_eq!(
        body.pointer("/input/messages/0/content/0/text")
            .and_then(Value::as_str),
        Some("生成一个青柠玻璃杯")
    );
    assert_eq!(
        body.pointer("/parameters/size").and_then(Value::as_str),
        Some("1328*1328")
    );

    server.abort();
}

#[tokio::test]
async fn execute_image_generation_task_should_classify_dashscope_server_error() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("通义配图".to_string()),
        json!({
            "prompt": "生成一个青柠玻璃杯",
            "count": 1,
            "provider_id": "alibaba",
            "model": "qwen-image-plus",
            "executor_mode": "dashscope_images"
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind dashscope api");
    let address = listener.local_addr().expect("resolve address");
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/api/v1/services/aigc/multimodal-generation/generation",
            post(|| async move {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({
                        "code": "InternalError",
                        "message": "DashScope 暂时不可用"
                    })),
                )
            }),
        );
        axum::serve(listener, app)
            .await
            .expect("serve dashscope api");
    });

    let result = execute_image_generation_task(
        temp_dir.path(),
        &created.task_id,
        &ImageGenerationRunnerConfig {
            endpoint: format!("http://{address}/compatible-mode/v1"),
            api_key: "dashscope-test-key".to_string(),
        },
    )
    .await
    .expect("dashscope image task should settle to failed output");

    assert_eq!(result.normalized_status, "failed");
    assert_eq!(
        result.last_error.as_ref().map(|value| value.code.as_str()),
        Some("provider_unavailable")
    );
    assert_eq!(
        result
            .last_error
            .as_ref()
            .and_then(|value| value.provider_code.as_deref()),
        Some("InternalError")
    );
    assert_eq!(
        result.last_error.as_ref().map(|value| value.retryable),
        Some(true)
    );

    server.abort();
}
