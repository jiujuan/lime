import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeI18nBundleReport,
  formatI18nBundleReport,
  runCli,
} from "./i18n-bundle-report";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-i18n-bundle-"));
  tempDirs.push(dir);
  return dir;
}

function writeFile(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeResource(
  root: string,
  locale: string,
  namespace: string,
  resource: Record<string, unknown>,
): void {
  writeFile(
    root,
    `resources/${locale}/${namespace}.json`,
    `${JSON.stringify(resource, null, 2)}\n`,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("i18n bundle report", () => {
  it("应按 current loader 的核心 namespace 聚合 bundle footprint，并保留 lazy 候选", () => {
    const root = createTempDir();
    const locales = ["zh-CN", "en-US"];

    for (const locale of locales) {
      writeResource(root, locale, "common", {
        "common.save": locale,
      });
      writeResource(root, locale, "navigation", {
        "navigation.home": locale,
      });
      writeResource(root, locale, "agent", {
        "agent.root": locale,
      });
      writeResource(root, locale, "agentHome", {
        "agent.home": locale,
      });
      writeResource(root, locale, "future", {
        "future.title": locale,
      });
    }

    const report = analyzeI18nBundleReport({
      resourcesDir: path.join(root, "resources"),
      sourceLocale: "zh-CN",
    });

    expect(report.schemaVersion).toBe("lime.i18n.bundleStrategyReport.v1");
    expect(report.localeCount).toBe(2);
    expect(report.summary.inlineGroupCount).toBe(3);
    expect(report.summary.lazyGroupCount).toBe(1);
    expect(report.summary.sourceLocaleFileCount).toBe(5);
    expect(report.bundleGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          namespace: "agent",
          partNames: ["agent", "agentHome"],
          role: "inline",
          sourceLocaleKeyCount: 2,
        }),
        expect.objectContaining({
          namespace: "future",
          partNames: ["future"],
          role: "lazy",
          sourceLocaleKeyCount: 1,
        }),
      ]),
    );
  });

  it("应输出 JSON 和 text 报告并支持 CLI", () => {
    const root = createTempDir();
    writeResource(root, "zh-CN", "common", {
      "common.save": "保存",
    });
    writeResource(root, "en-US", "common", {
      "common.save": "Save",
    });

    const report = analyzeI18nBundleReport({
      resourcesDir: path.join(root, "resources"),
      sourceLocale: "zh-CN",
    });
    const json = JSON.parse(formatI18nBundleReport(report, "json")) as {
      summary: { sourceLocaleKeyCount: number };
    };

    expect(json.summary.sourceLocaleKeyCount).toBe(1);
    expect(formatI18nBundleReport(report, "text")).toContain(
      "[i18n:bundle] strategy:",
    );

    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const exitCode = runCli([
      "--format",
      "json",
      "--resources-dir",
      path.join(root, "resources"),
      "--source-locale",
      "zh-CN",
    ]);

    expect(exitCode).toBe(0);
    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(writeSpy.mock.calls[0]?.[0] ?? ""))).toEqual(
      expect.objectContaining({
        schemaVersion: "lime.i18n.bundleStrategyReport.v1",
      }),
    );
  });

  it("CLI 应支持把 bundle evidence 写入指定文件", () => {
    const root = createTempDir();
    writeResource(root, "zh-CN", "common", {
      "common.save": "保存",
    });
    writeResource(root, "en-US", "common", {
      "common.save": "Save",
    });

    const outputPath = path.join(root, "reports", "bundle-report.json");
    const exitCode = runCli([
      "--format",
      "json",
      "--output",
      outputPath,
      "--resources-dir",
      path.join(root, "resources"),
      "--source-locale",
      "zh-CN",
    ]);

    expect(exitCode).toBe(0);
    expect(JSON.parse(fs.readFileSync(outputPath, "utf8"))).toEqual(
      expect.objectContaining({
        schemaVersion: "lime.i18n.bundleStrategyReport.v1",
      }),
    );
  });
});
