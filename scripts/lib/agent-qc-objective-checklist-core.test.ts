import { describe, expect, it } from "vitest";

import {
  buildAgentQcObjectiveChecklist,
  renderAgentQcObjectiveChecklistMarkdown,
} from "./agent-qc-objective-checklist-core.mjs";

const passedIds = [
  "docs-tests-standard",
  "scenario-manifest",
  "gui-flow-manifest",
  "evidence-schema",
  "qcloop-payload-generator",
  "qcloop-payload-coverage",
  "qcloop-verifier-evidence-placeholders",
  "structured-evidence-contract",
  "qcloop-evidence-exporter",
  "release-summary",
  "qcloop-status-monitor",
  "gui-owner-check",
  "real-qcloop-evidence",
  "local-verify-gate",
];

function auditWith(overrides = {}) {
  const overrideById = new Map(Object.entries(overrides));
  return {
    items: passedIds.map((id) => ({
      id,
      title: id,
      passed: overrideById.get(id)?.passed ?? true,
      evidence: overrideById.get(id)?.evidence ?? `${id}-evidence`,
      gap: overrideById.get(id)?.gap ?? "",
    })),
  };
}

function passProcessOwner() {
  return {
    verdict: { status: "pass", summary: "activeGuiSmoke=0, cargoOrRust=0, qcloopRelated=0" },
    ownerIntervention: { status: "not_required" },
  };
}

function busyProcessOwner() {
  return {
    verdict: {
      status: "busy",
      summary: "activeGuiSmoke=1, cargoOrRust=0, qcloopRelated=0, staleActiveGuiSmoke=1",
    },
    ownerIntervention: { status: "requires_owner_confirmation", processIds: [59011] },
  };
}

const guiOwner = { verdict: { status: "pass" } };

describe("agent-qc-objective-checklist-core", () => {
  it("所有目标证据齐全且 owner clear 时应 complete", () => {
    const checklist = buildAgentQcObjectiveChecklist({
      audit: auditWith(),
      processOwner: passProcessOwner(),
      guiOwner,
      generatedAt: "2026-05-11T00:00:00.000Z",
    });

    expect(checklist.status).toBe("complete");
    expect(checklist.passedCount).toBe(7);
    expect(checklist.blockers).toHaveLength(0);
  });

  it("raw process owner busy 时应保留 pass_with_blocking_owner 并保持 incomplete", () => {
    const checklist = buildAgentQcObjectiveChecklist({
      audit: auditWith(),
      processOwner: busyProcessOwner(),
      guiOwner,
    });

    const ownerItem = checklist.checklist.find((item) => item.requirement.includes("raw process owner"));
    expect(checklist.status).toBe("incomplete");
    expect(ownerItem?.status).toBe("pass_with_blocking_owner");
    expect(ownerItem?.gap).toContain("raw process owner 仍 busy");
  });

  it("官方 evidence 或 verify:local 失败时应列为 blocker", () => {
    const checklist = buildAgentQcObjectiveChecklist({
      audit: auditWith({
        "real-qcloop-evidence": { passed: false, gap: "official evidence fail" },
        "local-verify-gate": { passed: false, gap: "verify local fail" },
      }),
      processOwner: passProcessOwner(),
      guiOwner,
    });

    expect(checklist.status).toBe("incomplete");
    expect(checklist.blockers.map((item) => item.gap)).toContain("official evidence fail");
    expect(checklist.blockers.map((item) => item.gap)).toContain("verify local fail");
  });

  it("应渲染 Markdown", () => {
    const checklist = buildAgentQcObjectiveChecklist({
      audit: auditWith(),
      processOwner: passProcessOwner(),
      guiOwner,
    });
    const markdown = renderAgentQcObjectiveChecklistMarkdown(checklist);

    expect(markdown).toContain("Objective Completion Checklist");
    expect(markdown).toContain("Status: complete");
  });
});
