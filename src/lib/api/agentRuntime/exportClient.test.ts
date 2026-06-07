import { describe, expect, it, vi } from "vitest";
import { createExportClient } from "./exportClient";
import type { AgentRuntimeCommandInvoke } from "./transport";
import type { AgentRuntimeEvidenceExportAppServerClient } from "./exportClient";

function appServerClientMock(): AgentRuntimeEvidenceExportAppServerClient {
  return {
    exportEvidence: vi.fn().mockResolvedValue({
      id: 1,
      result: {
        session: {
          sessionId: "session-1",
          threadId: "thread-1",
          appId: "desktop",
          workspaceId: "workspace-1",
          status: "running",
          createdAt: "2026-06-06T00:00:00.000Z",
          updatedAt: "2026-06-06T00:00:03.000Z",
        },
        turns: [],
        events: [],
        artifacts: [],
        exportedAt: "2026-06-06T00:00:04.000Z",
        evidencePack: {
          packRelativeRoot: ".lime/harness/sessions/session-1/evidence",
          packAbsoluteRoot:
            "/tmp/work/.lime/harness/sessions/session-1/evidence",
          exportedAt: "2026-06-06T00:00:05.000Z",
          threadStatus: "running",
          latestTurnStatus: "accepted",
          turnCount: 2,
          itemCount: 6,
          pendingRequestCount: 1,
          queuedTurnCount: 0,
          recentArtifactCount: 1,
          knownGaps: [],
          artifacts: [],
        },
      },
      response: { id: 1, result: {} },
      notifications: [],
      messages: [],
    }),
  };
}

describe("agentRuntime exportClient", () => {
  it("exportAgentRuntimeEvidencePack 应走 App Server evidence/export，不回退 legacy command", async () => {
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const client = createExportClient({
      appServerClient,
      invokeCommand,
    });

    await expect(
      client.exportAgentRuntimeEvidencePack(" session-1 "),
    ).resolves.toMatchObject({
      session_id: "session-1",
      thread_id: "thread-1",
      workspace_root: "/tmp/work",
      pack_relative_root: ".lime/harness/sessions/session-1/evidence",
      thread_status: "running",
    });

    expect(appServerClient.exportEvidence).toHaveBeenCalledWith({
      sessionId: "session-1",
      includeEvents: true,
      includeArtifacts: true,
      includeEvidencePack: true,
    });
    expect(invokeCommand).not.toHaveBeenCalled();
  });

  it("缺少 sessionId 时 evidence export 应 fail closed", async () => {
    const appServerClient = appServerClientMock();
    const invokeCommand = vi.fn() as unknown as AgentRuntimeCommandInvoke;
    const client = createExportClient({
      appServerClient,
      invokeCommand,
    });

    await expect(client.exportAgentRuntimeEvidencePack(" ")).rejects.toThrow(
      "sessionId is required to export App Server evidence",
    );

    expect(appServerClient.exportEvidence).not.toHaveBeenCalled();
    expect(invokeCommand).not.toHaveBeenCalled();
  });
});
