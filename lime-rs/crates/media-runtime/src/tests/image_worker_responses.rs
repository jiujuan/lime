use super::*;

#[tokio::test]
async fn execute_image_generation_task_should_support_responses_image_generation_executor() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let captured_body = Arc::new(Mutex::new(None::<Value>));
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("图层主视觉".to_string()),
        json!({
            "prompt": "透明背景上的青柠产品主体",
            "size": "1024x1024",
            "count": 1,
            "provider_id": "openai",
            "model": "gpt-image-2",
            "executor_mode": "responses_image_generation",
            "outer_model": "gpt-5.5",
            "reference_images": ["https://cdn.example.test/ref.png"]
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind responses api");
    let address = listener.local_addr().expect("resolve address");
    let captured_body_for_server = Arc::clone(&captured_body);
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/v1/responses",
            post(move |Json(body): Json<Value>| {
                let captured_body = Arc::clone(&captured_body_for_server);
                async move {
                    *captured_body.lock().expect("lock captured body") = Some(body);
                    let body = concat!(
                        "event: response.output_item.done\n",
                        "data: {\"item\":{\"id\":\"ig_1\",\"type\":\"image_generation_call\",\"result\":\"ZmFrZS1yZXNwb25zZXMtaW1hZ2U=\",\"revised_prompt\":\"青柠产品主体\"}}\n\n",
                        "event: response.completed\n",
                        "data: {\"response\":{\"id\":\"resp_1\"}}\n\n"
                    );
                    (StatusCode::OK, [("content-type", "text/event-stream")], body)
                }
            }),
        );
        axum::serve(listener, app)
            .await
            .expect("serve responses api");
    });

    let result = execute_image_generation_task(
        temp_dir.path(),
        &created.task_id,
        &ImageGenerationRunnerConfig {
            endpoint: format!("http://{address}/v1/images/generations"),
            api_key: "test-key".to_string(),
            request_body_format: Default::default(),
        },
    )
    .await
    .expect("execute responses image task");

    assert_eq!(result.normalized_status, "succeeded");
    let result_value = result.record.result.as_ref().expect("result value");
    assert_eq!(
        result_value.get("executor_mode").and_then(Value::as_str),
        Some(IMAGE_EXECUTOR_MODE_RESPONSES_IMAGE_GENERATION)
    );
    assert_eq!(
        result_value
            .get("images")
            .and_then(Value::as_array)
            .and_then(|images| images.first())
            .and_then(|value| value.get("url"))
            .and_then(Value::as_str),
        Some("data:image/png;base64,ZmFrZS1yZXNwb25zZXMtaW1hZ2U=")
    );
    assert_eq!(
        result_value
            .get("responses")
            .and_then(Value::as_array)
            .and_then(|responses| responses.first())
            .and_then(|response| response.get("image_item_id"))
            .and_then(Value::as_str),
        Some("ig_1")
    );

    let body = captured_body
        .lock()
        .expect("lock captured body")
        .clone()
        .expect("captured body");
    assert_eq!(body.get("model").and_then(Value::as_str), Some("gpt-5.5"));
    assert_eq!(body.get("stream").and_then(Value::as_bool), Some(true));
    assert_eq!(
        body.pointer("/input/0/content/0/type")
            .and_then(Value::as_str),
        Some("input_text")
    );
    assert_eq!(
        body.pointer("/input/0/content/1/type")
            .and_then(Value::as_str),
        Some("input_image")
    );
    assert_eq!(
        body.pointer("/input/0/content/1/image_url")
            .and_then(Value::as_str),
        Some("https://cdn.example.test/ref.png")
    );
    assert_eq!(
        body.pointer("/tools/0/type").and_then(Value::as_str),
        Some("image_generation")
    );
    assert_eq!(
        body.pointer("/tools/0/model").and_then(Value::as_str),
        Some("gpt-image-2")
    );

    server.abort();
}

#[tokio::test]
async fn execute_image_generation_task_should_fallback_to_images_api_when_responses_route_missing()
{
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let captured_body = Arc::new(Mutex::new(None::<Value>));
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("图层主视觉".to_string()),
        json!({
            "prompt": "透明背景上的青柠产品主体",
            "size": "1024x1024",
            "count": 1,
            "provider_id": "airgate-openai-images",
            "model": "gpt-images-2",
            "executor_mode": "responses_image_generation",
            "outer_model": "gpt-5.5"
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind image api");
    let address = listener.local_addr().expect("resolve address");
    let captured_body_for_server = Arc::clone(&captured_body);
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/v1/images/generations",
            post(move |Json(body): Json<Value>| {
                let captured_body = Arc::clone(&captured_body_for_server);
                async move {
                    *captured_body.lock().expect("lock captured body") = Some(body);
                    (
                        StatusCode::OK,
                        Json(json!({
                            "created": 1_717_200_000i64,
                            "data": [
                                {
                                    "b64_json": "ZmFrZS1sb2NhbC1pbWFnZS1nYXRld2F5",
                                    "revised_prompt": "青柠产品主体"
                                }
                            ]
                        })),
                    )
                }
            }),
        );
        axum::serve(listener, app).await.expect("serve image api");
    });

    let result = execute_image_generation_task(
        temp_dir.path(),
        &created.task_id,
        &ImageGenerationRunnerConfig {
            endpoint: format!("http://{address}/v1/images/generations"),
            api_key: "test-key".to_string(),
            request_body_format: Default::default(),
        },
    )
    .await
    .expect("execute responses image task through local image gateway");

    assert_eq!(result.normalized_status, "succeeded");
    let result_value = result.record.result.as_ref().expect("result value");
    assert_eq!(
        result_value.get("executor_mode").and_then(Value::as_str),
        Some(IMAGE_EXECUTOR_MODE_RESPONSES_IMAGE_GENERATION)
    );
    assert_eq!(
        result_value
            .get("responses")
            .and_then(Value::as_array)
            .and_then(|responses| responses.first())
            .and_then(|response| response.get("fallback_executor_mode"))
            .and_then(Value::as_str),
        Some(IMAGE_EXECUTOR_MODE_IMAGES_API)
    );
    assert_eq!(
        result_value
            .get("images")
            .and_then(Value::as_array)
            .and_then(|images| images.first())
            .and_then(|value| value.get("url"))
            .and_then(Value::as_str),
        Some("data:image/png;base64,ZmFrZS1sb2NhbC1pbWFnZS1nYXRld2F5")
    );
    assert_eq!(
        result_value
            .get("images")
            .and_then(Value::as_array)
            .and_then(|images| images.first())
            .and_then(|value| value.get("source"))
            .and_then(Value::as_str),
        Some(IMAGE_EXECUTOR_MODE_RESPONSES_IMAGE_GENERATION)
    );

    let body = captured_body
        .lock()
        .expect("lock captured body")
        .clone()
        .expect("captured body");
    assert_eq!(
        body.get("model").and_then(Value::as_str),
        Some("gpt-images-2")
    );
    assert_eq!(
        body.get("response_format").and_then(Value::as_str),
        Some("b64_json")
    );

    server.abort();
}

#[test]
fn responses_image_generation_endpoint_should_reuse_images_api_base() {
    assert_eq!(
        build_responses_image_generation_endpoint(
            "https://gateway.example.com/v1/images/generations"
        ),
        "https://gateway.example.com/v1/responses"
    );
    assert_eq!(
        build_responses_image_generation_endpoint(
            "https://gateway.example.com/proxy/images/generations?token=secret"
        ),
        "https://gateway.example.com/proxy/responses?token=secret"
    );
    assert_eq!(
        build_responses_image_generation_endpoint("https://gateway.example.com/v1/responses"),
        "https://gateway.example.com/v1/responses"
    );
}
