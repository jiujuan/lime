use super::support::*;
use super::*;
use app_server_protocol::KnowledgeCompilePackParams;

#[tokio::test]
async fn knowledge_compile_pack_runs_builder_runtime_executor_on_current_path() {
    let temp = tempfile::tempdir().expect("create temp dir");
    let working_dir = temp.path().to_string_lossy().to_string();
    lime_knowledge::import_knowledge_source(lime_knowledge::KnowledgeImportSourceRequest {
        working_dir: working_dir.clone(),
        pack_name: "runtime-founder".to_string(),
        description: Some("Runtime 创始人".to_string()),
        pack_type: Some("personal-ip".to_string()),
        language: Some("zh-CN".to_string()),
        source_file_name: Some("interview.md".to_string()),
        source_text: Some("她强调长期主义，也提醒不要夸大收入。".to_string()),
    })
    .expect("import source");

    let app_data_source = Arc::new(TestSessionDataSource::new(
        empty_agent_session_read_response("knowledge-builder-session"),
    ));
    let executor = Arc::new(TestKnowledgeBuilderRuntimeExecutor::new());
    let core = RuntimeCore::with_backend(Arc::new(MockBackend))
        .with_app_data_source(app_data_source.clone())
        .with_knowledge_builder_runtime_executor(executor.clone());

    let response = core
        .compile_knowledge_pack(KnowledgeCompilePackParams {
            working_dir: working_dir.clone(),
            name: "runtime-founder".to_string(),
            builder_runtime: Some(json!({
                "enabled": true,
                "providerOverride": "openai",
                "modelOverride": "gpt-4o",
                "sessionId": "builder-session-1"
            })),
        })
        .await
        .expect("compile knowledge pack");

    let calls = executor.calls();
    assert_eq!(calls.len(), 1);
    assert_eq!(calls[0].skill_name, "personal-ip-knowledge-builder");
    assert_eq!(calls[0].session_id, "builder-session-1");
    assert_eq!(calls[0].provider_override.as_deref(), Some("openai"));
    assert_eq!(calls[0].model_override.as_deref(), Some("gpt-4o"));

    let requests = app_data_source.knowledge_compile_requests();
    assert_eq!(requests.len(), 1);
    assert!(requests[0].builder_execution.is_some());
    assert!(response
        .warnings
        .iter()
        .any(|warning| warning.contains("代表案例待补充")));
    let produced_by = response
        .pack
        .pointer("/metadata/metadata/producedBy")
        .expect("producedBy metadata");
    assert_eq!(
        produced_by
            .pointer("/runtimeBinding/executed")
            .and_then(serde_json::Value::as_bool),
        Some(true)
    );
    assert_eq!(
        produced_by
            .pointer("/runtimeBinding/executionId")
            .and_then(serde_json::Value::as_str),
        requests[0]
            .builder_execution
            .as_ref()
            .map(|execution| execution.execution_id.as_str())
    );
}
