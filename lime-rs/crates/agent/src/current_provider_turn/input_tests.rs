use super::structured_input::{
    prepare_image_inputs_for_model, skill_snapshot_from_turn_context, structured_input_context,
    user_message, UNSUPPORTED_HISTORY_IMAGE_PLACEHOLDER,
};
use agent_runtime::reply_input::{
    RuntimeReplyInput, RuntimeReplyInputImage, RuntimeReplyInputPart,
};

fn registered_skill_fixture() -> (
    tempfile::TempDir,
    lime_skills::AgentSkillSnapshot,
    String,
    String,
) {
    let root = tempfile::tempdir().expect("skill root");
    let name = "typed-input".to_string();
    let skill_dir = root.path().join(&name);
    std::fs::create_dir_all(&skill_dir).expect("skill directory");
    let skill_path = skill_dir.join("SKILL.md");
    std::fs::write(
        &skill_path,
        "---\nname: Typed Input\ndescription: Runtime injection test.\n---\n\n# Typed body\n\nUse the selected workflow.\n",
    )
    .expect("write skill");
    let skill_path = std::fs::canonicalize(skill_path)
        .expect("canonical skill path")
        .display()
        .to_string();
    let snapshot =
        lime_skills::build_agent_skill_snapshot_from_roots([lime_skills::AgentSkillRoot {
            path: root.path().to_path_buf(),
            scope: lime_skills::AgentSkillScope::Other,
        }]);
    (root, snapshot, name, skill_path)
}

#[test]
fn structured_skill_is_injected_once_after_current_user_message() {
    use model_provider::current_client::CurrentProviderContent;

    let (_root, snapshot, name, path) = registered_skill_fixture();
    let input = RuntimeReplyInput::from_parts(vec![
        RuntimeReplyInputPart::Skill {
            name: name.clone(),
            path: path.clone(),
        },
        RuntimeReplyInputPart::Text {
            text: "ship it".to_string(),
            text_elements: Vec::new(),
        },
        RuntimeReplyInputPart::Skill {
            name: name.clone(),
            path: path.clone(),
        },
    ]);

    let mut messages = vec![user_message(&input).expect("current user message")];
    let context = structured_input_context(&input, Some(&snapshot));
    assert!(context.warnings.is_empty());
    messages.extend(context.messages);

    assert_eq!(messages.len(), 2);
    assert!(matches!(
        messages[1].content.as_slice(),
        [CurrentProviderContent::Text(text)]
            if text.contains("<skill>")
                && text.contains(&format!("<name>{name}</name>"))
                && text.contains(&format!("<path>{path}</path>"))
                && text.contains("# Typed body")
    ));
    assert_eq!(
        messages[0].content,
        vec![CurrentProviderContent::Text("ship it".to_string())]
    );
}

#[test]
fn skill_only_input_does_not_emit_an_empty_provider_message() {
    let (_root, snapshot, name, path) = registered_skill_fixture();
    let input = RuntimeReplyInput::from_parts(vec![RuntimeReplyInputPart::Skill { name, path }]);

    let context = structured_input_context(&input, Some(&snapshot));
    assert_eq!(context.messages.len(), 1);
    assert!(context.warnings.is_empty());
    assert!(user_message(&input).is_none());
}

#[test]
fn structured_skill_path_drift_and_control_mentions_are_not_provider_text() {
    let (root, snapshot, name, path) = registered_skill_fixture();
    let other_dir = root.path().join("other");
    std::fs::create_dir_all(&other_dir).expect("other skill directory");
    let other_path = other_dir.join("SKILL.md");
    std::fs::write(&other_path, "# Other\n").expect("write other skill");
    let drift = RuntimeReplyInput::from_parts(vec![RuntimeReplyInputPart::Skill {
        name: name.clone(),
        path: other_path.display().to_string(),
    }]);
    let drift_context = structured_input_context(&drift, Some(&snapshot));
    assert!(drift_context.messages.is_empty());
    assert_eq!(drift_context.warnings[0].code, "skill_not_available");
    assert!(user_message(&drift).is_none());

    let skill_mention = RuntimeReplyInput::from_parts(vec![RuntimeReplyInputPart::Mention {
        name: name.clone(),
        path: format!("skill://{path}"),
    }]);
    let skill_mention_context = structured_input_context(&skill_mention, Some(&snapshot));
    assert_eq!(skill_mention_context.messages.len(), 1);
    assert!(skill_mention_context.warnings.is_empty());

    let app_mention = RuntimeReplyInput::from_parts(vec![RuntimeReplyInputPart::Mention {
        name: "docs".to_string(),
        path: "app://docs".to_string(),
    }]);
    let app_mention_context = structured_input_context(&app_mention, Some(&snapshot));
    assert!(app_mention_context.messages.is_empty());
    assert!(app_mention_context.warnings.is_empty());
    assert!(user_message(&app_mention).is_none());
}

#[test]
fn plain_dollar_selection_uses_the_turn_snapshot() {
    let (_root, snapshot, _name, _path) = registered_skill_fixture();
    let input = RuntimeReplyInput::text("use $typed-input now");

    let context = structured_input_context(&input, Some(&snapshot));

    assert_eq!(context.messages.len(), 1);
    assert!(context.warnings.is_empty());
}

#[test]
fn turn_context_carries_the_exact_skill_snapshot() {
    let (_root, snapshot, _name, _path) = registered_skill_fixture();
    let mut turn_context = agent_protocol::turn_context::TurnContextOverride::default();
    turn_context.metadata.insert(
        lime_skills::SKILL_SNAPSHOT_TURN_METADATA_KEY.to_string(),
        serde_json::to_value(&snapshot).expect("snapshot json"),
    );

    assert_eq!(
        skill_snapshot_from_turn_context(Some(&turn_context)),
        Some(snapshot)
    );
}

#[test]
fn text_only_model_rejects_current_image_before_provider_execution() {
    let input = RuntimeReplyInput {
        parts: vec![
            RuntimeReplyInputPart::Text {
                text: "describe it".to_string(),
                text_elements: Vec::new(),
            },
            RuntimeReplyInputPart::Image(RuntimeReplyInputImage {
                uri: "sidecar://image-1".to_string(),
                media_type: "image/png".to_string(),
                provider_data: Some("data:image/png;base64,abc".to_string()),
                detail: None,
            }),
        ],
        agent_only: false,
    };
    let mut history = Vec::new();

    let error = prepare_image_inputs_for_model(&input, &mut history, false)
        .expect_err("current image must fail before provider execution");

    assert!(!error.emitted_any);
    assert!(error.message.contains("不支持图片输入"));
    assert!(history.is_empty());
}

#[test]
fn text_only_model_replaces_history_image_without_leaking_provider_payload() {
    use model_provider::current_client::{CurrentProviderContent, CurrentProviderMessage};

    let input = RuntimeReplyInput::text("continue");
    let mut history = vec![CurrentProviderMessage::user(vec![
        CurrentProviderContent::Text("before".to_string()),
        CurrentProviderContent::Image {
            uri: "sidecar://image-1".to_string(),
            media_type: "image/png".to_string(),
            provider_data: Some("data:image/png;base64,abc".to_string()),
            detail: None,
        },
        CurrentProviderContent::Text("after".to_string()),
    ])];

    prepare_image_inputs_for_model(&input, &mut history, false)
        .expect("historical images should not block a text-only continuation");

    assert_eq!(
        history[0].content,
        vec![
            CurrentProviderContent::Text("before".to_string()),
            CurrentProviderContent::Text(UNSUPPORTED_HISTORY_IMAGE_PLACEHOLDER.to_string()),
            CurrentProviderContent::Text("after".to_string()),
        ]
    );
}
