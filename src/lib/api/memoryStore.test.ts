import { describe, expect, it, vi } from "vitest";
import {
  METHOD_MEMORY_STORE_ADD_NOTE,
  METHOD_MEMORY_STORE_HEALTH,
  METHOD_MEMORY_STORE_LIST,
  METHOD_MEMORY_STORE_READ,
  METHOD_MEMORY_STORE_RESET,
  METHOD_MEMORY_STORE_SEARCH,
} from "../../../packages/app-server-client/src/protocol";
import {
  addMemoryStoreNote,
  getMemoryStoreHealth,
  listMemoryStore,
  readMemoryStore,
  resetMemoryStore,
  searchMemoryStore,
} from "./memoryStore";

function appServerClientMock(result: unknown) {
  return {
    request: vi.fn().mockResolvedValue({
      id: 1,
      result,
      response: { id: 1, result },
      notifications: [],
      messages: [],
    }),
  };
}

describe("memoryStore API", () => {
  it("应通过 App Server current 主链代理 memoryStore/list", async () => {
    const result = {
      rootScope: "workspace",
      path: "",
      entries: [
        {
          path: "memory_summary.md",
          entryType: "file",
          size: 42,
          modifiedAt: 1_785_000_000,
        },
      ],
      truncated: false,
      nextCursor: null,
    };
    const appServerClient = appServerClientMock(result);

    await expect(
      listMemoryStore(
        { scope: "workspace", workspaceRoot: "/repo", maxResults: 20 },
        appServerClient,
      ),
    ).resolves.toEqual(result);

    expect(appServerClient.request).toHaveBeenCalledWith(
      METHOD_MEMORY_STORE_LIST,
      { scope: "workspace", workspaceRoot: "/repo", maxResults: 20 },
    );
  });

  it("应通过 App Server current 主链代理 memoryStore/read 并保留 citation", async () => {
    const result = {
      path: "memory_summary.md",
      startLineNumber: 1,
      content: "summary\n",
      truncated: false,
      citation: {
        path: "memory_summary.md",
        startLineNumber: 1,
        endLineNumber: 1,
      },
    };
    const appServerClient = appServerClientMock(result);

    await expect(
      readMemoryStore(
        {
          scope: "global",
          path: "memory_summary.md",
          maxLines: 10,
          maxTokens: 128,
        },
        appServerClient,
      ),
    ).resolves.toEqual(result);

    expect(appServerClient.request).toHaveBeenCalledWith(
      METHOD_MEMORY_STORE_READ,
      {
        scope: "global",
        path: "memory_summary.md",
        maxLines: 10,
        maxTokens: 128,
      },
    );
  });

  it("应通过 App Server current 主链代理 memoryStore/search 并保留命中行 citation", async () => {
    const result = {
      hits: [
        {
          path: "MEMORY.md",
          matchedQueries: ["voice", "brief"],
          matchLineNumber: 7,
          contentStartLineNumber: 6,
          content: "voice brief\n",
          citation: {
            path: "MEMORY.md",
            startLineNumber: 7,
            endLineNumber: 7,
          },
        },
      ],
      truncated: true,
      nextCursor: "1",
    };
    const appServerClient = appServerClientMock(result);

    await expect(
      searchMemoryStore(
        {
          queries: ["voice", "brief"],
          matchMode: "allWithinLines",
          withinLines: 3,
          contextLines: 1,
        },
        appServerClient,
      ),
    ).resolves.toEqual(result);

    expect(appServerClient.request).toHaveBeenCalledWith(
      METHOD_MEMORY_STORE_SEARCH,
      {
        queries: ["voice", "brief"],
        matchMode: "allWithinLines",
        withinLines: 3,
        contextLines: 1,
      },
    );
  });

  it("应通过 App Server current 主链代理 memoryStore/addNote", async () => {
    const result = {
      path: "extensions/ad_hoc/notes/20260618T010203Z-remember-this.md",
      citation: {
        path: "extensions/ad_hoc/notes/20260618T010203Z-remember-this.md",
        startLineNumber: 1,
        endLineNumber: 1,
      },
    };
    const appServerClient = appServerClientMock(result);

    await expect(
      addMemoryStoreNote(
        {
          scope: "workspace",
          workspaceRoot: "/repo",
          title: "Remember this",
          content: "Prefer concise answers.",
        },
        appServerClient,
      ),
    ).resolves.toEqual(result);

    expect(appServerClient.request).toHaveBeenCalledWith(
      METHOD_MEMORY_STORE_ADD_NOTE,
      {
        scope: "workspace",
        workspaceRoot: "/repo",
        title: "Remember this",
        content: "Prefer concise answers.",
      },
    );
  });

  it("应通过 App Server current 主链代理 memoryStore/health", async () => {
    const result = {
      rootScope: "global",
      rootPath: "/data/memories",
      initialized: true,
      fileCount: 2,
      totalBytes: 12,
      summaryExists: true,
      summaryBytes: 4,
      memoryExists: true,
      memoryBytes: 8,
      notesCount: 0,
    };
    const appServerClient = appServerClientMock(result);

    await expect(
      getMemoryStoreHealth({ scope: "global" }, appServerClient),
    ).resolves.toEqual(result);

    expect(appServerClient.request).toHaveBeenCalledWith(
      METHOD_MEMORY_STORE_HEALTH,
      { scope: "global" },
    );
  });

  it("应通过 App Server current 主链代理 memoryStore/reset", async () => {
    const result = {
      rootScope: "workspace",
      rootPath: "/repo/.lime/memories",
      removedFiles: 3,
      removedDirectories: 4,
      preservedSoul: true,
    };
    const appServerClient = appServerClientMock(result);

    await expect(
      resetMemoryStore(
        { scope: "workspace", workspaceRoot: "/repo" },
        appServerClient,
      ),
    ).resolves.toEqual(result);

    expect(appServerClient.request).toHaveBeenCalledWith(
      METHOD_MEMORY_STORE_RESET,
      { scope: "workspace", workspaceRoot: "/repo" },
    );
  });

  it("响应形状异常时应 fail closed", async () => {
    await expect(
      listMemoryStore({}, appServerClientMock({ entries: [] })),
    ).rejects.toThrow(
      `${METHOD_MEMORY_STORE_LIST} returned an invalid memory store list response`,
    );
    await expect(
      readMemoryStore(
        { path: "memory_summary.md" },
        appServerClientMock({ path: "memory_summary.md" }),
      ),
    ).rejects.toThrow(
      `${METHOD_MEMORY_STORE_READ} returned an invalid memory store read response`,
    );
    await expect(
      searchMemoryStore({ queries: ["x"] }, appServerClientMock({ hits: [] })),
    ).rejects.toThrow(
      `${METHOD_MEMORY_STORE_SEARCH} returned an invalid memory store search response`,
    );
    await expect(
      addMemoryStoreNote(
        { content: "x" },
        appServerClientMock({ path: "notes/x.md" }),
      ),
    ).rejects.toThrow(
      `${METHOD_MEMORY_STORE_ADD_NOTE} returned an invalid memory store add note response`,
    );
    await expect(
      getMemoryStoreHealth({}, appServerClientMock({ rootScope: "global" })),
    ).rejects.toThrow(
      `${METHOD_MEMORY_STORE_HEALTH} returned an invalid memory store health response`,
    );
    await expect(
      resetMemoryStore({}, appServerClientMock({ rootScope: "global" })),
    ).rejects.toThrow(
      `${METHOD_MEMORY_STORE_RESET} returned an invalid memory store reset response`,
    );
  });
});
