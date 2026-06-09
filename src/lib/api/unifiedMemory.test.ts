import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cwd } from "node:process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  METHOD_UNIFIED_MEMORY_ANALYZE,
  METHOD_UNIFIED_MEMORY_CREATE,
  METHOD_UNIFIED_MEMORY_DELETE,
  METHOD_UNIFIED_MEMORY_GET,
  METHOD_UNIFIED_MEMORY_HYBRID_SEARCH,
  METHOD_UNIFIED_MEMORY_LIST,
  METHOD_UNIFIED_MEMORY_SEARCH,
  METHOD_UNIFIED_MEMORY_SEMANTIC_SEARCH,
  METHOD_UNIFIED_MEMORY_STATS,
  METHOD_UNIFIED_MEMORY_UPDATE,
} from "../../../packages/app-server-client/src/protocol";
import {
  analyzeUnifiedMemories,
  createUnifiedMemory,
  deleteUnifiedMemory,
  formatAbsoluteTimestamp,
  formatRelativeTimestamp,
  getUnifiedMemory,
  getUnifiedMemoryStats,
  hybridSearch,
  listUnifiedMemories,
  searchUnifiedMemories,
  semanticSearch,
  updateUnifiedMemory,
  type MemoryCategory,
  type UnifiedMemory,
} from "./unifiedMemory";

const appServerRequest = vi.hoisted(() => vi.fn());

vi.mock("./appServer", () => ({
  createAppServerClient: () => ({
    request: appServerRequest,
  }),
}));

function createAppServerResult(result: unknown) {
  return {
    id: 1,
    result,
    response: { id: 1, jsonrpc: "2.0", result },
    notifications: [],
    messages: [],
  };
}

function mockAppServerResult(result: unknown) {
  appServerRequest.mockResolvedValueOnce(createAppServerResult(result));
}

function createUnifiedMemoryFixture(
  overrides: Partial<UnifiedMemory> = {},
): UnifiedMemory {
  return {
    id: "m1",
    session_id: "session-1",
    memory_type: "conversation",
    category: "experience",
    title: "标题",
    content: "内容",
    summary: "摘要",
    tags: ["复盘"],
    metadata: {
      confidence: 0.9,
      importance: 8,
      access_count: 0,
      last_accessed_at: null,
      source: "manual",
      embedding: null,
    },
    created_at: 1_717_200_000_000,
    updated_at: 1_717_200_001_000,
    archived: false,
    ...overrides,
  };
}

function createStatsFixture(
  categories: Array<{ category: MemoryCategory; count: number }> = [],
) {
  return {
    total_entries: 3,
    storage_used: 100,
    memory_count: 2,
    categories,
  };
}

describe("unifiedMemory API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("应通过 App Server current 代理统一记忆 CRUD 与查询命令", async () => {
    mockAppServerResult({ memories: [createUnifiedMemoryFixture()] });
    mockAppServerResult({
      memories: [createUnifiedMemoryFixture({ id: "m2", title: "搜索结果" })],
    });
    mockAppServerResult({ memory: createUnifiedMemoryFixture() });
    mockAppServerResult({ memory: createUnifiedMemoryFixture({ id: "m3" }) });
    mockAppServerResult({
      memory: createUnifiedMemoryFixture({ id: "m3", title: "更新后" }),
    });
    mockAppServerResult({ deleted: true });
    mockAppServerResult(createStatsFixture());
    mockAppServerResult({
      analyzed_sessions: 1,
      analyzed_messages: 10,
      generated_entries: 2,
      deduplicated_entries: 0,
    });

    await expect(listUnifiedMemories()).resolves.toEqual([
      expect.objectContaining({ id: "m1" }),
    ]);
    await expect(searchUnifiedMemories("关键词")).resolves.toEqual([
      expect.objectContaining({ id: "m2" }),
    ]);
    await expect(getUnifiedMemory("m1")).resolves.toEqual(
      expect.objectContaining({ id: "m1" }),
    );
    await expect(
      createUnifiedMemory({
        session_id: "session-1",
        title: "标题",
        content: "内容",
        summary: "摘要",
        category: "experience",
        tags: ["复盘"],
        confidence: 0.9,
        importance: 8,
      }),
    ).resolves.toEqual(expect.objectContaining({ id: "m3" }));
    await expect(
      updateUnifiedMemory("m3", { title: "更新后" }),
    ).resolves.toEqual(expect.objectContaining({ title: "更新后" }));
    await expect(deleteUnifiedMemory("m3")).resolves.toBe(true);
    await expect(getUnifiedMemoryStats()).resolves.toEqual(
      expect.objectContaining({ total_entries: 3 }),
    );
    await expect(analyzeUnifiedMemories()).resolves.toEqual(
      expect.objectContaining({ analyzed_sessions: 1 }),
    );

    expect(appServerRequest).toHaveBeenNthCalledWith(
      4,
      METHOD_UNIFIED_MEMORY_CREATE,
      {
        request: {
          session_id: "session-1",
          title: "标题",
          content: "内容",
          summary: "摘要",
          category: "experience",
          tags: ["复盘"],
          confidence: 0.9,
          importance: 8,
        },
      },
    );
    expect(appServerRequest).toHaveBeenNthCalledWith(
      8,
      METHOD_UNIFIED_MEMORY_ANALYZE,
      {
        from_timestamp: undefined,
        to_timestamp: undefined,
      },
    );
  });

  it("统一记忆统计遇到 diagnostic facade 时应 fail closed", async () => {
    mockAppServerResult({
      total_entries: 0,
      storage_used: 0,
      memory_count: 0,
      categories: [
        { category: "identity", count: 0 },
        { category: "context", count: 0 },
        { category: "preference", count: 0 },
        { category: "experience", count: 0 },
        { category: "activity", count: 0 },
      ],
      diagnostic: {
        source: "electron-host-diagnostic",
        command: METHOD_UNIFIED_MEMORY_STATS,
        status: "degraded",
      },
    });

    await expect(getUnifiedMemoryStats()).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_STATS} 尚未接入真实统一记忆统计 current 通道，收到 electron-host-diagnostic 诊断返回。`,
    );
  });

  it("统一记忆列表遇到 diagnostic facade 时应 fail closed", async () => {
    mockAppServerResult({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: METHOD_UNIFIED_MEMORY_LIST,
        status: "degraded",
      },
    });

    await expect(listUnifiedMemories()).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_LIST} 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。`,
    );
  });

  it("统一记忆列表遇到错误 response envelope 时不应伪装成空列表", async () => {
    mockAppServerResult([]);
    mockAppServerResult({ memories: [{ id: "m1" }] });

    await expect(listUnifiedMemories()).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_LIST} did not return a memories array`,
    );
    await expect(listUnifiedMemories()).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_LIST} did not return a memories array`,
    );
  });

  it("统一记忆搜索遇到 diagnostic facade 或错误形状时应 fail closed", async () => {
    mockAppServerResult({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: METHOD_UNIFIED_MEMORY_SEARCH,
        status: "degraded",
      },
    });
    mockAppServerResult([]);
    mockAppServerResult({
      memories: [
        createUnifiedMemoryFixture({
          metadata: { source: "manual" } as UnifiedMemory["metadata"],
        }),
      ],
    });

    await expect(searchUnifiedMemories("关键词")).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_SEARCH} 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。`,
    );
    await expect(searchUnifiedMemories("关键词")).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_SEARCH} did not return a memories array`,
    );
    await expect(searchUnifiedMemories("关键词")).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_SEARCH} did not return a memories array`,
    );
  });

  it("统一记忆 get/create/update/delete 遇到 diagnostic facade 时应 fail closed", async () => {
    mockAppServerResult({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: METHOD_UNIFIED_MEMORY_GET,
        status: "degraded",
      },
    });
    mockAppServerResult({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: METHOD_UNIFIED_MEMORY_CREATE,
        status: "degraded",
      },
    });
    mockAppServerResult({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: METHOD_UNIFIED_MEMORY_UPDATE,
        status: "degraded",
      },
    });
    mockAppServerResult({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: METHOD_UNIFIED_MEMORY_DELETE,
        status: "degraded",
      },
    });

    await expect(getUnifiedMemory("m1")).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_GET} 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。`,
    );
    await expect(
      createUnifiedMemory({
        session_id: "session-1",
        title: "标题",
        content: "内容",
        summary: "摘要",
      }),
    ).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_CREATE} 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。`,
    );
    await expect(updateUnifiedMemory("m1", { title: "更新" })).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_UPDATE} 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。`,
    );
    await expect(deleteUnifiedMemory("m1")).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_DELETE} 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。`,
    );
  });

  it("统一记忆 get/create/update/delete 遇到错误形状时应 fail closed", async () => {
    mockAppServerResult("bad");
    mockAppServerResult(null);
    mockAppServerResult(undefined);
    mockAppServerResult(true);

    await expect(getUnifiedMemory("m1")).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_GET} did not return a memory object or null`,
    );
    await expect(
      createUnifiedMemory({
        session_id: "session-1",
        title: "标题",
        content: "内容",
        summary: "摘要",
      }),
    ).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_CREATE} did not return a memory object`,
    );
    await expect(updateUnifiedMemory("m1", { title: "更新" })).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_UPDATE} did not return a memory object`,
    );
    await expect(deleteUnifiedMemory("m1")).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_DELETE} did not return a boolean`,
    );
  });

  it("统一记忆对象缺少核心字段时应 fail closed", async () => {
    mockAppServerResult({ memory: { id: "m1" } });
    mockAppServerResult({
      memory: createUnifiedMemoryFixture({
        category: "invalid" as UnifiedMemory["category"],
      }),
    });
    mockAppServerResult({
      memory: createUnifiedMemoryFixture({
        metadata: {
          confidence: 0.9,
          importance: 8,
          access_count: 0,
          last_accessed_at: null,
          source: "manual",
          embedding: [Number.NaN],
        },
      }),
    });

    await expect(getUnifiedMemory("m1")).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_GET} did not return a memory object or null`,
    );
    await expect(
      createUnifiedMemory({
        session_id: "session-1",
        title: "标题",
        content: "内容",
        summary: "摘要",
      }),
    ).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_CREATE} did not return a memory object`,
    );
    await expect(updateUnifiedMemory("m1", { title: "更新" })).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_UPDATE} did not return a memory object`,
    );
  });

  it("统一记忆统计缺少核心字段时应 fail closed", async () => {
    mockAppServerResult({ total_entries: 3 });
    mockAppServerResult(
      createStatsFixture([{ category: "invalid" as MemoryCategory, count: 1 }]),
    );

    await expect(getUnifiedMemoryStats()).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_STATS} did not return unified memory stats`,
    );
    await expect(getUnifiedMemoryStats()).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_STATS} did not return unified memory stats`,
    );
  });

  it("统一记忆分析遇到 diagnostic facade 或错误形状时应 fail closed", async () => {
    mockAppServerResult({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: METHOD_UNIFIED_MEMORY_ANALYZE,
        status: "degraded",
      },
    });
    mockAppServerResult({
      analyzed_sessions: 1,
    });

    await expect(analyzeUnifiedMemories()).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_ANALYZE} 尚未接入真实统一记忆分析 current 通道，收到 electron-host-diagnostic 诊断返回。`,
    );
    await expect(analyzeUnifiedMemories()).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_ANALYZE} did not return an analysis result`,
    );
  });

  it("应代理语义搜索与混合搜索 current method", async () => {
    mockAppServerResult({
      memories: [createUnifiedMemoryFixture({ id: "m4" })],
    });
    mockAppServerResult({
      memories: [createUnifiedMemoryFixture({ id: "m5" })],
    });

    await expect(semanticSearch("语义", "context", 0.8, 5)).resolves.toEqual([
      expect.objectContaining({ id: "m4" }),
    ]);
    await expect(
      hybridSearch("混合", "identity", 0.7, 0.4, 6),
    ).resolves.toEqual([expect.objectContaining({ id: "m5" })]);

    expect(appServerRequest).toHaveBeenNthCalledWith(
      1,
      METHOD_UNIFIED_MEMORY_SEMANTIC_SEARCH,
      {
        options: {
          query: "语义",
          category: "context",
          min_similarity: 0.8,
          limit: 5,
        },
      },
    );
    expect(appServerRequest).toHaveBeenNthCalledWith(
      2,
      METHOD_UNIFIED_MEMORY_HYBRID_SEARCH,
      {
        options: {
          query: "混合",
          category: "identity",
          semantic_weight: 0.7,
          min_similarity: 0.4,
          limit: 6,
        },
      },
    );
  });

  it("语义搜索与混合搜索遇到 diagnostic facade 或错误形状时应 fail closed", async () => {
    mockAppServerResult({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: METHOD_UNIFIED_MEMORY_SEMANTIC_SEARCH,
        status: "degraded",
      },
    });
    mockAppServerResult([]);
    mockAppServerResult({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: METHOD_UNIFIED_MEMORY_HYBRID_SEARCH,
        status: "degraded",
      },
    });
    mockAppServerResult([]);

    await expect(semanticSearch("语义")).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_SEMANTIC_SEARCH} 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。`,
    );
    await expect(semanticSearch("语义")).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_SEMANTIC_SEARCH} did not return a memories array`,
    );
    await expect(hybridSearch("混合")).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_HYBRID_SEARCH} 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。`,
    );
    await expect(hybridSearch("混合")).rejects.toThrow(
      `${METHOD_UNIFIED_MEMORY_HYBRID_SEARCH} did not return a memories array`,
    );
  });

  it("生产网关不得回流旧 unified_memory 命令或 safeInvoke", () => {
    const source = readFileSync(
      join(cwd(), "src/lib/api/unifiedMemory.ts"),
      "utf8",
    );

    expect(source).toContain("createAppServerClient");
    expect(source).not.toContain("safeInvoke(");
    expect(source).not.toMatch(
      /unified_memory_(list|get|create|update|delete|search|stats|analyze|semantic_search|hybrid_search)/,
    );
  });

  it("应格式化时间戳", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
    const absoluteDate = new Date(Date.UTC(2024, 0, 15, 12, 30));
    const expectedAbsolute = `${absoluteDate.getFullYear()}-${String(
      absoluteDate.getMonth() + 1,
    ).padStart(2, "0")}-${String(absoluteDate.getDate()).padStart(
      2,
      "0",
    )} ${String(absoluteDate.getHours()).padStart(2, "0")}:${String(
      absoluteDate.getMinutes(),
    ).padStart(2, "0")}`;

    expect(formatRelativeTimestamp(Date.now())).toBe("刚刚");
    expect(formatRelativeTimestamp(Date.now() - 5 * 60 * 1000)).toBe(
      "5 分钟前",
    );
    expect(formatRelativeTimestamp(Date.now() - 2 * 60 * 60 * 1000)).toBe(
      "2 小时前",
    );
    expect(formatAbsoluteTimestamp(absoluteDate.getTime())).toBe(
      expectedAbsolute,
    );

    vi.useRealTimers();
  });
});
