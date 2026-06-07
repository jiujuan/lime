import { describe, expect, it } from "vitest";

import {
  createAgentQcProcessOwnerReport,
  parseEtimeSeconds,
  sanitizeProcessCommand,
} from "./agent-qc-process-owner-core.mjs";

describe("agent-qc-process-owner-core", () => {
  it("解析 ps etime 为秒", () => {
    expect(parseEtimeSeconds("07:04:53")).toBe(25493);
    expect(parseEtimeSeconds("10:05")).toBe(605);
    expect(parseEtimeSeconds("2-01:00:00")).toBe(176400);
    expect(parseEtimeSeconds("unknown")).toBeNull();
  });

  it("脱敏进程命令中的常见密钥", () => {
    expect(
      sanitizeProcessCommand(
        "cmd --api-key sk-1234567890abcdef api_key=ctx7sk-secret-value",
      ),
    ).toContain("--api-key <redacted>");
    expect(
      sanitizeProcessCommand(
        "cmd --api-key sk-1234567890abcdef api_key=ctx7sk-secret-value",
      ),
    ).not.toContain("sk-1234567890abcdef");
  });

  it("区分 active owner、Electron passive runtime 与 observer", () => {
    const report = createAgentQcProcessOwnerReport(
      [
        {
          pid: 10,
          ppid: 1,
          pgid: 10,
          stat: "S",
          etime: "07:04:53",
          command: "npm run smoke:design-canvas -- --timeout-ms 600000",
        },
        {
          pid: 20,
          ppid: 1,
          pgid: 20,
          stat: "S",
          etime: "10:00:00",
          command:
            "./qcloop --db .lime/qc/example.db serve --addr 127.0.0.1:18080 --workers 1",
        },
        {
          pid: 35,
          ppid: 1,
          pgid: 35,
          stat: "S",
          etime: "10:00:00",
          command: "node scripts/electron/run-dev.mjs",
        },
        {
          pid: 40,
          ppid: 1,
          pgid: 40,
          stat: "S",
          etime: "00:01:00",
          command:
            "while ps -p 123 >/dev/null 2>&1; do sleep 10; done; ps aux | rg verify:gui-smoke",
        },
      ],
      { generatedAt: "2026-05-11T00:00:00.000Z", platform: "darwin" },
    );

    expect(report.verdict.status).toBe("busy");
    expect(report.activeGuiSmokeProcesses.map((entry) => entry.pid)).toEqual([
      10,
    ]);
    expect(
      report.staleActiveGuiSmokeProcesses.map((entry) => entry.pid),
    ).toEqual([10]);
    expect(
      report.passiveQcloopServerProcesses.map((entry) => entry.pid),
    ).toEqual([20]);
    expect(
      report.passiveElectronRuntimeProcesses.map((entry) => entry.pid),
    ).toEqual([35]);
    expect(
      report.passiveDesktopRuntimeProcesses.map((entry) => entry.pid),
    ).toEqual([35]);
    expect(report.observerProcesses.map((entry) => entry.pid)).toEqual([40]);
    expect(report.qcloopProcesses).toHaveLength(0);
    expect(report.cargoProcesses).toHaveLength(0);
    expect(report.verdict.summary).toContain("passiveDesktopRuntime=1");
    expect(report.ownerIntervention.status).toBe("requires_owner_confirmation");
  });

  it("active qcloop worker 与 Cargo build 仍会阻断", () => {
    const report = createAgentQcProcessOwnerReport(
      [
        {
          pid: 50,
          ppid: 1,
          pgid: 50,
          stat: "S",
          etime: "00:05:00",
          command: "node codex exec 只读执行 Lime Agent QC P0 场景",
        },
        {
          pid: 60,
          ppid: 1,
          pgid: 60,
          stat: "S",
          etime: "00:05:00",
          command: "cargo test --manifest-path lime-rs/Cargo.toml",
        },
      ],
      { generatedAt: "2026-05-11T00:00:00.000Z", platform: "darwin" },
    );

    expect(report.verdict.status).toBe("busy");
    expect(report.qcloopProcesses.map((entry) => entry.pid)).toEqual([50]);
    expect(report.cargoProcesses.map((entry) => entry.pid)).toEqual([60]);
    expect(report.ownerIntervention.status).toBe("not_required");
  });
});
