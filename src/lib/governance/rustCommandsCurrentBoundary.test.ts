/* global process */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const RUST_COMMANDS_ROOT = "lime-rs/src/commands";

// 删除下列任一旧 stub 文件时，必须同步从这个集合移除，保持该集合只收缩不扩张。
const ALLOWED_DEPRECATED_COMMAND_STUB_FILES = new Set<string>([]);

const DEPRECATED_COMMAND_STUB_PATTERN =
  /DEPRECATED_[A-Z0-9_]*COMMAND|deprecated_[a-z0-9_]*command|fail-closed 退场面|旧 Tauri .*已退场|legacy Tauri command/iu;

const COMMAND_BOUNDARY_MARKER_PATTERNS = [
  /#\[\s*tauri::command\s*\]/gu,
  /\b(?:State|tauri::State)\s*</gu,
  /\b(?:AppHandle|Window|WebviewUrl|WebviewWindowBuilder)\b/gu,
  /\b(?:DbConnection|rusqlite|lock_db|crate::database|lime_core::database|database::dao)\b/gu,
  /\b(?:std::fs|tokio::fs|fs::(?:create_dir_all|write|read|read_to_string|remove_dir_all|remove_file|copy|read_dir|metadata)|File::)\b/gu,
  /\b(?:reqwest|TcpListener|tokio::net|std::process::Command|Command::new|open::that)\b|https?:\/\//gu,
  /\b(?:tokio::spawn|spawn\(|remove_dir_all|remove_file|create_dir_all|Command::new)\b/gu,
];

const COMMAND_BOUNDARY_MARKER_BUDGET_BY_FILE = new Map<string, number>([
  ["lime-rs/src/commands/agent_cmd.rs", 23],
  ["lime-rs/src/commands/aster_agent_cmd/action_runtime.rs", 33],
  ["lime-rs/src/commands/aster_agent_cmd/app_server_host.rs", 16],
  ["lime-rs/src/commands/aster_agent_cmd/command_api.rs", 18],
  [
    "lime-rs/src/commands/aster_agent_cmd/command_api/objective_continuation.rs",
    10,
  ],
  [
    "lime-rs/src/commands/aster_agent_cmd/command_api/objective_continuation_guard_audit.rs",
    3,
  ],
  [
    "lime-rs/src/commands/aster_agent_cmd/command_api/objective_continuation_tests.rs",
    3,
  ],
  ["lime-rs/src/commands/aster_agent_cmd/command_api/objective_support.rs", 8],
  ["lime-rs/src/commands/aster_agent_cmd/command_api/runtime_api.rs", 186],
  [
    "lime-rs/src/commands/aster_agent_cmd/command_api/thread_read_projection.rs",
    9,
  ],
  ["lime-rs/src/commands/aster_agent_cmd/dto.rs", 66],
  ["lime-rs/src/commands/aster_agent_cmd/image_skill_launch.rs", 4],
  ["lime-rs/src/commands/aster_agent_cmd/mcp_bridge.rs", 1],
  ["lime-rs/src/commands/aster_agent_cmd/mod.rs", 13],
  ["lime-rs/src/commands/aster_agent_cmd/provider_runtime_bootstrap.rs", 10],
  ["lime-rs/src/commands/aster_agent_cmd/provider_runtime_strategy.rs", 8],
  ["lime-rs/src/commands/aster_agent_cmd/reply_runtime.rs", 6],
  ["lime-rs/src/commands/aster_agent_cmd/request_model_resolution.rs", 10],
  [
    "lime-rs/src/commands/aster_agent_cmd/request_model_resolution/responsive_chat.rs",
    13,
  ],
  ["lime-rs/src/commands/aster_agent_cmd/request_model_resolution/tests.rs", 8],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_plugin_agents.rs", 15],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_project_hooks.rs", 100],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn.rs", 5],
  [
    "lime-rs/src/commands/aster_agent_cmd/runtime_turn/artifact_materialization/contract_artifact.rs",
    1,
  ],
  [
    "lime-rs/src/commands/aster_agent_cmd/runtime_turn/artifact_materialization/document_autopersist.rs",
    3,
  ],
  [
    "lime-rs/src/commands/aster_agent_cmd/runtime_turn/artifact_materialization/workspace_patch.rs",
    3,
  ],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/bootstrap.rs", 2],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/compaction.rs", 12],
  [
    "lime-rs/src/commands/aster_agent_cmd/runtime_turn/compaction/trigger.rs",
    1,
  ],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/compaction/usage.rs", 5],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/event_projection.rs", 2],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/flow/build.rs", 2],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/flow/execution.rs", 3],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/flow/ingress.rs", 4],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/flow/preparation.rs", 5],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/flow/prompt.rs", 1],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/memory.rs", 6],
  [
    "lime-rs/src/commands/aster_agent_cmd/runtime_turn/prompt_composition.rs",
    2,
  ],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/provider_config.rs", 1],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/request_metadata.rs", 1],
  [
    "lime-rs/src/commands/aster_agent_cmd/runtime_turn/request_resolution.rs",
    2,
  ],
  [
    "lime-rs/src/commands/aster_agent_cmd/runtime_turn/request_resolution_permission.rs",
    10,
  ],
  [
    "lime-rs/src/commands/aster_agent_cmd/runtime_turn/request_resolution_user_lock.rs",
    5,
  ],
  [
    "lime-rs/src/commands/aster_agent_cmd/runtime_turn/request_resolution_user_lock/recovery.rs",
    5,
  ],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/skill_launch.rs", 10],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/status.rs", 2],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/stream.rs", 2],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/stream/attempt.rs", 8],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/stream/events.rs", 2],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/stream/finalize.rs", 2],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/stream/strategy.rs", 2],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/tests.rs", 13],
  [
    "lime-rs/src/commands/aster_agent_cmd/runtime_turn/tests/compaction_metrics.rs",
    1,
  ],
  [
    "lime-rs/src/commands/aster_agent_cmd/runtime_turn/tests/image_policy.rs",
    4,
  ],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/tests/prompt.rs", 7],
  ["lime-rs/src/commands/aster_agent_cmd/runtime_turn/tests/routing.rs", 2],
  ["lime-rs/src/commands/aster_agent_cmd/service_skill_launch.rs", 1],
  ["lime-rs/src/commands/aster_agent_cmd/session_runtime.rs", 22],
  ["lime-rs/src/commands/aster_agent_cmd/subagent_runtime.rs", 25],
  ["lime-rs/src/commands/aster_agent_cmd/tests.rs", 58],
  ["lime-rs/src/commands/aster_agent_cmd/tool_runtime.rs", 6],
  ["lime-rs/src/commands/aster_agent_cmd/tool_runtime/browser_tools.rs", 9],
  [
    "lime-rs/src/commands/aster_agent_cmd/tool_runtime/connector_tools/cloud_overlay_outbox.rs",
    6,
  ],
  [
    "lime-rs/src/commands/aster_agent_cmd/tool_runtime/connector_tools/fixture_adapter.rs",
    3,
  ],
  [
    "lime-rs/src/commands/aster_agent_cmd/tool_runtime/connector_tools/readiness.rs",
    3,
  ],
  [
    "lime-rs/src/commands/aster_agent_cmd/tool_runtime/connector_tools/tests.rs",
    18,
  ],
  ["lime-rs/src/commands/aster_agent_cmd/tool_runtime/lime_cli_runtime.rs", 9],
  [
    "lime-rs/src/commands/aster_agent_cmd/tool_runtime/mcp_resource_tools.rs",
    4,
  ],
  ["lime-rs/src/commands/aster_agent_cmd/tool_runtime/media_cli_bridge.rs", 2],
  [
    "lime-rs/src/commands/aster_agent_cmd/tool_runtime/resource_search_tools.rs",
    3,
  ],
  [
    "lime-rs/src/commands/aster_agent_cmd/tool_runtime/service_skill_tools.rs",
    4,
  ],
  ["lime-rs/src/commands/aster_agent_cmd/tool_runtime/site_tools.rs", 14],
  ["lime-rs/src/commands/aster_agent_cmd/tool_runtime/social_tools.rs", 9],
  ["lime-rs/src/commands/aster_agent_cmd/tool_runtime/subagent_tools.rs", 6],
  ["lime-rs/src/commands/aster_agent_cmd/tool_runtime/workspace_tools.rs", 10],
  ["lime-rs/src/commands/auxiliary_model_selection.rs", 4],
  ["lime-rs/src/commands/browser_connector_cmd.rs", 24],
  ["lime-rs/src/commands/browser_environment_cmd.rs", 23],
  ["lime-rs/src/commands/browser_profile_cmd.rs", 26],
  ["lime-rs/src/commands/browser_runtime_cmd.rs", 48],
  ["lime-rs/src/commands/content_cmd.rs", 26],
  ["lime-rs/src/commands/execution_run_cmd.rs", 16],
  ["lime-rs/src/commands/gallery_material_cmd.rs", 27],
  ["lime-rs/src/commands/gateway_tunnel_cmd.rs", 40],
  ["lime-rs/src/commands/layered_design_cmd.rs", 41],
  ["lime-rs/src/commands/machine_id_cmd.rs", 27],
  ["lime-rs/src/commands/material_cmd.rs", 38],
  ["lime-rs/src/commands/memory_cmd.rs", 42],
  ["lime-rs/src/commands/memory_feedback_cmd.rs", 8],
  ["lime-rs/src/commands/memory_management_cmd.rs", 48],
  ["lime-rs/src/commands/memory_search_cmd.rs", 35],
  ["lime-rs/src/commands/modality_runtime_contracts.rs", 2],
  ["lime-rs/src/commands/model_registry_cmd.rs", 26],
  ["lime-rs/src/commands/security_perf_cmd.rs", 2],
  ["lime-rs/src/commands/session_files_cmd.rs", 28],
  ["lime-rs/src/commands/skill_cmd.rs", 228],
  ["lime-rs/src/commands/unified_memory_cmd.rs", 50],
  ["lime-rs/src/commands/video_generation_cmd.rs", 18],
  ["lime-rs/src/commands/voice_model_cmd.rs", 44],
  ["lime-rs/src/commands/webview_cmd.rs", 114],
  ["lime-rs/src/commands/workspace_cmd.rs", 45],
]);

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function expectStandaloneIdentifiersAbsent(
  source: string,
  identifiers: string[],
): void {
  for (const identifier of identifiers) {
    expect(source).not.toMatch(
      new RegExp(`(?<![A-Za-z0-9_])${identifier}(?![A-Za-z0-9_])`, "u"),
    );
  }
}

function collectRustCommandFiles(dir: string): string[] {
  const absoluteDir = join(REPO_ROOT, dir);
  if (!existsSync(absoluteDir)) {
    return [];
  }

  const result: string[] = [];
  for (const entry of readdirSync(absoluteDir)) {
    const absolutePath = join(absoluteDir, entry);
    const stats = statSync(absolutePath);
    const repoPath = `${dir}/${entry}`;

    if (stats.isDirectory()) {
      result.push(...collectRustCommandFiles(repoPath));
      continue;
    }

    if (repoPath.endsWith(".rs")) {
      result.push(repoPath);
    }
  }

  return result.sort();
}

function countCommandBoundaryMarkers(source: string): number {
  return COMMAND_BOUNDARY_MARKER_PATTERNS.reduce((total, pattern) => {
    const matches = source.match(pattern);
    return total + (matches?.length ?? 0);
  }, 0);
}

describe("rust commands current boundary", () => {
  it("Tauri runner 不应重新注册旧 in-process App Server JSON-RPC command", () => {
    const runnerSource = readRepoFile("lime-rs/src/app/runner.rs");
    const forbiddenRegistrations = [
      "commands::aster_agent_cmd::app_server_host::app_server_handle_json_lines",
      "commands::aster_agent_cmd::app_server_host::app_server_drain_events",
    ];

    for (const registration of forbiddenRegistrations) {
      expect(runnerSource).not.toContain(registration);
    }
    expect(runnerSource).not.toContain("app_server_handle_json_lines");
    expect(runnerSource).not.toContain("app_server_drain_events");
  });

  it("App Server host 不应重新暴露旧 Tauri in-process bridge command", () => {
    const hostSource = readRepoFile(
      "lime-rs/src/commands/aster_agent_cmd/app_server_host.rs",
    );
    const retiredInProcessSymbols = [
      "TAURI_APP_SERVER",
      "InProcessAppServerState",
      "in_process_app_server",
      "handle_in_process_app_server_json_lines",
      "AppServerRuntimeQueueEventPort",
      "with_direct_app_server_bridge",
      "direct_event_scopes",
      "append_lime_agent_event_to_app_server_bridge",
    ];

    for (const symbol of retiredInProcessSymbols) {
      expect(hostSource).not.toContain(symbol);
    }
    expect(hostSource).not.toMatch(
      /#\[tauri::command\]\s*(?:\n\s*)*pub\(crate\)\s+async\s+fn\s+app_server_handle_json_lines/u,
    );
    expect(hostSource).not.toMatch(
      /#\[tauri::command\]\s*(?:\n\s*)*pub\(crate\)\s+async\s+fn\s+app_server_drain_events/u,
    );
    expect(hostSource).not.toContain("struct AppServerHandleJsonLines");
    expect(hostSource).not.toContain("struct AppServerDrainEvents");
  });

  it("Agent App 旧 Tauri wrapper 文件不应恢复", () => {
    const commandsModSource = readRepoFile("lime-rs/src/commands/mod.rs");
    const deletedAgentAppWrappers = [
      "lime-rs/src/commands/agent_app_cmd.rs",
      "lime-rs/src/commands/agent_app_runtime_cmd.rs",
      "lime-rs/src/commands/agent_app_runtime_cmd",
    ];

    expect(commandsModSource).not.toContain("agent_app_cmd");
    expect(commandsModSource).not.toContain("agent_app_runtime_cmd");

    for (const deletedPath of deletedAgentAppWrappers) {
      expect(existsSync(join(REPO_ROOT, deletedPath))).toBe(false);
    }
  });

  it("MCP 旧 Tauri wrapper 文件不应恢复", () => {
    const commandsModSource = readRepoFile("lime-rs/src/commands/mod.rs");

    expect(commandsModSource).not.toContain("mcp_cmd");
    expect(existsSync(join(REPO_ROOT, "lime-rs/src/commands/mcp_cmd.rs"))).toBe(
      false,
    );
  });

  it("Media task artifact 旧 Tauri wrapper 和旧 creation tool runtime 不应恢复", () => {
    const commandsModSource = readRepoFile("lime-rs/src/commands/mod.rs");
    const toolRuntimeSource = readRepoFile(
      "lime-rs/src/commands/aster_agent_cmd/tool_runtime.rs",
    );
    const retiredMediaTaskFiles = [
      "lime-rs/src/commands/media_task_cmd.rs",
      "lime-rs/src/commands/aster_agent_cmd/tool_runtime/creation_tools.rs",
      "lime-rs/src/dev_bridge/dispatcher/media_tasks.rs",
    ];

    expect(commandsModSource).not.toContain("media_task_cmd");
    expect(readRepoFile("lime-rs/src/dev_bridge/dispatcher.rs")).not.toContain(
      "media_tasks",
    );
    expect(toolRuntimeSource).not.toContain("creation_tools");
    expect(toolRuntimeSource).not.toContain(
      "submit_image_generation_task_value",
    );
    expect(toolRuntimeSource).not.toContain(
      "ensure_creation_task_tools_registered",
    );

    for (const deletedPath of retiredMediaTaskFiles) {
      expect(existsSync(join(REPO_ROOT, deletedPath))).toBe(false);
    }
  });

  it("Channels/WeChat 旧 Tauri wrapper 文件不应恢复", () => {
    const commandsModSource = readRepoFile("lime-rs/src/commands/mod.rs");
    const retiredChannelWrappers = [
      "lime-rs/src/commands/gateway_channel_cmd.rs",
      "lime-rs/src/commands/wechat_channel_cmd.rs",
    ];

    expect(commandsModSource).not.toContain("gateway_channel_cmd");
    expect(commandsModSource).not.toContain("wechat_channel_cmd");
    for (const deletedPath of retiredChannelWrappers) {
      expect(existsSync(join(REPO_ROOT, deletedPath))).toBe(false);
    }
  });

  it("Model registry 旧 Rust DevBridge 读 facade 不应恢复", () => {
    const modelsDispatcherSource = readRepoFile(
      "lime-rs/src/dev_bridge/dispatcher/models.rs",
    );

    expect(modelsDispatcherSource).not.toContain('"get_models"');
    expect(modelsDispatcherSource).not.toContain(
      '"get_model_registry_provider_ids"',
    );
    expect(modelsDispatcherSource).not.toContain(
      "claude-sonnet-4-20250514",
    );
    expect(modelsDispatcherSource).toContain('"refresh_model_registry"');
  });

  it("Aster 旧自动压缩残留文件不应恢复", () => {
    const retiredAutoCompactionFiles = [
      "lime-rs/src/commands/aster_agent_cmd/runtime_auto_compaction.rs",
      "lime-rs/src/commands/aster_agent_cmd/runtime_turn/compaction/auto.rs",
    ];

    for (const deletedPath of retiredAutoCompactionFiles) {
      expect(existsSync(join(REPO_ROOT, deletedPath))).toBe(false);
    }
  });

  it("已退场的独立旧 Tauri wrapper 文件不应恢复", () => {
    const commandsModSource = readRepoFile("lime-rs/src/commands/mod.rs");
    const retiredWrapperModules = [
      "site_capability_cmd",
      "skill_exec_cmd",
      "windows_startup_cmd",
    ];
    const retiredWrapperFiles = retiredWrapperModules.map(
      (moduleName) => `lime-rs/src/commands/${moduleName}.rs`,
    );

    for (const moduleName of retiredWrapperModules) {
      expect(commandsModSource).not.toContain(moduleName);
    }
    for (const deletedPath of retiredWrapperFiles) {
      expect(existsSync(join(REPO_ROOT, deletedPath))).toBe(false);
    }
  });

  it("Agent Runtime residual 旧 Tauri wrapper 文件不应恢复", () => {
    const runnerSource = readRepoFile("lime-rs/src/app/runner.rs");
    const dispatcherSource = readRepoFile(
      "lime-rs/src/dev_bridge/dispatcher/agent_sessions.rs",
    );
    const devBridgeDispatcherSource = readRepoFile(
      "lime-rs/src/dev_bridge/dispatcher.rs",
    );
    const agentCommandSource = readRepoFile(
      "lime-rs/src/commands/agent_cmd.rs",
    );
    const commandApiSource = readRepoFile(
      "lime-rs/src/commands/aster_agent_cmd/command_api.rs",
    );
    const runtimeApiSource = readRepoFile(
      "lime-rs/src/commands/aster_agent_cmd/command_api/runtime_api.rs",
    );
    const actionRuntimeSource = readRepoFile(
      "lime-rs/src/commands/aster_agent_cmd/action_runtime.rs",
    );
    const asterAgentModSource = readRepoFile(
      "lime-rs/src/commands/aster_agent_cmd/mod.rs",
    );
    const retiredSessionCommands = [
      "agent_runtime_create_session",
      "agent_runtime_list_sessions",
      "agent_runtime_get_session",
      "agent_runtime_update_session",
      "agent_runtime_delete_session",
    ];
    const retiredSubagentCommands = [
      "agent_runtime_spawn_subagent",
      "agent_runtime_send_subagent_input",
      "agent_runtime_wait_subagents",
      "agent_runtime_resume_subagent",
      "agent_runtime_close_subagent",
    ];
    const retiredCompactObjectiveCommands = [
      "agent_runtime_compact_session",
      "agent_runtime_resume_thread",
      "agent_runtime_get_objective",
      "agent_runtime_set_objective",
      "agent_runtime_update_objective_status",
      "agent_runtime_clear_objective",
      "agent_runtime_continue_objective",
      "agent_runtime_audit_objective",
    ];
    const retiredProcessAsterCommands = [
      "agent_start_process",
      "agent_stop_process",
      "agent_get_process_status",
      "aster_agent_init",
      "aster_agent_status",
      "aster_agent_configure_provider",
      "aster_agent_reset",
    ];
    const deletedAgentRuntimeWrappers = [
      "lime-rs/src/commands/aster_agent_cmd/command_api/session_api.rs",
      "lime-rs/src/commands/aster_agent_cmd/command_api/subagent_api.rs",
      "lime-rs/src/commands/aster_agent_cmd/command_api/objective_api.rs",
      "lime-rs/src/commands/aster_agent_cmd/command_api/objective_audit.rs",
      "lime-rs/src/commands/aster_agent_cmd/command_api/provider_api.rs",
      "lime-rs/src/dev_bridge/dispatcher/agent_sessions/objective.rs",
      "lime-rs/src/dev_bridge/dispatcher/providers.rs",
    ];

    expect(commandApiSource).not.toContain("session_api");
    expect(commandApiSource).not.toContain("subagent_api");
    expect(commandApiSource).not.toContain("objective_api");
    expect(commandApiSource).not.toContain("objective_audit");
    expect(commandApiSource).not.toContain("provider_api");
    expect(devBridgeDispatcherSource).not.toContain("mod providers");

    expectStandaloneIdentifiersAbsent(runnerSource, [
      ...retiredSessionCommands,
      ...retiredSubagentCommands,
      ...retiredCompactObjectiveCommands,
      ...retiredProcessAsterCommands,
    ]);
    expectStandaloneIdentifiersAbsent(dispatcherSource, [
      ...retiredSessionCommands,
      ...retiredSubagentCommands,
      ...retiredCompactObjectiveCommands,
    ]);
    expectStandaloneIdentifiersAbsent(agentCommandSource, [
      ...retiredProcessAsterCommands,
    ]);
    expectStandaloneIdentifiersAbsent(commandApiSource, [
      ...retiredSessionCommands,
      ...retiredSubagentCommands,
      ...retiredCompactObjectiveCommands,
      ...retiredProcessAsterCommands,
    ]);
    expectStandaloneIdentifiersAbsent(asterAgentModSource, [
      ...retiredSessionCommands,
      ...retiredSubagentCommands,
      ...retiredCompactObjectiveCommands,
      ...retiredProcessAsterCommands,
    ]);
    expectStandaloneIdentifiersAbsent(runtimeApiSource, [
      "agent_runtime_get_session",
      "agent_runtime_compact_session",
      "agent_runtime_resume_thread",
    ]);
    expectStandaloneIdentifiersAbsent(actionRuntimeSource, [
      "agent_runtime_delete_session",
    ]);

    for (const deletedPath of deletedAgentRuntimeWrappers) {
      expect(existsSync(join(REPO_ROOT, deletedPath))).toBe(false);
    }
  });

  it("commands 目录不应继续新增 deprecated/fail-closed stub 文件", () => {
    const stubFiles = collectRustCommandFiles(RUST_COMMANDS_ROOT).filter(
      (path) => DEPRECATED_COMMAND_STUB_PATTERN.test(readRepoFile(path)),
    );
    const unexpectedStubFiles = stubFiles.filter(
      (path) => !ALLOWED_DEPRECATED_COMMAND_STUB_FILES.has(path),
    );

    expect(unexpectedStubFiles).toEqual([]);
  });

  it("commands 目录业务副作用标记只能减少，不能新增或搬家", () => {
    const filesWithBoundaryMarkers = collectRustCommandFiles(RUST_COMMANDS_ROOT)
      .map((path) => ({
        count: countCommandBoundaryMarkers(readRepoFile(path)),
        path,
      }))
      .filter(({ count }) => count > 0);

    const unexpectedFiles = filesWithBoundaryMarkers.filter(
      ({ path }) => !COMMAND_BOUNDARY_MARKER_BUDGET_BY_FILE.has(path),
    );
    const exceededBudgets = filesWithBoundaryMarkers
      .map(({ count, path }) => ({
        budget: COMMAND_BOUNDARY_MARKER_BUDGET_BY_FILE.get(path) ?? 0,
        count,
        path,
      }))
      .filter(({ budget, count }) => count > budget);

    expect(unexpectedFiles).toEqual([]);
    expect(exceededBudgets).toEqual([]);
  });
});
