use aster::agents::extension::ExtensionConfig;
use aster::agents::Agent;
use aster::conversation::message::Message;
use aster::model::ModelConfig;
use aster::providers::formats::openai_responses::{
    create_responses_request, ResponsesRequestOptions,
};
use aster::providers::formats::{anthropic, google, openai};
use aster::providers::utils::ImageFormat;
use aster::session::TurnContextOverride;
use rmcp::model::Tool;
use rmcp::object;
use serde_json::{json, Value};
use std::collections::HashMap;

const LIME_RUNTIME_METADATA_KEY: &str = "lime_runtime";
const LIME_RUNTIME_TOOL_SURFACE_KEY: &str = "tool_surface";
const COMPACT_TOOL_SURFACE_MODE: &str = "compact_tools";
const COMPACT_PROVIDER_BROKER_TOOL_NAMES: &[&str] = &[
    "ToolSearch",
    "ListMcpResourcesTool",
    "ReadMcpResourceTool",
    "extensionmanager__search_available_extensions",
    "extensionmanager__manage_extensions",
    "Read",
    "Glob",
    "Grep",
    "Bash",
    "Edit",
    "Write",
    "Agent",
    "StructuredOutput",
];
const PROHIBITED_PROVIDER_TOOL_NAMES: &[&str] = &["TeamCreate", "TeamDelete"];

fn compact_turn_context() -> TurnContextOverride {
    let mut metadata = HashMap::new();
    metadata.insert(
        LIME_RUNTIME_METADATA_KEY.to_string(),
        json!({
            LIME_RUNTIME_TOOL_SURFACE_KEY: COMPACT_TOOL_SURFACE_MODE,
        }),
    );

    TurnContextOverride {
        metadata,
        ..TurnContextOverride::default()
    }
}

async fn prepare_compact_tools_and_prompt(agent: &Agent) -> (Vec<Tool>, String) {
    let working_dir = std::env::current_dir().expect("读取当前目录失败");
    let model_config = ModelConfig::new("gpt-4.1").expect("测试模型应有效");

    let (tools, _toolshim_tools, system_prompt) =
        aster::session_context::with_turn_context(Some(compact_turn_context()), async {
            agent
                .prepare_tools_and_prompt(&working_dir, None, false, &model_config)
                .await
        })
        .await
        .expect("准备 compact provider 工具面失败");

    (tools, system_prompt)
}

fn tool_names(tools: &[Tool]) -> Vec<String> {
    tools.iter().map(|tool| tool.name.to_string()).collect()
}

fn assert_compact_tool_names(names: &[String]) {
    assert!(!names.is_empty(), "compact 工具面不应为空");
    assert!(
        names.len() <= COMPACT_PROVIDER_BROKER_TOOL_NAMES.len(),
        "compact broker 工具面最多应有 {} 个工具，实际为 {}: {:?}",
        COMPACT_PROVIDER_BROKER_TOOL_NAMES.len(),
        names.len(),
        names
    );
    assert!(
        names.iter().all(|name| COMPACT_PROVIDER_BROKER_TOOL_NAMES
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(name))),
        "compact provider tools 只能包含 broker / deferred / 本地核心工具: {names:?}"
    );
    assert!(names.iter().any(|name| name == "ToolSearch"));
    assert!(names.iter().any(|name| name == "Read"));
    for prohibited_name in PROHIBITED_PROVIDER_TOOL_NAMES {
        assert!(
            !names.iter().any(|name| name == prohibited_name),
            "compact provider tools 不应包含 {prohibited_name}: {names:?}"
        );
    }
}

fn anthropic_tool_names(payload: &Value) -> Vec<String> {
    payload
        .get("tools")
        .and_then(Value::as_array)
        .expect("Anthropic payload should include tools")
        .iter()
        .filter_map(|tool| tool.get("name").and_then(Value::as_str))
        .map(str::to_string)
        .collect()
}

fn openai_tool_names(payload: &Value) -> Vec<String> {
    payload
        .get("tools")
        .and_then(Value::as_array)
        .expect("OpenAI payload should include tools")
        .iter()
        .filter_map(|tool| {
            tool.get("function")
                .and_then(|function| function.get("name"))
                .and_then(Value::as_str)
        })
        .map(str::to_string)
        .collect()
}

fn openai_responses_tool_names(payload: &Value) -> Vec<String> {
    payload
        .get("tools")
        .and_then(Value::as_array)
        .expect("OpenAI Responses payload should include tools")
        .iter()
        .filter_map(|tool| tool.get("name").and_then(Value::as_str))
        .map(str::to_string)
        .collect()
}

fn google_tool_names(payload: &Value) -> Vec<String> {
    payload
        .get("tools")
        .and_then(|tools| tools.get("functionDeclarations"))
        .and_then(Value::as_array)
        .expect("Google payload should include functionDeclarations")
        .iter()
        .filter_map(|tool| tool.get("name").and_then(Value::as_str))
        .map(str::to_string)
        .collect()
}

#[tokio::test]
async fn compact_tool_surface_bounds_anthropic_openai_and_google_payload_tools() {
    let agent = Agent::new();
    let model_config = ModelConfig::new("gpt-4.1").expect("测试模型应有效");

    let (tools, _system_prompt) = prepare_compact_tools_and_prompt(&agent).await;

    let prepared_names = tool_names(&tools);
    assert_compact_tool_names(&prepared_names);

    let messages = vec![Message::user().with_text("请读取 README 并总结。")];
    let anthropic_payload = anthropic::create_request(
        &ModelConfig::new("claude-sonnet-4-5").expect("Anthropic 测试模型应有效"),
        "system",
        &messages,
        &tools,
    )
    .expect("Anthropic payload 应可序列化");
    let openai_payload = openai::create_request(
        &model_config,
        "system",
        &messages,
        &tools,
        &ImageFormat::OpenAi,
        true,
    )
    .expect("OpenAI payload 应可序列化");
    let openai_responses_payload = create_responses_request(
        &ModelConfig::new("gpt-5-codex").expect("OpenAI Responses 测试模型应有效"),
        "system",
        &messages,
        &tools,
        &ResponsesRequestOptions::default(),
    )
    .expect("OpenAI Responses payload 应可序列化");
    let google_payload = google::create_request(
        &ModelConfig::new("gemini-2.5-pro").expect("Google 测试模型应有效"),
        "system",
        &messages,
        &tools,
    )
    .expect("Google payload 应可序列化");

    for provider_names in [
        anthropic_tool_names(&anthropic_payload),
        openai_tool_names(&openai_payload),
        openai_responses_tool_names(&openai_responses_payload),
        google_tool_names(&google_payload),
    ] {
        assert_eq!(provider_names, prepared_names);
        assert_compact_tool_names(&provider_names);
    }
}

#[tokio::test]
async fn compact_tool_surface_preserves_extension_prompt_context() {
    let agent = Agent::new();
    agent
        .add_extension(ExtensionConfig::Frontend {
            name: "latency_probe".to_string(),
            description: "延迟测试扩展".to_string(),
            tools: vec![Tool::new(
                "latency_probe__heavy_tool".to_string(),
                "Heavy tool that should not enter compact provider payload".to_string(),
                object!({ "type": "object", "properties": {} }),
            )],
            instructions: Some("EXTENSION_PROMPT_CONTEXT_SHOULD_STAY".to_string()),
            bundled: None,
            available_tools: vec![],
            deferred_loading: false,
            always_expose_tools: vec![],
            allowed_caller: None,
        })
        .await
        .expect("注册测试扩展失败");

    let (tools, system_prompt) = prepare_compact_tools_and_prompt(&agent).await;
    let names = tool_names(&tools);

    assert_compact_tool_names(&names);
    assert!(!names.iter().any(|name| name == "latency_probe__heavy_tool"));
    assert!(
        system_prompt.contains("EXTENSION_PROMPT_CONTEXT_SHOULD_STAY"),
        "compact 工具面只裁剪 provider tools schema，不应删除完整 extension prompt context"
    );
    assert!(
        !system_prompt.contains("【当前回合执行约束】"),
        "compact 工具面不应通过额外硬编码 prompt guidance 优化首字"
    );
}
