import { describe, expect, it } from "vitest";

import {
  collectGuiScenarioIds,
  createAgentQcGuiOwnerWatchEntry,
  createAgentQcGuiOwnerReport,
  renderAgentQcGuiOwnerSummary,
} from "./agent-qc-gui-owner-core.mjs";

const manifest = {
  scenarios: [
    {
      id: "claw-chat-ready-streaming",
      evidenceRequired: ["GUI session owner / isolation statement"],
    },
    {
      id: "command-bridge-contract",
      evidenceRequired: ["contract command log"],
    },
  ],
};

describe("agent-qc-gui-owner-core", () => {
  it("应从 manifest 中识别 GUI owner 场景", () => {
    expect(collectGuiScenarioIds(manifest)).toEqual(["claw-chat-ready-streaming"]);
  });

  it("没有 active GUI sidecar 时应 pass", () => {
    const report = createAgentQcGuiOwnerReport({
      manifest,
      statusSidecars: [
        {
          path: ".lime/qc/qcloop-status.contract.json",
          status: {
            job: { id: "job-1", status: "completed" },
            verdict: { status: "complete" },
            items: [
              {
                scenarioId: "command-bridge-contract",
                qcloopStatus: "success",
                terminal: true,
              },
            ],
          },
        },
      ],
    });

    expect(report.verdict.status).toBe("pass");
    expect(report.ownerCount).toBe(0);
  });

  it("active GUI sidecar 超过上限时应 blocked", () => {
    const report = createAgentQcGuiOwnerReport({
      manifest,
      statusSidecars: [
        {
          path: ".lime/qc/qcloop-status.gui.json",
          status: {
            job: { id: "job-gui", status: "running" },
            verdict: { status: "stale" },
            counts: { running: 1, stale: 1 },
            items: [
              {
                scenarioId: "claw-chat-ready-streaming",
                qcloopStatus: "running",
                evidenceStatus: "blocked",
                terminal: false,
                stale: true,
                staleSeconds: 600,
                worker: { status: "running", durationSeconds: 600 },
              },
            ],
          },
        },
      ],
      maxActiveOwners: 0,
    });

    expect(report.verdict.status).toBe("blocked");
    expect(report.ownerCount).toBe(1);
    expect(report.staleOwnerCount).toBe(1);
    expect(report.oldestStaleSeconds).toBe(600);
    expect(report.verdict.nextAction).toContain("只读观察");
    expect(report.ownerIntervention?.status).toBe("requires_owner_confirmation");
    expect(report.ownerIntervention?.requiredConfirmationText).toContain("job-gui");
    expect(report.ownerIntervention?.prohibitedUntilConfirmed).toContain(
      "start another full GUI P0 batch",
    );
    expect(report.activeOwners[0].activeItems[0].scenarioId).toBe(
      "claw-chat-ready-streaming",
    );
  });

  it("同一 job 的多个 sidecar 应去重", () => {
    const sidecar = {
      job: { id: "job-gui", status: "running" },
      verdict: { status: "running" },
      items: [
        {
          scenarioId: "claw-chat-ready-streaming",
          qcloopStatus: "running",
          terminal: false,
        },
      ],
    };

    const report = createAgentQcGuiOwnerReport({
      manifest,
      statusSidecars: [
        { path: ".lime/qc/qcloop-status.gui-current.json", status: sidecar },
        { path: ".lime/qc/qcloop-status.gui-stale.json", status: sidecar },
      ],
    });

    expect(report.ownerCount).toBe(1);
  });

  it("同一 running job 应选择 stale 秒数更新的 sidecar", () => {
    const createSidecar = (staleSeconds: number, generatedAt: string) => ({
      generatedAt,
      job: { id: "job-gui", status: "running" },
      verdict: { status: "stale" },
      counts: { running: 1, stale: 1 },
      items: [
        {
          scenarioId: "claw-chat-ready-streaming",
          qcloopStatus: "running",
          evidenceStatus: "blocked",
          terminal: false,
          stale: true,
          staleSeconds,
          worker: { status: "running", durationSeconds: staleSeconds },
        },
      ],
    });

    const report = createAgentQcGuiOwnerReport({
      manifest,
      statusSidecars: [
        {
          path: ".lime/qc/qcloop-status.gui-older.json",
          status: createSidecar(600, "2026-05-10T00:00:00.000Z"),
        },
        {
          path: ".lime/qc/qcloop-status.gui-current.json",
          status: createSidecar(900, "2026-05-10T00:05:00.000Z"),
        },
      ],
    });

    expect(report.ownerCount).toBe(1);
    expect(report.oldestStaleSeconds).toBe(900);
    expect(report.activeOwners[0].path).toBe(".lime/qc/qcloop-status.gui-current.json");
  });

  it("同一 job 存在终态 sidecar 时应忽略旧 running sidecar", () => {
    const runningSidecar = {
      job: { id: "job-gui", status: "running", terminal: false },
      verdict: { status: "running" },
      items: [
        {
          scenarioId: "claw-chat-ready-streaming",
          qcloopStatus: "running",
          terminal: false,
        },
      ],
    };
    const terminalSidecar = {
      job: { id: "job-gui", status: "failed", terminal: true },
      verdict: { status: "fail" },
      items: [
        {
          scenarioId: "claw-chat-ready-streaming",
          qcloopStatus: "exhausted",
          terminal: true,
        },
      ],
    };

    const report = createAgentQcGuiOwnerReport({
      manifest,
      statusSidecars: [
        { path: ".lime/qc/qcloop-status.gui-current.json", status: runningSidecar },
        { path: ".lime/qc/qcloop-status.gui-completed.json", status: terminalSidecar },
      ],
    });

    expect(report.ownerCount).toBe(0);
    expect(report.ownerIntervention).toBeNull();
    expect(report.verdict.status).toBe("pass");
  });

  it("应渲染 summary", () => {
    const report = createAgentQcGuiOwnerReport({ manifest, statusSidecars: [] });
    const summary = renderAgentQcGuiOwnerSummary(report);

    expect(summary).toContain("status=pass");
    expect(summary).toContain("staleOwners=0");
    expect(summary).toContain("guiScenarios=claw-chat-ready-streaming");
  });

  it("应生成 watch history JSONL entry", () => {
    const report = createAgentQcGuiOwnerReport({
      manifest,
      generatedAt: "2026-05-10T00:00:00.000Z",
      statusSidecars: [
        {
          path: ".lime/qc/qcloop-status.gui.json",
          status: {
            job: { id: "job-gui", status: "running" },
            verdict: { status: "stale" },
            items: [
              {
                scenarioId: "claw-chat-ready-streaming",
                qcloopStatus: "running",
                evidenceStatus: "blocked",
                terminal: false,
                stale: true,
                staleSeconds: 900,
                worker: { status: "running", durationSeconds: 900 },
              },
            ],
          },
        },
      ],
    });

    const entry = createAgentQcGuiOwnerWatchEntry(report);

    expect(entry.observedAt).toBe("2026-05-10T00:00:00.000Z");
    expect(entry.verdictStatus).toBe("blocked");
    expect(entry.activeOwners[0].jobId).toBe("job-gui");
    expect(entry.activeOwners[0].activeItems[0].staleSeconds).toBe(900);
  });
});
