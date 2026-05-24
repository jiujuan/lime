import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyzeReleaseDocsWorkflowReport,
  formatReleaseDocsWorkflowReport,
  runCli,
} from "./i18n-release-docs-workflow-report";

const tempDirs: string[] = [];

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lime-i18n-release-docs-"));
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

describe("i18n release docs workflow report", () => {
  it("应识别当前文档翻译工作流缺口并输出稳定报告", () => {
    const root = createTempDir();

    writeFile(root, "README.md", "# Lime\n");
    writeFile(root, "README.en.md", "# Lime\n<sub>companion</sub>\n");
    writeFile(root, "RELEASE_NOTES.md", "## Lime v1.0.0\n");
    writeFile(root, "docs/package.json", JSON.stringify({ scripts: { dev: "nuxt dev", build: "nuxt build" } }, null, 2));
    writeFile(root, "docs/nuxt.config.ts", `export default { extends: ["docus"], app: { baseURL: "/lime/" } };\n`);
    writeFile(root, "docs/content/02.user-guide/a.md", "# Guide\n");
    writeFile(root, "docs/content/08.open-platform/b.md", "# Open Platform\n");

    const report = analyzeReleaseDocsWorkflowReport({ repoRoot: root });

    expect(report.schemaVersion).toBe("lime.i18n.releaseDocsWorkflowReport.v1");
    expect(report.summary.hasBilingualRootReadme).toBe(true);
    expect(report.summary.hasReleaseNotesCompanion).toBe(false);
    expect(report.summary.hasDocsLocaleWorkflow).toBe(false);
    expect(report.summary.docsTranslationWorkflowPresent).toBe(false);
    expect(report.summary.contentFileCount).toBe(2);
    expect(report.docsSite.topLevelContentDirs).toEqual(["02.user-guide", "08.open-platform"]);
    expect(report.docsSite.buildScripts).toEqual(["build", "dev"]);
    expect(report.docsSite.hasI18nConfig).toBe(false);

    expect(formatReleaseDocsWorkflowReport(report, "text")).toContain(
      "[i18n:release-docs] workflow inventory",
    );
    expect(JSON.parse(formatReleaseDocsWorkflowReport(report, "json"))).toEqual(
      expect.objectContaining({
        schemaVersion: "lime.i18n.releaseDocsWorkflowReport.v1",
      }),
    );
  });

  it("应支持 CLI 输出与文件写入", () => {
    const root = createTempDir();
    writeFile(root, "README.md", "# Lime\n");
    writeFile(root, "README.en.md", "# Lime\n");
    writeFile(root, "RELEASE_NOTES.md", "## Lime v1.0.0\n");
    writeFile(root, "docs/package.json", JSON.stringify({ scripts: { dev: "nuxt dev" } }, null, 2));
    writeFile(root, "docs/nuxt.config.ts", `export default { extends: ["docus"] };\n`);

    const outFile = path.join(root, "report.json");
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const exitCode = runCli(["--format", "json", "--repo-root", root, "--output", outFile]);

    expect(exitCode).toBe(0);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(outFile, "utf8"))).toEqual(
      expect.objectContaining({
        schemaVersion: "lime.i18n.releaseDocsWorkflowReport.v1",
      }),
    );
  });
});
