import { describe, expect, it } from "vitest";

import {
  buildRepairGuard,
  buildAgentQcPayloadCoverageReport,
  p0ScenarioIdsFromManifest,
  renderAgentQcPayloadCoverageMarkdown,
  scenarioIdsFromPayload,
} from "./agent-qc-payload-coverage-core.mjs";

const manifest = {
  scenarios: [
    { id: "command-bridge-contract", risk: "P0" },
    { id: "workspace-ready-session-restore", risk: "P0" },
    { id: "p1-only", risk: "P1" },
  ],
};

function owner(status: string) {
  return {
    verdict: { status, summary: `owner=${status}` },
    ownerIntervention: status === "busy" ? { status: "requires_owner_confirmation" } : null,
  };
}

function payload(items: unknown[], overrides = {}) {
  return {
    _validation: { valid: true },
    max_qc_rounds: 1,
    max_executor_retries: 0,
    prompt_template: "只允许执行场景命令，不要顺手修复；不得修改源码、配置、文档、锁文件或 git 状态。",
    items,
    ...overrides,
  };
}

describe("agent-qc-payload-coverage-core", () => {
  it("应从 manifest 提取 P0 场景", () => {
    expect(p0ScenarioIdsFromManifest(manifest)).toEqual([
      "command-bridge-contract",
      "workspace-ready-session-restore",
    ]);
  });

  it("应解析 qcloop payload 中的字符串 item", () => {
    const payload = {
      items: [
        JSON.stringify({ scenario_id: "command-bridge-contract" }),
        JSON.stringify({ scenario_id: "workspace-ready-session-restore" }),
      ],
    };

    expect(scenarioIdsFromPayload(payload)).toEqual([
      "command-bridge-contract",
      "workspace-ready-session-restore",
    ]);
  });

  it("coverage 完整且 owner clear 时应 ready", () => {
    const report = buildAgentQcPayloadCoverageReport({
      manifest,
      payload: payload([
          JSON.stringify({ scenario_id: "command-bridge-contract" }),
          JSON.stringify({ scenario_id: "workspace-ready-session-restore" }),
        ]),
      processOwner: owner("pass"),
      generatedAt: "2026-05-11T00:00:00.000Z",
    });

    expect(report.status).toBe("ready");
    expect(report.coverage.passed).toBe(true);
    expect(report.coverage.missingScenarioIds).toEqual([]);
    expect(report.coverage.extraScenarioIds).toEqual([]);
  });

  it("coverage 完整但 owner busy 时应 blocked", () => {
    const report = buildAgentQcPayloadCoverageReport({
      manifest,
      payload: payload([
          { scenario_id: "command-bridge-contract" },
          { scenario_id: "workspace-ready-session-restore" },
        ]),
      processOwner: owner("busy"),
    });

    expect(report.status).toBe("blocked");
    expect(report.ownerGate.ownerIntervention?.status).toBe("requires_owner_confirmation");
  });

  it("缺少 P0 场景时应 fail 并渲染 Markdown", () => {
    const report = buildAgentQcPayloadCoverageReport({
      manifest,
      payload: payload([{ scenario_id: "command-bridge-contract" }]),
      processOwner: owner("pass"),
    });
    const markdown = renderAgentQcPayloadCoverageMarkdown(report);

    expect(report.status).toBe("fail");
    expect(report.coverage.missingScenarioIds).toEqual(["workspace-ready-session-restore"]);
    expect(markdown).toContain("qcloop P0 Payload Coverage");
    expect(markdown).toContain("Missing scenarios");
  });

  it("应阻断会触发 qcloop repair 的发布证据 payload", () => {
    const report = buildAgentQcPayloadCoverageReport({
      manifest,
      payload: payload(
        [
          { scenario_id: "command-bridge-contract" },
          { scenario_id: "workspace-ready-session-restore" },
        ],
        { max_qc_rounds: 3 },
      ),
      processOwner: owner("pass"),
    });

    expect(buildRepairGuard(payload([], { max_qc_rounds: 3 })).passed).toBe(false);
    expect(report.repairGuard.passed).toBe(false);
    expect(report.status).toBe("fail");
    expect(report.repairGuard.maxQcRoundsPassed).toBe(false);
    expect(renderAgentQcPayloadCoverageMarkdown(report)).toContain("Repair Guard");
  });
});
