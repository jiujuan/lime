import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationManagedObjectiveSummary } from "./AutomationManagedObjectiveSummary";
import type { ManagedObjectiveAutomationProjection } from "./managedObjectiveAutomationProjection";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

const statusLabels = {
  active: "Active",
  verifying: "Verifying",
  needs_input: "Needs input",
  blocked: "Blocked",
  budget_limited: "Budget limited",
  paused: "Paused",
  completed: "Completed",
  failed: "Failed",
} as const;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
});

async function renderSummary(
  projection: ManagedObjectiveAutomationProjection,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  await act(async () => {
    root.render(
      <AutomationManagedObjectiveSummary
        jobId="job-objective-1"
        projection={projection}
        copy={{
          badge: "Goal",
          auditArtifactOrEvidenceRequired: "Requires artifact or evidence audit",
          criteriaCount: (count) => `${count} success criteria`,
          statusLabel: (status) => statusLabels[status],
        }}
      />,
    );
  });

  return container.querySelector(
    "[data-testid='automation-job-managed-objective-summary-job-objective-1']",
  );
}

function buildProjection(
  overrides: Partial<ManagedObjectiveAutomationProjection> = {},
): ManagedObjectiveAutomationProjection {
  return {
    objectiveId: "objective-1",
    ownerId: "job-objective-1",
    ownerType: "automation_job",
    objectiveText: "Publish an auditable daily Markdown brief",
    successCriteria: ["Create a Markdown artifact", "Attach evidence pack"],
    status: "needs_input",
    completionAudit: "artifact_or_evidence_required",
    requiresArtifactOrEvidence: true,
    lastAuditSummary:
      "decision=completed; evidence pack and artifact refs look satisfied",
    lastEvidencePackRef: ".lime/harness/job-objective-1/evidence",
    lastArtifactRefs: ["content-posts/daily.md"],
    blockerReason: null,
    ...overrides,
  };
}

describe("AutomationManagedObjectiveSummary", () => {
  it("列表摘要只展示后端 projection 状态，不根据 audit summary 猜 completed", async () => {
    const summary = await renderSummary(buildProjection());

    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain("Goal");
    expect(summary?.textContent).toContain("Needs input");
    expect(summary?.textContent).not.toContain("Completed");
    expect(summary?.textContent).toContain(
      "Publish an auditable daily Markdown brief",
    );
    expect(summary?.textContent).toContain("2 success criteria");
    expect(summary?.textContent).toContain(
      "Requires artifact or evidence audit",
    );
  });

  it("没有成功标准和 artifact/evidence 要求时不渲染 footer 噪声", async () => {
    const summary = await renderSummary(
      buildProjection({
        successCriteria: [],
        completionAudit: null,
        requiresArtifactOrEvidence: false,
        status: "active",
      }),
    );

    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain("Active");
    expect(summary?.textContent).not.toContain("success criteria");
    expect(summary?.textContent).not.toContain(
      "Requires artifact or evidence audit",
    );
  });
});
