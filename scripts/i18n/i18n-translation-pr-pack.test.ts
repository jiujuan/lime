import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildTranslationPrPackReport,
  formatI18nTranslationPrPackReport,
  runCli,
} from "./i18n-translation-pr-pack";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-i18n-pr-pack-"));
  tempDirs.push(dir);
  return dir;
}

function writeResource(
  root: string,
  locale: string,
  namespace: string,
  resource: Record<string, unknown>,
): void {
  const filePath = path.join(root, "resources", locale, `${namespace}.json`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(resource, null, 2)}\n`);
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("i18n translation PR pack", () => {
  it("应按 locale 生成可审阅的缺口包，并带上 source 文案", () => {
    const root = createTempDir();
    const resourcesDir = path.join(root, "resources");

    writeResource(root, "zh-CN", "common", {
      "common.cancel": "取消",
      "common.save": "保存",
    });
    writeResource(root, "en-US", "common", {
      "common.save": "Save",
      "common.extra": "Extra",
    });

    const report = buildTranslationPrPackReport(resourcesDir, "zh-CN");

    expect(report.schemaVersion).toBe("lime.i18n.translationPrPack.v1");
    expect(report.summary).toEqual(
      expect.objectContaining({
        localeCount: 2,
        localesWithGaps: 1,
        namespaceCount: 1,
        proposedEntryCount: 1,
        sourceKeyCount: 2,
      }),
    );
    expect(report.localeProposals).toEqual([
      expect.objectContaining({
        locale: "en-US",
        proposedEntryCount: 1,
        missingKeyCount: 1,
        extraKeyCount: 1,
        namespaces: [
          expect.objectContaining({
            namespace: "common",
            missingEntries: [
              expect.objectContaining({
                key: "common.cancel",
                namespace: "common",
                sourceValue: "取消",
              }),
            ],
            extraKeys: ["common.extra"],
          }),
        ],
      }),
    ]);
  });

  it("应输出 JSON、text，并支持 CLI 写入文件", () => {
    const root = createTempDir();
    const resourcesDir = path.join(root, "resources");
    const outputPath = path.join(root, "translation-pr-pack.json");

    writeResource(root, "zh-CN", "common", {
      "common.cancel": "取消",
      "common.save": "保存",
    });
    writeResource(root, "en-US", "common", {
      "common.save": "Save",
    });

    const report = buildTranslationPrPackReport(resourcesDir, "zh-CN");
    const json = JSON.parse(
      formatI18nTranslationPrPackReport(report, "json"),
    ) as { summary: { proposedEntryCount: number } };

    expect(json.summary.proposedEntryCount).toBe(1);
    expect(formatI18nTranslationPrPackReport(report, "text")).toContain(
      "[i18n:translation-pr-pack] locale proposals:",
    );

    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const exitCode = runCli([
      "--format",
      "json",
      "--output",
      outputPath,
      "--resources-dir",
      resourcesDir,
      "--source-locale",
      "zh-CN",
    ]);

    expect(exitCode).toBe(0);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(outputPath, "utf8"))).toEqual(
      expect.objectContaining({
        schemaVersion: "lime.i18n.translationPrPack.v1",
      }),
    );
  });
});
