import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildBenchmarkReleaseSummary } from "./benchmark-release-summary.mjs";
import {
  CODING_P0_BATCH_ID,
  CODING_P0_SUITE_ID,
  CODING_P0_TARGET_TOOLS,
  codingP0ToolExecutionArtifactPath,
} from "./benchmark-release-coding-p0-artifact.mjs";

const CODING_COMMAND = `npm run smoke:agent-runtime-tool-execution -- --batch ${CODING_P0_BATCH_ID}`;

function makeTempDir() {
  return fs.mkdtempSync(
    path.join(os.tmpdir(), "lime-benchmark-coding-p0-summary-"),
  );
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function toolMap(value) {
  return Object.fromEntries(
    CODING_P0_TARGET_TOOLS.map((tool) => [tool, value]),
  );
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
        commands: [CODING_COMMAND],
        status: "ready",
      },
    ],
  };
}

function makeP0GateStep(artifactPath) {
  return {
    kind: "p0_npm_gate",
    id: `${CODING_P0_SUITE_ID}:npm-01-smoke-agent-runtime-tool-execution`,
    command: `${CODING_COMMAND} --output ${artifactPath}`,
    manifestCommand: CODING_COMMAND,
    status: "passed",
    exitCode: 0,
    reason: "",
    outputPath:
      "runs/p0/coding-workflow-p0/01-smoke-agent-runtime-tool-execution.json",
    evidenceArtifacts: [
      {
        kind: "agent_runtime_tool_execution_smoke",
        scenarioId: CODING_P0_BATCH_ID,
        path: artifactPath,
        required: true,
        targetTools: CODING_P0_TARGET_TOOLS,
      },
    ],
    generatedAt: "2026-07-10T00:00:00.000Z",
  };
}

function makeCodingArtifact(overrides = {}) {
  return {
    schemaVersion: "v1",
    scenarioId: CODING_P0_BATCH_ID,
    status: "pass",
    coverage: {
      targetTools: CODING_P0_TARGET_TOOLS,
    },
    provider: {
      targetToolPresence: toolMap(true),
    },
    runtime: {
      completedTools: toolMap(true),
    },
    assertions: {
      fixtureProviderUsed: true,
      naturalLanguageWithoutAtCommand: true,
      allTargetToolsPresentInProviderRequests: true,
      allTargetToolsCompleted: true,
      sessionDefaultedToReact: true,
      currentAgentRuntimeObserved: true,
      evidencePackExported: true,
      applyPatchMutatedFile: true,
      applyPatchCreatedFile: true,
      grepToolReturnedMarker: true,
      globToolReturnedFixturePath: true,
      bashToolReturnedOutput: true,
      evidencePackMentionsCodingExecution: true,
    },
    failedAssertions: [],
    evidencePack: {
      threadStatus: "completed",
      latestTurnStatus: "completed",
    },
    ...overrides,
  };
}

describe("benchmark release summary coding P0 artifact gate", () => {
  it("P0 step 通过但缺少 coding artifact 时仍阻断 releaseReady", () => {
    const root = makeTempDir();
    const artifactPath = codingP0ToolExecutionArtifactPath("runs");
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(
      path.join(root, "runs", "p0", "coding-step.json"),
      makeP0GateStep(artifactPath),
    );

    const summary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });

    expect(summary.releaseReady).toBe(false);
    expect(summary.summary).toMatchObject({
      p0GateStepCount: 1,
      p0GateBlockerCount: 1,
    });
    expect(summary.p0GateBlockers).toEqual([
      expect.objectContaining({
        suiteId: CODING_P0_SUITE_ID,
        id: "coding_p0_evidence_missing",
        command: CODING_COMMAND,
        artifactPath,
      }),
    ]);
  });

  it("coding artifact 证明 current 工具链和 Evidence Pack 后才允许 P0 releaseReady", () => {
    const root = makeTempDir();
    const artifactPath = codingP0ToolExecutionArtifactPath("runs");
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(
      path.join(root, "runs", "p0", "coding-step.json"),
      makeP0GateStep(artifactPath),
    );
    writeJson(path.join(root, artifactPath), makeCodingArtifact());

    const summary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });

    expect(summary.releaseReady).toBe(true);
    expect(summary.summary).toMatchObject({
      p0GateStepCount: 1,
      p0GatePassedCount: 1,
      p0GateBlockerCount: 0,
      releaseBlockerCount: 0,
    });
    expect(summary.p0GateBlockers).toEqual([]);
  });

  it("coding artifact 内部断言失败时阻断 P0 gate", () => {
    const root = makeTempDir();
    const artifactPath = codingP0ToolExecutionArtifactPath("runs");
    writeJson(path.join(root, "manifest.json"), makeManifest());
    writeJson(
      path.join(root, "runs", "p0", "coding-step.json"),
      makeP0GateStep(artifactPath),
    );
    writeJson(
      path.join(root, artifactPath),
      makeCodingArtifact({
        assertions: {
          ...makeCodingArtifact().assertions,
          evidencePackExported: false,
        },
        evidencePack: null,
      }),
    );

    const summary = buildBenchmarkReleaseSummary({
      rootDir: root,
      manifestPath: "manifest.json",
      evidenceRoot: "runs",
    });

    expect(summary.releaseReady).toBe(false);
    expect(summary.p0GateBlockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "coding_p0_assertion_failed",
        }),
        expect.objectContaining({
          id: "coding_p0_evidence_pack_missing",
        }),
      ]),
    );
  });
});
