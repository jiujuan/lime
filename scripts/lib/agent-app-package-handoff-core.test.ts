import { describe, expect, it } from "vitest";

import {
  analyzeScripts,
  createAgentAppPackageHandoffReport,
  createDistArtifactReport,
  countMarkerHits,
  parseGitStatusShort,
} from "./agent-app-package-handoff-core.mjs";

describe("agent-app-package-handoff-core", () => {
  it("统计 git status 的 tracked / untracked 条目", () => {
    const status = parseGitStatusShort(" M src/ui/app.js\n?? src/ui/host-bridge.js\n");

    expect(status.trackedCount).toBe(1);
    expect(status.untrackedCount).toBe(1);
    expect(status.totalCount).toBe(2);
  });

  it("识别私有 Host Bridge marker 与 SDK marker", () => {
    const markers = countMarkerHits(
      "pendingRequests requestHostBridge createLimeHostBridgeCapabilityInvoker",
      ["pendingRequests", "requestHostBridge", "createLimeHostBridgeCapabilityInvoker"],
    );

    expect(markers.map((entry) => entry.marker)).toEqual([
      "pendingRequests",
      "requestHostBridge",
      "createLimeHostBridgeCapabilityInvoker",
    ]);
  });

  it("把仍保留私有 bridge transport 的 package 判为 blocked", () => {
    const report = createAgentAppPackageHandoffReport({
      generatedAt: "2026-05-16T00:00:00.000Z",
      packageDir: "/tmp/content-factory-app",
      gitStatusShort: " M src/ui/app.js\n?? src/ui/host-bridge.js\n",
      files: {
        hostBridge: {
          exists: true,
          content: "const pendingRequests = new Map(); window.parent.postMessage({ type: 'capability:invoke' });",
        },
        uiTest: {
          exists: true,
          content: "message.type === 'capability:invoke'",
        },
      },
      packageJsonText: JSON.stringify({
        scripts: {
          test: "node --test tests/*.test.mjs",
          verify: "npm run build && npm run test",
        },
      }),
    });

    expect(report.verdict.status).toBe("blocked");
    expect(report.verdict.blockers).toContain("private Host Bridge transport markers are still present");
    expect(report.verdict.warnings).toContain("package worktree is dirty: tracked=1, untracked=1");
  });

  it("无私有 marker 但 dirty 时要求 handoff", () => {
    const report = createAgentAppPackageHandoffReport({
      gitStatusShort: " M src/ui/host-bridge.js\n",
      files: {
        hostBridge: {
          exists: true,
          content: "createLimeHostBridgeCapabilityInvoker(); createLimeCoreCapabilityAdapters();",
        },
        uiTest: {
          exists: true,
          content: "sdkInvokerCallLog",
        },
      },
      packageJsonText: JSON.stringify({
        scripts: {
          test: "node --test tests/*.test.mjs",
        },
      }),
    });

    expect(report.verdict.status).toBe("needs_handoff");
    expect(report.verdict.blockers).toEqual([]);
  });

  it("识别会重建 dist 的 build / verify / e2e 脚本", () => {
    const scripts = analyzeScripts(
      {
        build: "node scripts/build.mjs",
        verify: "npm run build && npm run test",
        "e2e:user-flow": "npm run build && playwright test",
      },
      {
        build: "await rm('dist', { recursive: true, force: true });",
      },
    );

    expect(scripts.highRisk.map((entry) => entry.name)).toEqual([
      "build",
      "verify",
      "e2e:user-flow",
    ]);
  });

  it("统计 src / dist 产物漂移并作为 handoff warning", () => {
    const distArtifacts = createDistArtifactReport([
      {
        status: "same",
        src: "src/ui/app.js",
        dist: "dist/ui/app.js",
        srcHash: "aaa",
        distHash: "aaa",
      },
      {
        status: "diff",
        src: "src/ui/host-bridge.js",
        dist: "dist/ui/host-bridge.js",
        srcHash: "bbb",
        distHash: "ccc",
      },
      {
        status: "missing-dist",
        src: "src/ui/lime-app-sdk.js",
        dist: "dist/ui/lime-app-sdk.js",
        srcHash: "ddd",
        distHash: "",
      },
    ]);

    expect(distArtifacts.totalDeltas).toBe(2);
    expect(distArtifacts.diffCount).toBe(1);
    expect(distArtifacts.missingDistCount).toBe(1);

    const report = createAgentAppPackageHandoffReport({
      files: {
        hostBridge: {
          exists: true,
          content: "createLimeHostBridgeCapabilityInvoker(); createLimeCoreCapabilityAdapters();",
        },
        uiTest: {
          exists: true,
          content: "sdkInvokerCallLog",
        },
        distArtifacts: distArtifacts.entries,
      },
      packageJsonText: JSON.stringify({
        scripts: {
          test: "node --test tests/*.test.mjs",
        },
      }),
    });

    expect(report.verdict.status).toBe("needs_handoff");
    expect(report.verdict.warnings).toContain("dist artifacts are not synchronized: 2 delta(s)");
  });
});
