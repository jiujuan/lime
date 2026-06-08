import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
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
} from "./unifiedMemory";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

describe("unifiedMemory API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("应代理统一记忆 CRUD 与查询命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([{ id: "m1" }])
      .mockResolvedValueOnce([{ id: "m2" }])
      .mockResolvedValueOnce({ id: "m1" })
      .mockResolvedValueOnce({ id: "m3" })
      .mockResolvedValueOnce({ id: "m3", title: "更新后" })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        total_entries: 3,
        storage_used: 100,
        memory_count: 2,
        categories: [],
      })
      .mockResolvedValueOnce({
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

    expect(safeInvoke).toHaveBeenNthCalledWith(4, "unified_memory_create", {
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
    });
  });

  it("统一记忆统计遇到 Electron degraded diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
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
        command: "unified_memory_stats",
        status: "degraded",
      },
    });

    await expect(getUnifiedMemoryStats()).rejects.toThrow(
      "unified_memory_stats 尚未接入真实统一记忆统计 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("统一记忆列表遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      diagnostic: {
        source: "electron-host-diagnostic",
        command: "unified_memory_list",
        status: "degraded",
      },
    });

    await expect(listUnifiedMemories()).rejects.toThrow(
      "unified_memory_list 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("统一记忆列表遇到非数组返回时不应伪装成空列表", async () => {
    vi.mocked(safeInvoke).mockResolvedValueOnce({
      memories: [],
    });

    await expect(listUnifiedMemories()).rejects.toThrow(
      "unified_memory_list did not return a memories array",
    );
  });

  it("统一记忆搜索遇到 diagnostic facade 或非数组返回时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "unified_memory_search",
          status: "degraded",
        },
      })
      .mockResolvedValueOnce({ memories: [] });

    await expect(searchUnifiedMemories("关键词")).rejects.toThrow(
      "unified_memory_search 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(searchUnifiedMemories("关键词")).rejects.toThrow(
      "unified_memory_search did not return a memories array",
    );
  });

  it("统一记忆 get/create/update/delete 遇到 diagnostic facade 时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "unified_memory_get",
          status: "degraded",
        },
      })
      .mockResolvedValueOnce({
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "unified_memory_create",
          status: "degraded",
        },
      })
      .mockResolvedValueOnce({
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "unified_memory_update",
          status: "degraded",
        },
      })
      .mockResolvedValueOnce({
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "unified_memory_delete",
          status: "degraded",
        },
      });

    await expect(getUnifiedMemory("m1")).rejects.toThrow(
      "unified_memory_get 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(
      createUnifiedMemory({
        session_id: "session-1",
        title: "标题",
        content: "内容",
        summary: "摘要",
      }),
    ).rejects.toThrow(
      "unified_memory_create 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(updateUnifiedMemory("m1", { title: "更新" })).rejects.toThrow(
      "unified_memory_update 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(deleteUnifiedMemory("m1")).rejects.toThrow(
      "unified_memory_delete 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
  });

  it("统一记忆 get/create/update/delete 遇到错误形状时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce("bad")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ deleted: true });

    await expect(getUnifiedMemory("m1")).rejects.toThrow(
      "unified_memory_get did not return a memory object or null",
    );
    await expect(
      createUnifiedMemory({
        session_id: "session-1",
        title: "标题",
        content: "内容",
        summary: "摘要",
      }),
    ).rejects.toThrow("unified_memory_create did not return a memory object");
    await expect(updateUnifiedMemory("m1", { title: "更新" })).rejects.toThrow(
      "unified_memory_update did not return a memory object",
    );
    await expect(deleteUnifiedMemory("m1")).rejects.toThrow(
      "unified_memory_delete did not return a boolean",
    );
  });

  it("统一记忆分析遇到 diagnostic facade 或错误形状时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "unified_memory_analyze",
          status: "degraded",
        },
      })
      .mockResolvedValueOnce({
        analyzed_sessions: 1,
      });

    await expect(analyzeUnifiedMemories()).rejects.toThrow(
      "unified_memory_analyze 尚未接入真实统一记忆分析 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(analyzeUnifiedMemories()).rejects.toThrow(
      "unified_memory_analyze did not return an analysis result",
    );
  });

  it("应代理语义搜索与混合搜索命令", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce([{ id: "m4" }])
      .mockResolvedValueOnce([{ id: "m5" }]);

    await expect(semanticSearch("语义", "context", 0.8, 5)).resolves.toEqual([
      expect.objectContaining({ id: "m4" }),
    ]);
    await expect(
      hybridSearch("混合", "identity", 0.7, 0.4, 6),
    ).resolves.toEqual([expect.objectContaining({ id: "m5" })]);

    expect(safeInvoke).toHaveBeenNthCalledWith(
      1,
      "unified_memory_semantic_search",
      {
        options: {
          query: "语义",
          category: "context",
          min_similarity: 0.8,
          limit: 5,
        },
      },
    );
    expect(safeInvoke).toHaveBeenNthCalledWith(
      2,
      "unified_memory_hybrid_search",
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

  it("语义搜索与混合搜索遇到 diagnostic facade 或非数组返回时应 fail closed", async () => {
    vi.mocked(safeInvoke)
      .mockResolvedValueOnce({
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "unified_memory_semantic_search",
          status: "degraded",
        },
      })
      .mockResolvedValueOnce({ memories: [] })
      .mockResolvedValueOnce({
        diagnostic: {
          source: "electron-host-diagnostic",
          command: "unified_memory_hybrid_search",
          status: "degraded",
        },
      })
      .mockResolvedValueOnce({ memories: [] });

    await expect(semanticSearch("语义")).rejects.toThrow(
      "unified_memory_semantic_search 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(semanticSearch("语义")).rejects.toThrow(
      "unified_memory_semantic_search did not return a memories array",
    );
    await expect(hybridSearch("混合")).rejects.toThrow(
      "unified_memory_hybrid_search 尚未接入真实统一记忆 current 通道，收到 electron-host-diagnostic 诊断返回。",
    );
    await expect(hybridSearch("混合")).rejects.toThrow(
      "unified_memory_hybrid_search did not return a memories array",
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
