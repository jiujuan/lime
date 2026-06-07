import { describe, expect, it } from "vitest";

import { createAgentQcProcessOwnerReport } from "./agent-qc-process-owner-core.mjs";

describe("agent-qc-process-owner Electron current runtime", () => {
  it("把 Electron smoke 识别为 active GUI owner", () => {
    const report = createAgentQcProcessOwnerReport(
      [
        {
          pid: 10,
          ppid: 1,
          pgid: 10,
          stat: "S",
          etime: "00:03:00",
          command: "node scripts/electron/smoke.mjs",
        },
      ],
      { generatedAt: "2026-06-06T00:00:00.000Z", platform: "darwin" },
    );

    expect(report.verdict.status).toBe("busy");
    expect(report.activeGuiSmokeProcesses.map((entry) => entry.pid)).toEqual([
      10,
    ]);
    expect(report.passiveElectronRuntimeProcesses).toHaveLength(0);
    expect(report.verdict.summary).toContain("activeGuiSmoke=1");
  });

  it("把 Electron dev host 识别为 passive desktop runtime，不阻断 heavy gates", () => {
    const report = createAgentQcProcessOwnerReport(
      [
        {
          pid: 20,
          ppid: 1,
          pgid: 20,
          stat: "S",
          etime: "01:00:00",
          command: "node scripts/electron/run-dev.mjs",
        },
        {
          pid: 21,
          ppid: 20,
          pgid: 20,
          stat: "S",
          etime: "01:00:00",
          command:
            ".lime/electron-dev-host/Lime-dev.app/Contents/MacOS/Electron .",
        },
      ],
      { generatedAt: "2026-06-06T00:00:00.000Z", platform: "darwin" },
    );

    expect(report.verdict.status).toBe("pass");
    expect(report.activeGuiSmokeProcesses).toHaveLength(0);
    expect(report.cargoProcesses).toHaveLength(0);
    expect(
      report.passiveElectronRuntimeProcesses.map((entry) => entry.pid),
    ).toEqual([20, 21]);
    expect(
      report.passiveDesktopRuntimeProcesses.map((entry) => entry.pid),
    ).toEqual([20, 21]);
    expect(report.verdict.summary).toContain("passiveElectronRuntime=2");
    expect(report.verdict.summary).toContain("passiveDesktopRuntime=2");
  });

  it("仍把官方 Electron 二进制样例识别为 passive runtime，兼容旧进程快照", () => {
    const report = createAgentQcProcessOwnerReport(
      [
        {
          pid: 30,
          ppid: 1,
          pgid: 30,
          stat: "S",
          etime: "00:10:00",
          command:
            "./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .",
        },
      ],
      { generatedAt: "2026-06-06T00:00:00.000Z", platform: "darwin" },
    );

    expect(report.verdict.status).toBe("pass");
    expect(
      report.passiveElectronRuntimeProcesses.map((entry) => entry.pid),
    ).toEqual([30]);
    expect(
      report.passiveDesktopRuntimeProcesses.map((entry) => entry.pid),
    ).toEqual([30]);
  });
});
