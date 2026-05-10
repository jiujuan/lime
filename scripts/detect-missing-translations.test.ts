import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  analyzeTranslations,
  applyTranslationFixes,
  formatTranslationReport,
  hasTranslationIssues,
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
});
