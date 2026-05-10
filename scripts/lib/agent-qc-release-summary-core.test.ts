import { describe, expect, it } from "vitest";

import {
  buildAgentQcReleaseSummary,
  renderAgentQcReleaseMarkdown,
  validateReleaseSummary,
} from "./agent-qc-release-summary-core.mjs";

const passPack = {
  runId: "run-pass",
  generatedAt: "2026-05-10T00:00:00.000Z",
  verdict: { status: "pass", summary: "ok", blockers: [] },
  laneResults: [{ laneId: "L4-behavior-eval", status: "pass" }],
  scenarioResults: [
    {
      scenarioId: "command-bridge-contract",
      status: "pass",
      evidenceRefs: ["qcloop:item:item-1", ".lime/qc/contract-summary.json"],
    },
    {
      scenarioId: "workspace-ready-session-restore",
      status: "pass",
      evidenceRefs: ["qcloop:item:item-2", ".lime/qc/gui-trace/workspace-ready.trace.zip"],
    },
  ],
};

const failPack = {
  runId: "run-fail",
  generatedAt: "2026-05-10T00:00:00.000Z",
  verdict: { status: "fail", summary: "bad", blockers: ["workspace: smoke failed"] },
  laneResults: [{ laneId: "L4-behavior-eval", status: "fail" }],
  scenarioResults: [{ scenarioId: "workspace-ready-session-restore", status: "fail", evidenceRefs: [] }],
};

describe("agent-qc-release-summary-core", () => {
  it("应把全 pass Evidence Pack 汇总为 pass release summary", () => {
    const summary = buildAgentQcReleaseSummary({
      evidencePacks: [{ pack: passPack, sourcePath: "evidence.json" }],
      harnessSummary: { generatedAt: "now", totals: { readyCount: 2, invalidCount: 0 } },
      harnessTrend: { sampleCount: 3, signals: ["current gap 保持为 0。"] },
      requiredScenarioIds: ["command-bridge-contract", "workspace-ready-session-restore"],
      tag: "v1.2.3",
    });

    expect(summary.status).toBe("pass");
    expect(summary.evidenceCount).toBe(1);
    expect(summary.missingRequiredScenarioIds).toEqual([]);
    expect(summary.harness.readyCount).toBe(2);
    expect(validateReleaseSummary(summary).valid).toBe(true);
  });

  it("应把失败 Evidence Pack 汇总为 fail 并阻断 check", () => {
    const summary = buildAgentQcReleaseSummary({
      evidencePacks: [{ pack: failPack, sourcePath: "evidence.json" }],
    });

    expect(summary.status).toBe("fail");
    expect(summary.blockers.join("\n")).toContain("workspace: smoke failed");
    expect(validateReleaseSummary(summary).valid).toBe(false);
  });

  it("缺少 Evidence Pack 时默认 blocked", () => {
    const summary = buildAgentQcReleaseSummary({ evidencePacks: [] });

    expect(summary.status).toBe("blocked");
    expect(validateReleaseSummary(summary).valid).toBe(false);
  });

  it("Evidence Pack pass 但缺必需 P0 场景时应阻断 release", () => {
    const summary = buildAgentQcReleaseSummary({
      evidencePacks: [{ pack: passPack, sourcePath: "evidence.json" }],
      requiredScenarioIds: [
        "command-bridge-contract",
        "workspace-ready-session-restore",
        "release-package-startup-smoke",
      ],
    });
    const validation = validateReleaseSummary(summary);

    expect(summary.status).toBe("pass");
    expect(summary.missingRequiredScenarioIds).toEqual(["release-package-startup-smoke"]);
    expect(validation.valid).toBe(false);
    expect(validation.issues.join("\n")).toContain("release-package-startup-smoke");
  });

  it("Evidence Pack pass 但 pass 场景只有 qcloop id 时应阻断 release", () => {
    const weakPack = {
      ...passPack,
      scenarioResults: [
        {
          scenarioId: "command-bridge-contract",
          status: "pass",
          evidenceRefs: ["qcloop:item:item-1", "qcloop:attempt:attempt-1"],
        },
      ],
    };
    const summary = buildAgentQcReleaseSummary({
      evidencePacks: [{ pack: weakPack, sourcePath: "evidence.json" }],
      requiredScenarioIds: ["command-bridge-contract"],
    });
    const validation = validateReleaseSummary(summary);

    expect(summary.status).toBe("fail");
    expect(summary.weakEvidenceScenarioIds).toEqual(["command-bridge-contract"]);
    expect(summary.blockers.join("\n")).toContain("structured-evidence:command-bridge-contract");
    expect(validation.valid).toBe(false);
    expect(validation.issues.join("\n")).toContain("结构化 evidenceRefs");
  });

  it("应渲染 release note 可用的 Markdown", () => {
    const summary = buildAgentQcReleaseSummary({
      evidencePacks: [{ pack: passPack, sourcePath: "evidence.json" }],
      requiredScenarioIds: ["command-bridge-contract", "workspace-ready-session-restore"],
      tag: "v1.2.3",
    });
    const markdown = renderAgentQcReleaseMarkdown(summary);

    expect(markdown).toContain("Agent QC Evidence (v1.2.3)");
    expect(markdown).toContain("Verdict: pass");
    expect(markdown).toContain("Scenario coverage: 2/2");
    expect(markdown).toContain("run-pass");
  });
});
