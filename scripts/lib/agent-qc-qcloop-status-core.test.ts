import { describe, expect, it } from "vitest";

import {
  buildQCLoopStatusReport,
  classifyItemStaleness,
  validateQCLoopStatusReport,
} from "./agent-qc-qcloop-status-core.mjs";

const generatedAt = "2026-05-10T07:00:00.000Z";

describe("agent-qc-qcloop-status-core", () => {
  it("应把长时间无输出的 running item 标记为 stale", () => {
    const report = buildQCLoopStatusReport({
      job: { id: "job-1", name: "p0", status: "running" },
      items: [
        {
          id: "item-1",
          item_value: '{"scenario_id":"skill-forge-register-bind-enable"}',
          status: "running",
          current_attempt_no: 1,
          current_qc_no: 0,
          attempts: [
            {
              id: "attempt-1",
              status: "running",
              started_at: "2026-05-10T06:00:00.000Z",
              stdout: "",
              stderr: "",
            },
          ],
          qc_rounds: [],
        },
      ],
      options: { generatedAt, staleMinutes: 30 },
    });

    expect(report.verdict.status).toBe("stale");
    expect(report.counts.stale).toBe(1);
    expect(report.items[0].staleSeconds).toBe(3600);
    expect(report.items[0].worker.durationSeconds).toBe(3600);
    expect(report.items[0].staleReasons.join("\n")).toContain("stdout/stderr 为空");
    expect(validateQCLoopStatusReport(report).valid).toBe(true);
  });

  it("有输出的 running item 不应仅因运行时间长被标记为 stale", () => {
    const result = classifyItemStaleness(
      { status: "running" },
      {
        status: "running",
        startedAt: "2026-05-10T06:00:00.000Z",
        durationMinutes: 60,
        outputLength: 120,
      },
      { staleMinutes: 30 },
    );

    expect(result.stale).toBe(false);
  });

  it("全部 success 且 job completed 时应给出 complete verdict", () => {
    const report = buildQCLoopStatusReport({
      job: { id: "job-2", name: "p0", status: "completed" },
      items: [
        {
          id: "item-2",
          item_value: "command-bridge-contract",
          status: "success",
          current_attempt_no: 1,
          current_qc_no: 1,
          attempts: [
            {
              id: "attempt-2",
              status: "success",
              started_at: "2026-05-10T06:00:00.000Z",
              finished_at: "2026-05-10T06:01:00.000Z",
              stdout: "ok",
              stderr: "",
            },
          ],
          qc_rounds: [{ id: "qc-2", status: "pass", feedback: "ok" }],
        },
      ],
      options: { generatedAt, staleMinutes: 30 },
    });

    expect(report.verdict.status).toBe("complete");
    expect(report.counts.success).toBe(1);
  });

  it("failed/exhausted item 应保持 fail verdict", () => {
    const report = buildQCLoopStatusReport({
      job: { id: "job-3", name: "p0", status: "completed" },
      items: [
        {
          id: "item-3",
          item_value: "tool-approval-sandbox-boundary",
          status: "exhausted",
          current_attempt_no: 1,
          current_qc_no: 1,
          attempts: [{ id: "attempt-3", status: "failed", stdout: "", stderr: "error" }],
          qc_rounds: [{ id: "qc-3", status: "fail", feedback: "缺少证据" }],
        },
      ],
      options: { generatedAt, staleMinutes: 30 },
    });

    expect(report.verdict.status).toBe("fail");
    expect(report.counts.exhausted).toBe(1);
    expect(report.items[0].qc.feedback).toBe("缺少证据");
  });

  it("worker 明确报告 BLOCKED 的 exhausted item 应保持环境阻断语义", () => {
    const report = buildQCLoopStatusReport({
      job: { id: "job-4", name: "p0", status: "completed" },
      items: [
        {
          id: "item-4",
          item_value: "claw-chat-ready-streaming",
          status: "exhausted",
          current_attempt_no: 3,
          current_qc_no: 3,
          attempts: [
            {
              id: "attempt-4",
              status: "success",
              stdout: "QCLOOP_WORKER_RESULT=BLOCKED\nDevBridge preflight: BLOCKED",
              stderr: "",
            },
          ],
          qc_rounds: [{ id: "qc-4", status: "fail", feedback: "DevBridge preflight blocked" }],
        },
      ],
      options: { generatedAt, staleMinutes: 30 },
    });

    expect(report.verdict.status).toBe("blocked");
    expect(report.counts.exhausted).toBe(1);
    expect(report.items[0].evidenceStatus).toBe("blocked");
  });

  it("内层 Codex CLI 环境错误应保持环境阻断语义", () => {
    const report = buildQCLoopStatusReport({
      job: { id: "job-5", name: "p0", status: "failed" },
      items: [
        {
          id: "item-5",
          item_value: "command-bridge-contract",
          status: "failed",
          current_attempt_no: 1,
          current_qc_no: 1,
          attempts: [
            {
              id: "attempt-5",
              status: "failed",
              stderr:
                "QCLOOP_CODEX_BIN 不可用: /opt/homebrew/bin/codex: fork/exec /opt/homebrew/bin/codex: no such file or directory",
            },
          ],
          qc_rounds: [{ id: "qc-5", status: "fail", feedback: "verifier 输出格式错误" }],
        },
      ],
      options: { generatedAt, staleMinutes: 30 },
    });

    expect(report.verdict.status).toBe("blocked");
    expect(report.items[0].evidenceStatus).toBe("blocked");
  });
});
