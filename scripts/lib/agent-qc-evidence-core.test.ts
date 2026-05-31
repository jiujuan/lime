import { describe, expect, it } from "vitest";

import {
  buildAgentQcEvidencePack,
  collectQCLoopEvidenceSummaries,
  isQCLoopWorkerEnvironmentBlocked,
  isQCLoopWorkerBlocked,
  isQCLoopWorkerSelfReportedPass,
  mapQCLoopItemStatus,
  parseQCLoopEvidenceSummaryLine,
  parseScenarioId,
  validateEvidencePackShape,
} from "./agent-qc-evidence-core.mjs";

function evidenceSummary(overrides = {}) {
  return `QCLOOP_EVIDENCE_SUMMARY_JSON=${JSON.stringify({
    scenario_id: "command-bridge-contract",
    result: "pass",
    commands: [
      {
        command: "npm run test:contracts",
        exit_code: 0,
        stdout_artifact: ".lime/qc/test-contracts.stdout.txt",
      },
    ],
    evidence_required: [
      {
        name: "contract command log",
        status: "pass",
        evidence: "test:contracts passed",
        artifact_path: ".lime/qc/test-contracts.stdout.txt",
      },
    ],
    evidence_layers_covered: ["deterministic-smoke"],
    failure_modes: [{ name: "mock fallback drift", status: "excluded", evidence: "contract check passed" }],
    artifacts: [{ path: ".lime/qc/contract-summary.json", kind: "deterministic-smoke", redacted: true }],
    blockers: [],
    gui_session_owner: "",
    release_scope: "source-tree-startup-smoke",
    ...overrides,
  })}`;
}

describe("agent-qc-evidence-core", () => {
  it("应把 qcloop item 状态映射为 Evidence Pack 状态", () => {
    expect(mapQCLoopItemStatus("success")).toBe("pass");
    expect(mapQCLoopItemStatus("failed")).toBe("fail");
    expect(mapQCLoopItemStatus("exhausted")).toBe("fail");
    expect(mapQCLoopItemStatus("running")).toBe("blocked");
  });

  it("应解析 qcloop 结构化 evidence summary marker", () => {
    const parsed = parseQCLoopEvidenceSummaryLine(evidenceSummary());

    expect(parsed.error).toBe("");
    expect(parsed.summary?.scenario_id).toBe("command-bridge-contract");

    const item = { attempts: [{ stdout: `log\n${evidenceSummary()}\n` }] };
    const summaries = collectQCLoopEvidenceSummaries(item);
    expect(summaries.summaries).toHaveLength(1);
    expect(summaries.parseErrors).toEqual([]);
  });

  it("应把 worker 明确报告 BLOCKED 的 exhausted item 映射为 blocked", () => {
    const item = {
      status: "exhausted",
      attempts: [
        {
          stdout: [
            "QCLOOP_WORKER_RESULT=BLOCKED",
            "失败 check: devbridge-health",
            "错误: TypeError: fetch failed",
          ].join("\n"),
        },
      ],
    };

    expect(isQCLoopWorkerBlocked(item)).toBe(true);
    expect(mapQCLoopItemStatus("exhausted", item)).toBe("blocked");
  });

  it("应把内层 CLI 二进制或认证配置错误映射为环境 blocked", () => {
    const item = {
      status: "failed",
      attempts: [
        {
          status: "failed",
          stderr:
            "QCLOOP_CODEX_BIN 不可用: /opt/homebrew/bin/codex: fork/exec /opt/homebrew/bin/codex: no such file or directory",
        },
      ],
      qc_rounds: [{ status: "fail", feedback: "verifier 输出格式错误" }],
    };

    expect(isQCLoopWorkerEnvironmentBlocked(item)).toBe(true);
    expect(mapQCLoopItemStatus("failed", item)).toBe("blocked");
  });

  it("应标记 worker 自报 PASS 但 qcloop/verifier 未通过的冲突", () => {
    const conflictItem = {
      id: "item-pass-conflict",
      item_value: "tool-approval-sandbox-boundary",
      status: "failed",
      current_attempt_no: 2,
      current_qc_no: 1,
      attempts: [
        {
          id: "attempt-pass-conflict",
          status: "failed",
          attempt_no: 2,
          stdout: "QCLOOP_WORKER_RESULT=PASS\nsmoke pass, but no live transcript",
        },
      ],
      qc_rounds: [
        {
          id: "qc-pass-conflict",
          status: "fail",
          qc_no: 1,
          feedback: "缺少 live runtime transcript。",
        },
      ],
    };
    const pack = buildAgentQcEvidencePack({
      job: { id: "job-pass-conflict", status: "running" },
      items: [conflictItem],
      options: { generatedAt: "2026-05-10T00:00:00.000Z" },
    });

    expect(isQCLoopWorkerSelfReportedPass(conflictItem)).toBe(true);
    expect(pack.verdict.status).toBe("fail");
    expect(pack.scenarioResults[0].failureModes).toContain(
      "qcloop:worker_self_report_pass_not_verified",
    );
    expect(pack.verdict.blockers.join("\n")).toContain(
      "worker stdout 自报 QCLOOP_WORKER_RESULT=PASS",
    );
  });

  it("应从 item_value 中提取 scenario id", () => {
    expect(parseScenarioId("claw-chat-ready-streaming 基础聊天")).toBe(
      "claw-chat-ready-streaming",
    );
    expect(parseScenarioId('{"scenario_id":"command-bridge-contract"}')).toBe(
      "command-bridge-contract",
    );
    expect(parseScenarioId('{"name":"agent-ui-performance-summary-ttft-fields"}')).toBe(
      "agent-ui-performance-summary-ttft-fields",
    );
    expect(parseScenarioId('{"entry":"lime-agent-runtime-client-check"}')).toBe(
      "lime-agent-runtime-client-check",
    );
  });

  it("应把成功 qcloop job 导出为 pass evidence pack", () => {
    const pack = buildAgentQcEvidencePack({
      job: { id: "job-1", status: "completed" },
      items: [
        {
          id: "item-1",
          item_value: "command-bridge-contract",
          status: "success",
          current_attempt_no: 1,
          current_qc_no: 1,
          attempts: [
            {
              id: "attempt-1",
              status: "success",
              attempt_no: 1,
              stdout: evidenceSummary(),
            },
          ],
          qc_rounds: [{ id: "qc-1", status: "pass", qc_no: 1 }],
        },
      ],
      options: {
        generatedAt: "2026-05-10T00:00:00.000Z",
        ref: "test-ref",
        changedFiles: ["internal/tests/agent-ops-qc.md"],
      },
    });

    expect(pack.verdict.status).toBe("pass");
    expect(pack.scenarioResults[0].scenarioId).toBe("command-bridge-contract");
    expect(pack.scenarioResults[0].evidenceRefs).toContain("qcloop:attempt:attempt-1");
    expect(pack.scenarioResults[0].evidenceRefs).toContain(".lime/qc/contract-summary.json");
    expect(pack.scenarioResults[0].evidenceRefs).toContain("release-scope:source-tree-startup-smoke");
    expect(validateEvidencePackShape(pack).valid).toBe(true);
  });

  it("应拒绝缺少 QCLOOP_EVIDENCE_SUMMARY_JSON 的 success item，避免旧浅层 pass 进入 release gate", () => {
    const pack = buildAgentQcEvidencePack({
      job: { id: "job-missing-summary", status: "completed" },
      items: [
        {
          id: "item-missing-summary",
          item_value: "command-bridge-contract",
          status: "success",
          current_attempt_no: 1,
          current_qc_no: 1,
          attempts: [{ id: "attempt-missing-summary", status: "success", attempt_no: 1 }],
          qc_rounds: [{ id: "qc-missing-summary", status: "pass", qc_no: 1 }],
        },
      ],
      options: { generatedAt: "2026-05-10T00:00:00.000Z" },
    });

    expect(pack.verdict.status).toBe("fail");
    expect(pack.scenarioResults[0].failureModes).toContain("qcloop:evidence_summary_missing");
    expect(pack.verdict.blockers.join("\n")).toContain("缺少 QCLOOP_EVIDENCE_SUMMARY_JSON");
  });

  it("应拒绝无法解析的 QCLOOP_EVIDENCE_SUMMARY_JSON", () => {
    const pack = buildAgentQcEvidencePack({
      job: { id: "job-invalid-summary", status: "completed" },
      items: [
        {
          id: "item-invalid-summary",
          item_value: "command-bridge-contract",
          status: "success",
          current_attempt_no: 1,
          current_qc_no: 1,
          attempts: [
            {
              id: "attempt-invalid-summary",
              status: "success",
              attempt_no: 1,
              stdout: "QCLOOP_EVIDENCE_SUMMARY_JSON={not-json}",
            },
          ],
          qc_rounds: [{ id: "qc-invalid-summary", status: "pass", qc_no: 1 }],
        },
      ],
      options: { generatedAt: "2026-05-10T00:00:00.000Z" },
    });

    expect(pack.verdict.status).toBe("fail");
    expect(pack.scenarioResults[0].failureModes).toContain("qcloop:evidence_summary_invalid_json");
    expect(pack.verdict.blockers.join("\n")).toContain("JSON 无法解析");
  });

  it("应把耗尽 qcloop item 导出为 fail evidence pack", () => {
    const pack = buildAgentQcEvidencePack({
      job: { id: "job-2", status: "failed" },
      items: [
        {
          id: "item-2",
          item_value: "tool-approval-sandbox-boundary",
          status: "exhausted",
          current_attempt_no: 3,
          current_qc_no: 3,
          attempts: [{ id: "attempt-2", status: "failed", attempt_no: 3 }],
          qc_rounds: [
            {
              id: "qc-2",
              status: "fail",
              qc_no: 3,
              feedback: "缺少 approval 证据。",
            },
          ],
        },
      ],
      options: { generatedAt: "2026-05-10T00:00:00.000Z" },
    });

    expect(pack.verdict.status).toBe("fail");
    expect(pack.verdict.blockers.join("\n")).toContain("缺少 approval 证据");
    expect(pack.scenarioResults[0].failureModes).toContain(
      "qcloop:max_qc_rounds_exhausted",
    );
  });

  it("应把 preflight blocked 的耗尽 item 导出为 blocked evidence pack", () => {
    const pack = buildAgentQcEvidencePack({
      job: { id: "job-3", status: "completed" },
      items: [
        {
          id: "item-3",
          item_value: "claw-chat-ready-streaming",
          status: "exhausted",
          current_attempt_no: 3,
          current_qc_no: 3,
          attempts: [
            {
              id: "attempt-3",
              status: "success",
              attempt_no: 3,
              stdout: "QCLOOP_WORKER_RESULT=BLOCKED\nDevBridge preflight: BLOCKED",
            },
          ],
          qc_rounds: [
            {
              id: "qc-3",
              status: "fail",
              qc_no: 3,
              feedback: "DevBridge preflight blocked。",
            },
          ],
        },
      ],
      options: { generatedAt: "2026-05-10T00:00:00.000Z" },
    });

    expect(pack.verdict.status).toBe("blocked");
    expect(pack.verdict.blockers.join("\n")).toContain("DevBridge preflight blocked");
    expect(pack.scenarioResults[0].failureModes).toContain("qcloop:worker_blocked");
  });

  it("应把 qcloop worker 环境阻断导出为 blocked evidence pack，且不泄露原始 stderr", () => {
    const pack = buildAgentQcEvidencePack({
      job: { id: "job-env", status: "failed" },
      items: [
        {
          id: "item-env",
          item_value: "command-bridge-contract",
          status: "failed",
          current_attempt_no: 1,
          current_qc_no: 1,
          attempts: [
            {
              id: "attempt-env",
              status: "failed",
              attempt_no: 1,
              stdout: "",
              stderr:
                "QCLOOP_CODEX_BIN 不可用: /opt/homebrew/bin/codex: fork/exec /opt/homebrew/bin/codex: no such file or directory",
            },
          ],
          qc_rounds: [{ id: "qc-env", status: "fail", qc_no: 1, feedback: "verifier 输出格式错误" }],
        },
      ],
      options: { generatedAt: "2026-05-10T00:00:00.000Z" },
    });

    expect(pack.verdict.status).toBe("blocked");
    expect(pack.scenarioResults[0].failureModes).toContain("qcloop:worker_environment_blocked");
    expect(pack.verdict.blockers.join("\n")).toContain("qcloop worker 环境阻断");
    expect(pack.verdict.blockers.join("\n")).not.toContain("/opt/homebrew/bin/codex");
  });
});
