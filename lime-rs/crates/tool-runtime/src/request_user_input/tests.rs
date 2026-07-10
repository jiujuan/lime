use super::{
    build_requested_schema, extract_response, normalize_request_user_input_result,
    parse_request_user_input_tool_input, project_request_user_input_result, AskOption, AskQuestion,
    AskRequest, ASK_USER_QUESTIONS_SCHEMA_KEY,
};

#[test]
fn parse_request_user_input_tool_input_validates_current_surface() {
    let request = parse_request_user_input_tool_input(serde_json::json!({
        "questions": [{
            "id": "mode",
            "header": "模式",
            "question": "请选择执行模式",
            "options": [
                {"label": "自动", "description": "继续执行"},
                {"label": "确认", "description": "等待确认"}
            ]
        }]
    }))
    .expect("request should parse");

    assert_eq!(request.questions.len(), 1);
    assert_eq!(request.questions[0].id.as_deref(), Some("mode"));
    assert_eq!(request.questions[0].options[0].value, "自动");
}

#[test]
fn build_requested_schema_embeds_questions_extension() {
    let request = AskRequest {
        questions: vec![AskQuestion {
            id: Some("primary_color".to_string()),
            question: "你希望主色调是什么？".to_string(),
            header: Some("主色调".to_string()),
            options: vec![
                AskOption {
                    value: "blue-purple".to_string(),
                    label: Some("蓝紫".to_string()),
                    description: Some("冷色科技感".to_string()),
                    preview: None,
                },
                AskOption {
                    value: "cyber-green".to_string(),
                    label: Some("赛博绿".to_string()),
                    description: Some("高亮未来感".to_string()),
                    preview: None,
                },
            ],
            multi_select: false,
        }],
    };

    let schema = build_requested_schema(&request);
    assert_eq!(
        schema
            .get(ASK_USER_QUESTIONS_SCHEMA_KEY)
            .and_then(|value| value.as_array())
            .map(|value| value.len()),
        Some(1)
    );
    assert_eq!(
        schema["properties"]["answer"]["enum"],
        serde_json::json!(["蓝紫", "赛博绿"])
    );
}

#[test]
fn extract_response_normalizes_question_answers() {
    let request = AskRequest {
        questions: vec![
            AskQuestion::new("第一问"),
            AskQuestion {
                id: Some("mode".to_string()),
                question: "第二问".to_string(),
                header: Some("mode".to_string()),
                options: vec![
                    AskOption::with_label("auto", "自动执行"),
                    AskOption::with_label("confirm", "确认后执行"),
                ],
                multi_select: false,
            },
        ],
    };

    let response = extract_response(
        &request,
        &serde_json::json!({
            "question_1": "先看结构",
            "mode": "确认后执行"
        }),
    )
    .expect("expected normalized response");

    assert_eq!(
        response,
        serde_json::json!({
            "answers": {
                "第一问": "先看结构",
                "第二问": "confirm"
            }
        })
    );
}

#[test]
fn normalize_result_preserves_annotations_and_option_identity() {
    let request = AskRequest {
        questions: vec![AskQuestion {
            id: Some("mode".to_string()),
            question: "请选择执行模式".to_string(),
            header: Some("mode".to_string()),
            options: vec![
                AskOption::with_label("auto", "自动执行"),
                AskOption::with_label("confirm", "确认后执行"),
            ],
            multi_select: false,
        }],
    };

    let result = normalize_request_user_input_result(
        &request,
        serde_json::json!({
            "mode": "确认后执行",
            "annotations": {
                "mode": {
                    "preview": "diff preview",
                    "notes": "先看计划"
                }
            }
        }),
    )
    .expect("result should normalize");

    assert_eq!(result.primary_response(), Some("confirm"));
    assert!(result.from_option);
    assert_eq!(result.option_index, Some(1));
    assert_eq!(
        result
            .annotations
            .get("请选择执行模式")
            .and_then(|annotation| annotation.preview.as_deref()),
        Some("diff preview")
    );
}

#[test]
fn project_request_user_input_result_builds_output_and_metadata() {
    let request = AskRequest {
        questions: vec![AskQuestion {
            id: Some("mode".to_string()),
            question: "请选择执行模式".to_string(),
            header: Some("mode".to_string()),
            options: vec![
                AskOption::with_label("auto", "自动执行"),
                AskOption::with_label("confirm", "确认后执行"),
            ],
            multi_select: false,
        }],
    };
    let result = normalize_request_user_input_result(
        &request,
        serde_json::json!({
            "mode": "确认后执行",
            "annotations": {
                "mode": {
                    "preview": "diff preview",
                    "notes": "先看计划"
                }
            }
        }),
    )
    .expect("result should normalize");

    let projection = project_request_user_input_result(&request, &result);

    assert!(projection.output.contains("\"请选择执行模式\"=\"confirm\""));
    assert!(projection
        .output
        .contains("selected preview:\ndiff preview"));
    assert_eq!(
        projection.metadata.get("answers"),
        Some(&serde_json::json!({
            "请选择执行模式": "confirm"
        }))
    );
    assert!(projection.metadata.contains_key("annotations"));
}
