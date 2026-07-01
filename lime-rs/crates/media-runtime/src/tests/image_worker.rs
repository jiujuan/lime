use super::*;

#[tokio::test]
async fn execute_image_generation_task_should_advance_task_file_to_succeeded() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let captured_provider_id = Arc::new(Mutex::new(None::<String>));
    let captured_response_format = Arc::new(Mutex::new(None::<String>));
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("青柠主视觉".to_string()),
        json!({
            "prompt": "未来感青柠实验室",
            "size": "1024x1024",
            "count": 1,
            "style": "cinematic",
            "provider_id": "fal",
            "model": "fal-ai/nano-banana-pro",
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind image api");
    let address = listener.local_addr().expect("resolve address");
    let captured_provider_id_for_server = Arc::clone(&captured_provider_id);
    let captured_response_format_for_server = Arc::clone(&captured_response_format);
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/v1/images/generations",
            post(move |headers: HeaderMap, Json(body): Json<Value>| {
                let captured_provider_id = Arc::clone(&captured_provider_id_for_server);
                let captured_response_format = Arc::clone(&captured_response_format_for_server);
                async move {
                    let provider_id = headers
                        .get("x-provider-id")
                        .and_then(|value| value.to_str().ok())
                        .map(|value| value.to_string());
                    *captured_provider_id.lock().expect("lock provider id") = provider_id;
                    let response_format = body
                        .get("response_format")
                        .and_then(Value::as_str)
                        .map(|value| value.to_string());
                    *captured_response_format
                        .lock()
                        .expect("lock response format") = response_format;
                    (
                        StatusCode::OK,
                        Json(json!({
                            "created": 1_717_200_000i64,
                            "data": [
                                {
                                    "b64_json": "ZmFrZS1saW1lLWltYWdl",
                                    "revised_prompt": "未来感青柠实验室主视觉"
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
        },
    )
    .await
    .expect("execute image task");

    assert_eq!(result.normalized_status, "succeeded");
    assert_eq!(
        result
            .record
            .result
            .as_ref()
            .and_then(|value| value.get("images"))
            .and_then(Value::as_array)
            .map(Vec::len),
        Some(1)
    );
    assert_eq!(
        result
            .record
            .result
            .as_ref()
            .and_then(|value| value.get("images"))
            .and_then(Value::as_array)
            .and_then(|images| images.first())
            .and_then(|value| value.get("url"))
            .and_then(Value::as_str),
        Some("data:image/png;base64,ZmFrZS1saW1lLWltYWdl")
    );
    assert_eq!(
        result
            .record
            .attempts
            .last()
            .and_then(|attempt| attempt.worker_id.as_deref()),
        Some(IMAGE_TASK_RUNNER_WORKER_ID)
    );
    assert_eq!(
        captured_provider_id
            .lock()
            .expect("lock provider id")
            .clone(),
        Some("fal".to_string())
    );
    assert_eq!(
        captured_response_format
            .lock()
            .expect("lock response format")
            .clone(),
        Some("b64_json".to_string())
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
        Some("image_generation")
    );
    assert_eq!(
        result
            .record
            .payload
            .pointer("/provider_diagnostics/providerId")
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

#[tokio::test]
async fn execute_image_generation_task_should_send_reference_images_to_edit_endpoint() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let captured_body = Arc::new(Mutex::new(None::<Value>));
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("青柠修图".to_string()),
        json!({
            "prompt": "把背景改成广州夏天街景",
            "size": "1024x1024",
            "count": 1,
            "provider_id": "new-api",
            "model": "gpt-image-1",
            "reference_images": [
                "https://cdn.example.test/source.png",
                { "image_url": "data:image/png;base64,cmVmMg==" }
            ]
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind image edit api");
    let address = listener.local_addr().expect("resolve address");
    let captured_body_for_server = Arc::clone(&captured_body);
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/v1/images/edits",
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
                                    "b64_json": "ZmFrZS1lZGl0ZWQtaW1hZ2U=",
                                    "revised_prompt": "广州夏天街景里的青柠"
                                }
                            ]
                        })),
                    )
                }
            }),
        );
        axum::serve(listener, app)
            .await
            .expect("serve image edit api");
    });

    let result = execute_image_generation_task(
        temp_dir.path(),
        &created.task_id,
        &ImageGenerationRunnerConfig {
            endpoint: format!("http://{address}/v1/images/generations"),
            api_key: "test-key".to_string(),
        },
    )
    .await
    .expect("execute image edit task");

    assert_eq!(result.normalized_status, "succeeded");
    let body = captured_body
        .lock()
        .expect("lock captured body")
        .clone()
        .expect("captured body");
    assert_eq!(
        body.get("model").and_then(Value::as_str),
        Some("gpt-image-1")
    );
    assert_eq!(
        body.get("images").and_then(Value::as_array).cloned(),
        Some(vec![
            json!({ "image_url": "https://cdn.example.test/source.png" }),
            json!({ "image_url": "data:image/png;base64,cmVmMg==" })
        ])
    );
    assert_eq!(
        result
            .record
            .result
            .as_ref()
            .and_then(|value| value.get("images"))
            .and_then(Value::as_array)
            .and_then(|images| images.first())
            .and_then(|value| value.get("url"))
            .and_then(Value::as_str),
        Some("data:image/png;base64,ZmFrZS1lZGl0ZWQtaW1hZ2U=")
    );

    server.abort();
}

#[tokio::test]
async fn execute_image_generation_task_should_limit_parallel_single_image_requests() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("分镜任务".to_string()),
        json!({
            "prompt": "三国主要人物分镜",
            "size": "1024x1024",
            "count": 7,
            "provider_id": "custom-provider",
            "model": "gpt-images-2",
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let request_count = Arc::new(AtomicUsize::new(0));
    let in_flight = Arc::new(AtomicUsize::new(0));
    let max_in_flight = Arc::new(AtomicUsize::new(0));

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind image api");
    let address = listener.local_addr().expect("resolve address");
    let request_count_for_server = Arc::clone(&request_count);
    let in_flight_for_server = Arc::clone(&in_flight);
    let max_in_flight_for_server = Arc::clone(&max_in_flight);
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/v1/images/generations",
            post(move |Json(body): Json<Value>| {
                let request_count = Arc::clone(&request_count_for_server);
                let in_flight = Arc::clone(&in_flight_for_server);
                let max_in_flight = Arc::clone(&max_in_flight_for_server);
                async move {
                    assert_eq!(body.get("n").and_then(Value::as_u64), Some(1));

                    let request_index = request_count.fetch_add(1, Ordering::SeqCst) + 1;
                    let current_in_flight = in_flight.fetch_add(1, Ordering::SeqCst) + 1;
                    max_in_flight.fetch_max(current_in_flight, Ordering::SeqCst);

                    tokio::time::sleep(Duration::from_millis(40)).await;

                    in_flight.fetch_sub(1, Ordering::SeqCst);
                    (
                        StatusCode::OK,
                        Json(json!({
                            "created": 1_717_200_000i64,
                            "data": [
                                {
                                    "url": format!("https://example.com/storyboard-{request_index}.png"),
                                    "revised_prompt": format!("分镜 {request_index}")
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
        },
    )
    .await
    .expect("execute image task");

    assert_eq!(result.normalized_status, "succeeded");
    assert_eq!(request_count.load(Ordering::SeqCst), 7);
    assert_eq!(max_in_flight.load(Ordering::SeqCst), 3);
    assert_eq!(
        result
            .record
            .result
            .as_ref()
            .and_then(|value| value.get("requested_count"))
            .and_then(Value::as_u64),
        Some(7)
    );
    assert_eq!(
        result
            .record
            .result
            .as_ref()
            .and_then(|value| value.get("received_count"))
            .and_then(Value::as_u64),
        Some(7)
    );
    assert_eq!(
        result
            .record
            .result
            .as_ref()
            .and_then(|value| value.get("images"))
            .and_then(Value::as_array)
            .map(Vec::len),
        Some(7)
    );

    server.abort();
}

#[tokio::test]
async fn execute_image_generation_task_should_preserve_storyboard_slot_prompts_and_order() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("三国主要人物分镜".to_string()),
        json!({
            "prompt": "三国主要人物，电影感九宫格分镜",
            "layout_hint": "storyboard_3x3",
            "count": 3,
            "provider_id": "custom-provider",
            "model": "gpt-image-2",
            "storyboard_slots": [
                {
                    "slot_index": 1,
                    "slot_id": "storyboard-slot-1",
                    "label": "刘备亮相",
                    "prompt": "三国主要人物，电影感分镜，第1格，刘备单人亮相，中景，仁义领袖气质，汉末营帐背景",
                    "shot_type": "medium"
                },
                {
                    "slot_index": 2,
                    "slot_id": "storyboard-slot-2",
                    "label": "曹操压迫感",
                    "prompt": "三国主要人物，电影感分镜，第2格，曹操近景特写，压迫感强，冷色军帐与火光反差",
                    "shot_type": "close_up"
                },
                {
                    "slot_index": 3,
                    "slot_id": "storyboard-slot-3",
                    "label": "诸葛亮谋局",
                    "prompt": "三国主要人物，电影感分镜，第3格，诸葛亮执扇谋局，侧光半身像，桌上地图与烛火",
                    "shot_type": "portrait"
                }
            ]
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let received_prompts = Arc::new(Mutex::new(Vec::<String>::new()));
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind image api");
    let address = listener.local_addr().expect("resolve address");
    let received_prompts_for_server = Arc::clone(&received_prompts);
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/v1/images/generations",
            post(move |Json(body): Json<Value>| {
                let received_prompts = Arc::clone(&received_prompts_for_server);
                async move {
                    let prompt = body
                        .get("prompt")
                        .and_then(Value::as_str)
                        .expect("request prompt")
                        .to_string();
                    received_prompts
                        .lock()
                        .expect("lock prompts")
                        .push(prompt.clone());

                    let (delay_ms, slug, revised_prompt) = if prompt.contains("刘备") {
                        (60, "liu-bei", "刘备亮相，中景，营帐背景".to_string())
                    } else if prompt.contains("曹操") {
                        (10, "cao-cao", "曹操近景特写，压迫感强".to_string())
                    } else {
                        (30, "zhuge-liang", "诸葛亮执扇谋局，侧光半身像".to_string())
                    };

                    tokio::time::sleep(Duration::from_millis(delay_ms)).await;

                    (
                        StatusCode::OK,
                        Json(json!({
                            "created": 1_717_200_000i64,
                            "data": [
                                {
                                    "url": format!("https://example.com/{slug}.png"),
                                    "revised_prompt": revised_prompt
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
        },
    )
    .await
    .expect("execute storyboard task");

    let received_prompts = received_prompts.lock().expect("lock prompts").clone();
    assert_eq!(received_prompts.len(), 3);
    assert!(received_prompts
        .iter()
        .any(|prompt| prompt.contains("刘备")));
    assert!(received_prompts
        .iter()
        .any(|prompt| prompt.contains("曹操")));
    assert!(received_prompts
        .iter()
        .any(|prompt| prompt.contains("诸葛亮")));

    let images = result
        .record
        .result
        .as_ref()
        .and_then(|value| value.get("images"))
        .and_then(Value::as_array)
        .cloned()
        .expect("storyboard images");
    assert_eq!(images.len(), 3);
    assert_eq!(images[0]["slot_index"].as_u64(), Some(1));
    assert_eq!(images[1]["slot_index"].as_u64(), Some(2));
    assert_eq!(images[2]["slot_index"].as_u64(), Some(3));
    assert_eq!(images[0]["slot_label"].as_str(), Some("刘备亮相"));
    assert_eq!(images[1]["slot_label"].as_str(), Some("曹操压迫感"));
    assert_eq!(images[2]["slot_label"].as_str(), Some("诸葛亮谋局"));
    assert_eq!(
        images[0]["url"].as_str(),
        Some("https://example.com/liu-bei.png")
    );
    assert_eq!(
        images[1]["url"].as_str(),
        Some("https://example.com/cao-cao.png")
    );
    assert_eq!(
        images[2]["url"].as_str(),
        Some("https://example.com/zhuge-liang.png")
    );
    assert_eq!(
        result
            .record
            .progress
            .preview_slots
            .iter()
            .map(|slot| slot.status.as_str())
            .collect::<Vec<_>>(),
        vec!["complete", "complete", "complete"]
    );

    server.abort();
}

#[tokio::test]
async fn execute_image_generation_task_should_mark_task_failed_when_service_rejects() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("青柠主视觉".to_string()),
        json!({
            "prompt": "未来感青柠实验室",
            "size": "1024x1024",
            "count": 1,
            "provider_id": "fal",
            "model": "fal-ai/nano-banana-pro",
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind image api");
    let address = listener.local_addr().expect("resolve address");
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/v1/images/generations",
            post(|| async move {
                (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(json!({
                        "error": {
                            "code": "rate_limited",
                            "message": "图片服务限流，请稍后重试"
                        }
                    })),
                )
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
        },
    )
    .await
    .expect("image task should settle to failed output");

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
        Some("rate_limited")
    );
    assert_eq!(
        result.last_error.as_ref().map(|value| value.retryable),
        Some(true)
    );

    server.abort();
}

#[tokio::test]
async fn execute_image_generation_task_should_classify_openai_compatible_auth_failure() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("青柠主视觉".to_string()),
        json!({
            "prompt": "未来感青柠实验室",
            "size": "1024x1024",
            "count": 1,
            "provider_id": "custom",
            "model": "gpt-image-1",
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind image api");
    let address = listener.local_addr().expect("resolve address");
    let server = tokio::spawn(async move {
        let app = Router::new().route(
            "/v1/images/generations",
            post(|| async move {
                (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({
                        "error": {
                            "code": "invalid_api_key",
                            "message": "API key is invalid"
                        }
                    })),
                )
            }),
        );
        axum::serve(listener, app).await.expect("serve image api");
    });

    let result = execute_image_generation_task(
        temp_dir.path(),
        &created.task_id,
        &ImageGenerationRunnerConfig {
            endpoint: format!("http://{address}/v1/images/generations"),
            api_key: "bad-key".to_string(),
        },
    )
    .await
    .expect("image task should settle to failed output");

    assert_eq!(result.normalized_status, "failed");
    assert_eq!(
        result.last_error.as_ref().map(|value| value.code.as_str()),
        Some("auth_failed")
    );
    assert_eq!(
        result
            .last_error
            .as_ref()
            .and_then(|value| value.provider_code.as_deref()),
        Some("invalid_api_key")
    );
    assert_eq!(
        result.last_error.as_ref().map(|value| value.retryable),
        Some(false)
    );

    server.abort();
}
