import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";
import {
  analyzeContextMemory,
  cleanupContextMemdir,
  cleanupContextMemory,
  ensureWorkspaceLocalAgentsGitignore,
  getContextMemoryAutoIndex,
  getContextMemoryEffectiveSources,
  getContextMemoryExtractionStatus,
  getContextMemoryOverview,
  getContextMemoryStats,
  getContextWorkingMemory,
  prefetchContextMemoryForTurn,
  scaffoldContextMemdir,
  scaffoldRuntimeAgentsTemplate,
  toggleContextMemoryAuto,
  updateContextMemoryAutoNote,
} from "./memoryRuntime";

const RETIRED_MEMORY_RUNTIME_COMMANDS = [
  "memory_runtime_get_overview",
  "memory_runtime_get_stats",
  "memory_runtime_request_analysis",
  "memory_runtime_cleanup",
  "memory_runtime_get_working_memory",
  "memory_runtime_get_extraction_status",
  "memory_runtime_prefetch_for_turn",
  "memory_get_effective_sources",
  "memory_get_auto_index",
  "memory_toggle_auto",
  "memory_update_auto_note",
  "memory_cleanup_memdir",
  "memory_scaffold_memdir",
  "memory_scaffold_runtime_agents_template",
  "memory_ensure_workspace_local_agents_gitignore",
] as const;

function readRepoFile(path: string): string {
  return readFileSync(resolve(cwd(), path), "utf8");
}

describe("memoryRuntime retired current boundary", () => {
  it("旧 Memory runtime API 在 App Server current owner 接入前必须 fail closed", async () => {
    const calls = [
      [getContextMemoryOverview(), "memory_runtime_get_overview"],
      [getContextMemoryStats(), "memory_runtime_get_stats"],
      [analyzeContextMemory(), "memory_runtime_request_analysis"],
      [cleanupContextMemory(), "memory_runtime_cleanup"],
      [
        getContextWorkingMemory("session-1", 10),
        "memory_runtime_get_working_memory",
      ],
      [
        getContextMemoryExtractionStatus(),
        "memory_runtime_get_extraction_status",
      ],
      [
        prefetchContextMemoryForTurn({ session_id: "session-1" }),
        "memory_runtime_prefetch_for_turn",
      ],
      [
        getContextMemoryEffectiveSources("/tmp/workspace", "AGENTS.md"),
        "memory_get_effective_sources",
      ],
      [getContextMemoryAutoIndex("/tmp/workspace"), "memory_get_auto_index"],
      [toggleContextMemoryAuto(true), "memory_toggle_auto"],
      [
        updateContextMemoryAutoNote(
          "note",
          "topic",
          "/tmp/workspace",
          "feedback",
        ),
        "memory_update_auto_note",
      ],
      [cleanupContextMemdir("/tmp/workspace"), "memory_cleanup_memdir"],
      [scaffoldContextMemdir("/tmp/workspace"), "memory_scaffold_memdir"],
      [
        scaffoldRuntimeAgentsTemplate("workspace", "/tmp/workspace"),
        "memory_scaffold_runtime_agents_template",
      ],
      [
        ensureWorkspaceLocalAgentsGitignore("/tmp/workspace"),
        "memory_ensure_workspace_local_agents_gitignore",
      ],
    ] as const;

    for (const [promise, command] of calls) {
      await expect(promise).rejects.toThrow(
        `${command} is retired; Memory runtime must move to App Server current methods before this API can be used`,
      );
    }
  });

  it("前端 Memory runtime 网关不再调用 safeInvoke 或解析旧 Tauri DTO", () => {
    const source = readRepoFile("src/lib/api/memoryRuntime.ts");

    expect(source).not.toContain("@/lib/dev-bridge");
    expect(source).not.toContain("safeInvoke(");
    expect(source).not.toContain("assertNotDiagnosticFacade");
    expect(source).not.toContain("did not return memory");
    expect(source).toContain("rejectRetiredMemoryRuntimeCommand");
  });

  it("旧 Memory runtime 命令不应继续作为 agentCommandCatalog runtime surface", () => {
    const catalogSource = readRepoFile(
      "src/lib/governance/agentCommandCatalog.json",
    );

    expect(catalogSource).not.toContain('"memoryRuntimeCommands"');
    for (const command of RETIRED_MEMORY_RUNTIME_COMMANDS) {
      expect(catalogSource).not.toContain(`"${command}"`);
    }
  });
});
