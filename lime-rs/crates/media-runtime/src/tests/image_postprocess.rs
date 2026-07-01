use super::*;

#[test]
fn prepare_image_task_input_should_consume_layered_design_chroma_key_postprocess_contract() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let output = write_media_task_artifact(
        temp_dir.path(),
        MediaTaskType::ImageGenerate,
        Some("透明角色层".to_string()),
        serde_json::json!({
            "prompt": "生成透明角色层",
            "runtime_contract": {
                "contract_key": "image_generation",
                "layered_design": {
                    "document_id": "design-1",
                    "layer_id": "subject",
                    "asset_id": "asset-subject",
                    "alpha": {
                        "requested": true,
                        "strategy": "chroma_key_postprocess",
                        "chromaKeyColor": "#00ff00",
                        "postprocessRequired": true
                    }
                }
            }
        }),
        None,
        None,
        None,
    )
    .expect("write media task");

    let prepared = prepare_image_task_input(&output).expect("prepare image task");
    let postprocess_plan = prepared
        .postprocess_plan
        .as_ref()
        .expect("postprocess plan");

    assert_eq!(postprocess_plan.strategy, "chroma_key_postprocess");
    assert_eq!(postprocess_plan.chroma_key_color, "#00ff00");
    assert_eq!(postprocess_plan.layer_id.as_deref(), Some("subject"));
    assert!(prepared.request_slots[0]
        .prompt
        .contains("flat chroma-key background (#00ff00)"));

    let source_url = build_test_png_data_url(2, 1, &[[0, 255, 0, 255], [255, 0, 0, 255]]);
    let decorated = decorate_generated_image_with_slot(
        serde_json::json!({ "url": source_url }),
        &prepared.request_slots[0],
        prepared.postprocess_plan.as_ref(),
    );
    assert_eq!(
        decorated.pointer("/postprocess/status"),
        Some(&serde_json::json!("succeeded"))
    );
    assert_eq!(
        decorated.pointer("/postprocess/removed_pixel_count"),
        Some(&serde_json::json!(1))
    );
    let output_url = decorated
        .pointer("/url")
        .and_then(Value::as_str)
        .expect("decorated image url");
    assert_eq!(read_test_png_alpha(output_url, 0, 0), 0);
    assert_eq!(read_test_png_alpha(output_url, 1, 0), 255);

    let result = build_image_task_result_value(&prepared, 1, &[decorated], &[], &[]);
    assert_eq!(
        result.pointer("/postprocess/strategy"),
        Some(&serde_json::json!("chroma_key_postprocess"))
    );
    assert_eq!(
        result.pointer("/postprocess/status"),
        Some(&serde_json::json!("succeeded"))
    );
}

#[test]
fn chroma_key_postprocess_should_skip_remote_image_url_without_failing_task() {
    let plan = test_chroma_key_plan();
    let source_url = "https://example.test/generated.png";
    let decorated = decorate_generated_image_with_slot(
        serde_json::json!({ "url": source_url }),
        &test_image_slot(),
        Some(&plan),
    );

    assert_eq!(
        decorated.pointer("/url"),
        Some(&serde_json::json!(source_url))
    );
    assert_eq!(
        decorated.pointer("/postprocess/status"),
        Some(&serde_json::json!("skipped_unsupported_source"))
    );
    assert!(decorated.pointer("/postprocess/reason").is_some());
}

#[tokio::test]
async fn execute_image_generation_task_should_postprocess_remote_chroma_key_url() {
    let temp_dir = tempfile::tempdir().expect("create temp dir");
    let created = write_task_artifact(
        temp_dir.path(),
        TaskType::ImageGenerate,
        Some("透明角色层".to_string()),
        json!({
            "prompt": "生成透明角色层",
            "count": 1,
            "runtime_contract": {
                "contract_key": "image_generation",
                "layered_design": {
                    "document_id": "design-remote",
                    "layer_id": "subject",
                    "asset_id": "asset-subject",
                    "alpha": {
                        "requested": true,
                        "strategy": "chroma_key_postprocess",
                        "chroma_key_color": "#00ff00",
                        "postprocess_required": true
                    }
                }
            }
        }),
        TaskWriteOptions::default(),
    )
    .expect("create task");

    let png_bytes = Arc::new(build_test_png_bytes(
        2,
        1,
        &[[0, 255, 0, 255], [255, 0, 0, 255]],
    ));
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind image api");
    let address = listener.local_addr().expect("resolve address");
    let generated_image_url = format!("http://{address}/generated.png");
    let response_image_url = generated_image_url.clone();
    let png_bytes_for_server = Arc::clone(&png_bytes);
    let server = tokio::spawn(async move {
        let app = Router::new()
            .route(
                "/v1/images/generations",
                post(move |Json(_body): Json<Value>| {
                    let response_image_url = response_image_url.clone();
                    async move {
                        (
                            StatusCode::OK,
                            Json(json!({
                                "created": 1_717_200_000i64,
                                "data": [
                                    {
                                        "url": response_image_url,
                                        "revised_prompt": "透明角色层"
                                    }
                                ]
                            })),
                        )
                    }
                }),
            )
            .route(
                "/generated.png",
                get(move || {
                    let png_bytes = Arc::clone(&png_bytes_for_server);
                    async move {
                        (
                            StatusCode::OK,
                            [("content-type", PNG_DATA_URL_MIME)],
                            png_bytes.as_ref().clone(),
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

    let image = result
        .record
        .result
        .as_ref()
        .and_then(|value| value.get("images"))
        .and_then(Value::as_array)
        .and_then(|images| images.first())
        .expect("generated image");
    let output_url = image
        .get("url")
        .and_then(Value::as_str)
        .expect("output url");

    assert_ne!(output_url, generated_image_url);
    assert!(output_url.starts_with("data:image/png;base64,"));
    assert_eq!(read_test_png_alpha(output_url, 0, 0), 0);
    assert_eq!(read_test_png_alpha(output_url, 1, 0), 255);
    assert_eq!(
        image.pointer("/postprocess/status"),
        Some(&serde_json::json!("succeeded"))
    );
    assert_eq!(
        image.pointer("/postprocess/input_source"),
        Some(&serde_json::json!("remote_url"))
    );
    assert_eq!(
        result
            .record
            .result
            .as_ref()
            .and_then(|value| value.pointer("/postprocess/succeeded_count")),
        Some(&serde_json::json!(1))
    );

    server.abort();
}
