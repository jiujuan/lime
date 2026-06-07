use super::super::reply_runtime::build_runtime_user_message;
use super::runtime_turn_agent_app_skill_contract::{
    build_agent_app_required_skill_tool_params, resolve_agent_app_required_skill_contract,
    resolve_agent_app_required_skill_tool_allowlist,
};
use super::runtime_turn_artifact_materialization::{
    build_agent_app_output_contract_workspace_patch,
    should_skip_default_fast_chat_artifact_autopersist,
};
use super::runtime_turn_compaction::{
    build_history_compaction_runtime_metadata, build_runtime_compaction_session_config,
};
use super::runtime_turn_event_projection::{
    build_agent_app_runtime_event_projection_payload,
    build_agent_app_runtime_profile_projection_payload,
    emit_agent_app_runtime_event_projection_with_port, emit_agent_runtime_profile_event_with_port,
    RuntimeProjectionEventPort,
};
use super::runtime_turn_image_policy::RuntimeImageInputPolicy;
use super::runtime_turn_image_policy::{
    build_runtime_image_input_unsupported_warning, merge_runtime_image_input_policy_metadata,
    merge_runtime_image_input_unsupported_system_prompt, resolve_runtime_forwarded_images,
    resolve_runtime_image_input_policy,
};
use super::runtime_turn_prompt_composition::merge_system_prompt_with_response_language;
use super::runtime_turn_request_metadata::request_metadata_contains_full_runtime_context;
use super::runtime_turn_request_resolution_permission::{
    apply_runtime_permission_confirmation_projection_to_metadata,
    should_create_runtime_permission_confirmation_request,
};
use super::runtime_turn_request_resolution_user_lock::{
    apply_runtime_user_lock_capability_projection_to_request,
    runtime_user_lock_capability_response_confirmed,
    should_create_runtime_user_lock_capability_request,
};
use super::runtime_turn_stream::{
    project_runtime_tool_profile_events, should_emit_runtime_stream_event_directly,
    should_record_runtime_stream_event_on_timeline,
    timeline_recorder_emits_equivalent_runtime_event, RuntimeToolProfileState,
};
use super::*;
use crate::tests::runtime_test_support::shared_aster_runtime_test_root;
use aster::conversation::message::Message;
use aster::model::ModelConfig;
use aster::providers::base::{Provider, ProviderMetadata, ProviderUsage, Usage};
use aster::providers::errors::ProviderError;
use aster::providers::formats::openai::format_messages as format_openai_messages;
use aster::providers::utils::ImageFormat;
use aster::session::{
    apply_session_update, create_managed_session, delete_managed_session,
    initialize_shared_session_runtime_with_root, is_global_session_store_set, query_session,
    SessionType,
};
use aster::tools::VIEW_IMAGE_TOOL_NAME;
use async_trait::async_trait;
use chrono::Utc;
use lime_core::database::dao::agent_timeline::{
    AgentThreadItem, AgentThreadItemPayload, AgentThreadItemStatus,
};
use lime_core::database::schema::create_tables;
use lime_services::aster_session_store::LimeSessionStore;
use rmcp::model::Tool;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::fs;
use tokio::sync::OnceCell;

async fn ensure_runtime_turn_test_session_manager() {
    static INIT: OnceCell<()> = OnceCell::const_new();

    INIT.get_or_init(|| async {
        if is_global_session_store_set() {
            return;
        }

        let conn = Connection::open_in_memory().expect("创建内存数据库失败");
        create_tables(&conn).expect("初始化表结构失败");

        let runtime_root = shared_aster_runtime_test_root();
        fs::create_dir_all(&runtime_root).expect("创建 runtime 测试目录失败");

        let session_store = Arc::new(LimeSessionStore::new(Arc::new(Mutex::new(conn))));
        initialize_shared_session_runtime_with_root(runtime_root, Some(session_store))
            .await
            .expect("初始化测试 session manager 失败");
    })
    .await;
}

fn build_compact_tool_surface_turn_context() -> TurnContextOverride {
    let mut runtime_metadata = serde_json::Map::new();
    runtime_metadata.insert(
        LIME_RUNTIME_TOOL_SURFACE_KEY.to_string(),
        Value::String(DEFAULT_NATIVE_TOOL_SURFACE_COMPACT.to_string()),
    );

    let mut metadata = HashMap::new();
    metadata.insert(
        LIME_RUNTIME_METADATA_KEY.to_string(),
        Value::Object(runtime_metadata),
    );

    TurnContextOverride {
        metadata,
        ..TurnContextOverride::default()
    }
}

const COMPACT_PROVIDER_BROKER_TOOL_NAMES: &[&str] = &[
    TOOL_SEARCH_TOOL_NAME,
    LIST_MCP_RESOURCES_TOOL_NAME,
    READ_MCP_RESOURCE_TOOL_NAME,
    "extensionmanager__search_available_extensions",
    "extensionmanager__manage_extensions",
    "Read",
    VIEW_IMAGE_TOOL_NAME,
    "Glob",
    "Grep",
    "Bash",
    "Edit",
    "Write",
    "Agent",
    "WebSearch",
    "WebFetch",
    "StructuredOutput",
];

#[path = "tests/agent_app_output_contract.rs"]
mod agent_app_output_contract;
#[path = "tests/agent_app_skill.rs"]
mod agent_app_skill;
#[path = "tests/artifact_autopersist.rs"]
mod artifact_autopersist;
#[path = "tests/compaction_context.rs"]
mod compaction_context;
#[path = "tests/compaction_metrics.rs"]
mod compaction_metrics;
#[path = "tests/hooks_surface.rs"]
mod hooks_surface;
#[path = "tests/image_policy.rs"]
mod image_policy;
#[path = "tests/metadata_normalization.rs"]
mod metadata_normalization;
#[path = "tests/metadata_policy.rs"]
mod metadata_policy;
#[path = "tests/projection.rs"]
mod projection;
#[path = "tests/prompt.rs"]
mod prompt;
#[path = "tests/queue.rs"]
mod queue;
#[path = "tests/request_permission.rs"]
mod request_permission;
#[path = "tests/request_resolution_events.rs"]
mod request_resolution_events;
#[path = "tests/routing.rs"]
mod routing;
#[path = "tests/status.rs"]
mod status;
#[path = "tests/stream.rs"]
mod stream;
#[path = "tests/user_lock.rs"]
mod user_lock;

fn build_runtime_turn_test_request(message: &str, metadata: Option<Value>) -> AsterChatRequest {
    AsterChatRequest {
        message: message.to_string(),
        session_id: "session-test".to_string(),
        event_name: "agent_stream".to_string(),
        images: None,
        provider_config: None,
        provider_preference: None,
        model_preference: None,
        reasoning_effort: None,
        thinking_enabled: None,
        approval_policy: None,
        sandbox_policy: None,
        project_id: None,
        workspace_id: "workspace-test".to_string(),
        web_search: None,
        search_mode: None,
        execution_strategy: None,
        auto_continue: None,
        system_prompt: None,
        metadata,
        turn_id: None,
        queue_if_busy: None,
        queued_turn_id: None,
    }
}

fn build_runtime_turn_test_item() -> AgentThreadItem {
    let now = Utc::now().to_rfc3339();
    AgentThreadItem {
        id: "item-test".to_string(),
        thread_id: "thread-test".to_string(),
        turn_id: "turn-test".to_string(),
        sequence: 1,
        status: AgentThreadItemStatus::InProgress,
        started_at: now.clone(),
        completed_at: None,
        updated_at: now,
        payload: AgentThreadItemPayload::AgentMessage {
            text: "hello".to_string(),
            phase: None,
        },
    }
}

fn build_runtime_turn_test_tool_item(
    id: &str,
    status: AgentThreadItemStatus,
    success: Option<bool>,
    error: Option<&str>,
) -> AgentThreadItem {
    let now = Utc::now().to_rfc3339();
    AgentThreadItem {
        id: id.to_string(),
        thread_id: "thread-test".to_string(),
        turn_id: "turn-test".to_string(),
        sequence: 2,
        status,
        started_at: now.clone(),
        completed_at: Some(now.clone()),
        updated_at: now,
        payload: AgentThreadItemPayload::ToolCall {
            tool_name: "Read".to_string(),
            arguments: Some(json!({ "path": "README.md" })),
            output: None,
            success,
            error: error.map(str::to_string),
            metadata: None,
        },
    }
}

#[derive(Clone)]
struct AutoCompactThresholdTestProvider {
    context_limit: Option<usize>,
}

impl AutoCompactThresholdTestProvider {
    fn new(context_limit: Option<usize>) -> Self {
        Self { context_limit }
    }
}

#[async_trait]
impl Provider for AutoCompactThresholdTestProvider {
    fn metadata() -> ProviderMetadata {
        ProviderMetadata::new(
            "auto-compact-threshold-test",
            "Auto Compact Threshold Test",
            "用于测试自动压缩阈值判断的 provider",
            "auto-compact-threshold-test-model",
            vec!["auto-compact-threshold-test-model"],
            "",
            vec![],
        )
    }

    fn get_name(&self) -> &str {
        "auto-compact-threshold-test"
    }

    async fn complete_with_model(
        &self,
        _model_config: &ModelConfig,
        _system: &str,
        _messages: &[Message],
        _tools: &[Tool],
    ) -> Result<(Message, ProviderUsage), ProviderError> {
        Err(ProviderError::ExecutionError(
            "测试不应调用 complete_with_model".to_string(),
        ))
    }

    fn get_model_config(&self) -> ModelConfig {
        ModelConfig {
            model_name: "auto-compact-threshold-test-model".to_string(),
            context_limit: self.context_limit,
            temperature: None,
            max_tokens: None,
            reasoning_effort: None,
            toolshim: false,
            toolshim_model: None,
            fast_model: None,
        }
    }
}

fn write_blocking_user_prompt_submit_hook(workspace_root: &std::path::Path, message: &str) {
    let claude_dir = workspace_root.join(".claude");
    fs::create_dir_all(&claude_dir).expect("创建 .claude 目录失败");

    let blocking_payload = serde_json::json!({
        "blocked": true,
        "message": message,
    })
    .to_string();
    let settings = serde_json::json!({
        "hooks": {
            "UserPromptSubmit": [
                {
                    "type": "command",
                    "command": format!("printf '%s' '{blocking_payload}'; exit 2"),
                    "blocking": true,
                }
            ]
        }
    });
    fs::write(
        claude_dir.join("settings.json"),
        serde_json::to_string_pretty(&settings).expect("序列化 settings 失败"),
    )
    .expect("写入 settings.json 失败");
}

fn write_runtime_test_knowledge_pack(working_dir: &std::path::Path, pack_name: &str, body: &str) {
    let pack_root = working_dir.join(".lime/knowledge/packs").join(pack_name);
    std::fs::create_dir_all(pack_root.join("compiled")).expect("create compiled dir");
    std::fs::write(
        pack_root.join("KNOWLEDGE.md"),
        format!(
            "---\nname: {pack_name}\ndescription: 运行时知识包测试\ntype: brand-product\nstatus: ready\ngrounding: recommended\n---\n\n# Guide\n"
        ),
    )
    .expect("write knowledge metadata");
    std::fs::write(pack_root.join("compiled/brief.md"), body).expect("write compiled view");
}

fn runtime_test_model_capabilities(
    vision: bool,
) -> lime_core::models::model_registry::ModelCapabilities {
    lime_core::models::model_registry::ModelCapabilities {
        vision,
        tools: true,
        streaming: true,
        json_mode: true,
        function_calling: true,
        reasoning: false,
        reasoning_effort: None,
    }
}

fn assert_diagnostics_runtime_status_metadata(
    metadata: &std::collections::HashMap<String, serde_json::Value>,
) {
    assert_eq!(
        metadata.get("sourceType"),
        Some(&serde_json::Value::String("runtime_status".to_string()))
    );
    assert_eq!(
        metadata.get("source"),
        Some(&serde_json::Value::String("runtime_status".to_string()))
    );
    assert_eq!(
        metadata.get("surface"),
        Some(&serde_json::Value::String("runtime_status".to_string()))
    );
    assert_eq!(
        metadata.get("visibility"),
        Some(&serde_json::Value::String("diagnostics".to_string()))
    );
    assert_eq!(
        metadata.get("persistence"),
        Some(&serde_json::Value::String("transient".to_string()))
    );
    assert_eq!(
        metadata
            .get("agentui")
            .and_then(|value| value.get("eventClass"))
            .and_then(serde_json::Value::as_str),
        Some("run.status")
    );
    assert_eq!(
        metadata
            .get("agentui")
            .and_then(|value| value.get("visibility"))
            .and_then(serde_json::Value::as_str),
        Some("diagnostics")
    );
}
