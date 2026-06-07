import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  formatHardcodedI18nReport,
  scanHardcodedI18n,
} from "./i18n-hardcoded-check";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-i18n-scan-"));
  tempDirs.push(dir);
  return dir;
}

function writeFixture(
  root: string,
  relativePath: string,
  content: string,
): string {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  return filePath;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("i18n hardcoded scan", () => {
  it("应捕获前端源码中的 JSX 文本、表达式字面量与可见属性", () => {
    const root = createTempDir();
    writeFixture(
      root,
      "src/components/settings/LanguagePicker.tsx",
      [
        "export function LanguagePicker() {",
        "  return (",
        "    <section>",
        '      <button title="切换界面语言">切换语言</button>',
        '      <span>{"同步设置"}</span>',
        "    </section>",
        "  );",
        "}",
        "",
      ].join("\n"),
    );

    const result = scanHardcodedI18n([
      path.join(root, "src/components/settings/LanguagePicker.tsx"),
    ]);

    expect(result.files).toHaveLength(1);
    expect(result.findings).toHaveLength(3);
    expect(result.findings[0]?.message).toContain("hard-coded");
    expect(formatHardcodedI18nReport(result)).toContain("findings=3");
    expect(JSON.parse(formatHardcodedI18nReport(result, "json"))).toEqual(
      expect.objectContaining({
        summary: expect.objectContaining({
          findingCount: 3,
          scannedFileCount: 1,
        }),
      }),
    );
  });

  it("应忽略 i18n 资源、测试文件与普通逻辑字符串", () => {
    const root = createTempDir();
    writeFixture(
      root,
      "src/i18n/resources/zh-CN/common.json",
      '{ "common.save": "保存" }',
    );
    writeFixture(
      root,
      "src/components/settings/LanguagePicker.test.tsx",
      '<button title="切换界面语言">切换语言</button>\n',
    );
    writeFixture(
      root,
      "src/components/settings/LanguagePicker.tsx",
      [
        "export function LanguagePicker() {",
        '  const label = "保存";',
        '  return <div className={label}>{t("切换界面语言")}</div>;',
        "}",
        "",
      ].join("\n"),
    );

    const result = scanHardcodedI18n([
      path.join(root, "src/i18n/resources/zh-CN/common.json"),
      path.join(root, "src/components/settings/LanguagePicker.test.tsx"),
      path.join(root, "src/components/settings/LanguagePicker.tsx"),
    ]);

    expect(result.files).toHaveLength(1);
    expect(result.findings).toHaveLength(0);
    expect(formatHardcodedI18nReport(result)).toContain("通过");
  });

  it("应忽略测试替身文件中的用户可见文案", () => {
    const root = createTempDir();
    writeFixture(
      root,
      "src/components/settings/LanguagePicker.testFixtures.tsx",
      '<button aria-label="切换界面语言">切换语言</button>\n',
    );

    const result = scanHardcodedI18n([
      path.join(
        root,
        "src/components/settings/LanguagePicker.testFixtures.tsx",
      ),
    ]);

    expect(result.files).toHaveLength(0);
    expect(result.findings).toHaveLength(0);
  });

  it("应忽略快捷键单字符 token，但继续报告普通用户可见文案", () => {
    const root = createTempDir();
    writeFixture(
      root,
      "src/components/sidebar/SearchShortcut.tsx",
      [
        "export function SearchShortcut() {",
        "  return (",
        "    <div>",
        "      <kbd>K</kbd>",
        "      <span>搜索</span>",
        "    </div>",
        "  );",
        "}",
        "",
      ].join("\n"),
    );

    const result = scanHardcodedI18n([
      path.join(root, "src/components/sidebar/SearchShortcut.tsx"),
    ]);

    expect(result.files).toHaveLength(1);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.snippet).toBe("搜索");
  });
});
