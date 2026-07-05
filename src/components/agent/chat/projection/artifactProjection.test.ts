import { describe, expect, it } from "vitest";
import { buildArtifactProjectionEvents } from "./artifactProjection";

const baseContext = {
  sessionId: "session-artifact",
  threadId: "thread-artifact",
  runId: "run-artifact",
  turnId: "turn-artifact",
  timestamp: "2026-06-10T00:00:00.000Z",
};

describe("artifactProjection", () => {
  it("应由 artifact owner 统一分发 artifact_snapshot", () => {
    const events = buildArtifactProjectionEvents(
      {
        type: "artifact_snapshot",
        artifact: {
          artifactId: "artifact-1",
          filePath: ".lime/artifacts/report.md",
          content: "# 报告",
          metadata: {
            complete: false,
          },
        },
      },
      baseContext,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "artifact.updated",
      sourceType: "artifact_snapshot",
      sessionId: "session-artifact",
      threadId: "thread-artifact",
      runId: "run-artifact",
      turnId: "turn-artifact",
      artifactId: "artifact-1",
      owner: "artifact",
      scope: "artifact",
      phase: "producing",
      surface: "artifact_workspace",
      persistence: "artifact_store",
      payload: {
        filePath: ".lime/artifacts/report.md",
        contentLength: 4,
        complete: false,
        metadataKeys: ["complete"],
      },
      refs: {
        artifactIds: ["artifact-1"],
        artifactPaths: [".lime/artifacts/report.md"],
      },
    });
  });

  it("应由 artifact owner 从 metadata 分发 requested fix work item", () => {
    const events = buildArtifactProjectionEvents(
      {
        type: "artifact_snapshot",
        artifact: {
          artifactId: "artifact-fix-1",
          filePath: ".lime/harness/sessions/session-1/review/fix-result.json",
          content: "{}",
          metadata: {
            complete: true,
            reviewId: "review/root",
            requestedFixExecutionResults: [
              {
                requestedFix: "补一条 release note",
                requestedFixIndex: 1,
                executionStatus: "completed",
                regressionOutcome: "recovered",
                summaryPreview: "release note 已补齐并完成回归。",
                resultRef:
                  "agent-runtime://session/session-1/thread/thread-1/turn/turn-review/item/item-fix-1",
                artifactIds: ["artifact-release-note"],
                artifactPaths: ["docs/release-note.md"],
              },
            ],
          },
        },
      },
      { ...baseContext, sequence: 20 },
    );

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "artifact.preview.ready",
      sourceType: "artifact_snapshot",
      artifactId: "artifact-fix-1",
      owner: "artifact",
      phase: "completed",
      surface: "artifact_workspace",
    });
    expect(events[1]).toMatchObject({
      type: "task.changed",
      sourceType: "artifact_snapshot",
      sequence: 21,
      taskId: "review/root:requested-fix:1",
      workItemId: "review/root:requested-fix:1",
      reviewId: "review/root",
      artifactId: "artifact-fix-1",
      owner: "task",
      scope: "task",
      phase: "completed",
      surface: "work_board",
      persistence: "snapshot",
      control: "open_detail",
      topology: "review_team",
      runtimeEntity: "work_item",
      runtimeStatus: "completed",
      payload: {
        taskEvent: "review_requested_fix",
        executionSource: "artifact_snapshot_metadata",
        requestedFix: "补一条 release note",
        requestedFixIndex: 1,
        executionStatus: "completed",
        regressionOutcome: "recovered",
        executionSummaryPreview: "release note 已补齐并完成回归。",
        executionResultRef:
          "agent-runtime://session/session-1/thread/thread-1/turn/turn-review/item/item-fix-1",
        executionArtifactIds: ["artifact-release-note"],
        executionArtifactPaths: ["docs/release-note.md"],
        sourceArtifactId: "artifact-fix-1",
        sourceArtifactPath:
          ".lime/harness/sessions/session-1/review/fix-result.json",
      },
      refs: {
        artifactIds: ["artifact-release-note"],
        artifactPaths: ["docs/release-note.md"],
      },
      rawEventRef: "artifact-fix-1",
    });
  });

  it("应由 artifact owner 统一分发 context_trace", () => {
    const events = buildArtifactProjectionEvents(
      {
        type: "context_trace",
        steps: [
          {
            stage: "retrieval",
            detail: "读取最近会话摘要",
          },
          {
            stage: "memory",
            detail: "注入团队记忆",
          },
        ],
      },
      baseContext,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "context.changed",
      sourceType: "context_trace",
      sessionId: "session-artifact",
      threadId: "thread-artifact",
      runId: "run-artifact",
      turnId: "turn-artifact",
      owner: "context",
      scope: "turn",
      phase: "preparing",
      surface: "runtime_status",
      persistence: "snapshot",
      payload: {
        stepCount: 2,
        latestStage: "memory",
        latestDetailPreview: "注入团队记忆",
      },
    });
  });
});
