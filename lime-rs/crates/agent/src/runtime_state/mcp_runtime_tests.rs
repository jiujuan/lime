use crate::AgentRuntimeState;
use lime_mcp::{
    ElicitationRequestRouter, McpRuntimeServerSpec, McpServerConfig, McpServerTransport,
};
use std::collections::HashMap;
use std::process::Command;
use std::sync::Arc;

fn stdio_server_spec(
    name: &str,
    command: String,
    args: Vec<String>,
    required: bool,
) -> McpRuntimeServerSpec {
    McpRuntimeServerSpec {
        name: name.to_string(),
        config: McpServerConfig {
            transport: McpServerTransport::Stdio {
                command,
                args,
                env: HashMap::new(),
                cwd: None,
            },
            enabled: true,
            required,
            ..McpServerConfig::default()
        },
    }
}

fn node_binary() -> Option<String> {
    let mut candidates = std::env::var("NODE")
        .ok()
        .into_iter()
        .chain(["node".to_string()]);
    candidates.find(|candidate| {
        Command::new(candidate)
            .arg("--version")
            .output()
            .is_ok_and(|output| output.status.success())
    })
}

#[tokio::test]
async fn session_owned_mcp_runtimes_are_thread_exact_and_close_independently() {
    let state = AgentRuntimeState::new();
    let router = ElicitationRequestRouter::default();
    let runtime_a = state
        .ensure_mcp_runtime_generation(
            "session-a".to_string(),
            "thread-a".to_string(),
            router.clone(),
            Vec::new(),
        )
        .await
        .expect("create session A runtime");
    let runtime_b = state
        .ensure_mcp_runtime_generation(
            "session-b".to_string(),
            "thread-b".to_string(),
            router,
            Vec::new(),
        )
        .await
        .expect("create session B runtime");

    assert!(!Arc::ptr_eq(&runtime_a, &runtime_b));
    assert_eq!(state.mcp_runtime_count().await, 2);
    assert!(state.mcp_runtime("session-a", "thread-b").await.is_err());

    state.close_mcp_runtime("session-a", "thread-a").await;
    assert_eq!(state.mcp_runtime_count().await, 1);
    assert!(state.mcp_runtime("session-a", "thread-a").await.is_err());
    assert!(Arc::ptr_eq(
        &runtime_b,
        &state
            .mcp_runtime("session-b", "thread-b")
            .await
            .expect("session B runtime remains"),
    ));
}

#[tokio::test]
async fn unchanged_server_specs_reuse_the_session_generation() {
    let state = AgentRuntimeState::new();
    let router = ElicitationRequestRouter::default();
    let first = state
        .ensure_mcp_runtime_generation(
            "session-a".to_string(),
            "thread-a".to_string(),
            router.clone(),
            Vec::new(),
        )
        .await
        .expect("first generation");
    let second = state
        .ensure_mcp_runtime_generation(
            "session-a".to_string(),
            "thread-a".to_string(),
            router,
            Vec::new(),
        )
        .await
        .expect("same generation");

    assert!(Arc::ptr_eq(&first, &second));
}

#[tokio::test]
async fn concurrent_unchanged_runtime_ensures_publish_one_generation() {
    let state = AgentRuntimeState::new();
    let first_state = state.clone();
    let first = tokio::spawn(async move {
        first_state
            .ensure_mcp_runtime_generation(
                "session-a".to_string(),
                "thread-a".to_string(),
                ElicitationRequestRouter::default(),
                Vec::new(),
            )
            .await
    });
    let second_state = state.clone();
    let second = tokio::spawn(async move {
        second_state
            .ensure_mcp_runtime_generation(
                "session-a".to_string(),
                "thread-a".to_string(),
                ElicitationRequestRouter::default(),
                Vec::new(),
            )
            .await
    });

    let first = first
        .await
        .expect("first ensure task")
        .expect("first generation");
    let second = second
        .await
        .expect("second ensure task")
        .expect("second generation");

    assert!(Arc::ptr_eq(&first, &second));
    assert_eq!(state.mcp_runtime_count().await, 1);
}

#[tokio::test]
async fn failed_runtime_server_does_not_block_healthy_server_generation() {
    let Some(node) = node_binary() else {
        return;
    };
    let temp_dir = tempfile::tempdir().expect("create runtime MCP fixture directory");
    let server_path = temp_dir.path().join("healthy-mcp-server.mjs");
    std::fs::write(
        &server_path,
        r#"
import readline from "node:readline";

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");

lines.on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "healthy-runtime-fixture", version: "1.0.0" },
      },
    });
    return;
  }
  if (message.method === "notifications/initialized") return;
  if (message.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        tools: [{
          name: "healthy_tool",
          description: "healthy runtime MCP fixture",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        }],
      },
    });
  }
});
"#,
    )
    .expect("write healthy runtime MCP fixture");

    let state = AgentRuntimeState::new();
    let runtime = state
        .ensure_mcp_runtime_generation(
            "session-a".to_string(),
            "thread-a".to_string(),
            ElicitationRequestRouter::default(),
            vec![
                stdio_server_spec(
                    "broken",
                    "/definitely/not/a/runtime-mcp-server".to_string(),
                    Vec::new(),
                    false,
                ),
                stdio_server_spec(
                    "healthy",
                    node,
                    vec![server_path.to_string_lossy().into_owned()],
                    false,
                ),
            ],
        )
        .await
        .expect("healthy MCP server must publish despite a failed sibling");

    assert_eq!(runtime.connections().names().await, vec!["mcp__healthy"]);
    assert!(Arc::ptr_eq(
        &runtime,
        &state
            .mcp_runtime("session-a", "thread-a")
            .await
            .expect("published runtime generation"),
    ));
    state.clear_mcp_runtimes().await;
}

#[tokio::test]
async fn required_runtime_server_failure_keeps_the_previous_generation_published() {
    let state = AgentRuntimeState::new();
    let previous = state
        .ensure_mcp_runtime_generation(
            "session-a".to_string(),
            "thread-a".to_string(),
            ElicitationRequestRouter::default(),
            Vec::new(),
        )
        .await
        .expect("publish initial runtime generation");

    let result = state
        .ensure_mcp_runtime_generation(
            "session-a".to_string(),
            "thread-a".to_string(),
            ElicitationRequestRouter::default(),
            vec![stdio_server_spec(
                "required-broken",
                "/definitely/not/a/required-runtime-mcp-server".to_string(),
                Vec::new(),
                true,
            )],
        )
        .await;
    assert!(
        result.is_err(),
        "a required MCP failure must reject replacement generation"
    );
    let error = result.err().expect("required MCP failure");

    assert!(error.contains("required-broken"));
    assert!(Arc::ptr_eq(
        &previous,
        &state
            .mcp_runtime("session-a", "thread-a")
            .await
            .expect("previous generation remains published"),
    ));
    state.clear_mcp_runtimes().await;
}
