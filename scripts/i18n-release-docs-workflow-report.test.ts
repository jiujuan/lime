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
    writeFile(root, "README.en.md", "# Lime\n[Release Notes](./RELEASE_NOTES.en.md)\n<sub>companion</sub>\n");
    writeFile(root, "RELEASE_NOTES.md", "## Lime v1.0.0\n");
    writeFile(root, "RELEASE_NOTES.en.md", "## Lime v1.0.0\n");
    writeFile(root, "docs/package.json", JSON.stringify({ scripts: { dev: "nuxt dev", build: "nuxt build" } }, null, 2));
    writeFile(root, "docs/nuxt.config.ts", `export default { extends: ["docus"], app: { baseURL: "/lime/" } };\n`);
    writeFile(root, "docs/content/02.user-guide/a.md", "# Guide\n");
    writeFile(root, "docs/roadmap/i18n/companions/user-guide-a.en.md", "# Guide\n");
    writeFile(root, "docs/content/08.open-platform/b.md", "# Open Platform\n");
    writeFile(
      root,
      "docs/roadmap/i18n/release-docs-translation-scope.json",
      JSON.stringify(
        {
          schemaVersion: "lime.i18n.releaseDocsTranslationScope.v1",
          sourceLocale: "zh-CN",
          targetLocales: ["en-US"],
          items: [
            {
              path: "README.md",
              kind: "readme",
              priority: "required",
              enUSPath: "README.en.md",
            },
            {
              path: "RELEASE_NOTES.md",
              kind: "release-notes",
              priority: "required",
              enUSPath: "RELEASE_NOTES.en.md",
            },
            {
              path: "docs/content/02.user-guide/a.md",
              kind: "help-doc",
              priority: "pilot",
              enUSPath: "docs/roadmap/i18n/companions/user-guide-a.en.md",
            },
            {
              path: "docs/content/08.open-platform/b.md",
              kind: "open-platform",
              priority: "source-only",
              enUSPath: null,
            },
          ],
        },
        null,
        2,
      ),
    );

    const report = analyzeReleaseDocsWorkflowReport({ repoRoot: root });

    expect(report.schemaVersion).toBe("lime.i18n.releaseDocsWorkflowReport.v1");
    expect(report.summary.hasBilingualRootReadme).toBe(true);
    expect(report.summary.hasReleaseNotesCompanion).toBe(true);
    expect(report.summary.hasReleaseNotesCompanionVersionMatch).toBe(true);
    expect(report.summary.readmeEnglishLinksReleaseNotesCompanion).toBe(true);
    expect(report.summary.hasDocsLocaleWorkflow).toBe(false);
    expect(report.summary.hasReleaseDocsTranslationScope).toBe(true);
    expect(report.summary.docsTranslationWorkflowPresent).toBe(false);
    expect(report.summary.docsContentEnglishCompanionFileCount).toBe(0);
    expect(report.summary.docsUnscopedContentSourceFileCount).toBe(0);
    expect(report.summary.releaseDocsRequiredCompanionMissingCount).toBe(0);
    expect(report.summary.releaseDocsPilotCompanionMissingCount).toBe(0);
    expect(report.summary.releaseDocsOrphanCompanionCount).toBe(0);
    expect(report.summary.releaseDocsScopeItemCount).toBe(4);
    expect(report.summary.releaseDocsSourceOnlyWithoutCompanionCount).toBe(1);
    expect(report.releaseNotes.sourceVersion).toBe("v1.0.0");
    expect(report.releaseNotes.englishCompanionVersion).toBe("v1.0.0");
    expect(report.releaseDocsTranslationScope).toEqual(
      expect.objectContaining({
        existingEnglishCompanionCount: 3,
        itemCount: 4,
        companionFiles: ["docs/roadmap/i18n/companions/user-guide-a.en.md"],
        missingEnglishCompanions: [],
        missingPilotEnglishCompanions: [],
        pilotCount: 1,
        orphanEnglishCompanions: [],
        requiredCount: 2,
        sourceLocale: "zh-CN",
        scopedSourceFiles: [
          "docs/content/02.user-guide/a.md",
          "docs/content/08.open-platform/b.md",
          "README.md",
          "RELEASE_NOTES.md",
        ],
        sourceOnlyCount: 1,
        sourceOnlyWithoutCompanionCount: 1,
        sourceOnlyWithoutCompanions: ["docs/content/08.open-platform/b.md"],
        targetLocales: ["en-US"],
      }),
    );
    expect(report.summary.contentFileCount).toBe(2);
    expect(report.docsSite.contentEnglishCompanionFiles).toEqual([]);
    expect(report.docsSite.unscopedContentSourceFiles).toEqual([]);
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

  it("应识别未被 translation scope 引用的 companion 文件", () => {
    const root = createTempDir();

    writeFile(root, "README.md", "# Lime\n");
    writeFile(root, "README.en.md", "# Lime\n");
    writeFile(root, "RELEASE_NOTES.md", "## Lime v1.0.0\n");
    writeFile(root, "RELEASE_NOTES.en.md", "## Lime v1.0.0\n");
    writeFile(root, "docs/package.json", JSON.stringify({ scripts: { dev: "nuxt dev" } }, null, 2));
    writeFile(root, "docs/nuxt.config.ts", `export default { extends: ["docus"] };\n`);
    writeFile(root, "docs/content/index.md", "# Docs\n");
    writeFile(root, "docs/roadmap/i18n/companions/docs-content-index.en.md", "# Docs\n");
    writeFile(root, "docs/roadmap/i18n/companions/orphan.en.md", "# Orphan\n");
    writeFile(
      root,
      "docs/roadmap/i18n/release-docs-translation-scope.json",
      JSON.stringify(
        {
          schemaVersion: "lime.i18n.releaseDocsTranslationScope.v1",
          sourceLocale: "zh-CN",
          targetLocales: ["en-US"],
          items: [
            {
              path: "README.md",
              kind: "readme",
              priority: "required",
              enUSPath: "README.en.md",
            },
            {
              path: "RELEASE_NOTES.md",
              kind: "release-notes",
              priority: "required",
              enUSPath: "RELEASE_NOTES.en.md",
            },
            {
              path: "docs/content/index.md",
              kind: "docs-home",
              priority: "pilot",
              enUSPath: "docs/roadmap/i18n/companions/docs-content-index.en.md",
            },
          ],
        },
        null,
        2,
      ),
    );

    const report = analyzeReleaseDocsWorkflowReport({ repoRoot: root });

    expect(report.summary.releaseDocsOrphanCompanionCount).toBe(1);
    expect(report.releaseDocsTranslationScope.orphanEnglishCompanions).toEqual([
      "docs/roadmap/i18n/companions/orphan.en.md",
    ]);
  });

  it("应识别未纳入 translation scope 的 docs/content source 文件", () => {
    const root = createTempDir();

    writeFile(root, "README.md", "# Lime\n");
    writeFile(root, "README.en.md", "# Lime\n");
    writeFile(root, "RELEASE_NOTES.md", "## Lime v1.0.0\n");
    writeFile(root, "RELEASE_NOTES.en.md", "## Lime v1.0.0\n");
    writeFile(root, "docs/package.json", JSON.stringify({ scripts: { dev: "nuxt dev" } }, null, 2));
    writeFile(root, "docs/nuxt.config.ts", `export default { extends: ["docus"] };\n`);
    writeFile(root, "docs/content/index.md", "# Docs\n");
    writeFile(root, "docs/content/02.user-guide/untracked.md", "# Untracked\n");
    writeFile(
      root,
      "docs/roadmap/i18n/release-docs-translation-scope.json",
      JSON.stringify(
        {
          schemaVersion: "lime.i18n.releaseDocsTranslationScope.v1",
          sourceLocale: "zh-CN",
          targetLocales: ["en-US"],
          items: [
            {
              path: "README.md",
              kind: "readme",
              priority: "required",
              enUSPath: "README.en.md",
            },
            {
              path: "RELEASE_NOTES.md",
              kind: "release-notes",
              priority: "required",
              enUSPath: "RELEASE_NOTES.en.md",
            },
            {
              path: "docs/content/index.md",
              kind: "docs-home",
              priority: "pilot",
              enUSPath: null,
            },
          ],
        },
        null,
        2,
      ),
    );

    const report = analyzeReleaseDocsWorkflowReport({ repoRoot: root });

    expect(report.summary.docsUnscopedContentSourceFileCount).toBe(1);
    expect(report.docsSite.unscopedContentSourceFiles).toEqual([
      "docs/content/02.user-guide/untracked.md",
    ]);
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
