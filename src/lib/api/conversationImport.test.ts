import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import { CONVERSATION_IMPORT_SOURCE_CLIENTS } from "../../../packages/app-server-client/src/protocol";
import {
  commitConversationImportThread,
  previewConversationImportThread,
  readConversationImportJob,
  scanConversationImportSource,
  waitForConversationImportJob,
  type ConversationImportJob,
  type ConversationImportThreadCommitStartResponse,
  type ConversationImportSourceScanResponse,
  type ConversationImportThreadCommitResponse,
  type ConversationImportThreadPreviewResponse,
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
      sourceHomeExists: true,
      stateDbReadable: true,
      rolloutFileCount: 3,
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
        metadata: {
          model: "gpt-5.5",
          reasoningEffort: "xhigh",
          cliVersion: "0.139.0",
        },
      },
    ],
  };
}

function appServerPreviewResponse(): ConversationImportThreadPreviewResponse {
  const scan = appServerScanResponse();
  return {
    source: scan.source,
    thread: scan.threads[0],
    summary: {
      lineCount: 4,
      messageCount: 2,
      rolloutEventItems: 1,
      unsupportedCount: 1,
      dryRun: {
        willCreateSession: true,
        willAppendToExistingSession: false,
        willImportMessages: 2,
        willImportTurns: 1,
        willImportTimelineItems: 3,
        willImportAttachments: 1,
        unsupportedItems: 1,
      },
      fidelity: {
        messages: 2,
        reasoning: 0,
        tools: 1,
        commands: 1,
        patches: 0,
        approvals: 0,
        mcp: 0,
        webSearch: 0,
        attachments: 1,
        unsupported: 1,
        provenanceOnly: 1,
        budgetDropped: 0,
      },
      truncated: false,
      warnings: [
        "Some source rollout items are counted but not shown in preview.",
      ],
    },
    messages: [
      {
        role: "user",
        text: "hello",
        attachments: [
          {
            kind: "image",
            uri: "data:image/png;base64,abc",
            metadata: {
              mediaType: "image/png",
              sourceType: "response_item",
            },
          },
        ],
        truncated: false,
        omittedBytes: 0,
        timestamp: "2026-06-16T00:00:00.000Z",
        sourceType: "response_item",
        provenance: {
          sourceClient: "codex",
          sourceThreadId: "thread-1",
          sourcePath: "/Users/example/.codex/sessions/thread-1.jsonl",
          sourceEventType: "response_item",
          sourceEventSeq: 2,
          sourcePayloadType: "message",
          sourceRole: "user",
        },
      },
      {
        role: "assistant",
        text: "world",
        attachments: [],
        truncated: false,
        omittedBytes: 0,
        timestamp: "2026-06-16T00:00:01.000Z",
        sourceType: "response_item",
        provenance: {
          sourceClient: "codex",
          sourceThreadId: "thread-1",
          sourcePath: "/Users/example/.codex/sessions/thread-1.jsonl",
          sourceEventType: "response_item",
          sourceEventSeq: 3,
          sourcePayloadType: "message",
          sourceRole: "assistant",
        },
      },
    ],
    events: [
      {
        kind: "user_message",
        timestamp: "2026-06-16T00:00:00.000Z",
        label: "hello",
        provenance: {
          sourceClient: "codex",
          sourceThreadId: "thread-1",
          sourceEventType: "event_msg",
          sourceEventSeq: 1,
          sourcePayloadType: "user_message",
        },
      },
    ],
  };
}

function appServerCommitResponse(): ConversationImportThreadCommitResponse {
  const preview = appServerPreviewResponse();
  return {
    session: {
      sessionId: "sess-imported",
      threadId: "thread-imported",
      appId: "content-studio",
      workspaceId: "workspace-1",
      businessObjectRef: {
        kind: "conversation.import",
        id: "thread-1",
        title: "Fix runtime",
        uri: "/Users/example/.codex/sessions/thread-1.jsonl",
        metadata: {
          sourceClient: "codex",
          sourceThreadId: "thread-1",
        },
      },
      status: "completed",
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:01.000Z",
    },
    thread: {
      ...preview.thread,
      importStatus: "imported",
    },
    summary: preview.summary,
    importedMessages: 2,
    importedTurns: 1,
    canContinue: true,
    warnings: ["Imported source user/assistant messages."],
  };
}

function appServerImportJob(
  status: ConversationImportJob["status"] = "queued",
): ConversationImportJob {
  const completed = status === "completed";
  return {
    jobId: "import-job-1",
    sourceClient: "codex",
    sourceThreadId: "thread-1",
    status,
    progress: {
      phase: completed
        ? "completed"
        : status === "failed"
          ? "failed"
          : "queued",
      completedItems: completed ? 3 : 0,
      totalItems: completed ? 3 : 0,
      completedTurns: completed ? 1 : 0,
      totalTurns: completed ? 1 : 0,
    },
    ...(completed ? { result: appServerCommitResponse() } : {}),
    ...(status === "failed" ? { error: "source history is invalid" } : {}),
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:01.000Z",
  };
}

function appServerCommitStartResponse(): ConversationImportThreadCommitStartResponse {
  return { job: appServerImportJob() };
}

describe("conversationImport API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appServerRequestMock.mockReset();
  });

  it("导入来源协议枚举由 app-server-client 统一导出", () => {
    expect([...CONVERSATION_IMPORT_SOURCE_CLIENTS]).toEqual(["codex"]);
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

  it("应通过 App Server current 主链读取 Codex 线程预览，供导入确认弹窗使用", async () => {
    const result = appServerPreviewResponse();
    appServerRequestMock.mockResolvedValueOnce({ result });

    await expect(
      previewConversationImportThread({
        sourceClient: "codex",
        sourceRoot: "/Users/example/.codex",
        sourceThreadId: "thread-1",
        limit: 10,
      }),
    ).resolves.toEqual(result);

    expect(appServerRequestMock).toHaveBeenCalledWith(
      "conversationImport/thread/preview",
      {
        sourceClient: "codex",
        sourceRoot: "/Users/example/.codex",
        sourceThreadId: "thread-1",
        limit: 10,
      },
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("线程预览响应形状异常时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        source: appServerScanResponse().source,
        thread: appServerScanResponse().threads[0],
        summary: { messageCount: 2 },
        messages: [{}],
        events: [],
      },
    });

    await expect(
      previewConversationImportThread({ sourceThreadId: "thread-1" }),
    ).rejects.toThrow(
      "conversationImport/thread/preview returned an invalid thread preview shape",
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("线程预览缺少 dry-run impact summary 时应 fail closed", async () => {
    const result = appServerPreviewResponse();
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        ...result,
        summary: {
          ...result.summary,
          dryRun: undefined,
        },
      },
    });

    await expect(
      previewConversationImportThread({ sourceThreadId: "thread-1" }),
    ).rejects.toThrow(
      "conversationImport/thread/preview returned an invalid thread preview shape",
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("应通过 App Server current 主链在用户确认后启动后台导入", async () => {
    const result = appServerCommitStartResponse();
    appServerRequestMock.mockResolvedValueOnce({ result });

    await expect(
      commitConversationImportThread({
        sourceClient: "codex",
        sourceRoot: "/Users/example/.codex",
        sourceThreadId: "thread-1",
        workspaceId: "workspace-1",
        confirmed: true,
      }),
    ).resolves.toEqual(result);

    expect(appServerRequestMock).toHaveBeenCalledWith(
      "conversationImport/thread/commit",
      {
        sourceClient: "codex",
        sourceRoot: "/Users/example/.codex",
        sourceThreadId: "thread-1",
        workspaceId: "workspace-1",
        confirmed: true,
      },
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("重新导入时应透传 replaceExisting 到 App Server current 主链", async () => {
    const result = appServerCommitStartResponse();
    appServerRequestMock.mockResolvedValueOnce({ result });

    await expect(
      commitConversationImportThread({
        sourceClient: "codex",
        sourceRoot: "/Users/example/.codex",
        sourceThreadId: "thread-1",
        workspaceId: "workspace-1",
        confirmed: true,
        replaceExisting: true,
      }),
    ).resolves.toEqual(result);

    expect(appServerRequestMock).toHaveBeenCalledWith(
      "conversationImport/thread/commit",
      {
        sourceClient: "codex",
        sourceRoot: "/Users/example/.codex",
        sourceThreadId: "thread-1",
        workspaceId: "workspace-1",
        confirmed: true,
        replaceExisting: true,
      },
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("线程导入未返回后台 job 时应 fail closed", async () => {
    appServerRequestMock.mockResolvedValueOnce({
      result: {
        job: { jobId: "invalid" },
      },
    });

    await expect(
      commitConversationImportThread({
        sourceThreadId: "thread-1",
        confirmed: true,
      }),
    ).rejects.toThrow(
      "conversationImport/thread/commit did not return an import job",
    );
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("应通过 job/read 读取后台导入终态", async () => {
    const result = { job: appServerImportJob("completed") };
    appServerRequestMock.mockResolvedValueOnce({ result });

    await expect(
      readConversationImportJob({ jobId: "import-job-1" }),
    ).resolves.toEqual(result);
    expect(appServerRequestMock).toHaveBeenCalledWith(
      "conversationImport/job/read",
      { jobId: "import-job-1" },
    );
  });

  it("后台导入完成后应返回 canonical commit result", async () => {
    await expect(
      waitForConversationImportJob(appServerImportJob("completed")),
    ).resolves.toEqual(appServerCommitResponse());
    expect(appServerRequestMock).not.toHaveBeenCalled();
  });

  it("后台导入失败时应保留 App Server 错误", async () => {
    await expect(
      waitForConversationImportJob(appServerImportJob("failed")),
    ).rejects.toThrow("source history is invalid");
    expect(appServerRequestMock).not.toHaveBeenCalled();
  });

  it("关闭导入弹窗时只中止 Renderer 观察，不取消 App Server job", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      waitForConversationImportJob(appServerImportJob(), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(appServerRequestMock).not.toHaveBeenCalled();
  });
});
