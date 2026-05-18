import { describe, expect, it } from "vitest";
import contentFactoryFixture from "../fixtures/content-factory-app.json";
import { buildInstalledAppPreview } from "./installedAppPreview";
import { buildInstalledAgentAppState } from "./installedAppState";
import {
  buildAgentAppDeleteDataConfirmationPhrase,
  buildAgentAppDeleteDataExecutionGate,
  buildAgentAppLifecycleUninstallRehearsalDescriptor,
  type AgentAppDeleteDataExecutionGate,
  type AgentAppLifecycleUninstallRehearsalDescriptor,
} from "./lifecycleAction";
import {
  executeAgentAppDeleteData,
  type AgentAppDeleteDataFileSystemPort,
} from "./deleteDataExecutor";

const now = "2026-05-15T00:00:00.000Z";
const agentAppDataRoot = "<LimeAppData>/agent-apps";

function buildDeleteDataDescriptor(): AgentAppLifecycleUninstallRehearsalDescriptor {
  const preview = buildInstalledAppPreview({
    fixture: contentFactoryFixture,
    loadedAt: now,
    checkedAt: now,
    generatedAt: now,
  });
  const state = buildInstalledAgentAppState({
    preview,
    installedAt: now,
    updatedAt: now,
  });

  return buildAgentAppLifecycleUninstallRehearsalDescriptor({
    state,
    cleanupPlan: preview.cleanupPlan,
    mode: "delete-data",
    generatedAt: now,
  });
}

function buildAllowedGate(
  descriptor: AgentAppLifecycleUninstallRehearsalDescriptor,
): AgentAppDeleteDataExecutionGate {
  const gate = buildAgentAppDeleteDataExecutionGate({
    descriptor,
    confirmationPhrase: buildAgentAppDeleteDataConfirmationPhrase(descriptor),
    generatedAt: now,
  });
  expect(gate.allowed).toBe(true);
  return gate;
}

function deletableTargetValues(
  descriptor: AgentAppLifecycleUninstallRehearsalDescriptor,
): string[] {
  return descriptor.residualAudit.pendingDeletionTargets
    .filter((target) => target.kind !== "ref")
    .map((target) => target.value);
}

function buildMemoryFileSystem(options: {
  existingPaths?: string[];
  failOnPath?: string;
  residualOnPath?: string;
  failAuditOnPath?: string;
} = {}) {
  const removedPaths: string[] = [];
  const existingPaths = new Set(options.existingPaths ?? []);
  const port: AgentAppDeleteDataFileSystemPort = {
    async removePath(path) {
      removedPaths.push(path);
      if (path === options.failOnPath) {
        throw new Error("permission denied");
      }
      if (path !== options.residualOnPath) {
        existingPaths.delete(path);
      }
    },
    async pathExists(path) {
      if (path === options.failAuditOnPath) {
        throw new Error("audit denied");
      }
      return existingPaths.has(path);
    },
  };
  return { removedPaths, port };
}

describe("Agent App delete-data executor", () => {
  it("应只删除 path / namespace 目标，并把 ref 作为 evidence 保留", async () => {
    const descriptor = buildDeleteDataDescriptor();
    const gate = buildAllowedGate(descriptor);
    const memory = buildMemoryFileSystem({
      existingPaths: deletableTargetValues(descriptor),
    });

    const result = await executeAgentAppDeleteData({
      descriptor,
      gate,
      fileSystem: memory.port,
      agentAppDataRoot,
      generatedAt: now,
    });

    expect(result.status).toBe("deleted");
    expect(result.blockers).toEqual([]);
    expect(memory.removedPaths).toEqual(
      result.deletedTargets.map((target) => target.value),
    );
    expect(memory.removedPaths).toEqual(
      expect.arrayContaining([
        "<LimeAppData>/agent-apps/storage/content-factory-app",
      ]),
    );
    expect(result.retainedTargets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "ref",
          status: "retained",
          retainedReason: "REFERENCE_ONLY",
        }),
      ]),
    );
    expect(JSON.stringify(result.deletedTargets)).not.toContain("secret-ref");
    expect(result.postDeleteResidualAudit).toMatchObject({
      status: "clear",
      checkedTargetCount: result.deletedTargets.length,
      remainingTargetCount: 0,
      remainingTargets: [],
    });
  });

  it("gate 未允许时不触碰文件系统", async () => {
    const descriptor = buildDeleteDataDescriptor();
    const gate = buildAgentAppDeleteDataExecutionGate({
      descriptor,
      confirmationPhrase: "delete it",
      generatedAt: now,
    });
    const memory = buildMemoryFileSystem({
      existingPaths: deletableTargetValues(descriptor),
    });

    const result = await executeAgentAppDeleteData({
      descriptor,
      gate,
      fileSystem: memory.port,
      agentAppDataRoot,
      generatedAt: now,
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DELETE_DATA_GATE_BLOCKED" }),
      ]),
    );
    expect(memory.removedPaths).toEqual([]);
  });

  it("应拒绝路径穿越和 data root 外目标", async () => {
    const descriptor = buildDeleteDataDescriptor();
    const tamperedDescriptor = {
      ...descriptor,
      residualAudit: {
        ...descriptor.residualAudit,
        pendingDeletionTargets: [
          {
            category: "storage-namespace",
            kind: "path",
            value:
              "<LimeAppData>/agent-apps/storage/content-factory-app/../other-app",
            reason: "Tampered storage path must be blocked.",
          },
          {
            category: "storage-namespace",
            kind: "path",
            value: "/Users/example/Documents/customer-notes.md",
            reason: "Out-of-root user document must be blocked.",
          },
        ],
        pendingDeletionCount: 2,
      },
    } satisfies AgentAppLifecycleUninstallRehearsalDescriptor;
    const gate = buildAllowedGate(tamperedDescriptor);
    const memory = buildMemoryFileSystem({
      existingPaths: deletableTargetValues(tamperedDescriptor),
    });

    const result = await executeAgentAppDeleteData({
      descriptor: tamperedDescriptor,
      gate,
      fileSystem: memory.port,
      agentAppDataRoot,
      generatedAt: now,
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "TARGET_PATH_TRAVERSAL" }),
        expect.objectContaining({ code: "TARGET_OUTSIDE_AGENT_APP_DATA_ROOT" }),
      ]),
    );
    expect(result.blockedTargets).toHaveLength(2);
    expect(memory.removedPaths).toEqual([]);
  });

  it("descriptor 与 gate 不匹配时应阻断执行", async () => {
    const descriptor = buildDeleteDataDescriptor();
    const mismatchedGate: AgentAppDeleteDataExecutionGate = {
      allowed: true,
      appId: "other-app",
      packageHash: descriptor.packageHash,
      confirmationPhrase: buildAgentAppDeleteDataConfirmationPhrase(descriptor),
      pendingDeletionCount: descriptor.residualAudit.pendingDeletionCount,
      generatedAt: now,
    };
    const memory = buildMemoryFileSystem({
      existingPaths: deletableTargetValues(descriptor),
    });

    const result = await executeAgentAppDeleteData({
      descriptor,
      gate: mismatchedGate,
      fileSystem: memory.port,
      agentAppDataRoot,
      generatedAt: now,
    });

    expect(result.status).toBe("blocked");
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "GATE_DESCRIPTOR_MISMATCH" }),
      ]),
    );
    expect(memory.removedPaths).toEqual([]);
  });

  it("部分删除失败时应返回已删除目标和失败 evidence", async () => {
    const descriptor = buildDeleteDataDescriptor();
    const gate = buildAllowedGate(descriptor);
    const deletableTargets =
      descriptor.residualAudit.pendingDeletionTargets.filter(
        (target) => target.kind !== "ref",
      );
    const failOnPath = deletableTargets[1]?.value;
    expect(failOnPath).toBeTruthy();
    const memory = buildMemoryFileSystem({
      existingPaths: deletableTargetValues(descriptor),
      failOnPath,
    });

    const result = await executeAgentAppDeleteData({
      descriptor,
      gate,
      fileSystem: memory.port,
      agentAppDataRoot,
      generatedAt: now,
    });

    expect(result.status).toBe("failed");
    expect(result.deletedTargets).toEqual([
      expect.objectContaining({ value: deletableTargets[0]?.value }),
    ]);
    expect(result.failure).toMatchObject({
      code: "TARGET_DELETE_FAILED",
      target: expect.objectContaining({ value: failOnPath }),
      details: { error: "permission denied" },
    });
    expect(memory.removedPaths).toEqual([
      deletableTargets[0]?.value,
      failOnPath,
    ]);
  });

  it("删除后仍有残留目标时应失败并返回 post-delete residual audit", async () => {
    const descriptor = buildDeleteDataDescriptor();
    const gate = buildAllowedGate(descriptor);
    const residualOnPath = deletableTargetValues(descriptor)[0];
    const memory = buildMemoryFileSystem({
      existingPaths: deletableTargetValues(descriptor),
      residualOnPath,
    });

    const result = await executeAgentAppDeleteData({
      descriptor,
      gate,
      fileSystem: memory.port,
      agentAppDataRoot,
      generatedAt: now,
    });

    expect(result.status).toBe("failed");
    expect(result.failure).toMatchObject({
      code: "POST_DELETE_RESIDUAL_PRESENT",
      target: expect.objectContaining({ value: residualOnPath }),
    });
    expect(result.postDeleteResidualAudit).toMatchObject({
      status: "residual_present",
      checkedTargetCount: deletableTargetValues(descriptor).length,
      remainingTargetCount: 1,
      remainingTargets: [
        expect.objectContaining({
          value: residualOnPath,
          blockerCodes: ["POST_DELETE_RESIDUAL_PRESENT"],
        }),
      ],
    });
  });
});
