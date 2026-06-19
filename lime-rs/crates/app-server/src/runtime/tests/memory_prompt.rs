use super::support::*;
use super::*;
use crate::runtime::memory_prompt::MEMORY_PROMPT_CONTEXT_KEY;

fn read_response(content: &str, truncated: bool) -> MemoryStoreReadResponse {
    MemoryStoreReadResponse {
        path: "memory_summary.md".to_string(),
        start_line_number: 1,
        content: content.to_string(),
        truncated,
        citation: MemoryStoreCitation {
            path: "memory_summary.md".to_string(),
            start_line_number: 1,
            end_line_number: 1,
        },
    }
}

async fn start_memory_prompt_turn(
    data_source: Arc<TestSessionDataSource>,
    runtime_options: Option<RuntimeOptions>,
) -> Arc<RecordingBackend> {
    let backend = Arc::new(RecordingBackend::default());
    let core = RuntimeCore::with_backend(backend.clone()).with_app_data_source(data_source);
    let session = core
        .start_session(AgentSessionStartParams {
            session_id: Some("sess_memory_prompt".to_string()),
            thread_id: Some("thread_memory_prompt".to_string()),
            app_id: "content-studio".to_string(),
            workspace_id: Some("default".to_string()),
            business_object_ref: None,
            locale: None,
        })
        .expect("session")
        .session;

    core.start_turn(
        AgentSessionTurnStartParams {
            session_id: session.session_id,
            turn_id: Some("turn_memory_prompt".to_string()),
            input: AgentInput {
                text: "hello".to_string(),
                attachments: Vec::new(),
            },
            runtime_options,
            queue_if_busy: false,
            skip_pre_submit_resume: false,
        },
        RuntimeHostContext::default(),
    )
    .await
    .expect("turn");

    backend
}

#[tokio::test]
async fn start_turn_injects_workspace_memory_summary_context() {
    let data_source = Arc::new(
        TestSessionDataSource::new(empty_agent_session_read_response("missing"))
            .with_memory_store_read_response(Ok(read_response("Prefer concise answers.\n", false))),
    );
    let runtime_options = Some(RuntimeOptions {
        host_options: Some(json!({
            "asterChatRequest": {
                "turn_config": {
                    "workspaceRoot": "/tmp/workspace-memory"
                }
            }
        })),
        ..RuntimeOptions::default()
    });

    let backend = start_memory_prompt_turn(data_source.clone(), runtime_options).await;

    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    let metadata = requests[0]
        .runtime_options
        .as_ref()
        .and_then(|options| options.metadata.as_ref())
        .expect("runtime metadata");
    let context = metadata
        .get(MEMORY_PROMPT_CONTEXT_KEY)
        .expect("memory context");

    assert_eq!(context["scope"].as_str(), Some("workspace"));
    assert_eq!(
        context["workspaceRoot"].as_str(),
        Some("/tmp/workspace-memory")
    );
    assert_eq!(context["path"].as_str(), Some("memory_summary.md"));
    assert_eq!(context["content"].as_str(), Some("Prefer concise answers."));

    let read_requests = data_source.memory_store_read_requests();
    assert_eq!(read_requests.len(), 1);
    assert_eq!(read_requests[0].root.scope, MemoryStoreScope::Workspace);
    assert_eq!(
        read_requests[0].root.workspace_root.as_deref(),
        Some("/tmp/workspace-memory")
    );
    assert_eq!(read_requests[0].path, "memory_summary.md");
}

#[tokio::test]
async fn start_turn_skips_empty_memory_summary() {
    let data_source = Arc::new(
        TestSessionDataSource::new(empty_agent_session_read_response("missing"))
            .with_memory_store_read_response(Ok(read_response("   \n", false))),
    );

    let backend = start_memory_prompt_turn(data_source, None).await;

    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    let metadata = requests[0]
        .runtime_options
        .as_ref()
        .and_then(|options| options.metadata.as_ref());
    assert!(metadata
        .and_then(|metadata| metadata.get(MEMORY_PROMPT_CONTEXT_KEY))
        .is_none());
}

#[tokio::test]
async fn start_turn_does_not_block_when_memory_summary_read_fails() {
    let data_source = Arc::new(
        TestSessionDataSource::new(empty_agent_session_read_response("missing"))
            .with_memory_store_read_response(Err("memory unavailable".to_string())),
    );

    let backend = start_memory_prompt_turn(data_source.clone(), None).await;

    let requests = backend
        .requests
        .lock()
        .expect("test backend requests mutex poisoned");
    assert_eq!(requests.len(), 1);
    let metadata = requests[0]
        .runtime_options
        .as_ref()
        .and_then(|options| options.metadata.as_ref());
    assert!(metadata
        .and_then(|metadata| metadata.get(MEMORY_PROMPT_CONTEXT_KEY))
        .is_none());
    assert_eq!(data_source.memory_store_read_requests().len(), 1);
}
