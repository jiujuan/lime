import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import YAML from "yaml";

import {
  buildWindowsRcSummary,
  compareVersions,
  normalizeVersion,
  resolveInstalledSquirrelPaths,
  resolveSquirrelFeed,
  selectNMinusOneVersion,
  selectSquirrelInstaller,
} from "./windows-squirrel-rc-smoke.mjs";

describe("Windows Squirrel RC smoke", () => {
  it("只选择当前候选版本的 Forge Squirrel installer", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "squirrel-rc-assets-"));
    fs.mkdirSync(path.join(root, "make", "squirrel.windows", "x64"), {
      recursive: true,
    });
    const current = path.join(
      root,
      "make",
      "squirrel.windows",
      "x64",
      "Lime-1.2.3 Setup.exe",
    );
    fs.writeFileSync(current, "current");
    fs.writeFileSync(path.join(root, "Lime-1.2.2 Setup.exe"), "stale");

    expect(
      selectSquirrelInstaller({ installerDir: root, version: "v1.2.3" }),
    ).toBe(current);
  });

  it("接受 GitHub Release 使用的点号 Squirrel installer 名称", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "squirrel-release-assets-"),
    );
    const installer = path.join(root, "Lime-1.2.2.Setup.exe");
    fs.writeFileSync(installer, "n-minus-one");

    expect(
      selectSquirrelInstaller({ installerDir: root, version: "1.2.2" }),
    ).toBe(installer);
  });

  it("N-1 版本必须严格小于候选版本", () => {
    expect(compareVersions("1.105.0", "1.106.0")).toBe(-1);
    expect(compareVersions("1.106.0", "1.106.0")).toBe(0);
    expect(compareVersions("1.107.0", "1.106.0")).toBe(1);
  });

  it("从稳定 tag 中选择严格小于候选的最近版本", () => {
    expect(
      selectNMinusOneVersion({
        candidateVersion: "1.106.0",
        tags: ["v1.104.0", "v1.106.0", "v1.105.0", "v1.106.0-rc.1"],
      }),
    ).toBe("1.105.0");
  });

  it("候选 feed 必须由 RELEASES 精确引用 full nupkg", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "squirrel-feed-"));
    const packageName = "lime-1.2.3-full.nupkg";
    fs.writeFileSync(path.join(root, packageName), "candidate");
    fs.writeFileSync(
      path.join(root, "RELEASES"),
      `${"a".repeat(40)} ${packageName} 9\n`,
    );

    expect(resolveSquirrelFeed({ feedDir: root, version: "1.2.3" })).toEqual(
      expect.objectContaining({
        entries: [expect.objectContaining({ fileName: packageName, size: 9 })],
      }),
    );
    expect(() =>
      resolveSquirrelFeed({ feedDir: root, version: "1.2.4" }),
    ).toThrow("does not reference lime-1.2.4-full.nupkg");
  });

  it("安装路径锁定当前版本，不接受 stale app 目录", () => {
    expect(
      resolveInstalledSquirrelPaths({
        localAppData: "/runner/local-app-data",
        version: "1.2.3",
      }),
    ).toEqual({
      appDirectory: "/runner/local-app-data/lime/app-1.2.3",
      executable: "/runner/local-app-data/lime/app-1.2.3/Lime.exe",
      packageRoot: "/runner/local-app-data/lime",
      updateExecutable: "/runner/local-app-data/lime/Update.exe",
    });
  });

  it("L8 summary 不把单版本安装启动冒充 updater 或 soak", () => {
    const summary = buildWindowsRcSummary({
      assertions: { installerExitZero: true, shell01Passed: true },
      completedAt: "2026-07-17T02:00:00.000Z",
      evidence: {},
      runId: "windows-rc-1",
      startedAt: "2026-07-17T01:00:00.000Z",
      version: normalizeVersion("v1.2.3"),
    });

    expect(summary.result).toBe("pass");
    expect(summary.proofLevel).toBe("L8 platform/packaged");
    expect(summary.remainingClaims).toEqual({
      nMinusOneUpdate: "not-exercised",
      longDurationSoak: "not-exercised",
    });
  });

  it("L8 summary 只有完整 N-1 观测才能声明 updater passed", () => {
    const summary = buildWindowsRcSummary({
      assertions: {
        nMinusOneVersionOlder: true,
        nMinusOneInstalled: true,
        candidateFeedServed: true,
        updateDownloaded: true,
        updateInstallRequested: true,
        candidateInstalledByUpdater: true,
      },
      completedAt: "2026-07-17T02:00:00.000Z",
      evidence: {},
      nMinusOneRequested: true,
      runId: "windows-n-minus-one-1",
      startedAt: "2026-07-17T01:00:00.000Z",
      version: "1.2.3",
    });

    expect(summary.result).toBe("pass");
    expect(summary.remainingClaims.nMinusOneUpdate).toBe("passed");
    expect(summary.remainingClaims.longDurationSoak).toBe("not-exercised");
  });

  it("安装后 Gate B 必须直启 packaged executable 并禁用源码 sidecar override", () => {
    const smoke = fs.readFileSync("scripts/electron/smoke.mjs", "utf8");

    expect(smoke).toContain("LIME_ELECTRON_SMOKE_EXECUTABLE");
    expect(smoke).toContain('{ APP_SERVER_BIN: "" }');
    expect(smoke).toMatch(
      /args:\s*packagedExecutable\s*\?\s*\["--use-mock-keychain"\]/,
    );
    expect(smoke).toContain("shell: packagedExecutable ? false : undefined");
  });

  it("Windows workflows 必须下载 N-1、运行真实更新并上传结构化证据", () => {
    const workflows = [
      {
        job: "build-windows-test",
        path: ".github/workflows/build-windows-test.yml",
      },
      { job: "build", path: ".github/workflows/release.yml" },
    ];

    for (const entry of workflows) {
      const workflow = YAML.parse(fs.readFileSync(entry.path, "utf8"));
      const steps = workflow.jobs[entry.job].steps;
      const installDependencies = steps.find(
        (step) => step.name === "Install dependencies",
      );
      const download = steps.find(
        (step) => step.name === "Download Windows N-1 Squirrel installer",
      );
      const smoke = steps.find(
        (step) => step.name === "Smoke installed Windows Squirrel candidate",
      );
      const upload = steps.find(
        (step) => step.name === "Upload Windows Squirrel RC evidence",
      );

      expect(download?.run).toContain("gh release download");
      expect(download?.run).toContain("selectNMinusOneVersion");
      expect(installDependencies?.run).toContain(
        "pnpm install --frozen-lockfile",
      );
      expect(installDependencies?.run).not.toContain("npm ci");
      expect(smoke?.run).toContain(
        "scripts/electron/windows-squirrel-rc-smoke.mjs",
      );
      expect(smoke?.run).toContain("--candidate-feed-dir");
      expect(smoke?.run).toContain("--n-minus-one-installer-dir");
      expect(smoke?.run).toContain("--n-minus-one-version");
      expect(upload?.with?.path).toBe(".lime/qc/windows-squirrel-rc");
    }
  });
});
