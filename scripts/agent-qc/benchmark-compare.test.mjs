import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  SUPERVISOR_OUTPUT_SCHEMA,
  buildSupervisorReviewInput,
  compareJobs,
  diffDeterministicFacts,
  extractDeterministicFacts,
  shouldRequestSupervisorReview,
} from "./benchmark-compare.mjs";

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lime-agent-qc-benchmark-"));
}

describe("agent-qc benchmark compare", () => {
  it("应从 managed objective smoke sidecar 提取 deterministic facts", () => {
    const facts = extractDeterministicFacts({
      status: "pass",
      coverage: {
        autoContinuationObserved: true,
        budgetLimitObserved: true,
        evidencePackExported: true,
      },
      runtime: {
        finalSnapshot: {
          session: {
            turnCount: 2,
          },
          thread: {
            pendingRequestCount: 0,
          },
        },
      },
      objective: {
        status: "budget_limited",
      },
      guard: {
        finalDecision: "budget_limited",
      },
    });

    expect(facts).toMatchObject({
      status: "pass",
      turnCount: 2,
      objectiveStatus: "budget_limited",
      guardDecision: "budget_limited",
      autoContinuationObserved: true,
      budgetLimitObserved: true,
      evidencePackExported: true,
      pendingRequestCount: 0,
    });
  });

  it("应输出字段级 deterministic diff", () => {
    expect(
      diffDeterministicFacts(
        { turnCount: 1, objectiveStatus: "paused" },
        { turnCount: 2, objectiveStatus: "budget_limited" },
      ),
    ).toEqual([
      {
        field: "objectiveStatus",
        baseline: "paused",
        candidate: "budget_limited",
      },
      {
        field: "turnCount",
        baseline: 1,
        candidate: 2,
      },
    ]);
  });

  it("应比较 baseline / candidate sidecar 并生成 scenarioDiffs", () => {
    const root = makeTempDir();
    const baselineTrial = path.join(root, "baseline", "managed-objective");
    const candidateTrial = path.join(root, "candidate", "managed-objective");

    writeJson(path.join(baselineTrial, "result.json"), {
      scenarioId: "managed-objective-auto-continuation-guard",
      status: "pass",
      coverage: {
        autoContinuationObserved: false,
        evidencePackExported: true,
      },
      runtime: {
        finalSnapshot: {
          session: {
            turnCount: 1,
          },
        },
      },
      objective: {
        status: "paused",
      },
    });
    writeJson(path.join(candidateTrial, "result.json"), {
      scenarioId: "managed-objective-auto-continuation-guard",
      status: "pass",
      coverage: {
        autoContinuationObserved: true,
        evidencePackExported: true,
      },
      runtime: {
        finalSnapshot: {
          session: {
            turnCount: 2,
          },
        },
      },
      objective: {
        status: "budget_limited",
      },
      guard: {
        finalDecision: "budget_limited",
      },
    });

    const comparison = compareJobs(
      path.join(root, "baseline"),
      path.join(root, "candidate"),
    );

    expect(comparison.scenarioDiffs).toHaveLength(1);
    expect(comparison.scenarioDiffs[0]).toMatchObject({
      scenarioId: "managed-objective-auto-continuation-guard",
      decision: "needs-human-review",
      supervisorReview: {
        required: true,
        reason: "deterministic-diff-needs-semantic-review",
      },
      candidate: {
        facts: {
          turnCount: 2,
          objectiveStatus: "budget_limited",
        },
      },
    });
    expect(
      comparison.scenarioDiffs[0].deterministicDiff.map((entry) => entry.field),
    ).toEqual([
      "autoContinuationObserved",
      "guardDecision",
      "objectiveStatus",
      "turnCount",
    ]);
    expect(
      comparison.scenarioDiffs[0].supervisorReview.input,
    ).toMatchObject({
      schemaVersion: "agent-qc-supervisor-review-input-v1",
      scenarioId: "managed-objective-auto-continuation-guard",
      outputSchema: {
        schemaVersion: "agent-qc-supervisor-verdict-v1",
        required: [
          "score",
          "verdict",
          "regressions",
          "needsHumanReview",
          "reason",
        ],
      },
    });
    expect(
      comparison.scenarioDiffs[0].supervisorReview.input.baselineEvidenceSummary
        .facts,
    ).toMatchObject({
      turnCount: 1,
      objectiveStatus: "paused",
    });
    expect(comparison.comparison.p0QcGateRegressionCount).toBe(0);
    expect(comparison.comparison.decision).toBe("needs-human-review");
  });

  it("只在证据完整且 deterministic diff 需要语义判断时启动 Supervisor", () => {
    expect(
      shouldRequestSupervisorReview({
        baseline: { evidenceComplete: true },
        candidate: { evidenceComplete: true },
        decision: "needs-human-review",
        deterministicDiff: [{ field: "turnCount", baseline: 1, candidate: 2 }],
      }),
    ).toBe(true);
    expect(
      shouldRequestSupervisorReview({
        baseline: { evidenceComplete: true },
        candidate: { evidenceComplete: true },
        decision: "regression",
        deterministicDiff: [{ field: "turnCount", baseline: 1, candidate: 99 }],
      }),
    ).toBe(false);
    expect(
      shouldRequestSupervisorReview({
        baseline: { evidenceComplete: false },
        candidate: { evidenceComplete: true },
        decision: "needs-human-review",
        deterministicDiff: [{ field: "turnCount", baseline: 1, candidate: 2 }],
      }),
    ).toBe(false);
  });

  it("Supervisor review input 应固定裁剪后的输入和输出 schema", () => {
    const input = buildSupervisorReviewInput({
      scenarioId: "managed-objective-auto-continuation-guard",
      baseline: {
        trialId: "base",
        reward: 1,
        evidenceComplete: true,
        refs: {
          evidenceRef: "/tmp/base/result.json",
        },
        facts: {
          turnCount: 1,
        },
      },
      candidate: {
        trialId: "candidate",
        reward: 1,
        evidenceComplete: true,
        refs: {
          evidenceRef: "/tmp/candidate/result.json",
        },
        facts: {
          turnCount: 2,
        },
      },
      deterministicDiff: [{ field: "turnCount", baseline: 1, candidate: 2 }],
      semanticDiff: { scoreDelta: 0, regressions: [] },
    });

    expect(input).toMatchObject({
      schemaVersion: "agent-qc-supervisor-review-input-v1",
      baselineEvidenceSummary: {
        trialId: "base",
        reward: 1,
        evidenceRef: "/tmp/base/result.json",
        facts: {
          turnCount: 1,
        },
      },
      candidateEvidenceSummary: {
        trialId: "candidate",
        reward: 1,
        evidenceRef: "/tmp/candidate/result.json",
        facts: {
          turnCount: 2,
        },
      },
      outputSchema: SUPERVISOR_OUTPUT_SCHEMA,
    });
    expect(input).not.toHaveProperty("stdout");
    expect(input).not.toHaveProperty("stderr");
  });
});
