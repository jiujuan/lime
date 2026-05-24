import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeAppMetadataWorkflowReport,
  formatAppMetadataWorkflowReport,
  runCli,
} from "./i18n-app-metadata-workflow-report";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-i18n-app-metadata-"));
  tempDirs.push(dir);
  return dir;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("i18n app metadata workflow report", () => {
  it("应识别 app / installer 元数据仍是单语事实源", () => {
    const root = createTempDir();

    writeFile(
      root,
      "package.json",
      JSON.stringify(
        {
          name: "lime",
          version: "1.47.0",
          description: "AI content workspace for Chinese creators.",
        },
        null,
        2,
      ),
    );
    writeFile(
      root,
      "src-tauri/Cargo.toml",
      [
        '[workspace.package]',
        'version = "1.47.0"',
        '',
        '[package]',
        'name = "lime"',
        'version = "1.47.0"',
        'description = "AI API Proxy Desktop App"',
        'homepage = "https://github.com/aiclientproxy/lime"',
      ].join("\n"),
    );
    writeFile(
      root,
      "src-tauri/tauri.conf.json",
      JSON.stringify(
        {
          productName: "Lime",
          identifier: "com.limecloud.lime",
          app: { windows: [{ title: "Lime" }] },
          bundle: { targets: "all" },
          plugins: { updater: { pubkey: "lime-dev-placeholder" }, "deep-link": { desktop: { schemes: ["lime"] } } },
        },
        null,
        2,
      ),
    );
    writeFile(
      root,
      "src-tauri/tauri.conf.headless.json",
      JSON.stringify(
        {
          productName: "Lime",
          identifier: "com.limecloud.lime.headless",
          app: { windows: [{ title: "Lime" }] },
        },
        null,
        2,
      ),
    );
    writeFile(
      root,
      "src-tauri/capabilities/agent-app-shell.json",
      JSON.stringify(
        {
          identifier: "agent-app-shell",
          description: "Agent App 独立 Shell 只允许使用 Tauri IPC 调用 Lime 宿主封装能力。",
        },
        null,
        2,
      ),
    );

    const report = analyzeAppMetadataWorkflowReport({ repoRoot: root });

    expect(report.schemaVersion).toBe("lime.i18n.appMetadataWorkflowReport.v1");
    expect(report.summary.hasInstallerLocalizationWorkflow).toBe(false);
    expect(report.summary.hasLocalizedAppMetadataArtifacts).toBe(true);
    expect(report.summary.hasLocaleAwareMetadataSources).toBe(false);
    expect(report.tauriConfig.productName).toBe("Lime");
    expect(report.tauriConfig.deepLinkSchemes).toEqual(["lime"]);
    expect(formatAppMetadataWorkflowReport(report, "text")).toContain(
      "[i18n:app-metadata] workflow inventory",
    );
    expect(JSON.parse(formatAppMetadataWorkflowReport(report, "json"))).toEqual(
      expect.objectContaining({
        schemaVersion: "lime.i18n.appMetadataWorkflowReport.v1",
      }),
    );
  });

  it("应支持 CLI 写出 JSON", () => {
    const root = createTempDir();
    writeFile(root, "package.json", JSON.stringify({ name: "lime", version: "1.47.0" }, null, 2));
    writeFile(root, "src-tauri/Cargo.toml", '[package]\nname = "lime"\nversion = "1.47.0"\n');
    writeFile(root, "src-tauri/tauri.conf.json", JSON.stringify({ productName: "Lime" }, null, 2));
    writeFile(root, "src-tauri/tauri.conf.headless.json", JSON.stringify({ productName: "Lime" }, null, 2));
    writeFile(root, "src-tauri/capabilities/agent-app-shell.json", JSON.stringify({ identifier: "agent-app-shell" }, null, 2));

    const outFile = path.join(root, "report.json");
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = runCli(["--format", "json", "--repo-root", root, "--output", outFile]);

    expect(exitCode).toBe(0);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(outFile, "utf8"))).toEqual(
      expect.objectContaining({
        schemaVersion: "lime.i18n.appMetadataWorkflowReport.v1",
      }),
    );
  });
});
