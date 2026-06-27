import { beforeEach, describe, expect, it, vi } from "vitest";
import { safeInvoke } from "@/lib/dev-bridge";
import {
  drainExecutionProcessOutput,
  interruptExecutionProcess,
  readExecutionProcessStatus,
  startExecutionProcess,
  terminateExecutionProcess,
  writeExecutionProcessStdin,
  type ExecutionProcessAppServerClient,
} from "./executionProcess";

vi.mock("@/lib/dev-bridge", () => ({
  safeInvoke: vi.fn(),
}));

function appServerResult<T>(result: T) {
  return {
    id: 1,
    result,
    response: { jsonrpc: "2.0" as const, id: 1, result },
    notifications: [],
    messages: [],
  };
}

function statusResult(processId = "process-1") {
  return {
    snapshot: {
      processId,
      toolId: "tool-1",
      toolName: "Bash",
      status: "running" as const,
      exitCode: null,
      elapsedMs: 120,
      outputBytes: 8,
      outputOmittedBytes: 0,
      outputTruncated: false,
      retainedOutput: "running",
      failure: null,
    },
  };
}

function clientMock(): ExecutionProcessAppServerClient {
  return {
    startExecutionProcess: vi.fn(),
    writeExecutionProcessStdin: vi.fn(),
    interruptExecutionProcess: vi.fn(),
    terminateExecutionProcess: vi.fn(),
    readExecutionProcessStatus: vi.fn(),
    drainExecutionProcessOutput: vi.fn(),
  };
}

describe("executionProcess API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应通过 App Server current 主链启动 execution process", async () => {
    const client = clientMock();
    vi.mocked(client.startExecutionProcess).mockResolvedValueOnce(
      appServerResult(statusResult()),
    );

    const params = {
      processId: "process-1",
      toolId: "tool-1",
      toolName: "Bash",
      command: ["sh", "-c", "npm test"],
      workingDirectory: "/workspace",
      approvalPolicy: "never",
      sandboxPolicy: "danger-full-access",
    };

    await expect(startExecutionProcess(params, client)).resolves.toEqual(
      statusResult(),
    );
    expect(client.startExecutionProcess).toHaveBeenCalledWith(params);
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("应通过 App Server current 主链写入 stdin", async () => {
    const client = clientMock();
    vi.mocked(client.writeExecutionProcessStdin).mockResolvedValueOnce(
      appServerResult({}),
    );

    await expect(
      writeExecutionProcessStdin(
        { processId: "process-1", data: "y\n" },
        client,
      ),
    ).resolves.toEqual({});
    expect(client.writeExecutionProcessStdin).toHaveBeenCalledWith({
      processId: "process-1",
      data: "y\n",
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("应通过 App Server current 主链控制和读取 process 状态", async () => {
    const client = clientMock();
    vi.mocked(client.interruptExecutionProcess).mockResolvedValueOnce(
      appServerResult(statusResult("process-int")),
    );
    vi.mocked(client.terminateExecutionProcess).mockResolvedValueOnce(
      appServerResult(statusResult("process-term")),
    );
    vi.mocked(client.readExecutionProcessStatus).mockResolvedValueOnce(
      appServerResult(statusResult("process-status")),
    );

    await expect(
      interruptExecutionProcess(" process-int ", client),
    ).resolves.toEqual(statusResult("process-int"));
    await expect(
      terminateExecutionProcess("process-term", client),
    ).resolves.toEqual(statusResult("process-term"));
    await expect(
      readExecutionProcessStatus("process-status", client),
    ).resolves.toEqual(statusResult("process-status"));

    expect(client.interruptExecutionProcess).toHaveBeenCalledWith({
      processId: "process-int",
    });
    expect(client.terminateExecutionProcess).toHaveBeenCalledWith({
      processId: "process-term",
    });
    expect(client.readExecutionProcessStatus).toHaveBeenCalledWith({
      processId: "process-status",
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("应通过 App Server current 主链 drain process output", async () => {
    const client = clientMock();
    const result = {
      deltas: [
        {
          processId: "process-1",
          toolId: "tool-1",
          sequence: 1,
          kind: "stdout" as const,
          delta: "ok",
          bytes: 2,
          omittedBytes: 0,
          truncated: false,
        },
      ],
      nextSequence: 1,
    };
    vi.mocked(client.drainExecutionProcessOutput).mockResolvedValueOnce(
      appServerResult(result),
    );

    await expect(
      drainExecutionProcessOutput(
        { processId: "process-1", afterSequence: 0, limit: 16, maxBytes: 1024 },
        client,
      ),
    ).resolves.toEqual(result);
    expect(client.drainExecutionProcessOutput).toHaveBeenCalledWith({
      processId: "process-1",
      afterSequence: 0,
      limit: 16,
      maxBytes: 1024,
    });
    expect(safeInvoke).not.toHaveBeenCalled();
  });

  it("空 processId 应 fail closed", async () => {
    const client = clientMock();

    await expect(interruptExecutionProcess("  ", client)).rejects.toThrow(
      "executionProcess requires processId",
    );
    expect(client.interruptExecutionProcess).not.toHaveBeenCalled();
    expect(safeInvoke).not.toHaveBeenCalled();
  });
});
