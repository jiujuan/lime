import { describe, expect, it } from "vitest";

import {
  createPlan,
  validateDifferentialScenario,
} from "./benchmark-plan.mjs";

describe("agent-qc benchmark plan", () => {
  it("默认 manifest 应能生成有效计划", () => {
    const plan = createPlan(
      process.cwd(),
      "internal/test/agent-qc-benchmark.manifest.json",
    );

    expect(plan.valid).toBe(true);
    expect(plan.differentialScenarios).toHaveLength(1);
    expect(plan.differentialScenarios[0]).toMatchObject({
      id: "managed-objective-auto-continuation-guard",
      scenarioId: "managed-objective-auto-continuation-guard",
      valid: true,
      budget: "budget:normal",
    });
  });

  it("应阻止缺少 deterministic assertions 的 differential scenario", () => {
    const result = validateDifferentialScenario({
      id: "managed-objective-auto-continuation-guard",
      scenarioId: "managed-objective-auto-continuation-guard",
      baseline: {
        command: "npm run smoke:managed-objective-continuation",
        evidenceRef: "baseline",
      },
      candidate: {
        command: "npm run smoke:managed-objective-continuation",
        evidenceRef: "candidate",
      },
      requiredEvidence: ["turn count"],
      failureModes: ["unexpected auto continuation"],
    });

    expect(result.valid).toBe(false);
    expect(result.issues.join("\n")).toContain(
      "deterministicAssertions 不能为空",
    );
  });
});
