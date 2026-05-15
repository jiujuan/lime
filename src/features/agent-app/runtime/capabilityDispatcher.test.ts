import { describe, expect, it } from "vitest";
import { AdapterCapabilityHost } from "../adapters/AdapterCapabilityHost";
import { InMemoryAgentAppCapabilityStore } from "../adapters/InMemoryAgentAppCapabilityStore";
import { buildInstalledAppPreview } from "../install/installedAppPreview";
import type {
  AgentAppArtifactRecord,
  AgentAppEvidenceRecord,
  AgentAppStorageEntry,
  AgentAppTaskRecord,
  AgentAppTaskStreamEvent,
} from "../types";
import { buildWorkflowRuntimeCapabilityProfile } from "./workflowRuntimeCapabilityProfile";
import {
  AgentAppCapabilityDispatcherError,
  createAgentAppCapabilityDispatcher,
} from "./capabilityDispatcher";

const FIXED_NOW = "2026-05-15T00:00:00.000Z";

function buildDispatcher() {
  const preview = buildInstalledAppPreview({
    profile: buildWorkflowRuntimeCapabilityProfile({
      realAdapterEnabled: true,
      uiRuntimeEnabled: true,
      workerRuntimeEnabled: true,
    }),
    loadedAt: FIXED_NOW,
    checkedAt: FIXED_NOW,
    generatedAt: FIXED_NOW,
  });
  const host = new AdapterCapabilityHost({
    preview,
    store: new InMemoryAgentAppCapabilityStore(),
    now: () => FIXED_NOW,
  });

  return createAgentAppCapabilityDispatcher({
    host,
    projection: preview.projection,
    entryKey: "dashboard",
    runId: "bridge-run-1",
  });
}

describe("createAgentAppCapabilityDispatcher", () => {
  it("应把 App capability 请求收敛到 Lime Agent task，并保留 stream/cancel 事件", async () => {
    const dispatch = buildDispatcher();

    const task = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      requestId: "req-task",
      capability: "lime.agent",
      method: "startTask",
      input: {
        title: "生成内容场景",
        prompt: "基于项目知识生成内容规划",
        taskKind: "content.scenario_planning",
        idempotencyKey: "dashboard:scenario",
        input: { projectId: "project-1" },
        expectedOutput: { artifactKind: "content_table" },
        humanReview: true,
      },
      rawPayload: {
        capability: "lime.agent",
        method: "startTask",
      },
    })) as AgentAppTaskRecord;

    expect(task).toMatchObject({
      taskId: "adapter-task-1",
      traceId: "adapter-trace-1",
      entryKey: "dashboard",
      taskKind: "content.scenario_planning",
      idempotencyKey: "dashboard:scenario",
      input: { projectId: "project-1" },
      expectedOutput: { artifactKind: "content_table" },
      humanReview: true,
      provenance: expect.objectContaining({
        workflowRunId: "bridge-run-1",
      }),
      events: [
        expect.objectContaining({ type: "task:status", status: "running" }),
      ],
    });

    const runningEvents = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.agent",
      method: "streamTask",
      input: { taskId: task.taskId },
      rawPayload: {
        capability: "lime.agent",
        method: "streamTask",
      },
    })) as AgentAppTaskStreamEvent[];
    expect(runningEvents).toEqual([
      expect.objectContaining({ type: "task:status", status: "running" }),
    ]);

    const hostResponse = await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.agent",
      method: "submitHostResponse",
      input: {
        taskId: task.taskId,
        requestId: "runtime-request-1",
        actionType: "ask_user",
        response: "补充项目定位。",
      },
      rawPayload: {
        capability: "lime.agent",
        method: "submitHostResponse",
      },
    });
    expect(hostResponse).toEqual({
      taskId: "adapter-task-1",
      requestId: "runtime-request-1",
      status: "submitted",
      submittedAt: FIXED_NOW,
    });

    const cancelled = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.agent",
      method: "cancelTask",
      input: { taskId: task.taskId },
      rawPayload: {
        capability: "lime.agent",
        method: "cancelTask",
      },
    })) as AgentAppTaskRecord;
    expect(cancelled).toMatchObject({
      taskId: "adapter-task-1",
      status: "cancelled",
      cancelledAt: FIXED_NOW,
      events: [
        expect.objectContaining({ type: "task:status", status: "running" }),
        expect.objectContaining({
          type: "task:progress",
          message: "Agent App host response 已提交。",
        }),
        expect.objectContaining({
          type: "task:cancelled",
          status: "cancelled",
        }),
      ],
    });

    const fetched = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.agent",
      method: "getTask",
      input: { taskId: task.taskId },
      rawPayload: {
        capability: "lime.agent",
        method: "getTask",
      },
    })) as AgentAppTaskRecord;
    expect(fetched).toMatchObject({
      taskId: "adapter-task-1",
      status: "cancelled",
    });

    const retried = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.agent",
      method: "retryTask",
      input: { taskId: task.taskId },
      rawPayload: {
        capability: "lime.agent",
        method: "retryTask",
      },
    })) as AgentAppTaskRecord;
    expect(retried).toMatchObject({
      taskId: "adapter-task-2",
      traceId: "adapter-trace-2",
      retryOfTaskId: "adapter-task-1",
      retryAttempt: 1,
      status: "running",
      idempotencyKey: "dashboard:scenario:retry:1",
      provenance: expect.objectContaining({
        workflowRunId: "bridge-run-1",
      }),
      events: [
        expect.objectContaining({ type: "task:status", status: "running" }),
      ],
    });
  });

  it("应支持 storage 能力，同时拒绝未登记的方法", async () => {
    const dispatch = buildDispatcher();

    const stored = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.storage",
      method: "set",
      input: {
        key: "drafts/scenario",
        value: { title: "内容场景草稿" },
      },
      rawPayload: {
        capability: "lime.storage",
        method: "set",
      },
    })) as AgentAppStorageEntry;

    expect(stored).toMatchObject({
      key: "drafts/scenario",
      value: { title: "内容场景草稿" },
      provenance: expect.objectContaining({
        workflowRunId: "bridge-run-1",
      }),
    });
    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.storage",
        method: "dropDatabase",
        rawPayload: {
          capability: "lime.storage",
          method: "dropDatabase",
        },
      }),
    ).rejects.toBeInstanceOf(AgentAppCapabilityDispatcherError);
  });

  it("应只允许声明过的 artifact / evidence 写回", async () => {
    const dispatch = buildDispatcher();

    const artifact = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.artifacts",
      method: "create",
      input: {
        kind: "content_table",
        title: "内容表",
        content: { rows: [] },
      },
      rawPayload: {
        capability: "lime.artifacts",
        method: "create",
      },
    })) as AgentAppArtifactRecord;
    expect(artifact).toMatchObject({
      kind: "content_table",
      title: "内容表",
      provenance: expect.objectContaining({
        appId: "content-factory-app",
        workflowRunId: "bridge-run-1",
      }),
    });

    const evidence = (await dispatch({
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.evidence",
      method: "record",
      input: {
        kind: "fact_grounding",
        message: "声明过的事实支撑证据。",
        refs: [artifact.id],
      },
      rawPayload: {
        capability: "lime.evidence",
        method: "record",
      },
    })) as AgentAppEvidenceRecord;
    expect(evidence).toMatchObject({
      kind: "fact_grounding",
      refs: [artifact.id],
      provenance: expect.objectContaining({
        appId: "content-factory-app",
        workflowRunId: "bridge-run-1",
      }),
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.artifacts",
        method: "create",
        input: {
          kind: "undeclared_asset_pack",
          title: "未声明资产包",
          content: {},
        },
        rawPayload: {
          capability: "lime.artifacts",
          method: "create",
        },
      }),
    ).rejects.toMatchObject({
      code: "WRITEBACK_NOT_DECLARED",
    });

    await expect(
      dispatch({
        appId: "content-factory-app",
        entryKey: "dashboard",
        capability: "lime.evidence",
        method: "record",
        input: {
          kind: "undeclared_evidence_subject",
          message: "未声明证据。",
        },
        rawPayload: {
          capability: "lime.evidence",
          method: "record",
        },
      }),
    ).rejects.toMatchObject({
      code: "WRITEBACK_NOT_DECLARED",
    });
  });
});
