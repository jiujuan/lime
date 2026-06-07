import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeI18nSourceLocaleExport,
  formatI18nSourceLocaleExport,
  runCli,
} from "./i18n-source-locale-export";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "lime-i18n-source-export-"),
  );
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

describe("i18n source locale export", () => {
  it("应导出 source locale 的 namespace、扁平 key 和汇总数据", () => {
    const root = createTempDir();
    writeResource(root, "zh-CN", "common", {
      "common.cancel": "取消",
      nested: {
        "common.save": "保存",
      },
    });
    writeResource(root, "zh-CN", "settings", {
      "settings.title": "设置",
    });

    const report = analyzeI18nSourceLocaleExport({
      resourcesDir: path.join(root, "resources"),
      sourceLocale: "zh-CN",
    });

    expect(report.schemaVersion).toBe("lime.i18n.sourceLocaleExport.v1");
    expect(report.summary).toEqual(
      expect.objectContaining({
        namespaceCount: 2,
        sourceKeyCount: 3,
      }),
    );
    expect(report.namespaces).toEqual([
      expect.objectContaining({
        keyCount: 2,
        namespace: "common",
        values: {
          "common.cancel": "取消",
          "nested.common.save": "保存",
        },
      }),
      expect.objectContaining({
        keyCount: 1,
        namespace: "settings",
        values: {
          "settings.title": "设置",
        },
      }),
    ]);
  });

  it("应输出 JSON、text，并支持 CLI 写入文件", () => {
    const root = createTempDir();
    const resourcesDir = path.join(root, "resources");
    const outputPath = path.join(root, "source-export.json");
    writeResource(root, "zh-CN", "common", {
      "common.save": "保存",
    });

    const report = analyzeI18nSourceLocaleExport({
      resourcesDir,
      sourceLocale: "zh-CN",
    });
    const json = JSON.parse(formatI18nSourceLocaleExport(report, "json")) as {
      summary: { sourceKeyCount: number };
    };

    expect(json.summary.sourceKeyCount).toBe(1);
    expect(formatI18nSourceLocaleExport(report, "text")).toContain(
      "[i18n:source-export] namespaces:",
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
        schemaVersion: "lime.i18n.sourceLocaleExport.v1",
      }),
    );
  });
});
