import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  scanConversationImportSource,
  type ConversationImportSourceScanResponse,
} from "./conversationImport";

const appServerRequestMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/appServer", () => ({
  AppServerClient: vi.fn(() => ({
    request: appServerRequestMock,
  })),
}));

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

function appServerScanResponse(): ConversationImportSourceScanResponse {
  return {
    source: {
      sourceClient: "codex",
      status: "ready",
      sourceRoot: "/Users/example/.codex",
      readable: true,
      threadCount: 1,
      indexedAt: "2026-06-16T00:00:00.000Z",
      statePath: "/Users/example/.codex/state_5.sqlite",
    },
    threads: [
      {
        sourceClient: "codex",
        sourceThreadId: "thread-1",
        title: "Fix runtime",
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-16T00:00:00.000Z",
        cwd: "/workspace/lime",
        source: "cli",
        modelProvider: "openai",
        archived: false,
        sourcePath: "/Users/example/.codex/sessions/thread-1.jsonl",
        importStatus: "not_imported",
      },
    ],
  };
}

describe("conversationImport API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
  });

  it("应通过 App Server current 主链扫描 Codex 对话来源", async () => {
    const result = appServerScanResponse();
    appServerRequestMock.mockResolvedValueOnce({ result });

    await expect(
      scanConversationImportSource({
        sourceClient: "codex",
        sourceRoot: "/Users/example/.codex",
        projectPath: "/workspace/lime",
        query: "runtime",
        includeArchived: true,
        limit: 20,
      }),
    ).resolves.toEqual(result);

    expect(appServerRequestMock).toHaveBeenCalledWith(
      "conversationImport/source/scan",
      {
        sourceClient: "codex",
        sourceRoot: "/Users/example/.codex",
        projectPath: "/workspace/lime",
        query: "runtime",
        includeArchived: true,
        limit: 20,
      },
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("扫描响应形状异常时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        source: { sourceClient: "codex", status: "ready" },
        threads: [{}],
      },
    });

    await expect(scanConversationImportSource()).rejects.toThrow(
      "conversationImport/source/scan returned an invalid source scan shape",
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });
});
