use super::*;

#[test]
fn should_skip_artifact_document_autopersist_when_output_is_empty() {
    let observation = Arc::new(Mutex::new(ChatRunObservation::default()));

    assert!(should_skip_artifact_document_autopersist(
        &observation,
        "   \n  "
    ));
}

#[test]
fn should_skip_artifact_document_autopersist_when_runtime_observation_has_artifacts() {
    let observation = Arc::new(Mutex::new(ChatRunObservation::default()));
    observation
        .lock()
        .expect("lock observation")
        .record_artifact_path("content-posts/demo.md".to_string(), None);

    assert!(should_skip_artifact_document_autopersist(
        &observation,
        "普通正文输出"
    ));
}

#[test]
fn should_not_skip_artifact_document_autopersist_based_on_write_file_text_only() {
    let observation = Arc::new(Mutex::new(ChatRunObservation::default()));

    assert!(!should_skip_artifact_document_autopersist(
        &observation,
        "<write_file path=\"content-posts/demo.md\">内容</write_file>"
    ));
}

#[test]
fn should_skip_default_fast_chat_artifact_autopersist_for_plain_chat() {
    assert!(should_skip_default_fast_chat_artifact_autopersist(
        TurnExecutionProfile::FastChat,
        Some(&json!({
            "harness": {
                "theme": "general",
                "session_mode": "default"
            }
        })),
    ));
}

#[test]
fn should_not_skip_default_fast_chat_artifact_autopersist_for_workbench_content() {
    assert!(!should_skip_default_fast_chat_artifact_autopersist(
        TurnExecutionProfile::FastChat,
        Some(&json!({
            "harness": {
                "theme": "general",
                "session_mode": "general_workbench",
                "content_id": "content-1"
            }
        })),
    ));
}

#[test]
fn should_not_skip_default_fast_chat_artifact_autopersist_for_explicit_artifact_request() {
    assert!(!should_skip_default_fast_chat_artifact_autopersist(
        TurnExecutionProfile::FastChat,
        Some(&json!({
            "artifact_mode": "draft",
            "artifact_stage": "stage2"
        })),
    ));
}
