import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeTranslations,
  applyTranslationFixes,
  formatTranslationReport,
  hasTranslationIssues,
  runCli,
} from "./detect-missing-translations";

const tempDirs: string[] = [];

function createTempResourcesDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-i18n-check-"));
  tempDirs.push(dir);
  return dir;
}

function writeResource(
  resourcesDir: string,
  locale: string,
  namespace: string,
  resource: Record<string, unknown>,
) {
  const filePath = path.join(resourcesDir, locale, `${namespace}.json`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(resource, null, 2)}\n`);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("detect-missing-translations", () => {
  it("应在所有 locale 与 source key 一致时通过", () => {
    const resourcesDir = createTempResourcesDir();
    writeResource(resourcesDir, "zh-CN", "common", { "common.save": "保存" });
    writeResource(resourcesDir, "en-US", "common", { "common.save": "Save" });

    const result = analyzeTranslations({ resourcesDir });

    expect(hasTranslationIssues(result)).toBe(false);
    expect(formatTranslationReport(result)).toContain("通过");
  });

  it("应支持 JSON 模式输出结构化报告", () => {
    const resourcesDir = createTempResourcesDir();
    writeResource(resourcesDir, "zh-CN", "common", {
      "common.cancel": "取消",
      "common.save": "保存",
    });
    writeResource(resourcesDir, "en-US", "common", {
      "common.save": "Save",
    });

    const result = analyzeTranslations({ resourcesDir });
    const report = JSON.parse(
      formatTranslationReport(result, { format: "json" }),
    ) as {
      coverage: {
        summary: {
          coverageRatio: number;
          localeCount: number;
          missingKeyCount: number;
          sourceKeyCount: number;
          translatedKeyCount: number;
        };
        localeSummaries: Array<{
          locale: string;
          coverageRatio: number;
          sourceKeyCount: number;
          translatedKeyCount: number;
        }>;
      };
      summary: { hasIssues: boolean; issueCount: number; sourceKeyCount: number };
      issues: Array<{ locale: string }>;
    };

    expect(report.summary).toEqual(
      expect.objectContaining({
        hasIssues: true,
        issueCount: 1,
        sourceKeyCount: 2,
      }),
    );
    expect(report.coverage.summary).toEqual(
      expect.objectContaining({
        coverageRatio: 0.5,
        localeCount: 1,
        missingKeyCount: 1,
        sourceKeyCount: 2,
        translatedKeyCount: 1,
      }),
    );
    expect(report.coverage.localeSummaries).toEqual([
      expect.objectContaining({
        locale: "en-US",
        coverageRatio: 0.5,
        sourceKeyCount: 2,
        translatedKeyCount: 1,
      }),
    ]);
    expect(report.issues).toEqual([expect.objectContaining({ locale: "en-US" })]);
  });

  it("应发现缺失 namespace、缺失 key 与多余 key", () => {
    const resourcesDir = createTempResourcesDir();
    writeResource(resourcesDir, "zh-CN", "common", {
      "common.cancel": "取消",
      "common.save": "保存",
    });
    writeResource(resourcesDir, "zh-CN", "settings", {
      "settings.title": "设置",
    });
    writeResource(resourcesDir, "en-US", "common", {
      "common.extra": "Extra",
      "common.save": "Save",
    });

    const result = analyzeTranslations({ resourcesDir });

    expect(hasTranslationIssues(result)).toBe(true);
    expect(result.issues).toEqual([
      {
        locale: "en-US",
        missingNamespaces: ["settings"],
        extraNamespaces: [],
        namespaces: [
          {
            namespace: "common",
            missingKeys: ["common.cancel"],
            extraKeys: ["common.extra"],
          },
        ],
      },
    ]);
  });

  it("--fix 语义应补齐缺失 namespace 与缺失 key，但保留人工已有翻译", () => {
    const resourcesDir = createTempResourcesDir();
    writeResource(resourcesDir, "zh-CN", "common", {
      "common.cancel": "取消",
      "common.save": "保存",
    });
    writeResource(resourcesDir, "zh-CN", "settings", {
      "settings.title": "设置",
    });
    writeResource(resourcesDir, "en-US", "common", {
      "common.save": "Save",
    });

    applyTranslationFixes({ resourcesDir });
    const result = analyzeTranslations({ resourcesDir });
    const common = JSON.parse(
      fs.readFileSync(path.join(resourcesDir, "en-US", "common.json"), "utf8"),
    ) as Record<string, string>;

    expect(hasTranslationIssues(result)).toBe(false);
    expect(common["common.save"]).toBe("Save");
    expect(common["common.cancel"]).toBe("取消");
    expect(
      fs.existsSync(path.join(resourcesDir, "en-US", "settings.json")),
    ).toBe(true);
  });

  it("应在 coverage 报告中区分 namespace 覆盖率与 locale 总覆盖率", () => {
    const resourcesDir = createTempResourcesDir();
    writeResource(resourcesDir, "zh-CN", "common", {
      "common.cancel": "取消",
      "common.save": "保存",
    });
    writeResource(resourcesDir, "zh-CN", "settings", {
      "settings.title": "设置",
    });
    writeResource(resourcesDir, "en-US", "common", {
      "common.cancel": "Cancel",
      "common.save": "Save",
      "common.extra": "Extra",
    });

    const result = analyzeTranslations({ resourcesDir });
    const report = JSON.parse(
      formatTranslationReport(result, { format: "json" }),
    ) as {
      coverage: {
        localeSummaries: Array<{
          locale: string;
          coverageRatio: number;
          extraKeyCount: number;
          missingKeyCount: number;
          namespaceCoverage: Array<{
            coverageRatio: number;
            extraKeyCount: number;
            missingKeyCount: number;
            namespace: string;
            sourceKeyCount: number;
            translatedKeyCount: number;
          }>;
          sourceKeyCount: number;
          translatedKeyCount: number;
        }>;
        summary: {
          coverageRatio: number;
          extraKeyCount: number;
          fullCoverageLocaleCount: number;
          localeCount: number;
          missingKeyCount: number;
          sourceKeyCount: number;
          translatedKeyCount: number;
        };
      };
    };

    expect(report.coverage.summary).toEqual(
      expect.objectContaining({
        coverageRatio: 2 / 3,
        extraKeyCount: 1,
        fullCoverageLocaleCount: 0,
        localeCount: 1,
        missingKeyCount: 1,
        sourceKeyCount: 3,
        translatedKeyCount: 2,
      }),
    );
    expect(report.coverage.localeSummaries).toEqual([
      expect.objectContaining({
        locale: "en-US",
        coverageRatio: 2 / 3,
        extraKeyCount: 1,
        missingKeyCount: 1,
        sourceKeyCount: 3,
        translatedKeyCount: 2,
        namespaceCoverage: [
          expect.objectContaining({
            namespace: "common",
            coverageRatio: 1,
            extraKeyCount: 1,
            missingKeyCount: 0,
            sourceKeyCount: 2,
            translatedKeyCount: 2,
          }),
          expect.objectContaining({
            namespace: "settings",
            coverageRatio: 0,
            extraKeyCount: 0,
            missingKeyCount: 1,
            sourceKeyCount: 1,
            translatedKeyCount: 0,
          }),
        ],
      }),
    ]);
    expect(formatTranslationReport(result, { verbose: true })).toContain(
      "coverage locale=en-US ratio=66.7%",
    );
  });

  it("CLI 应支持 --format json 并返回结构化结果", () => {
    const resourcesDir = createTempResourcesDir();
    writeResource(resourcesDir, "zh-CN", "common", {
      "common.cancel": "取消",
      "common.save": "保存",
    });
    writeResource(resourcesDir, "en-US", "common", {
      "common.save": "Save",
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitCode = runCli(["--format", "json", "--resources-dir", resourcesDir]);

    expect(exitCode).toBe(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0] ?? ""))).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          hasIssues: true,
          issueCount: 1,
        }),
        issues: [expect.objectContaining({ locale: "en-US" })],
      }),
    );

    logSpy.mockRestore();
  });

  it("CLI 应支持 --output 写出结构化报告文件", () => {
    const resourcesDir = createTempResourcesDir();
    const outputPath = path.join(resourcesDir, "reports", "coverage.json");
    writeResource(resourcesDir, "zh-CN", "common", { "common.save": "保存" });
    writeResource(resourcesDir, "en-US", "common", { "common.save": "Save" });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const exitCode = runCli([
      "--format",
      "json",
      "--output",
      outputPath,
      "--resources-dir",
      resourcesDir,
    ]);

    expect(exitCode).toBe(0);
    expect(logSpy).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(outputPath, "utf8"))).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          hasIssues: false,
          sourceKeyCount: 1,
        }),
      }),
    );

    logSpy.mockRestore();
  });

});
