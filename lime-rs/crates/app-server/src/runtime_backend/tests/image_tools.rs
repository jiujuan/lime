use super::*;
use crate::NoopAppDataSource;
use lime_agent::agent_tools::catalog::LIME_CREATE_IMAGE_TASK_TOOL_NAME;
use lime_core::models::{parse_skill_manifest_from_content, split_skill_frontmatter};

const IMAGE_GENERATE_DEFAULT_SKILL: &str =
    include_str!("../../../../../resources/default-skills/image_generate/SKILL.md");

#[test]
fn default_image_generate_skill_uses_current_native_image_task_tool() {
    let manifest = parse_skill_manifest_from_content(IMAGE_GENERATE_DEFAULT_SKILL)
        .expect("image_generate default skill manifest should parse");
    assert!(
        manifest.compliance.validation_errors.is_empty(),
        "image_generate default skill manifest should be standard: {:?}",
        manifest.compliance.validation_errors
    );
    assert_eq!(manifest.metadata.name.as_deref(), Some("image_generate"));
    assert_eq!(
        manifest.metadata.allowed_tools,
        vec![LIME_CREATE_IMAGE_TASK_TOOL_NAME.to_string()],
        "image_generate must only expose the current native image task tool"
    );
    assert!(
        !manifest.metadata.allowed_tools.iter().any(
            |tool| tool.eq_ignore_ascii_case("Bash") || tool.eq_ignore_ascii_case("ToolSearch")
        ),
        "image_generate must not expose Bash or ToolSearch in allowed-tools"
    );

    let (_frontmatter, body) =
        split_skill_frontmatter(IMAGE_GENERATE_DEFAULT_SKILL).expect("frontmatter");
    assert!(
        body.contains(&format!(
            "必须直接调用 `{LIME_CREATE_IMAGE_TASK_TOOL_NAME}`"
        )),
        "image_generate prompt must route through the current native task tool"
    );
    assert!(
        body.contains("不要先调用 `ToolSearch`") && body.contains("不要通过 `Bash`"),
        "image_generate prompt must forbid ToolSearch/Bash task-creation detours"
    );
}

#[tokio::test]
async fn runtime_backend_registers_image_generation_task_native_tool() {
    let db: lime_core::database::DbConnection = std::sync::Arc::new(std::sync::Mutex::new(
        rusqlite::Connection::open_in_memory().expect("db"),
    ));
    {
        let conn = db.lock().expect("db lock");
        lime_core::database::schema::create_tables(&conn).expect("schema");
    }
    lime_agent::initialize_agent_runtime(db.clone()).expect("runtime dirs");

    let backend = RuntimeBackend::with_db(db.clone());
    ExecutionBackend::set_app_data_source(&backend, std::sync::Arc::new(NoopAppDataSource))
        .expect("app data source should be accepted");
    backend
        .agent_state
        .init_agent_with_db(&db)
        .await
        .expect("agent should initialize");
    backend
        .register_current_native_tools_if_available()
        .await
        .expect("current native tools should register");

    let agent_arc = backend.agent_state.get_agent_arc();
    let agent_guard = agent_arc.read().await;
    let agent = agent_guard.as_ref().expect("agent");
    let registry = agent.tool_registry().read().await;
    assert!(
        registry.contains_native(LIME_CREATE_IMAGE_TASK_TOOL_NAME),
        "{LIME_CREATE_IMAGE_TASK_TOOL_NAME} should be registered as the current image task native tool"
    );
}
