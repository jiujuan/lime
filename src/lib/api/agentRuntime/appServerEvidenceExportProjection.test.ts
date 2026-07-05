import { describe, expect, it } from "vitest";
import { projectAppServerEvidenceExportToRuntimeEvidencePack } from "./appServerEvidenceExportProjection";
import type { AppServerEvidenceExportResponse } from "@/lib/api/appServer";

function evidenceExportResponse(
  overrides: Partial<AppServerEvidenceExportResponse["evidencePack"]> = {},
): AppServerEvidenceExportResponse {
  return {
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
      packAbsoluteRoot: "/tmp/work/.lime/harness/sessions/session-1/evidence",
      exportedAt: "2026-06-06T00:00:05.000Z",
      threadStatus: "running",
      latestTurnStatus: "accepted",
      turnCount: 2,
      itemCount: 6,
      pendingRequestCount: 1,
      queuedTurnCount: 0,
      recentArtifactCount: 1,
      knownGaps: ["gui_smoke_not_run"],
      observabilitySummary: {
        schema_version: "runtime-evidence-pack.v1",
        skillInvocations: [
          {
            event: "skill_invocation",
            skillName: "project:capability-report",
            status: "completed",
            sourceEventId: "evt-skill-1",
            sourceEventType: "tool.result",
            turnId: "turn-1",
            toolCallId: "skill-call-1",
            workspaceSkillRuntimeEnable: {
              approval: "manual",
              source: "manual_session_enable",
            },
          },
        ],
        skillSearches: [
          {
            event: "skill_search",
            query: "capability report",
            resultCount: 2,
            snapshotSkillCount: 7,
            status: "completed",
            sourceEventId: "evt-skill-search-1",
            sourceEventType: "tool.result",
            turnId: "turn-1",
            toolCallId: "skill-search-call-1",
          },
        ],
        mcpToolResults: [
          {
            event: "mcp_tool_result",
            toolName: "mcp__docs__search_docs",
            status: "completed",
            sourceEventId: "evt-mcp-1",
            sourceEventType: "tool.result",
            hasStructuredContent: true,
            structuredContentKeys: ["answer", "ids"],
            turnId: "turn-1",
            toolCallId: "mcp-search-call-1",
          },
        ],
        mcpResourceReads: [
          {
            event: "mcp_resource_read",
            toolName: "ReadMcpResourceTool",
            server: "docs",
            uri: "file:///docs/intro.md",
            status: "completed",
            sourceEventId: "evt-mcp-resource-1",
            sourceEventType: "tool.result",
            mimeTypes: ["text/markdown"],
            contentCount: 1,
            contentRefs: [
              {
                index: 0,
                type: "text",
                uri: "file:///docs/intro.md",
                mimeType: "text/markdown",
                textCharCount: 64,
              },
            ],
            turnId: "turn-1",
            toolCallId: "mcp-resource-call-1",
          },
        ],
      },
      completionAuditSummary: {
        source: "runtime_evidence_pack_completion_audit",
        decision: "in_progress",
        ownerRunCount: 1,
        successfulOwnerRunCount: 1,
        workspaceSkillToolCallCount: 1,
        artifactCount: 1,
        ownerAuditStatuses: ["audit_input_ready"],
        requiredEvidence: {
          automationOwner: true,
          workspaceSkillToolCall: true,
          artifactOrTimeline: true,
        },
        blockingReasons: [],
        notes: ["等待 GUI evidence。"],
      },
      artifacts: [
        {
          kind: "summary",
          title: "Evidence Summary",
          relativePath: ".lime/harness/sessions/session-1/evidence/summary.md",
          absolutePath:
            "/tmp/work/.lime/harness/sessions/session-1/evidence/summary.md",
          bytes: 128,
        },
      ],
      ...overrides,
    },
  };
}

describe("appServerEvidenceExportProjection", () => {
  it("应把 App Server evidence/export 投影为旧 UI 使用的 Evidence Pack 形状", () => {
    const pack = projectAppServerEvidenceExportToRuntimeEvidencePack(
      evidenceExportResponse(),
    );

    expect(pack).toMatchObject({
      session_id: "session-1",
      thread_id: "thread-1",
      workspace_id: "workspace-1",
      workspace_root: "/tmp/work",
      pack_relative_root: ".lime/harness/sessions/session-1/evidence",
      pack_absolute_root: "/tmp/work/.lime/harness/sessions/session-1/evidence",
      exported_at: "2026-06-06T00:00:05.000Z",
      thread_status: "running",
      latest_turn_status: "accepted",
      turn_count: 2,
      item_count: 6,
      pending_request_count: 1,
      queued_turn_count: 0,
      recent_artifact_count: 1,
      known_gaps: ["gui_smoke_not_run"],
      completion_audit_summary: expect.objectContaining({
        decision: "in_progress",
        owner_run_count: 1,
        workspace_skill_tool_call_count: 1,
        required_evidence: expect.objectContaining({
          automation_owner: true,
          workspace_skill_tool_call: true,
          artifact_or_timeline: true,
        }),
      }),
      observability_summary: expect.objectContaining({
        skill_invocations: [
          expect.objectContaining({
            event: "skill_invocation",
            skill_name: "project:capability-report",
            status: "completed",
            source_event_id: "evt-skill-1",
            source_event_type: "tool.result",
            turn_id: "turn-1",
            tool_call_id: "skill-call-1",
            workspace_skill_runtime_enable: expect.objectContaining({
              approval: "manual",
            }),
          }),
        ],
        skill_searches: [
          expect.objectContaining({
            event: "skill_search",
            query: "capability report",
            result_count: 2,
            snapshot_skill_count: 7,
            status: "completed",
            source_event_id: "evt-skill-search-1",
            source_event_type: "tool.result",
            turn_id: "turn-1",
            tool_call_id: "skill-search-call-1",
          }),
        ],
        mcp_tool_results: [
          expect.objectContaining({
            event: "mcp_tool_result",
            tool_name: "mcp__docs__search_docs",
            status: "completed",
            source_event_id: "evt-mcp-1",
            source_event_type: "tool.result",
            has_structured_content: true,
            structured_content_keys: ["answer", "ids"],
            turn_id: "turn-1",
            tool_call_id: "mcp-search-call-1",
          }),
        ],
        mcp_resource_reads: [
          expect.objectContaining({
            event: "mcp_resource_read",
            tool_name: "ReadMcpResourceTool",
            server: "docs",
            uri: "file:///docs/intro.md",
            status: "completed",
            source_event_id: "evt-mcp-resource-1",
            source_event_type: "tool.result",
            mime_types: ["text/markdown"],
            content_count: 1,
            content_refs: [
              expect.objectContaining({
                index: 0,
                type: "text",
                uri: "file:///docs/intro.md",
                mime_type: "text/markdown",
                text_char_count: 64,
              }),
            ],
            turn_id: "turn-1",
            tool_call_id: "mcp-resource-call-1",
          }),
        ],
      }),
      artifacts: [
        expect.objectContaining({
          kind: "summary",
          relative_path: ".lime/harness/sessions/session-1/evidence/summary.md",
          absolute_path:
            "/tmp/work/.lime/harness/sessions/session-1/evidence/summary.md",
          bytes: 128,
        }),
      ],
    });
  });

  it("Windows 路径也应能从 packAbsoluteRoot 推导 workspace_root", () => {
    const pack = projectAppServerEvidenceExportToRuntimeEvidencePack(
      evidenceExportResponse({
        packRelativeRoot: ".lime\\harness\\sessions\\session-1\\evidence",
        packAbsoluteRoot:
          "C:\\work\\.lime\\harness\\sessions\\session-1\\evidence",
      }),
    );

    expect(pack.workspace_root).toBe("C:\\work");
  });

  it("缺少 evidencePack 时应 fail closed", () => {
    expect(() =>
      projectAppServerEvidenceExportToRuntimeEvidencePack({
        ...evidenceExportResponse(),
        evidencePack: undefined,
      }),
    ).toThrow("App Server evidence/export did not return evidencePack");
  });

  it("缺少 session / thread 关联时应 fail closed", () => {
    expect(() =>
      projectAppServerEvidenceExportToRuntimeEvidencePack({
        ...evidenceExportResponse(),
        session: {
          ...evidenceExportResponse().session,
          sessionId: "",
        },
      }),
    ).toThrow("App Server evidence/export did not return session.sessionId");

    expect(() =>
      projectAppServerEvidenceExportToRuntimeEvidencePack({
        ...evidenceExportResponse(),
        session: {
          ...evidenceExportResponse().session,
          threadId: "",
        },
      }),
    ).toThrow("App Server evidence/export did not return session.threadId");
  });

  it("缺少 evidence pack summary 关键字段时应 fail closed", () => {
    expect(() =>
      projectAppServerEvidenceExportToRuntimeEvidencePack(
        evidenceExportResponse({
          packRelativeRoot: "",
        }),
      ),
    ).toThrow(
      "App Server evidence/export did not return evidencePack.packRelativeRoot",
    );

    expect(() =>
      projectAppServerEvidenceExportToRuntimeEvidencePack(
        evidenceExportResponse({
          exportedAt: "",
        }),
      ),
    ).toThrow("App Server evidence/export did not return evidencePack.exportedAt");

    expect(() =>
      projectAppServerEvidenceExportToRuntimeEvidencePack(
        evidenceExportResponse({
          threadStatus: "",
        }),
      ),
    ).toThrow(
      "App Server evidence/export did not return evidencePack.threadStatus",
    );
  });

  it("缺少 evidence pack runtime 计数时应 fail closed", () => {
    expect(() =>
      projectAppServerEvidenceExportToRuntimeEvidencePack(
        evidenceExportResponse({
          turnCount: Number.NaN,
        }),
      ),
    ).toThrow("App Server evidence/export did not return evidencePack.turnCount");

    expect(() =>
      projectAppServerEvidenceExportToRuntimeEvidencePack(
        evidenceExportResponse({
          itemCount: Number.POSITIVE_INFINITY,
        }),
      ),
    ).toThrow("App Server evidence/export did not return evidencePack.itemCount");

    expect(() =>
      projectAppServerEvidenceExportToRuntimeEvidencePack(
        evidenceExportResponse({
          pendingRequestCount: undefined,
        }),
      ),
    ).toThrow(
      "App Server evidence/export did not return evidencePack.pendingRequestCount",
    );

    expect(() =>
      projectAppServerEvidenceExportToRuntimeEvidencePack(
        evidenceExportResponse({
          queuedTurnCount: undefined,
        }),
      ),
    ).toThrow(
      "App Server evidence/export did not return evidencePack.queuedTurnCount",
    );

    expect(() =>
      projectAppServerEvidenceExportToRuntimeEvidencePack(
        evidenceExportResponse({
          recentArtifactCount: undefined,
        }),
      ),
    ).toThrow(
      "App Server evidence/export did not return evidencePack.recentArtifactCount",
    );
  });
});
