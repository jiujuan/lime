import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildBenchmarkReleaseRunPlan } from "./benchmark-release-run.mjs";
import {
  CODING_P0_BATCH_ID,
  CODING_P0_MANAGED_SCRIPT,
  CODING_P0_SUITE_ID,
  CODING_P0_TARGET_TOOLS,
  codingP0ToolExecutionArtifactPath,
} from "./benchmark-release-coding-p0-artifact.mjs";

function makeTempDir() {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), "lime-benchmark-coding-p0-run-"),
  );
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function makeManifest() {
  return {
    schemaVersion: "benchmark-release-v1",
    datasetVersion: "test-version",
    suites: [
      {
        id: CODING_P0_SUITE_ID,
        priority: "P0",
        runner: "npm",
        requiredForRelease: true,
        commands: [
          `npm run ${CODING_P0_MANAGED_SCRIPT} -- --batch ${CODING_P0_BATCH_ID}`,
        ],
        status: "planned",
      },
    ],
  };
}

describe("benchmark release coding P0 runner artifact", () => {
  it("为 coding-current-tools P0 smoke 注入稳定 release artifact 输出路径", () => {
    const root = makeTempDir();
    writeJson(path.join(root, "manifest.json"), makeManifest());

    const plan = buildBenchmarkReleaseRunPlan({
      rootDir: root,
      manifestPath: "manifest.json",
      version: "1.97.0",
      outputRoot: "out",
      includeP0: true,
    });
    const step = plan.steps.find((entry) =>
      entry.id.startsWith(`${CODING_P0_SUITE_ID}:npm-`),
    );
    const expectedArtifactPath = codingP0ToolExecutionArtifactPath("out");

    expect(step).toEqual(
      expect.objectContaining({
        kind: "p0_npm_gate",
        manifestCommand: `npm run ${CODING_P0_MANAGED_SCRIPT} -- --batch ${CODING_P0_BATCH_ID}`,
        outputPath:
          "out/p0/coding-workflow-p0/01-smoke-agent-runtime-tool-execution-managed.json",
      }),
    );
    expect(step.args).toEqual(
      expect.arrayContaining([
        "--batch",
        CODING_P0_BATCH_ID,
        "--output",
        expectedArtifactPath,
      ]),
    );
    expect(step.command).toContain(`--output ${expectedArtifactPath}`);
    expect(step.evidenceArtifacts).toEqual([
      {
        kind: "agent_runtime_tool_execution_smoke",
        scenarioId: CODING_P0_BATCH_ID,
        path: expectedArtifactPath,
        required: true,
        targetTools: CODING_P0_TARGET_TOOLS,
      },
    ]);
  });
});
