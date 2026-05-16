import { describe, expect, it } from "vitest";
import type { AgentAppTaskRecord } from "../types";
import { buildAdapterCapabilityProfile } from "../adapters/adapterCapabilityProfile";
import { p0HostCapabilityProfile } from "../readiness/hostCapabilityProfile";
import {
  AgentAppCapabilityError,
  normalizeLimeCapabilityErrorCode,
  toLimeCapabilityError,
} from "./capabilityErrors";
import {
  LIME_CAPABILITY_DEFINITIONS,
  LIME_CAPABILITY_NAMES,
  buildLimeCapabilityProfileEntriesForMode,
  listEnabledLimeCapabilityNamesForMode,
} from "./capabilityCatalog";
import {
  buildLimeCapabilityInvokeProvenance,
  buildLimeCapabilityInvokeRequest,
  createLimeCapabilityInvoker,
  createMockLimeCapabilityTransport,
} from "./capabilityContract";
import { buildMockCapabilityProfile } from "./mockCapabilityProfile";

const provenance = buildLimeCapabilityInvokeProvenance({
  sourceKind: "agent_app",
  appId: "content-factory-app",
  appVersion: "1.0.0",
  packageHash:
    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  manifestHash:
    "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  entryKey: "dashboard",
  workflowRunId: "run-1",
  workspaceId: "workspace-1",
  taskId: "task-1",
});

function buildTaskRecord(input: { title: string }): AgentAppTaskRecord {
  return {
    taskId: "task-1",
    traceId: "trace-1",
    appId: "content-factory-app",
    entryKey: "dashboard",
    title: input.title,
    prompt: input.title,
    taskKind: "content.copy.generate",
    idempotencyKey: "dashboard:copy",
    input,
    knowledge: [],
    tools: [],
    files: [],
    secrets: [],
    humanReview: false,
    status: "running",
    startedAt: "2026-05-16T00:00:00.000Z",
    trace: [],
    events: [],
    provenance: {
      sourceKind: "agent_app",
      appId: "content-factory-app",
      appVersion: "1.0.0",
      packageHash: provenance.packageHash,
      manifestHash: provenance.manifestHash,
      entryKey: "dashboard",
      workflowRunId: "run-1",
    },
  };
}

describe("P18 typed Capability SDK contract", () => {
  it("应把 Lime 全量能力目录作为 SDK / readiness / profile 的单一事实源", () => {
    const catalogNames = LIME_CAPABILITY_DEFINITIONS.map(
      (definition) => definition.name,
    );

    expect(new Set(catalogNames).size).toBe(catalogNames.length);
    expect(LIME_CAPABILITY_NAMES).toEqual(catalogNames);
    expect(catalogNames).toEqual(
      expect.arrayContaining([
        "lime.ui",
        "lime.storage",
        "lime.files",
        "lime.agent",
        "lime.knowledge",
        "lime.tools",
        "lime.artifacts",
        "lime.workflow",
        "lime.policy",
        "lime.secrets",
        "lime.evidence",
        "lime.events",
        "lime.capabilities",
        "lime.models",
        "lime.usage",
        "lime.memory",
        "lime.skills",
        "lime.mcp",
        "lime.browser",
        "lime.search",
        "lime.documents",
        "lime.media",
        "lime.terminal",
        "lime.tasks",
        "lime.settings",
        "lime.workspace",
        "lime.context",
        "lime.connectors",
        "lime.automation",
        "lime.review",
      ]),
    );
    expect(Object.keys(p0HostCapabilityProfile.capabilities).sort()).toEqual(
      [...catalogNames].sort(),
    );
    expect(p0HostCapabilityProfile.capabilities["lime.policy"]).toMatchObject({
      enabled: false,
      implementation: "none",
    });
    expect(p0HostCapabilityProfile.capabilities["lime.secrets"]).toMatchObject({
      enabled: false,
      implementation: "none",
    });
    expect(buildLimeCapabilityProfileEntriesForMode("base")).toEqual(
      p0HostCapabilityProfile.capabilities,
    );
    expect(
      Object.keys(buildMockCapabilityProfile().capabilities).sort(),
    ).toEqual([...catalogNames].sort());
    expect(
      Object.keys(buildAdapterCapabilityProfile().capabilities).sort(),
    ).toEqual([...catalogNames].sort());
    expect(listEnabledLimeCapabilityNamesForMode("adapter")).toEqual(
      expect.arrayContaining(["lime.agent", "lime.storage", "lime.evidence"]),
    );
  });

  it("应构造带 app provenance 的 typed capability invoke envelope", () => {
    const request = buildLimeCapabilityInvokeRequest({
      capability: "lime.agent",
      method: "startTask",
      args: {
        title: "生成内容策略",
        taskKind: "content.copy.generate",
        idempotencyKey: "dashboard:copy",
      },
      requestId: "req-1",
      idempotencyKey: "dashboard:copy",
      expectedSchema: { type: "object" },
      provenance,
    });

    expect(request).toEqual({
      capability: "lime.agent",
      method: "startTask",
      args: {
        title: "生成内容策略",
        taskKind: "content.copy.generate",
        idempotencyKey: "dashboard:copy",
      },
      requestId: "req-1",
      idempotencyKey: "dashboard:copy",
      expectedSchema: { type: "object" },
      provenance,
    });
  });

  it("应把旧边界错误映射为稳定 SDK error code", () => {
    const readinessError = new AgentAppCapabilityError({
      code: "READINESS_BLOCKED",
      message: "Entry readiness is blocked.",
      appId: "content-factory-app",
      entryKey: "dashboard",
    });

    expect(readinessError.stableCode).toBe("readiness_blocked");
    expect(
      toLimeCapabilityError(readinessError, {
        capability: "lime.agent",
        method: "startTask",
        requestId: "req-1",
      }),
    ).toEqual({
      code: "readiness_blocked",
      message: "Entry readiness is blocked.",
      appId: "content-factory-app",
      entryKey: "dashboard",
      capability: "lime.agent",
      method: "startTask",
      requestId: "req-1",
      causeCode: "READINESS_BLOCKED",
    });
    expect(normalizeLimeCapabilityErrorCode("WORKFLOW_POLICY_VIOLATION")).toBe(
      "policy_denied",
    );
    expect(
      toLimeCapabilityError(
        Object.assign(new Error("payload invalid"), {
          code: "INVALID_PAYLOAD",
        }),
      ),
    ).toMatchObject({
      code: "schema_invalid",
      causeCode: "INVALID_PAYLOAD",
    });
  });

  it("mock transport 应返回稳定 success / error response，不伪造未知能力成功", async () => {
    const invoker = createLimeCapabilityInvoker(
      createMockLimeCapabilityTransport({
        "lime.agent": {
          startTask: (request) => {
            const args = request.args as { title?: unknown } | undefined;
            return buildTaskRecord({
              title:
                typeof args?.title === "string" ? args.title : "Agent App task",
            });
          },
        },
      }),
    );

    const ok = await invoker.call(
      buildLimeCapabilityInvokeRequest({
        capability: "lime.agent",
        method: "startTask",
        args: { title: "生成内容策略" },
        requestId: "req-task",
        provenance,
      }),
    );
    expect(ok).toMatchObject({
      ok: true,
      value: {
        taskId: "task-1",
        traceId: "trace-1",
        title: "生成内容策略",
      },
    });

    const missing = await invoker.call(
      buildLimeCapabilityInvokeRequest({
        capability: "lime.agent",
        method: "cancelTask",
        args: { taskId: "missing-task" },
        requestId: "req-missing",
        provenance,
      }),
    );
    expect(missing).toEqual({
      ok: false,
      error: {
        code: "capability_unavailable",
        message: "lime.agent.cancelTask is not available in the mock host.",
        capability: "lime.agent",
        method: "cancelTask",
        requestId: "req-missing",
        causeCode: "UNSUPPORTED_CAPABILITY_METHOD",
      },
    });
  });
});
