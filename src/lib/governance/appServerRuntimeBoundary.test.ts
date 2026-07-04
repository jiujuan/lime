/* global process */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const APP_SERVER_SRC_DIR = join(REPO_ROOT, "lime-rs/crates/app-server/src");
const LOCAL_DATA_SOURCE_SKILLS_DIR = join(
  REPO_ROOT,
  "lime-rs/crates/app-server/src/local_data_source/skills",
);
const RUNTIME_BACKEND_REQUEST_CONTEXT_MAIN =
  "lime-rs/crates/app-server/src/runtime_backend/request_context.rs";
const RUNTIME_BACKEND_REQUEST_CONTEXT_SPLIT_MODULES = [
  "lime-rs/crates/app-server/src/runtime_backend/request_context/session_config.rs",
  "lime-rs/crates/app-server/src/runtime_backend/request_context/turn_context.rs",
  "lime-rs/crates/app-server/src/runtime_backend/request_context/workspace_scope.rs",
];
const AGENT_PROVIDER_CONFIGURATION_BOUNDARY =
  "lime-rs/crates/agent/src/provider_configuration.rs";
const AGENT_SESSION_CONFIGURATION_BOUNDARY =
  "lime-rs/crates/agent/src/session_configuration.rs";
const AGENT_TURN_CONTEXT_CONFIGURATION_BOUNDARY =
  "lime-rs/crates/agent/src/turn_context_configuration.rs";
const RUNTIME_BOUNDARY_ROADMAP =
  "internal/roadmap/appserver/app-server-aster-runtime-boundary-governance.md";
const EXTERNAL_BACKEND_SCAN_DIRS = [
  "electron",
  "packages/app-server-client",
  "scripts",
  "lime-rs/crates/app-server/src",
  "lime-rs/crates/app-server-daemon/src",
];

const ALLOWED_ASTER_COUPLING_OWNER_FILES = new Set([
  "lime-rs/crates/app-server/src/agent_runtime_registry.rs",
  "lime-rs/crates/app-server/src/runtime_backend.rs",
  "lime-rs/crates/app-server/src/runtime_backend/action_response.rs",
  "lime-rs/crates/app-server/src/runtime_backend/image_tools.rs",
  "lime-rs/crates/app-server/src/runtime_backend/live_execution_process.rs",
  "lime-rs/crates/app-server/src/runtime_backend/mcp_bridges.rs",
  "lime-rs/crates/app-server/src/runtime_backend/memory_tools.rs",
  "lime-rs/crates/app-server/src/runtime_backend/native_tools.rs",
  "lime-rs/crates/app-server/src/runtime_backend/plugin_worker_generation.rs",
  "lime-rs/crates/app-server/src/runtime_backend/provider_config.rs",
  "lime-rs/crates/app-server/src/runtime_backend/tool_inventory.rs",
]);

const KNOWN_OUT_OF_BOUND_ASTER_COUPLING_FILES = new Set<string>();

const KNOWN_OUT_OF_BOUND_ASTER_EXECUTION_FILES = new Set<string>();

const ASTER_COUPLING_SNIPPETS = [
  "use aster::",
  "aster::",
  "AsterAgentState",
  "initialize_aster_runtime(",
];

const ASTER_EXECUTION_SNIPPETS = [
  "stream_reply_with_policy(",
  ".configure_provider(",
  "configure_provider_from_pool(",
  "provider_config_from_pool(",
];

const ASTER_PROVIDER_CONFIGURATION_SNIPPETS = [
  ".configure_provider(",
  "configure_provider_from_pool(",
  "provider_config_from_pool(",
  "provider_config_with_route_protocol(",
  "AsterProviderProtocol",
  "RuntimeProviderProtocol",
  "aster_provider_protocol_from_route",
  "runtime_provider_protocol_from_route",
  "route_protocol_from_aster_protocol",
  "route_protocol_from_runtime_protocol",
];

const ASTER_SKILL_EXECUTION_SNIPPETS = [
  "execute_skill_prompt(",
  "execute_skill_workflow(",
  "SkillPromptExecution",
  "SkillWorkflowExecution",
];

const EXTERNAL_BACKEND_LAUNCH_SNIPPETS = [
  'APP_SERVER_BACKEND_MODE: "external"',
  "APP_SERVER_BACKEND_MODE: 'external'",
  'backendMode: "external"',
  "backendMode: 'external'",
  '"--backend", "external"',
  "'--backend', 'external'",
  "--backend external",
];

const ALLOWED_EXTERNAL_BACKEND_LAUNCH_FILES = new Set([
  "lime-rs/crates/app-server/src/main.rs",
  "lime-rs/crates/app-server-daemon/src/lib.rs",
  "packages/app-server-client/tests/client.test.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-smoke.mjs",
  "scripts/agent-runtime/claw-chat-current-fixture-smoke.test.mjs",
  "scripts/app-server/external-backend-smoke.mjs",
  "scripts/app-server/packaged-external-backend-failure-smoke.mjs",
  "scripts/check-app-server-client-contract.mjs",
  "scripts/check-command-contracts.mjs",
  "scripts/electron/codex-import-click-through-fixture-smoke.mjs",
  "scripts/electron/codex-import-click-through-fixture-smoke.test.mjs",
  "scripts/electron/codex-import-continuation-fixture-smoke.mjs",
  "scripts/electron/codex-import-continuation-fixture-smoke.test.mjs",
  "scripts/electron/code-artifact-workbench-fixture-smoke.mjs",
  "scripts/electron/code-artifact-workbench-fixture-smoke.test.mjs",
  "scripts/electron/local-history-import-real-sample-visual-audit-smoke.test.mjs",
  "scripts/electron/session-history-fixture-smoke.test.mjs",
  "scripts/lib/electron-dev-sidecar.mjs",
  "scripts/lib/electron-dev-sidecar.test.mjs",
  "scripts/plugin/runtime-electron-fixture-smoke.mjs",
  "scripts/plugin/runtime-electron-fixture-smoke.test.mjs",
  "scripts/plugin/runtime-electron-sdk-fixture-smoke.mjs",
  "scripts/plugin/runtime-electron-sdk-fixture-smoke.test.mjs",
  "scripts/plugin/runtime-electron-task-fixture-smoke.mjs",
  "scripts/plugin/runtime-electron-task-fixture-smoke.test.mjs",
  "scripts/plugin/runtime-sdk-electron-fixture-smoke.mjs",
  "scripts/smoke/agent-session-messages-electron-fixture-smoke.mjs",
  "scripts/smoke/agent-session-messages-electron-fixture-smoke.test.mjs",
]);

const KNOWN_OUT_OF_BOUND_ASTER_BASELINE: Array<{
  path: string;
  snippets: Record<string, number>;
}> = [];

function collectRustFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === "target") {
        continue;
      }
      files.push(...collectRustFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith(".rs")) {
      files.push(fullPath);
    }
  }
  return files;
}

function collectTextFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (
        entry === "target" ||
        entry === "node_modules" ||
        entry === "dist" ||
        entry === "dist-electron"
      ) {
        continue;
      }
      files.push(...collectTextFiles(fullPath));
      continue;
    }
    if (/\.(?:cjs|js|mjs|rs|ts|tsx)$/u.test(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function repoRelative(path: string): string {
  return relative(REPO_ROOT, path).replace(/\\/g, "/");
}

function productionSource(path: string): string {
  const relativePath = repoRelative(path);
  if (relativePath.includes("/tests/") || relativePath.endsWith("/tests.rs")) {
    return "";
  }
  const source = readFileSync(path, "utf8");
  const testIndex = source.indexOf("#[cfg(test)]");
  return testIndex >= 0 ? source.slice(0, testIndex) : source;
}

function countSnippet(source: string, snippet: string): number {
  return source.split(snippet).length - 1;
}

describe("app-server runtime boundary", () => {
  it("App Server 生产代码不应新增未登记的 Aster 直接耦合", () => {
    const unregistered = collectRustFiles(APP_SERVER_SRC_DIR)
      .map((file) => ({
        path: repoRelative(file),
        source: productionSource(file),
      }))
      .filter(({ source }) =>
        ASTER_COUPLING_SNIPPETS.some((snippet) => source.includes(snippet)),
      )
      .filter(
        ({ path }) =>
          !ALLOWED_ASTER_COUPLING_OWNER_FILES.has(path) &&
          !KNOWN_OUT_OF_BOUND_ASTER_COUPLING_FILES.has(path),
      )
      .map(({ path }) => path);

    expect(
      unregistered,
      "新增 Aster 直接耦合前必须先迁到 lime-agent / runtime-core / 已登记 runtime_backend 子边界；已知越界文件只能减少，不能增加",
    ).toEqual([]);
  });

  it("已登记的 App Server 顶层 Aster 越界白名单只能减少，不能增长", () => {
    const increases = KNOWN_OUT_OF_BOUND_ASTER_BASELINE.flatMap(
      ({ path, snippets }) => {
        const fullPath = join(REPO_ROOT, path);
        const source = existsSync(fullPath) ? productionSource(fullPath) : "";

        return Object.entries(snippets)
          .map(([snippet, baseline]) => ({
            path,
            snippet,
            baseline,
            actual: countSnippet(source, snippet),
          }))
          .filter(({ actual, baseline }) => actual > baseline);
      },
    );

    expect(
      increases,
      "已知越界面是迁移负债，不是扩展许可；新增 Aster 状态、provider 配置或 Skill 执行调用前必须先迁到 runtime backend / lime-agent / runtime-core",
    ).toEqual([]);
  });

  it("App Server 顶层 Aster 越界白名单必须登记到治理路线图", () => {
    const roadmap = readFileSync(
      join(REPO_ROOT, RUNTIME_BOUNDARY_ROADMAP),
      "utf8",
    );
    const missing = [
      ...KNOWN_OUT_OF_BOUND_ASTER_COUPLING_FILES,
      ...KNOWN_OUT_OF_BOUND_ASTER_EXECUTION_FILES,
    ].filter((path) => !roadmap.includes(path));

    expect(
      missing,
      "新增 App Server 顶层 Aster 越界白名单时，必须同步登记原因、分类和退出条件",
    ).toEqual([]);
  });

  it("LocalAppDataSource skills 层不应直接触碰 Aster 状态或 reload API", () => {
    const forbiddenSnippets = [
      "AsterAgentState",
      "lime_agent::reload_lime_skills",
      "reload_lime_skills(",
    ];
    const offenders = collectRustFiles(LOCAL_DATA_SOURCE_SKILLS_DIR)
      .map((file) => ({
        path: repoRelative(file),
        source: productionSource(file),
      }))
      .filter(({ source }) =>
        forbiddenSnippets.some((snippet) => source.includes(snippet)),
      )
      .map(({ path }) => path);

    expect(
      offenders,
      "LocalAppDataSource skills 层只能通知 App Server skill_registry 边界，不得直接触碰 Aster 状态或 lime_agent reload API",
    ).toEqual([]);
  });

  it("App Server 只能通过 agent runtime registry 初始化 Aster runtime", () => {
    const offenders = collectRustFiles(APP_SERVER_SRC_DIR)
      .map((file) => ({
        path: repoRelative(file),
        source: productionSource(file),
      }))
      .filter(({ source }) => source.includes("initialize_aster_runtime("))
      .map(({ path }) => path)
      .filter(
        (path) =>
          path !== "lime-rs/crates/app-server/src/agent_runtime_registry.rs",
      );

    expect(
      offenders,
      "Aster runtime 初始化只能停留在 App Server agent_runtime_registry 边界；数据源、processor 或 runtime backend 不得重新 direct import lime_agent::initialize_aster_runtime",
    ).toEqual([]);
  });

  it("App Server 不应新增 runtime_backend 之外的 Aster 回合执行链", () => {
    const unregistered = collectRustFiles(APP_SERVER_SRC_DIR)
      .map((file) => ({
        path: repoRelative(file),
        source: productionSource(file),
      }))
      .filter(({ source }) =>
        ASTER_EXECUTION_SNIPPETS.some((snippet) => source.includes(snippet)),
      )
      .filter(
        ({ path }) =>
          path !== "lime-rs/crates/app-server/src/runtime_backend.rs" &&
          !path.startsWith("lime-rs/crates/app-server/src/runtime_backend/") &&
          !KNOWN_OUT_OF_BOUND_ASTER_EXECUTION_FILES.has(path),
      )
      .map(({ path }) => path);

    expect(
      unregistered,
      "App Server 不应在 runtime_backend 之外继续复制 Aster provider 配置或 stream_reply 执行流；新增同类执行面必须先迁入 runtime backend / lime-agent / runtime-core",
    ).toEqual([]);
  });

  it("App Server provider adapter 不应直接配置 Aster provider", () => {
    const offenders = collectRustFiles(APP_SERVER_SRC_DIR)
      .map((file) => ({
        path: repoRelative(file),
        source: productionSource(file),
      }))
      .flatMap(({ path, source }) =>
        ASTER_PROVIDER_CONFIGURATION_SNIPPETS.filter((snippet) =>
          source.includes(snippet),
        ).map((snippet) => ({ path, snippet })),
      );
    const agentBoundary = readFileSync(
      join(REPO_ROOT, AGENT_PROVIDER_CONFIGURATION_BOUNDARY),
      "utf8",
    );
    const appServerProviderAdapter = productionSource(
      join(
        REPO_ROOT,
        "lime-rs/crates/app-server/src/runtime_backend/provider_config.rs",
      ),
    );

    expect(agentBoundary).toContain(".configure_provider(");
    expect(agentBoundary).toContain("configure_provider_from_pool(");
    expect(agentBoundary).toContain("RuntimeProviderProtocol");
    expect(agentBoundary).toContain("ModelProviderProtocol");
    expect(agentBoundary).toContain("ProtocolKind");
    expect(agentBoundary).toContain("route_protocol_from_provider_config");
    expect(agentBoundary).toContain("RuntimeProviderProtocol::Responses");
    expect(agentBoundary).toContain("ModelProviderProtocol::Responses");
    expect(agentBoundary).toContain("ProtocolKind::OpenaiResponses");
    expect(appServerProviderAdapter).toContain("configure_provider_for_session");
    expect(appServerProviderAdapter).toContain("ProviderConfigurationRequest");
    expect(appServerProviderAdapter).toContain(
      "route_protocol: Some(route_protocol.clone())",
    );
    expect(
      offenders,
      "runtime provider 配置与 provider protocol 映射属于 lime-agent provider_configuration 边界；App Server 只能传 route ProtocolKind 并做 façade 接线",
    ).toEqual([]);
  });

  it("App Server 不应直接复制 Aster Skill prompt/workflow 执行器", () => {
    const offenders = collectRustFiles(APP_SERVER_SRC_DIR)
      .map((file) => ({
        path: repoRelative(file),
        source: productionSource(file),
      }))
      .filter(({ source }) =>
        ASTER_SKILL_EXECUTION_SNIPPETS.some((snippet) =>
          source.includes(snippet),
        ),
      )
      .map(({ path }) => path);

    expect(
      offenders,
      "Knowledge / Skill 执行应下沉到 lime-agent 或统一 Skill runtime；App Server 只能做 JSON-RPC / RuntimeCore 投影和受控 backend adapter",
    ).toEqual([]);
  });

  it("Knowledge Builder App Server adapter 不应直接持有 Aster 状态", () => {
    const adapter = readFileSync(
      join(
        REPO_ROOT,
        "lime-rs/crates/app-server/src/runtime_backend/knowledge_builder_runtime.rs",
      ),
      "utf8",
    );

    expect(adapter).toContain("KnowledgeBuilderSkillRunner");
    expect(adapter).not.toContain("AsterAgentState");
    expect(adapter).not.toContain("run_knowledge_builder_skill");
  });

  it("runtime_backend 主文件不应重新承接 action response 或事件 mapper 细节", () => {
    const runtimeBackend = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/app-server/src/runtime_backend.rs"),
      "utf8",
    );

    expect(runtimeBackend).toContain("mod action_response;");
    expect(runtimeBackend).toContain("mod event_mapper;");
    expect(runtimeBackend).not.toContain("confirm_tool_action(");
    expect(runtimeBackend).not.toContain("submit_elicitation_response(");
    expect(runtimeBackend).not.toContain(
      "fn emit_runtime_agent_event_with_coding_mirror",
    );
    expect(runtimeBackend).not.toContain("fn emit_reasoning_finish");
    expect(runtimeBackend).not.toContain("fn emit_proposed_plan_parser_flush");
    expect(runtimeBackend).not.toContain(
      "WorkspacePatchHostToolPlan::from_events",
    );
    expect(runtimeBackend).not.toContain("execute_planned_tool_batch(");
    expect(runtimeBackend).not.toContain("ToolExecutionBatchInput");
  });

  it("runtime_backend request_context 主文件必须保持职责拆分", () => {
    const requestContext = readFileSync(
      join(REPO_ROOT, RUNTIME_BACKEND_REQUEST_CONTEXT_MAIN),
      "utf8",
    );
    const lineCount = requestContext.split(/\r?\n/u).length;
    const missingModules = RUNTIME_BACKEND_REQUEST_CONTEXT_SPLIT_MODULES.filter(
      (path) => !existsSync(join(REPO_ROOT, path)),
    );
    const returnedResponsibilities = [
      "fn session_config_from_request(",
      "fn turn_context_from_request(",
      "fn request_workspace_scope(",
      "fn request_system_prompt(",
      "fn w3c_trace_context_metadata_from_request(",
    ].filter((snippet) => requestContext.includes(snippet));

    expect(lineCount, "request_context.rs 超过 800 行前必须继续拆子模块").toBeLessThanOrEqual(
      800,
    );
    expect(missingModules, "request_context.rs 的职责拆分模块不得被折回主文件").toEqual([]);
    expect(
      returnedResponsibilities,
      "SessionConfig / TurnContext / workspace scope 逻辑不得回流到 request_context.rs 主文件",
    ).toEqual([]);
  });

  it("App Server 主 turn 执行不应直接调用 Aster streaming loop", () => {
    const runtimeBackend = productionSource(
      join(REPO_ROOT, "lime-rs/crates/app-server/src/runtime_backend.rs"),
    );
    const agentTurnExecution = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/agent/src/turn_execution.rs"),
      "utf8",
    );

    expect(runtimeBackend).toContain("run_agent_turn_with_policy");
    expect(runtimeBackend).toContain("AgentTurnExecutionRequest");
    expect(runtimeBackend).not.toContain("stream_reply_with_policy(");
    expect(runtimeBackend).not.toContain("create_cancel_token(");
    expect(runtimeBackend).not.toContain("remove_cancel_token(");
    expect(agentTurnExecution).toContain("stream_reply_with_policy(");
    expect(agentTurnExecution).toContain("create_cancel_token(");
    expect(agentTurnExecution).toContain("remove_cancel_token(");
  });

  it("App Server 不应直接构造 Aster SessionConfig", () => {
    const offenders = collectRustFiles(APP_SERVER_SRC_DIR)
      .map((file) => ({
        path: repoRelative(file),
        source: productionSource(file),
      }))
      .flatMap(({ path, source }) =>
        ["SessionConfigBuilder", "aster::agents::SessionConfig"]
          .filter((snippet) => source.includes(snippet))
          .map((snippet) => ({ path, snippet })),
      );
    const agentBoundary = readFileSync(
      join(REPO_ROOT, AGENT_SESSION_CONFIGURATION_BOUNDARY),
      "utf8",
    );
    const appServerAdapter = productionSource(
      join(
        REPO_ROOT,
        "lime-rs/crates/app-server/src/runtime_backend/request_context/session_config.rs",
      ),
    );

    expect(agentBoundary).toContain("SessionConfigBuilder");
    expect(agentBoundary).toContain("aster::agents::SessionConfig");
    expect(appServerAdapter).toContain("build_agent_session_config");
    expect(appServerAdapter).toContain("AgentSessionConfigurationRequest");
    expect(
      offenders,
      "Aster SessionConfig 构造属于 lime-agent session_configuration 边界；App Server request_context 只能准备 prompt / turn_context 投影并调用 façade",
    ).toEqual([]);
  });

  it("App Server 不应直接引用 Aster TurnContext 类型", () => {
    const forbiddenSnippets = ["TurnContextOverride", "TurnOutputSchemaSource"];
    const offenders = collectRustFiles(APP_SERVER_SRC_DIR)
      .map((file) => ({
        path: repoRelative(file),
        source: productionSource(file),
      }))
      .flatMap(({ path, source }) =>
        forbiddenSnippets
          .filter((snippet) => source.includes(snippet))
          .map((snippet) => ({ path, snippet })),
      );
    const agentBoundary = readFileSync(
      join(REPO_ROOT, AGENT_TURN_CONTEXT_CONFIGURATION_BOUNDARY),
      "utf8",
    );
    const appServerAdapter = productionSource(
      join(
        REPO_ROOT,
        "lime-rs/crates/app-server/src/runtime_backend/request_context/turn_context.rs",
      ),
    );
    const imagePresentationAdapter = productionSource(
      join(
        REPO_ROOT,
        "lime-rs/crates/app-server/src/runtime_backend/image_command/presentation.rs",
      ),
    );

    expect(agentBoundary).toContain("TurnContextOverride");
    expect(agentBoundary).toContain("TurnOutputSchemaSource");
    expect(appServerAdapter).toContain("build_agent_turn_context");
    expect(appServerAdapter).toContain("AgentTurnContextConfigurationRequest");
    expect(imagePresentationAdapter).toContain("set_agent_turn_output_schema");
    expect(
      offenders,
      "Aster TurnContextOverride / TurnOutputSchemaSource 属于 lime-agent turn_context_configuration 边界；App Server 只能准备投影数据并调用 façade",
    ).toEqual([]);
  });

  it("workspace patch host tool plan 和 evidence 语义应下沉到 lime-agent", () => {
    const appServerAdapter = productionSource(
      join(
        REPO_ROOT,
        "lime-rs/crates/app-server/src/runtime_backend/workspace_patch_host_tools.rs",
      ),
    );
    const agentBoundary = readFileSync(
      join(
        REPO_ROOT,
        "lime-rs/crates/agent/src/agent_tools/workspace_patch_host.rs",
      ),
      "utf8",
    );

    expect(agentBoundary).toContain("WorkspacePatchHostToolPlan");
    expect(agentBoundary).toContain("hostToolRequests");
    expect(agentBoundary).toContain("searchRequests");
    expect(agentBoundary).toContain(
      "update_workspace_patch_with_host_tool_evidence",
    );
    expect(agentBoundary).toContain("execute_workspace_patch_host_tool_plan");
    expect(agentBoundary).toContain("execute_planned_tool_batch");
    expect(appServerAdapter).toContain("WorkspacePatchHostToolPlan::from_patch");
    expect(appServerAdapter).toContain(
      "update_workspace_patch_with_host_tool_evidence",
    );
    expect(appServerAdapter).not.toContain("ToolExecutionOutcome");
    expect(appServerAdapter).not.toContain("hostToolRequests");
    expect(appServerAdapter).not.toContain("searchRequests");
    expect(appServerAdapter).not.toContain("hostToolEvidence");

    const executionAdapter = productionSource(
      join(
        REPO_ROOT,
        "lime-rs/crates/app-server/src/runtime_backend/workspace_patch_host_execution.rs",
      ),
    );
    expect(executionAdapter).toContain("execute_workspace_patch_host_tool_plan");
    expect(executionAdapter).not.toContain("host_tool_plan.planned_tools()");
    expect(executionAdapter).not.toContain("execute_planned_tool_batch");
    expect(executionAdapter).not.toContain("tool_registry()");
    expect(executionAdapter).not.toContain("PlannedToolExecution {");
  });

  it("App Server 受控文本生成 adapter 不应重新复制 Aster streaming loop", () => {
    const pluginWorkerAdapter = {
      path: "lime-rs/crates/app-server/src/runtime_backend/plugin_worker_generation.rs",
      source: readFileSync(
        join(
          REPO_ROOT,
          "lime-rs/crates/app-server/src/runtime_backend/plugin_worker_generation.rs",
        ),
        "utf8",
      ),
    };
    const imagePresentationAdapter = {
      path: "lime-rs/crates/app-server/src/runtime_backend/image_command/presentation.rs",
      source: readFileSync(
        join(
          REPO_ROOT,
          "lime-rs/crates/app-server/src/runtime_backend/image_command/presentation.rs",
        ),
        "utf8",
      ),
    };
    const agentHostManagedGeneration = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/agent/src/host_managed_generation.rs"),
      "utf8",
    );
    const adapters = [pluginWorkerAdapter, imagePresentationAdapter].map(({ path, source }) => ({
      path,
      source,
    }));
    const forbiddenSnippets = [
      "stream_reply_with_policy",
      "resolve_request_tool_policy_with_mode",
      "SessionConfigBuilder",
      "RuntimeAgentEvent",
      "TextDeltaBatch",
    ];
    const pluginWorkerForbiddenSnippets = [
      "run_direct_text_generation",
      "DirectTextGenerationRequest",
      "fn generation_system_prompt",
      "fn generation_user_prompt",
      "MAX_GENERATION_REQUESTS",
      "MAX_GENERATED_CHARS",
    ].filter((snippet) => pluginWorkerAdapter.source.includes(snippet));

    const offenders = adapters.flatMap(({ path, source }) =>
      forbiddenSnippets
        .filter((snippet) => source.includes(snippet))
        .map((snippet) => ({ path, snippet })),
    );

    expect(agentHostManagedGeneration).toContain("run_direct_text_generation");
    expect(agentHostManagedGeneration).toContain("DirectTextGenerationRequest");
    expect(agentHostManagedGeneration).toContain("HostManagedGenerationPlan");
    expect(pluginWorkerAdapter.source).toContain("run_host_managed_generation");
    expect(pluginWorkerAdapter.source).toContain("HostManagedGenerationPlan");
    expect(pluginWorkerForbiddenSnippets).toEqual([]);
    expect(imagePresentationAdapter.source).toContain("run_direct_text_generation");
    expect(imagePresentationAdapter.source).toContain("DirectTextGenerationRequest");
    expect(
      offenders,
      "plugin worker 只能调用 lime-agent host_managed_generation，image presentation 只能调用 lime-agent direct_text_generation；App Server adapter 不得重新承接禁用工具的模型 streaming loop",
    ).toEqual([]);
  });

  it("App Server native tool adapter 不应重新实现 Aster Tool surface", () => {
    const adapters = [
      {
        path: "lime-rs/crates/app-server/src/runtime_backend/image_tools.rs",
        requiredSnippets: ["create_agent_image_tools", "ImageTaskGateway"],
      },
      {
        path: "lime-rs/crates/app-server/src/runtime_backend/memory_tools.rs",
        requiredSnippets: ["create_agent_memory_tools", "MemoryStoreGateway"],
      },
    ].map(({ path, requiredSnippets }) => ({
      path,
      requiredSnippets,
      source: productionSource(join(REPO_ROOT, path)),
    }));
    const forbiddenSnippets = [
      "impl Tool for",
      "ToolContext",
      "ToolError",
      "PermissionCheckResult",
      "ToolOptions",
      "fn input_schema",
    ];

    const offenders = adapters.flatMap(({ path, source }) =>
      forbiddenSnippets
        .filter((snippet) => source.includes(snippet))
        .map((snippet) => ({ path, snippet })),
    );
    const missingRequired = adapters.flatMap(
      ({ path, source, requiredSnippets }) =>
        requiredSnippets
          .filter((snippet) => !source.includes(snippet))
          .map((snippet) => ({ path, snippet })),
    );

    expect(
      missingRequired,
      "App Server native tool adapter 必须委托 lime-agent native_tools gateway，不能恢复本地 Tool 实现",
    ).toEqual([]);
    expect(
      offenders,
      "image/memory native tool 的 schema、权限检查和 ToolResult 拼装属于 lime-agent；App Server 只能注入 AppDataSource gateway",
    ).toEqual([]);
  });

  it("App Server tool inventory 不应直接读取 Aster tool registry", () => {
    const appServerAdapter = productionSource(
      join(REPO_ROOT, "lime-rs/crates/app-server/src/runtime_backend/tool_inventory.rs"),
    );
    const agentBoundary = readFileSync(
      join(
        REPO_ROOT,
        "lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_snapshot.rs",
      ),
      "utf8",
    );
    const forbiddenSnippets = [
      "tool_registry()",
      "get_extension_configs()",
      ".list_tools(",
      "ExtensionConfig",
      "ExtensionToolInventorySeed",
      "build_mcp_extension_surface",
    ].filter((snippet) => appServerAdapter.includes(snippet));

    expect(agentBoundary).toContain("read_agent_tool_inventory_runtime_snapshot");
    expect(agentBoundary).toContain("tool_registry()");
    expect(agentBoundary).toContain("get_extension_configs()");
    expect(agentBoundary).toContain(".list_tools(");
    expect(appServerAdapter).toContain("read_agent_tool_inventory_runtime_snapshot");
    expect(
      forbiddenSnippets,
      "Aster tool registry / extension snapshot 语义属于 lime-agent agent_tools::inventory；App Server tool_inventory 只能合并 AppDataSource MCP snapshot 并投影 read-model",
    ).toEqual([]);
  });

  it("App Server execution process 不应直接注册 Aster shell tools", () => {
    const appServerExecutionProcess = productionSource(
      join(REPO_ROOT, "lime-rs/crates/app-server/src/execution_process.rs"),
    );
    const agentToolOrchestrator = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs"),
      "utf8",
    );
    const forbiddenSnippets = [
      "BashTool",
      "PowerShellTool",
      "ToolRegistry",
      "ToolContext",
      "check_tool_permissions",
      "aster::tools",
    ].filter((snippet) => appServerExecutionProcess.includes(snippet));

    expect(agentToolOrchestrator).toContain("check_shell_tool_permissions");
    expect(agentToolOrchestrator).toContain("BashTool");
    expect(agentToolOrchestrator).toContain("PowerShellTool");
    expect(appServerExecutionProcess).toContain("check_shell_tool_permissions");
    expect(
      forbiddenSnippets,
      "Aster shell tool registry 和权限预检属于 lime-agent tool_orchestrator；App Server execution_process 只能做 process control / read-model 投影",
    ).toEqual([]);
  });

  it("App Server 不应恢复独立 backend_mode=aster", () => {
    const runtimeFactory = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/app-server/src/runtime_factory.rs"),
      "utf8",
    );
    const daemonBackend = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/app-server-daemon/src/backend.rs"),
      "utf8",
    );
    const electronHost = readFileSync(
      join(REPO_ROOT, "electron/appServerHost.ts"),
      "utf8",
    );

    expect(runtimeFactory).toContain('"runtime" => Ok(Self::Runtime)');
    expect(runtimeFactory).not.toMatch(/["']aster["']\s*=>\s*Ok/u);
    expect(daemonBackend).toContain(
      'assert!(SidecarBackendMode::parse("aster").is_err());',
    );
    expect(electronHost).not.toContain('normalized === "aster"');
    expect(electronHost).not.toContain("APP_SERVER_BACKEND_MODE=aster");
  });

  it("ExternalBackend 只能保留为显式 override 或受控 fixture", () => {
    const electronHost = readFileSync(
      join(REPO_ROOT, "electron/appServerHost.ts"),
      "utf8",
    );
    const devSidecar = readFileSync(
      join(REPO_ROOT, "scripts/lib/electron-dev-sidecar.mjs"),
      "utf8",
    );
    const sidecarTypes = readFileSync(
      join(REPO_ROOT, "packages/app-server-client/src/sidecar-types.ts"),
      "utf8",
    );
    const sidecarManifest = readFileSync(
      join(REPO_ROOT, "packages/app-server-client/src/sidecar-manifest.ts"),
      "utf8",
    );
    const appServerMain = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/app-server/src/main.rs"),
      "utf8",
    );

    expect(electronHost).toContain(
      'resolveRuntimeBackendLaunchOptions("runtime")',
    );
    expect(electronHost).toContain('normalized === "external"');
    expect(electronHost).toContain(
      "process.env.APP_SERVER_BACKEND_COMMAND?.trim()",
    );
    expect(devSidecar).toContain('defaultMode = "runtime"');
    expect(devSidecar).toContain('requestedMode !== "external"');
    expect(sidecarTypes).toContain('> = "unavailable";');
    expect(sidecarManifest).toContain(
      "backendMode: DEFAULT_STANDALONE_BACKEND_MODE",
    );
    expect(appServerMain).toContain(
      "--backend-command is required when --backend external",
    );

    const unregistered = EXTERNAL_BACKEND_SCAN_DIRS.flatMap((dir) =>
      collectTextFiles(join(REPO_ROOT, dir)),
    )
      .map((file) => ({
        path: repoRelative(file),
        source: readFileSync(file, "utf8"),
      }))
      .filter(({ source }) =>
        EXTERNAL_BACKEND_LAUNCH_SNIPPETS.some((snippet) =>
          source.includes(snippet),
        ),
      )
      .filter(({ path }) => !ALLOWED_EXTERNAL_BACKEND_LAUNCH_FILES.has(path))
      .map(({ path }) => path);

    expect(
      unregistered,
      "ExternalBackend 是 compat / controlled-fixture 边界，只能出现在 standalone CLI、SDK smoke、fixture 或 dev 显式 override；生产默认必须继续走 AppServerBackendMode::Runtime",
    ).toEqual([]);
  });
});
