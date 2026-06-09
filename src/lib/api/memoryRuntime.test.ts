import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  analyzeContextMemory,
  cleanupContextMemdir,
  cleanupContextMemory,
  getContextMemoryAutoIndex,
  getContextMemoryEffectiveSources,
  getContextMemoryExtractionStatus,
  getContextMemoryOverview,
  getContextMemoryStats,
  getContextWorkingMemory,
  ensureWorkspaceLocalAgentsGitignore,
  prefetchContextMemoryForTurn,
  scaffoldContextMemdir,
  scaffoldRuntimeAgentsTemplate,
  toggleContextMemoryAuto,
  updateContextMemoryAutoNote,
} from "./memoryRuntime";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

const statsResponse = {
  total_entries: 1,
  storage_used: 2,
  memory_count: 3,
};

const overviewResponse = {
  stats: statsResponse,
  categories: [],
  entries: [],
};

const analysisResponse = {
  analyzed_sessions: 1,
  analyzed_messages: 2,
  generated_entries: 3,
  deduplicated_entries: 4,
};

const cleanupMemoryResponse = {
  cleaned_entries: 1,
  freed_space: 2,
};

const workingMemoryResponse = {
  memory_dir: "/tmp/workspace/.memory",
  total_sessions: 0,
  total_entries: 0,
  sessions: [],
};

const extractionStatusResponse = {
  enabled: true,
  status: "idle",
  status_summary: "Idle",
  working_session_count: 0,
  working_entry_count: 0,
  recent_compactions: [],
};

const prefetchResponse = {
  session_id: "session-1",
  rules_source_paths: [],
  durable_memories: [],
  team_memory_entries: [],
};

const effectiveSourcesResponse = {
  working_dir: "/tmp/workspace",
  total_sources: 0,
  loaded_sources: 0,
  follow_imports: true,
  import_max_depth: 2,
  sources: [],
};

const autoIndexResponse = {
  enabled: true,
  root_dir: "/tmp/workspace/memory",
  entrypoint: "MEMORY.md",
  max_loaded_lines: 200,
  entry_exists: true,
  total_lines: 0,
  preview_lines: [],
  items: [],
};

const memdirCleanupResponse = {
  root_dir: "/tmp/workspace/memory",
  entrypoint: "MEMORY.md",
  scanned_files: 1,
  updated_files: 1,
  removed_duplicate_links: 0,
  dropped_missing_links: 0,
  removed_duplicate_notes: 0,
  trimmed_notes: 0,
  curated_topic_files: 0,
};

const memdirScaffoldResponse = {
  root_dir: "/tmp/workspace/memory",
  entrypoint: "MEMORY.md",
  created_parent_dir: true,
  files: [],
};

const runtimeAgentsTemplateResponse = {
  target: "workspace",
  path: "/tmp/workspace/AGENTS.md",
  status: "created",
  createdParentDir: true,
};

const workspaceGitignoreResponse = {
  path: "/tmp/workspace/.gitignore",
  entry: ".agents/local/",
  status: "added",
};

describe("memoryRuntime API", () => {
  beforeEach(() => {
    vi.mocked(safeInvoke).mockReset();
  });

  it("应通过 context memory 命名代理记忆查询命令", async () => {
    vi.mocked(safeInvoke).mockImplementation(async (command) => {
      switch (command) {
        case "memory_runtime_get_stats":
          return statsResponse;
        case "memory_runtime_request_analysis":
          return analysisResponse;
        case "memory_runtime_cleanup":
          return cleanupMemoryResponse;
        case "memory_runtime_get_working_memory":
          return workingMemoryResponse;
        case "memory_runtime_get_extraction_status":
          return extractionStatusResponse;
        case "memory_runtime_prefetch_for_turn":
          return prefetchResponse;
        case "memory_runtime_get_overview":
          return overviewResponse;
        case "memory_get_effective_sources":
          return effectiveSourcesResponse;
        case "memory_get_auto_index":
          return autoIndexResponse;
        case "memory_scaffold_memdir":
          return memdirScaffoldResponse;
        case "memory_scaffold_runtime_agents_template":
          return runtimeAgentsTemplateResponse;
        case "memory_ensure_workspace_local_agents_gitignore":
          return workspaceGitignoreResponse;
        default:
          return null;
      }
    });

    await expect(getContextMemoryStats()).resolves.toEqual(
      expect.objectContaining({ total_entries: 1 }),
    );
    await expect(analyzeContextMemory()).resolves.toEqual(
      expect.objectContaining({ analyzed_sessions: 1 }),
    );
    await expect(cleanupContextMemory()).resolves.toEqual(
      expect.objectContaining({ cleaned_entries: 1 }),
    );
    await expect(getContextWorkingMemory("session-1", 10)).resolves.toEqual(
      expect.objectContaining({ sessions: [] }),
    );
    await expect(getContextMemoryExtractionStatus()).resolves.toEqual(
      expect.objectContaining({ status: "idle" }),
    );
    await expect(
      prefetchContextMemoryForTurn({ session_id: "session-1" }),
    ).resolves.toEqual(expect.objectContaining({ session_id: "session-1" }));
    await expect(getContextMemoryOverview(200)).resolves.toEqual(
      expect.objectContaining({ entries: [] }),
    );
    await expect(getContextMemoryEffectiveSources()).resolves.toEqual(
      expect.objectContaining({ sources: [] }),
    );
    await expect(getContextMemoryAutoIndex()).resolves.toEqual(
      expect.objectContaining({ items: [] }),
    );
    await expect(scaffoldContextMemdir("/tmp/workspace")).resolves.toEqual(
      expect.objectContaining({ root_dir: "/tmp/workspace/memory" }),
    );
    await expect(
      scaffoldRuntimeAgentsTemplate("workspace", "/tmp/workspace"),
    ).resolves.toEqual(expect.objectContaining({ status: "created" }));
    await expect(
      ensureWorkspaceLocalAgentsGitignore("/tmp/workspace"),
    ).resolves.toEqual(expect.objectContaining({ status: "added" }));

    expect(safeInvoke).toHaveBeenNthCalledWith(1, "memory_runtime_get_stats");
    expect(safeInvoke).toHaveBeenNthCalledWith(
      2,
      "memory_runtime_request_analysis",
      {
        fromTimestamp: undefined,
        toTimestamp: undefined,
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(3, "memory_runtime_cleanup");
    expect(safeInvoke).toHaveBeenNthCalledWith(
      4,
      "memory_runtime_get_working_memory",
      {
        limit: 10,
        sessionId: "session-1",
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      5,
      "memory_runtime_get_extraction_status",
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      6,
      "memory_runtime_prefetch_for_turn",
      {
        request: {
          maxDurableEntries: undefined,
          maxWorkingChars: undefined,
          requestMetadata: undefined,
          sessionId: "session-1",
          userMessage: undefined,
          workingDir: undefined,
        },
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      7,
      "memory_runtime_get_overview",
      {
        limit: 200,
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      8,
      "memory_get_effective_sources",
      {
        activeRelativePath: undefined,
        workingDir: undefined,
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(9, "memory_get_auto_index", {
      workingDir: undefined,
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(10, "memory_scaffold_memdir", {
      overwrite: undefined,
      workingDir: "/tmp/workspace",
    });
    expect(safeInvoke).toHaveBeenNthCalledWith(
      11,
      "memory_scaffold_runtime_agents_template",
      {
        overwrite: undefined,
        target: "workspace",
        workingDir: "/tmp/workspace",
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      12,
      "memory_ensure_workspace_local_agents_gitignore",
      {
        workingDir: "/tmp/workspace",
      },
    );
  });

  it("应暴露清晰的 context memory 命名", async () => {
    vi.mocked(safeInvoke).mockImplementation(async (command) => {
      switch (command) {
        case "memory_runtime_get_stats":
          return {
            ...statsResponse,
            total_entries: 9,
          };
        case "memory_runtime_request_analysis":
          return {
            ...analysisResponse,
            analyzed_sessions: 3,
          };
        case "memory_runtime_cleanup":
          return {
            ...cleanupMemoryResponse,
            cleaned_entries: 4,
          };
        case "memory_runtime_get_working_memory":
          return workingMemoryResponse;
        case "memory_runtime_get_extraction_status":
          return {
            ...extractionStatusResponse,
            status: "ready",
            status_summary: "Ready",
          };
        case "memory_runtime_prefetch_for_turn":
          return {
            ...prefetchResponse,
            session_id: "session-2",
          };
        case "memory_runtime_get_overview":
          return {
            ...overviewResponse,
            stats: {
              ...statsResponse,
              total_entries: 9,
            },
          };
        case "memory_get_effective_sources":
          return effectiveSourcesResponse;
        case "memory_get_auto_index":
          return autoIndexResponse;
        case "memory_toggle_auto":
          return { enabled: true };
        case "memory_update_auto_note":
          return autoIndexResponse;
        case "memory_cleanup_memdir":
          return memdirCleanupResponse;
        case "memory_scaffold_memdir":
          return memdirScaffoldResponse;
        case "memory_scaffold_runtime_agents_template":
          return {
            ...runtimeAgentsTemplateResponse,
            target: "global",
            status: "exists",
          };
        case "memory_ensure_workspace_local_agents_gitignore":
          return {
            ...workspaceGitignoreResponse,
            status: "exists",
          };
        default:
          return null;
      }
    });

    await expect(getContextMemoryStats()).resolves.toEqual(
      expect.objectContaining({ total_entries: 9 }),
    );
    await expect(analyzeContextMemory()).resolves.toEqual(
      expect.objectContaining({ analyzed_sessions: 3 }),
    );
    await expect(cleanupContextMemory()).resolves.toEqual(
      expect.objectContaining({ cleaned_entries: 4 }),
    );
    await expect(getContextWorkingMemory()).resolves.toEqual(
      expect.objectContaining({ sessions: [] }),
    );
    await expect(getContextMemoryExtractionStatus()).resolves.toEqual(
      expect.objectContaining({ status: "ready" }),
    );
    await expect(
      prefetchContextMemoryForTurn({ session_id: "session-2" }),
    ).resolves.toEqual(expect.objectContaining({ session_id: "session-2" }));
    await expect(getContextMemoryOverview()).resolves.toEqual(
      expect.objectContaining({ entries: [] }),
    );
    await expect(getContextMemoryEffectiveSources()).resolves.toEqual(
      expect.objectContaining({ sources: [] }),
    );
    await expect(getContextMemoryAutoIndex()).resolves.toEqual(
      expect.objectContaining({ items: [] }),
    );
    await expect(toggleContextMemoryAuto(true)).resolves.toEqual(
      expect.objectContaining({ enabled: true }),
    );
    await expect(updateContextMemoryAutoNote("note")).resolves.toEqual(
      expect.objectContaining({ items: [] }),
    );
    await expect(cleanupContextMemdir("/tmp/workspace")).resolves.toEqual(
      expect.objectContaining({ updated_files: 1 }),
    );
    await expect(scaffoldContextMemdir("/tmp/workspace")).resolves.toEqual(
      expect.objectContaining({ root_dir: "/tmp/workspace/memory" }),
    );
    await expect(scaffoldRuntimeAgentsTemplate("global")).resolves.toEqual(
      expect.objectContaining({ status: "exists" }),
    );
    await expect(
      ensureWorkspaceLocalAgentsGitignore("/tmp/workspace"),
    ).resolves.toEqual(expect.objectContaining({ status: "exists" }));
  });

  it("应代理 context memory 自动记忆开关与写入命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ enabled: true })
      .mockResolvedValueOnce(autoIndexResponse)
      .mockResolvedValueOnce(memdirCleanupResponse);

    await expect(toggleContextMemoryAuto(true)).resolves.toEqual(
      expect.objectContaining({ enabled: true }),
    );
    await expect(
      updateContextMemoryAutoNote("note", "topic", undefined, "feedback"),
    ).resolves.toEqual(expect.objectContaining({ items: [] }));

    expect(safeInvoke).toHaveBeenNthCalledWith(2, "memory_update_auto_note", {
      memoryType: "feedback",
      note: "note",
      topic: "topic",
      workingDir: undefined,
    });
    await expect(cleanupContextMemdir("/tmp/workspace")).resolves.toEqual(
      expect.objectContaining({ updated_files: 1 }),
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(3, "memory_cleanup_memdir", {
      workingDir: "/tmp/workspace",
    });
  });

  it("应把记忆预取请求序列化为 Rust camelCase DTO", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce(prefetchResponse);

    await expect(
      prefetchContextMemoryForTurn({
        max_durable_entries: 6,
        max_working_chars: 3200,
        request_metadata: {
          team_memory_shadow: [{ key: "tone", content: "direct" }],
        },
        session_id: "session-3",
        user_message: "hello",
        working_dir: "/tmp/workspace",
      }),
    ).resolves.toEqual(expect.objectContaining({ session_id: "session-1" }));

    expect(safeInvoke).toHaveBeenCalledWith(
      "memory_runtime_prefetch_for_turn",
      {
        request: {
          maxDurableEntries: 6,
          maxWorkingChars: 3200,
          requestMetadata: {
            team_memory_shadow: [{ key: "tone", content: "direct" }],
          },
          sessionId: "session-3",
          userMessage: "hello",
          workingDir: "/tmp/workspace",
        },
      },
    );
  });

  it("记忆运行时命令遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        command: "memory_runtime_get_stats",
        category: "electron-diagnostic-facade",
        source: "electron-host-diagnostic",
        status: "degraded",
      },
    });

    await expect(getContextMemoryStats()).rejects.toThrow(
      "memory_runtime_get_stats 尚未接入真实 Memory runtime current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("记忆运行时读命令遇到非 Memory Runtime 响应形状时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ stats: {}, categories: [], entries: [] })
      .mockResolvedValueOnce({ items: [] });

    await expect(getContextMemoryStats()).rejects.toThrow(
      "memory_runtime_get_stats did not return memory stats",
    );
    await expect(getContextMemoryOverview()).rejects.toThrow(
      "memory_runtime_get_overview did not return memory overview",
    );
    await expect(getContextMemoryAutoIndex()).rejects.toThrow(
      "memory_get_auto_index did not return auto memory index",
    );
  });

  it("记忆运行时副作用与读取命令遇到空对象或缺字段时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ sessions: [] })
      .mockResolvedValueOnce({ status: "idle" })
      .mockResolvedValueOnce({ session_id: "session-1" })
      .mockResolvedValueOnce({ sources: [] })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ updated_files: 1 })
      .mockResolvedValueOnce({ files: [] })
      .mockResolvedValueOnce({ status: "created" })
      .mockResolvedValueOnce({ status: "added" });

    await expect(analyzeContextMemory()).rejects.toThrow(
      "memory_runtime_request_analysis did not return memory analysis result",
    );
    await expect(cleanupContextMemory()).rejects.toThrow(
      "memory_runtime_cleanup did not return cleanup result",
    );
    await expect(getContextWorkingMemory()).rejects.toThrow(
      "memory_runtime_get_working_memory did not return working memory",
    );
    await expect(getContextMemoryExtractionStatus()).rejects.toThrow(
      "memory_runtime_get_extraction_status did not return extraction status",
    );
    await expect(
      prefetchContextMemoryForTurn({ session_id: "session-1" }),
    ).rejects.toThrow(
      "memory_runtime_prefetch_for_turn did not return memory prefetch result",
    );
    await expect(getContextMemoryEffectiveSources()).rejects.toThrow(
      "memory_get_effective_sources did not return effective memory sources",
    );
    await expect(toggleContextMemoryAuto(true)).rejects.toThrow(
      "memory_toggle_auto did not return memory auto toggle",
    );
    await expect(updateContextMemoryAutoNote("note")).rejects.toThrow(
      "memory_update_auto_note did not return auto memory index",
    );
    await expect(cleanupContextMemdir()).rejects.toThrow(
      "memory_cleanup_memdir did not return memdir cleanup",
    );
    await expect(scaffoldContextMemdir()).rejects.toThrow(
      "memory_scaffold_memdir did not return memdir scaffold",
    );
    await expect(scaffoldRuntimeAgentsTemplate("workspace")).rejects.toThrow(
      "memory_scaffold_runtime_agents_template did not return runtime agents template scaffold",
    );
    await expect(ensureWorkspaceLocalAgentsGitignore()).rejects.toThrow(
      "memory_ensure_workspace_local_agents_gitignore did not return workspace gitignore result",
    );
  });

  it("记忆自动索引遇到 Electron empty diagnostic list 时应 fail closed", async () => {
    const diagnosticList: unknown[] = [];
    Object.defineProperty(diagnosticList, "__diagnostic", {
      value: {
        command: "memory_get_auto_index",
        source: "electron-empty-diagnostic",
        status: "degraded",
      },
      enumerable: false,
    });

    vi.mocked(safeInvoke).mockResolvedValueOnce(diagnosticList);

    await expect(getContextMemoryAutoIndex("/tmp/workspace")).rejects.toThrow(
      "memory_get_auto_index 尚未接入真实 Memory runtime current 通道，收到 electron-empty-diagnostic 诊断返回。",
    );
  });
});
