/* global process */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

const CURRENT_RUNTIME_CRATES = [
  "agent-protocol",
  "model-provider",
  "thread-store",
  "tool-runtime",
  "agent-runtime",
];

const ASTER_FREE_MIGRATED_CRATES = ["server", "scheduler", "app-server", "services"];

const ASTER_FREE_MIGRATED_FILES = [
  "lime-rs/crates/services/src/model_registry_service.rs",
  "lime-rs/crates/agent/src/protocol_context_projection.rs",
  "lime-rs/crates/agent/src/protocol_projection.rs",
  "lime-rs/crates/agent/src/request_tool_policy/auto_compaction_projection.rs",
  "lime-rs/crates/agent/src/runtime_projection_snapshot.rs",
  "lime-rs/crates/agent/src/session_store_message_projection.rs",
  "lime-rs/crates/agent/src/session_store_runtime_projection.rs",
  "lime-rs/crates/agent/src/turn_input_envelope.rs",
];

const PROTOCOL_PROJECTION_FORBIDDEN_RUNTIME_DTO_SNIPPETS = [
  "aster::session::",
  "TurnRuntime",
  "ItemRuntime",
  "convert_turn_runtime",
  "convert_item_runtime",
];

const SESSION_EXECUTION_RUNTIME_FORBIDDEN_PRODUCTION_SNAPSHOT_SNIPPETS = [
  "SessionRuntimeSnapshot",
  "ThreadRuntimeSnapshot",
  "TurnRuntime",
  "TurnStatus",
  "TurnContextOverride",
  "context_override",
  "project_aster_session_execution_runtime_snapshot",
];

const SUBAGENT_CONTROL_FORBIDDEN_PRODUCTION_RUNTIME_DTO_SNIPPETS = [
  "SessionRuntimeSnapshot",
  "ThreadRuntimeSnapshot",
  " TurnRuntime,",
  " TurnRuntime {",
  " ItemRuntime,",
  " ItemRuntime {",
  "ItemRuntimePayload",
  "latest_turn_projection",
];

const SESSION_STORE_SUBAGENT_CONTEXT_FORBIDDEN_RUNTIME_DTO_SNIPPETS = [
  "SessionRuntimeSnapshot",
  "ThreadRuntimeSnapshot",
  "TurnRuntime",
  "ItemRuntimePayload",
  "aster::session::TurnStatus",
  " TurnStatus,",
];

const AGENT_TURN_CONTEXT_MIGRATED_FILES = [
  "lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs",
  "lime-rs/crates/agent/src/agent_tools/tool_policy_inspector.rs",
  "lime-rs/crates/agent/src/agent_tools/workspace_patch_host.rs",
  "lime-rs/crates/agent/src/direct_text_generation.rs",
  "lime-rs/crates/agent/src/native_tools/image_tasks.rs",
  "lime-rs/crates/agent/src/protocol_projection.rs",
  "lime-rs/crates/agent/src/session_configuration.rs",
  "lime-rs/crates/agent/src/skill_execution.rs",
  "lime-rs/crates/agent/src/tools/skill_search_tool.rs",
];

const APP_SERVER_FORBIDDEN_TURN_CONTEXT_SNIPPETS = [
  "runtime_facade::{with_turn_context",
  "runtime_facade::with_turn_context",
  "runtime_facade::{TurnContextOverride",
  "runtime_facade::TurnContextOverride",
  "runtime_facade::{TurnOutputSchemaSource",
  "runtime_facade::TurnOutputSchemaSource",
  "current_turn_context",
  "with_turn_context",
  "aster::session_context",
  "aster::session::TurnContextOverride",
  "aster::session::TurnOutputSchemaSource",
];

const RUNTIME_FACADE_FORBIDDEN_TURN_CONTEXT_SNIPPETS = [
  "pub use aster::session::{TurnContextOverride",
  "pub use aster::session::TurnContextOverride",
  "pub use aster::session::{TurnOutputSchemaSource",
  "pub use aster::session::TurnOutputSchemaSource",
  "pub fn current_turn_context",
  "pub async fn with_turn_context",
];

const FORBIDDEN_ASTER_SNIPPETS = [
  "use aster::",
  "aster::",
  "use aster_models::",
  "aster_models::",
  "aster.workspace = true",
  "aster-models.workspace = true",
  'package = "aster-core"',
];

function repoRelative(path: string): string {
  return relative(REPO_ROOT, path).replace(/\\/g, "/");
}

function collectTextFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectTextFiles(fullPath));
      continue;
    }
    if (/\.(?:rs|toml)$/u.test(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("aster migration boundary", () => {
  it("Codex 风格 Agent Runtime 骨架 crate 必须存在并纳入 workspace dependencies", () => {
    const rootCargo = readFileSync(join(REPO_ROOT, "lime-rs/Cargo.toml"), "utf8");
    const missingCrates = CURRENT_RUNTIME_CRATES.filter((crateName) => {
      const crateRoot = join(REPO_ROOT, "lime-rs/crates", crateName);
      return (
        !existsSync(join(crateRoot, "Cargo.toml")) ||
        !existsSync(join(crateRoot, "src/lib.rs"))
      );
    });
    const missingDependencies = CURRENT_RUNTIME_CRATES.filter(
      (crateName) =>
        !rootCargo.includes(`${crateName} = { path = "crates/${crateName}" }`),
    );

    expect(missingCrates, "缺少 current runtime 骨架 crate").toEqual([]);
    expect(
      missingDependencies,
      "根 workspace.dependencies 必须声明 current runtime 骨架 crate",
    ).toEqual([]);
  });

  it("Codex 风格 Agent Runtime 骨架不得直接依赖 Aster", () => {
    const leaks = CURRENT_RUNTIME_CRATES.flatMap((crateName) => {
      const crateRoot = join(REPO_ROOT, "lime-rs/crates", crateName);
      return collectTextFiles(crateRoot).flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
          source.includes(snippet),
        ).map((snippet) => `${repoRelative(file)}: ${snippet}`);
      });
    });

    expect(
      leaks,
      "新 Agent Runtime current crate 只能依赖 Lime 自有协议 / provider / tool / store，不得重新接 Aster",
    ).toEqual([]);
  });

  it("已迁移 crate 不得重新直接依赖 Aster", () => {
    const leaks = ASTER_FREE_MIGRATED_CRATES.flatMap((crateName) => {
      const crateRoot = join(REPO_ROOT, "lime-rs/crates", crateName);
      return collectTextFiles(crateRoot).flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
          source.includes(snippet),
        ).map((snippet) => `${repoRelative(file)}: ${snippet}`);
      });
    });

    expect(
      leaks,
      "server / scheduler / app-server / services 已从 Aster current 依赖面迁出，不得重新 import 或声明 aster.workspace",
    ).toEqual([]);
  });

  it("已迁移文件不得重新直接依赖 Aster", () => {
    const leaks = ASTER_FREE_MIGRATED_FILES.flatMap((filePath) => {
      const absolutePath = join(REPO_ROOT, filePath);
      const source = readFileSync(absolutePath, "utf8");
      return FORBIDDEN_ASTER_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${filePath}: ${snippet}`);
    });

    expect(
      leaks,
      "已迁 provider / turn DTO 文件不得重新 import Aster；Aster 只允许停留在 lime-agent 迁移 adapter 边界",
    ).toEqual([]);
  });

  it("App Server 不得重新公开使用 Aster turn context 类型", () => {
    const crateRoot = join(REPO_ROOT, "lime-rs/crates/app-server");
    const leaks = collectTextFiles(crateRoot).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return APP_SERVER_FORBIDDEN_TURN_CONTEXT_SNIPPETS.filter((snippet) =>
        source.includes(snippet),
      ).map((snippet) => `${repoRelative(file)}: ${snippet}`);
    });

    expect(
      leaks,
      "App Server 只能使用 agent-protocol / AgentTurnContext；Aster turn context 只能留在 lime-agent migration facade 内部",
    ).toEqual([]);
  });

  it("runtime_facade 不得重新公开 Aster turn context 类型", () => {
    const filePath = "lime-rs/crates/agent/src/runtime_facade.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = RUNTIME_FACADE_FORBIDDEN_TURN_CONTEXT_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "runtime_facade 只能公开 AgentTurnContext current DTO 出口；Aster turn context 只能作为内部 adapter 输入输出",
    ).toEqual([]);
  });

  it("已迁工具编排文件不得重新使用 Aster turn context DTO", () => {
    const forbiddenSnippets = [
      "use aster::session::TurnContextOverride",
      "aster::session::TurnContextOverride",
      "use aster::session::TurnOutputSchemaSource",
      "aster::session::TurnOutputSchemaSource",
    ];
    const leaks = AGENT_TURN_CONTEXT_MIGRATED_FILES.flatMap((filePath) => {
      const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
      return forbiddenSnippets
        .filter((snippet) => source.includes(snippet))
        .map((snippet) => `${filePath}: ${snippet}`);
    });

    expect(
      leaks,
      "工具编排 public 输入必须使用 AgentTurnContext；Aster turn context 只能在真正调用 Aster registry 前局部转换",
    ).toEqual([]);
  });

  it("protocol_projection 不得重新公开 Aster runtime timeline DTO", () => {
    const filePath = "lime-rs/crates/agent/src/protocol_projection.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = PROTOCOL_PROJECTION_FORBIDDEN_RUNTIME_DTO_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "protocol_projection 的 timeline runtime 入口只能接 Lime current DTO；Aster TurnRuntime / ItemRuntime 只能留在 adapter 边界",
    ).toEqual([]);
  });

  it("session_execution_runtime production 不得重新消费 Aster runtime snapshot / turn DTO", () => {
    const filePath = "lime-rs/crates/agent/src/session_execution_runtime.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const leaks = SESSION_EXECUTION_RUNTIME_FORBIDDEN_PRODUCTION_SNAPSHOT_SNIPPETS.filter(
      (snippet) => productionSource.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "session_execution_runtime production builder 只能接 Lime projection DTO；Aster snapshot / turn DTO 只能留在 adapter 或测试 fixture",
    ).toEqual([]);
  });

  it("subagent_control production 不得重新消费 Aster runtime snapshot / turn/item DTO", () => {
    const filePath = "lime-rs/crates/agent/src/subagent_control.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const productionSource = source.split("#[cfg(test)]")[0] ?? source;
    const leaks = SUBAGENT_CONTROL_FORBIDDEN_PRODUCTION_RUNTIME_DTO_SNIPPETS.filter(
      (snippet) => productionSource.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "subagent_control production 只能消费 Lime SubagentTurnStatus / SubagentLatestTurnProjection；Aster runtime snapshot / turn/item DTO 只能留在 adapter 边界",
    ).toEqual([]);
  });

  it("session_store_subagent_context 不得重新引入 Aster runtime snapshot 测试 helper", () => {
    const filePath = "lime-rs/crates/agent/src/session_store_subagent_context.rs";
    const source = readFileSync(join(REPO_ROOT, filePath), "utf8");
    const leaks = SESSION_STORE_SUBAGENT_CONTEXT_FORBIDDEN_RUNTIME_DTO_SNIPPETS.filter(
      (snippet) => source.includes(snippet),
    ).map((snippet) => `${filePath}: ${snippet}`);

    expect(
      leaks,
      "session_store_subagent_context 的测试 helper 只能使用 Lime current turn projection；Aster runtime snapshot/turn DTO 只能留在 adapter 边界",
    ).toEqual([]);
  });

  it("Aster 迁移路线图必须作为可版本化文档保留", () => {
    const gitignore = readFileSync(join(REPO_ROOT, ".gitignore"), "utf8");
    const roadmapRoot = join(REPO_ROOT, "internal/roadmap/astermigration");
    const expectedFiles = [
      "README.md",
      "aster-runtime-codex-style-migration-plan.md",
    ];

    expect(existsSync(roadmapRoot)).toBe(true);
    for (const fileName of expectedFiles) {
      expect(existsSync(join(roadmapRoot, fileName))).toBe(true);
    }
    expect(gitignore).toContain("!internal/roadmap/astermigration/");
    expect(gitignore).toContain("!internal/roadmap/astermigration/**");
  });
});
