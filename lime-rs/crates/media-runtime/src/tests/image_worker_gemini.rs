use super::*;

#[tokio::test]
async fn execute_image_generation_task_should_support_gemini_generate_content_executor() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let captured_api_key = Arc::new(Mutex::new(None::<String>));
    let captured_body = Arc::new(Mutex::new(None::<Value>));
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("Gemini 配图".to_string()),
        json!({
            "prompt": "生成一张青柠夏日海报",
            "count": 1,
            "provider_id": "google",
            "model": "gemini-2.5-flash-image",
            "executor_mode": "gemini_generate_content",
            "reference_images": ["data:image/png;base64,cmVmZXJlbmNl"]
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind gemini api");
    let address = listener.local_addr().expect("resolve address");
    let captured_api_key_for_server = Arc::clone(&captured_api_key);
    let captured_body_for_server = Arc::clone(&captured_body);
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/v1beta/models/gemini-2.5-flash-image:generateContent",
            post(move |headers: HeaderMap, Json(body): Json<Value>| {
                let captured_api_key = Arc::clone(&captured_api_key_for_server);
                let captured_body = Arc::clone(&captured_body_for_server);
                async move {
                    let api_key = headers
                        .get("x-goog-api-key")
                        .and_then(|value| value.to_str().ok())
                        .map(ToString::to_string);
                    *captured_api_key.lock().expect("lock api key") = api_key;
                    *captured_body.lock().expect("lock body") = Some(body);
                    (
                        StatusCode::OK,
                        Json(json!({
                            "candidates": [
                                {
                                    "content": {
                                        "parts": [
                                            { "text": "已生成" },
                                            {
                                                "inlineData": {
                                                    "mimeType": "image/png",
                                                    "data": "Z2VtaW5pLWltYWdl"
                                                }
                                            }
                                        ]
                                    }
                                }
                            ]
                        })),
                    )
                }
            }),
        );
        axum::serve(listener, app).await.expect("serve gemini api");
    });

    let result = execute_image_generation_task(
        temp_dir.path(),
        &created.task_id,
        &ImageGenerationRunnerConfig {
            endpoint: format!("http://{address}/v1beta"),
            api_key: "gemini-test-key".to_string(),
            request_body_format: Default::default(),
        },
    )
    .await
    .expect("execute gemini image task");

    assert_eq!(result.normalized_status, "succeeded");
    let result_value = result.record.result.as_ref().expect("result value");
    assert_eq!(
        result_value.get("executor_mode").and_then(Value::as_str),
        Some("gemini_generate_content")
    );
    assert_eq!(
        result_value
            .get("images")
            .and_then(Value::as_array)
            .and_then(|images| images.first())
            .and_then(|image| image.get("url"))
            .and_then(Value::as_str),
        Some("data:image/png;base64,Z2VtaW5pLWltYWdl")
    );
    assert_eq!(
        captured_api_key.lock().expect("lock api key").as_deref(),
        Some("gemini-test-key")
    );

    let body = captured_body
        .lock()
        .expect("lock body")
        .clone()
        .expect("captured body");
    assert_eq!(
        body.pointer("/generationConfig/responseModalities/1")
            .and_then(Value::as_str),
        Some("IMAGE")
    );
    assert_eq!(
        body.pointer("/contents/0/parts/0/text")
            .and_then(Value::as_str),
        Some("生成一张青柠夏日海报")
    );
    assert_eq!(
        body.pointer("/contents/0/parts/1/inlineData/mimeType")
            .and_then(Value::as_str),
        Some("image/png")
    );

    server.abort();
}

#[tokio::test]
async fn execute_image_generation_task_should_classify_gemini_server_error() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("Gemini 配图".to_string()),
        json!({
            "prompt": "生成一张青柠夏日海报",
            "count": 1,
            "provider_id": "google",
            "model": "gemini-2.5-flash-image",
            "executor_mode": "gemini_generate_content"
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind gemini api");
    let address = listener.local_addr().expect("resolve address");
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/v1beta/models/gemini-2.5-flash-image:generateContent",
            post(|| async move {
                (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({
                        "error": {
                            "status": "UNAVAILABLE",
                            "message": "Gemini image service is temporarily unavailable"
                        }
                    })),
                )
            }),
        );
        axum::serve(listener, app).await.expect("serve gemini api");
    });

    let result = execute_image_generation_task(
        temp_dir.path(),
        &created.task_id,
        &ImageGenerationRunnerConfig {
            endpoint: format!("http://{address}/v1beta"),
            api_key: "gemini-test-key".to_string(),
            request_body_format: Default::default(),
        },
    )
    .await
    .expect("gemini image task should settle to failed output");

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
        Some("UNAVAILABLE")
    );
    assert_eq!(
        result.last_error.as_ref().map(|value| value.retryable),
        Some(true)
    );

    server.abort();
}
